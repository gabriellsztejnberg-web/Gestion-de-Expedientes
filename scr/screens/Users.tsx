
import React, { useState, useEffect } from 'react';
import { Sidebar } from '../components/Sidebar';
import { db } from '../firebase';
import { 
  collection, 
  onSnapshot, 
  setDoc, 
  doc, 
  deleteDoc, 
  updateDoc 
} from 'firebase/firestore';
import { User, UserRole } from '../types';

export const Users: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newUser, setNewUser] = useState<Partial<User>>({ role: 'operador' });
  const currentUser: User = JSON.parse(localStorage.getItem('currentUser') || '{}');

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'usuarios'), (snapshot) => {
      setUsers(snapshot.docs.map(d => d.data() as User));
    });
    return () => unsubscribe();
  }, []);

  if (currentUser.role !== 'jefe') {
    return <div className="p-10 text-center font-bold uppercase">Acceso Denegado: Solo el Jefe puede gestionar usuarios.</div>;
  }

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = Math.random().toString(36).substr(2, 9);
    const userToSave: User = {
      id,
      username: (newUser.username || '').trim().toLowerCase(),
      name: (newUser.name || '').trim(),
      password: newUser.password || '1234',
      role: (newUser.role as UserRole) || 'operador'
    };
    
    await setDoc(doc(db, 'usuarios', id), userToSave);
    setIsModalOpen(false);
    setNewUser({ role: 'operador' });
  };

  const resetPassword = async (id: string) => {
    const pass = prompt("Ingrese la nueva contraseña:");
    if (!pass) return;
    await updateDoc(doc(db, 'usuarios', id), { password: pass });
    alert("Contraseña restablecida.");
  };

  const deleteUser = async (id: string) => {
    if (id === currentUser.id) return alert("No puedes borrarte a ti mismo.");
    if (!confirm("¿Seguro quieres eliminar este usuario?")) return;
    await deleteDoc(doc(db, 'usuarios', id));
  };

  return (
    <div className="flex h-screen w-full bg-background-light dark:bg-background-dark overflow-hidden font-display">
      <Sidebar activePage="users" />
      <div className="flex-1 flex flex-col h-full overflow-hidden p-6 md:p-10">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-slate-900 dark:text-white text-3xl font-black uppercase tracking-tight">Personal Cloud</h1>
            <p className="text-slate-500 dark:text-slate-400 text-xs font-bold uppercase tracking-widest">Gestión de accesos en la nube</p>
          </div>
          <button onClick={() => setIsModalOpen(true)} className="bg-primary text-white px-6 py-3 rounded-lg font-black uppercase text-xs shadow-lg hover:bg-blue-600 transition-all flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            Nuevo Integrante
          </button>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden flex-1 flex flex-col">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-800">
              <tr className="border-b border-slate-200 dark:border-slate-700">
                <th className="px-6 py-4 font-black uppercase tracking-widest text-slate-500">Nombre</th>
                <th className="px-6 py-4 font-black uppercase tracking-widest text-slate-500">Usuario</th>
                <th className="px-6 py-4 font-black uppercase tracking-widest text-slate-500">Rol</th>
                <th className="px-6 py-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 overflow-y-auto">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-6 py-4 font-bold text-slate-700 dark:text-white">{u.name}</td>
                  <td className="px-6 py-4 font-mono">{u.username}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-0.5 rounded-full font-black uppercase text-[9px] border ${u.role === 'jefe' ? 'bg-purple-100 text-purple-700 border-purple-200' : 'bg-blue-100 text-blue-700 border-blue-200'}`}>
                      {u.role === 'jefe' ? 'Jefe' : 'Operador'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right flex justify-end gap-2">
                    <button onClick={() => resetPassword(u.id)} className="text-slate-400 hover:text-primary p-1">
                      <span className="material-symbols-outlined text-[18px]">lock_reset</span>
                    </button>
                    <button onClick={() => deleteUser(u.id)} className="text-slate-400 hover:text-red-500 p-1">
                      <span className="material-symbols-outlined text-[18px]">delete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isModalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200">
              <div className="bg-slate-900 text-white px-6 py-4 border-b flex justify-between items-center uppercase tracking-widest text-xs font-black">
                Cargar Integrante
                <button onClick={() => setIsModalOpen(false)}><span className="material-symbols-outlined">close</span></button>
              </div>
              <form onSubmit={handleSaveUser} className="p-6 space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Nombre Real</label>
                  <input required className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 outline-none" onChange={e => setNewUser({...newUser, name: e.target.value})} />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Nombre de Usuario</label>
                  <input required className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 outline-none" onChange={e => setNewUser({...newUser, username: e.target.value})} />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Contraseña</label>
                  <input required type="password" placeholder="1234" className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 outline-none" onChange={e => setNewUser({...newUser, password: e.target.value})} />
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-500 mb-1">Rol</label>
                  <select className="w-full px-3 py-2 text-sm border rounded dark:bg-slate-800 outline-none" value={newUser.role} onChange={e => setNewUser({...newUser, role: e.target.value as UserRole})}>
                    <option value="operador">Operador DPAM</option>
                    <option value="jefe">Jefe de Oficina</option>
                  </select>
                </div>
                <button type="submit" className="w-full py-3 bg-primary text-white text-xs font-black uppercase rounded shadow-lg mt-4 hover:bg-blue-600">Guardar en la Nube</button>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
