import React, { createContext, useContext, useState, useEffect } from 'react'

export interface ThemeColors {
  bgColor: string       // Cor de Fundo (--color-bg-primary)
  cardColor: string     // Cor dos Cards (--color-surface)
  primaryColor: string  // Cor Primária / Botões (--color-brand-primary)
  textColor: string     // Cor do Texto (--color-text-main)
}

export interface ThemePreset {
  name: string
  label: string
  colors: ThemeColors
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    name: 'corporate_blue',
    label: 'Corporate Blue (Padrão)',
    colors: {
      bgColor: '#f1f5f9',     // slate-100
      cardColor: '#ffffff',   // branco puro
      primaryColor: '#2563eb', // azul corporativo (blue-600)
      textColor: '#1e293b'    // cinza escuro (slate-800)
    }
  },
  {
    name: 'classic_light',
    label: 'Classic Light',
    colors: {
      bgColor: '#f8fafc',     // slate-50
      cardColor: '#ffffff',   // branco puro
      primaryColor: '#10b981', // verde esmeralda (emerald-500)
      textColor: '#0f172a'    // slate-900
    }
  },
  {
    name: 'slate_gray',
    label: 'Slate Gray',
    colors: {
      bgColor: '#e2e8f0',     // slate-200
      cardColor: '#ffffff',   // branco
      primaryColor: '#475569', // slate-600
      textColor: '#0f172a'
    }
  },
  {
    name: 'hospital_tech',
    label: 'Hospital Tech',
    colors: {
      bgColor: '#f0f9ff',     // sky-50
      cardColor: '#ffffff',
      primaryColor: '#0284c7', // sky-600
      textColor: '#0f172a'
    }
  }
]

const DEFAULT_THEME = THEME_PRESETS[0].colors // Corporate Blue como default

interface ThemeContextType {
  theme: ThemeColors
  currentPreset: string // nome do preset ou 'custom'
  updateThemeColors: (colors: Partial<ThemeColors>) => void
  selectPresetPalette: (presetName: string) => void
  resetToDefault: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

const LOCAL_STORAGE_KEY = 'flowfy_theme_preferences'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<ThemeColors>(DEFAULT_THEME)
  const [currentPreset, setCurrentPreset] = useState<string>('corporate_blue')

  // Carrega as preferências salvas ao iniciar
  useEffect(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.colors) {
          setTheme(parsed.colors)
        }
        if (parsed.preset) {
          setCurrentPreset(parsed.preset)
        }
      }
    } catch (e) {
      console.error('Erro ao ler tema do localStorage', e)
    }
  }, [])

  // Aplica as cores no documentElement e persiste no localStorage toda vez que mudarem
  useEffect(() => {
    if (typeof document === 'undefined') return
    const root = document.documentElement

    root.style.setProperty('--color-bg-primary', theme.bgColor)
    root.style.setProperty('--color-surface', theme.cardColor)
    root.style.setProperty('--color-brand-primary', theme.primaryColor)
    root.style.setProperty('--color-text-main', theme.textColor)

    // Também sincroniza as variáveis legadas para garantir compatibilidade retroativa
    root.style.setProperty('--brand-primary', theme.primaryColor)
    root.style.setProperty('--brand-bg', theme.bgColor)

    // Força o tema claro profissional (desativa dark mode se houver resíduo)
    root.classList.remove('dark')
    root.classList.add('light')

    // Salva no localStorage
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify({
        colors: theme,
        preset: currentPreset
      }))
    } catch (e) {
      console.error('Erro ao persistir tema no localStorage', e)
    }

    // ============================================================
    // PREPARADO PARA SUPABASE:
    // Futuramente, se houver tabela de preferências, podemos chamar:
    //
    // async function syncWithSupabase() {
    //   try {
    //     await supabase
    //       .from('user_preferences')
    //       .upsert({ user_id: currentUserId, theme_settings: { colors: theme, preset: currentPreset } })
    //   } catch(e) {
    //     console.error('Erro ao sincronizar tema com Supabase', e)
    //   }
    // }
    // syncWithSupabase();
    // ============================================================

  }, [theme, currentPreset])

  const updateThemeColors = (newColors: Partial<ThemeColors>) => {
    setTheme(prev => {
      const updated = { ...prev, ...newColors }
      // Se as cores forem modificadas manualmente, alteramos o preset ativo para 'custom'
      setCurrentPreset('custom')
      return updated
    })
  }

  const selectPresetPalette = (presetName: string) => {
    const preset = THEME_PRESETS.find(p => p.name === presetName)
    if (preset) {
      setTheme(preset.colors)
      setCurrentPreset(presetName)
    }
  }

  const resetToDefault = () => {
    setTheme(DEFAULT_THEME)
    setCurrentPreset('corporate_blue')
  }

  return (
    <ThemeContext.Provider value={{ theme, currentPreset, updateThemeColors, selectPresetPalette, resetToDefault }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useTheme deve ser utilizado dentro de um ThemeProvider')
  }
  return context
}
