import React from 'react';
import { Link } from 'react-router-dom';
import {
  NewspaperIcon,
  UserIcon,
  InfoIcon,
  SettingsIcon,
  ChevronDownIcon,
} from '../components/icons';

const MORE_ITEMS = [
  { path: '/news', label: 'Новости', icon: NewspaperIcon },
  { path: '/profile', label: 'Личный кабинет', icon: UserIcon },
  { path: '/info', label: 'Доп. информация', icon: InfoIcon },
  { path: '/settings', label: 'Настройки', icon: SettingsIcon },
] as const;

export default function MorePage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="mx-auto w-full max-w-[480px] flex flex-col h-full">
        <header className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-card)]">
          <h1 className="text-base font-semibold text-[var(--text)]">Ещё</h1>
        </header>
        <div className="flex-1 overflow-auto p-4">
          <div className="rounded-2xl overflow-hidden card divide-y divide-[var(--border)]">
            {MORE_ITEMS.map(({ path, label, icon: Icon }) => (
              <Link
                key={path}
                to={path}
                className="flex items-center justify-between gap-3 px-4 py-3.5 text-[var(--text)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-input)] touch-manipulation"
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-5 h-5 text-[var(--text-muted)] shrink-0" />
                  <span className="font-medium">{label}</span>
                </div>
                <ChevronDownIcon className="w-5 h-5 text-[var(--text-soft)] rotate-[-90deg] shrink-0" />
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
