'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { doc, onSnapshot } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from '@/lib/firebase'
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

export default function DashboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [player, setPlayer] = useState<PlayerDoc | null>(null)
  const [playerLoading, setPlayerLoading] = useState(true)

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

  async function handleSignOut() {
    await signOut(auth)
    router.replace('/')
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
      <div className="flex items-center justify-between border-b border-zinc-700 pb-4">
        <div>
          <h1 className="font-mono text-xl font-bold text-green-400 tracking-widest">
            {player.companyName.toUpperCase()}
          </h1>
          <p className="font-mono text-xs text-zinc-500 mt-0.5 tracking-wider">
            AGI RACE — DASHBOARD
          </p>
        </div>
        <button
          onClick={handleSignOut}
          className="
            font-mono text-xs px-4 py-2 border border-zinc-600 rounded-sm
            text-zinc-400 hover:border-red-500 hover:text-red-400
            transition-colors duration-150
          "
        >
          Sign Out
        </button>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard label="Company" value={player.companyName} />
        <StatCard label="Balance" value={formatMoney(player.money)} highlight />
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
          value={player.researchScore.toLocaleString('en-US')}
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

      {/* Navigation */}
      <div className="flex flex-wrap gap-3">
        <Link
          href="/dashboard/infrastructure"
          className="
            font-mono text-xs px-4 py-2 border border-zinc-600 rounded-sm
            text-zinc-300 hover:border-green-500 hover:text-green-400
            transition-colors duration-150
          "
        >
          Infrastructure →
        </Link>
        <Link
          href="/dashboard/energy"
          className="
            font-mono text-xs px-4 py-2 border border-zinc-600 rounded-sm
            text-zinc-300 hover:border-green-500 hover:text-green-400
            transition-colors duration-150
          "
        >
          Energy →
        </Link>
        <Link
          href="/dashboard/allocation"
          className="
            font-mono text-xs px-4 py-2 border border-zinc-600 rounded-sm
            text-zinc-300 hover:border-green-500 hover:text-green-400
            transition-colors duration-150
          "
        >
          Allocation →
        </Link>
        <Link
          href="/dashboard/leaderboard"
          className="
            font-mono text-xs px-4 py-2 border border-zinc-600 rounded-sm
            text-zinc-300 hover:border-green-500 hover:text-green-400
            transition-colors duration-150
          "
        >
          Leaderboard →
        </Link>
        <Link
          href="/dashboard/training"
          className="
            font-mono text-xs px-4 py-2 border border-zinc-600 rounded-sm
            text-zinc-300 hover:border-green-500 hover:text-green-400
            transition-colors duration-150
          "
        >
          Training →
        </Link>
        <Link
          href="/dashboard/talent"
          className="
            font-mono text-xs px-4 py-2 border border-zinc-600 rounded-sm
            text-zinc-300 hover:border-green-500 hover:text-green-400
            transition-colors duration-150
          "
        >
          Talent →
        </Link>
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
        <p className="font-mono text-xs text-zinc-600 tracking-wider">
          LIVE — Real-time Firestore listener active
        </p>
        <p className="font-mono text-xs tracking-wider">
          <span className="text-zinc-600">NEXT TICK </span>
          <span className={tickCountdown <= 5 ? 'text-green-400 animate-pulse' : 'text-zinc-400'}>
            {tickCountdown}s
          </span>
        </p>
      </div>
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
