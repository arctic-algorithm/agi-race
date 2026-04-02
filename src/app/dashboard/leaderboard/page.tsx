'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import type { LeaderboardDoc, LeaderboardEntry } from '@/shared/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatResearchScore(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString('en-US')
}

function formatTokensPerSec(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M t/s'
  if (n >= 1_000) return n.toLocaleString('en-US') + ' t/s'
  return n.toLocaleString('en-US') + ' t/s'
}

function formatMoney(n: number): string {
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1_000_000_000) return sign + '$' + (abs / 1_000_000_000).toFixed(1) + 'B'
  if (abs >= 1_000_000) return sign + '$' + (abs / 1_000_000).toFixed(1) + 'M'
  if (abs >= 1_000) return sign + '$' + (abs / 1_000).toFixed(1) + 'K'
  return sign + '$' + abs.toLocaleString('en-US')
}

function formatStockPrice(entry: LeaderboardEntry): string {
  if (!entry.isPublic || entry.stockPrice === 0) return '—'
  return formatMoney(entry.stockPrice)
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return <span className="text-amber-400 font-bold">[1]</span>
  }
  return <span className="text-zinc-400">[{rank}]</span>
}

function LeaderboardRow({
  entry,
  rank,
  isCurrentPlayer,
}: {
  entry: LeaderboardEntry
  rank: number
  isCurrentPlayer: boolean
}) {
  return (
    <tr
      className={
        isCurrentPlayer
          ? 'bg-zinc-800 text-green-400 border-b border-zinc-800'
          : 'border-b border-zinc-800 hover:bg-zinc-800'
      }
    >
      <td className="py-2.5 px-4 font-mono text-sm tabular-nums">
        <RankBadge rank={rank} />
      </td>
      <td className="py-2.5 px-4 font-mono text-sm">
        {isCurrentPlayer ? (
          <span className="text-green-400 font-bold">{entry.companyName}</span>
        ) : (
          <span className="text-zinc-100">{entry.companyName}</span>
        )}
        {isCurrentPlayer && (
          <span className="ml-2 text-xs text-green-600 tracking-widest">[YOU]</span>
        )}
      </td>
      <td className="py-2.5 px-4 font-mono text-sm text-right tabular-nums">
        {isCurrentPlayer ? (
          <span className="text-green-400">{formatResearchScore(entry.researchScore)}</span>
        ) : (
          <span className="text-zinc-300">{formatResearchScore(entry.researchScore)}</span>
        )}
      </td>
      <td className="py-2.5 px-4 font-mono text-sm text-right tabular-nums text-zinc-300">
        {formatTokensPerSec(entry.tokensPerSec)}
      </td>
      <td className="py-2.5 px-4 font-mono text-sm text-right tabular-nums text-zinc-300">
        {formatMoney(entry.fcf)}/mo
      </td>
      <td className="py-2.5 px-4 font-mono text-sm text-right tabular-nums text-zinc-300">
        {formatStockPrice(entry)}
      </td>
    </tr>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function LeaderboardPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  // Redirect if not authenticated
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/')
    }
  }, [user, loading, router])

  // Subscribe to the leaderboard document in real time
  useEffect(() => {
    if (!user) return

    const leaderboardRef = doc(db, 'global', 'leaderboard')
    const unsubscribe = onSnapshot(leaderboardRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data() as LeaderboardDoc
        // Sort by researchScore descending (tick may not guarantee order)
        const sorted = [...data.players].sort(
          (a, b) => b.researchScore - a.researchScore
        )
        setEntries(sorted)
      } else {
        setEntries([])
      }
      setDataLoading(false)
    })

    return unsubscribe
  }, [user])

  if (loading || dataLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="font-mono text-zinc-400 animate-pulse">Loading…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col p-6 gap-6 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-700 pb-4">
        <div>
          <h1 className="text-green-400 font-mono text-2xl font-bold">AGI LEADERBOARD</h1>
          <p className="font-mono text-xs text-zinc-500 mt-0.5 tracking-wider">
            AGI RACE — RANKINGS
          </p>
        </div>
        <Link
          href="/dashboard"
          className="font-mono text-xs px-4 py-2 border border-zinc-600 rounded-sm text-zinc-400 hover:border-zinc-400 hover:text-zinc-100 transition-colors duration-150"
        >
          ← Dashboard
        </Link>
      </div>

      {/* Table */}
      <div className="bg-zinc-900 border border-zinc-700 rounded overflow-hidden">
        {entries.length === 0 ? (
          <p className="font-mono text-sm text-zinc-500 p-6 text-center">
            No players yet.
          </p>
        ) : (
          <table className="w-full font-mono text-sm text-left">
            <thead>
              <tr className="text-zinc-500 border-b border-zinc-700">
                <th className="py-2.5 px-4 font-mono text-xs tracking-widest uppercase">
                  Rank
                </th>
                <th className="py-2.5 px-4 font-mono text-xs tracking-widest uppercase">
                  Company
                </th>
                <th className="py-2.5 px-4 font-mono text-xs tracking-widest uppercase text-right">
                  Research Score
                </th>
                <th className="py-2.5 px-4 font-mono text-xs tracking-widest uppercase text-right">
                  Tokens/sec
                </th>
                <th className="py-2.5 px-4 font-mono text-xs tracking-widest uppercase text-right">
                  FCF/mo
                </th>
                <th className="py-2.5 px-4 font-mono text-xs tracking-widest uppercase text-right">
                  Stock Price
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, index) => (
                <LeaderboardRow
                  key={entry.playerId}
                  entry={entry}
                  rank={index + 1}
                  isCurrentPlayer={user?.uid === entry.playerId}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Status footer */}
      <div className="mt-auto border-t border-zinc-800 pt-4">
        <p className="font-mono text-xs text-zinc-600 tracking-wider">
          LIVE — Real-time Firestore listener active · Updates every game tick
        </p>
      </div>
    </div>
  )
}
