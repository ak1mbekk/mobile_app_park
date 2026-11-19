import React, { useState } from 'react';
import PageLayout from '../components/layout/PageLayout';

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
          <h2 className="text-lg font-semibold">Показательные кормления</h2>
          <p className="mt-2 mb-4 text-sm">Время кормлений и номера вольеров из программы парка.</p>
          <a className="underline" href="./demo/index.html#feed">Открыть программу и схему</a>
        </div>
      </PageLayout>
    </div>
  );
}
