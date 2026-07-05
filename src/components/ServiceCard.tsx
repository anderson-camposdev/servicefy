import { ChevronRight } from 'lucide-react'
import * as Icons from 'lucide-react'
import type { Json } from '../lib/database.types'

export type ThemeStyle = 'minimalist' | 'modern_3d' | 'sephora_legacy' | 'image_fullcard'
export type IconType = 'lucide' | 'emoji' | 'image' | '3d'

export interface CatalogUIConfig {
  theme?: ThemeStyle
  iconType?: IconType
  iconValue?: string
  accentColor?: string
  description?: string
  card_settings?: {
    icon_size?: 'small' | 'medium' | 'large' | 'xlarge'
    font_size?: 'small' | 'medium' | 'large'
    icon_bg_color?: string   // background color of the icon container
    label_color?: string     // color of the pill/title label text
    label_bg_color?: string  // background color of the pill label
  }
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

  // Determine global card styling
  const iconSizeConfig = config.card_settings?.icon_size || 'medium'
  const fontSizeConfig = config.card_settings?.font_size || 'medium'
  const iconBgColor = config.card_settings?.icon_bg_color || null   // null = use accent
  const labelColor = config.card_settings?.label_color || '#ffffff'
  const labelBgColor = config.card_settings?.label_bg_color || 'rgba(0,0,0,0.82)'

  // Map icon_size to Tailwind classes for icon container
  const getIconContainerClass = () => {
    switch (iconSizeConfig) {
      case 'small': return 'w-12 h-12'
      case 'large': return 'w-24 h-24'
      case 'xlarge': return 'w-32 h-32'
      case 'medium':
      default:
        return 'w-16 h-16'
    }
  }

  // Map icon_size to Tailwind classes for the icon itself (Lucide)
  const getIconClass = () => {
    switch (iconSizeConfig) {
      case 'small': return 'w-6 h-6'
      case 'large': return 'w-12 h-12'
      case 'xlarge': return 'w-20 h-20'
      case 'medium':
      default:
        return 'w-9 h-9'
    }
  }

  // Map icon_size to font-size for emojis
  const getEmojiFontSize = () => {
    switch (iconSizeConfig) {
      case 'small': return '1.5rem'
      case 'large': return '3rem'
      case 'xlarge': return '4.5rem'
      case 'medium':
      default:
        return '2.25rem'
    }
  }

  // Map font_size to Tailwind classes for title
  const getTitleClass = () => {
    switch (fontSizeConfig) {
      case 'small': return 'text-base'
      case 'large': return 'text-xl'
      case 'medium':
      default:
        return 'text-lg'
    }
  }

  // Render Icon
  const renderIcon = (isBig: boolean = false) => {
    const isImage = Boolean(iconValue && /^(https?:\/\/|blob:|data:image\/)/i.test(iconValue))
    const isLucide = Boolean(iconValue && iconValue.startsWith('lucide:'))

    if (isImage) {
      return <img src={iconValue} alt="" className={`${isBig ? 'w-full h-full' : 'w-[80%] h-[80%]'} object-contain filter drop-shadow-md`} />
    }
    
    const isEmojiStr = Boolean(iconValue && !isLucide && /\p{Extended_Pictographic}/u.test(iconValue))

    if (iconType === 'emoji' || isEmojiStr) {
      return (
        <span style={{ fontSize: getEmojiFontSize(), lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.1))' }}>
          {iconValue}
        </span>
      )
    }

    // Default to Lucide
    const iconNameStr = isLucide ? iconValue.replace('lucide:', '') : iconValue
    const IconCmp = (Icons as Record<string, any>)[iconNameStr] || Icons.Box
    return <IconCmp className={getIconClass()} style={{ color: accentColor }} />
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
            className={`${getIconContainerClass()} rounded-lg flex items-center justify-center transition-colors shrink-0`}
            style={{ backgroundColor: iconBgColor || `${accentColor}15` }}
          >
            {renderIcon()}
          </div>
          <div className="flex-1 w-full">
            <h3 className={`font-semibold text-slate-900 ${getTitleClass()} mb-2 line-clamp-2`} title={title}>
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
          <div className={`${getIconContainerClass()} rounded-xl flex items-center justify-center border border-slate-100 group-hover:scale-105 transition-transform shrink-0`}
            style={{ backgroundColor: iconBgColor || '#f8fafc' }}
          >
            {renderIcon()}
          </div>
          <h3 className={`font-bold text-slate-800 ${getTitleClass()} mb-2 mt-4`} title={title}>
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

  // IMAGE FULLCARD THEME (large image fills card, dark pill label)
  if (theme === 'image_fullcard') {
    const isImage = Boolean(iconValue && /^(https?:\/\/|blob:|data:image\/)/i.test(iconValue))
    const isLucide = Boolean(iconValue && iconValue.startsWith('lucide:'))
    const isEmojiStr = Boolean(iconValue && !isLucide && /\p{Extended_Pictographic}/u.test(iconValue))

    return (
      <button
        onClick={onClick}
        disabled={disabled}
        className={`group relative text-left overflow-hidden rounded-2xl transition-all duration-300 ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-2xl hover:-translate-y-1'
        } ${className}`}
        style={{
          border: '2px solid rgba(0,0,0,0.08)',
          aspectRatio: '1 / 1',
          minHeight: '160px'
        }}
      >
        {/* Image / Icon fills entire card */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ backgroundColor: iconBgColor || '#f1f5f9' }}
        >
          {isImage ? (
            <img
              src={iconValue}
              alt={title}
              className="w-full h-full object-contain p-4 transition-transform duration-300 group-hover:scale-105"
            />
          ) : isEmojiStr || iconType === 'emoji' ? (
            <span style={{ fontSize: '5rem', lineHeight: 1 }}>{iconValue}</span>
          ) : (
            (() => {
              const iconNameStr = isLucide ? iconValue.replace('lucide:', '') : iconValue
              const IconCmp = (Icons as Record<string, any>)[iconNameStr] || Icons.Box
              return <IconCmp style={{ width: '50%', height: '50%', color: accentColor }} />
            })()
          )}
        </div>

        {/* Dark pill label at bottom */}
        <div className="absolute bottom-0 left-0 right-0 flex items-end justify-center pb-3 px-3">
          <span
            className="px-3 py-1.5 rounded-full font-bold text-sm text-center leading-tight max-w-full transition-all duration-300 group-hover:scale-105"
            style={{ backgroundColor: labelBgColor, color: labelColor, backdropFilter: 'blur(4px)' }}
          >
            {title}
          </span>
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
