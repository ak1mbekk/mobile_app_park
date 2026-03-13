import React from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import LiquidNav from './LiquidNav';
import PullToRefresh from '../ui/PullToRefresh';

export default function AppLayout() {
  const location = useLocation();
  const isMapPage = location.pathname === '/' || location.pathname === '/map';

  return (
    <div className="relative h-full w-full overflow-hidden">
      <main className="absolute inset-0 overflow-hidden">
        {isMapPage ? (
          <Outlet />
        ) : (
          <PullToRefresh>
            <Outlet />
          </PullToRefresh>
        )}
      </main>
      {!isMapPage && (
        <div className="absolute bottom-0 left-0 right-0 z-10 pointer-events-none">
          <div className="pointer-events-auto">
            <LiquidNav />
          </div>
        </div>
      )}
    </div>
  );
}
