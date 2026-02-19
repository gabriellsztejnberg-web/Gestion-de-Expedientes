
import React, { useState, useEffect } from 'react';
// FIX: Using react-router instead of react-router-dom to resolve missing named exports
import { useNavigate } from 'react-router';
import { db, currentConfig } from '../firebase';
import { collection, getDocs, query, where, setDoc, doc } from 'firebase/firestore';
import { User } from '../types';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Config Modal State
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [configJson, setConfigJson] = useState('');

  useEffect(() => {
    const seedInitialUsers = async () => {
      try {
        // ACTUALIZACIÓN: Forzamos la creación/actualización del usuario Admin solicitado
        // para garantizar el acceso inmediato.
        await setDoc(doc(db, 'usuarios', 'admin-id'), {
            id: 'admin-id', 
            username: 'admin', 
            name: 'Administrador Sistema', 
            password: 'Qwerty.123', 
            role: 'jefe' 
        });

        const q = query(collection(db, 'usuarios'));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
          const initialUsers = [
            { id: 'gabriel-id', username: 'gabriel', name: 'Gabriel', password: '123', role: 'jefe' }
          ];
          for (const u of initialUsers) {
            await setDoc(doc(db, 'usuarios', u.id), u);
          }
        }
      } catch (err) {
        console.error("Error inicializando usuarios:", err);
      }
    };
    seedInitialUsers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    // Normalizamos el usuario a minúsculas antes de buscar
    const normalizedUser = username.toLowerCase().trim();
    
    try {
      const q = query(
        collection(db, 'usuarios'), 
        where('username', '==', normalizedUser)
      );
      
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const userDoc = snapshot.docs[0].data() as User;
        // Comparación simple de texto plano (para este prototipo)
        if (userDoc.password === password) {
          localStorage.setItem('currentUser', JSON.stringify(userDoc));
          navigate('/dashboard');
        } else {
          setError('Contraseña incorrecta.');
        }
      } else {
        setError('El usuario no existe o no tiene permisos en la nube.');
      }
    } catch (err) {
      setError('No se pudo conectar con Firestore. Verifique su conexión a Internet.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenConfig = () => {
      setConfigJson(JSON.stringify(currentConfig, null, 2));
      setIsConfigOpen(true);
  };

  const handleSaveConfig = () => {
      try {
          const parsed = JSON.parse(configJson);
          if (!parsed.projectId) {
              alert("La configuración debe incluir al menos un projectId.");
              return;
          }
          localStorage.setItem('app_firebase_config', JSON.stringify(parsed));
          window.location.reload();
      } catch (e) {
          alert("Error: El formato JSON no es válido.");
      }
  };

  const handleRestoreConfig = () => {
      if(confirm("¿Restaurar la conexión por defecto?")) {
          localStorage.removeItem('app_firebase_config');
          window.location.reload();
      }
  };

  return (
    <div className="flex min-h-screen w-full flex-1">
      {/* BACKGROUND SIDE */}
      <div className="relative hidden w-0 flex-1 lg:block">
        <div className="absolute inset-0 h-full w-full bg-slate-900">
          <img alt="Muelle" className="absolute inset-0 h-full w-full object-cover opacity-60 mix-blend-overlay" src="https://images.unsplash.com/photo-1516937941344-00b4e0337589?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80"/>
          <div className="absolute inset-0 bg-blue-900/30 mix-blend-multiply"></div>
          <div className="absolute inset-0 flex flex-col justify-end p-12 text-white">
            <h2 className="text-3xl font-black uppercase tracking-tight flex items-center gap-2">
              <span className="material-symbols-outlined text-4xl">water_damage</span>
              División Planes - DPAM Cloud
            </h2>
            <p className="max-w-xl text-lg font-medium text-slate-100">Acceso compartido y sincronizado en tiempo real.</p>
          </div>
        </div>
      </div>

      {/* LOGIN FORM SIDE */}
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24 bg-background-light dark:bg-background-dark relative">
        
        {/* BOTÓN CONFIGURAR CONEXIÓN (TOP RIGHT) */}
        <button 
            onClick={handleOpenConfig} 
            className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors" 
            title="Configurar Conexión API"
        >
            <span className="material-symbols-outlined text-xl">settings_ethernet</span>
        </button>

        <div className="mx-auto w-full max-w-sm lg:w-96">
          <div className="flex flex-col gap-2 mb-8 text-center lg:text-left">
            <p className="text-slate-900 dark:text-white text-3xl font-black tracking-tight">Acceso Oficina</p>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-widest">Ingrese sus credenciales</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && <div className="bg-red-50 text-red-600 p-3 rounded text-xs font-bold border border-red-100 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">error</span>
              {error}
            </div>}
            <div className="flex flex-col gap-2">
              <label className="text-slate-900 dark:text-slate-200 text-[10px] font-black uppercase">Usuario</label>
              <input 
                className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-12 px-4 text-sm outline-none border border-slate-300 dark:border-slate-600 rounded-lg shadow-sm focus:ring-2 focus:ring-primary/20" 
                placeholder="Nombre de usuario" 
                required 
                value={username} 
                onChange={e => setUsername(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-slate-900 dark:text-slate-200 text-[10px] font-black uppercase">Contraseña</label>
              <div className="relative">
                <input 
                  className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-12 px-4 text-sm outline-none border border-slate-300 dark:border-slate-600 rounded-lg shadow-sm focus:ring-2 focus:ring-primary/20" 
                  type={showPassword ? "text" : "password"} 
                  placeholder="••••••••" 
                  required 
                  value={password} 
                  onChange={e => setPassword(e.target.value)}
                  disabled={loading}
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-3 text-slate-400">
                  <span className="material-symbols-outlined text-[20px]">{showPassword ? "visibility" : "visibility_off"}</span>
                </button>
              </div>
            </div>
            <button 
              className={`flex w-full justify-center rounded-lg bg-primary px-4 py-3.5 text-sm font-black uppercase text-white shadow-lg hover:bg-blue-600 transition-all ${loading ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}`} 
              type="submit"
              disabled={loading}
            >
              {loading ? 'Sincronizando...' : 'Ingresar al Sistema'}
            </button>
          </form>
          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center italic">
              Conexión forzada vía HTTPS Polling (Office-Ready)
            </p>
            <p className="text-[9px] text-primary/70 font-bold text-center mt-2 cursor-pointer hover:underline" onClick={() => { setUsername('admin'); setPassword('Qwerty.123'); }}>
              Credenciales por defecto: admin / Qwerty.123
            </p>
          </div>
        </div>
      </div>

      {/* MODAL CONFIGURACIÓN CONEXIÓN */}
      {isConfigOpen && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
              <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-xl shadow-2xl overflow-hidden border border-slate-700">
                  <div className="bg-slate-800 text-white px-6 py-4 flex justify-between items-center">
                      <h3 className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                          <span className="material-symbols-outlined text-lg">settings_ethernet</span>
                          Configurar Backend (API)
                      </h3>
                      <button onClick={() => setIsConfigOpen(false)} className="hover:text-slate-300">
                          <span className="material-symbols-outlined">close</span>
                      </button>
                  </div>
                  <div className="p-6">
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                          Edite la configuración de conexión a la base de datos (Firebase). 
                          <br/><strong className="text-orange-500">Advertencia:</strong> Modificar esto cambiará el destino de los datos.
                      </p>
                      <label className="block text-[10px] font-black uppercase text-slate-400 mb-1">Configuración JSON</label>
                      <textarea 
                          className="w-full h-48 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded p-3 text-xs font-mono text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-primary"
                          value={configJson}
                          onChange={e => setConfigJson(e.target.value)}
                          spellCheck={false}
                      ></textarea>
                      <div className="flex justify-between items-center mt-6">
                          <button onClick={handleRestoreConfig} className="text-red-500 hover:text-red-600 text-[10px] font-black uppercase flex items-center gap-1">
                              <span className="material-symbols-outlined text-[14px]">history</span> Restaurar Default
                          </button>
                          <div className="flex gap-3">
                              <button onClick={() => setIsConfigOpen(false)} className="px-4 py-2 bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded text-xs font-black uppercase hover:bg-slate-300 dark:hover:bg-slate-700">Cancelar</button>
                              <button onClick={handleSaveConfig} className="px-4 py-2 bg-primary text-white rounded text-xs font-black uppercase hover:bg-blue-600 shadow-lg">Guardar y Recargar</button>
                          </div>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};
