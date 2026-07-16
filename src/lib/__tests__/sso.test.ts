import { describe, expect, it } from 'vitest'
import { normalizeSsoProviders } from '../sso'

describe('normalizeSsoProviders', () => {
  it('aceita o formato canônico e remove duplicatas', () => {
    expect(normalizeSsoProviders(['google', 'azure', 'google'])).toEqual(['google', 'azure'])
  })

  it('mantém compatibilidade com a configuração legada por objetos', () => {
    expect(normalizeSsoProviders([
      { type: 'oauth_google', enabled: true },
      { id: 'azure', enabled: true },
      { type: 'ldap', enabled: true },
      { type: 'google', enabled: false },
    ])).toEqual(['google', 'azure'])
  })

  it('rejeita valores desconhecidos ou malformados', () => {
    expect(normalizeSsoProviders({ google: true })).toEqual([])
    expect(normalizeSsoProviders([null, 42, 'github', {}])).toEqual([])
  })
})
