import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { db } from '../firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { PlanEmergencia, EmpresaControlDerrame } from '../types';
import { MapContainer, TileLayer, Marker, Popup, LayersControl, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
// @ts-ignore
import shpwrite from 'shp-write';

// Component to handle auto-zoom
const ZoomToMarkers: React.FC<{ planes: any[], osros: any[] }> = ({ planes, osros }) => {
  const map = useMap();
  useEffect(() => {
    if (planes.length === 0 && osros.length === 0) return;
    
    const bounds = L.latLngBounds([]);
    planes.forEach(p => bounds.extend([p.lat, p.lng]));
    osros.forEach(o => bounds.extend([o.lat, o.lng]));
    
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [planes.length, osros.length, map]);
  return null;
};

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

const getMarkerIcon = (anexo: string) => {
  let color = '#3b82f6'; // default blue
  switch (anexo) {
    case 'anexo_15': color = '#8b5cf6'; break; // purple
    case 'anexo_16': color = '#ef4444'; break; // red
    case 'anexo_17': color = '#f97316'; break; // orange
    case 'anexo_18': color = '#eab308'; break; // yellow
    case 'anexo_19': color = '#22c55e'; break; // green
    case 'anexo_20': color = '#06b6d4'; break; // cyan
  }

  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: ${color}; width: 20px; height: 20px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.3);"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
    popupAnchor: [0, -10]
  });
};

const getOsroIcon = () => {
  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: #0f172a; width: 22px; height: 22px; border-radius: 4px; border: 2px solid #334155; box-shadow: 0 2px 5px rgba(0,0,0,0.5); display: flex; items-center; justify-center; color: white;"><span class="material-symbols-outlined" style="font-size: 14px;">warehouse</span></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -11]
  });
};

// Helper to parse coordinates
const parseCoordinates = (coordStr?: string): [number, number][] => {
  if (!coordStr) return [];

  const results: [number, number][] = [];
  const parts = coordStr.split(/[;|\n]/).map(p => p.trim()).filter(Boolean);

  for (const part of parts) {
    let cleanStr = part.toUpperCase();
    // Remove common words that might interfere (like N in LONGITUD)
    cleanStr = cleanStr.replace(/LATITUD[E]?|LONGITUD[E]?|LAT|LNG|LON/g, '');
    // Normalize quotes
    cleanStr = cleanStr.replace(/[´’`]/g, "'").replace(/[”]/g, '"').replace(/''/g, '"');

    // 1. Try pure Decimal Degrees with comma or dot (e.g., "-34.1234, -58.1234" or "-34,1234; -58,1234")
    // It must not contain N, S, E, W, O
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
           if (lat < -55 && lng > -55 && lng < 0) {
              // Likely swapped Argentina (e.g. -58, -34)
              results.push([lng, lat]);
              continue;
           }
           results.push([lat, lng]);
           continue;
        }
      }
    }

    // 2. Tokenize for DMS / DMM
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
         } else if (lat < -55 && lng > -55 && lng < 0) {
            // Likely swapped Argentina coordinates (e.g. Lat: -58, Lng: -34)
            const temp = lat; lat = lng; lng = temp;
         }
         
         results.push([lat, lng]);
         continue;
      }
    }
  }

  return results;
};

const formatDate = (dateStr?: string) => {
  if (!dateStr || dateStr === '-' || dateStr.length < 5) return dateStr || 'S/D';
  let d = new Date(dateStr);
  if (isNaN(d.getTime())) {
     const parts = dateStr.split('/');
     if(parts.length === 3) d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
  }
  if (isNaN(d.getTime())) return dateStr;
  const userTimezoneOffset = d.getTimezoneOffset() * 60000;
  const adjustedDate = new Date(d.getTime() + userTimezoneOffset);
  const day = adjustedDate.getDate().toString().padStart(2, '0');
  const month = (adjustedDate.getMonth() + 1).toString().padStart(2, '0');
  const year = adjustedDate.getFullYear();
  return `${day}/${month}/${year}`;
};

export const Mapa: React.FC = () => {
  const navigate = useNavigate();
  const [planes, setPlanes] = useState<(PlanEmergencia & { lat: number, lng: number, originalId: string })[]>([]);
  const [osros, setOsros] = useState<(any)[]>([]);

  useEffect(() => {
    // Suscripción a Planes
    const qPlanes = query(collection(db, 'planes'));
    const unsubscribePlanes = onSnapshot(qPlanes, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PlanEmergencia));
      
      const mappedPlanes = docs.flatMap(p => {
        const coordsArray = parseCoordinates(p.coordenadas);
        if (coordsArray && coordsArray.length > 0) {
          return coordsArray.map((coords, index) => ({
            ...p,
            id: `${p.id}_${index}`,
            originalId: p.id,
            lat: coords[0],
            lng: coords[1]
          }));
        }
        return [];
      });
      setPlanes(mappedPlanes as any);
    });

    // Suscripción a Empresas de Control de Derrames
    const qOsros = query(collection(db, 'empresas_derrames'));
    const unsubscribeOsros = onSnapshot(qOsros, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as EmpresaControlDerrame));
      
      const mappedOsros = docs.flatMap(o => {
        return (o.basesOperativas || []).flatMap(base => {
          const coordsArray = parseCoordinates(base.coordenadas);
          return coordsArray.map((coords, index) => ({
            ...base,
            id: `${o.id}_${base.id}_${index}`,
            empresa: o.empresa,
            empresaId: o.id,
            logoUrl: o.logoUrl,
            categoria: o.categoria,
            lat: coords[0],
            lng: coords[1]
          }));
        });
      });
      setOsros(mappedOsros);
    });

    return () => {
      unsubscribePlanes();
      unsubscribeOsros();
    };
  }, []);

  const handleExportKML = () => {
    const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Planes de Emergencia</name>
    ${planes.map(p => `
    <Placemark>
      <name><![CDATA[${p.empresa}]]></name>
      <description><![CDATA[
        <b>Anexo:</b> ${p.anexo.replace('_', ' ').toUpperCase()}<br/>
        <b>Disposición:</b> ${p.disposicion || 'S/D'}<br/>
        <b>Vencimiento:</b> ${formatDate(p.vencimiento)}<br/>
        <b>Nº Plan:</b> ${p.numeroPlan || 'S/D'}<br/>
        <b>Dependencia:</b> ${p.dependencia || 'S/D'}
      ]]></description>
      <Point>
        <coordinates>${p.lng},${p.lat},0</coordinates>
      </Point>
    </Placemark>
    `).join('')}
  </Document>
</kml>`;

    const blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'planes_emergencia.kml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportShapefile = () => {
    const geojson = {
      type: "FeatureCollection",
      features: planes.map(p => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [p.lng, p.lat]
        },
        properties: {
          empresa: p.empresa,
          anexo: p.anexo,
          dispo: p.disposicion || 'S/D',
          vence: formatDate(p.vencimiento),
          nro_plan: p.numeroPlan || 'S/D',
          depend: p.dependencia || 'S/D'
        }
      }))
    };

    const options = {
      folder: 'planes_emergencia',
      types: {
        point: 'planes',
      }
    };

    shpwrite.download(geojson, options);
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900">
      <Sidebar />
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-8 py-5 flex justify-between items-center shrink-0 z-10">
          <div>
            <h1 className="text-2xl font-black text-slate-800 dark:text-white tracking-tight">SIG - Mapa de Planes</h1>
            <p className="text-sm font-bold text-slate-500 mt-1 uppercase tracking-widest">
              Visualización Geográfica de Planes de Emergencia
            </p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={handleExportKML}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-colors shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">public</span>
              Exportar KML
            </button>
            <button 
              onClick={handleExportShapefile}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-colors shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px]">layers</span>
              Exportar Shapefile
            </button>
          </div>
        </header>

        <div className="flex-1 relative z-0 bg-slate-100">
          <MapContainer 
            center={[-34.6037, -58.3816]} // Buenos Aires default
            zoom={5} 
            className="h-full w-full"
            style={{ background: '#f1f5f9' }}
          >
            <LayersControl position="topright">
              <LayersControl.BaseLayer checked name="IGN Argenmap (Oficial)">
                <TileLayer
                  attribution='&copy; <a href="https://www.ign.gob.ar/">Instituto Geográfico Nacional</a>'
                  url="https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/{z}/{x}/{-y}.png"
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="OpenStreetMap">
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
              </LayersControl.BaseLayer>
              <LayersControl.BaseLayer name="Satélite (ESRI)">
                <TileLayer
                  attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                  url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                />
              </LayersControl.BaseLayer>
            </LayersControl>

            <ZoomToMarkers planes={planes} osros={osros} />

            {planes.map(p => (
              <Marker key={p.id} position={[p.lat, p.lng]} icon={getMarkerIcon(p.anexo)}>
                <Popup className="custom-popup">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 p-3 border-b border-slate-200 bg-white">
                      <div className="w-6 h-6 shrink-0 bg-blue-100 rounded flex items-center justify-center text-blue-600">
                        <span className="material-symbols-outlined text-[14px]">corporate_fare</span>
                      </div>
                      <h3 className="font-black text-slate-800 uppercase text-sm leading-tight truncate">{p.empresa}</h3>
                    </div>
                    
                    {p.logoUrl ? (
                      <div className="w-full h-32 bg-white flex items-center justify-center overflow-hidden border-b border-slate-200 p-2">
                        <img src={p.logoUrl} alt="Logo" className="w-full h-full object-contain" />
                      </div>
                    ) : (
                      <div className="w-full h-24 bg-slate-100 flex flex-col items-center justify-center border-b border-slate-200 text-slate-400">
                        <span className="material-symbols-outlined text-4xl mb-1">image_not_supported</span>
                        <span className="text-[9px] font-bold uppercase">Sin imagen</span>
                      </div>
                    )}

                    <div className="p-3 bg-white">
                      <div className="space-y-1.5 text-[10px] text-slate-600 mb-3">
                        <p className="flex justify-between"><span className="font-bold uppercase text-slate-400">Anexo:</span> <span className="font-bold text-slate-700">{p.anexo.replace('_', ' ').toUpperCase()}</span></p>
                        <p className="flex justify-between"><span className="font-bold uppercase text-slate-400">Nº Plan:</span> <span className="font-bold text-slate-700">{p.numeroPlan || 'S/D'}</span></p>
                        <p className="flex justify-between"><span className="font-bold uppercase text-slate-400">Vencimiento:</span> <span className="font-bold text-slate-700">{formatDate(p.vencimiento)}</span></p>
                      </div>
                      <button 
                        onClick={() => navigate('/planes', { state: { openPlanId: p.originalId } })}
                        className="w-full bg-primary text-white text-[10px] font-black uppercase py-2 rounded hover:bg-blue-600 transition-colors flex items-center justify-center gap-1 shadow-sm"
                      >
                        <span className="material-symbols-outlined text-[14px]">visibility</span>
                        Ver Perfil
                      </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {osros.map(o => (
              <Marker key={o.id} position={[o.lat, o.lng]} icon={getOsroIcon()}>
                <Popup className="custom-popup">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 p-3 border-b border-slate-200 bg-slate-900 text-white">
                      <div className="w-6 h-6 shrink-0 bg-slate-800 rounded flex items-center justify-center text-white">
                        <span className="material-symbols-outlined text-[14px]">warehouse</span>
                      </div>
                      <div className="overflow-hidden">
                        <h3 className="font-black uppercase text-[10px] leading-tight truncate">{o.nombre}</h3>
                        <p className="text-[8px] font-bold text-slate-400 tracking-widest uppercase">{o.empresa}</p>
                      </div>
                    </div>

                    <div className="p-3 bg-white">
                       <p className="text-[9px] font-black uppercase text-slate-400 mb-2 border-b pb-1">Equipamiento en Base</p>
                       <div className="space-y-1.5 text-[10px] text-slate-800 mb-4">
                         {(Number(o.cantidadBarreras) > 0 || Number(o.barrerasPuerto) > 0 || Number(o.barrerasFluvial) > 0 || Number(o.barrerasMaritima) > 0) && (
                           <div className="bg-blue-50 p-2 rounded border border-blue-100">
                             <p className="font-black text-blue-600 mb-1 flex items-center gap-1"><span className="material-symbols-outlined text-[14px]">waves</span> BARRERAS:</p>
                             <div className="grid grid-cols-2 gap-1 text-[9px] font-bold pl-4">
                               {Number(o.barrerasPuerto) > 0 && <p className="text-slate-500 uppercase">PUERTO: <span className="text-slate-800">{o.barrerasPuerto}m</span></p>}
                               {Number(o.barrerasFluvial) > 0 && <p className="text-slate-500 uppercase">FLUV/LAC: <span className="text-slate-800">{o.barrerasFluvial}m</span></p>}
                               {Number(o.barrerasMaritima) > 0 && <p className="text-slate-500 uppercase">MARIT.: <span className="text-slate-800">{o.barrerasMaritima}m</span></p>}
                               <p className="col-span-2 text-blue-700 border-t mt-1 pt-1">TOTAL: {o.cantidadBarreras || 0}m</p>
                             </div>
                           </div>
                         )}
                         {Number(o.skimmers) > 0 && <p className="flex justify-between"><span className="font-bold uppercase text-slate-400">Skimmers:</span> <span className="font-bold text-slate-700">{o.skimmers}</span></p>}
                         {Number(o.embarcaciones) > 0 && <p className="flex justify-between"><span className="font-bold uppercase text-slate-400">Embarcaciones:</span> <span className="font-bold text-slate-700">{o.embarcaciones}</span></p>}
                         {Number(o.metrosAbsorbentes) > 0 && <p className="flex justify-between"><span className="font-bold uppercase text-slate-400">Absorbentes:</span> <span className="font-bold text-slate-700">{o.metrosAbsorbentes}m</span></p>}
                       </div>

                       <button 
                         onClick={() => navigate('/derrames', { state: { openEmpresaId: o.empresaId } })}
                         className="w-full bg-slate-800 text-white text-[10px] font-black uppercase py-2 rounded hover:bg-slate-900 transition-colors flex items-center justify-center gap-1 shadow-sm"
                       >
                         <span className="material-symbols-outlined text-[14px]">visibility</span>
                         Ver Empresa
                       </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      </main>
    </div>
  );
};
