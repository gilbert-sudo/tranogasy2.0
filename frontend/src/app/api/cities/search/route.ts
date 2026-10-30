import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const BACKEND_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/\/$/, '');

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q') || '';
  const limit = searchParams.get('limit') || '20';

  try {
    const res = await fetch(`${BACKEND_URL}/cities/search?q=${encodeURIComponent(q)}&limit=${limit}`, {
      headers: { 'Accept': 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      return NextResponse.json(data);
    }
  } catch (backendErr) {
    console.warn('Backend cities search error, fallback:', backendErr);
  }

  // Fallback curated Madagascar cities if backend is temporarily offline
  const fallbackCities = [
    { _id: '64f75284ef8f606073e981ec', province: 'Antananarivo', region: 'Analamanga', district: 'Antananarivo Renivohitra', commune: '1er Arrondissement', fokontany: 'Ambatovinaky', coords: { lat: -18.9159, lng: 47.5306 } },
    { _id: '64f75284ef8f606073e981ed', province: 'Antananarivo', region: 'Analamanga', district: 'Antananarivo Renivohitra', commune: '5ème Arrondissement', fokontany: 'Ivandry', coords: { lat: -18.8778, lng: 47.5273 } },
    { _id: '64f75284ef8f606073e981ee', province: 'Antananarivo', region: 'Analamanga', district: 'Antananarivo Renivohitra', commune: '5ème Arrondissement', fokontany: 'Ambatobe', coords: { lat: -18.8711, lng: 47.5512 } },
    { _id: '64f75284ef8f606073e981ef', province: 'Antananarivo', region: 'Analamanga', district: 'Antananarivo Renivohitra', commune: '1er Arrondissement', fokontany: 'Analakely', coords: { lat: -18.9075, lng: 47.5244 } },
    { _id: '64f75284ef8f606073e981f0', province: 'Antananarivo', region: 'Analamanga', district: 'Antananarivo Renivohitra', commune: '3ème Arrondissement', fokontany: 'Ankorondrano', coords: { lat: -18.8895, lng: 47.5228 } },
    { _id: '64f75284ef8f606073e981f1', province: 'Antananarivo', region: 'Analamanga', district: 'Antananarivo Atsimondrano', commune: 'Tanjombato', fokontany: 'Tanjombato', coords: { lat: -18.9667, lng: 47.5333 } },
    { _id: '64f75284ef8f606073e981f2', province: 'Antananarivo', region: 'Analamanga', district: 'Antananarivo Avaradrano', commune: 'Talatamaty', fokontany: 'Talatamaty', coords: { lat: -18.8417, lng: 47.4583 } },
    { _id: '64f75284ef8f606073e981f3', province: 'Antananarivo', region: 'Analamanga', district: 'Antananarivo Avaradrano', commune: 'Ivato', fokontany: 'Ivato Aéroport', coords: { lat: -18.7969, lng: 47.4788 } },
    { _id: '64f75284ef8f606073e981f4', province: 'Toamasina', region: 'Atsinanana', district: 'Toamasina I', commune: 'Toamasina', fokontany: 'Bazar Be', coords: { lat: -18.1492, lng: 49.4023 } },
    { _id: '64f75284ef8f606073e981f5', province: 'Mahajanga', region: 'Boeny', district: 'Mahajanga I', commune: 'Mahajanga', fokontany: 'Bord de la mer', coords: { lat: -15.7167, lng: 46.3167 } },
  ];

  if (!q) return NextResponse.json(fallbackCities);

  const lowerQ = q.toLowerCase();
  const filtered = fallbackCities.filter(c =>
    c.fokontany.toLowerCase().includes(lowerQ) ||
    c.commune.toLowerCase().includes(lowerQ) ||
    c.district.toLowerCase().includes(lowerQ) ||
    c.region.toLowerCase().includes(lowerQ)
  );

  return NextResponse.json(filtered);
}

