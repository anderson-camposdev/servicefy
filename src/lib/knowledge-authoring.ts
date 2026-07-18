export type KnowledgeTemplateId =
  | 'procedure'
  | 'diagnostic'
  | 'known_error'
  | 'faq'
  | 'policy'
  | 'runbook'

export interface KnowledgeTemplate {
  id: KnowledgeTemplateId
  label: string
  description: string
  body: string
}

export const KNOWLEDGE_TEMPLATES: KnowledgeTemplate[] = [
  {
    id: 'procedure',
    label: 'Procedimento',
    description: 'Passo a passo repetível para executar uma tarefa.',
    body: '## Objetivo\n\nExplique o resultado esperado.\n\n## Pré-requisitos\n\n- Acesso necessário\n- Informações necessárias\n\n## Procedimento\n\n1. Primeiro passo\n2. Segundo passo\n3. Valide o resultado\n\n## Validação\n\nDescreva como confirmar que o procedimento funcionou.\n\n## Em caso de falha\n\nIndique a rota de escalonamento.',
  },
  {
    id: 'diagnostic',
    label: 'Diagnóstico',
    description: 'Árvore de investigação para restaurar um serviço.',
    body: '## Sintomas observados\n\nListe os sinais que confirmam este cenário.\n\n## Diagnóstico\n\n1. Verifique a condição inicial\n2. Colete evidências\n3. Isole a causa provável\n\n## Solução\n\nDescreva a correção recomendada.\n\n## Evidência de recuperação\n\nRegistre o critério de sucesso.\n\n## Escalonamento\n\nQuando e para qual equipe escalar.',
  },
  {
    id: 'known_error',
    label: 'Erro conhecido',
    description: 'Causa raiz conhecida, workaround e correção definitiva.',
    body: '## Sintoma\n\nComo o erro se apresenta.\n\n## Causa raiz\n\nDescreva a causa confirmada.\n\n## Workaround\n\nPassos seguros para restaurar o serviço temporariamente.\n\n## Solução definitiva\n\nMudança ou correção necessária.\n\n## Riscos e limitações\n\nO que deve ser observado ao aplicar o workaround.',
  },
  {
    id: 'faq',
    label: 'FAQ',
    description: 'Resposta curta para uma dúvida frequente.',
    body: '## Pergunta\n\nEscreva a dúvida como o usuário faria.\n\n## Resposta curta\n\nResponda de forma direta.\n\n## Detalhes\n\nInclua contexto, exceções e links relacionados.',
  },
  {
    id: 'policy',
    label: 'Política',
    description: 'Regra de governança, escopo e responsabilidades.',
    body: '## Objetivo\n\nPor que esta política existe.\n\n## Escopo\n\nQuem e quais serviços estão cobertos.\n\n## Diretriz\n\nDeclare a regra de forma objetiva.\n\n## Responsabilidades\n\n- Responsável\n- Aprovador\n- Partes consultadas\n\n## Exceções\n\nComo solicitar e aprovar uma exceção.\n\n## Evidências de conformidade\n\nComo a aderência será demonstrada.',
  },
  {
    id: 'runbook',
    label: 'Runbook',
    description: 'Operação controlada com pré-check, execução e rollback.',
    body: '## Objetivo operacional\n\nResultado técnico esperado.\n\n## Pré-check\n\n- Janela autorizada\n- Backup ou ponto de retorno\n- Monitoramento disponível\n\n## Execução\n\n1. Execute a ação\n2. Registre a evidência\n3. Confirme o impacto\n\n## Validação pós-execução\n\nMétricas e verificações obrigatórias.\n\n## Rollback\n\nPassos para retorno seguro.\n\n## Comunicação\n\nQuem deve ser informado e em qual momento.',
  },
]

export interface KnowledgeQualityInput {
  title: string
  summary: string
  body: string
  tags: string[]
  categoryId: string
  domainId: string
  relationCount: number
}

export interface KnowledgeQualityItem {
  label: string
  complete: boolean
  points: number
}

export function calculateKnowledgeQuality(input: KnowledgeQualityInput): {
  score: number
  items: KnowledgeQualityItem[]
} {
  const items: KnowledgeQualityItem[] = [
    { label: 'Título específico', complete: input.title.trim().length >= 12, points: 15 },
    { label: 'Resumo para busca', complete: input.summary.trim().length >= 40, points: 15 },
    { label: 'Conteúdo operacional', complete: input.body.trim().length >= 240, points: 20 },
    { label: 'Estrutura com seções', complete: /^##\s+/m.test(input.body), points: 10 },
    { label: 'Vínculo operacional', complete: input.relationCount > 0, points: 20 },
    { label: 'Domínio e categoria', complete: Boolean(input.domainId && input.categoryId), points: 10 },
    { label: 'Palavras-chave', complete: input.tags.length >= 2, points: 10 },
  ]
  return {
    items,
    score: items.reduce((total, item) => total + (item.complete ? item.points : 0), 0),
  }
}

export function applyKnowledgeTemplate(
  templateId: KnowledgeTemplateId,
  currentBody: string,
): string {
  const template = KNOWLEDGE_TEMPLATES.find(item => item.id === templateId)
  if (!template || currentBody.trim()) return currentBody
  return template.body
}

// ─── Vínculos agrupados por tipo (painel de escopo do editor) ───────────────

export type KnowledgeRelationTarget = 'incident' | 'request' | 'problem' | 'change'

const RELATION_GROUP_ORDER: Array<{ targetType: KnowledgeRelationTarget; label: string }> = [
  { targetType: 'incident', label: 'Incidentes' },
  { targetType: 'request', label: 'Solicitações' },
  { targetType: 'problem', label: 'Problemas' },
  { targetType: 'change', label: 'Mudanças' },
]

export interface RelationGroup<S, O> {
  targetType: KnowledgeRelationTarget
  label: string
  items: Array<{ relation: S; option?: O }>
}

export function groupRelationSelections<
  S extends { targetType: KnowledgeRelationTarget; targetId: string },
  O extends { targetType: KnowledgeRelationTarget; targetId: string },
>(selections: S[], options: O[]): Array<RelationGroup<S, O>> {
  return RELATION_GROUP_ORDER
    .map(({ targetType, label }) => ({
      targetType,
      label,
      items: selections
        .filter(relation => relation.targetType === targetType)
        .map(relation => ({
          relation,
          option: options.find(option =>
            option.targetType === relation.targetType && option.targetId === relation.targetId),
        })),
    }))
    .filter(group => group.items.length > 0)
}

// ─── Alterações não salvas (rascunho vs. última versão persistida) ──────────

export interface ArticleDraftSnapshot {
  title: string
  summary: string
  body: string
  categoryId: string
  domainId: string
  visibility: string
  tags: string[]
  reviewDueAt: string
  relations: Array<{ targetType: KnowledgeRelationTarget; targetId: string; relationship: string }>
}

const normalizeSnapshot = (snapshot: ArticleDraftSnapshot) => JSON.stringify({
  title: snapshot.title.trim(),
  summary: snapshot.summary.trim(),
  body: snapshot.body,
  categoryId: snapshot.categoryId,
  domainId: snapshot.domainId,
  visibility: snapshot.visibility,
  tags: snapshot.tags,
  reviewDueAt: snapshot.reviewDueAt,
  relations: [...snapshot.relations]
    .map(relation => `${relation.targetType}:${relation.targetId}:${relation.relationship}`)
    .sort(),
})

export function hasUnsavedArticleChanges(
  baseline: ArticleDraftSnapshot,
  current: ArticleDraftSnapshot,
): boolean {
  return normalizeSnapshot(baseline) !== normalizeSnapshot(current)
}

// ─── Revisão programada do conteúdo (governança editorial) ──────────────────

export type ReviewStatus = 'none' | 'overdue' | 'due_soon' | 'scheduled'

const REVIEW_DUE_SOON_DAYS = 14

export function resolveReviewStatus(
  reviewDueAt: string | null | undefined,
  now: Date | number,
): { status: ReviewStatus; label: string } {
  if (!reviewDueAt) return { status: 'none', label: 'Sem revisão programada' }
  const due = new Date(`${reviewDueAt.slice(0, 10)}T23:59:59`)
  if (Number.isNaN(due.getTime())) return { status: 'none', label: 'Sem revisão programada' }

  const nowMs = typeof now === 'number' ? now : now.getTime()
  const formatted = due.toLocaleDateString('pt-BR')
  if (due.getTime() < nowMs) return { status: 'overdue', label: `Revisão vencida em ${formatted}` }
  const daysLeft = (due.getTime() - nowMs) / 86_400_000
  if (daysLeft <= REVIEW_DUE_SOON_DAYS) return { status: 'due_soon', label: `Revisar até ${formatted}` }
  return { status: 'scheduled', label: `Próxima revisão em ${formatted}` }
}
