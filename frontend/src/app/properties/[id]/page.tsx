import { notFound } from 'next/navigation';
import PropertyDetailsClient from './PropertyDetailsClient';

async function getProperty(id: string) {
  try {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
    const res = await fetch(`${apiUrl}/properties/${id}`, { cache: 'no-store' });
    if (!res.ok) {
      if (res.status === 404) return null;
      const text = await res.text();
      throw new Error(`Failed to fetch data: ${res.status} ${res.statusText} - ${text} (URL: ${apiUrl}/properties/${id})`);
    }
    const data = await res.json();
    return data; // Assuming it returns the property object directly
  } catch (error) {
    console.error('Error fetching property:', error);
    return null;
  }
}

export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = await params;
  const property = await getProperty(resolvedParams.id);

  if (!property) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-900 pb-20">
      <PropertyDetailsClient property={property} />
    </div>
  );
}
