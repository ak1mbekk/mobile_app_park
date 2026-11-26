import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import PageLayout from '../components/layout/PageLayout';
import {
  NewspaperIcon,
  UserIcon,
  InfoIcon,
  ChevronDownIcon,
} from '../components/icons';

const ITEMS = [
  { path: '/news', label: 'Новости', icon: NewspaperIcon },
  { path: '/profile', label: 'Личный кабинет', icon: UserIcon },
  { path: '/info', label: 'Доп. информация', icon: InfoIcon },
] as const;

export default function MorePage() {
  return (
    <div className="max-w-[480px] mx-auto h-full flex flex-col min-h-0">
      <PageLayout title="Ещё" subtitle="Меню приложения">
        <div className="card overflow-hidden divide-y divide-[var(--border)]">
          {ITEMS.map(({ path, label, icon: Icon }, i) => (
            <motion.div
              key={path}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
              whileTap={{ scale: 0.99 }}
            >
              <Link
                to={path}
                className="flex items-center justify-between px-4 py-4 text-[var(--text)] hover:bg-[var(--bg-hover)] active:bg-[var(--bg-input)] touch-manipulation transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[var(--bg-input)] flex items-center justify-center">
                    <Icon className="w-5 h-5 text-[var(--text-muted)]" />
                  </div>
                  <span className="font-medium">{label}</span>
                </div>
                <ChevronDownIcon className="w-5 h-5 text-[var(--text-soft)] -rotate-90 shrink-0" />
              </Link>
            </motion.div>
          ))}
        </div>
      </PageLayout>
    </div>
  );
}
