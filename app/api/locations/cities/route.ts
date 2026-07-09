import { NextResponse } from 'next/server';
import { getCityOptions } from '@/lib/leads/locations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const country = new URL(request.url).searchParams.get('country')?.toUpperCase() ?? '';
  if (!/^[A-Z]{2}$/.test(country)) {
    return NextResponse.json({ error: 'Choose a valid country.' }, { status: 400 });
  }
  return NextResponse.json({ cities: getCityOptions(country) });
}
