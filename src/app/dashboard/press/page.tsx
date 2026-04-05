'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { collection, onSnapshot, query, orderBy } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import type { PressRoomDoc, PressRoomEvent } from '@/shared/types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(timestampMs: number): string {
  const diff = Date.now() - timestampMs
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const EVENT_BADGES: Record<PressRoomEvent, { label: string; color: string }> = {
  garage_built:                      { label: 'Facility',   color: 'text-blue-400 border-blue-700 bg-blue-900/20' },
  first_rack_installed:              { label: 'Hardware',   color: 'text-cyan-400 border-cyan-700 bg-cyan-900/20' },
  first_training_run_completed:      { label: 'Training',   color: 'text-purple-400 border-purple-700 bg-purple-900/20' },
  first_1m_revenue:                  { label: 'Revenue',    color: 'text-green-400 border-green-700 bg-green-900/20' },
  second_product_slot_unlocked:      { label: 'Product',    color: 'text-amber-400 border-amber-700 bg-amber-900/20' },
  ipo:                               { label: 'IPO',        color: 'text-yellow-400 border-yellow-700 bg-yellow-900/20' },
  research_milestone_colo:           { label: 'Research',   color: 'text-indigo-400 border-indigo-700 bg-indigo-900/20' },
  research_milestone_gen2:           { label: 'Research',   color: 'text-indigo-400 border-indigo-700 bg-indigo-900/20' },
  research_milestone_custom_silicon: { label: 'Research',   color: 'text-indigo-400 border-indigo-700 bg-indigo-900/20' },
  custom_silicon_designed:           { label: 'Silicon',    color: 'text-rose-400 border-rose-700 bg-rose-900/20' },
  first_takeover_bid_launched:       { label: 'Takeover',   color: 'text-red-400 border-red-700 bg-red-900/20' },
  first_takeover_defended:           { label: 'Takeover',   color: 'text-red-400 border-red-700 bg-red-900/20' },
  first_takeover_won:                { label: 'Takeover',   color: 'text-red-400 border-red-700 bg-red-900/20' },
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PressRoomPage() {
  const { user, loading } = useAuth()
  const router = useRouter()

  const [headlines, setHeadlines] = useState<(PressRoomDoc & { id: string })[]>([])
  const [dataLoading, setDataLoading] = useState(true)

  // Auth redirect
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/')
    }
  }, [user, loading, router])

  // Real-time Firestore listener
  useEffect(() => {
    if (!user) return

    const pressRoomRef = collection(db, 'players', user.uid, 'pressRoom')
    const q = query(pressRoomRef, orderBy('createdAt', 'desc'))

    const unsub = onSnapshot(q, (snap) => {
      const docs = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as PressRoomDoc),
      }))
      setHeadlines(docs)
      setDataLoading(false)
    })

    return unsub
  }, [user, router])

  // Live relative-time updates
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 10_000)
    return () => clearInterval(id)
  }, [])

  // ── Loading / guard ─────────────────────────────────────────────────────────

  if (loading || dataLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="font-mono text-zinc-400 animate-pulse">Loading...</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col p-6 gap-6 max-w-4xl mx-auto w-full">

      <h1 className="font-mono text-sm font-bold text-zinc-100 tracking-widest uppercase border-b border-zinc-700 pb-4">
        Press Room
      </h1>

      {/* ── Empty state ──────────────────────────────────────────────────── */}
      {headlines.length === 0 && (
        <div className="flex flex-1 items-center justify-center">
          <p className="font-mono text-sm text-zinc-500">
            No headlines yet — make some news!
          </p>
        </div>
      )}

      {/* ── Timeline feed ────────────────────────────────────────────────── */}
      {headlines.length > 0 && (
        <div className="flex flex-col gap-0">
          {headlines.map((item, idx) => {
            const badge = EVENT_BADGES[item.event] ?? {
              label: item.event,
              color: 'text-zinc-400 border-zinc-700 bg-zinc-800/20',
            }
            return (
              <div key={item.id} className="flex items-start gap-4 relative">
                {/* Timeline line + dot */}
                <div className="flex flex-col items-center shrink-0 w-4">
                  <div className="w-2 h-2 rounded-full bg-green-500 mt-1.5 shrink-0" />
                  {idx < headlines.length - 1 && (
                    <div className="w-px flex-1 bg-zinc-700 min-h-[2rem]" />
                  )}
                </div>

                {/* Content */}
                <div className="pb-6 flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span
                      className={`font-mono text-xs px-2 py-0.5 border rounded-sm ${badge.color}`}
                    >
                      {badge.label}
                    </span>
                    <span className="font-mono text-xs text-zinc-600">
                      {relativeTime(item.createdAt)}
                    </span>
                  </div>
                  <p className="font-mono text-sm text-zinc-200 leading-relaxed">
                    {item.headline}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Status footer ──────────────────────────────────────────────── */}
      <div className="mt-auto border-t border-zinc-800 pt-4">
        <p className="font-mono text-xs text-zinc-600 tracking-wider">
          LIVE — Real-time Firestore listener active
        </p>
      </div>
    </div>
  )
}
