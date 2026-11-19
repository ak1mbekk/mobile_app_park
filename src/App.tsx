import React from 'react';
import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import HomePage from './pages/HomePage';
import MapPage from './pages/MapPage';
import AnimalsPage from './pages/AnimalsPage';
import CalendarPage from './pages/CalendarPage';
import ShopPage from './pages/ShopPage';
import MorePage from './pages/MorePage';
import NewsPage from './pages/NewsPage';
import ProfilePage from './pages/ProfilePage';
import InfoPage from './pages/InfoPage';
import SettingsPage from './pages/SettingsPage';

function App() {
  const [query] = useSearchParams();
  const meeting = query.get('view') === '3d' ? '?view=3d' : '';
  return (
    <div className="h-full flex flex-col">
      <Routes>
        <Route path="/" element={<iframe title="Домик у тропы и парк животных" className="w-full h-full border-0" src={'./demo/index.html'+meeting} />} />
        <Route element={<AppLayout />}>
          <Route path="/guide" element={<HomePage />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/animals" element={<AnimalsPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/info" element={<InfoPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
