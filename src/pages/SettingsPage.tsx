import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApiConfig, saveApiConfig, pingApi, syncFromRemote, type ApiConfig } from '../utils/remoteApi';
import Button from '../components/ui/Button';
import { ChevronDownIcon, SettingsIcon } from '../components/icons';

export default function SettingsPage() {
  const [cfg, setCfg] = useState<ApiConfig>({ remoteApiUrl: '', apiToken: '' });
  const [loading, setLoading] = useState(false);
  const [pingResult, setPingResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [syncResult, setSyncResult] = useState<{ ok: boolean; error?: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getApiConfig().then((c) => {
      if (!cancelled) setCfg(c);
    });
    return () => { cancelled = true; };
  }, []);

  const setVal = (key: keyof ApiConfig) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setCfg((prev) => ({ ...prev, [key]: e.target.value }));
    setPingResult(null);
    setSyncResult(null);
  };

  const handleSave = async () => {
    setLoading(true);
    setPingResult(null);
    setSyncResult(null);
    try {
      await saveApiConfig(cfg);
    } finally {
      setLoading(false);
    }
  };

  const handlePing = async () => {
    setLoading(true);
    setPingResult(null);
    setSyncResult(null);
    try {
      const result = await pingApi(cfg);
      setPingResult(result);
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setLoading(true);
    setSyncResult(null);
    setPingResult(null);
    try {
      await saveApiConfig(cfg);
      const result = await syncFromRemote(cfg);
      setSyncResult(result);
      if (result.ok) window.location.reload();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--bg)]">
      <div className="flex flex-col h-full min-h-0 mx-auto w-full max-w-[480px]">
        <header className="shrink-0 px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-card)] flex items-center gap-3 safe-area-padding">
          <Link
            to="/more"
            className="p-2 -ml-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)] touch-manipulation"
            aria-label="Назад"
          >
            <ChevronDownIcon className="w-5 h-5 rotate-90" />
          </Link>
          <h1 className="text-base font-semibold text-[var(--text)]">Настройки</h1>
        </header>

        <main className="flex-1 overflow-auto p-4 space-y-4">
          <section className="rounded-2xl p-4 card">
            <h2 className="text-sm font-semibold text-[var(--text)] mb-3 flex items-center gap-2">
              <SettingsIcon className="w-4 h-4 text-[var(--text-muted)]" />
              API
            </h2>
            <p className="text-xs text-[var(--text-muted)] mb-3">
              URL и ключ для загрузки данных (вольеры, привязка). Работа офлайн по локальным данным.
            </p>
            <div className="space-y-3">
              <label className="block">
                <span className="block text-xs font-medium text-[var(--text-muted)] mb-1">URL</span>
                <input
                  type="url"
                  value={cfg.remoteApiUrl}
                  onChange={setVal('remoteApiUrl')}
                  onBlur={handleSave}
                  placeholder="https://..."
                  className="w-full rounded-lg input px-3 py-2.5 text-sm text-[var(--text)] min-h-[40px] focus:ring-2 focus:ring-[var(--accent)]/30"
                />
              </label>
              <label className="block">
                <span className="block text-xs font-medium text-[var(--text-muted)] mb-1">Ключ</span>
                <input
                  type="password"
                  value={cfg.apiToken}
                  onChange={setVal('apiToken')}
                  onBlur={handleSave}
                  placeholder="X-API-Key"
                  className="w-full rounded-lg input px-3 py-2.5 text-sm text-[var(--text)] min-h-[40px] focus:ring-2 focus:ring-[var(--accent)]/30"
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-2 mt-4">
              <Button
                variant="secondary"
                size="sm"
                onClick={handlePing}
                disabled={loading || !cfg.remoteApiUrl.trim()}
              >
                {loading ? '...' : 'Проверить'}
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSync}
                disabled={loading || !cfg.remoteApiUrl.trim()}
              >
                Синхронизировать
              </Button>
            </div>
            {pingResult && (
              <p className={`mt-3 text-sm ${pingResult.ok ? 'text-[var(--accent)]' : 'text-red-600'}`}>
                {pingResult.ok ? 'ОК' : pingResult.error}
              </p>
            )}
            {syncResult && !syncResult.ok && (
              <p className="mt-3 text-sm text-red-600">{syncResult.error}</p>
            )}
            {syncResult?.ok && (
              <p className="mt-3 text-sm text-[var(--accent)]">Данные загружены</p>
            )}
          </section>

          <section className="rounded-2xl p-4 card">
            <h2 className="text-sm font-semibold text-[var(--text)] mb-2">О приложении</h2>
            <p className="text-xs text-[var(--text-muted)]">
              Карта парка. Вольеры и привязка хранятся локально.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
