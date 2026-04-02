'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { collection, doc, onSnapshot, addDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import type { PlayerDoc, TalentDoc } from '@/shared/types'
import { TALENT_CONFIG, IPO_CONFIG, GLOBAL_CONFIG } from '@/shared/config'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMoney(n: number): string {
  return '$' + n.toLocaleString('en-US')
}

/** Compute cost of next hire given current talent count */
function nextHireCost(talentCount: number): number {
  return Math.round(
    TALENT_CONFIG.firstHireCost * Math.pow(TALENT_CONFIG.hireCostMultiplier, talentCount)
  )
}

/**
 * Compounded efficiency reduction: 1 - (1 - rate)^count, capped at max.
 * Returns value in [0, 1].
 */
function efficiencyReduction(count: number, rate: number, cap: number): number {
  const raw = 1 - Math.pow(1 - rate, count)
  return Math.min(raw, cap)
}

function formatPct(value: number): string {
  return (value * 100).toFixed(1) + '%'
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return ''
  const totalSec = Math.ceil(ms / 1000)
  const hours = Math.floor(totalSec / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  const secs = totalSec % 60
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`
  if (mins > 0) return `${mins}m ${secs}s`
  return `${secs}s`
}

function formatDate(ms: number): string {
  return new Date(ms).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

// ─── Countdown hook ───────────────────────────────────────────────────────────

function useCountdown(targetMs: number): { remaining: number; display: string } {
  const [remaining, setRemaining] = useState(() => Math.max(0, targetMs - Date.now()))

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, targetMs - Date.now()))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [targetMs])

  return { remaining, display: formatCountdown(remaining) }
}

// ─── Countdown display component ──────────────────────────────────────────────

function CooldownTimer({ nextAvailableAt }: { nextAvailableAt: number }) {
  const { display } = useCountdown(nextAvailableAt)
  return <span className="text-amber-400">{display}</span>
}

// ─── Efficiency Stats Card ────────────────────────────────────────────────────

function EfficiencyCard({
  label,
  current,
  next,
}: {
  label: string
  current: number
  next: number
}) {
  return (
    <div className="p-4 border border-zinc-700 rounded-sm bg-zinc-800/50">
      <p className="font-mono text-xs text-zinc-500 tracking-widest uppercase mb-2">{label}</p>
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-lg font-bold text-green-400">{formatPct(current)}</span>
        {next > current && (
          <>
            <span className="font-mono text-xs text-zinc-600">→</span>
            <span className="font-mono text-sm font-bold text-emerald-300">{formatPct(next)}</span>
            <span className="font-mono text-xs text-zinc-500">after hire</span>
          </>
        )}
      </div>
      <div className="mt-1.5 h-1.5 rounded-full bg-zinc-700 overflow-hidden">
        <div
          className="h-full bg-green-500 rounded-full transition-all duration-500"
          style={{ width: `${Math.min(current * 100 / 0.5, 100)}%` }}
        />
      </div>
      <p className="font-mono text-xs text-zinc-600 mt-1">cap: 50%</p>
    </div>
  )
}

// ─── Researcher Row ───────────────────────────────────────────────────────────

function ResearcherRow({
  talent,
  index,
}: {
  talent: TalentDoc & { id: string }
  index: number
}) {
  return (
    <tr className="border-t border-zinc-700 hover:bg-zinc-800/40">
      <td className="py-2 px-3 font-mono text-sm text-zinc-400">#{index + 1}</td>
      <td className="py-2 px-3 font-mono text-sm text-zinc-100">
        AI Researcher
      </td>
      <td className="py-2 px-3 font-mono text-sm text-zinc-300">
        {formatDate(talent.hiredAt)}
      </td>
      <td className="py-2 px-3 font-mono text-sm">
        <span className="text-green-400">Active</span>
      </td>
    </tr>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TalentPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [player, setPlayer] = useState<PlayerDoc | null>(null)
  const [talentDocs, setTalentDocs] = useState<(TalentDoc & { id: string })[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [toast, setToast] = useState<string | null>(null)
  const [hiring, setHiring] = useState(false)

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
    const talentRef = collection(db, 'players', user.uid, 'talent')

    let playerLoaded = false
    let talentLoaded = false

    function checkAllLoaded() {
      if (playerLoaded && talentLoaded) setDataLoading(false)
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

    const unsubTalent = onSnapshot(talentRef, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() as TalentDoc) }))
      // Sort by hire date ascending
      docs.sort((a, b) => a.hiredAt - b.hiredAt)
      setTalentDocs(docs)
      talentLoaded = true
      checkAllLoaded()
    })

    return () => {
      unsubPlayer()
      unsubTalent()
    }
  }, [user, router])

  // Dismiss toast after 4 seconds
  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(id)
  }, [toast])

  const showToast = useCallback((msg: string) => setToast(msg), [])

  // ── Derived values ───────────────────────────────────────────────────────────

  const talentCount = player?.talentCount ?? 0

  // Most recent talent doc determines next available hire time
  const latestTalent = talentDocs.length > 0
    ? talentDocs.reduce((a, b) => (a.nextHireAvailableAt > b.nextHireAvailableAt ? a : b))
    : null

  const nextAvailableAt = latestTalent?.nextHireAvailableAt ?? 0

  // Cooldown state — updated every render via countdown; use raw Date.now() for
  // initial gating; CooldownTimer handles live display
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const inCooldown = nextAvailableAt > now

  const cost = nextHireCost(talentCount)
  const canAfford = player ? player.money >= cost : false
  const canHire = canAfford && !inCooldown

  // Current efficiency bonuses
  const currentEnergyReduction = efficiencyReduction(
    talentCount,
    TALENT_CONFIG.energyReductionPerTalent,
    TALENT_CONFIG.maxEnergyReduction,
  )
  const currentTokenReduction = efficiencyReduction(
    talentCount,
    TALENT_CONFIG.tokenReductionPerTalent,
    TALENT_CONFIG.maxTokenReduction,
  )

  // After-hire efficiency bonuses (one more hire)
  const nextEnergyReduction = efficiencyReduction(
    talentCount + 1,
    TALENT_CONFIG.energyReductionPerTalent,
    TALENT_CONFIG.maxEnergyReduction,
  )
  const nextTokenReduction = efficiencyReduction(
    talentCount + 1,
    TALENT_CONFIG.tokenReductionPerTalent,
    TALENT_CONFIG.maxTokenReduction,
  )

  // Stock value contribution
  const stockContribution = talentCount * IPO_CONFIG.talentPerHeadValue

  // ── Actions ──────────────────────────────────────────────────────────────────

  async function handleHire() {
    if (!user || !player || !canHire || hiring) return
    setHiring(true)
    try {
      await addDoc(collection(db, 'players', user.uid, 'actions'), {
        type: 'hire_talent',
        payload: {},
        createdAt: Date.now(),
        processed: false,
      })
      showToast('Hire request submitted — processing next tick')
    } catch (err) {
      console.error('Failed to submit hire action:', err)
      showToast('Error submitting hire request. Please try again.')
    } finally {
      setHiring(false)
    }
  }

  // ── Loading / guard ───────────────────────────────────────────────────────────

  if (loading || dataLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="font-mono text-zinc-400 animate-pulse">Loading…</p>
      </div>
    )
  }

  if (!player) return null

  return (
    <div className="flex flex-1 flex-col p-6 gap-6 max-w-4xl mx-auto w-full">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-zinc-700 pb-4">
        <div>
          <h1 className="font-mono text-xl font-bold text-green-400 tracking-widest">
            {player.companyName.toUpperCase()}
          </h1>
          <p className="font-mono text-xs text-zinc-500 mt-0.5 tracking-wider">
            AGI RACE — TALENT
          </p>
        </div>
        <Link
          href="/dashboard"
          className="font-mono text-xs px-4 py-2 border border-zinc-600 rounded-sm text-zinc-400 hover:border-zinc-400 hover:text-zinc-100 transition-colors"
        >
          ← Dashboard
        </Link>
      </div>

      {/* ── Toast ──────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="border border-green-700 bg-green-900/20 rounded-sm px-4 py-2">
          <p className="font-mono text-sm text-green-400">{toast}</p>
        </div>
      )}

      {/* ── Balance ────────────────────────────────────────────────────────── */}
      <div className="font-mono text-sm text-zinc-400">
        Balance:{' '}
        <span className="text-green-400 font-bold">{formatMoney(player.money)}</span>
      </div>

      {/* ══ Section 1: Team Overview ══════════════════════════════════════════ */}
      <section>
        <h2 className="font-mono text-sm font-bold text-zinc-100 tracking-widest uppercase mb-3">
          Team Overview
        </h2>

        {/* Talent count + stock contribution */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div className="p-4 border border-zinc-700 rounded-sm bg-zinc-800/50">
            <p className="font-mono text-xs text-zinc-500 tracking-widest uppercase mb-1">
              Researchers Hired
            </p>
            <p className="font-mono text-2xl font-bold text-green-400">{talentCount}</p>
          </div>

          <div className="p-4 border border-zinc-700 rounded-sm bg-zinc-800/50">
            <p className="font-mono text-xs text-zinc-500 tracking-widest uppercase mb-1">
              Stock Value Contribution
            </p>
            <p className="font-mono text-lg font-bold text-zinc-100">
              {formatMoney(stockContribution)}
            </p>
            <p className="font-mono text-xs text-zinc-600 mt-0.5">
              {talentCount} × {formatMoney(IPO_CONFIG.talentPerHeadValue)}/head
            </p>
          </div>

          <div className="p-4 border border-zinc-700 rounded-sm bg-zinc-800/50">
            <p className="font-mono text-xs text-zinc-500 tracking-widest uppercase mb-1">
              Next Hire Cost
            </p>
            <p className={`font-mono text-lg font-bold ${canAfford ? 'text-zinc-100' : 'text-red-400'}`}>
              {formatMoney(cost)}
            </p>
            {!canAfford && (
              <p className="font-mono text-xs text-red-500 mt-0.5">Insufficient funds</p>
            )}
          </div>
        </div>

        {/* Efficiency bonuses */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <EfficiencyCard
            label="Energy Cost Reduction"
            current={currentEnergyReduction}
            next={nextEnergyReduction}
          />
          <EfficiencyCard
            label="Token Cost Reduction"
            current={currentTokenReduction}
            next={nextTokenReduction}
          />
        </div>
      </section>

      {/* ══ Section 2: Hire Next Researcher ══════════════════════════════════ */}
      <section className="border border-zinc-700 rounded-sm p-5 bg-zinc-800/30">
        <h2 className="font-mono text-sm font-bold text-zinc-100 tracking-widest uppercase mb-4">
          Hire Next Researcher
        </h2>

        {/* What this hire unlocks */}
        <div className="mb-4 space-y-2">
          <div className="flex items-center gap-2 font-mono text-sm">
            <span className="text-zinc-500">Cost:</span>
            <span className={canAfford ? 'text-zinc-100 font-bold' : 'text-red-400 font-bold'}>
              {formatMoney(cost)}
            </span>
            {!canAfford && (
              <span className="text-xs text-red-500">
                (need {formatMoney(cost - player.money)} more)
              </span>
            )}
          </div>

          <div className="flex items-start gap-2 font-mono text-sm">
            <span className="text-zinc-500 shrink-0">Unlocks:</span>
            <span className="text-zinc-300">
              Energy reduction{' '}
              <span className="text-green-400">{formatPct(currentEnergyReduction)}</span>
              {' '}→{' '}
              <span className="text-emerald-300 font-bold">{formatPct(nextEnergyReduction)}</span>
              {' · '}
              Token reduction{' '}
              <span className="text-green-400">{formatPct(currentTokenReduction)}</span>
              {' '}→{' '}
              <span className="text-emerald-300 font-bold">{formatPct(nextTokenReduction)}</span>
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono text-sm">
            <span className="text-zinc-500">Stock contribution after:</span>
            <span className="text-zinc-300">
              {formatMoney(stockContribution)}{' '}→{' '}
              <span className="text-emerald-300 font-bold">
                {formatMoney((talentCount + 1) * IPO_CONFIG.talentPerHeadValue)}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-2 font-mono text-sm">
            <span className="text-zinc-500">Next hire cooldown:</span>
            <span className="text-zinc-400">
              {formatCountdown(
                TALENT_CONFIG.baseCooldownDays *
                GLOBAL_CONFIG.gameDaySeconds *
                1000 *
                Math.pow(TALENT_CONFIG.cooldownMultiplier, talentCount + 1)
              )}
            </span>
          </div>
        </div>

        {/* Cooldown notice */}
        {inCooldown && (
          <div className="mb-4 px-3 py-2 border border-amber-700/50 bg-amber-900/10 rounded-sm">
            <p className="font-mono text-xs text-amber-400">
              Next hire available in{' '}
              <CooldownTimer nextAvailableAt={nextAvailableAt} />
            </p>
          </div>
        )}

        {/* Hire button */}
        <button
          disabled={!canHire || hiring}
          onClick={handleHire}
          className="
            font-mono text-sm px-6 py-2.5 border rounded-sm transition-colors duration-150
            border-green-700 text-green-400
            hover:bg-green-900/40
            disabled:opacity-40 disabled:cursor-not-allowed
          "
        >
          {hiring ? 'Submitting…' : 'Hire Researcher'}
        </button>

        {!canHire && !inCooldown && !canAfford && (
          <p className="font-mono text-xs text-zinc-600 mt-2">
            Earn {formatMoney(cost - player.money)} more to unlock this hire.
          </p>
        )}
      </section>

      {/* ══ Section 3: Current Team ═══════════════════════════════════════════ */}
      <section>
        <h2 className="font-mono text-sm font-bold text-zinc-100 tracking-widest uppercase mb-3">
          Current Team
        </h2>

        {talentDocs.length === 0 ? (
          <p className="font-mono text-sm text-zinc-500 py-4">
            No researchers hired yet. Your first hire costs {formatMoney(TALENT_CONFIG.firstHireCost)}.
          </p>
        ) : (
          <div className="border border-zinc-700 rounded-sm overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-zinc-800/60">
                  <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">
                    #
                  </th>
                  <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">
                    Role
                  </th>
                  <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">
                    Hired
                  </th>
                  <th className="py-2 px-3 font-mono text-xs text-zinc-500 tracking-widest uppercase">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {talentDocs.map((t, i) => (
                  <ResearcherRow key={t.id} talent={t} index={i} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {talentDocs.length > 0 && (
          <p className="font-mono text-xs text-zinc-600 mt-2">
            {talentCount} researcher{talentCount !== 1 ? 's' : ''} contributing{' '}
            {formatMoney(stockContribution)} to IPO stock price.
          </p>
        )}
      </section>

      {/* ── Status footer ──────────────────────────────────────────────────── */}
      <div className="mt-auto border-t border-zinc-800 pt-4">
        <p className="font-mono text-xs text-zinc-600 tracking-wider">
          LIVE — Real-time Firestore listener active
        </p>
      </div>
    </div>
  )
}
