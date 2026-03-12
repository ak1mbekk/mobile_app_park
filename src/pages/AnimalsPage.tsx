import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import EmptyState from '../components/ui/EmptyState';
import { getLocalAnimals } from '../utils/remoteApi';
import { animalsFromSite } from '../data/animalsFromSite';
import { PawIcon, MapPinIcon } from '../components/icons';

type AnimalItem =
  | { source: 'api'; id: string; name: string; photo?: string | null; hasCoords: true }
  | { source: 'site'; id: string; name: string; url: string };

export default function AnimalsPage() {
  const apiAnimals = getLocalAnimals();

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
    return animalsFromSite.map((a) => ({
      source: 'site' as const,
      id: a.id,
      name: a.name,
      url: a.url,
    }));
  }, [apiAnimals]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="mx-auto w-full max-w-[480px] flex flex-col h-full">
        <header className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-card)]">
          <h1 className="text-base font-semibold text-[var(--text)]">Коллекция животных</h1>
        </header>
        <div className="flex-1 overflow-auto p-4">
          {animals.length === 0 ? (
            <div className="rounded-2xl p-6 card">
              <EmptyState
                icon={<PawIcon className="w-12 h-12 text-[var(--text-soft)] mx-auto" />}
                title="Нет данных"
                description="Синхронизируйте в настройках"
                action={
                  <Link to="/more" className="text-sm font-medium text-[var(--accent)]">
                    Настройки →
                  </Link>
                }
              />
            </div>
          ) : (
            <div className="space-y-2">
              {animals.map((a) => (
                <div
                  key={a.id}
                  className="rounded-xl p-3 card flex gap-3 items-center"
                >
                  {'photo' in a && a.photo ? (
                    <img
                      src={a.photo}
                      alt=""
                      className="w-12 h-12 rounded-lg object-cover shrink-0"
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-lg bg-[var(--bg-input)] flex items-center justify-center shrink-0">
                      <PawIcon className="w-6 h-6 text-[var(--text-soft)]" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold text-[var(--text)] truncate text-sm">{a.name}</h3>
                  </div>
                  {a.source === 'api' && a.hasCoords ? (
                    <Link
                      to="/"
                      className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)] shrink-0"
                      title="На карту"
                    >
                      <MapPinIcon className="w-5 h-5" />
                    </Link>
                  ) : (
                    <a
                      href={'url' in a ? a.url : '#'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)] shrink-0"
                      title="Подробнее на сайте"
                    >
                      <span className="text-xs font-medium">→</span>
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
