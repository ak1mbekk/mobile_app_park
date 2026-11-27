import { Link } from 'react-router-dom';
import { ChevronDownIcon } from '../components/icons';

const INFO_SECTIONS = [
  {
    id: 'policy',
    title: 'Политика безопасности',
    content: 'Информация о политике безопасности парка. Заполняется администратором.',
  },
  {
    id: 'privacy',
    title: 'Обработка персональных данных',
    content: 'Политика конфиденциальности и обработки персональных данных. Заполняется администратором.',
  },
];

export default function InfoPage() {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="mx-auto w-full max-w-[480px] flex flex-col h-full">
        <header className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-card)] flex items-center gap-3">
          <Link to="/more" className="p-2 -ml-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Назад">
            <ChevronDownIcon className="w-5 h-5 rotate-90" />
          </Link>
          <h1 className="text-base font-semibold text-[var(--text)]">Доп. информация</h1>
        </header>
        <div className="flex-1 overflow-auto p-4 space-y-3">
          {INFO_SECTIONS.map((s) => (
            <div key={s.id} className="rounded-2xl p-4 card">
              <h2 className="text-sm font-semibold text-[var(--text)] mb-1.5">{s.title}</h2>
              <p className="text-xs text-[var(--text-muted)] leading-relaxed">{s.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
