import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { db } from '../firebase';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { PlanEmergencia } from '../types';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
// @ts-ignore
import shpwrite from 'shp-write';

// Fix for default marker icons in React-Leaflet
import icon from 'leaflet/dist/images/marker-icon.png';
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

// Helper to parse coordinates
const parseCoordinates = (coordStr?: string): [number, number] | null => {
  if (!coordStr) return null;

  let cleanStr = coordStr.toUpperCase().trim();
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
            return [lng, lat];
         }
         return [lat, lng];
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
       }
       
       return [lat, lng];
    }
  }

  return null;
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
  const [planes, setPlanes] = useState<(PlanEmergencia & { lat: number, lng: number })[]>([]);

  useEffect(() => {
    const q = query(collection(db, 'planes'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PlanEmergencia));
      
      const mappedPlanes = docs.map(p => {
        const coords = parseCoordinates(p.coordenadas);
        if (coords) {
          return { ...p, lat: coords[0], lng: coords[1] };
        }
        return null;
      }).filter(Boolean) as (PlanEmergencia & { lat: number, lng: number })[];
      
      setPlanes(mappedPlanes);
    });
    return () => unsubscribe();
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

        <div className="flex-1 relative z-0">
          <MapContainer 
            center={[-34.6037, -58.3816]} // Buenos Aires default
            zoom={5} 
            className="h-full w-full"
          >
            <TileLayer
              attribution='&copy; <a href="https://www.ign.gob.ar/">Instituto Geográfico Nacional de la República Argentina</a>'
              url="https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/{z}/{x}/{-y}.png"
            />
            {planes.map(p => (
              <Marker key={p.id} position={[p.lat, p.lng]} icon={getMarkerIcon(p.anexo)}>
                <Popup className="custom-popup">
                  <div className="p-1">
                    <h3 className="font-black text-slate-800 uppercase text-xs mb-2 border-b pb-1">{p.empresa}</h3>
                    <div className="space-y-1 text-[10px] text-slate-600 mb-3">
                      <p><span className="font-bold uppercase">Anexo:</span> {p.anexo.replace('_', ' ').toUpperCase()}</p>
                      <p><span className="font-bold uppercase">Nº Plan:</span> {p.numeroPlan || 'S/D'}</p>
                      <p><span className="font-bold uppercase">Disposición:</span> {p.disposicion || 'S/D'}</p>
                      <p><span className="font-bold uppercase">Vencimiento:</span> {formatDate(p.vencimiento)}</p>
                      <p><span className="font-bold uppercase">Dependencia:</span> {p.dependencia || 'S/D'}</p>
                    </div>
                    <button 
                      onClick={() => navigate('/planes', { state: { openPlanId: p.id } })}
                      className="w-full bg-primary text-white text-[10px] font-black uppercase py-1.5 rounded hover:bg-blue-600 transition-colors"
                    >
                      Ver Perfil Completo
                    </button>
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
