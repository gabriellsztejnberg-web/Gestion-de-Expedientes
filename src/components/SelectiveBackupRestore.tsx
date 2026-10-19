import React, { useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs, doc, setDoc, writeBatch } from 'firebase/firestore';
import { Case, TimelineEvent } from '../types';

interface SelectiveBackupRestoreProps {
  isModal?: boolean;
  onClose?: () => void;
  onCaseRestored?: (restoredCase: Case) => void;
}

// Limpia cualquier propiedad 'undefined' para evitar el error clásico de Firestore:
// "Function setDoc() called with invalid data. Unsupported field value: undefined"
const sanitizeForFirestore = (obj: any): any => {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);

  const clean: Record<string, any> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      clean[key] = sanitizeForFirestore(value);
    }
  }
  return clean;
};

// Formatea fechas con total seguridad ante nulls, strings o timestamps de Firestore
export const formatDateSafe = (val: any): string => {
  if (!val) return '—';
  if (typeof val === 'string') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toLocaleDateString();
    return val;
  }
  if (typeof val === 'number') {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d.toLocaleDateString();
    return String(val);
  }
  if (val?.seconds != null) {
    return new Date(val.seconds * 1000).toLocaleDateString();
  }
  return String(val);
};

// Normaliza un caso del backup para que ningún campo cause fallos de tipo (como trim o toLowerCase)
const normalizeCase = (c: any, index: number): Case => {
  const rawId = c?.id ?? c?._id ?? c?.uid;
  const rawNumero = c?.numero ?? c?.nro ?? c?.numeroGde ?? c?.nro_expediente ?? c?.gde ?? '';
  const safeNumero = String(rawNumero).trim();
  const safeId = rawId ? String(rawId).trim() : (safeNumero ? `exp_${safeNumero.replace(/\W+/g, '_')}` : `case_restored_${Date.now()}_${index}`);
  const safeEmpresa = c?.empresa != null ? String(c.empresa).trim() : (c?.razonSocial != null ? String(c.razonSocial).trim() : '');
  const safeTramite = c?.tramite != null ? String(c.tramite).trim() : '';
  const safeCategoria = c?.categoria != null ? String(c.categoria).trim() : (c?.anexo != null ? String(c.anexo).trim() : '');
  const safeObservaciones = c?.observaciones != null ? String(c.observaciones).trim() : '';
  const safePlan = c?.plan != null ? String(c.plan).trim() : '';
  const safeInstancia = c?.instancia != null ? String(c.instancia).trim() : 'analisis';
  const safePrioridad = c?.prioridad != null ? String(c.prioridad).trim() : 'media';
  const safeAsignadoA = c?.asignadoA != null ? String(c.asignadoA).trim() : 'buzon';
  const safeAsignadoANombre = c?.asignadoANombre != null ? String(c.asignadoANombre).trim() : 'Buzón Grupal';
  
  let safeCreadoEn: string = new Date().toISOString();
  if (typeof c?.creadoEn === 'string') {
    safeCreadoEn = c.creadoEn;
  } else if (c?.creadoEn?.seconds != null) {
    safeCreadoEn = new Date(c.creadoEn.seconds * 1000).toISOString();
  } else if (typeof c?.creadoEn === 'number') {
    safeCreadoEn = new Date(c.creadoEn).toISOString();
  }

  return {
    ...c,
    id: safeId,
    numero: safeNumero,
    empresa: safeEmpresa,
    tramite: safeTramite,
    categoria: safeCategoria,
    observaciones: safeObservaciones,
    plan: safePlan,
    instancia: safeInstancia as any,
    prioridad: safePrioridad as any,
    asignadoA: safeAsignadoA,
    asignadoANombre: safeAsignadoANombre,
    creadoEn: safeCreadoEn
  };
};

// Extrae expedientes y movimientos desde múltiples estructuras posibles de backup JSON
const parseBackupContent = (parsed: any): { expedientes: Case[]; movimientos: TimelineEvent[] } => {
  let rawCases: any[] = [];
  let rawMovimientos: any[] = [];

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('El archivo no contiene un JSON válido.');
  }

  // 1. Si el JSON es directamente un array de expedientes
  if (Array.isArray(parsed)) {
    rawCases = parsed;
  } 
  // 2. Si contiene propiedad "expedientes"
  else if (parsed.expedientes) {
    if (Array.isArray(parsed.expedientes)) {
      rawCases = parsed.expedientes;
    } else if (typeof parsed.expedientes === 'object') {
      rawCases = Object.entries(parsed.expedientes).map(([id, val]: [string, any]) => ({
        id: val?.id || id,
        ...(typeof val === 'object' ? val : {})
      }));
    }
  } 
  // 3. Variantes en mayúsculas / otros nombres comunes
  else if (parsed.EXPEDIENTES && Array.isArray(parsed.EXPEDIENTES)) {
    rawCases = parsed.EXPEDIENTES;
  } else if (parsed.Expedientes && Array.isArray(parsed.Expedientes)) {
    rawCases = parsed.Expedientes;
  } else if (parsed.cases && Array.isArray(parsed.cases)) {
    rawCases = parsed.cases;
  } else if (parsed.data && typeof parsed.data === 'object') {
    return parseBackupContent(parsed.data);
  } else if (parsed.documents && Array.isArray(parsed.documents)) {
    // Formato export REST de Firestore
    rawCases = parsed.documents.map((d: any) => {
      const id = d.name ? d.name.split('/').pop() : undefined;
      const fields: Record<string, any> = {};
      if (d.fields) {
        for (const [k, v] of Object.entries(d.fields as Record<string, any>)) {
          fields[k] = v.stringValue ?? v.integerValue ?? v.booleanValue ?? v.timestampValue ?? v;
        }
      }
      return { id, ...fields };
    });
  }

  // Extraer movimientos
  if (parsed.movimientos) {
    if (Array.isArray(parsed.movimientos)) {
      rawMovimientos = parsed.movimientos;
    } else if (typeof parsed.movimientos === 'object') {
      rawMovimientos = Object.entries(parsed.movimientos).map(([id, val]: [string, any]) => ({
        id: val?.id || id,
        ...(typeof val === 'object' ? val : {})
      }));
    }
  } else if (parsed.timeline && Array.isArray(parsed.timeline)) {
    rawMovimientos = parsed.timeline;
  } else if (parsed.historial && Array.isArray(parsed.historial)) {
    rawMovimientos = parsed.historial;
  }

  if (rawCases.length === 0) {
    throw new Error('No se detectó ninguna lista de expedientes reconocible dentro del archivo. Verifica que corresponda a un respaldo de la aplicación.');
  }

  const normalizedCases = rawCases.map((c, idx) => normalizeCase(c, idx));

  // Normalizar movimientos
  const normalizedMovs: TimelineEvent[] = rawMovimientos.map((m, idx) => {
    const rawId = m?.id ?? `mov_${Date.now()}_${idx}`;
    return {
      ...m,
      id: String(rawId),
      expedienteId: String(m?.expedienteId || m?.caseId || ''),
      texto: String(m?.texto || m?.detalle || m?.descripcion || ''),
      usuario: String(m?.usuario || m?.usuarioNombre || 'Sistema'),
      fecha: m?.fecha ? String(m.fecha) : new Date().toISOString()
    };
  });

  return { expedientes: normalizedCases, movimientos: normalizedMovs };
};

export const SelectiveBackupRestore: React.FC<SelectiveBackupRestoreProps> = ({
  isModal = false,
  onClose,
  onCaseRestored
}) => {
  const [backupCases, setBackupCases] = useState<Case[]>([]);
  const [backupMovimientos, setBackupMovimientos] = useState<TimelineEvent[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const [isComparing, setIsComparing] = useState(false);
  const [currentCaseIds, setCurrentCaseIds] = useState<Set<string>>(new Set());
  const [currentCaseNumeros, setCurrentCaseNumeros] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(true);
  const [previewCase, setPreviewCase] = useState<Case | null>(null);
  const [confirmRestoreCase, setConfirmRestoreCase] = useState<Case | null>(null);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [pastedJson, setPastedJson] = useState('');

  const processJsonText = async (text: string, sourceName: string) => {
    setIsLoading(true);
    setStatusMessage(null);
    setFileName(sourceName);

    try {
      // Quitar posibles caracteres de Byte Order Mark (BOM)
      const cleanText = text.replace(/^\uFEFF/, '').trim();
      const parsed = JSON.parse(cleanText);

      const { expedientes, movimientos } = parseBackupContent(parsed);

      setBackupCases(expedientes);
      setBackupMovimientos(movimientos);
      setIsLoading(false);

      // Comparación con la base actual en Firestore
      await compareWithCurrentDatabase(expedientes);
    } catch (err: any) {
      console.error('Error al procesar backup JSON:', err);
      setStatusMessage({
        type: 'error',
        text: `Error al leer el archivo: ${err.message || 'Formato JSON no válido o archivo dañado.'}`
      });
      setIsLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const content = event.target?.result as string;
      await processJsonText(content, file.name);
    };
    reader.onerror = () => {
      setStatusMessage({
        type: 'error',
        text: 'Error de lectura del archivo local.'
      });
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset input para poder elegir el mismo archivo si es necesario
  };

  const handlePasteSubmit = async () => {
    if (!pastedJson.trim()) {
      setStatusMessage({ type: 'error', text: 'Por favor pega el contenido JSON antes de continuar.' });
      return;
    }
    await processJsonText(pastedJson, 'Texto JSON pegado');
    setShowPasteArea(false);
  };

  const compareWithCurrentDatabase = async (parsedCases: Case[]) => {
    setIsComparing(true);
    try {
      const snap = await getDocs(collection(db, 'expedientes'));
      const existingIds = new Set<string>();
      const existingNumeros = new Set<string>();

      snap.docs.forEach(docSnap => {
        existingIds.add(String(docSnap.id));
        const data = docSnap.data();
        if (data && data.numero != null) {
          const numStr = String(data.numero).trim().toUpperCase();
          if (numStr) existingNumeros.add(numStr);
        }
      });

      setCurrentCaseIds(existingIds);
      setCurrentCaseNumeros(existingNumeros);

      // Calcular cuántos faltan
      const missingCount = parsedCases.filter(c => {
        const hasId = existingIds.has(c.id);
        const numStr = String(c.numero || '').trim().toUpperCase();
        const hasNumero = numStr ? existingNumeros.has(numStr) : false;
        return !hasId && !hasNumero;
      }).length;

      if (missingCount > 0) {
        setStatusMessage({
          type: 'info',
          text: `Se detectaron ${missingCount} expediente(s) en el backup que NO existen en la base actual (fueron eliminados). Están marcados con insignia roja para que puedas restaurar únicamente el que necesitas.`
        });
        setOnlyMissing(true);
      } else {
        setStatusMessage({
          type: 'info',
          text: `Todos los ${parsedCases.length} expedientes del backup ya existen en la base actual. Desmarca la casilla "Solo eliminados" para inspeccionar o sobrescribir alguno en particular.`
        });
        setOnlyMissing(false);
      }
    } catch (err: any) {
      console.warn('Error al comparar con Firestore:', err);
      // Fallback seguro: permitimos que el usuario explore el backup y restaure manualmente
      setStatusMessage({
        type: 'info',
        text: `Se cargaron ${parsedCases.length} expedientes del backup. (Aviso: No se pudo verificar en vivo contra Firestore: ${err?.message || 'Permiso o red'}. Puedes buscar tu expediente y restaurarlo directamente).`
      });
      setOnlyMissing(false);
    } finally {
      setIsComparing(false);
    }
  };

  const isCaseMissing = (c: Case): boolean => {
    const hasId = currentCaseIds.has(c.id);
    const numStr = String(c.numero || '').trim().toUpperCase();
    const hasNumero = numStr ? currentCaseNumeros.has(numStr) : false;
    return !hasId && !hasNumero;
  };

  const executeRestore = async (c: Case) => {
    setRestoringId(c.id);
    setStatusMessage(null);

    try {
      const { id, ...caseDataRaw } = c;
      const targetId = String(id || c.numero || `exp_${Date.now()}`).trim();

      // Sanitizar caseData contra campos undefined
      const cleanCaseData = sanitizeForFirestore(caseDataRaw);

      // 1. Guardar el expediente específico en Firestore
      await setDoc(doc(db, 'expedientes', targetId), cleanCaseData);

      // 2. Restaurar sus movimientos históricos asociados si existen
      const relatedMovs = backupMovimientos.filter(m => String(m.expedienteId) === String(targetId) || String(m.expedienteId) === String(c.id));

      if (relatedMovs.length > 0) {
        const batch = writeBatch(db);
        for (const mov of relatedMovs) {
          const { id: movId, ...movDataRaw } = mov;
          const targetMovId = String(movId || `mov_${targetId}_${Date.now()}_${Math.random()}`).trim();
          const cleanMovData = sanitizeForFirestore({
            ...movDataRaw,
            expedienteId: targetId
          });
          batch.set(doc(db, 'movimientos', targetMovId), cleanMovData);
        }
        await batch.commit();
      }

      // 3. Actualizar sets locales en memoria
      setCurrentCaseIds(prev => new Set(prev).add(targetId));
      if (c.numero) {
        const numStr = String(c.numero).trim().toUpperCase();
        if (numStr) {
          setCurrentCaseNumeros(prev => new Set(prev).add(numStr));
        }
      }

      // Notificar al componente padre si fue provisto
      if (onCaseRestored) {
        onCaseRestored({ ...cleanCaseData, id: targetId });
      }

      setStatusMessage({
        type: 'success',
        text: `¡Éxito! El expediente "${c.numero || targetId}" (${c.empresa || 'S/D'}) fue restaurado en la base de datos ${relatedMovs.length > 0 ? `junto a sus ${relatedMovs.length} movimientos históricos` : ''}. Todo el trabajo restante de estas dos semanas se mantiene 100% intacto.`
      });

      // Cerrar modales de previsualización y confirmación
      setConfirmRestoreCase(null);
      if (previewCase?.id === c.id) {
        setPreviewCase(null);
      }
    } catch (err: any) {
      console.error('Error al restaurar expediente:', err);
      setStatusMessage({
        type: 'error',
        text: `Error al restaurar el expediente en Firestore: ${err.message || 'Error de conexión o permisos'}`
      });
    } finally {
      setRestoringId(null);
    }
  };

  // Filtrado de expedientes en memoria
  const filteredCases = backupCases.filter(c => {
    const missing = isCaseMissing(c);
    if (onlyMissing && !missing) return false;

    if (!searchTerm.trim()) return true;

    const term = searchTerm.toLowerCase().trim();
    const matchNumero = String(c.numero || '').toLowerCase().includes(term);
    const matchEmpresa = String(c.empresa || '').toLowerCase().includes(term);
    const matchTramite = String(c.tramite || '').toLowerCase().includes(term);
    const matchCategoria = String(c.categoria || '').toLowerCase().includes(term);
    const matchObservaciones = String(c.observaciones || '').toLowerCase().includes(term);
    const matchPlan = String(c.plan || '').toLowerCase().includes(term);

    return matchNumero || matchEmpresa || matchTramite || matchCategoria || matchObservaciones || matchPlan;
  });

  const missingTotal = backupCases.filter(c => isCaseMissing(c)).length;

  const content = (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-6 md:p-8 flex flex-col gap-6">
      {/* Encabezado */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-start gap-3">
          <div className="size-12 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-2xl">healing</span>
          </div>
          <div>
            <h3 className="text-lg font-black text-slate-900 dark:text-white uppercase tracking-tight flex items-center gap-2">
              Recuperación Selectiva de Expediente
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                Seguro • Sin Sobrescribir
              </span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
              Carga tu backup semanal (.json), busca el expediente eliminado por error y 
              <strong className="text-slate-700 dark:text-slate-300"> restáuralo quirúrgicamente junto a sus movimientos</strong> sin alterar ni perder ninguno de los cambios realizados durante estas últimas dos semanas.
            </p>
          </div>
        </div>

        {/* Acciones principales de carga */}
        <div className="shrink-0 flex items-center gap-2 flex-wrap">
          {isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg"
              title="Cerrar"
            >
              <span className="material-symbols-outlined">close</span>
            </button>
          )}

          <input
            type="file"
            accept=".json,application/json,text/plain"
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
            {backupCases.length > 0 ? 'Cambiar Archivo Backup' : 'Seleccionar Archivo Backup (.json)'}
          </label>

          <button
            type="button"
            onClick={() => setShowPasteArea(!showPasteArea)}
            className="px-3 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-bold uppercase transition-all"
            title="Pegar texto JSON directamente"
          >
            <span className="material-symbols-outlined text-base">content_paste</span>
          </button>
        </div>
      </div>

      {/* Área para pegar JSON manualmente */}
      {showPasteArea && (
        <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <span className="text-xs font-black uppercase text-slate-700 dark:text-slate-300">
              Pegar contenido JSON del backup
            </span>
            <button
              onClick={() => setShowPasteArea(false)}
              className="text-slate-400 hover:text-slate-600 text-xs"
            >
              Cancelar
            </button>
          </div>
          <textarea
            rows={5}
            value={pastedJson}
            onChange={(e) => setPastedJson(e.target.value)}
            placeholder="Pega aquí el contenido del archivo .json descargado..."
            className="w-full p-3 font-mono text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
          <button
            onClick={handlePasteSubmit}
            disabled={isLoading || !pastedJson.trim()}
            className="self-end px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase rounded-lg shadow-sm"
          >
            Analizar JSON Pegado
          </button>
        </div>
      )}

      {/* Mensaje de estado */}
      {statusMessage && (
        <div
          className={`p-4 rounded-xl text-xs flex items-start gap-3 ${
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
      {backupCases.length === 0 && !isLoading && (
        <div className="p-8 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-center flex flex-col items-center justify-center">
          <div className="size-16 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-3xl">find_in_page</span>
          </div>
          <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 uppercase mb-1">
            Ningún archivo de respaldo seleccionado
          </h4>
          <p className="text-xs text-slate-400 dark:text-slate-500 max-w-md mb-4 leading-relaxed">
            Selecciona el archivo descargado hace 2 semanas (ej: <code className="text-primary font-mono text-[11px]">backup_dpam_...json</code>).
            El sistema analizará el archivo de manera 100% segura en la memoria de tu navegador sin modificar nada de la base hasta que elijas restaurar el expediente puntual.
          </p>
          <label
            htmlFor="selective-backup-input"
            className="cursor-pointer px-5 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-black uppercase tracking-wider transition-all"
          >
            Examinar Archivos en mi Computadora
          </label>
        </div>
      )}

      {/* Vista del explorador de backup una vez cargado */}
      {backupCases.length > 0 && !isLoading && (
        <div className="flex flex-col gap-5">
          {/* Métricas rápidas */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[10px] font-black uppercase text-slate-400 block mb-0.5">Archivo cargado</span>
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate font-mono" title={fileName}>
                {fileName || 'Respaldo JSON'}
              </p>
              <span className="text-[10px] text-slate-400 mt-1 block">
                Total expedientes en archivo: <strong className="text-slate-700 dark:text-slate-300">{backupCases.length}</strong>
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
                <span className="text-[11px] text-amber-600/80">no están en la base actual</span>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
              <span className="text-[10px] font-black uppercase text-slate-400 block mb-0.5">Activos en Base</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-600">
                  {backupCases.length - missingTotal}
                </span>
                <span className="text-[11px] text-slate-500">ya presentes</span>
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
                  type="button"
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
                    <th className="py-3 px-4">Estado en Base</th>
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
                              type="button"
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
                      const relatedMovsCount = backupMovimientos.filter(
                        (m: any) => String(m.expedienteId) === String(c.id) || String(m.expedienteId) === String(c.numero)
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
                                {c.creadoEn ? `Creado: ${formatDateSafe(c.creadoEn)}` : `Antigüedad: ${(c as any).antiguedad}`}
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
                                title="Ver detalle completo del expediente en el backup"
                              >
                                <span className="material-symbols-outlined text-base">visibility</span>
                              </button>

                              {/* Botón restaurar */}
                              <button
                                type="button"
                                onClick={() => setConfirmRestoreCase(c)}
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
                <strong className="text-slate-700 dark:text-slate-300">{backupCases.length}</strong> expedientes en el archivo
              </span>
              <span className="italic text-slate-400 hidden sm:inline">
                La restauración solo escribe este registro puntual y sus movimientos, sin alterar el resto de la base.
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Previsualización de Expediente Individual */}
      {previewCase && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
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
                    {previewCase.empresa || 'Empresa no especificada'}
                  </p>
                </div>
              </div>
              <button
                type="button"
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
                    {formatDateSafe(previewCase.creadoEn)}
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

              {/* Movimientos históricos en backup */}
              <div>
                <span className="text-[10px] font-black uppercase text-slate-400 block mb-2">
                  Historial de Movimientos en el Backup
                </span>
                {(() => {
                  const movs = backupMovimientos.filter(
                    (m: any) => String(m.expedienteId) === String(previewCase.id) || String(m.expedienteId) === String(previewCase.numero)
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
                            <span>{formatDateSafe(m.fecha)}</span>
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
                onClick={() => setConfirmRestoreCase(previewCase)}
                disabled={restoringId === previewCase.id}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-base">restore</span>
                <span>Restaurar únicamente este expediente</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* DIÁLOGO DE CONFIRMACIÓN IN-APP (Sin window.confirm para no bloquear en iframes) */}
      {confirmRestoreCase && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 flex flex-col gap-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center gap-3 text-emerald-600">
              <div className="size-12 rounded-full bg-emerald-100 dark:bg-emerald-950/60 flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-2xl">security</span>
              </div>
              <div>
                <h4 className="text-base font-black text-slate-900 dark:text-white uppercase">
                  Confirmar Restauración Aislada
                </h4>
                <p className="text-xs text-slate-500">Operación quirúrgica segura</p>
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-xl border border-slate-200/70 dark:border-slate-700/60 text-xs space-y-2">
              <p className="text-slate-700 dark:text-slate-300">
                Se restaurará <strong>únicamente</strong> el siguiente expediente en la base de datos:
              </p>
              <div className="font-mono text-xs font-bold text-emerald-700 dark:text-emerald-400">
                • Nº GDE: {confirmRestoreCase.numero || 'Sin número'}
              </div>
              <div className="text-slate-600 dark:text-slate-400">
                • Empresa: <strong>{confirmRestoreCase.empresa || 'S/D'}</strong>
              </div>
              <div className="text-slate-600 dark:text-slate-400">
                • Trámite: {confirmRestoreCase.tramite || 'S/D'}
              </div>
              <div className="text-slate-600 dark:text-slate-400">
                • Movimientos a restablecer:{' '}
                <strong>
                  {backupMovimientos.filter(m => String(m.expedienteId) === String(confirmRestoreCase.id) || String(m.expedienteId) === String(confirmRestoreCase.numero)).length}
                </strong>
              </div>
            </div>

            <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-800 dark:text-emerald-300 leading-relaxed">
              <strong>Garantía de integridad:</strong> Los demás expedientes y todo el trabajo realizado durante estas últimas 2 semanas permanecerán <strong>100% inalterados</strong>.
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmRestoreCase(null)}
                disabled={restoringId != null}
                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => executeRestore(confirmRestoreCase)}
                disabled={restoringId != null}
                className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider shadow-sm transition-all flex items-center gap-2 disabled:opacity-50"
              >
                {restoringId === confirmRestoreCase.id ? (
                  <>
                    <span className="material-symbols-outlined text-xs animate-spin">sync</span>
                    <span>Restaurando...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base">check_circle</span>
                    <span>Confirmar y Restaurar</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (isModal) {
    return (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
        <div className="w-full max-w-5xl my-8">
          {content}
        </div>
      </div>
    );
  }

  return content;
};

