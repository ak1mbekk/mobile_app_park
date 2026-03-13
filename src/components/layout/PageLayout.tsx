import React from 'react';
import { motion } from 'motion/react';

interface PageLayoutProps {
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
  className?: string;
}

export default function PageLayout({ children, className = '' }: PageLayoutProps) {
  return (
    <motion.div
      className={`flex flex-col h-full min-h-0 flex-1 overflow-auto px-4 py-5 safe-area ${className}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      {children}
    </motion.div>
  );
}
