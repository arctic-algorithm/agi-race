import * as admin from 'firebase-admin'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { logger } from 'firebase-functions'

admin.initializeApp()

// ─── Inlined config defaults (mirrors src/shared/config.ts) ──────────────────
// Functions cannot import from src/ directly, so defaults are inlined here.
// The tick reads live values from /config/gameConfig in Firestore first.

const DEFAULT_GLOBAL_CONFIG = {
  seedFunding: 5_000_000,
  gameDaySeconds: 60,
  daysPerMonth: 30,
  ipoRevenueThreshold: 10_000_000,
  secondSlotTalentThreshold: 5,
}

const DEFAULT_CLOUD_CONFIG = {
  baseCostPerTps: 100,
  scalingFactor: 0.0001,
}

const DEFAULT_TALENT_CONFIG = {
  tokenReductionPerTalent: 0.02,
  maxTokenReduction: 0.5,
}

const DEFAULT_DEBT_CONFIG = {
  monthlyInterestRate: 0.03,
}

const DEFAULT_TRAINING_RUN_CONFIG = {
  baseDurationDays: 3,
  durationMultiplier: 1.5,
  baseUplift: 1.25,
  upliftFloor: 1.05,
  upliftDecay: 0.1,
}

const FACILITY_CONFIG: Record<string, { rackSlots: number; buildCost: number; buildTimeMinutes: number; monthlyMaintenance: number }> = {
  garage:       { rackSlots: 1,   buildCost: 100_000,    buildTimeMinutes: 5,   monthlyMaintenance: 2_000 },
  basement:     { rackSlots: 3,   buildCost: 250_000,    buildTimeMinutes: 10,  monthlyMaintenance: 5_000 },
  office_floor: { rackSlots: 10,  buildCost: 750_000,    buildTimeMinutes: 20,  monthlyMaintenance: 15_000 },
  colo_suite:   { rackSlots: 25,  buildCost: 1_500_000,  buildTimeMinutes: 30,  monthlyMaintenance: 35_000 },
  warehouse:    { rackSlots: 50,  buildCost: 3_000_000,  buildTimeMinutes: 45,  monthlyMaintenance: 60_000 },
  dc_50k:       { rackSlots: 100, buildCost: 8_000_000,  buildTimeMinutes: 60,  monthlyMaintenance: 160_000 },
  dc_100k:      { rackSlots: 200, buildCost: 16_000_000, buildTimeMinutes: 120, monthlyMaintenance: 320_000 },
  dc_150k:      { rackSlots: 300, buildCost: 24_000_000, buildTimeMinutes: 180, monthlyMaintenance: 480_000 },
  dc_200k:      { rackSlots: 400, buildCost: 32_000_000, buildTimeMinutes: 240, monthlyMaintenance: 640_000 },
}

const RACK_CONFIG: Record<string, { tokensPerSec: number; buildCost: number; energyDraw: number; deliveryTimeMinutes: number }> = {
  rtx_4080:    { tokensPerSec: 1_600,  buildCost: 200_000,    energyDraw: 10, deliveryTimeMinutes: 3 },
  rtx_4090:    { tokensPerSec: 3_200,  buildCost: 350_000,    energyDraw: 15, deliveryTimeMinutes: 4 },
  rx_7900_xtx: { tokensPerSec: 2_400,  buildCost: 250_000,    energyDraw: 12, deliveryTimeMinutes: 3 },
  h100:        { tokensPerSec: 16_000, buildCost: 8_000_000,  energyDraw: 50, deliveryTimeMinutes: 10 },
  h200:        { tokensPerSec: 25_600, buildCost: 12_000_000, energyDraw: 60, deliveryTimeMinutes: 14 },
  mi300x:      { tokensPerSec: 14_400, buildCost: 7_000_000,  energyDraw: 45, deliveryTimeMinutes: 10 },
  mi325x:      { tokensPerSec: 19_200, buildCost: 10_000_000, energyDraw: 50, deliveryTimeMinutes: 12 },
  b200:        { tokensPerSec: 40_000, buildCost: 20_000_000, energyDraw: 80, deliveryTimeMinutes: 20 },
  custom:      { tokensPerSec: 0,      buildCost: 0,          energyDraw: 0,  deliveryTimeMinutes: 0 },
}

const ENERGY_BUILDING_CONFIG: Record<string, { outputUnits: number; buildCost: number; buildTimeMinutes: number; monthlyMaintenance: number }> = {
  solar_panels:  { outputUnits: 50,     buildCost: 150_000,    buildTimeMinutes: 3,   monthlyMaintenance: 1_000 },
  wind_turbine:  { outputUnits: 300,    buildCost: 400_000,    buildTimeMinutes: 8,   monthlyMaintenance: 4_000 },
  solar_field:   { outputUnits: 1_000,  buildCost: 1_500_000,  buildTimeMinutes: 20,  monthlyMaintenance: 8_000 },
  coal_plant:    { outputUnits: 10_000, buildCost: 8_000_000,  buildTimeMinutes: 60,  monthlyMaintenance: 800_000 },
  gas_plant:     { outputUnits: 10_000, buildCost: 12_000_000, buildTimeMinutes: 60,  monthlyMaintenance: 500_000 },
  nuclear_plant: { outputUnits: 50_000, buildCost: 40_000_000, buildTimeMinutes: 240, monthlyMaintenance: 600_000 },
}

const BUILD_TIME_MULTIPLIERS = { energyBuilding: 1.2, facility: 1.15, rack: 1.1 }

const DEFAULT_TALENT_CONFIG_FULL = {
  firstHireCost: 50_000,
  hireCostMultiplier: 1.5,
  baseCooldownDays: 1,
  cooldownMultiplier: 1.3,
  tokenReductionPerTalent: 0.02,
  maxTokenReduction: 0.5,
}

const DEFAULT_IPO_CONFIG = {
  weights: { fcf: 0.50, researchScore: 0.35, talent: 0.15 },
  researchScoreMultiplier: 0.0001,
  talentPerHeadValue: 500_000,
}

const DEFAULT_RESEARCH_MILESTONES: Record<string, number> = {
  cloudEfficiency: 10,
  coloSuite: 30,
  gen2Racks: 90,
  customSilicon: 365,
}

// ─── Type aliases mirroring shared/types.ts ───────────────────────────────────

interface TokenAllocation {
  products: number
  research: number
  training: number
}

interface PlayerDoc {
  companyName: string
  market?: string
  money: number
  talentCount: number
  researchScore: number
  tokensPerSec: number
  allocation: TokenAllocation
  isPublic: boolean
  totalRevenue: number
  stockPrice: number
  debt: number
  createdAt: number
  // Optional fields set by tick or onboarding
  lastTickAt?: number
  cloudRentalTps?: number
  publicContractUnits?: number
  ipoEligible?: boolean
  unlockedMilestones?: string[]
}

interface FacilityDoc {
  type: string
  status: string
  completesAt: number
  rackSlots: number
  racksInstalled: number
  monthlyMaintenance?: number
}

interface RackDoc {
  type: string
  status: string
  completesAt: number
  facilityId: string
  tokensPerSec: number
  energyDraw: number
}

interface EnergyBuildingDoc {
  type: string
  status: string
  completesAt: number
  outputUnits: number
  monthlyMaintenance: number
}

interface ProductDoc {
  market: string
  modelVersion: number
  revenuePerToken: number
  tokensAllocated: number
}

interface TrainingRunDoc {
  status: string
  targetSlot: string
  tokensAllocated: number
  startedAt: number
  completesAt: number
  isChipDesign: boolean
}

interface ActionDoc {
  type: string
  payload: Record<string, unknown>
  createdAt: number
  processed: boolean
}

// ─── Idempotency guard ───────────────────────────────────────────────────────
const IDEMPOTENCY_WINDOW_MS = 30_000 // 30 seconds

// ─── Game Tick ───────────────────────────────────────────────────────────────

export const gameTick = onSchedule('every 1 minutes', async () => {
  const db = admin.firestore()
  const now = Date.now()

  // ── Load config from Firestore, fall back to defaults ──
  let GLOBAL_CONFIG = DEFAULT_GLOBAL_CONFIG
  let CLOUD_CONFIG = DEFAULT_CLOUD_CONFIG
  let TALENT_CONFIG = DEFAULT_TALENT_CONFIG
  let DEBT_CONFIG = DEFAULT_DEBT_CONFIG
  let TRAINING_RUN_CONFIG = DEFAULT_TRAINING_RUN_CONFIG
  let IPO_CONFIG = DEFAULT_IPO_CONFIG
  let RESEARCH_MILESTONES = DEFAULT_RESEARCH_MILESTONES

  try {
    const cfgSnap = await db.doc('/config/gameConfig').get()
    if (cfgSnap.exists) {
      const cfg = cfgSnap.data() as Record<string, unknown>
      if (cfg.GLOBAL_CONFIG) GLOBAL_CONFIG = { ...DEFAULT_GLOBAL_CONFIG, ...(cfg.GLOBAL_CONFIG as typeof DEFAULT_GLOBAL_CONFIG) }
      if (cfg.CLOUD_CONFIG) CLOUD_CONFIG = { ...DEFAULT_CLOUD_CONFIG, ...(cfg.CLOUD_CONFIG as typeof DEFAULT_CLOUD_CONFIG) }
      if (cfg.TALENT_CONFIG) TALENT_CONFIG = { ...DEFAULT_TALENT_CONFIG, ...(cfg.TALENT_CONFIG as typeof DEFAULT_TALENT_CONFIG) }
      if (cfg.DEBT_CONFIG) DEBT_CONFIG = { ...DEFAULT_DEBT_CONFIG, ...(cfg.DEBT_CONFIG as typeof DEFAULT_DEBT_CONFIG) }
      if (cfg.TRAINING_RUN_CONFIG) TRAINING_RUN_CONFIG = { ...DEFAULT_TRAINING_RUN_CONFIG, ...(cfg.TRAINING_RUN_CONFIG as typeof DEFAULT_TRAINING_RUN_CONFIG) }
      if (cfg.IPO_CONFIG) IPO_CONFIG = { ...DEFAULT_IPO_CONFIG, ...(cfg.IPO_CONFIG as typeof DEFAULT_IPO_CONFIG) }
      if (cfg.RESEARCH_MILESTONES) RESEARCH_MILESTONES = cfg.RESEARCH_MILESTONES as Record<string, number>
    }
  } catch (err) {
    logger.info('Could not read /config/gameConfig — using defaults', { err })
  }

  // ── Fetch all player documents ──
  const playersSnap = await db.collection('players').get()
  logger.info(`Game tick: processing ${playersSnap.size} players`)

  // ── Process players in parallel ──
  await Promise.all(
    playersSnap.docs.map(async (playerDoc) => {
      const playerId = playerDoc.id

      try {
        const player = playerDoc.data() as PlayerDoc

        // ── Idempotency: skip players ticked in the last 30s ──
        if (player.lastTickAt && now - player.lastTickAt < IDEMPOTENCY_WINDOW_MS) {
          logger.info(`Skipping player ${playerId} — ticked ${now - player.lastTickAt}ms ago`)
          return
        }

        // ── Collect mutations to apply at the end ──
        const playerUpdates: Record<string, unknown> = {
          lastTickAt: now,
        }

        // Subcollection doc updates: map of ref → { data, isNew }
        // isNew=true uses batch.set(), isNew=false uses batch.update()
        const subUpdates: Map<admin.firestore.DocumentReference, { data: Record<string, unknown>; isNew: boolean }> = new Map()

        // ─────────────────────────────────────────────────────────────────────
        // STEP 0 — Process pending actions
        // ─────────────────────────────────────────────────────────────────────

        const actionsSnap = await db
          .collection(`players/${playerId}/actions`)
          .where('processed', '==', false)
          .get()

        let workingMoney = player.money ?? 0
        let talentCountDelta = 0

        for (const actionDoc of actionsSnap.docs) {
          const action = actionDoc.data() as ActionDoc

          if (action.type === 'buy_facility') {
            const facilityType = action.payload['facilityType'] as string
            const cfg = FACILITY_CONFIG[facilityType]
            if (!cfg || workingMoney < cfg.buildCost) {
              subUpdates.set(actionDoc.ref, { data: { processed: true }, isNew: false })
              continue
            }
            const existingSnap = await db.collection(`players/${playerId}/facilities`).where('type', '==', facilityType).get()
            const multiplier = Math.pow(BUILD_TIME_MULTIPLIERS.facility, existingSnap.size)
            const completesAt = now + cfg.buildTimeMinutes * 60 * 1000 * multiplier
            const facilityRef = db.collection(`players/${playerId}/facilities`).doc()
            subUpdates.set(facilityRef, { data: { type: facilityType, status: 'building', completesAt, rackSlots: cfg.rackSlots, racksInstalled: 0, monthlyMaintenance: cfg.monthlyMaintenance }, isNew: true })
            workingMoney -= cfg.buildCost

          } else if (action.type === 'buy_rack') {
            const rackType = action.payload['rackType'] as string
            const facilityId = action.payload['facilityId'] as string
            const cfg = RACK_CONFIG[rackType]
            if (!cfg || workingMoney < cfg.buildCost) {
              subUpdates.set(actionDoc.ref, { data: { processed: true }, isNew: false })
              continue
            }
            const existingSnap = await db.collection(`players/${playerId}/racks`).where('type', '==', rackType).get()
            const multiplier = Math.pow(BUILD_TIME_MULTIPLIERS.rack, existingSnap.size)
            const completesAt = now + cfg.deliveryTimeMinutes * 60 * 1000 * multiplier
            const rackRef = db.collection(`players/${playerId}/racks`).doc()
            subUpdates.set(rackRef, { data: { type: rackType, status: 'delivering', completesAt, facilityId, tokensPerSec: cfg.tokensPerSec, energyDraw: cfg.energyDraw }, isNew: true })
            const facilityRef = db.doc(`players/${playerId}/facilities/${facilityId}`)
            subUpdates.set(facilityRef, { data: { racksInstalled: admin.firestore.FieldValue.increment(1) }, isNew: false })
            workingMoney -= cfg.buildCost

          } else if (action.type === 'buy_energy_building') {
            const buildingType = action.payload['buildingType'] as string
            const cfg = ENERGY_BUILDING_CONFIG[buildingType]
            if (!cfg || workingMoney < cfg.buildCost) {
              subUpdates.set(actionDoc.ref, { data: { processed: true }, isNew: false })
              continue
            }
            const existingSnap = await db.collection(`players/${playerId}/energyBuildings`).where('type', '==', buildingType).get()
            const multiplier = Math.pow(BUILD_TIME_MULTIPLIERS.energyBuilding, existingSnap.size)
            const completesAt = now + cfg.buildTimeMinutes * 60 * 1000 * multiplier
            const buildingRef = db.collection(`players/${playerId}/energyBuildings`).doc()
            subUpdates.set(buildingRef, { data: { type: buildingType, status: 'building', completesAt, outputUnits: cfg.outputUnits, monthlyMaintenance: cfg.monthlyMaintenance }, isNew: true })
            workingMoney -= cfg.buildCost

          } else if (action.type === 'hire_talent') {
            const currentCount = (player.talentCount ?? 0) + talentCountDelta
            const hireCost = DEFAULT_TALENT_CONFIG_FULL.firstHireCost * Math.pow(DEFAULT_TALENT_CONFIG_FULL.hireCostMultiplier, currentCount)
            if (workingMoney < hireCost) {
              subUpdates.set(actionDoc.ref, { data: { processed: true }, isNew: false })
              continue
            }
            const cooldownMs = DEFAULT_TALENT_CONFIG_FULL.baseCooldownDays * GLOBAL_CONFIG.gameDaySeconds * 1000 * Math.pow(DEFAULT_TALENT_CONFIG_FULL.cooldownMultiplier, currentCount)
            const talentRef = db.collection(`players/${playerId}/talent`).doc()
            subUpdates.set(talentRef, { data: { hiredAt: now, nextHireAvailableAt: now + cooldownMs, specialization: 'AI Researcher' }, isNew: true })
            talentCountDelta += 1
            workingMoney -= hireCost

          } else if (action.type === 'start_training_run') {
            const targetSlot = action.payload['targetSlot'] as string
            const trainingRef = db.doc(`players/${playerId}/trainingRun/current`)
            const existingRun = await trainingRef.get()
            if (existingRun.exists && (existingRun.data() as TrainingRunDoc).status === 'active') {
              subUpdates.set(actionDoc.ref, { data: { processed: true }, isNew: false })
              continue
            }
            const durationMs = DEFAULT_TRAINING_RUN_CONFIG.baseDurationDays * GLOBAL_CONFIG.gameDaySeconds * 1000
            subUpdates.set(trainingRef, { data: { status: 'active', targetSlot, tokensAllocated: 0, startedAt: now, completesAt: now + durationMs, isChipDesign: false }, isNew: existingRun.exists ? false : true })
          }

          subUpdates.set(actionDoc.ref, { data: { processed: true }, isNew: false })
        }

        // Apply talent count changes from actions
        if (talentCountDelta > 0) {
          playerUpdates['talentCount'] = (player.talentCount ?? 0) + talentCountDelta
        }

        // ─────────────────────────────────────────────────────────────────────
        // STEP 1 — Complete builds
        // ─────────────────────────────────────────────────────────────────────

        // Facilities
        const facilitiesSnap = await db
          .collection(`players/${playerId}/facilities`)
          .where('status', '==', 'building')
          .get()

        for (const fdoc of facilitiesSnap.docs) {
          const facility = fdoc.data() as FacilityDoc
          if (facility.completesAt <= now) {
            subUpdates.set(fdoc.ref, { data: { status: 'active' }, isNew: false })
          }
        }

        // Racks — completing 'delivering' → 'active'
        const racksDeliveringSnap = await db
          .collection(`players/${playerId}/racks`)
          .where('status', '==', 'delivering')
          .get()

        let newRackTps = 0
        for (const rdoc of racksDeliveringSnap.docs) {
          const rack = rdoc.data() as RackDoc
          if (rack.completesAt <= now) {
            subUpdates.set(rdoc.ref, { data: { status: 'active' }, isNew: false })
            newRackTps += rack.tokensPerSec
          }
        }

        // Energy buildings
        const energyBuildingSnap = await db
          .collection(`players/${playerId}/energyBuildings`)
          .where('status', '==', 'building')
          .get()

        for (const edoc of energyBuildingSnap.docs) {
          const eb = edoc.data() as EnergyBuildingDoc
          if (eb.completesAt <= now) {
            subUpdates.set(edoc.ref, { data: { status: 'active' }, isNew: false })
          }
        }

        // ─────────────────────────────────────────────────────────────────────
        // STEP 2 — Calculate energy supply (skip check for now per spec)
        // ─────────────────────────────────────────────────────────────────────

        // Energy check skipped until M6 — energy buildings produce but we don't gate on it
        const activeEnergySnap = await db
          .collection(`players/${playerId}/energyBuildings`)
          .where('status', '==', 'active')
          .get()

        // Energy gating deferred to M6 — only track maintenance costs here
        let totalEnergyMaintenance = 0
        for (const edoc of activeEnergySnap.docs) {
          const eb = edoc.data() as EnergyBuildingDoc
          totalEnergyMaintenance += eb.monthlyMaintenance
        }
        // Also count newly completed energy buildings this tick
        for (const edoc of energyBuildingSnap.docs) {
          const eb = edoc.data() as EnergyBuildingDoc
          if (eb.completesAt <= now) {
            totalEnergyMaintenance += eb.monthlyMaintenance
          }
        }

        // ─────────────────────────────────────────────────────────────────────
        // STEP 3 — Calculate tokens/sec
        // ─────────────────────────────────────────────────────────────────────

        const activeRacksSnap = await db
          .collection(`players/${playerId}/racks`)
          .where('status', '==', 'active')
          .get()

        let rawTps = 0
        for (const rdoc of activeRacksSnap.docs) {
          const rack = rdoc.data() as RackDoc
          rawTps += rack.tokensPerSec
        }
        // Include newly completing racks
        rawTps += newRackTps

        const hasOwnedRacks = rawTps > 0
        const cloudRentalTps = player.cloudRentalTps ?? 5_000

        if (!hasOwnedRacks) {
          rawTps = cloudRentalTps
        }

        // Apply talent efficiency bonus
        const talentCount = player.talentCount ?? 0
        const reductionFraction = Math.min(
          talentCount * TALENT_CONFIG.tokenReductionPerTalent,
          TALENT_CONFIG.maxTokenReduction
        )
        const effectiveTps = rawTps * (1 - reductionFraction)

        // Update player's stored tokensPerSec
        playerUpdates['tokensPerSec'] = effectiveTps

        // ─────────────────────────────────────────────────────────────────────
        // STEP 4 — Apply token allocation
        // ─────────────────────────────────────────────────────────────────────

        const allocation = player.allocation ?? { products: 100, research: 0, training: 0 }
        const tickSeconds = GLOBAL_CONFIG.gameDaySeconds // 1 game day = 60 real seconds

        const tokensThisTick = effectiveTps * tickSeconds
        const tokensToProducts = tokensThisTick * (allocation.products / 100)
        const tokensToResearch = tokensThisTick * (allocation.research / 100)
        // tokensToTraining = tokensThisTick * (allocation.training / 100) — used in step 8

        // ─────────────────────────────────────────────────────────────────────
        // STEP 5 — Calculate revenue from product slots
        // ─────────────────────────────────────────────────────────────────────

        const productsSnap = await db.collection(`players/${playerId}/products`).get()

        let totalRevenueThisTick = 0
        const activeProducts: ProductDoc[] = []

        for (const pdoc of productsSnap.docs) {
          activeProducts.push(pdoc.data() as ProductDoc)
        }

        // Auto-create default product doc if none exist (handles players created before this fix)
        if (activeProducts.length === 0) {
          const defaultMarket = player.market ?? 'consumer'
          const defaultRevenuePerToken = defaultMarket === 'enterprise' ? 0.005 : 0.001
          const defaultProductRef = db.doc(`players/${playerId}/products/${defaultMarket}`)
          subUpdates.set(defaultProductRef, {
            data: { market: defaultMarket, modelVersion: 0, revenuePerToken: defaultRevenuePerToken, tokensAllocated: 0 },
            isNew: true,
          })
          activeProducts.push({ market: defaultMarket, modelVersion: 0, revenuePerToken: defaultRevenuePerToken, tokensAllocated: 0 })
          logger.info(`Auto-created missing product doc for player ${playerId} (market: ${defaultMarket})`)
        }

        // Split tokens evenly across product slots (or by slot weight if future spec defines it)
        const numSlots = activeProducts.length
        if (numSlots > 0) {
          const tokensPerSlot = tokensToProducts / numSlots
          for (const product of activeProducts) {
            const revenueThisTick = tokensPerSlot * product.revenuePerToken
            totalRevenueThisTick += revenueThisTick
          }
        }

        const currentTotalRevenue = player.totalRevenue ?? 0

        playerUpdates['money'] = workingMoney + totalRevenueThisTick
        playerUpdates['totalRevenue'] = currentTotalRevenue + totalRevenueThisTick

        // Track monthly revenue estimate for stock price calculation
        const monthlyRevenueEstimate = totalRevenueThisTick * GLOBAL_CONFIG.daysPerMonth

        // ─────────────────────────────────────────────────────────────────────
        // STEP 6 — Deduct costs
        // ─────────────────────────────────────────────────────────────────────

        const daysPerMonth = GLOBAL_CONFIG.daysPerMonth
        let totalCostsThisTick = 0

        // Cloud rental cost (only when using cloud rental, i.e. no owned racks)
        if (!hasOwnedRacks) {
          const cloudCostPerMonth = cloudRentalTps * CLOUD_CONFIG.baseCostPerTps
          totalCostsThisTick += cloudCostPerMonth / daysPerMonth
        }

        // Facility maintenance
        const activeFacilitiesSnap = await db
          .collection(`players/${playerId}/facilities`)
          .where('status', '==', 'active')
          .get()

        let totalFacilityMaintenance = 0
        for (const fdoc of activeFacilitiesSnap.docs) {
          const facility = fdoc.data() as FacilityDoc
          // Use stored monthlyMaintenance if present; otherwise 0
          totalFacilityMaintenance += facility.monthlyMaintenance ?? 0
        }
        totalCostsThisTick += totalFacilityMaintenance / daysPerMonth

        // Energy building maintenance
        totalCostsThisTick += totalEnergyMaintenance / daysPerMonth

        // Debt interest
        const debt = player.debt ?? 0
        totalCostsThisTick += (debt * DEBT_CONFIG.monthlyInterestRate) / daysPerMonth

        // Apply costs
        const moneyAfterRevenue = (playerUpdates['money'] as number)
        playerUpdates['money'] = moneyAfterRevenue - totalCostsThisTick

        const monthlyCostsEstimate =
          (totalFacilityMaintenance + totalEnergyMaintenance) +
          (hasOwnedRacks ? 0 : cloudRentalTps * CLOUD_CONFIG.baseCostPerTps) +
          debt * DEBT_CONFIG.monthlyInterestRate

        // ─────────────────────────────────────────────────────────────────────
        // STEP 7 — Update Research Score
        // ─────────────────────────────────────────────────────────────────────

        const currentResearchScore = player.researchScore ?? 0
        playerUpdates['researchScore'] = currentResearchScore + tokensToResearch

        // ─────────────────────────────────────────────────────────────────────
        // STEP 8 — Advance Training Run
        // ─────────────────────────────────────────────────────────────────────

        const trainingRunRef = db.doc(`players/${playerId}/trainingRun/current`)
        const trainingRunSnap = await trainingRunRef.get()

        if (trainingRunSnap.exists) {
          const run = trainingRunSnap.data() as TrainingRunDoc

          if (run.status === 'active' && run.completesAt <= now) {
            // Training run complete — upgrade the target product slot
            const targetSlotRef = db.doc(`players/${playerId}/products/${run.targetSlot}`)
            const targetSlotSnap = await targetSlotRef.get()

            if (targetSlotSnap.exists) {
              const targetProduct = targetSlotSnap.data() as ProductDoc
              const newModelVersion = (targetProduct.modelVersion ?? 0) + 1
              const newRevenuePerToken = targetProduct.revenuePerToken * TRAINING_RUN_CONFIG.baseUplift

              subUpdates.set(targetSlotRef, {
                data: { modelVersion: newModelVersion, revenuePerToken: newRevenuePerToken },
                isNew: false,
              })
            }

            // Set training run to idle
            subUpdates.set(trainingRunRef, { data: { status: 'idle' }, isNew: false })

            // Add Press Room headline (new document)
            const pressRoomRef = db
              .collection(`players/${playerId}/pressRoom`)
              .doc(`training_${now}`)

            subUpdates.set(pressRoomRef, {
              data: {
                event: 'first_training_run_completed',
                headline: `${player.companyName} completes a training run and ships an improved model.`,
                createdAt: now,
              },
              isNew: true,
            })
          }
        }

        // ─────────────────────────────────────────────────────────────────────
        // STEP 9 — Check Research Score milestones
        // ─────────────────────────────────────────────────────────────────────

        const newResearchScore = playerUpdates['researchScore'] as number
        const currentUnlocked: string[] = player.unlockedMilestones ?? []
        const newlyUnlocked: string[] = []

        for (const [milestone, threshold] of Object.entries(RESEARCH_MILESTONES)) {
          if (!currentUnlocked.includes(milestone) && newResearchScore >= threshold) {
            newlyUnlocked.push(milestone)
          }
        }

        if (newlyUnlocked.length > 0) {
          playerUpdates['unlockedMilestones'] = [...currentUnlocked, ...newlyUnlocked]
        }

        // ─────────────────────────────────────────────────────────────────────
        // STEP 10 — Check IPO eligibility
        // ─────────────────────────────────────────────────────────────────────

        const newTotalRevenue = playerUpdates['totalRevenue'] as number
        if (newTotalRevenue >= GLOBAL_CONFIG.ipoRevenueThreshold && !player.isPublic) {
          playerUpdates['ipoEligible'] = true
        }

        // ─────────────────────────────────────────────────────────────────────
        // STEP 11 — Calculate stock price (post-IPO only)
        // ─────────────────────────────────────────────────────────────────────

        if (player.isPublic) {
          const fcf = monthlyRevenueEstimate - monthlyCostsEstimate
          const stockPrice =
            fcf * IPO_CONFIG.weights.fcf +
            newResearchScore * IPO_CONFIG.researchScoreMultiplier * IPO_CONFIG.weights.researchScore +
            talentCount * IPO_CONFIG.talentPerHeadValue * IPO_CONFIG.weights.talent

          playerUpdates['stockPrice'] = Math.max(stockPrice, 0)
        }

        // ─────────────────────────────────────────────────────────────────────
        // STEP 12 — Batch write all changes atomically
        // ─────────────────────────────────────────────────────────────────────

        // Firestore batches are capped at 500 operations; split if needed
        const MAX_BATCH_OPS = 499

        type BatchOp =
          | { kind: 'update'; ref: admin.firestore.DocumentReference; data: Record<string, unknown> }
          | { kind: 'set'; ref: admin.firestore.DocumentReference; data: Record<string, unknown> }

        const allOps: BatchOp[] = [
          { kind: 'update', ref: db.doc(`players/${playerId}`), data: playerUpdates },
          ...Array.from(subUpdates.entries()).map(([ref, entry]) => ({
            kind: (entry.isNew ? 'set' : 'update') as 'set' | 'update',
            ref,
            data: entry.data,
          })),
        ]

        // Chunk into batches of MAX_BATCH_OPS
        for (let i = 0; i < allOps.length; i += MAX_BATCH_OPS) {
          const chunk = allOps.slice(i, i + MAX_BATCH_OPS)
          const batch = db.batch()
          for (const op of chunk) {
            if (op.kind === 'set') {
              batch.set(op.ref, op.data)
            } else {
              batch.update(op.ref, op.data)
            }
          }
          await batch.commit()
        }

        // Store per-day estimates for dashboard display (1 tick = 1 game day)
        playerUpdates['revenuePerDay'] = totalRevenueThisTick
        playerUpdates['costsPerDay'] = totalCostsThisTick

        logger.info(`Tick complete for player ${playerId}`, {
          effectiveTps,
          revenueThisTick: totalRevenueThisTick,
          costsThisTick: totalCostsThisTick,
          newResearchScore,
          newlyUnlocked,
        })
      } catch (err) {
        logger.error(`Error processing player ${playerId}`, { err })
      }
    })
  )

  logger.info(`Game tick complete — ${playersSnap.size} players processed`)
})
