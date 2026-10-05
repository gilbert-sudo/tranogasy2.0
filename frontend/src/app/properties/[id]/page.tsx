import { notFound } from 'next/navigation';
import PropertyDetailsClient from './PropertyDetailsClient';

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-900 pb-20">
      <PropertyDetailsClient propertyId={resolvedParams.id} />
    </div>
  );
}
