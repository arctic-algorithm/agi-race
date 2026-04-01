'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { doc, setDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import { GLOBAL_CONFIG } from '@/shared/config'
import type { Market, PlayerDoc } from '@/shared/types'

const MARKETS: { value: Market; label: string; description: string }[] = [
  {
    value: 'consumer',
    label: 'Consumer',
    description:
      'High volume, low revenue per token. Rapid growth, high churn. Ideal for capturing market share fast.',
  },
  {
    value: 'enterprise',
    label: 'Enterprise',
    description:
      'Low volume, high revenue per token. Slow ramp-up, sticky contracts. Ideal for sustainable margins.',
  },
]

export default function OnboardingPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const [selected, setSelected] = useState<Market | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/')
    }
  }, [user, loading, router])

  async function handleConfirm() {
    if (!selected || !user) return
    setSaving(true)
    setError(null)

    try {
      const companyName = `${user.displayName ?? 'Unknown'}'s Lab`
      const playerDoc: PlayerDoc = {
        companyName,
        market: selected,
        money: GLOBAL_CONFIG.seedFunding,
        talentCount: 0,
        researchScore: 0,
        tokensPerSec: 0,
        allocation: { products: 100, research: 0, training: 0 },
        isPublic: false,
        totalRevenue: 0,
        stockPrice: 0,
        debt: 0,
        createdAt: Date.now(),
      }

      await setDoc(doc(db, 'players', user.uid), playerDoc)
      router.replace('/dashboard')
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create player'
      setError(message)
      setSaving(false)
    }
  }

  if (loading || !user) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p className="font-mono text-zinc-400 animate-pulse">Loading…</p>
      </div>
    )
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4">
      <div className="flex flex-col gap-8 p-10 border border-zinc-700 rounded-sm max-w-lg w-full">
        <div>
          <h1 className="font-mono text-2xl font-bold text-green-400 tracking-widest mb-1">
            FOUNDING MARKET
          </h1>
          <p className="font-mono text-xs text-zinc-500">
            Choose your initial market focus. This shapes your early revenue strategy.
          </p>
        </div>

        <div className="flex flex-col gap-4">
          {MARKETS.map((market) => (
            <button
              key={market.value}
              onClick={() => setSelected(market.value)}
              className={`
                text-left p-4 border rounded-sm font-mono transition-colors duration-150
                ${
                  selected === market.value
                    ? 'border-green-500 bg-zinc-800 text-green-400'
                    : 'border-zinc-700 bg-zinc-900 text-zinc-300 hover:border-zinc-500'
                }
              `}
            >
              <div className="text-sm font-bold tracking-wider mb-1 uppercase">
                {selected === market.value ? '> ' : '  '}
                {market.label}
              </div>
              <div className="text-xs text-zinc-400 leading-relaxed">
                {market.description}
              </div>
            </button>
          ))}
        </div>

        <button
          onClick={handleConfirm}
          disabled={!selected || saving}
          className="
            w-full py-3 font-mono text-sm tracking-wider uppercase
            border border-zinc-600 rounded-sm
            bg-zinc-800 text-zinc-100
            hover:border-green-500 hover:text-green-400
            disabled:opacity-40 disabled:cursor-not-allowed
            transition-colors duration-150
          "
        >
          {saving ? 'Initializing…' : 'Launch Company →'}
        </button>

        {error && (
          <p className="font-mono text-xs text-red-400 text-center">{error}</p>
        )}
      </div>
    </div>
  )
}
