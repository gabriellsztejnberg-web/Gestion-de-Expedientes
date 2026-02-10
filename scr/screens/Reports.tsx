
import React, { useState, useEffect } from 'react';
import { Sidebar } from '../components/Sidebar';
import { db } from '../firebase';
import { collection, query, getDocs, orderBy } from 'firebase/firestore';
import { TimelineEvent, Case } from '../types';

export const Reports: React.FC = () => {
  // Ajuste para inicializar siempre con la fecha local correcta del día
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  });

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
        // Corrección de zona horaria para comparación de fechas
        const eventDateObj = new Date(e.fecha);
        // Ajustamos la fecha del evento a local string YYYY-MM-DD para comparar con el input
        const eventDateLocal = new Date(eventDateObj.getTime() - (eventDateObj.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
        return eventDateLocal === selectedDate;
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

  // Clasificación de eventos para el Dashboard Visual
  const ingresosEvents = events.filter(e => ['Adquisición', 'Carga'].includes(e.tipoAccion || ''));
  const pasesEvents = events.filter(e => (e.tipoAccion || '').toLowerCase().includes('pase'));
  const gestionEvents = events.filter(e => !['Adquisición', 'Carga'].includes(e.tipoAccion || '') && !(e.tipoAccion || '').toLowerCase().includes('pase'));

  const renderCard = (e: TimelineEvent, colorClass: string) => {
    const exp = cases.find(c => c.id === e.expedienteId);
    const time = new Date(e.fecha).toLocaleTimeString('es-AR', {hour: '2-digit', minute:'2-digit'});
    
    return (
      <div key={e.id} className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700 mb-3 relative overflow-hidden group hover:shadow-md transition-all">
        <div className={`absolute top-0 left-0 w-1 h-full ${colorClass}`}></div>
        <div className="flex justify-between items-start mb-2">
          <span className={`text-[10px] font-black uppercase ${colorClass.replace('bg-', 'text-')}`}>{exp?.numero || 'S/D'}</span>
          <div className="flex items-center gap-1 text-slate-400">
            <span className="material-symbols-outlined text-[14px]">schedule</span>
            <span className="text-[10px] font-mono">{time}</span>
          </div>
        </div>
        <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase mb-1 line-clamp-1">{exp?.empresa || 'Empresa Desconocida'}</h4>
        <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-3 line-clamp-2 leading-relaxed">{e.texto}</p>
        
        <div className="flex items-center gap-2 mt-auto">
          <div className="size-5 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[8px] font-black text-slate-500 uppercase">
             {e.usuario.charAt(0)}
          </div>
          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">{e.usuario}</span>
        </div>
      </div>
    );
  };

  // Datos para la tabla formal de impresión
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
      <div className="flex-1 flex flex-col h-full overflow-hidden relative">
        
        {/* Header - Visible solo en pantalla */}
        <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a2632] px-6 py-4 no-print shrink-0">
          <div className="flex flex-col">
            <h2 className="text-[#0d141b] dark:text-white text-lg font-black uppercase tracking-tight">Gestión Diaria de Actividad</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Revisión y firma de movimientos</p>
          </div>
          <div className="flex items-center gap-4">
            <input 
              type="date" 
              className="p-2 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 rounded text-xs font-bold outline-none shadow-inner" 
              value={selectedDate} 
              onChange={(e) => setSelectedDate(e.target.value)}
            />
            <button onClick={() => window.print()} className="bg-slate-900 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 hover:bg-slate-800 shadow-lg transition-all active:scale-95 text-xs font-black uppercase">
              <span className="material-symbols-outlined text-[18px]">print</span>
              Imprimir Parte Oficial
            </button>
          </div>
        </header>

        {/* VISTA DE PANTALLA: DASHBOARD MODERNO */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-[#0d141b] print:hidden">
          
          {/* Tarjetas de Resumen Superior */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 flex justify-between items-center relative overflow-hidden">
               <div className="absolute right-0 top-0 h-full w-1 bg-green-500"></div>
               <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Ingresos</p>
                  <h3 className="text-4xl font-black text-slate-900 dark:text-white">{ingresosEvents.length}</h3>
                  <p className="text-[9px] text-green-600 font-bold mt-1">Expedientes nuevos recibidos</p>
               </div>
               <span className="material-symbols-outlined text-green-100 text-5xl">input</span>
            </div>
            
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 flex justify-between items-center relative overflow-hidden">
               <div className="absolute right-0 top-0 h-full w-1 bg-blue-500"></div>
               <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Pases</p>
                  <h3 className="text-4xl font-black text-slate-900 dark:text-white">{pasesEvents.length}</h3>
                  <p className="text-[9px] text-blue-600 font-bold mt-1">Transferencias externas</p>
               </div>
               <span className="material-symbols-outlined text-blue-100 text-5xl">outbound</span>
            </div>

            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 flex justify-between items-center relative overflow-hidden">
               <div className="absolute right-0 top-0 h-full w-1 bg-purple-500"></div>
               <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Gestión Interna</p>
                  <h3 className="text-4xl font-black text-slate-900 dark:text-white">{gestionEvents.length}</h3>
                  <p className="text-[9px] text-purple-600 font-bold mt-1">Movimientos y decretos</p>
               </div>
               <span className="material-symbols-outlined text-purple-100 text-5xl">description</span>
            </div>
          </div>

          {/* Columnas de Detalle */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full min-h-0">
            
            {/* Columna Ingresos */}
            <div className="flex flex-col h-full bg-slate-100 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800">
               <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-800 rounded-t-xl">
                  <div className="flex items-center gap-2">
                     <div className="size-2 rounded-full bg-green-500"></div>
                     <h3 className="text-xs font-black uppercase text-slate-800 dark:text-white">Ingresos del Día</h3>
                  </div>
                  <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded text-[9px] font-bold">{ingresosEvents.length} Total</span>
               </div>
               <div className="p-4 flex-1 overflow-y-auto">
                  {ingresosEvents.length > 0 ? ingresosEvents.map(e => renderCard(e, 'bg-green-500')) : <p className="text-center text-[10px] text-slate-400 italic mt-10">Sin ingresos registrados.</p>}
               </div>
            </div>

            {/* Columna Pases */}
            <div className="flex flex-col h-full bg-slate-100 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800">
               <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-800 rounded-t-xl">
                  <div className="flex items-center gap-2">
                     <div className="size-2 rounded-full bg-blue-500"></div>
                     <h3 className="text-xs font-black uppercase text-slate-800 dark:text-white">Pases a Organismos</h3>
                  </div>
                  <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded text-[9px] font-bold">{pasesEvents.length} Total</span>
               </div>
               <div className="p-4 flex-1 overflow-y-auto">
                  {pasesEvents.length > 0 ? pasesEvents.map(e => renderCard(e, 'bg-blue-500')) : <p className="text-center text-[10px] text-slate-400 italic mt-10">Sin pases registrados.</p>}
               </div>
            </div>

            {/* Columna Gestión */}
            <div className="flex flex-col h-full bg-slate-100 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-800">
               <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-800 rounded-t-xl">
                  <div className="flex items-center gap-2">
                     <div className="size-2 rounded-full bg-purple-500"></div>
                     <h3 className="text-xs font-black uppercase text-slate-800 dark:text-white">Gestión Interna</h3>
                  </div>
                  <span className="bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded text-[9px] font-bold">{gestionEvents.length} Total</span>
               </div>
               <div className="p-4 flex-1 overflow-y-auto">
                  {gestionEvents.length > 0 ? gestionEvents.map(e => renderCard(e, 'bg-purple-500')) : <p className="text-center text-[10px] text-slate-400 italic mt-10">Sin movimientos internos.</p>}
               </div>
            </div>

          </div>
          
          {/* Alerta Footer */}
          <div className="mt-8 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800/30 rounded-lg p-4 flex items-center gap-4">
             <div className="bg-yellow-100 dark:bg-yellow-900/30 p-2 rounded text-yellow-600">
                <span className="material-symbols-outlined">warning</span>
             </div>
             <div>
                <h4 className="text-xs font-black uppercase text-yellow-800 dark:text-yellow-500">Reporte Preliminar</h4>
                <p className="text-[10px] text-yellow-700 dark:text-yellow-600">Recuerde generar la impresión física para la firma al finalizar la jornada laboral. La vista actual es solo informativa.</p>
             </div>
          </div>
        </main>

        {/* VISTA DE IMPRESIÓN: TABLA FORMAL (SÁBANA) */}
        <div className="hidden print:block absolute inset-0 bg-white z-50 overflow-y-auto">
            <div className="p-8 max-w-full mx-auto w-full">
            
            <div className="border-b-4 border-slate-900 pb-6 mb-8 flex justify-between items-end">
              <div>
                <h1 className="text-xl font-black uppercase tracking-widest text-slate-900">DPAM - DIVISIÓN PLANES</h1>
                <p className="text-slate-500 font-bold text-[10px] uppercase tracking-tighter italic">Registro Unificado de Gestión en la Nube</p>
              </div>
              <div className="text-right">
                <p className="font-black text-lg uppercase leading-none mb-1">PARTE DIARIO DE MOVIMIENTOS</p>
                <p className="text-slate-600 font-mono text-sm uppercase">{new Date().toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</p>
              </div>
            </div>

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

            <div className="flex justify-between mt-32 pt-10 px-8 break-inside-avoid">
              <div className="text-center w-56 border-t border-slate-400 pt-2">
                <p className="text-[9px] font-black uppercase">Firma Operador</p>
              </div>
              <div className="text-center w-56 border-t border-slate-400 pt-2">
                <p className="text-[9px] font-black uppercase">Vº Bº Jefe de Oficina</p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};
