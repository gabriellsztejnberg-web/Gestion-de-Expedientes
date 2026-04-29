import React, { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Papa from 'papaparse';
import { Sidebar } from '../components/Sidebar';
import { db } from '../firebase';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
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
  writeBatch
} from 'firebase/firestore';
import { EmpresaControlDerrame, BaseOperativa, Case, Inspeccion, TimelineEvent, User } from '../types';

// Fix for default marker icons in React-Leaflet
// @ts-ignore
import icon from 'leaflet/dist/images/marker-icon.png';
// @ts-ignore
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

const petroleumIcon = L.divIcon({
  className: 'custom-div-icon',
  html: `<div style="background-color: #0f172a; width: 14px; height: 14px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3);"></div>`,
  iconSize: [14, 14],
  iconAnchor: [7, 7]
});

const BARRIER_REQUIREMENTS: Record<string, { total: number; ownPercent: number }> = {
  'A1': { total: 13800, ownPercent: 0.4 },
  'A2': { total: 6400, ownPercent: 0.4 },
  'B1': { total: 6400, ownPercent: 0.4 },
  'B2': { total: 4900, ownPercent: 0.4 },
  'B3': { total: 2200, ownPercent: 0.4 },
  'C': { total: 1400, ownPercent: 0.4 }
};

const formatDate = (dateStr?: string) => {
  if (!dateStr || dateStr === '-' || dateStr.length < 5) return dateStr || '-';
  let d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const userTimezoneOffset = d.getTimezoneOffset() * 60000;
  const adjustedDate = new Date(d.getTime() + userTimezoneOffset);
  return `${adjustedDate.getDate().toString().padStart(2, '0')}/${(adjustedDate.getMonth() + 1).toString().padStart(2, '0')}/${adjustedDate.getFullYear()}`;
};

const getSemaforoStyle = (dateStr?: string, isCompleted?: boolean) => {
  if (isCompleted) return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20';
  if (!dateStr) return 'text-slate-400 bg-slate-100 dark:bg-slate-800/50';
  const vDate = new Date(dateStr);
  if (isNaN(vDate.getTime())) return 'text-slate-400 bg-slate-100 dark:bg-slate-800/50';
  
  const today = new Date();
  const ninetyDays = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
  const oneYear = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000); // Umbral para "futuro"
  
  if (vDate < today) return 'text-red-600 bg-red-50 dark:bg-red-900/20';
  if (vDate < ninetyDays) return 'text-amber-600 bg-amber-50 dark:bg-amber-900/20';
  if (vDate > oneYear) return 'text-slate-400 bg-slate-100 dark:bg-slate-800/10'; // Futuro en gris
  return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20'; // Vigente en verde
};

const getSemaforoColor = (dateStr?: string, isCompleted?: boolean) => {
  if (isCompleted) return 'text-emerald-600 font-black';
  if (!dateStr) return 'text-slate-400';
  const vDate = new Date(dateStr);
  if (isNaN(vDate.getTime())) return 'text-slate-400';
  
  const today = new Date();
  const ninetyDays = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
  const oneYear = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);
  
  if (vDate < today) return 'text-red-600 font-black';
  if (vDate < ninetyDays) return 'text-amber-600 font-black';
  if (vDate > oneYear) return 'text-slate-400 font-black'; // Futuro en gris
  return 'text-emerald-600 font-black'; // Vigente/Convalidado en verde
};

const isSameEmcodecon = (name1: string, name2: string) => {
  const n1 = (name1 || '').trim().toUpperCase();
  const n2 = (name2 || '').trim().toUpperCase();
  
  if (n1 === n2) return true;
  
  // Aliases mapping
  const aliases = [
    ['CINTRA', 'JORGE L. REBAGLIATI E HIJOS S.R.L.']
  ];
  
  for (const pair of aliases) {
    const p1 = pair[0].toUpperCase();
    const p2 = pair[1].toUpperCase();
    if ((n1 === p1 || n1 === p2) && (n2 === p1 || n2 === p2)) {
      return true;
    }
  }
  
  return false;
};

export const Derrames: React.FC = () => {
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [empresas, setEmpresas] = useState<EmpresaControlDerrame[]>([]);
  const [planes, setPlanes] = useState<any[]>([]); // For associated plans
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  
  // Modal de Edición Empresa
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEmpresa, setEditingEmpresa] = useState<Partial<EmpresaControlDerrame> | null>(null);

  // Modal de Edición Base
  const [isBaseModalOpen, setIsBaseModalOpen] = useState(false);
  const [editingBase, setEditingBase] = useState<Partial<BaseOperativa> | null>(null);
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<string>('');

  // Modal de Edición Convenio
  const [isConvenioModalOpen, setIsConvenioModalOpen] = useState(false);
  const [editingConvenio, setEditingConvenio] = useState<Partial<ConvenioDerrames> | null>(null);

  // Perfil View
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [selectedEmpresa, setSelectedEmpresa] = useState<EmpresaControlDerrame | null>(null);

  const [cases, setCases] = useState<Case[]>([]);
  const [inspecciones, setInspecciones] = useState<Inspeccion[]>([]);
  
  const currentUser: User = JSON.parse(localStorage.getItem('currentUser') || '{"id":"temp","name":"Usuario","role":"operador"}');
  const role = (currentUser.role || '').toLowerCase();
  const isJefe = role === 'jefe' || role === 'admin' || role === 'administrator';
  const isSuperior = role === 'superior';

  useEffect(() => {
    // Escuchamos ambas colecciones para no perder datos por cambios de nombre
    const q1 = query(collection(db, 'empresas_derrames'), orderBy('empresa', 'asc'));
    const q2 = query(collection(db, 'control_derrames'), orderBy('empresa', 'asc'));

    const updateList = (snap1: any, snap2: any) => {
      const docs1 = snap1.docs.map((doc: any) => ({ id: doc.id, ...doc.data(), _source: 'empresas_derrames' }) as EmpresaControlDerrame);
      const docs2 = snap2.docs.map((doc: any) => ({ id: doc.id, ...doc.data(), _source: 'control_derrames' }) as EmpresaControlDerrame);
      
      // Combinar y eliminar duplicados por ID (priorizando empresas_derrames)
      const combined = [...docs1];
      const seenIds = new Set(docs1.map((d: any) => d.id));
      
      docs2.forEach((d: any) => {
        if (!seenIds.has(d.id)) {
          combined.push(d);
          seenIds.add(d.id);
        }
      });

      const sorted = combined.sort((a, b) => a.empresa.localeCompare(b.empresa));
      setEmpresas(sorted);
      
      if (selectedEmpresa) {
        const updated = sorted.find(d => d.id === selectedEmpresa.id);
        if (updated) setSelectedEmpresa(updated);
      }
      setIsLoading(false);
    };

    let snap1: any = { docs: [] };
    let snap2: any = { docs: [] };

    const unsub1 = onSnapshot(q1, (s) => { snap1 = s; updateList(snap1, snap2); });
    const unsub2 = onSnapshot(q2, (s) => { snap2 = s; updateList(snap1, snap2); });

    const qCases = query(collection(db, 'expedientes'));
    const unsubCases = onSnapshot(qCases, (snapshot) => {
      setCases(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Case)));
    });

    const qInsp = query(collection(db, 'inspecciones'), orderBy('fecha', 'desc'));
    const unsubInsp = onSnapshot(qInsp, (snapshot) => {
       setInspecciones(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Inspeccion)));
    });

    const qPlanes = query(collection(db, 'planes'));
    const unsubPlanes = onSnapshot(qPlanes, (snapshot) => {
       setPlanes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any)));
    });

    return () => {
      unsub1();
      unsub2();
      unsubCases();
      unsubInsp();
      unsubPlanes();
    };
  }, [selectedEmpresa?.id]);

  const handleSaveEmpresa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingEmpresa) return;

    try {
      const dataToSave = {
        empresa: (editingEmpresa.empresa || '').toUpperCase(),
        dependencia: (editingEmpresa.dependencia || '').toUpperCase(),
        disposicion: (editingEmpresa.disposicion || '').toUpperCase(),
        vencimiento: editingEmpresa.vencimiento || '',
        convalidacionesDetalle: editingEmpresa.convalidacionesDetalle || {},
        cuit: editingEmpresa.cuit || '',
        domicilio: editingEmpresa.domicilio || '',
        localidad: editingEmpresa.localidad || '',
        email: editingEmpresa.email || '',
        telefono: editingEmpresa.telefono || '',
        responsable: editingEmpresa.responsable || '',
        logoUrl: editingEmpresa.logoUrl || '',
        notas: editingEmpresa.notas || '',
        basesOperativas: editingEmpresa.basesOperativas || [],
        ultimaActualizacion: new Date().toISOString()
      };

      const sourceCol = (editingEmpresa as any)._source || 'empresas_derrames';

      if (editingEmpresa.id) {
        const { _source, ...rest } = editingEmpresa as any;
        await updateDoc(doc(db, sourceCol, editingEmpresa.id), dataToSave);
      } else {
        await addDoc(collection(db, 'empresas_derrames'), dataToSave);
      }
      setIsModalOpen(false);
      setEditingEmpresa(null);
    } catch (error) {
      console.error(error);
      alert("Error al guardar empresa");
    }
  };

  const handleSaveBase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingBase || !selectedEmpresaId) return;

    try {
      const empresaDoc = empresas.find(e => e.id === selectedEmpresaId);
      if (!empresaDoc) return;

      const currentBases = [...(empresaDoc.basesOperativas || [])];
      
      const newBaseData: BaseOperativa = {
        id: editingBase.id || Math.random().toString(36).substr(2, 9),
        nombre: (editingBase.nombre || '').toUpperCase(),
        coordenadas: editingBase.coordenadas || '',
        materiales: editingBase.materiales || '',
        barrerasPuerto: Number(editingBase.barrerasPuerto || 0),
        barrerasFluvial: Number(editingBase.barrerasFluvial || 0),
        barrerasMaritima: Number(editingBase.barrerasMaritima || 0),
        cantidadBarreras: Number(editingBase.barrerasPuerto || 0) + Number(editingBase.barrerasFluvial || 0) + Number(editingBase.barrerasMaritima || 0),
        skimmers: editingBase.skimmers || 0,
        embarcaciones: editingBase.embarcaciones || 0,
        metrosAbsorbentes: editingBase.metrosAbsorbentes || 0,
        observaciones: editingBase.observaciones || ''
      };

      if (editingBase.id) {
        const index = currentBases.findIndex(b => b.id === editingBase.id);
        if (index > -1) currentBases[index] = newBaseData;
      } else {
        currentBases.push(newBaseData);
      }

      const sourceCol = (empresaDoc as any)._source || 'empresas_derrames';
      await updateDoc(doc(db, sourceCol, selectedEmpresaId), {
        basesOperativas: currentBases,
        ultimaActualizacion: new Date().toISOString()
      });

      setIsBaseModalOpen(false);
      setEditingBase(null);
    } catch (error) {
      console.error(error);
      alert("Error al guardar base operativa");
    }
  };

  const handleDeleteBase = async (empresaId: string, baseId: string) => {
    if (!confirm("¿Eliminar base operativa?")) return;
    const empresaDoc = empresas.find(e => e.id === empresaId);
    if (!empresaDoc) return;

    const sourceCol = (empresaDoc as any)._source || 'empresas_derrames';
    const currentBases = (empresaDoc.basesOperativas || []).filter(b => b.id !== baseId);
    await updateDoc(doc(db, sourceCol, empresaId), {
      basesOperativas: currentBases,
      ultimaActualizacion: new Date().toISOString()
    });
  };

  const handleDeleteEmpresa = async (id: string) => {
    if (!confirm("¿Eliminar empresa permanentemente?")) return;
    const empresaDoc = empresas.find(e => e.id === id);
    const sourceCol = (empresaDoc as any)?._source || 'empresas_derrames';
    
    try {
      await deleteDoc(doc(db, sourceCol, id));
    } catch (error) {
      alert("Error al eliminar");
    }
  };

  const openNewEmpresa = () => {
    setEditingEmpresa({ basesOperativas: [] });
    setIsModalOpen(true);
  };

  const openEditEmpresa = (empresa: EmpresaControlDerrame) => {
    setEditingEmpresa(empresa);
    setIsModalOpen(true);
  };

  const openNewBase = (empresaId: string) => {
    setSelectedEmpresaId(empresaId);
    setEditingBase({});
    setIsBaseModalOpen(true);
  };

  const openEditBase = (empresaId: string, base: BaseOperativa) => {
    setSelectedEmpresaId(empresaId);
    setEditingBase(base);
    setIsBaseModalOpen(true);
  };

  const openNewConvenio = (empresaId: string) => {
    setSelectedEmpresaId(empresaId);
    setEditingConvenio({});
    setIsConvenioModalOpen(true);
  };

  const openEditConvenio = (empresaId: string, convenio: ConvenioDerrames) => {
    setSelectedEmpresaId(empresaId);
    setEditingConvenio(convenio);
    setIsConvenioModalOpen(true);
  };

  const handleDeleteConvenio = async (empresaId: string, convenioId: string) => {
    if (!confirm("¿Eliminar este convenio permanentemente?")) return;
    const empresaDoc = empresas.find(e => e.id === empresaId);
    if (!empresaDoc) return;
    const sourceCol = (empresaDoc as any)?._source || 'empresas_derrames';

    let current = [...(empresaDoc.convenios || [])];
    current = current.filter(c => c.id !== convenioId);

    await updateDoc(doc(db, sourceCol, empresaId), {
      convenios: current,
      ultimaActualizacion: new Date().toISOString()
    });
  };

  const handleSaveConvenio = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmpresaId) return;

    const empresaDoc = empresas.find(e => e.id === selectedEmpresaId);
    if (!empresaDoc) return;
    const sourceCol = (empresaDoc as any)?._source || 'empresas_derrames';

    let current = [...(empresaDoc.convenios || [])];
    const newConvenioId = editingConvenio?.id || Math.random().toString(36).substr(2, 9);
    const newConvenio = { ...editingConvenio, id: newConvenioId } as ConvenioDerrames;

    if (editingConvenio?.id) {
      current = current.map(c => c.id === editingConvenio.id ? newConvenio : c);
    } else {
      current.push(newConvenio);
    }

    await updateDoc(doc(db, sourceCol, selectedEmpresaId), {
      convenios: current,
      ultimaActualizacion: new Date().toISOString()
    });

    // Auto-link reciprocal
    if (newConvenio.empresaConvenidaId) {
       const otherEmpresa = empresas.find(e => e.id === newConvenio.empresaConvenidaId);
       if (otherEmpresa) {
          const otherSource = (otherEmpresa as any)?._source || 'empresas_derrames';
          let otherCurrent = [...(otherEmpresa.convenios || [])];
          
          // Note: In a reciprocal, what they GAVE is what the OTHER receives
          const reciprocalConvenio: ConvenioDerrames = {
             id: newConvenioId + '_r', // Use a related ID or any random
             empresaConvenida: empresaDoc.empresa,
             empresaConvenidaId: empresaDoc.id,
             cantidadBarreras: newConvenio.cantidadAporta || 0, // Reciben lo que aporto
             cantidadAporta: newConvenio.cantidadBarreras || 0, // Aporto lo que ellos reciben
             fechaVencimiento: newConvenio.fechaVencimiento,
             renovacionAutomatica: newConvenio.renovacionAutomatica,
             observaciones: 'Vinculado Automáticamente - ' + (newConvenio.observaciones || '')
          };
          
          const existingReciprocalIndex = otherCurrent.findIndex(c => c.empresaConvenidaId === empresaDoc.id && c.id.includes('_r'));
          if (existingReciprocalIndex >= 0) {
             otherCurrent[existingReciprocalIndex] = {...otherCurrent[existingReciprocalIndex], ...reciprocalConvenio, id: otherCurrent[existingReciprocalIndex].id};
          } else {
             otherCurrent.push(reciprocalConvenio);
          }

          await updateDoc(doc(db, otherSource, otherEmpresa.id), {
             convenios: otherCurrent,
             ultimaActualizacion: new Date().toISOString()
          });
       }
    }

    setIsConvenioModalOpen(false);
  };

  const viewProfile = (empresa: EmpresaControlDerrame) => {
    setSelectedEmpresa(empresa);
    setIsProfileOpen(true);
  };

  // Helper to parse coordinates
  const parseCoordinates = (coordStr?: string): [number, number] | null => {
    if (!coordStr) return null;
    let cleanStr = coordStr.toUpperCase().replace(/LATITUD[E]?|LONGITUD[E]?|LAT|LNG|LON/g, '').replace(/[´’`]/g, "'").replace(/[”]/g, '"').replace(/''/g, '"');
    
    // Simplest parse for decimal
    const decMatch = cleanStr.match(/(-?\d+(?:[\.,]\d+)?)[^\d-]+(-?\d+(?:[\.,]\d+)?)/);
    if (decMatch) {
      let lat = parseFloat(decMatch[1].replace(',', '.'));
      let lng = parseFloat(decMatch[2].replace(',', '.'));
      if (!isNaN(lat) && !isNaN(lng)) {
         if (Math.abs(lat) > 90 && Math.abs(lng) <= 90) return [lng, lat];
         return [lat, lng];
      }
    }
    return null;
  };

  const handleImportCSV = async (e: React.ChangeEvent<HTMLInputElement> | { target: { files: File[] } }) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const parseCSVDate = (dateStr: string): string => {
      if (!dateStr) return '';
      const str = dateStr.toString().trim();
      
      if (/^20\d{2}$/.test(str)) return `${str}-01-01`;

      if (/^\d{5}$/.test(str)) {
        const excelEpoch = new Date(1899, 11, 30);
        const days = parseInt(str, 10);
        const date = new Date(excelEpoch.getTime() + days * 86400000);
        if (!isNaN(date.getTime())) return date.toISOString().split('T')[0];
      }
      
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

          if (!confirm(`Se importarán ${data.length} empresas de control de derrames junto con sus bases operativas. ¿Continuar?`)) {
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
          }

          setIsLoading(true);
          const existingMap = new Map<string, EmpresaControlDerrame>(empresas.map(e => [e.empresa.toUpperCase(), e]));
          
          let recordsAdded = 0;
          let recordsUpdated = 0;

          const chunks = [];
          for (let i = 0; i < data.length; i += 500) {
            chunks.push(data.slice(i, i + 500));
          }

          for (const chunk of chunks) {
            const batch = writeBatch(db);
            chunk.forEach(row => {
              const empresaFinal = getCsvVal(row, ['empresa']).toString().toUpperCase().trim();
              if (!empresaFinal) return;
              
              const existingEmpresa = existingMap.get(empresaFinal);
              const empresaRef = existingEmpresa ? doc(db, 'empresas_derrames', existingEmpresa.id) : doc(collection(db, 'empresas_derrames'));
              
              const basesOperativas: BaseOperativa[] = existingEmpresa?.basesOperativas || [];
              
              // Dynamic Bases Extraction
              Object.keys(row).forEach(key => {
                const lowerKey = key.toLowerCase();
                if (lowerKey.startsWith('base') && !lowerKey.includes('coordenadas') && !lowerKey.includes('cantidad') && !lowerKey.includes('equipamiento')) {
                  const baseName = row[key]?.toString().trim();
                  if (baseName) {
                    const suffixMatch = lowerKey.match(/base\s*(.*)/);
                    const suffix = suffixMatch ? suffixMatch[1].trim() : '';
                    
                    const coords = getCsvVal(row, [`coordenadas base ${suffix}`, `coordenadas base_${suffix}`]).toString().trim();
                    const qty = parseInt(getCsvVal(row, [`cantidad de barreras base ${suffix}`, `cantidad de barreras base_${suffix}`]).toString().trim(), 10) || 0;
                    const items = getCsvVal(row, [`otros equipamientos base ${suffix}`, `otros equipamientos base_${suffix}`]).toString().trim();
                    
                    if (!basesOperativas.some(b => b.nombre.toUpperCase() === baseName.toUpperCase())) {
                      basesOperativas.push({
                        id: Math.random().toString(36).substr(2, 9),
                        nombre: baseName.toUpperCase(),
                        coordenadas: coords,
                        cantidadBarreras: qty,
                        materiales: items,
                        observaciones: ''
                      });
                    }
                  }
                }
              });

              const anio1Date = parseCSVDate(getCsvVal(row, ['1 conv'], ['ex']));
              const anio1Exp = getCsvVal(row, ['ex 1 conv']).toString();
              const anio2Date = parseCSVDate(getCsvVal(row, ['2 conv'], ['ex']));
              const anio2Exp = getCsvVal(row, ['ex 2 conv']).toString();

              const dataToSave = {
                categoria: getCsvVal(row, ['categoria']).toString().toUpperCase() || existingEmpresa?.categoria || '',
                empresa: empresaFinal,
                dependencia: getCsvVal(row, ['jurisdiccion', 'dependencia']).toString().toUpperCase() || existingEmpresa?.dependencia || '',
                cuit: getCsvVal(row, ['cuit']).toString() || existingEmpresa?.cuit || '',
                domicilio: getCsvVal(row, ['direccion', 'domicilio']).toString().toUpperCase() || existingEmpresa?.domicilio || '',
                email: getCsvVal(row, ['mail', 'e-mail', 'email']).toString() || existingEmpresa?.email || '',
                telefono: getCsvVal(row, ['tel']).toString() || existingEmpresa?.telefono || '',
                disposicion: getCsvVal(row, ['disposicion']).toString() || existingEmpresa?.disposicion || '',
                vencimiento: parseCSVDate(getCsvVal(row, ['vencimiento'])) || existingEmpresa?.vencimiento || '',
                convalidacionesDetalle: {
                   anio1: { fecha: anio1Date || existingEmpresa?.convalidacionesDetalle?.anio1?.fecha || '', nroExpediente: anio1Exp || existingEmpresa?.convalidacionesDetalle?.anio1?.nroExpediente || '', auditorNombre: existingEmpresa?.convalidacionesDetalle?.anio1?.auditorNombre || '' },
                   anio2: { fecha: anio2Date || existingEmpresa?.convalidacionesDetalle?.anio2?.fecha || '', nroExpediente: anio2Exp || existingEmpresa?.convalidacionesDetalle?.anio2?.nroExpediente || '', auditorNombre: existingEmpresa?.convalidacionesDetalle?.anio2?.auditorNombre || '' }
                },
                basesOperativas,
                ultimaActualizacion: new Date().toISOString()
              };

              if (existingEmpresa) {
                batch.update(empresaRef, dataToSave);
                recordsUpdated++;
              } else {
                batch.set(empresaRef, dataToSave);
                recordsAdded++;
              }
            });
            await batch.commit();
          }

          if (fileInputRef.current) fileInputRef.current.value = '';
          alert(`Importación completada:\n- Creados: ${recordsAdded}\n- Actualizados: ${recordsUpdated}`);
        } catch (error) {
          console.error(error);
          alert("Error procesando CSV.");
        } finally {
          setIsLoading(false);
        }
      },
      error: (error) => {
        console.error(error);
        alert("Error leyendo CSV");
        setIsLoading(false);
      }
    });
  };

  const filteredEmpresas = empresas.filter(e => 
    (e.empresa || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (e.dependencia || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900">
      <Sidebar activePage="derrames" />
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-8 py-5 flex justify-between items-center shrink-0">
          <div>
            <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">Control de Derrames</h1>
            <p className="text-sm font-bold text-slate-500 mt-1 uppercase tracking-widest">
              Gestión de Empresas y Bases Operativas
            </p>
          </div>
          <div className="flex gap-3">
             <input type="file" ref={fileInputRef} onChange={handleImportCSV} accept=".csv" className="hidden" />
             {!isSuperior && (
               <>
                 <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-colors shadow-sm">
                   <span className="material-symbols-outlined text-[18px]">upload_file</span>
                   Importar CSV
                 </button>
                 <button onClick={openNewEmpresa} className="flex items-center gap-2 bg-primary hover:bg-blue-600 text-white px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-colors shadow-sm">
                   <span className="material-symbols-outlined text-[18px]">add_circle</span>
                   Nueva Empresa
                 </button>
               </>
             )}
          </div>
        </header>
        
        <div className="flex-1 overflow-auto p-4 md:p-8">
           <div className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-800 mb-6 shadow-sm">
             <div className="relative flex items-center">
               <span className="absolute left-3 text-slate-400 material-symbols-outlined text-[20px]">search</span>
               <input className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 outline-none focus:ring-1 focus:ring-primary" placeholder="Buscar por Nombre de Empresa o Jurisdicción..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
             </div>
           </div>

           {isLoading ? (
              <div className="flex items-center justify-center py-20 text-slate-400">
                <span className="material-symbols-outlined animate-spin text-4xl mb-4">refresh</span>
              </div>
           ) : (
             <>
               <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6 shrink-0">
                 <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                   <div className="size-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 dark:text-blue-400">
                     <span className="material-symbols-outlined">corporate_fare</span>
                   </div>
                   <div>
                     <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest leading-tight mb-1">Empresas<br/>Activas</p>
                     <p className="text-2xl font-black text-slate-800 dark:text-white leading-none">{filteredEmpresas.length}</p>
                   </div>
                 </div>
                 
                 <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                   <div className="size-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                     <span className="material-symbols-outlined">warehouse</span>
                   </div>
                   <div>
                     <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest leading-tight mb-1">Bases<br/>Operativas</p>
                     <p className="text-2xl font-black text-slate-800 dark:text-white leading-none">
                       {filteredEmpresas.reduce((acc, curr) => acc + (curr.basesOperativas?.length || 0), 0)}
                     </p>
                   </div>
                 </div>

                 <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4">
                   <div className="size-10 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                     <span className="material-symbols-outlined">waves</span>
                   </div>
                   <div>
                     <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest leading-tight mb-1">Total<br/>Barreras</p>
                     <p className="text-2xl font-black text-slate-800 dark:text-white leading-none">
                       {filteredEmpresas.reduce((acc, curr) => acc + (curr.basesOperativas?.reduce((bAcc, base) => bAcc + Number(base.cantidadBarreras || 0), 0) || 0), 0).toLocaleString()}
                     </p>
                   </div>
                 </div>

                 <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-red-200 dark:border-red-900 shadow-sm flex items-center gap-4 bg-red-50/50">
                   <div className="size-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-600 dark:text-red-400">
                     <span className="material-symbols-outlined text-red-600">gavel</span>
                   </div>
                   <div>
                     <p className="text-[10px] font-black uppercase text-red-500 tracking-widest leading-tight mb-1">Disposic.<br/>Vencidas</p>
                     <p className="text-2xl font-black text-red-600 dark:text-white leading-none">
                       {filteredEmpresas.filter(e => {
                         const vDate = new Date(e.vencimiento);
                         return e.vencimiento && !isNaN(vDate.getTime()) && vDate < new Date();
                       }).length}
                     </p>
                   </div>
                 </div>

                 <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-amber-200 dark:border-amber-900 shadow-sm flex items-center gap-4 bg-amber-50/50">
                   <div className="size-10 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400">
                     <span className="material-symbols-outlined">warning</span>
                   </div>
                   <div>
                     <p className="text-[10px] font-black uppercase text-amber-600 tracking-widest leading-tight mb-1">Conv.<br/>Pendientes</p>
                     <p className="text-2xl font-black text-amber-600 dark:text-white leading-none">
                       {filteredEmpresas.filter(e => {
                         const vDate = new Date(e.vencimiento);
                         if (e.vencimiento && !isNaN(vDate.getTime()) && vDate < new Date()) return false;
                         const missingConv = !(e.convalidacionesDetalle as any)?.anio1?.fecha || !(e.convalidacionesDetalle as any)?.anio2?.fecha;
                         return missingConv;
                       }).length}
                     </p>
                   </div>
                 </div>
               </div>

             <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredEmpresas.map(empresa => (
                  <div key={empresa.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden flex flex-col">
                     <div className="p-5 flex-1 relative group cursor-pointer" onClick={() => viewProfile(empresa)}>
                        <div className="flex items-start justify-between mb-4">
                           <div className="flex items-center gap-3">
                             {empresa.logoUrl ? (
                               <div className="w-12 h-12 rounded bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-200">
                                 <img src={empresa.logoUrl} alt="Logo" className="w-full h-full object-contain p-0.5"/>
                               </div>
                             ) : (
                               <div className="w-12 h-12 rounded bg-primary/10 flex items-center justify-center text-primary border border-primary/20">
                                 <span className="material-symbols-outlined text-2xl">water_drop</span>
                               </div>
                             )}
                             <div>
                               <h3 className="font-black text-slate-800 dark:text-white uppercase tracking-tight text-sm leading-tight max-w-[200px]">{empresa.empresa}</h3>
                               {empresa.categoria && <p className="text-[9px] font-black tracking-widest mt-1 text-primary bg-primary/10 w-max px-1.5 py-0.5 rounded uppercase">{empresa.categoria}</p>}
                               <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1 mt-1"><span className="material-symbols-outlined text-[12px]">location_on</span> {empresa.dependencia || 'S/D'}</p>
                             </div>
                           </div>
                        </div>

                        <div className="grid grid-cols-2 gap-y-3 gap-x-2 text-[11px]">
                          <div>
                            <p className="text-slate-400 font-bold uppercase tracking-widest text-[9px] mb-0.5">Disposición</p>
                            <p className="font-black text-slate-700 dark:text-slate-200">{empresa.disposicion || 'S/D'}</p>
                          </div>
                          <div>
                            <p className="text-slate-400 font-bold uppercase tracking-widest text-[9px] mb-0.5">Vencimiento</p>
                            <p className={`font-black uppercase flex items-center gap-1 text-[10px] px-2 py-0.5 rounded w-max ${getSemaforoStyle(empresa.vencimiento)}`}>
                              {formatDate(empresa.vencimiento) || 'S/D'}
                              {empresa.vencimiento && new Date(empresa.vencimiento) < new Date() && <span className="material-symbols-outlined text-[10px]">warning</span>}
                            </p>
                          </div>
                          <div className="col-span-2">
                             <p className="text-slate-400 font-bold uppercase tracking-widest text-[9px] mb-0.5">Bases Operativas</p>
                             <div className="flex gap-1 flex-wrap mt-1">
                                {(empresa.basesOperativas || []).length > 0 ? (
                                   (empresa.basesOperativas || []).map(b => (
                                     <span key={b.id} className="bg-slate-100 text-slate-600 text-[9px] font-black uppercase px-2 py-0.5 rounded border border-slate-200">{b.nombre}</span>
                                   ))
                                ) : (
                                   <span className="text-slate-400 italic font-medium text-[10px]">Sin bases registradas</span>
                                )}
                             </div>
                          </div>
                        </div>

                        {/* Quick actions on hover */}
                        <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity flex bg-white dark:bg-slate-800 shadow-md rounded border border-slate-200 dark:border-slate-700 p-0.5">
                           {isJefe && (
                             <button 
                               onClick={(e) => { e.stopPropagation(); openEditEmpresa(empresa); }} 
                               className="p-1.5 text-slate-400 hover:text-primary transition-colors rounded"
                               title="Editar Empresa"
                             >
                                <span className="material-symbols-outlined text-[16px]">edit</span>
                             </button>
                           )}
                        </div>
                     </div>
                     <div className="bg-slate-50 dark:bg-slate-800/50 px-5 py-3 border-t border-slate-200 dark:border-slate-700 flex justify-between items-center">
                        <span className="text-[10px] text-slate-500 font-bold flex items-center gap-1">
                          <span className="material-symbols-outlined text-[12px]">update</span>
                          {formatDate(empresa.ultimaActualizacion)}
                        </span>
                        <button onClick={() => viewProfile(empresa)} className="text-[10px] font-black text-primary uppercase flex items-center gap-1 hover:text-blue-700">Ver Perfil <span className="material-symbols-outlined text-[14px]">chevron_right</span></button>
                     </div>
                  </div>
                ))}
             </div>
             </>
           )}
        </div>
      </main>

      {/* MODAL EDITAR EMPRESA */}
      {isModalOpen && editingEmpresa && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden border border-slate-200 dark:border-slate-800">
             <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
              <span className="text-xs font-black uppercase tracking-widest">{editingEmpresa.id ? 'Editar Empresa' : 'Nueva Empresa'}</span>
              <button onClick={() => setIsModalOpen(false)}><span className="material-symbols-outlined">close</span></button>
            </div>
            
            <form onSubmit={handleSaveEmpresa} className="p-6 overflow-y-auto max-h-[80vh] bg-slate-50 dark:bg-slate-900">
               <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm mb-6">
                 <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2 flex items-center gap-2"><span className="material-symbols-outlined text-primary text-[18px]">business</span> Datos Principales</h4>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div className="col-span-1 md:col-span-2">
                     <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Nombre de la Empresa</label>
                     <input required className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase font-bold" value={editingEmpresa.empresa || ''} onChange={e => setEditingEmpresa({...editingEmpresa, empresa: e.target.value})} placeholder="Ej. LÍNEAS MARÍTIMAS S.A."/>
                   </div>
                   <div className="col-span-1 md:col-span-2">
                     <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Responsable Técnico (Obligatorio)</label>
                     <input required className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none font-bold text-indigo-700 uppercase" value={editingEmpresa.responsableTecnico || ''} onChange={e => setEditingEmpresa({...editingEmpresa, responsableTecnico: e.target.value})} placeholder="Ej. Ing. Juan Pérez"/>
                   </div>
                   <div>
                     <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Jurisdicción (Dependencia)</label>
                     <input className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase" value={editingEmpresa.dependencia || ''} onChange={e => setEditingEmpresa({...editingEmpresa, dependencia: e.target.value})} placeholder="PNA..."/>
                   </div>
                   <div>
                     <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Categoría</label>
                     <input className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase" value={editingEmpresa.categoria || ''} onChange={e => setEditingEmpresa({...editingEmpresa, categoria: e.target.value})} placeholder="Ej. A, B, C..."/>
                   </div>
                   <div className="col-span-1 md:col-span-2">
                     <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">URL Logo (Opcional)</label>
                     <input className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none" value={editingEmpresa.logoUrl || ''} onChange={e => setEditingEmpresa({...editingEmpresa, logoUrl: e.target.value})} placeholder="https://..."/>
                   </div>
                 </div>
               </div>

               <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm mb-6">
                 <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2 flex items-center gap-2"><span className="material-symbols-outlined text-primary text-[18px]">gavel</span> Disposición y Habilitación</h4>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div>
                     <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Nº Disposición</label>
                     <input className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none font-mono uppercase" value={editingEmpresa.disposicion || ''} onChange={e => setEditingEmpresa({...editingEmpresa, disposicion: e.target.value})}/>
                   </div>
                   <div>
                     <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Vencimiento (3 años)</label>
                     <input type="date" className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none font-bold" value={editingEmpresa.vencimiento || ''} onChange={e => setEditingEmpresa({...editingEmpresa, vencimiento: e.target.value})}/>
                   </div>
                   <div className="col-span-2">
                     <p className="text-[10px] font-black uppercase text-slate-400 mb-2">Convalidaciones y Visitas</p>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
                         <label className="block text-[9px] font-bold uppercase text-slate-500 mb-1">1º Año de Operación</label>
                         <input type="date" className="w-full px-2 py-1.5 text-[10px] bg-white border border-slate-200 rounded dark:bg-slate-800 dark:border-slate-700 outline-none" value={(editingEmpresa.convalidacionesDetalle as any)?.anio1?.fecha || ''} onChange={e => setEditingEmpresa({...editingEmpresa, convalidacionesDetalle: { ...editingEmpresa.convalidacionesDetalle, anio1: { ...(editingEmpresa.convalidacionesDetalle as any)?.anio1, fecha: e.target.value } }})}/>
                         <input className="w-full px-2 py-1.5 text-[10px] bg-white border border-slate-200 rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase placeholder:capitalize" placeholder="Inspector/Auditor" value={(editingEmpresa.convalidacionesDetalle as any)?.anio1?.auditorNombre || ''} onChange={e => setEditingEmpresa({...editingEmpresa, convalidacionesDetalle: { ...editingEmpresa.convalidacionesDetalle, anio1: { ...(editingEmpresa.convalidacionesDetalle as any)?.anio1, auditorNombre: e.target.value } }})}/>
                         <div className="grid grid-cols-2 gap-2">
                            <input className="w-full px-2 py-1.5 text-[10px] bg-white border border-slate-200 rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase" placeholder="Nº Expediente" value={(editingEmpresa.convalidacionesDetalle as any)?.anio1?.nroExpediente || ''} onChange={e => setEditingEmpresa({...editingEmpresa, convalidacionesDetalle: { ...editingEmpresa.convalidacionesDetalle, anio1: { ...(editingEmpresa.convalidacionesDetalle as any)?.anio1, nroExpediente: e.target.value } }})}/>
                            <input className="w-full px-2 py-1.5 text-[10px] bg-white border border-slate-200 rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase" placeholder="Certificado" value={(editingEmpresa.convalidacionesDetalle as any)?.anio1?.nroCertificadoConvalidacion || ''} onChange={e => setEditingEmpresa({...editingEmpresa, convalidacionesDetalle: { ...editingEmpresa.convalidacionesDetalle, anio1: { ...(editingEmpresa.convalidacionesDetalle as any)?.anio1, nroCertificadoConvalidacion: e.target.value } }})}/>
                         </div>
                       </div>
                       <div className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
                         <label className="block text-[9px] font-bold uppercase text-slate-500 mb-1">2º Año de Operación</label>
                         <input type="date" className="w-full px-2 py-1.5 text-[10px] bg-white border border-slate-200 rounded dark:bg-slate-800 dark:border-slate-700 outline-none" value={(editingEmpresa.convalidacionesDetalle as any)?.anio2?.fecha || ''} onChange={e => setEditingEmpresa({...editingEmpresa, convalidacionesDetalle: { ...editingEmpresa.convalidacionesDetalle, anio2: { ...(editingEmpresa.convalidacionesDetalle as any)?.anio2, fecha: e.target.value } }})}/>
                         <input className="w-full px-2 py-1.5 text-[10px] bg-white border border-slate-200 rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase placeholder:capitalize" placeholder="Inspector/Auditor" value={(editingEmpresa.convalidacionesDetalle as any)?.anio2?.auditorNombre || ''} onChange={e => setEditingEmpresa({...editingEmpresa, convalidacionesDetalle: { ...editingEmpresa.convalidacionesDetalle, anio2: { ...(editingEmpresa.convalidacionesDetalle as any)?.anio2, auditorNombre: e.target.value } }})}/>
                         <div className="grid grid-cols-2 gap-2">
                            <input className="w-full px-2 py-1.5 text-[10px] bg-white border border-slate-200 rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase" placeholder="Nº Expediente" value={(editingEmpresa.convalidacionesDetalle as any)?.anio2?.nroExpediente || ''} onChange={e => setEditingEmpresa({...editingEmpresa, convalidacionesDetalle: { ...editingEmpresa.convalidacionesDetalle, anio2: { ...(editingEmpresa.convalidacionesDetalle as any)?.anio2, nroExpediente: e.target.value } }})}/>
                            <input className="w-full px-2 py-1.5 text-[10px] bg-white border border-slate-200 rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase" placeholder="Certificado" value={(editingEmpresa.convalidacionesDetalle as any)?.anio2?.nroCertificadoConvalidacion || ''} onChange={e => setEditingEmpresa({...editingEmpresa, convalidacionesDetalle: { ...editingEmpresa.convalidacionesDetalle, anio2: { ...(editingEmpresa.convalidacionesDetalle as any)?.anio2, nroCertificadoConvalidacion: e.target.value } }})}/>
                         </div>
                       </div>
                     </div>
                   </div>
                 </div>
               </div>

               <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-sm mb-6">
                 <h4 className="text-xs font-black text-slate-800 uppercase tracking-widest mb-4 border-b border-slate-100 pb-2 flex items-center gap-2"><span className="material-symbols-outlined text-primary text-[18px]">contact_mail</span> Contacto</h4>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                     <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Responsable</label>
                     <input className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase" value={editingEmpresa.responsable || ''} onChange={e => setEditingEmpresa({...editingEmpresa, responsable: e.target.value})}/>
                   </div>
                   <div>
                     <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">CUIT</label>
                     <input className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none" value={editingEmpresa.cuit || ''} onChange={e => setEditingEmpresa({...editingEmpresa, cuit: e.target.value})}/>
                   </div>
                   <div className="col-span-2">
                     <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Domicilio Principal</label>
                     <input className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none" value={editingEmpresa.domicilio || ''} onChange={e => setEditingEmpresa({...editingEmpresa, domicilio: e.target.value})}/>
                   </div>
                   <div>
                     <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Email</label>
                     <input type="email" className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none" value={editingEmpresa.email || ''} onChange={e => setEditingEmpresa({...editingEmpresa, email: e.target.value})}/>
                   </div>
                   <div>
                     <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Teléfonos</label>
                     <input className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none" value={editingEmpresa.telefono || ''} onChange={e => setEditingEmpresa({...editingEmpresa, telefono: e.target.value})}/>
                   </div>
                 </div>
               </div>

               <div className="flex justify-between items-center mt-8">
                  {editingEmpresa.id && isJefe ? (
                    <button type="button" onClick={() => handleDeleteEmpresa(editingEmpresa.id!)} className="text-xs font-black text-red-500 hover:text-red-700 uppercase tracking-widest flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">delete</span> Eliminar Empresa</button>
                  ) : <div/>}
                  <div className="flex gap-3">
                    <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-3 rounded text-sm font-black text-slate-600 hover:bg-slate-100 uppercase tracking-widest transition-colors">Cancelar</button>
                    <button type="submit" className="px-6 py-3 rounded text-sm font-black text-white bg-primary hover:bg-blue-600 uppercase tracking-widest shadow-lg shadow-blue-500/30 transition-all flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px]">save</span> Confirmar
                    </button>
                  </div>
                </div>
            </form>
          </div>
        </div>
      )}

      {/* PERFIL EMPRESA COMPLETO */}
      {isProfileOpen && selectedEmpresa && (
         <div className="fixed inset-0 bg-slate-100 dark:bg-slate-900 z-50 flex flex-col h-screen overflow-hidden">
            <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-6 py-4 flex justify-between items-center shrink-0 shadow-sm z-10">
               <div className="flex items-center gap-4">
                 <button onClick={() => setIsProfileOpen(false)} className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors">
                   <span className="material-symbols-outlined">arrow_back</span>
                 </button>
                 <div className="flex items-center gap-3">
                   {selectedEmpresa.logoUrl ? (
                      <div className="w-24 h-24 bg-white rounded border border-slate-200 p-0.5 overflow-hidden flex items-center justify-center">
                         <img src={selectedEmpresa.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                      </div>
                   ) : (
                      <div className="w-24 h-24 bg-blue-100 rounded text-blue-600 flex items-center justify-center">
                         <span className="material-symbols-outlined text-4xl">water_drop</span>
                      </div>
                   )}
                   <div>
                     <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight leading-none mb-1">{selectedEmpresa.empresa}</h2>
                     <div className="flex flex-col gap-1 mt-2">
                       <div className="flex items-center gap-2">
                         <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1">EMPRESA <span className="w-1 h-1 bg-slate-300 rounded-full"></span> JURISDICCIÓN: {selectedEmpresa.dependencia || 'S/D'}</p>
                         {selectedEmpresa.categoria && <span className="text-[10px] bg-indigo-600 text-white font-black px-2 py-0.5 rounded uppercase tracking-widest leading-none">CAT {selectedEmpresa.categoria}</span>}
                       </div>
                       <p className="text-[10px] font-black text-indigo-700 uppercase flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">engineering</span> Resp. Técnico: {selectedEmpresa.responsableTecnico || 'No Asignado'}</p>
                     </div>
                   </div>
                 </div>
               </div>
               
               <div className="flex gap-2">
                 {isJefe && (
                    <button onClick={() => openEditEmpresa(selectedEmpresa)} className="px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded text-xs font-black uppercase text-slate-600 flex items-center gap-2 transition-colors">
                      <span className="material-symbols-outlined text-[16px]">edit</span> Editar Empresa
                    </button>
                 )}
               </div>
            </header>

            <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 pb-20">
               <div className="max-w-6xl mx-auto space-y-8">
                  
                  {/* METRICAS Y DISPOSICION */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                     <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 relative overflow-hidden">
                       <div className="absolute -right-4 -top-4 text-blue-50 opacity-50 z-0">
                         <span className="material-symbols-outlined text-9xl">gavel</span>
                       </div>
                       <div className="relative z-10">
                         <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Disposición Habilitante</p>
                         <h3 className="text-3xl font-black text-slate-800 mb-2">{selectedEmpresa.disposicion || 'S/D'}</h3>
                         <div className="flex gap-4 items-center">
                           <div>
                             <span className="text-[10px] font-bold text-slate-500 uppercase">Vencimiento (3 Años)</span>
                             <p className={`font-black uppercase flex items-center gap-1 ${
                                !selectedEmpresa.vencimiento ? 'text-slate-800' :
                                new Date(selectedEmpresa.vencimiento) < new Date() ? 'text-red-600' :
                                new Date(selectedEmpresa.vencimiento) < new Date(Date.now() + 90*24*60*60*1000) ? 'text-amber-600' :
                                'text-emerald-600'
                              }`}>
                                {formatDate(selectedEmpresa.vencimiento) || 'No registra'}
                                {selectedEmpresa.vencimiento && new Date(selectedEmpresa.vencimiento) < new Date() && <span className="material-symbols-outlined text-[14px]">warning</span>}
                              </p>
                           </div>
                         </div>
                         {isJefe && selectedEmpresa.vencimiento && (
                            <button 
                              onClick={() => {
                                 if (!confirm("¿Renovar habilitación? Esto archivará la disposición actual y limpiará las fechas de vencimiento y convalidaciones para empezar un nuevo ciclo.")) return;
                                 
                                 const sourceCol = (selectedEmpresa as any)?._source || 'empresas_derrames';
                                 const historyEntry = {
                                   disposicion: selectedEmpresa.disposicion || 'S/D',
                                   vencimiento: selectedEmpresa.vencimiento,
                                   fechaArchivo: new Date().toISOString(),
                                   inspeccionesIntermedias: selectedEmpresa.convalidacionesDetalle || {}
                                 };
                                 const newHistory = [...(selectedEmpresa.historialDisposiciones || []), historyEntry];
                                 
                                 updateDoc(doc(db, sourceCol, selectedEmpresa.id), {
                                    historialDisposiciones: newHistory,
                                    disposicion: '',
                                    vencimiento: '',
                                    convalidacionesDetalle: {},
                                    ultimaActualizacion: new Date().toISOString()
                                 });
                                 
                                 setSelectedEmpresa({
                                    ...selectedEmpresa,
                                    historialDisposiciones: newHistory,
                                    disposicion: '',
                                    vencimiento: '',
                                    convalidacionesDetalle: {}
                                 });
                              }}
                              className="mt-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase px-3 py-1.5 rounded flex items-center gap-1 border border-indigo-200 transition-colors w-max"
                            >
                               <span className="material-symbols-outlined text-[14px]">autorenew</span> Renovar Disp.
                            </button>
                         )}
                       </div>
                     </div>

                     <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 col-span-1 md:col-span-2 lg:col-span-1">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 border-b border-slate-100 pb-2">Convalidaciones y Visitas Anuales</p>
                        <div className="grid grid-cols-2 gap-4">
                          {[1, 2].map(year => {
                             const det = (selectedEmpresa.convalidacionesDetalle as any)?.[`anio${year}`];
                             return (
                               <div key={year} className="bg-slate-50 dark:bg-slate-800/50 p-3 rounded border border-slate-100 dark:border-slate-700">
                                 <p className="text-[9px] font-black uppercase text-slate-400 mb-1">{year}º Año Operación</p>
                                 {det?.fecha ? (
                                    <>
                                      <p className={`text-sm font-black mb-1 ${getSemaforoColor(det?.fecha, !!det?.nroCertificadoConvalidacion)}`}>{formatDate(det.fecha)} {det?.nroCertificadoConvalidacion && '✅'}</p>
                                      {det.auditorNombre && <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">person</span> {det.auditorNombre}</p>}
                                      <div className="flex flex-col gap-1 mt-1">
                                        {det.nroExpediente && <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">folder</span> {det.nroExpediente}</p>}
                                        {det.nroCertificadoConvalidacion && <p className="text-[10px] font-black text-emerald-600 uppercase flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">verified</span> CERT: {det.nroCertificadoConvalidacion}</p>}
                                      </div>
                                    </>
                                 ) : (
                                    <div className="flex items-center gap-1 text-slate-400 mt-2">
                                       <span className="material-symbols-outlined text-[14px]">pending_actions</span>
                                       <span className="text-[10px] font-bold uppercase">Pendiente</span>
                                    </div>
                                 )}
                               </div>
                             );
                          })}
                        </div>
                     </div>

                     <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 col-span-1 md:col-span-3 lg:col-span-1 flex flex-col gap-4">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 border-b border-slate-100 pb-2">Expedientes Asociados</p>
                          <div className="flex items-end gap-3">
                            <span className="text-4xl font-black text-indigo-600 leading-none">
                              {
                                cases.filter(c => c.categoria === 'derrames' && c.planId === selectedEmpresa.id).length +
                                ((selectedEmpresa.convalidacionesDetalle as any)?.anio1?.nroExpediente ? 1 : 0) +
                                ((selectedEmpresa.convalidacionesDetalle as any)?.anio2?.nroExpediente ? 1 : 0)
                              }
                            </span>
                            <span className="text-xs font-bold text-slate-500 uppercase pb-1">Trámites<br/>Registrados</span>
                          </div>
                        </div>

                        <div className="pt-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 border-b border-slate-100 pb-2">Capacidad de Contención</p>
                          {(() => {
                             const totalPuerto = selectedEmpresa.basesOperativas?.reduce((acc, b) => acc + Number(b.barrerasPuerto || 0), 0) || 0;
                             const totalFluvial = selectedEmpresa.basesOperativas?.reduce((acc, b) => acc + Number(b.barrerasFluvial || 0), 0) || 0;
                             const totalMaritima = selectedEmpresa.basesOperativas?.reduce((acc, b) => acc + Number(b.barrerasMaritima || 0), 0) || 0;
                             
                             // Calculate total propio preferring the individual components if they exist, otherwise fallback to legacy `cantidadBarreras`
                             const totalPropioComponents = totalPuerto + totalFluvial + totalMaritima;
                             const totalPropioLegacy = selectedEmpresa.basesOperativas?.reduce((acc, b) => acc + Number(b.cantidadBarreras || 0), 0) || 0;
                             const totalPropio = totalPropioComponents > 0 ? totalPropioComponents : totalPropioLegacy;

                             const totalConvenido = selectedEmpresa.convenios?.reduce((acc, c) => acc + Number(c.cantidadBarreras || 0), 0) || 0;
                             const totalCapacidad = totalPropio + totalConvenido;

                             const req = BARRIER_REQUIREMENTS[selectedEmpresa.categoria?.toUpperCase() || ''];
                             const reqPropio = req ? req.total * req.ownPercent : 0;
                             const reqTotal = req ? req.total : 0;
                             
                             const compliesPropio = req ? totalPropio >= reqPropio : true;
                             const compliesTotal = req ? totalCapacidad >= reqTotal : true;

                             // Aggregate embarcaciones and others
                             const totalEmbarcaciones = selectedEmpresa.basesOperativas?.reduce((acc, b) => acc + Number(b.embarcaciones || 0), 0) || 0;
                             const totalSkimmers = selectedEmpresa.basesOperativas?.reduce((acc, b) => acc + Number(b.skimmers || 0), 0) || 0;

                             return (
                               <div className="space-y-4">
                                 {/* PROPIO */}
                                 <div>
                                   <div className="flex items-end gap-3 mb-1">
                                     <span className={`text-2xl font-black leading-none ${compliesPropio ? 'text-emerald-600' : 'text-red-500'}`}>
                                       {totalPropio.toLocaleString()}m
                                     </span>
                                     <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase">Equipamiento PROPIO</span>
                                        {req && <span className="text-[8px] font-black uppercase text-slate-400">Min {req.ownPercent*100}%: {reqPropio.toLocaleString()}m</span>}
                                     </div>
                                   </div>
                                   {req && (
                                     <div className="w-full bg-slate-100 rounded-full h-1 overflow-hidden mt-1">
                                        <div 
                                          className={`h-full transition-all duration-500 rounded-full ${compliesPropio ? 'bg-emerald-500' : 'bg-red-500'}`} 
                                          style={{ width: `${Math.min(100, (totalPropio / reqPropio) * 100)}%` }}
                                        />
                                     </div>
                                   )}
                                   
                                   {/* DESGLOSE */}
                                   <div className="mt-3 grid grid-cols-3 gap-2 border-t border-slate-100 pt-3">
                                      <div className="text-center">
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-tight">Puerto</p>
                                        <p className="text-xs font-black text-slate-800">{totalPuerto}m</p>
                                      </div>
                                      <div className="text-center border-l border-r border-slate-100">
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-tight">Fluvial</p>
                                        <p className="text-xs font-black text-slate-800">{totalFluvial}m</p>
                                      </div>
                                      <div className="text-center">
                                        <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-tight">Marítima</p>
                                        <p className="text-xs font-black text-slate-800">{totalMaritima}m</p>
                                      </div>
                                   </div>
                                   <div className="mt-2 flex justify-around text-center text-[10px] text-slate-500 border-t border-slate-100 pt-2">
                                      <div><span className="font-black text-slate-700">{totalEmbarcaciones}</span> Embarcaciones</div>
                                      <div><span className="font-black text-slate-700">{totalSkimmers}</span> Skimmers</div>
                                   </div>
                                 </div>

                                 {/* TOTAL CONVENIDO */}
                                 {selectedEmpresa.convenios && selectedEmpresa.convenios.length > 0 && (
                                   <div>
                                     <div className="flex justify-between items-end mb-1">
                                       <div className="flex flex-col">
                                          <span className="text-[10px] font-bold text-slate-500 uppercase">Equip. Convenido</span>
                                          <span className="text-sm font-black text-indigo-600">+{totalConvenido.toLocaleString()}m</span>
                                       </div>
                                       <span className="text-[9px] font-bold text-slate-400 uppercase bg-slate-100 px-1.5 rounded">{selectedEmpresa.convenios.length} Convenios</span>
                                     </div>
                                   </div>
                                 )}

                                 {/* TOTAL COMBINADO */}
                                 <div className="border-t border-slate-100 pt-2">
                                   <div className="flex items-end gap-3">
                                     <span className={`text-3xl font-black leading-none ${compliesTotal && compliesPropio ? 'text-blue-600' : 'text-red-500'}`}>
                                       {totalCapacidad.toLocaleString()}m
                                     </span>
                                     <div className="flex flex-col">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase">TOTAL CAPACIDAD</span>
                                        {req && <span className="text-[8px] font-black uppercase text-slate-400 flex items-center gap-1"> Req. Cat. {selectedEmpresa.categoria}: {reqTotal.toLocaleString()}m 
                                          {(compliesTotal && compliesPropio) && <span className="material-symbols-outlined text-[10px] text-green-500">check_circle</span>}
                                          {(!compliesTotal || !compliesPropio) && <span className="material-symbols-outlined text-[10px] text-red-500">error</span>}
                                        </span>}
                                     </div>
                                   </div>
                                   {req && (
                                     <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden mt-1.5 flex align-center justify-start gap-px">
                                        <div 
                                          className={`h-full transition-all duration-500 ${compliesPropio ? 'bg-blue-400' : 'bg-red-400'}`} 
                                          title="Propio"
                                          style={{ width: `${Math.min(100, (totalPropio / reqTotal) * 100)}%` }}
                                        />
                                        <div 
                                          className={`h-full transition-all duration-500 ${compliesTotal ? 'bg-blue-300' : 'bg-orange-300'} opacity-70`} 
                                          title="Convenido"
                                          style={{ width: `${Math.min(100, (totalConvenido / reqTotal) * 100)}%` }}
                                        />
                                     </div>
                                   )}
                                 </div>
                               </div>
                             );
                          })()}
                        </div>

                        <div className="pt-2">
                          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 border-b border-slate-100 pb-2">Asistencia a Terceros</p>
                          {(() => {
                             const assistedPlanes = planes.filter(p => 
                               (p.tipoRespuesta || '').toLowerCase() === 'terceros' && 
                               isSameEmcodecon(p.empresaRespuesta, selectedEmpresa.empresa)
                             );
                             return (
                               <div>
                                 <div className="flex items-end gap-3 mb-2">
                                   <span className="text-3xl font-black text-emerald-600 leading-none">{assistedPlanes.length}</span>
                                   <span className="text-[10px] font-bold text-slate-500 uppercase pb-1">Planes<br/>Asistidos</span>
                                 </div>
                                 <div className="flex flex-wrap gap-1 mt-1 max-h-[80px] overflow-y-auto">
                                   {assistedPlanes.length > 0 ? assistedPlanes.map(p => (
                                     <span key={p.id} className="text-[9px] bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded text-slate-600 font-bold uppercase truncate max-w-[120px]" title={p.empresa}>{p.empresa}</span>
                                   )) : (
                                     <span className="text-[10px] text-slate-400 italic">No registra asistencias.</span>
                                   )}
                                 </div>
                               </div>
                             );
                          })()}
                        </div>
                     </div>
                  </div>

                   {/* HISTORIAL DE INSPECCIONES INTERMEDIAS */}
                   <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 overflow-hidden">
                      <div className="flex justify-between items-center mb-4 border-b border-slate-100 pb-2">
                         <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Historial de Inspecciones Intermedias</p>
                         <span className="text-[9px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded font-black uppercase border border-blue-100">Registro Histórico</span>
                      </div>
                      <div className="space-y-3">
                        {selectedEmpresa.inspeccionesIntermedias && selectedEmpresa.inspeccionesIntermedias.length > 0 ? (
                           selectedEmpresa.inspeccionesIntermedias.sort((a,b) => (b.fecha||'').localeCompare(a.fecha||'')).map((insp, idx) => (
                              <div key={idx} className="flex gap-4 p-3 bg-slate-50 dark:bg-slate-800/30 rounded border border-slate-100 dark:border-slate-700">
                                 <div className="text-center w-16 shrink-0 border-r border-slate-200 dark:border-slate-700 pr-3">
                                    <p className="text-[10px] font-black text-slate-800 dark:text-white leading-none mb-1">
                                       {insp.fecha ? `${formatDate(insp.fecha).split('/')[0]}/${formatDate(insp.fecha).split('/')[1]}` : '--/--'}
                                    </p>
                                    <p className="text-[8px] font-bold text-slate-400">{insp.fecha ? formatDate(insp.fecha).split('/')[2] : '----'}</p>
                                 </div>
                                 <div className="flex-1">
                                    <p className="text-[10px] font-black text-slate-700 dark:text-slate-300 uppercase underline decoration-blue-200 underline-offset-2 mb-1">
                                       {insp.baseNombre || 'BASE UBICACIÓN'}
                                    </p>
                                    <div className="grid grid-cols-2 gap-2 text-[9px] font-bold text-slate-500 uppercase">
                                       <p className="flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">person</span> {insp.auditorNombre}</p>
                                       <p className="flex items-center gap-1"><span className="material-symbols-outlined text-[12px]">verified</span> CERT: {insp.nroCertificado || '-'}</p>
                                    </div>
                                 </div>
                              </div>
                           ))
                        ) : (
                           <p className="text-xs text-slate-400 italic text-center py-4">No hay inspecciones intermedias registradas.</p>
                        )}
                      </div>
                   </div>

                   {/* BASES Y MAPA GRID */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* BASES OPERATIVAS LIST */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                          <span className="material-symbols-outlined text-primary">warehouse</span> Bases Operativas
                        </h4>
                        <button onClick={() => openNewBase(selectedEmpresa.id)} className="bg-white border border-slate-200 hover:bg-slate-50 text-primary text-[10px] font-black uppercase px-3 py-1.5 rounded flex items-center gap-1 shadow-sm transition-colors">
                          <span className="material-symbols-outlined text-[14px]">add</span> Añadir Base
                        </button>
                      </div>
                      <div className="flex-1 p-4 overflow-y-auto max-h-[500px]">
                        {(selectedEmpresa.basesOperativas || []).length > 0 ? (
                           <div className="space-y-4">
                             {(selectedEmpresa.basesOperativas || []).map(base => {
                               const coords = parseCoordinates(base.coordenadas);
                               return (
                                 <div key={base.id} className="border border-slate-200 rounded-lg p-4 hover:border-blue-300 transition-colors group relative">
                                    <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                                       <button onClick={() => openEditBase(selectedEmpresa.id, base)} className="p-1 rounded bg-slate-100 hover:bg-white text-slate-500 hover:text-primary transition-all border border-transparent hover:border-slate-300"><span className="material-symbols-outlined text-[16px]">edit</span></button>
                                       <button onClick={() => handleDeleteBase(selectedEmpresa.id, base.id)} className="p-1 rounded bg-slate-100 hover:bg-white text-slate-500 hover:text-red-600 transition-all border border-transparent hover:border-slate-300"><span className="material-symbols-outlined text-[16px]">delete</span></button>
                                    </div>
                                    <h5 className="font-black text-slate-800 uppercase text-sm mb-1">{base.nombre}</h5>
                                    {coords ? (
                                      <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1 mb-3">
                                        <span className="material-symbols-outlined text-[14px] text-blue-500">location_on</span> 
                                        {coords[0].toFixed(4)}, {coords[1].toFixed(4)}
                                      </p>
                                    ) : (
                                      <p className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1 mb-3">
                                        <span className="material-symbols-outlined text-[14px] text-slate-400">location_off</span> Sin coordenadas válidas
                                      </p>
                                    )}
                                    <div className="bg-slate-50 rounded p-3 text-xs text-slate-700 whitespace-pre-wrap font-medium border border-slate-100">
                                      <p className="text-[9px] font-black uppercase text-slate-400 mb-1">Equipamiento y Materiales</p>
                                      {(Number(base.barrerasPuerto) > 0 || Number(base.barrerasFluvial) > 0 || Number(base.barrerasMaritima) > 0) && (
                                        <div className="mb-2 p-2 bg-white rounded border border-slate-100">
                                          <p className="font-bold flex items-center gap-1 text-emerald-600 mb-1"><span className="material-symbols-outlined text-[14px]">waves</span> Barreras ({base.cantidadBarreras || 0}m)</p>
                                          <div className="grid grid-cols-2 gap-x-4 gap-y-1 pl-4 text-[10px] text-slate-500 uppercase">
                                            {Number(base.barrerasPuerto) > 0 && <p>Puerto: <span className="font-black text-slate-800">{base.barrerasPuerto}m</span></p>}
                                            {Number(base.barrerasFluvial) > 0 && <p>Fluv/Lac: <span className="font-black text-slate-800">{base.barrerasFluvial}m</span></p>}
                                            {Number(base.barrerasMaritima) > 0 && <p>Marít: <span className="font-black text-slate-800">{base.barrerasMaritima}m</span></p>}
                                          </div>
                                        </div>
                                      )}
                                      <div className="grid grid-cols-2 gap-2 mb-2">
                                        {base.metrosAbsorbentes ? <div className="bg-white p-1 rounded border border-slate-100"><p className="text-[8px] font-black uppercase text-slate-400">Absorbentes</p><p className="font-black text-slate-800">{base.metrosAbsorbentes}m</p></div> : null}
                                        {base.skimmers ? <div className="bg-white p-1 rounded border border-slate-100"><p className="text-[8px] font-black uppercase text-slate-400">Skimmers</p><p className="font-black text-slate-800">{base.skimmers}</p></div> : null}
                                        {base.embarcaciones ? <div className="bg-white p-1 rounded border border-slate-100"><p className="text-[8px] font-black uppercase text-slate-400">Embarcaciones</p><p className="font-black text-slate-800">{base.embarcaciones}</p></div> : null}
                                      </div>
                                      {base.materiales && <p className="text-[10px] text-slate-600 italic mt-1 border-t pt-1">{base.materiales}</p>}
                                    </div>
                                    {base.observaciones && (
                                      <p className="mt-2 text-[10px] text-slate-500"><span className="font-bold uppercase">Obs:</span> {base.observaciones}</p>
                                    )}
                                 </div>
                               );
                             })}
                           </div>
                        ) : (
                           <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                             <div className="w-16 h-16 rounded-full bg-slate-50 flex items-center justify-center mb-4 border border-slate-100 text-slate-300">
                               <span className="material-symbols-outlined text-3xl">warehouse</span>
                             </div>
                             <p className="text-sm font-bold uppercase tracking-widest text-slate-500 mb-2">Sin bases registradas</p>
                             <p className="text-xs max-w-sm text-center">Añade las bases operativas (galpones, depósitos, oficinas) donde la empresa almacena su equipamiento.</p>
                           </div>
                        )}
                      </div>
                    </div>

                    {/* MAPA DE BASES */}
                    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[600px] lg:h-auto">
                      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                          <span className="material-symbols-outlined text-primary">map</span> Mapa de Despliegue
                        </h4>
                      </div>
                      <div className="flex-1 w-full relative z-0">
                         {selectedEmpresa.basesOperativas && selectedEmpresa.basesOperativas.some(b => parseCoordinates(b.coordenadas)) ? (
                           <MapContainer 
                             center={parseCoordinates(selectedEmpresa.basesOperativas.find(b => parseCoordinates(b.coordenadas))?.coordenadas) || [-34.6037, -58.3816]} 
                             zoom={6} 
                             className="h-full w-full"
                           >
                             <TileLayer
                               attribution='&copy; IGN Argentina'
                               url="https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/{z}/{x}/{-y}.png"
                             />
                             {selectedEmpresa.basesOperativas.map(base => {
                               const coords = parseCoordinates(base.coordenadas);
                               if (!coords) return null;
                               return (
                                 <Marker key={base.id} position={coords} icon={petroleumIcon}>
                                   <Popup>
                                     <div className="p-1 min-w-[200px]">
                                       {selectedEmpresa.logoUrl && (
                                          <div className="w-full flex justify-center mb-2">
                                            <img src={selectedEmpresa.logoUrl} className="h-10 object-contain" alt="Logo de empresa" />
                                          </div>
                                       )}
                                       <h4 className="font-black text-slate-800 uppercase text-xs mb-1 border-b border-slate-200 pb-1 text-center">{base.nombre}</h4>
                                       <p className="text-[10px] font-bold text-slate-500 uppercase mt-2 mb-1">Equipamiento:</p>
                                       <div className="text-[10px] text-slate-600 max-h-[100px] overflow-y-auto w-full break-words">
                                         {base.cantidadBarreras ? <div><span className="font-bold">Barreras:</span> {base.cantidadBarreras}m</div> : null}
                                         {base.skimmers ? <div><span className="font-bold">Skimmers:</span> {base.skimmers}</div> : null}
                                         {base.embarcaciones ? <div><span className="font-bold">Embarcaciones:</span> {base.embarcaciones}</div> : null}
                                         {base.metrosAbsorbentes ? <div><span className="font-bold">Absorbentes:</span> {base.metrosAbsorbentes}m</div> : null}
                                         <div className="mt-1">{base.materiales || 'Sin otro detalle.'}</div>
                                       </div>
                                     </div>
                                   </Popup>
                                 </Marker>
                               );
                             })}
                           </MapContainer>
                         ) : (
                           <div className="h-full w-full flex items-center justify-center bg-slate-50 text-slate-400 p-8 text-center flex-col">
                             <span className="material-symbols-outlined text-5xl mb-4 opacity-50">wrong_location</span>
                             <p className="text-sm font-bold uppercase tracking-widest text-slate-500 mb-2">No se puede mostrar el mapa</p>
                             <p className="text-xs max-w-sm">No existen bases operativas con coordenadas geográficas válidas cargadas en el sistema para esta empresa.</p>
                           </div>
                         )}
                      </div>
                    </div>
                  </div>

                  {/* CONVENIOS DE ASISTENCIA */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-6">
                    <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                      <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                        <span className="material-symbols-outlined text-indigo-600">handshake</span> Convenios Vinculantes
                      </h4>
                      <button onClick={() => openNewConvenio(selectedEmpresa.id)} className="bg-white border border-slate-200 hover:bg-slate-50 text-indigo-600 text-[10px] font-black uppercase px-3 py-1.5 rounded flex items-center gap-1 shadow-sm transition-colors">
                        <span className="material-symbols-outlined text-[14px]">add</span> Añadir Convenio
                      </button>
                    </div>
                    <div className="p-4">
                      {(selectedEmpresa.convenios || []).length > 0 ? (
                         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                           {(selectedEmpresa.convenios || []).map(convenio => (
                             <div key={convenio.id} className="border border-slate-200 rounded-lg p-4 hover:border-indigo-300 transition-colors group relative bg-slate-50 flex flex-col justify-between">
                                <div className="absolute right-3 top-3 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 z-10">
                                   <button onClick={() => openEditConvenio(selectedEmpresa.id, convenio)} className="p-1 rounded bg-white hover:bg-slate-100 text-slate-500 hover:text-indigo-600 transition-all border border-slate-200"><span className="material-symbols-outlined text-[14px]">edit</span></button>
                                   <button onClick={() => handleDeleteConvenio(selectedEmpresa.id, convenio.id)} className="p-1 rounded bg-white hover:bg-slate-100 text-slate-500 hover:text-red-600 transition-all border border-slate-200"><span className="material-symbols-outlined text-[14px]">delete</span></button>
                                </div>
                                <div>
                                  <h5 className="font-black text-slate-800 uppercase text-sm mb-1 break-words pb-1 border-b border-slate-200 pr-12 flex items-center gap-1">
                                     {convenio.empresaConvenidaId && <span className="material-symbols-outlined text-[14px] text-indigo-500" title="Vinculado al Sistema">link</span>}
                                     {convenio.empresaConvenida}
                                  </h5>
                                  
                                  <div className="mt-3 grid grid-cols-2 gap-2">
                                    <div className="bg-white p-2 rounded border border-slate-200 shadow-sm flex flex-col justify-center">
                                      <p className="text-[9px] font-black uppercase text-slate-400 leading-tight">Total que RECIBE</p>
                                      <p className="font-black text-teal-600 flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">call_received</span> {convenio.cantidadBarreras || 0}m</p>
                                    </div>
                                    <div className="bg-white p-2 rounded border border-slate-200 shadow-sm flex flex-col justify-center">
                                      <p className="text-[9px] font-black uppercase text-slate-400 leading-tight">Total que APORTA</p>
                                      <p className="font-black text-indigo-600 flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">call_made</span> {convenio.cantidadAporta || 0}m</p>
                                    </div>
                                  </div>
                                </div>
                                <div className="mt-3">
                                  <div className="flex items-center gap-2 mb-2">
                                     <span className="text-[9px] font-black uppercase text-slate-400">Vence:</span>
                                     <span className={`font-black uppercase text-[11px] px-1.5 rounded ${getSemaforoColor(convenio.fechaVencimiento)}`}>
                                       {convenio.fechaVencimiento ? formatDate(convenio.fechaVencimiento) : 'S/D'}
                                     </span>
                                     {convenio.renovacionAutomatica && (
                                        <span className="material-symbols-outlined text-[14px] text-green-500 bg-green-50 px-1 py-0.5 rounded border border-green-100" title="Renovación Automática / Prórroga Tácita">autorenew</span>
                                     )}
                                     <button onClick={(e) => { e.stopPropagation(); openEditConvenio(selectedEmpresa.id, convenio); }} className="ml-auto flex items-center gap-1 text-[9px] font-black uppercase text-indigo-600 bg-indigo-50 border border-indigo-100 hover:bg-indigo-100 px-2 py-1 rounded transition-colors">
                                       <span className="material-symbols-outlined text-[12px]">edit_calendar</span> Renovar
                                     </button>
                                  </div>
                                  {convenio.observaciones && (
                                    <p className="py-1.5 px-2 bg-white rounded border border-slate-100 text-[10px] text-slate-500"><span className="font-bold uppercase text-slate-400">Obs:</span> {convenio.observaciones}</p>
                                  )}
                                </div>
                             </div>
                           ))}
                         </div>
                      ) : (
                         <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                           <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-4 border border-slate-100 text-slate-300">
                             <span className="material-symbols-outlined text-2xl">handshake</span>
                           </div>
                           <p className="text-sm font-bold uppercase tracking-widest text-slate-500 mb-2">Sin convenios registrados</p>
                           <p className="text-xs text-center">Registrar convenios permite contabilizar equipamiento adicional (hasta un 60% del requerimiento total de la categoría).</p>
                         </div>
                      )}
                    </div>
                  </div>

                  {/* INFO DE CONTACTO */}
                  <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                     <div className="px-6 py-4 border-b border-slate-200 bg-slate-50">
                        <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                          <span className="material-symbols-outlined text-primary">contact_mail</span> Datos de Contacto y Facturación
                        </h4>
                     </div>
                     <div className="p-6">
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-6 text-sm">
                           <div>
                             <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Responsable</p>
                             <p className="font-bold text-slate-800 uppercase">{selectedEmpresa.responsable || 'S/D'}</p>
                           </div>
                           <div>
                             <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Email</p>
                             <p className="font-bold text-slate-800">{selectedEmpresa.email || 'S/D'}</p>
                           </div>
                           <div>
                             <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Teléfonos</p>
                             <p className="font-bold text-slate-800">{selectedEmpresa.telefono || 'S/D'}</p>
                           </div>
                           <div>
                             <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">CUIT</p>
                             <p className="font-bold text-slate-800">{selectedEmpresa.cuit || 'S/D'}</p>
                           </div>
                           <div className="col-span-2 lg:col-span-4">
                             <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Domicilio Principal</p>
                             <p className="font-bold text-slate-800 uppercase">{selectedEmpresa.domicilio || 'S/D'}</p>
                           </div>
                        </div>
                     </div>
                  </div>

               </div>
            </div>
         </div>
      )}

      {/* MODAL BASE OPERATIVA */}
      {isBaseModalOpen && editingBase && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
              <span className="text-xs font-black uppercase tracking-widest">{editingBase.id ? 'Editar Base Operativa' : 'Nueva Base Operativa'}</span>
              <button onClick={() => setIsBaseModalOpen(false)}><span className="material-symbols-outlined">close</span></button>
            </div>
            <form onSubmit={handleSaveBase} className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Nombre / Identificador de la Base</label>
                  <input required className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase font-bold" value={editingBase.nombre || ''} onChange={e => setEditingBase({...editingBase, nombre: e.target.value})} placeholder="Ej. GALPÓN COMODORO RIVADAVIA"/>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Coordenadas</label>
                  <input className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none" value={editingBase.coordenadas || ''} onChange={e => setEditingBase({...editingBase, coordenadas: e.target.value})} placeholder="-45.8641, -67.4965"/>
                  <span className="text-[9px] text-slate-400 mt-1 block">Acepta formatos como "-45.8641, -67.4965" o grados/minutos/segundos.</span>
                </div>
                <div className="col-span-2">
                  <p className="text-[10px] font-black uppercase text-slate-400 mb-2 border-b pb-1">Barreras por Tipo (en Metros)</p>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[9px] font-bold uppercase text-slate-500 mb-1">Int. de Puerto</label>
                      <input type="number" className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none font-bold" value={editingBase.barrerasPuerto || ''} onChange={e => setEditingBase({...editingBase, barrerasPuerto: e.target.value})}/>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase text-slate-500 mb-1">Fluv. y Lacustre</label>
                      <input type="number" className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none font-bold" value={editingBase.barrerasFluvial || ''} onChange={e => setEditingBase({...editingBase, barrerasFluvial: e.target.value})}/>
                    </div>
                    <div>
                      <label className="block text-[9px] font-bold uppercase text-slate-500 mb-1">Marítimas</label>
                      <input type="number" className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none font-bold" value={editingBase.barrerasMaritima || ''} onChange={e => setEditingBase({...editingBase, barrerasMaritima: e.target.value})}/>
                    </div>
                  </div>
                  <p className="text-[10px] font-black text-indigo-600 mt-2">TOTAL SUMADO: {(Number(editingBase.barrerasPuerto || 0) + Number(editingBase.barrerasFluvial || 0) + Number(editingBase.barrerasMaritima || 0))}m</p>
                </div>
                <div className="col-span-1">
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Metros Absorbentes</label>
                  <input type="number" className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none" value={editingBase.metrosAbsorbentes || ''} onChange={e => setEditingBase({...editingBase, metrosAbsorbentes: e.target.value ? Number(e.target.value) : undefined})} placeholder="0"/>
                </div>
                <div className="col-span-1">
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Skimmers</label>
                  <input type="number" className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none" value={editingBase.skimmers || ''} onChange={e => setEditingBase({...editingBase, skimmers: e.target.value ? Number(e.target.value) : undefined})} placeholder="0"/>
                </div>
                <div className="col-span-1">
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Embarcaciones (Cantidad Total)</label>
                  <input type="number" className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none" value={editingBase.embarcaciones || ''} onChange={e => setEditingBase({...editingBase, embarcaciones: e.target.value ? Number(e.target.value) : undefined})} placeholder="0"/>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Detalle de Embarcaciones Propias (Opcional)</label>
                  <textarea className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none min-h-[60px]" value={editingBase.embarcacionesDetalle ? JSON.stringify(editingBase.embarcacionesDetalle) : ''} onChange={e => {
                     try {
                       setEditingBase({...editingBase, embarcacionesDetalle: JSON.parse(e.target.value)});
                     } catch(err) {
                       // ignore while typing or make a custom string field.
                     }
                  }} placeholder="[ {&quot;nombre&quot;: &quot;...&quot;, &quot;matricula&quot;: &quot;...&quot;} ]" style={{display: 'none'}} />
                  {/* Better: a simple string text area for Embarcaciones that we parse later, or just a simple multiline. Wait, since it's an array, let's just make a text field that saves to a string for simplicity, then we can convert it. Let's use `otroEquipamiento` for "Otro Equipamiento" and ignore the strict array for embarcaciones if it's too hard in this simple modal, or just make a simple text area. I will make a simple text area for 'Otro Equipamiento'. */}
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Detalle de Embarcaciones Propias (Ej: 1 Lancha REY - MAT: 1234)</label>
                  <textarea className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none min-h-[60px]" value={editingBase.materiales || ''} onChange={e => setEditingBase({...editingBase, materiales: e.target.value})} placeholder="Ej: 1 Lancha 'Marea', Matrícula Rey 1111..."/>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Otro Equipamiento (Opcional)</label>
                  <textarea className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none min-h-[80px]" value={editingBase.otroEquipamiento || ''} onChange={e => setEditingBase({...editingBase, otroEquipamiento: e.target.value})} placeholder="Camiones de vacío, bombas, grupos electrógenos..."/>
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Información Adicional (Opcional)</label>
                  <textarea className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none min-h-[60px]" value={editingBase.observaciones || ''} onChange={e => setEditingBase({...editingBase, observaciones: e.target.value})} placeholder="Horarios, personal, accesos..."/>
                </div>
              </div>
              <div className="flex justify-end gap-3 mt-6">
                <button type="button" onClick={() => setIsBaseModalOpen(false)} className="px-4 py-2 font-black uppercase text-xs text-slate-600 hover:bg-slate-100 rounded">Cancelar</button>
                <button type="submit" className="px-4 py-2 font-black uppercase text-xs bg-primary text-white rounded hover:bg-blue-600 shadow-sm flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">save</span> Guardar Base</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL CONVENIO DE ASISTENCIA */}
      {isConvenioModalOpen && editingConvenio && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
              <span className="text-xs font-black uppercase tracking-widest flex items-center gap-2"><span className="material-symbols-outlined text-[16px]">handshake</span> {editingConvenio.id ? 'Editar Convenio' : 'Nuevo Convenio'}</span>
              <button onClick={() => setIsConvenioModalOpen(false)}><span className="material-symbols-outlined">close</span></button>
            </div>
            <form onSubmit={handleSaveConvenio} className="p-6">
               <div className="space-y-4">
                  <div>
                     <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Empresa Convenida (Seleccione o escriba manualmente)</label>
                     <div className="relative">
                       <input required className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase font-bold pr-10" value={editingConvenio.empresaConvenida || ''} onChange={e => {
                         const val = e.target.value;
                         const matched = empresas.find(em => em.empresa.toUpperCase() === val.toUpperCase() && em.id !== selectedEmpresaId);
                         setEditingConvenio({...editingConvenio, empresaConvenida: val, empresaConvenidaId: matched ? matched.id : undefined});
                       }} placeholder="Ej. OTRAS LÍNEAS S.A." list="empresas-list"/>
                       <datalist id="empresas-list">
                         {empresas.filter(e => e.id !== selectedEmpresaId).map(e => (
                           <option key={e.id} value={e.empresa} />
                         ))}
                       </datalist>
                       {editingConvenio.empresaConvenidaId && (
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center bg-indigo-100 text-indigo-700 text-[9px] px-2 py-0.5 rounded font-black tracking-widest gap-1">
                            <span className="material-symbols-outlined text-[12px]">link</span> SIS
                          </div>
                       )}
                     </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Metros que RECIBE</label>
                      <input type="number" required className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none font-bold text-teal-600" value={editingConvenio.cantidadBarreras || ''} onChange={e => setEditingConvenio({...editingConvenio, cantidadBarreras: Number(e.target.value)})} placeholder="Ej. 1000"/>
                    </div>
                    <div>
                      <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Metros que APORTA</label>
                      <input type="number" className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none font-bold text-indigo-600" value={editingConvenio.cantidadAporta || ''} onChange={e => setEditingConvenio({...editingConvenio, cantidadAporta: Number(e.target.value)})} placeholder="Opcional. Ej. 500"/>
                    </div>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Fecha de Vencimiento del Convenio</label>
                    <input type="date" required className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none" value={editingConvenio.fechaVencimiento || ''} onChange={e => setEditingConvenio({...editingConvenio, fechaVencimiento: e.target.value})}/>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <input type="checkbox" id="renovacionAutomatica" checked={editingConvenio.renovacionAutomatica || false} onChange={e => setEditingConvenio({...editingConvenio, renovacionAutomatica: e.target.checked})} className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500" />
                    <label htmlFor="renovacionAutomatica" className="text-[10px] font-black uppercase text-slate-500 cursor-pointer">
                      Renovación Automática / Prórroga Tácita
                    </label>
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Observaciones / Tipo de Acuerdo (Opcional)</label>
                    <textarea className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none min-h-[80px]" value={editingConvenio.observaciones || ''} onChange={e => setEditingConvenio({...editingConvenio, observaciones: e.target.value})} placeholder="Detalles o alcance del convenio..."/>
                  </div>
               </div>
               <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
                  <button type="button" onClick={() => setIsConvenioModalOpen(false)} className="px-4 py-2 font-black uppercase text-xs text-slate-600 hover:bg-slate-100 rounded">Cancelar</button>
                  <button type="submit" className="px-4 py-2 font-black uppercase text-xs bg-indigo-600 text-white rounded hover:bg-indigo-700 shadow-sm flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">save</span> Guardar Convenio</button>
               </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};
