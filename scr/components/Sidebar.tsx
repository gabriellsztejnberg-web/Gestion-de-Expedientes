
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { User } from '../types';
import { db } from '../firebase';
import { collection, onSnapshot, limit, query, doc, updateDoc } from 'firebase/firestore';

interface SidebarProps {
  activePage: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ activePage }) => {
  const navigate = useNavigate();
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const currentUser: User = JSON.parse(localStorage.getItem('currentUser') || '{"name":"Invitado","role":"operador"}');

  useEffect(() => {
    const q = query(collection(db, 'usuarios'), limit(1));
    const unsubscribe = onSnapshot(q, 
      () => setIsConnected(true),
      () => setIsConnected(false)
    );
    return () => unsubscribe();
  }, []);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 3) {
      alert("La contraseña debe tener al menos 3 caracteres.");
      return;
    }
    try {
      await updateDoc(doc(db, 'usuarios', currentUser.id), {
        password: newPassword
      });
      alert("Contraseña actualizada con éxito.");
      setIsPasswordModalOpen(false);
      setNewPassword('');
    } catch (err) {
      console.error(err);
      alert("Error al actualizar la contraseña en la nube.");
    }
  };

  const navItems = [
    { id: 'dashboard', icon: 'dashboard', label: 'Tablero', path: '/dashboard' },
    { id: 'expedientes', icon: 'inventory_2', label: 'Expedientes', path: '/expedientes' },
    { id: 'reportes', icon: 'description', label: 'Reportes DPAM', path: '/reportes' },
    { id: 'timeline', icon: 'history', label: 'Historial Gral', path: '/timeline' },
  ];

  if (currentUser.role === 'jefe') {
    navItems.push({ id: 'users', icon: 'badge', label: 'Personal DPAM', path: '/users' });
  }

  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    navigate('/');
  };

  return (
    <>
      <aside className="w-64 flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15202b] transition-colors duration-200 hidden md:flex flex-shrink-0 h-screen sticky top-0">
        <div className="p-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-slate-900 dark:text-white text-base font-black leading-tight tracking-tight flex items-center gap-2 uppercase">
              <span className="material-symbols-outlined text-primary">factory</span>
              Gestión DPAM
            </h1>
            <div className="flex items-center gap-1.5 mt-1">
              <div className={`size-1.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
              <p className="text-slate-500 dark:text-slate-400 text-[9px] font-bold uppercase tracking-wider">
                {isConnected ? 'Sincronizado' : 'Desconectado'}
              </p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-4 flex flex-col gap-1 overflow-y-auto">
          {navItems.map((item) => (
            <Link
              key={item.id}
              to={item.path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group ${
                activePage === item.id
                  ? 'bg-primary/10 text-primary dark:text-blue-400'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              <span className={`material-symbols-outlined ${activePage === item.id ? 'fill-1' : ''}`}>{item.icon}</span>
              <p className={`text-sm ${activePage === item.id ? 'font-bold' : 'font-medium'}`}>{item.label}</p>
            </Link>
          ))}
          
          <button
            onClick={() => setIsPasswordModalOpen(true)}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors group mt-2 text-left"
          >
            <span className="material-symbols-outlined">key</span>
            <p className="text-sm font-medium">Cambiar Mi Clave</p>
          </button>

          <button
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors group mt-2 w-full text-left"
          >
            <span className="material-symbols-outlined">logout</span>
            <p className="text-sm font-medium">Cerrar Sesión</p>
          </button>
        </nav>
        <div className="p-4 mt-auto border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-xl">
            <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs font-black uppercase">
              {currentUser.name?.charAt(0)}
            </div>
            <div className="flex flex-col overflow-hidden">
              <p className="text-xs font-black text-slate-900 dark:text-white truncate uppercase tracking-tighter">{currentUser.name}</p>
              <p className="text-[9px] text-slate-500 dark:text-slate-400 uppercase font-bold">{currentUser.role === 'jefe' ? 'Jefe Oficina' : 'Operador'}</p>
            </div>
          </div>
        </div>
      </aside>

      {isPasswordModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-sm overflow-hidden border border-slate-200 dark:border-slate-800">
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
              <span className="text-xs font-black uppercase tracking-widest">Seguridad: Nueva Clave</span>
              <button onClick={() => setIsPasswordModalOpen(false)}><span className="material-symbols-outlined">close</span></button>
            </div>
            <form onSubmit={handlePasswordChange} className="p-6 space-y-4">
              <div>
                <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Escriba su nueva contraseña</label>
                <input 
                  required 
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none focus:ring-1 focus:ring-primary" 
                />
              </div>
              <button type="submit" className="w-full py-3 bg-primary text-white text-xs font-black uppercase rounded shadow-lg hover:bg-blue-600 transition-all">Guardar Cambios</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
