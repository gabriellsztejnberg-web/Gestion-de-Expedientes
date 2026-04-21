
import React, { useState, useEffect, useMemo } from 'react';
import { Sidebar } from '../components/Sidebar';
import { db } from '../firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  deleteDoc 
} from 'firebase/firestore';
import { Auditor, Curso, Inspeccion, ESSENTIAL_COURSES } from '../types';
import { analyzeAuditorProfile } from '../services/geminiService'; // Importamos IA
import { Navigate } from 'react-router-dom';

export const Auditores: React.FC = () => {
  const [auditores, setAuditores] = useState<Auditor[]>([]);
  const [inspecciones, setInspecciones] = useState<Inspeccion[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAuditor, setEditingAuditor] = useState<Partial<Auditor>>({});
  const [activeTab, setActiveTab] = useState<'general' | 'academicos' | 'stats' | 'historial'>('general');
  const [newCurso, setNewCurso] = useState<Partial<Curso>>({});
  
  // Estado para perfil IA
  const [aiProfile, setAiProfile] = useState<string>('');
  const [isAiLoading, setIsAiLoading] = useState(false);

  useEffect(() => {
    const unsubAuditores = onSnapshot(query(collection(db, 'auditores')), (snapshot) => {
      // SANITIZACIÓN DE DATOS
      const docs = snapshot.docs.map(doc => {
        const data = doc.data();
        return { 
          id: doc.id, 
          nombre: typeof data.nombre === 'string' ? data.nombre : 'SIN NOMBRE',
          dni: data.dni ? String(data.dni) : '',
          disposicionHabilitacion: data.disposicionHabilitacion || 'PENDIENTE',
          zonaTrabajo: data.zonaTrabajo || '',
          nivel: data.nivel || 'I', // Default Nivel I
          cursos: Array.isArray(data.cursos) ? data.cursos : [],
          stats: {
            totalHistorico: Number(data.stats?.totalHistorico || 0),
            anualActual: Number(data.stats?.anualActual || 0),
            anioReferencia: Number(data.stats?.anioReferencia || new Date().getFullYear())
          },
          ultimaActualizacion: data.ultimaActualizacion || new Date().toISOString()
        } as Auditor;
      });
      setAuditores(docs);
    });

    const unsubInspecciones = onSnapshot(query(collection(db, 'inspecciones')), (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Inspeccion));
      setInspecciones(docs);
    });

    return () => {
      unsubAuditores();
      unsubInspecciones();
    };
  }, []);

  // Calculate dynamic stats
  const auditoresWithStats = useMemo(() => {
    const currentYear = new Date().getFullYear();
    
    return auditores.map(auditor => {
      // Find all inspecciones for this auditor (by exact name match, case insensitive)
      const auditorInspecciones = inspecciones.filter(
        insp => insp.auditorNombre?.toUpperCase() === auditor.nombre.toUpperCase()
      );
      
      const totalHistorico = auditorInspecciones.length;
      const anualActual = auditorInspecciones.filter(insp => {
        if (!insp.fecha) return false;
        const inspYear = new Date(insp.fecha).getFullYear();
        return inspYear === currentYear;
      }).length;

      // Use calculated stats if they exist, otherwise fallback to manual stats
      return {
        ...auditor,
        calculatedStats: {
          totalHistorico: Math.max(auditor.stats.totalHistorico || 0, totalHistorico),
          anualActual: Math.max(auditor.stats.anualActual || 0, anualActual),
          anioReferencia: currentYear
        }
      };
    });
  }, [auditores, inspecciones]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const dataToSave = {
      nombre: (editingAuditor.nombre || '').toUpperCase(),
      dni: editingAuditor.dni || '',
      disposicionHabilitacion: editingAuditor.disposicionHabilitacion || '',
      zonaTrabajo: editingAuditor.zonaTrabajo || '',
      nivel: editingAuditor.nivel || 'I',
      cursos: editingAuditor.cursos || [],
      stats: editingAuditor.stats || { totalHistorico: 0, anualActual: 0, anioReferencia: new Date().getFullYear() },
      ultimaActualizacion: new Date().toISOString()
    };

    try {
      if (editingAuditor.id) {
        await updateDoc(doc(db, 'auditores', editingAuditor.id), dataToSave);
      } else {
        await addDoc(collection(db, 'auditores'), dataToSave);
      }
      setIsModalOpen(false);
      setEditingAuditor({});
      setActiveTab('general');
      setAiProfile(''); // Reset AI
    } catch (error) {
      alert("Error al guardar datos.");
    }
  };

  // Helper para verificar cursos esenciales
  const getMissingCourses = (auditorCourses: Curso[]) => {
      const courseNames = auditorCourses.map(c => c.nombre.toLowerCase());
      return ESSENTIAL_COURSES.filter(essential => {
          // Búsqueda flexible (contiene la palabra clave)
          const keyword = essential.toLowerCase();
          return !courseNames.some(c => c.includes(keyword));
      });
  };

  const handleDelete = async (id: string) => {
    if (confirm("¿Está seguro de eliminar este auditor del registro?")) {
      await deleteDoc(doc(db, 'auditores', id));
    }
  };

  const handleAddCurso = () => {
    if (!newCurso.nombre || !newCurso.disposicion) return alert("Complete nombre y disposición del curso.");
    const curso: Curso = {
      id: Math.random().toString(36).substr(2, 9),
      nombre: newCurso.nombre,
      disposicion: newCurso.disposicion,
      fecha: newCurso.fecha || new Date().toISOString().split('T')[0]
    };
    setEditingAuditor({
      ...editingAuditor,
      cursos: [...(editingAuditor.cursos || []), curso]
    });
    setNewCurso({});
  };

  const handleRemoveCurso = (cursoId: string) => {
    setEditingAuditor({
      ...editingAuditor,
      cursos: (editingAuditor.cursos || []).filter(c => c.id !== cursoId)
    });
  };

  const updateStats = (field: keyof Auditor['stats'], value: number) => {
    const currentStats = editingAuditor.stats || { totalHistorico: 0, anualActual: 0, anioReferencia: new Date().getFullYear() };
    setEditingAuditor({
        ...editingAuditor,
        stats: {
            ...currentStats,
            [field]: value
        }
    });
  };
  
  // --- IA PROFILE ---
  const handleGenerateAiProfile = async () => {
      if (!editingAuditor.nombre) return;
      setIsAiLoading(true);
      const profile = await analyzeAuditorProfile(editingAuditor);
      setAiProfile(profile);
      setIsAiLoading(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const currentUser = JSON.parse(localStorage.getItem('currentUser') || '{"id":"temp","name":"Usuario"}');
  const role = (currentUser.role || '').toLowerCase();
  const isSuperior = role === 'superior';

  if (isSuperior) {
    return <Navigate to="/dashboard" replace />;
  }

  const filteredAuditores = auditoresWithStats.filter(a => 
    (a.nombre || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
    (a.zonaTrabajo || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex h-screen w-full bg-background-light dark:bg-background-dark overflow-hidden font-display">
      <Sidebar activePage="auditores" />
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <main className="flex-1 flex flex-col p-6 overflow-hidden">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6 shrink-0">
            <div>
              <h1 className="text-slate-900 dark:text-white text-2xl font-black uppercase tracking-tight">Registro de Auditores</h1>
              <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-widest text-primary italic">Planes de Emergencia - Habilitados</p>
            </div>
            <button onClick={() => { setEditingAuditor({ cursos: [], stats: { totalHistorico: 0, anualActual: 0, anioReferencia: new Date().getFullYear() } }); setActiveTab('general'); setAiProfile(''); setIsModalOpen(true); }} className="flex items-center gap-2 rounded-lg h-10 px-4 bg-primary text-white text-xs font-black uppercase shadow-lg hover:bg-blue-600 transition-all">
              <span className="material-symbols-outlined text-[18px]">person_add</span>
              <span>Nuevo Auditor</span>
            </button>
          </div>

          {/* KPI CARDS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 shrink-0">
             <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
                <div className="flex flex-col">
                    <span className="text-[9px] font-bold uppercase text-slate-400 tracking-wider">Total Inspectores</span>
                    <span className="text-2xl font-black text-slate-900 dark:text-white">{auditores.length}</span>
                </div>
                <span className="material-symbols-outlined text-slate-300 text-3xl">groups</span>
             </div>
             <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-green-100 dark:border-green-900/30 shadow-sm flex items-center justify-between">
                <div className="flex flex-col">
                    <span className="text-[9px] font-bold uppercase text-green-600/70 tracking-wider">Habilitados</span>
                    <span className="text-2xl font-black text-green-600 dark:text-green-400">
                        {auditores.filter(a => a.disposicionHabilitacion && a.disposicionHabilitacion !== 'PENDIENTE').length}
                    </span>
                </div>
                <span className="material-symbols-outlined text-green-200 text-3xl">verified</span>
             </div>
             <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-red-100 dark:border-red-900/30 shadow-sm flex items-center justify-between">
                <div className="flex flex-col">
                    <span className="text-[9px] font-bold uppercase text-red-600/70 tracking-wider">Sin Habilitación</span>
                    <span className="text-2xl font-black text-red-600 dark:text-red-400">
                        {auditores.filter(a => !a.disposicionHabilitacion || a.disposicionHabilitacion === 'PENDIENTE').length}
                    </span>
                </div>
                <span className="material-symbols-outlined text-red-200 text-3xl">warning</span>
             </div>
          </div>

          <div className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-800 mb-6 shrink-0 shadow-sm">
            <div className="relative flex items-center">
              <span className="absolute left-3 text-slate-400 material-symbols-outlined text-[20px]">search</span>
              <input className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 outline-none focus:ring-1 focus:ring-primary" placeholder="Buscar por Nombre o Zona..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
            </div>
          </div>

          <div className="flex-1 overflow-auto bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10 shadow-sm">
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-500">Auditor / DNI</th>
                  <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-500">Habilitación</th>
                  <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-500">Zona / Base</th>
                  <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-500 text-center">Cursos</th>
                  <th className="px-4 py-3 font-black uppercase tracking-widest text-slate-500 text-center">Inspecciones</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredAuditores.length > 0 ? filteredAuditores.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-4 py-4">
                      <div className="flex flex-col">
                         <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 dark:text-white uppercase text-sm">{a.nombre}</span>
                            <button onClick={() => copyToClipboard(a.nombre)} className="text-slate-300 hover:text-primary transition-colors" title="Copiar Nombre">
                                <span className="material-symbols-outlined text-[14px]">content_copy</span>
                            </button>
                         </div>
                         <div className="flex items-center gap-2">
                             <span className="text-[10px] text-slate-500 font-mono">{a.dni || 'Sin DNI'}</span>
                             <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border ${a.nivel === 'I' ? 'bg-purple-100 text-purple-700 border-purple-200' : a.nivel === 'II' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                NIVEL {a.nivel || 'I'}
                             </span>
                         </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                        {(!a.disposicionHabilitacion || a.disposicionHabilitacion === 'PENDIENTE') ? (
                            <span className="bg-red-50 text-red-700 px-2 py-1 rounded text-[10px] font-black uppercase border border-red-100 flex items-center gap-1 w-fit">
                               <span className="material-symbols-outlined text-[12px]">warning</span>
                               {a.disposicionHabilitacion || 'PENDIENTE'}
                            </span>
                        ) : (
                            <span className="bg-green-50 text-green-700 px-2 py-1 rounded text-[10px] font-black uppercase border border-green-100">
                               {a.disposicionHabilitacion}
                            </span>
                        )}
                    </td>
                    <td className="px-4 py-4 font-medium text-slate-600 dark:text-slate-300 uppercase text-[11px]">{a.zonaTrabajo || '-'}</td>
                    <td className="px-4 py-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                            <span className="text-slate-500 font-bold bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded text-[10px]">{(a.cursos || []).length} Registrados</span>
                            {getMissingCourses(a.cursos || []).length > 0 && (
                                <span className="text-[9px] font-black text-red-500 flex items-center gap-1 animate-pulse" title={`Faltan: ${getMissingCourses(a.cursos || []).join(', ')}`}>
                                    <span className="material-symbols-outlined text-[12px]">priority_high</span>
                                    FALTAN CURSOS
                                </span>
                            )}
                        </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                        <div className="flex flex-col items-center">
                           <span className="text-xs font-black text-slate-900 dark:text-white">{a.calculatedStats?.totalHistorico ?? a.stats.totalHistorico}</span>
                           <span className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">Anual: {a.calculatedStats?.anualActual ?? a.stats.anualActual}</span>
                        </div>
                    </td>
                    <td className="px-4 py-4 text-right">
                        <div className="flex justify-end gap-2">
                           <button onClick={() => { setEditingAuditor(a); setActiveTab('general'); setAiProfile(''); setIsModalOpen(true); }} className="text-slate-400 hover:text-primary p-1"><span className="material-symbols-outlined text-[18px]">edit_note</span></button>
                           <button onClick={() => handleDelete(a.id)} className="text-slate-400 hover:text-red-500 p-1"><span className="material-symbols-outlined text-[18px]">delete_forever</span></button>
                        </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan={6} className="py-20 text-center text-slate-400 italic">No hay auditores registrados.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </main>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh]">
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
              <span className="text-xs font-black uppercase tracking-widest">{editingAuditor.id ? 'Ficha de Auditor' : 'Alta de Auditor'}</span>
              <button onClick={() => setIsModalOpen(false)}><span className="material-symbols-outlined">close</span></button>
            </div>
            
            <div className="flex border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 shrink-0 overflow-x-auto no-scrollbar">
               <button onClick={() => setActiveTab('general')} className={`px-4 py-3 text-[10px] font-black uppercase tracking-wider border-b-2 whitespace-nowrap ${activeTab === 'general' ? 'border-primary text-primary' : 'border-transparent text-slate-400'}`}>Datos Generales</button>
               <button onClick={() => setActiveTab('academicos')} className={`px-4 py-3 text-[10px] font-black uppercase tracking-wider border-b-2 whitespace-nowrap ${activeTab === 'academicos' ? 'border-primary text-primary' : 'border-transparent text-slate-400'}`}>Antecedentes Académicos</button>
               <button onClick={() => setActiveTab('stats')} className={`px-4 py-3 text-[10px] font-black uppercase tracking-wider border-b-2 whitespace-nowrap ${activeTab === 'stats' ? 'border-primary text-primary' : 'border-transparent text-slate-400'}`}>Estadísticas</button>
               <button onClick={() => setActiveTab('historial')} className={`px-4 py-3 text-[10px] font-black uppercase tracking-wider border-b-2 whitespace-nowrap ${activeTab === 'historial' ? 'border-primary text-primary' : 'border-transparent text-slate-400'}`}>Historial de Auditorías</button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">
               {activeTab === 'general' && (
                  <form id="auditorForm" onSubmit={handleSave} className="space-y-4">
                     {/* Perfil IA */}
                     <div className="bg-gradient-to-r from-purple-50 to-white dark:from-purple-900/10 dark:to-slate-900 p-4 rounded border border-purple-100 dark:border-purple-900/30 mb-4">
                        <div className="flex justify-between items-start mb-2">
                           <h4 className="text-[10px] font-black uppercase text-purple-700 dark:text-purple-400 flex items-center gap-1">
                               <span className="material-symbols-outlined text-[14px]">psychology</span> Perfil Profesional (IA)
                           </h4>
                           <button 
                                type="button" 
                                onClick={handleGenerateAiProfile} 
                                disabled={isAiLoading || !editingAuditor.nombre}
                                className="text-[9px] bg-purple-600 text-white px-2 py-1 rounded hover:bg-purple-700 transition-colors flex items-center gap-1"
                           >
                               {isAiLoading ? 'Analizando...' : 'Generar Análisis'}
                           </button>
                        </div>
                        <p className="text-xs text-slate-600 dark:text-slate-300 italic leading-relaxed">
                            {aiProfile || "Haga clic en 'Generar Análisis' para obtener una reseña basada en la actividad y cursos de este inspector."}
                        </p>
                     </div>

                     <div>
                        <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Nombre Completo</label>
                        <input required className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase" value={editingAuditor.nombre || ''} onChange={e => setEditingAuditor({...editingAuditor, nombre: e.target.value})} placeholder="APELLIDO, Nombre" />
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                           <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">DNI / Legajo</label>
                           <input className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none" value={editingAuditor.dni || ''} onChange={e => setEditingAuditor({...editingAuditor, dni: e.target.value})} />
                        </div>
                        <div>
                           <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Nivel Auditor</label>
                           <select className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase" value={editingAuditor.nivel || 'I'} onChange={e => setEditingAuditor({...editingAuditor, nivel: e.target.value as any})}>
                              <option value="I">Nivel I (Superior)</option>
                              <option value="II">Nivel II (Intermedio)</option>
                              <option value="III">Nivel III (Inicial)</option>
                           </select>
                        </div>
                     </div>
                     <div>
                        <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Disposición Habilitación</label>
                        <input required className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase" value={editingAuditor.disposicionHabilitacion || ''} onChange={e => setEditingAuditor({...editingAuditor, disposicionHabilitacion: e.target.value})} placeholder="DISFC-202X-..." />
                     </div>
                     <div>
                        <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Zona / Lugar de Trabajo</label>
                        <input className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase" value={editingAuditor.zonaTrabajo || ''} onChange={e => setEditingAuditor({...editingAuditor, zonaTrabajo: e.target.value})} placeholder="Ej: PUERTO MADRYN, COMODORO, ETC." />
                     </div>
                  </form>
               )}

               {activeTab === 'academicos' && (
                  <div className="space-y-6">
                     <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700">
                        <h4 className="text-[10px] font-black uppercase text-slate-500 mb-3">Cursos Esenciales Requeridos</h4>
                        <div className="grid grid-cols-2 gap-2 mb-4">
                           {ESSENTIAL_COURSES.map(course => {
                              const isCompleted = (editingAuditor.cursos || []).some(c => c.nombre.toLowerCase().includes(course.toLowerCase()));
                              return (
                                 <div key={course} className={`flex items-center gap-2 px-3 py-2 rounded border ${isCompleted ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                    <span className="material-symbols-outlined text-[16px]">{isCompleted ? 'check_circle' : 'cancel'}</span>
                                    <span className="text-[10px] font-black uppercase">{course}</span>
                                 </div>
                              );
                           })}
                        </div>

                        <h4 className="text-[10px] font-black uppercase text-slate-500 mb-3">Agregar Curso / Antecedente</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                           <input className="w-full px-3 py-2 text-xs border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase" placeholder="Nombre del Curso" value={newCurso.nombre || ''} onChange={e => setNewCurso({...newCurso, nombre: e.target.value})} />
                           <input className="w-full px-3 py-2 text-xs border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase" placeholder="Disposición Aprobación" value={newCurso.disposicion || ''} onChange={e => setNewCurso({...newCurso, disposicion: e.target.value})} />
                           <input type="date" className="w-full px-3 py-2 text-xs border rounded dark:bg-slate-800 dark:border-slate-700 outline-none" value={newCurso.fecha || ''} onChange={e => setNewCurso({...newCurso, fecha: e.target.value})} />
                        </div>
                        <button type="button" onClick={handleAddCurso} className="w-full py-2 bg-slate-900 text-white text-[10px] font-black uppercase rounded hover:bg-slate-700">Agregar al Legajo</button>
                     </div>

                     <div>
                        <h4 className="text-[10px] font-black uppercase text-slate-500 mb-3">Historial Registrado</h4>
                        <ul className="space-y-2">
                           {(editingAuditor.cursos || []).map(c => (
                              <li key={c.id} className="flex justify-between items-center p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded shadow-sm">
                                 <div>
                                    <p className="text-xs font-bold uppercase text-slate-900 dark:text-white">{c.nombre}</p>
                                    <p className="text-[10px] text-slate-500 uppercase">Disp: {c.disposicion} | Fecha: {c.fecha}</p>
                                 </div>
                                 <button onClick={() => handleRemoveCurso(c.id)} className="text-red-400 hover:text-red-600"><span className="material-symbols-outlined text-[16px]">delete</span></button>
                              </li>
                           ))}
                           {(editingAuditor.cursos || []).length === 0 && <p className="text-center text-xs text-slate-400 italic py-4">Sin antecedentes cargados.</p>}
                        </ul>
                     </div>
                  </div>
               )}

               {activeTab === 'stats' && (
                  <div className="space-y-6">
                     <div className="grid grid-cols-2 gap-6">
                        <div className="p-6 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-100 dark:border-blue-900/50 text-center">
                           <h4 className="text-[10px] font-black uppercase text-blue-800 dark:text-blue-300 mb-2">Total Histórico</h4>
                           <input type="number" min="0" className="text-3xl font-black text-center w-full bg-transparent outline-none text-blue-900 dark:text-white" value={Math.max(editingAuditor.calculatedStats?.totalHistorico || 0, editingAuditor.stats?.totalHistorico || 0)} onChange={e => updateStats('totalHistorico', parseInt(e.target.value))} />
                           <p className="text-[9px] text-blue-600 dark:text-blue-400 mt-2">Inspecciones Totales</p>
                        </div>
                        <div className="p-6 bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-100 dark:border-green-900/50 text-center">
                           <h4 className="text-[10px] font-black uppercase text-green-800 dark:text-green-300 mb-2">Año Actual ({new Date().getFullYear()})</h4>
                           <input type="number" min="0" className="text-3xl font-black text-center w-full bg-transparent outline-none text-green-900 dark:text-white" value={Math.max(editingAuditor.calculatedStats?.anualActual || 0, editingAuditor.stats?.anualActual || 0)} onChange={e => updateStats('anualActual', parseInt(e.target.value))} />
                           <p className="text-[9px] text-green-600 dark:text-green-400 mt-2">Inspecciones del Periodo</p>
                        </div>
                     </div>
                     <p className="text-xs text-slate-500 text-center italic">
                        {editingAuditor.calculatedStats?.totalHistorico ? 'Los contadores muestran el mayor valor entre el cálculo automático y el manual.' : 'Nota: Puede corregir manualmente estos contadores si existe un desfasaje con la documentación física.'}
                     </p>
                  </div>
               )}

               {activeTab === 'historial' && (
                  <div className="space-y-4">
                     <h4 className="text-[10px] font-black uppercase text-slate-500 border-b border-slate-200 dark:border-slate-800 pb-2">Auditorías Registradas</h4>
                     {inspecciones.filter(i => i.auditorNombre?.toUpperCase() === editingAuditor.nombre?.toUpperCase()).length === 0 ? (
                        <p className="text-xs text-slate-500 italic text-center py-8">No hay auditorías registradas para este inspector.</p>
                     ) : (
                        <div className="space-y-3">
                           {inspecciones
                              .filter(i => i.auditorNombre?.toUpperCase() === editingAuditor.nombre?.toUpperCase())
                              .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
                              .map(i => (
                                 <div key={i.id} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                                    <div className="flex justify-between items-start mb-2">
                                       <div>
                                          <p className="text-xs font-black text-slate-800 dark:text-slate-200 uppercase">{i.empresa}</p>
                                          <p className="text-[10px] text-slate-500 uppercase">{i.tipo} - {i.anexo?.replace('_', ' ')}</p>
                                       </div>
                                       <span className="text-[10px] font-mono font-bold text-slate-500 bg-white dark:bg-slate-900 px-2 py-1 rounded border border-slate-200 dark:border-slate-700">
                                          {new Date(i.fecha).toLocaleDateString()}
                                       </span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mt-3 text-[9px]">
                                       <p><span className="text-slate-400 font-bold uppercase">Expediente:</span> <span className="font-mono">{i.expedienteNumero || '-'}</span></p>
                                       <p><span className="text-slate-400 font-bold uppercase">IF:</span> <span className="font-mono">{i.nroInforme || '-'}</span></p>
                                       <p><span className="text-slate-400 font-bold uppercase">Resultado:</span> <span className={`font-black uppercase ${i.resultado?.includes('APROBADO') ? 'text-green-600' : 'text-orange-600'}`}>{i.resultado || '-'}</span></p>
                                       <p><span className="text-slate-400 font-bold uppercase">Jurisdicción:</span> <span className="uppercase">{i.jurisdiccion || '-'}</span></p>
                                    </div>
                                 </div>
                              ))
                           }
                        </div>
                     )}
                  </div>
               )}
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0">
               <button onClick={handleSave} className="w-full py-3 bg-primary text-white text-xs font-black uppercase rounded shadow-lg hover:bg-blue-600 transition-all">Guardar Ficha Auditor</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
