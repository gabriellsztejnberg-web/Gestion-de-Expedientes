
import React, { useState, useEffect } from 'react';
import { Sidebar } from '../components/Sidebar';
import { db } from '../firebase';
import { 
  collection, 
  onSnapshot, 
  query, 
  where,
  setDoc,
  doc
} from 'firebase/firestore';
import { User, AttendanceLog, AttendanceType } from '../types';

export const Asistencia: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [logs, setLogs] = useState<Record<string, AttendanceLog>>({});
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(getMonday(new Date()));
  const [todayLog, setTodayLog] = useState<AttendanceLog | null>(null);

  const currentUser: User = JSON.parse(localStorage.getItem('currentUser') || '{"id":"temp","name":"Usuario"}');
  const todayStr = new Date().toISOString().split('T')[0];

  // Helper para obtener el lunes de la semana actual
  function getMonday(d: Date) {
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
    const monday = new Date(d);
    monday.setDate(diff);
    return monday;
  }

  // Generar array de fechas de la semana (Lun-Vie)
  const weekDates = Array.from({length: 5}, (_, i) => {
    const d = new Date(currentWeekStart);
    d.setDate(d.getDate() + i);
    return d.toISOString().split('T')[0];
  });

  useEffect(() => {
    // 1. Obtener usuarios para la tabla
    const qUsers = query(collection(db, 'usuarios'));
    const unsubUsers = onSnapshot(qUsers, (snap) => {
      setUsers(snap.docs.map(d => d.data() as User));
    });

    // 2. Obtener logs de la semana seleccionada
    const startStr = weekDates[0];
    const endStr = weekDates[4];
    
    // Consultamos por rango de fechas (simple query)
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
      
      // Actualizar log del día actual para el panel de control
      const myLogId = `${currentUser.id}_${todayStr}`;
      if (logsMap[myLogId]) {
        setTodayLog(logsMap[myLogId]);
      } else {
        setTodayLog(null);
      }
    });

    return () => {
      unsubUsers();
      unsubLogs();
    };
  }, [currentWeekStart]);

  const handleTimeUpdate = async (field: 'entry' | 'exit' | 'breakOut' | 'breakIn', timeValue: string) => {
    const logId = `${currentUser.id}_${todayStr}`;
    const currentData = logs[logId] || {
      id: logId,
      userId: currentUser.id,
      userName: currentUser.name,
      userRole: currentUser.role === 'jefe' ? 'JER' : 'OP',
      date: todayStr,
      entry: '', exit: '', breakOut: '', breakIn: '',
      type: 'normal',
      totalHours: '00:00'
    };

    const newData = { ...currentData, [field]: timeValue };
    newData.totalHours = calculateDailyHours(newData.entry, newData.exit, newData.breakOut, newData.breakIn);

    await setDoc(doc(db, 'asistencia', logId), newData);
  };

  const handleTypeChange = async (type: AttendanceType) => {
     const logId = `${currentUser.id}_${todayStr}`;
     const currentData = logs[logId] || {
       id: logId,
       userId: currentUser.id,
       userName: currentUser.name,
       userRole: currentUser.role === 'jefe' ? 'JER' : 'OP',
       date: todayStr,
       entry: '', exit: '', breakOut: '', breakIn: '',
       type: 'normal',
       totalHours: '00:00'
     };
     
     await setDoc(doc(db, 'asistencia', logId), { ...currentData, type });
  };

  const calculateDailyHours = (inT: string, outT: string, breakOutT: string, breakInT: string) => {
    if (!inT || !outT) return '00:00';
    
    const toMinutes = (s: string) => {
       const [h, m] = s.split(':').map(Number);
       return h * 60 + m;
    };

    let totalMins = toMinutes(outT) - toMinutes(inT);

    // Restar break si existe
    if (breakOutT && breakInT) {
       totalMins -= (toMinutes(breakInT) - toMinutes(breakOutT));
    }

    if (totalMins < 0) totalMins = 0;

    const hh = Math.floor(totalMins / 60).toString().padStart(2, '0');
    const mm = (totalMins % 60).toString().padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const calculateWeeklyTotal = (userId: string) => {
    let totalMins = 0;
    weekDates.forEach(date => {
       const logId = `${userId}_${date}`;
       const log = logs[logId];
       if (log && log.totalHours) {
          const [h, m] = log.totalHours.split(':').map(Number);
          totalMins += (h * 60) + m;
       }
    });
    const hh = Math.floor(totalMins / 60).toString().padStart(2, '0');
    const mm = (totalMins % 60).toString().padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const changeWeek = (offset: number) => {
     const newDate = new Date(currentWeekStart);
     newDate.setDate(newDate.getDate() + (offset * 7));
     setCurrentWeekStart(newDate);
  };

  // Render helpers
  const getDayName = (dateStr: string) => {
     const days = ['DOMINGO', 'LUNES', 'MARTES', 'MIÉRCOLES', 'JUEVES', 'VIERNES', 'SÁBADO'];
     const d = new Date(dateStr + 'T12:00:00'); 
     return days[d.getDay()];
  };

  const formatShortDate = (dateStr: string) => {
     const [y, m, d] = dateStr.split('-');
     return `${d}/${m}`;
  };

  // Variables para renderizado fuera del JSX para evitar errores de parseo
  const currentTime = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  const displayDate = new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const weekStartDisplay = formatShortDate(weekDates[0]);
  const weekEndDisplay = formatShortDate(weekDates[4]);

  return (
    <div className="flex h-screen w-full bg-background-light dark:bg-background-dark overflow-hidden font-display">
      <Sidebar activePage="asistencia" />
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        
        {/* HEADER & CONTROLS */}
        <div className="p-6 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shrink-0">
           <div>
              <h1 className="text-slate-900 dark:text-white text-2xl font-black uppercase tracking-tight">Control de Horario</h1>
              <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">{displayDate}</p>
           </div>
           
           {/* FICHADA PANEL (Solo se muestra para el día actual) */}
           <div className="flex gap-2 p-2 bg-slate-100 dark:bg-slate-800 rounded-lg shadow-inner">
               <button 
                  onClick={() => handleTimeUpdate('entry', currentTime)}
                  disabled={!!todayLog?.entry}
                  className={`flex flex-col items-center justify-center w-24 h-20 rounded-md border-2 transition-all ${todayLog?.entry ? 'bg-green-100 border-green-300 text-green-800 opacity-50 cursor-not-allowed' : 'bg-white border-slate-200 hover:border-green-500 hover:text-green-600 shadow-sm'}`}
               >
                  <span className="material-symbols-outlined text-2xl mb-1">login</span>
                  <span className="text-[10px] font-black uppercase">Ingreso</span>
                  {todayLog?.entry && <span className="text-xs font-mono font-bold">{todayLog.entry}</span>}
               </button>

               <button 
                  onClick={() => handleTimeUpdate('breakOut', currentTime)}
                  disabled={!todayLog?.entry || !!todayLog?.breakOut}
                  className={`flex flex-col items-center justify-center w-24 h-20 rounded-md border-2 transition-all ${todayLog?.breakOut ? 'bg-yellow-100 border-yellow-300 text-yellow-800 opacity-50 cursor-not-allowed' : 'bg-white border-slate-200 hover:border-yellow-500 hover:text-yellow-600 shadow-sm'}`}
               >
                  <span className="material-symbols-outlined text-2xl mb-1">directions_run</span>
                  <span className="text-[10px] font-black uppercase">Salida</span>
                  {todayLog?.breakOut && <span className="text-xs font-mono font-bold">{todayLog.breakOut}</span>}
               </button>

               <button 
                  onClick={() => handleTimeUpdate('breakIn', currentTime)}
                  disabled={!todayLog?.breakOut || !!todayLog?.breakIn}
                  className={`flex flex-col items-center justify-center w-24 h-20 rounded-md border-2 transition-all ${todayLog?.breakIn ? 'bg-yellow-100 border-yellow-300 text-yellow-800 opacity-50 cursor-not-allowed' : 'bg-white border-slate-200 hover:border-yellow-500 hover:text-yellow-600 shadow-sm'}`}
               >
                  <span className="material-symbols-outlined text-2xl mb-1">input</span>
                  <span className="text-[10px] font-black uppercase">Regreso</span>
                  {todayLog?.breakIn && <span className="text-xs font-mono font-bold">{todayLog.breakIn}</span>}
               </button>

               <button 
                  onClick={() => handleTimeUpdate('exit', currentTime)}
                  disabled={!todayLog?.entry || !!todayLog?.exit}
                  className={`flex flex-col items-center justify-center w-24 h-20 rounded-md border-2 transition-all ${todayLog?.exit ? 'bg-red-100 border-red-300 text-red-800 opacity-50 cursor-not-allowed' : 'bg-white border-slate-200 hover:border-red-500 hover:text-red-600 shadow-sm'}`}
               >
                  <span className="material-symbols-outlined text-2xl mb-1">logout</span>
                  <span className="text-[10px] font-black uppercase">Egreso</span>
                  {todayLog?.exit && <span className="text-xs font-mono font-bold">{todayLog.exit}</span>}
               </button>
               
               {/* Selector de Estado */}
               <div className="flex flex-col justify-center gap-1 ml-2 pl-2 border-l border-slate-300 dark:border-slate-700">
                  <label className="text-[9px] font-bold uppercase text-slate-400">Novedad</label>
                  <select 
                    className="text-[10px] font-bold uppercase p-1 rounded bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 outline-none w-28"
                    value={todayLog?.type || 'normal'}
                    onChange={(e) => handleTypeChange(e.target.value as AttendanceType)}
                  >
                     <option value="normal">Normal</option>
                     <option value="comision">Comisión</option>
                     <option value="licencia_ord">Lic. Ordinaria</option>
                     <option value="licencia_med">Lic. Médica</option>
                     <option value="ausente">Ausente</option>
                  </select>
               </div>
           </div>
        </div>

        {/* WEEKLY TABLE */}
        <div className="flex-1 overflow-auto bg-white dark:bg-slate-900 p-6">
           
           <div className="flex justify-center items-center gap-4 mb-4">
              <button onClick={() => changeWeek(-1)} className="p-2 hover:bg-slate-100 rounded-full"><span className="material-symbols-outlined">chevron_left</span></button>
              <h2 className="text-sm font-black uppercase tracking-widest bg-slate-100 dark:bg-slate-800 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700">
                 SEMANA DEL {weekStartDisplay} AL {weekEndDisplay}
              </h2>
              <button onClick={() => changeWeek(1)} className="p-2 hover:bg-slate-100 rounded-full"><span className="material-symbols-outlined">chevron_right</span></button>
           </div>

           <div className="border border-slate-900 dark:border-slate-700 overflow-x-auto">
              <table className="w-full text-[10px] font-mono border-collapse min-w-[1200px]">
                 <thead>
                    {/* Header Row 1: Days */}
                    <tr>
                       <th className="border border-slate-400 p-1 bg-white dark:bg-slate-800 w-10"></th>
                       <th className="border border-slate-400 p-1 bg-white dark:bg-slate-800 w-40"></th>
                       {weekDates.map(date => (
                          <th key={date} colSpan={5} className="border border-slate-400 p-1 bg-blue-100 text-blue-900 text-center font-black uppercase">
                             {getDayName(date)} ({formatShortDate(date)})
                          </th>
                       ))}
                       <th className="border border-slate-400 p-1 bg-orange-500 text-white w-20 text-center font-black">TOTAL</th>
                    </tr>
                    {/* Header Row 2: Columns */}
                    <tr>
                       <th className="border border-slate-400 p-1 bg-white dark:bg-slate-800 text-left">JER</th>
                       <th className="border border-slate-400 p-1 bg-white dark:bg-slate-800 text-left">APELLIDO Y NOMBRE</th>
                       {weekDates.map(date => (
                          <React.Fragment key={date}>
                             <th className="border border-slate-400 p-1 bg-blue-50 text-center w-12">INGRESO</th>
                             <th className="border border-slate-400 p-1 bg-blue-50 text-center w-12">EGRESO</th>
                             <th className="border border-slate-400 p-1 bg-blue-50 text-center w-12">SALIDA</th>
                             <th className="border border-slate-400 p-1 bg-blue-50 text-center w-12">REGRESO</th>
                             <th className="border border-slate-400 p-1 bg-blue-50 text-center w-12 font-bold">TOTAL</th>
                          </React.Fragment>
                       ))}
                       <th className="border border-slate-400 p-1 bg-orange-100 text-orange-900 text-center font-bold">GENERAL</th>
                    </tr>
                 </thead>
                 <tbody>
                    {users.map(u => {
                       const roleShort = u.role === 'jefe' ? 'JEFE' : u.role === 'admin' ? 'ADM' : 'OP';
                       return (
                          <tr key={u.id} className="hover:bg-yellow-50 dark:hover:bg-yellow-900/10">
                             <td className="border border-slate-400 p-1 text-center font-bold">{roleShort}</td>
                             <td className="border border-slate-400 p-1 font-bold uppercase truncate">{u.name}</td>
                             {weekDates.map(date => {
                                const logId = `${u.id}_${date}`;
                                const log = logs[logId];
                                const bgColor = !log ? 'bg-yellow-200' : 
                                                log.type === 'ausente' ? 'bg-red-200' :
                                                log.type.includes('licencia') ? 'bg-purple-200' :
                                                log.type === 'comision' ? 'bg-indigo-200' :
                                                'bg-white dark:bg-slate-800';
                                
                                return (
                                   <React.Fragment key={date}>
                                      {log && log.type !== 'normal' ? (
                                         <td colSpan={5} className={`border border-slate-400 p-1 text-center font-bold uppercase text-[9px] ${bgColor} text-slate-700`}>
                                            {log.type.replace('_', ' ')}
                                         </td>
                                      ) : (
                                         <>
                                            <td className={`border border-slate-400 p-1 text-center ${bgColor}`}>{log?.entry || ''}</td>
                                            <td className={`border border-slate-400 p-1 text-center ${bgColor}`}>{log?.exit || ''}</td>
                                            <td className={`border border-slate-400 p-1 text-center ${bgColor}`}>{log?.breakOut || ''}</td>
                                            <td className={`border border-slate-400 p-1 text-center ${bgColor}`}>{log?.breakIn || ''}</td>
                                            <td className={`border border-slate-400 p-1 text-center font-bold bg-blue-50`}>{log?.totalHours || '00:00'}</td>
                                         </>
                                      )}
                                   </React.Fragment>
                                );
                             })}
                             <td className="border border-slate-400 p-1 text-center font-black bg-orange-100 text-orange-900">
                                {calculateWeeklyTotal(u.id)}
                             </td>
                          </tr>
                       );
                    })}
                 </tbody>
              </table>
           </div>
        </div>
      </div>
    </div>
  );
};
