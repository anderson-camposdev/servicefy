import { LucideIcon, ChevronRight } from 'lucide-react'
import * as Icons from 'lucide-react'
import type { Json } from '../lib/database.types'

export type ThemeStyle = 'minimalist' | 'modern_3d' | 'sephora_legacy'
export type IconType = 'lucide' | 'emoji' | 'image' | '3d'

export interface CatalogUIConfig {
  theme?: ThemeStyle
  iconType?: IconType
  iconValue?: string
  accentColor?: string
  description?: string
}

interface ServiceCardProps {
  title: string
  description?: string | null
  iconName?: string | null
  uiConfig?: Json | null
  onClick: () => void
  disabled?: boolean
  className?: string
  defaultTheme?: ThemeStyle
  fallbackAccentColor?: string
}

export default function ServiceCard({
  title,
  description,
  iconName,
  uiConfig,
  onClick,
  disabled = false,
  className = '',
  defaultTheme = 'minimalist',
  fallbackAccentColor = '#0ea5e9'
}: ServiceCardProps) {
  // Parse UI Config
  const config = (uiConfig as CatalogUIConfig) || {}
  const theme = config.theme || defaultTheme
  const iconType = config.iconType || 'lucide'
  const iconValue = config.iconValue || iconName || 'Box'
  const accentColor = config.accentColor || fallbackAccentColor

  // Render Icon
  const renderIcon = () => {
    if (iconType === 'emoji') {
      return <span className="text-3xl" style={{ filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}>{iconValue}</span>
    }
    if (iconType === 'image' || iconType === '3d') {
      return <img src={iconValue} alt="" className="w-12 h-12 object-contain filter drop-shadow-md" />
    }
    // Default to Lucide
    const IconCmp = (Icons as Record<string, any>)[iconValue] || Icons.Box
    return <IconCmp className="w-8 h-8" style={{ color: accentColor }} />
  }

  // MINIMALIST THEME (Allied IT style)
  if (theme === 'minimalist') {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={`group relative text-left bg-white border border-slate-200 rounded-xl p-5 md:p-6 shadow-sm hover:shadow-md transition-all duration-300 transform hover:-translate-y-1 ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
        } ${className}`}
        style={{ '--accent': accentColor } as React.CSSProperties}
      >
        <div className="absolute inset-0 rounded-xl ring-2 ring-transparent group-hover:ring-[var(--accent)] transition-all opacity-20 pointer-events-none" />
        
        <div className="flex items-start gap-4 h-full flex-col">
          <div 
            className="p-3 rounded-lg flex items-center justify-center transition-colors"
            style={{ backgroundColor: `${accentColor}15` }} // 15 is hex opacity (approx 8%)
          >
            {renderIcon()}
          </div>
          <div className="flex-1 w-full">
            <h3 className="font-semibold text-slate-900 text-lg mb-2 line-clamp-2" title={title}>
              {title}
            </h3>
            {(description || config.description) && (
              <p className="text-slate-500 text-sm line-clamp-3 leading-relaxed">
                {config.description || description}
              </p>
            )}
          </div>
          <div className="mt-auto pt-4 flex items-center gap-2 text-sm font-medium transition-colors" style={{ color: accentColor }}>
            Acessar <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </div>
        </div>
      </button>
    )
  }

  // MODERN 3D / GLASSMORPHISM THEME
  if (theme === 'modern_3d') {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={`group relative text-left overflow-hidden rounded-2xl p-6 transition-all duration-300 transform hover:scale-[1.02] ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-xl hover:shadow-[var(--accent)]/20'
        } ${className}`}
        style={{ 
          '--accent': accentColor,
          background: `linear-gradient(145deg, #ffffff 0%, ${accentColor}08 100%)`,
          border: '1px solid rgba(255,255,255,0.6)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.05)',
          backdropFilter: 'blur(10px)'
        } as React.CSSProperties}
      >
        <div className="absolute -right-6 -top-6 w-24 h-24 rounded-full blur-2xl opacity-20 transition-opacity group-hover:opacity-40" style={{ backgroundColor: accentColor }} />
        
        <div className="relative z-10 flex flex-col h-full items-center text-center">
          <div className="mb-4 transform group-hover:-translate-y-2 group-hover:scale-110 transition-transform duration-300 drop-shadow-sm">
            {renderIcon()}
          </div>
          <h3 className="font-bold text-slate-800 text-lg mb-2" title={title}>
            {title}
          </h3>
          {(description || config.description) && (
            <p className="text-slate-500 text-sm line-clamp-2">
              {config.description || description}
            </p>
          )}
        </div>
      </button>
    )
  }

  // FALLBACK (Just in case)
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`text-left bg-white p-4 rounded-lg border border-gray-200 shadow hover:border-blue-500 ${className}`}
    >
      <div className="font-bold">{title}</div>
      <div className="text-sm text-gray-500">{description}</div>
    </button>
  )
}
