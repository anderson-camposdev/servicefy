import React, { useState, useCallback, useRef } from 'react'
import { Upload, CheckCircle2, XCircle, AlertCircle, Loader2, Users, FileText } from 'lucide-react'
import type { InviteUserPayload, BatchInvitePayload, UserRole } from '../../lib/iam.types'
import { profilesService } from '../../lib/services'

interface Props {
  companyId: string;
  tenantDomain: string; // The allowed domain for emails
  onSuccess?: () => void;
}

type ParsedUser = InviteUserPayload & {
  isValid: boolean;
  errorReason?: string;
  originalRowIndex: number;
}

// Mesma allowlist da RPC batch_invite_users (migration 147_security_review_fixes):
// sysadmin nunca é atribuível por convite/importação, e os papéis "technician",
// "area_manager", "it_manager", "client_manager", "cio" não existem no enum real
// do Postgres — aceitá-los aqui faria a linha "validar" no cliente e falhar com
// erro cru de cast no servidor.
const VALID_ROLES: UserRole[] = [
  'end_user', 'agent', 'ops_manager', 'governance_manager', 'company_admin',
];

export function UserImportZone({ companyId, tenantDomain, onSuccess }: Props) {
  const [users, setUsers] = useState<ParsedUser[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const processCsv = (text: string) => {
    const lines = text.split(/\r?\n/).filter(line => line.trim() !== '')
    if (lines.length < 2) {
      setErrorMsg('O arquivo deve conter um cabeçalho e pelo menos uma linha de dados.')
      setUsers([])
      return
    }

    const header = lines[0].toLowerCase().split(',')
    const expectedHeaders = ['email', 'name', 'role']
    const missingHeaders = expectedHeaders.filter(h => !header.some(col => col.trim() === h))
    
    if (missingHeaders.length > 0) {
      setErrorMsg(`Cabeçalho inválido. Colunas obrigatórias ausentes: ${missingHeaders.join(', ')}`)
      setUsers([])
      return
    }

    const emailIdx = header.findIndex(h => h.trim() === 'email')
    const nameIdx = header.findIndex(h => h.trim() === 'name')
    const roleIdx = header.findIndex(h => h.trim() === 'role')
    const deptIdx = header.findIndex(h => h.trim() === 'department_id')

    const domainRegex = new RegExp(`@${tenantDomain}$`, 'i')
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

    const parsedUsers: ParsedUser[] = lines.slice(1).map((line, index) => {
      const cols = line.split(',')
      const email = (cols[emailIdx] || '').trim()
      const name = (cols[nameIdx] || '').trim()
      const roleStr = (cols[roleIdx] || '').trim().toLowerCase() as UserRole
      const dept = deptIdx >= 0 ? (cols[deptIdx] || '').trim() : null

      let isValid = true
      let errorReason = ''

      if (!email) {
        isValid = false
        errorReason = 'Email ausente.'
      } else if (!emailRegex.test(email)) {
        isValid = false
        errorReason = 'Formato de e-mail inválido.'
      } else if (tenantDomain && !domainRegex.test(email)) {
        isValid = false
        errorReason = `Domínio inválido. Esperado: @${tenantDomain}`
      }

      if (!name) {
        isValid = false
        errorReason += (errorReason ? ' ' : '') + 'Nome ausente.'
      }

      if (!VALID_ROLES.includes(roleStr)) {
        isValid = false
        errorReason += (errorReason ? ' ' : '') + `Role inválida (${roleStr}).`
      }

      return {
        email,
        name,
        role: VALID_ROLES.includes(roleStr) ? roleStr : 'end_user',
        department_id: dept || null,
        isValid,
        errorReason,
        originalRowIndex: index + 2
      }
    })

    setUsers([...parsedUsers])
    setErrorMsg('')
    setSuccessMsg('')
  }

  const handleFileUpload = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setErrorMsg('Por favor, envie um arquivo .csv válido.')
      return
    }
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result
      if (typeof text === 'string') {
        processCsv(text)
      }
    }
    reader.readAsText(file)
  }

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileUpload(e.dataTransfer.files[0])
    }
  }, [tenantDomain])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }, [])

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleSend = async () => {
    const validUsers = users.filter(u => u.isValid)
    if (validUsers.length === 0) return

    setIsUploading(true)
    setErrorMsg('')
    setSuccessMsg('')

    const payload: BatchInvitePayload = {
      company_id: companyId,
      invites: validUsers.map(u => ({
        email: u.email,
        name: u.name,
        role: u.role,
        department_id: u.department_id
      }))
    }

    try {
      await profilesService.batchInvite(payload)
      setSuccessMsg(`${validUsers.length} usuários convidados com sucesso!`)
      setUsers([])
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      if (onSuccess) onSuccess()
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao importar usuários.')
    } finally {
      setIsUploading(false)
    }
  }

  const validCount = users.filter(u => u.isValid).length
  const invalidCount = users.length - validCount

  return (
    <div className="space-y-6">
      <div 
        onDrop={onDrop}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`relative flex flex-col items-center justify-center p-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
          isDragging ? 'border-indigo-500 bg-indigo-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'
        }`}
      >
        <Upload className={`w-10 h-10 mb-4 ${isDragging ? 'text-indigo-600' : 'text-slate-400'}`} />
        <p className="text-sm font-bold text-slate-700">Arraste um arquivo CSV ou clique para selecionar</p>
        <p className="text-xs text-slate-500 mt-1">Colunas necessárias: email, name, role. Domínio permitido: @{tenantDomain}</p>
        <input 
          type="file" 
          accept=".csv" 
          className="hidden" 
          data-testid="file-upload"
          ref={fileInputRef}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFileUpload(e.target.files[0])
            }
          }}
        />
      </div>

      {errorMsg && (
        <div className="flex items-center gap-2 p-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle className="w-5 h-5" />
          {errorMsg}
        </div>
      )}

      {successMsg && (
        <div className="flex items-center gap-2 p-3 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl">
          <CheckCircle2 className="w-5 h-5" />
          {successMsg}
        </div>
      )}

      {users.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-600" />
              Pré-visualização da Importação
            </h3>
            <div className="flex gap-4 text-xs font-semibold">
              <span className="text-emerald-600">{validCount} válidos</span>
              {invalidCount > 0 && <span className="text-red-600">{invalidCount} inválidos</span>}
            </div>
          </div>
          
          <div className="border rounded-xl overflow-hidden bg-white">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider">Linha</th>
                  <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider">Nome</th>
                  <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider">Email</th>
                  <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider">Role</th>
                  <th className="px-4 py-3 text-left text-[10px] font-black text-slate-500 uppercase tracking-wider">Mensagem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {users.map((user, idx) => (
                  <tr key={idx} className={user.isValid ? 'bg-white' : 'bg-red-50/50'}>
                    <td className="px-4 py-2">
                      {user.isValid ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-500" />
                      )}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">{user.originalRowIndex}</td>
                    <td className="px-4 py-2 text-sm font-medium text-slate-800">{user.name}</td>
                    <td className="px-4 py-2 text-sm text-slate-600">{user.email}</td>
                    <td className="px-4 py-2 text-xs font-semibold text-slate-500 uppercase">{user.role}</td>
                    <td className="px-4 py-2 text-xs text-red-600 font-semibold">{user.errorReason || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSend}
              disabled={validCount === 0 || isUploading}
              className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {isUploading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4" />
                  Importar {validCount} Usuários
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
