import { describe, expect, it } from 'vitest'
import {
  KNOWLEDGE_TEMPLATES,
  applyKnowledgeTemplate,
  calculateKnowledgeQuality,
  groupRelationSelections,
  hasUnsavedArticleChanges,
  resolveReviewStatus,
  type ArticleDraftSnapshot,
} from '../knowledge-authoring'

describe('knowledge authoring', () => {
  it('oferece modelos operacionais distintos e estruturados', () => {
    expect(KNOWLEDGE_TEMPLATES.map(template => template.id)).toEqual([
      'procedure',
      'diagnostic',
      'known_error',
      'faq',
      'policy',
      'runbook',
    ])
    expect(KNOWLEDGE_TEMPLATES.every(template => template.body.includes('## '))).toBe(true)
  })

  it('nunca sobrescreve conteúdo existente ao aplicar um modelo', () => {
    expect(applyKnowledgeTemplate('runbook', 'conteúdo já escrito')).toBe('conteúdo já escrito')
    expect(applyKnowledgeTemplate('runbook', '')).toContain('## Rollback')
  })

  it('atribui 100 pontos somente a um artigo pronto para operação', () => {
    const quality = calculateKnowledgeQuality({
      title: 'Restaurar acesso remoto à VPN corporativa',
      summary: 'Procedimento operacional para diagnosticar e restaurar o acesso remoto com segurança.',
      body: `## Objetivo\n\n${'Conteúdo operacional validado. '.repeat(12)}\n\n## Validação\n\nConfirmar acesso.`,
      tags: ['vpn', 'acesso remoto'],
      categoryId: 'category-id',
      domainId: 'domain-id',
      relationCount: 2,
    })

    expect(quality.score).toBe(100)
    expect(quality.items.every(item => item.complete)).toBe(true)
  })

  it('sinaliza ausência de contexto operacional sem impedir rascunho', () => {
    const quality = calculateKnowledgeQuality({
      title: 'VPN',
      summary: '',
      body: 'texto curto',
      tags: [],
      categoryId: '',
      domainId: '',
      relationCount: 0,
    })

    expect(quality.score).toBe(0)
    expect(quality.items.find(item => item.label === 'Vínculo operacional')?.complete).toBe(false)
  })

  it('agrupa vínculos selecionados por tipo, na ordem operacional, sem grupos vazios', () => {
    const selections = [
      { targetType: 'change' as const, targetId: 'chg-1', relationship: 'reference' },
      { targetType: 'incident' as const, targetId: 'sym-1', relationship: 'resolves' },
      { targetType: 'incident' as const, targetId: 'sym-2', relationship: 'applies_to' },
    ]
    const options = [
      { targetType: 'incident' as const, targetId: 'sym-1', title: 'VPN não autentica' },
      { targetType: 'change' as const, targetId: 'chg-1', title: 'Expansão do gateway' },
    ]

    const groups = groupRelationSelections(selections, options)

    expect(groups.map(group => group.targetType)).toEqual(['incident', 'change'])
    expect(groups[0].label).toBe('Incidentes')
    expect(groups[0].items).toHaveLength(2)
    expect(groups[0].items[0].option?.title).toBe('VPN não autentica')
    expect(groups[0].items[1].option).toBeUndefined()
    expect(groups[1].label).toBe('Mudanças')
  })

  it('detecta alterações não salvas comparando o rascunho com a última versão persistida', () => {
    const baseline: ArticleDraftSnapshot = {
      title: 'Restaurar VPN',
      summary: 'Resumo',
      body: 'Corpo',
      categoryId: 'cat-1',
      domainId: 'dom-1',
      visibility: 'tenant',
      tags: ['vpn'],
      reviewDueAt: '2026-08-01',
      relations: [{ targetType: 'incident', targetId: 'sym-1', relationship: 'resolves' }],
    }

    expect(hasUnsavedArticleChanges(baseline, { ...baseline })).toBe(false)
    expect(hasUnsavedArticleChanges(baseline, { ...baseline, title: 'Restaurar VPN ' })).toBe(false)
    expect(hasUnsavedArticleChanges(baseline, { ...baseline, body: 'Corpo novo' })).toBe(true)
    expect(hasUnsavedArticleChanges(baseline, {
      ...baseline,
      relations: [{ targetType: 'incident', targetId: 'sym-1', relationship: 'workaround' }],
    })).toBe(true)
    expect(hasUnsavedArticleChanges(baseline, { ...baseline, relations: [] })).toBe(true)
  })

  it('classifica a data de revisão do artigo em vencida, próxima ou programada', () => {
    const now = new Date('2026-07-18T12:00:00Z')

    expect(resolveReviewStatus(null, now).status).toBe('none')
    expect(resolveReviewStatus('', now).status).toBe('none')
    expect(resolveReviewStatus('2026-07-01', now)).toMatchObject({ status: 'overdue' })
    expect(resolveReviewStatus('2026-07-25', now)).toMatchObject({ status: 'due_soon' })
    expect(resolveReviewStatus('2026-12-01', now)).toMatchObject({ status: 'scheduled' })
    expect(resolveReviewStatus('2026-07-01', now).label).toContain('vencida')
  })
})
