'use client'

import { useState, useEffect } from 'react'
import AdminDashboard from './AdminDashboard'

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  // Check if already authenticated by attempting a config fetch
  useEffect(() => {
    fetch('/api/admin/config')
      .then((r) => {
        setAuthed(r.ok)
      })
      .catch(() => setAuthed(false))
  }, [])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      if (res.ok) {
        setAuthed(true)
      } else {
        const data = await res.json()
        setError(data.error ?? 'Authentication failed')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  if (authed === null) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center">
        <span className="text-zinc-500 text-sm font-mono animate-pulse">checking session…</span>
      </div>
    )
  }

  if (!authed) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center">
        <div className="w-full max-w-sm p-8 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl">
          <h1 className="text-amber-400 font-mono text-2xl font-bold mb-2 tracking-tight">
            AGI Race
          </h1>
          <p className="text-zinc-400 text-sm font-mono mb-8">Admin Panel — Authorized Access Only</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-xs font-mono text-zinc-400 mb-1 uppercase tracking-widest">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-zinc-900 border border-zinc-600 text-zinc-100 font-mono text-sm rounded px-3 py-2 focus:outline-none focus:border-amber-400 focus:ring-1 focus:ring-amber-400 placeholder-zinc-600"
                placeholder="enter password"
                autoFocus
                required
              />
            </div>
            {error && (
              <p className="text-red-400 font-mono text-xs">{error}</p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-amber-400 hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-900 font-mono font-bold text-sm py-2 rounded transition-colors"
            >
              {loading ? 'Authenticating…' : 'Access Admin Panel'}
            </button>
          </form>
        </div>
      </div>
    )
  }

  return <AdminDashboard />
}
