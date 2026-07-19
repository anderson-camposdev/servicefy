import { useEffect, useMemo, useState } from 'react'
import {
  Activity, BarChart3, Bot, Boxes, Building2, Code2, FileCheck2,
  Gauge, HeartPulse, Lock, Network, Palette, Search, ShieldCheck, Star, Users, Workflow, Wrench,
} from 'lucide-react'
import { useAppData } from '../hooks/useDbData'
import { ADMIN_ACCESS_DENIED_MESSAGE, isAdminRole } from '../lib/admin-access'
import type { SettingsCategoryKey, SettingsSection } from '../lib/platform-foundation'
import { platformAdminService } from '../lib/platform-admin-service'
import SettingsGovernance, { type GovTab } from './SettingsGovernance'
import ChannelConnectionsSettings from './ChannelConnectionsSettings'
import ChannelRoutingSettings from './ChannelRoutingSettings'
import KnowledgeAdmin from './KnowledgeAdmin'
import VirtualAgentAdmin from './VirtualAgentAdmin'
import PlatformModuleSettings, { type OperationalModuleKey } from './PlatformModuleSettings'
import LoginIntegrationSettings from './LoginIntegrationSettings'
import SettingsPageShell from '../components/settings/SettingsPageShell'

interface Props {
  companyId: string
  activeRole: string
  onNavigate: (view: 'api_docs' | 'workflow_builder' | 'flowfy_bi') => void
}

const CATEGORY_META: Record<SettingsCategoryKey, { title: string; description: string; icon: typeof Users }> = {
  organization: { title: 'Organização e Acesso', description: 'Estrutura, identidades e permissões.', icon: Users },
  service_management: { title: 'Atendimento e ESM', description: 'Casos, catálogos e automações.', icon: Workflow },
  sla_contracts: { title: 'SLA e Contratos', description: 'Prazos, calendários e direitos.', icon: Gauge },
  channels: { title: 'Canais e Comunicação', description: 'E-mail, chat, WhatsApp e rotas.', icon: Network },
  knowledge_ai: { title: 'Conhecimento e Agente Virtual', description: 'KB, IA e transferência humana.', icon: Bot },
  cmdb: { title: 'CMDB e Ativos', description: 'Itens, fontes e relacionamentos.', icon: Boxes },
  portal_brand: { title: 'Portal e Marca', description: 'Identidade e experiência.', icon: Palette },
  security: { title: 'Segurança e Compliance', description: 'Auditoria, LGPD e segredos.', icon: ShieldCheck },
  integrations: { title: 'Integrações e Desenvolvedores', description: 'APIs, webhooks e conectores.', icon: Code2 },
  analytics_licensing: { title: 'Analytics e Licenciamento', description: 'Qualidade, uso e módulos.', icon: BarChart3 },
}

const SETTINGS_GROUPS = [
  { key: 'access', title: 'Organização e acesso', description: 'Pessoas, papéis e estrutura', icon: Users, categories: ['organization'] },
  { key: 'service', title: 'Práticas de serviço', description: 'Catálogos, SLA e mudanças', icon: Workflow, categories: ['service_management', 'sla_contracts'] },
  { key: 'experience', title: 'Experiência e conhecimento', description: 'Portal, marca, KB e agente', icon: Palette, categories: ['knowledge_ai', 'portal_brand'] },
  { key: 'operations', title: 'Operações e canais', description: 'Comunicação, rotas e notificações', icon: Network, categories: ['channels'] },
  { key: 'data', title: 'Dados e integrações', description: 'CMDB, API e automação externa', icon: Boxes, categories: ['cmdb', 'integrations'] },
  { key: 'governance', title: 'Governança da plataforma', description: 'Segurança, analytics e licenças', icon: ShieldCheck, categories: ['security', 'analytics_licensing'] },
] as const

const section = (
  key: string, category: SettingsCategoryKey, title: string, description: string,
  capabilities: string[], options: Partial<SettingsSection> = {},
): SettingsSection => ({
  key, category, title, description, capabilities,
  keywords: [key, title, description],
  status: 'enabled',
  entitlementKey: 'core',
  ...options,
})

const SECTIONS: SettingsSection[] = [
  section('departments', 'organization', 'Departamentos e localidades', 'Hierarquia, gestores e localidades.', ['Departamentos', 'Visibilidade por grupo', 'Estrutura ESM'], { legacyTab: 'departments' }),
  section('users', 'organization', 'Usuários e RBAC', 'Papéis e acesso do tenant.', ['Administrador do tenant', 'Papéis operacionais', 'Isolamento'], { legacyTab: 'users' }),
  section('groups', 'organization', 'Equipes solucionadoras', 'Grupos, membros e filas.', ['Filas', 'Membros', 'Roteamento'], { legacyTab: 'groups' }),
  section('login_integration', 'organization', 'Integração de Login', 'SSO Microsoft/Google, domínios e política de acesso.', ['Microsoft Entra ID', 'Google Workspace', 'JIT end_user', 'SSO obrigatório']),
  section('domains', 'service_management', 'Domínios de serviço', 'TI, RH, Jurídico e Facilities.', ['Caso unificado', 'Domínios privados', 'Tipos configuráveis'], { entitlementKey: 'esm' }),
  section('incident_catalog', 'service_management', 'Catálogo de incidentes', 'Categorias, serviços e sintomas.', ['Três níveis', 'SLA por item', 'Grupo solucionador'], { legacyTab: 'catalog_incidents', entitlementKey: 'itsm' }),
  section('request_catalog', 'service_management', 'Catálogo de requisições', 'Itens, aprovações e entrega.', ['Hierarquia', 'Formulários', 'Aprovações'], { legacyTab: 'catalog_requests', entitlementKey: 'itsm' }),
  section('change_cab', 'service_management', 'Comitê de Mudanças (CAB)', 'Membros permanentes e aprovação padrão.', ['Aprovadores padrão', 'Janelas restritas', 'Notificações'], { legacyTab: 'change_cab', entitlementKey: 'itsm' }),
  section('forms', 'service_management', 'Biblioteca de formulários', 'Formulários reutilizáveis.', ['Schemas', 'Campos condicionais', 'Validação'], { legacyTab: 'form_templates' }),
  section('automation', 'service_management', 'Motor de Automação', 'Gatilhos, condições e ações.', ['Simulação', 'Histórico', 'Escalonamento'], { appView: 'workflow_builder', entitlementKey: 'automation' }),
  section('macros', 'service_management', 'Macros e taxonomias', 'Respostas, códigos, estados e tags.', ['Macros públicas e internas', 'Códigos de resolução', 'Tags']),
  section('sla', 'sla_contracts', 'Políticas de SLA', 'Prazos, calendários e feriados.', ['Resposta e resolução', 'Calendários úteis', 'Feriados'], { legacyTab: 'policies', entitlementKey: 'itsm' }),
  section('pending', 'sla_contracts', 'Motivos de pausa', 'Pausas auditáveis do SLA.', ['Pausa governada', 'Ação do cliente', 'Ledger'], { legacyTab: 'pending_reasons', entitlementKey: 'itsm' }),
  section('contracts', 'sla_contracts', 'Contratos e fornecedores', 'Contratos, OLA e direitos.', ['Contratos por serviço', 'OLA/UC', 'Entitlements'], { status: 'locked', entitlementKey: 'contracts' }),
  section('connections', 'channels', 'Conexões omnichannel', 'Microsoft, Google, WhatsApp e SMTP.', ['Canais próprios/compartilhados', 'Segredos write-only', 'Diagnóstico'], { entitlementKey: 'omnichannel' }),
  section('smtp', 'channels', 'Configurações de E-mail', 'Servidor de envio por tenant.', ['TLS, SSL e conexão sem criptografia', 'Remetente configurável', 'Senha protegida'], { entitlementKey: 'omnichannel' }),
  section('routing', 'channels', 'Rotas e filas', 'Identificação, destinatários e fallback.', ['Roteamento', 'Fila ambígua MSP', 'Idempotência'], { entitlementKey: 'omnichannel' }),
  section('templates', 'channels', 'Templates e notificações', 'Mensagens por evento, canal e idioma.', ['Variáveis', 'Políticas de envio', 'Entrega'], { entitlementKey: 'omnichannel' }),
  section('knowledge', 'knowledge_ai', 'Base de conhecimento', 'Artigos, revisão e publicação.', ['Publicação', 'Feedback', 'Uso pelo agente'], { entitlementKey: 'knowledge' }),
  section('virtual_agent', 'knowledge_ai', 'Agente virtual', 'Ações, confiança e handoff.', ['Ações controladas', 'Confirmação', 'Transferência'], { entitlementKey: 'virtual_agent' }),
  section('ci', 'cmdb', 'Itens de configuração', 'Classes, ativos e ciclo de vida.', ['Manual', 'CSV/API', 'Relacionamentos'], { entitlementKey: 'cmdb' }),
  section('discovery', 'cmdb', 'Descoberta e reconciliação', 'Intune, Entra, AD e Google.', ['Precedência', 'Deduplicação', 'Agente local'], { status: 'locked', entitlementKey: 'cmdb_discovery' }),
  section('branding', 'portal_brand', 'Identidade e portal', 'Marca, temas e pré-visualização.', ['White-label', 'Temas', 'Preview']),
  section('compliance', 'security', 'LGPD e retenção', 'Retenção, anonimização e auditoria.', ['Políticas', 'Direitos do titular', 'Auditoria'], { entitlementKey: 'compliance' }),
  section('developer', 'integrations', 'API e webhooks', 'Documentação, escopos e diagnóstico.', ['API pública', 'Webhooks', 'Escopos'], { appView: 'api_docs', entitlementKey: 'api' }),
  section('analytics', 'analytics_licensing', 'Uso e qualidade', 'CSAT, canais e capacidade.', ['CSAT', 'Desempenho', 'Capacidade'], { appView: 'flowfy_bi', entitlementKey: 'analytics' }),
  section('licensing', 'analytics_licensing', 'Módulos contratados', 'Plano, limites e habilitação.', ['Entitlements', 'Trials', 'Overrides auditados']),
]

const storageList = (key: string): string[] => {
  try { return JSON.parse(localStorage.getItem(key) || '[]') as string[] } catch { return [] }
}

// SETTINGS_CENTER_COMPONENT
export default function SettingsCenter({ companyId, activeRole, onNavigate }: Props) {
  const { companies } = useAppData()
  const isSysAdmin = activeRole === 'sysadmin'
  const [targetCompanyId, setTargetCompanyId] = useState(isSysAdmin ? '' : companyId)
  const [query, setQuery] = useState('')
  const [activeGroup, setActiveGroup] = useState<(typeof SETTINGS_GROUPS)[number]['key']>('access')
  const [selected, setSelected] = useState<SettingsSection | null>(null)
  const [favorites, setFavorites] = useState<string[]>(() => storageList('servicefy.settings.favorites'))
  const [recent, setRecent] = useState<string[]>(() => storageList('servicefy.settings.recent'))
  const [entitlements, setEntitlements] = useState<Record<string, boolean>>({})
  const [connections, setConnections] = useState<Array<{ id: string; status: string; rotationRequired: boolean }>>([])

  useEffect(() => {
    let cancelled = false
    platformAdminService.getSettingsOverview(targetCompanyId)
      .then(overview => {
        if (cancelled) return
        setEntitlements(Object.fromEntries(overview.entitlements.map(item => [item.module_key, item.enabled])))
        setConnections(overview.connections.map(item => ({ id: item.id, status: item.status, rotationRequired: item.rotationRequired })))
      })
      .catch(error => console.warn('[settings-overview]', error))
    return () => { cancelled = true }
  }, [targetCompanyId])

  const effectiveSections = useMemo(() => SECTIONS.map(item => {
    const enabled = entitlements[item.entitlementKey]
    return enabled === undefined ? item : { ...item, status: enabled ? 'enabled' as const : 'locked' as const }
  }), [entitlements])


  const visibleSections = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('pt-BR')
    return needle ? effectiveSections.filter(item =>
      [item.title, item.description, ...item.capabilities, ...item.keywords].join(' ').toLocaleLowerCase('pt-BR').includes(needle),
    ) : effectiveSections
  }, [effectiveSections, query])

  if (!isAdminRole(activeRole)) return (
    <div className="m-8 rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
      <Lock className="mx-auto mb-3 text-red-500" />
      <h2 className="font-extrabold text-red-800">Acesso restrito</h2>
      <p className="mt-2 text-sm text-red-700">{ADMIN_ACCESS_DENIED_MESSAGE}</p>
    </div>
  )

  if (!targetCompanyId) return (
    <div className="max-w-3xl mx-auto p-8"><div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <Building2 className="w-10 h-10 text-indigo-600 mb-4" />
      <h1 className="text-2xl font-black text-slate-900">Selecione o tenant</h1>
      <p className="text-sm text-slate-500 mt-2 mb-6">O contexto explícito é obrigatório antes de qualquer operação administrativa.</p>
      <select value={targetCompanyId} onChange={event => setTargetCompanyId(event.target.value)} className="w-full rounded-xl border border-slate-300 px-4 py-3 bg-white">
        <option value="">Escolha uma empresa…</option>
        {companies.filter(company => company.active).map(company => <option key={company.id} value={company.id}>{company.name} · {company.domain}</option>)}
      </select>
    </div></div>
  )

  const openSection = (item: SettingsSection) => {
    if (item.appView) return onNavigate(item.appView)
    const next = [item.key, ...recent.filter(key => key !== item.key)].slice(0, 6)
    setRecent(next)
    localStorage.setItem('servicefy.settings.recent', JSON.stringify(next))
    setSelected(item)
  }

  const toggleFavorite = (key: string) => {
    const next = favorites.includes(key) ? favorites.filter(item => item !== key) : [...favorites, key]
    setFavorites(next)
    localStorage.setItem('servicefy.settings.favorites', JSON.stringify(next))
  }

  if (selected?.key === 'connections') return (
    <ChannelConnectionsSettings
      companyId={targetCompanyId}
      activeRole={activeRole}
      onBack={() => setSelected(null)}
    />
  )

  if (selected?.key === 'knowledge') return (
    <KnowledgeAdmin
      companyId={targetCompanyId}
      activeRole={activeRole}
      onBack={() => setSelected(null)}
    />
  )

  if (selected?.key === 'routing') return (
    <ChannelRoutingSettings
      companyId={targetCompanyId}
      activeRole={activeRole}
      onBack={() => setSelected(null)}
    />
  )

  if (selected?.key === 'virtual_agent') return (
    <VirtualAgentAdmin
      companyId={targetCompanyId}
      activeRole={activeRole}
      onBack={() => setSelected(null)}
    />
  )

  if (selected?.key === 'login_integration') return (
    <LoginIntegrationSettings
      companyId={targetCompanyId}
      onBack={() => setSelected(null)}
    />
  )

  if (selected && ['domains', 'macros', 'templates', 'ci', 'compliance', 'licensing', 'branding', 'smtp'].includes(selected.key)) return (
    <PlatformModuleSettings
      moduleKey={selected.key as OperationalModuleKey}
      companyId={targetCompanyId}
      activeRole={activeRole}
      onBack={() => setSelected(null)}
    />
  )

  if (selected?.legacyTab) return (
    <SettingsPageShell
      title={selected.title}
      description={selected.description}
      scopeLabel={companies.find(company => company.id === targetCompanyId)?.name ?? 'Tenant selecionado'}
      onBack={() => setSelected(null)}
      status={<span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Ativo</span>}
    >
      <div className="pb-8">
        <SettingsGovernance key={selected.key + targetCompanyId} companyId={targetCompanyId} activeRole={activeRole} startInDetails embedded initialTab={selected.legacyTab as GovTab} />
      </div>
    </SettingsPageShell>
  )

  if (selected) return (
    <SettingsPageShell
      title={selected.title}
      description={selected.description}
      scopeLabel={companies.find(company => company.id === targetCompanyId)?.name ?? 'Tenant selecionado'}
      onBack={() => setSelected(null)}
      status={selected.status === 'locked'
        ? <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700"><Lock className="h-3.5 w-3.5" /> Módulo não contratado</span>
        : <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">Ativo</span>}
    >
      <section className="max-w-4xl rounded-xl border border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <p className="text-sm font-semibold text-slate-900">{CATEGORY_META[selected.category].title}</p>
          <p className="mt-1 text-sm text-slate-500">Capacidades incluídas neste módulo.</p>
        </div>
        <div className="divide-y divide-slate-100 px-5">{selected.capabilities.map(item =>
          <div key={item} className="flex min-h-12 items-center gap-3 py-3 text-sm font-medium text-slate-700"><FileCheck2 className="h-4 w-4 text-emerald-600" />{item}</div>,
        )}</div>
        <div className="border-t border-slate-200 p-5">
          {selected.status === 'locked'
            ? <button className="min-h-10 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800">Solicitar habilitação</button>
            : <p className="text-sm font-medium text-emerald-700">Módulo disponível para este tenant.</p>}
        </div>
      </section>
    </SettingsPageShell>
  )

  const activeGroupMeta = SETTINGS_GROUPS.find(group => group.key === activeGroup) ?? SETTINGS_GROUPS[0]
  const quickAccess = [...new Set([...favorites, ...recent])]
    .map(key => effectiveSections.find(item => item.key === key))
    .filter((item): item is SettingsSection => Boolean(item))
    .slice(0, 5)

  return (
    <div className="h-full overflow-y-auto bg-background p-4 sm:p-6 lg:p-8"><div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-outline-variant pb-6">
        <div><h1 className="text-2xl font-bold text-on-surface">Central de Configurações</h1><p className="mt-1 max-w-2xl text-sm text-on-surface-variant">Encontre uma capacidade, revise o estado do tenant e continue de onde parou.</p></div>
        {isSysAdmin && <label className="text-xs font-semibold text-on-surface-variant">Tenant<select value={targetCompanyId} onChange={event => setTargetCompanyId(event.target.value)} className="mt-1 block rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm font-semibold text-on-surface">{companies.filter(company => company.active).map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>}
      </header>
      <div className="relative mt-6"><Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar usuários, SLA, WhatsApp, CMDB ou LGPD" className="w-full rounded-xl border border-outline-variant bg-surface py-3 pl-12 pr-4 text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></div>
      {connections.some(item => item.rotationRequired) && (
        <button type="button" onClick={() => openSection(effectiveSections.find(item => item.key === 'connections')!)} className="mt-4 flex w-full items-center justify-between gap-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-left text-sm text-amber-900">
          <span><strong>Credenciais aguardando rotação.</strong> Revise as conexões antes que os canais sejam interrompidos.</span>
          <span className="shrink-0 font-semibold">Revisar canais</span>
        </button>
      )}
      {quickAccess.length > 0 && !query && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant">
          <Activity className="w-4 h-4" /><b>Acesso rápido:</b>
          {quickAccess.map(item => <button key={item.key} onClick={() => openSection(item)} className="rounded-lg border border-outline-variant bg-surface px-3 py-2 font-semibold hover:bg-surface-container">{item.title}</button>)}
        </div>
      )}
      <div className="mt-7 grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav className="h-fit rounded-xl border border-outline-variant bg-surface p-2" aria-label="Grupos de configuração">
          {SETTINGS_GROUPS.map(group => {
            const GroupIcon = group.icon
            const count = effectiveSections.filter(item => (group.categories as readonly string[]).includes(item.category)).length
            return (
              <button
                key={group.key}
                type="button"
                onClick={() => { setActiveGroup(group.key); setQuery('') }}
                className={`flex w-full items-start gap-3 rounded-lg px-3 py-3 text-left transition-colors ${activeGroup === group.key && !query ? 'bg-primary text-on-primary' : 'text-on-surface hover:bg-surface-container'}`}
              >
                <GroupIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold">{group.title}</span>
                  <span className={`mt-0.5 block text-xs ${activeGroup === group.key && !query ? 'text-on-primary/75' : 'text-on-surface-variant'}`}>{group.description}</span>
                </span>
                <span className="text-xs tabular-nums opacity-70">{count}</span>
              </button>
            )
          })}
        </nav>
        <main className="min-w-0">
          <div className="mb-4">
            <p className="text-xs font-semibold text-primary">{query ? 'Resultados da busca' : 'Configurações'}</p>
            <h2 className="mt-1 text-xl font-bold text-on-surface">{query ? `${visibleSections.length} opções encontradas` : activeGroupMeta.title}</h2>
            <p className="mt-1 text-sm text-on-surface-variant">{query ? `Resultados para “${query}” em toda a plataforma.` : activeGroupMeta.description}</p>
          </div>
          <div className="overflow-hidden rounded-xl border border-outline-variant bg-surface">
            {(Object.keys(CATEGORY_META) as SettingsCategoryKey[]).map(categoryKey => {
              if (!query && !(activeGroupMeta.categories as readonly string[]).includes(categoryKey)) return null
              const items = visibleSections.filter(item => item.category === categoryKey)
              if (!items.length) return null
              const meta = CATEGORY_META[categoryKey]
              const Icon = meta.icon
              return <section key={categoryKey} className="border-b border-outline-variant last:border-b-0">
                <div className="flex items-center gap-3 bg-surface-container px-4 py-3 sm:px-5"><Icon className="h-4 w-4 text-primary" /><div><h3 className="text-sm font-bold text-on-surface">{meta.title}</h3><p className="text-xs text-on-surface-variant">{meta.description}</p></div></div>
                <div className="divide-y divide-outline-variant">{items.map(item =>
                  <article key={item.key} className="group flex min-h-16 items-center gap-2 px-3 transition-colors hover:bg-surface-container-low sm:px-4">
                    <button onClick={() => openSection(item)} className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left">
                      <span className="shrink-0">{item.status === 'locked' ? <Lock className="w-4 h-4 text-amber-600" /> : item.status === 'attention' ? <HeartPulse className="w-4 h-4 text-error" /> : <Wrench className="w-4 h-4 text-on-surface-variant" />}</span>
                      <span className="min-w-0"><span className="block text-sm font-semibold text-on-surface">{item.title}</span><span className="mt-0.5 block text-xs text-on-surface-variant">{item.description}</span></span>
                    </button>
                    <button onClick={() => toggleFavorite(item.key)} aria-label={`${favorites.includes(item.key) ? 'Remover dos favoritos' : 'Adicionar aos favoritos'}: ${item.title}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-on-surface-variant hover:bg-surface-container-high"><Star className={'w-4 h-4 ' + (favorites.includes(item.key) ? 'fill-amber-400 text-amber-500' : '')} /></button>
                  </article>,
                )}</div>
              </section>
            })}
          </div>
        </main>
      </div>
    </div></div>
  )
}
