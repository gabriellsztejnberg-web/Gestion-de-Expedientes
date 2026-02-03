
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '../firebase';
import { collection, getDocs, query, where, setDoc, doc } from 'firebase/firestore';
import { User } from '../types';

export const Login: React.FC = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const seedInitialUsers = async () => {
      const q = query(collection(db, 'usuarios'));
      const snapshot = await getDocs(q);
      
      if (snapshot.empty) {
        // Si no hay usuarios en la nube, sembramos los básicos
        const initialUsers = [
          { id: 'admin-id', username: 'ADMIN', name: 'Administrador Sistema', password: 'Qwerty.123', role: 'jefe' },
          { id: 'gabriel-id', username: 'gabriel', name: 'Gabriel', password: '123', role: 'jefe' }
        ];
        for (const u of initialUsers) {
          await setDoc(doc(db, 'usuarios', u.id), u);
        }
      }
    };
    seedInitialUsers();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const q = query(
        collection(db, 'usuarios'), 
        where('username', '==', username.toUpperCase().trim())
      );
      // Fallback para minúsculas si no coincide exacto (case insensitive manual)
      const qAlt = query(
        collection(db, 'usuarios'), 
        where('username', '==', username.toLowerCase().trim())
      );
      
      let snapshot = await getDocs(q);
      if (snapshot.empty) snapshot = await getDocs(qAlt);

      if (!snapshot.empty) {
        const userDoc = snapshot.docs[0].data() as User;
        if (userDoc.password === password) {
          localStorage.setItem('currentUser', JSON.stringify(userDoc));
          navigate('/dashboard');
        } else {
          setError('Contraseña incorrecta.');
        }
      } else {
        setError('El usuario no existe.');
      }
    } catch (err) {
      setError('Error de conexión con el servidor.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full flex-1">
      <div className="relative hidden w-0 flex-1 lg:block">
        <div className="absolute inset-0 h-full w-full bg-slate-900">
          <img alt="Muelle" className="absolute inset-0 h-full w-full object-cover opacity-60 mix-blend-overlay" src="https://images.unsplash.com/photo-1516937941344-00b4e0337589?ixlib=rb-4.0.3&auto=format&fit=crop&w=1200&q=80"/>
          <div className="absolute inset-0 bg-blue-900/30 mix-blend-multiply"></div>
          <div className="absolute inset-0 flex flex-col justify-end p-12 text-white">
            <h2 className="text-3xl font-black uppercase tracking-tight flex items-center gap-2">
              <span className="material-symbols-outlined text-4xl">water_damage</span>
              División Planes - DPAM Cloud
            </h2>
            <p className="max-w-xl text-lg font-medium text-slate-100">Sistema de gestión centralizado en la nube.</p>
          </div>
        </div>
      </div>
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:px-20 xl:px-24 bg-background-light dark:bg-background-dark">
        <div className="mx-auto w-full max-w-sm lg:w-96">
          <div className="flex flex-col gap-2 mb-8 text-center lg:text-left">
            <p className="text-slate-900 dark:text-white text-3xl font-black tracking-tight">Acceso Oficina</p>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-widest">Ingrese sus credenciales</p>
          </div>
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && <div className="bg-red-50 text-red-600 p-3 rounded text-xs font-bold border border-red-100">{error}</div>}
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
              {loading ? 'Conectando...' : 'Ingresar al Sistema'}
            </button>
          </form>
          <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest text-center italic">
              Conexión encriptada con Firebase Firestore
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
