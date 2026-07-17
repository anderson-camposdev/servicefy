// ============================================================
// ServiceFY — Central de Conhecimento
//
// Ponto de entrada da Base de Conhecimento fora da Central de
// Configurações — no espírito de ApprovalCenter.tsx: item de nav
// permanente, sem seletor de tenant (sempre o tenant do usuário
// logado), segurança real garantida no servidor (RLS/RPC, ver
// migrations 131-133). Visível para agent/ops_manager/
// governance_manager além de sysadmin/company_admin.
// ============================================================

import { Lock } from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { isKbCapableRole, KB_ACCESS_DENIED_MESSAGE } from '../lib/kb-access'
import KnowledgeAdmin from './KnowledgeAdmin'

interface Props { onNavigateHome: () => void }

export default function KnowledgeCenter({ onNavigateHome }: Props) {
  const { profile } = useAuth()
  const activeRole = profile?.role ?? ''
  const companyId = profile?.company_id ?? ''

  if (!isKbCapableRole(activeRole)) {
    return (
      <div className="m-8 rounded-2xl border border-red-200 bg-red-50 p-8 text-center">
        <Lock className="mx-auto mb-3 text-red-500" />
        <h2 className="font-extrabold text-red-800">Acesso restrito</h2>
        <p className="mt-2 text-sm text-red-700">{KB_ACCESS_DENIED_MESSAGE}</p>
      </div>
    )
  }

  if (!companyId) return null

  return (
    <KnowledgeAdmin
      companyId={companyId}
      activeRole={activeRole}
      backLabel="Início"
      onBack={onNavigateHome}
    />
  )
}
