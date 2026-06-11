export default function CatalogIcon({ icon, name, size = 64 }: { icon?: string | null; name?: string; size?: number }) {
  const isImage = Boolean(icon && /^(https?:\/\/|blob:|data:image\/)/i.test(icon))

  if (isImage) {
    return (
      <span
        style={{ width: size, height: size }}
        className="inline-flex shrink-0 overflow-hidden rounded-xl bg-transparent"
      >
        <img
          src={icon!}
          alt={name ? `Ícone de ${name}` : 'Ícone do catálogo'}
          className="block h-full w-full rounded-xl object-cover"
        />
      </span>
    )
  }

  if (icon) {
    return (
      <span
        style={{ width: size, height: size, fontSize: size * 0.52 }}
        className="inline-flex shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700"
      >
        {icon}
      </span>
    )
  }

  return (
    <span
      style={{ width: size, height: size, fontSize: size * 0.38 }}
      className="inline-flex shrink-0 items-center justify-center rounded-xl bg-indigo-50 font-black text-indigo-500"
    >
      {(name ?? '?').charAt(0).toUpperCase()}
    </span>
  )
}
