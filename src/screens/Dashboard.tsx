
import React, { useState, useEffect } from 'react';
import { Sidebar } from '../components/Sidebar';
import { db } from '../firebase';
import { collection, onSnapshot, query, getDocs } from 'firebase/firestore';
import { Case, TimelineEvent, PlanEmergencia, EmpresaControlDerrame, BaseOperativa, IncidenteDerrame } from '../types';

export const Dashboard: React.FC = () => {
  const [cases, setCases] = useState<Case[]>([]);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [planes, setPlanes] = useState<PlanEmergencia[]>([]);
  const [derrames, setDerrames] = useState<EmpresaControlDerrame[]>([]);
  const [incidentes, setIncidentes] = useState<IncidenteDerrame[]>([]);

  useEffect(() => {
    // 1. Cargar Expedientes
    const qCases = query(collection(db, 'expedientes'));
    const unsubscribeCases = onSnapshot(qCases, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Case));
      setCases(docs);
    });

    // 2. Cargar Movimientos (Para contar tareas y planillas)
    const qEvents = query(collection(db, 'movimientos'));
    const unsubscribeEvents = onSnapshot(qEvents, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimelineEvent));
      setEvents(docs);
    });

    // 3. Cargar Planes
    const qPlanes = query(collection(db, 'planes'));
    const unsubscribePlanes = onSnapshot(qPlanes, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PlanEmergencia));
      setPlanes(docs);
    });

    // 4. Cargar Derrames (Empresas de control de derrames)
    const qDerrames1 = query(collection(db, 'empresas_derrames'));
    const qDerrames2 = query(collection(db, 'control_derrames')); // Legacy Support
    
    let allDerrames: EmpresaControlDerrame[] = [];
    const updateDerrames = (snap1: any, snap2: any) => {
        const d1 = snap1?.docs.map((d: any) => ({id: d.id, ...d.data()})) || [];
        const d2 = snap2?.docs.map((d: any) => ({id: d.id, ...d.data()})) || [];
        
        // Merge without duplicates by title/empresa or ID
        const map = new Map();
        [...d1, ...d2].forEach(d => {
            if (!map.has(d.empresa?.trim().toLowerCase())) {
                map.set(d.empresa?.trim().toLowerCase(), d);
            }
        });
        setDerrames(Array.from(map.values()));
    }
    
    let snap1: any = null;
    let snap2: any = null;
    const unsubD1 = onSnapshot(qDerrames1, s => { snap1 = s; updateDerrames(snap1, snap2); });
    const unsubD2 = onSnapshot(qDerrames2, s => { snap2 = s; updateDerrames(snap1, snap2); });

    // 5. Cargar Incidentes
    const qIncidentes = query(collection(db, 'incidentes'));
    const unsubscribeIncidentes = onSnapshot(qIncidentes, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as IncidenteDerrame));
      setIncidentes(docs);
    });

    return () => {
      unsubscribeCases();
      unsubscribeEvents();
      unsubscribePlanes();
      unsubD1();
      unsubD2();
      unsubscribeIncidentes();
    };
  }, []);

  // Helpers para lógica de días
  const getDays = (dateStr: string) => Math.floor((new Date().getTime() - new Date(dateStr).getTime()) / (1000 * 3600 * 24));

  // --- CÁLCULOS KPI SUPERIORES ---
  const activosOficina = cases.filter(c => c.instancia !== 'guarda' && c.instancia !== 'pase').length;
  const fueraOficina = cases.filter(c => c.instancia === 'pase').length;
  const urgentes = cases.filter(c => {
    if (c.instancia === 'guarda' || c.instancia === 'pase') return false;
    const d = getDays(c.ultimaModificacion);
    return d >= 15 && d <= 20;
  }).length;
  const estancados = cases.filter(c => {
    if (c.instancia === 'guarda' || c.instancia === 'pase') return false;
    const d = getDays(c.ultimaModificacion);
    return d > 20;
  }).length;
  const tareasPendientes = events.filter(e => e.isPending === true).length;

  const stats = [
    { 
      label: 'Activos en Oficina', 
      val: activosOficina, 
      sub: 'Gestión interna diaria', 
      icon: 'inventory', 
      color: 'blue' 
    },
    { 
      label: 'Fuera de Oficina', 
      val: fueraOficina, 
      sub: 'Pases externos activos', 
      icon: 'outbound', 
      color: 'slate' 
    },
    { 
      label: 'Urgentes (15-20d)', 
      val: urgentes, 
      sub: 'Atención inminente', 
      icon: 'warning', 
      color: 'yellow' 
    },
    { 
      label: 'Estancados (+20d)', 
      val: estancados, 
      sub: 'Requiere revisión', 
      icon: 'timer_off', 
      color: 'red' 
    },
    { 
      label: 'Tareas Pendientes', 
      val: tareasPendientes, 
      sub: 'Recordatorios activos', 
      icon: 'checklist', 
      color: 'orange' 
    },
  ];

  // --- CÁLCULOS SECCIÓN 2: Métricas Específicas ---
  // Histórico de planillas: Contamos movimientos que mencionen carga de planilla o planilla de análisis
  const planillaEvents = events.filter(e => 
    e.texto && (
      e.texto.toUpperCase().includes('PLANILLA')
    )
  );

  const planillasEmitidas = planillaEvents.length;

  // Estadísticas por Mes y Ordenanza
  const planillasPorMes: Record<string, number> = {};
  const planillasPorOrdenanza: Record<string, number> = {};

  planillaEvents.forEach(e => {
    // Por Mes
    const date = new Date(e.fecha);
    const monthKey = date.toLocaleString('es-AR', { month: 'long', year: 'numeric' });
    planillasPorMes[monthKey] = (planillasPorMes[monthKey] || 0) + 1;

    // Por Ordenanza
    const relatedCase = cases.find(c => c.id === e.expedienteId);
    const ordKey = relatedCase?.ordenanza || 'SIN ORDENANZA';
    planillasPorOrdenanza[ordKey] = (planillasPorOrdenanza[ordKey] || 0) + 1;
  });

  // Convertir a arrays para renderizar
  const monthlyStats = Object.entries(planillasPorMes)
    .map(([month, count]) => ({ month, count }))
    .reverse(); // Mostrar más recientes primero (o según orden cronológico si se prefiere)

  const ordenanzaStats = Object.entries(planillasPorOrdenanza)
    .map(([ord, count]) => ({ ord, count }))
    .sort((a, b) => b.count - a.count);
  
  // Stock actual de Guarda
  const enGuarda = cases.filter(c => c.instancia === 'guarda').length;
  
  // Stock actual de Pases (ya calculado en fueraOficina, pero lo usamos para la visualización detallada)
  const enPase = fueraOficina;

  // --- CÁLCULOS SECCIÓN 3: Carga por Usuario ---
  const userLoad: Record<string, number> = {};
  
  cases.forEach(c => {
    // Solo contamos expedientes activos asignados a personas (no buzón, no guarda, no pase)
    if (c.instancia !== 'guarda' && c.instancia !== 'pase' && c.asignadoA !== 'buzon') {
       const nombre = c.asignadoANombre || 'Desconocido';
       userLoad[nombre] = (userLoad[nombre] || 0) + 1;
    }
  });

  // Convertir a array y ordenar
  const userLoadArray = Object.entries(userLoad)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  const maxLoad = Math.max(...userLoadArray.map(u => u.count), 1); // Para escalar la barra

  // --- METRICAS MARINOS/BARRERAS Y PLANES ---
  let totalBarreras = 0;
  derrames.forEach(d => {
    (d.basesOperativas || []).forEach(bo => {
      const b1 = parseInt(String(bo.cantidadBarreras || '0'), 10) || 0;
      const b2 = parseInt(String(bo.barrerasPuerto || '0'), 10) || 0;
      const b3 = parseInt(String(bo.barrerasFluvial || '0'), 10) || 0;
      const b4 = parseInt(String(bo.barrerasMaritima || '0'), 10) || 0;
      totalBarreras += (b1 || (b2 + b3 + b4));
    });
  });

  const now = new Date();
  const ninetyDaysFromNow = new Date();
  ninetyDaysFromNow.setDate(now.getDate() + 90);

  const statsPorAnexo: Record<string, { porVencer: number, vencidos: number, vigentes: number, label: string }> = {
     'anexo_15': { porVencer: 0, vencidos: 0, vigentes: 0, label: 'Anexo 15 (Instalaciones)' },
     'anexo_16': { porVencer: 0, vencidos: 0, vigentes: 0, label: 'Anexo 16 (Buques)' },
     'derrames': { porVencer: 0, vencidos: 0, vigentes: 0, label: 'Bases y Derrames' }
  };
  
  const causasGlobales = {
     vencidoDispo: 0,
     vencidoConv: 0,
     porVencerDispo: 0,
     porVencerConv: 0,
  };

  const unificarConDerrames = [...planes];
  derrames.forEach(d => {
    if (!unificarConDerrames.find(p => p.id === d.id)) {
      unificarConDerrames.push({
         ...d,
         anexo: 'derrames',
         estado: 'vigente',
         convalidaciones: {
           anio1: d.convalidacionesDetalle?.anio1?.fecha,
           anio2: d.convalidacionesDetalle?.anio2?.fecha
         }
      } as any);
    }
  });

  let planesDesafectados = 0;
  let empresasTotalesActivas = 0;

  unificarConDerrames.forEach(p => {
     if (p.estado === 'desafectado') {
         planesDesafectados++;
         return;
     }
     
     empresasTotalesActivas++;
     
     let ax = (p.anexo || 'desconocido').toString().toLowerCase().trim();
     if (ax.includes('15') || ax === 'anexo 15') ax = 'anexo_15';
     else if (ax.includes('16') || ax === 'anexo 16') ax = 'anexo_16';
     else if (ax.includes('17') || ax === 'anexo 17') ax = 'anexo_17';
     else if (ax.includes('18') || ax === 'anexo 18') ax = 'anexo_18';
     else if (ax.includes('19') || ax === 'anexo 19') ax = 'anexo_19';
     else if (ax.includes('20') || ax === 'anexo 20') ax = 'anexo_20';
     else if (ax === 'general') ax = 'desconocido';

     if (!statsPorAnexo[ax]) {
       let label = ax.toUpperCase();
       if (ax === 'anexo_15') label = 'ANEXO 15 (Instalaciones)';
       if (ax === 'anexo_16') label = 'ANEXO 16 (Buques)';
       if (ax === 'anexo_17') label = 'ANEXO 17 (Termap/Oil)';
       if (ax === 'anexo_18') label = 'ANEXO 18 (Buques/Barcazas)';
       if (ax === 'anexo_19') label = 'ANEXO 19 (Puertos Ref)';
       if (ax === 'anexo_20') label = 'ANEXO 20 (Plataformas)';
       if (ax === 'derrames') label = 'Bases y Derrames';
       statsPorAnexo[ax] = { porVencer: 0, vencidos: 0, vigentes: 0, label };
     }
     
     let isVencido = false;
     let isPorVencer = false;
     let isVencidoDispo = false;
     let isPorVencerDispo = false;
     let isVencidoConv = false;
     let isPorVencerConv = false;
     
     if (p.vencimiento && p.vencimiento !== '-' && p.vencimiento.length >= 5) {
      const vDate = new Date(p.vencimiento);
      if (!isNaN(vDate.getTime())) {
        if (vDate < now) { isVencido = true; isVencidoDispo = true; }
        else if (vDate <= ninetyDaysFromNow) { isPorVencer = true; isPorVencerDispo = true; }
      }
    }

    if (p.convalidaciones && ax !== 'anexo_15') {
      let calcVencida = false;
      let calcPorVencer = false;
      let pendingConvEvaluated = false;

      const convEntries = Object.entries(p.convalidaciones).sort((a, b) => a[0].localeCompare(b[0]));

      for (const [key, dateStr] of convEntries) {
        if (typeof dateStr === 'string' && dateStr && dateStr !== '-' && dateStr.length >= 5) {
          const cDate = new Date(dateStr);
          if (!isNaN(cDate.getTime())) {
            const detalle = p.convalidacionesDetalle?.[key as keyof typeof p.convalidaciones];
            const isFulfilled = !!(detalle?.nroIF && detalle?.nroExpediente);
            
            if (!isFulfilled && !pendingConvEvaluated) {
              pendingConvEvaluated = true;
              if (cDate < now) calcVencida = true;
              else if (cDate <= ninetyDaysFromNow) calcPorVencer = true;
            }
          }
        }
      }
      
      if (calcVencida) { isVencido = true; isVencidoConv = true; }
      else if (calcPorVencer && !isVencido) { isPorVencer = true; isPorVencerConv = true; }
    }

    if (isVencido) {
       statsPorAnexo[ax].vencidos++;
       if (isVencidoDispo) causasGlobales.vencidoDispo++;
       else causasGlobales.vencidoConv++;
    }
    else if (isPorVencer) {
       statsPorAnexo[ax].porVencer++;
       if (isPorVencerDispo) causasGlobales.porVencerDispo++;
       else causasGlobales.porVencerConv++;
    }
    else statsPorAnexo[ax].vigentes++;
  });

  const totalesGlobales = {
     vigentes: Object.values(statsPorAnexo).reduce((acc, curr) => acc + curr.vigentes, 0),
     porVencer: Object.values(statsPorAnexo).reduce((acc, curr) => acc + curr.porVencer, 0),
     vencidos: Object.values(statsPorAnexo).reduce((acc, curr) => acc + curr.vencidos, 0),
  };

  return (
    <div className="flex h-screen w-full bg-background-light dark:bg-background-dark">
      <Sidebar activePage="dashboard" />
      <main className="flex-1 flex flex-col h-full overflow-y-auto p-6 md:p-10">
        <div className="max-w-[1600px] w-full mx-auto">
          <div className="mb-8">
            <h2 className="text-slate-900 dark:text-white text-3xl font-black uppercase tracking-tight flex items-center gap-3">
              <span className="bg-primary/10 p-2 rounded-lg material-symbols-outlined text-primary">analytics</span>
              Tablero de Control
            </h2>
            <p className="text-slate-500 dark:text-slate-400 font-bold text-sm">Resumen del control nacional de incidentes y preparación</p>
          </div>

          {/* NUEVO PANEL: SISTEMA NACIONAL */}
          <div className="mb-10">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">Sistema Nacional de Lucha contra Derrames</h3>
            
            {/* KPI INCIDENTES */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
               <div className="bg-red-600 rounded-xl p-6 text-white shadow-lg relative overflow-hidden group border border-red-500">
                  <div className="absolute right-[-20px] top-[-20px] opacity-20 transform rotate-12 group-hover:rotate-0 transition-all duration-500">
                     <span className="material-symbols-outlined text-[100px]">warning</span>
                  </div>
                  <h3 className="text-4xl font-black mb-1 relative z-10">{incidentes.filter(i => i.estado === 'en_curso').length}</h3>
                  <p className="text-xs font-bold uppercase tracking-widest opacity-90 relative z-10">Derrames en Curso</p>
                  <p className="text-[10px] opacity-70 mt-2 relative z-10 text-red-100">Siniestros activos</p>
               </div>
               
               <div className="bg-white dark:bg-[#15202b] rounded-xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                  <h3 className="text-4xl font-black text-slate-900 dark:text-white mb-1">{incidentes.filter(i => i.anio === new Date().getFullYear()).length}</h3>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Acumulado {new Date().getFullYear()}</p>
                  <p className="text-[10px] text-slate-400 mt-2 font-bold">Total histórico: {incidentes.length}</p>
               </div>
               
               <div className="bg-white dark:bg-[#15202b] rounded-xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                  <h3 className="text-4xl font-black text-slate-900 dark:text-white mb-1">
                     ~{Number(incidentes.reduce((acc, curr) => acc + (curr.volumenEstimado || 0), 0).toFixed(2)).toLocaleString('es-AR')}
                  </h3>
                  <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Vol. Estimado (m3/l)</p>
                  <p className="text-[10px] text-slate-400 mt-2 font-bold">Declarados en el sistema</p>
               </div>
               
               <div className="bg-primary rounded-xl p-6 text-white shadow-lg relative overflow-hidden group">
                  <div className="absolute right-[-20px] top-[-20px] opacity-20 transform rotate-12 group-hover:rotate-0 transition-all duration-500">
                     <span className="material-symbols-outlined text-[100px]">waves</span>
                  </div>
                  <h3 className="text-4xl font-black mb-1 relative z-10">{totalBarreras.toLocaleString('es-AR')} <span className="text-xl">m</span></h3>
                  <p className="text-xs font-bold uppercase tracking-widest opacity-80 relative z-10">Barreras Desplegables</p>
                  <p className="text-[10px] opacity-60 mt-2 relative z-10">Capacidad nacional instalada</p>
               </div>
            </div>

            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mt-8 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">Estado de Planes y Convalidaciones</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">

               <div className="bg-white dark:bg-[#15202b] rounded-xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm relative overflow-hidden">
                  <div className="flex justify-between items-start">
                     <h3 className="text-4xl font-black text-slate-900 dark:text-white mb-1">{totalesGlobales.vigentes}</h3>
                     {planesDesafectados > 0 && (
                       <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] px-2 py-1 rounded font-bold uppercase" title={`${planesDesafectados} planes desafectados no sumados`}>
                          +{planesDesafectados} Inact.
                       </span>
                     )}
                  </div>
                  <p className="text-xs font-bold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Planes Vigentes</p>
                  <p className="text-[10px] text-slate-500 mt-2">Documentación activa actual</p>
               </div>

               <div className="bg-white dark:bg-[#15202b] rounded-xl p-6 border border-orange-200 dark:border-orange-900/30 border-l-4 border-l-orange-500 shadow-sm relative overflow-hidden flex flex-col justify-between">
                  <div>
                    <h3 className="text-4xl font-black text-slate-900 dark:text-white mb-1">{totalesGlobales.porVencer}</h3>
                    <p className="text-xs font-bold uppercase tracking-widest text-orange-600 dark:text-orange-400">Por Vencer (90d)</p>
                  </div>
                  <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex-1">
                      <p className="text-[10px] text-slate-500 uppercase font-black"><span className="text-orange-600">{causasGlobales.porVencerDispo}</span> DISPOSICIÓN</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] text-slate-500 uppercase font-black"><span className="text-orange-600">{causasGlobales.porVencerConv}</span> CONVAL.</p>
                    </div>
                  </div>
               </div>

               <div className="bg-white dark:bg-[#15202b] rounded-xl p-6 border border-red-200 dark:border-red-900/30 border-l-4 border-l-red-500 shadow-sm relative overflow-hidden flex flex-col justify-between">
                  <div>
                    <h3 className="text-4xl font-black text-slate-900 dark:text-white mb-1">{totalesGlobales.vencidos}</h3>
                    <p className="text-xs font-bold uppercase tracking-widest text-red-600 dark:text-red-400">Planes Vencidos</p>
                  </div>
                  <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex-1">
                      <p className="text-[10px] text-slate-500 uppercase font-black"><span className="text-red-600">{causasGlobales.vencidoDispo}</span> DISPOSICIÓN</p>
                    </div>
                    <div className="flex-1">
                      <p className="text-[10px] text-slate-500 uppercase font-black"><span className="text-red-600">{causasGlobales.vencidoConv}</span> CONVAL.</p>
                    </div>
                  </div>
               </div>
            </div>

            {/* ESTADO POR ANEXO */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
               {Object.entries(statsPorAnexo).map(([key, stat]) => {
                 const total = stat.vigentes + stat.porVencer + stat.vencidos;
                 if (total === 0) return null;
                 return (
                 <div key={key} className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <p className="text-[10px] font-black uppercase text-slate-500 mb-3">{stat.label}</p>
                    <div className="flex gap-2">
                       <div className="flex-1 text-center bg-slate-50 dark:bg-slate-800/50 rounded p-2">
                          <p className="text-lg font-black text-slate-700 dark:text-slate-200">{stat.vigentes}</p>
                          <p className="text-[8px] font-bold uppercase text-emerald-500">Vigentes</p>
                       </div>
                       <div className="flex-1 text-center bg-slate-50 dark:bg-slate-800/50 rounded p-2">
                          <p className="text-lg font-black text-slate-700 dark:text-slate-200">{stat.porVencer}</p>
                          <p className="text-[8px] font-bold uppercase text-orange-500">Por Vencer</p>
                       </div>
                       <div className="flex-1 text-center bg-slate-50 dark:bg-slate-800/50 rounded p-2">
                          <p className="text-lg font-black text-slate-700 dark:text-slate-200">{stat.vencidos}</p>
                          <p className="text-[8px] font-bold uppercase text-red-500">Vencidos</p>
                       </div>
                    </div>
                 </div>
               )})}
            </div>
          </div>

          <h3 className="text-xs font-black uppercase tracking-widest text-slate-500 mb-4 border-b border-slate-200 dark:border-slate-800 pb-2">Gestión de Expedientes</h3>
          {/* FILA 1: KPI PRINCIPALES */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            {stats.map((stat, i) => (
              <div key={i} className={`flex flex-col p-4 rounded-xl bg-white dark:bg-[#15202b] border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md border-l-4 ${
                  stat.color === 'red' ? 'border-l-red-500' : 
                  stat.color === 'yellow' ? 'border-l-yellow-500' : 
                  stat.color === 'blue' ? 'border-l-blue-500' : 
                  stat.color === 'orange' ? 'border-l-orange-500' :
                  'border-l-slate-500'
              }`}>
                <div className="flex justify-between items-start mb-3">
                  <p className="text-slate-500 dark:text-slate-400 text-[9px] font-black uppercase tracking-widest truncate pr-2">{stat.label}</p>
                  <span className={`material-symbols-outlined ${
                      stat.color === 'red' ? 'text-red-500' : 
                      stat.color === 'yellow' ? 'text-yellow-500' : 
                      stat.color === 'blue' ? 'text-blue-500' : 
                      stat.color === 'orange' ? 'text-orange-500' :
                      'text-slate-500'
                  }`}>{stat.icon}</span>
                </div>
                <h3 className={`text-3xl font-black text-slate-900 dark:text-white mb-1`}>{stat.val}</h3>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wide truncate">{stat.sub}</p>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
             
             {/* COLUMNA 1: ESTADISTICAS DE FLUJO */}
             <div className="lg:col-span-2 space-y-8">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 h-max">
                    {/* Planillas Emitidas */}
                    <div className="bg-indigo-600 rounded-xl p-6 text-white shadow-lg relative overflow-hidden group">
                      <div className="absolute right-[-20px] top-[-20px] opacity-20 transform rotate-12 group-hover:rotate-0 transition-all duration-500">
                          <span className="material-symbols-outlined text-[120px]">description</span>
                      </div>
                      <h3 className="text-4xl font-black mb-1 relative z-10">{planillasEmitidas}</h3>
                      <p className="text-xs font-bold uppercase tracking-widest opacity-80 relative z-10">Planillas Emitidas</p>
                      <p className="text-[10px] opacity-60 mt-2 relative z-10">Total Histórico</p>
                    </div>

                    {/* En Guarda */}
                    <div className="bg-slate-800 rounded-xl p-6 text-white shadow-lg relative overflow-hidden group">
                      <div className="absolute right-[-20px] top-[-20px] opacity-20 transform rotate-12 group-hover:rotate-0 transition-all duration-500">
                          <span className="material-symbols-outlined text-[120px]">archive</span>
                      </div>
                      <h3 className="text-4xl font-black mb-1 relative z-10">{enGuarda}</h3>
                      <p className="text-xs font-bold uppercase tracking-widest opacity-80 relative z-10">En Guarda Temp.</p>
                      <p className="text-[10px] opacity-60 mt-2 relative z-10">Stock Actual en Archivo</p>
                    </div>

                    {/* Otras Oficinas */}
                    <div className="bg-slate-100 dark:bg-slate-800 rounded-xl p-6 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 shadow-sm relative overflow-hidden group">
                      <div className="absolute right-[-20px] top-[-20px] opacity-5 transform rotate-12 group-hover:rotate-0 transition-all duration-500">
                          <span className="material-symbols-outlined text-[120px]">domain</span>
                      </div>
                      <h3 className="text-4xl font-black mb-1 relative z-10">{enPase}</h3>
                      <p className="text-xs font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 relative z-10">En Otras Oficinas</p>
                      <p className="text-[10px] text-slate-400 mt-2 relative z-10">Pases Externos Activos</p>
                    </div>
                </div>

                {/* NUEVAS ESTADISTICAS: MES Y ORDENANZA */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Por Mes */}
                    <div className="bg-white dark:bg-[#15202b] p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="material-symbols-outlined text-indigo-500">calendar_month</span>
                            <h3 className="text-xs font-black uppercase text-slate-900 dark:text-white">Planillas por Mes</h3>
                        </div>
                        <div className="space-y-3">
                            {monthlyStats.length > 0 ? monthlyStats.map((s, i) => (
                                <div key={i} className="flex justify-between items-center border-b border-slate-50 dark:border-slate-800 pb-2 last:border-0">
                                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase">{s.month}</span>
                                    <span className="bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded text-[10px] font-black">{s.count}</span>
                                </div>
                            )) : (
                                <p className="text-center py-4 text-slate-400 italic text-[10px]">Sin datos mensuales</p>
                            )}
                        </div>
                    </div>

                    {/* Por Ordenanza */}
                    <div className="bg-white dark:bg-[#15202b] p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <span className="material-symbols-outlined text-emerald-500">gavel</span>
                            <h3 className="text-xs font-black uppercase text-slate-900 dark:text-white">Planillas por Ordenanza</h3>
                        </div>
                        <div className="space-y-3">
                            {ordenanzaStats.length > 0 ? ordenanzaStats.map((s, i) => (
                                <div key={i} className="group">
                                    <div className="flex justify-between text-[10px] font-bold uppercase mb-1">
                                        <span className="text-slate-600 dark:text-slate-400">{s.ord}</span>
                                        <span className="text-emerald-500">{s.count}</span>
                                    </div>
                                    <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                        <div 
                                            className="bg-emerald-500 h-1.5 rounded-full" 
                                            style={{ width: `${(s.count / planillasEmitidas) * 100}%` }}
                                        ></div>
                                    </div>
                                </div>
                            )) : (
                                <p className="text-center py-4 text-slate-400 italic text-[10px]">Sin datos por ordenanza</p>
                            )}
                        </div>
                    </div>
                </div>
             </div>

             {/* COLUMNA 2: CARGA POR USUARIO */}
             <div className="bg-white dark:bg-[#15202b] p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm h-full lg:row-span-2">
                <div className="flex items-center gap-2 mb-6 border-b border-slate-100 dark:border-slate-800 pb-4">
                   <span className="material-symbols-outlined text-primary">person</span>
                   <div>
                      <h3 className="text-sm font-black uppercase text-slate-900 dark:text-white">Expedientes por Usuario</h3>
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Carga activa individual</p>
                   </div>
                </div>
                
                <div className="space-y-5 overflow-y-auto max-h-[400px] pr-2">
                   {userLoadArray.length > 0 ? userLoadArray.map((user, idx) => (
                      <div key={idx} className="group">
                         <div className="flex justify-between text-xs font-bold uppercase mb-1.5">
                            <span className="text-slate-700 dark:text-slate-300">{user.name}</span>
                            <span className="text-primary">{user.count}</span>
                         </div>
                         <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
                            <div 
                               className="bg-primary h-2.5 rounded-full transition-all duration-1000 group-hover:bg-blue-400 relative overflow-hidden" 
                               style={{ width: `${(user.count / maxLoad) * 100}%` }}
                            >
                               <div className="absolute top-0 left-0 w-full h-full bg-white/20 animate-pulse"></div>
                            </div>
                         </div>
                      </div>
                   )) : (
                      <div className="text-center py-10 text-slate-400 italic text-xs">
                         Todos los expedientes están en Buzón, Guarda o Pase.
                      </div>
                   )}
                </div>

                <div className="mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
                   <p className="text-[9px] text-slate-400 text-center italic">
                      * No incluye expedientes en buzón grupal ni archivados.
                   </p>
                </div>
             </div>

          </div>
        </div>
      </main>
    </div>
  );
};
