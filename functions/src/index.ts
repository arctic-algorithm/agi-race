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
  baseUplift: 1.25,
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

        const currentMoney = player.money ?? 0
        const currentTotalRevenue = player.totalRevenue ?? 0

        playerUpdates['money'] = currentMoney + totalRevenueThisTick
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
