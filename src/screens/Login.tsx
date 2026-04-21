
import React, { useState } from 'react';
import { useNavigate } from 'react-router';
import { auth, db, currentConfig } from '../firebase';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocs, setDoc, query, collection, where } from 'firebase/firestore';
import { User } from '../types';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  // Linking state
  const [needsLinking, setNeedsLinking] = useState(false);
  const [googleUser, setGoogleUser] = useState<any>(null);
  const [linkUsername, setLinkUsername] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Classic Login Fallback
  const [useClassicLogin, setUseClassicLogin] = useState(false);
  const [classicUsername, setClassicUsername] = useState('');
  const [classicPassword, setClassicPassword] = useState('');

  // Config Modal State
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [configJson, setConfigJson] = useState('');

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError('');
    
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      const user = result.user;
      
      const qUid = query(collection(db, 'usuarios'), where('uid', '==', user.uid));
      const snapUid = await getDocs(qUid);
      
      if (!snapUid.empty) {
          const userDoc = snapUid.docs[0].data() as User;
          localStorage.setItem('currentUser', JSON.stringify(userDoc));
          navigate('/dashboard');
          return;
      }
      
      const qEmail = query(collection(db, 'usuarios'), where('email', '==', user.email));
      const snapEmail = await getDocs(qEmail);
      
      if (!snapEmail.empty) {
          const userDoc = snapEmail.docs[0].data() as User;
          await setDoc(doc(db, 'usuarios', snapEmail.docs[0].id), { 
              uid: user.uid 
          }, { merge: true });
          
          const finalUser = { ...userDoc, uid: user.uid };
          localStorage.setItem('currentUser', JSON.stringify(finalUser));
          navigate('/dashboard');
          return;
      }
      
      setGoogleUser(user);
      setNeedsLinking(true);
      
    } catch (err: any) {
      if (err.code === 'auth/configuration-not-found') {
          setError('⚠️ REPARACIÓN REQUERIDA POR EL ADMINISTRADOR: Debes entrar a console.firebase.google.com -> Proyecto gestion-de-expedientes-7ce57 -> "Authentication" -> "Sign-in method" -> Habilitar "Google". Usa el ingreso clásico aquí abajo.');
          setUseClassicLogin(true);
      } else {
          setError('Error al iniciar sesión con Google. ' + (err.code || err.message || ''));
      }
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleLinkAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
        const normalizedUser = linkUsername.toLowerCase().trim();
        const q = query(
          collection(db, 'usuarios'), 
          where('username', '==', normalizedUser)
        );
        
        const snapshot = await getDocs(q);
        
        if (!snapshot.empty) {
            const docSnap = snapshot.docs[0];
            const userDoc = docSnap.data() as User;
            
            if (userDoc.password === linkPassword) {
                const userRef = doc(db, 'usuarios', docSnap.id);
                await setDoc(userRef, {
                    email: googleUser.email,
                    uid: googleUser.uid,
                }, { merge: true });
                
                const finalUser = { ...userDoc, email: googleUser.email, uid: googleUser.uid };
                localStorage.setItem('currentUser', JSON.stringify(finalUser));
                navigate('/dashboard');
            } else {
                setError('Contraseña incorrecta de la cuenta anterior.');
            }
        } else {
            setError('No se encontró la cuenta antigua proporcionada.');
        }
    } catch (err: any) {
        setError('Error al vincular: ' + (err.message || ''));
        console.error(err);
    } finally {
        setLoading(false);
    }
  };

  const handleClassicLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const normalizedUser = classicUsername.toLowerCase().trim();
      const q = query(collection(db, 'usuarios'), where('username', '==', normalizedUser));
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        const userDoc = snapshot.docs[0].data() as User;
        if (userDoc.password === classicPassword) {
          localStorage.setItem('currentUser', JSON.stringify(userDoc));
          navigate('/dashboard');
        } else {
          setError('Contraseña incorrecta.');
        }
      } else {
        setError('Usuario no encontrado.');
      }
    } catch (err) {
      setError('Problema de red o conectividad.');
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
            <p className="max-w-xl text-lg font-medium text-slate-100">Acceso seguro con Google sincronizado en tiempo real.</p>
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
            <p className="text-slate-900 dark:text-white text-3xl font-black tracking-tight">{needsLinking ? 'Vincular Cuenta' : 'Acceso Oficina'}</p>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-widest">
                {needsLinking ? 'Conecte su usuario existente a Google' : 'Ingrese usando su cuenta de Google'}
            </p>
          </div>
          <div className="space-y-6">
            {error && <div className="bg-red-50 text-red-600 p-3 rounded text-xs font-bold border border-red-100 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">error</span>
              {error}
            </div>}
            
            {!needsLinking ? (
              !useClassicLogin ? (
                <>
                  <button 
                    onClick={handleGoogleSignIn}
                    className={`flex w-full items-center justify-center gap-3 rounded-lg bg-white dark:bg-slate-800 px-4 py-3.5 text-sm font-black uppercase text-slate-700 dark:text-white border border-slate-300 dark:border-slate-600 shadow hover:bg-slate-50 dark:hover:bg-slate-700 transition-all ${loading ? 'opacity-50 cursor-not-allowed' : 'active:scale-95'}`} 
                    type="button"
                    disabled={loading}
                  >
                    <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5"/>
                    {loading ? 'Acreditando ID...' : 'Ingresar con Google'}
                  </button>
                  <button 
                    type="button"
                    onClick={() => setUseClassicLogin(true)}
                    className="w-full mt-4 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 underline underline-offset-2"
                  >
                    Problemas con el servidor? Ingreso Clásico
                  </button>
                </>
              ) : (
                <form onSubmit={handleClassicLogin} className="space-y-6">
                    <div className="flex flex-col gap-2">
                      <label className="text-slate-900 dark:text-slate-200 text-[10px] font-black uppercase">Usuario</label>
                      <input 
                        className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-12 px-4 text-sm outline-none border border-slate-300 dark:border-slate-600 rounded-lg shadow-sm focus:ring-2 focus:ring-primary/20" 
                        placeholder="Nombre de usuario" 
                        required 
                        value={classicUsername} 
                        onChange={e => setClassicUsername(e.target.value)}
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
                          value={classicPassword} 
                          onChange={e => setClassicPassword(e.target.value)}
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
                      {loading ? 'Ingresando...' : 'Entrar Clásico'}
                    </button>
                    <button 
                        type="button" 
                        onClick={() => { setUseClassicLogin(false); setError(''); }} 
                        className="w-full text-center text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mt-2"
                        disabled={loading}
                    >
                        Volver a Google Auth
                    </button>
                </form>
              )
            ) : (
                <form onSubmit={handleLinkAccount} className="space-y-6">
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded text-xs font-medium border border-blue-100 dark:border-blue-900/30">
                        Se ha detectado un ingreso exitoso con Google pero <strong>no encontramos una cuenta asociada</strong>. Por favor, 
                        ingrese su antiguo Usuario y Contraseña para vincularlos.
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-slate-900 dark:text-slate-200 text-[10px] font-black uppercase">Antiguo Usuario</label>
                      <input 
                        className="w-full bg-white dark:bg-slate-800 text-slate-900 dark:text-white h-12 px-4 text-sm outline-none border border-slate-300 dark:border-slate-600 rounded-lg shadow-sm focus:ring-2 focus:ring-primary/20" 
                        placeholder="admin, gabriel, etc." 
                        required 
                        value={linkUsername} 
                        onChange={e => setLinkUsername(e.target.value)}
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
                          value={linkPassword} 
                          onChange={e => setLinkPassword(e.target.value)}
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
                      {loading ? 'Vinculando...' : 'Vincular y Entrar'}
                    </button>
                    <button 
                        type="button" 
                        onClick={() => { setNeedsLinking(false); setError(''); }} 
                        className="w-full text-center text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mt-2"
                        disabled={loading}
                    >
                        Cancelar
                    </button>
                </form>
            )}
          </div>
          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center italic">
              Autenticación Segura y Cifrada por Google
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
