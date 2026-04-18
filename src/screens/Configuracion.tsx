
import React, { useState } from 'react';
import { Sidebar } from '../components/Sidebar';
import { db } from '../firebase';
import { collection, getDocs, writeBatch, doc, deleteDoc } from 'firebase/firestore';

const COLLECTIONS = [
  'expedientes',
  'movimientos',
  'mails',
  'mois',
  'usuarios',
  'auditores',
  'inspecciones',
  'asistencia',
  'planes',
  'empresas_derrames',
  'control_derrames'
];

export const Configuracion: React.FC = () => {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState('');

  const handleExport = async () => {
    if (!confirm("¿Desea descargar un respaldo completo de la base de datos?")) return;
    setIsExporting(true);
    try {
      const backupData: Record<string, any[]> = {};

      for (const colName of COLLECTIONS) {
        const snap = await getDocs(collection(db, colName));
        backupData[colName] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup_dpam_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      alert("Respaldo descargado con éxito.");
    } catch (error) {
      console.error(error);
      alert("Error al generar el respaldo.");
    } finally {
      setIsExporting(false);
    }
  };

  const [counts, setCounts] = useState<Record<string, number>>({});
  const [isChecking, setIsChecking] = useState(false);

  const checkCounts = async () => {
    setIsChecking(true);
    const newCounts: Record<string, number> = {};
    for (const col of COLLECTIONS) {
      try {
        const snap = await getDocs(collection(db, col));
        newCounts[col] = snap.size;
      } catch (e) {
        newCounts[col] = -1;
      }
    }
    setCounts(newCounts);
    setIsChecking(false);
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm("¡ADVERTENCIA CRÍTICA!\n\nEsta acción reemplazará o combinará los datos actuales con los del archivo. Se recomienda tener un backup previo.\n\n¿Desea continuar?")) {
      e.target.value = '';
      return;
    }

    setIsImporting(true);
    setImportProgress('Leyendo archivo...');

    try {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          
          for (const colName of COLLECTIONS) {
            if (data[colName] && Array.isArray(data[colName])) {
              setImportProgress(`Restaurando colección: ${colName.toUpperCase()}...`);
              
              // Usamos batches para eficiencia (límite de 500 por batch en Firestore)
              const items = data[colName];
              let batch = writeBatch(db);
              let count = 0;

              for (const item of items) {
                const { id, ...rest } = item;
                const docRef = doc(db, colName, id);
                batch.set(docRef, rest);
                count++;

                if (count === 400) {
                  await batch.commit();
                  batch = writeBatch(db);
                  count = 0;
                }
              }
              if (count > 0) await batch.commit();
            }
          }

          alert("Restauración completada con éxito. Se recomienda recargar la aplicación.");
          window.location.reload();
        } catch (err) {
          console.error(err);
          alert("Error al procesar el archivo JSON.");
        } finally {
          setIsImporting(false);
          setImportProgress('');
        }
      };
      reader.readAsText(file);
    } catch (error) {
      console.error(error);
      alert("Error al leer el archivo.");
      setIsImporting(false);
    }
  };

  return (
    <div className="flex h-screen w-full bg-background-light dark:bg-background-dark overflow-hidden">
      <Sidebar activePage="configuracion" />
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <main className="flex-1 p-6 md:p-10 overflow-y-auto">
          <div className="max-w-4xl mx-auto">
            <div className="mb-10">
              <h1 className="text-slate-900 dark:text-white text-3xl font-black uppercase tracking-tight">Configuración del Sistema</h1>
              <p className="text-slate-500 dark:text-slate-400 font-bold text-sm uppercase tracking-widest italic">Mantenimiento y Respaldo de Datos</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              
              {/* Card Auditoría de Datos */}
              <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm col-span-1 md:col-span-2">
                <div className="flex justify-between items-center mb-6">
                   <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase">Estado de la Base de Datos</h3>
                   <button 
                     onClick={checkCounts}
                     disabled={isChecking}
                     className="px-4 py-2 bg-slate-100 dark:bg-slate-800 rounded-lg text-[10px] font-black uppercase hover:bg-slate-200 transition-all flex items-center gap-2"
                   >
                     <span className={`material-symbols-outlined text-sm ${isChecking ? 'animate-spin' : ''}`}>sync</span>
                     Verificar Cantidades
                   </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
                  {Object.entries(counts).map(([col, count]) => {
                    const n = count as number;
                    return (
                      <div key={col} className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700">
                        <p className="text-[9px] font-black uppercase text-slate-400 mb-1 truncate">{col}</p>
                        <p className={`text-xl font-black ${n > 0 ? 'text-primary' : n === 0 ? 'text-slate-300' : 'text-red-500'}`}>
                          {n === -1 ? 'Err' : n}
                        </p>
                      </div>
                    );
                  })}
                </div>
                {(counts['control_derrames'] || 0) > 0 && (counts['empresas_derrames'] === 0) && (
                  <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-4 text-amber-800">
                    <span className="material-symbols-outlined text-3xl">warning</span>
                    <div>
                      <p className="text-xs font-black uppercase">Atención: Desfase de Colección</p>
                      <p className="text-[10px] font-medium">Se detectaron datos en 'control_derrames' pero no en 'empresas_derrames'. Es posible que debas migrar los datos.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Card Exportar */}
              <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center">
                <div className="size-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-full flex items-center justify-center mb-6">
                  <span className="material-symbols-outlined text-4xl">download</span>
                </div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase mb-2">Exportar Respaldo</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                  Descarga un archivo JSON con toda la información del sistema: expedientes, movimientos, personal, inspecciones y más.
                </p>
                <button 
                  onClick={handleExport}
                  disabled={isExporting}
                  className="w-full py-4 bg-primary text-white text-xs font-black uppercase rounded-xl shadow-lg hover:bg-blue-600 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isExporting ? (
                    <>
                      <span className="material-symbols-outlined animate-spin">sync</span>
                      Generando...
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined">cloud_download</span>
                      Descargar Backup
                    </>
                  )}
                </button>
              </div>

              {/* Card Importar */}
              <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center text-center">
                <div className="size-16 bg-orange-100 dark:bg-orange-900/30 text-orange-600 rounded-full flex items-center justify-center mb-6">
                  <span className="material-symbols-outlined text-4xl">upload</span>
                </div>
                <h3 className="text-xl font-black text-slate-900 dark:text-white uppercase mb-2">Restaurar Datos</h3>
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-8 leading-relaxed">
                  Sube un archivo de respaldo previamente descargado para restaurar la información. 
                  <span className="text-red-500 font-bold block mt-2 underline">¡Cuidado! Esto puede sobrescribir datos actuales.</span>
                </p>
                
                <div className="w-full relative">
                  <input 
                    type="file" 
                    accept=".json" 
                    onChange={handleImport}
                    disabled={isImporting}
                    className="hidden" 
                    id="import-input"
                  />
                  <label 
                    htmlFor="import-input"
                    className={`w-full py-4 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl flex items-center justify-center gap-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-all ${isImporting ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span className="material-symbols-outlined text-slate-400">file_upload</span>
                    <span className="text-xs font-black uppercase text-slate-500">
                      {isImporting ? 'Procesando...' : 'Seleccionar Archivo'}
                    </span>
                  </label>
                </div>

                {isImporting && (
                  <div className="mt-4 w-full">
                    <p className="text-[10px] font-black uppercase text-orange-600 animate-pulse">{importProgress}</p>
                  </div>
                )}
              </div>

            </div>

            <div className="mt-12 p-6 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-200 dark:border-slate-800">
               <div className="flex items-start gap-4">
                  <span className="material-symbols-outlined text-slate-400">info</span>
                  <div>
                    <h4 className="text-xs font-black uppercase text-slate-700 dark:text-slate-300 mb-1">Información de Seguridad</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      Los archivos de respaldo contienen información sensible del personal y expedientes. 
                      Guárdelos en un lugar seguro y no los comparta con personas ajenas a la oficina. 
                      Se recomienda realizar un respaldo al menos una vez por semana.
                    </p>
                  </div>
               </div>
            </div>

          </div>
        </main>
      </div>
    </div>
  );
};
