export type ThemeName =
  | 'Ocean'
  | 'Midnight'
  | 'Emerald'
  | 'Ruby'
  | 'Amethyst'
  | 'Sunset'
  | 'CorporateBlue'
  | 'Graphite'
  | 'Crimson'
  | 'Forest'
  | 'Pearl'
  | 'Breeze'
  | 'Meadow'
  | 'Blush'
  | 'Stone';

export type FontScale = 'compact' | 'standard' | 'large' | 'display';

export interface ThemeTokens {
  headerBg: string;
  headerBorder: string;
  headerText: string;
  primaryBg: string;
  primaryHover: string;
  primaryText: string;
  primaryRing: string;
  textAccent: string;
  textMuted: string;
  cardBg: string;
  cardBorder: string;
  iconBg: string;
}

const themes: Record<ThemeName, ThemeTokens> = {
  // ── Temas Escuros ───────────────────────────────────────────────────────────
  Ocean: {
    headerBg: 'bg-blue-950/60',
    headerBorder: 'border-blue-800/30',
    headerText: 'text-white',
    primaryBg: 'bg-blue-600',
    primaryHover: 'hover:bg-blue-700',
    primaryText: 'text-white',
    primaryRing: 'ring-blue-500',
    textAccent: 'text-blue-400',
    textMuted: 'text-blue-200/80',
    cardBg: 'bg-white',
    cardBorder: 'border-slate-200',
    iconBg: 'bg-blue-100 text-blue-600',
  },
  Midnight: {
    headerBg: 'bg-slate-950/70',
    headerBorder: 'border-slate-800/50',
    headerText: 'text-white',
    primaryBg: 'bg-indigo-600',
    primaryHover: 'hover:bg-indigo-700',
    primaryText: 'text-white',
    primaryRing: 'ring-indigo-500',
    textAccent: 'text-indigo-400',
    textMuted: 'text-slate-400',
    cardBg: 'bg-white',
    cardBorder: 'border-slate-200',
    iconBg: 'bg-indigo-100 text-indigo-600',
  },
  Emerald: {
    headerBg: 'bg-emerald-950/60',
    headerBorder: 'border-emerald-800/40',
    headerText: 'text-white',
    primaryBg: 'bg-emerald-600',
    primaryHover: 'hover:bg-emerald-700',
    primaryText: 'text-white',
    primaryRing: 'ring-emerald-500',
    textAccent: 'text-emerald-400',
    textMuted: 'text-emerald-200/80',
    cardBg: 'bg-white',
    cardBorder: 'border-slate-200',
    iconBg: 'bg-emerald-100 text-emerald-600',
  },
  Ruby: {
    headerBg: 'bg-rose-950/60',
    headerBorder: 'border-rose-900/40',
    headerText: 'text-white',
    primaryBg: 'bg-rose-600',
    primaryHover: 'hover:bg-rose-700',
    primaryText: 'text-white',
    primaryRing: 'ring-rose-500',
    textAccent: 'text-rose-400',
    textMuted: 'text-rose-200/80',
    cardBg: 'bg-white',
    cardBorder: 'border-slate-200',
    iconBg: 'bg-rose-100 text-rose-600',
  },
  Amethyst: {
    headerBg: 'bg-purple-950/60',
    headerBorder: 'border-purple-900/40',
    headerText: 'text-white',
    primaryBg: 'bg-purple-600',
    primaryHover: 'hover:bg-purple-700',
    primaryText: 'text-white',
    primaryRing: 'ring-purple-500',
    textAccent: 'text-purple-400',
    textMuted: 'text-purple-200/80',
    cardBg: 'bg-white',
    cardBorder: 'border-slate-200',
    iconBg: 'bg-purple-100 text-purple-600',
  },
  Sunset: {
    headerBg: 'bg-amber-950/60',
    headerBorder: 'border-amber-900/40',
    headerText: 'text-white',
    primaryBg: 'bg-orange-600',
    primaryHover: 'hover:bg-orange-700',
    primaryText: 'text-white',
    primaryRing: 'ring-orange-500',
    textAccent: 'text-orange-400',
    textMuted: 'text-amber-200/80',
    cardBg: 'bg-white',
    cardBorder: 'border-slate-200',
    iconBg: 'bg-orange-100 text-orange-600',
  },
  CorporateBlue: {
    headerBg: 'bg-slate-900/60',
    headerBorder: 'border-slate-700/50',
    headerText: 'text-white',
    primaryBg: 'bg-sky-600',
    primaryHover: 'hover:bg-sky-700',
    primaryText: 'text-white',
    primaryRing: 'ring-sky-500',
    textAccent: 'text-sky-400',
    textMuted: 'text-slate-300',
    cardBg: 'bg-white',
    cardBorder: 'border-slate-200',
    iconBg: 'bg-sky-100 text-sky-600',
  },
  Graphite: {
    headerBg: 'bg-zinc-950/60',
    headerBorder: 'border-zinc-800/40',
    headerText: 'text-white',
    primaryBg: 'bg-zinc-700',
    primaryHover: 'hover:bg-zinc-800',
    primaryText: 'text-white',
    primaryRing: 'ring-zinc-500',
    textAccent: 'text-zinc-400',
    textMuted: 'text-zinc-400',
    cardBg: 'bg-white',
    cardBorder: 'border-zinc-200',
    iconBg: 'bg-zinc-100 text-zinc-600',
  },
  Crimson: {
    headerBg: 'bg-red-950/60',
    headerBorder: 'border-red-900/40',
    headerText: 'text-white',
    primaryBg: 'bg-red-700',
    primaryHover: 'hover:bg-red-800',
    primaryText: 'text-white',
    primaryRing: 'ring-red-600',
    textAccent: 'text-red-400',
    textMuted: 'text-red-200/80',
    cardBg: 'bg-white',
    cardBorder: 'border-slate-200',
    iconBg: 'bg-red-100 text-red-700',
  },
  Forest: {
    headerBg: 'bg-teal-950/60',
    headerBorder: 'border-teal-900/40',
    headerText: 'text-white',
    primaryBg: 'bg-teal-700',
    primaryHover: 'hover:bg-teal-800',
    primaryText: 'text-white',
    primaryRing: 'ring-teal-600',
    textAccent: 'text-teal-400',
    textMuted: 'text-teal-200/80',
    cardBg: 'bg-white',
    cardBorder: 'border-slate-200',
    iconBg: 'bg-teal-100 text-teal-700',
  },
  // ── Temas Claros ────────────────────────────────────────────────────────────
  Pearl: {
    headerBg: 'bg-slate-50',
    headerBorder: 'border-slate-200',
    headerText: 'text-slate-900',
    primaryBg: 'bg-indigo-600',
    primaryHover: 'hover:bg-indigo-700',
    primaryText: 'text-white',
    primaryRing: 'ring-indigo-500',
    textAccent: 'text-indigo-600',
    textMuted: 'text-slate-500',
    cardBg: 'bg-white',
    cardBorder: 'border-slate-200',
    iconBg: 'bg-indigo-100 text-indigo-600',
  },
  Breeze: {
    headerBg: 'bg-sky-50',
    headerBorder: 'border-sky-200',
    headerText: 'text-sky-900',
    primaryBg: 'bg-sky-500',
    primaryHover: 'hover:bg-sky-600',
    primaryText: 'text-white',
    primaryRing: 'ring-sky-400',
    textAccent: 'text-sky-600',
    textMuted: 'text-sky-800/60',
    cardBg: 'bg-white',
    cardBorder: 'border-sky-100',
    iconBg: 'bg-sky-100 text-sky-600',
  },
  Meadow: {
    headerBg: 'bg-green-50',
    headerBorder: 'border-green-200',
    headerText: 'text-green-900',
    primaryBg: 'bg-green-600',
    primaryHover: 'hover:bg-green-700',
    primaryText: 'text-white',
    primaryRing: 'ring-green-500',
    textAccent: 'text-green-700',
    textMuted: 'text-green-800/60',
    cardBg: 'bg-white',
    cardBorder: 'border-green-100',
    iconBg: 'bg-green-100 text-green-700',
  },
  Blush: {
    headerBg: 'bg-rose-50',
    headerBorder: 'border-rose-200',
    headerText: 'text-rose-900',
    primaryBg: 'bg-rose-500',
    primaryHover: 'hover:bg-rose-600',
    primaryText: 'text-white',
    primaryRing: 'ring-rose-400',
    textAccent: 'text-rose-600',
    textMuted: 'text-rose-800/60',
    cardBg: 'bg-white',
    cardBorder: 'border-rose-100',
    iconBg: 'bg-rose-100 text-rose-600',
  },
  Stone: {
    headerBg: 'bg-stone-50',
    headerBorder: 'border-stone-200',
    headerText: 'text-stone-900',
    primaryBg: 'bg-amber-600',
    primaryHover: 'hover:bg-amber-700',
    primaryText: 'text-white',
    primaryRing: 'ring-amber-500',
    textAccent: 'text-amber-700',
    textMuted: 'text-stone-500',
    cardBg: 'bg-white',
    cardBorder: 'border-stone-200',
    iconBg: 'bg-amber-100 text-amber-700',
  },
};

const fontScales: Record<FontScale, string> = {
  compact: 'text-2xl md:text-3xl lg:text-4xl',
  standard: 'text-3xl md:text-4xl lg:text-5xl',
  large: 'text-4xl md:text-5xl lg:text-6xl',
  display: 'text-5xl md:text-6xl lg:text-7xl',
};

export const getTheme = (themeName?: string): ThemeTokens => {
  if (themeName && themeName in themes) {
    return themes[themeName as ThemeName];
  }
  return themes.Midnight;
};

export const getFontScale = (scaleName?: string): string => {
  if (scaleName && scaleName in fontScales) {
    return fontScales[scaleName as FontScale];
  }
  return fontScales.standard;
};

export const DARK_THEMES: ThemeName[] = ['Ocean', 'Midnight', 'Emerald', 'Ruby', 'Amethyst', 'Sunset', 'CorporateBlue', 'Graphite', 'Crimson', 'Forest'];
export const LIGHT_THEMES: ThemeName[] = ['Pearl', 'Breeze', 'Meadow', 'Blush', 'Stone'];
export const THEME_LIST = [...DARK_THEMES, ...LIGHT_THEMES] as ThemeName[];
export const FONT_SCALE_LIST = Object.keys(fontScales) as FontScale[];

export const THEME_HEX_COLORS: Record<ThemeName, string> = {
  // Escuros
  Ocean:         '#2563eb', // blue-600
  Midnight:      '#4f46e5', // indigo-600
  Emerald:       '#059669', // emerald-600
  Ruby:          '#e11d48', // rose-600
  Amethyst:      '#9333ea', // purple-600
  Sunset:        '#ea580c', // orange-600
  CorporateBlue: '#0284c7', // sky-600
  Graphite:      '#475569', // slate-600
  Crimson:       '#dc2626', // red-600
  Forest:        '#0d9488', // teal-600
  // Claros
  Pearl:         '#4f46e5', // indigo-600
  Breeze:        '#0ea5e9', // sky-500
  Meadow:        '#16a34a', // green-600
  Blush:         '#e11d48', // rose-600
  Stone:         '#d97706', // amber-600
};

// ─── Portal sidebar token set ─────────────────────────────────────────────────

export interface PortalSidebarTokens {
  mode: 'dark' | 'light'
  bg: string
  border: string
  text: string
  muted: string
  itemText: string
  itemBg: string
  hoverBg: string
  navActiveBg: string
  navActiveText: string
  ticketNumText: string
}

const portalSidebars: Record<ThemeName, PortalSidebarTokens> = {
  // ── Escuros ──
  Ocean: {
    mode: 'dark',
    bg: '#0c1a2e',
    border: 'rgba(59,130,246,.13)',
    text: '#f0f9ff',
    muted: 'rgba(148,163,184,.55)',
    itemText: '#bfdbfe',
    itemBg: 'rgba(255,255,255,.04)',
    hoverBg: 'rgba(59,130,246,.09)',
    navActiveBg: 'rgba(59,130,246,.16)',
    navActiveText: '#93c5fd',
    ticketNumText: '#60a5fa',
  },
  Midnight: {
    mode: 'dark',
    bg: '#0d0d1e',
    border: 'rgba(99,102,241,.13)',
    text: '#eef2ff',
    muted: 'rgba(148,163,184,.55)',
    itemText: '#c7d2fe',
    itemBg: 'rgba(255,255,255,.04)',
    hoverBg: 'rgba(99,102,241,.09)',
    navActiveBg: 'rgba(99,102,241,.16)',
    navActiveText: '#a5b4fc',
    ticketNumText: '#818cf8',
  },
  Emerald: {
    mode: 'dark',
    bg: '#061911',
    border: 'rgba(5,150,105,.13)',
    text: '#ecfdf5',
    muted: 'rgba(148,163,184,.55)',
    itemText: '#a7f3d0',
    itemBg: 'rgba(255,255,255,.04)',
    hoverBg: 'rgba(5,150,105,.09)',
    navActiveBg: 'rgba(5,150,105,.16)',
    navActiveText: '#6ee7b7',
    ticketNumText: '#34d399',
  },
  Ruby: {
    mode: 'dark',
    bg: '#1e0813',
    border: 'rgba(225,29,72,.13)',
    text: '#fff1f2',
    muted: 'rgba(148,163,184,.55)',
    itemText: '#fecdd3',
    itemBg: 'rgba(255,255,255,.04)',
    hoverBg: 'rgba(225,29,72,.09)',
    navActiveBg: 'rgba(225,29,72,.16)',
    navActiveText: '#fda4af',
    ticketNumText: '#fb7185',
  },
  Amethyst: {
    mode: 'dark',
    bg: '#160b1e',
    border: 'rgba(147,51,234,.13)',
    text: '#faf5ff',
    muted: 'rgba(148,163,184,.55)',
    itemText: '#e9d5ff',
    itemBg: 'rgba(255,255,255,.04)',
    hoverBg: 'rgba(147,51,234,.09)',
    navActiveBg: 'rgba(147,51,234,.16)',
    navActiveText: '#d8b4fe',
    ticketNumText: '#c084fc',
  },
  Sunset: {
    mode: 'dark',
    bg: '#1c0e04',
    border: 'rgba(234,88,12,.13)',
    text: '#fff7ed',
    muted: 'rgba(148,163,184,.55)',
    itemText: '#fed7aa',
    itemBg: 'rgba(255,255,255,.04)',
    hoverBg: 'rgba(234,88,12,.09)',
    navActiveBg: 'rgba(234,88,12,.16)',
    navActiveText: '#fdba74',
    ticketNumText: '#fb923c',
  },
  CorporateBlue: {
    mode: 'dark',
    bg: '#0f172a',
    border: 'rgba(255,255,255,.07)',
    text: '#f1f5f9',
    muted: 'rgba(148,163,184,.65)',
    itemText: '#e2e8f0',
    itemBg: 'rgba(255,255,255,.04)',
    hoverBg: 'rgba(255,255,255,.06)',
    navActiveBg: 'rgba(2,132,199,.16)',
    navActiveText: '#7dd3fc',
    ticketNumText: '#38bdf8',
  },
  Graphite: {
    mode: 'dark',
    bg: '#18181b',
    border: 'rgba(255,255,255,.07)',
    text: '#fafafa',
    muted: 'rgba(148,163,184,.60)',
    itemText: '#e4e4e7',
    itemBg: 'rgba(255,255,255,.04)',
    hoverBg: 'rgba(255,255,255,.06)',
    navActiveBg: 'rgba(113,113,122,.18)',
    navActiveText: '#d4d4d8',
    ticketNumText: '#a1a1aa',
  },
  Crimson: {
    mode: 'dark',
    bg: '#1a0607',
    border: 'rgba(220,38,38,.13)',
    text: '#fff5f5',
    muted: 'rgba(148,163,184,.55)',
    itemText: '#fecaca',
    itemBg: 'rgba(255,255,255,.04)',
    hoverBg: 'rgba(220,38,38,.09)',
    navActiveBg: 'rgba(220,38,38,.16)',
    navActiveText: '#fca5a5',
    ticketNumText: '#f87171',
  },
  Forest: {
    mode: 'dark',
    bg: '#061918',
    border: 'rgba(13,148,136,.13)',
    text: '#f0fdfa',
    muted: 'rgba(148,163,184,.55)',
    itemText: '#99f6e4',
    itemBg: 'rgba(255,255,255,.04)',
    hoverBg: 'rgba(13,148,136,.09)',
    navActiveBg: 'rgba(13,148,136,.16)',
    navActiveText: '#5eead4',
    ticketNumText: '#2dd4bf',
  },
  // ── Claros ──
  Pearl: {
    mode: 'light',
    bg: '#f8fafc',
    border: 'rgba(15,23,42,.08)',
    text: '#0f172a',
    muted: 'rgba(15,23,42,.45)',
    itemText: '#1e293b',
    itemBg: 'rgba(0,0,0,.03)',
    hoverBg: 'rgba(0,0,0,.05)',
    navActiveBg: 'rgba(99,102,241,.10)',
    navActiveText: '#4f46e5',
    ticketNumText: '#4f46e5',
  },
  Breeze: {
    mode: 'light',
    bg: '#f0f9ff',
    border: 'rgba(14,165,233,.18)',
    text: '#0c4a6e',
    muted: 'rgba(12,74,110,.45)',
    itemText: '#075985',
    itemBg: 'rgba(14,165,233,.06)',
    hoverBg: 'rgba(14,165,233,.10)',
    navActiveBg: 'rgba(14,165,233,.15)',
    navActiveText: '#0284c7',
    ticketNumText: '#0ea5e9',
  },
  Meadow: {
    mode: 'light',
    bg: '#f0fdf4',
    border: 'rgba(22,163,74,.15)',
    text: '#14532d',
    muted: 'rgba(20,83,45,.45)',
    itemText: '#166534',
    itemBg: 'rgba(22,163,74,.06)',
    hoverBg: 'rgba(22,163,74,.10)',
    navActiveBg: 'rgba(22,163,74,.14)',
    navActiveText: '#16a34a',
    ticketNumText: '#22c55e',
  },
  Blush: {
    mode: 'light',
    bg: '#fff1f2',
    border: 'rgba(225,29,72,.13)',
    text: '#881337',
    muted: 'rgba(136,19,55,.45)',
    itemText: '#9f1239',
    itemBg: 'rgba(225,29,72,.05)',
    hoverBg: 'rgba(225,29,72,.09)',
    navActiveBg: 'rgba(225,29,72,.14)',
    navActiveText: '#e11d48',
    ticketNumText: '#f43f5e',
  },
  Stone: {
    mode: 'light',
    bg: '#fafaf9',
    border: 'rgba(87,83,78,.10)',
    text: '#1c1917',
    muted: 'rgba(28,25,23,.45)',
    itemText: '#292524',
    itemBg: 'rgba(87,83,78,.05)',
    hoverBg: 'rgba(87,83,78,.08)',
    navActiveBg: 'rgba(217,119,6,.12)',
    navActiveText: '#b45309',
    ticketNumText: '#d97706',
  },
};

export const getPortalSidebar = (themeName?: string): PortalSidebarTokens => {
  if (themeName && themeName in portalSidebars) {
    return portalSidebars[themeName as ThemeName];
  }
  return portalSidebars.Midnight;
};
