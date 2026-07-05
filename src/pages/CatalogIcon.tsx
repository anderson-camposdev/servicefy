import * as Icons from 'lucide-react'

export default function CatalogIcon({ icon, name, size = 64, bg, color }: { icon?: string | null; name?: string; size?: number; bg?: string; color?: string }) {
  const isImage = Boolean(icon && /^(https?:\/\/|blob:|data:image\/)/i.test(icon))
  const isLucide = Boolean(icon && icon.startsWith('lucide:'))

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

  if (isLucide) {
    const iconName = icon!.replace('lucide:', '')
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
