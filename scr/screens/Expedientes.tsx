
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
  deleteDoc
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

type TabId = 'grupal' | 'individual' | 'usuarios' | 'pases' | 'guarda';

export const Expedientes: React.FC = () => {
  const [cases, setCases] = useState<Case[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [activeTab, setActiveTab] = useState<TabId>('grupal');
  const [searchTerm, setSearchTerm] = useState('');
  const [cloudError, setCloudError] = useState<string | null>(null);
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isMovimientoModalOpen, setIsMovimientoModalOpen] = useState(false);
  const [isHistorialModalOpen, setIsHistorialModalOpen] = useState(false);
  
  const [editingExp, setEditingExp] = useState<Partial<Case> | null>(null);
  const [movData, setMovData] = useState({ tipo: 'Planilla', detalle: '', destino: '', isTask: false });

  const currentUser: User = JSON.parse(localStorage.getItem('currentUser') || '{"id":"temp","name":"Usuario","role":"operador"}');

  useEffect(() => {
    const q = query(collection(db, 'expedientes'));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Case));
        setCases(docs);
        setCloudError(null);
      },
      (error) => {
        console.error("Firestore Error:", error);
        setCloudError("Error de Conexión: No se pudo sincronizar.");
      }
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, 'movimientos'));
    const unsubscribe = onSnapshot(q, 
      (snapshot) => {
        const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimelineEvent));
        setEvents(docs);
      }
    );
    return () => unsubscribe();
  }, []);

  const getFullTimestamp = () => {
    const now = new Date();
    return now.toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // Función para calcular días transcurridos
  const getDaysDiff = (dateString: string) => {
    const now = new Date();
    const last = new Date(dateString);
    const diffTime = Math.abs(now.getTime() - last.getTime());
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const addHistoryEntry = async (caseId: string, texto: string, actionType: string, isPending: boolean = false) => {
    try {
      await addDoc(collection(db, 'movimientos'), {
        usuario: currentUser.name,
        fecha: new Date().toISOString(),
        texto,
        expedienteId: caseId,
        tipoAccion: actionType,
        isPending
      });
    } catch (e) {
      console.error(e);
    }
  };

  const handleAcquire = async (caseId: string) => {
    const ts = getFullTimestamp();
    const caseRef = doc(db, 'expedientes', caseId);
    await updateDoc(caseRef, {
      asignadoA: currentUser.id,
      asignadoANombre: currentUser.name,
      ultimaModificacion: new Date().toISOString()
    });
    await addHistoryEntry(caseId, `Tomé el expediente del buzón el ${ts}.`, 'Adquisición');
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Seguro desea eliminar este expediente permanentemente del sistema?")) return;
    try {
      await deleteDoc(doc(db, 'expedientes', id));
      alert("Expediente eliminado correctamente.");
    } catch (e) {
      alert("Error al intentar eliminar.");
    }
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

    if (movData.tipo === 'Tarea') {
      textoNovedad = `[PENDIENTE]: ${movData.detalle}`;
      await addHistoryEntry(editingExp.id, textoNovedad, 'Tarea', true);
    } else {
      switch(movData.tipo) {
        case 'Planilla':
          textoNovedad = `Se cargó planilla de análisis: ${movData.detalle}. ${ts}.`;
          nuevoEstado = 'analisis'; 
          break;
        case 'Notificacion':
          textoNovedad = `Se notificó a empresa. Comentario: ${movData.detalle}. ${ts}.`;
          nuevoEstado = 'notificacion';
          break;
        case 'Pase':
          textoNovedad = `PASE EXTERNO a: ${movData.destino.toUpperCase()}. Motivo: ${movData.detalle}. ${ts}.`;
          nuevoEstado = 'pase'; 
          nuevoAsignado = 'buzon'; 
          nuevoAsignadoNombre = 'Fuera de Oficina';
          nuevoDestino = movData.destino;
          break;
        case 'Guarda':
          textoNovedad = `Enviado a GUARDA TEMPORAL. Motivo: ${movData.detalle}. ${ts}.`;
          nuevoEstado = 'guarda';
          nuevoAsignado = 'buzon';
          nuevoAsignadoNombre = 'Archivo';
          nuevoDestino = "";
          break;
        case 'Retorno':
          textoNovedad = `Retorno a oficina (Ingreso de expediente). ${movData.detalle}. ${ts}.`;
          nuevoEstado = 'analisis';
          nuevoAsignado = 'buzon';
          nuevoAsignadoNombre = 'Buzón Grupal';
          nuevoDestino = "";
          break;
        default:
          textoNovedad = `Movimiento registrado: ${movData.detalle}. ${ts}.`;
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
    }
    
    setIsMovimientoModalOpen(false);
    setMovData({ tipo: 'Planilla', detalle: '', destino: '', isTask: false });
  };

  const handleSaveExp = async (e: React.FormEvent) => {
    e.preventDefault();
    const isNew = !editingExp?.id;
    const ts = getFullTimestamp();
    
    const caseData = {
      numero: (editingExp?.numero || '').trim().toUpperCase(),
      empresa: (editingExp?.empresa || '').trim(),
      plan: editingExp?.plan || '',
      tramite: editingExp?.tramite || 'Iniciación',
      ordenanza: editingExp?.ordenanza || '',
      categoria: editingExp?.categoria || '',
      instancia: editingExp?.instancia || 'analisis',
      asignadoA: isNew ? 'buzon' : (editingExp?.asignadoA || 'buzon'),
      asignadoANombre: isNew ? 'Buzón Grupal' : (editingExp?.asignadoANombre || 'Buzón Grupal'),
      observaciones: editingExp?.observaciones || '',
      creadoEn: editingExp?.creadoEn || new Date().toISOString(),
      ultimaModificacion: new Date().toISOString(),
      isInternal: true
    };

    try {
      if (isNew) {
        if (cases.some(c => c.numero.toUpperCase() === caseData.numero.toUpperCase())) {
          alert("Error: El número de GDE ya existe.");
          return;
        }
        const docRef = await addDoc(collection(db, 'expedientes'), caseData);
        await addHistoryEntry(docRef.id, `Carga manual inicial al buzón grupal. ${ts}.`, 'Carga');
      } else {
        const caseRef = doc(db, 'expedientes', editingExp!.id!);
        await updateDoc(caseRef, caseData);
        await addHistoryEntry(editingExp!.id!, `Edición administrativa de datos generales. ${ts}.`, 'Edición');
      }
      setIsModalOpen(false);
    } catch (err) {
      alert("Error al guardar en la nube.");
    }
  };

  const filteredCases = cases.filter(c => {
    const isGuarda = c.instancia === 'guarda';
    const isPase = c.instancia === 'pase';
    
    const matchesTab = 
      (activeTab === 'grupal' && c.asignadoA === 'buzon' && !isGuarda && !isPase) ||
      (activeTab === 'individual' && c.asignadoA === currentUser.id && !isGuarda && !isPase) ||
      (activeTab === 'usuarios' && c.asignadoA !== 'buzon' && c.asignadoA !== currentUser.id && !isGuarda && !isPase) ||
      (activeTab === 'pases' && isPase) ||
      (activeTab === 'guarda' && isGuarda);

    if (!matchesTab) return false;
    const lower = searchTerm.toLowerCase();
    return c.numero.toLowerCase().includes(lower) || c.empresa.toLowerCase().includes(lower);
  });

  return (
    <div className="flex h-screen w-full bg-background-light dark:bg-background-dark overflow-hidden font-display">
      <Sidebar activePage="expedientes" />
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {cloudError && (
          <div className="bg-red-600 text-white px-6 py-2 text-xs font-black uppercase flex justify-between items-center z-50">
            <span>{cloudError}</span>
            <button onClick={() => window.location.reload()} className="underline">Reintentar conexión</button>
          </div>
        )}
        <main className="flex-1 flex flex-col p-6 overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 shrink-0">
            <div>
              <h1 className="text-slate-900 dark:text-white text-2xl font-black uppercase tracking-tight">Expedientes Cloud</h1>
              <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-widest text-primary italic">Sábana Informativa DPAM</p>
            </div>
            <button onClick={() => { setEditingExp({ tramite: 'Iniciación' }); setIsModalOpen(true); }} className="flex items-center gap-2 rounded-lg h-10 px-4 bg-primary text-white text-xs font-black uppercase shadow-lg hover:bg-blue-600 transition-all">
              <span className="material-symbols-outlined text-[18px]">add_circle</span>
              <span>Nuevo GDE</span>
            </button>
          </div>

          <div className="flex border-b border-slate-200 dark:border-slate-800 mb-6 gap-2 shrink-0 overflow-x-auto no-scrollbar">
            {[
              { id: 'grupal', label: 'Buzón Grupal', icon: 'groups' },
              { id: 'individual', label: 'Mis Tareas', icon: 'person_check' },
              { id: 'usuarios', label: 'Por Usuario', icon: 'badge' },
              { id: 'pases', label: 'Pases Externos', icon: 'outbound' },
              { id: 'guarda', label: 'Guarda Temporal', icon: 'archive' }
            ].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id as TabId)} className={`flex items-center gap-2 px-4 py-3 border-b-2 transition-all text-[10px] font-black uppercase tracking-widest whitespace-nowrap ${activeTab === tab.id ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-slate-400 hover:text-slate-600'}`}>
                <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                {tab.label}
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
                  <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-500">Estado</th>
                  <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-500">Nº GDE</th>
                  <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-500">Empresa / Trámite / Marco Legal</th>
                  <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-500">Asignado</th>
                  <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-500">Antigüedad</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredCases.length > 0 ? filteredCases.map((c) => {
                  const inst = INSTANCIAS.find(i => i.id === c.instancia) || INSTANCIAS[0];
                  const isOwner = c.asignadoA === currentUser.id;
                  const role = (currentUser.role || '').toLowerCase();
                  const isJefe = role === 'jefe' || role === 'admin';
                  const isBuzon = c.asignadoA === 'buzon';
                  const isPase = c.instancia === 'pase';
                  const isGuarda = c.instancia === 'guarda';
                  
                  const canMove = isOwner || isBuzon || isJefe;
                  const canAdmin = isJefe;
                  
                  // Lógica del contador de días
                  const daysDiff = getDaysDiff(c.ultimaModificacion);
                  let daysColor = "text-slate-400";
                  let daysLabel = "";

                  if (isPase || isGuarda) {
                    daysColor = "text-slate-300"; // Neutral para expedientes fuera de gestión activa
                    daysLabel = isPase ? "Fuera de Oficina" : "En Archivo";
                  } else {
                    if (daysDiff > 20) daysColor = "text-red-500 font-bold";
                    else if (daysDiff > 10) daysColor = "text-yellow-600 font-bold";
                    else daysColor = "text-green-600 font-bold";
                    daysLabel = daysDiff === 0 ? 'Hoy' : `Hace ${daysDiff} días`;
                  }

                  return (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-4 py-4"><span className={`inline-block px-2 py-0.5 rounded-full font-black uppercase text-[9px] border ${inst.color}`}>{inst.label}</span></td>
                      <td className="px-4 py-4 font-bold text-slate-700 dark:text-slate-300">
                        <button onClick={() => { setEditingExp(c); setIsHistorialModalOpen(true); }} className="hover:text-primary hover:underline text-left uppercase">{c.numero}</button>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-0.5">
                          <span className="font-black text-slate-900 dark:text-white uppercase tracking-tighter text-[11px] leading-tight">{c.empresa}</span>
                          <span className="text-[9px] text-slate-500 font-bold uppercase leading-none italic">
                            {c.tramite} {c.ordenanza ? ` | ORD: ${c.ordenanza}` : ''} {c.categoria ? ` | ANEXO: ${c.categoria}` : ''}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        {isPase ? (
                           <span className="bg-orange-50 text-orange-700 px-2 py-1 rounded text-[9px] font-black uppercase border border-orange-100">PASE: {c.destinoExterno || 'S/D'}</span>
                        ) : (
                          <span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${isBuzon ? 'bg-slate-100 text-slate-500' : 'bg-blue-100 text-blue-700'}`}>{c.asignadoANombre}</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col">
                          <span className={`text-[10px] uppercase ${daysColor}`}>{daysLabel}</span>
                          <span className="text-[9px] text-slate-400">{new Date(c.ultimaModificacion).toLocaleDateString()}</span>
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <div className="flex justify-end gap-2">
                          {isBuzon && !isPase && !isGuarda && <button onClick={() => handleAcquire(c.id)} className="bg-primary hover:bg-blue-600 text-white px-2 py-1.5 rounded flex items-center gap-1.5 shadow-sm transition-all"><span className="material-symbols-outlined text-[16px]">person_add</span><span className="font-bold uppercase text-[9px]">Tomar</span></button>}
                          {canMove && <button onClick={() => { setEditingExp(c); setIsMovimientoModalOpen(true); }} className="bg-slate-800 hover:bg-slate-700 text-white px-2 py-1.5 rounded flex items-center gap-1.5 shadow-sm transition-all"><span className="material-symbols-outlined text-[16px]">sync_alt</span><span className="font-bold uppercase text-[9px]">Actividad / Tarea</span></button>}
                          
                          {canAdmin && (
                            <div className="flex gap-1 border-l pl-2 border-slate-200 dark:border-slate-700">
                              <button onClick={() => { setEditingExp(c); setIsModalOpen(true); }} className="text-slate-400 hover:text-primary p-1"><span className="material-symbols-outlined text-[18px]">edit_note</span></button>
                              <button onClick={() => handleDelete(c.id!)} className="text-slate-400 hover:text-red-500 p-1"><span className="material-symbols-outlined text-[18px]">delete_forever</span></button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                }) : <tr><td colSpan={6} className="py-20 text-center text-slate-400 italic">No hay expedientes cargados.</td></tr>}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      {/* MODAL EDICIÓN/CARGA */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
              <span className="text-xs font-black uppercase tracking-widest">{editingExp?.id ? 'Edición Administrativa' : 'Carga de Expediente'}</span>
              <button onClick={() => setIsModalOpen(false)}><span className="material-symbols-outlined">close</span></button>
            </div>
            <form onSubmit={handleSaveExp} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="col-span-2 md:col-span-1">
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Número de GDE</label>
                <input required className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none focus:ring-1 focus:ring-primary uppercase" value={editingExp?.numero || ''} onChange={e => setEditingExp({...editingExp, numero: e.target.value})} placeholder="EX-202X-..." />
              </div>
              <div className="col-span-2 md:col-span-1">
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Empresa / Titular</label>
                <input required className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none focus:ring-1 focus:ring-primary uppercase" value={editingExp?.empresa || ''} onChange={e => setEditingExp({...editingExp, empresa: e.target.value})} />
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Trámite</label>
                <select className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none" value={editingExp?.tramite || 'Iniciación'} onChange={e => setEditingExp({...editingExp, tramite: e.target.value})}>
                  <option value="Iniciación">Iniciación</option>
                  <option value="Renovación">Renovación</option>
                  <option value="Convalidación anual">Convalidación anual</option>
                  <option value="Actualización">Actualización</option>
                  <option value="Convalidación/Actualización">Convalidación/Actualización</option>
                  <option value="Cambio de Categoria">Cambio de Categoria</option>
                  <option value="Otros">Otros</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Ordenanza</label>
                <input className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none" value={editingExp?.ordenanza || ''} onChange={e => setEditingExp({...editingExp, ordenanza: e.target.value})} placeholder="Ej: 125/20..." />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Anexo / Categoría</label>
                <input className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none" value={editingExp?.categoria || ''} onChange={e => setEditingExp({...editingExp, categoria: e.target.value})} placeholder="Ej: II" />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Observaciones Iniciales</label>
                <textarea className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none h-20" value={editingExp?.observaciones || ''} onChange={e => setEditingExp({...editingExp, observaciones: e.target.value})}></textarea>
              </div>
              <button type="submit" className="col-span-2 py-3 bg-primary text-white text-xs font-black uppercase rounded shadow-lg hover:bg-blue-600 transition-all">Sincronizar Datos</button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL MOVIMIENTOS Y TAREAS */}
      {isMovimientoModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="bg-slate-800 text-white px-6 py-4 flex justify-between items-center">
              <span className="text-xs font-black uppercase tracking-widest">Registrar Actividad</span>
              <button onClick={() => setIsMovimientoModalOpen(false)}><span className="material-symbols-outlined">close</span></button>
            </div>
            <form onSubmit={handleRegistrarMovimiento} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Tipo de Actividad</label>
                <select className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none font-bold" value={movData.tipo} onChange={e => setMovData({...movData, tipo: e.target.value})}>
                  <optgroup label="Seguimiento / Pendientes">
                    <option value="Tarea">⚠️ Crear Tarea Pendiente</option>
                  </optgroup>
                  <optgroup label="Movimientos de Estado">
                    <option value="Planilla">Carga de Planilla</option>
                    <option value="Notificacion">Notificar Empresa</option>
                    <option value="Pase">Pase a Otra Oficina</option>
                    <option value="Guarda">Guarda Temporal</option>
                    <option value="Retorno">Retorno (Vuelta a DPAM)</option>
                  </optgroup>
                </select>
              </div>
              {movData.tipo === 'Pase' && (
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Oficina de Destino</label>
                  <input required placeholder="Ej: Legales, Catastro, etc." className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase" value={movData.destino} onChange={e => setMovData({...movData, destino: e.target.value})} />
                </div>
              )}
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Detalle / Nota</label>
                <textarea required className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none h-24" value={movData.detalle} onChange={e => setMovData({...movData, detalle: e.target.value})} placeholder={movData.tipo === 'Tarea' ? "Qué queda pendiente por hacer?" : "Breve explicación..."}></textarea>
              </div>
              <button type="submit" className={`w-full py-3 ${movData.tipo === 'Tarea' ? 'bg-orange-600' : 'bg-slate-900'} text-white text-xs font-black uppercase rounded shadow-lg transition-all`}>
                {movData.tipo === 'Tarea' ? 'Crear Tarea Pendiente' : 'Confirmar Actividad'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL HISTORIAL */}
      {isHistorialModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col">
            <div className="bg-primary text-white px-6 py-4 flex justify-between items-center flex-shrink-0">
              <span className="text-xs font-black uppercase tracking-widest">Cronología: {editingExp?.numero}</span>
              <button onClick={() => setIsHistorialModalOpen(false)}><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {events.filter(e => e.expedienteId === editingExp?.id).sort((a,b) => b.fecha.localeCompare(a.fecha)).map((e, idx) => (
                <div key={idx} className={`relative pl-6 border-l-2 ${e.isPending ? 'border-orange-500' : 'border-slate-200 dark:border-slate-800'}`}>
                  <div className={`absolute -left-[9px] top-0 size-4 rounded-full bg-white dark:bg-slate-900 border-2 ${e.isPending ? 'border-orange-500 animate-pulse' : 'border-primary'}`}></div>
                  <div className="flex justify-between items-start mb-1">
                    <span className={`text-[10px] font-black uppercase ${e.isPending ? 'text-orange-600' : 'text-primary'}`}>
                      {e.isPending ? 'PENDIENTE' : (e.tipoAccion || 'HISTORIAL')}
                    </span>
                    <span className="text-[10px] font-mono text-slate-400">{new Date(e.fecha).toLocaleString()}</span>
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 mb-1 font-medium">{e.texto}</p>
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Por: {e.usuario}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
