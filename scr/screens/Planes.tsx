
import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from '../components/Sidebar';
import { db } from '../firebase';
import * as XLSX from 'xlsx';
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

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws) as any[];

        if (data.length === 0) return alert("El archivo está vacío");

        if (!confirm(`Se importarán ${data.length} registros al ${activeTab.replace('_', ' ').toUpperCase()}. ¿Continuar?`)) return;

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
        console.error("Error al importar Excel:", error);
        alert("Error al procesar el archivo. Verifique el formato.");
      } finally {
        setIsLoading(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsBinaryString(file);
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
                       <span className="material-symbols-outlined text-[18px]">upload_file</span> Importar Excel
                    </button>
                    <input 
                      type="file" 
                      ref={fileInputRef} 
                      className="hidden" 
                      accept=".xlsx, .xls, .csv" 
                      onChange={handleImportExcel} 
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
