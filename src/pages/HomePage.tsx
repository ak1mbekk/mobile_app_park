import { Link } from 'react-router-dom';
import PageLayout from '../components/layout/PageLayout';
import { MapPinIcon, PawIcon, ChevronDownIcon } from '../components/icons';

const EVENTS = [
  { id: '1', date: '25 фев', title: 'Экскурсия по зоопарку', time: '10:00' },
  { id: '2', date: '26 фев', title: 'Кормление животных', time: '14:00' },
  { id: '3', date: '28 фев', title: 'Детская программа', time: '11:00' },
  { id: '4', date: '2 мар', title: 'Лекция о природе', time: '16:00' },
  { id: '5', date: '5 мар', title: 'Фотосессия с животными', time: '12:00' },
] as const;

export default function HomePage() {
  return (
    <div className="max-w-[480px] mx-auto w-full h-full flex flex-col min-h-0">
      <PageLayout>
        <div className="flex flex-col gap-6 pb-6">
          {/* Заголовок секции */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text)]">Ближайшие события</h2>
            <Link
              to="/calendar"
              className="text-sm font-medium text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1 no-underline"
            >
              Все события
              <ChevronDownIcon className="w-4 h-4 rotate-[-90deg]" />
            </Link>
          </div>

          {/* Вертикальный скролл карточек событий */}
          <div className="flex flex-col gap-3">
            {EVENTS.map((event) => (
              <Link
                key={event.id}
                to="/calendar"
                className="card p-4 block no-underline text-inherit hover:bg-[var(--bg-hover)] active:scale-[0.99] transition-all"
              >
                <div className="flex gap-4">
                  <div
                    className="shrink-0 w-14 h-14 rounded-xl flex flex-col items-center justify-center"
                    style={{
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border)',
                    }}
                  >
                    <span className="text-xs font-medium text-[var(--accent)] leading-tight">
                      {event.date.split(' ')[0]}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)] uppercase">
                      {event.date.split(' ')[1]}
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-[var(--text)]">{event.title}</h3>
                    <p className="text-sm text-[var(--text-muted)] mt-0.5">{event.time}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>

          {/* Быстрые действия */}
          <div className="flex flex-col gap-2">
            <h2 className="text-lg font-semibold text-[var(--text)]">Быстрый доступ</h2>
            <div className="grid grid-cols-2 gap-3">
              <Link
                to="/map"
                className="card p-3 flex items-center gap-3 no-underline text-inherit hover:bg-[var(--bg-hover)] transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-[var(--bg-input)] flex items-center justify-center shrink-0">
                  <MapPinIcon className="w-5 h-5 text-[var(--accent)]" />
                </div>
                <span className="font-medium text-[var(--text)] text-sm">Карта</span>
              </Link>
              <Link
                to="/animals"
                className="card p-3 flex items-center gap-3 no-underline text-inherit hover:bg-[var(--bg-hover)] transition-colors"
              >
                <div className="w-10 h-10 rounded-xl bg-[var(--bg-input)] flex items-center justify-center shrink-0">
                  <PawIcon className="w-5 h-5 text-[var(--accent)]" />
                </div>
                <span className="font-medium text-[var(--text)] text-sm">Животные</span>
              </Link>
            </div>
          </div>
        </div>
      </PageLayout>
    </div>
  );
}
