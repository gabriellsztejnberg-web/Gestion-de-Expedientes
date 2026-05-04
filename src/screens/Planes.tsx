
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { db } from '../firebase';
import Papa from 'papaparse';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
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
import { PlanEmergencia, AnexoTipo, User, Case, Inspeccion, TimelineEvent, ANEXOS, EmpresaControlDerrame } from '../types';
import { extractPlanesFromPDF } from '../services/geminiService';

// Fix for default marker icon in Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Helper to parse coordinates
const parseCoordinates = (coordStr?: string): [number, number][] => {
  if (!coordStr) return [];

  const results: [number, number][] = [];
  const parts = coordStr.split(/[;|\n]/).map(p => p.trim()).filter(Boolean);

  for (const part of parts) {
    let cleanStr = part.toUpperCase();
    cleanStr = cleanStr.replace(/LATITUD[E]?|LONGITUD[E]?|LAT|LNG|LON/g, '');
    cleanStr = cleanStr.replace(/[´’`]/g, "'").replace(/[”]/g, '"').replace(/''/g, '"');

    if (!/[NSEWO]/.test(cleanStr)) {
      const decMatch = cleanStr.match(/(-?\d+(?:[\.,]\d+)?)[^\d-]+(-?\d+(?:[\.,]\d+)?)/);
      if (decMatch) {
        let lat = parseFloat(decMatch[1].replace(',', '.'));
        let lng = parseFloat(decMatch[2].replace(',', '.'));
        if (!isNaN(lat) && !isNaN(lng)) {
           if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
              results.push([lng, lat]);
              continue;
           }
           results.push([lat, lng]);
           continue;
        }
      }
    }

    const tokenRegex = /([NSEWO])|(-?\d+(?:[\.,]\d+)?)/g;
    const tokens = [...cleanStr.matchAll(tokenRegex)].map(m => m[0]);

    if (tokens.length >= 2) {
      let latTokens: string[] = [];
      let lngTokens: string[] = [];
      
      let firstHemiIndex = -1;
      let secondHemiIndex = -1;
      
      for (let i = 0; i < tokens.length; i++) {
        if (/[NSEWO]/.test(tokens[i])) {
          if (firstHemiIndex === -1) firstHemiIndex = i;
          else if (secondHemiIndex === -1) secondHemiIndex = i;
        }
      }

      if (firstHemiIndex !== -1 && secondHemiIndex !== -1) {
         let splitAt = firstHemiIndex + 1;
         if (firstHemiIndex === 0) {
            splitAt = secondHemiIndex;
         }
         latTokens = tokens.slice(0, splitAt);
         lngTokens = tokens.slice(splitAt);
      } else {
         const half = Math.floor(tokens.length / 2);
         latTokens = tokens.slice(0, half);
         lngTokens = tokens.slice(half);
      }

      const parseGroup = (tks: string[]): number | null => {
        let val = 0;
        let hemi = '';
        let numIndex = 0;
        let isNegative = false;
        
        for (const t of tks) {
          if (/[NSEWO]/.test(t)) {
            hemi = t;
          } else {
            let n = parseFloat(t.replace(',', '.'));
            if (n < 0) {
              isNegative = true;
              n = Math.abs(n);
            }
            
            if (numIndex === 0) val += n;
            else if (numIndex === 1) val += n / 60;
            else if (numIndex === 2) val += n / 3600;
            numIndex++;
          }
        }
        
        if (numIndex === 0) return null;
        
        if (hemi === 'S' || hemi === 'W' || hemi === 'O' || isNegative) {
          val = -val;
        }
        return val;
      };

      let lat = parseGroup(latTokens);
      let lng = parseGroup(lngTokens);

      if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
         const latHemi = latTokens.find(t => /[NSEWO]/.test(t));
         const lngHemi = lngTokens.find(t => /[NSEWO]/.test(t));
         
         if (latHemi && /[EWO]/.test(latHemi)) {
            const temp = lat; lat = lng; lng = temp;
         } else if (lngHemi && /[NS]/.test(lngHemi)) {
            const temp = lat; lat = lng; lng = temp;
         } else if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) {
            const temp = lat; lat = lng; lng = temp;
         }
         
         results.push([lat, lng]);
         continue;
      }
    }
  }

  return results;
};

export const Planes: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [planes, setPlanes] = useState<PlanEmergencia[]>([]);
  const [auditores, setAuditores] = useState<any[]>([]);
  const [derrames, setDerrames] = useState<EmpresaControlDerrame[]>([]);
  const [activeTab, setActiveTab] = useState<AnexoTipo | 'general'>('general');
  const [searchTerm, setSearchTerm] = useState('');
  const [jurisdictionFilter, setJurisdictionFilter] = useState('');
  const [estadoFilter, setEstadoFilter] = useState('');
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
  const role = (currentUser.role || '').toLowerCase();
  const isJefe = role === 'jefe' || role === 'admin' || role === 'administrator';
  const isSuperior = role === 'superior';

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
    const unsubAuditores = onSnapshot(collection(db, 'auditores'), (snap) => {
      setAuditores(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // Escuchamos ambas colecciones de EMCODECON para completar el listado
    const qDerrames1 = query(collection(db, 'empresas_derrames'));
    const qDerrames2 = query(collection(db, 'control_derrames'));
    
    let snapDerrames1: any = { docs: [] };
    let snapDerrames2: any = { docs: [] };

    const mergeDerrames = (s1: any, s2: any) => {
      const docs1 = s1.docs.map((d: any) => ({ id: d.id, ...d.data() } as EmpresaControlDerrame));
      const docs2 = s2.docs.map((d: any) => ({ id: d.id, ...d.data() } as EmpresaControlDerrame));
      const combined = [...docs1];
      const seenIds = new Set(docs1.map((d: any) => d.id));
      docs2.forEach((d: any) => {
        if (!seenIds.has(d.id)) {
          combined.push(d);
          seenIds.add(d.id);
        }
      });
      setDerrames(combined);
    };

    const unsubDerrames1 = onSnapshot(qDerrames1, (snap) => {
      snapDerrames1 = snap;
      mergeDerrames(snapDerrames1, snapDerrames2);
    });
    const unsubDerrames2 = onSnapshot(qDerrames2, (snap) => {
      snapDerrames2 = snap;
      mergeDerrames(snapDerrames1, snapDerrames2);
    });

    return () => {
      unsubExp();
      unsubInsp();
      unsubMov();
      unsubAuditores();
      unsubDerrames1();
      unsubDerrames2();
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

  const getStatusColor = (dateStr?: string, isConvalidacion = false, isFulfilled = false, anexo?: AnexoTipo) => {
    if (anexo === 'anexo_15') {
       if (isFulfilled) return 'bg-blue-50 text-blue-700 border-blue-100 font-bold';
       return 'bg-slate-50 text-slate-400 border-slate-100 font-normal';
    }

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

  // Keep track of newly created auditors to prevent duplicates during loops
  const newlyCreatedAuditores = useRef<Set<string>>(new Set());

  const ensureAuditorExists = async (auditorNombre: string) => {
    if (!auditorNombre) return;
    const nameUpper = auditorNombre.toUpperCase();
    const exists = auditores.some(a => a.nombre.toUpperCase() === nameUpper) || newlyCreatedAuditores.current.has(nameUpper);
    if (!exists) {
      newlyCreatedAuditores.current.add(nameUpper);
      try {
        await addDoc(collection(db, 'auditores'), {
          nombre: nameUpper,
          dni: '',
          email: '',
          telefono: '',
          jurisdiccion: '',
          estado: 'activo',
          stats: {
            totalHistorico: 0,
            anualActual: 0,
            aprobadas: 0,
            rechazadas: 0
          },
          cursos: []
        });
      } catch (error) {
        console.error("Error creating auditor:", error);
        newlyCreatedAuditores.current.delete(nameUpper);
      }
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>, planId: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 1024 * 1024) { // 1MB limit
      alert("La imagen es demasiado grande. El tamaño máximo es 1MB.");
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64String = reader.result as string;
      try {
        await updateDoc(doc(db, 'planes', planId), {
          logoUrl: base64String
        });
        // Update local state for immediate feedback
        if (selectedPlan && selectedPlan.id === planId) {
          setSelectedPlan({ ...selectedPlan, logoUrl: base64String });
        }
      } catch (error) {
        console.error("Error uploading logo:", error);
        alert("Error al guardar la imagen.");
      }
    };
    reader.readAsDataURL(file);
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

    const isAnexo15 = (editingPlan.anexo || activeTab) === 'anexo_15';

    const planData = {
      ...editingPlan,
      empresaRespuesta: isAnexo15 ? '' : (editingPlan.empresaRespuesta || '').toUpperCase().trim(),
      empresaRespuestaManual: isAnexo15 ? '' : (editingPlan.empresaRespuestaManual || '').toUpperCase().trim(),
      anexo: editingPlan.anexo || activeTab,
      ultimaActualizacion: new Date().toISOString(),
      convalidaciones: isAnexo15 ? {} : (editingPlan.convalidaciones || {}),
      convalidacionesDetalle: isAnexo15 ? {} : (editingPlan.convalidacionesDetalle || {}),
      isSIPA: editingPlan.isSIPA || false,
      sipaEquipamiento: editingPlan.sipaEquipamiento || null,
      presentacionesAnuales: editingPlan.presentacionesAnuales || [],
      // Limpiar campos de empresa para Anexo 15
      ...(isAnexo15 ? {
        cuit: '',
        domicilio: '',
        localidad: '',
        email: '',
        telefono: '',
        vencimiento: '',
        formatoDisposicion: '',
        tipoRespuesta: '',
        cantidadBarreras: ''
      } : {})
    };

    if (planData.anexo === 'general' || !planData.anexo) {
      return alert("Debe seleccionar un anexo válido para la empresa.");
    }

    const { id, ...saveData } = planData;

    try {
      if (editingPlan.id) {
        const oldPlan = planes.find(p => p.id === editingPlan.id);
        await updateDoc(doc(db, 'planes', editingPlan.id), saveData);

        // Check if there are new convalidacionesDetalle to create Inspecciones
        if (oldPlan && planData.convalidacionesDetalle) {
          const years = ['anio1', 'anio2', 'anio3', 'anio4'] as const;
          for (const year of years) {
            const newDet = planData.convalidacionesDetalle[year];
            const newDate = planData.convalidaciones?.[year];
            
            if (newDet?.auditorNombre && newDate) {
              // Check if inspeccion already exists for this plan, year, and auditor
              const inspeccionExists = inspecciones.some(i => 
                i.planId === editingPlan.id && 
                i.convalidacionNumero === parseInt(year.replace('anio', '')) &&
                i.auditorNombre?.toUpperCase() === newDet.auditorNombre.toUpperCase()
              );

              if (!inspeccionExists) {
                await ensureAuditorExists(newDet.auditorNombre);
                const inspeccionData = {
                  fecha: newDate,
                  planId: editingPlan.id,
                  empresa: planData.empresa,
                  auditorNombre: newDet.auditorNombre,
                  auditorId: 'S/D',
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
        }
      } else {
        const newPlanRef = await addDoc(collection(db, 'planes'), saveData);
        
        // Create inspecciones for new plan if it has convalidacionesDetalle
        if (planData.convalidacionesDetalle) {
          const years = ['anio1', 'anio2', 'anio3', 'anio4'] as const;
          for (const year of years) {
            const det = planData.convalidacionesDetalle[year];
            const date = planData.convalidaciones?.[year];
            
            if (det?.auditorNombre && date) {
              await ensureAuditorExists(det.auditorNombre);
              const inspeccionData = {
                fecha: date,
                planId: newPlanRef.id,
                empresa: planData.empresa,
                auditorNombre: det.auditorNombre,
                auditorId: 'S/D',
                ubicacion: planData.localidad || 'S/D',
                jurisdiccion: planData.dependencia || 'S/D',
                tipo: `Convalidación ${year.replace('anio', 'Año ')}`,
                resultado: 'APROBADO',
                convalidacionNumero: parseInt(year.replace('anio', '')),
                observaciones: `Auditoría registrada manualmente en el perfil de la empresa. Nro IF: ${det.nroIF || 'S/D'}, Nro Certificado: ${det.nroCertificado || 'S/D'}`,
                anexo: activeTab,
                expedienteNumero: det.nroExpediente || 'S/D'
              };
              await addDoc(collection(db, 'inspecciones'), inspeccionData);
            }
          }
        }
      }
      setIsModalOpen(false);
      setEditingPlan(null);
    } catch (error) {
      console.error("Error saving plan:", error);
      alert("Error al guardar el plan: " + (error instanceof Error ? error.message : "Error desconocido"));
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

  const handleSyncAuditorias = async () => {
    if (!confirm("¿Sincronizar auditorías históricas? Esto creará registros de inspección para las convalidaciones que ya tienen auditor asignado pero no tienen inspección registrada.")) return;
    
    setIsLoading(true);
    try {
      let addedCount = 0;
      const batch = writeBatch(db);
      
      for (const plan of planes) {
        if (!plan.convalidacionesDetalle) continue;
        
        const years = ['anio1', 'anio2', 'anio3', 'anio4'] as const;
        for (const year of years) {
          const det = plan.convalidacionesDetalle[year];
          const date = plan.convalidaciones?.[year];
          
          if (det?.auditorNombre && date) {
            // Check if inspeccion already exists for this plan, year, and auditor
            const exists = inspecciones.some(i => 
              i.planId === plan.id && 
              i.convalidacionNumero === parseInt(year.replace('anio', '')) &&
              i.auditorNombre?.toUpperCase() === det.auditorNombre.toUpperCase()
            );
            
            if (!exists) {
              await ensureAuditorExists(det.auditorNombre);
              const newInspRef = doc(collection(db, 'inspecciones'));
              batch.set(newInspRef, {
                fecha: date,
                planId: plan.id,
                empresa: plan.empresa,
                auditorNombre: det.auditorNombre,
                auditorId: 'S/D',
                ubicacion: plan.localidad || 'S/D',
                jurisdiccion: plan.dependencia || 'S/D',
                tipo: `Convalidación ${year.replace('anio', 'Año ')}`,
                resultado: 'APROBADO',
                convalidacionNumero: parseInt(year.replace('anio', '')),
                observaciones: `Auditoría sincronizada desde el historial del plan. Nro IF: ${det.nroIF || 'S/D'}, Nro Certificado: ${det.nroCertificado || 'S/D'}`,
                anexo: plan.anexo,
                expedienteNumero: det.nroExpediente || 'S/D'
              });
              addedCount++;
            }
          }
        }
      }
      
      if (addedCount > 0) {
        await batch.commit();
        alert(`Se sincronizaron ${addedCount} auditorías exitosamente.`);
      } else {
        alert("No se encontraron auditorías nuevas para sincronizar.");
      }
    } catch (error) {
      console.error(error);
      alert("Error al sincronizar auditorías");
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement> | { target: { files: File[] } }) => {
    if (activeTab === 'general') {
      alert("Por favor, seleccione un anexo específico antes de importar un CSV.");
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

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
          const existingMap = new Map<string, PlanEmergencia>(existingPlanes.map(p => [`${p.empresa}_${p.dependencia}`.toUpperCase(), p]));
          
          const chunks = [];
          for (let i = 0; i < data.length; i += 500) {
            chunks.push(data.slice(i, i + 500));
          }

          let recordsAdded = 0;
          let recordsUpdated = 0;

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
              const existingPlan = existingMap.get(key);
              
              let planRef;
              if (existingPlan) {
                planRef = doc(db, 'planes', existingPlan.id);
              } else {
                planRef = doc(collection(db, 'planes'));
              }

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

              const anio1Auditor = getCsvVal(row, ['auditor1', 'inspector1']).toString().toUpperCase();
              const anio2Auditor = getCsvVal(row, ['auditor2', 'inspector2']).toString().toUpperCase();
              const anio3Auditor = getCsvVal(row, ['auditor3', 'inspector3']).toString().toUpperCase();
              const anio4Auditor = getCsvVal(row, ['auditor4', 'inspector4']).toString().toUpperCase();

              const planData: Partial<PlanEmergencia> = {
                empresa: empresaFinal,
                dependencia: dependenciaFinal,
                disposicion: disposicionStr || existingPlan?.disposicion || '',
                vencimiento: parseCSVDate(getCsvVal(row, ['vencimiento', 'hasta', 'dispofecha'])) || existingPlan?.vencimiento || '',
                formatoDisposicion: formatoDisposicion || existingPlan?.formatoDisposicion || '',
                cuit: getCsvVal(row, ['cuit']).toString() || existingPlan?.cuit || '',
                domicilio: getCsvVal(row, ['domicilio']).toString().toUpperCase() || existingPlan?.domicilio || '',
                localidad: getCsvVal(row, ['localidad']).toString().toUpperCase() || existingPlan?.localidad || '',
                email: getCsvVal(row, ['email']).toString() || existingPlan?.email || '',
                telefono: getCsvVal(row, ['telefono', 'tel']).toString() || existingPlan?.telefono || '',
                numeroPlan: getCsvVal(row, ['plan', 'nroplan', 'numeroplan']).toString() || existingPlan?.numeroPlan || '',
                coordenadas: getCsvVal(row, ['coordenadas', 'latlong', 'ubicacion']).toString() || existingPlan?.coordenadas || '',
                responsablePlan: getCsvVal(row, ['responsable']).toString() || existingPlan?.responsablePlan || '',
                contactoPlan: getCsvVal(row, ['contacto']).toString() || existingPlan?.contactoPlan || '',
                tipoRespuesta: getCsvVal(row, ['respuesta', 'tiporespuesta']).toString().toLowerCase().includes('tercero') ? 'terceros' : (getCsvVal(row, ['respuesta', 'tiporespuesta']).toString().toLowerCase().includes('propia') ? 'propia' : (existingPlan?.tipoRespuesta || '')),
                empresaRespuesta: getCsvVal(row, ['empresarespuesta', 'tercero', 'contratista']).toString().toUpperCase() || existingPlan?.empresaRespuesta || '',
                documentacionExtra: observaciones || existingPlan?.documentacionExtra || '',
                anexo: activeTab,
                estado: isDesafectado ? 'desafectado' : (existingPlan?.estado || 'vigente'),
                convalidaciones: {
                  anio1: anio1Date || existingPlan?.convalidaciones?.anio1 || '',
                  anio2: anio2Date || existingPlan?.convalidaciones?.anio2 || '',
                  anio3: anio3Date || existingPlan?.convalidaciones?.anio3 || '',
                  anio4: anio4Date || existingPlan?.convalidaciones?.anio4 || '',
                },
                convalidacionesDetalle: {
                  anio1: { 
                    nroExpediente: anio1Exp || existingPlan?.convalidacionesDetalle?.anio1?.nroExpediente || '', 
                    nroIF: (anio1Date && anio1Exp ? 'S/D' : '') || existingPlan?.convalidacionesDetalle?.anio1?.nroIF || '', 
                    auditorNombre: anio1Auditor || existingPlan?.convalidacionesDetalle?.anio1?.auditorNombre || '' 
                  },
                  anio2: { 
                    nroExpediente: anio2Exp || existingPlan?.convalidacionesDetalle?.anio2?.nroExpediente || '', 
                    nroIF: (anio2Date && anio2Exp ? 'S/D' : '') || existingPlan?.convalidacionesDetalle?.anio2?.nroIF || '', 
                    auditorNombre: anio2Auditor || existingPlan?.convalidacionesDetalle?.anio2?.auditorNombre || '' 
                  },
                  anio3: { 
                    nroExpediente: anio3Exp || existingPlan?.convalidacionesDetalle?.anio3?.nroExpediente || '', 
                    nroIF: (anio3Date && anio3Exp ? 'S/D' : '') || existingPlan?.convalidacionesDetalle?.anio3?.nroIF || '', 
                    auditorNombre: anio3Auditor || existingPlan?.convalidacionesDetalle?.anio3?.auditorNombre || '' 
                  },
                  anio4: { 
                    nroExpediente: anio4Exp || existingPlan?.convalidacionesDetalle?.anio4?.nroExpediente || '', 
                    nroIF: (anio4Date && anio4Exp ? 'S/D' : '') || existingPlan?.convalidacionesDetalle?.anio4?.nroIF || '', 
                    auditorNombre: anio4Auditor || existingPlan?.convalidacionesDetalle?.anio4?.auditorNombre || '' 
                  },
                },
                ultimaActualizacion: new Date().toISOString()
              };
              
              if (existingPlan) {
                batch.update(planRef, planData);
                recordsUpdated++;
              } else {
                batch.set(planRef, planData);
                recordsAdded++;
              }

              // Create inspecciones and auditores for imported data
              const years = ['anio1', 'anio2', 'anio3', 'anio4'] as const;
              for (const year of years) {
                const det = planData.convalidacionesDetalle![year];
                const date = planData.convalidaciones![year];
                if (det?.auditorNombre && date) {
                  ensureAuditorExists(det.auditorNombre); // Fire and forget to not block batch
                  const newInspRef = doc(collection(db, 'inspecciones'));
                  batch.set(newInspRef, {
                    fecha: date,
                    planId: planRef.id,
                    empresa: planData.empresa,
                    auditorNombre: det.auditorNombre,
                    auditorId: 'S/D',
                    ubicacion: planData.localidad || 'S/D',
                    jurisdiccion: planData.dependencia || 'S/D',
                    tipo: `Convalidación ${year.replace('anio', 'Año ')}`,
                    resultado: 'APROBADO',
                    convalidacionNumero: parseInt(year.replace('anio', '')),
                    observaciones: `Auditoría importada desde CSV. Nro IF: ${det.nroIF || 'S/D'}`,
                    anexo: activeTab,
                    expedienteNumero: det.nroExpediente || 'S/D'
                  });
                }
              }
            });
            await batch.commit();
          }

          alert(`Importación completada.\nAgregados: ${recordsAdded}\nActualizados: ${recordsUpdated}`);
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

  const handleExportCSV = () => {
    // Collect data to export based on filteredPlanes
    const csvData = filteredPlanes.map(p => ({
      'ID': p.id,
      'EMPRESA/BUQUE': p.empresa,
      'ANEXO': p.anexo,
      'JURISDICCION': p.dependencia,
      'DISPOSICION': p.disposicion,
      'VENCIMIENTO PLAN': p.vencimiento,
      'ESTADO': p.estado || 'vigente',
      'CONV AÑO 1': p.convalidaciones?.anio1 || '',
      'CONV AÑO 2': p.convalidaciones?.anio2 || '',
      'CONV AÑO 3': p.convalidaciones?.anio3 || '',
      'CONV AÑO 4': p.convalidaciones?.anio4 || '',
      'OBSERVACIONES': p.observaciones || ''
    }));

    const csvConfig = Papa.unparse(csvData, { quotes: false, delimiter: ";" });
    const blob = new Blob([csvConfig], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "planes_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredPlanes = planes.filter(p => {
    if (activeTab !== 'general' && p.anexo !== activeTab) return false;
    const searchLower = searchTerm.toLowerCase();
    const matchSearch = !searchTerm || 
                        Object.values(p).some(val => typeof val === 'string' && val.toLowerCase().includes(searchLower)) ||
                        (p.empresa && p.empresa.toLowerCase().includes(searchLower)) ||
                        (p.disposicion && p.disposicion.toLowerCase().includes(searchLower)) ||
                        (p.numeroPlan && p.numeroPlan.toLowerCase().includes(searchLower));
    
    const matchJur = jurisdictionFilter ? p.dependencia === jurisdictionFilter : true;
    const matchEstado = estadoFilter ? (p.estado || 'vigente') === estadoFilter : true;
    
    return matchSearch && matchJur && matchEstado;
  });

  const uniqueJur = Array.from(new Set(planes.filter(p => activeTab === 'general' || p.anexo === activeTab).map(p => p.dependencia))).filter(Boolean).sort();

  // --- DASHBOARD METRICS ---
  const now = new Date();
  const ninetyDaysFromNow = new Date();
  ninetyDaysFromNow.setDate(now.getDate() + 90);

  // Unificamos para las métricas
  const allPlanes = [...planes];
  // Si estamos en general o derrames, incluimos los derrames de las colecciones específicas
  // si es que no están ya en 'planes'. Para ser seguros y no duplicar:
  derrames.forEach(d => {
    if (!allPlanes.find(p => p.id === d.id)) {
      // Adaptamos EmpresaControlDerrame a PlanEmergencia mínimamente para las métricas
      allPlanes.push({
        ...d,
        anexo: 'derrames',
        convalidaciones: {
          anio1: d.convalidacionesDetalle?.anio1?.fecha,
          anio2: d.convalidacionesDetalle?.anio2?.fecha
        }
      } as any);
    }
  });

  const activePlanesForMetrics = activeTab === 'general' ? allPlanes : allPlanes.filter(p => p.anexo === activeTab);
  
  let totalEmpresas = activePlanesForMetrics.length;
  let convalidacionesVencidas = 0;
  let convalidacionesPorVencer = 0;
  let planesVencidos = 0;
  let planesPorVencer = 0;

  activePlanesForMetrics.forEach(p => {
    // Si es Anexo 15, no sumamos alertas (según requerimiento anterior)
    if (p.anexo === 'anexo_15') return;
    if (p.estado === 'desafectado') return;

    let isPlanVencido = false;
    let isPlanPorVencer = false;

    // Plan Disposicion Vencimiento
    if (p.vencimiento && p.vencimiento !== '-' && p.vencimiento.length >= 5) {
      const vDate = new Date(p.vencimiento);
      if (!isNaN(vDate.getTime())) {
        if (vDate < now) {
          planesVencidos++;
          isPlanVencido = true;
        } else if (vDate <= ninetyDaysFromNow) {
          planesPorVencer++;
          isPlanPorVencer = true;
        }
      }
    }

    // Convalidaciones
    let hasConvVencida = false;
    let hasConvPorVencer = false;

    if (p.convalidaciones) {
      Object.entries(p.convalidaciones).forEach(([key, dateStr]) => {
        if (typeof dateStr === 'string' && dateStr && dateStr !== '-' && dateStr.length >= 5) {
          const cDate = new Date(dateStr);
          if (!isNaN(cDate.getTime())) {
            // Verificar si está cumplida para no contarla como vencida
            const detalle = p.convalidacionesDetalle?.[key as keyof typeof p.convalidaciones];
            const isFulfilled = !!(detalle?.nroIF && detalle?.nroExpediente);
            
            if (!isFulfilled) {
              if (cDate < now) {
                hasConvVencida = true;
              } else if (cDate <= ninetyDaysFromNow) {
                hasConvPorVencer = true;
              }
            }
          }
        }
      });
    }

    if (hasConvVencida) {
      convalidacionesVencidas++;
    } else if (hasConvPorVencer && !hasConvVencida) {
      convalidacionesPorVencer++;
    }
  });

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
                  {!isSuperior && (
                    <>
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
                        onClick={handleExportCSV}
                        className="bg-sky-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-sky-700 transition-all text-xs font-black uppercase shadow-lg"
                      >
                         <span className="material-symbols-outlined text-[18px]">download</span> Exportar CSV
                      </button>
                      <button 
                        onClick={handleSyncAuditorias}
                        className="bg-amber-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-amber-700 transition-all text-xs font-black uppercase shadow-lg"
                        title="Sincronizar auditorías históricas"
                      >
                        <span className="material-symbols-outlined text-[18px]">sync</span> Sincronizar Auditorías
                      </button>
                      <button 
                        onClick={() => { setEditingPlan({ convalidaciones: {}, anexo: activeTab === 'general' ? '' : activeTab }); setIsModalOpen(true); }}
                        className="bg-primary text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-600 transition-all text-xs font-black uppercase shadow-lg"
                      >
                         <span className="material-symbols-outlined text-[18px]">add</span> Nuevo Registro
                      </button>
                    </>
                  )}
                </div>
            </div>

            {/* DASHBOARD PANEL */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6 shrink-0">
              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                <div className="size-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                  <span className="material-symbols-outlined">corporate_fare</span>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest mb-0.5">Empresas ({activeTab === 'general' ? 'Total' : ANEXOS.find(a => a.id === activeTab)?.label})</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white leading-none">{totalEmpresas}</p>
                </div>
              </div>
              
              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                <div className="size-10 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center text-orange-600 dark:text-orange-400">
                  <span className="material-symbols-outlined">warning</span>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest leading-tight mb-0.5">Disposic.<br/>Por Vencer</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white leading-none">{planesPorVencer}</p>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                <div className="size-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400">
                  <span className="material-symbols-outlined">error</span>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest leading-tight mb-0.5">Disposic.<br/>Vencidas</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white leading-none">{planesVencidos}</p>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                <div className="size-10 rounded-full bg-yellow-100 dark:bg-yellow-900/30 flex items-center justify-center text-yellow-600 dark:text-yellow-400">
                  <span className="material-symbols-outlined">schedule</span>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest leading-tight mb-0.5">Conval.<br/>Por Vencer</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white leading-none">{convalidacionesPorVencer}</p>
                </div>
              </div>

              <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                <div className="size-10 rounded-full bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400">
                  <span className="material-symbols-outlined">event_busy</span>
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest leading-tight mb-0.5">Conval.<br/>Vencidas</p>
                  <p className="text-2xl font-black text-slate-900 dark:text-white leading-none">{convalidacionesVencidas}</p>
                </div>
              </div>
            </div>

            {/* TABS NAVEGACIÓN */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 mb-6 overflow-x-auto no-scrollbar gap-1">
                <button 
                    onClick={() => setActiveTab('general')}
                    className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest whitespace-nowrap border-b-2 transition-colors ${activeTab === 'general' ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                >
                    Panel General
                </button>
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
                    <input className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 outline-none focus:ring-1 focus:ring-primary uppercase" placeholder="Buscar por todos los atributos..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
                </div>
                <select className="w-48 px-3 py-2 text-xs font-bold uppercase bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none" value={estadoFilter} onChange={e => setEstadoFilter(e.target.value)}>
                    <option value="">Cualquier Estado</option>
                    <option value="vigente">Vigente</option>
                    <option value="desafectado">Desafectado</option>
                </select>
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
                              <th className="px-4 py-4 font-black uppercase text-slate-500">{activeTab === 'anexo_15' ? 'Prefectura' : 'Empresa / Razón Social'}</th>
                              <th className="px-4 py-4 font-black uppercase text-slate-500 w-48">{activeTab === 'anexo_15' ? 'Nº Disposición IF' : 'Disposición'}</th>
                              <th className="px-4 py-4 font-black uppercase text-slate-500 w-32 text-center">{activeTab === 'anexo_15' ? 'SIPA?' : 'Vencimiento'}</th>
                              <th className="px-2 py-4 font-black uppercase text-slate-400 text-[10px] text-center w-24">{activeTab === 'anexo_15' ? 'B. Puerto (m)' : '1º Conv'}</th>
                              <th className="px-2 py-4 font-black uppercase text-slate-400 text-[10px] text-center w-24">{activeTab === 'anexo_15' ? 'B. Fluv. (m)' : '2º Conv'}</th>
                              <th className="px-2 py-4 font-black uppercase text-slate-400 text-[10px] text-center w-24">{activeTab === 'anexo_15' ? 'Skimmers' : '3º Conv'}</th>
                              <th className="px-2 py-4 font-black uppercase text-slate-400 text-[10px] text-center w-24">{activeTab === 'anexo_15' ? 'Emb.' : '4º Conv'}</th>
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
                                          {p.cuit && p.anexo !== 'anexo_15' && <span className="text-[9px] text-slate-500 font-mono">{p.cuit}</span>}
                                        </div>
                                      </div>
                                  </td>
                                  <td className="px-4 py-4 font-mono text-[10px] uppercase text-slate-600 dark:text-slate-400">
                                    {p.anexo === 'anexo_15' ? (
                                      <div className="flex flex-col">
                                        <span>IF: {p.numeroPlan || '-'}</span>
                                        <span>DISPO: {p.disposicion || '-'}</span>
                                      </div>
                                    ) : (
                                      p.disposicion || '-'
                                    )}
                                  </td>
                                  <td className="px-4 py-4 text-center">
                                      {p.anexo === 'anexo_15' ? (
                                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-black uppercase border ${p.isSIPA ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-400 border-slate-100'}`}>
                                          {p.isSIPA ? 'SIPA' : 'NO'}
                                        </span>
                                      ) : (
                                        <span className={`inline-block px-3 py-1 rounded-full text-[10px] font-black uppercase border ${getStatusColor(p.vencimiento)}`}>
                                            {formatDate(p.vencimiento)}
                                        </span>
                                      )}
                                  </td>
                                  <td className="px-2 py-4 text-center">
                                      {p.anexo === 'anexo_15' ? (
                                        <span className="text-[10px] font-bold text-blue-600">
                                          {p.sipaEquipamiento?.barrerasPuerto || '0'}m
                                        </span>
                                      ) : (
                                        <span className={`inline-block px-2 py-1 rounded text-[9px] font-bold border ${getStatusColor(p.convalidaciones?.anio1 || p.convalidacionesDetalle?.anio1?.fecha || '', true, !!(p.convalidacionesDetalle?.anio1?.nroIF && p.convalidacionesDetalle?.anio1?.nroExpediente))}`}>
                                            {!!(p.convalidacionesDetalle?.anio1?.nroIF && p.convalidacionesDetalle?.anio1?.nroExpediente) ? `✅ ${formatDate(p.convalidaciones?.anio1 || p.convalidacionesDetalle?.anio1?.fecha)}` : formatDate(p.convalidaciones?.anio1 || p.convalidacionesDetalle?.anio1?.fecha)}
                                        </span>
                                      )}
                                  </td>
                                  <td className="px-2 py-4 text-center">
                                      {p.anexo === 'anexo_15' ? (
                                        <span className="text-[10px] font-bold text-blue-600">
                                          {p.sipaEquipamiento?.barrerasFluvial || '0'}m
                                        </span>
                                      ) : (
                                        <span className={`inline-block px-2 py-1 rounded text-[9px] font-bold border ${getStatusColor(p.convalidaciones?.anio2 || p.convalidacionesDetalle?.anio2?.fecha || '', true, !!(p.convalidacionesDetalle?.anio2?.nroIF && p.convalidacionesDetalle?.anio2?.nroExpediente))}`}>
                                            {!!(p.convalidacionesDetalle?.anio2?.nroIF && p.convalidacionesDetalle?.anio2?.nroExpediente) ? `✅ ${formatDate(p.convalidaciones?.anio2 || p.convalidacionesDetalle?.anio2?.fecha)}` : formatDate(p.convalidaciones?.anio2 || p.convalidacionesDetalle?.anio2?.fecha)}
                                        </span>
                                      )}
                                  </td>
                                  <td className="px-2 py-4 text-center">
                                      {p.anexo === 'anexo_15' ? (
                                        <span className="text-[10px] font-bold text-indigo-600">
                                          {p.sipaEquipamiento?.skimmers || '0'}
                                        </span>
                                      ) : (
                                        (p.anexo !== 'derrames' && p.convalidaciones?.anio3) ? (
                                          <span className={`inline-block px-2 py-1 rounded text-[9px] font-bold border ${getStatusColor(p.convalidaciones?.anio3 || '', true, !!(p.convalidacionesDetalle?.anio3?.nroIF && p.convalidacionesDetalle?.anio3?.nroExpediente))}`}>
                                              {!!(p.convalidacionesDetalle?.anio3?.nroIF && p.convalidacionesDetalle?.anio3?.nroExpediente) ? `✅ ${formatDate(p.convalidaciones?.anio3)}` : formatDate(p.convalidaciones?.anio3)}
                                          </span>
                                        ) : '-'
                                      )}
                                  </td>
                                  <td className="px-2 py-4 text-center">
                                      {p.anexo === 'anexo_15' ? (
                                        <span className="text-[10px] font-bold text-indigo-600">
                                          {p.sipaEquipamiento?.embarcaciones || '0'}
                                        </span>
                                      ) : (
                                        (p.anexo !== 'derrames' && p.convalidaciones?.anio4) ? (
                                          <span className={`inline-block px-2 py-1 rounded text-[9px] font-bold border ${getStatusColor(p.convalidaciones?.anio4 || '', true, !!(p.convalidacionesDetalle?.anio4?.nroIF && p.convalidacionesDetalle?.anio4?.nroExpediente))}`}>
                                              {!!(p.convalidacionesDetalle?.anio4?.nroIF && p.convalidacionesDetalle?.anio4?.nroExpediente) ? `✅ ${formatDate(p.convalidaciones?.anio4)}` : formatDate(p.convalidaciones?.anio4)}
                                          </span>
                                        ) : '-'
                                      )}
                                  </td>
                                  <td className="px-4 py-4 text-center">
                                      <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                          {!isSuperior && <button onClick={() => { 
                                            const pData = { ...p };
                                            if (!pData.empresaRespuestaManual && pData.empresaRespuesta) {
                                              pData.empresaRespuestaManual = pData.empresaRespuesta;
                                            }
                                            setEditingPlan(pData); 
                                            setIsModalOpen(true); 
                                          }} className="text-slate-400 hover:text-primary p-1"><span className="material-symbols-outlined text-[18px]">edit</span></button>}
                                          {!isSuperior && isJefe && <button onClick={() => handleDelete(p.id)} className="text-slate-400 hover:text-red-500 p-1"><span className="material-symbols-outlined text-[18px]">delete</span></button>}
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

      {/* DATALIST PARA AUDITORES */}
      <datalist id="auditores-list">
        {auditores.map(a => (
          <option key={a.id} value={a.nombre} />
        ))}
      </datalist>

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
                        <div className="md:col-span-1">
                          <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Anexo</label>
                          <select 
                            required
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-primary uppercase font-bold" 
                            value={editingPlan?.anexo || ''} 
                            onChange={e => setEditingPlan({...editingPlan!, anexo: e.target.value as AnexoTipo})}
                          >
                            <option value="">Seleccionar Anexo...</option>
                            {ANEXOS.map(a => (
                              <option key={a.id} value={a.id}>{a.label}</option>
                            ))}
                          </select>
                        </div>
                        <div className="md:col-span-2">
                          <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">{editingPlan?.anexo === 'anexo_15' ? 'Dependencia / Prefectura' : 'Empresa / Razón Social'}</label>
                          <input 
                            required
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-primary uppercase font-bold" 
                            value={editingPlan?.empresa || ''} 
                            onChange={e => setEditingPlan({...editingPlan!, empresa: e.target.value})}
                          />
                        </div>
                        {editingPlan?.anexo !== 'anexo_15' && (
                          <div>
                            <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">CUIT</label>
                            <input 
                              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-primary font-mono" 
                              value={editingPlan?.cuit || ''} 
                              onChange={e => setEditingPlan({...editingPlan!, cuit: e.target.value})}
                              placeholder="00-00000000-0"
                            />
                          </div>
                        )}
                      </div>

                      {editingPlan?.anexo !== 'anexo_15' && (
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
                      )}

                      {editingPlan?.anexo !== 'anexo_15' && (
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
                      )}

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

                      {editingPlan?.anexo !== 'anexo_15' && (
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
                      )}

                      {editingPlan?.anexo !== 'anexo_15' && (
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
                      )}

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
                        {editingPlan?.anexo !== 'anexo_15' && (
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
                        )}
                        {editingPlan?.anexo !== 'anexo_15' && (
                          <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                               <div>
                                 <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Nombre Registrado (Manual/Histórico)</label>
                                 <input 
                                   className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-primary uppercase text-xs font-bold" 
                                   value={editingPlan?.empresaRespuestaManual || ''} 
                                   onChange={e => setEditingPlan({...editingPlan!, empresaRespuestaManual: e.target.value})}
                                   placeholder="VALOR CARGADO ANTERIORMENTE"
                                   disabled={editingPlan?.tipoRespuesta !== 'terceros'}
                                 />
                               </div>
                               <div>
                                 <label className="block text-[10px] font-black uppercase text-indigo-500 mb-1 flex items-center gap-1">
                                   <span className="material-symbols-outlined text-[14px]">link</span> Vincular a EMCODECON (Sistema)
                                 </label>
                                 <select 
                                   className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-900 rounded-lg outline-none focus:ring-1 focus:ring-indigo-500 uppercase text-xs font-bold text-indigo-600 cursor-pointer" 
                                   value={editingPlan?.empresaRespuesta || ''} 
                                   onChange={e => setEditingPlan({...editingPlan!, empresaRespuesta: e.target.value})}
                                   disabled={editingPlan?.tipoRespuesta !== 'terceros'}
                                 >
                                   <option value="">-- SELECCIONAR EMCODECON --</option>
                                   {derrames.sort((a,b) => a.empresa.localeCompare(b.empresa)).map(d => (
                                     <option key={d.id} value={d.empresa}>{d.empresa}</option>
                                   ))}
                                 </select>
                               </div>
                            </div>
                            <div>
                              <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Metros de Barrera (Si es propia)</label>
                              <input 
                                type="number"
                                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-primary font-bold" 
                                value={editingPlan?.cantidadBarreras || ''} 
                                onChange={e => setEditingPlan({...editingPlan!, cantidadBarreras: e.target.value})}
                                disabled={editingPlan?.tipoRespuesta !== 'propia'}
                                placeholder="0"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {editingPlan?.anexo === 'anexo_15' && (
                        <div className="md:col-span-2 space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                          <div className="flex items-center gap-4 bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800">
                            <label className="flex items-center gap-3 cursor-pointer group">
                              <div className="relative">
                                <input 
                                  type="checkbox" 
                                  className="peer sr-only" 
                                  checked={editingPlan?.isSIPA || false}
                                  onChange={e => setEditingPlan({...editingPlan!, isSIPA: e.target.checked})}
                                />
                                <div className="size-6 bg-white dark:bg-slate-800 border-2 border-slate-300 dark:border-slate-600 rounded-lg group-hover:border-primary peer-checked:bg-primary peer-checked:border-primary transition-all"></div>
                                <span className="absolute inset-0 flex items-center justify-center text-white opacity-0 peer-checked:opacity-100 transition-opacity">
                                  <span className="material-symbols-outlined text-[16px]">check</span>
                                </span>
                              </div>
                              <div>
                                <span className="block text-sm font-black uppercase text-slate-800 dark:text-white">Estación SIPA</span>
                                <span className="block text-[10px] text-slate-500 uppercase font-bold">Marque si esta prefectura posee equipamiento SIPA</span>
                              </div>
                            </label>
                          </div>

                          {editingPlan?.isSIPA && (
                            <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
                              <p className="text-[10px] font-black uppercase text-indigo-600 tracking-widest border-b border-indigo-100 dark:border-indigo-900 pb-1">Equipamiento SIPA (Capacidades de la Base)</p>
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                  <label className="block text-[9px] font-bold uppercase text-slate-500 mb-1 text-center">Barreras Portuarias (m)</label>
                                  <input 
                                    type="number" 
                                    className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none font-bold text-center"
                                    value={editingPlan.sipaEquipamiento?.barrerasPuerto || ''}
                                    onChange={e => setEditingPlan({...editingPlan!, sipaEquipamiento: { ...editingPlan!.sipaEquipamiento || {}, barrerasPuerto: e.target.value }})}
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9px] font-bold uppercase text-slate-500 mb-1 text-center">Fluvial / Lacustre (m)</label>
                                  <input 
                                    type="number" 
                                    className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none font-bold text-center"
                                    value={editingPlan.sipaEquipamiento?.barrerasFluvial || ''}
                                    onChange={e => setEditingPlan({...editingPlan!, sipaEquipamiento: { ...editingPlan!.sipaEquipamiento || {}, barrerasFluvial: e.target.value }})}
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9px] font-bold uppercase text-slate-500 mb-1 text-center">Marítimas (m)</label>
                                  <input 
                                    type="number" 
                                    className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none font-bold text-center"
                                    value={editingPlan.sipaEquipamiento?.barrerasMaritima || ''}
                                    onChange={e => setEditingPlan({...editingPlan!, sipaEquipamiento: { ...editingPlan!.sipaEquipamiento || {}, barrerasMaritima: e.target.value }})}
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9px] font-bold uppercase text-slate-500 mb-1 text-center">Skimmers</label>
                                  <input 
                                    type="number" 
                                    className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none font-bold text-center"
                                    value={editingPlan.sipaEquipamiento?.skimmers || ''}
                                    onChange={e => setEditingPlan({...editingPlan!, sipaEquipamiento: { ...editingPlan!.sipaEquipamiento || {}, skimmers: e.target.value ? Number(e.target.value) : undefined }})}
                                  />
                                </div>
                                <div>
                                  <label className="block text-[9px] font-bold uppercase text-slate-500 mb-1 text-center">Embarcaciones</label>
                                  <input 
                                    type="number" 
                                    className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none font-bold text-center"
                                    value={editingPlan.sipaEquipamiento?.embarcaciones || ''}
                                    onChange={e => setEditingPlan({...editingPlan!, sipaEquipamiento: { ...editingPlan!.sipaEquipamiento || {}, embarcaciones: e.target.value ? Number(e.target.value) : undefined }})}
                                  />
                                </div>
                                <div className="md:col-span-3">
                                  <label className="block text-[9px] font-bold uppercase text-slate-500 mb-1">Otros Materiales y Capacidad</label>
                                  <textarea 
                                    className="w-full px-3 py-2 text-xs border rounded dark:bg-slate-800 dark:border-slate-700 outline-none min-h-[60px]"
                                    value={editingPlan.sipaEquipamiento?.materiales || ''}
                                    onChange={e => setEditingPlan({...editingPlan!, sipaEquipamiento: { ...editingPlan!.sipaEquipamiento || {}, materiales: e.target.value }})}
                                    placeholder="Detalle de equipamiento adicional..."
                                  />
                                </div>
                              </div>
                            </div>
                          )}

                          <div className="space-y-3">
                             <div className="flex justify-between items-center">
                                <p className="text-[10px] font-black uppercase text-slate-400">Presentaciones Anuales del Plan</p>
                                <button 
                                  type="button" 
                                  onClick={() => {
                                    const nextYear = new Date().getFullYear();
                                    const presents = [...(editingPlan.presentacionesAnuales || [])];
                                    presents.push({ anio: nextYear, fecha: new Date().toISOString().split('T')[0], nroIF: '', disposicion: '' });
                                    setEditingPlan({...editingPlan!, presentacionesAnuales: presents});
                                  }}
                                  className="text-[9px] font-black uppercase text-primary hover:underline flex items-center gap-1"
                                >
                                  <span className="material-symbols-outlined text-sm">add</span> Agregar Presentación
                                </button>
                             </div>
                             
                             <div className="grid grid-cols-1 gap-2">
                               {editingPlan.presentacionesAnuales?.sort((a,b) => b.anio - a.anio).map((pr, idx) => (
                                 <div key={idx} className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-wrap gap-4 items-end">
                                   <div className="w-20">
                                     <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Año</label>
                                     <input 
                                       type="number" 
                                       className="w-full px-2 py-1 border rounded text-xs font-bold" 
                                       value={pr.anio} 
                                       onChange={e => {
                                          const presents = [...editingPlan.presentacionesAnuales!];
                                          presents[idx].anio = Number(e.target.value);
                                          setEditingPlan({...editingPlan!, presentacionesAnuales: presents});
                                       }}
                                     />
                                   </div>
                                   <div className="w-32">
                                     <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Fecha Pres.</label>
                                     <input 
                                       type="date" 
                                       className="w-full px-2 py-1 border rounded text-xs" 
                                       value={pr.fecha} 
                                       onChange={e => {
                                          const presents = [...editingPlan.presentacionesAnuales!];
                                          presents[idx].fecha = e.target.value;
                                          setEditingPlan({...editingPlan!, presentacionesAnuales: presents});
                                       }}
                                     />
                                   </div>
                                   <div className="flex-1 min-w-[120px]">
                                     <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Nº IF (Plan)</label>
                                     <input 
                                       className="w-full px-2 py-1 border rounded text-xs font-mono uppercase" 
                                       value={pr.nroIF} 
                                       onChange={e => {
                                          const presents = [...editingPlan.presentacionesAnuales!];
                                          presents[idx].nroIF = e.target.value;
                                          setEditingPlan({...editingPlan!, presentacionesAnuales: presents});
                                       }}
                                     />
                                   </div>
                                   <div className="flex-1 min-w-[120px]">
                                     <label className="block text-[9px] font-bold text-slate-500 uppercase mb-1">Nº Disposición</label>
                                     <input 
                                       className="w-full px-2 py-1 border rounded text-xs font-mono uppercase" 
                                       value={pr.disposicion} 
                                       onChange={e => {
                                          const presents = [...editingPlan.presentacionesAnuales!];
                                          presents[idx].disposicion = e.target.value;
                                          setEditingPlan({...editingPlan!, presentacionesAnuales: presents});
                                       }}
                                     />
                                   </div>
                                   <button 
                                     type="button"
                                     onClick={() => {
                                        const presents = [...editingPlan.presentacionesAnuales!];
                                        presents.splice(idx, 1);
                                        setEditingPlan({...editingPlan!, presentacionesAnuales: presents});
                                     }}
                                     className="text-red-400 hover:text-red-600 p-1"
                                   >
                                     <span className="material-symbols-outlined text-sm">delete</span>
                                   </button>
                                 </div>
                               ))}
                             </div>
                          </div>
                        </div>
                      )}

                      {editingPlan?.anexo !== 'anexo_15' && (
                        <div className="md:col-span-2 mt-2 border-t border-slate-200 dark:border-slate-700 pt-4">
                        <div className="col-span-full">
                          <p className="text-[10px] font-black uppercase text-slate-400 mb-4">Registro de Convalidaciones Anuales</p>
                        </div>
                        <div className="space-y-4">
                          {(editingPlan?.anexo === 'derrames' ? ['anio1', 'anio2'] : ['anio1', 'anio2', 'anio3', 'anio4']).map((y, i) => {
                            const dateVal = (editingPlan?.convalidaciones as any)?.[y] || (editingPlan?.convalidacionesDetalle as any)?.[y]?.fecha || '';
                            const det = (editingPlan?.convalidacionesDetalle as any)?.[y] || {};
                            const formatoGlobal = (editingPlan?.formatoDisposicion || editingPlan?.anexo === 'derrames');
                            return (
                              <div key={y} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                                <div className="flex flex-wrap gap-3 items-start">
                                  <div className="w-32">
                                    <label className="block text-[9px] font-black uppercase text-slate-500 mb-1 leading-none">{i+1}º Conval. (Fecha)</label>
                                    <input 
                                      type="date"
                                      className="w-full px-2 py-1.5 text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded outline-none focus:ring-1 focus:ring-primary font-mono font-bold" 
                                      value={dateVal} 
                                      onChange={e => setEditingPlan({
                                        ...editingPlan!, 
                                        convalidaciones: { ...editingPlan?.convalidaciones, [y]: e.target.value },
                                        convalidacionesDetalle: {
                                          ...editingPlan?.convalidacionesDetalle,
                                          [y]: { ...det, fecha: e.target.value }
                                        }
                                      })}
                                    />
                                  </div>
                                  
                                  {formatoGlobal && (
                                    <div className="flex-1 min-w-[200px]">
                                      <label className="block text-[9px] font-black uppercase text-slate-500 mb-1 leading-none">Auditor / Inspector (Separar por comas)</label>
                                      <input 
                                        list="auditores-list"
                                        className="w-full px-2 py-1.5 text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded outline-none focus:ring-1 focus:ring-primary uppercase font-bold"
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
                                      <div className="w-48">
                                        <label className="block text-[9px] font-black uppercase text-slate-500 mb-1 leading-none">Nº IF / Informe</label>
                                        <input 
                                          className="w-full px-2 py-1.5 text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded outline-none focus:ring-1 focus:ring-primary uppercase font-mono font-bold"
                                          value={det.nroIF || ''}
                                          onChange={e => setEditingPlan({
                                            ...editingPlan!,
                                            convalidacionesDetalle: {
                                              ...editingPlan?.convalidacionesDetalle,
                                              [y]: { ...det, nroIF: e.target.value }
                                            }
                                          })}
                                          placeholder="VARIOS SEPARADOS POR COMA"
                                        />
                                      </div>
                                      <div className="w-40">
                                        <label className="block text-[9px] font-black uppercase text-slate-500 mb-1 leading-none">Nº Expediente</label>
                                        <input 
                                          className="w-full px-2 py-1.5 text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded outline-none focus:ring-1 focus:ring-primary uppercase font-mono font-bold"
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
                                      <div className="w-40">
                                        <label className="block text-[9px] font-bold uppercase text-slate-500 mb-1">Nº Certificado</label>
                                        <input 
                                          className="w-full px-2 py-1.5 text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded outline-none focus:ring-1 focus:ring-primary uppercase font-mono"
                                          value={det.nroCertificadoConvalidacion || ''}
                                          onChange={e => setEditingPlan({
                                            ...editingPlan!,
                                            convalidacionesDetalle: {
                                              ...editingPlan?.convalidacionesDetalle,
                                              [y]: { ...det, nroCertificadoConvalidacion: e.target.value }
                                            }
                                          })}
                                        />
                                      </div>
                                    </>
                                  )}

                                </div>
                                <div className="mt-3 bg-white dark:bg-slate-900/50 p-2 rounded border border-slate-100 dark:border-slate-800">
                                  <label className="block text-[8px] font-black uppercase text-slate-400 mb-1">Observaciones / Pendientes de Subsanación</label>
                                  <textarea 
                                    className="w-full px-2 py-1.5 text-[10px] bg-transparent border-none outline-none focus:ring-0 min-h-[40px] resize-none"
                                    value={det.observaciones || ''}
                                    onChange={e => {
                                      setEditingPlan({
                                        ...editingPlan!,
                                        convalidacionesDetalle: {
                                          ...editingPlan?.convalidacionesDetalle,
                                          [y]: { ...det, observaciones: e.target.value }
                                        }
                                      });
                                    }}
                                    placeholder="DETALLE DE PENDIENTES O OBSERVACIONES DE LA AUDITORÍA..."
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                      {editingPlan?.anexo === 'derrames' && (
                        <div className="md:col-span-2 space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
                          <div className="flex justify-between items-center">
                            <p className="text-[10px] font-black uppercase text-slate-400">Bases Operativas EMCODECON</p>
                          </div>
                          <textarea 
                            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg outline-none focus:ring-1 focus:ring-primary text-xs h-24" 
                            value={(editingPlan as any)?.basesOperativasDetalle || ''} 
                            onChange={e => setEditingPlan({...editingPlan!, basesOperativasDetalle: e.target.value})}
                            placeholder="Detalle de bases, ubicación y equipamiento por base..."
                          />
                        </div>
                      )}

                      <div className="md:col-span-2">
                        <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Observaciones Generales</label>
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
                <div className="size-12 bg-primary/20 rounded-xl flex items-center justify-center overflow-hidden print:bg-transparent print:border print:border-slate-300">
                  {selectedPlan.logoUrl ? (
                    <img src={selectedPlan.logoUrl} alt="Logo" className="w-full h-full object-cover" />
                  ) : (
                    <span className="material-symbols-outlined text-primary text-3xl print:text-black">corporate_fare</span>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <h2 className="text-lg font-black uppercase tracking-tight leading-none">{selectedPlan.empresa}</h2>
                    <span className="bg-primary/20 text-primary px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest border border-primary/30 print:border-slate-300 print:text-slate-600 print:bg-transparent">
                      {selectedPlan.anexo.replace('_', ' ')}
                    </span>
                  </div>
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
              <div className="grid grid-cols-1 md:grid-cols-3 print:grid-cols-2 gap-6">
                
                {/* Columna Info General */}
                <div className="space-y-6">
                  {/* Foto de Perfil Placeholder */}
                  <section className="print:break-inside-avoid flex flex-col items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50 relative group cursor-pointer hover:border-primary/50 transition-colors overflow-hidden aspect-square">
                    {selectedPlan.logoUrl ? (
                      <>
                        <img src={selectedPlan.logoUrl} alt="Logo" className="absolute inset-0 w-full h-full object-contain bg-white dark:bg-slate-900 p-2" />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center z-10">
                          <span className="material-symbols-outlined text-3xl text-white mb-1">edit</span>
                          <p className="text-[9px] font-bold uppercase text-white text-center">Cambiar Logo</p>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="size-24 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center mb-2 overflow-hidden shadow-inner">
                          <span className="material-symbols-outlined text-4xl text-slate-400 group-hover:text-primary transition-colors">add_photo_alternate</span>
                        </div>
                        <p className="text-[9px] font-bold uppercase text-slate-400 text-center group-hover:text-primary transition-colors">Cargar Logo / Foto</p>
                      </>
                    )}
                    {!isSuperior && (
                      <input 
                        type="file" 
                        className="absolute inset-0 opacity-0 cursor-pointer z-20" 
                        accept="image/*" 
                        title="Cargar imagen" 
                        onChange={(e) => handleLogoUpload(e, selectedPlan.id)}
                      />
                    )}
                  </section>

                  <section className="print:break-inside-avoid">
                    <h3 className="text-[10px] font-black uppercase text-primary mb-3 border-b border-primary/20 pb-1">
                      {selectedPlan.anexo === 'anexo_15' ? 'Datos de la Dependencia' : 'Datos de Contacto'}
                    </h3>
                    <div className="space-y-3">
                      {selectedPlan.anexo !== 'anexo_15' && (
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-slate-400 text-lg">badge</span>
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase leading-none">CUIT</p>
                            <p className="text-xs font-mono font-bold text-slate-700 dark:text-slate-300">{selectedPlan.cuit || 'S/D'}</p>
                          </div>
                        </div>
                      )}
                      {selectedPlan.anexo !== 'anexo_15' && (
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-slate-400 text-lg">location_on</span>
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase leading-none">Domicilio</p>
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">{selectedPlan.domicilio || 'S/D'} {selectedPlan.localidad && `, ${selectedPlan.localidad}`}</p>
                          </div>
                        </div>
                      )}
                      {selectedPlan.anexo !== 'anexo_15' && (
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-slate-400 text-lg">mail</span>
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase leading-none">Email</p>
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{selectedPlan.email || 'S/D'}</p>
                          </div>
                        </div>
                      )}
                      {selectedPlan.anexo !== 'anexo_15' && (
                        <div className="flex items-center gap-3">
                          <span className="material-symbols-outlined text-slate-400 text-lg">call</span>
                          <div>
                            <p className="text-[9px] font-bold text-slate-400 uppercase leading-none">Teléfono</p>
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">{selectedPlan.telefono || 'S/D'}</p>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center gap-3">
                        <span className="material-symbols-outlined text-slate-400 text-lg">account_balance</span>
                        <div>
                          <p className="text-[9px] font-bold text-slate-400 uppercase leading-none">Jurisdicción / Dependencia</p>
                          <p className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase">{selectedPlan.dependencia || 'S/D'}</p>
                        </div>
                      </div>
                    </div>
                  </section>

                  {selectedPlan.observaciones && (
                    <section className="mt-6 print:break-inside-avoid">
                      <h3 className="text-[10px] font-black uppercase text-primary mb-3 border-b border-primary/20 pb-1">Observaciones</h3>
                      <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
                        <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap">{selectedPlan.observaciones}</p>
                      </div>
                    </section>
                  )}

                  <section className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 mt-6 print:break-inside-avoid">
                    <h3 className="text-[10px] font-black uppercase text-slate-500 mb-3">Estado del Plan</h3>
                    <div className="space-y-2">
                      {selectedPlan.anexo !== 'anexo_15' && (
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold uppercase text-slate-400">Vencimiento:</span>
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${getStatusColor(selectedPlan.vencimiento)}`}>
                            {formatDate(selectedPlan.vencimiento)}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold uppercase text-slate-400">{selectedPlan.anexo === 'anexo_15' ? 'Disposición Aprobación:' : 'Disposición:'}</span>
                        <span className="text-[10px] font-mono font-bold text-slate-600 dark:text-slate-400 text-right">{selectedPlan.disposicion || 'S/D'}</span>
                      </div>
                      {selectedPlan.formatoDisposicion && selectedPlan.anexo !== 'anexo_15' && (
                        <div className="flex justify-between items-center">
                          <span className="text-[10px] font-bold uppercase text-slate-400">Formato:</span>
                          <span className={`text-[10px] font-black uppercase ${selectedPlan.formatoDisposicion === 'digital' ? 'text-blue-600' : 'text-orange-600'}`}>{selectedPlan.formatoDisposicion}</span>
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 print:break-inside-avoid">
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
                        {selectedPlan.contactoPlan && selectedPlan.anexo !== 'anexo_15' && <p className="text-[10px] text-slate-500 mt-0.5">{selectedPlan.contactoPlan}</p>}
                      </div>
                      {selectedPlan.anexo !== 'anexo_15' && (
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
                            {selectedPlan.tipoRespuesta === 'propia' && selectedPlan.cantidadBarreras && (
                              <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 uppercase bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                {selectedPlan.cantidadBarreras}m Barreras
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </section>

                  {selectedPlan.anexo === 'anexo_15' && (
                    <section className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-200 dark:border-blue-800/50 mt-6 print:break-inside-avoid flex flex-col items-center justify-center text-center">
                      <span className="material-symbols-outlined text-blue-500 text-3xl mb-2">folder_supervised</span>
                      <h3 className="text-[10px] font-black uppercase text-blue-600 dark:text-blue-400 tracking-widest mb-1">Planes bajo su Jurisdicción</h3>
                      <p className="text-4xl font-black text-blue-700 dark:text-blue-300">
                        {planes.filter(p => p.anexo !== 'anexo_15' && p.dependencia && selectedPlan.dependencia && p.dependencia.trim().toUpperCase() === selectedPlan.dependencia.trim().toUpperCase()).length}
                      </p>
                      <p className="text-[9px] font-bold text-blue-500/80 uppercase mt-1">Planes activos registrados en sistema</p>
                    </section>
                  )}
                </div>

                {/* Columna Historial / Timeline */}
                <div className="md:col-span-2 print:col-span-1 space-y-6">
                  {parseCoordinates(selectedPlan.coordenadas).length > 0 && (
                    <section className="mb-6 print:break-inside-avoid">
                      <h3 className="text-[10px] font-black uppercase text-primary mb-3 border-b border-primary/20 pb-1">Ubicación Geográfica</h3>
                      <div className="h-48 w-full rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 z-0 relative">
                        <MapContainer 
                          center={parseCoordinates(selectedPlan.coordenadas)[0]} 
                          zoom={12} 
                          style={{ height: '100%', width: '100%', zIndex: 0 }}
                          zoomControl={false}
                          attributionControl={false}
                        >
                          <TileLayer url="https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/{z}/{x}/{-y}.png" />
                          {parseCoordinates(selectedPlan.coordenadas).map((coord, idx) => (
                            <Marker key={idx} position={coord} />
                          ))}
                        </MapContainer>
                      </div>
                    </section>
                  )}

                  <section className="print:break-inside-avoid">
                    <div className="flex justify-between items-end mb-4 border-b border-primary/20 pb-1">
                      <h3 className="text-[10px] font-black uppercase text-primary">Historial de Expedientes y Auditorías</h3>
                    </div>
                    
                    {selectedPlan.historialDisposiciones && selectedPlan.historialDisposiciones.length > 0 && (
                      <div className="mb-6">
                        <h4 className="text-[9px] font-black uppercase text-slate-500 mb-2">Disposiciones Archivadas</h4>
                        <div className="space-y-2">
                          {selectedPlan.historialDisposiciones.map((hist, idx) => (
                            <div key={idx} className="bg-slate-50 dark:bg-slate-800/30 p-3 rounded-lg border border-slate-200 dark:border-slate-700 flex justify-between items-start print:break-inside-avoid">
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
                        <div key={c.id} className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 print:break-inside-avoid">
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

                {/* Registro de Convalidaciones / Presentaciones Anuales (Full Width) */}
                    <div className="md:col-span-3 print:col-span-2">
                  {selectedPlan.anexo === 'anexo_15' ? (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <section className="bg-slate-50 dark:bg-slate-800/50 p-5 rounded-xl border border-slate-200 dark:border-slate-700 print:break-inside-avoid shadow-sm hover:shadow-md transition-shadow">
                        <h3 className="text-[10px] font-black uppercase text-slate-500 mb-4 tracking-widest border-b border-slate-200 dark:border-slate-700 pb-2">Estación SIPA</h3>
                        <div className="flex items-center gap-4">
                           <div className={`size-14 rounded-2xl flex items-center justify-center shrink-0 shadow-sm transition-transform hover:scale-105 ${selectedPlan.isSIPA ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-400 opacity-50'}`}>
                             <span className="material-symbols-outlined text-3xl font-bold">{selectedPlan.isSIPA ? 'verified' : 'cancel'}</span>
                           </div>
                           <div className="flex-1 min-w-0">
                             <p className="text-sm font-black uppercase tracking-tight text-slate-800 dark:text-white truncate">
                               {selectedPlan.isSIPA ? 'Estación SIPA Operativa' : 'Sin Estación SIPA'}
                             </p>
                             <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider leading-relaxed mt-1">
                               {selectedPlan.isSIPA ? 'Equipamiento estratégico disponible en base' : 'Dependencia sin equipamiento de derrame'}
                             </p>
                           </div>
                        </div>
                        
                        {selectedPlan.isSIPA && selectedPlan.sipaEquipamiento && (
                          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 space-y-3">
                             <div className="grid grid-cols-2 gap-2">
                               <div className="bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-700">
                                 <p className="text-[8px] font-bold text-slate-400 uppercase">Barreras (Total)</p>
                                 <p className="text-xs font-black text-blue-600">
                                   {(Number(selectedPlan.sipaEquipamiento.barrerasPuerto || 0) + Number(selectedPlan.sipaEquipamiento.barrerasFluvial || 0) + Number(selectedPlan.sipaEquipamiento.barrerasMaritima || 0))}m
                                 </p>
                               </div>
                               <div className="bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-700">
                                 <p className="text-[8px] font-bold text-slate-400 uppercase">Skimmers</p>
                                 <p className="text-xs font-black text-blue-600">{selectedPlan.sipaEquipamiento.skimmers || 0}</p>
                               </div>
                               <div className="bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-700">
                                 <p className="text-[8px] font-bold text-slate-400 uppercase">Embarcaciones</p>
                                 <p className="text-xs font-black text-blue-600">{selectedPlan.sipaEquipamiento.embarcaciones || 0}</p>
                               </div>
                             </div>
                             {selectedPlan.sipaEquipamiento.materiales && (
                               <div>
                                 <p className="text-[8px] font-bold text-slate-400 uppercase mb-1">Materiales Detallados</p>
                                 <p className="text-[10px] text-slate-600 dark:text-slate-400 italic bg-white dark:bg-slate-900 p-2 rounded border border-slate-200 dark:border-slate-700">
                                   {selectedPlan.sipaEquipamiento.materiales}
                                 </p>
                               </div>
                             )}
                          </div>
                        )}
                      </section>

                      <section className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 md:col-span-2 print:break-inside-avoid">
                        <h3 className="text-[10px] font-black uppercase text-slate-500 mb-3">Historial de Presentaciones Anuales</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {selectedPlan.presentacionesAnuales?.sort((a,b) => b.anio - a.anio).map((pr, idx) => (
                            <div key={idx} className="bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-700">
                              <div className="flex justify-between items-center mb-2 border-b border-slate-100 dark:border-slate-800 pb-1">
                                <span className="text-sm font-black text-primary">AÑO {pr.anio}</span>
                                <span className="text-[9px] font-bold text-slate-400 uppercase">{formatDate(pr.fecha)}</span>
                              </div>
                              <div className="space-y-1">
                                <div className="flex justify-between">
                                  <span className="text-[8px] font-bold text-slate-400 uppercase">Nº IF PLAN:</span>
                                  <span className="text-[9px] font-mono font-bold text-slate-600 dark:text-slate-400">{pr.nroIF || 'S/D'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-[8px] font-bold text-slate-400 uppercase">DISPOSICIÓN:</span>
                                  <span className="text-[9px] font-mono font-bold text-slate-600 dark:text-slate-400">{pr.disposicion || 'S/D'}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                          {(!selectedPlan.presentacionesAnuales || selectedPlan.presentacionesAnuales.length === 0) && (
                            <div className="col-span-full py-6 text-center">
                              <p className="text-[10px] text-slate-400 italic font-bold">Sin presentaciones registradas</p>
                            </div>
                          )}
                        </div>
                      </section>
                    </div>
                  ) : (
                    <section className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700 print:break-inside-avoid">
                      <h3 className="text-[10px] font-black uppercase text-slate-500 mb-3">Registro de Convalidaciones</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {(selectedPlan.anexo === 'derrames' ? ['anio1', 'anio2'] : ['anio1', 'anio2', 'anio3', 'anio4']).map((y, i) => {
                        const dateVal = (selectedPlan.convalidaciones as any)?.[y] || (selectedPlan.convalidacionesDetalle as any)?.[y]?.fecha;
                        const det = (selectedPlan.convalidacionesDetalle as any)?.[y];
                        if (!dateVal && !det) return null;
                        
                        return (
                          <div key={y} className="border-l-2 border-primary pl-3 py-1 print:break-inside-avoid">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-[10px] font-black uppercase text-slate-700 dark:text-slate-300">{i+1}º Convalidación</span>
                              <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase border ${getStatusColor(dateVal, true, !!(det?.nroIF && det?.nroExpediente))}`}>
                                {!!(det?.nroIF && det?.nroExpediente) ? `✅ CONVALIDADO (${formatDate(dateVal)})` : formatDate(dateVal)}
                              </span>
                            </div>
                            {det && (det.auditorNombre || det.nroIF || det.nroExpediente || det.observaciones) && (
                              <div className="mt-2 space-y-1.5 text-[9px] bg-white dark:bg-slate-900 p-2 rounded border border-slate-100 dark:border-slate-800 shadow-sm">
                                {det.auditorNombre && (
                                  <div className="flex items-start gap-1">
                                    <span className="text-slate-400 font-bold uppercase shrink-0">Auditor:</span> 
                                    <span className="font-bold uppercase text-slate-700 dark:text-slate-300">{det.auditorNombre}</span>
                                  </div>
                                )}
                                {(selectedPlan.formatoDisposicion === 'digital' || selectedPlan.anexo === 'derrames') && det.nroCertificado && (
                                  <div className="flex items-start gap-1">
                                    <span className="text-slate-400 font-bold uppercase shrink-0">Certificado:</span> 
                                    <span className="font-mono text-slate-700 dark:text-slate-300">{det.nroCertificado}</span>
                                  </div>
                                )}
                                {det.nroIF && (
                                  <div className="flex items-start gap-1">
                                    <span className="text-slate-400 font-bold uppercase shrink-0">IF:</span> 
                                    <span className="font-mono text-slate-700 dark:text-slate-300">{det.nroIF}</span>
                                  </div>
                                )}
                                {det.nroExpediente && (
                                  <div className="flex items-start gap-1">
                                    <span className="text-slate-400 font-bold uppercase shrink-0">Expediente:</span> 
                                    <span className="font-mono text-slate-700 dark:text-slate-300">{det.nroExpediente}</span>
                                  </div>
                                )}
                                {det.observaciones && (
                                  <div className="mt-1 pt-1 border-t border-slate-50 dark:border-slate-800">
                                    <p className="text-slate-400 font-black uppercase text-[8px] mb-0.5">Pendientes / Observaciones:</p>
                                    <p className="text-slate-600 dark:text-slate-400 italic">"{det.observaciones}"</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {(!selectedPlan.convalidaciones || Object.values(selectedPlan.convalidaciones).every(v => !v)) && (
                        <p className="text-[10px] text-slate-400 italic col-span-full">No hay convalidaciones registradas.</p>
                      )}
                    </div>
                  </section>
                )}
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
