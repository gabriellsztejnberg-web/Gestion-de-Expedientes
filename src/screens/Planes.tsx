
import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from '../components/Sidebar';
import { db } from '../firebase';
import Papa from 'papaparse';
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
import { PlanEmergencia, AnexoTipo, User, Case, Inspeccion, TimelineEvent } from '../types';

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
  
  // Datos para el Perfil de Empresa
  const [cases, setCases] = useState<Case[]>([]);
  const [inspecciones, setInspecciones] = useState<Inspeccion[]>([]);
  const [movimientos, setMovimientos] = useState<TimelineEvent[]>([]);
  
  // Modal de Edición
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Partial<PlanEmergencia> | null>(null);

  // Modal de Perfil
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanEmergencia | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    const unsubExp = onSnapshot(collection(db, 'expedientes'), (snap) => {
      setCases(snap.docs.map(d => ({ id: d.id, ...d.data() } as Case)));
    });
    const unsubInsp = onSnapshot(collection(db, 'inspecciones'), (snap) => {
      setInspecciones(snap.docs.map(d => ({ id: d.id, ...d.data() } as Inspeccion)));
    });
    const unsubMov = onSnapshot(collection(db, 'movimientos'), (snap) => {
      setMovimientos(snap.docs.map(d => ({ id: d.id, ...d.data() } as TimelineEvent)));
    });
    return () => {
      unsubExp();
      unsubInsp();
      unsubMov();
    };
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

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const data = results.data as any[];

          if (data.length === 0) return alert("El archivo CSV está vacío");

          if (!confirm(`Se importarán ${data.length} registros al ${activeTab.replace('_', ' ').toUpperCase()}. ¿Continuar?`)) {
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }

          setIsLoading(true);
          
          // Procesar en lotes de 500 (límite de Firestore)
          const chunks = [];
          for (let i = 0; i < data.length; i += 500) {
            chunks.push(data.slice(i, i + 500));
          }

          for (const chunk of chunks) {
            const batch = writeBatch(db);
            chunk.forEach((row) => {
              const newPlanRef = doc(collection(db, 'planes'));
              const plan: Partial<PlanEmergencia> = {
                empresa: (row.EMPRESA || row.Empresa || row.TITULAR || row.Titular || '').toString().toUpperCase(),
                dependencia: (row.JURISDICCION || row.Jurisdiccion || row.DEPENDENCIA || row.Dependencia || 'S/D').toString().toUpperCase(),
                disposicion: (row.DISPOSICION || row.Disposicion || row.NRO_DISPO || '').toString().toUpperCase(),
                vencimiento: (row.VENCIMIENTO || row.Vencimiento || '').toString(),
                cuit: (row.CUIT || row.Cuit || '').toString(),
                domicilio: (row.DOMICILIO || row.Domicilio || '').toString().toUpperCase(),
                localidad: (row.LOCALIDAD || row.Localidad || '').toString().toUpperCase(),
                email: (row.EMAIL || row.Email || '').toString(),
                telefono: (row.TELEFONO || row.Telefono || row.TEL || '').toString(),
                anexo: activeTab,
                convalidaciones: {
                  anio1: (row.CONV1 || row.CONV_1 || '').toString(),
                  anio2: (row.CONV2 || row.CONV_2 || '').toString(),
                  anio3: (row.CONV3 || row.CONV_3 || '').toString(),
                  anio4: (row.CONV4 || row.CONV_4 || '').toString(),
                },
                ultimaActualizacion: new Date().toISOString()
              };
              if (plan.empresa) {
                batch.set(newPlanRef, plan);
              }
            });
            await batch.commit();
          }

          alert("Importación completada con éxito");
        } catch (error) {
          console.error("Error al importar CSV:", error);
          alert("Error al procesar el archivo. Verifique el formato.");
        } finally {
          setIsLoading(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      },
      error: (error) => {
        console.error("Error parseando CSV:", error);
        alert("Error al leer el archivo CSV.");
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    });
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
                      onClick={() => fileInputRef.current?.click()}
                      className="bg-emerald-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-emerald-700 transition-all text-xs font-black uppercase shadow-lg"
                    >
                       <span className="material-symbols-outlined text-[18px]">upload_file</span> Importar CSV
                    </button>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      accept=".csv" 
                      onChange={handleImportCSV} 
                    />
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
                                        <button 
                                          onClick={() => { setSelectedPlan(p); setIsProfileOpen(true); }}
                                          className="font-black text-slate-900 dark:text-white uppercase text-[11px] text-left hover:text-primary transition-colors"
                                        >
                                          {p.empresa}
                                        </button>
                                        <div className="flex gap-2 items-center">
                                          {p.expedienteOrigenId && <span className="text-[9px] text-slate-400 italic">Vinculado a Exp.</span>}
                                          {p.cuit && <span className="text-[9px] text-slate-500 font-mono">{p.cuit}</span>}
                                        </div>
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
                      <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
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
                          <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">CUIT</label>
                          <input 
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-primary font-mono" 
                            value={editingPlan?.cuit || ''} 
                            onChange={e => setEditingPlan({...editingPlan!, cuit: e.target.value})}
                            placeholder="00-00000000-0"
                          />
                        </div>
                      </div>

                      <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="md:col-span-2">
                          <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Domicilio</label>
                          <input 
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-primary uppercase" 
                            value={editingPlan?.domicilio || ''} 
                            onChange={e => setEditingPlan({...editingPlan!, domicilio: e.target.value})}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Localidad</label>
                          <input 
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-primary uppercase" 
                            value={editingPlan?.localidad || ''} 
                            onChange={e => setEditingPlan({...editingPlan!, localidad: e.target.value})}
                          />
                        </div>
                      </div>

                      <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Email de Contacto</label>
                          <input 
                            type="email"
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-primary" 
                            value={editingPlan?.email || ''} 
                            onChange={e => setEditingPlan({...editingPlan!, email: e.target.value})}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Teléfono</label>
                          <input 
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-primary" 
                            value={editingPlan?.telefono || ''} 
                            onChange={e => setEditingPlan({...editingPlan!, telefono: e.target.value})}
                          />
                        </div>
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
      {/* MODAL PERFIL DE EMPRESA */}
      {isProfileOpen && selectedPlan && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[80] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col">
            <div className="bg-slate-900 text-white px-6 py-5 flex justify-between items-center shrink-0">
              <div className="flex items-center gap-4">
                <div className="size-12 bg-primary/20 rounded-xl flex items-center justify-center">
                  <span className="material-symbols-outlined text-primary text-3xl">corporate_fare</span>
                </div>
                <div>
                  <h2 className="text-lg font-black uppercase tracking-tight leading-none mb-1">{selectedPlan.empresa}</h2>
                  <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest">Perfil Consolidado de la Empresa</p>
                </div>
              </div>
              <button onClick={() => setIsProfileOpen(false)} className="hover:bg-white/10 p-2 rounded-full transition-colors">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Columna Info General */}
                <div className="space-y-6">
                  <section>
                    <h3 className="text-[10px] font-black uppercase text-primary mb-3 border-b border-primary/20 pb-1">Datos de Contacto</h3>
                    <div className="space-y-3">
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-slate-400 text-lg">badge</span>
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase leading-none">CUIT</p>
                          <p className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">{selectedPlan.cuit || 'S/D'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-slate-400 text-lg">location_on</span>
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase leading-none">Domicilio</p>
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">{selectedPlan.domicilio || 'S/D'} {selectedPlan.localidad && `, ${selectedPlan.localidad}`}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-slate-400 text-lg">mail</span>
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase leading-none">Email</p>
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{selectedPlan.email || 'S/D'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-slate-400 text-lg">call</span>
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase leading-none">Teléfono</p>
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{selectedPlan.telefono || 'S/D'}</p>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                    <h3 className="text-[10px] font-black uppercase text-slate-500 mb-3">Estado del Plan</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold uppercase text-slate-400">Vencimiento:</span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${getStatusColor(selectedPlan.vencimiento)}`}>
                          {selectedPlan.vencimiento || 'S/D'}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold uppercase text-slate-400">Disposición:</span>
                        <span className="text-[10px] font-mono font-bold text-slate-600 dark:text-slate-400">{selectedPlan.disposicion || 'S/D'}</span>
                      </div>
                    </div>
                  </section>
                </div>

                {/* Columna Historial / Timeline */}
                <div className="md:col-span-2 space-y-6">
                  <section>
                    <h3 className="text-[10px] font-black uppercase text-primary mb-4 border-b border-primary/20 pb-1">Cronología de Trámites e Inspecciones</h3>
                    <div className="space-y-4">
                      {/* Combinamos expedientes e inspecciones para el timeline */}
                      {[
                        ...cases.filter(c => c.planId === selectedPlan.id).map(c => ({
                          fecha: c.creadoEn,
                          tipo: 'EXPEDIENTE',
                          titulo: c.tramite,
                          detalle: `Nº GDE: ${c.numero}`,
                          estado: c.instancia,
                          id: c.id
                        })),
                        ...inspecciones.filter(i => i.planId === selectedPlan.id || (i.expedienteId && cases.find(c => c.id === i.expedienteId)?.planId === selectedPlan.id)).map(i => ({
                          fecha: i.fecha,
                          tipo: 'INSPECCIÓN',
                          titulo: i.tipo,
                          detalle: `Resultado: ${i.resultado}. Auditor: ${i.auditorNombre}`,
                          estado: i.resultado,
                          id: i.id
                        }))
                      ].sort((a,b) => b.fecha.localeCompare(a.fecha)).map((item, idx) => (
                        <div key={idx} className="relative pl-6 border-l-2 border-slate-200 dark:border-slate-800 pb-4 last:pb-0">
                          <div className={`absolute -left-[7px] top-0 size-3 rounded-full border-2 bg-white dark:bg-slate-900 ${item.tipo === 'EXPEDIENTE' ? 'border-blue-500' : 'border-green-500'}`}></div>
                          <div className="flex justify-between items-start mb-1">
                            <span className={`text-[9px] font-black uppercase ${item.tipo === 'EXPEDIENTE' ? 'text-blue-600' : 'text-green-600'}`}>
                              {item.tipo} - {item.titulo}
                            </span>
                            <span className="text-[9px] font-mono text-slate-400">{new Date(item.fecha).toLocaleDateString()}</span>
                          </div>
                          <p className="text-xs font-bold text-slate-900 dark:text-white mb-1">{item.detalle}</p>
                          
                          {/* Mostrar movimientos asociados si es expediente */}
                          {item.tipo === 'EXPEDIENTE' && (
                            <div className="mt-2 space-y-1">
                              {movimientos.filter(m => m.expedienteId === item.id).sort((a,b) => b.fecha.localeCompare(a.fecha)).slice(0, 2).map((m, midx) => (
                                <div key={midx} className="bg-slate-50 dark:bg-slate-800/30 p-2 rounded text-[10px] text-slate-600 dark:text-slate-400 border border-slate-100 dark:border-slate-800">
                                  <span className="font-bold text-primary mr-2">{new Date(m.fecha).toLocaleDateString()}</span>
                                  {m.texto}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                      
                      {cases.filter(c => c.planId === selectedPlan.id).length === 0 && 
                       inspecciones.filter(i => i.planId === selectedPlan.id).length === 0 && (
                        <p className="text-center py-10 text-slate-400 italic text-xs uppercase font-bold tracking-widest">Sin historial registrado</p>
                      )}
                    </div>
                  </section>
                </div>

              </div>
            </div>

            <div className="p-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800 flex justify-end shrink-0">
              <button onClick={() => setIsProfileOpen(false)} className="px-6 py-2 bg-slate-900 text-white text-[10px] font-black uppercase rounded-lg shadow-lg hover:bg-slate-800 transition-all">Cerrar Perfil</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
