
import React, { useState, useEffect } from 'react';
import { Sidebar } from '../components/Sidebar';
import { db } from '../firebase';
import { collection, query, getDocs, where, orderBy } from 'firebase/firestore';
import { TimelineEvent } from '../types';

export const Reports: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'movimientos'), orderBy('fecha', 'asc'));
      const snapshot = await getDocs(q);
      const allEvents = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as TimelineEvent));
      
      const filtered = allEvents.filter(e => {
        const eventDate = new Date(e.fecha).toISOString().split('T')[0];
        return eventDate === selectedDate;
      });
      
      setEvents(filtered);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [selectedDate]);

  const reporte = {
    ingresos: events.filter(e => e.tipoAccion === 'Carga' || e.tipoAccion === 'Importación'),
    pases: events.filter(e => e.tipoAccion === 'Pase'),
    movimientos: events.filter(e => !['Carga', 'Importación', 'Pase'].includes(e.tipoAccion || ''))
  };

  const formatTime = (isoDate: string) => {
    return new Date(isoDate).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex h-screen w-full bg-background-light dark:bg-background-dark overflow-hidden">
      <Sidebar activePage="reportes" />
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a2632] px-6 py-3 no-print">
          <div className="flex items-center gap-4">
            <h2 className="text-[#0d141b] dark:text-white text-lg font-black uppercase tracking-tight">Reporte Cloud</h2>
            <input 
              type="date" 
              className="p-2 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded text-xs font-bold outline-none" 
              value={selectedDate} 
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
          <button onClick={() => window.print()} className="bg-slate-900 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-slate-800 shadow transition-all active:scale-95 text-xs font-bold uppercase">
            <span className="material-symbols-outlined text-[18px]">print</span>
            Imprimir PDF
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-10 bg-slate-100 dark:bg-slate-900 print:bg-white print:p-0">
          <div className="bg-white dark:bg-[#15202b] shadow-xl p-10 max-w-4xl mx-auto w-full min-h-[29.7cm] print:shadow-none print:w-full print:max-w-none border border-slate-200 dark:border-slate-800 print:border-none">
            {/* Encabezado Formal */}
            <div className="border-b-4 border-slate-900 dark:border-slate-100 pb-6 mb-8 flex justify-between items-end">
              <div>
                <h1 className="text-2xl font-black uppercase tracking-widest text-slate-900 dark:text-white">División Planes</h1>
                <p className="text-slate-500 dark:text-slate-400 font-bold text-xs uppercase tracking-tighter">Parte Diario - Sistema Cloud</p>
              </div>
              <div className="text-right">
                <p className="font-black text-xl uppercase tracking-widest">Resumen Diario</p>
                <p className="text-slate-600 dark:text-slate-400 font-mono text-sm">{new Date(selectedDate).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
              </div>
            </div>

            {loading ? (
              <div className="py-20 text-center font-bold uppercase tracking-widest text-slate-400 animate-pulse">Consultando Firestore...</div>
            ) : (
              <div className="space-y-10">
                <section>
                  <h3 className="bg-slate-900 text-white p-2 font-black text-[10px] border-l-4 border-blue-500 mb-4 uppercase tracking-widest">1. Ingresos Cloud</h3>
                  {reporte.ingresos.length > 0 ? (
                    <ul className="space-y-3">
                      {reporte.ingresos.map(n => (
                        <li key={n.id} className="flex gap-4 border-b border-slate-100 dark:border-slate-800 pb-3">
                          <span className="font-mono font-bold text-slate-400 w-20 shrink-0 text-xs">{formatTime(n.fecha)}</span>
                          <p className="text-slate-700 dark:text-slate-300 text-sm leading-tight">
                            {n.texto} <span className="text-slate-400 dark:text-slate-500 font-bold text-[9px] uppercase ml-2">Resp: {n.usuario}</span>
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-slate-400 italic text-xs pl-2">Sin ingresos registrados.</p>}
                </section>

                <section>
                  <h3 className="bg-slate-900 text-white p-2 font-black text-[10px] border-l-4 border-orange-500 mb-4 uppercase tracking-widest">2. Pases Externos</h3>
                  {reporte.pases.length > 0 ? (
                    <ul className="space-y-3">
                      {reporte.pases.map(n => (
                        <li key={n.id} className="flex gap-4 border-b border-slate-100 dark:border-slate-800 pb-3">
                          <span className="font-mono font-bold text-slate-400 w-20 shrink-0 text-xs">{formatTime(n.fecha)}</span>
                          <p className="text-slate-700 dark:text-slate-300 text-sm leading-tight">
                            {n.texto} <span className="text-slate-400 dark:text-slate-500 font-bold text-[9px] uppercase ml-2">Resp: {n.usuario}</span>
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-slate-400 italic text-xs pl-2">Sin pases registrados.</p>}
                </section>

                <section>
                  <h3 className="bg-slate-900 text-white p-2 font-black text-[10px] border-l-4 border-green-500 mb-4 uppercase tracking-widest">3. Movimientos Internos</h3>
                  {reporte.movimientos.length > 0 ? (
                    <ul className="space-y-3">
                      {reporte.movimientos.map(n => (
                        <li key={n.id} className="flex gap-4 border-b border-slate-100 dark:border-slate-800 pb-3">
                          <span className="font-mono font-bold text-slate-400 w-20 shrink-0 text-xs">{formatTime(n.fecha)}</span>
                          <p className="text-slate-700 dark:text-slate-300 text-sm leading-tight">
                            {n.texto} <span className="text-slate-400 dark:text-slate-500 font-bold text-[9px] uppercase ml-2">Resp: {n.usuario}</span>
                          </p>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-slate-400 italic text-xs pl-2">Sin movimientos registrados.</p>}
                </section>
              </div>
            )}

            <div className="hidden print:flex justify-end mt-20 pt-10 border-t-2 border-slate-100">
              <div className="text-center w-64 border-t border-slate-900 pt-2">
                <p className="text-xs font-black uppercase">Responsable de Turno</p>
                <p className="text-[10px] uppercase text-slate-500">División Planes - DPAM Cloud</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
