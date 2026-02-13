
import React, { useState, useEffect } from 'react';
import { Sidebar } from '../components/Sidebar';

// --- DATA SOURCE (SIMULATED JSON) ---
const INITIAL_DATA = {
    "anexo_16": Array.from({length: 150}, (_, i) => ({ "“PLAN DE EMERGENCIA DE EMPRESAS A CARGO DE INSTALACIONES DE MANIPULACIÓN DE HIDROCARBUROS... (SNPP)”": i + 1 })),
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
        { "Nº": 7, "DEPEND": "CABA", "NOMBRE DE LA EMPRESA": "EMPRESA NAVIERA PETROLERA ATLANTICA S.A (ENPASA)", "DISP.": "DI-2021-37-APN-DPAM#PNA", "VENC": "2026-04-07", "1º CONV": "2022-05-04", "2º CONV": "2023-05-31", "3º CONV": "2024-06-11", "4º CONV": "2025-07-03" },
        { "Nº": 8, "DEPEND": "ROSA", "NOMBRE DE LA EMPRESA": "GIER SERVICIOS AMBIENTALES S.R.L.", "DISP.": "DI-2021-76-APN-DPAM#PNA", "VENC": "2026-06-25", "1º CONV": "2022-05-30", "2º CONV": "2023", "3º CONV": "2024-05-02", "4º CONV": "2025-11-19" },
        { "Nº": 9, "DEPEND": "BBLA", "NOMBRE DE LA EMPRESA": "HYDRA ARGENTINA S.A", "DISP.": "DI-2021-22-APN-DPAM#PNA", "VENC": "2026-03-01", "1º CONV": "2022", "2º CONV": "2023", "3º CONV": "2024-03-27", "4º CONV": "2025" },
        { "Nº": 10, "DEPEND": "BBLA", "NOMBRE DE LA EMPRESA": "ILDEMAR S.A", "DISP.": "DI-2021-63-APN-DPAM#PNA", "VENC": "2026-06-25", "1º CONV": "2022-06-25", "2º CONV": "2023", "3º CONV": "2024-05-02", "4º CONV": "2025-06-17" },
        { "Nº": 11, "DEPEND": "CABA", "NOMBRE DE LA EMPRESA": "INVERSIONES MARITIMAS UNIVERSALES S.A. (IMUSA)", "DISP.": "DISFC-2025-22-APN-DPAM#PNA", "VENC": "2030-03-25", "1º CONV": "2026", "2º CONV": "2027", "3º CONV": "2028", "4º CONV": "2029" },
        { "Nº": 12, "DEPEND": "CABA", "NOMBRE DE LA EMPRESA": "MARITIMA MARUBA", "DISP.": "DISFC-2022-56-APN-DPAM#PNA", "VENC": "2027-11-01", "1º CONV": "2023-11-09", "2º CONV": "2024-11-28", "3º CONV": "2025", "4º CONV": "2026" },
        { "Nº": 13, "DEPEND": "TIGR", "NOMBRE DE LA EMPRESA": "MARPOR S.A.", "DISP.": "DISFC-2023-21-APN-DPAM#PNA", "VENC": "2028-01-26", "1º CONV": "2024", "2º CONV": "2025", "3º CONV": "2026", "4º CONV": "2027" },
        { "Nº": 14, "DEPEND": "CABA", "NOMBRE DE LA EMPRESA": "NATIONAL SHIPPING S.A.", "DISP.": "DI-2026-14-APN-DPAM#PNA", "VENC": "2031-01-15", "1º CONV": "2027", "2º CONV": "2028", "3º CONV": "2029", "4º CONV": "2030" },
        { "Nº": 15, "DEPEND": "CABA", "NOMBRE DE LA EMPRESA": "NAVIERA CRUZ DEL SUR S.A.", "DISP.": "DI-2025-9-APN-DPAM#PNA", "VENC": "2030-02-03", "1º CONV": "2026-02-10", "2º CONV": "2027", "3º CONV": "2028", "4º CONV": "2029" },
        { "Nº": 16, "DEPEND": "ROSA", "NOMBRE DE LA EMPRESA": "NORMAN HERMANOS S.A.", "DISP.": "DISFC-2023-12-APN-DPAM#PNA", "VENC": "2028-01-20", "1º CONV": "2024-01-19", "2º CONV": "2025-01-17", "3º CONV": "2026", "4º CONV": "2027" },
        { "Nº": 17, "DEPEND": "TIGR", "NOMBRE DE LA EMPRESA": "RIOCOM S.A.", "DISP.": "DI-2022-62-APN-DPAM#PNA", "VENC": "2027-07-19", "1º CONV": "2023", "2º CONV": "2024", "3º CONV": "2025", "4º CONV": "2026" },
        { "Nº": 18, "DEPEND": "CABA", "NOMBRE DE LA EMPRESA": "TRANS-ONA S.A.M.C.I.F.", "DISP.": "DI-2022-11-APN-DPAM#PNA", "VENC": "2027-01-10", "1º CONV": "2023-07-18", "2º CONV": "2024", "3º CONV": "2025", "4º CONV": "2026" },
        { "Nº": 19, "DEPEND": "SLOR", "NOMBRE DE LA EMPRESA": "UABL S.A.", "DISP.": "DISFC-2023-34-APN-DPAM#PNA", "VENC": "2028-03-16", "1º CONV": "2024-03-20", "2º CONV": "2025-03-17", "3º CONV": "2026", "4º CONV": "2027" }
    ],
    "anexo_19": Array.from({length: 72}, (_, i) => ({ "PLANES DE EMERGENCIA POR PARTE DE EMPRESAS A CARGO DE PUERTOS": i + 1 })),
    "anexo_20": [
        { "Nº": 1, "DEPEN": "RGAL", "EMPRESAS": "PETROLERA SANTA MARIA S.A. ", "DISPOSICION": "DI-2021-86-APN-DPAM#PNA", "HASTA": "2026-08-24", "1º INSP. ANUAL": "2022-10-12", "2º INSP. ANUAL": "11/10/2023", "3º INSP. ANUAL": "2024-11-06", "4º INSP. ANUAL": "2025-11-07" },
        { "Nº": 2, "DEPEN": "CRIV", "EMPRESAS": "TOTAL AUSTRAL S.A.", "DISPOSICION": "DI-2021-132-APN-DPAM#PNA", "HASTA": "2026-11-18", "1º INSP. ANUAL": "2022-12-15", "2º INSP. ANUAL": "2023-11-09", "3º INSP. ANUAL": "2024-10-17", "4º INSP. ANUAL": "2025-11-27" }
    ]
};

// --- TYPES ---
interface NormalizedRecord {
  id: string; // generated
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
        nro: item["Nº"] || idx + 1,
        dependencia: item["DEPEN"] || item["DEPEND"] || "S/D",
        empresa: item["EMPRESAS"] || item["NOMBRE DE LA EMPRESA"] || "DESCONOCIDO",
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
          field: fieldKey, // Ej: 'vencimiento' o 'inspecciones.year1'
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
          // Determinar la clave original en el JSON sucio
          const rawItem = rawList[index];
          let targetKey = "";

          // Mapeo inverso sucio pero efectivo para este prototipo
          if (editingItem.field === 'vencimiento') targetKey = rawItem["VENC"] !== undefined ? "VENC" : "HASTA";
          else if (editingItem.field === 'inspecciones.year1') targetKey = rawItem["1º CONV"] !== undefined ? "1º CONV" : (rawItem["1º  CONV ANUAL"] !== undefined ? "1º  CONV ANUAL" : "1º INSP. ANUAL");
          else if (editingItem.field === 'inspecciones.year2') targetKey = rawItem["2º CONV"] !== undefined ? "2º CONV" : (rawItem["2º  CONV ANUAL"] !== undefined ? "2º  CONV ANUAL" : "2º INSP. ANUAL");
          else if (editingItem.field === 'inspecciones.year3') targetKey = rawItem["3º CONV"] !== undefined ? "3º CONV" : (rawItem["3º  CONV ANUAL"] !== undefined ? "3º  CONV ANUAL" : "3º INSP. ANUAL");
          else if (editingItem.field === 'inspecciones.year4') targetKey = rawItem["4º CONV"] !== undefined ? "4º CONV" : (rawItem["4º  CONV ANUAL"] !== undefined ? "4º  CONV ANUAL" : "4º INSP. ANUAL");

          if (targetKey) {
              rawList[index][targetKey] = editingItem.value;
              setData(newData);
          }
      }
      setIsEditModalOpen(false);
      setEditingItem(null);
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
                    </div>

                    {/* TABLA INTELIGENTE */}
                    <div className="flex-1 overflow-auto bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 shadow-sm">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800 z-10 shadow-sm">
                                <tr className="border-b border-slate-200 dark:border-slate-700">
                                    <th className="px-3 py-3 font-black uppercase text-slate-500 w-10 text-center">#</th>
                                    <th className="px-3 py-3 font-black uppercase text-slate-500 w-20">Juris.</th>
                                    <th className="px-3 py-3 font-black uppercase text-slate-500">Empresa / Razón Social</th>
                                    <th className="px-3 py-3 font-black uppercase text-slate-500 w-40">Disposición</th>
                                    <th className="px-3 py-3 font-black uppercase text-slate-500 w-28 text-center">Vencimiento</th>
                                    <th className="px-1 py-3 font-black uppercase text-slate-400 text-[10px] text-center w-24">1º Insp</th>
                                    <th className="px-1 py-3 font-black uppercase text-slate-400 text-[10px] text-center w-24">2º Insp</th>
                                    <th className="px-1 py-3 font-black uppercase text-slate-400 text-[10px] text-center w-24">3º Insp</th>
                                    <th className="px-1 py-3 font-black uppercase text-slate-400 text-[10px] text-center w-24">4º Insp</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {filteredRecords.map((r) => (
                                    <tr key={r.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                        <td className="px-3 py-3 text-center font-mono text-slate-400">{r.nro}</td>
                                        <td className="px-3 py-3 font-bold text-primary">{r.dependencia}</td>
                                        <td className="px-3 py-3 font-black text-slate-900 dark:text-white uppercase">
                                            {r.empresa}
                                            {r.observaciones && <p className="text-[9px] text-slate-400 font-normal italic mt-0.5">{r.observaciones}</p>}
                                        </td>
                                        <td className="px-3 py-3 text-[10px] font-mono uppercase">{r.disposicion}</td>
                                        
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
                                    </tr>
                                ))}
                                {filteredRecords.length === 0 && <tr><td colSpan={9} className="py-20 text-center text-slate-400 italic">No se encontraron empresas.</td></tr>}
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
                   <span className="text-xs font-black uppercase tracking-widest">Actualizar Fecha</span>
                   <button onClick={() => setIsEditModalOpen(false)}><span className="material-symbols-outlined">close</span></button>
                </div>
                <div className="p-6">
                    <label className="block text-[10px] font-black uppercase text-slate-500 mb-2">Nuevo Valor (Fecha o Texto)</label>
                    <input 
                        className="w-full px-3 py-3 text-lg font-bold border rounded dark:bg-slate-800 dark:border-slate-700 outline-none uppercase text-center" 
                        value={editingItem.value} 
                        onChange={e => setEditingItem({...editingItem, value: e.target.value})}
                        autoFocus
                    />
                    <div className="flex gap-2 mt-2 justify-center">
                       <button onClick={() => setEditingItem({...editingItem, value: new Date().toISOString().split('T')[0]})} className="text-[10px] bg-slate-100 px-2 py-1 rounded hover:bg-slate-200">Hoy</button>
                       <button onClick={() => setEditingItem({...editingItem, value: new Date().getFullYear().toString()})} className="text-[10px] bg-slate-100 px-2 py-1 rounded hover:bg-slate-200">Año Actual</button>
                    </div>
                    
                    <button onClick={saveEdit} className="w-full mt-6 py-3 bg-primary text-white text-xs font-black uppercase rounded shadow-lg hover:bg-blue-600">Guardar Cambios</button>
                </div>
            </div>
         </div>
      )}
    </div>
  );
};
