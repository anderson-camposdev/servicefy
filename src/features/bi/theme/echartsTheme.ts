// ============================================================
// ServiceFY BI v2 — Tema ECharts derivado do motor white-label
// Gera uma option base (cores, texto, tooltip) a partir do tema
// do tenant (theme-engine): paleta harmônica ancorada na cor
// primária + modo claro/escuro conforme DARK_THEMES.
// ============================================================

import { DARK_THEMES, THEME_HEX_COLORS, type ThemeName } from '../../../lib/theme-engine'

export interface BiChartTheme {
  isDark: boolean
  /** cor primária do tenant */
  primary: string
  /** paleta de séries */
  palette: string[]
  textColor: string
  mutedColor: string
  axisLineColor: string
  splitLineColor: string
  tooltipBg: string
  tooltipText: string
  /** cores semânticas fixas (independem do tenant) */
  good: string
  warn: string
  bad: string
}

/** Paleta harmônica VIVA: primária + rotações de matiz com alta saturação (estilo Power BI). */
function buildPalette(primaryHex: string): string[] {
  const [h] = hexToHsl(primaryHex)
  const offsets = [0, 150, 40, 210, 80, 270, 120, 320, 180, 240]
  return offsets.map((off, i) => {
    const hue = (h + off + 360) % 360
    const light = 48 + (i % 3) * 6      // 48–60: cores cheias, legíveis em fundo claro
    const sat = 78 - (i % 2) * 10       // 68–78: saturação alta
    return hslToHex(hue, sat, light)
  })
}

// O módulo de BI é SEMPRE claro e colorido, independente do tema dark do
// tenant (decisão de produto): o tema white-label define apenas a cor
// primária que ancora a paleta.
export function buildChartTheme(themeName?: string): BiChartTheme {
  const primary = THEME_HEX_COLORS[(themeName as ThemeName) ?? 'Midnight'] ?? '#4f46e5'
  void DARK_THEMES // tema do tenant não controla mais claro/escuro aqui
  return {
    isDark: false,
    primary,
    palette: buildPalette(primary),
    textColor: '#1e293b',
    mutedColor: '#64748b',
    axisLineColor: 'rgba(100,116,139,.30)',
    splitLineColor: 'rgba(100,116,139,.14)',
    tooltipBg: '#ffffff',
    tooltipText: '#0f172a',
    good: '#16a34a',
    warn: '#f59e0b',
    bad: '#ef4444',
  }
}

/** Option base comum a todos os charts (fundo transparente, texto do tema). */
export function baseOption(t: BiChartTheme): Record<string, unknown> {
  return {
    backgroundColor: 'transparent',
    color: t.palette,
    textStyle: { color: t.textColor, fontFamily: 'inherit' },
    tooltip: {
      backgroundColor: t.tooltipBg,
      borderWidth: 0,
      textStyle: { color: t.tooltipText, fontSize: 12 },
      confine: true,
    },
    legend: { textStyle: { color: t.mutedColor, fontSize: 11 }, icon: 'circle', itemWidth: 8, itemHeight: 8 },
  }
}

// ─── util: conversões de cor ──────────────────────────────────

function hexToHsl(hex: string): [number, number, number] {
  const m = hex.replace('#', '')
  const r = parseInt(m.slice(0, 2), 16) / 255
  const g = parseInt(m.slice(2, 4), 16) / 255
  const b = parseInt(m.slice(4, 6), 16) / 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, Math.round(l * 100)]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h: number
  switch (max) {
    case r:  h = ((g - b) / d + (g < b ? 6 : 0)); break
    case g:  h = (b - r) / d + 2; break
    default: h = (r - g) / d + 4
  }
  return [Math.round(h * 60), Math.round(s * 100), Math.round(l * 100)]
}

function hslToHex(h: number, s: number, l: number): string {
  const sn = s / 100, ln = l / 100
  const a = sn * Math.min(ln, 1 - ln)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    const c = ln - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(255 * c).toString(16).padStart(2, '0')
  }
  return `#${f(0)}${f(8)}${f(4)}`
}
