import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import MapPage from './pages/MapPage';

function App() {
  return (
    <div className="h-full flex flex-col">
      <Routes>
        <Route path="/" element={<MapPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
