import express from "express";
import cors from "cors";
import path from "path";
import { createServer as createViteServer } from "vite";
import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

const DEFAULT_CONFIG = {
  apiKey: "AIzaSyDAVp0wzhkKwWzEKrl4VQgSYuzl7t4fKFk",
  authDomain: "gestion-de-expedientes-7ce57.firebaseapp.com",
  projectId: "gestion-de-expedientes-7ce57",
  storageBucket: "gestion-de-expedientes-7ce57.firebasestorage.app",
  messagingSenderId: "567789982821",
  appId: "1:567789982821:web:bbc0efe88b83ee8f15e28c"
};

const app = express();
const PORT = 3000;

app.use(cors());

// Initialize Firebase for the server
const firebaseApp = initializeApp(DEFAULT_CONFIG);
const db = getFirestore(firebaseApp);

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

app.get("/api/geojson-mapa", async (req, res) => {
  try {
    const features: any[] = [];

    // Fetch Planes
    try {
      const planesSnap = await getDocs(collection(db, "planes"));
      planesSnap.forEach(doc => {
        const data = doc.data();
        const coordsArray = parseCoordinates(data.coordenadas || (typeof data.coordenadas === 'object' ? `${data.coordenadas.lat}, ${data.coordenadas.lng}` : undefined));
        
        coordsArray.forEach((coords, i) => {
          features.push({
            type: "Feature",
            geometry: { type: "Point", coordinates: [coords[1], coords[0]] }, // GeoJSON uses [lng, lat]
            properties: {
              id: `${doc.id}_${i}`,
              nombre: data.buque || `Plan ${data.n_plan || 'S/D'}`,
              tipo_poi: "plan",
              imagen_url: data.fotoUrl || "",
              anexo: data.anexo || "",
              n_plan: data.n_plan || "",
              vencimiento: data.vencimiento || "",
              perfil_url: "" 
            }
          });
        });
      });
    } catch (e: any) {
       console.error("Error fetching planes: ", e.message);
    }

    // Fetch Empresas (from empresas_derrames and control_derrames)
    for (const colName of ['empresas_derrames', 'control_derrames']) {
      try {
        const osroSnap = await getDocs(collection(db, colName));
        osroSnap.forEach(doc => {
          const data = doc.data();
          // We must check their basesOperativas
          if (Array.isArray(data.basesOperativas)) {
            data.basesOperativas.forEach((base: any, index: number) => {
              const coordsArray = parseCoordinates(base.coordenadas || (typeof base.coordenadas === 'object' ? `${base.coordenadas.lat}, ${base.coordenadas.lng}` : undefined));
              
              coordsArray.forEach((coords, j) => {
                features.push({
                  type: "Feature",
                  geometry: { type: "Point", coordinates: [coords[1], coords[0]] },
                  properties: {
                    id: `${doc.id}-base-${index}-${j}`,
                    nombre: data.empresa || "Empresa OSRO",
                    tipo_poi: "empresa",
                    imagen_url: data.logoUrl || "",
                    anexo: "",
                    n_plan: "",
                    vencimiento: data.vencimiento || "",
                    perfil_url: ""
                  }
                });
              });
            });
          }
        });
      } catch (e: any) {
        console.error(`Error fetching ${colName}: `, e.message);
      }
    }

    const geojson = {
      type: "FeatureCollection",
      features
    };

    res.setHeader("Content-Type", "application/json");
    res.json(geojson);
  } catch (error) {
    console.error("API error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
