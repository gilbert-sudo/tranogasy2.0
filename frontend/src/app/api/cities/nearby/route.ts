import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { findNearestCityFromList, CityLocation } from '@/services/city.service';

export const runtime = 'nodejs';

const BACKEND_URL = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api').replace(/\/$/, '');

let cachedCities: CityLocation[] | null = null;

function getLocalMadagascarCities(): CityLocation[] {
  if (cachedCities && cachedCities.length > 0) {
    return cachedCities;
  }

  const possiblePaths = [
    path.join(process.cwd(), 'public', 'data', 'madagascar.json'),
    path.join(process.cwd(), 'frontend', 'public', 'data', 'madagascar.json'),
    path.join(__dirname, '..', '..', '..', '..', 'public', 'data', 'madagascar.json'),
  ];

  for (const p of possiblePaths) {
    try {
      if (fs.existsSync(/* turbopackIgnore: true */ p)) {
        const fileContent = fs.readFileSync(/* turbopackIgnore: true */ p, 'utf8');
        cachedCities = JSON.parse(fileContent) as CityLocation[];
        return cachedCities;
      }
    } catch {
      // Continue to next path
    }
  }

  return [];
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const latStr = searchParams.get('lat');
  const lngStr = searchParams.get('lng');
  const placeName = searchParams.get('placeName') || undefined;
  const distanceStr = searchParams.get('distance');

  if (!latStr || !lngStr) {
    return NextResponse.json({ error: 'Missing coordinates (lat, lng)' }, { status: 400 });
  }

  const lat = parseFloat(latStr);
  const lng = parseFloat(lngStr);

  if (isNaN(lat) || isNaN(lng)) {
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 });
  }

  const maxDistance = distanceStr ? parseFloat(distanceStr) : 25000;

  // 1. Try forwarding to backend
  try {
    const backendUrl = `${BACKEND_URL}/cities/nearby?lat=${lat}&lng=${lng}&distance=${maxDistance}${
      placeName ? `&placeName=${encodeURIComponent(placeName)}` : ''
    }`;
    const res = await fetch(backendUrl, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data && data._id) {
        return NextResponse.json(data);
      }
    }
  } catch (backendErr) {
    console.warn('Backend /cities/nearby error, using local fallback:', backendErr);
  }

  // 2. Fallback to local dataset (madagascar.json)
  const cities = getLocalMadagascarCities();
  if (cities.length > 0) {
    const nearest = findNearestCityFromList(cities, { lat, lng }, placeName, maxDistance);
    if (nearest) {
      return NextResponse.json(nearest);
    }
  }

  return NextResponse.json({ error: 'No nearby city found' }, { status: 404 });
}
