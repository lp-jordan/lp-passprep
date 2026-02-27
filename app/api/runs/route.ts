import { NextRequest, NextResponse } from 'next/server';
import { createRun } from '@/lib/passprep/run-store';
import { Settings } from '@/lib/passprep/core';

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { settings?: Settings };
  const run = await createRun(body.settings ?? null);
  return NextResponse.json(run, { status: 201 });
}
