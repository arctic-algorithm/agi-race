'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { doc, onSnapshot, updateDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import type { PlayerDoc, TokenAllocation } from '@/shared/types'

// ─── Constants ────────────────────────────────────────────────────────────────

const SECONDS_PER_DAY = 86_400

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTps(n: number): string {
  return n.toLocaleString('en-US')
}

function formatMoney(n: number): string {
  return '$' + Math.round(n).toLocaleString('en-US')
}

/** Clamp a number between 0 and 100 (inclusive). */
function clamp(v: number): number {
  return Math.max(0, Math.min(100, v))
}

/**
 * When the user changes one slider, we auto-adjust one of the other two
 * (preferring `adjustTarget`) to keep the sum at 100.
 * If `adjustTarget` would go negative, we pull the remainder from the third
 * slider instead. Values are always clamped to 0–100 and integers.
 */
function rebalance(
  next: TokenAllocation,
  changed: keyof TokenAllocation,
  adjustTarget: keyof TokenAllocation,
  third: keyof TokenAllocation,
): TokenAllocation {
  const result = { ...next }

  // Ensure the changed field is in range
  result[changed] = clamp(result[changed])

  const remaining = 100 - result[changed]

  // Try to fit the unchanged third field first, then adjust the target
  const thirdVal = clamp(result[third])
  const targetVal = remaining - thirdVal

  if (targetVal >= 0) {
    result[adjustTarget] = targetVal
    result[third] = thirdVal
  } else {
    // Target would go negative — pin it to 0 and shorten the third
    result[adjustTarget] = 0
    result[third] = remaining
  }

  return result
}

// ─── SliderRow ────────────────────────────────────────────────────────────────

function SliderRow({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-zinc-400 tracking-widest uppercase">
          {label}
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onChange(value - 5)}
            className="font-mono text-xs px-2 py-0.5 border border-zinc-600 rounded-sm text-zinc-300 hover:border-zinc-400 transition-colors disabled:opacity-30"
            disabled={value <= 0}
          >
            −5
          </button>
          <span className="font-mono text-green-400 w-10 text-right text-sm font-bold">
            {value}%
          </span>
          <button
            onClick={() => onChange(value + 5)}
            className="font-mono text-xs px-2 py-0.5 border border-zinc-600 rounded-sm text-zinc-300 hover:border-zinc-400 transition-colors disabled:opacity-30"
            disabled={value >= 100}
          >
            +5
          </button>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 appearance-none rounded-full bg-zinc-700 cursor-pointer accent-green-400"
      />
    </div>
  )
}

// ─── Preview Card ─────────────────────────────────────────────────────────────

function PreviewCard({
  label,
  pct,
  tokensPerSec,
  detail,
}: {
  label: string
  pct: number
  tokensPerSec: number
  detail: string
}) {
  const allocatedTps = (tokensPerSec * pct) / 100

  return (
    <div className="p-4 border border-zinc-700 rounded-sm bg-zinc-800/50 flex flex-col gap-1">
      <p className="font-mono text-xs text-zinc-500 tracking-widest uppercase">{label}</p>
      <p className="font-mono text-lg font-bold text-green-400">
        {pct}%{' '}
        <span className="text-sm text-zinc-300">
          = {formatTps(Math.round(allocatedTps))} t/s
        </span>
      </p>
      <p className="font-mono text-xs text-zinc-400">{detail}</p>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AllocationPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [player, setPlayer] = useState<PlayerDoc | null>(null)
  const [playerLoading, setPlayerLoading] = useState(true)

  // Local draft allocation — decoupled from Firestore until "Save"
  const [draft, setDraft] = useState<TokenAllocation>({
    products: 60,
    research: 25,
    training: 15,
  })

  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [isDirty, setIsDirty] = useState(false)

  // Auth redirect
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/')
    }
  }, [user, loading, router])

  // Firestore real-time subscription
  useEffect(() => {
    if (!user) return

    const playerRef = doc(db, 'players', user.uid)
    const unsubscribe = onSnapshot(playerRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as PlayerDoc
        setPlayer(data)
        // Seed draft from Firestore only on first load (not dirty)
        setDraft((prev) => {
          if (!isDirty) {
            return { ...data.allocation }
          }
          return prev
        })
      } else {
        router.replace('/onboarding')
      }
      setPlayerLoading(false)
    })

    return unsubscribe
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, router])

  // Dismiss toast after 4 seconds
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 4_000)
    return () => clearTimeout(id)
  }, [toast])

  // ── Slider change handlers ───────────────────────────────────────────────

  const handleProductsChange = useCallback((v: number) => {
    setDraft((prev) =>
      rebalance({ ...prev, products: v }, 'products', 'research', 'training')
    )
    setIsDirty(true)
  }, [])

  const handleResearchChange = useCallback((v: number) => {
    setDraft((prev) =>
      rebalance({ ...prev, research: v }, 'research', 'products', 'training')
    )
    setIsDirty(true)
  }, [])

  const handleTrainingChange = useCallback((v: number) => {
    setDraft((prev) =>
      rebalance({ ...prev, training: v }, 'training', 'products', 'research')
    )
    setIsDirty(true)
  }, [])

  // ── Save ─────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!user) return
    setSaving(true)
    try {
      await updateDoc(doc(db, 'players', user.uid), {
        allocation: draft,
      })
      setIsDirty(false)
      setToast('Allocation updated')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setToast(`Save failed: ${message}`)
    } finally {
      setSaving(false)
    }
  }

  // ── Derived preview values ────────────────────────────────────────────────

  const tps = player?.tokensPerSec ?? 0

  const productsTps = (tps * draft.products) / 100
  const researchTps = (tps * draft.research) / 100
  const trainingTps = (tps * draft.training) / 100

  // Rough revenue/day: assume ~$0.000002 per token (illustrative)
  const REVENUE_PER_TOKEN = 0.000002
  const revPerDay = productsTps * SECONDS_PER_DAY * REVENUE_PER_TOKEN

  const researchPerDay = researchTps * SECONDS_PER_DAY
  const trainingPerDay = trainingTps * SECONDS_PER_DAY

  const sum = draft.products + draft.research + draft.training
  const sumOk = sum === 100

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading || playerLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="font-mono text-zinc-400 animate-pulse">Loading…</p>
      </div>
    )
  }

  if (!player) return null

  return (
    <div className="flex flex-1 flex-col p-6 gap-6 max-w-4xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-700 pb-4">
        <div>
          <h1 className="font-mono text-xl font-bold text-green-400 tracking-widest">
            {player.companyName.toUpperCase()}
          </h1>
          <p className="font-mono text-xs text-zinc-500 mt-0.5 tracking-wider">
            AGI RACE — TOKEN ALLOCATION
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

      {/* Context line */}
      <div className="font-mono text-sm text-zinc-400">
        Total capacity:{' '}
        <span className="text-green-400 font-bold">{formatTps(tps)} t/s</span>
        {' · '}Current live allocation:{' '}
        <span className="text-zinc-300">
          Products {player.allocation.products}% / Research {player.allocation.research}% / Training {player.allocation.training}%
        </span>
      </div>

      {/* Sliders card */}
      <div className="bg-zinc-800 border border-zinc-700 rounded p-4 flex flex-col gap-6">
        <h2 className="font-mono text-sm font-bold text-zinc-100 tracking-widest uppercase">
          Adjust Allocation
        </h2>

        <SliderRow label="Products" value={draft.products} onChange={handleProductsChange} />
        <SliderRow label="Research" value={draft.research} onChange={handleResearchChange} />
        <SliderRow label="Training" value={draft.training} onChange={handleTrainingChange} />

        {/* Sum indicator */}
        <div className="flex items-center justify-between border-t border-zinc-700 pt-4">
          <span className="font-mono text-xs text-zinc-500">
            Total:{' '}
            <span className={sumOk ? 'text-green-400' : 'text-red-400'}>
              {sum}% {sumOk ? '✓' : '— must equal 100'}
            </span>
          </span>

          <button
            onClick={handleSave}
            disabled={saving || !sumOk}
            className="
              bg-green-700 hover:bg-green-600 text-black font-mono font-bold
              px-4 py-2 rounded transition-colors
              disabled:opacity-40 disabled:cursor-not-allowed
            "
          >
            {saving ? 'Saving…' : 'Save Allocation'}
          </button>
        </div>
      </div>

      {/* Live preview cards */}
      <div>
        <h2 className="font-mono text-sm font-bold text-zinc-100 tracking-widest uppercase mb-3">
          Live Preview
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <PreviewCard
            label="Products"
            pct={draft.products}
            tokensPerSec={tps}
            detail={`${formatTps(Math.round(productsTps))} t/s → ${formatMoney(revPerDay)} revenue/day`}
          />
          <PreviewCard
            label="Research"
            pct={draft.research}
            tokensPerSec={tps}
            detail={`${formatTps(Math.round(researchTps))} t/s → +${formatTps(Math.round(researchPerDay))} research/day`}
          />
          <PreviewCard
            label="Training"
            pct={draft.training}
            tokensPerSec={tps}
            detail={`${formatTps(Math.round(trainingTps))} t/s → ${formatTps(Math.round(trainingPerDay))} tokens/day toward run`}
          />
        </div>
      </div>

      {/* Status footer */}
      <div className="mt-auto border-t border-zinc-800 pt-4">
        <p className="font-mono text-xs text-zinc-600 tracking-wider">
          LIVE — Real-time Firestore listener active · Allocation writes are immediate
        </p>
      </div>
    </div>
  )
}
