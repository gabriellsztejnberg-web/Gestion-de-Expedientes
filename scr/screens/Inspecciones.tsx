
import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router';
import { Sidebar } from '../components/Sidebar';
import { db } from '../firebase';
import { collection, onSnapshot, addDoc, updateDoc, doc, deleteDoc, query, orderBy, getDoc, getDocs, where } from 'firebase/firestore';
import { Inspeccion, Case, Auditor, User, ResultadoInspeccion, TimelineEvent, PlanEmergencia } from '../types';
import { draftTechnicalReport } from '../services/geminiService'; // Importamos el servicio IA

export const Inspecciones: React.FC = () => {
  const location = useLocation();
  const [inspecciones, setInspecciones] = useState<Inspeccion[]>([]);
  const [auditores, setAuditores] = useState<Auditor[]>([]);
  const [planes, setPlanes] = useState<PlanEmergencia[]>([]);
  const [movimientos, setMovimientos] = useState<TimelineEvent[]>([]); 
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingInsp, setEditingInsp] = useState<Partial<Inspeccion>>({});
  const [isSubsanarModalOpen, setIsSubsanarModalOpen] = useState(false);
  const [subsanarTarget, setSubsanarTarget] = useState<Inspeccion | null>(null);
  const [certSubsanacion, setCertSubsanacion] = useState('');
  const [planillaSubsanacion, setPlanillaSubsanacion] = useState(''); 
  const [isSameAuditor, setIsSameAuditor] = useState(true);
  const [subsanarAuditorId, setSubsanarAuditorId] = useState('');
  const [isHistorialModalOpen, setIsHistorialModalOpen] = useState(false);
  const [historyTarget, setHistoryTarget] = useState<Inspeccion | null>(null);
  
  // Estado para Loading de IA
  const [isAiLoading, setIsAiLoading] = useState(false);

  const getUser = () => {
    try {
      return JSON.parse(localStorage.getItem('currentUser') || '{"id":"temp","name":"Usuario","role":"operador"}');
    } catch {
      return { id:"temp", name:"Usuario", role:"operador" };
    }
  };
  const currentUser: User = getUser();

  useEffect(() => {
    if (location.state?.prefill) {
      const prefillCase = location.state.prefill as Case;
      setEditingInsp({
        fecha: new Date().toISOString().split('T')[0],
        expedienteNumero: prefillCase.numero,
        expedienteId: prefillCase.id, 
        ubicacion: prefillCase.empresa, 
        tipo: 'INICIAL',
        resultado: 'CON PENDIENTES',
        jurisdiccion: ''
      });
      setIsModalOpen(true);
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  useEffect(() => {
    const qInsp = query(collection(db, 'inspecciones'), orderBy('fecha', 'desc'));
    const unsubscribeInsp = onSnapshot(qInsp, (snapshot) => {
      const docs = snapshot.docs.map(doc => {
          const data = doc.data();
          let fechaStr = "";
          if (data.fecha && typeof data.fecha.toDate === 'function') {
              fechaStr = data.fecha.toDate().toISOString().split('T')[0];
          } else if (typeof data.fecha === 'string') {
              fechaStr = data.fecha;
          } else {
              fechaStr = new Date().toISOString().split('T')[0];
          }

          return { 
              id: doc.id, 
              ...data,
              fecha: fechaStr,
              expedienteNumero: String(data.expedienteNumero || ''),
              auditorNombre: String(data.auditorNombre || ''),
              ubicacion: String(data.ubicacion || ''),
              jurisdiccion: String(data.jurisdiccion || ''),
              tipo: String(data.tipo || 'INICIAL'),
              resultado: String(data.resultado || 'CON PENDIENTES'),
              nroInforme: data.nroInforme ? String(data.nroInforme) : undefined,
              nroCertificado: data.nroCertificado ? String(data.nroCertificado) : undefined,
              nroDisposicion: data.nroDisposicion ? String(data.nroDisposicion) : undefined,
          } as Inspeccion;
      });
      setInspecciones(docs);
    });

    const qAud = query(collection(db, 'auditores'));
    const unsubscribeAud = onSnapshot(qAud, (snapshot) => {
      setAuditores(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Auditor)));
    });

    const qPlanes = query(collection(db, 'planes'), orderBy('empresa', 'asc'));
    const unsubscribePlanes = onSnapshot(qPlanes, (snapshot) => {
      setPlanes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PlanEmergencia)));
    });

    const qMovs = query(collection(db, 'movimientos'), orderBy('fecha', 'desc'));
    const unsubscribeMovs = onSnapshot(qMovs, (snapshot) => {
      setMovimientos(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as TimelineEvent)));
    });

    return () => {
      unsubscribeInsp();
      unsubscribeAud();
      unsubscribePlanes();
      unsubscribeMovs();
    };
  }, []);

  const findExpedienteId = async (numeroGDE: string): Promise<string | null> => {
    try {
      const q = query(collection(db, 'expedientes'), where('numero', '==', numeroGDE));
      const snap = await getDocs(q);
      if (!snap.empty) {
        return snap.docs[0].id;
      }
      return null;
    } catch (e) {
      return null;
    }
  };

  // --- FUNCIÓN IA ---
  const handleAiImprove = async () => {
      const currentText = editingInsp.observaciones;
      if (!currentText || currentText.trim().length < 5) {
          alert("Escribe algunas notas o punteos primero para que la IA pueda redactarlas.");
          return;
      }
      
      setIsAiLoading(true);
      const context = editingInsp.ubicacion || "Instalación Portuaria";
      const improvedText = await draftTechnicalReport(currentText, context);
      
      setEditingInsp({ ...editingInsp, observaciones: improvedText });
      setIsAiLoading(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const auditorSeleccionado = auditores.find(a => a.id === editingInsp.auditorId);
    let finalExpedienteId = editingInsp.expedienteId;
    const finalNumero = (editingInsp.expedienteNumero || 'S/EXP').toUpperCase().trim();
    
    if (!finalExpedienteId && finalNumero !== 'S/EXP') {
       finalExpedienteId = await findExpedienteId(finalNumero) || null;
    }

    const dataToSave = {
      fecha: editingInsp.fecha || new Date().toISOString().split('T')[0],
      expedienteId: finalExpedienteId, 
      planId: editingInsp.planId || '',
      expedienteNumero: finalNumero,
      auditorId: editingInsp.auditorId || '',
      auditorNombre: auditorSeleccionado ? auditorSeleccionado.nombre : 'DESCONOCIDO',
      ubicacion: (editingInsp.ubicacion || '').toUpperCase(),
      jurisdiccion: (editingInsp.jurisdiccion || '').toUpperCase(),
      tipo: editingInsp.tipo || 'INICIAL',
      resultado: editingInsp.resultado || 'CON PENDIENTES',
      convalidacionNumero: editingInsp.convalidacionNumero || null,
      observaciones: editingInsp.observaciones || '',
      nroInforme: editingInsp.nroInforme || '',
      nroCertificado: editingInsp.nroCertificado || '',
      nroDisposicion: editingInsp.nroDisposicion || '',
      registradoPor: currentUser.name,
      registradoEn: new Date().toISOString()
    };

    try {
      let docId = editingInsp.id;
      let accionTexto = "";
      let shouldBePending = dataToSave.resultado === 'CON PENDIENTES';

      if (docId) {
        await updateDoc(doc(db, 'inspecciones', docId), dataToSave);
        accionTexto = "Edición de Inspección";
      } else {
        const docRef = await addDoc(collection(db, 'inspecciones'), dataToSave);
        docId = docRef.id;
        accionTexto = "Nueva Inspección Registrada";
        shouldBePending = dataToSave.resultado === 'CON PENDIENTES'; 
        
        if (auditorSeleccionado && auditorSeleccionado.id) {
           try {
             const auditorRef = doc(db, 'auditores', auditorSeleccionado.id);
             const auditorSnap = await getDoc(auditorRef);
             if (auditorSnap.exists()) {
               const auditorData = auditorSnap.data() as Auditor;
               const currentStats = auditorData.stats || { totalHistorico: 0, anualActual: 0, anioReferencia: new Date().getFullYear() };
               const newStats = {
                 ...currentStats,
                 totalHistorico: (currentStats.totalHistorico || 0) + 1,
                 anualActual: (currentStats.anualActual || 0) + 1
               };
               await updateDoc(auditorRef, { stats: newStats });
             }
           } catch (statError) {
             console.error("Error actualizando estadísticas:", statError);
           }
        }
      }

      if (finalExpedienteId || docId) {
          await addDoc(collection(db, 'movimientos'), {
             usuario: currentUser.name,
             fecha: new Date().toISOString(),
             texto: `${accionTexto}: ${dataToSave.resultado} en ${dataToSave.ubicacion}. ${shouldBePending ? ' [REQUERIMIENTO DE ANÁLISIS]' : ''}`,
             expedienteId: finalExpedienteId || 'SIN_EXPEDIENTE',
             inspeccionId: docId,
             tipoAccion: 'Inspección',
             isPending: shouldBePending
          });
      }

      // --- AUTOMATIZACIÓN: Actualizar Base de Datos de Planes ---
      let targetPlanId = dataToSave.planId;
      if (!targetPlanId && finalExpedienteId) {
        // Intentar obtener planId del expediente
        const expSnap = await getDoc(doc(db, 'expedientes', finalExpedienteId));
        if (expSnap.exists()) {
          targetPlanId = expSnap.data().planId;
        }
      }

      if (targetPlanId && dataToSave.resultado === 'APROBADO') {
        const planRef = doc(db, 'planes', targetPlanId);
        const planSnap = await getDoc(planRef);
        if (planSnap.exists()) {
          const planData = planSnap.data() as PlanEmergencia;
          const convalidaciones = { ...(planData.convalidaciones || {}) };
          
          if (dataToSave.tipo === 'CONVALIDACIÓN ANUAL' || dataToSave.tipo === 'RENOVACIÓN') {
            const num = dataToSave.convalidacionNumero;
            if (num === 1) convalidaciones.anio1 = dataToSave.fecha;
            else if (num === 2) convalidaciones.anio2 = dataToSave.fecha;
            else if (num === 3) convalidaciones.anio3 = dataToSave.fecha;
            else if (num === 4) convalidaciones.anio4 = dataToSave.fecha;
            else {
              // Lógica fallback: llenar el primer slot vacío
              if (!convalidaciones.anio1) convalidaciones.anio1 = dataToSave.fecha;
              else if (!convalidaciones.anio2) convalidaciones.anio2 = dataToSave.fecha;
              else if (!convalidaciones.anio3) convalidaciones.anio3 = dataToSave.fecha;
              else if (!convalidaciones.anio4) convalidaciones.anio4 = dataToSave.fecha;
            }
            
            await updateDoc(planRef, {
              convalidaciones,
              ultimaActualizacion: new Date().toISOString()
            });
          }
        }
      }

      alert(shouldBePending 
          ? "Inspección registrada. Se generó automáticamente una TAREA PENDIENTE para su análisis." 
          : "Inspección actualizada correctamente."
      );

      setIsModalOpen(false);
      setEditingInsp({});
    } catch (error) {
      console.error(error);
      alert("Error al guardar inspección.");
    }
  };

  const openSubsanarModal = (insp: Inspeccion) => {
    setSubsanarTarget(insp);
    setCertSubsanacion('');
    setPlanillaSubsanacion('');
    setIsSameAuditor(true);
    setSubsanarAuditorId('');
    setIsSubsanarModalOpen(true);
  };

  const confirmSubsanar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subsanarTarget) return;

    let nombreAuditorResponsable = subsanarTarget.auditorNombre;
    if (!isSameAuditor) {
        if (!subsanarAuditorId) {
            alert("Seleccione el auditor que realizó el levantamiento.");
            return;
        }
        const auditorNuevo = auditores.find(a => a.id === subsanarAuditorId);
        if (auditorNuevo) nombreAuditorResponsable = auditorNuevo.nombre;
    }

    try {
      const textoAuditor = isSameAuditor ? `(Mismo Inspector: ${nombreAuditorResponsable})` : `(Re-inspección por: ${nombreAuditorResponsable})`;
      const nuevaObs = (subsanarTarget.observaciones || '') + `\n[SUBSANADO: Certificado ${certSubsanacion} / Planilla ${planillaSubsanacion}. ${textoAuditor} - Fecha: ${new Date().toLocaleDateString()}]`;
      
      await updateDoc(doc(db, 'inspecciones', subsanarTarget.id), {
          resultado: 'APROBADO',
          nroCertificado: certSubsanacion.toUpperCase(),
          nroInforme: planillaSubsanacion.toUpperCase(),
          observaciones: nuevaObs
      });

      await addDoc(collection(db, 'movimientos'), {
        usuario: currentUser.name,
        fecha: new Date().toISOString(),
        texto: `Se subsanaron los pendientes. Se emitió CERTIFICADO: ${certSubsanacion} y PLANILLA DE ANÁLISIS: ${planillaSubsanacion}. Inspección APROBADA. Responsable: ${nombreAuditorResponsable}.`,
        expedienteId: subsanarTarget.expedienteId || 'SIN_EXPEDIENTE',
        inspeccionId: subsanarTarget.id,
        tipoAccion: 'Resolución',
        isPending: false
      });

      if (subsanarTarget.expedienteId) {
          const qPend = query(collection(db, 'movimientos'), where('expedienteId', '==', subsanarTarget.expedienteId), where('isPending', '==', true));
          const snapPend = await getDocs(qPend);
          snapPend.forEach(async (d) => {
            const data = d.data() as TimelineEvent;
            if (data.tipoAccion === 'Inspección' || data.inspeccionId === subsanarTarget.id) {
                await updateDoc(doc(db, 'movimientos', d.id), { isPending: false, texto: data.texto + " [CERRADO POR SUBSANACIÓN]" });
            }
          });
      }

      setIsSubsanarModalOpen(false);
      setSubsanarTarget(null);
      setCertSubsanacion('');
      setPlanillaSubsanacion('');
    } catch (error) {
      console.error(error);
      alert("Error al procesar la subsanación.");
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("¿Eliminar este registro de inspección permanentemente?")) {
      await deleteDoc(doc(db, 'inspecciones', id));
    }
  };

  const filteredInspecciones = inspecciones.filter(i => 
    (i.expedienteNumero || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (i.auditorNombre || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (i.ubicacion || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (i.jurisdiccion || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getResultadoColor = (res: ResultadoInspeccion) => {
    switch(res) {
      case 'APROBADO': return 'bg-green-100 text-green-700 border-green-200';
      case 'APROBADO CON OPORTUNIDAD DE MEJORAS': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'CON PENDIENTES': return 'bg-orange-100 text-orange-700 border-orange-200';
      default: return 'bg-slate-100 text-slate-500 border-slate-200';
    }
  };
  
  const formatDateSafe = (dateStr: string) => {
      try {
          if(!dateStr) return "-";
          const d = new Date(dateStr);
          return isNaN(d.getTime()) ? "-" : d.toLocaleDateString();
      } catch {
          return "-";
      }
  }

  const historyEvents = historyTarget 
      ? movimientos.filter(m => m.inspeccionId === historyTarget.id || (historyTarget.expedienteId && m.expedienteId === historyTarget.expedienteId && m.tipoAccion === 'Inspección'))
      : [];

  return (
    <div className="flex h-screen w-full bg-background-light dark:bg-background-dark overflow-hidden font-display">
      <Sidebar activePage="inspecciones" />
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <main className="flex-1 flex flex-col p-6 overflow-hidden">
          
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 shrink-0">
            <div>
              <h1 className="text-slate-900 dark:text-white text-2xl font-black uppercase tracking-tight">Registro de Inspecciones</h1>
              <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-widest text-primary italic">Control y Seguimiento de Campo</p>
            </div>
            <button onClick={() => { setEditingInsp({ fecha: new Date().toISOString().split('T')[0], resultado: 'CON PENDIENTES', tipo: 'INICIAL', jurisdiccion: '' }); setIsModalOpen(true); }} className="flex items-center gap-2 rounded-lg h-10 px-4 bg-primary text-white text-xs font-black uppercase shadow-lg hover:bg-blue-600 transition-all">
              <span className="material-symbols-outlined text-[18px]">assignment_add</span>
              <span>Nueva Inspección</span>
            </button>
          </div>

          {/* KPI CARDS */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6 shrink-0">
             <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col items-center">
                <span className="text-2xl font-black text-slate-900 dark:text-white">{inspecciones.length}</span>
                <span className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">Registradas</span>
             </div>
             <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-green-100 dark:border-green-900/30 shadow-sm flex flex-col items-center">
                <span className="text-2xl font-black text-green-600 dark:text-green-400">{inspecciones.filter(i => i.resultado === 'APROBADO').length}</span>
                <span className="text-[9px] font-bold uppercase text-green-600/70 tracking-wider">Aprobadas</span>
             </div>
             <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30 shadow-sm flex flex-col items-center">
                <span className="text-2xl font-black text-blue-600 dark:text-blue-400">{inspecciones.filter(i => i.resultado === 'APROBADO CON OPORTUNIDAD DE MEJORAS').length}</span>
                <span className="text-[9px] font-bold uppercase text-blue-600/70 tracking-wider">Oport. Mejora</span>
             </div>
             <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-orange-100 dark:border-orange-900/30 shadow-sm flex flex-col items-center">
                <span className="text-2xl font-black text-orange-600 dark:text-orange-400">{inspecciones.filter(i => i.resultado === 'CON PENDIENTES').length}</span>
                <span className="text-[9px] font-bold uppercase text-orange-600/70 tracking-wider">Pendientes</span>
             </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-800 mb-6 shrink-0 shadow-sm">
            <div className="relative flex items-center">
              <span className="absolute left-3 text-slate-400 material-symbols-outlined text-[20px]">search</span>
              <input className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 outline-none focus:ring-1 focus:ring-primary" placeholder="Buscar por Expediente, Auditor, Ubicación o Jurisdicción..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10 shadow-sm">
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-500">Fecha</th>
                  <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-500">Expediente / Ubicación</th>
                  <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-500">Auditor</th>
                  <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-500 text-center">Resultado</th>
                  <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-500">Documentación</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredInspecciones.length > 0 ? filteredInspecciones.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-4 font-mono text-slate-500">{formatDateSafe(item.fecha)}</td>
                    <td className="px-4 py-4">
                        <div className="flex flex-col">
                            <span className="font-black text-slate-900 dark:text-white uppercase text-xs">{item.expedienteNumero || 'S/EXP'}</span>
                            <span className="text-[10px] text-slate-500 uppercase font-medium">{item.ubicacion}</span>
                            <div className="flex gap-2">
                              <span className="text-[9px] text-primary italic">{item.tipo}</span>
                              {item.jurisdiccion && <span className="text-[9px] text-slate-400 uppercase">| {item.jurisdiccion}</span>}
                            </div>
                        </div>
                    </td>
                    <td className="px-4 py-4">
                        <span className="text-[10px] font-bold uppercase text-slate-700 dark:text-slate-300">{item.auditorNombre}</span>
                    </td>
                    <td className="px-4 py-4 text-center">
                        <span className={`inline-block px-2 py-1 rounded text-[9px] font-black uppercase border ${getResultadoColor(item.resultado)}`}>
                           {item.resultado}
                        </span>
                    </td>
                    <td className="px-4 py-4">
                        <div className="flex flex-col gap-0.5">
                            {item.nroInforme && <span className="text-[9px] text-slate-600 dark:text-slate-400 font-mono">INF: {item.nroInforme}</span>}
                            {item.nroCertificado && <span className="text-[9px] text-green-600 font-mono">CERT: {item.nroCertificado}</span>}
                            {item.nroDisposicion && <span className="text-[9px] text-blue-600 font-mono">DISP: {item.nroDisposicion}</span>}
                            {!item.nroInforme && !item.nroCertificado && !item.nroDisposicion && <span className="text-[9px] text-slate-300 italic">--</span>}
                        </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                        <div className="flex justify-end gap-2">
                           <button onClick={() => { setHistoryTarget(item); setIsHistorialModalOpen(true); }} className="text-slate-400 hover:text-blue-500 p-1" title="Ver Historial">
                              <span className="material-symbols-outlined text-[18px]">history</span>
                           </button>
                           {item.resultado === 'CON PENDIENTES' && (
                              <button onClick={() => openSubsanarModal(item)} className="bg-green-100 hover:bg-green-200 text-green-700 p-1 rounded border border-green-200 transition-colors" title="Levantar Pendientes (Emitir Certificado)">
                                 <span className="material-symbols-outlined text-[18px]">playlist_add_check</span>
                              </button>
                           )}
                           <button onClick={() => { setEditingInsp(item); setIsModalOpen(true); }} className="text-slate-400 hover:text-primary p-1"><span className="material-symbols-outlined text-[18px]">edit_note</span></button>
                           <button onClick={() => handleDelete(item.id)} className="text-slate-400 hover:text-red-500 p-1"><span className="material-symbols-outlined text-[18px]">delete_forever</span></button>
                        </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} className="py-20 text-center text-slate-400 italic">No hay inspecciones registradas con ese criterio.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      {/* MODAL EDITAR / NUEVO */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
              <span className="text-xs font-black uppercase tracking-widest">{editingInsp.id ? 'Editar Inspección' : 'Registrar Inspección'}</span>
              <button onClick={() => setIsModalOpen(false)}><span className="material-symbols-outlined">close</span></button>
            </div>
            <form onSubmit={handleSave} className="p-6 overflow-y-auto max-h-[80vh]">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  
                  {/* Fila 1 */}
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Fecha de Inspección</label>
                    <input required type="date" className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none" value={editingInsp.fecha || ''} onChange={e => setEditingInsp({...editingInsp, fecha: e.target.value})} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Tipo de Inspección</label>
                    <select className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none font-bold" value={editingInsp.tipo || 'INICIAL'} onChange={e => setEditingInsp({...editingInsp, tipo: e.target.value})}>
                        <option>INICIAL</option>
                        <option>CONVALIDACIÓN ANUAL</option>
                        <option>RENOVACIÓN</option>
                        <option>EXTRAORDINARIA</option>
                    </select>
                  </div>

                  {(editingInsp.tipo === 'CONVALIDACIÓN ANUAL' || editingInsp.tipo === 'RENOVACIÓN') && (
                    <div className="animate-in fade-in slide-in-from-top-1 duration-200">
                      <label className="block text-[10px] font-black uppercase text-primary mb-1">Nº de Convalidación</label>
                      <select 
                        required 
                        className="w-full px-3 py-2 text-sm border-2 border-primary/20 rounded dark:bg-slate-800 dark:border-slate-700 outline-none font-black text-primary" 
                        value={editingInsp.convalidacionNumero || ''} 
                        onChange={e => setEditingInsp({...editingInsp, convalidacionNumero: parseInt(e.target.value)})}
                      >
                          <option value="">-- SELECCIONAR --</option>
                          <option value="1">1º CONVALIDACIÓN</option>
                          <option value="2">2º CONVALIDACIÓN</option>
                          <option value="3">3º CONVALIDACIÓN</option>
                          <option value="4">4º CONVALIDACIÓN</option>
                      </select>
                    </div>
                  )}

                  {/* Fila 2: Vinculación */}
                  <div className="col-span-2 md:col-span-1">
                     <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Vincular con Plan (Empresa)</label>
                     <select 
                        className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase font-bold"
                        value={editingInsp.planId || ''}
                        onChange={e => {
                          const selectedPlan = planes.find(p => p.id === e.target.value);
                          setEditingInsp({
                            ...editingInsp, 
                            planId: e.target.value,
                            ubicacion: selectedPlan ? selectedPlan.empresa : (editingInsp.ubicacion || '')
                          });
                        }}
                     >
                        <option value="">-- SELECCIONAR PLAN --</option>
                        {planes.map(p => (
                          <option key={p.id} value={p.id}>{p.empresa}</option>
                        ))}
                     </select>
                  </div>
                  <div className="col-span-2 md:col-span-1">
                     <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Nº Expediente (Manual)</label>
                     <input className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase font-mono" value={editingInsp.expedienteNumero || ''} onChange={e => setEditingInsp({...editingInsp, expedienteNumero: e.target.value})} placeholder="EX-..." />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                     <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Auditor Responsable</label>
                     <select required className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase" value={editingInsp.auditorId || ''} onChange={e => setEditingInsp({...editingInsp, auditorId: e.target.value})}>
                        <option value="">-- Seleccionar Auditor --</option>
                        {auditores.map(a => (
                            <option key={a.id} value={a.id}>{a.nombre}</option>
                        ))}
                     </select>
                  </div>

                  {/* Fila 3: Ubicación y Jurisdicción */}
                  <div className="col-span-2 md:col-span-1">
                     <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Ubicación / Domicilio / Empresa</label>
                     <input required className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase" value={editingInsp.ubicacion || ''} onChange={e => setEditingInsp({...editingInsp, ubicacion: e.target.value})} placeholder="CALLE 123, LOCALIDAD" />
                  </div>
                  <div className="col-span-2 md:col-span-1">
                     <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Jurisdicción Prefectura</label>
                     <input className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase" value={editingInsp.jurisdiccion || ''} onChange={e => setEditingInsp({...editingInsp, jurisdiccion: e.target.value})} placeholder="Ej: P.N.A. MAR DEL PLATA" />
                  </div>

                  {/* Fila 4: Resultado */}
                  <div className="col-span-2">
                     <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Resultado Dictamen</label>
                     <div className="flex flex-col gap-2">
                        {['APROBADO', 'APROBADO CON OPORTUNIDAD DE MEJORAS', 'CON PENDIENTES'].map(res => (
                            <button key={res} type="button" onClick={() => setEditingInsp({...editingInsp, resultado: res as ResultadoInspeccion})} 
                                className={`flex-1 py-3 text-[10px] font-black uppercase rounded border transition-all ${editingInsp.resultado === res ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
                                {res}
                            </button>
                        ))}
                     </div>
                  </div>

                  {/* Fila 5: Obs (CON IA) */}
                  <div className="col-span-2">
                    <div className="flex justify-between items-end mb-1">
                       <label className="block text-[10px] font-black uppercase text-slate-500">Observaciones / Detalle Técnico</label>
                       <button 
                           type="button" 
                           onClick={handleAiImprove}
                           disabled={isAiLoading}
                           className="text-[9px] bg-purple-100 hover:bg-purple-200 text-purple-700 px-2 py-1 rounded font-black uppercase flex items-center gap-1 transition-colors"
                       >
                           <span className={`material-symbols-outlined text-[12px] ${isAiLoading ? 'animate-spin' : ''}`}>
                               {isAiLoading ? 'sync' : 'auto_fix'}
                           </span>
                           {isAiLoading ? 'Redactando...' : 'Mejorar Redacción con IA'}
                       </button>
                    </div>
                    <textarea className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none h-24" value={editingInsp.observaciones || ''} onChange={e => setEditingInsp({...editingInsp, observaciones: e.target.value})} placeholder="Escriba los hallazgos (ej: 'extintor vencido, falta cartel'). La IA lo convertirá en un informe formal."></textarea>
                  </div>

                  {/* Fila 6: Documentación */}
                  <div className="col-span-2 bg-slate-50 dark:bg-slate-800/50 p-3 rounded border border-slate-200 dark:border-slate-700 mt-2">
                     <p className="text-[10px] font-black uppercase text-primary mb-2">Documentación Generada</p>
                     <div className="grid grid-cols-3 gap-3">
                        <div>
                            <label className="block text-[9px] font-bold uppercase text-slate-400 mb-1">Nº Informe (Planilla)</label>
                            <input className="w-full px-2 py-1.5 text-xs border rounded outline-none uppercase" value={editingInsp.nroInforme || ''} onChange={e => setEditingInsp({...editingInsp, nroInforme: e.target.value})} placeholder="INF-..." />
                        </div>
                        <div>
                            <label className="block text-[9px] font-bold uppercase text-slate-400 mb-1">Nº Certificado</label>
                            <input className="w-full px-2 py-1.5 text-xs border rounded outline-none uppercase" value={editingInsp.nroCertificado || ''} onChange={e => setEditingInsp({...editingInsp, nroCertificado: e.target.value})} placeholder="CER-..." />
                        </div>
                        <div>
                            <label className="block text-[9px] font-bold uppercase text-slate-400 mb-1">Nº Disposición</label>
                            <input className="w-full px-2 py-1.5 text-xs border rounded outline-none uppercase" value={editingInsp.nroDisposicion || ''} onChange={e => setEditingInsp({...editingInsp, nroDisposicion: e.target.value})} placeholder="DIS-..." />
                        </div>
                     </div>
                  </div>

              </div>
              <div className="mt-6">
                 <button type="submit" className="w-full py-3 bg-primary text-white text-xs font-black uppercase rounded shadow-lg hover:bg-blue-600 transition-all">Guardar Registro</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL SUBSANAR PENDIENTES */}
      {isSubsanarModalOpen && subsanarTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 dark:border-slate-800">
             <div className="bg-green-600 text-white px-6 py-4">
                <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                   <span className="material-symbols-outlined text-[18px]">fact_check</span>
                   Levantar Pendientes
                </h3>
             </div>
             <form onSubmit={confirmSubsanar} className="p-6">
                <p className="text-sm text-slate-600 dark:text-slate-300 mb-4 font-medium leading-relaxed">
                   Se actualizará la inspección de <strong>{subsanarTarget.ubicacion}</strong> a estado <span className="text-green-600 font-bold">APROBADO</span>.
                </p>
                
                <div className="space-y-4">
                    {/* CHECKBOX MISMO AUDITOR */}
                    <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded border border-slate-200 dark:border-slate-700">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input type="checkbox" className="w-4 h-4 text-green-600 rounded" checked={isSameAuditor} onChange={e => setIsSameAuditor(e.target.checked)} />
                            <span className="text-[10px] font-bold uppercase text-slate-700 dark:text-slate-300">
                                Levantado por el mismo inspector ({subsanarTarget.auditorNombre})
                            </span>
                        </label>
                        
                        {!isSameAuditor && (
                            <div className="mt-3 animate-fade-in">
                                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Seleccionar Inspector que Subsana</label>
                                <select required className="w-full px-2 py-2 text-xs border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase font-bold" value={subsanarAuditorId} onChange={e => setSubsanarAuditorId(e.target.value)}>
                                    <option value="">-- SELECCIONAR --</option>
                                    {auditores.map(a => (
                                        <option key={a.id} value={a.id}>{a.nombre}</option>
                                    ))}
                                </select>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Nº Planilla de Análisis</label>
                        <input required className="w-full px-3 py-2 text-sm font-bold border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase" value={planillaSubsanacion} onChange={e => setPlanillaSubsanacion(e.target.value)} placeholder="INF-..." />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Nº Certificado Otorgado</label>
                        <input required className="w-full px-3 py-3 text-lg font-bold border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase text-center tracking-widest" value={certSubsanacion} onChange={e => setCertSubsanacion(e.target.value)} placeholder="CER-..." />
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3 mt-6">
                   <button type="button" onClick={() => setIsSubsanarModalOpen(false)} className="py-2.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded text-xs font-black uppercase">Cancelar</button>
                   <button type="submit" className="py-2.5 bg-green-600 text-white hover:bg-green-700 rounded text-xs font-black uppercase shadow-lg">Confirmar</button>
                </div>
             </form>
          </div>
        </div>
      )}

      {/* MODAL HISTORIAL */}
      {isHistorialModalOpen && historyTarget && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col">
            <div className="bg-primary text-white px-6 py-4 flex justify-between items-center flex-shrink-0">
              <span className="text-xs font-black uppercase tracking-widest">Bitácora Inspección: {historyTarget.ubicacion}</span>
              <button onClick={() => setIsHistorialModalOpen(false)}><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {historyEvents.length > 0 ? historyEvents.sort((a,b) => b.fecha.localeCompare(a.fecha)).map((e, idx) => (
                <div key={idx} className={`relative pl-6 border-l-2 ${e.isPending ? 'border-orange-500' : 'border-slate-200 dark:border-slate-800'}`}>
                  <div className={`absolute -left-[9px] top-0 size-4 rounded-full bg-white dark:bg-slate-900 border-2 ${e.isPending ? 'border-orange-500 animate-pulse' : 'border-primary'}`}></div>
                  <div className="flex justify-between items-start mb-1">
