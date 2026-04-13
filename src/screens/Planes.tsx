
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
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
import { extractPlanesFromPDF } from '../services/geminiService';

const ANEXOS: { id: AnexoTipo; label: string }[] = [
  { id: 'anexo_15', label: 'ANEXO 15 (Zonales/Locales)' },
  { id: 'anexo_16', label: 'ANEXO 16 (Ref)' },
  { id: 'anexo_17', label: 'ANEXO 17 (Termap/Oil)' },
  { id: 'anexo_18', label: 'ANEXO 18 (Buques/Barcazas)' },
  { id: 'anexo_19', label: 'ANEXO 19 (Puertos Ref)' },
  { id: 'anexo_20', label: 'ANEXO 20 (Plataformas)' },
];

export const Planes: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
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

  useEffect(() => {
    if (location.state?.openPlanId && planes.length > 0) {
      const plan = planes.find(p => p.id === location.state.openPlanId);
      if (plan) {
        setSelectedPlan(plan);
        setIsProfileOpen(true);
        setActiveTab(plan.anexo);
        // Clear state to avoid reopening on refresh
        navigate(location.pathname, { replace: true, state: {} });
      }
    }
  }, [location.state, planes, navigate, location.pathname]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const currentUser: User = JSON.parse(localStorage.getItem('currentUser') || '{"id":"temp","name":"Usuario","role":"operador"}');
  const isJefe = (currentUser.role || '').toLowerCase() === 'jefe' || (currentUser.role || '').toLowerCase() === 'admin';

  const handleImportPDF = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!confirm(`Se extraerán los datos del PDF usando Inteligencia Artificial y se importarán al ${activeTab.replace('_', ' ').toUpperCase()}. Este proceso puede tardar unos segundos. ¿Continuar?`)) {
      if (pdfInputRef.current) pdfInputRef.current.value = '';
      return;
    }

    setIsLoading(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64Pdf = (reader.result as string).split(',')[1];
        
        try {
          const extractedPlanes = await extractPlanesFromPDF(base64Pdf, activeTab);
          
          if (extractedPlanes.length === 0) {
            alert("No se encontraron registros en el PDF.");
            setIsLoading(false);
            return;
          }

          const existingPlanes = planes.filter(p => p.anexo === activeTab);
          const existingKeys = new Set(existingPlanes.map(p => `${p.empresa}_${p.dependencia}`.toUpperCase()));
          
          let recordsAdded = 0;
          let recordsSkipped = 0;
          const batch = writeBatch(db);

          extractedPlanes.forEach((plan) => {
            const key = `${plan.empresa}_${plan.dependencia}`.toUpperCase();
            if (existingKeys.has(key)) {
              recordsSkipped++;
              return;
            }
            existingKeys.add(key);

            const newPlanRef = doc(collection(db, 'planes'));
            batch.set(newPlanRef, plan);
            recordsAdded++;
          });

          await batch.commit();
          alert(`Importación desde PDF completada.\nAgregados: ${recordsAdded}\nOmitidos (ya existían): ${recordsSkipped}`);
        } catch (error) {
          console.error("Error extracting from PDF:", error);
          alert("Error al procesar el PDF con IA. Intente de nuevo o use CSV.");
        } finally {
          setIsLoading(false);
          if (pdfInputRef.current) pdfInputRef.current.value = '';
        }
      };
      reader.onerror = () => {
        alert("Error al leer el archivo PDF.");
        setIsLoading(false);
      };
    } catch (error) {
      console.error("Error reading file:", error);
      alert("Error al leer el archivo.");
      setIsLoading(false);
    }
  };

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

  const formatDate = (dateStr?: string) => {
    if (!dateStr || dateStr === '-' || dateStr.length < 5) return dateStr || 'S/D';
    let d = new Date(dateStr);
    if (isNaN(d.getTime())) {
       const parts = dateStr.split('/');
       if(parts.length === 3) d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    }
    if (isNaN(d.getTime())) return dateStr;
    // Ajustar por zona horaria para evitar que reste un día
    const userTimezoneOffset = d.getTimezoneOffset() * 60000;
    const adjustedDate = new Date(d.getTime() + userTimezoneOffset);
    const day = adjustedDate.getDate().toString().padStart(2, '0');
    const month = (adjustedDate.getMonth() + 1).toString().padStart(2, '0');
    const year = adjustedDate.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const getStatusColor = (dateStr?: string, isConvalidacion = false, isFulfilled = false) => {
    if (isConvalidacion && isFulfilled) {
      return 'bg-emerald-100 text-emerald-700 border-emerald-200 font-bold'; // Convalidado
    }

    if (!dateStr || dateStr === '-' || dateStr.length < 5) return 'bg-slate-100 text-slate-400';
    
    let d = new Date(dateStr);
    if (isNaN(d.getTime())) {
       const parts = dateStr.split('/');
       if(parts.length === 3) d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
    }
    if (isNaN(d.getTime())) return 'bg-slate-100 text-slate-400';

    const now = new Date();
    now.setHours(0,0,0,0);
    
    // Ajustar la fecha evaluada para que sea a las 00:00 local
    const userTimezoneOffset = d.getTimezoneOffset() * 60000;
    const adjustedDate = new Date(d.getTime() + userTimezoneOffset);
    adjustedDate.setHours(0,0,0,0);

    const diffTime = adjustedDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) return 'bg-red-100 text-red-700 border-red-200 font-bold'; // Vencido
    if (diffDays <= 90) return 'bg-yellow-100 text-yellow-700 border-yellow-200 font-bold'; // Por vencer
    
    if (isConvalidacion) {
      return 'bg-slate-100 text-slate-500 border-slate-200'; // Futuro / Pendiente
    }
    return 'bg-green-100 text-green-700 border-green-200'; // Vigente
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan?.empresa) return alert("La empresa es obligatoria");

    // Prevenir duplicados en guardado manual
    const isDuplicate = planes.some(p => 
      p.id !== editingPlan.id && 
      p.anexo === activeTab && 
      p.empresa.toUpperCase() === editingPlan.empresa?.toUpperCase() &&
      p.dependencia?.toUpperCase() === editingPlan.dependencia?.toUpperCase()
    );

    if (isDuplicate) {
      return alert("Ya existe un registro para esta empresa y dependencia en este anexo.");
    }

    const planData = {
      ...editingPlan,
      anexo: activeTab,
      ultimaActualizacion: new Date().toISOString(),
      convalidaciones: editingPlan.convalidaciones || {},
      convalidacionesDetalle: editingPlan.convalidacionesDetalle || {}
    };

    try {
      if (editingPlan.id) {
        const oldPlan = planes.find(p => p.id === editingPlan.id);
        await updateDoc(doc(db, 'planes', editingPlan.id), planData);

        // Check if there are new convalidacionesDetalle to create Inspecciones
        if (oldPlan && planData.convalidacionesDetalle) {
          const years = ['anio1', 'anio2', 'anio3', 'anio4'] as const;
          for (const year of years) {
            const newDet = planData.convalidacionesDetalle[year];
            const oldDet = oldPlan.convalidacionesDetalle?.[year];
            const newDate = planData.convalidaciones?.[year];
            
            // If there's a new auditor name or date that wasn't there before, create an Inspeccion
            if (newDet?.auditorNombre && newDate && (!oldDet?.auditorNombre || oldDet.auditorNombre !== newDet.auditorNombre || oldPlan.convalidaciones?.[year] !== newDate)) {
              const inspeccionData = {
                fecha: newDate,
                planId: editingPlan.id,
                empresa: planData.empresa,
                auditorNombre: newDet.auditorNombre,
                auditorId: 'S/D', // We don't have the ID from the manual input
                ubicacion: planData.localidad || 'S/D',
                jurisdiccion: planData.dependencia || 'S/D',
                tipo: `Convalidación ${year.replace('anio', 'Año ')}`,
                resultado: 'APROBADO',
                convalidacionNumero: parseInt(year.replace('anio', '')),
                observaciones: `Auditoría registrada manualmente en el perfil de la empresa. Nro IF: ${newDet.nroIF || 'S/D'}, Nro Certificado: ${newDet.nroCertificado || 'S/D'}`,
                anexo: activeTab,
                expedienteNumero: newDet.nroExpediente || 'S/D'
              };
              await addDoc(collection(db, 'inspecciones'), inspeccionData);
            }
          }
        }
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

  const handleRenovar = async () => {
    if (!editingPlan || !editingPlan.id) return;
    if (!confirm("¿Estás seguro de archivar esta disposición y renovar el plan? Se limpiarán los datos actuales de disposición y convalidaciones para cargar los nuevos.")) return;

    const historial = editingPlan.historialDisposiciones || [];
    historial.push({
      disposicion: editingPlan.disposicion || '',
      vencimiento: editingPlan.vencimiento || '',
      formatoDisposicion: editingPlan.formatoDisposicion || '',
      convalidaciones: editingPlan.convalidaciones || {},
      convalidacionesDetalle: editingPlan.convalidacionesDetalle || {},
      fechaArchivo: new Date().toISOString(),
      numeroPlan: editingPlan.numeroPlan || '',
      documentacionExtra: editingPlan.documentacionExtra || ''
    });

    const planData = {
      ...editingPlan,
      disposicion: '',
      vencimiento: '',
      formatoDisposicion: '',
      convalidaciones: {},
      convalidacionesDetalle: {},
      numeroPlan: '',
      documentacionExtra: '',
      historialDisposiciones: historial,
      ultimaActualizacion: new Date().toISOString()
    };

    try {
      await updateDoc(doc(db, 'planes', editingPlan.id), planData);
      setEditingPlan(planData);
      alert("Disposición archivada correctamente. Ahora puedes cargar los nuevos datos.");
    } catch (error) {
      console.error(error);
      alert("Error al renovar el plan");
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

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement> | { target: { files: File[] } }) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Helper para parsear fechas de CSV (DD/MM/YYYY o Excel serial) a YYYY-MM-DD
    const parseCSVDate = (dateStr: string): string => {
      if (!dateStr) return '';
      const str = dateStr.toString().trim();
      
      // Si es solo un año (ej. "2026")
      if (/^20\d{2}$/.test(str)) {
        return `${str}-01-01`;
      }

      // Excel serial date (ej. 45000)
      if (/^\d{5}$/.test(str)) {
        const excelEpoch = new Date(1899, 11, 30);
        const days = parseInt(str, 10);
        const date = new Date(excelEpoch.getTime() + days * 86400000);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      }
      
      // Formato DD/MM/YYYY o DD-MM-YYYY
      const parts = str.split(/[\/\-]/);
      if (parts.length === 3) {
        if (parts[0].length <= 2 && parts[2].length === 4) {
          return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
        }
        if (parts[0].length === 4) {
          return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
        }
      }
      
      const d = new Date(str);
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
      return str;
    };

    let headerCounts: Record<string, number> = {};

    const normalizeKey = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '');

    const getCsvVal = (row: any, possibleNames: string[], excludeNames: string[] = []) => {
      const normalizedNames = possibleNames.map(normalizeKey);
      const normalizedExcludes = excludeNames.map(normalizeKey);
      
      for (const key of Object.keys(row)) {
        const normKey = normalizeKey(key);
        if (normalizedNames.some(n => normKey.includes(n))) {
          if (!normalizedExcludes.some(e => normKey.includes(e))) {
            return row[key];
          }
        }
      }
      return '';
    };

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (header) => {
        const h = header.trim();
        if (headerCounts[h]) {
          headerCounts[h]++;
          return `${h}_${headerCounts[h]}`;
        } else {
          headerCounts[h] = 1;
          return h;
        }
      },
      complete: async (results) => {
        try {
          const data = results.data as any[];

          if (data.length === 0) return alert("El archivo CSV está vacío");

          if (!confirm(`Se importarán ${data.length} registros al ${activeTab.replace('_', ' ').toUpperCase()}. ¿Continuar?`)) {
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }

          setIsLoading(true);
          
          // Obtener registros existentes para evitar duplicados (misma empresa + misma dependencia)
          const existingPlanes = planes.filter(p => p.anexo === activeTab);
          const existingKeys = new Set(existingPlanes.map(p => `${p.empresa}_${p.dependencia}`.toUpperCase()));
          
          const chunks = [];
          for (let i = 0; i < data.length; i += 500) {
            chunks.push(data.slice(i, i + 500));
          }

          let recordsAdded = 0;
          let recordsSkipped = 0;

          for (const chunk of chunks) {
            const batch = writeBatch(db);
            chunk.forEach((rawRow) => {
              // Fix shifted rows (e.g. when first column is an ID but header is missing)
              let row = rawRow;
              const vals = Object.values(rawRow) as string[];
              const keys = Object.keys(rawRow);
              if (vals.length > 1 && /^\d+$/.test(vals[0]?.trim()) && vals[1]?.trim().length === 4) {
                row = {};
                for (let i = 0; i < keys.length; i++) {
                  row[keys[i]] = vals[i + 1] || '';
                }
              }

              let empresaVal = getCsvVal(row, ['empresa', 'titular', 'razonsocial', 'instalacion', 'nombre']);
              if (!empresaVal && Object.keys(row).length > 0) {
                 empresaVal = row[Object.keys(row)[0]];
              }

              const empresaFinal = (empresaVal || 'SIN NOMBRE').toString().toUpperCase().trim();
              const dependenciaFinal = getCsvVal(row, ['juris', 'depen']).toString().toUpperCase().trim() || 'S/D';
              
              const key = `${empresaFinal}_${dependenciaFinal}`;
              if (existingKeys.has(key)) {
                recordsSkipped++;
                return; // Saltar duplicado
              }
              existingKeys.add(key);

              const newPlanRef = doc(collection(db, 'planes'));
              
              const observaciones = getCsvVal(row, ['observaciones', 'documentacionextra', 'respuesta']).toString();
              const isDesafectado = observaciones.toLowerCase().includes('desafectado');

              const disposicionStr = getCsvVal(row, ['disposicion', 'nrodispo']).toString().toUpperCase();
              let formatoDisposicion: 'digital' | 'papel' | '' = '';
              const yearMatch = disposicionStr.match(/-(20\d{2})-/);
              if (yearMatch) {
                const year = parseInt(yearMatch[1], 10);
                formatoDisposicion = year >= 2023 ? 'digital' : 'papel';
              }

              const anio1Date = parseCSVDate(getCsvVal(row, ['1conv', '1insp', '1convalidacion'], ['expediente', 'exp']));
              const anio2Date = parseCSVDate(getCsvVal(row, ['2conv', '2insp', '2convalidacion'], ['expediente', 'exp']));
              const anio3Date = parseCSVDate(getCsvVal(row, ['3conv', '3insp', '3convalidacion'], ['expediente', 'exp']));
              const anio4Date = parseCSVDate(getCsvVal(row, ['4conv', '4insp', '4convalidacion'], ['expediente', 'exp']));

              const anio1Exp = getCsvVal(row, ['expediente1', 'exp1', 'expediente1conv']).toString() || getCsvVal(row, ['expediente'], ['1', '2', '3', '4']).toString();
              const anio2Exp = getCsvVal(row, ['expediente2', 'exp2', 'expediente2conv']).toString();
              const anio3Exp = getCsvVal(row, ['expediente3', 'exp3', 'expediente3conv']).toString();
              const anio4Exp = getCsvVal(row, ['expediente4', 'exp4', 'expediente4conv']).toString();

              const plan: Partial<PlanEmergencia> = {
                empresa: empresaFinal,
                dependencia: dependenciaFinal,
                disposicion: disposicionStr,
                vencimiento: parseCSVDate(getCsvVal(row, ['vencimiento', 'hasta', 'dispofecha'])),
                formatoDisposicion,
                cuit: getCsvVal(row, ['cuit']).toString(),
                domicilio: getCsvVal(row, ['domicilio']).toString().toUpperCase(),
                localidad: getCsvVal(row, ['localidad']).toString().toUpperCase(),
                email: getCsvVal(row, ['email']).toString(),
                telefono: getCsvVal(row, ['telefono', 'tel']).toString(),
                numeroPlan: getCsvVal(row, ['plan', 'nroplan', 'numeroplan']).toString(),
                coordenadas: getCsvVal(row, ['coordenadas', 'latlong', 'ubicacion']).toString(),
                responsablePlan: getCsvVal(row, ['responsable']).toString(),
                contactoPlan: getCsvVal(row, ['contacto']).toString(),
                tipoRespuesta: getCsvVal(row, ['respuesta', 'tiporespuesta']).toString().toLowerCase().includes('tercero') ? 'terceros' : (getCsvVal(row, ['respuesta', 'tiporespuesta']).toString().toLowerCase().includes('propia') ? 'propia' : ''),
                empresaRespuesta: getCsvVal(row, ['empresarespuesta', 'tercero', 'contratista']).toString().toUpperCase(),
                documentacionExtra: observaciones,
                anexo: activeTab,
                estado: isDesafectado ? 'desafectado' : 'vigente',
                convalidaciones: {
                  anio1: anio1Date,
                  anio2: anio2Date,
                  anio3: anio3Date,
                  anio4: anio4Date,
                },
                convalidacionesDetalle: {
                  anio1: { nroExpediente: anio1Exp, nroIF: anio1Date && anio1Exp ? 'S/D' : '' },
                  anio2: { nroExpediente: anio2Exp, nroIF: anio2Date && anio2Exp ? 'S/D' : '' },
                  anio3: { nroExpediente: anio3Exp, nroIF: anio3Date && anio3Exp ? 'S/D' : '' },
                  anio4: { nroExpediente: anio4Exp, nroIF: anio4Date && anio4Exp ? 'S/D' : '' },
                },
                ultimaActualizacion: new Date().toISOString()
              };
              
              batch.set(newPlanRef, plan);
              recordsAdded++;
            });
            await batch.commit();
          }

          alert(`Importación completada.\nAgregados: ${recordsAdded}\nOmitidos (ya existían): ${recordsSkipped}`);
        } catch (error: any) {
          console.error("Error al importar CSV:", error);
          alert(`Error al procesar el archivo. Verifique el formato.\nDetalle: ${error.message}`);
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
    <div className="flex h-screen w-full bg-background-light dark:bg-background-dark overflow-hidden font-display print:h-auto print:overflow-visible">
      <div className="print:hidden h-full">
        <Sidebar activePage="planes" />
      </div>
      <div className="flex-1 flex flex-col h-full overflow-hidden print:hidden">
        <main className="flex-1 flex flex-col p-6 overflow-hidden">
            
            <div className="flex justify-between items-center mb-6 shrink-0">
                <div>
                    <h1 className="text-slate-900 dark:text-white text-2xl font-black uppercase tracking-tight">Base de Datos de Planes</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-widest text-primary italic">Control de Vencimientos y Convalidaciones Anuales</p>
                </div>
                <div className="flex gap-2">
                    <button 
                      onClick={() => pdfInputRef.current?.click()}
                      className="bg-indigo-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-indigo-700 transition-all text-xs font-black uppercase shadow-lg"
                    >
                       <span className="material-symbols-outlined text-[18px]">picture_as_pdf</span> Importar PDF (IA)
                    </button>
                    <input 
                      type="file" 
                      ref={pdfInputRef} 
                      className="hidden" 
                      accept=".pdf" 
                      onChange={handleImportPDF} 
                    />
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
                              <tr key={p.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group ${p.estado === 'desafectado' ? 'bg-orange-50 dark:bg-orange-900/20 opacity-75' : ''}`}>
                                  <td className="px-4 py-4 font-bold text-primary uppercase">
                                    {p.dependencia || '-'}
                                    {p.estado === 'desafectado' && <span className="block text-[8px] text-orange-600 dark:text-orange-400 mt-1 font-black">DESAFECTADO</span>}
                                  </td>
                                  <td className="px-4 py-4">
                                      <div className="flex flex-col">
                                        <button 
                                          onClick={() => { setSelectedPlan(p); setIsProfileOpen(true); }}
                                          className={`font-black uppercase text-[11px] text-left hover:text-primary transition-colors ${p.estado === 'desafectado' ? 'text-orange-800 dark:text-orange-300 line-through' : 'text-slate-900 dark:text-white'}`}
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
                                          {formatDate(p.vencimiento)}
                                      </span>
                                  </td>
                                  <td className="px-2 py-4 text-center">
                                      <span className={`inline-block px-2 py-1 rounded text-[9px] font-bold border ${getStatusColor(p.convalidaciones?.anio1 || '', true, !!(p.convalidacionesDetalle?.anio1?.nroIF && p.convalidacionesDetalle?.anio1?.nroExpediente))}`}>
                                          {!!(p.convalidacionesDetalle?.anio1?.nroIF && p.convalidacionesDetalle?.anio1?.nroExpediente) ? `✅ ${formatDate(p.convalidaciones?.anio1)}` : formatDate(p.convalidaciones?.anio1)}
                                      </span>
                                  </td>
                                  <td className="px-2 py-4 text-center">
                                      <span className={`inline-block px-2 py-1 rounded text-[9px] font-bold border ${getStatusColor(p.convalidaciones?.anio2 || '', true, !!(p.convalidacionesDetalle?.anio2?.nroIF && p.convalidacionesDetalle?.anio2?.nroExpediente))}`}>
                                          {!!(p.convalidacionesDetalle?.anio2?.nroIF && p.convalidacionesDetalle?.anio2?.nroExpediente) ? `✅ ${formatDate(p.convalidaciones?.anio2)}` : formatDate(p.convalidaciones?.anio2)}
                                      </span>
                                  </td>
                                  <td className="px-2 py-4 text-center">
                                      <span className={`inline-block px-2 py-1 rounded text-[9px] font-bold border ${getStatusColor(p.convalidaciones?.anio3 || '', true, !!(p.convalidacionesDetalle?.anio3?.nroIF && p.convalidacionesDetalle?.anio3?.nroExpediente))}`}>
                                          {!!(p.convalidacionesDetalle?.anio3?.nroIF && p.convalidacionesDetalle?.anio3?.nroExpediente) ? `✅ ${formatDate(p.convalidaciones?.anio3)}` : formatDate(p.convalidaciones?.anio3)}
                                      </span>
                                  </td>
                                  <td className="px-2 py-4 text-center">
                                      <span className={`inline-block px-2 py-1 rounded text-[9px] font-bold border ${getStatusColor(p.convalidaciones?.anio4 || '', true, !!(p.convalidacionesDetalle?.anio4?.nroIF && p.convalidacionesDetalle?.anio4?.nroExpediente))}`}>
                                          {!!(p.convalidacionesDetalle?.anio4?.nroIF && p.convalidacionesDetalle?.anio4?.nroExpediente) ? `✅ ${formatDate(p.convalidaciones?.anio4)}` : formatDate(p.convalidaciones?.anio4)}
                                      </span>
                                  </td>
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
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-800 overflow-hidden">
                <form onSubmit={handleSave} className="flex flex-col h-full overflow-hidden">
                  <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center shrink-0">
                    <div>
                      <h2 className="text-xs font-black uppercase tracking-widest">Gestión de Plan de Emergencia</h2>
                      <p className="text-[10px] text-slate-400 uppercase font-bold">{ANEXOS.find(a => a.id === activeTab)?.label}</p>
                    </div>
                    <button type="button" onClick={() => setIsModalOpen(false)}><span className="material-symbols-outlined">close</span></button>
                  </div>
                  
                  <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto flex-1">
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
                        <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Formato de Disposición</label>
                        <select 
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-primary uppercase text-xs" 
                          value={editingPlan?.formatoDisposicion || ''} 
                          onChange={e => setEditingPlan({...editingPlan!, formatoDisposicion: e.target.value as any})}
                        >
                          <option value="">Seleccionar...</option>
                          <option value="digital">Digital</option>
                          <option value="papel">Papel</option>
                        </select>
                      </div>

                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Fecha de Vencimiento</label>
                        <input 
                          type="date"
                          className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-primary" 
                          value={editingPlan?.vencimiento || ''} 
                          onChange={e => {
                            const newVencimiento = e.target.value;
                            const newPlan = { ...editingPlan, vencimiento: newVencimiento };
                            
                            // Autocalcular convalidaciones (-4, -3, -2, -1 años)
                            if (newVencimiento) {
                              const [y, m, dayStr] = newVencimiento.split('-');
                              const yNum = parseInt(y, 10);
                              if (!isNaN(yNum)) {
                                newPlan.convalidaciones = {
                                  ...newPlan.convalidaciones,
                                  anio1: `${yNum - 4}-${m}-${dayStr}`,
                                  anio2: `${yNum - 3}-${m}-${dayStr}`,
                                  anio3: `${yNum - 2}-${m}-${dayStr}`,
                                  anio4: `${yNum - 1}-${m}-${dayStr}`,
                                };
                              }
                            }
                            setEditingPlan(newPlan);
                          }}
                        />
                      </div>

                      <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4 mt-2 border-t border-slate-200 dark:border-slate-700 pt-4">
                        <div className="col-span-full">
                          <p className="text-[10px] font-black uppercase text-slate-400 mb-2">Detalles del Plan</p>
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Nº de Plan</label>
                          <input 
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-primary uppercase font-mono" 
                            value={editingPlan?.numeroPlan || ''} 
                            onChange={e => setEditingPlan({...editingPlan!, numeroPlan: e.target.value})}
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Documentación Extra Aprobada (Opcional)</label>
                          <textarea 
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-primary text-xs h-16" 
                            value={editingPlan?.documentacionExtra || ''} 
                            onChange={e => setEditingPlan({...editingPlan!, documentacionExtra: e.target.value})}
                            placeholder="Ej: Anexo de Evacuación, Planos adicionales..."
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Coordenadas Geográficas</label>
                          <input 
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-primary font-mono" 
                            value={editingPlan?.coordenadas || ''} 
                            onChange={e => setEditingPlan({...editingPlan!, coordenadas: e.target.value})}
                            placeholder="Ej: 34°35'59.0&quot;S 58°22'55.0&quot;W"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Responsable del Plan</label>
                          <input 
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-primary uppercase" 
                            value={editingPlan?.responsablePlan || ''} 
                            onChange={e => setEditingPlan({...editingPlan!, responsablePlan: e.target.value})}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Contacto</label>
                          <input 
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-primary" 
                            value={editingPlan?.contactoPlan || ''} 
                            onChange={e => setEditingPlan({...editingPlan!, contactoPlan: e.target.value})}
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Tipo de Respuesta</label>
                          <select 
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-primary uppercase text-xs" 
                            value={editingPlan?.tipoRespuesta || ''} 
                            onChange={e => setEditingPlan({...editingPlan!, tipoRespuesta: e.target.value as any})}
                          >
                            <option value="">Seleccionar...</option>
                            <option value="propia">Propia</option>
                            <option value="terceros">De Terceros</option>
                          </select>
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Empresa de Respuesta (Si es de terceros)</label>
                          <input 
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-primary uppercase" 
                            value={editingPlan?.empresaRespuesta || ''} 
                            onChange={e => setEditingPlan({...editingPlan!, empresaRespuesta: e.target.value})}
                            disabled={editingPlan?.tipoRespuesta !== 'terceros'}
                          />
                        </div>
                      </div>

                      <div className="md:col-span-2 mt-2 border-t border-slate-200 dark:border-slate-700 pt-4">
                        <div className="col-span-full">
                          <p className="text-[10px] font-black uppercase text-slate-400 mb-4">Registro de Convalidaciones Anuales</p>
                        </div>
                        <div className="space-y-4">
                          {(['anio1', 'anio2', 'anio3', 'anio4'] as const).map((y, i) => {
                            const dateVal = (editingPlan?.convalidaciones as any)?.[y] || '';
                            const det = (editingPlan?.convalidacionesDetalle as any)?.[y] || {};
                            const formatoGlobal = editingPlan?.formatoDisposicion;
                            return (
                              <div key={y} className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                                <div className="flex flex-wrap gap-3 items-start">
                                  <div className="w-32">
                                    <label className="block text-[9px] font-bold uppercase text-slate-500 mb-1">{i+1}º Conval. (Fecha)</label>
                                    <input 
                                      type="date"
                                      className="w-full px-2 py-1.5 text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded outline-none focus:ring-1 focus:ring-primary font-mono" 
                                      value={dateVal} 
                                      onChange={e => setEditingPlan({
                                        ...editingPlan!, 
                                        convalidaciones: { ...editingPlan?.convalidaciones, [y]: e.target.value }
                                      })}
                                    />
                                  </div>
                                  
                                  {formatoGlobal && (
                                    <div className="flex-1 min-w-[200px]">
                                      <label className="block text-[9px] font-bold uppercase text-slate-500 mb-1">Auditor / Inspector</label>
                                      <input 
                                        className="w-full px-2 py-1.5 text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded outline-none focus:ring-1 focus:ring-primary uppercase"
                                        value={det.auditorNombre || ''}
                                        onChange={e => setEditingPlan({
                                          ...editingPlan!,
                                          convalidacionesDetalle: {
                                            ...editingPlan?.convalidacionesDetalle,
                                            [y]: { ...det, auditorNombre: e.target.value }
                                          }
                                        })}
                                      />
                                    </div>
                                  )}
                                  
                                  {formatoGlobal && (
                                    <>
                                      <div className="w-32">
                                        <label className="block text-[9px] font-bold uppercase text-slate-500 mb-1">Nº IF</label>
                                        <input 
                                          className="w-full px-2 py-1.5 text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded outline-none focus:ring-1 focus:ring-primary uppercase font-mono"
                                          value={det.nroIF || ''}
                                          onChange={e => setEditingPlan({
                                            ...editingPlan!,
                                            convalidacionesDetalle: {
                                              ...editingPlan?.convalidacionesDetalle,
                                              [y]: { ...det, nroIF: e.target.value }
                                            }
                                          })}
                                        />
                                      </div>
                                      <div className="w-40">
                                        <label className="block text-[9px] font-bold uppercase text-slate-500 mb-1">Nº Expediente</label>
                                        <input 
                                          className="w-full px-2 py-1.5 text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded outline-none focus:ring-1 focus:ring-primary uppercase font-mono"
                                          value={det.nroExpediente || ''}
                                          onChange={e => setEditingPlan({
                                            ...editingPlan!,
                                            convalidacionesDetalle: {
                                              ...editingPlan?.convalidacionesDetalle,
                                              [y]: { ...det, nroExpediente: e.target.value }
                                            }
                                          })}
                                        />
                                      </div>
                                    </>
                                  )}

                                  {formatoGlobal === 'digital' && (
                                    <div className="w-32">
                                      <label className="block text-[9px] font-bold uppercase text-slate-500 mb-1">Nº Certificado</label>
                                      <input 
                                        className="w-full px-2 py-1.5 text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded outline-none focus:ring-1 focus:ring-primary uppercase font-mono"
                                        value={det.nroCertificado || ''}
                                        onChange={e => setEditingPlan({
                                          ...editingPlan!,
                                          convalidacionesDetalle: {
                                            ...editingPlan?.convalidacionesDetalle,
                                            [y]: { ...det, nroCertificado: e.target.value }
                                          }
                                        })}
                                      />
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
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

                  <div className="p-6 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center shrink-0 border-t border-slate-200 dark:border-slate-700">
                    <div>
                      {editingPlan?.id && (
                        <button type="button" onClick={handleRenovar} className="px-4 py-2 text-xs font-black uppercase text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800/30 transition-colors flex items-center gap-2">
                          <span className="material-symbols-outlined text-sm">history</span>
                          Renovar Disposición
                        </button>
                      )}
                    </div>
                    <div className="flex gap-3">
                      <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2 text-xs font-black uppercase text-slate-500 hover:text-slate-700">Cancelar</button>
                      <button type="submit" className="px-8 py-2 bg-primary text-white text-xs font-black uppercase rounded-lg shadow-lg hover:bg-blue-600">Guardar Registro</button>
                    </div>
                  </div>
                </form>
            </div>
         </div>
      )}
      {/* MODAL PERFIL DE EMPRESA */}
      {isProfileOpen && selectedPlan && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[80] p-4 print:static print:bg-transparent print:p-0 print:block">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col print:shadow-none print:border-none print:max-h-none print:overflow-visible">
            <div className="bg-slate-900 text-white px-6 py-5 flex justify-between items-center shrink-0 print:bg-white print:text-black print:border-b print:border-slate-300">
              <div className="flex items-center gap-4">
                <div className="size-12 bg-primary/20 rounded-xl flex items-center justify-center print:bg-transparent print:border print:border-slate-300">
                  <span className="material-symbols-outlined text-primary text-3xl print:text-black">corporate_fare</span>
                </div>
                <div>
                  <h2 className="text-lg font-black uppercase tracking-tight leading-none mb-1">{selectedPlan.empresa}</h2>
                  <p className="text-[10px] text-slate-400 uppercase font-black tracking-widest print:text-slate-600">Perfil Consolidado de la Empresa</p>
                </div>
              </div>
              <div className="flex items-center gap-2 print:hidden">
                <button onClick={() => window.print()} className="hover:bg-white/10 px-3 py-2 rounded-lg transition-colors flex items-center gap-2 text-xs font-bold uppercase">
                  <span className="material-symbols-outlined text-[18px]">print</span> Imprimir / PDF
                </button>
                <button onClick={() => setIsProfileOpen(false)} className="hover:bg-white/10 p-2 rounded-full transition-colors">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 print:overflow-visible print:p-0 print:mt-6">
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

                  {selectedPlan.observaciones && (
                    <section className="mt-6">
                      <h3 className="text-[10px] font-black uppercase text-primary mb-3 border-b border-primary/20 pb-1">Observaciones</h3>
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                        <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{selectedPlan.observaciones}</p>
                      </div>
                    </section>
                  )}

                  <section className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 mt-6">
                    <h3 className="text-[10px] font-black uppercase text-slate-500 mb-3">Estado del Plan</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold uppercase text-slate-400">Vencimiento:</span>
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${getStatusColor(selectedPlan.vencimiento)}`}>
                          {formatDate(selectedPlan.vencimiento)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold uppercase text-slate-400">Disposición:</span>
                        <span className="text-[10px] font-mono font-bold text-slate-600 dark:text-slate-400">{selectedPlan.disposicion || 'S/D'}</span>
                      </div>
                      {selectedPlan.formatoDisposicion && (
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold uppercase text-slate-400">Formato:</span>
                          <span className={`text-[10px] font-black uppercase ${selectedPlan.formatoDisposicion === 'digital' ? 'text-blue-600' : 'text-orange-600'}`}>{selectedPlan.formatoDisposicion}</span>
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                    <h3 className="text-[10px] font-black uppercase text-slate-500 mb-3">Detalles Operativos</h3>
                    <div className="space-y-3">
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase leading-none mb-1">Nº de Plan</p>
                        <p className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">{selectedPlan.numeroPlan || 'S/D'}</p>
                      </div>
                      {selectedPlan.documentacionExtra && (
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase leading-none mb-1">Documentación Extra Aprobada</p>
                          <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">{selectedPlan.documentacionExtra}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase leading-none mb-1">Coordenadas</p>
                        <p className="text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300">{selectedPlan.coordenadas || 'S/D'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase leading-none mb-1">Responsable</p>
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">{selectedPlan.responsablePlan || 'S/D'}</p>
                        {selectedPlan.contactoPlan && <p className="text-[10px] text-slate-500 mt-0.5">{selectedPlan.contactoPlan}</p>}
                      </div>
                      <div>
                        <p className="text-[9px] font-bold text-slate-400 uppercase leading-none mb-1">Respuesta ante Emergencias</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${selectedPlan.tipoRespuesta === 'propia' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : selectedPlan.tipoRespuesta === 'terceros' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-500 border-slate-200'}`}>
                            {selectedPlan.tipoRespuesta ? (selectedPlan.tipoRespuesta === 'propia' ? 'Propia' : 'De Terceros') : 'S/D'}
                          </span>
                          {selectedPlan.tipoRespuesta === 'terceros' && selectedPlan.empresaRespuesta && (
                            <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase truncate">
                              {selectedPlan.empresaRespuesta}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                    <h3 className="text-[10px] font-black uppercase text-slate-500 mb-3">Registro de Convalidaciones</h3>
                    <div className="space-y-3">
                      {(['anio1', 'anio2', 'anio3', 'anio4'] as const).map((y, i) => {
                        const dateVal = (selectedPlan.convalidaciones as any)?.[y];
                        const det = (selectedPlan.convalidacionesDetalle as any)?.[y];
                        if (!dateVal && !det) return null;
                        
                        return (
                          <div key={y} className="border-l-2 border-primary pl-3 py-1">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[10px] font-black uppercase text-slate-700 dark:text-slate-300">{i+1}º Convalidación</span>
                              <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${getStatusColor(dateVal, true, !!(det?.nroIF && det?.nroExpediente))}`}>
                                {!!(det?.nroIF && det?.nroExpediente) ? `✅ CONVALIDADO (${formatDate(dateVal)})` : formatDate(dateVal)}
                              </span>
                            </div>
                            {det?.auditorNombre && (
                              <div className="mt-2 space-y-1 text-[9px] bg-white dark:bg-slate-900 p-2 rounded border border-slate-100 dark:border-slate-800">
                                {det.auditorNombre && <p><span className="text-slate-400 font-bold uppercase">Auditor:</span> <span className="font-bold uppercase">{det.auditorNombre}</span></p>}
                                {selectedPlan.formatoDisposicion === 'digital' && det.nroCertificado && (
                                  <p><span className="text-slate-400 font-bold uppercase">Certificado:</span> <span className="font-mono">{det.nroCertificado}</span></p>
                                )}
                                {det.nroIF && <p><span className="text-slate-400 font-bold uppercase">IF:</span> <span className="font-mono">{det.nroIF}</span></p>}
                                {det.nroExpediente && <p><span className="text-slate-400 font-bold uppercase">Expediente:</span> <span className="font-mono">{det.nroExpediente}</span></p>}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {(!selectedPlan.convalidaciones || Object.values(selectedPlan.convalidaciones).every(v => !v)) && (
                        <p className="text-[10px] text-slate-400 italic">No hay convalidaciones registradas.</p>
                      )}
                    </div>
                  </section>
                </div>

                {/* Columna Historial / Timeline */}
                <div className="md:col-span-2 space-y-6">
                  <section>
                    <div className="flex justify-between items-end mb-4 border-b border-primary/20 pb-1">
                      <h3 className="text-[10px] font-black uppercase text-primary">Historial de Expedientes y Auditorías</h3>
                    </div>
                    
                    {selectedPlan.historialDisposiciones && selectedPlan.historialDisposiciones.length > 0 && (
                      <div className="mb-6">
                        <h4 className="text-[9px] font-black uppercase text-slate-500 mb-2">Disposiciones Archivadas</h4>
                        <div className="space-y-2">
                          {selectedPlan.historialDisposiciones.map((hist, idx) => (
                            <div key={idx} className="bg-slate-50 dark:bg-slate-800/30 p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex justify-between items-start">
                              <div>
                                <p className="text-[10px] font-mono font-bold text-slate-700 dark:text-slate-300">Dispo: {hist.disposicion || 'S/D'}</p>
                                <p className="text-[9px] text-slate-500 uppercase">Vencimiento: {formatDate(hist.vencimiento)}</p>
                                {hist.numeroPlan && <p className="text-[9px] text-slate-500 uppercase mt-1">Plan: <span className="font-mono">{hist.numeroPlan}</span></p>}
                                {hist.documentacionExtra && <p className="text-[9px] text-slate-500 uppercase">Extra: {hist.documentacionExtra}</p>}
                              </div>
                              <span className="text-[9px] font-bold text-slate-400">Archivado: {formatDate(hist.fechaArchivo)}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="space-y-4">
                      {cases.filter(c => c.empresa.toUpperCase() === selectedPlan.empresa.toUpperCase() || c.planId === selectedPlan.id).map(c => (
                        <div key={c.id} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                          <div className="flex justify-between items-center mb-2">
                            <span className="font-black text-blue-600 dark:text-blue-400 text-xs uppercase tracking-tight">{c.numero}</span>
                            <span className="text-[9px] font-mono font-bold text-slate-400">{new Date(c.creadoEn).toLocaleDateString()}</span>
                          </div>
                          <p className="text-[10px] font-bold text-slate-700 dark:text-slate-300 mb-3 uppercase">{c.tramite}</p>
                          
                          {/* Movimientos del expediente */}
                          <div className="pl-3 border-l-2 border-slate-200 dark:border-slate-700 space-y-2 mt-2">
                            {movimientos.filter(m => m.expedienteId === c.id).sort((a,b) => b.fecha.localeCompare(a.fecha)).map(m => (
                              <div key={m.id} className="text-[9px] text-slate-600 dark:text-slate-400">
                                <span className="font-bold text-primary mr-2">{new Date(m.fecha).toLocaleDateString()}</span>
                                {m.texto}
                              </div>
                            ))}
                          </div>

                          {/* Inspecciones del expediente */}
                          {inspecciones.filter(i => i.expedienteId === c.id).length > 0 && (
                            <div className="mt-4 pt-3 border-t border-slate-200 dark:border-slate-700">
                              <h5 className="text-[9px] font-black uppercase text-green-600 mb-2 flex items-center gap-1">
                                <span className="material-symbols-outlined text-[14px]">fact_check</span> Auditorías / Inspecciones
                              </h5>
                              <div className="space-y-2">
                                {inspecciones.filter(i => i.expedienteId === c.id).map(i => (
                                  <div key={i.id} className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-100 dark:border-slate-800 text-[10px]">
                                    <div className="flex justify-between items-center mb-2 pb-2 border-b border-slate-50 dark:border-slate-800">
                                      <span className="font-black uppercase text-slate-700 dark:text-slate-300">{i.tipo}</span>
                                      <span className="font-mono text-slate-400 font-bold">{new Date(i.fecha).toLocaleDateString()}</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 mb-2">
                                      <p><span className="text-slate-400 font-bold uppercase text-[9px]">Auditor:</span> <span className="font-bold">{i.auditorNombre}</span></p>
                                      <p><span className="text-slate-400 font-bold uppercase text-[9px]">IF:</span> <span className="font-mono">{i.nroInforme || '-'}</span></p>
                                      <p><span className="text-slate-400 font-bold uppercase text-[9px]">Cert/Dispo:</span> <span className="font-mono">{i.nroCertificado || i.nroDisposicion || '-'}</span></p>
                                      <p>
                                        <span className="text-slate-400 font-bold uppercase text-[9px]">Resultado:</span>{' '}
                                        <span className={`font-black uppercase ${i.resultado.includes('APROBADO') ? 'text-green-600' : 'text-orange-600'}`}>
                                          {i.resultado}
                                        </span>
                                      </p>
                                    </div>
                                    {i.observaciones && (
                                      <div className="mt-2 pt-2 border-t border-slate-50 dark:border-slate-800">
                                        <p className="text-[9px] font-bold uppercase text-slate-400 mb-1">Pendientes / Oportunidades de Mejora:</p>
                                        <p className="text-slate-600 dark:text-slate-400 italic">"{i.observaciones}"</p>
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))}
                      
                      {cases.filter(c => c.empresa.toUpperCase() === selectedPlan.empresa.toUpperCase() || c.planId === selectedPlan.id).length === 0 && (
                        <div className="text-center py-10 bg-slate-50 dark:bg-slate-800/30 rounded-xl border border-slate-200 dark:border-slate-800">
                          <span className="material-symbols-outlined text-3xl text-slate-300 mb-2">folder_off</span>
                          <p className="text-slate-400 italic text-xs uppercase font-bold tracking-widest">Sin expedientes registrados</p>
                        </div>
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
