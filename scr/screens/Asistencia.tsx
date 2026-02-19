
import React, { useState, useEffect } from 'react';
import { Sidebar } from '../components/Sidebar';
import { db } from '../firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  where,
  setDoc,
  doc,
  writeBatch
} from 'firebase/firestore';
import { User, AttendanceLog, AttendanceType } from '../types';

// CONFIGURACIÓN
const WEEKLY_TARGET_HOURS = 35;
const CREDIT_HOURS_PER_DAY = 7; // Horas que se acreditan por Comisión, Licencia o Feriado

export const Asistencia: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<Record<string, AttendanceLog>>({});
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(getMonday(new Date()));
  const [todayLog, setTodayLog] = useState<AttendanceLog | null>(null);

  // Modal Novedades
  const [isNovedadOpen, setIsNovedadOpen] = useState(false);
  const [novedadData, setNovedadData] = useState({
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      type: 'comision' as AttendanceType,
      notes: '',
      targetUserId: 'me' // 'me', 'all' (para feriados), o ID especifico si es jefe
  });

  const currentUser: User = JSON.parse(localStorage.getItem('currentUser') || '{"id":"temp","name":"Usuario"}');
  const isJefe = (currentUser.role || '').toLowerCase() === 'jefe' || (currentUser.role || '').toLowerCase() === 'admin';
  const todayStr = new Date().toISOString().split('T')[0];

  function getMonday(d: Date) {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
    const monday = new Date(d);
    monday.setDate(diff);
    return monday;
  }

  const weekDates = Array.from({length: 5}, (_, i) => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    return d.toISOString().split('T')[0];
  });

  useEffect(() => {
    const qUsers = query(collection(db, 'usuarios'));
    const unsubUsers = onSnapshot(qUsers, (snap) => {
      setUsers(snap.docs.map(d => d.data() as User));
    });

    const startStr = weekDates[0];
    const endStr = weekDates[4];
    
    const qLogs = query(
      collection(db, 'asistencia'), 
      where('date', '>=', startStr),
      where('date', '<=', endStr)
    );

    const unsubLogs = onSnapshot(qLogs, (snap) => {
      const logsMap: Record<string, AttendanceLog> = {};
      snap.docs.forEach(d => {
        logsMap[d.id] = d.data() as AttendanceLog;
      });
      setLogs(logsMap);
      
      const myLogId = `${currentUser.id}_${todayStr}`;
      setTodayLog(logsMap[myLogId] || null);
    });

    return () => {
      unsubUsers();
      unsubLogs();
    };
  }, [currentWeekStart]);

  // --- LOGIC: TIME CALCULATION ---

  const toMinutes = (timeStr: string) => {
      if (!timeStr) return 0;
      const [h, m] = timeStr.split(':').map(Number);
      return (h * 60) + m;
  };

  const minutesToTime = (totalMins: number) => {
      const h = Math.floor(totalMins / 60).toString().padStart(2, '0');
      const m = (totalMins % 60).toString().padStart(2, '0');
      return `${h}:${m}`;
  };

  const calculateDailyDiff = (entry: string, exit: string) => {
      if (!entry || !exit) return '00:00';
      const start = toMinutes(entry);
      const end = toMinutes(exit);
      let diff = end - start;
      if (diff < 0) diff = 0; 
      return minutesToTime(diff);
  };

  const getCreditMinutes = (type: AttendanceType) => {
      if (['comision', 'licencia_ord', 'licencia_med', 'feriado', 'franco'].includes(type)) {
          return CREDIT_HOURS_PER_DAY * 60; // 7 horas crédito
      }
      return 0; // Ausente o Normal sin horas no suman
  };

  const calculateWeeklyTotalMinutes = (userId: string) => {
    let totalMins = 0;
    weekDates.forEach(date => {
       const logId = `${userId}_${date}`;
       const log = logs[logId];
       if (log) {
           if (log.type === 'normal') {
               if (log.entry && log.exit) {
                   totalMins += toMinutes(log.exit) - toMinutes(log.entry);
               }
           } else {
               // Si es licencia, comision o feriado, suma 7 horas
               totalMins += getCreditMinutes(log.type);
           }
       }
    });
    return totalMins;
  };

  // --- ACTIONS ---

  const handleUpdateCell = async (userId: string, date: string, field: 'entry' | 'exit', value: string) => {
    const logId = `${userId}_${date}`;
    const userOwner = users.find(u => u.id === userId);

    const currentData = logs[logId] || {
      id: logId,
      userId: userId,
      userName: userOwner?.name || 'Desconocido',
      userRole: userOwner?.role === 'jefe' ? 'JER' : 'OP',
      date: date,
      entry: '', exit: '',
      type: 'normal',
      totalHours: '00:00'
    };

    const newData = { ...currentData, [field]: value };
    // Al tocar la hora manual, asumimos tipo 'normal' si estaba vacio
    if (!newData.type) newData.type = 'normal';
    
    // Si edito hora, cambio a normal si estaba en ausente
    if (newData.type === 'ausente') newData.type = 'normal';

    if (newData.entry && newData.exit) {
        newData.totalHours = calculateDailyDiff(newData.entry, newData.exit);
    } else {
        newData.totalHours = '00:00';
    }

    await setDoc(doc(db, 'asistencia', logId), newData);
  };

  const handleQuickClock = async (type: 'entry' | 'exit') => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
      await handleUpdateCell(currentUser.id, todayStr, type, timeStr);
  };

  // NUEVA FUNCIÓN: Limpiar día específico (volver a normal)
  const handleClearDay = async (userId: string, date: string) => {
      if(!confirm("¿Desea eliminar esta novedad y volver a horario normal?")) return;
      
      const logId = `${userId}_${date}`;
      const userOwner = users.find(u => u.id === userId);

      // Pisamos con un log "limpio"
      const cleanData: AttendanceLog = {
          id: logId,
          userId: userId,
          userName: userOwner?.name || 'Desconocido',
          userRole: userOwner?.role === 'jefe' ? 'JER' : 'OP',
          date: date,
          entry: '', 
          exit: '',
          type: 'normal',
          notes: '',
          totalHours: '00:00'
      };
      await setDoc(doc(db, 'asistencia', logId), cleanData);
  };

  const handleSaveNovedad = async (e: React.FormEvent) => {
      e.preventDefault();
      
      const start = new Date(novedadData.startDate);
      const end = new Date(novedadData.endDate);
      const batch = writeBatch(db);
      
      // Loop por dias
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split('T')[0];
          
          let targetUsers: User[] = [];
          if (novedadData.targetUserId === 'all') {
              targetUsers = users;
          } else if (novedadData.targetUserId === 'me') {
              const me = users.find(u => u.id === currentUser.id);
              if (me) targetUsers = [me];
          } else {
              const u = users.find(user => user.id === novedadData.targetUserId);
              if (u) targetUsers = [u];
          }

          targetUsers.forEach(u => {
              const logId = `${u.id}_${dateStr}`;
              const docRef = doc(db, 'asistencia', logId);
              
              const isReset = novedadData.type === 'normal';

              const data = {
                  id: logId,
                  userId: u.id,
                  userName: u.name,
                  userRole: u.role === 'jefe' ? 'JER' : 'OP',
                  date: dateStr,
                  type: novedadData.type,
                  notes: isReset ? '' : (novedadData.notes || ''),
                  // Si es reset (normal) o ausente, 0 horas. Si es especial, 7 horas.
                  totalHours: (isReset || novedadData.type === 'ausente') ? '00:00' : '07:00',
                  // Si es reset, limpiamos entrada/salida para evitar inconsistencias visuales
                  entry: isReset ? '' : undefined,
                  exit: isReset ? '' : undefined
              };

              // Si es reset, usamos set para pisar todo. Si no, merge para mantener info si hubiese
              if (isReset) {
                  batch.set(docRef, { ...data, entry: '', exit: '' });
              } else {
                  batch.set(docRef, data, { merge: true });
              }
          });
      }

      await batch.commit();
      setIsNovedadOpen(false);
      alert("Novedades registradas correctamente.");
  };

  const changeWeek = (offset: number) => {
     const newDate = new Date(currentWeekStart);
     newDate.setDate(newDate.getDate() + (offset * 7));
     setCurrentWeekStart(newDate);
  };

  // --- RENDER HELPERS ---
  const getDayName = (dateStr: string) => {
     const days = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
     const d = new Date(dateStr + 'T12:00:00'); 
     return days[d.getDay()];
  };

  const formatShortDate = (dateStr: string) => {
     const [y, m, d] = dateStr.split('-');
     return `${d}/${m}`;
  };

  const myTotalMinutes = calculateWeeklyTotalMinutes(currentUser.id);
  const myTotalHoursStr = minutesToTime(myTotalMinutes);
  const weeklyTargetMins = WEEKLY_TARGET_HOURS * 60; 
  const progressPercent = Math.min((myTotalMinutes / weeklyTargetMins) * 100, 100);

  const displayDate = new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const weekStartDisplay = formatShortDate(weekDates[0]);
  const weekEndDisplay = formatShortDate(weekDates[4]);
  
  const isPastWeek = new Date(weekDates[4]) < new Date();

  return (
    <div className="flex h-screen w-full bg-background-light dark:bg-background-dark overflow-hidden font-display">
      <Sidebar activePage="asistencia" />
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* HEADER & STATS */}
        <div className="p-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
           <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-6">
               <div>
                  <h1 className="text-slate-900 dark:text-white text-2xl font-black uppercase tracking-tight">Control de Horario</h1>
                  <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">{displayDate}</p>
               </div>

               {/* ESTADÍSTICA PERSONAL */}
               <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700">
                    <div className="flex flex-col">
                        <span className="text-[10px] font-black uppercase text-slate-400 mb-1">Mis Horas Semanales</span>
                        <div className="flex items-baseline gap-1">
                            <span className={`text-2xl font-black ${myTotalMinutes >= weeklyTargetMins ? 'text-green-600' : 'text-slate-900 dark:text-white'}`}>{myTotalHoursStr}</span>
                            <span className="text-[10px] font-bold text-slate-400">/ {WEEKLY_TARGET_HOURS}:00 hs</span>
                        </div>
                        <div className="w-32 h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden">
                            <div className={`h-full ${myTotalMinutes >= weeklyTargetMins ? 'bg-green-500' : 'bg-primary'}`} style={{ width: `${progressPercent}%` }}></div>
                        </div>
                    </div>
                    <div className="h-10 w-px bg-slate-200 dark:bg-slate-700 mx-2"></div>
                    <div className="flex gap-2">
                        <button 
                            onClick={() => handleQuickClock('entry')}
                            className="flex flex-col items-center justify-center w-20 h-16 rounded-lg bg-green-600 hover:bg-green-700 text-white shadow-lg transition-all active:scale-95"
                        >
                            <span className="material-symbols-outlined text-2xl">login</span>
                            <span className="text-[9px] font-black uppercase mt-1">Entrada</span>
                        </button>
                        <button 
                            onClick={() => handleQuickClock('exit')}
                            className="flex flex-col items-center justify-center w-20 h-16 rounded-lg bg-slate-800 hover:bg-slate-900 text-white shadow-lg transition-all active:scale-95"
                        >
                            <span className="material-symbols-outlined text-2xl">logout</span>
                            <span className="text-[9px] font-black uppercase mt-1">Salida</span>
                        </button>
                    </div>
               </div>
           </div>

           {/* CONTROLES DE SEMANA */}
           <div className="flex justify-between items-center bg-slate-100 dark:bg-slate-800/50 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
              <div className="flex items-center gap-4">
                  <button onClick={() => changeWeek(-1)} className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded-md transition-colors"><span className="material-symbols-outlined text-slate-500">chevron_left</span></button>
                  <h2 className="text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                     SEMANA DEL {weekStartDisplay} AL {weekEndDisplay}
                  </h2>
                  <button onClick={() => changeWeek(1)} className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded-md transition-colors"><span className="material-symbols-outlined text-slate-500">chevron_right</span></button>
              </div>
              <button 
                  onClick={() => setIsNovedadOpen(true)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded text-[10px] font-black uppercase shadow transition-all"
              >
                  <span className="material-symbols-outlined text-[14px]">event_note</span>
                  Gestionar Novedades / Licencias
              </button>
           </div>
        </div>

        {/* WEEKLY TABLE (EXCEL STYLE) */}
        <div className="flex-1 overflow-auto bg-white dark:bg-slate-900 p-6">
           <div className="border border-slate-400 dark:border-slate-700 overflow-x-auto shadow-sm">
              <table className="w-full text-[10px] font-mono border-collapse min-w-[1000px]">
                 <thead>
                    {/* Header Row 1: Days */}
                    <tr>
                       <th className="border-r border-b border-slate-300 bg-slate-100 dark:bg-slate-800 w-10"></th>
                       <th className="border-r border-b border-slate-300 bg-slate-100 dark:bg-slate-800 w-48"></th>
                       {weekDates.map(date => (
                          <th key={date} colSpan={2} className="border-r border-b border-slate-300 bg-blue-100 text-blue-900 text-center font-black uppercase py-2">
                             {getDayName(date)} <br/> <span className="text-[9px] opacity-70">{formatShortDate(date)}</span>
                          </th>
                       ))}
                       <th className="bg-orange-500 text-white w-24 text-center font-black border-b border-slate-300">TOTAL</th>
                    </tr>
                    {/* Header Row 2: Columns */}
                    <tr>
                       <th className="border-r border-b border-slate-300 p-1.5 bg-slate-50 dark:bg-slate-800 text-left font-bold text-slate-500">ROL</th>
                       <th className="border-r border-b border-slate-300 p-1.5 bg-slate-50 dark:bg-slate-800 text-left font-bold text-slate-500">AGENTE</th>
                       {weekDates.map(date => (
                          <React.Fragment key={date}>
                             <th className="border-r border-b border-slate-300 p-1 bg-white dark:bg-slate-900 text-center w-20 text-green-700">ENTRADA</th>
                             <th className="border-r border-b border-slate-300 p-1 bg-white dark:bg-slate-900 text-center w-20 text-red-700">SALIDA</th>
                          </React.Fragment>
                       ))}
                       <th className="border-b border-slate-300 p-1 bg-orange-100 text-orange-900 text-center font-bold">HORAS</th>
                    </tr>
                 </thead>
                 <tbody>
                    {users.map(u => {
                       const roleShort = u.role === 'jefe' ? 'JER' : u.role === 'admin' ? 'ADM' : 'OP';
                       const isMe = u.id === currentUser.id;
                       const totalMins = calculateWeeklyTotalMinutes(u.id);
                       const isDeficit = isPastWeek && totalMins < weeklyTargetMins;

                       return (
                          <tr key={u.id} className={`hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors ${isMe ? 'bg-blue-50/30' : ''}`}>
                             <td className="border-r border-b border-slate-300 p-1 text-center font-bold text-slate-400">{roleShort}</td>
                             <td className="border-r border-b border-slate-300 p-2 font-bold uppercase truncate text-slate-800 dark:text-slate-200">{u.name}</td>
                             {weekDates.map(date => {
                                const logId = `${u.id}_${date}`;
                                const log = logs[logId];
                                const type = log?.type || 'normal';

                                // Condiciones Visuales
                                const isAbsent = type === 'ausente';
                                const isLicense = type.includes('licencia') || type === 'franco';
                                const isComision = type === 'comision';
                                const isFeriado = type === 'feriado';
                                
                                // Si es Feriado, Comision o Licencia, mostramos celda unificada PERO aclaramos que suma horas
                                if (isFeriado || isComision || isLicense || isAbsent) {
                                   return (
                                     <td key={date} colSpan={2} className="border-r border-b border-slate-300 p-0 relative group">
                                         <div className={`w-full h-full min-h-[30px] flex flex-col items-center justify-center font-black uppercase text-[9px] cursor-pointer 
                                            ${isAbsent ? 'bg-red-200 text-red-800' : 
                                              isLicense ? 'bg-purple-200 text-purple-800' : 
                                              isFeriado ? 'bg-green-200 text-green-800' :
                                              isComision ? 'bg-indigo-200 text-indigo-800' : 'bg-slate-200'}`}>
                                            <span>{type.replace('_', ' ')}</span>
                                            {!isAbsent && <span className="text-[7px] opacity-70">(+7 hs)</span>}
                                         </div>
                                         
                                         {/* BOTÓN LIMPIAR / CORREGIR */}
                                         <button 
                                            onClick={(e) => { e.stopPropagation(); handleClearDay(u.id, date); }}
                                            className="absolute top-0.5 right-0.5 opacity-0 group-hover:opacity-100 bg-white/60 hover:bg-white text-slate-600 rounded-full p-0.5 transition-all shadow-sm"
                                            title="Limpiar / Volver a Normal"
                                         >
                                            <span className="material-symbols-outlined text-[12px]">close</span>
                                         </button>
                                     </td>
                                   );
                                }

                                return (
                                   <React.Fragment key={date}>
                                      <td className="border-r border-b border-slate-300 p-0 relative">
                                         <input 
                                            type="time" 
                                            className="w-full h-full min-h-[34px] px-1 text-center bg-transparent outline-none focus:bg-white focus:ring-2 focus:ring-primary/50 text-slate-700 dark:text-slate-300 font-medium"
                                            value={log?.entry || ''}
                                            onChange={(e) => handleUpdateCell(u.id, date, 'entry', e.target.value)}
                                         />
                                      </td>
                                      <td className="border-r border-b border-slate-300 p-0 relative">
                                         <input 
                                             type="time" 
                                             className="w-full h-full min-h-[34px] px-1 text-center bg-transparent outline-none focus:bg-white focus:ring-2 focus:ring-primary/50 text-slate-700 dark:text-slate-300 font-medium"
                                             value={log?.exit || ''}
                                             onChange={(e) => handleUpdateCell(u.id, date, 'exit', e.target.value)}
                                         />
                                      </td>
                                   </React.Fragment>
                                );
                             })}
                             
                             {/* ALERTA VISUAL DE HORAS */}
                             <td className={`border-b border-slate-300 p-1 text-center font-black text-xs ${isDeficit ? 'bg-red-100 text-red-600' : 'bg-orange-50 text-orange-900'}`}>
                                <div className="flex items-center justify-center gap-1">
                                    {isDeficit && <span className="material-symbols-outlined text-[14px]">warning</span>}
                                    {minutesToTime(totalMins)}
                                </div>
                             </td>
                          </tr>
                       );
                    })}
                 </tbody>
              </table>
           </div>
        </div>
      </div>

      {/* MODAL GESTION NOVEDADES */}
      {isNovedadOpen && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
             <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-800">
                 <div className="bg-indigo-600 text-white px-6 py-4 flex justify-between items-center rounded-t-xl">
                     <span className="text-xs font-black uppercase tracking-widest">Registrar Novedad / Licencia</span>
                     <button onClick={() => setIsNovedadOpen(false)}><span className="material-symbols-outlined">close</span></button>
                 </div>
                 <form onSubmit={handleSaveNovedad} className="p-6 space-y-4">
                     
                     {/* USUARIO TARGET */}
                     <div>
                         <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Aplicar A</label>
                         <select className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase font-bold" value={novedadData.targetUserId} onChange={e => setNovedadData({...novedadData, targetUserId: e.target.value})}>
                             <option value="me">A Mí Mismo</option>
                             {isJefe && (
                                 <>
                                    <option value="all">-- TODOS (Para Feriados) --</option>
                                    <optgroup label="Usuarios Específicos">
                                        {users.map(u => <option key={u.id} value={u.id}>{u.name.toUpperCase()}</option>)}
                                    </optgroup>
                                 </>
                             )}
                         </select>
                     </div>

                     <div className="grid grid-cols-2 gap-4">
                         <div>
                             <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Desde Fecha</label>
                             <input type="date" required className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none" value={novedadData.startDate} onChange={e => setNovedadData({...novedadData, startDate: e.target.value})} />
                         </div>
                         <div>
                             <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Hasta Fecha (inclusive)</label>
                             <input type="date" required className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none" value={novedadData.endDate} onChange={e => setNovedadData({...novedadData, endDate: e.target.value})} />
                         </div>
                     </div>

                     <div>
                         <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Tipo de Novedad</label>
                         <select className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none font-bold" value={novedadData.type} onChange={e => setNovedadData({...novedadData, type: e.target.value as AttendanceType})}>
                             <option value="comision">Comisión de Servicio (+7hs)</option>
                             <option value="licencia_ord">Licencia Ordinaria / Vacaciones (+7hs)</option>
                             <option value="licencia_med">Licencia Médica (+7hs)</option>
                             <option value="feriado">Feriado / Asueto (+7hs)</option>
                             <option value="franco">Franco Compensatorio (+7hs)</option>
                             <option value="ausente">Ausente / Falta (0hs)</option>
                             <option disabled>──────────</option>
                             <option value="normal">VOLVER A NORMAL / LIMPIAR</option>
                         </select>
                     </div>

                     <div>
                         <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Nota / Detalle</label>
                         <textarea className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none h-20" placeholder="Ej: Curso de capacitación en..." value={novedadData.notes} onChange={e => setNovedadData({...novedadData, notes: e.target.value})}></textarea>
                     </div>

                     <button type="submit" className="w-full py-3 bg-indigo-600 text-white text-xs font-black uppercase rounded shadow-lg hover:bg-indigo-700">Registrar Novedad</button>
                 </form>
             </div>
         </div>
      )}
    </div>
  );
};
