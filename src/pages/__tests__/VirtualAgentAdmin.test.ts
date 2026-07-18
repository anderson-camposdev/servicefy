import { describe, expect, it } from 'vitest'
import { normalizeReadiness, normalizeVirtualAgentList } from '../VirtualAgentAdmin'

describe('VirtualAgentAdmin data boundaries', () => {
  it('treats absent list payloads as empty collections', () => {
    expect(normalizeVirtualAgentList(undefined)).toEqual([])
    expect(normalizeVirtualAgentList(null)).toEqual([])
  })

  it('keeps readiness usable when an older backend omits checks', () => {
    const readiness = normalizeReadiness({
      ready: false,
      companyName: 'Acme',
      checks: undefined,
    })

    expect(readiness?.checks).toEqual([])
  })
})
