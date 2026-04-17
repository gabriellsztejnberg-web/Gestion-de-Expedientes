
import React from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Dashboard } from './screens/Dashboard';
import { Login } from './screens/Login';
import { Expedientes } from './screens/Expedientes';
import { Reports } from './screens/Reports';
import { Timeline } from './screens/Timeline';
import { Users } from './screens/Users';
import { Auditores } from './screens/Auditores';
import { Inspecciones } from './screens/Inspecciones';
import { Planes } from './screens/Planes';
import { Derrames } from './screens/Derrames';
import { Mapa } from './screens/Mapa';
import { Asistencia } from './screens/Asistencia';
import { Configuracion } from './screens/Configuracion';

const App: React.FC = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/asistencia" element={<Asistencia />} />
        <Route path="/expedientes" element={<Expedientes />} />
        <Route path="/planes" element={<Planes />} />
        <Route path="/derrames" element={<Derrames />} />
        <Route path="/mapa" element={<Mapa />} />
        <Route path="/auditores" element={<Auditores />} />
        <Route path="/inspecciones" element={<Inspecciones />} />
        <Route path="/reportes" element={<Reports />} />
        <Route path="/timeline" element={<Timeline />} />
        <Route path="/users" element={<Users />} />
        <Route path="/configuracion" element={<Configuracion />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </HashRouter>
  );
};

export default App;

