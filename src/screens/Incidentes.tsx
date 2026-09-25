import React, { useState, useEffect } from 'react';
import { Sidebar } from '../components/Sidebar';
import { db } from '../firebase';
import { collection, onSnapshot, query, addDoc, updateDoc, deleteDoc, doc, orderBy } from 'firebase/firestore';
import { useNavigate } from 'react-router-dom';
import { IncidenteDerrame, User, PlanEmergencia } from '../types';

export const Incidentes: React.FC = () => {
  const navigate = useNavigate();
  const [incidentes, setIncidentes] = useState<IncidenteDerrame[]>([]);
  const [planes, setPlanes] = useState<PlanEmergencia[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInc, setEditingInc] = useState<Partial<IncidenteDerrame>>({});

  const currentUser: User = JSON.parse(localStorage.getItem('currentUser') || '{"id":"temp","name":"Usuario","role":"operador"}');
  const role = (currentUser.role || '').toLowerCase();
  const isSuperior = role === 'superior';

  useEffect(() => {
    const q = query(collection(db, 'incidentes'), orderBy('fecha', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setIncidentes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as IncidenteDerrame)));
    });

    const qPlanes = query(collection(db, 'planes'));
    const unsubPlanes = onSnapshot(qPlanes, (snapshot) => {
      setPlanes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PlanEmergencia)));
    });

    return () => {
      unsub();
      unsubPlanes();
    };
  }, []);

  const handleSave = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!editingInc.fecha || !editingInc.ubicacion || !editingInc.jurisdiccion) return;

      const dateObj = new Date(editingInc.fecha + 'T00:00:00');
      const mes = `${dateObj.getFullYear()}-${(dateObj.getMonth() + 1).toString().padStart(2, '0')}`;
      const anio = dateObj.getFullYear();

      // Ensure that if it's evaluated as no spill, reset spill fields
      const dataToSave = {
          ...editingInc,
          mes,
          anio,
          fechaRegistro: editingInc.fechaRegistro || new Date().toISOString(),
          registradoPor: editingInc.registradoPor || currentUser.name,
      };

      try {
          if (editingInc.id) {
              await updateDoc(doc(db, 'incidentes', editingInc.id), dataToSave);
          } else {
              await addDoc(collection(db, 'incidentes'), dataToSave);
          }
          setIsModalOpen(false);
      } catch(e) {
          console.error(e);
          alert('Error al guardar el incidente');
      }
  };

  const handleDelete = async (id: string) => {
      if(!confirm("¿Eliminar este registro?")) return;
      await deleteDoc(doc(db, 'incidentes', id));
  };

  const kpiActivos = incidentes.filter(i => i.estado === 'en_curso').length;
  // Volume estimate only factors cases with actual spill
  const volTotal = incidentes.reduce((acc, curr) => acc + (curr.volumenEstimado || 0), 0);

  return (
    <div className="flex h-screen w-full bg-background-light dark:bg-background-dark">
      <Sidebar activePage="incidentes" />
      <main className="flex-1 flex flex-col h-full overflow-y-auto">
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-8 py-5 flex justify-between items-center shrink-0 z-10">
          <div>
            <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Registro de Incidentes y Activaciones</h1>
            <p className="text-sm font-bold text-slate-500 mt-1 uppercase tracking-widest">
              Activaciones del PLANACON y Siniestros
            </p>
          </div>
          <div className="flex gap-3 items-center">
             <button onClick={() => navigate('/mapa', { state: { showIncidentes: true } })} className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-colors shadow-sm">
               <span className="material-symbols-outlined text-[18px]">map</span>
               Ver en SIG
             </button>
             {!isSuperior && (
                <button onClick={() => { 
                   setEditingInc({ 
                       fecha: new Date().toISOString().split('T')[0], 
                       estadoPlanacon: 'alerta',
                       origenConocido: false,
                       productoTipo: 'hidrocarburo', 
                       unidadMedida: 'm3', 
                       estado: 'en_curso' 
                   }); 
                   setIsModalOpen(true); 
                }} className="flex items-center gap-2 bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-colors shadow-sm">
                  <span className="material-symbols-outlined text-[18px]">warning</span>
                  Registrar Activación
                </button>
             )}
          </div>
        </header>

        <div className="p-8 pb-32">
           <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
             <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-red-200 dark:border-red-900/30 shadow-sm border-l-4 border-l-red-500 flex flex-col items-center">
                <span className="text-3xl font-black text-red-600 dark:text-red-400">{kpiActivos}</span>
                <span className="text-[10px] font-bold uppercase text-red-600/70 tracking-wider">Eventos en Curso</span>
             </div>
             <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center">
                <span className="text-3xl font-black text-slate-900 dark:text-white">{incidentes.length}</span>
                <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Activaciones Históricas</span>
             </div>
             <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center">
                 <span className="text-3xl font-black text-slate-900 dark:text-white">{incidentes.filter(i => i.anio === new Date().getFullYear()).length}</span>
                 <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Activaciones Año Actual</span>
             </div>
             <div className="bg-primary/10 p-4 rounded-xl border border-primary/20 shadow-sm flex flex-col items-center">
                 <span className="text-3xl font-black text-primary flex items-center gap-1">~{volTotal.toLocaleString()}</span>
                 <span className="text-[10px] font-bold uppercase text-primary/70 tracking-wider">Volumen Derramado (m3/l)</span>
             </div>
           </div>

           <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
               <table className="w-full text-left border-collapse text-xs">
                 <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                    <tr>
                       <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-500 w-24">Fecha</th>
                       <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-500">Ubicación / Nro MOI</th>
                       <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-500">Planacon / Origen</th>
                       <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-500">Derrame / Volumen</th>
                       <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-500">Estado Local</th>
                       <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-500 text-right">Acciones</th>
                    </tr>
                 </thead>
                 <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {incidentes.length > 0 ? incidentes.map(inc => (
                        <tr key={inc.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                           <td className="px-4 py-4 font-mono font-bold text-slate-500">{inc.fecha.split('-').reverse().join('/')}</td>
                           <td className="px-4 py-4">
                              <p className="font-black text-slate-900 dark:text-white uppercase text-sm">{inc.ubicacion}</p>
                              <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">MOI: <span className="text-slate-700 dark:text-slate-300">{inc.moi || 'N/A'}</span> / JUR: <span className="text-slate-700 dark:text-slate-300">{inc.jurisdiccion}</span></p>
                           </td>
                           <td className="px-4 py-4">
                              <span className={`text-[9px] px-2 py-0.5 rounded font-black uppercase tracking-widest 
                                ${inc.estadoPlanacon === 'alerta' ? 'bg-yellow-100 text-yellow-700' : inc.estadoPlanacon === 'evaluacion' ? 'bg-orange-100 text-orange-700' : 'bg-red-100 text-red-700'}`}>
                                 PLANACON: {(inc.estadoPlanacon || '').replace('_', ' ')}
                              </span>
                              <div className="mt-1 text-[10px] uppercase font-bold text-slate-500 leading-tight">
                                Origen: {inc.origenConocido ? <span className="text-indigo-600 dark:text-indigo-400">{inc.origenTipo} {inc.origenNombre ? `- ${inc.origenNombre}` : ''}</span> : <span className="text-slate-400">DESCONOCIDO</span>}
                              </div>
                           </td>
                           <td className="px-4 py-4">
                              {inc.estadoPlanacon === 'derrame_efectivo' && (
                                <>
                                  <span className="font-black text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded uppercase text-[10px] mr-2">
                                      {inc.volumenEstimado} {inc.unidadMedida}
                                  </span>
                                  <div className="mt-1">
                                    <span className="text-[10px] font-bold text-slate-600 dark:text-slate-300 uppercase">{inc.productoTipo?.replace('_', ' ')}</span>
                                    {inc.productoNombre && <span className="text-[9px] text-slate-400 ml-1">({inc.productoNombre})</span>}
                                  </div>
                                </>
                              )}
                              {inc.estadoPlanacon !== 'derrame_efectivo' && (
                                <span className="text-[10px] text-slate-400 italic">No confirmado</span>
                              )}
                           </td>
                           <td className="px-4 py-4">
                              <span className={`text-[9px] px-2 py-0.5 rounded font-black uppercase tracking-widest 
                                ${inc.estado === 'en_curso' ? 'bg-red-100 text-red-700' : 
                                  inc.estado === 'controlado' ? 'bg-orange-100 text-orange-700' : 
                                  inc.estado === 'remediado' ? 'bg-emerald-100 text-emerald-700' :
                                  inc.estado === 'falsa_alarma' ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-700'
                                 }`}>
                                  {(inc.estado || '').replace('_', ' ')}
                              </span>
                           </td>
                           <td className="px-4 py-4 text-right">
                              {!isSuperior && (
                                <>
                                  <button onClick={() => { setEditingInc(inc); setIsModalOpen(true); }} className="text-slate-400 hover:text-primary p-1"><span className="material-symbols-outlined text-[18px]">edit_note</span></button>
                                  <button onClick={() => handleDelete(inc.id)} className="text-slate-400 hover:text-red-500 p-1"><span className="material-symbols-outlined text-[18px]">delete_forever</span></button>
                                </>
                              )}
                           </td>
                        </tr>
                    )) : (
                        <tr><td colSpan={6} className="py-20 text-center text-slate-400 italic">No hay registros de PLANACON disponibles.</td></tr>
                    )}
                 </tbody>
               </table>
           </div>
        </div>
      </main>

      {/* Modal Edición Incidente / PLANACON */}
      {isModalOpen && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
               <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
                  <span className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                     <span className="material-symbols-outlined text-[18px]">warning</span>
                     {editingInc.id ? 'Editar Activación PLANACON' : 'Registrar Activación PLANACON'}
                  </span>
                  <button type="button" onClick={() => setIsModalOpen(false)}><span className="material-symbols-outlined">close</span></button>
               </div>

               <form onSubmit={handleSave} className="p-6 overflow-y-auto space-y-6">
                    {/* SECCIÓN 1: DATOS DEL SUCESO */}
                    <div>
                        <h3 className="text-[10px] font-black uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-2 mb-3">1. Datos Iniciales y Ubicación</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">PNA: Mensaje Oficial Interno</label>
                                <input required type="text" className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase font-bold" value={editingInc.moi || ''} onChange={e => setEditingInc({...editingInc, moi: e.target.value})} placeholder="Ej: MOI 123/24" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Fecha del Suceso</label>
                                <input required type="date" className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase font-bold" value={editingInc.fecha || ''} onChange={e => setEditingInc({...editingInc, fecha: e.target.value})} />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Jurisdicción (PNA)</label>
                                <input required type="text" className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase" value={editingInc.jurisdiccion || ''} onChange={e => setEditingInc({...editingInc, jurisdiccion: e.target.value})} placeholder="Ej: PREFECTURA DOCK SUD" />
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="col-span-1 md:col-span-2">
                                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Ubicación / Reseña del lugar</label>
                                <input required type="text" className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase" value={editingInc.ubicacion || ''} onChange={e => setEditingInc({...editingInc, ubicacion: e.target.value})} placeholder="Ej: TERMINAL SITIO 2" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Latitud (Opcional)</label>
                                <input type="number" step="any" className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase" value={editingInc.latitud || ''} onChange={e => setEditingInc({...editingInc, latitud: Number(e.target.value) || undefined})} placeholder="Ej: -34.6190" />
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Longitud (Opcional)</label>
                                <input type="number" step="any" className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase" value={editingInc.longitud || ''} onChange={e => setEditingInc({...editingInc, longitud: Number(e.target.value) || undefined})} placeholder="Ej: -58.3639" />
                            </div>
                        </div>
                    </div>

                    {/* SECCIÓN 2: PLANACON Y ORIGEN */}
                    <div>
                        <h3 className="text-[10px] font-black uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-2 mb-3">2. Nivel PLANACON y Origen</h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Fase PLANACON Nacional/Local</label>
                                <select className="w-full px-3 py-2 text-sm border rounded bg-yellow-50 dark:bg-slate-800 dark:border-slate-700 outline-none uppercase font-black text-slate-800 dark:text-white" value={editingInc.estadoPlanacon || 'alerta'} onChange={e => setEditingInc({...editingInc, estadoPlanacon: e.target.value as any})}>
                                   <option value="alerta">ALERTA (Activación Preventiva)</option>
                                   <option value="evaluacion">EVALUACIÓN (Constatación in-situ)</option>
                                   <option value="derrame_efectivo">DERRAME EFECTIVO (Operaciones)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Origen del Evento</label>
                                <div className="flex bg-slate-100 dark:bg-slate-800 rounded p-1">
                                    <button
                                      type="button"
                                      className={`flex-1 text-xs font-black uppercase py-1.5 rounded transition ${editingInc.origenConocido ? 'bg-white dark:bg-slate-700 shadow text-primary' : 'text-slate-500'}`}
                                      onClick={() => setEditingInc({...editingInc, origenConocido: true, origenTipo: 'empresa'})}
                                    >Conocido</button>
                                    <button
                                      type="button"
                                      className={`flex-1 text-xs font-black uppercase py-1.5 rounded transition ${!editingInc.origenConocido ? 'bg-white dark:bg-slate-700 shadow text-slate-800' : 'text-slate-500'}`}
                                      onClick={() => setEditingInc({...editingInc, origenConocido: false, origenTipo: undefined, origenNombre: '', planVinculadoId: ''})}
                                    >Desconocido</button>
                                </div>
                            </div>
                        </div>

                        {editingInc.origenConocido && (
                           <div className="bg-slate-50 dark:bg-slate-800/40 p-4 border border-slate-200 dark:border-slate-700 rounded-xl space-y-4">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Tipo de Origen</label>
                                        <select className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase font-bold" value={editingInc.origenTipo || 'empresa'} onChange={e => setEditingInc({...editingInc, origenTipo: e.target.value as any})}>
                                           <option value="empresa">Empresa / Instalación</option>
                                           <option value="buque">Buque / Artefacto Naval</option>
                                           <option value="otro">Otro Tercero</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Vincular con Registro de Plan</label>
                                        <select className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase" value={editingInc.planVinculadoId || ''} onChange={e => {
                                            const plan = planes.find(p => p.id === e.target.value);
                                            setEditingInc({
                                                ...editingInc, 
                                                planVinculadoId: e.target.value,
                                                origenNombre: plan ? plan.empresa : editingInc.origenNombre
                                            });
                                        }}>
                                           <option value="">No vinculado (Ingresar Manual)</option>
                                           {planes.map(p => (
                                               <option key={p.id} value={p.id}>{p.empresa} {p.instalacion ? `- ${p.instalacion}` : ''}</option>
                                           ))}
                                        </select>
                                    </div>
                                </div>
                                {!editingInc.planVinculadoId && (
                                    <div>
                                        <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Nombre Entidad (Si no está registrada)</label>
                                        <input type="text" className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase" value={editingInc.origenNombre || ''} onChange={e => setEditingInc({...editingInc, origenNombre: e.target.value})} placeholder="Ej: NAVIERA SUDAMERICANA..." />
                                    </div>
                                )}
                           </div>
                        )}
                    </div>

                    {/* SECCIÓN 3: DETALLE DEL DERRAME */}
                    {editingInc.estadoPlanacon === 'derrame_efectivo' && (
                        <div className="bg-red-50 dark:bg-red-900/10 p-4 border border-red-200 dark:border-red-900/30 rounded-xl">
                            <h3 className="text-[10px] font-black uppercase text-red-600 dark:text-red-400 mb-3">3. Declaración de Derrame Efectivo</h3>
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Tipo Producto</label>
                                    <select className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase font-bold" value={editingInc.productoTipo || 'hidrocarburo'} onChange={e => setEditingInc({...editingInc, productoTipo: e.target.value as any})}>
                                       <option value="hidrocarburo">Hidrocarburo</option>
                                       <option value="quimico">Químico</option>
                                       <option value="agua_produccion">Agua Prod.</option>
                                       <option value="otro">Otro</option>
                                    </select>
                                </div>
                                <div className="col-span-2">
                                     <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Nombre / Variedad</label>
                                     <input type="text" className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase" value={editingInc.productoNombre || ''} onChange={e => setEditingInc({...editingInc, productoNombre: e.target.value})} placeholder="Ej: IFO 380, Gasoil..." />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Unidad</label>
                                    <select className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase font-bold" value={editingInc.unidadMedida || 'm3'} onChange={e => setEditingInc({...editingInc, unidadMedida: e.target.value as any})}>
                                       <option value="m3">M3</option>
                                       <option value="litros">Litros</option>
                                    </select>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-red-600 dark:text-red-400 mb-1">Volumen Volcado</label>
                                    <input required type="number" step="0.01" min="0" className="w-full px-3 py-2 text-xl font-black text-red-600 bg-white border border-red-200 rounded dark:bg-red-900/20 dark:border-red-900 outline-none" value={editingInc.volumenEstimado || ''} onChange={e => setEditingInc({...editingInc, volumenEstimado: Number(e.target.value)})} placeholder="0" />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">OSRO Operativa</label>
                                    <input type="text" className="w-full px-3 py-2 text-sm border rounded bg-white dark:bg-slate-800 dark:border-slate-700 outline-none uppercase" value={editingInc.empresaSanamiento || ''} onChange={e => setEditingInc({...editingInc, empresaSanamiento: e.target.value})} placeholder="Empresa Saneamiento" />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* SECCIÓN 4: ESTADO LOCAL Y CIERRE */}
                    <div>
                        <h3 className="text-[10px] font-black uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800 pb-2 mb-3">Resolución y Estado del Expediente Local</h3>
                        
                        <div className="mb-4">
                            <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Estado Operativo Local</label>
                            <select className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase font-black" value={editingInc.estado || 'en_curso'} onChange={e => setEditingInc({...editingInc, estado: e.target.value as any})}>
                               <option value="en_curso">REPORTE INICIAL / EN CURSO</option>
                               <option value="controlado">DERRAME CONTROLADO</option>
                               <option value="remediado">ZONA REMEDIADA / SUBSANADO</option>
                               <option value="falsa_alarma">FALSA ALARMA / NO HUBO DERRAME</option>
                               <option value="finalizado">CASO CERRADO (Admin.)</option>
                            </select>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Observaciones Preventivas</label>
                                <textarea className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none" rows={3} value={editingInc.observaciones || ''} onChange={e => setEditingInc({...editingInc, observaciones: e.target.value})} placeholder="Detalles de afectación inicial, reportes de vuelos/navegación..."></textarea>
                            </div>
                            <div>
                                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Resultado y Finalización</label>
                                <textarea className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none" rows={3} value={editingInc.resultadoFinalizacion || ''} onChange={e => setEditingInc({...editingInc, resultadoFinalizacion: e.target.value})} placeholder="Cómo finalizó, sumarios, disposiciones aplicadas..."></textarea>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end gap-3 mt-4 border-t border-slate-100 dark:border-slate-800">
                        <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2 text-xs font-black uppercase rounded text-slate-600 hover:bg-slate-100 transition-colors">Cancelar</button>
                        <button type="submit" className="px-6 py-2 bg-primary text-white text-xs font-black uppercase rounded shadow-lg hover:bg-blue-600 transition-colors">Guardar Registro</button>
                    </div>
               </form>
            </div>
         </div>
      )}
    </div>
  );
};

