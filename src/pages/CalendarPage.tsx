import React, { useState } from 'react';
import PageLayout from '../components/layout/PageLayout';
import EmptyState from '../components/ui/EmptyState';
import { CalendarIcon } from '../components/icons';

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

export default function CalendarPage() {
  const [month] = useState(new Date().getMonth());
  const [year] = useState(new Date().getFullYear());

  return (
    <div className="max-w-[480px] mx-auto h-full flex flex-col min-h-0">
      <PageLayout title="Календарь" subtitle="События и расписание">
        <div className="card p-6">
          <p className="text-sm font-medium text-[var(--text-muted)] mb-4">
            {MONTHS[month]} {year}
          </p>
          <EmptyState
            icon={<CalendarIcon className="w-14 h-14 text-[var(--accent)]/60 mx-auto" />}
            title="Нет событий"
            description="Подключитесь к интернету"
          />
        </div>
      </PageLayout>
    </div>
  );
}
