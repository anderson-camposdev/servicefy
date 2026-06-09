import { useState } from 'react'
import { Palette, Image as ImageIcon, LayoutGrid, Save } from 'lucide-react'
import { useTenant } from '../tenant'
import { useAuth } from '../auth'
import { companiesService } from '../lib/services'
import CatalogManager from './CatalogManager'

/**
 * Configurações do Portal (Admin White-Label + Catálogo).
 *
 * A aba "Identidade Visual" agora persiste de verdade: salva
 * primary_color / secondary_color / logo_url / brand_name na tabela
 * public.companies (RLS: provedor OU admin da própria empresa) e
 * aplica o tema ao vivo nas CSS Variables. Catálogo segue mock.
 */
const AdminPortalSettings = () => {
  const { tenant } = useTenant()
  const { company, refreshCompany } = useAuth()

  // Empresa editável: a do admin logado tem prioridade; senão o tenant.
  const target = company ?? tenant
  const companyId = target?.id ?? null

  const [primaryColor, setPrimaryColor] = useState(target?.primary_color ?? '#0056b3')
  const [secondaryColor, setSecondaryColor] = useState(target?.secondary_color ?? target?.accent_color ?? '#00a3e0')
  const [logoUrl, setLogoUrl] = useState(target?.logo_url ?? '')
  const [brandName, setBrandName] = useState(target?.brand_name ?? target?.name ?? '')

  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)

  const [activeTab, setActiveTab] = useState('branding')

  const applyLiveTheme = () => {
    const root = document.documentElement
    root.style.setProperty('--brand-primary', primaryColor)
    root.style.setProperty('--brand-secondary', secondaryColor)
    root.style.setProperty('--brand-accent', secondaryColor)
  }

  const handleSave = async () => {
    if (!companyId) {
      setFeedback({ kind: 'err', msg: 'Nenhuma empresa ativa para salvar (faça login como admin).' })
      return
    }
    setSaving(true); setFeedback(null)
    try {
      await companiesService.update(companyId, {
        primary_color: primaryColor,
        secondary_color: secondaryColor,
        logo_url: logoUrl || null,
        brand_name: brandName || null,
      })
      applyLiveTheme() // feedback visual imediato
      await refreshCompany() // SPA: recarrega o contexto sem F5
      setFeedback({ kind: 'ok', msg: 'Identidade visual salva e aplicada.' })
    } catch (e) {
      setFeedback({ kind: 'err', msg: e instanceof Error ? e.message : 'Falha ao salvar.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-8">
      <div className="max-w-5xl mx-auto space-y-8">

        {/* Cabeçalho */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-950">Configurações do Portal</h1>
            <p className="text-slate-500 mt-1">Gerencie a identidade visual e o catálogo de {brandName || 'sua empresa'}.</p>
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !companyId}
            className="flex items-center gap-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-sm"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Salvando…' : 'Salvar Alterações'}
          </button>
        </div>

        {feedback && (
          <div className={`text-sm rounded-xl p-3 border ${feedback.kind === 'ok' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-600'}`}>
            {feedback.msg}
          </div>
        )}

        {/* Abas */}
        <div className="flex space-x-1 bg-slate-200/50 p-1 rounded-xl w-fit">
          <button onClick={() => setActiveTab('branding')} className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'branding' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
            <Palette className="w-4 h-4" /> Identidade Visual (White-Label)
          </button>
          <button onClick={() => setActiveTab('catalog')} className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === 'catalog' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}>
            <LayoutGrid className="w-4 h-4" /> Catálogo de Serviços
          </button>
        </div>

        {/* ABA: IDENTIDADE VISUAL */}
        {activeTab === 'branding' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Cores */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
              <div className="flex items-center gap-3 border-b pb-4">
                <Palette className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-900">Paleta de Cores</h2>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cor Primária (botões, destaques)</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="h-10 w-20 cursor-pointer rounded border border-slate-200 bg-white p-1" />
                    <input type="text" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="flex-1 h-10 rounded-lg border border-slate-200 px-3 text-sm focus:ring-2 focus:ring-indigo-500 uppercase" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cor de Suporte (secundária)</label>
                  <div className="flex items-center gap-3">
                    <input type="color" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="h-10 w-20 cursor-pointer rounded border border-slate-200 bg-white p-1" />
                    <input type="text" value={secondaryColor} onChange={e => setSecondaryColor(e.target.value)} className="flex-1 h-10 rounded-lg border border-slate-200 px-3 text-sm focus:ring-2 focus:ring-indigo-500 uppercase" />
                  </div>
                </div>
                {/* Preview ao vivo */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs text-slate-400">Prévia:</span>
                  <span className="px-3 py-1.5 rounded-lg text-white text-xs font-bold" style={{ backgroundColor: primaryColor }}>Botão</span>
                  <span className="px-3 py-1.5 rounded-lg text-white text-xs font-bold" style={{ backgroundColor: secondaryColor }}>Badge</span>
                </div>
              </div>
            </div>

            {/* Marca & Mídias */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm space-y-6">
              <div className="flex items-center gap-3 border-b pb-4">
                <ImageIcon className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-900">Marca & Logotipo</h2>
              </div>

              <div className="space-y-5">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nome da Marca</label>
                  <input type="text" value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="Ex.: Acme Corp" className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">URL do Logotipo</label>
                  <input type="url" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://.../logo.png" className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm focus:ring-2 focus:ring-indigo-500" />
                  <div className="mt-3 flex items-center gap-3">
                    {logoUrl
                      ? <img src={logoUrl} alt="Logo" className="h-12 w-12 rounded-xl object-contain border border-slate-200 bg-slate-50" />
                      : <div className="h-12 w-12 rounded-xl border border-dashed border-slate-300 flex items-center justify-center text-slate-400 font-black">{(brandName || 'F').charAt(0)}</div>}
                    <span className="text-xs text-slate-400">Pré-visualização do logo</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA: CATÁLOGO (CRUD real) */}
        {activeTab === 'catalog' && (
          companyId
            ? <CatalogManager companyId={companyId} />
            : <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-400">Faça login como admin para gerenciar o catálogo.</div>
        )}

      </div>
    </div>
  )
}

export default AdminPortalSettings
