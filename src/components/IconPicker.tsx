import { useState, useRef } from 'react'
import * as Icons from 'lucide-react'
import { Upload, LoaderCircle, Search } from 'lucide-react'
import { serviceCatalogService } from '../lib/services'
import CatalogIcon from '../pages/CatalogIcon'

interface IconPickerProps {
  value?: string | null
  onChange: (value: string) => void
  companyId: string
  label?: string
}

const COMMON_ICONS = [
  'AlertTriangle', 'ShoppingCart', 'Monitor', 'Smartphone', 'Server',
  'Wifi', 'Database', 'ShieldAlert', 'Lock', 'Key', 'Wrench',
  'Settings', 'Package', 'Briefcase', 'CreditCard', 'Printer',
  'Headphones', 'LifeBuoy', 'Zap', 'Cloud', 'FileText', 'HelpCircle',
  'Info', 'CheckCircle', 'XCircle', 'PlusCircle', 'Search',
  // Departamentos (RH, Financeiro, Jurídico, Treinamento…)
  'Users', 'UserRound', 'Building2', 'Wallet', 'GraduationCap', 'Scale', 'Handshake'
]

export default function IconPicker({ value, onChange, companyId, label = "Ícone" }: IconPickerProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState<'library' | 'upload'>('library')
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('Selecione um arquivo de imagem.')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('O ícone deve ter no máximo 5 MB.')
      return
    }

    setBusy(true)
    try {
      const url = await serviceCatalogService.uploadIcon(companyId, file)
      onChange(url)
      setOpen(false)
    } catch (error) {
      alert(`Falha no upload do ícone: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const renderCurrentIcon = () => {
    if (!value) return <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400">?</div>
    if (value.startsWith('lucide:')) {
      const name = value.replace('lucide:', '')
      const Cmp = (Icons as any)[name] || Icons.Box
      return <Cmp className="w-6 h-6 text-indigo-600" />
    }
    return <CatalogIcon icon={value} size={32} />
  }

  return (
    <div className="relative">
      <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">{label}</label>
      <div 
        onClick={() => setOpen(true)}
        className="flex items-center gap-3 border border-slate-200 rounded-xl px-3 py-2 cursor-pointer hover:border-indigo-400 hover:bg-slate-50 transition-colors"
      >
        {renderCurrentIcon()}
        <span className="text-sm font-medium text-slate-600 flex-1 truncate">
          {value ? (value.startsWith('lucide:') ? value.replace('lucide:', '') : 'Imagem Customizada') : 'Selecionar Ícone...'}
        </span>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/20 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="absolute top-full left-0 mt-2 w-[320px] bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden">
            <div className="flex border-b border-slate-100">
              <button 
                onClick={() => setTab('library')}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${tab === 'library' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Biblioteca
              </button>
              <button 
                onClick={() => setTab('upload')}
                className={`flex-1 py-3 text-xs font-bold uppercase tracking-wider transition-colors ${tab === 'upload' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Fazer Upload
              </button>
            </div>

            <div className="p-4 max-h-[300px] overflow-y-auto">
              {tab === 'library' && (
                <div className="space-y-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
                    <input 
                      type="text" 
                      placeholder="Buscar ícone..." 
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div className="grid grid-cols-5 gap-2">
                    {COMMON_ICONS.filter(i => i.toLowerCase().includes(search.toLowerCase())).map(iconName => {
                      const Cmp = (Icons as any)[iconName]
                      if (!Cmp) return null
                      const isSelected = value === `lucide:${iconName}`
                      return (
                        <button
                          key={iconName}
                          onClick={() => { onChange(`lucide:${iconName}`); setOpen(false); }}
                          title={iconName}
                          className={`p-2 rounded-xl flex items-center justify-center transition-colors ${isSelected ? 'bg-primary-container text-on-primary-container' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                          <Cmp className="w-6 h-6" />
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {tab === 'upload' && (
                <div className="py-4">
                  <button
                    onClick={() => inputRef.current?.click()}
                    disabled={busy}
                    className="w-full flex flex-col items-center justify-center gap-3 p-6 border-2 border-dashed border-slate-200 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-colors disabled:opacity-50"
                  >
                    {busy ? <LoaderCircle className="w-8 h-8 text-indigo-500 animate-spin" /> : <Upload className="w-8 h-8 text-indigo-500" />}
                    <div className="text-center">
                      <div className="text-sm font-bold text-slate-700">{busy ? 'Enviando...' : 'Clique para selecionar'}</div>
                      <div className="text-xs text-slate-500 mt-1">PNG, JPG ou SVG (Max 5MB)</div>
                    </div>
                  </button>
                  <input ref={inputRef} type="file" accept="image/*" onChange={e => upload(e.target.files?.[0])} className="hidden" />
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
