import { Link } from 'react-router-dom';
import EmptyState from '../components/ui/EmptyState';
import { NewspaperIcon, ChevronDownIcon } from '../components/icons';

export default function NewsPage() {
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="mx-auto w-full max-w-[480px] flex flex-col h-full">
        <header className="shrink-0 px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-card)] flex items-center gap-3">
          <Link to="/more" className="p-2 -ml-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text)]" aria-label="Назад">
            <ChevronDownIcon className="w-5 h-5 rotate-90" />
          </Link>
          <h1 className="text-base font-semibold text-[var(--text)]">Новости</h1>
        </header>
        <div className="flex-1 overflow-auto p-4">
          <div className="rounded-2xl p-6 card">
            <EmptyState
              icon={<NewspaperIcon className="w-12 h-12 text-[var(--text-soft)] mx-auto" />}
              title="Нет новостей"
              description="Подключитесь к интернету. MODX — в разработке."
            />
          </div>
        </div>
      </div>
    </div>
  );
}
