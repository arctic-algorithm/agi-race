import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { adminDb } from '@/lib/firebaseAdmin'
import {
  GLOBAL_CONFIG,
  PRODUCT_CONFIG,
  TALENT_CONFIG,
  ENERGY_BUILDING_CONFIG,
  FACILITY_CONFIG,
  RACK_CONFIG,
  TRAINING_RUN_CONFIG,
  IPO_CONFIG,
  TAKEOVER_CONFIG,
  DEBT_CONFIG,
  RESEARCH_MILESTONES,
  BUILD_TIME_MULTIPLIERS,
  CLOUD_CONFIG,
  PUBLIC_CONTRACT_CONFIG,
} from '@/shared/config'

function buildDefaultConfig() {
  return {
    global: { ...GLOBAL_CONFIG },
    cloud: { ...CLOUD_CONFIG },
    publicContract: { ...PUBLIC_CONTRACT_CONFIG },
    product: {
      consumer: { ...PRODUCT_CONFIG.consumer },
      enterprise: { ...PRODUCT_CONFIG.enterprise },
    },
    talent: { ...TALENT_CONFIG },
    energyBuilding: Object.fromEntries(
      Object.entries(ENERGY_BUILDING_CONFIG).map(([k, v]) => [k, { ...v }])
    ),
    facility: Object.fromEntries(
      Object.entries(FACILITY_CONFIG).map(([k, v]) => [k, { ...v }])
    ),
    rack: Object.fromEntries(
      Object.entries(RACK_CONFIG).map(([k, v]) => [k, { ...v }])
    ),
    buildTimeMultipliers: { ...BUILD_TIME_MULTIPLIERS },
    trainingRun: { ...TRAINING_RUN_CONFIG },
    ipo: {
      weights: { ...IPO_CONFIG.weights },
      researchScoreMultiplier: IPO_CONFIG.researchScoreMultiplier,
      talentPerHeadValue: IPO_CONFIG.talentPerHeadValue,
    },
    takeover: { ...TAKEOVER_CONFIG },
    debt: { ...DEBT_CONFIG },
    researchMilestones: { ...RESEARCH_MILESTONES },
  }
}

async function isAuthenticated() {
  const cookieStore = await cookies()
  return cookieStore.get('admin_auth')?.value === '1'
}

export async function GET(_req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const doc = await adminDb.collection('config').doc('gameConfig').get()
    if (doc.exists) {
      const data = doc.data()!
      // Remove Firestore metadata fields
      const { updatedAt: _updatedAt, ...config } = data as Record<string, unknown>
      return NextResponse.json({ config })
    }
    return NextResponse.json({ config: buildDefaultConfig() })
  } catch (err) {
    console.error('Error reading config from Firestore:', err)
    return NextResponse.json({ config: buildDefaultConfig() })
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAuthenticated())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => null)
  if (!body || typeof body.config !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  try {
    await adminDb.collection('config').doc('gameConfig').set({
      ...body.config,
      updatedAt: Date.now(),
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Error writing config to Firestore:', err)
    return NextResponse.json({ error: 'Failed to save config' }, { status: 500 })
  }
}
