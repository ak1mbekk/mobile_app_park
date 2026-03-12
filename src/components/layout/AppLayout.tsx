import React from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import {
  MapPinIcon,
  PawIcon,
  CalendarIcon,
  ShoppingBagIcon,
  MenuIcon,
} from '../icons';

const NAV_ITEMS = [
  { path: '/', label: 'Карта', icon: MapPinIcon },
  { path: '/animals', label: 'Животные', icon: PawIcon },
  { path: '/calendar', label: 'Календарь', icon: CalendarIcon },
  { path: '/shop', label: 'Магазин', icon: ShoppingBagIcon },
  { path: '/more', label: 'Ещё', icon: MenuIcon },
] as const;

export default function AppLayout() {
  return (
    <div className="flex flex-col h-full min-h-0 bg-[var(--bg)]">
      <main className="flex-1 overflow-auto min-h-0">
        <Outlet />
      </main>
      <nav
        className="shrink-0 flex justify-around items-center border-t border-[var(--border)] bg-[var(--bg-card)] safe-area-padding"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        {NAV_ITEMS.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            end={path !== '/'}
            isActive={path === '/' ? (_, loc) => loc.pathname === '/' || loc.pathname === '/map' : undefined}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-2 px-3 min-w-[56px] touch-manipulation ${
                isActive ? 'text-[var(--accent)]' : 'text-[var(--text-muted)]'
              }`
            }
          >
            <Icon className="w-6 h-6 shrink-0" />
            <span className="text-[10px] mt-0.5">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
