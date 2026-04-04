'use client'

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import { doc, onSnapshot } from 'firebase/firestore'
import { signOut } from 'firebase/auth'
import { db, auth } from '@/lib/firebase'
import { useAuth } from '@/context/AuthContext'
import type { PlayerDoc } from '@/shared/types'

function formatMoney(n: number): string {
  return '$' + n.toLocaleString('en-US')
}

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Overview', exact: true },
  { href: '/dashboard/infrastructure', label: 'Infrastructure' },
  { href: '/dashboard/energy', label: 'Energy' },
  { href: '/dashboard/allocation', label: 'Allocation' },
  { href: '/dashboard/training', label: 'Training' },
  { href: '/dashboard/talent', label: 'Talent' },
  { href: '/dashboard/leaderboard', label: 'Leaderboard' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [player, setPlayer] = useState<PlayerDoc | null>(null)

  useEffect(() => {
    if (!loading && !user) router.replace('/')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    const unsub = onSnapshot(doc(db, 'players', user.uid), (snap) => {
      if (snap.exists()) setPlayer(snap.data() as PlayerDoc)
    })
    return unsub
  }, [user])

  async function handleSignOut() {
    await signOut(auth)
    router.replace('/')
  }

  return (
    <div className="flex flex-1 min-h-0">
      {/* Sidebar */}
      <aside className="w-48 shrink-0 flex flex-col border-r border-zinc-800 bg-zinc-900">
        {/* Logo */}
        <div className="px-4 pt-5 pb-4 border-b border-zinc-800">
          <p className="font-mono text-xs font-bold text-green-400 tracking-widest uppercase">
            AGI Race
          </p>
          {player && (
            <>
              <p className="font-mono text-xs text-zinc-300 mt-1 truncate">
                {player.companyName}
              </p>
              <p className="font-mono text-xs text-green-400 mt-0.5">
                {formatMoney(Math.round(player.money))}
              </p>
            </>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 px-2 py-3 flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ href, label, exact }) => {
            const isActive = exact ? pathname === href : pathname.startsWith(href)
            return (
              <Link
                key={href}
                href={href}
                className={`
                  font-mono text-xs px-3 py-2 rounded-sm transition-colors duration-100
                  ${isActive
                    ? 'bg-zinc-800 text-green-400'
                    : 'text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800/50'
                  }
                `}
              >
                {isActive ? '> ' : '  '}{label}
              </Link>
            )
          })}
        </nav>

        {/* Sign out */}
        <div className="px-2 pb-4 border-t border-zinc-800 pt-3">
          <button
            onClick={handleSignOut}
            className="w-full font-mono text-xs px-3 py-2 rounded-sm text-zinc-600 hover:text-red-400 hover:bg-zinc-800/50 transition-colors text-left"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Page content */}
      <main className="flex-1 min-w-0 flex flex-col overflow-auto">
        {children}
      </main>
    </div>
  )
}
