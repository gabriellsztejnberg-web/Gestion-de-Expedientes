
import React, { useState, useEffect } from 'react';
import { Sidebar } from '../components/Sidebar';
import { db } from '../firebase';
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore';
import { TimelineEvent } from '../types';

export const Timeline: React.FC = () => {
  const [events, setEvents] = useState<TimelineEvent[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'movimientos'), orderBy('fecha', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimelineEvent));
      setEvents(docs);
    });
    return () => unsubscribe();
  }, []);

  return (
    <div className="flex h-screen w-full bg-background-light dark:bg-background-dark overflow-hidden">
      <Sidebar activePage="timeline" />
      <div className="flex flex-col flex-1 h-full overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a2632] px-6 py-4">
          <h2 className="text-[#0d141b] dark:text-white text-lg font-black uppercase tracking-tight">Historial General Cloud</h2>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-4xl mx-auto">
            {events.length > 0 ? (
              <div className="relative flex flex-col gap-0 pl-2">
                {events.map((item, i) => (
                  <div key={item.id} className={`relative flex gap-6 ${i === events.length - 1 ? '' : 'pb-10 timeline-connector'}`}>
                    <div className="relative z-10 flex flex-col items-center flex-shrink-0 w-10">
                      <div className="size-10 rounded-full bg-slate-100 dark:bg-slate-800 text-primary flex items-center justify-center border-2 border-white dark:border-[#1a2632] shadow-sm">
                        <span className="material-symbols-outlined text-[20px]">history_edu</span>
                      </div>
                    </div>
                    <div className="flex flex-col flex-1 pt-1">
                      <div className="flex justify-between items-start mb-1">
                        <p className="text-slate-900 dark:text-white font-bold text-sm uppercase tracking-tight">{item.usuario}</p>
                        <span className="text-slate-400 font-mono text-[10px] bg-slate-50 dark:bg-slate-800 px-2 py-1 rounded">
                          {new Date(item.fecha).toLocaleString()}
                        </span>
                      </div>
                      <div className="bg-white dark:bg-[#15202b] p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <p className="text-slate-700 dark:text-slate-300 text-sm leading-relaxed">{item.texto}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-20 text-slate-400">
                <span className="material-symbols-outlined text-5xl mb-4 opacity-20">history</span>
                <p className="text-sm font-bold uppercase tracking-widest">No hay movimientos registrados.</p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};
