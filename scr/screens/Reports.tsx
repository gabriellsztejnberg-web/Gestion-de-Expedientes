
import React, { useState, useEffect } from 'react';
import { Sidebar } from '../components/Sidebar';
import { db } from '../firebase';
import { collection, query, getDocs, orderBy } from 'firebase/firestore';
import { TimelineEvent, Case, Mail, MOI } from '../types';
import { summarizeReportRow } from '../services/geminiService'; // Importamos servicio IA

export const Reports: React.FC = () => {
  // Ajuste para inicializar siempre con la fecha local correcta del día
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().split('T')[0];
  });

  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [mails, setMails] = useState<Mail[]>([]);
  const [mois, setMois] = useState<MOI[]>([]);
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Estado para los resúmenes de IA { expedienteId: resumen_generado }
  const [aiSummaries, setAiSummaries] = useState<Record<string, string>>({});
  const [isAiProcessing, setIsAiProcessing] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setAiSummaries({}); // Reseteamos al cambiar fecha
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

      // Fetch Mails
      const qMails = query(collection(db, 'mails'), orderBy('fechaIngreso', 'asc'));
      const snapshotMails = await getDocs(qMails);
      const allMails = snapshotMails.docs.map(d => ({ id: d.id, ...d.data() } as Mail));
      const dayMails = allMails.filter(m => {
          const ingreso = new Date(m.fechaIngreso).toLocaleDateString() === new Date(selectedDate + 'T00:00:00').toLocaleDateString();
          const respuesta = m.fechaRespuesta ? new Date(m.fechaRespuesta).toLocaleDateString() === new Date(selectedDate + 'T00:00:00').toLocaleDateString() : false;
          return ingreso || respuesta;
      });
      setMails(dayMails);

      // Fetch MOIs
      const qMois = query(collection(db, 'mois'), orderBy('fechaRegistro', 'asc'));
      const snapshotMois = await getDocs(qMois);
      const allMois = snapshotMois.docs.map(d => ({ id: d.id, ...d.data() } as MOI));
      const dayMois = allMois.filter(m => {
          const registro = new Date(m.fechaRegistro).toLocaleDateString() === new Date(selectedDate + 'T00:00:00').toLocaleDateString();
          return registro;
      });
      setMois(dayMois);

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
    const time = new Date(e.fecha).toLocaleTimeString('es-AR', {hour: '2-digit', minute:'2-digit'});
    
    // MOI HANDLING
    if (e.expedienteId === 'MOIS_GENERAL') {
        const isRecibido = e.texto.includes('RECIBIDO');
        const moiColorClass = isRecibido ? 'bg-indigo-500' : 'bg-pink-500';
        const moiTextColor = isRecibido ? 'text-indigo-600' : 'text-pink-600';
        
        return (
          <div key={e.id} className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700 mb-3 relative overflow-hidden group hover:shadow-md transition-all">
            <div className={`absolute top-0 left-0 w-1 h-full ${moiColorClass}`}></div>
            <div className="flex justify-between items-start mb-2">
              <span className={`text-[10px] font-black uppercase ${moiTextColor}`}>MOI / RADIO</span>
              <div className="flex items-center gap-1 text-slate-400">
                <span className="material-symbols-outlined text-[14px]">schedule</span>
                <span className="text-[10px] font-mono">{time}</span>
              </div>
            </div>
            <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase mb-1 line-clamp-1">
                MOI
            </h4>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-3 line-clamp-3 leading-relaxed font-mono">
                {e.texto}
            </p>
            
            <div className="flex items-center gap-2 mt-auto">
              <div className="size-5 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[8px] font-black text-slate-500 uppercase">
                 {e.usuario.charAt(0)}
              </div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">{e.usuario}</span>
            </div>
          </div>
        );
    }

    // MAIL HANDLING
    if (e.expedienteId === 'MAILS_GENERAL') {
        return (
          <div key={e.id} className="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-sm border border-slate-100 dark:border-slate-700 mb-3 relative overflow-hidden group hover:shadow-md transition-all">
            <div className="absolute top-0 left-0 w-1 h-full bg-orange-500"></div>
            <div className="flex justify-between items-start mb-2">
              <span className="text-[10px] font-black uppercase text-orange-600">MAIL / CORREO</span>
              <div className="flex items-center gap-1 text-slate-400">
                <span className="material-symbols-outlined text-[14px]">schedule</span>
                <span className="text-[10px] font-mono">{time}</span>
              </div>
            </div>
            <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase mb-1 line-clamp-1">COMUNICACIÓN DIGITAL</h4>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-3 line-clamp-2 leading-relaxed">{e.texto}</p>
            
            <div className="flex items-center gap-2 mt-auto">
              <div className="size-5 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[8px] font-black text-slate-500 uppercase">
                 {e.usuario.charAt(0)}
              </div>
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tight">{e.usuario}</span>
            </div>
          </div>
        );
    }

    const exp = cases.find(c => c.id === e.expedienteId);
    
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

  type ReportLine = {
    id: string;
    numero: string;
    empresa: string;
    tramite: string;
    ordenanza: string;
    anexo: string;
    resumenOriginal: string;
    responsables: string;
  };

  const lineasReporte = expedienteIdsUnicos.map((id: string): ReportLine | null => {
    if (id === 'MAILS_GENERAL' || id === 'MOIS_GENERAL' || id === 'SIN_EXPEDIENTE') return null;
    const exp = cases.find(c => c.id === id);
    const eventosExp = events.filter(e => e.expedienteId === id);
    // Unimos los textos crudos
    const resumenCrudo = eventosExp.map(e => e.texto).join(' | ');

    return {
      id: id,
      numero: exp?.numero || 'N/A',
      empresa: exp?.empresa || 'S/D',
      tramite: exp?.tramite || 'N/A',
      ordenanza: exp?.ordenanza || '-',
      anexo: exp?.categoria || '-',
      resumenOriginal: resumenCrudo,
      responsables: Array.from(new Set(eventosExp.map(e => e.usuario))).join(', ')
    };
  }).filter((item): item is ReportLine => item !== null);

  // --- LOGICA IA: GENERAR RESUMENES EN LOTE ---
  const handleGenerateAiReports = async () => {
      if (lineasReporte.length === 0) return;
      
      const confirmText = Object.keys(aiSummaries).length > 0 
        ? "Ya existen resúmenes generados. ¿Desea regenerarlos?"
        : "Esto enviará los datos a Gemini IA para resumir la actividad. ¿Continuar?";
      
      if (!confirm(confirmText)) return;
      
      setIsAiProcessing(true);
      // Comenzamos con una copia, pero permitimos sobrescribir
      const newSummaries = { ...aiSummaries };

      // Procesamos secuencialmente para no saturar
      for (const linea of lineasReporte) {
          if (!linea) continue;
          
          // Siempre regeneramos para cumplir con el pedido de cambio de formato (1 a 3 frases)
          // aunque ya exista un resumen previo.
          const resumenIa = await summarizeReportRow(linea.numero, linea.empresa, linea.resumenOriginal);
          newSummaries[linea.id] = resumenIa;
          
          // Actualizamos estado progresivamente para feedback visual
          setAiSummaries({ ...newSummaries });
      }
      setIsAiProcessing(false);
  };

  return (
    <div className="flex h-screen w-full bg-background-light dark:bg-background-dark overflow-hidden print:h-auto print:overflow-visible print:block">
      <div className="print:hidden h-full">
         <Sidebar activePage="reportes" />
      </div>
      
      <div className="flex-1 flex flex-col h-full overflow-hidden relative print:h-auto print:overflow-visible print:block">
        
        {/* Header */}
        <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1a2632] px-6 py-4 no-print shrink-0 print:hidden">
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
            
            {/* BOTÓN IA */}
            <button 
                onClick={handleGenerateAiReports} 
                disabled={isAiProcessing || lineasReporte.length === 0}
                className={`px-5 py-2.5 rounded-lg flex items-center gap-2 shadow-lg transition-all active:scale-95 text-xs font-black uppercase 
                    ${isAiProcessing ? 'bg-purple-100 text-purple-400 cursor-wait' : 'bg-purple-600 text-white hover:bg-purple-700'}`}
            >
                <span className={`material-symbols-outlined text-[18px] ${isAiProcessing ? 'animate-spin' : ''}`}>
                    {isAiProcessing ? 'sync' : 'auto_awesome'}
                </span>
                {isAiProcessing ? 'Procesando...' : 'Mejorar con IA'}
            </button>

            <button onClick={() => window.print()} className="bg-slate-900 text-white px-5 py-2.5 rounded-lg flex items-center gap-2 hover:bg-slate-800 shadow-lg transition-all active:scale-95 text-xs font-black uppercase">
              <span className="material-symbols-outlined text-[18px]">print</span>
              Imprimir
            </button>
          </div>
        </header>

        {/* VISTA DE PANTALLA: DASHBOARD MODERNO (Solo visualización) */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-50 dark:bg-[#0d141b] print:hidden">
          
          {/* Tarjetas de Resumen Superior */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
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

            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 flex justify-between items-center relative overflow-hidden">
               <div className="absolute right-0 top-0 h-full w-1 bg-orange-500"></div>
               <div>
                  <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-1">Mails Gestionados</p>
                  <h3 className="text-4xl font-black text-slate-900 dark:text-white">{mails.length}</h3>
                  <p className="text-[9px] text-orange-600 font-bold mt-1">Ingresos / Respuestas</p>
               </div>
               <span className="material-symbols-outlined text-orange-100 text-5xl">mail</span>
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
        </main>

        {/* VISTA DE IMPRESIÓN: TABLA FORMAL (SÁBANA) */}
        <div className="hidden print:block w-full h-auto bg-white print:overflow-visible text-black">
            <div className="p-8 w-full">
            
            <div className="border-b-4 border-slate-900 pb-4 mb-4 flex justify-between items-end">
              <div>
                <h1 className="text-xl font-black uppercase tracking-widest text-slate-900">DPAM - DIVISIÓN PLANES</h1>
                <p className="text-slate-500 font-bold text-[10px] uppercase tracking-tighter italic">Registro Unificado de Gestión en la Nube</p>
              </div>
              <div className="text-right">
                <p className="font-black text-lg uppercase leading-none mb-1">PARTE DIARIO DE MOVIMIENTOS</p>
                <p className="text-slate-600 font-mono text-sm uppercase">{new Date(selectedDate).toLocaleDateString('es-AR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</p>
              </div>
            </div>

            <div className="w-full">
              <table className="w-full border-collapse border border-slate-300 text-[9px] table-fixed print:border-slate-400">
                <colgroup>
                  <col className="w-[15%]" />
                  <col className="w-[20%]" />
                  <col className="w-[20%]" />
                  <col className="w-[45%]" />
                </colgroup>
                <thead className="bg-slate-100 break-inside-avoid table-header-group">
                  <tr>
                    <th className="border border-slate-300 p-1.5 uppercase font-black text-left">GDE / Exp.</th>
                    <th className="border border-slate-300 p-1.5 uppercase font-black text-left">Empresa / Titular</th>
                    <th className="border border-slate-300 p-1.5 uppercase font-black text-left">Trámite (Ord./Anexo)</th>
                    <th className="border border-slate-300 p-1.5 uppercase font-black text-left flex items-center gap-1">
                        Resumen de Actividad
                        {Object.keys(aiSummaries).length > 0 && <span className="text-[7px] bg-purple-100 text-purple-700 px-1 rounded border border-purple-200">✨ IA ACTIVADA</span>}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {lineasReporte.length > 0 ? lineasReporte.map((linea, idx) => (
                    <tr key={idx} className="break-inside-avoid page-break-inside-avoid">
                      <td className="border border-slate-300 p-1.5 font-bold font-mono uppercase break-words align-top">{linea.numero}</td>
                      <td className="border border-slate-300 p-1.5 font-black uppercase text-slate-900 break-words align-top">{linea.empresa}</td>
                      <td className="border border-slate-300 p-1.5 uppercase leading-tight align-top">
                        <div className="font-bold">{linea.tramite}</div>
                        <div className="text-slate-500 text-[8px] font-bold">ORD: {linea.ordenanza} | ANEXO: {linea.anexo}</div>
                      </td>
                      <td className="border border-slate-300 p-1.5 text-slate-700 whitespace-pre-wrap leading-tight align-top">
                        {/* AQUI SE MUESTRA EL RESUMEN IA SI EXISTE, SINO EL ORIGINAL */}
                        {aiSummaries[linea.id] ? (
                            <span className="font-serif text-slate-900">{aiSummaries[linea.id]}</span>
                        ) : (
                            <span className="italic text-slate-500">{linea.resumenOriginal}</span>
                        )}
                        <div className="mt-1 text-[7px] text-slate-400 font-black uppercase">Responsable(s): {linea.responsables}</div>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={4} className="border border-slate-300 p-8 text-center text-slate-400 uppercase font-bold italic">No se registraron movimientos de expedientes.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* TABLA DE MAILS EN IMPRESION */}
            {mails.length > 0 && (
                <div className="mt-8 break-inside-avoid page-break-inside-avoid">
                    <h3 className="text-sm font-black uppercase border-b-2 border-slate-300 mb-2 pb-1">Comunicaciones / Correos Electrónicos</h3>
                    <table className="w-full border-collapse border border-slate-300 text-[9px] table-fixed">
                        <colgroup>
                            <col className="w-[20%]" />
                            <col className="w-[50%]" />
                            <col className="w-[30%]" />
                        </colgroup>
                        <thead className="bg-slate-100 table-header-group">
                            <tr>
                                <th className="border border-slate-300 p-1.5 uppercase font-black text-left">Remitente</th>
                                <th className="border border-slate-300 p-1.5 uppercase font-black text-left">Detalle</th>
                                <th className="border border-slate-300 p-1.5 uppercase font-black text-left">Estado / Acción</th>
                            </tr>
                        </thead>
                        <tbody>
                            {mails.map(m => (
                                <tr key={m.id} className="break-inside-avoid page-break-inside-avoid">
                                    <td className="border border-slate-300 p-1.5 font-black uppercase">{m.remitente}</td>
                                    <td className="border border-slate-300 p-1.5 uppercase">
                                        <span className="font-bold block">AS: {m.asunto}</span>
                                        {m.fechaRespuesta ? (
                                            <span className="text-slate-500 italic">RTA: {m.respuesta}</span>
                                        ) : (
                                            <span className="text-slate-400 italic">{m.cuerpo}</span>
                                        )}
                                    </td>
                                    <td className="border border-slate-300 p-1.5 uppercase text-center">
                                        {m.fechaRespuesta ? (
                                            <div>
                                                <span className="font-bold text-green-700">RESPONDIDO</span>
                                                <div className="text-[7px]">Por: {m.respondidoPor}</div>
                                            </div>
                                        ) : (
                                            <span className="font-bold text-orange-600">INGRESO (PENDIENTE)</span>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* TABLA DE MOIS EN IMPRESION */}
            {mois.length > 0 && (
                <div className="mt-8 break-inside-avoid page-break-inside-avoid">
                    <h3 className="text-sm font-black uppercase border-b-2 border-slate-300 mb-2 pb-1">Mensajes Oficiales (MOI)</h3>
                    <table className="w-full border-collapse border border-slate-300 text-[9px] table-fixed">
                        <colgroup>
                            <col className="w-[15%]" />
                            <col className="w-[15%]" />
                            <col className="w-[50%]" />
                            <col className="w-[20%]" />
                        </colgroup>
                        <thead className="bg-slate-100 table-header-group">
                            <tr>
                                <th className="border border-slate-300 p-1.5 uppercase font-black text-left">GFH</th>
                                <th className="border border-slate-300 p-1.5 uppercase font-black text-left">Origen</th>
                                <th className="border border-slate-300 p-1.5 uppercase font-black text-left">Texto / Extracto</th>
                                <th className="border border-slate-300 p-1.5 uppercase font-black text-left">Tipo / Prioridad</th>
                            </tr>
                        </thead>
                        <tbody>
                            {mois.map(m => (
                                <tr key={m.id} className="break-inside-avoid page-break-inside-avoid">
                                    <td className="border border-slate-300 p-1.5 font-mono text-slate-600">{m.gfh}</td>
                                    <td className="border border-slate-300 p-1.5 font-black uppercase">{m.origen}</td>
                                    <td className="border border-slate-300 p-1.5 uppercase">
                                        <span className="font-bold block mb-1">{m.codigoTexto}</span>
                                        <span className="text-slate-600 italic">{m.texto}</span>
                                    </td>
                                    <td className="border border-slate-300 p-1.5 uppercase text-center">
                                        <div className="font-bold">{m.tipo === 'recibido' ? 'RECIBIDO' : 'ENVIADO'}</div>
                                        <div className="text-[7px] text-slate-500">{m.prioridad}</div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            <div className="flex justify-between mt-12 pt-8 px-8 break-inside-avoid page-break-inside-avoid">
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


