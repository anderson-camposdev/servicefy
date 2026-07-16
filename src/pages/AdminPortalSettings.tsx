import { useState, useRef, type ChangeEvent } from 'react'
import { Palette, Image as ImageIcon, LayoutGrid, Save, ShoppingCart, FileText, Eye, Upload, X } from 'lucide-react'
import { useTenant } from '../tenant'
import { useAuth } from '../auth'
import { companiesService } from '../lib/services'
import CatalogManager from './CatalogManager'
import { DARK_THEMES, LIGHT_THEMES, FONT_SCALE_LIST, THEME_HEX_COLORS, getPortalSidebar } from '../lib/theme-engine'
import type { ThemeName, FontScale } from '../lib/theme-engine'

function hexToRgba(hex: string, alpha: number): string {
  const c = (hex.startsWith('#') ? hex.slice(1) : hex).padEnd(6,'0')
  return `rgba(${parseInt(c.slice(0,2),16)||16},${parseInt(c.slice(2,4),16)||185},${parseInt(c.slice(4,6),16)||129},${alpha})`
}

const FONT_SCALE_LABELS: Record<FontScale, { label: string; size: string }> = {
  compact:  { label: 'Compacto',  size: 'text-lg' },
  standard: { label: 'Padrão',    size: 'text-2xl' },
  large:    { label: 'Grande',    size: 'text-3xl' },
  display:  { label: 'Display',   size: 'text-4xl' },
}

const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp']
const MAX_MB = 2

// ── Componente de upload de arquivo reutilizável ──────────────────────────────

interface FileUploadZoneProps {
  label: string
  accept: string
  currentUrl: string
  uploading: boolean
  round?: boolean
  onPickFile: () => void
  onRemove: () => void
  inputRef: React.RefObject<HTMLInputElement | null>
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void
}

function FileUploadZone({ label, accept, currentUrl, uploading, round, onPickFile, onRemove, inputRef, onFileChange }: FileUploadZoneProps) {
  if (currentUrl) {
    return (
      <div className="relative inline-block">
        <img
          src={currentUrl}
          alt={label}
          className={`object-contain border border-slate-200 bg-slate-50 ${round ? 'w-20 h-20 rounded-full' : 'h-16 max-w-xs rounded-xl'}`}
        />
        <button
          type="button"
          onClick={onRemove}
          title="Remover"
          className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-slate-800 text-white text-xs flex items-center justify-center shadow-md hover:bg-red-600 transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
        <button
          type="button"
          onClick={onPickFile}
          disabled={uploading}
          className="mt-2 block text-xs text-slate-500 hover:text-slate-700 underline"
        >
          {uploading ? 'Enviando…' : 'Trocar arquivo'}
        </button>
        <input ref={inputRef as React.RefObject<HTMLInputElement>} type="file" accept={accept} className="hidden" onChange={onFileChange} />
      </div>
    )
  }

  return (
    <div
      onClick={onPickFile}
      className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-slate-300 rounded-xl bg-slate-50 cursor-pointer hover:border-slate-400 hover:bg-slate-100 transition-colors"
    >
      {uploading ? (
        <>
          <div className="w-6 h-6 border-2 border-slate-400 border-t-slate-800 rounded-full animate-spin" />
          <span className="text-sm text-slate-500">Enviando…</span>
        </>
      ) : (
        <>
          <Upload className="w-6 h-6 text-slate-400" />
          <span className="text-sm font-medium text-slate-600">{label}</span>
          <span className="text-xs text-slate-400">PNG, JPG, SVG, WebP · máx {MAX_MB} MB</span>
        </>
      )}
      <input ref={inputRef as React.RefObject<HTMLInputElement>} type="file" accept={accept} className="hidden" onChange={onFileChange} />
    </div>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────

const AdminPortalSettings = () => {
  const { tenant } = useTenant()
  const { company, refreshCompany } = useAuth()

  const target = company ?? tenant
  const companyId = target?.id ?? null

  const [themeName,     setThemeName]     = useState<ThemeName>((target?.primary_color as ThemeName) || 'Ocean')
  const [fontScale,     setFontScale]     = useState<FontScale>((target?.title_size as FontScale) || 'standard')
  const [logoUrl,       setLogoUrl]       = useState(target?.logo_url ?? '')
  const [backgroundUrl, setBackgroundUrl] = useState(target?.background_url ?? '')
  const [brandName,     setBrandName]     = useState(target?.brand_name ?? target?.name ?? '')
  const [welcomeTitle,  setWelcomeTitle]  = useState(target?.welcome_title ?? '')
  const [welcomeSubtitle, setWelcomeSubtitle] = useState(target?.welcome_subtitle ?? '')
  const [bgColor,       setBgColor]       = useState(target?.bg_color ?? '')
  const [greetingPrefix, setGreetingPrefix] = useState(target?.greeting_prefix ?? '')
  const [greetingColor,  setGreetingColor]  = useState(target?.greeting_color ?? '')
  const [cardLayout,     setCardLayout]     = useState<'grid' | 'list'>((target?.catalog_ui_config as any)?.card_settings?.layout || 'grid')
  const [incidentLabel, setIncidentLabel] = useState((target?.catalog_ui_config as any)?.portal_buttons?.incident_label || '')
  const [incidentDesc,  setIncidentDesc]  = useState((target?.catalog_ui_config as any)?.portal_buttons?.incident_desc || '')
  const [incidentEmoji, setIncidentEmoji] = useState((target?.catalog_ui_config as any)?.portal_buttons?.incident_emoji || '')
  const [requestLabel,  setRequestLabel]  = useState((target?.catalog_ui_config as any)?.portal_buttons?.request_label || '')
  const [requestDesc,   setRequestDesc]   = useState((target?.catalog_ui_config as any)?.portal_buttons?.request_desc || '')
  const [requestEmoji,  setRequestEmoji]  = useState((target?.catalog_ui_config as any)?.portal_buttons?.request_emoji || '')

  const [logoUploading, setLogoUploading] = useState(false)
  const [bgUploading,   setBgUploading]   = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)
  const bgInputRef   = useRef<HTMLInputElement>(null)

  const brand = THEME_HEX_COLORS[themeName] || '#10b981'
  const sb    = getPortalSidebar(themeName)

  const [saving,   setSaving]   = useState(false)
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; msg: string } | null>(null)
  const [activeTab, setActiveTab] = useState('branding')

  // ── Upload handlers ────────────────────────────────────────────────────────

  const validateAndUpload = async (
    file: File,
    assetType: 'logo' | 'background',
    setUploading: (v: boolean) => void,
    onSuccess: (url: string) => void,
  ) => {
    if (!companyId) { setFeedback({ kind:'err', msg:'Nenhuma empresa ativa. Faça login como admin.' }); return }
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      setFeedback({ kind:'err', msg:'Formato inválido. Use PNG, JPG, SVG ou WebP.' }); return
    }
    if (file.size > MAX_MB * 1024 * 1024) {
      setFeedback({ kind:'err', msg:`Arquivo muito grande. Máximo ${MAX_MB} MB.` }); return
    }
    setFeedback(null)
    setUploading(true)
    try {
      const url = await companiesService.uploadBrandAsset(companyId, file, assetType)
      onSuccess(url)
    } catch (e) {
      setFeedback({ kind:'err', msg: e instanceof Error ? e.message : 'Falha no upload.' })
    } finally {
      setUploading(false)
    }
  }

  const handleLogoChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    validateAndUpload(file, 'logo', setLogoUploading, setLogoUrl)
    e.target.value = ''
  }

  const handleBgChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    validateAndUpload(file, 'background', setBgUploading, setBackgroundUrl)
    e.target.value = ''
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  const handleSave = async () => {
    if (!companyId) {
      setFeedback({ kind:'err', msg:'Nenhuma empresa ativa para salvar (faça login como admin).' })
      return
    }
    setSaving(true)
    setFeedback(null)
    try {
      const existingConfig = (target?.catalog_ui_config as Record<string, any>) || {}
      const newConfig = {
        ...existingConfig,
        card_settings: {
          ...(existingConfig.card_settings || {}),
          layout: cardLayout,
        },
        portal_buttons: {
          ...(existingConfig.portal_buttons || {}),
          incident_label: incidentLabel || undefined,
          incident_desc:  incidentDesc  || undefined,
          incident_emoji: incidentEmoji || undefined,
          request_label:  requestLabel  || undefined,
          request_desc:   requestDesc   || undefined,
          request_emoji:  requestEmoji  || undefined,
        }
      }

      await companiesService.update(companyId, {
        primary_color:   themeName,
        title_size:      fontScale,
        logo_url:        logoUrl        || null,
        background_url:  backgroundUrl  || null,
        brand_name:      brandName      || null,
        welcome_title:   welcomeTitle   || undefined,
        welcome_subtitle: welcomeSubtitle || undefined,
        bg_color:        bgColor        || undefined,
        greeting_prefix: greetingPrefix || null,
        greeting_color:  greetingColor  || null,
        catalog_ui_config: newConfig,
      })
      await refreshCompany()
      setFeedback({ kind:'ok', msg:'Identidade visual salva e aplicada.' })
    } catch (e) {
      setFeedback({ kind:'err', msg: e instanceof Error ? e.message : 'Falha ao salvar.' })
    } finally {
      setSaving(false)
    }
  }

  // ── Login bg preview style ─────────────────────────────────────────────────

  const loginBgStyle: React.CSSProperties = (() => {
    if (!bgColor) return { background: '#f8fafc' }
    if (bgColor.startsWith('http') || /\.(jpg|jpeg|png|webp|gif|svg)/i.test(bgColor)) {
      return { backgroundImage: `url(${bgColor})`, backgroundSize: 'cover', backgroundPosition: 'center' }
    }
    return { background: bgColor }
  })()

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-8">
      <div className="max-w-3xl mx-auto space-y-8">

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
          {[
            { key:'branding',          label:'Identidade Visual', icon:<Palette className="w-4 h-4" /> },
            { key:'catalog_incidents', label:'Catálogo Incidentes', icon:<LayoutGrid className="w-4 h-4" /> },
            { key:'catalog_requests',  label:'Catálogo Requisições', icon:<ShoppingCart className="w-4 h-4" /> },
            { key:'form_templates',    label:'Formulários', icon:<FileText className="w-4 h-4" /> },
          ].map(tab => (
            <button key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition-all ${activeTab === tab.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* ═══ ABA IDENTIDADE VISUAL ═══ */}
        {activeTab === 'branding' && (
          <div className="space-y-6">

            {/* Card 1 — Identidade */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-3 border-b pb-4 mb-5">
                <ImageIcon className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-900">Identidade da Marca</h2>
              </div>

              <div className="space-y-6">
                {/* Nome da Marca */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Nome da Marca</label>
                  <input
                    type="text"
                    value={brandName}
                    onChange={e => setBrandName(e.target.value)}
                    placeholder="Ex.: Acme Corp"
                    className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                {/* Logo */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Logo da Empresa</label>
                  <FileUploadZone
                    label="Clique para enviar o logotipo"
                    accept={ALLOWED_IMAGE_TYPES.join(',')}
                    currentUrl={logoUrl}
                    uploading={logoUploading}
                    onPickFile={() => logoInputRef.current?.click()}
                    onRemove={() => setLogoUrl('')}
                    inputRef={logoInputRef}
                    onFileChange={handleLogoChange}
                  />
                  <p className="text-xs text-slate-400 mt-2">Recomendado: PNG ou SVG com fundo transparente.</p>
                </div>

                {/* Background do Portal */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Imagem de Fundo do Portal</label>
                  {backgroundUrl ? (
                    <div className="space-y-2">
                      <div className="relative rounded-xl overflow-hidden h-28 border border-slate-200">
                        <img src={backgroundUrl} alt="Background" className="w-full h-full object-cover" />
                        <div className="absolute inset-0 bg-slate-50/80 flex items-center justify-center">
                          <span className="text-xs font-semibold text-slate-600 bg-white/80 px-3 py-1 rounded-full">Prévia com overlay de contraste</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setBackgroundUrl('')}
                          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-slate-800/80 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => bgInputRef.current?.click()}
                        disabled={bgUploading}
                        className="text-xs text-slate-500 hover:text-slate-700 underline"
                      >
                        {bgUploading ? 'Enviando…' : 'Trocar imagem'}
                      </button>
                      <input ref={bgInputRef} type="file" accept={ALLOWED_IMAGE_TYPES.join(',')} className="hidden" onChange={handleBgChange} />
                    </div>
                  ) : (
                    <FileUploadZone
                      label="Clique para enviar imagem de fundo"
                      accept={ALLOWED_IMAGE_TYPES.join(',')}
                      currentUrl=""
                      uploading={bgUploading}
                      onPickFile={() => bgInputRef.current?.click()}
                      onRemove={() => setBackgroundUrl('')}
                      inputRef={bgInputRef}
                      onFileChange={handleBgChange}
                    />
                  )}
                  <p className="text-xs text-slate-400 mt-2">Aplicada na área principal do portal com overlay semitransparente para legibilidade.</p>
                </div>

              </div>
            </div>

            {/* Card 2 — Tema Visual */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-3 border-b pb-4 mb-5">
                <Palette className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-900">Tema Visual</h2>
              </div>

              <div className="space-y-6">
                {/* Theme swatches */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-3">Escolha o tema corporativo</label>

                  {/* Temas Escuros */}
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Sidebar Escura</p>
                  <div className="grid grid-cols-5 gap-2 mb-4">
                    {DARK_THEMES.map(t => {
                      const hex = THEME_HEX_COLORS[t]
                      const sbg = getPortalSidebar(t).bg
                      const active = themeName === t
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setThemeName(t)}
                          className={`p-3 rounded-xl border-2 transition-all text-left ${active ? 'border-slate-900 shadow-md scale-105' : 'border-slate-200 hover:border-slate-300'}`}
                        >
                          <div className="flex items-center gap-1.5 mb-2">
                            <div style={{ background: hex }} className="w-4 h-4 rounded-full flex-shrink-0 shadow-sm" />
                            <div style={{ background: sbg, border: '1px solid rgba(0,0,0,.1)' }} className="w-4 h-4 rounded flex-shrink-0 shadow-sm" />
                          </div>
                          <div className="text-xs font-semibold text-slate-800 leading-tight">{t}</div>
                        </button>
                      )
                    })}
                  </div>

                  {/* Temas Claros */}
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Sidebar Clara</p>
                  <div className="grid grid-cols-5 gap-2">
                    {LIGHT_THEMES.map(t => {
                      const hex = THEME_HEX_COLORS[t]
                      const sbg = getPortalSidebar(t).bg
                      const active = themeName === t
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => setThemeName(t)}
                          className={`p-3 rounded-xl border-2 transition-all text-left ${active ? 'border-slate-900 shadow-md scale-105' : 'border-slate-200 hover:border-slate-300'}`}
                        >
                          <div className="flex items-center gap-1.5 mb-2">
                            <div style={{ background: hex }} className="w-4 h-4 rounded-full flex-shrink-0 shadow-sm" />
                            <div style={{ background: sbg, border: '1px solid rgba(0,0,0,.08)' }} className="w-4 h-4 rounded flex-shrink-0 shadow-sm" />
                          </div>
                          <div className="text-xs font-semibold text-slate-800 leading-tight">{t}</div>
                        </button>
                      )
                    })}
                  </div>
                  <p className="text-xs text-slate-400 mt-2">Define as cores dos botões, cabeçalhos, sidebar e elementos de destaque.</p>
                </div>

                {/* Font scale */}
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-3">Escala da Fonte dos Títulos</label>
                  <div className="grid grid-cols-4 gap-2">
                    {FONT_SCALE_LIST.map(f => {
                      const meta = FONT_SCALE_LABELS[f]
                      const active = fontScale === f
                      return (
                        <button
                          key={f}
                          type="button"
                          onClick={() => setFontScale(f)}
                          className={`py-3 px-2 rounded-xl border-2 text-center transition-all ${active ? 'border-slate-900 bg-slate-50 shadow-sm' : 'border-slate-200 hover:border-slate-300 bg-white'}`}
                        >
                          <div className={`${meta.size} font-black text-slate-900 leading-none mb-1`}>A</div>
                          <div className="text-xs text-slate-500">{meta.label}</div>
                        </button>
                      )
                    })}
                  </div>
                </div>

              </div>
            </div>

            {/* Card 3 — Boas-vindas */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-3 border-b pb-4 mb-5">
                <LayoutGrid className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-900">Mensagem de Boas-vindas</h2>
              </div>
              <p className="text-xs text-slate-400 mb-5">Exibida no topo da área principal do portal</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Título</label>
                  <input
                    type="text"
                    value={welcomeTitle}
                    onChange={e => setWelcomeTitle(e.target.value)}
                    placeholder="Ex.: Bem-vindo ao Portal de Atendimento"
                    className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Subtítulo</label>
                  <input
                    type="text"
                    value={welcomeSubtitle}
                    onChange={e => setWelcomeSubtitle(e.target.value)}
                    placeholder="Ex.: Como podemos ajudar hoje?"
                    className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Card 3.5 — Configurações do Portal */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-3 border-b pb-4 mb-5">
                <LayoutGrid className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-900">Configurações de Saudação e Layout</h2>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Saudação (Prefixo)</label>
                  <input
                    type="text"
                    value={greetingPrefix}
                    onChange={e => setGreetingPrefix(e.target.value)}
                    placeholder="Ex.: Bom dia, Olá"
                    className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Cor da Saudação</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="color"
                      value={greetingColor.startsWith('#') && greetingColor.length === 7 ? greetingColor : '#94a3b8'}
                      onChange={e => setGreetingColor(e.target.value)}
                      className="w-12 h-10 border border-slate-200 rounded-lg cursor-pointer p-0.5 bg-white shrink-0"
                    />
                    <span className="text-sm font-mono text-slate-500">{greetingColor || '#94a3b8'}</span>
                  </div>
                </div>
              </div>
              <div className="mt-4">
                <label className="block text-sm font-medium text-slate-700 mb-1">Layout dos Cards do Portal</label>
                <select
                  value={cardLayout}
                  onChange={e => setCardLayout(e.target.value as 'grid' | 'list')}
                  className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="grid">Grade (Grid)</option>
                  <option value="list">Lista (List)</option>
                </select>
              </div>
            </div>

            {/* Card 3.6 — Customização de Botões Principais */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-3 border-b pb-4 mb-5">
                <LayoutGrid className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-900">Customização dos Botões de Abertura</h2>
              </div>
              
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Botão de Incidente</p>
              <div className="grid grid-cols-3 gap-3 mb-5">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Rótulo do Botão</label>
                  <input
                    type="text"
                    value={incidentLabel}
                    onChange={e => setIncidentLabel(e.target.value)}
                    placeholder="Ex.: Reportar Problema"
                    className="w-full h-9 rounded-lg border border-slate-200 px-3 text-xs focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Emoji</label>
                  <input
                    type="text"
                    value={incidentEmoji}
                    onChange={e => setIncidentEmoji(e.target.value)}
                    placeholder="⚠️"
                    className="w-full h-9 rounded-lg border border-slate-200 px-3 text-xs text-center focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Descrição</label>
                  <input
                    type="text"
                    value={incidentDesc}
                    onChange={e => setIncidentDesc(e.target.value)}
                    placeholder="Algo está com erro, lento ou fora do ar..."
                    className="w-full h-9 rounded-lg border border-slate-200 px-3 text-xs focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Botão de Requisição</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Rótulo do Botão</label>
                  <input
                    type="text"
                    value={requestLabel}
                    onChange={e => setRequestLabel(e.target.value)}
                    placeholder="Ex.: Solicitar Serviço"
                    className="w-full h-9 rounded-lg border border-slate-200 px-3 text-xs focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">Emoji</label>
                  <input
                    type="text"
                    value={requestEmoji}
                    onChange={e => setRequestEmoji(e.target.value)}
                    placeholder="✅"
                    className="w-full h-9 rounded-lg border border-slate-200 px-3 text-xs text-center focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div className="col-span-3">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Descrição</label>
                  <input
                    type="text"
                    value={requestDesc}
                    onChange={e => setRequestDesc(e.target.value)}
                    placeholder="Peça equipamentos, acessos, softwares..."
                    className="w-full h-9 rounded-lg border border-slate-200 px-3 text-xs focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* Card 4 — Fundo da tela de Login */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-3 border-b pb-4 mb-5">
                <Palette className="w-5 h-5 text-indigo-600" />
                <div>
                  <h2 className="text-lg font-bold text-slate-900">Fundo da Tela de Login <span className="text-slate-400 font-normal text-sm">(opcional)</span></h2>
                  <p className="text-xs text-slate-400 mt-0.5">Aparece apenas na tela de login — diferente do fundo do portal.</p>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Imagem, cor ou gradiente</label>
                <input
                  type="text"
                  value={bgColor}
                  onChange={e => setBgColor(e.target.value)}
                  placeholder="https://.../bg.jpg  ou  #f0f4ff  ou  linear-gradient(…)"
                  className="w-full h-10 rounded-lg border border-slate-200 px-3 text-sm focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-xs text-slate-400 mt-1">URL de imagem, cor hex ou gradiente CSS.</p>
              </div>
              {bgColor && (
                <div className="mt-4 rounded-xl overflow-hidden border border-slate-200 h-20 flex items-center justify-center relative" style={loginBgStyle}>
                  {bgColor && (bgColor.startsWith('http') || /\.(jpg|jpeg|png|webp|gif|svg)/i.test(bgColor)) && (
                    <div className="absolute inset-0 bg-black/30" />
                  )}
                  <span className="relative text-xs font-semibold text-white drop-shadow">Prévia do fundo da tela de login</span>
                </div>
              )}
            </div>

            {/* Card 5 — Pré-visualização do Portal */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
              <div className="flex items-center gap-3 border-b pb-4 mb-5">
                <Eye className="w-5 h-5 text-indigo-600" />
                <h2 className="text-lg font-bold text-slate-900">Pré-visualização do Portal</h2>
              </div>
              <p className="text-xs text-slate-400 mb-4">Atualiza em tempo real conforme você edita as opções acima.</p>

              {/* Mini portal */}
              <div style={{ display:'flex', borderRadius:12, overflow:'hidden', border:'1px solid #e2e8f0', height:280, userSelect:'none', boxShadow:'0 2px 8px rgba(15,23,42,.06)' }}>

                {/* Mini sidebar — usa cores do tema selecionado */}
                <div style={{ width:110, background:sb.bg, borderRight:`1px solid ${sb.border}`, display:'flex', flexDirection:'column', flexShrink:0 }}>
                  {/* Logo + company */}
                  <div style={{ padding:'8px 8px 6px', borderBottom:`1px solid ${sb.border}`, textAlign:'center' }}>
                    {logoUrl
                      ? <img src={logoUrl} alt="Logo" style={{ height:18, objectFit:'contain', display:'block', margin:'0 auto 4px' }} />
                      : <div style={{ fontSize:12, marginBottom:4 }}>🖼️</div>
                    }
                    <div style={{ font:'700 8px sans-serif', color:sb.text, letterSpacing:'-.01em' }}>{brandName || 'Empresa'}</div>
                    <div style={{ font:'400 6.5px monospace', color:sb.muted, marginTop:1 }}>Portal do Usuário</div>
                  </div>
                  {/* Nav */}
                  <div style={{ padding:'5px 4px' }}>
                    {([['🏠','Início',true],['🎫','Chamados',false],['📚','Conhec.',false],['📊','Histórico',false]] as const).map(([emoji, label, active]) => (
                      <div key={label} style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 5px', borderRadius:5, background:active?sb.navActiveBg:'transparent', color:active?sb.navActiveText:sb.muted, fontSize:7, fontWeight:600, marginBottom:1 }}>
                        <span style={{ fontSize:9 }}>{emoji}</span>{label}
                        {label==='Chamados' && <span style={{ marginLeft:'auto', background:'#dc2626', color:'#fff', borderRadius:999, padding:'0 4px', fontSize:6, fontWeight:700 }}>3</span>}
                      </div>
                    ))}
                  </div>
                  {/* Chamados ativos */}
                  <div style={{ margin:'4px 5px 0', paddingTop:4, borderTop:`1px solid ${sb.border}` }}>
                    <div style={{ font:'700 6px monospace', color:sb.muted, textTransform:'uppercase', letterSpacing:'.08em', marginBottom:4 }}>Ativos</div>
                    {[['INC-08722','ERP Lento','#d97706'],['REQ-09101','Novo Monitor','#7c3aed'],['INC-08550','VPN Falha','#059669']].map(([id,title,dot]) => (
                      <div key={id} style={{ padding:'4px 5px', background:sb.itemBg, border:`1px solid ${sb.border}`, borderRadius:5, marginBottom:3 }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:1 }}>
                          <span style={{ font:'600 6px monospace', color:sb.ticketNumText }}>{id}</span>
                          <span style={{ width:5, height:5, borderRadius:'50%', background:dot, display:'inline-block' }} />
                        </div>
                        <div style={{ font:'600 7px sans-serif', color:sb.itemText, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{title}</div>
                      </div>
                    ))}
                  </div>
                  {/* Stats */}
                  <div style={{ margin:'4px 5px 0' }}>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:3 }}>
                      <div style={{ padding:'3px 2px', background:'rgba(220,38,38,.10)', border:'1px solid rgba(220,38,38,.18)', borderRadius:4, textAlign:'center' }}>
                        <div style={{ font:'800 10px sans-serif', color:'#ef4444' }}>1</div>
                        <div style={{ font:'700 5px sans-serif', color:'#ef4444', textTransform:'uppercase', marginTop:1 }}>P1</div>
                      </div>
                      <div style={{ padding:'3px 2px', background:'rgba(5,150,105,.10)', border:'1px solid rgba(5,150,105,.18)', borderRadius:4, textAlign:'center' }}>
                        <div style={{ font:'800 10px sans-serif', color:'#10b981' }}>92%</div>
                        <div style={{ font:'700 5px sans-serif', color:'#10b981', textTransform:'uppercase', marginTop:1 }}>SLA</div>
                      </div>
                    </div>
                  </div>
                  {/* User footer */}
                  <div style={{ marginTop:'auto', padding:'5px 6px', borderTop:`1px solid ${sb.border}`, display:'flex', alignItems:'center', gap:4 }}>
                    <div style={{ width:16, height:16, borderRadius:'50%', background:brand, display:'flex', alignItems:'center', justifyContent:'center', font:'700 6px sans-serif', color:'#fff', flexShrink:0 }}>US</div>
                    <div style={{ font:'600 7px sans-serif', color:sb.text }}>Usuário</div>
                    <span style={{ marginLeft:'auto', fontSize:9, color:sb.muted }}>⚙️</span>
                  </div>
                </div>

                {/* Mini main */}
                <div style={{
                  flex:1, display:'flex', flexDirection:'column', overflow:'hidden',
                  background: backgroundUrl
                    ? `linear-gradient(rgba(248,250,252,0.92),rgba(248,250,252,0.92)),url("${backgroundUrl}") center/cover`
                    : '#f8fafc',
                }}>
                  {/* Top bar */}
                  <div style={{ background:'rgba(255,255,255,.95)', borderBottom:'1px solid #e2e8f0', padding:'6px 10px', flexShrink:0 }}>
                    <div style={{ font:'400 6.5px sans-serif', color: greetingColor || '#94a3b8', marginBottom:1 }}>{greetingPrefix || 'Bom dia ☀️'}</div>
                    <div style={{ font:'800 10px sans-serif', color:'#0f172a', letterSpacing:'-.01em' }}>{welcomeTitle || 'Como posso te ajudar?'}</div>
                  </div>
                  {/* Search */}
                  <div style={{ background:'rgba(255,255,255,.9)', borderBottom:'1px solid #e2e8f0', padding:'5px 10px', flexShrink:0 }}>
                    <div style={{ background:'#f8fafc', border:'1.5px solid #e2e8f0', borderRadius:6, height:18, display:'flex', alignItems:'center', padding:'0 7px', gap:4 }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2" style={{ width:8, height:8, flexShrink:0 }}><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                      <span style={{ font:'400 6.5px sans-serif', color:'#94a3b8' }}>Busque um problema ou serviço…</span>
                    </div>
                  </div>
                  {/* Content */}
                  <div style={{ flex:1, padding:'7px 10px', overflow:'hidden' }}>
                    <div style={{ font:'700 8px sans-serif', color:'#0f172a', marginBottom:5 }}>O que você precisa?</div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:5, marginBottom:7 }}>
                      <div style={{ padding:7, background:'rgba(255,255,255,.95)', border:'1.5px solid #fecaca', borderRadius:7 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:3 }}>
                          <div style={{ width:16, height:16, borderRadius:4, background:'#fee2e2', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, flexShrink:0 }}>
                            {incidentEmoji || '⚠️'}
                          </div>
                          <div style={{ font:'700 7px sans-serif', color:'#dc2626', lineHeight:1.2 }}>{incidentLabel || 'Reportar Problema'}</div>
                        </div>
                        <div style={{ font:'700 6.5px sans-serif', color:'#dc2626' }}>{(incidentLabel || 'Abrir incidente') + ' →'}</div>
                      </div>
                      <div style={{ padding:7, background:'rgba(255,255,255,.95)', border:`1.5px solid ${hexToRgba(brand,0.3)}`, borderRadius:7 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:3 }}>
                          <div style={{ width:16, height:16, borderRadius:4, background:hexToRgba(brand,0.12), display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, flexShrink:0 }}>
                            {requestEmoji || '✅'}
                          </div>
                          <div style={{ font:'700 7px sans-serif', color:brand, lineHeight:1.2 }}>{requestLabel || 'Solicitar Serviço'}</div>
                        </div>
                        <div style={{ font:'700 6.5px sans-serif', color:brand }}>{(requestLabel || 'Ver catálogo') + ' →'}</div>
                      </div>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns: cardLayout === 'list' ? '1fr' : '1fr 1fr 1fr', gap:4 }}>
                      {[['🧑‍💼','RH','#eff6ff'],['🛒','Compras','#fef9c3'],['📚','Conhecimento','#f5f3ff']].map(([e,n,bg]) => (
                        <div key={n} style={{ display:'flex', flexDirection: cardLayout === 'list' ? 'row' : 'column', alignItems:'center', gap: cardLayout === 'list' ? 6 : 2, padding:5, background:'rgba(255,255,255,.9)', border:'1px solid #e2e8f0', borderRadius:5 }}>
                          <div style={{ width:16, height:16, borderRadius:4, background:bg as string, display:'flex', alignItems:'center', justifyContent:'center', fontSize:9, flexShrink:0 }}>{e}</div>
                          <div style={{ font:'600 6px sans-serif', color:'#0f172a', whiteSpace:'nowrap' }}>{n}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ═══ ABAS CATÁLOGO ═══ */}
        {['catalog_incidents', 'catalog_requests', 'form_templates'].includes(activeTab) && (
          companyId
            ? <CatalogManager
                companyId={companyId}
                section={activeTab === 'catalog_requests' ? 'request' : activeTab === 'form_templates' ? 'templates' : 'incident'}
              />
            : <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-400">Faça login como admin para gerenciar o catálogo.</div>
        )}

      </div>
    </div>
  )
}

export default AdminPortalSettings
