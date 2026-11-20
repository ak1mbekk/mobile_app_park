import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function VisitorMapPage() {
  const frame = useRef<HTMLIFrameElement>(null);
  const navigate = useNavigate();
  const { hash } = useLocation();
  const mapHash = /^#map(?:\/|$)/.test(hash) ? hash : '#map';

  useEffect(() => {
    function returnToGuide(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === 'animal-park:map-back') navigate('/guide', { replace: true });
    }
    window.addEventListener('message', returnToGuide);
    return () => window.removeEventListener('message', returnToGuide);
  }, [navigate]);

  return <iframe
    ref={frame}
    className="block h-full w-full border-0"
    src={import.meta.env.BASE_URL + 'demo/index.html?layout=map' + mapHash}
    title="Карта парка животных"
  />;
}
