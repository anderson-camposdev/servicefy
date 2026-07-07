// ============================================================
// ServiceFY — Widget do Agente Virtual (portal do usuário final)
// Balão flutuante que abre o agente CONDUTOR de triagem (TriageChat).
// Só aparece se o módulo virtual_agent estiver habilitado para o tenant.
// A segurança real é a RLS/RPC — este gate é só conveniência.
// ============================================================

import { useEffect, useState } from 'react'
import { Bot, X, MessageCircle } from 'lucide-react'
import { platformAdminService } from '../lib/platform-admin-service'
import TriageChat from './TriageChat'

export default function VirtualAgentWidget({ companyId }: { companyId?: string }) {
  const [enabled, setEnabled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!companyId) return
    let cancelled = false
    platformAdminService.getSettingsOverview(companyId)
      .then(overview => {
        if (cancelled) return
        setEnabled(overview.entitlements.some(item => item.module_key === 'virtual_agent' && item.enabled))
      })
      .catch(() => { if (!cancelled) setEnabled(false) })
    return () => { cancelled = true }
  }, [companyId])

  if (!enabled || !companyId) return null

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {open ? (
        <div className="flex h-[560px] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <header className="flex items-center justify-between gap-2 bg-indigo-600 px-4 py-3 text-white">
            <div className="flex items-center gap-2 font-bold"><Bot className="h-5 w-5" /> Assistente de triagem</div>
            <button onClick={() => setOpen(false)} aria-label="Fechar"><X className="h-5 w-5" /></button>
          </header>
          <div className="min-h-0 flex-1">
            <TriageChat companyId={companyId} />
          </div>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-3.5 text-white shadow-2xl hover:bg-indigo-700"
        >
          <MessageCircle className="h-5 w-5" /> <span className="font-bold">Assistente</span>
        </button>
      )}
    </div>
  )
}
