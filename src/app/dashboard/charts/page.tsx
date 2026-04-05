'use client'

import { useEffect, useState } from 'react'
import { collection, query, orderBy, limit, getDocs } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'

interface HistoryPoint {
  money: number
  profit: number
  revenuePerDay: number
  costsPerDay: number
  researchScore: number
  tokensPerSec: number
  gameDate: string
  timestamp: number
}

function formatMoney(n: number): string {
  if (Math.abs(n) >= 1_000_000) return '$' + (n / 1_000_000).toFixed(1) + 'M'
  if (Math.abs(n) >= 1_000) return '$' + (n / 1_000).toFixed(0) + 'K'
  return '$' + n.toFixed(0)
}

const tooltipStyle = {
  backgroundColor: '#18181b',
  border: '1px solid #3f3f46',
  borderRadius: '4px',
  fontFamily: 'monospace',
  fontSize: '11px',
}

export default function ChartsPage() {
  const { user } = useAuth()
  const [data, setData] = useState<HistoryPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    const fetchHistory = async () => {
      const q = query(
        collection(db, 'players', user.uid, 'history'),
        orderBy('timestamp', 'desc'),
        limit(100),
      )
      const snap = await getDocs(q)
      const points: HistoryPoint[] = []
      snap.forEach((doc) => points.push(doc.data() as HistoryPoint))
      // Reverse so oldest is first (left side of chart)
      points.reverse()
      setData(points)
      setLoading(false)
    }
    fetchHistory()
  }, [user])

  if (loading) {
    return (
      <div className="p-6">
        <p className="font-mono text-xs text-zinc-500">Loading chart data...</p>
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="p-6">
        <h1 className="font-mono text-sm font-bold text-green-400 mb-4">Performance Charts</h1>
        <p className="font-mono text-xs text-zinc-500">
          No history data yet. Charts will appear after a few game ticks.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-8">
      <h1 className="font-mono text-sm font-bold text-green-400">Performance Charts</h1>

      {/* Balance over time */}
      <div className="bg-zinc-800/30 border border-zinc-700 rounded-md p-4">
        <h2 className="font-mono text-xs text-zinc-400 mb-4">Balance Over Time</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="gameDate"
              tick={{ fill: '#a1a1aa', fontSize: 10, fontFamily: 'monospace' }}
              tickLine={{ stroke: '#3f3f46' }}
              axisLine={{ stroke: '#3f3f46' }}
            />
            <YAxis
              tickFormatter={formatMoney}
              tick={{ fill: '#a1a1aa', fontSize: 10, fontFamily: 'monospace' }}
              tickLine={{ stroke: '#3f3f46' }}
              axisLine={{ stroke: '#3f3f46' }}
              width={70}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={{ color: '#a1a1aa', fontFamily: 'monospace', fontSize: '11px' }}
              formatter={(value) => [formatMoney(Number(value)), 'Balance']}
            />
            <Line
              type="monotone"
              dataKey="money"
              stroke="#4ade80"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3, fill: '#4ade80' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Profit per day over time */}
      <div className="bg-zinc-800/30 border border-zinc-700 rounded-md p-4">
        <h2 className="font-mono text-xs text-zinc-400 mb-4">Profit Per Day Over Time</h2>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="gameDate"
              tick={{ fill: '#a1a1aa', fontSize: 10, fontFamily: 'monospace' }}
              tickLine={{ stroke: '#3f3f46' }}
              axisLine={{ stroke: '#3f3f46' }}
            />
            <YAxis
              tickFormatter={formatMoney}
              tick={{ fill: '#a1a1aa', fontSize: 10, fontFamily: 'monospace' }}
              tickLine={{ stroke: '#3f3f46' }}
              axisLine={{ stroke: '#3f3f46' }}
              width={70}
            />
            <Tooltip
              contentStyle={tooltipStyle}
              labelStyle={{ color: '#a1a1aa', fontFamily: 'monospace', fontSize: '11px' }}
              formatter={(value) => [formatMoney(Number(value)), 'Profit']}
            />
            <Line
              type="monotone"
              dataKey="profit"
              stroke="#fbbf24"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 3, fill: '#fbbf24' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
