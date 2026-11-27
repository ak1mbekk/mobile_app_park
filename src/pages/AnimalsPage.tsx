import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import PageLayout from '../components/layout/PageLayout';
import EmptyState from '../components/ui/EmptyState';
import { getLocalAnimals } from '../utils/localAnimals';
import { loadAnimalsFromSite, type SiteAnimal } from '../data/animalsFromSite';
import { PawIcon, MapPinIcon } from '../components/icons';

type AnimalItem =
  | { source: 'api'; id: string; name: string; photo?: string | null; hasCoords: true }
  | { source: 'site'; id: string; name: string; url: string };

export default function AnimalsPage() {
  const apiAnimals = getLocalAnimals();
  const hasApiAnimals = apiAnimals.length > 0;
  const [siteAnimals, setSiteAnimals] = useState<SiteAnimal[] | null>(null);
  useEffect(() => {
    if (hasApiAnimals) return;
    const controller = new AbortController();
    loadAnimalsFromSite(controller.signal).then(setSiteAnimals, () => {
      if (!controller.signal.aborted) setSiteAnimals([]);
    });
    return () => controller.abort();
  }, [hasApiAnimals]);

  const animals = useMemo((): AnimalItem[] => {
    if (apiAnimals.length > 0) {
      return apiAnimals.map((a) => ({
        source: 'api' as const,
        id: a.id,
        name: a.name,
        photo: a.photo,
        hasCoords: true,
      }));
    }
    return (siteAnimals ?? []).map((a) => ({
      source: 'site' as const,
      id: a.id,
      name: a.name,
      url: a.url,
    }));
  }, [apiAnimals, siteAnimals]);

  return (
    <div className="max-w-[480px] mx-auto h-full flex flex-col min-h-0">
      <PageLayout title="Животные" subtitle="Коллекция парка">
        {!hasApiAnimals && siteAnimals === null ? (
          <p role="status">Загружаем список животных…</p>
        ) : animals.length === 0 ? (
          <div className="card p-8">
            <EmptyState
              icon={<PawIcon className="w-14 h-14 text-[var(--accent)]/60 mx-auto" />}
              title="Нет данных"
              description="Синхронизируйте в настройках"
              action={
                <Link
                  to="/more"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent)] hover:text-[var(--accent-hover)]"
                >
                  Настройки
                  <span>→</span>
                </Link>
              }
            />
          </div>
        ) : (
          <div className="space-y-3">
            {animals.map((a, i) => (
              <motion.div
                key={a.id}
                className="card p-4 flex items-center gap-4"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                whileHover={{ boxShadow: '0 8px 32px rgba(26, 36, 20, 0.1)' }}
                whileTap={{ scale: 0.99 }}
              >
                {'photo' in a && a.photo ? (
                  <img
                    src={a.photo}
                    alt=""
                    className="w-14 h-14 rounded-xl object-cover shrink-0"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-xl bg-[var(--bg-input)] flex items-center justify-center shrink-0">
                    <PawIcon className="w-7 h-7 text-[var(--text-soft)]" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-[var(--text)] truncate">{a.name}</h3>
                </div>
                {a.source === 'api' && a.hasCoords ? (
                  <Link
                    to="/map/editor"
                    className="p-2.5 rounded-xl text-[var(--accent)] hover:bg-[var(--bg-hover)] shrink-0 transition-colors"
                    title="На карту"
                  >
                    <MapPinIcon className="w-5 h-5" />
                  </Link>
                ) : (
                  <a
                    href={'url' in a ? a.url : '#'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 rounded-xl text-[var(--text-muted)] hover:bg-[var(--bg-hover)] shrink-0 transition-colors"
                    title="Подробнее"
                  >
                    <span className="text-sm font-medium">→</span>
                  </a>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </PageLayout>
    </div>
  );
}
