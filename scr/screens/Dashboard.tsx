
import React, { useState, useEffect } from 'react';
import { Sidebar } from '../components/Sidebar';
import { db } from '../firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { Case } from '../types';

export const Dashboard: React.FC = () => {
  const [cases, setCases] = useState<Case[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'expedientes'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Case));
      setCases(docs);
    });
    return () => unsubscribe();
  }, []);

  const stats = [
    { 
      label: 'Total Activos', 
      val: cases.filter(c => c.instancia !== 'guarda' && c.instancia !== 'pase').length.toString(), 
      sub: 'En gestión interna', 
      icon: 'inventory', 
      color: 'blue' 
    },
    { 
      label: 'Fuera de Oficina', 
      val: cases.filter(c => c.instancia === 'pase').length.toString(), 
      sub: 'Pases externos', 
      icon: 'outbound', 
      color: 'orange' 
    },
    { 
      label: 'Estancados (+20d)', 
      val: cases.filter(c => {
        if (c.instancia === 'guarda') return false;
        const diff = new Date().getTime() - new Date(c.ultimaModificacion).getTime();
        return (diff / (1000 * 3600 * 24)) > 20;
      }).length.toString(), 
      sub: 'Revisión prioritaria', 
      icon: 'timer_off', 
      color: 'red' 
    },
    { 
      label: 'En Guarda Temporal', 
      val: cases.filter(c => c.instancia === 'guarda').length.toString(), 
      sub: 'Expedientes archivados', 
      icon: 'archive', 
      color: 'slate' 
    },
  ];

  return (
    <div className="flex h-screen w-full bg-background-light dark:bg-background-dark">
      <Sidebar activePage="dashboard" />
      <main className="flex-1 flex flex-col h-full overflow-y-auto p-6 md:p-10">
        <div className="max-w-[1400px] w-full mx-auto">
          <div className="mb-10">
            <h2 className="text-slate-900 dark:text-white text-3xl font-black uppercase tracking-tight flex items-center gap-3">
              <span className="bg-primary/10 p-2 rounded-lg material-symbols-outlined text-primary">cloud_done</span>
              División Planes - DPAM Cloud
            </h2>
            <p className="text-slate-500 dark:text-slate-400 font-bold text-sm">Panel de Control Centralizado</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {stats.map((stat, i) => (
              <div key={i} className={`flex flex-col p-6 rounded-xl bg-white dark:bg-[#15202b] border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md ${stat.color === 'red' ? 'border-l-4 border-l-red-500' : ''}`}>
                <div className="flex justify-between items-start mb-4">
                  <p className="text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest">{stat.label}</p>
                  <span className={`material-symbols-outlined text-${stat.color}-600 dark:text-${stat.color}-400`}>{stat.icon}</span>
                </div>
                <h3 className={`text-3xl font-black text-slate-900 dark:text-white mb-2`}>{stat.val}</h3>
                <p className="text-[11px] text-slate-400 font-medium leading-relaxed">{stat.sub}</p>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
};
