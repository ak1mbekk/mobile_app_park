import React from 'react';
import PageLayout from '../components/layout/PageLayout';
import EmptyState from '../components/ui/EmptyState';
import { ShoppingBagIcon } from '../components/icons';

export default function ShopPage() {
  return (
    <div className="max-w-[480px] mx-auto h-full flex flex-col min-h-0">
      <PageLayout title="Магазин" subtitle="Билеты и сувениры">
        <div className="card p-8">
          <EmptyState
            icon={<ShoppingBagIcon className="w-14 h-14 text-[var(--accent)]/60 mx-auto" />}
            title="В разработке"
            description="Билеты и сувениры — в следующей версии"
          />
        </div>
      </PageLayout>
    </div>
  );
}
