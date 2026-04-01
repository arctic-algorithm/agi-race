// Game tick — called by Vercel Cron every 60 seconds
// Full implementation in Milestone 3

import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
  // Verify the request is from Vercel Cron (or our own secret in dev)
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // TODO: Milestone 3 — implement full game tick logic here

  return NextResponse.json({ ok: true, message: 'Tick placeholder — Milestone 3' })
}
