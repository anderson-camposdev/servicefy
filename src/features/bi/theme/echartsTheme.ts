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

function buildPalette(primaryHex: string): string[] {
  return [
    primaryHex,
    '#0f766e',
    '#2563eb',
    '#b45309',
    '#7c3aed',
    '#be123c',
    '#475569',
    '#15803d',
  ]
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
