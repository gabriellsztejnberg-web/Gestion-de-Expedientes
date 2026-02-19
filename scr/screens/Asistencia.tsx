
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
      if (diff < 0) diff = 0; // No permitir negativos por ahora
      return minutesToTime(diff);
  };

  const calculateWeeklyTotalMinutes = (userId: string) => {
    let totalMins = 0;
    weekDates.forEach(date => {
       const logId = `${userId}_${date}`;
       const log = logs[logId];
       if (log && log.entry && log.exit && log.type === 'normal') {
          totalMins += toMinutes(log.exit) - toMinutes(log.entry);
       }
       // Aquí podrías sumar horas fijas por licencia si fuera necesario
    });
    return totalMins;
  };

  // --- ACTIONS ---

  const handleUpdateCell = async (userId: string, date: string, field: 'entry' | 'exit', value: string) => {
    const logId = `${userId}_${date}`;
    // Buscamos el usuario dueño del registro para guardar su nombre/rol correctamente si es un registro nuevo
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
    // Recalcular total horas si tenemos ambos
    if (newData.entry && newData.exit) {
        newData.totalHours = calculateDailyDiff(newData.entry, newData.exit);
    } else {
        newData.totalHours = '00:00';
    }

    await setDoc(doc(db, 'asistencia', logId), newData);
  };

  const handleTypeChange = async (userId: string, date: string, type: AttendanceType) => {
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
      await setDoc(doc(db, 'asistencia', logId), { ...currentData, type });
  };

  const handleQuickClock = async (type: 'entry' | 'exit') => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
      await handleUpdateCell(currentUser.id, todayStr, type, timeStr);
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
  // Asumiendo jornada de 8 horas x 5 días = 40 horas = 2400 mins
  const weeklyTargetMins = 40 * 60; 
  const progressPercent = Math.min((myTotalMinutes / weeklyTargetMins) * 100, 100);

  const displayDate = new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const weekStartDisplay = formatShortDate(weekDates[0]);
  const weekEndDisplay = formatShortDate(weekDates[4]);

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
                            <span className="text-2xl font-black text-slate-900 dark:text-white">{myTotalHoursStr}</span>
                            <span className="text-[10px] font-bold text-slate-400">/ 40:00 hs</span>
                        </div>
                        <div className="w-32 h-1.5 bg-slate-200 rounded-full mt-2 overflow-hidden">
                            <div className="h-full bg-primary" style={{ width: `${progressPercent}%` }}></div>
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
              <button onClick={() => changeWeek(-1)} className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded-md transition-colors"><span className="material-symbols-outlined text-slate-500">chevron_left</span></button>
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-700 dark:text-slate-300">
                 SEMANA DEL {weekStartDisplay} AL {weekEndDisplay}
              </h2>
              <button onClick={() => changeWeek(1)} className="p-1 hover:bg-white dark:hover:bg-slate-700 rounded-md transition-colors"><span className="material-symbols-outlined text-slate-500">chevron_right</span></button>
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
                       <th className="bg-orange-500 text-white w-24 text-center font-black border-b border-slate-300">RESUMEN</th>
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
                       // Es mi fila? (Para resaltar)
                       const isMe = u.id === currentUser.id;

                       return (
                          <tr key={u.id} className={`hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-colors ${isMe ? 'bg-blue-50/30' : ''}`}>
                             <td className="border-r border-b border-slate-300 p-1 text-center font-bold text-slate-400">{roleShort}</td>
                             <td className="border-r border-b border-slate-300 p-2 font-bold uppercase truncate text-slate-800 dark:text-slate-200">{u.name}</td>
                             {weekDates.map(date => {
                                const logId = `${u.id}_${date}`;
                                const log = logs[logId];
                                const isAbsent = log?.type === 'ausente';
                                const isLicense = log?.type && log.type.includes('licencia');
                                const isComision = log?.type === 'comision';
                                
                                // Si hay una novedad especial (Licencia, etc), mostramos una celda unificada
                                if (log && log.type !== 'normal') {
                                   return (
                                     <td key={date} colSpan={2} className="border-r border-b border-slate-300 p-0 relative group">
                                         <div className={`w-full h-full min-h-[30px] flex items-center justify-center font-black uppercase text-[9px] cursor-pointer 
                                            ${isAbsent ? 'bg-red-200 text-red-800' : 
                                              isLicense ? 'bg-purple-200 text-purple-800' : 
                                              isComision ? 'bg-indigo-200 text-indigo-800' : 'bg-slate-200'}`}>
                                            {log.type.replace('_', ' ')}
                                         </div>
                                         {/* Al hacer click o hover, permitir cambiar a normal */}
                                         <select 
                                            className="absolute inset-0 opacity-0 cursor-pointer"
                                            value={log.type}
                                            onChange={(e) => handleTypeChange(u.id, date, e.target.value as AttendanceType)}
                                         >
                                            <option value="normal">Normal</option>
                                            <option value="comision">Comisión</option>
                                            <option value="licencia_ord">Lic. Ordinaria</option>
                                            <option value="licencia_med">Lic. Médica</option>
                                            <option value="ausente">Ausente</option>
                                         </select>
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
                                          {/* Solo mostramos el input de salida si hay entrada, o si ya hay algo escrito, para limpieza visual */}
                                         <div className="relative w-full h-full">
                                            <input 
                                                type="time" 
                                                className="w-full h-full min-h-[34px] px-1 text-center bg-transparent outline-none focus:bg-white focus:ring-2 focus:ring-primary/50 text-slate-700 dark:text-slate-300 font-medium"
                                                value={log?.exit || ''}
                                                onChange={(e) => handleUpdateCell(u.id, date, 'exit', e.target.value)}
                                            />
                                            {/* Selector de tipo invisible encima si se quiere cambiar a licencia click derecho o algo, por ahora usamos un boton pequeño en la celda vacia? No, mejor dejarlo simple. 
                                                Agregamos un pequeño indicador si está vacio para cambiar estado.
                                            */}
                                            {(!log?.entry && !log?.exit) && (
                                                <select 
                                                    className="absolute top-0 right-0 w-4 h-full opacity-0 cursor-pointer"
                                                    onChange={(e) => handleTypeChange(u.id, date, e.target.value as AttendanceType)}
                                                    value="normal"
                                                    title="Cambiar estado (Licencia/Comisión)"
                                                >
                                                    <option value="normal">N</option>
                                                    <option value="comision">Comisión</option>
                                                    <option value="licencia_ord">Lic. Ord</option>
                                                    <option value="licencia_med">Lic. Med</option>
                                                    <option value="ausente">Ausente</option>
                                                </select>
                                            )}
                                            {(!log?.entry && !log?.exit) && (
                                                <div className="absolute top-1 right-1 pointer-events-none text-slate-300">
                                                    <span className="material-symbols-outlined text-[10px]">more_vert</span>
                                                </div>
                                            )}
                                         </div>
                                      </td>
                                   </React.Fragment>
                                );
                             })}
                             <td className="border-b border-slate-300 p-1 text-center font-black bg-orange-50 text-orange-900 text-xs">
                                {minutesToTime(calculateWeeklyTotalMinutes(u.id))}
                             </td>
                          </tr>
                       );
                    })}
                 </tbody>
              </table>
           </div>
           
           <div className="mt-4 text-[10px] text-slate-500 italic">
               * Nota: Puede editar manualmente los horarios haciendo click sobre la hora. Para marcar Licencias o Ausencias, utilice el menú desplegable (3 puntos) en las celdas vacías.
           </div>
        </div>
      </div>
    </div>
  );
};

