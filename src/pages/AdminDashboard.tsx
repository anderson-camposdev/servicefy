import { useState, useMemo, useEffect, useCallback } from 'react'
import { Plus, UserPlus, Settings, Edit2, X, Upload, Image as ImageIcon, LayoutTemplate, ExternalLink, KeyRound, Search } from 'lucide-react'
import type { Company, Role } from '../types'
import { useAppData } from '../hooks/useDbData'
import { companiesService, profilesService, assignmentGroupsService } from '../lib/services'
import type { ProfileRow, AssignmentGroupRow, CompanyRow } from '../lib/database.types'
import { useToast } from '../context'

// Fase 27: roles reais do enum user_role no banco — {sysadmin, company_admin,
// agent, end_user}. As opções extras que existiam aqui antes (technician,
// area_manager, it_manager, client_manager, cio) não existem no enum e
// quebravam com um erro cru de cast do Postgres ao tentar salvar.
// Migration 131 adicionou ops_manager/governance_manager ao enum real —
// diferente dos papéis acima, esses dois são de fato persistíveis.
const REAL_ROLE_OPTIONS: { value: Role; label: string; help: string }[] = [
  { value: 'end_user', label: 'Usuário final', help: 'Abre e acompanha os próprios chamados no portal. Não acessa a área de atendimento.' },
  { value: 'agent', label: 'Analista', help: 'Atende e resolve os chamados atribuídos a ele.' },
  { value: 'ops_manager', label: 'Gestor de operações', help: 'Além de atender, gerencia filas, aprova mudanças e acompanha SLAs de toda a empresa.' },
  { value: 'governance_manager', label: 'Gestor de governança', help: 'Mesmo acesso do Gestor de operações, mais controle sobre conteúdo restrito e políticas.' },
  { value: 'company_admin', label: 'Administrador da empresa', help: 'Controla toda a configuração desta empresa, incluindo usuários e permissões.' },
  { value: 'sysadmin', label: 'Administrador do ServiceFY', help: 'Acesso total, inclusive a outras empresas atendidas pelo provedor. Uso restrito ao suporte do ServiceFY.' },
]
// Fase 27: roles que consomem uma licença de analista (seat) — mesma lista
// usada pelo trigger tg_enforce_analyst_license_limit no banco.
const LICENSE_CONSUMING_ROLES: Role[] = ['agent', 'company_admin', 'ops_manager', 'governance_manager']

// Fase 27: indicador "Licenças Usadas: X / Y" — cálculo puramente
// derivado dos dados já carregados (rawCompanies/rawProfiles), sem chamada
// de rede extra. O banco (tg_enforce_analyst_license_limit) é sempre a
// fonte de verdade real; este indicador é só uma prévia visual.
function LicenseUsageBadge({ companyId, rawCompanies, rawProfiles }: {
  companyId: string
  rawCompanies: CompanyRow[]
  rawProfiles: ProfileRow[]
}) {
  const limit = rawCompanies.find(c => c.id === companyId)?.max_analysts_licenses ?? 3
  const used = rawProfiles.filter(p =>
    p.company_id === companyId && p.active && LICENSE_CONSUMING_ROLES.includes(p.role as Role)
  ).length
  const pct = limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100
  const atOrOverLimit = used >= limit
  const barColor = atOrOverLimit ? 'bg-red-500' : pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'

  return (
    <div className="mb-4 rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className="flex items-center justify-between mb-1.5">
        <span className="flex items-center gap-1.5 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
          <KeyRound className="w-3 h-3" /> Licenças de Analista
        </span>
        <span className={`text-xs font-black ${atOrOverLimit ? 'text-red-600' : 'text-slate-700'}`}>{used} / {limit}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-slate-200 overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      {atOrOverLimit && (
        <p className="mt-1.5 text-[10px] font-semibold text-red-600">Limite atingido — desative um usuário ou amplie o plano para adicionar mais analistas.</p>
      )}
    </div>
  )
}
import { setTenantOverride } from '../tenant/resolveTenant'
import CatalogManager from './CatalogManager'
import DepartmentManager from './DepartmentManager'

interface AssignmentGroupsAdminProps {
  currentCompany: Company
  rawProfiles: ProfileRow[]
}

function AssignmentGroupsAdmin({ currentCompany, rawProfiles }: AssignmentGroupsAdminProps) {
  const [groups, setGroups] = useState<AssignmentGroupRow[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGroup, setSelectedGroup] = useState<AssignmentGroupRow | null>(null)
  const [members, setMembers] = useState<ProfileRow[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)

  // Form for new group
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDesc, setNewGroupDesc] = useState('')
  const [newGroupPrivate, setNewGroupPrivate] = useState(false)
  const [savingGroup, setSavingGroup] = useState(false)
  const [showGroupForm, setShowGroupForm] = useState(false)
  const [groupQuery, setGroupQuery] = useState('')

  // Select analyst to add
  const [selectedAnalystId, setSelectedAnalystId] = useState('')
  const [addingMember, setAddingMember] = useState(false)

  // Edit selected group's name/description (privacidade e status já têm
  // toggle direto na lista — só nome/descrição ficavam sem edição)
  const [editingGroupDetails, setEditingGroupDetails] = useState(false)
  const [groupNameDraft, setGroupNameDraft] = useState('')
  const [groupDescDraft, setGroupDescDraft] = useState('')
  const [savingGroupDetails, setSavingGroupDetails] = useState(false)

  // Fetch groups
  const fetchGroups = useCallback(async () => {
    setLoading(true)
    try {
      const data = await assignmentGroupsService.list(currentCompany.id)
      setGroups(data)
      if (data.length > 0 && !selectedGroup) {
        setSelectedGroup(data[0])
      } else if (selectedGroup) {
        const updated = data.find(g => g.id === selectedGroup.id)
        if (updated) setSelectedGroup(updated)
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }, [currentCompany.id, selectedGroup])

  useEffect(() => {
    fetchGroups()
  }, [])

  // Fetch members when selectedGroup changes
  useEffect(() => {
    if (!selectedGroup) {
      setMembers([])
      return
    }
    let cancelled = false
    setLoadingMembers(true)
    assignmentGroupsService.listMembers(selectedGroup.id)
      .then(res => {
        if (!cancelled) setMembers(res)
      })
      .catch(console.error)
      .finally(() => {
        if (!cancelled) setLoadingMembers(false)
      })
    return () => { cancelled = true }
  }, [selectedGroup?.id])

  // Handle group creation
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newGroupName.trim()) return
    setSavingGroup(true)
    try {
      const newGrp = await assignmentGroupsService.create({
        companyId: currentCompany.id,
        name: newGroupName.trim(),
        description: newGroupDesc.trim() || undefined,
        isPrivate: newGroupPrivate,
      })
      setNewGroupName('')
      setNewGroupDesc('')
      setNewGroupPrivate(false)
      setShowGroupForm(false)
      alert('Equipe solucionadora criada com sucesso!')

      const data = await assignmentGroupsService.list(currentCompany.id)
      setGroups(data)
      const found = data.find(g => g.id === newGrp.id)
      if (found) setSelectedGroup(found)
    } catch (err: any) {
      alert('Erro ao criar equipe: ' + err.message)
    } finally {
      setSavingGroup(false)
    }
  }

  // Handle group toggle is_active
  const handleToggleActive = async (group: AssignmentGroupRow) => {
    try {
      const updated = await assignmentGroupsService.update(group.id, { is_active: !group.is_active })
      setGroups(prev => prev.map(g => g.id === group.id ? updated : g))
      if (selectedGroup?.id === group.id) {
        setSelectedGroup(updated)
      }
    } catch (err: any) {
      alert('Erro ao atualizar status do grupo: ' + err.message)
    }
  }

  // Grupo privado: tickets atribuídos só ficam visíveis para membros do
  // grupo + ops_manager/governance_manager/admin (RLS can_read_ticket,
  // migration 134). Analistas de fora deixam de ver esses tickets.
  const handleTogglePrivate = async (group: AssignmentGroupRow) => {
    try {
      const updated = await assignmentGroupsService.update(group.id, { is_private: !group.is_private })
      setGroups(prev => prev.map(g => g.id === group.id ? updated : g))
      if (selectedGroup?.id === group.id) {
        setSelectedGroup(updated)
      }
    } catch (err: any) {
      alert('Erro ao atualizar privacidade do grupo: ' + err.message)
    }
  }

  const startEditGroupDetails = () => {
    if (!selectedGroup) return
    setGroupNameDraft(selectedGroup.name)
    setGroupDescDraft(selectedGroup.description ?? '')
    setEditingGroupDetails(true)
  }

  const handleSaveGroupDetails = async () => {
    if (!selectedGroup || !groupNameDraft.trim()) return
    setSavingGroupDetails(true)
    try {
      const updated = await assignmentGroupsService.update(selectedGroup.id, {
        name: groupNameDraft.trim(),
        description: groupDescDraft.trim() || null,
      })
      setGroups(prev => prev.map(g => g.id === updated.id ? updated : g))
      setSelectedGroup(updated)
      setEditingGroupDetails(false)
    } catch (err: any) {
      alert('Erro ao atualizar equipe: ' + err.message)
    } finally {
      setSavingGroupDetails(false)
    }
  }

  // Handle member addition
  const handleAddMember = async () => {
    if (!selectedGroup || !selectedAnalystId) return
    setAddingMember(true)
    try {
      await assignmentGroupsService.addMember(selectedGroup.id, selectedAnalystId)
      const updatedMembers = await assignmentGroupsService.listMembers(selectedGroup.id)
      setMembers(updatedMembers)
      setSelectedAnalystId('')
    } catch (err: any) {
      alert('Erro ao vincular analista: ' + err.message)
    } finally {
      setAddingMember(false)
    }
  }

  // Handle member removal
  const handleRemoveMember = async (userId: string) => {
    if (!selectedGroup) return
    try {
      await assignmentGroupsService.removeMember(selectedGroup.id, userId)
      const updatedMembers = await assignmentGroupsService.listMembers(selectedGroup.id)
      setMembers(updatedMembers)
    } catch (err: any) {
      alert('Erro ao desvincular analista: ' + err.message)
    }
  }

  const companyProfiles = useMemo(() => {
    return rawProfiles.filter(p => p.company_id === currentCompany.id && p.active && p.role !== 'end_user')
  }, [rawProfiles, currentCompany.id])

  const availableAnalysts = useMemo(() => {
    const memberIds = new Set(members.map(m => m.id))
    return companyProfiles.filter(p => !memberIds.has(p.id))
  }, [companyProfiles, members])

  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="min-w-0 space-y-5">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="flex flex-col gap-4 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div>
              <h2 className="text-base font-bold text-slate-950">Equipes solucionadoras</h2>
              <p className="mt-1 text-sm text-slate-500">Organize filas, privacidade e responsáveis pelo atendimento.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowGroupForm(value => !value)}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
            >
              {showGroupForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showGroupForm ? 'Fechar cadastro' : 'Nova equipe'}
            </button>
          </div>
          <div className="border-b border-slate-100 p-4 sm:p-5">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={groupQuery}
                onChange={event => setGroupQuery(event.target.value)}
                placeholder="Buscar equipe por nome ou responsabilidade"
                className="min-h-10 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </label>
          </div>
          {loading ? (
            <div className="text-sm text-slate-400 animate-pulse text-center py-6">Carregando equipes...</div>
          ) : groups.length === 0 ? (
            <div className="text-sm text-slate-400 text-center py-6">Nenhuma equipe cadastrada.</div>
          ) : (
            <div className="divide-y divide-slate-100 overflow-y-auto max-h-[400px]">
              {groups.filter(group => {
                const needle = groupQuery.trim().toLocaleLowerCase('pt-BR')
                return !needle || [group.name, group.description].join(' ').toLocaleLowerCase('pt-BR').includes(needle)
              }).map(g => (
                <div
                  key={g.id}
                  onClick={() => { setSelectedGroup(g); setEditingGroupDetails(false) }}
                  className={`flex cursor-pointer flex-col gap-3 p-4 transition-colors sm:flex-row sm:items-center sm:justify-between sm:px-5 ${selectedGroup?.id === g.id ? 'bg-indigo-50/60' : 'hover:bg-slate-50'}`}
                >
                  <div className="min-w-0">
                    <div className="text-xs font-extrabold text-slate-800 flex items-center gap-2 flex-wrap">
                      <span>{g.name}</span>
                      {!g.is_active && (
                        <span className="bg-red-50 text-red-600 border border-red-200 text-[9px] font-bold px-1.5 py-0.5 rounded">Inativo</span>
                      )}
                      {g.is_private && (
                        <span title="Tickets deste grupo só ficam visíveis para membros + gestores" className="bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-bold px-1.5 py-0.5 rounded">Privado</span>
                      )}
                    </div>
                    {g.description && <div className="text-[10px] text-slate-400 mt-1 truncate">{g.description}</div>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => handleTogglePrivate(g)}
                      title="Tickets deste grupo só ficam visíveis para membros + gestores"
                      className={`text-[10px] px-2.5 py-1 rounded-md font-bold transition-all border shadow-xs cursor-pointer ${
                        g.is_private
                          ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                          : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {g.is_private ? 'Privado' : 'Público'}
                    </button>
                    <button
                      onClick={() => handleToggleActive(g)}
                      className={`text-[10px] px-2.5 py-1 rounded-md font-bold transition-all border shadow-xs cursor-pointer ${g.is_active ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100' : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'}`}
                    >
                      {g.is_active ? 'Desativar' : 'Reativar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {showGroupForm && <section className="rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="text-base font-bold text-slate-950">Nova equipe solucionadora</h2>
          <p className="mb-4 mt-1 text-sm text-slate-500">Defina a responsabilidade e o nível de visibilidade da fila.</p>
          <form onSubmit={handleCreateGroup} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nome da Equipe</label>
              <input
                required
                type="text"
                value={newGroupName}
                onChange={e => setNewGroupName(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="Ex: Nível 1 - Suporte, Redes, Segurança"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Descrição</label>
              <textarea
                value={newGroupDesc}
                onChange={e => setNewGroupDesc(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-xs text-slate-700 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                rows={2}
                placeholder="Descrição resumida das responsabilidades do grupo..."
              />
            </div>
            <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={newGroupPrivate}
                onChange={e => setNewGroupPrivate(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-xs text-slate-600">
                <span className="font-bold text-slate-700">Grupo privado</span>
                <br />
                <span className="text-[10px] text-slate-400">Tickets atribuídos a este grupo só ficam visíveis para membros dele, além de gestores de operação, gestores de governança e administradores. Use para equipes como RH ou Financeiro.</span>
              </span>
            </label>
            <button
              type="submit"
              disabled={savingGroup || !newGroupName.trim()}
              className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs disabled:opacity-50 transition-colors cursor-pointer"
            >
              {savingGroup ? 'Criando...' : 'Criar Equipe'}
            </button>
          </form>
        </section>}
      </div>

      <aside className="flex h-full min-h-[400px] flex-col rounded-xl border border-slate-200 bg-white p-5">
        {selectedGroup ? (
          <>
            <div className="border-b border-slate-100 pb-3 mb-4">
              {editingGroupDetails ? (
                <div className="space-y-2">
                  <input
                    type="text"
                    value={groupNameDraft}
                    onChange={e => setGroupNameDraft(e.target.value)}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Nome da equipe"
                  />
                  <textarea
                    value={groupDescDraft}
                    onChange={e => setGroupDescDraft(e.target.value)}
                    rows={2}
                    className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-600 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="Descrição"
                  />
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void handleSaveGroupDetails()} disabled={savingGroupDetails || !groupNameDraft.trim()} className="rounded-lg bg-slate-950 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-slate-800 disabled:opacity-50">{savingGroupDetails ? 'Salvando...' : 'Salvar'}</button>
                    <button type="button" onClick={() => setEditingGroupDetails(false)} className="rounded-lg border px-3 py-1.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-slate-800 font-bold text-sm uppercase tracking-widest">Membros de {selectedGroup.name}</h3>
                    <p className="text-[10px] text-slate-400 mt-0.5">Gerencie os analistas associados a esta equipe</p>
                  </div>
                  <button type="button" onClick={startEditGroupDetails} title="Editar nome e descrição" aria-label="Editar nome e descrição da equipe" className="rounded-lg border p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-900"><Edit2 className="w-4 h-4" /></button>
                </div>
              )}
            </div>

            <div className="mb-6 bg-slate-50 border border-slate-100 rounded-xl p-3.5 space-y-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                <UserPlus className="w-3.5 h-3.5 text-indigo-600" /> Vincular Analista à Equipe
              </h4>
              <div className="flex gap-2">
                <select
                  value={selectedAnalystId}
                  onChange={e => setSelectedAnalystId(e.target.value)}
                  className="flex-1 border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-700 bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                >
                  <option value="">Selecione um analista...</option>
                  {availableAnalysts.map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.role})</option>
                  ))}
                </select>
                <button
                  onClick={handleAddMember}
                  disabled={addingMember || !selectedAnalystId}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg disabled:opacity-50 cursor-pointer transition-colors"
                >
                  {addingMember ? 'Vinculando...' : 'Vincular'}
                </button>
              </div>
            </div>

            {loadingMembers ? (
              <div className="text-xs text-slate-400 animate-pulse text-center py-6">Carregando analistas da equipe...</div>
            ) : members.length === 0 ? (
              <div className="text-xs text-slate-400 text-center py-8 italic bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                Nenhum analista vinculado a esta equipe.
              </div>
            ) : (
              <div className="space-y-2 overflow-y-auto max-h-[350px] pr-1">
                {members.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-2.5 bg-slate-50 hover:bg-slate-100/50 border border-slate-100 rounded-xl text-xs transition-colors">
                    <div className="flex items-center gap-2.5">
                      <img src={p.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.name}`} className="w-6 h-6 rounded-full border border-slate-200 bg-white" alt={p.name} />
                      <div>
                        <div className="font-bold text-slate-800">{p.name}</div>
                        <div className="text-[9px] text-slate-400 font-mono mt-0.5">{p.role}</div>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveMember(p.id)}
                      className="text-red-600 hover:text-red-800 font-bold hover:underline cursor-pointer"
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="text-sm text-slate-400 text-center py-12 italic border border-dashed border-slate-200 rounded-2xl">
            Selecione uma equipe na lista para gerenciar seus membros.
          </div>
        )}
      </aside>
    </div>
  )
}

interface AdminDashboardProps {
  refetchAppData?: () => Promise<void>
  currentCompany: Company
  activeTab: string
  activeRole?: string
  setManagedCompanyId?: (id: string) => void
  setActiveTab?: (tab: any) => void
}

export default function AdminDashboard({ refetchAppData, currentCompany, activeTab, activeRole, setManagedCompanyId, setActiveTab }: AdminDashboardProps) {
  const isMspAdmin = activeRole === 'sysadmin'
  const isTenantAdmin = activeRole === 'sysadmin' || activeRole === 'company_admin'
  // Mesma politica de update_profile_secure (migration 151): sysadmin so e
  // concedido por quem ja e admin do provedor; company_admin so por quem ja
  // e admin do tenant (ops_manager/governance_manager nao podem promover
  // ninguem a essas duas roles, so aos papeis operacionais).
  const assignableRoleOptions = REAL_ROLE_OPTIONS.filter(option => {
    if (option.value === 'sysadmin') return isMspAdmin
    if (option.value === 'company_admin') return isTenantAdmin
    return true
  })
  const { toast } = useToast()
  // States for tenant onboarding
  const [tenantName, setTenantName] = useState('')
  const [tenantDomain, setTenantDomain] = useState('')
  const [tenantLogo, setTenantLogo] = useState('')
  const [tenantPrimary, setTenantPrimary] = useState('#2563EB')
  const [tenantAccent, setTenantAccent] = useState('#3B82F6')
  const [tenantBg, _setTenantBg] = useState('#EFF6FF')
  const [tenantWelcomeTitle, _setTenantWelcomeTitle] = useState('Central de Serviços')
  const [tenantWelcomeSubtitle, _setTenantWelcomeSubtitle] = useState('Como podemos te ajudar hoje?')
  const [tenantLocalLogin, _setTenantLocalLogin] = useState(true)
  const [tenantSaving, setTenantSaving] = useState(false)
  // States for tenant edition
  const [editingTenant, setEditingTenant] = useState<CompanyRow | null>(null)
  const [tenantUpdating, setTenantUpdating] = useState(false)
  const [uploadingBg, setUploadingBg] = useState(false)

  // States for user onboarding
  const [usrName, setUsrName] = useState('')
  const [usrEmail, setUsrEmail] = useState('')
  const [usrRole, setUsrRole] = useState<Role>('end_user')
  const [usrDept, setUsrDept] = useState('')
  const [usrManagerId, setUsrManagerId] = useState('')
  const [usrCompanyId, setUsrCompanyId] = useState(currentCompany.id)
  const [usrLocalLogin, setUsrLocalLogin] = useState(true)
  const [usrSaving, setUsrSaving] = useState(false)
  const [showUserForm, setShowUserForm] = useState(false)
  const [userQuery, setUserQuery] = useState('')

  // States for user edition
  const [editingUser, setEditingUser] = useState<ProfileRow | null>(null)
  const [userUpdating, setUserUpdating] = useState(false)

  const { companies: rawCompanies, profiles: rawProfiles } = useAppData()

  const handleSaveTenant = async (e: React.FormEvent) => {
    e.preventDefault()
    setTenantSaving(true)
    try {
      const payload: any = {
        name: tenantName,
        domain: tenantDomain,
        logo_url: tenantLogo || null,
        primary_color: tenantPrimary,
        accent_color: tenantAccent,
        bg_color: tenantBg,
        welcome_title: tenantWelcomeTitle,
        welcome_subtitle: tenantWelcomeSubtitle,
        allow_local_login: tenantLocalLogin,
      }
      await companiesService.create(payload)
      alert('Empresa provisionada com sucesso!')
      setTenantName('')
      setTenantDomain('')
      setTenantLogo('')
      if (refetchAppData) await refetchAppData()
    } catch (err: any) {
      alert('Erro ao criar empresa: ' + err.message)
    } finally {
      setTenantSaving(false)
    }
  }

  const handleUpdateTenant = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingTenant) return
    setTenantUpdating(true)
    try {
      const { id, ...rest } = editingTenant
      await companiesService.update(id, rest)
      alert('Configurações da empresa atualizadas!')
      if (refetchAppData) await refetchAppData()
      setEditingTenant(null)
    } catch (err: any) {
      alert('Erro ao atualizar empresa: ' + err.message)
    } finally {
      setTenantUpdating(false)
    }
  }

  const handleUploadBgImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !editingTenant) return
    setUploadingBg(true)
    try {
      const url = await companiesService.uploadBrandAsset(editingTenant.id, file)
      setEditingTenant({ ...editingTenant, bg_color: `url('${url}') center/cover no-repeat fixed` })
    } catch (err: any) {
      alert('Erro ao fazer upload da imagem de fundo: ' + err.message)
    } finally {
      setUploadingBg(false)
      e.target.value = ''
    }
  }

  const isBreakGlassRole = usrRole === 'sysadmin' || usrRole === 'company_admin'

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setUsrSaving(true)
    try {
      if (isBreakGlassRole && usrLocalLogin) {
        // Quebra-vidro: cria auth.users + profiles já vinculados, com
        // convite por e-mail para a pessoa definir a própria senha — não
        // depende do primeiro login SSO (JIT) para virar uma conta capaz
        // de logar. Ver supabase/functions/admin-create-local-user.
        await profilesService.createLocalAdmin({
          name: usrName,
          email: usrEmail,
          role: usrRole,
          companyId: usrCompanyId,
          department: usrDept || null,
          managerId: usrManagerId || null,
        })
        toast.success('Convite enviado! A pessoa define a própria senha ao acessar o link recebido por e-mail.')
      } else {
        const payload: any = {
          name: usrName,
          email: usrEmail,
          role: usrRole,
          department: usrDept || null,
          company_id: usrCompanyId,
          avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${usrName.split(' ')[0]}`,
          active: true,
          manager_id: usrManagerId || null,
        }
        await profilesService.create(payload)
        toast.success('Usuário cadastrado com sucesso!')
      }
      setUsrName('')
      setUsrEmail('')
      setUsrDept('')
      setUsrManagerId('')
      setShowUserForm(false)
      if (refetchAppData) await refetchAppData()
    } catch (err) {
      // O trigger tg_enforce_analyst_license_limit (Fase 27) já devolve uma
      // mensagem amigável em português quando o limite de licenças é
      // atingido — repassamos exatamente o que o banco disse, sem reescrever.
      toast.error(err instanceof Error ? err.message : 'Erro ao cadastrar usuário.')
    } finally {
      setUsrSaving(false)
    }
  }

  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return
    setUserUpdating(true)
    try {
      await profilesService.update(editingUser.id, {
        name: editingUser.name,
        email: editingUser.email,
        role: editingUser.role,
        department: editingUser.department || null,
      })
      toast.success('Usuário atualizado com sucesso!')
      setEditingUser(null)
      if (refetchAppData) await refetchAppData()
    } catch (err) {
      // update_profile_secure (migration 149) devolve mensagem amigável em
      // português quando o papel solicitado exige admin do provedor.
      toast.error(err instanceof Error ? err.message : 'Erro ao atualizar usuário.')
    } finally {
      setUserUpdating(false)
    }
  }

  return (
    <div className="min-w-0">
      {activeTab === 'tenants' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">
            <h3 className="text-slate-800 font-bold text-sm uppercase tracking-widest border-b border-slate-100 pb-3">Empresas Cadastradas (Tenants)</h3>
            <div className="divide-y divide-slate-100 overflow-y-auto max-h-[500px]">
              {rawCompanies.map(c => (
                <div key={c.id} className="py-3 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <img src={c.logo_url || ''} className="w-8 h-8 rounded-lg" alt={c.name} />
                    <div>
                      <div className="text-xs font-bold text-slate-800">{c.name}</div>
                      <div className="text-[10px] text-slate-400 font-mono">{c.domain}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200 font-semibold uppercase">Ativo</span>
                    
                    <button 
                      onClick={() => {
                        const targetSlug = c.slug || c.domain;
                        if (targetSlug) {
                          setTenantOverride(targetSlug);
                          window.open(`/?tenant=${targetSlug}`, '_blank');
                        } else {
                          alert('Empresa sem identificador cadastrado.');
                        }
                      }}
                      className="p-1.5 text-emerald-600/70 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                      title="Testar Portal do Usuário"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>

                    <button 
                      onClick={() => {
                        if (setManagedCompanyId && setActiveTab) {
                          setManagedCompanyId(c.id)
                          setActiveTab('appearance')
                        }
                      }}
                      className="p-1.5 text-primary/70 hover:text-primary hover:bg-primary-container rounded-lg transition-colors cursor-pointer"
                      title="Configurar Aparência, SLAs e Motivos"
                    >
                      <Settings className="w-4 h-4" />
                    </button>

                    <button 
                      onClick={() => setEditingTenant(c)}
                      className="p-1.5 text-primary/70 hover:text-primary hover:bg-primary-container rounded-lg transition-colors cursor-pointer"
                      title="Editar Empresa"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">
            <h3 className="text-slate-800 font-bold text-sm uppercase tracking-widest border-b border-slate-100 pb-3 mb-4">Onboarding de Novo Cliente</h3>
            <form onSubmit={handleSaveTenant} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nome da Empresa</label>
                <input required type="text" value={tenantName} onChange={e => setTenantName(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white" placeholder="ex: Globex IT" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Domínio de E-mail</label>
                <input required type="text" value={tenantDomain} onChange={e => setTenantDomain(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white" placeholder="ex: globex.io" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">URL da Logo</label>
                <input type="text" value={tenantLogo} onChange={e => setTenantLogo(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white" placeholder="ex: https://logo.com" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Cor Primária</label>
                  <input required type="text" value={tenantPrimary} onChange={e => setTenantPrimary(e.target.value)} placeholder="ex: #4f46e5" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white" />
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Cor Secundária</label>
                  <input required type="text" value={tenantAccent} onChange={e => setTenantAccent(e.target.value)} placeholder="ex: #4f46e5" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white" />
                </div>
              </div>
              <p className="text-[10px] text-slate-400">Cores usadas nos botões e destaques do portal deste cliente. Se não tiver certeza, use as cores da marca do cliente. Elas podem ser refinadas depois em Configurações → Identidade Visual.</p>
              <button type="submit" disabled={tenantSaving} className="w-full py-2.5 rounded-xl bg-slate-800 text-white font-bold text-xs mt-3 disabled:opacity-50">
                {tenantSaving ? 'Salvando...' : 'Criar Empresa'}
              </button>
            </form>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <div className={`grid grid-cols-1 gap-5 ${showUserForm || editingUser ? 'xl:grid-cols-[minmax(0,1fr)_22rem]' : ''}`}>
          <section className="min-w-0 rounded-xl border border-slate-200 bg-white">
            <div className="flex flex-col gap-4 border-b border-slate-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
              <div>
                <h2 className="text-base font-bold text-slate-950">Usuários e acessos</h2>
                <p className="mt-1 text-sm text-slate-500">Gerencie papéis, gestores e consumo de licenças.</p>
              </div>
              <button
                type="button"
                onClick={() => { setShowUserForm(value => !value); setEditingUser(null) }}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800"
              >
                {showUserForm ? <X className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
                {showUserForm ? 'Fechar cadastro' : 'Adicionar usuário'}
              </button>
            </div>
            <div className="border-b border-slate-100 p-4 sm:p-5">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={userQuery}
                  onChange={event => setUserQuery(event.target.value)}
                  placeholder="Buscar por nome, e-mail, departamento ou papel"
                  className="min-h-10 w-full rounded-lg border border-slate-300 bg-white pl-10 pr-3 text-sm text-slate-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
                />
              </label>
            </div>
            <div className="divide-y divide-slate-100 overflow-y-auto max-h-[500px]">
              {rawProfiles.filter(p => {
                if (p.company_id !== currentCompany.id) return false
                const needle = userQuery.trim().toLocaleLowerCase('pt-BR')
                return !needle || [p.name, p.email, p.department, p.role].join(' ').toLocaleLowerCase('pt-BR').includes(needle)
              }).map(p => {
                const sameCompanyProfiles = rawProfiles.filter(x => x.company_id === p.company_id && x.id !== p.id)
                return (
                  <div key={p.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <img src={p.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${p.name}`} className="h-9 w-9 shrink-0 rounded-full" alt="" />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-slate-900">{p.name}</div>
                        <div className="truncate text-xs text-slate-500">{p.email} · {p.department || 'Sem departamento'}</div>
                      </div>
                    </div>
                    <div className="flex min-w-0 items-center gap-2 sm:justify-end">
                      <select
                        value={p.manager_id ?? ''}
                        onChange={async (e) => {
                          try {
                            await profilesService.update(p.id, { manager_id: e.target.value || null })
                            if (refetchAppData) await refetchAppData()
                          } catch (err: any) {
                            alert('Erro ao atualizar gestor: ' + err.message)
                          }
                        }}
                        className="min-h-9 min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-2 text-xs text-slate-700 sm:w-36 sm:flex-none"
                        title="Gestor direto — usado para encaminhar aprovações e notificações dos chamados abertos por esta pessoa"
                      >
                        <option value="">Sem gestor</option>
                        {sameCompanyProfiles.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                      <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">{p.role}</span>
                      <button
                        type="button"
                        onClick={() => { setEditingUser(p); setShowUserForm(false) }}
                        className="shrink-0 rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                        title="Editar usuário"
                        aria-label={`Editar usuário ${p.name}`}
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
          {editingUser && <aside className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-950">Editar usuário</h2>
              <button type="button" onClick={() => setEditingUser(null)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Fechar edição"><X className="h-4 w-4" /></button>
            </div>
            <p className="mb-4 mt-1 text-sm text-slate-500">Alterar o nível de acesso de um usuário só é permitido para administradores desta empresa ou administradores do ServiceFY.</p>
            <form onSubmit={handleUpdateUser} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nome Completo</label>
                <input required type="text" value={editingUser.name} onChange={e => setEditingUser(current => current && ({ ...current, name: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">E-mail Corporativo</label>
                <input required type="email" value={editingUser.email ?? ''} onChange={e => setEditingUser(current => current && ({ ...current, email: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Departamento</label>
                <input type="text" value={editingUser.department ?? ''} onChange={e => setEditingUser(current => current && ({ ...current, department: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white" placeholder="ex: TI" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nível de acesso</label>
                <select value={editingUser.role} onChange={e => setEditingUser(current => current && ({ ...current, role: e.target.value as Role }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white">
                  {assignableRoleOptions.some(option => option.value === editingUser.role)
                    ? null
                    : <option value={editingUser.role}>{editingUser.role} (papel não atribuível por você)</option>}
                  {assignableRoleOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <p className="mt-1 text-[10px] text-slate-400">{REAL_ROLE_OPTIONS.find(o => o.value === editingUser.role)?.help ?? 'Define o que esta pessoa pode ver e fazer no sistema.'} Pode ser alterado a qualquer momento.</p>
                {LICENSE_CONSUMING_ROLES.includes(editingUser.role as Role) && (
                  <p className="mt-1 text-[10px] text-slate-400">Este papel usa uma licença de analista do seu plano. Se o limite for atingido, desative outro analista ou amplie o plano antes de salvar.</p>
                )}
              </div>
              <button type="submit" disabled={userUpdating} className="mt-3 min-h-10 w-full rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                {userUpdating ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </form>
          </aside>}
          {showUserForm && <aside className="rounded-xl border border-slate-200 bg-white p-5">
            <h2 className="text-base font-bold text-slate-950">Adicionar usuário</h2>
            <p className="mb-4 mt-1 text-sm text-slate-500">Defina o acesso inicial. Ele poderá ser alterado depois.</p>
            <LicenseUsageBadge companyId={usrCompanyId} rawCompanies={rawCompanies} rawProfiles={rawProfiles} />
            <form onSubmit={handleSaveUser} className="space-y-3">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nome Completo</label>
                <input required type="text" value={usrName} onChange={e => setUsrName(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white" placeholder="ex: Ana Silva" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">E-mail Corporativo</label>
                <input required type="email" value={usrEmail} onChange={e => setUsrEmail(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white" placeholder="ex: ana@acme.com" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Departamento</label>
                <input type="text" value={usrDept} onChange={e => setUsrDept(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white" placeholder="ex: TI" />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Gestor Direto</label>
                <select value={usrManagerId} onChange={e => setUsrManagerId(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white">
                  <option value="">Sem gestor</option>
                  {rawProfiles.filter(p => p.company_id === usrCompanyId).map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Nível de acesso</label>
                <select value={usrRole} onChange={e => setUsrRole(e.target.value as Role)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white">
                  {assignableRoleOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <p className="mt-1 text-[10px] text-slate-400">{REAL_ROLE_OPTIONS.find(o => o.value === usrRole)?.help ?? 'Define o que esta pessoa pode ver e fazer no sistema.'} Pode ser alterado a qualquer momento.</p>
                {LICENSE_CONSUMING_ROLES.includes(usrRole) && (
                  <p className="mt-1 text-[10px] text-slate-400">Este papel usa uma licença de analista do seu plano. Se o limite for atingido, desative outro analista ou amplie o plano antes de salvar.</p>
                )}
              </div>
              {isBreakGlassRole && (
                <label className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <input type="checkbox" checked={usrLocalLogin} onChange={e => setUsrLocalLogin(e.target.checked)} className="mt-0.5 h-4 w-4 rounded border-amber-300 text-amber-600" />
                  <span>
                    <span className="font-bold">Criar com login local (sem depender de SSO).</span> Recomendado para contas de administrador: a pessoa recebe um convite por e-mail para definir a própria senha, e consegue entrar mesmo se o SSO da empresa estiver fora do ar. Desmarque para depender só do login SSO/JIT, como os demais usuários.
                  </span>
                </label>
              )}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Empresa</label>
                <select value={usrCompanyId} onChange={e => setUsrCompanyId(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-700 bg-white">
                  {rawCompanies.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <button type="submit" disabled={usrSaving} className="mt-3 min-h-10 w-full rounded-lg bg-slate-950 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50">
                {usrSaving ? 'Salvando...' : 'Adicionar usuário'}
              </button>
            </form>
          </aside>}
        </div>
      )}

      {activeTab === 'groups' && (
        <AssignmentGroupsAdmin currentCompany={currentCompany} rawProfiles={rawProfiles} />
      )}

      {activeTab === 'departments' && (
        <DepartmentManager companyId={currentCompany.id} cardClass="overflow-hidden rounded-xl border border-slate-200 bg-white" primaryColor={currentCompany.primary_color || '#4f46e5'} />
      )}

      {(['catalog_incidents', 'catalog_requests', 'form_templates'] as string[]).includes(activeTab) && (
        <div>
          <CatalogManager
            companyId={currentCompany.id}
            section={
              activeTab === 'catalog_requests'
                ? 'request'
                : activeTab === 'form_templates'
                  ? 'templates'
                  : 'incident'
            }
          />
        </div>
      )}


      {/* MODAL DE EDIÇÃO DE TENANT (REFORMULADO) */}
      {editingTenant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 overflow-hidden">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col md:flex-row overflow-hidden border border-white/50">
            {/* Lado Esquerdo: Formulário */}
            <div className="w-full md:w-[55%] flex flex-col max-h-[90vh]">
              <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-white z-10 shrink-0">
                <div>
                  <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">Identidade da Marca</h2>
                  <p className="text-xs text-slate-500 mt-1 font-medium">Personalize a aparência do portal para {editingTenant.name}</p>
                </div>
                <button 
                  onClick={() => setEditingTenant(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 overflow-y-auto bg-slate-50/30 flex-1 custom-scrollbar">
                <form id="update-tenant-form" onSubmit={handleUpdateTenant} className="space-y-8">
                  {/* Informações Básicas */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                      <LayoutTemplate className="w-4 h-4 text-indigo-500" />
                      Informações Básicas
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Nome da Empresa</label>
                        <input 
                          required type="text" value={editingTenant.name} 
                          onChange={e => setEditingTenant({ ...editingTenant, name: e.target.value })} 
                          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-sm" 
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Domínio Principal</label>
                        <input 
                          required type="text" value={editingTenant.domain} 
                          onChange={e => setEditingTenant({ ...editingTenant, domain: e.target.value })} 
                          className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm text-slate-700 bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all shadow-sm" 
                        />
                      </div>
                    </div>
                  </div>

                  <hr className="border-slate-100" />

                  {/* Imagens / Mídia */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-widest flex items-center gap-2">
                      <ImageIcon className="w-4 h-4 text-emerald-500" />
                      Mídia e Fundo
                    </h3>
                    
                    <div className="space-y-5">
                      {/* Logo Dropzone */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Logo da Empresa</label>
                        <div className="relative group rounded-2xl border-2 border-dashed border-slate-200 hover:border-emerald-400 bg-white transition-all overflow-hidden">
                          <input 
                            type="file" accept="image/*"
                            onChange={async (e) => {
                              const f = e.target.files?.[0]; if (!f) return;
                              try { 
                                setUploadingBg(true);
                                const url = await companiesService.uploadBrandAsset(editingTenant.id, f);
                                setEditingTenant({ ...editingTenant, logo_url: url });
                              } catch(err:any) { alert('Erro: ' + err.message); }
                              finally { setUploadingBg(false); e.target.value = ''; }
                            }}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                          />
                          <div className="flex items-center gap-4 p-4">
                            <div className="w-16 h-16 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 overflow-hidden relative">
                              {editingTenant.logo_url ? (
                                <img src={editingTenant.logo_url} alt="Logo" className="w-full h-full object-contain p-2" />
                              ) : (
                                <ImageIcon className="w-6 h-6 text-slate-300" />
                              )}
                              {uploadingBg && <div className="absolute inset-0 bg-white/60 flex items-center justify-center"><div className="w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"/></div>}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-slate-700 group-hover:text-emerald-600 transition-colors flex items-center gap-2">
                                <Upload className="w-4 h-4" />
                                Escolher Imagem
                              </span>
                              <span className="text-xs text-slate-400 font-medium">PNG, JPG até 2MB</span>
                            </div>
                          </div>
                        </div>
                        {/* Fallback text input */}
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400">URL:</span>
                          <input type="text" value={editingTenant.logo_url || ''} onChange={e => setEditingTenant({...editingTenant, logo_url: e.target.value})} className="flex-1 bg-transparent text-xs text-slate-500 border-b border-slate-200 focus:border-emerald-500 outline-none pb-0.5" placeholder="https://..."/>
                        </div>
                      </div>

                      {/* Fundo Dropzone */}
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Fundo do Portal</label>
                        <p className="mb-1.5 text-[10px] text-slate-400">Imagem exibida atrás da tela de login e do portal do cliente.</p>
                        <div className="relative group rounded-2xl border-2 border-dashed border-slate-200 hover:border-indigo-400 bg-white transition-all overflow-hidden">
                          <input 
                            type="file" accept="image/*"
                            onChange={handleUploadBgImage}
                            disabled={uploadingBg}
                            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10 disabled:cursor-not-allowed"
                          />
                          <div className="flex items-center gap-4 p-4">
                            <div className="w-16 h-16 rounded-xl bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 overflow-hidden relative"
                                 style={{ background: editingTenant.bg_color || '#f8fafc', backgroundSize: 'cover', backgroundPosition: 'center' }}>
                              {!editingTenant.bg_color && <ImageIcon className="w-6 h-6 text-slate-300" />}
                              {uploadingBg && <div className="absolute inset-0 bg-white/60 flex items-center justify-center"><div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"/></div>}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-slate-700 group-hover:text-indigo-600 transition-colors flex items-center gap-2">
                                <Upload className="w-4 h-4" />
                                Escolher Fundo
                              </span>
                              <span className="text-xs text-slate-400 font-medium">PNG, JPG. Ficará cobrindo 100% da tela.</span>
                            </div>
                          </div>
                        </div>
                        {/* Fallback text input */}
                        <div className="mt-2 flex items-center gap-2">
                          <span className="text-[10px] font-bold text-slate-400" title="Preencha apenas se souber CSS. Prefira 'Escolher Fundo' acima para enviar uma imagem.">Avançado:</span>
                          <input type="text" value={editingTenant.bg_color || ''} onChange={e => setEditingTenant({...editingTenant, bg_color: e.target.value})} className="flex-1 bg-transparent text-xs font-mono text-slate-500 border-b border-slate-200 focus:border-indigo-500 outline-none pb-0.5" placeholder="Cor (#hex) — só preencha se souber CSS"/>
                        </div>
                      </div>
                    </div>
                  </div>

                </form>
              </div>
              
              <div className="p-5 border-t border-slate-100 bg-white flex items-center justify-end gap-3 shrink-0 z-10">
                <button 
                  type="button"
                  onClick={() => setEditingTenant(null)}
                  className="px-5 py-2.5 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
                <button 
                  type="submit"
                  form="update-tenant-form"
                  disabled={tenantUpdating}
                  className="px-6 py-2.5 bg-slate-900 hover:bg-black text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-slate-900/20 disabled:opacity-50 cursor-pointer"
                >
                  {tenantUpdating ? 'Salvando...' : 'Salvar Alterações'}
                </button>
              </div>
            </div>

            {/* Lado Direito: Live Preview Mockup */}
            <div className="hidden md:flex w-[45%] bg-slate-100 border-l border-slate-200 flex-col relative overflow-hidden">
              <div className="absolute inset-0" 
                   style={{ 
                     background: editingTenant.bg_color || '#f8fafc', 
                     backgroundSize: 'cover', 
                     backgroundPosition: 'center',
                     backgroundRepeat: 'no-repeat'
                   }} 
              />
              {/* Fake gradient layer just to match login screen feel if no image */}
              {(!editingTenant.bg_color || (!editingTenant.bg_color.includes('url(') && !editingTenant.bg_color.includes('gradient'))) && (
                <>
                  <div className="absolute inset-0 bg-[radial-gradient(#e2e8f0_1px,transparent_1px)] bg-[size:24px_24px] opacity-60 pointer-events-none" />
                  <div className="absolute inset-0 bg-gradient-to-br from-slate-900/5 via-transparent to-slate-100/50 pointer-events-none" />
                </>
              )}
              
              {/* Mockup Card Container */}
              <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-8 backdrop-blur-[2px]">
                
                {/* Mockup Form Card */}
                <div className="w-full max-w-sm bg-white border border-white/40 shadow-2xl rounded-3xl p-6 transition-all transform hover:scale-[1.02] duration-300">
                  {/* Brand Preview */}
                  <div className="text-center mb-6">
                    <div className="inline-flex items-center gap-2 mb-4">
                      <div className="w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg transition-colors" style={{ backgroundColor: editingTenant.primary_color || '#000' }}>
                        {editingTenant.logo_url ? (
                          <img src={editingTenant.logo_url} alt="Logo" className="w-7 h-7 rounded-xl object-contain bg-white/90 p-0.5" />
                        ) : (
                          <div className="w-7 h-7 bg-white/20 rounded-xl" />
                        )}
                      </div>
                      <span className="text-xl font-black tracking-tight text-slate-800 truncate max-w-[140px]">{editingTenant.name || 'Empresa'}</span>
                    </div>
                    <h1 
                      className="text-slate-800 font-extrabold text-base leading-tight transition-all"
                      style={{ 
                        color: editingTenant.title_color || undefined,
                        fontFamily: editingTenant.title_font || undefined,
                        fontSize: editingTenant.title_size || undefined
                      }}
                    >
                      {editingTenant.welcome_title || 'Bem-vindo ao Portal'}
                    </h1>
                    <p 
                      className="text-slate-500 text-[10px] mt-1 transition-all"
                      style={{
                        color: editingTenant.subtitle_color || undefined,
                        fontFamily: editingTenant.subtitle_font || undefined,
                        fontSize: editingTenant.subtitle_size || undefined
                      }}
                    >
                      {editingTenant.welcome_subtitle || 'Acesse seus chamados e serviços'}
                    </p>
                  </div>
                  
                  {/* Fake Inputs */}
                  <div className="space-y-3 opacity-60 pointer-events-none">
                    <div className="space-y-1.5">
                      <div className="h-2 w-16 bg-slate-200 rounded" />
                      <div className="h-10 w-full bg-slate-50 rounded-xl border border-slate-200" />
                    </div>
                    <div className="space-y-1.5">
                      <div className="h-2 w-12 bg-slate-200 rounded" />
                      <div className="h-10 w-full bg-slate-50 rounded-xl border border-slate-200" />
                    </div>
                    <div className="h-10 w-full rounded-xl mt-5 flex items-center justify-center shadow-md shadow-black/10 transition-colors" style={{ backgroundColor: editingTenant.primary_color || '#000' }}>
                      <span className="text-white text-xs font-bold tracking-widest uppercase">Acessar</span>
                    </div>
                  </div>
                </div>
                
                <div className="mt-6 text-center">
                  <span className="bg-slate-900/40 backdrop-blur-md text-white px-3 py-1 rounded-full text-[9px] font-bold uppercase tracking-widest shadow-xl border border-white/20">
                    Live Preview Interativo
                  </span>
                </div>

              </div>
            </div>

          </div>
        </div>
      )}
    </div>
  )
}
