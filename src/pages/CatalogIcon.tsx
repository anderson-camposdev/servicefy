import * as Icons from 'lucide-react'

/**
 * Renderiza o ícone de um item do catálogo de serviços.
 *
 * Suporta:
 *  1. URLs de imagem (https://, blob:, data:image/)
 *  2. Ícones Lucide com prefixo explícito (ex: "lucide:Monitor")
 *  3. Nomes de ícones Lucide sem prefixo (ex: "Network", "Wifi", "Monitor")
 *  4. Emojis / texto curto (ex: "🖥️")
 *  5. Fallback: primeira letra do nome em maiúsculo
 */
export default function CatalogIcon({ icon, name, size = 64, bg, color }: { icon?: string | null; name?: string; size?: number; bg?: string; color?: string }) {
  const isImage = Boolean(icon && /^(https?:\/\/|blob:|data:image\/)/i.test(icon))
  const isLucideExplicit = Boolean(icon && icon.startsWith('lucide:'))

  // Detecta se o valor é um nome de componente Lucide sem o prefixo "lucide:"
  // Ex: "Network", "Wifi", "Monitor", "HardDrive", etc.
  const isLucideImplicit = Boolean(
    icon &&
    !isImage &&
    !isLucideExplicit &&
    /^[A-Z][a-zA-Z0-9]*$/.test(icon) &&
    (Icons as any)[icon]
  )

  const customStyle = {
    width: size,
    height: size,
    ...(bg ? { backgroundColor: bg } : {}),
    ...(color ? { color } : {}),
  }

  if (isImage) {
    return (
      <span
        style={{ width: size, height: size, ...(bg ? { backgroundColor: bg } : {}) }}
        className="inline-flex shrink-0 overflow-hidden rounded-xl"
      >
        <img
          src={icon!}
          alt={name ? `Ícone de ${name}` : 'Ícone do catálogo'}
          className="block h-full w-full rounded-xl object-cover"
        />
      </span>
    )
  }

  if (isLucideExplicit || isLucideImplicit) {
    const iconName = isLucideExplicit ? icon!.replace('lucide:', '') : icon!
    const Cmp = (Icons as any)[iconName] || Icons.Box
    return (
      <span
        style={customStyle}
        className="inline-flex shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"
      >
        <Cmp style={{ width: size * 0.6, height: size * 0.6 }} />
      </span>
    )
  }

  if (icon) {
    return (
      <span
        style={{ ...customStyle, fontSize: size * 0.52 }}
        className="inline-flex shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"
      >
        {icon}
      </span>
    )
  }

  return (
    <span
      style={{ ...customStyle, fontSize: size * 0.38 }}
      className="inline-flex shrink-0 items-center justify-center rounded-xl bg-indigo-50 font-black text-indigo-500"
    >
      {(name ?? '?').charAt(0).toUpperCase()}
    </span>
  )
}
