// ============================================================
// useDbData — Unified hook for multi-module ITSM data
// Loads companies + profiles from Supabase on login
// Each module (requests, problems, changes) has its own fetch
// ============================================================

import { useState, useEffect, useCallback } from 'react'
import {
  companiesService,
  profilesService,
  problemsService,
  changesService,
  setCompanySchemas,
} from '../lib/services'
import type {
  CompanyRow,
  ProfileRow,
  ProblemRow,
  ChangeRow,
} from '../lib/database.types'

// ─── COMPANIES + PROFILES (app-level, loaded once on mount) ──

export function useAppData() {
  const [companies, setCompanies] = useState<CompanyRow[]>([])
  const [profiles, setProfiles] = useState<ProfileRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      companiesService.list(),
    ]).then(async ([comps]) => {
      setCompanies(comps)

      // Registry schemas
      const mapping: Record<string, string> = {}
      comps.forEach(c => {
        if (c.schema_name) {
          mapping[c.id] = c.schema_name
        }
      })
      setCompanySchemas(mapping)

      // load profiles for all companies
      const allProfiles = await Promise.all(comps.map(c => profilesService.listByCompany(c.id)))
      setProfiles(allProfiles.flat())
    }).catch(err => {
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados.')
    }).finally(() => setLoading(false))
  }, [])

  return { companies, profiles, loading, error }
}

// ─── PROBLEMS ─────────────────────────────────────────────────

export function useProblems(companyId: string) {
  const [problems, setProblems] = useState<ProblemRow[]>([])
  const [kpis, setKpis] = useState({ total: 0, active: 0, rootCause: 0, knownError: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const [rows, kpiData] = await Promise.all([
        problemsService.list(companyId),
        problemsService.getKPIs(companyId),
      ])
      setProblems(rows)
      setKpis(kpiData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar problemas.')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { fetch() }, [fetch])

  return { problems, kpis, loading, error, refetch: fetch }
}

// ─── CHANGES ──────────────────────────────────────────────────

export function useChanges(companyId: string) {
  const [changes, setChanges] = useState<ChangeRow[]>([])
  const [kpis, setKpis] = useState({ total: 0, awaitingCAB: 0, emergency: 0, highRisk: 0, scheduled: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!companyId) return
    setLoading(true)
    setError(null)
    try {
      const [rows, kpiData] = await Promise.all([
        changesService.list(companyId),
        changesService.getKPIs(companyId),
      ])
      setChanges(rows)
      setKpis(kpiData)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar mudanças.')
    } finally {
      setLoading(false)
    }
  }, [companyId])

  useEffect(() => { fetch() }, [fetch])

  return { changes, kpis, loading, error, refetch: fetch }
}

