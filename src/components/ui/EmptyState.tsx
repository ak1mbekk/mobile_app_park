import React from 'react';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export default function EmptyState({ icon, title, description, action, className = '' }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-10 px-4 text-center ${className}`}>
      {icon && <div className="mb-3 text-[var(--text-soft)]">{icon}</div>}
      {title && <h3 className="text-base font-semibold text-[var(--text)] mb-1">{title}</h3>}
      {description && <p className="text-sm text-[var(--text-muted)] max-w-xs mb-4">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
