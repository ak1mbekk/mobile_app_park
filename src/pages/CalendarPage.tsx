import React, { useState } from 'react';
import EmptyState from '../components/ui/EmptyState';
import { CalendarIcon } from '../components/icons';

export default function CalendarPage() {
  const [month] = useState(new Date().getMonth());
  const [year] = useState(new Date().getFullYear());

  const MONTHS = [
    'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
  ];

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="mx-auto w-full max-w-[480px] flex flex-col h-full">
        <header className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-card)]">
          <h1 className="text-base font-semibold text-[var(--text)]">Календарь событий</h1>
        </header>
        <div className="flex-1 overflow-auto p-4">
          <div className="rounded-2xl p-4 card">
            <p className="text-xs text-[var(--text-muted)] mb-3">{MONTHS[month]} {year}</p>
            <EmptyState
              icon={<CalendarIcon className="w-12 h-12 text-[var(--text-soft)] mx-auto" />}
              title="Нет событий"
              description="Подключитесь к интернету. MODX — в разработке."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
