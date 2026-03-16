
import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from '../components/Sidebar';
import { db } from '../firebase';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  doc, 
  query, 
  deleteDoc,
  orderBy,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { PlanEmergencia, AnexoTipo, User } from '../types';

const ANEXOS: { id: AnexoTipo; label: string }[] = [
  { id: 'anexo_16', label: 'ANEXO 16 (Ref)' },
  { id: 'anexo_17', label: 'ANEXO 17 (Termap/Oil)' },
  { id: 'anexo_18', label: 'ANEXO 18 (Buques/Barcazas)' },
  { id: 'anexo_19', label: 'ANEXO 19 (Puertos Ref)' },
  { id: 'anexo_20', label: 'ANEXO 20 (Plataformas)' },
];

export const Planes: React.FC = () => {
  const [planes, setPlanes] = useState<PlanEmergencia[]>([]);
  const [activeTab, setActiveTab] = useState<AnexoTipo>('anexo_18');
  const [searchTerm, setSearchTerm] = useState('');
  const [jurisdictionFilter, setJurisdictionFilter] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal de Edición
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Partial<PlanEmergencia> | null>(null);

  const currentUser: User = JSON.parse(localStorage.getItem('currentUser') || '{"id":"temp","name":"Usuario","role":"operador"}');
  const isJefe = (currentUser.role || '').toLowerCase() === 'jefe' || (currentUser.role || '').toLowerCase() === 'admin';

  useEffect(() => {
    const q = query(collection(db, 'planes'), orderBy('empresa', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PlanEmergencia));
      setPlanes(docs);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const getStatusColor = (dateStr: string) => {
    if (!dateStr || dateStr === '-' || dateStr.length < 5) return 'bg-slate-100 text-slate-400';
    
    let d = new Date(dateStr);
    if (isNaN(d.getTime())) {
       const parts = dateStr.split('/');
       if(parts.length === 3) d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    }
    if (isNaN(d.getTime())) return 'bg-slate-100 text-slate-400';

    const now = new Date();
    const diffTime = d.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'bg-red-100 text-red-700 border-red-200 font-bold'; // Vencido
    if (diffDays < 90) return 'bg-yellow-100 text-yellow-700 border-yellow-200 font-bold'; // Por vencer
    return 'bg-green-100 text-green-700 border-green-200'; // Vigente
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan?.empresa) return alert("La empresa es obligatoria");

    const planData = {
      ...editingPlan,
      anexo: activeTab,
      ultimaActualizacion: new Date().toISOString(),
      convalidaciones: editingPlan.convalidaciones || {}
    };

    try {
      if (editingPlan.id) {
        await updateDoc(doc(db, 'planes', editingPlan.id), planData);
      } else {
        await addDoc(collection(db, 'planes'), planData);
      }
      setIsModalOpen(false);
      setEditingPlan(null);
    } catch (error) {
      console.error(error);
      alert("Error al guardar el plan");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("¿Eliminar este registro permanentemente?")) return;
    try {
      await deleteDoc(doc(db, 'planes', id));
    } catch (error) {
      alert("Error al eliminar");
    }
  };

  const filteredPlanes = planes.filter(p => {
    if (p.anexo !== activeTab) return false;
    const matchSearch = p.empresa.toLowerCase().includes(searchTerm.toLowerCase()) || 
                        (p.disposicion || '').toLowerCase().includes(searchTerm.toLowerCase());
    const matchJur = jurisdictionFilter ? p.dependencia === jurisdictionFilter : true;
    return matchSearch && matchJur;
  });

  const uniqueJur = Array.from(new Set(planes.filter(p => p.anexo === activeTab).map(p => p.dependencia))).filter(Boolean).sort();

  return (
    <div className="flex h-screen w-full bg-background-light dark:bg-background-dark overflow-hidden font-display">
      <Sidebar activePage="planes" />
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <main className="flex-1 flex flex-col p-6 overflow-hidden">
            
            <div className="flex justify-between items-center mb-6 shrink-0">
                <div>
                    <h1 className="text-slate-900 dark:text-white text-2xl font-black uppercase tracking-tight">Base de Datos de Planes</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-widest text-primary italic">Control de Vencimientos y Convalidaciones Anuales</p>
                </div>
                <div className="flex gap-2">
                    <button 
                      onClick={() => { setEditingPlan({ convalidaciones: {} }); setIsModalOpen(true); }}
                      className="bg-primary text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-600 transition-all text-xs font-black uppercase shadow-lg"
                    >
                       <span className="material-symbols-outlined text-[18px]">add</span> Nuevo Registro
                    </button>
                </div>
            </div>

            {/* TABS NAVEGACIÓN */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 mb-6 overflow-x-auto no-scrollbar gap-1">
                {ANEXOS.map(tab => (
                    <button 
                        key={tab.id} 
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest whitespace-nowrap border-b-2 transition-colors ${activeTab === tab.id ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* FILTROS */}
            <div className="bg-white dark:bg-slate-900 rounded-xl p-3 border border-slate-200 dark:border-slate-800 mb-6 shrink-0 shadow-sm flex gap-3">
                <div className="relative flex-1 flex items-center">
                    <span className="absolute left-3 text-slate-400 material-symbols-outlined text-[20px]">search</span>
                    <input className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 outline-none focus:ring-1 focus:ring-primary uppercase" placeholder="Buscar por Empresa o Disposición..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
                </div>
                <select className="w-48 px-3 py-2 text-xs font-bold uppercase bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none" value={jurisdictionFilter} onChange={e => setJurisdictionFilter(e.target.value)}>
                    <option value="">Todas las Jurisdicciones</option>
                    {uniqueJur.map(j => <option key={j} value={j}>{j}</option>)}
                </select>
            </div>

            {/* TABLA */}
            <div className="flex-1 overflow-auto bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                {isLoading ? (
                  <div className="flex flex-col items-center justify-center h-64 gap-4">
                    <span className="material-symbols-outlined text-4xl animate-spin text-primary">sync</span>
                    <p className="text-xs font-black uppercase text-slate-400">Cargando base de datos...</p>
                  </div>
                ) : (
                  <table className="w-full text-left border-collapse text-xs">
                      <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10 shadow-sm">
                          <tr className="border-b border-slate-200 dark:border-slate-700">
                              <th className="px-4 py-4 font-black uppercase text-slate-500 w-24">Juris.</th>
                              <th className="px-4 py-4 font-black uppercase text-slate-500">Empresa / Razón Social</th>
                              <th className="px-4 py-4 font-black uppercase text-slate-500 w-48">Disposición</th>
                              <th className="px-4 py-4 font-black uppercase text-slate-500 w-32 text-center">Vencimiento</th>
                              <th className="px-2 py-4 font-black uppercase text-slate-400 text-[10px] text-center w-24">1º Conv</th>
                              <th className="px-2 py-4 font-black uppercase text-slate-400 text-[10px] text-center w-24">2º Conv</th>
                              <th className="px-2 py-4 font-black uppercase text-slate-400 text-[10px] text-center w-24">3º Conv</th>
                              <th className="px-2 py-4 font-black uppercase text-slate-400 text-[10px] text-center w-24">4º Conv</th>
                              <th className="px-4 py-4 font-black uppercase text-slate-500 text-center w-16">Acción</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {filteredPlanes.map((p) => (
                              <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
                                  <td className="px-4 py-4 font-bold text-primary uppercase">{p.dependencia || '-'}</td>
                                  <td className="px-4 py-4">
                                      <div className="flex flex-col">
                                        <span className="font-black text-slate-900 dark:text-white uppercase text-[11px]">{p.empresa}</span>
                                        {p.expedienteOrigenId && <span className="text-[9px] text-slate-400 italic">Vinculado a Exp.</span>}
                                      </div>
                                  </td>
                                  <td className="px-4 py-4 font-mono text-[10px] uppercase text-slate-600 dark:text-slate-400">{p.disposicion || '-'}</td>
                                  <td className="px-4 py-4 text-center">
                                      <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase border ${getStatusColor(p.vencimiento)}`}>
                                          {p.vencimiento || '-'}
                                      </span>
                                  </td>
                                  <td className="px-2 py-4 text-center font-mono text-slate-500">{p.convalidaciones?.anio1 || '-'}</td>
                                  <td className="px-2 py-4 text-center font-mono text-slate-500">{p.convalidaciones?.anio2 || '-'}</td>
                                  <td className="px-2 py-4 text-center font-mono text-slate-500">{p.convalidaciones?.anio3 || '-'}</td>
                                  <td className="px-2 py-4 text-center font-mono text-slate-500">{p.convalidaciones?.anio4 || '-'}</td>
                                  <td className="px-4 py-4 text-center">
                                      <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                          <button onClick={() => { setEditingPlan(p); setIsModalOpen(true); }} className="text-slate-400 hover:text-primary p-1"><span className="material-symbols-outlined text-[18px]">edit</span></button>
                                          {isJefe && <button onClick={() => handleDelete(p.id)} className="text-slate-400 hover:text-red-500 p-1"><span className="material-symbols-outlined text-[18px]">delete</span></button>}
                                      </div>
                                  </td>
                              </tr>
                          ))}
                          {filteredPlanes.length === 0 && (
                            <tr>
                              <td colSpan={9} className="py-20 text-center">
                                <span className="material-symbols-outlined text-4xl text-slate-200 mb-2">search_off</span>
                                <p className="text-slate-400 italic">No se encontraron registros en este anexo.</p>
                              </td>
                            </tr>
                          )}
                      </tbody>
                  </table>
                )}
            </div>
        </main>
      </div>

      {/* MODAL DE EDICIÓN */}
      {isModalOpen && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                <form onSubmit={handleSave}>
                  <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
                    <div>
                      <h2 className="text-xs font-black uppercase tracking-widest">Gestión de Plan de Emergencia</h2>
                      <p className="text-[10px] text-slate-400 uppercase font-bold">{ANEXOS.find(a => a.id === activeTab)?.label}</p>
                    </div>
                    <button type="button" onClick={() => setIsModalOpen(false)}><span className="material-symbols-outlined">close</span></button>
                  </div>
                  
                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Empresa / Razón Social</label>
                        <input 
                          required
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-primary uppercase font-bold" 
                          value={editingPlan?.empresa || ''} 
                          onChange={e => setEditingPlan({...editingPlan!, empresa: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Jurisdicción / Dependencia</label>
                        <input 
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-primary uppercase" 
                          value={editingPlan?.dependencia || ''} 
                          onChange={e => setEditingPlan({...editingPlan!, dependencia: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Disposición de Aprobación</label>
                        <input 
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-primary uppercase font-mono" 
                          value={editingPlan?.disposicion || ''} 
                          onChange={e => setEditingPlan({...editingPlan!, disposicion: e.target.value})}
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Fecha de Vencimiento</label>
                        <input 
                          type="date"
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-primary" 
                          value={editingPlan?.vencimiento || ''} 
                          onChange={e => setEditingPlan({...editingPlan!, vencimiento: e.target.value})}
                        />
                      </div>

                      <div className="md:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-3 mt-2">
                        <div className="col-span-full">
                          <p className="text-[10px] font-black uppercase text-slate-400 border-b pb-1 mb-2">Convalidaciones Anuales</p>
                        </div>
                        {['anio1', 'anio2', 'anio3', 'anio4'].map((y, i) => (
                          <div key={y}>
                            <label className="block text-[9px] font-bold uppercase text-slate-500 mb-1">{i+1}º Conval.</label>
                            <input 
                              placeholder="YYYY-MM-DD"
                              className="w-full px-2 py-1.5 text-[10px] bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded outline-none focus:ring-1 focus:ring-primary font-mono" 
                              value={(editingPlan?.convalidaciones as any)?.[y] || ''} 
                              onChange={e => setEditingPlan({
                                ...editingPlan!, 
                                convalidaciones: { ...editingPlan?.convalidaciones, [y]: e.target.value }
                              })}
                            />
                          </div>
                        ))}
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Observaciones</label>
                        <textarea 
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-primary text-xs h-20" 
                          value={editingPlan?.observaciones || ''} 
                          onChange={e => setEditingPlan({...editingPlan!, observaciones: e.target.value})}
                        />
                      </div>
                  </div>

                  <div className="p-6 bg-slate-50 dark:bg-slate-800/50 flex justify-end gap-3">
                    <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2 text-xs font-black uppercase text-slate-500 hover:text-slate-700">Cancelar</button>
                    <button type="submit" className="px-8 py-2 bg-primary text-white text-xs font-black uppercase rounded-lg shadow-lg hover:bg-blue-600">Guardar Registro</button>
                  </div>
                </form>
            </div>
         </div>
      )}
    </div>
  );
};
