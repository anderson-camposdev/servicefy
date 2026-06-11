import { useEffect, useRef, useState } from 'react'
import { ImagePlus, LoaderCircle, Upload } from 'lucide-react'
import { serviceCatalogService } from '../lib/services'
import CatalogIcon from './CatalogIcon'

interface IconUploadProps {
  value?: string | null
  onChange: (value: string) => void
  companyId: string
  compact?: boolean
}

const MAX_ICON_SIZE = 5 * 1024 * 1024

export default function IconUpload({ value, onChange, companyId, compact = false }: IconUploadProps) {
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview)
    }
  }, [preview])

  const upload = async (file?: File) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      alert('Selecione um arquivo de imagem.')
      return
    }
    if (file.size > MAX_ICON_SIZE) {
      alert('O ícone deve ter no máximo 5 MB.')
      return
    }

    if (preview) URL.revokeObjectURL(preview)
    const localPreview = URL.createObjectURL(file)
    setPreview(localPreview)
    setBusy(true)

    try {
      const url = await serviceCatalogService.uploadIcon(companyId, file)
      onChange(url)
      setPreview(null)
      URL.revokeObjectURL(localPreview)
    } catch (error) {
      setPreview(null)
      URL.revokeObjectURL(localPreview)
      alert(`Falha no upload do ícone: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const openPicker = () => {
    if (!busy) inputRef.current?.click()
  }

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <CatalogIcon icon={preview ?? value} size={34} />
        <button
          type="button"
          onClick={openPicker}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:border-indigo-200 hover:text-indigo-600 disabled:cursor-wait disabled:opacity-60"
        >
          {busy ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
          {busy ? 'Enviando' : value ? 'Trocar ícone' : 'Upload de ícone'}
        </button>
        <input ref={inputRef} type="file" accept="image/*" onChange={event => upload(event.target.files?.[0])} className="hidden" />
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={openPicker}
        onDragEnter={event => {
          event.preventDefault()
          if (!busy) setDragging(true)
        }}
        onDragOver={event => event.preventDefault()}
        onDragLeave={event => {
          event.preventDefault()
          setDragging(false)
        }}
        onDrop={event => {
          event.preventDefault()
          setDragging(false)
          if (!busy) upload(event.dataTransfer.files?.[0])
        }}
        disabled={busy}
        className={`flex w-full items-center gap-4 rounded-xl border border-dashed p-4 text-left transition-all ${
          dragging
            ? 'border-indigo-400 bg-indigo-50'
            : 'border-slate-300 bg-white hover:border-indigo-300 hover:bg-indigo-50/40'
        } disabled:cursor-wait`}
      >
        <CatalogIcon icon={preview ?? value} size={64} />
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-sm font-bold text-slate-700">
            {busy ? <LoaderCircle className="h-4 w-4 animate-spin text-indigo-600" /> : <Upload className="h-4 w-4 text-indigo-600" />}
            {busy ? 'Enviando ícone...' : value ? 'Alterar ícone' : 'Upload de ícone'}
          </span>
          <span className="mt-0.5 block text-xs text-slate-400">Clique ou arraste uma imagem PNG, JPG, WebP ou SVG.</span>
        </span>
        <input ref={inputRef} type="file" accept="image/*" onChange={event => upload(event.target.files?.[0])} className="hidden" />
      </button>
    </div>
  )
}
