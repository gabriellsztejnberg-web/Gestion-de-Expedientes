
import React, { useState, useEffect } from 'react';
import { Sidebar } from '../components/Sidebar';
import { db } from '../firebase';
import { collection, query, getDocs, orderBy } from 'firebase/firestore';
import { TimelineEvent, Case } from '../types';

export const Reports: React.FC = () => {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const qEvents = query(collection(db, 'movimientos'), orderBy('fecha', 'asc'));
      const snapshotEvents = await getDocs(qEvents);
      const allEvents = snapshotEvents.docs.map(d => ({ id: d.id, ...d.data() } as TimelineEvent));
      
      const dayEvents = allEvents.filter(e => {
        const eventDate = new Date(e.fecha).toISOString().split('T')[0];
        return eventDate === selectedDate;
      });
      setEvents(dayEvents);

      const qCases = query(collection(db, 'expedientes'));
      const snapshotCases = await getDocs(qCases);
      setCases(snapshotCases.docs.map(d => ({ id: d.id, ...d.data() } as Case)));

    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedDate]);

  const expedienteIdsUnicos = Array.from(new Set(events.map(e => e.expedienteId)));
  
  const lineasReporte = expedienteIdsUnicos.map(id => {
    const exp = cases.find(c => c.id === id);
    const eventosExp = events.filter(e => e.expedienteId === id);
    const resumen = eventosExp.map(e => e.texto).join(' | ');

    return {
      numero: exp?.numero || 'N/A',
      empresa: exp?.empresa || 'S/D',
      tramite: exp?.tramite || 'N/A',
      ordenanza: exp?.ordenanza || '-',
      anexo: exp?.categoria || '-',
      resumen: resumen,
      responsables: Array.from(new Set(eventosExp.map(e => e.usuario))).join(', ')
    };
  });

  return (
    <div className="flex h-screen w-full bg-background-light dark:bg-background-dark overflow-hidden">
      <Sidebar activePage="reportes" />
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a2632] px-6 py-3 no-print">
          <div className="flex items-center gap-4">
            <h2 className="text-[#0d141b] dark:text-white text-lg font-black uppercase tracking-tight">Parte Diario de Oficina</h2>
            <input 
              type="date" 
              className="p-2 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded text-xs font-bold outline-none" 
              value={selectedDate} 
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
          <button onClick={() => window.print()} className="bg-slate-900 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-slate-800 shadow transition-all active:scale-95 text-xs font-bold uppercase">
            <span className="material-symbols-outlined text-[18px]">print</span>
            Imprimir Reporte
          </button>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-100 dark:bg-slate-900 print:bg-white print:p-0">
          <div className="bg-white dark:bg-[#15202b] shadow-xl p-8 max-w-[21cm] mx-auto w-full min-h-[29.7cm] print:shadow-none print:w-full print:max-w-none border border-slate-200 dark:border-slate-800 print:border-none">
            
            <div className="border-b-4 border-slate-900 pb-6 mb-8 flex justify-between items-end">
              <div>
                <h1 className="text-xl font-black uppercase tracking-widest text-slate-900">DPAM - DIVISIÓN PLANES</h1>
                <p className="text-slate-500 font-bold text-[10px] uppercase tracking-tighter italic">Gestión de Expedientes en la Nube</p>
              </div>
              <div className="text-right">
                <p className="font-black text-lg uppercase leading-none mb-1">Actividad Diaria</p>
                <p className="text-slate-600 font-mono text-sm">{new Date(selectedDate).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</p>
              </div>
            </div>

            {loading ? (
              <div className="py-20 text-center font-bold uppercase tracking-widest text-slate-400 animate-pulse">Sincronizando datos de la oficina...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-slate-300 text-[10px]">
                  <thead className="bg-slate-100">
                    <tr>
                      <th className="border border-slate-300 p-2 uppercase font-black text-left w-32">GDE / Exp.</th>
                      <th className="border border-slate-300 p-2 uppercase font-black text-left">Empresa / Titular</th>
                      <th className="border border-slate-300 p-2 uppercase font-black text-left">Trámite (Ord./Anexo)</th>
                      <th className="border border-slate-300 p-2 uppercase font-black text-left">Resumen de Actividad</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lineasReporte.length > 0 ? lineasReporte.map((linea, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="border border-slate-300 p-2 font-bold font-mono uppercase break-all">{linea.numero}</td>
                        <td className="border border-slate-300 p-2 font-black uppercase text-slate-900">{linea.empresa}</td>
                        <td className="border border-slate-300 p-2 uppercase leading-tight">
                          <div className="font-bold">{linea.tramite}</div>
                          <div className="text-slate-500 text-[8px] font-bold">ORD: {linea.ordenanza} | ANEXO: {linea.anexo}</div>
                        </td>
                        <td className="border border-slate-300 p-2 text-slate-700 whitespace-pre-wrap leading-tight italic">
                          {linea.resumen}
                          <div className="mt-1 text-[7px] text-slate-400 font-black uppercase">Responsable(s): {linea.responsables}</div>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={4} className="border border-slate-300 p-12 text-center text-slate-400 uppercase font-bold italic">No se registraron movimientos en la fecha seleccionada.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}

            <div className="hidden print:flex justify-between mt-32 pt-10 px-8">
              <div className="text-center w-56 border-t border-slate-400 pt-2">
                <p className="text-[9px] font-black uppercase">Firma Operador</p>
              </div>
              <div className="text-center w-56 border-t border-slate-400 pt-2">
                <p className="text-[9px] font-black uppercase">Vº Bº Jefe de Oficina</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};
