import React, { useState, useEffect, useMemo } from 'react';
import { Sidebar } from '../components/Sidebar';
import { db } from '../firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc,
  updateDoc,
  deleteDoc,
  doc, 
  orderBy, 
  query 
} from 'firebase/firestore';
import { User, Case, Tarea, TareaPrioridad } from '../types';

export const LAP: React.FC = () => {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  
  const [filterUser, setFilterUser] = useState<string>('todos');
  const [filterPriority, setFilterPriority] = useState<string>('todas');
  const [filterStatus, setFilterStatus] = useState<'pendientes' | 'completadas' | 'todas'>('pendientes');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTarea, setEditingTarea] = useState<Partial<Tarea> | null>(null);

  const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{"id":"temp","name":"Usuario"}');

  useEffect(() => {
    const q = query(collection(db, 'tareas'), orderBy('fechaRegistro', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setTareas(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Tarea)));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'usuarios'), (snapshot) => {
      setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'expedientes'), (snapshot) => {
      setCases(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Case)));
    });
    return () => unsub();
  }, []);

  // Calcular carga de trabajo
  const userWorkloads = useMemo(() => {
    return users.map(user => {
      const activeCases = cases.filter(c => c.asignadoA === user.id && c.instancia !== 'guarda').length;
      const activeTareas = tareas.filter(t => t.usuarioAsignado === user.id && t.avance < 1).length;
      return {
        ...user,
        activeCases,
        activeTareas,
        totalOpen: activeCases + activeTareas
      };
    }).sort((a, b) => b.totalOpen - a.totalOpen);
  }, [users, cases, tareas]);

  const filteredTareas = useMemo(() => {
    return tareas.filter(t => {
        if (filterUser !== 'todos' && t.usuarioAsignado !== filterUser) return false;
        if (filterPriority !== 'todas' && t.prioridad !== filterPriority) return false;
        if (filterStatus === 'pendientes' && t.avance === 1) return false;
        if (filterStatus === 'completadas' && t.avance !== 1) return false;
        return true;
    });
  }, [tareas, filterUser, filterPriority, filterStatus]);

  const handleSaveTarea = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTarea?.accion || !editingTarea.fechaInicio || !editingTarea.prioridad || !editingTarea.usuarioAsignado) {
       alert('Complete los campos obligatorios');
       return;
    }

    const avance = editingTarea.avance !== undefined ? Number(editingTarea.avance) : 0;
    const isCompleted = avance === 1;

    const dataAguardar: any = {
      ...editingTarea,
      avance,
      fechaCierre: isCompleted ? (editingTarea.fechaCierre || new Date().toISOString().split('T')[0]) : null,
      fechaRegistro: editingTarea.fechaRegistro || new Date().toISOString()
    };

    if (!dataAguardar.registradoPor) dataAguardar.registradoPor = currentUser.username;

    if (editingTarea.id && editingTarea.id.length > 5) { // Ya existe (hack rápido para auto ids)
      // Update
      const ref = doc(db, 'tareas', editingTarea.id);
      await updateDoc(ref, dataAguardar);
    } else {
      // Create
      await addDoc(collection(db, 'tareas'), dataAguardar);
    }
    
    setIsModalOpen(false);
    setEditingTarea(null);
  };

  const handleDelete = async (id: string) => {
    if (confirm("¿Seguro que desea eliminar esta acción permanentemente?")) {
      await deleteDoc(doc(db, 'tareas', id));
    }
  };

  const getPriorityColor = (prioridad: TareaPrioridad) => {
    switch(prioridad) {
      case 'baja': return 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700';
      case 'media': return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300 dark:border-blue-800';
      case 'alta': return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800';
      case 'urgente': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="flex h-screen w-full bg-background-light dark:bg-background-dark font-display overflow-hidden">
      <Sidebar activePage="lap" />
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* Cabecera */}
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
          <div>
            <h1 className="text-slate-900 dark:text-white text-2xl font-black uppercase tracking-tight">L.A.P.</h1>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-widest text-primary italic">Listado de Actividades Pendientes</p>
          </div>
          <button 
            onClick={() => {
              setEditingTarea({
                fechaInicio: new Date().toISOString().split('T')[0],
                avance: 0,
                prioridad: 'media'
              });
              setIsModalOpen(true);
            }} 
            className="flex items-center gap-2 rounded-lg h-10 px-4 bg-primary text-white text-xs font-black uppercase shadow-lg hover:bg-blue-600 transition-all whitespace-nowrap"
          >
            <span className="material-symbols-outlined text-[18px]">add_task</span>
            <span>Nueva Actividad</span>
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Panel de Resumen de Carga de Trabajo */}
          <section>
            <h2 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">equalizer</span> Balance de Carga Operativa
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              {userWorkloads.map(u => (
                <div key={u.id} className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between hover:border-primary/30 transition-colors">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-700 dark:text-slate-200 text-sm truncate pr-2">{u.name}</span>
                    <span className={`text-[10px] uppercase font-black px-1.5 rounded ${u.totalOpen > 10 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                       {u.totalOpen}
                    </span>
                  </div>
                  <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase">
                    <span>{u.activeCases} Exp.</span>
                    <span>{u.activeTareas} Tar.</span>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Filtros */}
          <section className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row gap-3 items-center">
            <div className="flex items-center gap-2 flex-1 w-full">
              <span className="material-symbols-outlined text-slate-400 text-sm">filter_list</span>
              <select className="bg-slate-50 dark:bg-slate-800 border-none outline-none text-xs font-bold uppercase text-slate-600 dark:text-slate-300 rounded cursor-pointer py-1" value={filterUser} onChange={e => setFilterUser(e.target.value)}>
                <option value="todos">Todos los Usuarios</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
              </select>
              <select className="bg-slate-50 dark:bg-slate-800 border-none outline-none text-xs font-bold uppercase text-slate-600 dark:text-slate-300 rounded cursor-pointer py-1" value={filterPriority} onChange={e => setFilterPriority(e.target.value)}>
                <option value="todas">Todas las Prioridades</option>
                <option value="baja">Baja</option>
                <option value="media">Media</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </select>
            </div>
            
            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
               <button onClick={() => setFilterStatus('pendientes')} className={`px-3 py-1 text-[10px] font-black uppercase rounded ${filterStatus === 'pendientes' ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-500'}`}>Pendientes</button>
               <button onClick={() => setFilterStatus('completadas')} className={`px-3 py-1 text-[10px] font-black uppercase rounded ${filterStatus === 'completadas' ? 'bg-white dark:bg-slate-700 text-green-600 shadow-sm' : 'text-slate-500'}`}>Cerradas</button>
               <button onClick={() => setFilterStatus('todas')} className={`px-3 py-1 text-[10px] font-black uppercase rounded ${filterStatus === 'todas' ? 'bg-white dark:bg-slate-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500'}`}>Todas</button>
            </div>
          </section>

          {/* Tabla LAP */}
          <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                  <tr>
                    <th className="px-4 py-3 font-black uppercase text-slate-500 text-[10px] whitespace-nowrap">Inicio</th>
                    <th className="px-4 py-3 font-black uppercase text-slate-500 text-[10px] w-24">Prioridad</th>
                    <th className="px-4 py-3 font-black uppercase text-slate-500 text-[10px] min-w-[200px]">Acción / Título</th>
                    <th className="px-4 py-3 font-black uppercase text-slate-500 text-[10px] min-w-[250px]">Comentarios</th>
                    <th className="px-4 py-3 font-black uppercase text-slate-500 text-[10px] w-32">Asignado</th>
                    <th className="px-4 py-3 font-black uppercase text-slate-500 text-[10px] w-24 text-center">Avance</th>
                    <th className="px-4 py-3 font-black uppercase text-slate-500 text-[10px] text-center whitespace-nowrap">Cierre</th>
                    <th className="px-4 py-3 font-black uppercase text-slate-500 text-[10px] text-right w-16">Más</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredTareas.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-4 py-8 text-center text-slate-400 font-bold italic">
                        No hay actividades bajo los filtros seleccionados
                      </td>
                    </tr>
                  ) : filteredTareas.map(tarea => {
                    const assignedUser = users.find(u => u.id === tarea.usuarioAsignado);
                    const isCompleted = tarea.avance === 1;
                    return (
                      <tr key={tarea.id} className={`${isCompleted ? 'bg-slate-50 dark:bg-slate-900/50 opacity-60' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'} transition-colors`}>
                        <td className="px-4 py-3 font-mono text-slate-600 dark:text-slate-400">
                           {tarea.fechaInicio.split('-').reverse().join('/')}
                        </td>
                        <td className="px-4 py-3">
                           <span className={`px-2 py-0.5 rounded font-black uppercase text-[9px] border ${getPriorityColor(tarea.prioridad)}`}>
                             {tarea.prioridad}
                           </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-800 dark:text-slate-200">
                          {tarea.accion}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">
                          {tarea.comentarios || <span className="italic text-slate-400">Sin comentarios</span>}
                        </td>
                        <td className="px-4 py-3 font-bold text-primary dark:text-blue-400">
                          {assignedUser?.name || 'Desconocido'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex flex-col items-center gap-1">
                            <span className="text-[10px] font-black uppercase text-slate-500">{tarea.avance * 100}%</span>
                            <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                              <div 
                                className={`h-full ${tarea.avance === 1 ? 'bg-green-500' : 'bg-primary'}`} 
                                style={{ width: `${tarea.avance * 100}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-center font-mono text-slate-500">
                           {tarea.fechaCierre ? tarea.fechaCierre.split('-').reverse().join('/') : '-'}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button onClick={() => {
                            setEditingTarea(tarea);
                            setIsModalOpen(true);
                          }} className="text-slate-400 hover:text-primary transition-colors">
                            <span className="material-symbols-outlined text-[18px]">edit</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </main>
      </div>

      {/* MODAL CREAR / EDITAR TAREA */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
           <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-screen">
             <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
               <h2 className="uppercase tracking-widest text-xs font-black flex items-center gap-2">
                 <span className="material-symbols-outlined text-[18px]">task_alt</span>
                 {editingTarea?.id ? 'Editar Actividad' : 'Nueva Actividad'}
               </h2>
               <button onClick={() => setIsModalOpen(false)} className="hover:text-red-400 transition-colors">
                 <span className="material-symbols-outlined">close</span>
               </button>
             </div>
             
             <form onSubmit={handleSaveTarea} className="p-6 overflow-y-auto space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Fecha Inicio</label>
                    <input 
                      type="date"
                      required
                      className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none" 
                      value={editingTarea?.fechaInicio || ''}
                      onChange={e => setEditingTarea({...editingTarea, fechaInicio: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Prioridad</label>
                    <select 
                      required
                      className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none"
                      value={editingTarea?.prioridad || 'media'}
                      onChange={e => setEditingTarea({...editingTarea, prioridad: e.target.value as TareaPrioridad})}
                    >
                      <option value="baja">Baja</option>
                      <option value="media">Media</option>
                      <option value="alta">Alta</option>
                      <option value="urgente">Urgente</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Acción / Título</label>
                  <input 
                    required
                    placeholder="Ej: Revisar anexo 15 de empresa X..."
                    className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none font-bold" 
                    value={editingTarea?.accion || ''}
                    onChange={e => setEditingTarea({...editingTarea, accion: e.target.value})}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Comentarios / Descripción</label>
                  <textarea 
                    className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none min-h-[80px]" 
                    value={editingTarea?.comentarios || ''}
                    onChange={e => setEditingTarea({...editingTarea, comentarios: e.target.value})}
                    placeholder="Detalles adicionales, requerimientos..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Usuario Asignado</label>
                    <select 
                      required
                      className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none font-bold text-primary"
                      value={editingTarea?.usuarioAsignado || ''}
                      onChange={e => setEditingTarea({...editingTarea, usuarioAsignado: e.target.value})}
                    >
                      <option value="" disabled>Seleccione usuario...</option>
                      {users.map(u => (
                        <option key={u.id} value={u.id}>{u.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Avance</label>
                    <select 
                      required
                      className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none font-bold text-green-600"
                      value={editingTarea?.avance !== undefined ? editingTarea.avance.toString() : '0'}
                      onChange={e => setEditingTarea({...editingTarea, avance: Number(e.target.value)})}
                    >
                      <option value="0">0% - Sin Iniciar</option>
                      <option value="0.25">25% - Iniciado</option>
                      <option value="0.5">50% - En Proceso</option>
                      <option value="0.75">75% - Avanzado</option>
                      <option value="1">100% - Completado</option>
                    </select>
                  </div>
                </div>

                {editingTarea?.avance === 1 && (
                   <div>
                     <label className="block text-[10px] font-black uppercase text-green-600 mb-1">Fecha de Cierre</label>
                     <input 
                        type="date"
                        className="w-full px-3 py-2 text-sm border border-green-200 bg-green-50 rounded dark:bg-green-900/20 dark:border-green-800 outline-none font-black text-green-700 dark:text-green-400" 
                        value={editingTarea?.fechaCierre || new Date().toISOString().split('T')[0]}
                        onChange={e => setEditingTarea({...editingTarea, fechaCierre: e.target.value})}
                      />
                   </div>
                )}

                <div className="pt-4 flex justify-between">
                  {editingTarea?.id ? (
                     <button type="button" onClick={() => handleDelete(editingTarea.id!)} className="px-4 py-2 border border-red-200 text-red-600 text-xs font-black uppercase rounded hover:bg-red-50 dark:border-red-900 dark:hover:bg-red-900/50 transition-colors">
                       Eliminar
                     </button>
                  ) : <div/>}
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-600 text-xs font-black uppercase rounded hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors">Cancelar</button>
                    <button type="submit" className="px-6 py-2 bg-primary text-white text-xs font-black uppercase rounded shadow-lg hover:bg-blue-600 transition-colors flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px]">save</span> Guardar
                    </button>
                  </div>
                </div>
             </form>
           </div>
        </div>
      )}
    </div>
  );
};
