import React, { useRef, useLayoutEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { motion } from 'motion/react';
import {
  HomeIcon,
  PawIcon,
  CalendarIcon,
  MapPinIcon,
  MenuIcon,
} from '../icons';

const NAV_ITEMS = [
  { path: '/animals', icon: PawIcon, label: 'Животные' },
  { path: '/calendar', icon: CalendarIcon, label: 'Календарь' },
  { path: '/', icon: HomeIcon, label: 'Дом' },
  { path: '/map', icon: MapPinIcon, label: 'Карта' },
  { path: '/more', icon: MenuIcon, label: 'Ещё' },
] as const;

const INDICATOR_WIDTH = 140;
const INDICATOR_HALF = INDICATOR_WIDTH / 2;
const SPRING = { duration: 0.6, ease: [0.34, 1.56, 0.64, 1] as const };

function isActive(path: string, pathname: string): boolean {
  if (path === '/') return pathname === '/';
  return pathname === path || pathname.startsWith(path + '/');
}

function getActiveIndex(pathname: string): number {
  if (pathname.startsWith('/animals')) return 0;
  if (pathname.startsWith('/calendar')) return 1;
  if (pathname === '/') return 2;
  if (pathname.startsWith('/map')) return 3;
  if (pathname.startsWith('/more')) return 4;
  return 2;
}

export default function LiquidNav({compact=false}: {compact?: boolean}) {
  const location = useLocation();
  const activeIndex = getActiveIndex(location.pathname);
  const navListRef = useRef<HTMLUListElement>(null);
  const [indicatorLeft, setIndicatorLeft] = useState(0);

  const updateIndicator = () => {
    const list = navListRef.current;
    if (!list) return;
    const activeEl = list.children[activeIndex] as HTMLElement | undefined;
    if (!activeEl) return;
    const navRect = list.getBoundingClientRect();
    const itemRect = activeEl.getBoundingClientRect();
    const centerPos = itemRect.left - navRect.left + itemRect.width / 2;
    setIndicatorLeft(centerPos - INDICATOR_HALF);
  };

  useLayoutEffect(() => {
    updateIndicator();
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [activeIndex]);

  if(compact){
    return <nav className="calendar-nav" aria-label="Разделы путеводителя">{NAV_ITEMS.map(({path,icon:Icon,label})=>
      <NavLink key={path} to={path} end={path==='/'}><Icon className="w-5 h-5" />{label}</NavLink>
    )}</nav>;
  }
  return (
    <nav className="shrink-0 overflow-visible">
      <div
          className="safe-area px-4 max-w-[480px] mx-auto"
          style={{
            paddingTop: '2rem',
            paddingBottom: 'calc(2rem + env(safe-area-inset-bottom, 0px))',
          }}
        >
        <div
          className="relative w-[440px] max-w-[calc(100%-32px)] mx-auto h-[84px] rounded-[28px] overflow-visible z-[1]"
          style={{
            background: 'var(--nav-bg)',
            boxShadow: '0 25px 45px rgba(0, 0, 0, 0.2)',
          }}
        >
          {/* Блок с выемкой и кругом — 1:1 как в оригинале */}
          <motion.div
            className="absolute top-0 left-0 w-[140px] h-[60px] pointer-events-none z-[2]"
            initial={false}
            animate={{ x: indicatorLeft }}
            transition={SPRING}
          >
            <svg
              className="absolute top-0 left-0 w-full h-full"
              viewBox="0 0 140 60"
              preserveAspectRatio="none"
            >
              <path
                d="M -10,0 L 20,0 C 28,0 30,2 32,8 C 36,24 48,39 70,39 C 92,39 104,24 108,8 C 110,2 112,0 120,0 L 150,0 L 150,-20 L -10,-20 Z"
                fill="var(--bg)"
              />
            </svg>
            <div
              className="absolute top-[-28px] left-1/2 -translate-x-1/2 w-14 h-14 rounded-full"
              style={{ background: 'var(--nav-active)' }}
            />
          </motion.div>

          <ul
            ref={navListRef}
            className="relative flex items-end pb-6 w-full h-full list-none m-0 p-0 z-10"
          >
            {NAV_ITEMS.map(({ path, icon: Icon, label }, index) => {
              const active = isActive(path, location.pathname);
              return (
                <li
                  key={path}
                  className={`flex-1 flex justify-center relative cursor-pointer ${active ? 'active' : ''}`}
                >
                  <NavLink
                    to={path}
                    aria-label={label}
                    end={path === '/'}
                    className="flex flex-1 justify-center items-end min-h-0 touch-manipulation no-underline text-inherit"
                  >
                    <motion.div
                      className="w-[26px] h-[26px] flex items-center justify-center"
                      initial={false}
                      animate={{
                        y: active ? -47 : 0,
                        scale: active ? 1.05 : 1,
                        color: active ? 'var(--header-bg)' : 'rgba(255,255,255,0.6)',
                      }}
                      transition={{ y: SPRING, scale: SPRING, color: { duration: 0.4 } }}
                    >
                      <Icon className="w-full h-full [stroke-width:1.5]" />
                    </motion.div>
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </nav>
  );
}
