
import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
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
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
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
      alert("Mínimo 3 caracteres.");
      return;
    }
    try {
      await updateDoc(doc(db, 'usuarios', currentUser.id), { password: newPassword });
      alert("Contraseña actualizada.");
      setIsPasswordModalOpen(false);
      setNewPassword('');
    } catch (err) {
      alert("Error al actualizar clave.");
    }
  };

  const navItems = [
    { id: 'dashboard', icon: 'dashboard', label: 'Tablero', path: '/dashboard' },
    { id: 'asistencia', icon: 'schedule', label: 'Control Horario', path: '/asistencia' },
    { id: 'expedientes', icon: 'inventory_2', label: 'Expedientes', path: '/expedientes' },
    { id: 'planes', icon: 'safety_check', label: 'Planes Emergencia', path: '/planes' },
    { id: 'derrames', icon: 'water_drop', label: 'Control Derrames', path: '/derrames' },
    { id: 'mapa', icon: 'map', label: 'SIG - Mapa', path: '/mapa' },
    { id: 'inspecciones', icon: 'assignment', label: 'Inspecciones', path: '/inspecciones' },
    { id: 'auditores', icon: 'engineering', label: 'Auditores Habilitados', path: '/auditores' },
    { id: 'reportes', icon: 'description', label: 'Reportes DPAM', path: '/reportes' },
    { id: 'timeline', icon: 'checklist_rtl', label: 'Tareas / Pendientes', path: '/timeline' },
  ];

  // Validación de rol ultra-flexible para evitar bloqueos
  const role = (currentUser.role || '').toLowerCase();
  const isJefe = role === 'jefe' || role === 'admin' || role === 'administrator';
  const isSuperior = role === 'superior';

  if (isJefe) {
    navItems.push({ id: 'users', icon: 'badge', label: 'Personal DPAM', path: '/users' });
    navItems.push({ id: 'configuracion', icon: 'settings_backup_restore', label: 'Respaldo de Datos', path: '/configuracion' });
  }

  // Filtrar items para el rol "superior"
  const filteredNavItems = isSuperior 
    ? navItems.filter(item => item.id !== 'asistencia' && item.id !== 'users' && item.id !== 'auditores' && item.id !== 'configuracion')
    : navItems;

  const handleLogout = () => {
    localStorage.removeItem('currentUser');
    navigate('/');
  };

  return (
    <>
      {/* Mobile Toggle Button */}
      <button
        onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        className="md:hidden fixed top-4 right-4 z-[60] p-2 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg shadow-lg border border-slate-200 dark:border-slate-700 transition-colors hover:bg-slate-50 dark:hover:bg-slate-700"
        aria-label="Toggle Menu"
      >
        <span className="material-symbols-outlined">
          {isMobileMenuOpen ? 'close' : 'menu'}
        </span>
      </button>

      {/* Overlay for mobile */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 md:hidden backdrop-blur-sm transition-opacity"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside className={`
        w-64 flex flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#15202b] transition-transform duration-300 ease-in-out
        fixed inset-y-0 left-0 z-50 h-screen
        md:relative md:translate-x-0
        ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="p-6">
          <div className="flex flex-col gap-1">
            <h1 className="text-slate-900 dark:text-white text-base font-black leading-tight tracking-tight flex items-center gap-2 uppercase">
              <span className="material-symbols-outlined text-primary">factory</span>
              Gestión DPAM
            </h1>
            <div className="flex items-center gap-1.5 mt-1">
              <div className={`size-1.5 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></div>
              <p className="text-slate-500 dark:text-slate-400 text-[9px] font-bold uppercase tracking-wider">
                {isConnected ? 'En Línea' : 'Desconectado'}
              </p>
            </div>
          </div>
        </div>
        <nav className="flex-1 px-4 flex flex-col gap-1 overflow-y-auto">
          {filteredNavItems.map((item) => (
            <Link 
              key={item.id} 
              to={item.path} 
              onClick={() => setIsMobileMenuOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${activePage === item.id ? 'bg-primary/10 text-primary dark:text-blue-400' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >
              <span className="material-symbols-outlined">{item.icon}</span>
              <p className="text-sm font-bold uppercase tracking-tighter">{item.label}</p>
            </Link>
          ))}
          <button onClick={() => setIsPasswordModalOpen(true)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors mt-2 text-left">
            <span className="material-symbols-outlined">key</span>
            <p className="text-sm font-bold uppercase tracking-tighter">Cambiar Mi Clave</p>
          </button>
          <button onClick={handleLogout} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors mt-2 text-left">
            <span className="material-symbols-outlined">logout</span>
            <p className="text-sm font-bold uppercase tracking-tighter">Cerrar Sesión</p>
          </button>
        </nav>
        <div className="p-4 mt-auto border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800/50 p-2 rounded-xl">
            <div className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs font-black uppercase">
              {currentUser.name?.charAt(0)}
            </div>
            <div className="flex flex-col">
              <p className="text-xs font-black text-slate-900 dark:text-white uppercase">{currentUser.name}</p>
              <p className="text-[9px] text-slate-500 uppercase font-bold">{currentUser.role}</p>
            </div>
          </div>
        </div>
      </aside>

      {isPasswordModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-sm border border-slate-200 dark:border-slate-800">
            <div className="bg-slate-900 text-white px-6 py-4 flex justify-between items-center">
              <span className="text-xs font-black uppercase tracking-widest">Seguridad</span>
              <button onClick={() => setIsPasswordModalOpen(false)}><span className="material-symbols-outlined">close</span></button>
            </div>
            <form onSubmit={handlePasswordChange} className="p-6 space-y-4">
              <input required type="password" placeholder="Nueva Contraseña" value={newPassword} onChange={e => setNewPassword(e.target.value)} className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 dark:border-slate-700 outline-none focus:ring-1 focus:ring-primary" />
              <button type="submit" className="w-full py-3 bg-primary text-white text-xs font-black uppercase rounded">Guardar Clave</button>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
