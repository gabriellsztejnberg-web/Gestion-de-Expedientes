
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
const WEEKLY_BASE_HOURS = 35;
const HOURS_PER_DAY_TARGET = 7; // Usado para descontar objetivo en feriados

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
      type: 'licencia_anual' as AttendanceType,
      notes: '',
      targetUserId: 'me', // 'me', 'all', id
      // Para comisiones:
      comisionStart: '07:00',
      comisionEnd: '14:00'
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

  // Calcula el objetivo de la semana para un usuario (resta feriados)
  const calculateWeeklyTargetMins = (userId: string) => {
      let targetMins = WEEKLY_BASE_HOURS * 60;
      weekDates.forEach(date => {
          const logId = `${userId}_${date}`;
          const log = logs[logId];
          if (log && log.type === 'feriado') {
              targetMins -= (HOURS_PER_DAY_TARGET * 60);
          }
      });
      return targetMins > 0 ? targetMins : 0;
  };

  // Calcula horas TRABAJADAS (Normal + Comision)
  const calculateWeeklyWorkedMinutes = (userId: string) => {
    let totalMins = 0;
    weekDates.forEach(date => {
       const logId = `${userId}_${date}`;
       const log = logs[logId];
       if (log) {
           // Solo sumamos horas si es normal o comisión y tiene entrada/salida
           if ((log.type === 'normal' || log.type === 'comision') && log.entry && log.exit) {
               totalMins += toMinutes(log.exit) - toMinutes(log.entry);
           }
           // Las licencias y feriados NO suman horas trabajadas (pero feriado baja el target)
       }
    });
    return totalMins;
  };

  // --- ACTIONS ---

  const handleUpdateCell = async (userId: string, date: string, field: 'entry' | 'exit', value: string) => {
    const logId = `${userId}_${date}`;
    const userOwner = users.find(u => u.id === userId);
    const currentData = logs[logId];

    const newData: AttendanceLog = {
      id: logId,
      userId: userId,
      userName: userOwner?.name || 'Desconocido',
      userRole: userOwner?.role === 'jefe' ? 'JER' : 'OP',
      date: date,
      type: currentData?.type || 'normal', // Mantiene el tipo (ej: si era comision, sigue siendo)
      entry: currentData?.entry || '',
      exit: currentData?.exit || '',
      notes: currentData?.notes || '',
      totalHours: '00:00',
      ...currentData // override defaults
    };

    // Actualizamos campo
    (newData as any)[field] = value;

    // Si editamos a mano y estaba "ausente" o "licencia", lo pasamos a "normal" implícitamente?
    // Solo si es un tipo que NO permite horas. Comision SI permite horas.
    const tiposConHoras = ['normal', 'comision'];
    if (!tiposConHoras.includes(newData.type)) {
        if (confirm("Está ingresando horario en un día marcado como Licencia/Feriado. ¿Desea cambiarlo a 'Normal'?")) {
            newData.type = 'normal';
        } else {
            return; // Cancelar edición
        }
    }

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

  const handleClearDay = async (userId: string, date: string) => {
      if(!confirm("¿Desea limpiar este día y volver a normal?")) return;
      const logId = `${userId}_${date}`;
      const userOwner = users.find(u => u.id === userId);
      const cleanData: AttendanceLog = {
          id: logId,
          userId: userId,
          userName: userOwner?.name || 'Desconocido',
          userRole: userOwner?.role === 'jefe' ? 'JER' : 'OP',
          date: date,
          entry: '', exit: '', type: 'normal', notes: '', totalHours: '00:00'
      };
      await setDoc(doc(db, 'asistencia', logId), cleanData);
  };

  const handleSaveNovedad = async (e: React.FormEvent) => {
      e.preventDefault();
      
      const start = new Date(novedadData.startDate);
      const end = new Date(novedadData.endDate);
      const batch = writeBatch(db);
      
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
              const isComision = novedadData.type === 'comision';

              let entry = '';
              let exit = '';
              let total = '00:00';

              if (isComision) {
                  entry = novedadData.comisionStart;
                  exit = novedadData.comisionEnd;
                  total = calculateDailyDiff(entry, exit);
              }

              const data: AttendanceLog = {
                  id: logId,
                  userId: u.id,
                  userName: u.name,
                  userRole: u.role === 'jefe' ? 'JER' : 'OP',
                  date: dateStr,
                  type: novedadData.type,
                  notes: isReset ? '' : (novedadData.notes || ''),
                  entry: entry,
                  exit: exit,
                  totalHours: total
              };

              // Usamos set para pisar cualquier cosa anterior
              batch.set(docRef, data);
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

  const getLabelForType = (type: AttendanceType) => {
      switch(type) {
          case 'licencia_anual': return 'LIC. ANUAL';
          case 'licencia_ord': return 'LIC. ORDINARIA';
          case 'licencia_extra': return 'LIC. EXTRAORD.';
          case 'licencia_med': return 'LIC. MÉDICA';
          case 'licencia_personal': return 'ASUNTOS PERS.';
          case 'franco': return 'FRANCO';
          case 'feriado': return 'FERIADO';
          case 'comision': return 'COMISIÓN';
          case 'ausente': return 'AUSENTE';
          default: return type;
      }
  };

  const getColorForType = (type: AttendanceType) => {
      if (type.includes('licencia')) return 'bg-purple-200 text-purple-800 border-purple-300';
      if (type === 'feriado') return 'bg-teal-200 text-teal-800 border-teal-300';
      if (type === 'ausente') return 'bg-red-200 text-red-800 border-red-300';
      if (type === 'franco') return 'bg-blue-200 text-blue-800 border-blue-300';
      if (type === 'comision') return 'bg-indigo-100 text-indigo-800'; // Comisión usa estilo distinto
      return 'bg-slate-200';
  };

  // Cálculos Personales
  const myTotalWorkedMins = calculateWeeklyWorkedMinutes(currentUser.id);
  const myTargetMins = calculateWeeklyTargetMins(currentUser.id);
  const myTotalHoursStr = minutesToTime(myTotalWorkedMins);
  const myTargetHoursStr = minutesToTime(myTargetMins);
  
  const progressPercent = myTargetMins > 0 ? Math.min((myTotalWorkedMins / myTargetMins) * 100, 100) : 100;

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
                            <span className={`text-2xl font-black ${myTotalWorkedMins >= myTargetMins ? 'text-green-600' : 'text-slate-900 dark:text-white'}`}>{myTotalHoursStr}</span>
                            <span className="text-[10px] font-bold text-slate-400">/ {myTargetHoursStr} hs</span>
                        </div>
                        <div className="w-32 h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden">
                            <div className={`h-full ${myTotalWorkedMins >= myTargetMins ? 'bg-green-500' : 'bg-primary'}`} style={{ width: `${progressPercent}%` }}></div>
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

        {/* WEEKLY TABLE */}
        <div className="flex-1 overflow-auto bg-white dark:bg-slate-900 p-6">
           <div className="border border-slate-400 dark:border-slate-700 overflow-x-auto shadow-sm">
              <table className="w-full text-[10px] font-mono border-collapse min-w-[1000px]">
                 <thead>
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
                       
                       const workedMins = calculateWeeklyWorkedMinutes(u.id);
                       const targetMins = calculateWeeklyTargetMins(u.id);
                       const isDeficit = isPastWeek && workedMins < targetMins;

                       return (
                          <tr key={u.id} className={`hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors ${isMe ? 'bg-blue-50/30' : ''}`}>
                             <td className="border-r border-b border-slate-300 p-1 text-center font-bold text-slate-400">{roleShort}</td>
                             <td className="border-r border-b border-slate-300 p-2 font-bold uppercase truncate text-slate-800 dark:text-slate-200">{u.name}</td>
                             {weekDates.map(date => {
                                const logId = `${u.id}_${date}`;
                                const log = logs[logId];
                                const type = log?.type || 'normal';

                                // Las celdas unificadas son para tipos que NO permiten carga manual (Ausente, Feriado, Licencias)
                                // Comisión SI permite carga manual, así que se muestra como input normal pero con color diferente si se quiere, o input normal.
                                // REQ: "Comisión suma el tiempo que ingresa el personal". -> Mostramos inputs.

                                const showMergedCell = type !== 'normal' && type !== 'comision';
                                
                                if (showMergedCell) {
                                   return (
                                     <td key={date} colSpan={2} className="border-r border-b border-slate-300 p-0 relative group">
                                         <div className={`w-full h-full min-h-[30px] flex flex-col items-center justify-center font-black uppercase text-[9px] cursor-pointer 
                                            ${getColorForType(type)}`}>
                                            <span>{getLabelForType(type)}</span>
                                            {/* Si es feriado, mostramos que descuenta obj */}
                                            {type === 'feriado' && <span className="text-[7px] opacity-70">(-OBJ)</span>}
                                         </div>
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

                                // Normal o Comisión (Inputs Habilitados)
                                return (
                                   <React.Fragment key={date}>
                                      <td className={`border-r border-b border-slate-300 p-0 relative ${type === 'comision' ? 'bg-indigo-50' : ''}`}>
                                         <input 
                                            type="time" 
                                            className="w-full h-full min-h-[34px] px-1 text-center bg-transparent outline-none focus:bg-white focus:ring-2 focus:ring-primary/50 text-slate-700 dark:text-slate-300 font-medium"
                                            value={log?.entry || ''}
                                            onChange={(e) => handleUpdateCell(u.id, date, 'entry', e.target.value)}
                                            title={type === 'comision' ? 'Entrada Comisión' : 'Entrada'}
                                         />
                                      </td>
                                      <td className={`border-r border-b border-slate-300 p-0 relative ${type === 'comision' ? 'bg-indigo-50' : ''}`}>
                                         <input 
                                             type="time" 
                                             className="w-full h-full min-h-[34px] px-1 text-center bg-transparent outline-none focus:bg-white focus:ring-2 focus:ring-primary/50 text-slate-700 dark:text-slate-300 font-medium"
                                             value={log?.exit || ''}
                                             onChange={(e) => handleUpdateCell(u.id, date, 'exit', e.target.value)}
                                             title={type === 'comision' ? 'Salida Comisión' : 'Salida'}
                                         />
                                          {/* Indicador visual pequeño si es comisión */}
                                          {type === 'comision' && <div className="absolute top-0 right-0 size-2 bg-indigo-400 rounded-bl-full pointer-events-none"></div>}
                                      </td>
                                   </React.Fragment>
                                );
                             })}
                             
                             {/* TOTALES */}
                             <td className={`border-b border-slate-300 p-1 text-center font-black text-xs ${isDeficit ? 'bg-red-100 text-red-600' : 'bg-orange-50 text-orange-900'}`}>
                                <div className="flex flex-col items-center justify-center">
                                    <div className="flex items-center gap-1">
                                        {isDeficit && <span className="material-symbols-outlined text-[14px]">warning</span>}
                                        {minutesToTime(workedMins)}
                                    </div>
                                    <span className="text-[8px] opacity-70">/ {minutesToTime(targetMins)}</span>
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
             <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
                 <div className="bg-indigo-600 text-white px-6 py-4 flex justify-between items-center shrink-0">
                     <span className="text-xs font-black uppercase tracking-widest">Registrar Novedad / Licencia</span>
                     <button onClick={() => setIsNovedadOpen(false)}><span className="material-symbols-outlined">close</span></button>
                 </div>
                 <form onSubmit={handleSaveNovedad} className="p-6 space-y-4 overflow-y-auto">
                     
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
                             <option value="licencia_anual">Licencia Anual (0hs)</option>
                             <option value="licencia_ord">Licencia Ordinaria (0hs)</option>
                             <option value="licencia_extra">Licencia Extraordinaria (0hs)</option>
                             <option value="licencia_med">Licencia Médica (0hs)</option>
                             <option value="licencia_personal">Asuntos Personales (0hs)</option>
                             <option value="franco">Franco Compensatorio (0hs)</option>
                             <option disabled>──────────</option>
                             <option value="comision">Comisión de Servicio (Suma Hs)</option>
                             <option value="feriado">Feriado / Asueto (Baja Objetivo)</option>
                             <option value="ausente">Ausente / Falta (0hs)</option>
                             <option disabled>──────────</option>
                             <option value="normal">VOLVER A NORMAL / LIMPIAR</option>
                         </select>
                     </div>
                     
                     {/* INPUTS DE HORA PARA COMISIÓN */}
                     {novedadData.type === 'comision' && (
                        <div className="p-3 bg-indigo-50 border border-indigo-100 rounded">
                            <p className="text-[10px] font-black uppercase text-indigo-700 mb-2">Horario de Comisión</p>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[9px] font-bold text-slate-500 mb-1">Hora Inicio</label>
                                    <input type="time" className="w-full px-2 py-1 text-sm border rounded outline-none" value={novedadData.comisionStart} onChange={e => setNovedadData({...novedadData, comisionStart: e.target.value})} />
                                </div>
                                <div>
                                    <label className="block text-[9px] font-bold text-slate-500 mb-1">Hora Fin</label>
                                    <input type="time" className="w-full px-2 py-1 text-sm border rounded outline-none" value={novedadData.comisionEnd} onChange={e => setNovedadData({...novedadData, comisionEnd: e.target.value})} />
                                </div>
                            </div>
                        </div>
                     )}

                     <div>
                         <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Nota / Detalle</label>
                         <textarea className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none h-16" placeholder="Detalle opcional..." value={novedadData.notes} onChange={e => setNovedadData({...novedadData, notes: e.target.value})}></textarea>
                     </div>

                     <button type="submit" className="w-full py-3 bg-indigo-600 text-white text-xs font-black uppercase rounded shadow-lg hover:bg-indigo-700">Registrar Novedad</button>
                 </form>
             </div>
         </div>
      )}
    </div>
  );
};
