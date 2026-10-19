import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, setDoc, writeBatch } from 'firebase/firestore';
import { Case, TimelineEvent } from '../types';

export const SelectiveBackupRestore: React.FC = () => {
  const [backupData, setBackupData] = useState<Record<string, any[]> | null>(null);
  const [fileName, setFileName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [currentCaseIds, setCurrentCaseIds] = useState<Set<string>>(new Set());
  const [currentCaseNumeros, setCurrentCaseNumeros] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [previewCase, setPreviewCase] = useState<Case | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setStatusMessage(null);
    setFileName(file.name);

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const json = JSON.parse(event.target?.result as string);
          if (!json || typeof json !== 'object') {
            throw new Error('El archivo no contiene un formato JSON válido.');
          }

          if (!Array.isArray(json.expedientes)) {
            setStatusMessage({
              type: 'error',
              text: 'El archivo de backup no contiene una lista de expedientes válida.'
            });
            setIsLoading(false);
            return;
          }

          setBackupData(json);
          setIsLoading(false);

          // Realizamos la comparación con la base de datos actual en Firestore
          await compareWithCurrentDatabase(json.expedientes);
        } catch (err: any) {
          console.error('Error al analizar archivo:', err);
          setStatusMessage({
            type: 'error',
            text: `Error al leer el archivo JSON: ${err.message || 'Formato inválido'}`
          });
          setIsLoading(false);
        }
      };
      reader.readAsText(file);
    } catch (err: any) {
      console.error(err);
      setStatusMessage({
        type: 'error',
        text: 'Error al abrir el archivo local.'
      });
      setIsLoading(false);
    }
  };

  const compareWithCurrentDatabase = async (backupExpedientes: Case[]) => {
    setIsComparing(true);
    try {
      const snap = await getDocs(collection(db, 'expedientes'));
      const existingIds = new Set<string>();
      const existingNumeros = new Set<string>();

      snap.docs.forEach(docSnap => {
        existingIds.add(docSnap.id);
        const data = docSnap.data();
        if (data.numero) {
          existingNumeros.add(data.numero.trim().toUpperCase());
        }
      });

      setCurrentCaseIds(existingIds);
      setCurrentCaseNumeros(existingNumeros);

      // Calcular cuántos faltan
      const missingCount = backupExpedientes.filter(
        c => !existingIds.has(c.id) && !existingNumeros.has((c.numero || '').trim().toUpperCase())
      ).length;

      if (missingCount > 0) {
        setStatusMessage({
          type: 'info',
          text: `Se detectaron ${missingCount} expediente(s) en el backup que NO existen en la base de datos actual (fueron eliminados). Puedes restaurar únicamente el que necesitas.`
        });
        setOnlyMissing(true);
      } else {
        setStatusMessage({
          type: 'info',
          text: `Todos los ${backupExpedientes.length} expedientes del backup ya existen en la base de datos actual. Desmarca el filtro de "Solo eliminados" si deseas inspeccionar o sobrescribir alguno.`
        });
        setOnlyMissing(false);
      }
    } catch (err: any) {
      console.error('Error al consultar Firestore:', err);
      setStatusMessage({
        type: 'error',
        text: 'Error al conectar con Firestore para comparar los expedientes actuales.'
      });
    } finally {
      setIsComparing(false);
    }
  };

  const isCaseMissing = (c: Case) => {
    const hasId = currentCaseIds.has(c.id);
    const hasNumero = currentCaseNumeros.has((c.numero || '').trim().toUpperCase());
    return !hasId && !hasNumero;
  };

  const handleRestoreCase = async (c: Case) => {
    const isMissing = isCaseMissing(c);
    const confirmText = isMissing
      ? `¿Desea restaurar en la base de datos ÚNICAMENTE el expediente:\n\n• Nº GDE: ${c.numero}\n• Empresa: ${c.empresa}\n\nLos demás expedientes y el trabajo realizado estas 2 semanas NO se verán afectados?`
      : `¡ATENCIÓN! Este expediente ya existe en la base actual.\n\n¿Desea sobrescribir ÚNICAMENTE este expediente (${c.numero}) con los datos del backup?\n\nLos demás registros permanecerán intactos.`;

    if (!window.confirm(confirmText)) return;

    setRestoringId(c.id);
    try {
      const { id, ...caseData } = c;

      // 1. Guardar el expediente específico en Firestore
      await setDoc(doc(db, 'expedientes', id), caseData);

      // 2. Restaurar sus movimientos históricos si existen en el archivo
      const backupMovimientos: TimelineEvent[] = backupData?.movimientos || [];
      const relatedMovs = backupMovimientos.filter(m => m.expedienteId === id);

      if (relatedMovs.length > 0) {
        const batch = writeBatch(db);
        for (const mov of relatedMovs) {
          const { id: movId, ...movData } = mov;
          batch.set(doc(db, 'movimientos', movId), movData);
        }
        await batch.commit();
      }

      // 3. Actualizar sets locales en memoria
      setCurrentCaseIds(prev => new Set(prev).add(id));
      if (c.numero) {
        setCurrentCaseNumeros(prev => new Set(prev).add(c.numero.trim().toUpperCase()));
      }

      setStatusMessage({
        type: 'success',
        text: `¡Éxito! El expediente "${c.numero}" (${c.empresa}) fue restaurado correctamente en la base de datos ${relatedMovs.length > 0 ? `junto a sus ${relatedMovs.length} movimientos históricos` : ''}. Todo el resto del sistema permanece sin alteraciones.`
      });

      // Si estaba en preview modal, cerrarlo
      if (previewCase?.id === c.id) {
        setPreviewCase(null);
      }
    } catch (err: any) {
      console.error('Error al restaurar expediente:', err);
      setStatusMessage({
        type: 'error',
        text: `Error al restaurar el expediente: ${err.message || 'Error desconocido'}`
      });
    } finally {
      setRestoringId(null);
    }
  };

  const backupExpedientes: Case[] = backupData?.expedientes || [];

  // Filtrado de la lista en memoria
  const filteredCases = backupExpedientes.filter(c => {
    const missing = isCaseMissing(c);
    if (onlyMissing && !missing) return false;

    if (!searchTerm.trim()) return true;

    const term = searchTerm.toLowerCase();
    const matchNumero = (c.numero || '').toLowerCase().includes(term);
    const matchEmpresa = (c.empresa || '').toLowerCase().includes(term);
    const matchTramite = (c.tramite || '').toLowerCase().includes(term);
    const matchCategoria = (c.categoria || '').toLowerCase().includes(term);
    const matchObservaciones = (c.observaciones || '').toLowerCase().includes(term);

    return matchNumero || matchEmpresa || matchTramite || matchCategoria || matchObservaciones;
  });

  const missingTotal = backupExpedientes.filter(c => isCaseMissing(c)).length;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 md:p-8">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <div className="size-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-2xl">healing</span>
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
              Recuperación Selectiva de Expediente
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                Aislada / Sin Sobreescritura
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Permite cargar un backup anterior, localizar un expediente eliminado por error y 
              <strong className="text-slate-700 dark:text-slate-300"> restaurar únicamente ese registro y sus movimientos históricos</strong> sin tocar ni perder nada del trabajo realizado posteriormente.
            </p>
          </div>
        </div>

        {/* Input para seleccionar backup */}
        <div className="shrink-0 flex items-center gap-2">
          <input
            type="file"
            accept=".json"
            id="selective-backup-input"
            onChange={handleFileChange}
            disabled={isLoading || isComparing}
            className="hidden"
          />
          <label
            htmlFor="selective-backup-input"
            className="cursor-pointer px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-base">upload_file</span>
            {backupData ? 'Cambiar Archivo de Backup' : 'Cargar Backup para Buscar Expediente'}
          </label>
        </div>
      </div>

      {/* Mensaje de estado */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl text-xs flex items-start gap-3 mb-6 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
              : statusMessage.type === 'error'
              ? 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800'
              : 'bg-blue-50 dark:bg-blue-950/40 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
          }`}
        >
          <span className="material-symbols-outlined text-lg shrink-0">
            {statusMessage.type === 'success' ? 'check_circle' : statusMessage.type === 'error' ? 'error' : 'info'}
          </span>
          <div className="flex-1 font-medium leading-relaxed">{statusMessage.text}</div>
          <button
            onClick={() => setStatusMessage(null)}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* Loading state */}
      {(isLoading || isComparing) && (
        <div className="p-8 text-center flex flex-col items-center justify-center gap-3">
          <span className="material-symbols-outlined text-3xl text-emerald-600 animate-spin">sync</span>
          <p className="text-xs font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">
            {isLoading ? 'Leyendo archivo de respaldo...' : 'Comparando con la base de datos actual en vivo...'}
          </p>
        </div>
      )}

      {/* Si no hay backup cargado aún */}
      {!backupData && !isLoading && (
        <div className="p-8 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-center flex flex-col items-center justify-center">
          <div className="size-16 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-3xl">find_in_page</span>
          </div>
          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
            Ningún archivo de respaldo seleccionado
          </h4>
          <p className="text-xs text-slate-400 dark:text-slate-500 max-w-md mb-4">
            Selecciona el archivo descargado hace 2 semanas (ej: <code className="text-primary font-mono text-[11px]">backup_dpam_...json</code>).
            El sistema analizará el archivo de manera 100% segura en memoria sin modificar nada hasta que confirmes la restauración del expediente específico.
          </p>
          <label
            htmlFor="selective-backup-input"
            className="cursor-pointer px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-black uppercase tracking-wider transition-all"
          >
            Examinar Archivos
          </label>
        </div>
      )}

      {/* Vista del explorador de backup una vez cargado */}
      {backupData && !isLoading && (
        <div className="flex flex-col gap-5">
          {/* Barra de métricas y filtros */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[10px] font-black uppercase text-slate-400 block mb-0.5">Archivo cargado</span>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate font-mono" title={fileName}>
                {fileName}
              </p>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Total expedientes: <strong className="text-slate-700 dark:text-slate-300">{backupExpedientes.length}</strong>
              </span>
            </div>

            <div className="p-3.5 bg-amber-50/70 dark:bg-amber-950/20 rounded-xl border border-amber-200/70 dark:border-amber-800/40">
              <span className="text-[10px] font-black uppercase text-amber-600 dark:text-amber-400 block mb-0.5">
                Eliminados / Faltantes
              </span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-amber-700 dark:text-amber-400">
                  {missingTotal}
                </span>
                <span className="text-[11px] text-amber-600/80">en la base actual</span>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[10px] font-black uppercase text-slate-400 block mb-0.5">Activos en Base</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-600">
                  {backupExpedientes.length - missingTotal}
                </span>
                <span className="text-[11px] text-slate-500">ya existen</span>
              </div>
            </div>
          </div>

          {/* Barra de búsqueda y switches */}
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-800/40 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="relative flex-1">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">
                search
              </span>
              <input
                type="text"
                placeholder="Buscar por Nº GDE, Empresa, Trámite, Categoría u Observaciones..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
                >
                  <span className="material-symbols-outlined text-sm">cancel</span>
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setOnlyMissing(!onlyMissing)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all border ${
                  onlyMissing
                    ? 'bg-amber-500 text-white border-amber-600 shadow-sm'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100'
                }`}
              >
                <span className="material-symbols-outlined text-base">
                  {onlyMissing ? 'filter_alt' : 'filter_alt_off'}
                </span>
                <span>Solo eliminados ({missingTotal})</span>
              </button>
            </div>
          </div>

          {/* Listado de expedientes en el backup */}
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
            <div className="overflow-x-auto max-h-[460px] overflow-y-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400 font-black uppercase text-[10px] tracking-wider border-b border-slate-200 dark:border-slate-800 sticky top-0 z-10 backdrop-blur-sm">
                  <tr>
                    <th className="py-3 px-4">Estado en Sistema</th>
                    <th className="py-3 px-4">Número GDE</th>
                    <th className="py-3 px-4">Empresa</th>
                    <th className="py-3 px-4">Trámite / Anexo</th>
                    <th className="py-3 px-4">Movimientos</th>
                    <th className="py-3 px-4 text-right">Acción Quirúrgica</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                  {filteredCases.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-slate-400 dark:text-slate-500">
                        <span className="material-symbols-outlined text-3xl block mb-2 text-slate-300 dark:text-slate-600">
                          search_off
                        </span>
                        No se encontraron expedientes con los criterios seleccionados.
                        {onlyMissing && (
                          <div className="mt-2">
                            <button
                              onClick={() => setOnlyMissing(false)}
                              className="text-xs text-primary font-bold hover:underline"
                            >
                              Ver todos los expedientes del archivo de respaldo
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ) : (
                    filteredCases.map(c => {
                      const missing = isCaseMissing(c);
                      const relatedMovsCount = (backupData.movimientos || []).filter(
                        (m: any) => m.expedienteId === c.id
                      ).length;

                      return (
                        <tr
                          key={c.id}
                          className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors ${
                            missing ? 'bg-amber-50/30 dark:bg-amber-950/10' : ''
                          }`}
                        >
                          {/* Estado */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            {missing ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-900">
                                <span className="size-1.5 rounded-full bg-red-500 animate-pulse"></span>
                                Eliminado / Faltante
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900">
                                <span className="size-1.5 rounded-full bg-emerald-500"></span>
                                En Sistema Actual
                              </span>
                            )}
                          </td>

                          {/* Número GDE */}
                          <td className="py-3 px-4">
                            <div className="font-mono font-bold text-slate-900 dark:text-white">
                              {c.numero || 'Sin número'}
                            </div>
                            {(c.creadoEn || (c as any).antiguedad) && (
                              <span className="text-[10px] text-slate-400 block font-sans">
                                {c.creadoEn ? `Creado: ${new Date(c.creadoEn).toLocaleDateString()}` : `Antigüedad: ${(c as any).antiguedad}`}
                              </span>
                            )}
                          </td>

                          {/* Empresa */}
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-800 dark:text-slate-200 uppercase">
                              {c.empresa || 'Empresa no especificada'}
                            </div>
                            {c.plan && (
                              <span className="text-[10px] text-slate-400 block truncate max-w-xs">
                                {c.plan}
                              </span>
                            )}
                          </td>

                          {/* Trámite / Anexo */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 mr-1.5">
                              {c.tramite || 'Trámite general'}
                            </span>
                            {c.categoria && (
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                                {c.categoria}
                              </span>
                            )}
                          </td>

                          {/* Movimientos */}
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                              <span className="material-symbols-outlined text-sm">history</span>
                              {relatedMovsCount} evento(s)
                            </span>
                          </td>

                          {/* Acciones */}
                          <td className="py-3 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              {/* Botón ver detalles */}
                              <button
                                type="button"
                                onClick={() => setPreviewCase(c)}
                                className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                                title="Ver detalle completo del expediente en backup"
                              >
                                <span className="material-symbols-outlined text-base">visibility</span>
                              </button>

                              {/* Botón restaurar */}
                              <button
                                type="button"
                                onClick={() => handleRestoreCase(c)}
                                disabled={restoringId === c.id}
                                className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-all ${
                                  missing
                                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                                    : 'bg-slate-200 dark:bg-slate-800 hover:bg-amber-600 hover:text-white text-slate-700 dark:text-slate-300'
                                } disabled:opacity-50`}
                                title={
                                  missing
                                    ? 'Restaurar únicamente este expediente en la base actual'
                                    : 'Sobrescribir únicamente este expediente con la versión del backup'
                                }
                              >
                                {restoringId === c.id ? (
                                  <>
                                    <span className="material-symbols-outlined text-xs animate-spin">sync</span>
                                    <span>Restaurando...</span>
                                  </>
                                ) : (
                                  <>
                                    <span className="material-symbols-outlined text-xs">
                                      {missing ? 'restore' : 'sync'}
                                    </span>
                                    <span>{missing ? 'Restaurar este' : 'Reemplazar'}</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Footer de la tabla */}
            <div className="px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex justify-between items-center text-[11px] text-slate-500">
              <span>
                Mostrando <strong className="text-slate-700 dark:text-slate-300">{filteredCases.length}</strong> de{' '}
                <strong className="text-slate-700 dark:text-slate-300">{backupExpedientes.length}</strong> expedientes en el archivo
              </span>
              <span className="italic text-slate-400">
                La restauración solo escribe este registro y sus movimientos, sin alterar nada más.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Previsualización de Expediente Individual */}
      {previewCase && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header Modal */}
            <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-800/50">
              <div className="flex items-center gap-2.5">
                <span className="material-symbols-outlined text-primary text-2xl">description</span>
                <div>
                  <h4 className="text-sm font-black text-slate-900 dark:text-white uppercase font-mono">
                    {previewCase.numero || 'Sin Número'}
                  </h4>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase">
                    {previewCase.empresa}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPreviewCase(null)}
                className="size-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Contenido Modal */}
            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              {/* Badges de estado */}
              <div className="flex flex-wrap gap-2">
                {isCaseMissing(previewCase) ? (
                  <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border border-red-200">
                    Faltante / Eliminado en la base actual
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200">
                    Ya presente en la base actual
                  </span>
                )}
                {previewCase.instancia && (
                  <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300">
                    Instancia: {previewCase.instancia}
                  </span>
                )}
                {previewCase.categoria && (
                  <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-purple-100 text-purple-800 dark:bg-purple-950/60 dark:text-purple-300">
                    {previewCase.categoria}
                  </span>
                )}
                {previewCase.prioridad && (
                  <span className="px-3 py-1 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300">
                    Prioridad: {previewCase.prioridad}
                  </span>
                )}
              </div>

              {/* Campos principales */}
              <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 block mb-0.5">Trámite</span>
                  <p className="font-bold text-slate-800 dark:text-slate-200">{previewCase.tramite || '—'}</p>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 block mb-0.5">Ordenanza</span>
                  <p className="font-bold text-slate-800 dark:text-slate-200">{previewCase.ordenanza || '—'}</p>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 block mb-0.5">Asignado a</span>
                  <p className="font-bold text-slate-800 dark:text-slate-200">
                    {previewCase.asignadoANombre || previewCase.asignadoA || '—'}
                  </p>
                </div>
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 block mb-0.5">Fecha Creación / Antigüedad</span>
                  <p className="font-bold text-slate-800 dark:text-slate-200">
                    {previewCase.creadoEn ? new Date(previewCase.creadoEn).toLocaleDateString() : ((previewCase as any).antiguedad || '—')}
                  </p>
                </div>
                {previewCase.plan && (
                  <div className="col-span-2">
                    <span className="text-[10px] font-black uppercase text-slate-400 block mb-0.5">Plan Vinculado</span>
                    <p className="font-bold text-slate-800 dark:text-slate-200">{previewCase.plan}</p>
                  </div>
                )}
              </div>

              {/* Observaciones */}
              {previewCase.observaciones && (
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-400 block mb-1">Observaciones</span>
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 text-slate-700 dark:text-slate-300 whitespace-pre-wrap font-sans text-xs">
                    {previewCase.observaciones}
                  </div>
                </div>
              )}

              {/* Movimientos históricos contenidos en el backup */}
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 block mb-2">
                  Historial de Movimientos en el Backup
                </span>
                {(() => {
                  const movs = (backupData?.movimientos || []).filter(
                    (m: any) => m.expedienteId === previewCase.id
                  );
                  if (movs.length === 0) {
                    return (
                      <p className="text-xs text-slate-400 italic">No hay movimientos registrados para este expediente en el archivo.</p>
                    );
                  }
                  return (
                    <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                      {movs.map((m: any, idx: number) => (
                        <div
                          key={m.id || idx}
                          className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 text-xs"
                        >
                          <div className="flex justify-between items-center text-[10px] text-slate-400 mb-1">
                            <span className="font-bold text-slate-700 dark:text-slate-300">{m.usuario || 'Sistema'}</span>
                            <span>{m.fecha ? new Date(m.fecha).toLocaleString() : ''}</span>
                          </div>
                          <p className="text-slate-600 dark:text-slate-300">{m.texto}</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Footer Modal con Acción de Restaurar */}
            <div className="p-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setPreviewCase(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                Cerrar
              </button>
              <button
                type="button"
                onClick={() => handleRestoreCase(previewCase)}
                disabled={restoringId === previewCase.id}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {restoringId === previewCase.id ? (
                  <>
                    <span className="material-symbols-outlined text-xs animate-spin">sync</span>
                    <span>Restaurando...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base">restore</span>
                    <span>Restaurar únicamente este expediente</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
