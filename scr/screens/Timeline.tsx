
import React, { useState, useEffect } from 'react';
import { Sidebar } from '../components/Sidebar';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { TimelineEvent, Case } from '../types';

export const Timeline: React.FC = () => {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');

  useEffect(() => {
    const q = query(collection(db, 'movimientos'), orderBy('fecha', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setEvents(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimelineEvent)));
    });

    const qCases = query(collection(db, 'expedientes'));
    onSnapshot(qCases, (snapshot) => {
      setCases(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Case)));
    });

    return () => unsubscribe();
  }, []);

  const handleComplete = async (eventId: string) => {
    try {
      await updateDoc(doc(db, 'movimientos', eventId), {
        isPending: false,
        texto: events.find(e => e.id === eventId)?.texto + " [TAREA FINALIZADA]"
      });
    } catch (e) {
      alert("Error al actualizar el pendiente.");
    }
  };

  const handleDeleteTask = async (eventId: string) => {
    if (!confirm("¿Eliminar definitivamente este recordatorio?")) return;
    await deleteDoc(doc(db, 'movimientos', eventId));
  };

  const filteredEvents = events.filter(e => {
    if (filter === 'pending') return e.isPending === true;
    return true;
  });

  return (
    <div className="flex h-screen w-full bg-background-light dark:bg-background-dark overflow-hidden font-display">
      <Sidebar activePage="timeline" />
      <div className="flex flex-col flex-1 h-full overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a2632] px-6 py-4">
          <div className="flex flex-col">
            <h2 className="text-[#0d141b] dark:text-white text-lg font-black uppercase tracking-tight">Actividades Pendientes</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-primary italic">Seguimiento de tareas críticas</p>
          </div>
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg shadow-inner">
            <button 
              onClick={() => setFilter('pending')} 
              className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-md transition-all ${filter === 'pending' ? 'bg-orange-600 text-white shadow-sm' : 'text-slate-500'}`}
            >
              Pendientes
            </button>
            <button 
              onClick={() => setFilter('all')} 
              className={`px-4 py-1.5 text-[10px] font-black uppercase rounded-md transition-all ${filter === 'all' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500'}`}
            >
              Todo
            </button>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-4xl mx-auto space-y-4">
            {filteredEvents.length > 0 ? filteredEvents.map((item) => {
              const exp = cases.find(c => c.id === item.expedienteId);
              return (
                <div key={item.id} className={`flex flex-col p-4 rounded-xl border transition-all ${item.isPending ? 'bg-orange-50 border-orange-200 shadow-sm' : 'bg-white dark:bg-[#15202b] border-slate-200 dark:border-slate-800 opacity-70'}`}>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex flex-col">
                      <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full inline-block w-max mb-1.5 ${item.isPending ? 'bg-orange-600 text-white animate-pulse' : 'bg-slate-200 text-slate-500'}`}>
                        {item.isPending ? 'TAREA PENDIENTE' : 'COMPLETADA'}
                      </span>
                      <p className="text-slate-900 dark:text-white font-black text-xs uppercase tracking-tight">
                        EXP: {exp?.numero || 'S/GDE'} <span className="text-slate-400 font-normal mx-1">|</span> {exp?.empresa || 'Empresa Desconocida'}
                      </p>
                    </div>
                    <span className="text-slate-400 font-mono text-[9px]">{new Date(item.fecha).toLocaleString()}</span>
                  </div>
                  
                  <div className="flex-1 mb-4 bg-white/50 dark:bg-black/20 p-3 rounded-lg border border-slate-100 dark:border-slate-700/50">
                    <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed whitespace-pre-wrap font-medium">"{item.texto}"</p>
                  </div>

                  <div className="flex justify-between items-center pt-2 border-t border-slate-100 dark:border-slate-800">
                    <p className="text-[9px] text-slate-500 font-bold uppercase tracking-tight italic">Creado por: {item.usuario}</p>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => handleDeleteTask(item.id)} 
                        className="text-slate-400 hover:text-red-500 p-1 flex items-center gap-1 transition-colors"
                        title="Eliminar de la lista"
                      >
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                        <span className="text-[8px] font-black uppercase">Quitar</span>
                      </button>
                      {item.isPending && (
                        <button 
                          onClick={() => handleComplete(item.id)} 
                          className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-[9px] font-black uppercase flex items-center gap-1.5 shadow-sm transition-all active:scale-95"
                        >
                          <span className="material-symbols-outlined text-[16px]">check_circle</span>
                          Marcar como Lista
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            }) : (
              <div className="text-center py-24 text-slate-400">
                <span className="material-symbols-outlined text-6xl mb-4 opacity-10">checklist_rtl</span>
                <p className="text-xs font-black uppercase tracking-widest italic">No hay tareas {filter === 'pending' ? 'pendientes' : 'registradas'}.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
