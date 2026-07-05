import React, { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, Network, MoveUp, MoveDown, Check, X, Users } from 'lucide-react'
import { departmentsService, assignmentGroupsService } from '../lib/services'
import type { DepartmentRow, AssignmentGroupRow } from '../lib/database.types'
import IconPicker from '../components/IconPicker'
import CatalogIcon from './CatalogIcon'

interface Props {
  companyId: string
  cardClass: string
  primaryColor: string
}

export default function DepartmentManager({ companyId, cardClass, primaryColor }: Props) {
  const [departments, setDepartments] = useState<DepartmentRow[]>([])
  const [groups, setGroups] = useState<AssignmentGroupRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Edit mode
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editIcon, setEditIcon] = useState('')
  const [editActive, setEditActive] = useState(true)
  // Visibilidade: vazio = público para toda a empresa; senão, só membros dos grupos (RLS migration 046)
  const [editVisibleGroups, setEditVisibleGroups] = useState<string[]>([])

  // Create mode
  const [isCreating, setIsCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newIcon, setNewIcon] = useState('lucide:Building2')

  useEffect(() => {
    if (!companyId) return
    load()
  }, [companyId])

  async function load() {
    try {
      setLoading(true)
      const [data, grps] = await Promise.all([
        departmentsService.list(companyId),
        assignmentGroupsService.list(companyId),
      ])
      setDepartments(data)
      setGroups(grps)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!newName.trim()) return
    try {
      setLoading(true)
      const payload: Partial<DepartmentRow> = {
        company_id: companyId,
        name: newName.trim(),
        description: newDesc.trim() || null,
        icon: newIcon.trim() || 'lucide:Building2',
        sort_order: departments.length + 1,
        is_active: true
      }
      await departmentsService.create(payload)
      setNewName(''); setNewDesc(''); setNewIcon('lucide:Building2')
      setIsCreating(false)
      await load()
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  function startEdit(dep: DepartmentRow) {
    setEditingId(dep.id)
    setEditName(dep.name)
    setEditDesc(dep.description || '')
    setEditIcon(dep.icon || '')
    setEditActive(dep.is_active)
    setEditVisibleGroups(dep.visible_to_groups ?? [])
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function saveEdit(id: string) {
    if (!editName.trim()) return
    try {
      setLoading(true)
      await departmentsService.update(id, {
        name: editName.trim(),
        description: editDesc.trim() || null,
        icon: editIcon.trim(),
        is_active: editActive,
        visible_to_groups: editVisibleGroups
      })
      setEditingId(null)
      await load()
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm('Tem certeza que deseja excluir este departamento? Ele pode estar associado a itens do catálogo.')) return
    try {
      setLoading(true)
      await departmentsService.delete(id)
      await load()
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  async function moveUp(index: number) {
    if (index === 0) return
    const current = departments[index]
    const prev = departments[index - 1]
    try {
      setLoading(true)
      await Promise.all([
        departmentsService.update(current.id, { sort_order: prev.sort_order }),
        departmentsService.update(prev.id, { sort_order: current.sort_order })
      ])
      await load()
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  async function moveDown(index: number) {
    if (index === departments.length - 1) return
    const current = departments[index]
    const next = departments[index + 1]
    try {
      setLoading(true)
      await Promise.all([
        departmentsService.update(current.id, { sort_order: next.sort_order }),
        departmentsService.update(next.id, { sort_order: current.sort_order })
      ])
      await load()
    } catch (e: any) {
      setError(e.message)
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold">Departamentos</h2>
          <p className="text-sm text-content-muted mt-1">Gerencie os departamentos/áreas que organizam os serviços e requisições do seu catálogo.</p>
        </div>
        {!isCreating && (
          <button
            onClick={() => setIsCreating(true)}
            className="flex items-center gap-2 px-4 py-2 text-white rounded hover:opacity-90 transition-opacity"
            style={{ backgroundColor: primaryColor }}
          >
            <Plus className="w-4 h-4" />
            Novo Departamento
          </button>
        )}
      </div>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 rounded">
          {error}
        </div>
      )}

      {isCreating && (
        <div className={`${cardClass} p-4 border-l-4`} style={{ borderLeftColor: primaryColor }}>
          <h3 className="font-medium mb-4">Adicionar Departamento</h3>
          <form onSubmit={handleCreate} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-content-muted mb-1">Nome do Departamento *</label>
                <input
                  autoFocus
                  required
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded focus:outline-none focus:border-primary"
                  placeholder="Ex: TI, RH, Facilities"
                />
              </div>
              <div>
                <IconPicker value={newIcon} onChange={setNewIcon} companyId={companyId} label="Ícone" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-content-muted mb-1">Descrição</label>
                <input
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-background border border-border rounded focus:outline-none focus:border-primary"
                  placeholder="Descrição opcional"
                />
              </div>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setIsCreating(false)}
                className="px-4 py-2 text-content-muted hover:text-content transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 text-white rounded hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: primaryColor }}
              >
                {loading ? 'Salvando...' : 'Criar Departamento'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className={`${cardClass} overflow-hidden`}>
        {departments.length === 0 && !loading && !isCreating ? (
          <div className="p-8 text-center text-content-muted">
            <Network className="w-12 h-12 mx-auto mb-3 opacity-20" />
            <p>Nenhum departamento cadastrado.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-surface border-b border-border text-content-muted text-sm">
                <tr>
                  <th className="p-4 w-12">#</th>
                  <th className="p-4">Departamento</th>
                  <th className="p-4">Descrição</th>
                  <th className="p-4">Visibilidade</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {departments.map((dep, index) => {
                  const isEditing = editingId === dep.id
                  return (
                    <tr key={dep.id} className="border-b border-border last:border-0 hover:bg-surface/50 transition-colors">
                      <td className="p-4">
                        <div className="flex flex-col items-center gap-1">
                          <button onClick={() => moveUp(index)} disabled={index === 0 || loading} className="text-content-muted hover:text-content disabled:opacity-30">
                            <MoveUp className="w-4 h-4" />
                          </button>
                          <button onClick={() => moveDown(index)} disabled={index === departments.length - 1 || loading} className="text-content-muted hover:text-content disabled:opacity-30">
                            <MoveDown className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                      
                      <td className="p-4">
                        {isEditing ? (
                          <div className="space-y-2">
                            <input
                              autoFocus
                              value={editName}
                              onChange={e => setEditName(e.target.value)}
                              className="w-full px-2 py-1 bg-background border border-border rounded text-sm"
                              placeholder="Nome"
                            />
                            <IconPicker value={editIcon} onChange={setEditIcon} companyId={companyId} label="Ícone" />
                          </div>
                        ) : (
                          <div className="font-medium flex items-center gap-2">
                            <CatalogIcon icon={dep.icon} name={dep.name} size={28} />
                            {dep.name}
                          </div>
                        )}
                      </td>
                      
                      <td className="p-4 text-sm text-content-muted">
                        {isEditing ? (
                          <input
                            value={editDesc}
                            onChange={e => setEditDesc(e.target.value)}
                            className="w-full px-2 py-1 bg-background border border-border rounded text-sm"
                            placeholder="Descrição"
                          />
                        ) : (
                          dep.description || '-'
                        )}
                      </td>

                      <td className="p-4 text-sm">
                        {isEditing ? (
                          <div className="max-h-32 space-y-1 overflow-y-auto rounded border border-border bg-background p-2">
                            <p className="text-[10px] uppercase tracking-wide text-content-muted">Nenhum marcado = visível para todos</p>
                            {groups.map(g => (
                              <label key={g.id} className="flex cursor-pointer items-center gap-2 text-xs">
                                <input
                                  type="checkbox"
                                  checked={editVisibleGroups.includes(g.id)}
                                  onChange={e => setEditVisibleGroups(prev => e.target.checked ? [...prev, g.id] : prev.filter(id => id !== g.id))}
                                  className="w-3.5 h-3.5 rounded border-border"
                                />
                                {g.name}
                              </label>
                            ))}
                            {groups.length === 0 && <span className="text-xs text-content-muted">Sem grupos cadastrados</span>}
                          </div>
                        ) : (
                          (dep.visible_to_groups?.length ?? 0) === 0 ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-sky-500/10 text-sky-500">Público</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-amber-500/10 text-amber-600" title={groups.filter(g => dep.visible_to_groups?.includes(g.id)).map(g => g.name).join(', ')}>
                              <Users className="w-3 h-3" /> {dep.visible_to_groups!.length} grupo(s)
                            </span>
                          )
                        )}
                      </td>

                      <td className="p-4 text-center">
                        {isEditing ? (
                          <label className="flex items-center justify-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editActive}
                              onChange={e => setEditActive(e.target.checked)}
                              className="w-4 h-4 rounded border-border text-primary focus:ring-primary focus:ring-offset-background bg-background"
                            />
                            <span className="text-sm">Ativo</span>
                          </label>
                        ) : (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${dep.is_active ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                            {dep.is_active ? 'Ativo' : 'Inativo'}
                          </span>
                        )}
                      </td>

                      <td className="p-4 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => saveEdit(dep.id)}
                              className="p-1.5 text-green-500 hover:bg-green-500/10 rounded transition-colors"
                              title="Salvar"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="p-1.5 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                              title="Cancelar"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => startEdit(dep)}
                              className="p-1.5 text-content-muted hover:text-content hover:bg-surface rounded transition-colors"
                              title="Editar"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDelete(dep.id)}
                              className="p-1.5 text-red-500 hover:bg-red-500/10 rounded transition-colors"
                              title="Excluir"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
