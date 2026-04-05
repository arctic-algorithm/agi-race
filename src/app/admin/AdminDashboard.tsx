'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  GLOBAL_CONFIG,
  PRODUCT_CONFIG,
  TALENT_CONFIG,
  ENERGY_BUILDING_CONFIG,
  FACILITY_CONFIG,
  RACK_CONFIG,
  TRAINING_RUN_CONFIG,
  IPO_CONFIG,
  TAKEOVER_CONFIG,
  DEBT_CONFIG,
  RESEARCH_MILESTONES,
  BUILD_TIME_MULTIPLIERS,
  CLOUD_CONFIG,
  GRID_CONFIG,
  PUBLIC_CONTRACT_CONFIG,
} from '@/shared/config'

// ─── Types ────────────────────────────────────────────────────────────────────

type ConfigValue = number | string | boolean
type NestedConfig = { [key: string]: ConfigValue | NestedConfig }

// Deep clone helper
function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

function buildDefaultConfig(): NestedConfig {
  return {
    global: deepClone(GLOBAL_CONFIG) as unknown as NestedConfig,
    cloud: deepClone(CLOUD_CONFIG) as unknown as NestedConfig,
    grid: deepClone(GRID_CONFIG) as unknown as NestedConfig,
    publicContract: deepClone(PUBLIC_CONTRACT_CONFIG) as unknown as NestedConfig,
    product: {
      consumer: deepClone(PRODUCT_CONFIG.consumer) as unknown as NestedConfig,
      enterprise: deepClone(PRODUCT_CONFIG.enterprise) as unknown as NestedConfig,
    },
    talent: deepClone(TALENT_CONFIG) as unknown as NestedConfig,
    energyBuilding: Object.fromEntries(
      Object.entries(ENERGY_BUILDING_CONFIG).map(([k, v]) => [k, deepClone(v) as unknown as NestedConfig])
    ),
    facility: Object.fromEntries(
      Object.entries(FACILITY_CONFIG).map(([k, v]) => [k, deepClone(v) as unknown as NestedConfig])
    ),
    rack: Object.fromEntries(
      Object.entries(RACK_CONFIG).map(([k, v]) => [k, deepClone(v) as unknown as NestedConfig])
    ),
    buildTimeMultipliers: deepClone(BUILD_TIME_MULTIPLIERS) as unknown as NestedConfig,
    trainingRun: deepClone(TRAINING_RUN_CONFIG) as unknown as NestedConfig,
    ipo: {
      weights: deepClone(IPO_CONFIG.weights) as unknown as NestedConfig,
      researchScoreMultiplier: IPO_CONFIG.researchScoreMultiplier,
      talentPerHeadValue: IPO_CONFIG.talentPerHeadValue,
    } as NestedConfig,
    takeover: deepClone(TAKEOVER_CONFIG) as unknown as NestedConfig,
    debt: deepClone(DEBT_CONFIG) as unknown as NestedConfig,
    researchMilestones: deepClone(RESEARCH_MILESTONES) as unknown as NestedConfig,
  }
}

// ─── Utility Components ───────────────────────────────────────────────────────

function Toast({ message, type, onDismiss }: { message: string; type: 'success' | 'error'; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 3500)
    return () => clearTimeout(t)
  }, [onDismiss])
  return (
    <div
      className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-lg shadow-xl font-mono text-sm border ${
        type === 'success'
          ? 'bg-zinc-800 border-amber-400 text-amber-400'
          : 'bg-zinc-800 border-red-500 text-red-400'
      }`}
    >
      {message}
    </div>
  )
}

// ─── Field Components ─────────────────────────────────────────────────────────

interface FieldProps {
  label: string
  value: number
  defaultValue: number
  onChange: (v: number) => void
  step?: number
  min?: number
}

function NumericField({ label, value, defaultValue, onChange, step = 1, min }: FieldProps) {
  const isDirty = value !== defaultValue
  return (
    <div className="flex items-center gap-3 py-1">
      <label className={`w-64 text-xs font-mono flex-shrink-0 ${isDirty ? 'text-amber-400' : 'text-zinc-400'}`}>
        {label}
        {isDirty && <span className="ml-1 text-amber-500">•</span>}
      </label>
      <input
        type="number"
        value={value}
        step={step}
        min={min}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-40 bg-zinc-800 border text-zinc-100 font-mono text-xs rounded px-2 py-1 focus:outline-none focus:ring-1 ${
          isDirty
            ? 'border-amber-500 focus:border-amber-400 focus:ring-amber-400'
            : 'border-zinc-600 focus:border-zinc-400 focus:ring-zinc-400'
        }`}
      />
    </div>
  )
}

// ─── Section Wrapper ──────────────────────────────────────────────────────────

function Section({ title, children, defaultOpen = false }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="border border-zinc-700 rounded-lg mb-4 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-5 py-3 bg-zinc-800 hover:bg-zinc-750 text-left"
      >
        <span className="text-amber-400 font-mono font-bold text-sm tracking-wide uppercase">{title}</span>
        <span className="text-zinc-500 font-mono text-xs">{open ? '▲ collapse' : '▼ expand'}</span>
      </button>
      {open && (
        <div className="px-5 py-4 bg-zinc-900">
          {children}
        </div>
      )}
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const defaults = useRef(buildDefaultConfig())
  const [config, setConfig] = useState<NestedConfig>(buildDefaultConfig())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // Load config from Firestore on mount
  useEffect(() => {
    fetch('/api/admin/config')
      .then((r) => r.json())
      .then((data) => {
        if (data.config) {
          // Merge with defaults so new keys always appear
          setConfig(deepMerge(buildDefaultConfig(), data.config as NestedConfig))
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  function deepMerge(base: NestedConfig, override: NestedConfig): NestedConfig {
    const result: NestedConfig = deepClone(base)
    for (const key of Object.keys(override)) {
      const ov = override[key]
      const bv = base[key]
      if (typeof ov === 'object' && ov !== null && typeof bv === 'object' && bv !== null) {
        result[key] = deepMerge(bv as NestedConfig, ov as NestedConfig)
      } else if (ov !== undefined) {
        result[key] = ov
      }
    }
    return result
  }

  // Setter helpers
  function setField(section: string, key: string, value: ConfigValue) {
    setConfig((prev) => ({
      ...prev,
      [section]: {
        ...(prev[section] as NestedConfig),
        [key]: value,
      },
    }))
  }

  function setNestedField(section: string, sub: string, key: string, value: ConfigValue) {
    setConfig((prev) => {
      const sec = prev[section] as NestedConfig
      return {
        ...prev,
        [section]: {
          ...sec,
          [sub]: {
            ...(sec[sub] as NestedConfig),
            [key]: value,
          },
        },
      }
    })
  }

  function setDeepField(section: string, sub: string, subsub: string, value: ConfigValue) {
    setConfig((prev) => {
      const sec = prev[section] as NestedConfig
      const subSec = sec[sub] as NestedConfig
      return {
        ...prev,
        [section]: {
          ...sec,
          [sub]: {
            ...subSec,
            [subsub]: value,
          },
        },
      }
    })
  }

  const handleSave = useCallback(async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/admin/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ config }),
      })
      if (res.ok) {
        setToast({ message: 'Config saved to Firestore', type: 'success' })
        // Update defaults reference to current saved state
        defaults.current = deepClone(config)
      } else {
        const data = await res.json()
        setToast({ message: data.error ?? 'Save failed', type: 'error' })
      }
    } catch {
      setToast({ message: 'Network error during save', type: 'error' })
    } finally {
      setSaving(false)
    }
  }, [config])

  function handleExport() {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'agi-race-config.json'
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleReset() {
    if (confirm('Reset all fields to code defaults? This does not affect Firestore until you save.')) {
      setConfig(buildDefaultConfig())
    }
  }

  async function handleLogout() {
    await fetch('/api/admin/auth', { method: 'DELETE' })
    window.location.reload()
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-900 flex items-center justify-center">
        <span className="text-zinc-500 font-mono text-sm animate-pulse">Loading config…</span>
      </div>
    )
  }

  const g = config.global as NestedConfig
  const dg = defaults.current.global as NestedConfig
  const cl = config.cloud as NestedConfig
  const dcl = defaults.current.cloud as NestedConfig
  const gr = config.grid as NestedConfig
  const dgr = defaults.current.grid as NestedConfig
  const pc = config.publicContract as NestedConfig
  const dpc = defaults.current.publicContract as NestedConfig
  const prod = config.product as NestedConfig
  const dprod = defaults.current.product as NestedConfig
  const tal = config.talent as NestedConfig
  const dtal = defaults.current.talent as NestedConfig
  const eb = config.energyBuilding as NestedConfig
  const deb = defaults.current.energyBuilding as NestedConfig
  const fac = config.facility as NestedConfig
  const dfac = defaults.current.facility as NestedConfig
  const rack = config.rack as NestedConfig
  const drack = defaults.current.rack as NestedConfig
  const btm = config.buildTimeMultipliers as NestedConfig
  const dbtm = defaults.current.buildTimeMultipliers as NestedConfig
  const tr = config.trainingRun as NestedConfig
  const dtr = defaults.current.trainingRun as NestedConfig
  const ipo = config.ipo as NestedConfig
  const dipo = defaults.current.ipo as NestedConfig
  const ipoW = ipo.weights as NestedConfig
  const dipoW = dipo.weights as NestedConfig
  const to = config.takeover as NestedConfig
  const dto = defaults.current.takeover as NestedConfig
  const debt = config.debt as NestedConfig
  const ddebt = defaults.current.debt as NestedConfig
  const rm = config.researchMilestones as NestedConfig
  const drm = defaults.current.researchMilestones as NestedConfig

  return (
    <div className="min-h-screen bg-zinc-900 text-zinc-100">
      {toast && <Toast message={toast.message} type={toast.type} onDismiss={() => setToast(null)} />}

      {/* Header */}
      <div className="sticky top-0 z-40 bg-zinc-950 border-b border-zinc-700 px-6 py-3 flex items-center justify-between">
        <div>
          <h1 className="text-amber-400 font-mono font-bold text-lg tracking-tight">AGI Race — Admin Panel</h1>
          <p className="text-zinc-500 font-mono text-xs">Edit game economy parameters. Changes are live after saving.</p>
        </div>
        <div className="flex gap-3 items-center">
          <button
            onClick={handleReset}
            className="px-3 py-1.5 text-xs font-mono border border-zinc-600 text-zinc-400 hover:border-zinc-400 hover:text-zinc-200 rounded transition-colors"
          >
            Reset to Defaults
          </button>
          <button
            onClick={handleExport}
            className="px-3 py-1.5 text-xs font-mono border border-zinc-600 text-zinc-400 hover:border-zinc-400 hover:text-zinc-200 rounded transition-colors"
          >
            Export JSON
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-xs font-mono bg-amber-400 hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-900 font-bold rounded transition-colors"
          >
            {saving ? 'Saving…' : 'Save to Firestore'}
          </button>
          <button
            onClick={handleLogout}
            className="px-3 py-1.5 text-xs font-mono border border-zinc-700 text-zinc-600 hover:text-zinc-400 rounded transition-colors"
          >
            Logout
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-6">

        {/* ── Global Economy ── */}
        <Section title="Global Economy" defaultOpen>
          <NumericField label="Seed Funding ($)" value={g.seedFunding as number} defaultValue={dg.seedFunding as number} onChange={(v) => setField('global', 'seedFunding', v)} step={100000} min={0} />
          <NumericField label="Game Day Duration (seconds)" value={g.gameDaySeconds as number} defaultValue={dg.gameDaySeconds as number} onChange={(v) => setField('global', 'gameDaySeconds', v)} step={1} min={1} />
          <NumericField label="Days Per Month" value={g.daysPerMonth as number} defaultValue={dg.daysPerMonth as number} onChange={(v) => setField('global', 'daysPerMonth', v)} step={1} min={1} />
          <NumericField label="IPO Revenue Threshold ($)" value={g.ipoRevenueThreshold as number} defaultValue={dg.ipoRevenueThreshold as number} onChange={(v) => setField('global', 'ipoRevenueThreshold', v)} step={100000} min={0} />
          <NumericField label="Second Slot Talent Threshold" value={g.secondSlotTalentThreshold as number} defaultValue={dg.secondSlotTalentThreshold as number} onChange={(v) => setField('global', 'secondSlotTalentThreshold', v)} step={1} min={1} />
        </Section>

        {/* ── Cloud Config ── */}
        <Section title="Cloud Token Rental">
          <NumericField label="Base Cost per t/s per Month ($)" value={cl.baseCostPerTps as number} defaultValue={dcl.baseCostPerTps as number} onChange={(v) => setField('cloud', 'baseCostPerTps', v)} step={1} min={0} />
          <NumericField label="Scaling Factor" value={cl.scalingFactor as number} defaultValue={dcl.scalingFactor as number} onChange={(v) => setField('cloud', 'scalingFactor', v)} step={0.0001} min={0} />
        </Section>

        {/* ── Grid Config ── */}
        <Section title="Grid & Cloud Slider Limits">
          <NumericField label="Max Cloud Rental (t/s)" value={gr.maxCloudRentalTps as number} defaultValue={dgr.maxCloudRentalTps as number} onChange={(v) => setField('grid', 'maxCloudRentalTps', v)} step={1000} min={0} />
          <NumericField label="Max Public Grid Units" value={gr.maxPublicGridUnits as number} defaultValue={dgr.maxPublicGridUnits as number} onChange={(v) => setField('grid', 'maxPublicGridUnits', v)} step={1000} min={0} />
          <NumericField label="Public Grid Cost per Unit per Month ($)" value={gr.publicGridCostPerUnitPerMonth as number} defaultValue={dgr.publicGridCostPerUnitPerMonth as number} onChange={(v) => setField('grid', 'publicGridCostPerUnitPerMonth', v)} step={10} min={0} />
        </Section>

        {/* ── Public Contract ── */}
        <Section title="Public Energy Contracts">
          <NumericField label="Increment Size (units)" value={pc.incrementSize as number} defaultValue={dpc.incrementSize as number} onChange={(v) => setField('publicContract', 'incrementSize', v)} step={10} min={1} />
          <NumericField label="Base Cost per Increment per Month ($)" value={pc.baseCostPerIncrement as number} defaultValue={dpc.baseCostPerIncrement as number} onChange={(v) => setField('publicContract', 'baseCostPerIncrement', v)} step={10000} min={0} />
          <NumericField label="Scaling Factor" value={pc.scalingFactor as number} defaultValue={dpc.scalingFactor as number} onChange={(v) => setField('publicContract', 'scalingFactor', v)} step={0.01} min={0} />
        </Section>

        {/* ── Products ── */}
        <Section title="Products & Revenue">
          <p className="text-zinc-500 font-mono text-xs mb-3 uppercase tracking-widest">Consumer</p>
          <NumericField label="Revenue per Token ($)" value={(prod.consumer as NestedConfig).revenuePerToken as number} defaultValue={(dprod.consumer as NestedConfig).revenuePerToken as number} onChange={(v) => setNestedField('product', 'consumer', 'revenuePerToken', v)} step={0.0001} min={0} />
          <NumericField label="Volume Cap (t/s)" value={(prod.consumer as NestedConfig).volumeCap as number} defaultValue={(dprod.consumer as NestedConfig).volumeCap as number} onChange={(v) => setNestedField('product', 'consumer', 'volumeCap', v)} step={1000} min={0} />
          <NumericField label="Ramp-Up Days" value={(prod.consumer as NestedConfig).rampUpDays as number} defaultValue={(dprod.consumer as NestedConfig).rampUpDays as number} onChange={(v) => setNestedField('product', 'consumer', 'rampUpDays', v)} step={1} min={0} />
          <NumericField label="Churn Rate (0–1)" value={(prod.consumer as NestedConfig).churnRate as number} defaultValue={(dprod.consumer as NestedConfig).churnRate as number} onChange={(v) => setNestedField('product', 'consumer', 'churnRate', v)} step={0.01} min={0} />

          <p className="text-zinc-500 font-mono text-xs mt-5 mb-3 uppercase tracking-widest">Enterprise</p>
          <NumericField label="Revenue per Token ($)" value={(prod.enterprise as NestedConfig).revenuePerToken as number} defaultValue={(dprod.enterprise as NestedConfig).revenuePerToken as number} onChange={(v) => setNestedField('product', 'enterprise', 'revenuePerToken', v)} step={0.0001} min={0} />
          <NumericField label="Volume Cap (t/s)" value={(prod.enterprise as NestedConfig).volumeCap as number} defaultValue={(dprod.enterprise as NestedConfig).volumeCap as number} onChange={(v) => setNestedField('product', 'enterprise', 'volumeCap', v)} step={1000} min={0} />
          <NumericField label="Ramp-Up Days" value={(prod.enterprise as NestedConfig).rampUpDays as number} defaultValue={(dprod.enterprise as NestedConfig).rampUpDays as number} onChange={(v) => setNestedField('product', 'enterprise', 'rampUpDays', v)} step={1} min={0} />
          <NumericField label="Churn Rate (0–1)" value={(prod.enterprise as NestedConfig).churnRate as number} defaultValue={(dprod.enterprise as NestedConfig).churnRate as number} onChange={(v) => setNestedField('product', 'enterprise', 'churnRate', v)} step={0.01} min={0} />
        </Section>

        {/* ── Talent ── */}
        <Section title="Talent">
          <NumericField label="First Hire Cost ($)" value={tal.firstHireCost as number} defaultValue={dtal.firstHireCost as number} onChange={(v) => setField('talent', 'firstHireCost', v)} step={1000} min={0} />
          <NumericField label="Hire Cost Multiplier" value={tal.hireCostMultiplier as number} defaultValue={dtal.hireCostMultiplier as number} onChange={(v) => setField('talent', 'hireCostMultiplier', v)} step={0.1} min={1} />
          <NumericField label="Base Cooldown (game days)" value={tal.baseCooldownDays as number} defaultValue={dtal.baseCooldownDays as number} onChange={(v) => setField('talent', 'baseCooldownDays', v)} step={0.5} min={0} />
          <NumericField label="Cooldown Multiplier" value={tal.cooldownMultiplier as number} defaultValue={dtal.cooldownMultiplier as number} onChange={(v) => setField('talent', 'cooldownMultiplier', v)} step={0.1} min={1} />
          <NumericField label="Energy Reduction per Talent (0–1)" value={tal.energyReductionPerTalent as number} defaultValue={dtal.energyReductionPerTalent as number} onChange={(v) => setField('talent', 'energyReductionPerTalent', v)} step={0.01} min={0} />
          <NumericField label="Token Reduction per Talent (0–1)" value={tal.tokenReductionPerTalent as number} defaultValue={dtal.tokenReductionPerTalent as number} onChange={(v) => setField('talent', 'tokenReductionPerTalent', v)} step={0.01} min={0} />
          <NumericField label="Max Energy Reduction Cap (0–1)" value={tal.maxEnergyReduction as number} defaultValue={dtal.maxEnergyReduction as number} onChange={(v) => setField('talent', 'maxEnergyReduction', v)} step={0.05} min={0} />
          <NumericField label="Max Token Reduction Cap (0–1)" value={tal.maxTokenReduction as number} defaultValue={dtal.maxTokenReduction as number} onChange={(v) => setField('talent', 'maxTokenReduction', v)} step={0.05} min={0} />
          <NumericField label="Poach Min Premium (fraction)" value={tal.poachMinPremium as number} defaultValue={dtal.poachMinPremium as number} onChange={(v) => setField('talent', 'poachMinPremium', v)} step={0.01} min={0} />
          <NumericField label="Poach Defense Window (hours)" value={tal.poachDefenseWindowHours as number} defaultValue={dtal.poachDefenseWindowHours as number} onChange={(v) => setField('talent', 'poachDefenseWindowHours', v)} step={1} min={0} />
        </Section>

        {/* ── Energy Buildings ── */}
        <Section title="Energy Buildings">
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono border-collapse">
              <thead>
                <tr className="text-zinc-500 uppercase tracking-widest">
                  <th className="text-left py-2 pr-4 font-medium">Type</th>
                  <th className="text-right py-2 px-3 font-medium">Build Cost ($)</th>
                  <th className="text-right py-2 px-3 font-medium">Build Time (min)</th>
                  <th className="text-right py-2 px-3 font-medium">Maintenance ($/mo)</th>
                  <th className="text-right py-2 px-3 font-medium">Output Units</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(eb) as string[]).map((type) => {
                  const row = eb[type] as NestedConfig
                  const def = deb[type] as NestedConfig
                  const isDirty =
                    row.buildCost !== def.buildCost ||
                    row.buildTimeMinutes !== def.buildTimeMinutes ||
                    row.monthlyMaintenance !== def.monthlyMaintenance ||
                    row.outputUnits !== def.outputUnits
                  return (
                    <tr key={type} className={`border-t border-zinc-800 ${isDirty ? 'bg-amber-950/20' : ''}`}>
                      <td className={`py-1.5 pr-4 ${isDirty ? 'text-amber-400' : 'text-zinc-300'}`}>
                        {type.replace(/_/g, ' ')}
                        {isDirty && <span className="ml-1 text-amber-500">•</span>}
                      </td>
                      <td className="py-1.5 px-3">
                        <input type="number" value={row.buildCost as number} min={0} step={10000}
                          onChange={(e) => setNestedField('energyBuilding', type, 'buildCost', Number(e.target.value))}
                          className={`w-28 bg-zinc-800 border text-right text-zinc-100 font-mono text-xs rounded px-2 py-0.5 focus:outline-none ${row.buildCost !== def.buildCost ? 'border-amber-500' : 'border-zinc-600'}`} />
                      </td>
                      <td className="py-1.5 px-3">
                        <input type="number" value={row.buildTimeMinutes as number} min={0} step={1}
                          onChange={(e) => setNestedField('energyBuilding', type, 'buildTimeMinutes', Number(e.target.value))}
                          className={`w-24 bg-zinc-800 border text-right text-zinc-100 font-mono text-xs rounded px-2 py-0.5 focus:outline-none ${row.buildTimeMinutes !== def.buildTimeMinutes ? 'border-amber-500' : 'border-zinc-600'}`} />
                      </td>
                      <td className="py-1.5 px-3">
                        <input type="number" value={row.monthlyMaintenance as number} min={0} step={1000}
                          onChange={(e) => setNestedField('energyBuilding', type, 'monthlyMaintenance', Number(e.target.value))}
                          className={`w-28 bg-zinc-800 border text-right text-zinc-100 font-mono text-xs rounded px-2 py-0.5 focus:outline-none ${row.monthlyMaintenance !== def.monthlyMaintenance ? 'border-amber-500' : 'border-zinc-600'}`} />
                      </td>
                      <td className="py-1.5 px-3">
                        <input type="number" value={row.outputUnits as number} min={0} step={100}
                          onChange={(e) => setNestedField('energyBuilding', type, 'outputUnits', Number(e.target.value))}
                          className={`w-24 bg-zinc-800 border text-right text-zinc-100 font-mono text-xs rounded px-2 py-0.5 focus:outline-none ${row.outputUnits !== def.outputUnits ? 'border-amber-500' : 'border-zinc-600'}`} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── Facilities ── */}
        <Section title="Facilities">
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono border-collapse">
              <thead>
                <tr className="text-zinc-500 uppercase tracking-widest">
                  <th className="text-left py-2 pr-4 font-medium">Type</th>
                  <th className="text-right py-2 px-3 font-medium">Rack Slots</th>
                  <th className="text-right py-2 px-3 font-medium">Build Cost ($)</th>
                  <th className="text-right py-2 px-3 font-medium">Build Time (min)</th>
                  <th className="text-right py-2 px-3 font-medium">Maintenance ($/mo)</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(fac) as string[]).map((type) => {
                  const row = fac[type] as NestedConfig
                  const def = dfac[type] as NestedConfig
                  const isDirty =
                    row.rackSlots !== def.rackSlots ||
                    row.buildCost !== def.buildCost ||
                    row.buildTimeMinutes !== def.buildTimeMinutes ||
                    row.monthlyMaintenance !== def.monthlyMaintenance
                  return (
                    <tr key={type} className={`border-t border-zinc-800 ${isDirty ? 'bg-amber-950/20' : ''}`}>
                      <td className={`py-1.5 pr-4 ${isDirty ? 'text-amber-400' : 'text-zinc-300'}`}>
                        {type.replace(/_/g, ' ')}
                        {isDirty && <span className="ml-1 text-amber-500">•</span>}
                      </td>
                      <td className="py-1.5 px-3">
                        <input type="number" value={row.rackSlots as number} min={1} step={1}
                          onChange={(e) => setNestedField('facility', type, 'rackSlots', Number(e.target.value))}
                          className={`w-20 bg-zinc-800 border text-right text-zinc-100 font-mono text-xs rounded px-2 py-0.5 focus:outline-none ${row.rackSlots !== def.rackSlots ? 'border-amber-500' : 'border-zinc-600'}`} />
                      </td>
                      <td className="py-1.5 px-3">
                        <input type="number" value={row.buildCost as number} min={0} step={100000}
                          onChange={(e) => setNestedField('facility', type, 'buildCost', Number(e.target.value))}
                          className={`w-28 bg-zinc-800 border text-right text-zinc-100 font-mono text-xs rounded px-2 py-0.5 focus:outline-none ${row.buildCost !== def.buildCost ? 'border-amber-500' : 'border-zinc-600'}`} />
                      </td>
                      <td className="py-1.5 px-3">
                        <input type="number" value={row.buildTimeMinutes as number} min={0} step={1}
                          onChange={(e) => setNestedField('facility', type, 'buildTimeMinutes', Number(e.target.value))}
                          className={`w-24 bg-zinc-800 border text-right text-zinc-100 font-mono text-xs rounded px-2 py-0.5 focus:outline-none ${row.buildTimeMinutes !== def.buildTimeMinutes ? 'border-amber-500' : 'border-zinc-600'}`} />
                      </td>
                      <td className="py-1.5 px-3">
                        <input type="number" value={row.monthlyMaintenance as number} min={0} step={1000}
                          onChange={(e) => setNestedField('facility', type, 'monthlyMaintenance', Number(e.target.value))}
                          className={`w-28 bg-zinc-800 border text-right text-zinc-100 font-mono text-xs rounded px-2 py-0.5 focus:outline-none ${row.monthlyMaintenance !== def.monthlyMaintenance ? 'border-amber-500' : 'border-zinc-600'}`} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── Server Racks ── */}
        <Section title="Server Racks">
          <div className="overflow-x-auto">
            <table className="w-full text-xs font-mono border-collapse">
              <thead>
                <tr className="text-zinc-500 uppercase tracking-widest">
                  <th className="text-left py-2 pr-4 font-medium">Type</th>
                  <th className="text-right py-2 px-3 font-medium">Gen</th>
                  <th className="text-right py-2 px-3 font-medium">Tokens/sec</th>
                  <th className="text-right py-2 px-3 font-medium">Build Cost ($)</th>
                  <th className="text-right py-2 px-3 font-medium">Energy Draw</th>
                  <th className="text-right py-2 px-3 font-medium">Delivery (min)</th>
                </tr>
              </thead>
              <tbody>
                {(Object.keys(rack) as string[]).map((type) => {
                  const row = rack[type] as NestedConfig
                  const def = drack[type] as NestedConfig
                  const isDirty =
                    row.tokensPerSec !== def.tokensPerSec ||
                    row.buildCost !== def.buildCost ||
                    row.energyDraw !== def.energyDraw ||
                    row.deliveryTimeMinutes !== def.deliveryTimeMinutes
                  return (
                    <tr key={type} className={`border-t border-zinc-800 ${isDirty ? 'bg-amber-950/20' : ''}`}>
                      <td className={`py-1.5 pr-4 ${isDirty ? 'text-amber-400' : 'text-zinc-300'}`}>
                        {type}
                        {isDirty && <span className="ml-1 text-amber-500">•</span>}
                      </td>
                      <td className="py-1.5 px-3 text-right text-zinc-500">{row.generation as number}</td>
                      <td className="py-1.5 px-3">
                        <input type="number" value={row.tokensPerSec as number} min={0} step={100}
                          onChange={(e) => setNestedField('rack', type, 'tokensPerSec', Number(e.target.value))}
                          className={`w-24 bg-zinc-800 border text-right text-zinc-100 font-mono text-xs rounded px-2 py-0.5 focus:outline-none ${row.tokensPerSec !== def.tokensPerSec ? 'border-amber-500' : 'border-zinc-600'}`} />
                      </td>
                      <td className="py-1.5 px-3">
                        <input type="number" value={row.buildCost as number} min={0} step={100000}
                          onChange={(e) => setNestedField('rack', type, 'buildCost', Number(e.target.value))}
                          className={`w-28 bg-zinc-800 border text-right text-zinc-100 font-mono text-xs rounded px-2 py-0.5 focus:outline-none ${row.buildCost !== def.buildCost ? 'border-amber-500' : 'border-zinc-600'}`} />
                      </td>
                      <td className="py-1.5 px-3">
                        <input type="number" value={row.energyDraw as number} min={0} step={1}
                          onChange={(e) => setNestedField('rack', type, 'energyDraw', Number(e.target.value))}
                          className={`w-20 bg-zinc-800 border text-right text-zinc-100 font-mono text-xs rounded px-2 py-0.5 focus:outline-none ${row.energyDraw !== def.energyDraw ? 'border-amber-500' : 'border-zinc-600'}`} />
                      </td>
                      <td className="py-1.5 px-3">
                        <input type="number" value={row.deliveryTimeMinutes as number} min={0} step={1}
                          onChange={(e) => setNestedField('rack', type, 'deliveryTimeMinutes', Number(e.target.value))}
                          className={`w-24 bg-zinc-800 border text-right text-zinc-100 font-mono text-xs rounded px-2 py-0.5 focus:outline-none ${row.deliveryTimeMinutes !== def.deliveryTimeMinutes ? 'border-amber-500' : 'border-zinc-600'}`} />
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Section>

        {/* ── Build Time Multipliers ── */}
        <Section title="Build Time Multipliers">
          <NumericField label="Energy Building (per successive)" value={btm.energyBuilding as number} defaultValue={dbtm.energyBuilding as number} onChange={(v) => setField('buildTimeMultipliers', 'energyBuilding', v)} step={0.05} min={1} />
          <NumericField label="Facility (per successive)" value={btm.facility as number} defaultValue={dbtm.facility as number} onChange={(v) => setField('buildTimeMultipliers', 'facility', v)} step={0.05} min={1} />
          <NumericField label="Rack (per successive)" value={btm.rack as number} defaultValue={dbtm.rack as number} onChange={(v) => setField('buildTimeMultipliers', 'rack', v)} step={0.05} min={1} />
        </Section>

        {/* ── Training Runs ── */}
        <Section title="Training Runs">
          <NumericField label="Base Duration (game days)" value={tr.baseDurationDays as number} defaultValue={dtr.baseDurationDays as number} onChange={(v) => setField('trainingRun', 'baseDurationDays', v)} step={0.5} min={0} />
          <NumericField label="Duration Multiplier" value={tr.durationMultiplier as number} defaultValue={dtr.durationMultiplier as number} onChange={(v) => setField('trainingRun', 'durationMultiplier', v)} step={0.1} min={1} />
          <NumericField label="Base Token Cost % (of t/s)" value={tr.baseTokenCostPct as number} defaultValue={dtr.baseTokenCostPct as number} onChange={(v) => setField('trainingRun', 'baseTokenCostPct', v)} step={0.01} min={0} />
          <NumericField label="Token Cost Multiplier" value={tr.tokenCostMultiplier as number} defaultValue={dtr.tokenCostMultiplier as number} onChange={(v) => setField('trainingRun', 'tokenCostMultiplier', v)} step={0.1} min={1} />
          <NumericField label="Base Uplift (multiplier)" value={tr.baseUplift as number} defaultValue={dtr.baseUplift as number} onChange={(v) => setField('trainingRun', 'baseUplift', v)} step={0.05} min={1} />
          <NumericField label="Uplift Floor (multiplier)" value={tr.upliftFloor as number} defaultValue={dtr.upliftFloor as number} onChange={(v) => setField('trainingRun', 'upliftFloor', v)} step={0.01} min={1} />
          <NumericField label="Uplift Decay per Run" value={tr.upliftDecay as number} defaultValue={dtr.upliftDecay as number} onChange={(v) => setField('trainingRun', 'upliftDecay', v)} step={0.01} min={0} />
        </Section>

        {/* ── IPO ── */}
        <Section title="IPO">
          <p className="text-zinc-500 font-mono text-xs mb-3 uppercase tracking-widest">Stock Price Formula Weights</p>
          <NumericField label="FCF Weight" value={ipoW.fcf as number} defaultValue={dipoW.fcf as number} onChange={(v) => setDeepField('ipo', 'weights', 'fcf', v)} step={0.05} min={0} />
          <NumericField label="Research Score Weight" value={ipoW.researchScore as number} defaultValue={dipoW.researchScore as number} onChange={(v) => setDeepField('ipo', 'weights', 'researchScore', v)} step={0.05} min={0} />
          <NumericField label="Talent Weight" value={ipoW.talent as number} defaultValue={dipoW.talent as number} onChange={(v) => setDeepField('ipo', 'weights', 'talent', v)} step={0.05} min={0} />
          <div className="mt-2" />
          <NumericField label="Research Score Multiplier" value={ipo.researchScoreMultiplier as number} defaultValue={dipo.researchScoreMultiplier as number} onChange={(v) => setField('ipo', 'researchScoreMultiplier', v)} step={0.00001} min={0} />
          <NumericField label="Talent Per Head Value ($)" value={ipo.talentPerHeadValue as number} defaultValue={dipo.talentPerHeadValue as number} onChange={(v) => setField('ipo', 'talentPerHeadValue', v)} step={10000} min={0} />
        </Section>

        {/* ── Takeovers ── */}
        <Section title="Takeovers">
          <NumericField label="Bracket Min (fraction of attacker t/s)" value={to.bracketMin as number} defaultValue={dto.bracketMin as number} onChange={(v) => setField('takeover', 'bracketMin', v)} step={0.1} min={0} />
          <NumericField label="Bracket Max (fraction of attacker t/s)" value={to.bracketMax as number} defaultValue={dto.bracketMax as number} onChange={(v) => setField('takeover', 'bracketMax', v)} step={0.1} min={0} />
          <NumericField label="Defense Window (real hours)" value={to.defenseWindowHours as number} defaultValue={dto.defenseWindowHours as number} onChange={(v) => setField('takeover', 'defenseWindowHours', v)} step={1} min={0} />
          <NumericField label="Min Bid Premium (fraction)" value={to.minBidPremium as number} defaultValue={dto.minBidPremium as number} onChange={(v) => setField('takeover', 'minBidPremium', v)} step={0.01} min={0} />
        </Section>

        {/* ── Debt ── */}
        <Section title="Debt">
          <NumericField label="Max Debt Multiplier (× monthly FCF)" value={debt.maxDebtMultiplier as number} defaultValue={ddebt.maxDebtMultiplier as number} onChange={(v) => setField('debt', 'maxDebtMultiplier', v)} step={1} min={0} />
          <NumericField label="Monthly Interest Rate" value={debt.monthlyInterestRate as number} defaultValue={ddebt.monthlyInterestRate as number} onChange={(v) => setField('debt', 'monthlyInterestRate', v)} step={0.001} min={0} />
        </Section>

        {/* ── Research Milestones ── */}
        <Section title="Research Milestones">
          <p className="text-zinc-500 font-mono text-xs mb-3">Each value is a multiple of current tokens/sec at the time of the milestone check.</p>
          <NumericField label="Cloud Efficiency" value={rm.cloudEfficiency as number} defaultValue={drm.cloudEfficiency as number} onChange={(v) => setField('researchMilestones', 'cloudEfficiency', v)} step={1} min={0} />
          <NumericField label="Colo Suite" value={rm.coloSuite as number} defaultValue={drm.coloSuite as number} onChange={(v) => setField('researchMilestones', 'coloSuite', v)} step={1} min={0} />
          <NumericField label="Gen 2 Racks" value={rm.gen2Racks as number} defaultValue={drm.gen2Racks as number} onChange={(v) => setField('researchMilestones', 'gen2Racks', v)} step={1} min={0} />
          <NumericField label="Custom Silicon" value={rm.customSilicon as number} defaultValue={drm.customSilicon as number} onChange={(v) => setField('researchMilestones', 'customSilicon', v)} step={1} min={0} />
        </Section>

        {/* Bottom action bar */}
        <div className="flex gap-3 justify-end mt-6 pb-10">
          <button
            onClick={handleReset}
            className="px-4 py-2 text-sm font-mono border border-zinc-600 text-zinc-400 hover:border-zinc-400 hover:text-zinc-200 rounded transition-colors"
          >
            Reset to Defaults
          </button>
          <button
            onClick={handleExport}
            className="px-4 py-2 text-sm font-mono border border-zinc-600 text-zinc-400 hover:border-zinc-400 hover:text-zinc-200 rounded transition-colors"
          >
            Export JSON
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 text-sm font-mono bg-amber-400 hover:bg-amber-300 disabled:opacity-50 disabled:cursor-not-allowed text-zinc-900 font-bold rounded transition-colors"
          >
            {saving ? 'Saving…' : 'Save to Firestore'}
          </button>
        </div>
      </div>
    </div>
  )
}
