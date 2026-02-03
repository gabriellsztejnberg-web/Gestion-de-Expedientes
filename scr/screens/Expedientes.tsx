
import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from '../components/Sidebar';
import { db } from '../firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  serverTimestamp,
  setDoc,
  where,
  getDocs
} from 'firebase/firestore';
import { Case, Instancia, InstanciaId, TimelineEvent, User } from '../types';

const INSTANCIAS: Instancia[] = [
  { id: 'analisis', label: 'Análisis', color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { id: 'obs', label: 'Obs (Observado)', color: 'bg-red-100 text-red-800 border-red-200' },
  { id: 'notificacion', label: 'Notificación', color: 'bg-yellow-100 text-yellow-800 border-yellow-200' },
  { id: 'p_insp', label: 'P. Inspección', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  { id: 'p_dispo', label: 'P. Disposición', color: 'bg-purple-100 text-purple-800 border-purple-200' },
  { id: 'pase', label: 'Pase Externo', color: 'bg-orange-100 text-orange-800 border-orange-200' },
  { id: 'guarda', label: 'Guarda', color: 'bg-gray-200 text-gray-600 border-gray-300' }
];

export const Expedientes: React.FC = () => {
  const [cases, setCases] = useState<Case[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [activeTab, setActiveTab] = useState<'grupal' | 'individual' | 'usuarios' | 'guarda'>('grupal');
  const [searchTerm, setSearchTerm] = useState('');
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMovimientoModalOpen, setIsMovimientoModalOpen] = useState(false);
  const [isHistorialModalOpen, setIsHistorialModalOpen] = useState(false);
  
  const [editingExp, setEditingExp] = useState<Partial<Case> | null>(null);
  const [movData, setMovData] = useState({ tipo: 'Analisis', detalle: '', destino: '' });

  const currentUser: User = JSON.parse(localStorage.getItem('currentUser') || '{"id":"temp","name":"Gabriel","role":"jefe"}');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Escuchar Expedientes en Tiempo Real
  useEffect(() => {
    const q = query(collection(db, 'expedientes'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Case));
      setCases(docs);
    });
    return () => unsubscribe();
  }, []);

  // Escuchar Movimientos en Tiempo Real
  useEffect(() => {
    const q = query(collection(db, 'movimientos'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimelineEvent));
      setEvents(docs);
    });
    return () => unsubscribe();
  }, []);

  const getFullTimestamp = () => {
    const now = new Date();
    return now.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  const addHistoryEntry = async (caseId: string, texto: string, actionType: string) => {
    const newEvent = {
      usuario: currentUser.name,
      fecha: new Date().toISOString(),
      texto,
      expedienteId: caseId,
      tipoAccion: actionType
    };
    await addDoc(collection(db, 'movimientos'), newEvent);
  };

  const handleAcquire = async (caseId: string) => {
    const ts = getFullTimestamp();
    const caseRef = doc(db, 'expedientes', caseId);
    await updateDoc(caseRef, {
      asignadoA: currentUser.id,
      asignadoANombre: currentUser.name,
      ultimaModificacion: new Date().toISOString()
    });
    await addHistoryEntry(caseId, `Tomé el expediente el ${ts}.`, 'Adquisición');
  };

  const handleRegistrarMovimiento = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingExp || !editingExp.id) return;

    let nuevoEstado = editingExp.instancia as InstanciaId;
    let nuevoAsignado = editingExp.asignadoA || 'buzon';
    let nuevoAsignadoNombre = editingExp.asignadoANombre || 'Buzón Grupal';
    let textoNovedad = "";
    let nuevoDestino = editingExp.destinoExterno || "";

    const ts = getFullTimestamp();

    switch(movData.tipo) {
      case 'Planilla':
        textoNovedad = `Se cargó la planilla de análisis/informe: ${movData.detalle}. Acción realizada el ${ts}.`;
        nuevoEstado = 'analisis'; 
        break;
      case 'Notificacion':
        textoNovedad = `Se notificó al usuario. Detalle: ${movData.detalle}. Acción realizada el ${ts}.`;
        nuevoEstado = 'notificacion';
        break;
      case 'Pase':
        textoNovedad = `PASE AUTOMÁTICO a oficina externa: ${movData.destino}. Motivo: ${movData.detalle}. Movimiento realizado el ${ts}.`;
        nuevoEstado = 'pase'; 
        nuevoAsignado = 'buzon'; 
        nuevoAsignadoNombre = 'Fuera de Oficina';
        nuevoDestino = movData.destino;
        break;
      case 'Guarda':
        textoNovedad = `Expediente enviado a GUARDA TEMPORAL. Motivo: ${movData.detalle}. Acción realizada el ${ts}.`;
        nuevoEstado = 'guarda';
        nuevoAsignado = 'buzon';
        nuevoAsignadoNombre = 'Archivo';
        break;
      case 'Retorno':
        textoNovedad = `Retorno/Re-ingreso a la oficina. Comentario: ${movData.detalle}. Ingresado el ${ts}.`;
        nuevoEstado = 'analisis';
        nuevoAsignado = 'buzon';
        nuevoAsignadoNombre = 'Buzón Grupal';
        break;
      default:
        textoNovedad = `Movimiento: ${movData.detalle}. Registrado el ${ts}.`;
    }

    const caseRef = doc(db, 'expedientes', editingExp.id);
    await updateDoc(caseRef, {
      instancia: nuevoEstado,
      asignadoA: nuevoAsignado,
      asignadoANombre: nuevoAsignadoNombre,
      destinoExterno: nuevoDestino,
      ultimaModificacion: new Date().toISOString()
    });

    await addHistoryEntry(editingExp.id, textoNovedad, movData.tipo);
    setIsMovimientoModalOpen(false);
    setMovData({ tipo: 'Analisis', detalle: '', destino: '' });
  };

  const handleSaveExp = async (e: React.FormEvent) => {
    e.preventDefault();
    const isNew = !editingExp?.id;
    const ts = getFullTimestamp();
    
    const caseData = {
      numero: editingExp?.numero || '',
      empresa: editingExp?.empresa || '',
      plan: editingExp?.plan || '',
      tramite: editingExp?.tramite || 'Renovación',
      ordenanza: editingExp?.ordenanza || '',
      categoria: editingExp?.categoria || '',
      instancia: editingExp?.instancia || 'analisis',
      asignadoA: editingExp?.asignadoA || 'buzon',
      asignadoANombre: editingExp?.asignadoANombre || (editingExp?.asignadoA === 'buzon' ? 'Buzón Grupal' : currentUser.name),
      observaciones: editingExp?.observaciones || '',
      creadoEn: editingExp?.creadoEn || new Date().toISOString(),
      ultimaModificacion: new Date().toISOString(),
      isInternal: true
    };

    if (isNew) {
      // Check duplicate in memory first (faster)
      if (cases.some(c => c.numero.toUpperCase() === caseData.numero.toUpperCase())) {
        alert("¡Error! Este GDE ya existe en el sistema.");
        return;
      }
      const docRef = await addDoc(collection(db, 'expedientes'), caseData);
      await addHistoryEntry(docRef.id, `Carga manual del expediente el ${ts}.`, 'Carga');
    } else {
      const caseRef = doc(db, 'expedientes', editingExp!.id!);
      await updateDoc(caseRef, caseData);
      await addHistoryEntry(editingExp!.id!, `Edición de datos generales realizada el ${ts}.`, 'Edición');
    }

    setIsModalOpen(false);
  };

  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (event) => {
      const text = event.target?.result as string;
      const lines = text.split('\n');
      const ts = getFullTimestamp();
      let imported = 0;
      
      for (const line of lines.slice(1)) {
        const [numero, empresa, tramite, plan, ordenanza, categoria] = line.split(',');
        if (numero && empresa) {
          const numStr = numero.trim();
          if (cases.some(c => c.numero.toUpperCase() === numStr.toUpperCase())) continue;

          const caseData = {
            numero: numStr, empresa: empresa.trim(), tramite: (tramite || 'Renovación').trim(),
            plan: (plan || '').trim(), ordenanza: (ordenanza || '').trim(), categoria: (categoria || '').trim(),
            instancia: 'analisis', asignadoA: 'buzon', asignadoANombre: 'Buzón Grupal',
            observaciones: 'Importado vía archivo.', creadoEn: new Date().toISOString(), 
            ultimaModificacion: new Date().toISOString(), isInternal: true
          };
          const docRef = await addDoc(collection(db, 'expedientes'), caseData);
          await addHistoryEntry(docRef.id, `Importado al buzón grupal el ${ts} desde archivo CSV.`, 'Importación');
          imported++;
        }
      }
      alert(`Importación finalizada: ${imported} registros nuevos.`);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const filteredCases = cases.filter(c => {
    const isGuardaOrPase = c.instancia === 'guarda' || c.instancia === 'pase';
    const matchesTab = 
      (activeTab === 'grupal' && c.asignadoA === 'buzon' && !isGuardaOrPase) ||
      (activeTab === 'individual' && c.asignadoA === currentUser.id && !isGuardaOrPase) ||
      (activeTab === 'usuarios' && c.asignadoA !== 'buzon' && !isGuardaOrPase) ||
      (activeTab === 'guarda' && isGuardaOrPase);
    if (!matchesTab) return false;
    const lower = searchTerm.toLowerCase();
    return c.numero.toLowerCase().includes(lower) || c.empresa.toLowerCase().includes(lower);
  });

  return (
    <div className="flex h-screen w-full bg-background-light dark:bg-background-dark overflow-hidden font-display">
      <Sidebar activePage="expedientes" />
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <main className="flex-1 flex flex-col p-6 overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 shrink-0">
            <div>
              <h1 className="text-slate-900 dark:text-white text-2xl font-black uppercase tracking-tight">Gestión Expedientes Cloud</h1>
              <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-widest">Sincronización en Tiempo Real</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setEditingExp({}); setIsModalOpen(true); }} className="flex items-center gap-2 rounded-lg h-10 px-4 bg-primary text-white text-xs font-black uppercase shadow-sm hover:bg-blue-600 transition-all">
                <span className="material-symbols-outlined text-[18px]">add_circle</span>
                <span>Cargar Manual</span>
              </button>
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 rounded-lg h-10 px-4 bg-teal-600 text-white text-xs font-black uppercase shadow-sm hover:bg-teal-700 transition-all">
                <span className="material-symbols-outlined text-[18px]">upload_file</span>
                <span>Importar CSV</span>
                <input type="file" ref={fileInputRef} className="hidden" accept=".csv" onChange={handleImportCSV} />
              </button>
            </div>
          </div>

          <div className="flex border-b border-slate-200 dark:border-slate-800 mb-6 gap-2 shrink-0">
            {[
              { id: 'grupal', label: 'Buzón Grupal', icon: 'groups', count: cases.filter(c => c.asignadoA === 'buzon' && c.instancia !== 'guarda' && c.instancia !== 'pase').length },
              { id: 'individual', label: 'Mis Tareas', icon: 'person_check', count: cases.filter(c => c.asignadoA === currentUser.id && c.instancia !== 'guarda' && c.instancia !== 'pase').length },
              { id: 'usuarios', label: 'Por Usuario', icon: 'badge', count: cases.filter(c => c.asignadoA !== 'buzon' && c.instancia !== 'guarda' && c.instancia !== 'pase').length },
              { id: 'guarda', label: 'Guarda / Externos', icon: 'inventory_2', count: cases.filter(c => c.instancia === 'guarda' || c.instancia === 'pase').length }
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 px-6 py-3 border-b-2 transition-all text-xs font-black uppercase tracking-widest relative ${activeTab === tab.id ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                {tab.label}
                {tab.count > 0 && <span className="ml-2 bg-slate-900 text-white px-1.5 py-0.5 rounded-full text-[9px] font-bold">{tab.count}</span>}
              </button>
            ))}
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-800 mb-6 shrink-0 shadow-sm">
            <div className="relative flex items-center">
              <span className="absolute left-3 text-slate-400 material-symbols-outlined text-[20px]">search</span>
              <input className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 outline-none focus:ring-1 focus:ring-primary" placeholder="Buscar por GDE o empresa..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10 shadow-sm">
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-500">Instancia</th>
                  <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-500">Nº GDE</th>
                  <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-500">Empresa</th>
                  <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-500">Asignado a</th>
                  <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-500">Últ. Mov</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredCases.length > 0 ? filteredCases.map((c) => {
                  const inst = INSTANCIAS.find(i => i.id === c.instancia) || INSTANCIAS[0];
                  return (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
                      <td className="px-4 py-4"><span className={`inline-block px-2 py-0.5 rounded-full font-black uppercase text-[9px] border ${inst.color}`}>{inst.label}</span></td>
                      <td className="px-4 py-4 font-bold text-slate-700 dark:text-slate-300">
                        <button onClick={() => { setEditingExp(c); setIsHistorialModalOpen(true); }} className="hover:text-primary hover:underline text-left">{c.numero}</button>
                      </td>
                      <td className="px-4 py-4 font-medium">{c.empresa}</td>
                      <td className="px-4 py-4"><span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${c.asignadoA === 'buzon' ? 'bg-slate-100 text-slate-500' : 'bg-blue-100 text-blue-700'}`}>{c.asignadoANombre}</span></td>
                      <td className="px-4 py-4 text-slate-400">{new Date(c.ultimaModificacion).toLocaleDateString()}</td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {activeTab === 'grupal' && <button onClick={() => handleAcquire(c.id)} className="bg-primary hover:bg-blue-600 text-white px-3 py-1.5 rounded flex items-center gap-1.5 transition-all shadow-sm"><span className="material-symbols-outlined text-[16px]">person_add</span><span className="font-bold uppercase text-[9px]">Tomar Tarea</span></button>}
                          {(activeTab === 'individual' || activeTab === 'guarda' || (activeTab === 'usuarios' && (currentUser.role === 'jefe' || c.asignadoA === currentUser.id))) && (
                            <button onClick={() => { setEditingExp(c); setIsMovimientoModalOpen(true); }} className="bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded flex items-center gap-1.5 transition-all shadow-sm"><span className="material-symbols-outlined text-[16px]">sync_alt</span><span className="font-bold uppercase text-[9px]">Movimiento</span></button>
                          )}
                          <button onClick={() => { setEditingExp(c); setIsHistorialModalOpen(true); }} className="text-slate-400 hover:text-primary p-1" title="Ver Historial"><span className="material-symbols-outlined text-[18px]">history</span></button>
                        </div>
                      </td>
                    </tr>
                  );
                }) : <tr><td colSpan={6} className="py-20 text-center text-slate-400 italic font-medium">No hay expedientes activos en esta vista.</td></tr>}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      {/* MODAL HISTORIAL */}
      {isHistorialModalOpen && editingExp && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
             <div className="bg-slate-900 text-white px-6 py-4 border-b flex justify-between items-center">
              <div>
                <h3 className="font-black uppercase text-xs tracking-widest">Historial Cloud</h3>
                <p className="text-[10px] text-slate-400 font-mono mt-1">{editingExp.numero} | {editingExp.empresa}</p>
              </div>
              <button onClick={() => setIsHistorialModalOpen(false)} className="text-slate-400 hover:text-white transition-colors"><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50 dark:bg-slate-900">
               <div className="grid grid-cols-2 gap-4 bg-white dark:bg-slate-800 p-4 rounded-lg border border-slate-200 dark:border-slate-700 mb-2">
                 <div><p className="text-[10px] font-black uppercase text-slate-400 mb-0.5">Ordenanza / Disposición</p><p className="text-xs font-bold text-slate-700 dark:text-white">{editingExp.ordenanza || 'No especificada'}</p></div>
                 <div><p className="text-[10px] font-black uppercase text-slate-400 mb-0.5">Anexo / Categoría</p><p className="text-xs font-bold text-slate-700 dark:text-white">{editingExp.categoria || 'No especificada'}</p></div>
               </div>
              {events.filter(e => e.expedienteId === editingExp.id).length > 0 ? (
                 events.filter(e => e.expedienteId === editingExp.id).sort((a,b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()).map((ev) => (
                    <div key={ev.id} className="relative pl-6 border-l-2 border-slate-200 dark:border-slate-800 pb-2">
                       <div className="absolute -left-[9px] top-0 size-4 rounded-full bg-primary border-2 border-white dark:border-slate-900"></div>
                       <div className="flex justify-between items-start mb-1">
                          <p className="text-[10px] font-black uppercase text-primary tracking-tighter">{ev.usuario}</p>
                          <p className="text-[9px] font-mono text-slate-400">{new Date(ev.fecha).toLocaleString()}</p>
                       </div>
                       <div className="bg-white dark:bg-slate-800 p-3 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm"><p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed">{ev.texto}</p></div>
                    </div>
                  ))
              ) : <div className="text-center py-10 text-slate-400 italic">No hay historial registrado.</div>}
            </div>
          </div>
        </div>
      )}

      {/* MODAL REGISTRAR MOVIMIENTO */}
      {isMovimientoModalOpen && editingExp && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="bg-slate-900 text-white px-6 py-4 border-b flex justify-between items-center">
              <div><h3 className="font-black uppercase text-xs tracking-widest">Nuevo Movimiento</h3><p className="text-[10px] text-slate-400 font-mono mt-1">{editingExp.numero}</p></div>
              <button onClick={() => setIsMovimientoModalOpen(false)} className="text-slate-400 hover:text-white transition-colors"><span className="material-symbols-outlined">close</span></button>
            </div>
            <form onSubmit={handleRegistrarMovimiento} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1 tracking-widest">Acción</label>
                <select className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none" value={movData.tipo} onChange={e => setMovData({...movData, tipo: e.target.value})}>
                  <option value="Analisis">Análisis General / Observación</option>
                  <option value="Notificacion">Notificar al Solicitante</option>
                  <option value="Planilla">Subir Planilla / Informe / Encuesta</option>
                  <option value="Pase">Realizar PASE (Sale de Planes)</option>
                  <option value="Guarda">Enviar a Guarda Temporal</option>
                  <option value="Retorno">Retorno (Vuelve a Planes)</option>
                </select>
              </div>
              {movData.tipo === 'Pase' && (
                <div className="bg-orange-50 dark:bg-orange-950/20 p-3 rounded border border-orange-100 dark:border-orange-800/50">
                  <label className="block text-[10px] font-black uppercase text-orange-600 mb-1">Destino Externo</label>
                  <input required placeholder="Ej: DIBA, DOCO, Inspecciones..." className="w-full px-3 py-2 text-sm border border-orange-200 rounded dark:bg-slate-800 outline-none" value={movData.destino} onChange={e => setMovData({...movData, destino: e.target.value})} />
                </div>
              )}
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1 tracking-widest">Observación</label>
                <textarea required rows={3} className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none focus:ring-2 focus:ring-primary/20" placeholder="Detalle del movimiento..." value={movData.detalle} onChange={e => setMovData({...movData, detalle: e.target.value})} />
              </div>
              <button type="submit" className="w-full py-3 bg-slate-900 text-white text-xs font-black uppercase rounded shadow-xl flex items-center justify-center gap-2 hover:bg-slate-800 transition-all active:scale-[0.98]"><span className="material-symbols-outlined text-[18px]">history_edu</span>Confirmar Movimiento</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CARGA MANUAL */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-800">
             <div className="bg-slate-50 dark:bg-slate-800 px-6 py-4 border-b border-slate-200 flex justify-between items-center"><h3 className="font-black uppercase text-slate-800 dark:text-white text-sm tracking-widest">Expediente Cloud</h3><button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-red-500 transition-colors"><span className="material-symbols-outlined">close</span></button></div>
            <form onSubmit={handleSaveExp} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className="block text-[10px] font-black uppercase text-slate-500 mb-1 tracking-widest">Empresa / Solicitante</label><input required placeholder="Nombre de la firma o particular" className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none focus:ring-1 focus:ring-primary" value={editingExp?.empresa || ''} onChange={e => setEditingExp({...editingExp, empresa: e.target.value})} /></div>
                <div><label className="block text-[10px] font-black uppercase text-slate-500 mb-1 tracking-widest">Nº GDE</label><input required placeholder="EX-20XX-..." className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none focus:ring-1 focus:ring-primary" value={editingExp?.numero || ''} onChange={e => setEditingExp({...editingExp, numero: e.target.value})} /></div>
                <div><label className="block text-[10px] font-black uppercase text-slate-500 mb-1 tracking-widest">Trámite</label><select className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none" value={editingExp?.tramite || 'Renovación'} onChange={e => setEditingExp({...editingExp, tramite: e.target.value})}><option>Inicial</option><option>Convalidación</option><option>Actualización</option><option>Renovación</option><option>Otro</option></select></div>
                <div className="col-span-2 md:col-span-1"><label className="block text-[10px] font-black uppercase text-slate-500 mb-1 tracking-widest">Ordenanza</label><input placeholder="Ord. 123/23" className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none" value={editingExp?.ordenanza || ''} onChange={e => setEditingExp({...editingExp, ordenanza: e.target.value})} /></div>
                <div className="col-span-2 md:col-span-1"><label className="block text-[10px] font-black uppercase text-slate-500 mb-1 tracking-widest">Categoría</label><input placeholder="Cat. A" className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none" value={editingExp?.categoria || ''} onChange={e => setEditingExp({...editingExp, categoria: e.target.value})} /></div>
              </div>
              <button type="submit" className="w-full py-3 bg-primary text-white text-xs font-black uppercase rounded shadow-lg mt-4 hover:bg-blue-600 transition-all active:scale-[0.98]">{editingExp?.id ? 'Actualizar en la Nube' : 'Guardar en la Nube'}</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
