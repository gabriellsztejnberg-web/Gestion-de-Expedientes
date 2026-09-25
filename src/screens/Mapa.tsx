import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Sidebar } from '../components/Sidebar';
import { db } from '../firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { PlanEmergencia, EmpresaControlDerrame, IncidenteDerrame } from '../types';
import { MapContainer, TileLayer, Marker, Popup, LayersControl, Polyline, Tooltip, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
// @ts-ignore
import shpwrite from 'shp-write';

// Component to handle auto-zoom
const ZoomToMarkers: React.FC<{ planes: any[], osros: any[], incidentes: any[], showIncidentes: boolean }> = ({ planes, osros, incidentes, showIncidentes }) => {
  const map = useMap();
  useEffect(() => {
    if (planes.length === 0 && osros.length === 0 && (!showIncidentes || incidentes.length === 0)) return;
    
    const bounds = L.latLngBounds([]);
    planes.forEach(p => bounds.extend([p.lat, p.lng]));
    osros.forEach(o => bounds.extend([o.lat, o.lng]));
    if (showIncidentes) {
       incidentes.forEach(i => bounds.extend([i.lat, i.lng]));
    }
    
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [planes.length, osros.length, incidentes.length, showIncidentes, map]);
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

const getMarkerIcon = (anexo: string, punto?: { tipo?: string, isPunto?: boolean }) => {
  const tipo = (punto?.tipo || '').toLowerCase();

  if (anexo === 'anexo_15') {
    return L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="background-color: white; width: 28px; height: 28px; border-radius: 50%; border: 2px solid #1d4ed8; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; position: relative; color: #1d4ed8;">
        <span class="material-symbols-outlined" style="position: absolute; font-size: 16px; transform: rotate(45deg); font-variation-settings: 'FILL' 1;">anchor</span>
        <span class="material-symbols-outlined" style="position: absolute; font-size: 16px; transform: rotate(-45deg); font-variation-settings: 'FILL' 1;">anchor</span>
      </div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -14]
    });
  }

  // Plataforma Offshore (Anexo 20 o tipo plataforma)
  if (tipo.includes('plataforma') || (anexo === 'anexo_20' && (!punto?.tipo || tipo === 'plataforma'))) {
    return L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="background-color: #0891b2; width: 28px; height: 28px; border-radius: 50%; border: 2.5px solid white; box-shadow: 0 3px 7px rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; color: white;">
        <span class="material-symbols-outlined" style="font-size: 16px;">oil_barrel</span>
      </div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -14]
    });
  }

  // Pozo de Extracción
  if (tipo.includes('pozo')) {
    return L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="background-color: #4f46e5; width: 26px; height: 26px; border-radius: 50%; border: 2.5px solid white; box-shadow: 0 3px 6px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: white;">
        <span class="material-symbols-outlined" style="font-size: 15px;">water_drop</span>
      </div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      popupAnchor: [0, -13]
    });
  }

  // Monoboya / Boya de Carga (Anexo 17 o tipo monoboya/boya)
  if (tipo.includes('monoboya') || tipo.includes('boya') || (anexo === 'anexo_17' && (!punto?.tipo || tipo === 'monoboya'))) {
    return L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="background-color: #ea580c; width: 28px; height: 28px; border-radius: 50%; border: 2.5px solid white; box-shadow: 0 3px 7px rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center; color: white;">
        <span class="material-symbols-outlined" style="font-size: 16px;">anchor</span>
      </div>`,
      iconSize: [28, 28],
      iconAnchor: [14, 14],
      popupAnchor: [0, -14]
    });
  }

  // Oleoducto Costero
  if (tipo.includes('oleoducto') || tipo.includes('tuberia')) {
    return L.divIcon({
      className: 'custom-div-icon',
      html: `<div style="background-color: #dc2626; width: 26px; height: 26px; border-radius: 50%; border: 2.5px solid white; box-shadow: 0 3px 6px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: white;">
        <span class="material-symbols-outlined" style="font-size: 15px;">timeline</span>
      </div>`,
      iconSize: [26, 26],
      iconAnchor: [13, 13],
      popupAnchor: [0, -13]
    });
  }

  let color = '#3b82f6'; // default blue
  switch (anexo) {
    case 'anexo_16': color = '#ef4444'; break; // red
    case 'anexo_17': color = '#f97316'; break; // orange
    case 'anexo_18': color = '#eab308'; break; // yellow
    case 'anexo_19': color = '#22c55e'; break; // green
    case 'anexo_20': color = '#06b6d4'; break; // cyan
  }

  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: ${color}; width: 22px; height: 22px; border-radius: 50%; border: 2.5px solid white; box-shadow: 0 2px 5px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center;"><div style="background: white; width: 6px; height: 6px; border-radius: 50%;"></div></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
    popupAnchor: [0, -11]
  });
};

const getLineColor = (anexo?: string) => {
  switch (anexo) {
    case 'anexo_15': return '#2563eb'; // Azul puertos
    case 'anexo_16': return '#ef4444'; // Rojo
    case 'anexo_17': return '#ea580c'; // Naranja monoboyas / oleoductos
    case 'anexo_18': return '#eab308'; // Amarillo
    case 'anexo_19': return '#16a34a'; // Verde
    case 'anexo_20': return '#0891b2'; // Cian offshore plataformas / pozos
    default: return '#0284c7';
  }
};

const getOsroIcon = () => {
  return L.divIcon({
    className: 'custom-div-icon',
    html: `<div style="background-color: white; width: 28px; height: 28px; border-radius: 50%; border: 2px solid #334155; box-shadow: 0 2px 5px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: #334155;">
      <span class="material-symbols-outlined" style="font-size: 20px; font-variation-settings: 'FILL' 1;">water_drop</span>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14]
  });
};

const getIncidenteIcon = (estado: string) => {
  let color = '#eab308'; // alerta yellow
  if (estado === 'evaluacion') color = '#f97316'; // evaluacion orange
  if (estado === 'derrame_efectivo') color = '#ef4444'; // derrame red

  return L.divIcon({
    className: 'custom-div-icon',
    html: `
      <div style="background-color: ${color}; width: 32px; height: 32px; border-radius: 50%; border: 2px solid white; box-shadow: 0 4px 10px rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; color: white; animation: pulse 2s infinite;">
         <span class="material-symbols-outlined" style="font-size: 20px;">warning</span>
      </div>
      <style>
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 ${color}80; }
          70% { box-shadow: 0 0 0 10px rgba(0,0,0,0); }
          100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
        }
      </style>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
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

export interface MappedPlanMarker extends PlanEmergencia {
  id: string;
  originalId: string;
  lat: number;
  lng: number;
  isPunto?: boolean;
  puntoId?: string;
  puntoNombre?: string;
  puntoTipo?: string;
  puntoDescripcion?: string;
  puntoCoordenadas?: string;
  puntoIdentificador?: string;
  puntoEstado?: string;
}

export const Mapa: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [planes, setPlanes] = useState<MappedPlanMarker[]>([]);
  const [osros, setOsros] = useState<(any)[]>([]);
  const [incidentes, setIncidentes] = useState<(IncidenteDerrame & { lat: number, lng: number, originalId: string })[]>([]);
  const [showIncidentes, setShowIncidentes] = useState(location.state?.showIncidentes || false);
  const [showConnections, setShowConnections] = useState<boolean>(true);
  const [selectedAnexo, setSelectedAnexo] = useState<string>('todos');
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    // Suscripción a Planes con soporte Multi-Punto (Plataformas, Pozos, Monoboyas, Oleoductos, etc.)
    const qPlanes = query(collection(db, 'planes'));
    const unsubscribePlanes = onSnapshot(qPlanes, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as PlanEmergencia));
      
      const mappedPlanes: MappedPlanMarker[] = docs.flatMap(p => {
        const pointsList: MappedPlanMarker[] = [];

        // 1. Puntos específicos declarados en el plan (Anexo 20 plataformas/pozos, Anexo 17 monoboyas, etc.)
        if (p.puntos && p.puntos.length > 0) {
          p.puntos.forEach((punto, pIdx) => {
            const coordsArray = parseCoordinates(punto.coordenadas);
            coordsArray.forEach((coords, cIdx) => {
              pointsList.push({
                ...p,
                id: `${p.id}_punto_${punto.id || pIdx}_${cIdx}`,
                originalId: p.id,
                lat: coords[0],
                lng: coords[1],
                isPunto: true,
                puntoId: punto.id,
                puntoNombre: punto.nombre,
                puntoTipo: punto.tipo || (p.anexo === 'anexo_20' ? 'plataforma' : p.anexo === 'anexo_17' ? 'monoboya' : 'instalacion'),
                puntoDescripcion: punto.descripcion,
                puntoCoordenadas: punto.coordenadas,
                puntoIdentificador: punto.identificador,
                puntoEstado: punto.estadoOperativo
              });
            });
          });
        }

        // 2. Coordenadas generales del plan si existen y no duplican un sub-punto
        const rootCoordsArray = parseCoordinates(p.coordenadas);
        if (rootCoordsArray.length > 0) {
          rootCoordsArray.forEach((coords, index) => {
            const isDuplicate = pointsList.some(pl => Math.abs(pl.lat - coords[0]) < 0.0001 && Math.abs(pl.lng - coords[1]) < 0.0001);
            if (!isDuplicate) {
              pointsList.push({
                ...p,
                id: `${p.id}_root_${index}`,
                originalId: p.id,
                lat: coords[0],
                lng: coords[1],
                isPunto: false,
                puntoNombre: p.puntos && p.puntos.length > 0 ? `${p.empresa} (Sede / Base)` : p.empresa,
                puntoTipo: p.anexo === 'anexo_20' ? 'plataforma' : p.anexo === 'anexo_17' ? 'monoboya' : 'instalacion'
              });
            }
          });
        }

        return pointsList;
      });
      setPlanes(mappedPlanes);
    });

    // Suscripción a Empresas de Control de Derrames (Escuchamos ambas colecciones posibles)
    const q1 = query(collection(db, 'empresas_derrames'));
    const q2 = query(collection(db, 'control_derrames'));

    const updateOsros = (snap1: any, snap2: any) => {
      const docs1 = snap1.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      const docs2 = snap2.docs.map((doc: any) => ({ id: doc.id, ...doc.data() }));
      
      const combined = [...docs1];
      const seenIds = new Set(docs1.map((d: any) => d.id));
      docs2.forEach((d: any) => { if (!seenIds.has(d.id)) { combined.push(d); seenIds.add(d.id); } });

      const mappedOsros = combined.flatMap(o => {
        return (o.basesOperativas || []).flatMap((base: any) => {
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
    };

    let s1: any = { docs: [] };
    let s2: any = { docs: [] };
    const unsubOsros1 = onSnapshot(q1, (s) => { s1 = s; updateOsros(s1, s2); });
    const unsubOsros2 = onSnapshot(q2, (s) => { s2 = s; updateOsros(s1, s2); });

    // Suscripción a Incidentes (Planacon)
    const qIncidentes = query(collection(db, 'incidentes'));
    const unsubIncidentes = onSnapshot(qIncidentes, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as IncidenteDerrame));
      
      const mappedIncidentes = docs.flatMap(inc => {
        // Only show incidents with known decimal location
        if (typeof inc.latitud === 'number' && typeof inc.longitud === 'number' && !isNaN(inc.latitud) && !isNaN(inc.longitud)) {
          return [{
            ...inc,
            originalId: inc.id,
            lat: inc.latitud,
            lng: inc.longitud
          }];
        }
        return [];
      });
      setIncidentes(mappedIncidentes as any);
    });

    return () => {
      unsubscribePlanes();
      unsubOsros1();
      unsubOsros2();
      unsubIncidentes();
    };
  }, []);

  // Filtrado de Planes y OSROs
  const filteredPlanes = planes.filter(p => {
    if (selectedAnexo !== 'todos' && selectedAnexo !== 'osros' && p.anexo !== selectedAnexo) {
      return false;
    }
    if (selectedAnexo === 'osros') return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchEmpresa = (p.empresa || '').toLowerCase().includes(q);
      const matchPunto = (p.puntoNombre || '').toLowerCase().includes(q);
      const matchTipo = (p.puntoTipo || '').toLowerCase().includes(q);
      const matchDesc = (p.puntoDescripcion || '').toLowerCase().includes(q);
      const matchTag = (p.puntoIdentificador || '').toLowerCase().includes(q);
      const matchDispo = (p.disposicion || '').toLowerCase().includes(q);
      const matchPlan = (p.numeroPlan || '').toLowerCase().includes(q);
      const matchDep = (p.dependencia || '').toLowerCase().includes(q);
      return matchEmpresa || matchPunto || matchTipo || matchDesc || matchTag || matchDispo || matchPlan || matchDep;
    }
    return true;
  });

  const filteredOsros = (selectedAnexo !== 'todos' && selectedAnexo !== 'osros') ? [] : osros.filter(o => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (o.empresa || '').toLowerCase().includes(q) || (o.nombre || '').toLowerCase().includes(q);
  });

  const uniqueCompaniesCount = new Set(filteredPlanes.map(p => p.originalId)).size;

  // Conexiones de red: Une cada punto/instalación al punto cabecera de su respectiva empresa
  const planConnections = useMemo(() => {
    const groups: { [key: string]: MappedPlanMarker[] } = {};
    filteredPlanes.forEach(p => {
      if (!groups[p.originalId]) groups[p.originalId] = [];
      groups[p.originalId].push(p);
    });

    const lines: {
      key: string;
      from: [number, number];
      to: [number, number];
      anexo: string;
      empresa: string;
      puntoNombre: string;
      cabeceraNombre: string;
    }[] = [];

    Object.entries(groups).forEach(([origId, points]) => {
      if (points.length < 2) return;

      // Localizar la cabecera: el punto donde isPunto === false, o en su defecto el primer punto
      let cabecera = points.find(p => !p.isPunto);
      if (!cabecera) {
        cabecera = points[0];
      }

      points.forEach((pt, idx) => {
        if (pt.id === cabecera!.id) return;
        // Si las coordenadas son idénticas, no trazar línea redundante
        if (Math.abs(pt.lat - cabecera!.lat) < 0.0001 && Math.abs(pt.lng - cabecera!.lng) < 0.0001) return;

        lines.push({
          key: `${origId}_conn_${idx}`,
          from: [cabecera!.lat, cabecera!.lng],
          to: [pt.lat, pt.lng],
          anexo: pt.anexo || cabecera!.anexo || '',
          empresa: pt.empresa,
          puntoNombre: pt.puntoNombre || pt.empresa,
          cabeceraNombre: cabecera!.puntoNombre || cabecera!.empresa
        });
      });
    });

    return lines;
  }, [filteredPlanes]);

  const handleExportKML = () => {
    const kmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>Planes de Emergencia - Instalaciones SIG</name>
    ${filteredPlanes.map(p => `
    <Placemark>
      <name><![CDATA[${p.puntoNombre || p.empresa}]]></name>
      <description><![CDATA[
        <b>Empresa:</b> ${p.empresa}<br/>
        ${p.isPunto ? `<b>Tipo de Instalación:</b> ${p.puntoTipo || 'S/D'}<br/>` : ''}
        ${p.puntoIdentificador ? `<b>Tag/ID:</b> ${p.puntoIdentificador}<br/>` : ''}
        ${p.puntoDescripcion ? `<b>Observaciones:</b> ${p.puntoDescripcion}<br/>` : ''}
        <b>Anexo:</b> ${(p.anexo || 'S/D').replace('_', ' ').toUpperCase()}<br/>
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
    a.download = 'sig_planes_instalaciones.kml';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleExportShapefile = () => {
    const geojson = {
      type: "FeatureCollection",
      features: filteredPlanes.map(p => ({
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [p.lng, p.lat]
        },
        properties: {
          nombre_pto: p.puntoNombre || p.empresa,
          tipo_pto: p.puntoTipo || p.anexo,
          empresa: p.empresa,
          anexo: p.anexo,
          dispo: p.disposicion || 'S/D',
          vence: formatDate(p.vencimiento),
          nro_plan: p.numeroPlan || 'S/D',
          depend: p.dependencia || 'S/D',
          tag: p.puntoIdentificador || ''
        }
      }))
    };

    const options = {
      folder: 'planes_emergencia_sig',
      types: {
        point: 'instalaciones_planes',
      }
    };

    shpwrite.download(geojson, options);
  };

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-900">
      <Sidebar />
      <main className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Cabecera Principal */}
        <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-6 py-4 flex flex-wrap justify-between items-center gap-4 shrink-0 z-10 shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-2xl">travel_explore</span>
              <h1 className="text-xl font-black text-slate-800 dark:text-white tracking-tight">SIG - Despliegue Geográfico</h1>
            </div>
            <p className="text-xs font-bold text-slate-500 mt-0.5 uppercase tracking-wider">
              Plataformas Offshore, Pozos, Monoboyas, Terminales y PLANACON
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Buscador Rápido en Mapa */}
            <div className="relative min-w-[240px]">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
              <input
                type="text"
                placeholder="Buscar empresa, punto, tag o dispo..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-8 py-2 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-bold text-slate-800 dark:text-white placeholder-slate-400 outline-none focus:ring-1 focus:ring-primary"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <span className="material-symbols-outlined text-[15px]">close</span>
                </button>
              )}
            </div>

            <button 
              onClick={() => setShowIncidentes(!showIncidentes)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-colors shadow-xs ${showIncidentes ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'}`}
            >
              <span className="material-symbols-outlined text-[17px]">warning</span>
              {showIncidentes ? 'Ocultar PLANACON' : 'Ver PLANACON'}
            </button>

            <button 
              onClick={handleExportKML}
              className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-colors shadow-xs cursor-pointer"
              title="Descargar KML para Google Earth"
            >
              <span className="material-symbols-outlined text-[17px]">public</span>
              KML
            </button>

            <button 
              onClick={handleExportShapefile}
              className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-2 rounded-lg text-xs font-black uppercase tracking-wider transition-colors shadow-xs cursor-pointer"
              title="Descargar Shapefile para QGIS / ArcGIS"
            >
              <span className="material-symbols-outlined text-[17px]">layers</span>
              SHP
            </button>
          </div>
        </header>

        {/* Barra de Filtros Rápidos por Anexo */}
        <div className="bg-slate-100/90 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0 text-xs z-10">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-black uppercase text-slate-500 mr-1">Filtrar:</span>
            
            <button
              onClick={() => setSelectedAnexo('todos')}
              className={`px-3 py-1 rounded-full text-[10px] font-black uppercase transition-all cursor-pointer ${
                selectedAnexo === 'todos' 
                  ? 'bg-slate-900 text-white shadow-xs' 
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              Todos ({planes.length})
            </button>

            <button
              onClick={() => setSelectedAnexo('anexo_20')}
              className={`px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
                selectedAnexo === 'anexo_20' 
                  ? 'bg-cyan-700 text-white shadow-xs' 
                  : 'bg-cyan-50 text-cyan-800 dark:bg-cyan-950/60 dark:text-cyan-300 border border-cyan-200 dark:border-cyan-800 hover:bg-cyan-100'
              }`}
            >
              <span className="size-2 rounded-full bg-cyan-400"></span>
              Anexo 20 - Offshore / Pozos ({planes.filter(p => p.anexo === 'anexo_20').length})
            </button>

            <button
              onClick={() => setSelectedAnexo('anexo_17')}
              className={`px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
                selectedAnexo === 'anexo_17' 
                  ? 'bg-orange-600 text-white shadow-xs' 
                  : 'bg-orange-50 text-orange-800 dark:bg-orange-950/60 dark:text-orange-300 border border-orange-200 dark:border-orange-800 hover:bg-orange-100'
              }`}
            >
              <span className="size-2 rounded-full bg-orange-400"></span>
              Anexo 17 - Monoboyas / Oleoductos ({planes.filter(p => p.anexo === 'anexo_17').length})
            </button>

            <button
              onClick={() => setSelectedAnexo('anexo_15')}
              className={`px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1.5 transition-all cursor-pointer ${
                selectedAnexo === 'anexo_15' 
                  ? 'bg-blue-700 text-white shadow-xs' 
                  : 'bg-blue-50 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800 hover:bg-blue-100'
              }`}
            >
              <span className="size-2 rounded-full bg-blue-400"></span>
              Anexo 15 - Puertos ({planes.filter(p => p.anexo === 'anexo_15').length})
            </button>

            <button
              onClick={() => setSelectedAnexo('anexo_16')}
              className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase transition-all cursor-pointer ${
                selectedAnexo === 'anexo_16' 
                  ? 'bg-red-700 text-white shadow-xs' 
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              Anexo 16
            </button>

            <button
              onClick={() => setSelectedAnexo('anexo_18')}
              className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase transition-all cursor-pointer ${
                selectedAnexo === 'anexo_18' 
                  ? 'bg-yellow-600 text-white shadow-xs' 
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              Anexo 18
            </button>

            <button
              onClick={() => setSelectedAnexo('anexo_19')}
              className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase transition-all cursor-pointer ${
                selectedAnexo === 'anexo_19' 
                  ? 'bg-emerald-700 text-white shadow-xs' 
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              Anexo 19
            </button>

            <button
              onClick={() => setSelectedAnexo('osros')}
              className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase transition-all cursor-pointer ${
                selectedAnexo === 'osros' 
                  ? 'bg-slate-800 text-white shadow-xs' 
                  : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              Bases Derrames ({osros.length})
            </button>
          </div>

          <div className="flex items-center gap-2 text-[10px] font-black uppercase text-slate-600 dark:text-slate-400">
            {planConnections.length > 0 && (
              <button
                onClick={() => setShowConnections(!showConnections)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-black uppercase transition-all cursor-pointer border ${
                  showConnections
                    ? 'bg-cyan-600 text-white border-cyan-600 shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200'
                }`}
                title="Trazar líneas finas que conectan cada instalación a la cabecera de la empresa"
              >
                <span className="material-symbols-outlined text-[14px]">hub</span>
                {showConnections ? `Líneas Cabecera (${planConnections.length})` : 'Ver Líneas'}
              </button>
            )}

            <span className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-primary">
              {filteredPlanes.length} {filteredPlanes.length === 1 ? 'punto mapeado' : 'puntos mapeados'}
            </span>
            <span>de {uniqueCompaniesCount} {uniqueCompaniesCount === 1 ? 'empresa' : 'empresas'}</span>
          </div>
        </div>

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

            <ZoomToMarkers planes={filteredPlanes} osros={filteredOsros} incidentes={incidentes} showIncidentes={showIncidentes} />

            {/* Líneas finas que unen cada punto/instalación con el punto cabecera de la empresa */}
            {showConnections && planConnections.map(line => (
              <Polyline
                key={line.key}
                positions={[line.from, line.to]}
                pathOptions={{
                  color: getLineColor(line.anexo),
                  weight: 1.5,
                  opacity: 0.7,
                  dashArray: '5, 5',
                  lineCap: 'round'
                }}
              >
                <Tooltip sticky direction="top" opacity={0.95}>
                  <div className="text-[10px] font-sans font-bold leading-tight">
                    <p className="text-slate-900 uppercase font-black">{line.empresa}</p>
                    <p className="text-slate-600 font-normal mt-0.5">
                      <span className="font-bold text-slate-800">{line.cabeceraNombre}</span> ➔ {line.puntoNombre}
                    </p>
                  </div>
                </Tooltip>
              </Polyline>
            ))}

            {filteredPlanes.map(p => (
              <Marker 
                key={p.id} 
                position={[p.lat, p.lng]} 
                icon={getMarkerIcon(p.anexo, { tipo: p.puntoTipo, isPunto: p.isPunto })}
              >
                <Popup className="custom-popup">
                  <div className="flex flex-col min-w-[260px] max-w-[320px]">
                    {/* Header del Popup */}
                    <div className={`p-3 text-white rounded-t-lg ${
                      p.puntoTipo === 'plataforma' || p.anexo === 'anexo_20' ? 'bg-cyan-800' :
                      p.puntoTipo === 'monoboya' || p.anexo === 'anexo_17' ? 'bg-orange-700' :
                      p.anexo === 'anexo_15' ? 'bg-blue-800' : 'bg-slate-900'
                    }`}>
                      <div className="flex justify-between items-start gap-2 mb-1">
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-white/20 text-white tracking-wide">
                          {p.puntoTipo === 'plataforma' ? 'Plataforma Offshore' :
                           p.puntoTipo === 'pozo' ? 'Pozo de Extracción' :
                           p.puntoTipo === 'monoboya' ? 'Monoboya' :
                           p.puntoTipo === 'oleoducto' ? 'Oleoducto Costero' :
                           p.puntoTipo === 'boya' ? 'Boya de Carga' :
                           p.puntoTipo === 'terminal' ? 'Terminal Marítima' :
                           p.puntoTipo ? p.puntoTipo.toUpperCase() : (p.anexo ? p.anexo.replace('_', ' ').toUpperCase() : 'S/D')}
                        </span>

                        {p.puntoEstado && (
                          <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                            p.puntoEstado === 'inactivo' ? 'bg-red-500/80 text-white' :
                            p.puntoEstado === 'en_construccion' ? 'bg-amber-500/80 text-white' : 'bg-emerald-500/80 text-white'
                          }`}>
                            {p.puntoEstado === 'inactivo' ? 'Inactivo' : p.puntoEstado === 'en_construccion' ? 'En Construcción' : 'Operativo'}
                          </span>
                        )}
                      </div>

                      <h3 className="font-black text-white uppercase text-sm leading-tight">
                        {p.puntoNombre || p.empresa}
                      </h3>
                      {p.isPunto && (
                        <p className="text-[10px] font-bold text-white/80 uppercase mt-0.5">
                          Empresa: {p.empresa}
                        </p>
                      )}
                    </div>

                    {/* Fotografía o Logo de la Empresa / Instalación */}
                    {p.logoUrl ? (
                      <div className="w-full h-32 bg-white flex items-center justify-center overflow-hidden border-b border-slate-200 p-2">
                        <img src={p.logoUrl} alt={p.empresa} className="w-full h-full object-contain" />
                      </div>
                    ) : (
                      <div className="w-full h-20 bg-slate-100 flex flex-col items-center justify-center border-b border-slate-200 text-slate-400">
                        <span className="material-symbols-outlined text-3xl mb-0.5 opacity-60">image_not_supported</span>
                        <span className="text-[9px] font-bold uppercase tracking-wider">Sin imagen</span>
                      </div>
                    )}

                    <div className="p-3 bg-white">
                      {p.puntoDescripcion && (
                        <p className="text-[10px] text-slate-600 italic bg-slate-50 p-2 rounded border border-slate-200 mb-2.5">
                          "{p.puntoDescripcion}"
                        </p>
                      )}

                      <div className="space-y-1.5 text-[10px] text-slate-600 mb-3">
                        <p className="flex justify-between border-b border-slate-100 pb-1">
                          <span className="font-bold uppercase text-slate-400">Coordenadas:</span> 
                          <span className="font-mono font-bold text-slate-700">{p.lat.toFixed(4)}, {p.lng.toFixed(4)}</span>
                        </p>
                        {p.puntoIdentificador && (
                          <p className="flex justify-between border-b border-slate-100 pb-1">
                            <span className="font-bold uppercase text-slate-400">Tag / ID:</span> 
                            <span className="font-mono font-bold text-indigo-600">{p.puntoIdentificador}</span>
                          </p>
                        )}
                        <p className="flex justify-between border-b border-slate-100 pb-1">
                          <span className="font-bold uppercase text-slate-400">Anexo:</span> 
                          <span className="font-bold text-slate-700">{(p.anexo || 'S/D').replace('_', ' ').toUpperCase()}</span>
                        </p>
                        <p className="flex justify-between border-b border-slate-100 pb-1">
                          <span className="font-bold uppercase text-slate-400">Nº Plan:</span> 
                          <span className="font-bold text-slate-700 font-mono">{p.numeroPlan || 'S/D'}</span>
                        </p>
                        <p className="flex justify-between border-b border-slate-100 pb-1">
                          <span className="font-bold uppercase text-slate-400">Disposición:</span> 
                          <span className="font-bold text-slate-700 font-mono">{p.disposicion || 'S/D'}</span>
                        </p>
                        <p className="flex justify-between border-b border-slate-100 pb-1">
                          <span className="font-bold uppercase text-slate-400">Vencimiento:</span> 
                          <span className="font-bold text-slate-700">{formatDate(p.vencimiento)}</span>
                        </p>
                        <p className="flex justify-between">
                          <span className="font-bold uppercase text-slate-400">Dependencia:</span> 
                          <span className="font-bold text-slate-700 uppercase">{p.dependencia || 'S/D'}</span>
                        </p>
                      </div>

                      <button 
                        onClick={() => navigate('/planes', { state: { openPlanId: p.originalId } })}
                        className="w-full bg-primary text-white text-[10px] font-black uppercase py-2 rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[15px]">corporate_fare</span>
                        Ver Perfil de Empresa
                      </button>
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {filteredOsros.map(o => (
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

            {showIncidentes && incidentes.map(inc => (
              <Marker key={inc.id} position={[inc.lat, inc.lng]} icon={getIncidenteIcon(inc.estadoPlanacon)}>
                <Popup className="custom-popup">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2 p-3 border-b border-red-200 bg-red-50 text-red-900">
                      <div className={`w-6 h-6 shrink-0 rounded flex items-center justify-center text-white
                        ${inc.estadoPlanacon === 'alerta' ? 'bg-yellow-500' : inc.estadoPlanacon === 'evaluacion' ? 'bg-orange-500' : 'bg-red-600'}`}>
                        <span className="material-symbols-outlined text-[14px]">warning</span>
                      </div>
                      <div className="overflow-hidden">
                        <h3 className="font-black uppercase text-xs leading-tight truncate">PLANACON {(inc.estadoPlanacon || '').replace('_', ' ')}</h3>
                        <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest">{inc.moi || 'Sin MOI'}</p>
                      </div>
                    </div>

                    <div className="p-3 bg-white">
                       <div className="space-y-1.5 text-[10px] text-slate-800 mb-4">
                         <p className="flex justify-between"><span className="font-bold uppercase text-slate-400">Fecha:</span> <span className="font-bold text-slate-700">{formatDate(inc.fecha)}</span></p>
                         <p className="flex justify-between"><span className="font-bold uppercase text-slate-400">Jurisdicción:</span> <span className="font-bold text-slate-700 uppercase">{inc.jurisdiccion}</span></p>
                         <p className="flex flex-col"><span className="font-bold uppercase text-slate-400">Ubicación:</span> <span className="font-bold text-slate-700 uppercase">{inc.ubicacion}</span></p>
                         
                         <p className="flex justify-between border-t border-slate-100 pt-1 mt-1">
                           <span className="font-bold uppercase text-slate-400">Origen:</span> 
                           <span className="font-bold text-indigo-600 uppercase">
                             {inc.origenConocido ? `${inc.origenTipo} ${inc.origenNombre ? `- ${inc.origenNombre}` : ''}` : 'DESCONOCIDO'}
                           </span>
                         </p>

                         {inc.estadoPlanacon === 'derrame_efectivo' && (
                           <div className="bg-red-50/50 p-2 mt-2 rounded border border-red-100">
                             <p className="font-black text-red-600 text-[9px] uppercase tracking-wider mb-1">Detalle del Derrame</p>
                             <p className="flex justify-between"><span className="font-bold uppercase text-slate-500">Producto:</span> <span className="font-bold text-slate-800 uppercase">{inc.productoTipo?.replace('_', ' ')}</span></p>
                             <p className="flex justify-between"><span className="font-bold uppercase text-slate-500">Volumen:</span> <span className="font-bold text-red-600 uppercase">{inc.volumenEstimado} {inc.unidadMedida}</span></p>
                           </div>
                         )}

                         <p className="flex justify-between border-t border-slate-100 pt-1 mt-2">
                            <span className="font-bold uppercase text-slate-400">Expediente:</span>
                            <span className={`px-1.5 py-0.5 rounded uppercase font-black tracking-widest text-[8px]
                              ${inc.estado === 'en_curso' ? 'bg-red-100 text-red-700' : 
                                inc.estado === 'controlado' ? 'bg-orange-100 text-orange-700' : 
                                inc.estado === 'remediado' ? 'bg-emerald-100 text-emerald-700' :
                                inc.estado === 'falsa_alarma' ? 'bg-slate-100 text-slate-600' : 'bg-blue-100 text-blue-700'}`}>
                              {inc.estado?.replace('_', ' ')}
                            </span>
                         </p>
                       </div>

                       <button 
                         onClick={() => navigate('/incidentes')}
                         className="w-full bg-slate-800 text-white text-[10px] font-black uppercase py-2 rounded hover:bg-slate-900 transition-colors flex items-center justify-center gap-1 shadow-sm"
                       >
                         <span className="material-symbols-outlined text-[14px]">arrow_forward</span>
                         Ir al Registro
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
