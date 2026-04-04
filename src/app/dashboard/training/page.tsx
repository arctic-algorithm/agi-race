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

type ProductKey = string // market name used as product doc ID e.g. 'consumer' | 'enterprise'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import type { PlayerDoc, ProductDoc, TrainingRunDoc } from '@/shared/types'
import { TRAINING_RUN_CONFIG, GLOBAL_CONFIG } from '@/shared/config'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatNumber(n: number, decimals = 0): string {
  return n.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Convert game days to real ms */
function gameDaysToMs(days: number): number {
  return days * GLOBAL_CONFIG.gameDaySeconds * 1000
}

/**
 * Compute the revenue uplift multiplier for a given run index (0-based).
 * uplift = max(upliftFloor, baseUplift - upliftDecay * runIndex)
 */
function computeUplift(completedRunCount: number): number {
  const { baseUplift, upliftFloor, upliftDecay } = TRAINING_RUN_CONFIG
  return Math.max(upliftFloor, baseUplift - upliftDecay * completedRunCount)
}

/**
 * Compute the estimated duration in game days for the next run on a given slot.
 * duration = baseDurationDays * durationMultiplier^completedRunCount
 */
function computeNextDurationDays(completedRunCount: number): number {
  const { baseDurationDays, durationMultiplier } = TRAINING_RUN_CONFIG
  return baseDurationDays * Math.pow(durationMultiplier, completedRunCount)
}

function formatDurationMs(ms: number): string {
  const totalSec = Math.ceil(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const mins = Math.floor(totalSec / 60)
  if (mins < 60) return `${mins}m ${totalSec % 60}s`
  const hours = Math.floor(mins / 60)
  const remMins = mins % 60
  return `${hours}h ${remMins}m`
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.min(100, Math.max(0, pct))
  return (
    <div className="w-full h-2 bg-zinc-700 rounded-sm overflow-hidden">
      <div
        className="h-full bg-green-500 transition-all duration-1000"
        style={{ width: `${clamped}%` }}
      />
    </div>
  )
}

// ─── Live Countdown ───────────────────────────────────────────────────────────

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

// ─── Active Run Panel ─────────────────────────────────────────────────────────

function ActiveRunPanel({
  run,
  player,
}: {
  run: TrainingRunDoc
  player: PlayerDoc
}) {
  const now = useNow()

  const totalDurationMs = run.completesAt - run.startedAt
  const elapsed = now - run.startedAt
  const pct = totalDurationMs > 0 ? (elapsed / totalDurationMs) * 100 : 0

  const remaining = Math.max(0, run.completesAt - now)
  const remainingDisplay = remaining <= 0 ? 'completing...' : formatDurationMs(remaining)

  const tokensPerDay = player.tokensPerSec * 86400 * (player.allocation.training / 100)

  const slotLabel = run.targetSlot.charAt(0).toUpperCase() + run.targetSlot.slice(1)

  return (
    <div className="border border-zinc-700 rounded-sm p-4 bg-zinc-800/30 flex flex-col gap-3">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div>
          <p className="font-mono text-xs text-zinc-500 tracking-widest uppercase mb-1">Target Slot</p>
          <p className="font-mono text-sm text-zinc-100">{slotLabel}</p>
        </div>
        <div>
          <p className="font-mono text-xs text-zinc-500 tracking-widest uppercase mb-1">Tokens / Day</p>
          <p className="font-mono text-sm text-green-400">
            {formatNumber(tokensPerDay)} t/day
          </p>
        </div>
        <div>
          <p className="font-mono text-xs text-zinc-500 tracking-widest uppercase mb-1">Time Remaining</p>
          <p className="font-mono text-sm text-amber-400">{remainingDisplay}</p>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex justify-between font-mono text-xs text-zinc-500">
          <span>Progress</span>
          <span>{Math.min(100, pct).toFixed(1)}%</span>
        </div>
        <ProgressBar pct={pct} />
      </div>

      <p className="font-mono text-xs text-zinc-600">
        Est. completion: {formatDate(run.completesAt)}
      </p>
    </div>
  )
}

// ─── Product Card ─────────────────────────────────────────────────────────────

interface ProductCardProps {
  slot: ProductKey
  product: ProductDoc | null
  completedRunsForSlot: number
  isActive: boolean
  noAllocation: boolean
  onStart: (slot: ProductKey) => void
}

function ProductCard({
  slot,
  product,
  completedRunsForSlot,
  isActive,
  noAllocation,
  onStart,
}: ProductCardProps) {
  const marketLabel = slot.charAt(0).toUpperCase() + slot.slice(1)
  const slotLabel = marketLabel

  const nextUplift = computeUplift(completedRunsForSlot)
  const nextDurationDays = computeNextDurationDays(completedRunsForSlot)
  const nextDurationMs = gameDaysToMs(nextDurationDays)

  const disabled = isActive || noAllocation

  const currentRevPerToken = product ? product.revenuePerToken : null
  const projectedRevPerToken =
    currentRevPerToken !== null ? currentRevPerToken * nextUplift : null

  return (
    <div
      className={`border rounded-sm p-4 flex flex-col gap-3 ${
        disabled ? 'border-zinc-700 opacity-60' : 'border-zinc-600'
      } bg-zinc-800/20`}
    >
      <div className="flex items-center justify-between">
        <div>
          <p className="font-mono text-xs text-zinc-500 tracking-widest uppercase">
            {slotLabel} — {marketLabel}
          </p>
          {product && (
            <p className="font-mono text-sm text-zinc-100 mt-0.5">
              Model v{product.modelVersion}
            </p>
          )}
          {!product && (
            <p className="font-mono text-sm text-zinc-500 mt-0.5">No product data</p>
          )}
        </div>
        <button
          disabled={disabled}
          onClick={() => onStart(slot)}
          className="
            font-mono text-xs px-4 py-2 border rounded-sm transition-colors
            border-green-700 text-green-400
            hover:bg-green-900/30
            disabled:opacity-40 disabled:cursor-not-allowed
          "
          title={
            isActive
              ? 'A training run is already in progress'
              : noAllocation
              ? 'Set training allocation > 0% first'
              : undefined
          }
        >
          Train {marketLabel} Model
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="font-mono text-xs text-zinc-500 tracking-widest uppercase mb-0.5">
            Revenue / Token
          </p>
          <p className="font-mono text-sm text-zinc-200">
            {currentRevPerToken !== null
              ? `$${currentRevPerToken.toFixed(5)}`
              : '—'}
          </p>
        </div>
        <div>
          <p className="font-mono text-xs text-zinc-500 tracking-widest uppercase mb-0.5">
            Projected After
          </p>
          <p className="font-mono text-sm text-green-400">
            {projectedRevPerToken !== null
              ? `$${projectedRevPerToken.toFixed(5)}`
              : '—'}
          </p>
        </div>
        <div>
          <p className="font-mono text-xs text-zinc-500 tracking-widest uppercase mb-0.5">
            Next Uplift
          </p>
          <p className="font-mono text-sm text-zinc-200">
            {nextUplift.toFixed(2)}×
          </p>
        </div>
        <div>
          <p className="font-mono text-xs text-zinc-500 tracking-widest uppercase mb-0.5">
            Est. Duration
          </p>
          <p className="font-mono text-sm text-zinc-200">
            {nextDurationDays.toFixed(1)} game days ({formatDurationMs(nextDurationMs)})
          </p>
        </div>
      </div>

      <p className="font-mono text-xs text-zinc-600">
        Completed runs on this slot: {completedRunsForSlot}
      </p>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TrainingPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [player, setPlayer] = useState<PlayerDoc | null>(null)
  const [products, setProducts] = useState<Map<ProductKey, ProductDoc>>(new Map())
  const [activeRun, setActiveRun] = useState<TrainingRunDoc | null>(null)
  const [completedRuns, setCompletedRuns] = useState<(TrainingRunDoc & { id: string })[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)

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
    const productsRef = collection(db, 'players', user.uid, 'products')
    const activeRunRef = doc(db, 'players', user.uid, 'trainingRun', 'current')
    const completedRunsRef = collection(db, 'players', user.uid, 'trainingRuns')

    let playerLoaded = false
    let productsLoaded = false
    let runLoaded = false
    let completedLoaded = false

    function checkAllLoaded() {
      if (playerLoaded && productsLoaded && runLoaded && completedLoaded) {
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

    const unsubProducts = onSnapshot(productsRef, (snap) => {
      const map = new Map<ProductKey, ProductDoc>()
      snap.docs.forEach((d) => {
        map.set(d.id, d.data() as ProductDoc)
      })
      setProducts(map)
      productsLoaded = true
      checkAllLoaded()
    })

    const unsubActiveRun = onSnapshot(activeRunRef, (snap) => {
      if (snap.exists()) {
        const run = snap.data() as TrainingRunDoc
        setActiveRun(run.status === 'active' ? run : null)
      } else {
        setActiveRun(null)
      }
      runLoaded = true
      checkAllLoaded()
    })

    const unsubCompleted = onSnapshot(completedRunsRef, (snap) => {
      setCompletedRuns(
        snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as TrainingRunDoc) }))
          .sort((a, b) => b.completesAt - a.completesAt)
      )
      completedLoaded = true
      checkAllLoaded()
    })

    return () => {
      unsubPlayer()
      unsubProducts()
      unsubActiveRun()
      unsubCompleted()
    }
  }, [user, router])

  // Toast auto-dismiss
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(id)
  }, [toast])

  const showToast = useCallback((msg: string) => setToast(msg), [])

  async function handleStartRun(targetSlot: ProductKey) {
    if (!user || !player) return

    showToast('Training run started — processing next tick')

    await addDoc(collection(db, 'players', user.uid, 'actions'), {
      type: 'start_training_run',
      payload: { targetSlot },
      createdAt: Date.now(),
      processed: false,
    })
  }

  // ── Derived state ───────────────────────────────────────────────────────────

  // Only show product slots that actually exist in Firestore
  const ownedProductKeys = Array.from(products.keys())

  // Count completed runs per slot to determine uplift/duration for each
  const completedRunsBySlot = (slot: ProductKey) =>
    completedRuns.filter((r) => r.targetSlot === slot).length

  const noAllocation = player ? player.allocation.training === 0 : false
  const tokensPerDay = player
    ? player.tokensPerSec * 86400 * (player.allocation.training / 100)
    : 0

  // ── Loading / null guards ───────────────────────────────────────────────────

  if (loading || dataLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="font-mono text-zinc-400 animate-pulse">Loading…</p>
      </div>
    )
  }

  if (!player) return null

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-1 flex-col p-6 gap-6 max-w-4xl mx-auto w-full">
      <h1 className="font-mono text-sm font-bold text-zinc-100 tracking-widest uppercase border-b border-zinc-700 pb-4">
        Training Runs
      </h1>

      {/* Toast */}
      {toast && (
        <div className="border border-green-700 bg-green-900/20 rounded-sm px-4 py-2">
          <p className="font-mono text-sm text-green-400">{toast}</p>
        </div>
      )}

      {/* Training Allocation Banner */}
      <div className="border border-zinc-700 rounded-sm px-4 py-3 bg-zinc-800/30 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
        <div className="flex items-center gap-4">
          <div>
            <p className="font-mono text-xs text-zinc-500 tracking-widest uppercase">
              Training Allocation
            </p>
            <p className="font-mono text-lg font-bold text-green-400">
              {player.allocation.training}%
            </p>
          </div>
          <div>
            <p className="font-mono text-xs text-zinc-500 tracking-widest uppercase">
              Tokens / Day to Training
            </p>
            <p className="font-mono text-sm text-zinc-100">
              {formatNumber(tokensPerDay)} t/day
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/allocation"
          className="
            font-mono text-xs px-4 py-2 border border-zinc-600 rounded-sm
            text-zinc-300 hover:border-green-500 hover:text-green-400
            transition-colors duration-150 self-start sm:self-auto
          "
        >
          Change Allocation →
        </Link>
      </div>

      {/* No allocation warning */}
      {noAllocation && (
        <div className="border border-amber-700 bg-amber-900/10 rounded-sm px-4 py-3">
          <p className="font-mono text-sm text-amber-400">
            Warning: Training allocation is 0%. No tokens will be consumed by training runs.{' '}
            <Link href="/dashboard/allocation" className="underline hover:text-amber-300">
              Adjust allocation
            </Link>{' '}
            to enable training.
          </p>
        </div>
      )}

      {/* ── Section 1: Current Training Run ──────────────────────────── */}
      <section>
        <h2 className="font-mono text-sm font-bold text-zinc-100 tracking-widest uppercase mb-3">
          Current Training Run
        </h2>

        {activeRun ? (
          <ActiveRunPanel run={activeRun} player={player} />
        ) : (
          <div className="border border-zinc-700 rounded-sm px-4 py-6 text-center">
            <p className="font-mono text-sm text-zinc-500">No training run in progress</p>
          </div>
        )}
      </section>

      {/* ── Section 2: Start New Training Run ────────────────────────── */}
      <section>
        <h2 className="font-mono text-sm font-bold text-zinc-100 tracking-widest uppercase mb-3">
          Start New Training Run
        </h2>

        {activeRun && (
          <p className="font-mono text-xs text-zinc-500 mb-3">
            A training run is already active. Wait for it to complete before starting a new one.
          </p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ownedProductKeys.map((key) => (
            <ProductCard
              key={key}
              slot={key}
              product={products.get(key) ?? null}
              completedRunsForSlot={completedRunsBySlot(key)}
              isActive={activeRun !== null}
              noAllocation={noAllocation}
              onStart={handleStartRun}
            />
          ))}
        </div>
      </section>

      {/* ── Section 3: Training History ───────────────────────────────── */}
      <section>
        <h2 className="font-mono text-sm font-bold text-zinc-100 tracking-widest uppercase mb-3">
          Training History
        </h2>

        {completedRuns.length === 0 ? (
          <div className="border border-zinc-700 rounded-sm px-4 py-6 text-center">
            <p className="font-mono text-sm text-zinc-500">No completed runs yet</p>
          </div>
        ) : (
          <div className="border border-zinc-700 rounded-sm overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-zinc-800/60">
                  <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">
                    Slot
                  </th>
                  <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">
                    Model Version
                  </th>
                  <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">
                    Completed
                  </th>
                </tr>
              </thead>
              <tbody>
                {completedRuns.map((run) => {
                  const product = products.get(run.targetSlot)
                  const slotLabel = run.targetSlot.charAt(0).toUpperCase() + run.targetSlot.slice(1)
                  return (
                    <tr
                      key={run.id}
                      className="border-t border-zinc-700 hover:bg-zinc-800/40"
                    >
                      <td className="py-2 px-3 font-mono text-sm text-zinc-100">
                        {slotLabel}
                      </td>
                      <td className="py-2 px-3 font-mono text-sm text-zinc-300">
                        {product ? `v${product.modelVersion}` : '—'}
                      </td>
                      <td className="py-2 px-3 font-mono text-sm text-zinc-400">
                        {formatDate(run.completesAt)}
                      </td>
                    </tr>
                  )
                })}
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
    </div>
  )
}
