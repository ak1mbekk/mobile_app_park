import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import AppLayout from './components/layout/AppLayout';
import HomePage from './pages/HomePage';
import VisitorMapPage from './pages/VisitorMapPage';
import AnimalsPage from './pages/AnimalsPage';
import CalendarPage from './pages/CalendarPage';
import ShopPage from './pages/ShopPage';
import MorePage from './pages/MorePage';
import NewsPage from './pages/NewsPage';
import InfoPage from './pages/InfoPage';
import SettingsPage from './pages/SettingsPage';

const MapPage = lazy(() => import('./pages/MapPage'));

type DemoWindow = Window & {
  conceptReplace?: (route: string) => void;
  conceptStart?: () => void;
  captureParkGameNavigation?: (forReload?: boolean) => void;
};

type GuideNavigation = {
  hostUrl: string;
  hash: string;
  gameReturn?: string;
  parkOrigins?: Record<string, string>;
  catalogState?: { query: string; group: string; card: string };
  nativeReturn?: { location: string } | null;
};

const nativeReloadKey = 'animal-park-native-reload';

function nativeReloadNavigation(): GuideNavigation | undefined {
  const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  if (navigation?.type !== 'reload') return;
  try {
    const saved = JSON.parse(sessionStorage.getItem(nativeReloadKey) ?? 'null');
    return saved?.hash === '#home' && saved?.hostUrl === window.location.href ? saved : undefined;
  } catch {}
}

function demoHash(hash: string, profile: boolean) {
  const route = hash.replace(/^#\//, '#');
  return /^#(?:park|animals|visitor|tours|directions|pass|animal|(?:map|feed|species|richi)(?:\/[^#]+)?)$/.test(route) ? route : profile ? '#park' : '';
}

function DemoEntry({ search, hash, profile }: { search: string; hash: string; profile: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const requested = useRef(hash);
  const pending = useRef(false);
  const [startup] = useState(() => {
    const entry = window.history.state?.animalParkGuide as GuideNavigation | undefined;
    const currentGuide = entry?.hostUrl === window.location.href && typeof entry.hash === 'string' && demoHash(entry.hash, false);
    const saved = currentGuide ? entry : nativeReloadNavigation() ?? entry;
    const resume = !profile && saved?.hostUrl === window.location.href &&
      typeof saved.hash === 'string' && (demoHash(saved.hash, false) || saved.hash === '#home')
      ? saved : undefined;
    return { source: import.meta.env.BASE_URL + 'demo/index.html' + search + (resume?.hash ?? hash), resume };
  });

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

  const saveGuideNavigation = useCallback(() => {
    const child = frame.current?.contentWindow;
    if (!child || pending.current || window.location.protocol === 'file:' || profile) return;
    const { gameReturn, parkOrigins, nativeReturn, catalogState } = child.history.state ?? {};
    const hash = demoHash(child.location.hash, false) || (child.location.hash === '#home' && nativeReturn ? '#home' : '');
    const { animalParkGuide, ...rest } = window.history.state ?? {};
    if (!hash) {
      if (animalParkGuide) window.history.replaceState(rest, '');
      return;
    }
    const snapshot: GuideNavigation = { hostUrl: window.location.href, hash, gameReturn, parkOrigins, nativeReturn, catalogState };
    window.history.replaceState({ ...rest, animalParkGuide: snapshot }, '');
  }, [profile]);

  function loadFrame() {
    applyFragment();
    if (frame.current?.contentDocument) saveGuideNavigation();
  }

  useEffect(() => {
    try { sessionStorage.removeItem(nativeReloadKey); } catch {}
    function onGuideTransition(event: Event) {
      if (event.target !== frame.current) return;
      saveGuideNavigation();
      event.preventDefault();
    }
    function onGuideNavigation(event: MessageEvent) {
      if (event.origin === window.location.origin && event.source === frame.current?.contentWindow &&
          event.data === 'animal-park:guide-navigation') {
        saveGuideNavigation();
      }
    }
    function onPageHide() {
      if (!frame.current?.contentDocument) return;
      const child = frame.current.contentWindow as DemoWindow | null;
      child?.captureParkGameNavigation?.(true);
      saveGuideNavigation();
    }
    window.addEventListener('animal-park:guide-navigation', onGuideTransition);
    window.addEventListener('message', onGuideNavigation);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      window.removeEventListener('animal-park:guide-navigation', onGuideTransition);
      window.removeEventListener('message', onGuideNavigation);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [saveGuideNavigation]);

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
    src={startup.source}
    data-guide-navigation={startup.resume && JSON.stringify(startup.resume)}
    onLoad={loadFrame}
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
          <Route path="/map/editor" element={<Suspense fallback={<p role="status">Загружаем редактор карты…</p>}><MapPage /></Suspense>} />
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
