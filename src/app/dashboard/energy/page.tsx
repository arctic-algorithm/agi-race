'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  collection,
  doc,
  onSnapshot,
  addDoc,
} from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import type {
  PlayerDoc,
  EnergyBuildingDoc,
  RackDoc,
  EnergyBuildingType,
} from '@/shared/types'
import { ENERGY_BUILDING_CONFIG, BUILD_TIME_MULTIPLIERS } from '@/shared/config'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMoney(n: number): string {
  return '$' + n.toLocaleString('en-US')
}

function formatLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function formatUnits(n: number): string {
  return n.toLocaleString('en-US')
}

// ─── Countdown hook ───────────────────────────────────────────────────────────

function useCountdown(completesAt: number): string {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, completesAt - Date.now())
  )

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, completesAt - Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [completesAt])

  if (remaining <= 0) return 'completing...'
  const totalSec = Math.ceil(remaining / 1000)
  const mins = Math.floor(totalSec / 60)
  const secs = totalSec % 60
  if (mins >= 60) {
    const hrs = Math.floor(mins / 60)
    const remMins = mins % 60
    return `${hrs}h ${remMins}m`
  }
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CountdownCell({ completesAt }: { completesAt: number }) {
  const display = useCountdown(completesAt)
  return <span className="text-amber-400">{display}</span>
}

// ─── Energy Overview Bar ──────────────────────────────────────────────────────

function EnergyOverviewBar({
  energyBuildings,
  racks,
}: {
  energyBuildings: (EnergyBuildingDoc & { id: string })[]
  racks: (RackDoc & { id: string })[]
}) {
  const produced = energyBuildings
    .filter((b) => b.status === 'active')
    .reduce((sum, b) => sum + b.outputUnits, 0)

  const consumed = racks
    .filter((r) => r.status === 'active')
    .reduce((sum, r) => sum + r.energyDraw, 0)

  const surplus = produced - consumed
  const isDeficit = surplus < 0

  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-sm p-4 font-mono">
      <p className="text-xs text-zinc-500 tracking-widest uppercase mb-2">
        Energy Overview
      </p>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
        <span>
          <span className="text-zinc-400">PRODUCED:</span>{' '}
          <span className="text-green-400 font-bold">{formatUnits(produced)} units</span>
        </span>
        <span className="text-zinc-600 select-none">|</span>
        <span>
          <span className="text-zinc-400">CONSUMED:</span>{' '}
          <span className="text-zinc-100 font-bold">{formatUnits(consumed)} units</span>
        </span>
        <span className="text-zinc-600 select-none">|</span>
        <span>
          <span className="text-zinc-400">SURPLUS:</span>{' '}
          <span
            className={`font-bold ${
              isDeficit ? 'text-red-400' : 'text-green-400'
            }`}
          >
            {isDeficit ? '-' : '+'}{formatUnits(Math.abs(surplus))} units
          </span>
        </span>
      </div>
      {isDeficit && (
        <p className="mt-2 text-xs text-red-400">
          Energy deficit — some racks may run at reduced capacity. Purchase more energy buildings.
        </p>
      )}
    </div>
  )
}

// ─── Owned Buildings Table ────────────────────────────────────────────────────

function OwnedBuildingsTable({
  buildings,
  confirmSell,
  onPause,
  onUnpause,
  onSell,
  onConfirmSell,
}: {
  buildings: (EnergyBuildingDoc & { id: string })[]
  confirmSell: string | null
  onPause: (assetCollection: string, id: string) => void
  onUnpause: (assetCollection: string, id: string) => void
  onSell: (assetCollection: string, id: string) => void
  onConfirmSell: (id: string | null) => void
}) {
  if (buildings.length === 0) {
    return (
      <p className="font-mono text-sm text-zinc-500 py-4">
        No energy infrastructure. Running on public grid.
      </p>
    )
  }

  return (
    <div className="border border-zinc-700 rounded-sm overflow-hidden">
      <table className="w-full text-left">
        <thead>
          <tr className="bg-zinc-800/60">
            <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">
              Type
            </th>
            <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">
              Status
            </th>
            <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">
              Output
            </th>
            <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">
              Maintenance/mo
            </th>
            <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {buildings.map((b) => (
            <BuildingRow
              key={b.id}
              building={b}
              confirmSell={confirmSell}
              onPause={onPause}
              onUnpause={onUnpause}
              onSell={onSell}
              onConfirmSell={onConfirmSell}
            />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BuildingRow({
  building,
  confirmSell,
  onPause,
  onUnpause,
  onSell,
  onConfirmSell,
}: {
  building: EnergyBuildingDoc & { id: string }
  confirmSell: string | null
  onPause: (assetCollection: string, id: string) => void
  onUnpause: (assetCollection: string, id: string) => void
  onSell: (assetCollection: string, id: string) => void
  onConfirmSell: (id: string | null) => void
}) {
  const isBuilding = building.status === 'building'
  const isOffline = building.status === 'offline'

  return (
    <tr className="border-t border-zinc-700 hover:bg-zinc-800/40">
      <td className="py-2 px-3 font-mono text-sm text-zinc-100">
        {formatLabel(building.type)}
      </td>
      <td className="py-2 px-3 font-mono text-sm">
        {isBuilding ? (
          <span className="text-amber-400">
            BUILDING — <CountdownCell completesAt={building.completesAt} /> remaining
          </span>
        ) : isOffline ? (
          <span className="text-red-400">OFFLINE — balance depleted</span>
        ) : (
          <span className="text-green-400">ACTIVE</span>
        )}
      </td>
      <td className="py-2 px-3 font-mono text-sm text-zinc-300">
        {isBuilding || isOffline ? (
          <span className="text-zinc-500">—</span>
        ) : (
          `${formatUnits(building.outputUnits)} units`
        )}
      </td>
      <td className="py-2 px-3 font-mono text-sm text-zinc-300">
        {formatMoney(building.monthlyMaintenance)}/mo
      </td>
      <td className="py-2 px-3">
        {!isBuilding && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => isOffline ? onUnpause('energyBuildings', building.id) : onPause('energyBuildings', building.id)}
              className="font-mono text-xs px-2 py-1 border rounded-sm transition-colors border-zinc-600 text-zinc-400 hover:border-zinc-300 hover:text-zinc-100"
            >
              {isOffline ? 'Unpause' : 'Pause'}
            </button>
            {confirmSell === building.id ? (
              <button
                onClick={() => { onSell('energyBuildings', building.id); onConfirmSell(null) }}
                className="font-mono text-xs px-2 py-1 border rounded-sm transition-colors border-red-700 text-red-400 hover:bg-red-900/40"
              >
                Confirm?
              </button>
            ) : (
              <button
                onClick={() => onConfirmSell(building.id)}
                className="font-mono text-xs px-2 py-1 border rounded-sm transition-colors border-zinc-600 text-zinc-400 hover:border-red-600 hover:text-red-400"
              >
                Sell (50%)
              </button>
            )}
          </div>
        )}
      </td>
    </tr>
  )
}

// ─── Purchase Cards ───────────────────────────────────────────────────────────

type EnergyBuildingEntry = [
  EnergyBuildingType,
  (typeof ENERGY_BUILDING_CONFIG)[EnergyBuildingType]
]

function PurchaseSection({
  playerMoney,
  ownedBuildings,
  onPurchase,
}: {
  playerMoney: number
  ownedBuildings: (EnergyBuildingDoc & { id: string })[]
  onPurchase: (type: EnergyBuildingType) => void
}) {
  const entries = Object.entries(ENERGY_BUILDING_CONFIG) as EnergyBuildingEntry[]

  return (
    <div className="flex flex-col gap-3">
      <p className="font-mono text-xs text-zinc-500">
        Build time increases by{' '}
        <span className="text-amber-400">
          {((BUILD_TIME_MULTIPLIERS.energyBuilding - 1) * 100).toFixed(0)}%
        </span>{' '}
        per successive building of the same type already owned.
      </p>

      <div className="border border-zinc-700 rounded-sm overflow-hidden">
        <table className="w-full text-left">
          <thead>
            <tr className="bg-zinc-800/60">
              <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">
                Name
              </th>
              <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">
                Output
              </th>
              <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">
                Build Cost
              </th>
              <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">
                Build Time
              </th>
              <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">
                Maintenance/mo
              </th>
              <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">
                Req. Facility
              </th>
              <th className="py-2 px-3" />
            </tr>
          </thead>
          <tbody>
            {entries.map(([type, cfg]) => {
              const canAfford = playerMoney >= cfg.buildCost

              // Count same-type buildings to compute effective build time
              const sameTypeCount = ownedBuildings.filter(
                (b) => b.type === type
              ).length
              const effectiveMinutes =
                sameTypeCount > 0
                  ? Math.round(
                      cfg.buildTimeMinutes *
                        Math.pow(
                          BUILD_TIME_MULTIPLIERS.energyBuilding,
                          sameTypeCount
                        )
                    )
                  : cfg.buildTimeMinutes

              return (
                <tr
                  key={type}
                  className={`border-t border-zinc-700 ${
                    canAfford ? 'hover:bg-zinc-800/40' : 'opacity-50'
                  }`}
                >
                  <td className="py-2 px-3 font-mono text-sm text-zinc-100">
                    {formatLabel(type)}
                  </td>
                  <td className="py-2 px-3 font-mono text-sm text-zinc-300">
                    {formatUnits(cfg.outputUnits)} units
                  </td>
                  <td className="py-2 px-3 font-mono text-sm text-zinc-300">
                    {formatMoney(cfg.buildCost)}
                  </td>
                  <td className="py-2 px-3 font-mono text-sm text-zinc-300">
                    {effectiveMinutes !== cfg.buildTimeMinutes ? (
                      <span>
                        <span className="line-through text-zinc-600">
                          {cfg.buildTimeMinutes}m
                        </span>{' '}
                        <span className="text-amber-400">
                          {effectiveMinutes}m
                        </span>
                      </span>
                    ) : (
                      `${cfg.buildTimeMinutes}m`
                    )}
                  </td>
                  <td className="py-2 px-3 font-mono text-sm text-zinc-300">
                    {formatMoney(cfg.monthlyMaintenance)}/mo
                  </td>
                  <td className="py-2 px-3 font-mono text-sm text-zinc-400">
                    {formatLabel(cfg.requiredFacility)}
                  </td>
                  <td className="py-2 px-3">
                    <button
                      disabled={!canAfford}
                      onClick={() => onPurchase(type)}
                      className="
                        font-mono text-xs px-3 py-1 border rounded-sm transition-colors
                        border-green-700 text-green-400
                        hover:bg-green-900/40 disabled:opacity-40 disabled:cursor-not-allowed
                      "
                    >
                      Purchase
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EnergyPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [player, setPlayer] = useState<PlayerDoc | null>(null)
  const [energyBuildings, setEnergyBuildings] = useState<
    (EnergyBuildingDoc & { id: string })[]
  >([])
  const [racks, setRacks] = useState<(RackDoc & { id: string })[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [confirmSellBuilding, setConfirmSellBuilding] = useState<string | null>(null)

  // Auth redirect
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/')
    }
  }, [user, loading, router])

  // Firestore subscriptions
  useEffect(() => {
    if (!user) return

    const playerRef = doc(db, 'players', user.uid)
    const buildingsRef = collection(db, 'players', user.uid, 'energyBuildings')
    const racksRef = collection(db, 'players', user.uid, 'racks')

    let playerLoaded = false
    let buildingsLoaded = false
    let racksLoaded = false

    function checkAllLoaded() {
      if (playerLoaded && buildingsLoaded && racksLoaded) {
        setDataLoading(false)
      }
    }

    const unsubPlayer = onSnapshot(playerRef, (snap) => {
      if (snap.exists()) {
        setPlayer(snap.data() as PlayerDoc)
      } else {
        router.replace('/onboarding')
      }
      playerLoaded = true
      checkAllLoaded()
    })

    const unsubBuildings = onSnapshot(buildingsRef, (snap) => {
      setEnergyBuildings(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as EnergyBuildingDoc) }))
      )
      buildingsLoaded = true
      checkAllLoaded()
    })

    const unsubRacks = onSnapshot(racksRef, (snap) => {
      setRacks(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as RackDoc) }))
      )
      racksLoaded = true
      checkAllLoaded()
    })

    return () => {
      unsubPlayer()
      unsubBuildings()
      unsubRacks()
    }
  }, [user, router])

  // Dismiss toast after 4 seconds
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(id)
  }, [toast])

  const showToast = useCallback((msg: string) => {
    setToast(msg)
  }, [])

  async function handlePause(assetCollection: string, docId: string) {
    if (!user) return
    await addDoc(collection(db, 'players', user.uid, 'actions'), {
      type: 'pause_asset',
      payload: { assetCollection, docId },
      createdAt: Date.now(),
      processed: false,
    })
  }

  async function handleUnpause(assetCollection: string, docId: string) {
    if (!user) return
    await addDoc(collection(db, 'players', user.uid, 'actions'), {
      type: 'unpause_asset',
      payload: { assetCollection, docId },
      createdAt: Date.now(),
      processed: false,
    })
  }

  async function handleSell(assetCollection: string, docId: string) {
    if (!user) return
    showToast('Sell order placed — processing next tick')
    await addDoc(collection(db, 'players', user.uid, 'actions'), {
      type: 'sell_asset',
      payload: { assetCollection, docId },
      createdAt: Date.now(),
      processed: false,
    })
  }

  async function handlePurchase(buildingType: EnergyBuildingType) {
    if (!user || !player) return

    showToast('Construction order placed — processing next tick')

    await addDoc(collection(db, 'players', user.uid, 'actions'), {
      type: 'buy_energy_building',
      payload: { buildingType },
      createdAt: Date.now(),
      processed: false,
    })
  }

  if (loading || dataLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="font-mono text-zinc-400 animate-pulse">Loading…</p>
      </div>
    )
  }

  if (!player) return null

  return (
    <div className="flex flex-1 flex-col p-6 gap-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-700 pb-4">
        <div>
          <h1 className="font-mono text-xl font-bold text-green-400 tracking-widest">
            {player.companyName.toUpperCase()}
          </h1>
          <p className="font-mono text-xs text-zinc-500 mt-0.5 tracking-wider">
            AGI RACE — ENERGY
          </p>
        </div>
        <Link
          href="/dashboard"
          className="font-mono text-xs px-4 py-2 border border-zinc-600 rounded-sm text-zinc-400 hover:border-zinc-400 hover:text-zinc-100 transition-colors"
        >
          Dashboard
        </Link>
      </div>

      {/* Toast */}
      {toast && (
        <div className="border border-green-700 bg-green-900/20 rounded-sm px-4 py-2">
          <p className="font-mono text-sm text-green-400">{toast}</p>
        </div>
      )}

      {/* Balance */}
      <div className="font-mono text-sm text-zinc-400">
        Balance:{' '}
        <span className="text-green-400 font-bold">{formatMoney(player.money)}</span>
      </div>

      {/* ── Section A: Energy Overview ─────────────────────────────────── */}
      <section>
        <EnergyOverviewBar energyBuildings={energyBuildings} racks={racks} />
      </section>

      {/* ── Section B: Owned Energy Buildings ─────────────────────────── */}
      <section>
        <h2 className="font-mono text-sm font-bold text-zinc-100 tracking-widest uppercase mb-3">
          My Energy Infrastructure
        </h2>
        <OwnedBuildingsTable
          buildings={energyBuildings}
          confirmSell={confirmSellBuilding}
          onPause={handlePause}
          onUnpause={handleUnpause}
          onSell={handleSell}
          onConfirmSell={setConfirmSellBuilding}
        />
      </section>

      {/* ── Section C: Purchase Energy Buildings ──────────────────────── */}
      <section>
        <h2 className="font-mono text-sm font-bold text-zinc-100 tracking-widest uppercase mb-3">
          Purchase Energy Buildings
        </h2>
        <PurchaseSection
          playerMoney={player.money}
          ownedBuildings={energyBuildings}
          onPurchase={handlePurchase}
        />
      </section>

      {/* Status footer */}
      <div className="mt-auto border-t border-zinc-800 pt-4">
        <p className="font-mono text-xs text-zinc-600 tracking-wider">
          LIVE — Real-time Firestore listener active
        </p>
      </div>
    </div>
  )
}
