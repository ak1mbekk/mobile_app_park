import { useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import HomePage from './pages/HomePage';
import MapPage from './pages/MapPage';
import VisitorMapPage from './pages/VisitorMapPage';
import AnimalsPage from './pages/AnimalsPage';
import CalendarPage from './pages/CalendarPage';
import ShopPage from './pages/ShopPage';
import MorePage from './pages/MorePage';
import NewsPage from './pages/NewsPage';
import InfoPage from './pages/InfoPage';
import SettingsPage from './pages/SettingsPage';

type DemoWindow = Window & {
  conceptReplace?: (route: string) => void;
  conceptStart?: () => void;
};

function demoHash(hash: string, profile: boolean) {
  const route = hash.replace(/^#\//, '#');
  return /^#(?:park|map(?:\/[^#]+)?)$/.test(route) ? route : profile ? '#park' : '';
}

function DemoEntry({ search, hash, profile }: { search: string; hash: string; profile: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const requested = useRef(hash);
  const pending = useRef(false);
  const [source] = useState(() => import.meta.env.BASE_URL + 'demo/index.html' + search + hash);

  function applyFragment() {
    if (!pending.current || !frame.current?.contentDocument) return;
    const child = frame.current?.contentWindow as DemoWindow | null;
    if (!child?.conceptReplace || !child.conceptStart) return;
    const target = requested.current;
    pending.current = false;
    if (child.location.hash === target) return;
    if (target) {
      // The outer navigation already created a browser history entry.
      child.conceptReplace(target.slice(1));
    } else {
      const url = new URL(child.location.href);
      url.hash = '';
      child.history.replaceState(child.history.state, '', url);
      child.conceptStart();
    }
  }

  useEffect(() => {
    function sync(target: string) {
      if (requested.current === target) return;
      requested.current = target;
      pending.current = true;
      applyFragment();
    }
    sync(hash);
    if (window.location.protocol === 'file:') return;
    const onHashChange = () => sync(demoHash(window.location.hash, profile));
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, [hash, profile]);

  return <iframe
    ref={frame}
    title="Домик у тропы и парк животных"
    className="w-full h-full border-0"
    src={source}
    onLoad={applyFragment}
  />;
}

function App() {
  const [query] = useSearchParams();
  const { hash } = useLocation();
  const view = query.get('view');
  const profile = query.get('panel') === 'profile';
  const params = new URLSearchParams();
  if (view === '2d' || view === '3d') params.set('view', view);
  if (profile) params.set('panel', 'profile');
  const options = params.toString();
  const search = options ? '?' + options : '';
  const fragment = demoHash(hash, profile);
  params.set('panel', 'profile');
  const profileAddress = '/?' + params + demoHash(hash, false);
  return (
    <div className="h-full flex flex-col">
      <Routes>
        <Route path="/" element={<DemoEntry key={search} search={search} hash={fragment} profile={profile} />} />
        <Route path="/animals" element={<iframe title="Животные парка" className="w-full h-full border-0" src={import.meta.env.BASE_URL + 'demo/index.html#animals'} />} />
        <Route element={<AppLayout />}>
          <Route path="/guide" element={<HomePage />} />
          <Route path="/map" element={<VisitorMapPage />} />
          <Route path="/map/editor" element={<MapPage />} />
          <Route path="/animals/synced" element={<AnimalsPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/shop" element={<ShopPage />} />
          <Route path="/more" element={<MorePage />} />
          <Route path="/news" element={<NewsPage />} />
          <Route path="/profile" element={<Navigate replace to={profileAddress} />} />
          <Route path="/info" element={<InfoPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

export default App;
