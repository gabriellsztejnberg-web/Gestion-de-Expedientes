
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

  // Helpers para lógica de días
  const getDays = (dateStr: string) => Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / (1000 * 3600 * 24));

  const stats = [
    { 
      label: 'Activos en Oficina', 
      val: cases.filter(c => c.instancia !== 'guarda' && c.instancia !== 'pase').length.toString(), 
      sub: 'Gestión interna diaria', 
      icon: 'inventory', 
      color: 'blue' 
    },
    { 
      label: 'Fuera de Oficina', 
      val: cases.filter(c => c.instancia === 'pase').length.toString(), 
      sub: 'Pases externos activos', 
      icon: 'outbound', 
      color: 'slate' 
    },
    { 
      label: 'Urgentes (15-20d)', 
      val: cases.filter(c => {
        if (c.instancia === 'guarda' || c.instancia === 'pase') return false;
        const d = getDays(c.ultimaModificacion);
        return d >= 15 && d <= 20;
      }).length.toString(), 
      sub: 'Atención inminente', 
      icon: 'warning', 
      color: 'yellow' 
    },
    { 
      label: 'Estancados (+20d)', 
      val: cases.filter(c => {
        if (c.instancia === 'guarda' || c.instancia === 'pase') return false;
        const d = getDays(c.ultimaModificacion);
        return d > 20;
      }).length.toString(), 
      sub: 'Requiere revisión', 
      icon: 'timer_off', 
      color: 'red' 
    },
  ];

  // Cálculo para gráfico simple
  const total = cases.length || 1;
  const analysisCount = cases.filter(c => c.instancia === 'analisis').length;
  const obsCount = cases.filter(c => c.instancia === 'obs').length;
  const notifCount = cases.filter(c => c.instancia === 'notificacion').length;
  const othersCount = cases.length - analysisCount - obsCount - notifCount;

  return (
    <div className="flex h-screen w-full bg-background-light dark:bg-background-dark">
      <Sidebar activePage="dashboard" />
      <main className="flex-1 flex flex-col h-full overflow-y-auto p-6 md:p-10">
        <div className="max-w-[1400px] w-full mx-auto">
          <div className="mb-10">
            <h2 className="text-slate-900 dark:text-white text-3xl font-black uppercase tracking-tight flex items-center gap-3">
              <span className="bg-primary/10 p-2 rounded-lg material-symbols-outlined text-primary">analytics</span>
              Tablero de Estadísticas
            </h2>
            <p className="text-slate-500 dark:text-slate-400 font-bold text-sm">Métricas de rendimiento y volumen - División Planes</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
            {stats.map((stat, i) => (
              <div key={i} className={`flex flex-col p-6 rounded-xl bg-white dark:bg-[#15202b] border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md border-l-4 ${stat.color === 'red' ? 'border-l-red-500' : stat.color === 'yellow' ? 'border-l-yellow-500' : stat.color === 'blue' ? 'border-l-blue-500' : 'border-l-slate-500'}`}>
                <div className="flex justify-between items-start mb-4">
                  <p className="text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest">{stat.label}</p>
                  <span className={`material-symbols-outlined ${stat.color === 'red' ? 'text-red-500' : stat.color === 'yellow' ? 'text-yellow-500' : stat.color === 'blue' ? 'text-blue-500' : 'text-slate-500'}`}>{stat.icon}</span>
                </div>
                <h3 className={`text-4xl font-black text-slate-900 dark:text-white mb-2`}>{stat.val}</h3>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">{stat.sub}</p>
              </div>
            ))}
          </div>

          <div className="bg-white dark:bg-[#15202b] p-8 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
             <h3 className="text-lg font-black uppercase text-slate-900 dark:text-white mb-6">Distribución de Carga por Instancia</h3>
             <div className="space-y-6">
                
                <div>
                   <div className="flex justify-between text-xs font-bold uppercase mb-2">
                      <span className="text-blue-600">En Análisis / Planilla</span>
                      <span className="text-slate-500">{analysisCount} Exps</span>
                   </div>
                   <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
                      <div className="bg-blue-500 h-3 rounded-full" style={{ width: `${(analysisCount/total)*100}%` }}></div>
                   </div>
                </div>

                <div>
                   <div className="flex justify-between text-xs font-bold uppercase mb-2">
                      <span className="text-red-500">Observados / Corrección</span>
                      <span className="text-slate-500">{obsCount} Exps</span>
                   </div>
                   <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
                      <div className="bg-red-500 h-3 rounded-full" style={{ width: `${(obsCount/total)*100}%` }}></div>
                   </div>
                </div>

                <div>
                   <div className="flex justify-between text-xs font-bold uppercase mb-2">
                      <span className="text-yellow-600">En Notificación</span>
                      <span className="text-slate-500">{notifCount} Exps</span>
                   </div>
                   <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
                      <div className="bg-yellow-500 h-3 rounded-full" style={{ width: `${(notifCount/total)*100}%` }}></div>
                   </div>
                </div>

                <div>
                   <div className="flex justify-between text-xs font-bold uppercase mb-2">
                      <span className="text-slate-600">Otros (Pases, Guarda, etc)</span>
                      <span className="text-slate-500">{othersCount} Exps</span>
                   </div>
                   <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-3 overflow-hidden">
                      <div className="bg-slate-400 h-3 rounded-full" style={{ width: `${(othersCount/total)*100}%` }}></div>
                   </div>
                </div>

             </div>
          </div>
        </div>
      </main>
    </div>
  );
};
