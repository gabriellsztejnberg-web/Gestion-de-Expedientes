
import React, { useState, useRef } from 'react';
import { Sidebar } from '../components/Sidebar';

// --- DATA SOURCE (SIMULATED JSON) ---
const INITIAL_DATA = {
    "anexo_16": Array.from({length: 15}, (_, i) => ({ "“PLAN DE EMERGENCIA DE EMPRESAS A CARGO DE INSTALACIONES DE MANIPULACIÓN DE HIDROCARBUROS... (SNPP)”": i + 1 })),
    "anexo_17": [
        { "Nº": 1, "DEPEN": "CRIV", "EMPRESAS": "TERMAP S.A (CALETA CORDOVA)", "DISPOSICION": "DIFC-2024-60-APN-DPAM#PNA", "VENC": "2029-09-19", "1º  CONV ANUAL": "2025-09-05", "2º  CONV ANUAL": "2026", "3º  CONV ANUAL": "2027", "4º  CONV ANUAL": "2028" },
        { "Nº": 2, "DEPEN": "OLVA", "EMPRESAS": "TERMAP S.A (CALETA OLIVIA)", "DISPOSICION": "DIFC-2024-57-APN-DPAM#PNA", "VENC": "2029-09-18", "1º  CONV ANUAL": "2025-09-04", "2º  CONV ANUAL": "2026", "3º  CONV ANUAL": "2027", "4º  CONV ANUAL": "2028" },
        { "Nº": 3, "DEPEN": "BBLA", "EMPRESAS": "OILTANKING EBYTEM S.A.", "DISPOSICION": "DI-2021-136-APN-DPAM#PNA", "VENC": "2026-12-02", "1º  CONV ANUAL": "2022-11-16", "2º  CONV ANUAL": "2023-11-14", "3º  CONV ANUAL": "2024-12-17", "4º  CONV ANUAL": "2025-12-04" }
    ],
    "anexo_18": [
        { "Nº": 1, "DEPEND": "SLOR", "NOMBRE DE LA EMPRESA": "ANIBAL MAURICIO GLARDON", "DISP.": "DI-2025-02888183-APN-DPAM#PNA", "VENC": "2029-12-26", "1º CONV": "2026", "2º CONV": "2027", "3º CONV": "2028", "4º CONV": "2029" },
        { "Nº": 2, "DEPEND": "CABA", "NOMBRE DE LA EMPRESA": "ANTARES NAVIERA S.A.", "DISP.": "DI-2022-31-APN-DPAM#PNA", "VENC": "2027-04-12", "1º CONV": "2023-05-02", "2º CONV": "2024-05-10", "3º CONV": " 16/04/2025", "4º CONV": "2026-05-10" },
        { "Nº": 3, "DEPEND": "CABA", "NOMBRE DE LA EMPRESA": "BAHIA GRANDE S.A", "DISP.": "DISFC-2023-3-APN-DPAM#PNA", "VENC": "2027-12-29", "1º CONV": "2023-12-28", "2º CONV": "2024-12-13", "3º CONV": "2025-12-12", "4º CONV": "2026-12-28" },
        { "Nº": 4, "DEPEND": "CABA", "NOMBRE DE LA EMPRESA": "COMERCIAL DELTA S.A ", "DISP.": "DI-2024-76-APN-DPAM#PNA", "VENC": "2029-11-04", "1º CONV": "2026-02-13", "2º CONV": "2026", "3º CONV": "2027", "4º CONV": "2028" },
        { "Nº": 5, "DEPEND": "CABA", "NOMBRE DE LA EMPRESA": "COMPAÑÍA NAVIERA ARGENTINA S.A.", "DISP.": "DISFC-2025-30-APN-DPAM#PNA", "VENC": "2030-05-15", "1º CONV": "2026", "2º CONV": "2027", "3º CONV": "2028", "4º CONV": "2029" },
        { "Nº": 6, "DEPEND": "SNIC", "NOMBRE DE LA EMPRESA": "ECO PARANA  S.R.L", "DISP.": "DI-2022-81208296-APN-DPAM#PNA", "VENC": "2027-07-22", "1º CONV": "2023", "2º CONV": "2024", "3º CONV": "2025", "4º CONV": "2026" },
        { "Nº": 7, "DEPEND": "CABA", "NOMBRE DE LA EMPRESA": "EMPRESA NAVIERA PETROLERA ATLANTICA S.A (ENPASA)", "DISP.": "DI-2021-37-APN-DPAM#PNA", "VENC": "2026-04-07", "1º CONV": "2022-05-04", "2º CONV": "2023-05-31", "3º CONV": "2024-06-11", "4º CONV": "2025-07-03" }
    ],
    "anexo_19": Array.from({length: 15}, (_, i) => ({ "PLANES DE EMERGENCIA POR PARTE DE EMPRESAS A CARGO DE PUERTOS": i + 1 })),
    "anexo_20": [
        { "Nº": 1, "DEPEN": "RGAL", "EMPRESAS": "PETROLERA SANTA MARIA S.A. ", "DISPOSICION": "DI-2021-86-APN-DPAM#PNA", "HASTA": "2026-08-24", "1º INSP. ANUAL": "2022-10-12", "2º INSP. ANUAL": "11/10/2023", "3º INSP. ANUAL": "2024-11-06", "4º INSP. ANUAL": "2025-11-07" },
        { "Nº": 2, "DEPEN": "CRIV", "EMPRESAS": "TOTAL AUSTRAL S.A.", "DISPOSICION": "DI-2021-132-APN-DPAM#PNA", "HASTA": "2026-11-18", "1º INSP. ANUAL": "2022-12-15", "2º INSP. ANUAL": "2023-11-09", "3º INSP. ANUAL": "2024-10-17", "4º INSP. ANUAL": "2025-11-27" }
    ]
};

// --- TYPES ---
interface NormalizedRecord {
  id: string; // generated
  originalIndex: number;
  nro: number;
  dependencia: string;
  empresa: string;
  disposicion: string;
  vencimiento: string;
  inspecciones: {
    year1: string;
    year2: string;
    year3: string;
    year4: string;
  };
  observaciones?: string;
}

type AnexoKey = 'anexo_16' | 'anexo_17' | 'anexo_18' | 'anexo_19' | 'anexo_20';

export const Planes: React.FC = () => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeTab, setActiveTab] = useState<AnexoKey>('anexo_18');
  const [data, setData] = useState<any>(INITIAL_DATA);
  const [searchTerm, setSearchTerm] = useState('');
  const [jurisdictionFilter, setJurisdictionFilter] = useState('');
  
  // Modal de Edición
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<{recordId: string, field: string, value: string} | null>(null);

  // --- HELPERS DE NORMALIZACIÓN ---
  const normalizeData = (anexo: AnexoKey): NormalizedRecord[] => {
    const rawList = data[anexo] || [];
    if (anexo === 'anexo_16' || anexo === 'anexo_19') return []; // Listados simples

    return rawList.map((item: any, idx: number) => {
      // Mapeo flexible según las claves variables del JSON
      return {
        id: `${anexo}-${idx}`,
        originalIndex: idx,
        nro: item["Nº"] || idx + 1,
        dependencia: item["DEPEN"] || item["DEPEND"] || "S/D",
        empresa: item["EMPRESAS"] || item["NOMBRE DE LA EMPRESA"] || "SIN NOMBRE",
        disposicion: item["DISPOSICION"] || item["DISP."] || "-",
        vencimiento: item["VENC"] || item["HASTA"] || "-",
        inspecciones: {
          year1: item["1º  CONV ANUAL"] || item["1º CONV"] || item["1º INSP. ANUAL"] || "-",
          year2: item["2º  CONV ANUAL"] || item["2º CONV"] || item["2º INSP. ANUAL"] || "-",
          year3: item["3º  CONV ANUAL"] || item["3º CONV"] || item["3º INSP. ANUAL"] || "-",
          year4: item["4º  CONV ANUAL"] || item["4º CONV"] || item["4º INSP. ANUAL"] || "-"
        },
        observaciones: item["OBSERVACIONES"]
      };
    });
  };

  const getStatusColor = (dateStr: string) => {
    if (!dateStr || dateStr.length < 5) return 'bg-slate-100 text-slate-400';
    
    // Intento de parseo de fechas (puede venir como YYYY-MM-DD o DD/MM/YYYY)
    let d = new Date(dateStr);
    if (isNaN(d.getTime())) {
       // Intentar formato DD/MM/YYYY
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

  const handleEditClick = (record: NormalizedRecord, fieldKey: string, currentValue: string) => {
      setEditingItem({
          recordId: record.id,
          field: fieldKey, 
          value: currentValue
      });
      setIsEditModalOpen(true);
  };

  const saveEdit = () => {
      if (!editingItem) return;

      // Actualizar el estado local (Deep Clone simulado)
      const newData = JSON.parse(JSON.stringify(data));
      const rawList = newData[activeTab];
      const index = parseInt(editingItem.recordId.split('-')[1]);
      
      if (rawList[index]) {
          const rawItem = rawList[index];
          let targetKey = "";

          // Lógica Heurística Inversa para encontrar la clave correcta en el JSON sucio
          if (editingItem.field === 'dependencia') targetKey = rawItem["DEPEN"] !== undefined ? "DEPEN" : "DEPEND";
          else if (editingItem.field === 'empresa') targetKey = rawItem["EMPRESAS"] !== undefined ? "EMPRESAS" : "NOMBRE DE LA EMPRESA";
          else if (editingItem.field === 'disposicion') targetKey = rawItem["DISPOSICION"] !== undefined ? "DISPOSICION" : "DISP.";
          else if (editingItem.field === 'vencimiento') targetKey = rawItem["VENC"] !== undefined ? "VENC" : "HASTA";
          else if (editingItem.field === 'inspecciones.year1') targetKey = rawItem["1º CONV"] !== undefined ? "1º CONV" : (rawItem["1º  CONV ANUAL"] !== undefined ? "1º  CONV ANUAL" : "1º INSP. ANUAL");
          else if (editingItem.field === 'inspecciones.year2') targetKey = rawItem["2º CONV"] !== undefined ? "2º CONV" : (rawItem["2º  CONV ANUAL"] !== undefined ? "2º  CONV ANUAL" : "2º INSP. ANUAL");
          else if (editingItem.field === 'inspecciones.year3') targetKey = rawItem["3º CONV"] !== undefined ? "3º CONV" : (rawItem["3º  CONV ANUAL"] !== undefined ? "3º  CONV ANUAL" : "3º INSP. ANUAL");
          else if (editingItem.field === 'inspecciones.year4') targetKey = rawItem["4º CONV"] !== undefined ? "4º CONV" : (rawItem["4º  CONV ANUAL"] !== undefined ? "4º  CONV ANUAL" : "4º INSP. ANUAL");

          // Si no existe la key (ej: nuevo registro), asignamos una por defecto basada en el Anexo
          if (!targetKey) {
             if (activeTab === 'anexo_17') {
                if (editingItem.field === 'empresa') targetKey = 'EMPRESAS';
                if (editingItem.field === 'dependencia') targetKey = 'DEPEN';
                if (editingItem.field === 'disposicion') targetKey = 'DISPOSICION';
                if (editingItem.field === 'vencimiento') targetKey = 'VENC';
             } else if (activeTab === 'anexo_18') {
                if (editingItem.field === 'empresa') targetKey = 'NOMBRE DE LA EMPRESA';
                if (editingItem.field === 'dependencia') targetKey = 'DEPEND';
                if (editingItem.field === 'disposicion') targetKey = 'DISP.';
                if (editingItem.field === 'vencimiento') targetKey = 'VENC';
             } else {
                if (editingItem.field === 'empresa') targetKey = 'EMPRESAS';
                if (editingItem.field === 'dependencia') targetKey = 'DEPEN';
                if (editingItem.field === 'disposicion') targetKey = 'DISPOSICION';
                if (editingItem.field === 'vencimiento') targetKey = 'HASTA';
             }
          }

          if (targetKey) {
              rawList[index][targetKey] = editingItem.value;
              setData(newData);
          }
      }
      setIsEditModalOpen(false);
      setEditingItem(null);
  };

  const handleDeleteRow = (idx: number) => {
      if(!confirm("¿Eliminar esta fila y sus datos asociados?")) return;
      const newData = JSON.parse(JSON.stringify(data));
      newData[activeTab].splice(idx, 1);
      setData(newData);
  };

  const handleAddRow = () => {
      const newData = JSON.parse(JSON.stringify(data));
      // Template vacío según anexo
      let newRow = {};
      if (activeTab === 'anexo_17') {
         newRow = { "Nº": newData[activeTab].length + 1, "DEPEN": "NUEVO", "EMPRESAS": "NUEVA EMPRESA", "DISPOSICION": "-", "VENC": "-", "1º  CONV ANUAL": "-", "2º  CONV ANUAL": "-", "3º  CONV ANUAL": "-", "4º  CONV ANUAL": "-" };
      } else if (activeTab === 'anexo_18') {
         newRow = { "Nº": newData[activeTab].length + 1, "DEPEND": "NUEVO", "NOMBRE DE LA EMPRESA": "NUEVA EMPRESA", "DISP.": "-", "VENC": "-", "1º CONV": "-", "2º CONV": "-", "3º CONV": "-", "4º CONV": "-" };
      } else {
         newRow = { "Nº": newData[activeTab].length + 1, "DEPEN": "NUEVO", "EMPRESAS": "NUEVA EMPRESA", "DISPOSICION": "-", "HASTA": "-", "1º INSP. ANUAL": "-", "2º INSP. ANUAL": "-", "3º INSP. ANUAL": "-", "4º INSP. ANUAL": "-" };
      }
      newData[activeTab].push(newRow);
      setData(newData);
  };

  // --- CSV IMPORT LOGIC ---
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (evt) => {
          const text = evt.target?.result as string;
          if (!text) return;
          
          try {
             // Simple CSV Parser
             const lines = text.split('\n').filter(l => l.trim() !== '');
             const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
             
             const newRows = lines.slice(1).map((line, idx) => {
                 // Split por comas pero ignorando comas dentro de comillas (regex básica)
                 const values = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || [];
                 const cleanValues = values.map(v => v.replace(/^"|"$/g, '').trim());
                 
                 const rowObj: any = {};
                 headers.forEach((h, i) => {
                     rowObj[h] = cleanValues[i] || "";
                 });
                 // Asegurar ID o Nº
                 if(!rowObj["Nº"]) rowObj["Nº"] = idx + 1;
                 
                 return rowObj;
             });

             const newData = JSON.parse(JSON.stringify(data));
             newData[activeTab] = newRows;
             setData(newData);
             alert(`Carga Masiva Exitosa: Se importaron ${newRows.length} registros en ${activeTab.toUpperCase()}.`);

          } catch (err) {
              alert("Error al procesar el archivo CSV. Asegúrese de que el formato sea correcto (separado por comas).");
              console.error(err);
          }
      };
      reader.readAsText(file);
      // Reset input
      e.target.value = '';
  };

  const downloadTemplate = () => {
      const records = normalizeData(activeTab);
      if(records.length === 0) return alert("No hay datos para generar plantilla.");
      
      // Get raw keys from first item of current tab data to ensure structure
      const rawFirstItem = data[activeTab][0];
      const headers = Object.keys(rawFirstItem).join(',');
      
      const csvContent = "data:text/csv;charset=utf-8," + headers + "\n";
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `plantilla_${activeTab}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  // --- RENDER LOGIC ---
  const records = normalizeData(activeTab);
  const isSimpleList = activeTab === 'anexo_16' || activeTab === 'anexo_19';

  // Filtros
  const filteredRecords = records.filter(r => {
      const matchSearch = r.empresa.toLowerCase().includes(searchTerm.toLowerCase());
      const matchJur = jurisdictionFilter ? r.dependencia === jurisdictionFilter : true;
      return matchSearch && matchJur;
  });

  // Estadísticas
  const totalEmpresas = records.length;
  const vencidos = records.filter(r => getStatusColor(r.vencimiento).includes('red')).length;
  const porVencer = records.filter(r => getStatusColor(r.vencimiento).includes('yellow')).length;

  // Jurisdicciones únicas para el filtro
  const uniqueJur = Array.from(new Set(records.map(r => r.dependencia))).sort();

  return (
    <div className="flex h-screen w-full bg-background-light dark:bg-background-dark overflow-hidden font-display">
      <Sidebar activePage="planes" />
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <main className="flex-1 flex flex-col p-6 overflow-hidden">
            
            <div className="flex justify-between items-center mb-6 shrink-0">
                <div>
                    <h1 className="text-slate-900 dark:text-white text-2xl font-black uppercase tracking-tight">Seguimiento de Planes</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-widest text-primary italic">Control de Vencimientos y Convalidaciones</p>
                </div>
                {!isSimpleList && (
                    <div className="flex gap-2">
                        <input type="file" accept=".csv" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
                        <button onClick={() => downloadTemplate()} className="bg-slate-200 text-slate-700 px-3 py-2 rounded flex items-center gap-2 hover:bg-slate-300 transition-colors text-xs font-black uppercase">
                           <span className="material-symbols-outlined text-[16px]">download</span> Plantilla
                        </button>
                        <button onClick={() => fileInputRef.current?.click()} className="bg-slate-800 text-white px-3 py-2 rounded flex items-center gap-2 hover:bg-slate-700 transition-colors text-xs font-black uppercase shadow-lg">
                           <span className="material-symbols-outlined text-[16px]">upload_file</span> Carga Masiva (CSV)
                        </button>
                    </div>
                )}
            </div>

            {/* TABS NAVEGACIÓN */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 mb-6 overflow-x-auto no-scrollbar gap-1">
                {[
                    {id: 'anexo_16', label: 'ANEXO 16 (Ref)'},
                    {id: 'anexo_17', label: 'ANEXO 17 (Termap/Oil)'},
                    {id: 'anexo_18', label: 'ANEXO 18 (Buques/Barcazas)'},
                    {id: 'anexo_19', label: 'ANEXO 19 (Puertos Ref)'},
                    {id: 'anexo_20', label: 'ANEXO 20 (Plataformas)'},
                ].map(tab => (
                    <button 
                        key={tab.id} 
                        onClick={() => setActiveTab(tab.id as AnexoKey)}
                        className={`px-4 py-3 text-[10px] font-black uppercase tracking-widest whitespace-nowrap border-b-2 transition-colors ${activeTab === tab.id ? 'border-primary text-primary bg-primary/5' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {!isSimpleList && (
                <>
                    {/* KPI CARDS */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 shrink-0">
                        <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-[10px] text-slate-400 font-bold uppercase">Total Empresas</p>
                                <h3 className="text-3xl font-black text-slate-900 dark:text-white">{totalEmpresas}</h3>
                            </div>
                            <span className="material-symbols-outlined text-4xl text-slate-200 dark:text-slate-700">domain</span>
                        </div>
                        <div className="bg-red-50 dark:bg-red-900/20 p-4 rounded-xl border border-red-100 dark:border-red-900/50 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-[10px] text-red-400 font-bold uppercase">Planes Vencidos</p>
                                <h3 className="text-3xl font-black text-red-600 dark:text-red-400">{vencidos}</h3>
                            </div>
                            <span className="material-symbols-outlined text-4xl text-red-200 dark:text-red-800">event_busy</span>
                        </div>
                        <div className="bg-yellow-50 dark:bg-yellow-900/20 p-4 rounded-xl border border-yellow-100 dark:border-yellow-900/50 shadow-sm flex items-center justify-between">
                            <div>
                                <p className="text-[10px] text-yellow-500 font-bold uppercase">Por Vencer (90d)</p>
                                <h3 className="text-3xl font-black text-yellow-600 dark:text-yellow-400">{porVencer}</h3>
                            </div>
                            <span className="material-symbols-outlined text-4xl text-yellow-200 dark:text-yellow-800">warning</span>
                        </div>
                    </div>

                    {/* FILTROS */}
                    <div className="bg-white dark:bg-slate-900 rounded-lg p-3 border border-slate-200 dark:border-slate-800 mb-6 shrink-0 shadow-sm flex gap-3">
                        <div className="relative flex-1 flex items-center">
                            <span className="absolute left-3 text-slate-400 material-symbols-outlined text-[20px]">search</span>
                            <input className="w-full pl-10 pr-4 py-2 text-sm bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 outline-none focus:ring-1 focus:ring-primary uppercase" placeholder="Buscar Empresa..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)}/>
                        </div>
                        <select className="w-48 px-3 py-2 text-xs font-bold uppercase bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded outline-none" value={jurisdictionFilter} onChange={e => setJurisdictionFilter(e.target.value)}>
                            <option value="">Todas las Jurisdicciones</option>
                            {uniqueJur.map(j => <option key={j} value={j}>{j}</option>)}
                        </select>
                        <button onClick={handleAddRow} className="bg-green-600 text-white px-4 py-2 rounded flex items-center gap-2 hover:bg-green-700 transition-colors text-xs font-black uppercase shadow-lg">
                           <span className="material-symbols-outlined text-[18px]">add</span> Nuevo
                        </button>
                    </div>

                    {/* TABLA INTELIGENTE */}
                    <div className="flex-1 overflow-auto bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10 shadow-sm">
                                <tr className="border-b border-slate-200 dark:border-slate-700">
                                    <th className="px-2 py-3 font-black uppercase text-slate-500 w-8 text-center">#</th>
                                    <th className="px-3 py-3 font-black uppercase text-slate-500 w-20">Juris.</th>
                                    <th className="px-3 py-3 font-black uppercase text-slate-500">Empresa / Razón Social</th>
                                    <th className="px-3 py-3 font-black uppercase text-slate-500 w-40">Disposición</th>
                                    <th className="px-3 py-3 font-black uppercase text-slate-500 w-28 text-center">Vencimiento</th>
                                    <th className="px-1 py-3 font-black uppercase text-slate-400 text-[10px] text-center w-20">1º Insp</th>
                                    <th className="px-1 py-3 font-black uppercase text-slate-400 text-[10px] text-center w-20">2º Insp</th>
                                    <th className="px-1 py-3 font-black uppercase text-slate-400 text-[10px] text-center w-20">3º Insp</th>
                                    <th className="px-1 py-3 font-black uppercase text-slate-400 text-[10px] text-center w-20">4º Insp</th>
                                    <th className="px-1 py-3 font-black uppercase text-slate-500 text-center w-10">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {filteredRecords.map((r) => (
                                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors group">
                                        <td className="px-2 py-3 text-center font-mono text-slate-400">{r.nro}</td>
                                        <td className="px-3 py-3">
                                            <button 
                                                onClick={() => handleEditClick(r, 'dependencia', r.dependencia)}
                                                className="w-full text-left font-bold text-primary hover:underline"
                                            >
                                                {r.dependencia}
                                            </button>
                                        </td>
                                        <td className="px-3 py-3">
                                            <button 
                                                onClick={() => handleEditClick(r, 'empresa', r.empresa)}
                                                className="w-full text-left font-black text-slate-900 dark:text-white uppercase hover:text-primary transition-colors"
                                            >
                                                {r.empresa}
                                            </button>
                                        </td>
                                        <td className="px-3 py-3 text-[10px] font-mono uppercase">
                                            <button 
                                                onClick={() => handleEditClick(r, 'disposicion', r.disposicion)}
                                                className="w-full text-left hover:bg-slate-100 dark:hover:bg-slate-700 px-1 py-0.5 rounded"
                                            >
                                                {r.disposicion}
                                            </button>
                                        </td>
                                        
                                        {/* SEMÁFORO DE VENCIMIENTO */}
                                        <td className="px-3 py-3 text-center">
                                            <button 
                                                onClick={() => handleEditClick(r, 'vencimiento', r.vencimiento)}
                                                className={`px-2 py-1 rounded text-[10px] uppercase border w-full ${getStatusColor(r.vencimiento)} hover:opacity-80 transition-opacity`}
                                            >
                                                {r.vencimiento}
                                            </button>
                                        </td>

                                        {/* CELDAS EDITABLES DE INSPECCIONES */}
                                        {['year1', 'year2', 'year3', 'year4'].map((yKey, i) => (
                                            <td key={i} className="px-1 py-3 text-center">
                                                <button 
                                                    onClick={() => handleEditClick(r, `inspecciones.${yKey}`, (r.inspecciones as any)[yKey])}
                                                    className="w-full py-1 text-[10px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded border border-transparent hover:border-slate-200 transition-all font-mono"
                                                >
                                                    {(r.inspecciones as any)[yKey]}
                                                </button>
                                            </td>
                                        ))}

                                        {/* BOTÓN ELIMINAR */}
                                        <td className="px-1 py-3 text-center">
                                            <button 
                                                onClick={() => handleDeleteRow(r.originalIndex)}
                                                className="text-slate-300 hover:text-red-500 p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                                title="Eliminar Fila"
                                            >
                                                <span className="material-symbols-outlined text-[16px]">delete</span>
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {filteredRecords.length === 0 && <tr><td colSpan={10} className="py-20 text-center text-slate-400 italic">No se encontraron empresas.</td></tr>}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {/* VISTA SIMPLIFICADA PARA ANEXOS 16 Y 19 */}
            {isSimpleList && (
                <div className="flex-1 overflow-auto bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm p-8">
                     <div className="max-w-3xl mx-auto text-center">
                        <span className="material-symbols-outlined text-6xl text-slate-200 dark:text-slate-700 mb-4">list_alt</span>
                        <h3 className="text-xl font-black uppercase text-slate-900 dark:text-white mb-2">Listado de Referencia</h3>
                        <p className="text-slate-500 mb-8">Este anexo contiene {data[activeTab]?.length} registros genéricos numerados.</p>
                        
                        <div className="text-left grid grid-cols-1 md:grid-cols-2 gap-4">
                            {data[activeTab]?.slice(0, 20).map((item: any, i: number) => (
                                <div key={i} className="p-3 border rounded bg-slate-50 dark:bg-slate-800/50 text-xs font-mono">
                                    Item #{item[Object.keys(item)[0]]}
                                </div>
                            ))}
                        </div>
                        <p className="mt-4 text-xs text-slate-400 italic">(Mostrando primeros 20 registros...)</p>
                     </div>
                </div>
            )}
        </main>
      </div>

      {/* MODAL DE EDICIÓN RÁPIDA */}
      {isEditModalOpen && editingItem && (
         <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[70] p-4">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
                   <span className="text-xs font-black uppercase tracking-widest">Editar Campo</span>
                   <button onClick={() => setIsEditModalOpen(false)}><span className="material-symbols-outlined">close</span></button>
                </div>
                <div className="p-6">
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-2">Nuevo Valor</label>
                    <input 
                        className="w-full px-3 py-3 text-lg font-bold border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase text-center" 
                        value={editingItem.value} 
                        onChange={e => setEditingItem({...editingItem, value: e.target.value})}
                        autoFocus
                    />
                    
                    {/* Accesos rápidos para fechas */}
                    {(editingItem.field.includes('vencimiento') || editingItem.field.includes('inspecciones')) && (
                        <div className="flex gap-2 mt-2 justify-center">
                           <button onClick={() => setEditingItem({...editingItem, value: new Date().toISOString().split('T')[0]})} className="text-[10px] bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600">Hoy</button>
                           <button onClick={() => setEditingItem({...editingItem, value: new Date().getFullYear().toString()})} className="text-[10px] bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded hover:bg-slate-200 dark:hover:bg-slate-600">Año Actual</button>
                        </div>
                    )}

                    <button onClick={saveEdit} className="w-full mt-6 py-3 bg-primary text-white text-xs font-black uppercase rounded shadow-lg hover:bg-blue-600">Guardar Cambios</button>
                </div>
            </div>
         </div>
      )}
    </div>
  );
};
