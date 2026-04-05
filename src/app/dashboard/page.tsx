'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { doc, onSnapshot, collection, getDocs, writeBatch, deleteDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import type { PlayerDoc } from '@/shared/types'

function formatMoney(n: number): string {
  return '$' + n.toLocaleString('en-US')
}

function useTickCountdown(lastTickAt: number | undefined): number {
  const [seconds, setSeconds] = useState(60)
  useEffect(() => {
    if (!lastTickAt) return
    const update = () => {
      const elapsed = Math.floor((Date.now() - lastTickAt) / 1000)
      setSeconds(Math.max(0, 60 - elapsed))
    }
    update()
    const id = setInterval(update, 1000)
    return () => clearInterval(id)
  }, [lastTickAt])
  return seconds
}

function useInterpolatedResearch(player: PlayerDoc | null): number {
  const [researchScore, setResearchScore] = useState(0)

  useEffect(() => {
    if (!player) return
    setResearchScore(player.researchScore)

    const researchPerDay = player.tokensPerSec * (player.allocation.research / 100) * 60
    if (researchPerDay === 0) return

    const id = setInterval(() => {
      if (!player.lastTickAt) return
      const elapsedDays = (Date.now() - player.lastTickAt) / (60 * 1000)
      setResearchScore(player.researchScore + researchPerDay * elapsedDays)
    }, 1000)

    return () => clearInterval(id)
  }, [player])

  return researchScore
}

const GAME_EPOCH = new Date('2010-09-23').getTime()

function useGameDate(createdAt: number, lastTickAt: number | undefined): string {
  const [gameDate, setGameDate] = useState('')

  useEffect(() => {
    const compute = () => {
      const ref = lastTickAt ?? createdAt
      const daysElapsed = Math.floor((ref - createdAt) / (60 * 1000))
      const d = new Date(GAME_EPOCH + daysElapsed * 86_400_000)
      setGameDate(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }))
    }
    compute()
    const id = setInterval(compute, 5000)
    return () => clearInterval(id)
  }, [createdAt, lastTickAt])

  return gameDate
}

export default function DashboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [player, setPlayer] = useState<PlayerDoc | null>(null)
  const [playerLoading, setPlayerLoading] = useState(true)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return

    const playerRef = doc(db, 'players', user.uid)
    const unsubscribe = onSnapshot(playerRef, (snap) => {
      if (snap.exists()) {
        setPlayer(snap.data() as PlayerDoc)
      } else {
        // No player doc yet — send to onboarding
        router.replace('/onboarding')
      }
      setPlayerLoading(false)
    })

    return unsubscribe
  }, [user, router])

  const tickCountdown = useTickCountdown(player?.lastTickAt)
  const interpolatedResearch = useInterpolatedResearch(player)
  const gameDate = useGameDate(player?.createdAt ?? Date.now(), player?.lastTickAt)

  async function handleReset() {
    if (!user) return
    setResetting(true)
    const uid = user.uid
    const SUBCOLLECTIONS = ['facilities', 'racks', 'energyBuildings', 'products', 'talent', 'actions', 'pressRoom']
    // Delete all subcollection docs in batches
    for (const sub of SUBCOLLECTIONS) {
      const snap = await getDocs(collection(db, 'players', uid, sub))
      const chunks: typeof snap.docs[] = []
      for (let i = 0; i < snap.docs.length; i += 499) chunks.push(snap.docs.slice(i, i + 499))
      for (const chunk of chunks) {
        const batch = writeBatch(db)
        chunk.forEach(d => batch.delete(d.ref))
        await batch.commit()
      }
    }
    // Delete trainingRun/current doc
    await deleteDoc(doc(db, 'players', uid, 'trainingRun', 'current')).catch(() => {})
    // Delete player doc — onSnapshot will redirect to /onboarding
    await deleteDoc(doc(db, 'players', uid))
  }

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
      <h1 className="font-mono text-sm font-bold text-zinc-100 tracking-widest uppercase border-b border-zinc-700 pb-4">
        Overview
      </h1>

      {/* Training run gate banner */}
      {!player.completedTrainingRuns && (
        <div className="border border-amber-700/50 bg-amber-900/20 rounded-sm px-4 py-3">
          <p className="font-mono text-xs text-amber-400">
            Complete a training run to start earning revenue from your products.
          </p>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Company" value={`${player.companyName}${player.country ? ` · ${player.country}` : ''}`} />
        <StatCard label="Balance" value={formatMoney(Math.round(player.money))} highlight />
        <StatCard
          label="Market"
          value={player.market === 'consumer' ? 'Consumer' : 'Enterprise'}
        />
        <StatCard
          label="Tokens / sec"
          value={player.tokensPerSec.toLocaleString('en-US')}
        />
        <StatCard
          label="Research Score"
          value={Math.round(interpolatedResearch).toLocaleString('en-US')}
        />
        <StatCard
          label="Token Allocation"
          value={`Products ${player.allocation.products}% / Research ${player.allocation.research}% / Training ${player.allocation.training}%`}
          small
        />
        {player.revenuePerDay !== undefined && (
          <StatCard label="Revenue / Day" value={formatMoney(Math.round(player.revenuePerDay))} highlight />
        )}
        {player.costsPerDay !== undefined && (
          <StatCard label="Costs / Day" value={formatMoney(Math.round(player.costsPerDay))} />
        )}
        {player.revenuePerDay !== undefined && player.costsPerDay !== undefined && (
          <StatCard
            label="Profit / Day"
            value={formatMoney(Math.round(player.revenuePerDay - player.costsPerDay))}
            highlight={player.revenuePerDay >= player.costsPerDay}
          />
        )}
      </div>


      {/* P&L Breakdown */}
      {player.lastTickBreakdown && (
        <div className="border border-zinc-700 rounded-sm bg-zinc-800/30 p-4 font-mono text-xs">
          <p className="text-zinc-500 tracking-widest uppercase mb-3">P&L Breakdown — Last Tick</p>
          <div className="flex flex-col gap-1">
            <p className="text-zinc-500 uppercase tracking-wider text-[10px] mt-1">Revenue</p>
            {player.lastTickBreakdown.revenue.bySlot.map((slot, i) => (
              <div key={i} className="flex justify-between pl-2">
                <span className="text-zinc-400">{slot.market} (model v{slot.modelVersion}) @ ${slot.revenuePerToken.toFixed(4)}/token</span>
                <span className="text-green-400">+{formatMoney(Math.round(slot.amount))}</span>
              </div>
            ))}
            <div className="flex justify-between border-t border-zinc-700 pt-1 mt-1">
              <span className="text-zinc-300">Total Revenue</span>
              <span className="text-green-400">+{formatMoney(Math.round(player.lastTickBreakdown.revenue.total))}</span>
            </div>

            <p className="text-zinc-500 uppercase tracking-wider text-[10px] mt-3">Costs</p>
            {player.lastTickBreakdown.costs.cloudRental > 0 && (
              <div className="flex justify-between pl-2">
                <span className="text-zinc-400">Cloud Rental</span>
                <span className="text-red-400">−{formatMoney(Math.round(player.lastTickBreakdown.costs.cloudRental))}</span>
              </div>
            )}
            {(player.lastTickBreakdown.costs.publicGrid ?? 0) > 0 && (
              <div className="flex justify-between pl-2">
                <span className="text-zinc-400">Public Grid</span>
                <span className="text-red-400">−{formatMoney(Math.round(player.lastTickBreakdown.costs.publicGrid ?? 0))}</span>
              </div>
            )}
            {player.lastTickBreakdown.costs.facilityMaintenance > 0 && (
              <div className="flex justify-between pl-2">
                <span className="text-zinc-400">Facility Maintenance</span>
                <span className="text-red-400">−{formatMoney(Math.round(player.lastTickBreakdown.costs.facilityMaintenance))}</span>
              </div>
            )}
            {player.lastTickBreakdown.costs.energyMaintenance > 0 && (
              <div className="flex justify-between pl-2">
                <span className="text-zinc-400">Energy Maintenance</span>
                <span className="text-red-400">−{formatMoney(Math.round(player.lastTickBreakdown.costs.energyMaintenance))}</span>
              </div>
            )}
            {player.lastTickBreakdown.costs.debtInterest > 0 && (
              <div className="flex justify-between pl-2">
                <span className="text-zinc-400">Debt Interest</span>
                <span className="text-red-400">−{formatMoney(Math.round(player.lastTickBreakdown.costs.debtInterest))}</span>
              </div>
            )}
            <div className="flex justify-between border-t border-zinc-700 pt-1 mt-1">
              <span className="text-zinc-300">Total Costs</span>
              <span className="text-red-400">−{formatMoney(Math.round(player.lastTickBreakdown.costs.total))}</span>
            </div>

            <div className="flex justify-between border-t border-zinc-600 pt-2 mt-2">
              <span className="text-zinc-200 font-bold">Net Profit / Day</span>
              <span className={player.lastTickBreakdown.profit >= 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                {player.lastTickBreakdown.profit >= 0 ? '+' : '−'}{formatMoney(Math.abs(Math.round(player.lastTickBreakdown.profit)))}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Status footer */}
      <div className="mt-auto border-t border-zinc-800 pt-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <p className="font-mono text-xs text-zinc-600 tracking-wider">
            LIVE &nbsp;·&nbsp; v0.13
          </p>
          {gameDate && (
            <p className="font-mono text-xs tracking-wider">
              <span className="text-zinc-600">DATE </span>
              <span className="text-zinc-400">{gameDate}</span>
            </p>
          )}
        </div>
        <div className="flex items-center gap-4">
          <p className="font-mono text-xs tracking-wider">
            <span className="text-zinc-600">NEXT DAY </span>
            <span className={tickCountdown <= 5 ? 'text-green-400 animate-pulse' : 'text-zinc-400'}>
              {tickCountdown}s
            </span>
          </p>
          <button
            onClick={() => setShowResetConfirm(true)}
            className="font-mono text-xs text-zinc-700 hover:text-red-500 transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Reset confirmation modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="bg-zinc-900 border border-zinc-700 rounded-sm max-w-sm w-full mx-4 p-6 flex flex-col gap-4">
            <p className="font-mono text-sm font-bold text-red-400 tracking-widest uppercase">
              Reset Game?
            </p>
            <p className="font-mono text-xs text-zinc-400">
              This will permanently delete all your progress — facilities, racks, money, research, everything. You&apos;ll start fresh from onboarding.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowResetConfirm(false)}
                disabled={resetting}
                className="font-mono text-xs px-4 py-2 border border-zinc-600 rounded-sm text-zinc-400 hover:border-zinc-300 hover:text-zinc-100 transition-colors disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="font-mono text-xs px-4 py-2 border border-red-700 rounded-sm text-red-400 hover:bg-red-900/30 transition-colors disabled:opacity-40"
              >
                {resetting ? 'Resetting…' : 'Yes, Reset'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({
  label,
  value,
  highlight = false,
  small = false,
}: {
  label: string
  value: string
  highlight?: boolean
  small?: boolean
}) {
  return (
    <div className="p-4 border border-zinc-700 rounded-sm bg-zinc-800/50">
      <p className="font-mono text-xs text-zinc-500 tracking-widest uppercase mb-1">
        {label}
      </p>
      <p
        className={`font-mono font-bold leading-tight ${
          highlight ? 'text-green-400' : 'text-zinc-100'
        } ${small ? 'text-xs' : 'text-lg'}`}
      >
        {value}
      </p>
    </div>
  )
}
