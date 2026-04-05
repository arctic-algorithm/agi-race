import type { FacilityType, RackType, EnergyBuildingType, Market } from './types'

// ─── Game Config ──────────────────────────────────────────────────────────────
// All tunable parameters for the game economy.
// These defaults are used in development and as the reset baseline in the admin panel.
// In production the tick reads these values from /config/gameConfig in Firestore,
// allowing live edits via the admin panel without a redeploy.

// ─── Global Economy ───────────────────────────────────────────────────────────

export const GLOBAL_CONFIG = {
  /** Starting money for every new player */
  seedFunding: 5_000_000,
  /** Duration of one game day in real seconds */
  gameDaySeconds: 60,
  /** Number of game days per game month */
  daysPerMonth: 30,
  /** Cumulative revenue required to unlock IPO */
  ipoRevenueThreshold: 10_000_000,
  /** Talent headcount required to unlock second product slot */
  secondSlotTalentThreshold: 5,
} as const

// ─── Cloud Token Rental ───────────────────────────────────────────────────────

export const CLOUD_CONFIG = {
  /** Base cost per token/sec per game month at low usage */
  baseCostPerTps: 10,
  /** Scaling factor — cost multiplier applied per 1,000 t/s rented */
  scalingFactor: 0.0001,
} as const

// ─── Public Grid & Cloud Slider Limits ────────────────────────────────────────

export const GRID_CONFIG = {
  /** Maximum cloud tokens/sec a player can rent */
  maxCloudRentalTps: 20_000,
  /** Maximum public grid energy units a player can draw */
  maxPublicGridUnits: 10_000,
  /** Cost per energy unit per game month */
  publicGridCostPerUnitPerMonth: 100,
} as const

// ─── Products & Revenue ───────────────────────────────────────────────────────

export const PRODUCT_CONFIG: Record<Market, {
  revenuePerToken: number
  volumeCap: number       // max tokens/sec the market absorbs from a single player
  rampUpDays: number      // game days before full revenue rate kicks in
  churnRate: number       // 0–1, fraction of revenue lost per month to churn (consumer only)
}> = {
  consumer: {
    revenuePerToken: 0.001,
    volumeCap: 500_000,
    rampUpDays: 3,
    churnRate: 0.05,
  },
  enterprise: {
    revenuePerToken: 0.005,
    volumeCap: 100_000,
    rampUpDays: 14,
    churnRate: 0.01,
  },
}

// ─── Talent ───────────────────────────────────────────────────────────────────

export const TALENT_CONFIG = {
  /** Cost of the first hire in $ */
  firstHireCost: 50_000,
  /** Each successive hire costs this much more (multiplier) */
  hireCostMultiplier: 1.5,
  /** Cooldown before next hire in game days — starts at this value */
  baseCooldownDays: 1,
  /** Cooldown multiplier per existing hire */
  cooldownMultiplier: 1.3,
  /** Energy draw reduction per talent unit (0–1, compound) */
  energyReductionPerTalent: 0.02,
  /** Token usage reduction per talent unit (0–1, compound) */
  tokenReductionPerTalent: 0.02,
  /** Cap on total energy reduction regardless of talent count */
  maxEnergyReduction: 0.5,
  /** Cap on total token reduction regardless of talent count */
  maxTokenReduction: 0.5,
  /** Minimum sign-on bonus premium for poaching (fraction above current hire cost) */
  poachMinPremium: 0.1,
  /** Defense window for poaching in real hours */
  poachDefenseWindowHours: 12,
} as const

// ─── Energy ───────────────────────────────────────────────────────────────────

export const PUBLIC_CONTRACT_CONFIG = {
  /** Energy units per increment */
  incrementSize: 50,
  /** Base cost per increment per game month */
  baseCostPerIncrement: 1_000_000,
  /** Scaling curve — cost multiplier per existing increment owned */
  scalingFactor: 0.1,
} as const

export const ENERGY_BUILDING_CONFIG: Record<EnergyBuildingType, {
  outputUnits: number
  buildCost: number
  buildTimeMinutes: number
  monthlyMaintenance: number
  requiredFacility: FacilityType
}> = {
  solar_panels: {
    outputUnits: 50,
    buildCost: 150_000,
    buildTimeMinutes: 3,
    monthlyMaintenance: 1_000,
    requiredFacility: 'office_floor',
  },
  wind_turbine: {
    outputUnits: 300,
    buildCost: 400_000,
    buildTimeMinutes: 8,
    monthlyMaintenance: 4_000,
    requiredFacility: 'colo_suite',
  },
  solar_field: {
    outputUnits: 1_000,
    buildCost: 1_500_000,
    buildTimeMinutes: 20,
    monthlyMaintenance: 8_000,
    requiredFacility: 'warehouse',
  },
  coal_plant: {
    outputUnits: 10_000,
    buildCost: 8_000_000,
    buildTimeMinutes: 60,
    monthlyMaintenance: 800_000,
    requiredFacility: 'dc_50k',
  },
  gas_plant: {
    outputUnits: 10_000,
    buildCost: 12_000_000,
    buildTimeMinutes: 60,
    monthlyMaintenance: 500_000,
    requiredFacility: 'dc_50k',
  },
  nuclear_plant: {
    outputUnits: 50_000,
    buildCost: 40_000_000,
    buildTimeMinutes: 240,
    monthlyMaintenance: 600_000,
    requiredFacility: 'dc_100k',
  },
}

// ─── Facilities ───────────────────────────────────────────────────────────────

export const FACILITY_CONFIG: Record<FacilityType, {
  rackSlots: number
  buildCost: number
  buildTimeMinutes: number
  monthlyMaintenance: number
}> = {
  garage:      { rackSlots: 1,   buildCost: 100_000,    buildTimeMinutes: 5,   monthlyMaintenance: 2_000 },
  basement:    { rackSlots: 3,   buildCost: 250_000,    buildTimeMinutes: 10,  monthlyMaintenance: 5_000 },
  office_floor:{ rackSlots: 10,  buildCost: 750_000,    buildTimeMinutes: 20,  monthlyMaintenance: 15_000 },
  colo_suite:  { rackSlots: 25,  buildCost: 1_500_000,  buildTimeMinutes: 30,  monthlyMaintenance: 35_000 },
  warehouse:   { rackSlots: 50,  buildCost: 3_000_000,  buildTimeMinutes: 45,  monthlyMaintenance: 60_000 },
  dc_50k:      { rackSlots: 100, buildCost: 8_000_000,  buildTimeMinutes: 60,  monthlyMaintenance: 160_000 },
  dc_100k:     { rackSlots: 200, buildCost: 16_000_000, buildTimeMinutes: 120, monthlyMaintenance: 320_000 },
  dc_150k:     { rackSlots: 300, buildCost: 24_000_000, buildTimeMinutes: 180, monthlyMaintenance: 480_000 },
  dc_200k:     { rackSlots: 400, buildCost: 32_000_000, buildTimeMinutes: 240, monthlyMaintenance: 640_000 },
}

// ─── Server Racks ─────────────────────────────────────────────────────────────

export const RACK_CONFIG: Record<RackType, {
  generation: 1 | 2 | 3
  tokensPerSec: number
  buildCost: number
  energyDraw: number
  deliveryTimeMinutes: number
}> = {
  // Gen 1
  rtx_4080:   { generation: 1, tokensPerSec: 1_600,  buildCost: 200_000,    energyDraw: 10, deliveryTimeMinutes: 3 },
  rtx_4090:   { generation: 1, tokensPerSec: 3_200,  buildCost: 350_000,    energyDraw: 15, deliveryTimeMinutes: 4 },
  rx_7900_xtx:{ generation: 1, tokensPerSec: 2_400,  buildCost: 250_000,    energyDraw: 12, deliveryTimeMinutes: 3 },
  // Gen 2
  h100:       { generation: 2, tokensPerSec: 16_000, buildCost: 8_000_000,  energyDraw: 50, deliveryTimeMinutes: 10 },
  h200:       { generation: 2, tokensPerSec: 25_600, buildCost: 12_000_000, energyDraw: 60, deliveryTimeMinutes: 14 },
  mi300x:     { generation: 2, tokensPerSec: 14_400, buildCost: 7_000_000,  energyDraw: 45, deliveryTimeMinutes: 10 },
  mi325x:     { generation: 2, tokensPerSec: 19_200, buildCost: 10_000_000, energyDraw: 50, deliveryTimeMinutes: 12 },
  b200:       { generation: 2, tokensPerSec: 40_000, buildCost: 20_000_000, energyDraw: 80, deliveryTimeMinutes: 20 },
  // Gen 3 — stats determined dynamically when designed
  custom:     { generation: 3, tokensPerSec: 0, buildCost: 0, energyDraw: 0, deliveryTimeMinutes: 0 },
}

// ─── Build Queue Time Multipliers ─────────────────────────────────────────────

export const BUILD_TIME_MULTIPLIERS = {
  /** Applied per successive energy building of the same type */
  energyBuilding: 1.2,
  /** Applied per successive facility of the same type */
  facility: 1.15,
  /** Applied per successive rack of the same type */
  rack: 1.1,
} as const

// ─── Research Score Milestones ────────────────────────────────────────────────
// Each value is a multiple of the player's current tokens/sec at the time of check

export const RESEARCH_MILESTONES = {
  cloudEfficiency: 10,
  coloSuite: 30,
  gen2Racks: 90,
  customSilicon: 365,
} as const

// ─── Training Runs ────────────────────────────────────────────────────────────

export const TRAINING_RUN_CONFIG = {
  /** Base duration of the first training run in game days */
  baseDurationDays: 3,
  /** Duration multiplier per successive run on the same slot */
  durationMultiplier: 1.5,
  /** Base token cost (as % of tokens/sec) for the first run */
  baseTokenCostPct: 0.3,
  /** Token cost multiplier per successive run */
  tokenCostMultiplier: 1.3,
  /** Revenue per token uplift on first completion (multiplier applied to revenuePerToken) */
  baseUplift: 1.25,
  /** Uplift decays toward this floor on successive runs */
  upliftFloor: 1.05,
  /** Decay rate per run */
  upliftDecay: 0.1,
} as const

// ─── IPO & Takeovers ──────────────────────────────────────────────────────────

export const IPO_CONFIG = {
  /** Stock price formula weights */
  weights: {
    fcf: 0.50,
    researchScore: 0.35,
    talent: 0.15,
  },
  /** Fixed multiplier converting research score to $-equivalent for stock formula */
  researchScoreMultiplier: 0.0001,
  /** Fixed per-head value for talent in stock formula */
  talentPerHeadValue: 500_000,
} as const

export const TAKEOVER_CONFIG = {
  /** Attacker can only target companies with t/s between these fractions of attacker's t/s */
  bracketMin: 0.5,
  bracketMax: 2.0,
  /** Defense window in real hours */
  defenseWindowHours: 24,
  /** Minimum bid premium above target stock price (fraction) */
  minBidPremium: 0.05,
} as const

export const DEBT_CONFIG = {
  /** Maximum debt as a multiple of monthly FCF */
  maxDebtMultiplier: 12,
  /** Monthly interest rate */
  monthlyInterestRate: 0.03,
} as const
