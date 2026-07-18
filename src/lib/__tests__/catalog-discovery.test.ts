import { describe, expect, it } from 'vitest'
import { matchesCatalogSearch, normalizeCatalogSearch } from '../catalog-discovery'

describe('descoberta no catálogo de serviços', () => {
  it('normaliza acentos, caixa e espaços em português', () => {
    expect(normalizeCatalogSearch('  Solicitação   de ACESSO  ')).toBe('solicitacao de acesso')
  })

  it('encontra termos em qualquer campo pesquisável', () => {
    expect(matchesCatalogSearch('vpn acesso', 'Acesso remoto', 'Solicitar VPN corporativa')).toBe(true)
  })

  it('exige que todos os termos informados estejam presentes', () => {
    expect(matchesCatalogSearch('vpn notebook', 'Acesso remoto', 'Solicitar VPN corporativa')).toBe(false)
  })

  it('mantém todos os itens visíveis quando a busca está vazia', () => {
    expect(matchesCatalogSearch('  ', 'Qualquer serviço')).toBe(true)
  })
})
