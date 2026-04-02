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
import type { PlayerDoc, FacilityDoc, RackDoc, FacilityType, RackType } from '@/shared/types'
import { FACILITY_CONFIG, RACK_CONFIG } from '@/shared/config'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMoney(n: number): string {
  return '$' + n.toLocaleString('en-US')
}

function formatLabel(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function useCountdown(completesAt: number): string {
  const [remaining, setRemaining] = useState(() => Math.max(0, completesAt - Date.now()))

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
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function CountdownCell({ completesAt }: { completesAt: number }) {
  const display = useCountdown(completesAt)
  return <span className="text-amber-400">{display}</span>
}

// ─── Facility Row ─────────────────────────────────────────────────────────────

function FacilityRow({ facility }: { facility: FacilityDoc & { id: string } }) {
  const isBuilding = facility.status === 'building'
  return (
    <tr className="border-t border-zinc-700 hover:bg-zinc-800/40">
      <td className="py-2 px-3 font-mono text-sm text-zinc-100">
        {formatLabel(facility.type)}
      </td>
      <td className="py-2 px-3 font-mono text-sm">
        {isBuilding ? (
          <span className="text-amber-400">
            Building… <CountdownCell completesAt={facility.completesAt} />
          </span>
        ) : (
          <span className="text-green-400">Active</span>
        )}
      </td>
      <td className="py-2 px-3 font-mono text-sm text-zinc-300">
        {facility.racksInstalled} / {facility.rackSlots}
      </td>
    </tr>
  )
}

// ─── Rack Row ─────────────────────────────────────────────────────────────────

function RackRow({
  rack,
  facilityMap,
}: {
  rack: RackDoc & { id: string }
  facilityMap: Map<string, FacilityDoc>
}) {
  const isDelivering = rack.status === 'delivering'
  const isOffline = rack.status === 'offline'
  const facilityDoc = facilityMap.get(rack.facilityId)

  let statusEl: React.ReactNode
  if (isDelivering) {
    statusEl = (
      <span className="text-amber-400">
        Delivering… <CountdownCell completesAt={rack.completesAt} />
      </span>
    )
  } else if (isOffline) {
    statusEl = <span className="text-red-400">Offline</span>
  } else {
    statusEl = <span className="text-green-400">Active</span>
  }

  return (
    <tr className="border-t border-zinc-700 hover:bg-zinc-800/40">
      <td className="py-2 px-3 font-mono text-sm text-zinc-100">
        {formatLabel(rack.type)}
      </td>
      <td className="py-2 px-3 font-mono text-sm">{statusEl}</td>
      <td className="py-2 px-3 font-mono text-sm text-zinc-300">
        {rack.tokensPerSec.toLocaleString('en-US')} t/s
      </td>
      <td className="py-2 px-3 font-mono text-sm text-zinc-300">
        {rack.energyDraw}
      </td>
      <td className="py-2 px-3 font-mono text-sm text-zinc-400">
        {facilityDoc ? formatLabel(facilityDoc.type) : rack.facilityId.slice(0, 8) + '…'}
      </td>
    </tr>
  )
}

// ─── Build Facility Modal ─────────────────────────────────────────────────────

function BuildFacilityModal({
  playerMoney,
  onClose,
  onBuy,
}: {
  playerMoney: number
  onClose: () => void
  onBuy: (type: FacilityType) => void
}) {
  const entries = Object.entries(FACILITY_CONFIG) as [FacilityType, typeof FACILITY_CONFIG[FacilityType]][]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-zinc-900 border border-zinc-700 rounded-sm max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-zinc-700 px-5 py-4">
          <h2 className="font-mono text-sm font-bold text-green-400 tracking-widest uppercase">
            Build Facility
          </h2>
          <button
            onClick={onClose}
            className="font-mono text-xs text-zinc-500 hover:text-zinc-100 transition-colors"
          >
            [ESC]
          </button>
        </div>
        <div className="overflow-auto flex-1">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-zinc-800/60">
                <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">Name</th>
                <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">Rack Slots</th>
                <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">Build Cost</th>
                <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">Build Time</th>
                <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">Monthly Maint.</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {entries.map(([type, cfg]) => {
                const canAfford = playerMoney >= cfg.buildCost
                return (
                  <tr
                    key={type}
                    className={`border-t border-zinc-700 ${canAfford ? 'hover:bg-zinc-800/40' : 'opacity-50'}`}
                  >
                    <td className="py-2 px-3 font-mono text-sm text-zinc-100">
                      {formatLabel(type)}
                    </td>
                    <td className="py-2 px-3 font-mono text-sm text-zinc-300">{cfg.rackSlots}</td>
                    <td className="py-2 px-3 font-mono text-sm text-zinc-300">
                      {formatMoney(cfg.buildCost)}
                    </td>
                    <td className="py-2 px-3 font-mono text-sm text-zinc-300">
                      {cfg.buildTimeMinutes}m
                    </td>
                    <td className="py-2 px-3 font-mono text-sm text-zinc-300">
                      {formatMoney(cfg.monthlyMaintenance)}/mo
                    </td>
                    <td className="py-2 px-3">
                      <button
                        disabled={!canAfford}
                        onClick={() => onBuy(type)}
                        className="
                          font-mono text-xs px-3 py-1 border rounded-sm transition-colors
                          border-green-700 text-green-400
                          hover:bg-green-900/40 disabled:opacity-40 disabled:cursor-not-allowed
                        "
                      >
                        Build
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Order Rack Modal ─────────────────────────────────────────────────────────

type RackEntry = [RackType, typeof RACK_CONFIG[RackType]]

function OrderRackModal({
  playerMoney,
  facilities,
  gen2Unlocked,
  onClose,
  onOrder,
}: {
  playerMoney: number
  facilities: (FacilityDoc & { id: string })[]
  gen2Unlocked: boolean
  onClose: () => void
  onOrder: (rackType: RackType, facilityId: string) => void
}) {
  const facilitiesWithSlots = facilities.filter(
    (f) => f.status === 'active' && f.racksInstalled < f.rackSlots
  )
  const [selectedFacility, setSelectedFacility] = useState<string>(
    facilitiesWithSlots[0]?.id ?? ''
  )

  const gen1Entries = (Object.entries(RACK_CONFIG) as RackEntry[]).filter(
    ([, cfg]) => cfg.generation === 1
  )
  const gen2Entries = (Object.entries(RACK_CONFIG) as RackEntry[]).filter(
    ([, cfg]) => cfg.generation === 2
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="bg-zinc-900 border border-zinc-700 rounded-sm max-w-3xl w-full mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between border-b border-zinc-700 px-5 py-4">
          <h2 className="font-mono text-sm font-bold text-green-400 tracking-widest uppercase">
            Order Server Rack
          </h2>
          <button
            onClick={onClose}
            className="font-mono text-xs text-zinc-500 hover:text-zinc-100 transition-colors"
          >
            [ESC]
          </button>
        </div>

        {/* Facility selector */}
        <div className="px-5 py-3 border-b border-zinc-800">
          <label className="font-mono text-xs text-zinc-500 tracking-widest uppercase block mb-1">
            Install Into Facility
          </label>
          {facilitiesWithSlots.length === 0 ? (
            <p className="font-mono text-xs text-red-400">No active facilities with free slots.</p>
          ) : (
            <select
              value={selectedFacility}
              onChange={(e) => setSelectedFacility(e.target.value)}
              className="
                bg-zinc-800 border border-zinc-600 rounded-sm font-mono text-sm
                text-zinc-100 px-3 py-1.5 focus:outline-none focus:border-green-500
              "
            >
              {facilitiesWithSlots.map((f) => (
                <option key={f.id} value={f.id}>
                  {formatLabel(f.type)} — {f.rackSlots - f.racksInstalled} slot(s) free
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="overflow-auto flex-1">
          {/* Gen 1 */}
          <div className="px-5 py-2 bg-zinc-800/30">
            <span className="font-mono text-xs text-zinc-500 tracking-widest uppercase">
              Gen 1 — Consumer GPU Racks
            </span>
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="bg-zinc-800/60">
                <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">Name</th>
                <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">Tokens/s</th>
                <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">Cost</th>
                <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">Energy</th>
                <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">Delivery</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {gen1Entries.map(([type, cfg]) => {
                const canAfford = playerMoney >= cfg.buildCost
                const hasSlot = facilitiesWithSlots.length > 0
                const canOrder = canAfford && hasSlot
                return (
                  <tr
                    key={type}
                    className={`border-t border-zinc-700 ${canOrder ? 'hover:bg-zinc-800/40' : 'opacity-50'}`}
                  >
                    <td className="py-2 px-3 font-mono text-sm text-zinc-100">{formatLabel(type)}</td>
                    <td className="py-2 px-3 font-mono text-sm text-zinc-300">
                      {cfg.tokensPerSec.toLocaleString('en-US')}
                    </td>
                    <td className="py-2 px-3 font-mono text-sm text-zinc-300">{formatMoney(cfg.buildCost)}</td>
                    <td className="py-2 px-3 font-mono text-sm text-zinc-300">{cfg.energyDraw}</td>
                    <td className="py-2 px-3 font-mono text-sm text-zinc-300">{cfg.deliveryTimeMinutes}m</td>
                    <td className="py-2 px-3">
                      <button
                        disabled={!canOrder}
                        onClick={() => onOrder(type, selectedFacility)}
                        className="
                          font-mono text-xs px-3 py-1 border rounded-sm transition-colors
                          border-green-700 text-green-400
                          hover:bg-green-900/40 disabled:opacity-40 disabled:cursor-not-allowed
                        "
                      >
                        Order
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>

          {/* Gen 2 */}
          <div className="px-5 py-2 bg-zinc-800/30 border-t border-zinc-700">
            <span className="font-mono text-xs text-zinc-500 tracking-widest uppercase">
              Gen 2 — Data Center GPU Racks
            </span>
            {!gen2Unlocked && (
              <span className="ml-3 font-mono text-xs text-amber-400">
                🔒 Requires Gen 2 milestone
              </span>
            )}
          </div>
          <table className="w-full text-left">
            <thead>
              <tr className="bg-zinc-800/60">
                <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">Name</th>
                <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">Tokens/s</th>
                <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">Cost</th>
                <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">Energy</th>
                <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">Delivery</th>
                <th className="py-2 px-3"></th>
              </tr>
            </thead>
            <tbody>
              {gen2Entries.map(([type, cfg]) => (
                <tr key={type} className="border-t border-zinc-700 opacity-50">
                  <td className="py-2 px-3 font-mono text-sm text-zinc-100">{formatLabel(type)}</td>
                  <td className="py-2 px-3 font-mono text-sm text-zinc-300">
                    {cfg.tokensPerSec.toLocaleString('en-US')}
                  </td>
                  <td className="py-2 px-3 font-mono text-sm text-zinc-300">{formatMoney(cfg.buildCost)}</td>
                  <td className="py-2 px-3 font-mono text-sm text-zinc-300">{cfg.energyDraw}</td>
                  <td className="py-2 px-3 font-mono text-sm text-zinc-300">{cfg.deliveryTimeMinutes}m</td>
                  <td className="py-2 px-3">
                    {gen2Unlocked ? (
                      <button
                        disabled={playerMoney < cfg.buildCost || facilitiesWithSlots.length === 0}
                        onClick={() => onOrder(type, selectedFacility)}
                        className="
                          font-mono text-xs px-3 py-1 border rounded-sm transition-colors
                          border-green-700 text-green-400
                          hover:bg-green-900/40 disabled:opacity-40 disabled:cursor-not-allowed
                        "
                      >
                        Order
                      </button>
                    ) : (
                      <span className="font-mono text-xs text-zinc-600">Locked</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InfrastructurePage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [player, setPlayer] = useState<PlayerDoc | null>(null)
  const [facilities, setFacilities] = useState<(FacilityDoc & { id: string })[]>([])
  const [racks, setRacks] = useState<(RackDoc & { id: string })[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  const [showBuildFacility, setShowBuildFacility] = useState(false)
  const [showOrderRack, setShowOrderRack] = useState(false)
  const [toast, setToast] = useState<string | null>(null)

  // Redirect if not logged in
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/')
    }
  }, [user, loading, router])

  // Firestore subscriptions
  useEffect(() => {
    if (!user) return

    const playerRef = doc(db, 'players', user.uid)
    const facilitiesRef = collection(db, 'players', user.uid, 'facilities')
    const racksRef = collection(db, 'players', user.uid, 'racks')

    let playerLoaded = false
    let facilitiesLoaded = false
    let racksLoaded = false

    function checkAllLoaded() {
      if (playerLoaded && facilitiesLoaded && racksLoaded) {
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

    const unsubFacilities = onSnapshot(facilitiesRef, (snap) => {
      setFacilities(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as FacilityDoc) }))
      )
      facilitiesLoaded = true
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
      unsubFacilities()
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

  async function handleBuyFacility(facilityType: FacilityType) {
    if (!user || !player) return
    const cfg = FACILITY_CONFIG[facilityType]

    // Optimistic: close modal, show toast
    setShowBuildFacility(false)
    showToast('Order placed — processing next tick')

    await addDoc(collection(db, 'players', user.uid, 'actions'), {
      type: 'buy_facility',
      payload: { facilityType },
      createdAt: Date.now(),
      processed: false,
    })
  }

  async function handleOrderRack(rackType: RackType, facilityId: string) {
    if (!user || !player) return

    // Optimistic: close modal, show toast
    setShowOrderRack(false)
    showToast('Order placed — processing next tick')

    await addDoc(collection(db, 'players', user.uid, 'actions'), {
      type: 'buy_rack',
      payload: { rackType, facilityId },
      createdAt: Date.now(),
      processed: false,
    })
  }

  // Build a map for fast facility lookup by id
  const facilityMap = new Map(facilities.map((f) => [f.id, f]))

  // Gen 2 unlock: based on researchScore vs RESEARCH_MILESTONES.gen2Racks
  // We check this at the player level (player.researchScore)
  // Using the milestone value from config
  const gen2Unlocked = player
    ? player.researchScore >= 90 * player.tokensPerSec
    : false

  const facilitiesWithFreeSlots = facilities.filter(
    (f) => f.status === 'active' && f.racksInstalled < f.rackSlots
  )

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
            AGI RACE — INFRASTRUCTURE
          </p>
        </div>
        <Link
          href="/dashboard"
          className="font-mono text-xs px-4 py-2 border border-zinc-600 rounded-sm text-zinc-400 hover:border-zinc-400 hover:text-zinc-100 transition-colors"
        >
          ← Dashboard
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

      {/* ── Section A: Facilities ─────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-mono text-sm font-bold text-zinc-100 tracking-widest uppercase">
            My Facilities
          </h2>
          <button
            onClick={() => setShowBuildFacility(true)}
            className="
              font-mono text-xs px-4 py-2 border border-green-700 rounded-sm
              text-green-400 hover:bg-green-900/30 transition-colors
            "
          >
            + Build Facility
          </button>
        </div>

        {facilities.length === 0 ? (
          <p className="font-mono text-sm text-zinc-500 py-4">
            No facilities yet. Build one to get started.
          </p>
        ) : (
          <div className="border border-zinc-700 rounded-sm overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-zinc-800/60">
                  <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">
                    Facility
                  </th>
                  <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">
                    Status
                  </th>
                  <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">
                    Rack Slots
                  </th>
                </tr>
              </thead>
              <tbody>
                {facilities.map((f) => (
                  <FacilityRow key={f.id} facility={f} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ── Section B: Server Racks ───────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-mono text-sm font-bold text-zinc-100 tracking-widest uppercase">
            My Server Racks
          </h2>
          <button
            disabled={facilitiesWithFreeSlots.length === 0}
            onClick={() => setShowOrderRack(true)}
            className="
              font-mono text-xs px-4 py-2 border border-green-700 rounded-sm
              text-green-400 hover:bg-green-900/30 transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed
            "
            title={
              facilitiesWithFreeSlots.length === 0
                ? 'No active facility with free slots'
                : undefined
            }
          >
            + Order Rack
          </button>
        </div>

        {racks.length === 0 ? (
          <p className="font-mono text-sm text-zinc-500 py-4">
            No racks ordered yet. Order a rack to start generating tokens.
          </p>
        ) : (
          <div className="border border-zinc-700 rounded-sm overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-zinc-800/60">
                  <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">
                    Rack
                  </th>
                  <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">
                    Status
                  </th>
                  <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">
                    Tokens/s
                  </th>
                  <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">
                    Energy Draw
                  </th>
                  <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">
                    Facility
                  </th>
                </tr>
              </thead>
              <tbody>
                {racks.map((r) => (
                  <RackRow key={r.id} rack={r} facilityMap={facilityMap} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Status footer */}
      <div className="mt-auto border-t border-zinc-800 pt-4">
        <p className="font-mono text-xs text-zinc-600 tracking-wider">
          LIVE — Real-time Firestore listener active
        </p>
      </div>

      {/* Modals */}
      {showBuildFacility && (
        <BuildFacilityModal
          playerMoney={player.money}
          onClose={() => setShowBuildFacility(false)}
          onBuy={handleBuyFacility}
        />
      )}
      {showOrderRack && (
        <OrderRackModal
          playerMoney={player.money}
          facilities={facilities}
          gen2Unlocked={gen2Unlocked}
          onClose={() => setShowOrderRack(false)}
          onOrder={handleOrderRack}
        />
      )}
    </div>
  )
}
