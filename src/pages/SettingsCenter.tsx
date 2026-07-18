import { useEffect, useMemo, useState } from 'react'
import {
  Activity, BarChart3, Bot, Boxes, Building2, ChevronLeft, Code2, FileCheck2,
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
      [item.title, item.description, ...item.keywords].join(' ').toLocaleLowerCase('pt-BR').includes(needle),
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
    <div className="min-h-full bg-slate-50">
      <button onClick={() => setSelected(null)} className="m-5 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold">
        <ChevronLeft className="w-4 h-4" /> Central de Configurações
      </button>
      <SettingsGovernance key={selected.key + targetCompanyId} companyId={targetCompanyId} activeRole={activeRole} startInDetails initialTab={selected.legacyTab as GovTab} />
    </div>
  )

  if (selected) return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <button onClick={() => setSelected(null)} className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm font-semibold text-on-surface-variant hover:bg-surface-container"><ChevronLeft className="w-4 h-4" /> Central de Configurações</button>
      <div className="rounded-xl border border-outline-variant bg-surface p-5 sm:p-8">
        <div className="flex flex-col items-start justify-between gap-5 sm:flex-row">
          <div><p className="text-sm font-semibold text-primary">{CATEGORY_META[selected.category].title}</p><h1 className="mt-1 text-2xl font-bold text-on-surface">{selected.title}</h1><p className="mt-2 max-w-2xl text-sm text-on-surface-variant">{selected.description}</p></div>
          {selected.status === 'locked' && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-700"><Lock className="w-3.5 h-3.5" /> Módulo não contratado</span>}
        </div>
        <div className="mt-7 divide-y divide-outline-variant border-y border-outline-variant">{selected.capabilities.map(item =>
          <div key={item} className="flex min-h-12 items-center gap-3 py-3 text-sm font-semibold text-on-surface"><FileCheck2 className="w-4 h-4 text-resolved" />{item}</div>,
        )}</div>
        {selected.status === 'locked'
          ? <button className="mt-7 rounded-lg bg-on-surface px-5 py-3 text-sm font-bold text-surface">Solicitar habilitação</button>
          : <div className="mt-7 rounded-lg bg-resolved-bg p-4 text-sm font-semibold text-resolved-fg">Módulo disponível para este tenant.</div>}
      </div>
    </div>
  )

  return (
    <div className="h-full overflow-y-auto bg-background p-4 sm:p-6 lg:p-8"><div className="mx-auto max-w-6xl">
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-outline-variant pb-6">
        <div><h1 className="text-2xl font-bold text-on-surface">Central de Configurações</h1><p className="mt-1 max-w-2xl text-sm text-on-surface-variant">Encontre uma capacidade, revise o estado do tenant e continue de onde parou.</p></div>
        {isSysAdmin && <label className="text-xs font-semibold text-on-surface-variant">Tenant<select value={targetCompanyId} onChange={event => setTargetCompanyId(event.target.value)} className="mt-1 block rounded-lg border border-outline-variant bg-surface px-3 py-2 text-sm font-semibold text-on-surface">{companies.filter(company => company.active).map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>}
      </header>
      <div className="relative mt-6"><Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-on-surface-variant" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar usuários, SLA, WhatsApp, CMDB ou LGPD" className="w-full rounded-xl border border-outline-variant bg-surface py-3 pl-12 pr-4 text-sm text-on-surface outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" /></div>
      {connections.length > 0 && <div className="mt-3 flex flex-wrap gap-2 text-xs font-bold"><span className="rounded-full bg-emerald-50 px-3 py-1.5 text-emerald-700">{connections.filter(item => item.status === 'healthy').length} canais saudáveis</span>{connections.some(item => item.rotationRequired) && <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-700">Credenciais aguardando rotação</span>}</div>}
      {recent.length > 0 && !query && <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-on-surface-variant"><Activity className="w-4 h-4" /><b>Recentes:</b>{recent.map(key => { const item = SECTIONS.find(candidate => candidate.key === key); return item && <button key={key} onClick={() => openSection(item)} className="rounded-full bg-surface-container px-3 py-2 font-semibold hover:bg-surface-container-high">{item.title}</button> })}</div>}
      <div className="mt-7 space-y-6">
        {(Object.keys(CATEGORY_META) as SettingsCategoryKey[]).map(categoryKey => {
          const items = visibleSections.filter(item => item.category === categoryKey)
          if (!items.length) return null
          const meta = CATEGORY_META[categoryKey]
          const Icon = meta.icon
          return <section key={categoryKey} className="overflow-hidden rounded-xl border border-outline-variant bg-surface">
            <div className="flex items-center gap-3 bg-surface-container px-4 py-3 sm:px-5"><span className="text-primary"><Icon className="w-5 h-5" /></span><div><h2 className="text-sm font-bold text-on-surface">{meta.title}</h2><p className="text-xs text-on-surface-variant">{meta.description}</p></div></div>
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
    </div></div>
  )
}
