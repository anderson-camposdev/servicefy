import { useEffect, useState } from 'react'
import { Save, SlidersHorizontal } from 'lucide-react'
import { parseCatalogUiConfig, type CatalogUiConfig } from '../lib/catalogUiConfig'
import type { Json } from '../lib/database.types'
import CatalogIcon from './CatalogIcon'

interface CatalogCardCanvasProps {
  name: string
  icon?: string | null
  value?: Json | null
  color?: string
  onSave: (config: CatalogUiConfig) => Promise<void>
}

const buttonSizeClasses = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-sm',
}

export default function CatalogCardCanvas({ name, icon, value, color = '#4f46e5', onSave }: CatalogCardCanvasProps) {
  const [config, setConfig] = useState(() => parseCatalogUiConfig(value))
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    setConfig(parseCatalogUiConfig(value))
    setMessage(null)
  }, [value])

  const buttonStyle = config.buttonStyle === 'solid'
    ? { backgroundColor: color, color: '#fff', borderColor: color }
    : config.buttonStyle === 'outline'
      ? { color, borderColor: color, backgroundColor: '#fff' }
      : { color, borderColor: 'transparent', backgroundColor: 'transparent' }

  const save = async () => {
    setSaving(true)
    setMessage(null)
    try {
      await onSave(config)
      setMessage('Configuração visual salva.')
    } catch {
      setMessage('Não foi possível salvar o layout.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="mt-3 rounded-2xl border border-violet-200 bg-violet-50/50 p-4">
      <div className="flex items-center gap-2">
        <SlidersHorizontal className="h-4 w-4 text-violet-600" />
        <div>
          <h4 className="text-sm font-bold text-slate-800">Canvas do Card</h4>
          <p className="text-xs text-slate-500">Ajuste a presença da imagem e o botão exibido no Portal.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">
            <span className="flex items-center justify-between text-xs font-bold text-slate-600">
              Tamanho do ícone
              <b className="text-violet-700">{config.iconSize}px</b>
            </span>
            <input
              type="range"
              min={64}
              max={160}
              step={8}
              value={config.iconSize}
              onChange={event => setConfig(current => ({ ...current, iconSize: Number(event.target.value) }))}
              className="mt-2 w-full accent-violet-600"
            />
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-bold text-slate-600">Estilo do botão</span>
            <select value={config.buttonStyle} onChange={event => setConfig(current => ({ ...current, buttonStyle: event.target.value as CatalogUiConfig['buttonStyle'] }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="solid">Preenchido</option>
              <option value="outline">Contorno</option>
              <option value="ghost">Discreto</option>
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-bold text-slate-600">Tamanho do botão</span>
            <select value={config.buttonSize} onChange={event => setConfig(current => ({ ...current, buttonSize: event.target.value as CatalogUiConfig['buttonSize'] }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="sm">Pequeno</option>
              <option value="md">Médio</option>
              <option value="lg">Grande</option>
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-bold text-slate-600">Posição do botão</span>
            <select value={config.buttonPosition} onChange={event => setConfig(current => ({ ...current, buttonPosition: event.target.value as CatalogUiConfig['buttonPosition'] }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
              <option value="bottom">Abaixo do conteúdo</option>
              <option value="right">Lateral direita</option>
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-xs font-bold text-slate-600">Texto do botão</span>
            <input value={config.buttonLabel} maxLength={32} onChange={event => setConfig(current => ({ ...current, buttonLabel: event.target.value }))} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
          </label>
        </div>

        <div className={`flex min-h-48 items-center gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ${config.buttonPosition === 'bottom' ? 'flex-wrap' : ''}`}>
          <CatalogIcon icon={icon} name={name} size={config.iconSize} />
          <div className="min-w-0 flex-1">
            <div className="font-bold text-slate-800">{name}</div>
            <div className="mt-1 text-xs text-slate-400">Prévia do item no Portal</div>
            {config.buttonPosition === 'bottom' && (
              <span className={`mt-3 inline-flex rounded-lg border font-bold ${buttonSizeClasses[config.buttonSize]}`} style={buttonStyle}>{config.buttonLabel}</span>
            )}
          </div>
          {config.buttonPosition === 'right' && (
            <span className={`shrink-0 rounded-lg border font-bold ${buttonSizeClasses[config.buttonSize]}`} style={buttonStyle}>{config.buttonLabel}</span>
          )}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-violet-100 pt-4">
        <span className={`text-xs ${message?.includes('salva') ? 'text-emerald-600' : 'text-red-600'}`}>{message}</span>
        <button type="button" onClick={save} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-60">
          <Save className="h-3.5 w-3.5" /> {saving ? 'Salvando...' : 'Salvar Canvas'}
        </button>
      </div>
    </section>
  )
}

