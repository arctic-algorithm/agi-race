// Firestore document shapes for AGI Race
// All collections mirror the data model defined in Section 12 of the PRD

// ─── Enums ────────────────────────────────────────────────────────────────────

export type Market = 'consumer' | 'enterprise'

export type BuildStatus = 'building' | 'active'
export type RackStatus = 'delivering' | 'active' | 'offline'
export type TrainingRunStatus = 'active' | 'idle'

export type FacilityType =
  | 'garage'
  | 'basement'
  | 'office_floor'
  | 'colo_suite'
  | 'warehouse'
  | 'dc_50k'
  | 'dc_100k'
  | 'dc_150k'
  | 'dc_200k'

export type RackType =
  // Gen 1 — Consumer GPU Racks
  | 'rtx_4080'
  | 'rtx_4090'
  | 'rx_7900_xtx'
  // Gen 2 — Data Center GPU Racks
  | 'h100'
  | 'h200'
  | 'mi300x'
  | 'mi325x'
  | 'b200'
  // Gen 3 — Custom Silicon (player-designed)
  | 'custom'

export type EnergyBuildingType =
  | 'solar_panels'
  | 'wind_turbine'
  | 'solar_field'
  | 'coal_plant'
  | 'gas_plant'
  | 'nuclear_plant'

// ─── /players/{playerId} ──────────────────────────────────────────────────────

export interface TokenAllocation {
  /** 0–100, percentage of tokens sent to products */
  products: number
  /** 0–100, percentage of tokens burned for research score */
  research: number
  /** 0–100, percentage of tokens consumed by training run */
  training: number
}

export interface PlayerDoc {
  companyName: string
  market: Market
  money: number
  talentCount: number
  researchScore: number
  /** Tokens per second from all active racks (cloud rental included early-game) */
  tokensPerSec: number
  allocation: TokenAllocation
  isPublic: boolean
  /** Cumulative total revenue — used for IPO gate ($10M threshold) */
  totalRevenue: number
  /** Only meaningful post-IPO */
  stockPrice: number
  debt: number
  createdAt: number // Unix ms timestamp
  // Set by tick — used for dashboard display
  revenuePerDay?: number
  costsPerDay?: number
}

// ─── /players/{playerId}/facilities/{facilityId} ──────────────────────────────

export interface FacilityDoc {
  type: FacilityType
  status: BuildStatus
  /** Unix ms timestamp when build completes */
  completesAt: number
  /** Total rack slots in this facility */
  rackSlots: number
  racksInstalled: number
}

// ─── /players/{playerId}/racks/{rackId} ───────────────────────────────────────

export interface RackDoc {
  type: RackType
  status: RackStatus
  /** Unix ms timestamp when delivery completes */
  completesAt: number
  facilityId: string
  tokensPerSec: number
  energyDraw: number
}

// ─── /players/{playerId}/energyBuildings/{buildingId} ─────────────────────────

export interface EnergyBuildingDoc {
  type: EnergyBuildingType
  status: BuildStatus
  /** Unix ms timestamp when build completes */
  completesAt: number
  /** Energy units this building produces */
  outputUnits: number
  /** Monthly maintenance cost in $ */
  monthlyMaintenance: number
}

// ─── /players/{playerId}/products/{slot} ──────────────────────────────────────

export type ProductSlot = 'slot1' | 'slot2'

export interface ProductDoc {
  market: Market
  modelVersion: number
  revenuePerToken: number
  /** Tokens/sec currently allocated to this slot */
  tokensAllocated: number
}

// ─── /players/{playerId}/trainingRun ──────────────────────────────────────────

export interface TrainingRunDoc {
  status: TrainingRunStatus
  /** Which product slot this run will upgrade */
  targetSlot: ProductSlot
  /** Tokens/sec allocated to this run */
  tokensAllocated: number
  startedAt: number // Unix ms
  completesAt: number // Unix ms
  /** True if this is a chip design run (Gen 3 custom silicon) */
  isChipDesign: boolean
}

// ─── /players/{playerId}/pressRoom/{headlineId} ───────────────────────────────

export type PressRoomEvent =
  | 'garage_built'
  | 'first_rack_installed'
  | 'first_training_run_completed'
  | 'first_1m_revenue'
  | 'second_product_slot_unlocked'
  | 'ipo'
  | 'research_milestone_colo'
  | 'research_milestone_gen2'
  | 'research_milestone_custom_silicon'
  | 'custom_silicon_designed'
  | 'first_takeover_bid_launched'
  | 'first_takeover_defended'
  | 'first_takeover_won'

export interface PressRoomDoc {
  event: PressRoomEvent
  headline: string
  createdAt: number // Unix ms
}

// ─── /players/{playerId}/talent/{hireId} ──────────────────────────────────────

export interface TalentDoc {
  hiredAt: number // Unix ms
  /** Unix ms timestamp when the next hire becomes available */
  nextHireAvailableAt: number
}

// ─── /players/{playerId}/actions/{actionId} ───────────────────────────────────

export type ActionType =
  | 'buy_facility'
  | 'buy_rack'
  | 'buy_energy_building'
  | 'change_allocation'
  | 'start_training_run'
  | 'hire_talent'
  | 'poach_talent'
  | 'buy_cloud_tokens'
  | 'take_on_debt'
  | 'launch_ipo'
  | 'launch_takeover_bid'

export interface ActionDoc {
  type: ActionType
  payload: Record<string, unknown>
  createdAt: number // Unix ms
  /** Set by the tick function after processing */
  processedAt?: number
  error?: string
}

// ─── /global/leaderboard ──────────────────────────────────────────────────────

export interface LeaderboardEntry {
  playerId: string
  companyName: string
  researchScore: number
  tokensPerSec: number
  fcf: number // free cash flow (monthly revenue - monthly costs)
  stockPrice: number // 0 for pre-IPO players
  isPublic: boolean
}

export interface LeaderboardDoc {
  players: LeaderboardEntry[]
  updatedAt: number // Unix ms
}

// ─── /global/marketSaturation ─────────────────────────────────────────────────

export interface MarketSaturationDoc {
  /** Total tokens/sec allocated to consumer products across all players */
  consumerAllocation: number
  /** Total tokens/sec allocated to enterprise products across all players */
  enterpriseAllocation: number
}

// ─── /config/gameConfig ───────────────────────────────────────────────────────
// Written by the admin panel, read by the game tick

export interface GameConfigDoc {
  updatedAt: number // Unix ms
  // All fields mirror GameConfig from shared/config.ts
  // (admin panel writes this; tick reads it)
  [key: string]: unknown
}
