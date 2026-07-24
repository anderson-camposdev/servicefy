/**
 * env.ts
 *
 * Lê VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY diretamente de .env.local.
 *
 * Achado no pente fino de 2026-07-24: 19 arquivos de e2e (specs + este
 * diretório de helpers) tinham a URL do Supabase cloud HARDCODED
 * (`https://enxtvrvsfwvcnpyspyfl.supabase.co`) — mas .env.local aponta
 * pro Supabase local (`http://localhost:54321`, necessário pro fluxo de
 * QA manual). Como page.route() intercepta por padrão de URL, nenhum mock
 * batia nas requisições reais do app (que ia pro backend local de
 * verdade) — sessão simulada nunca era reconhecida, telas caíam direto
 * no login. Não era bug de produto nem teste malfeito: era ambiente
 * desalinhado. Esta função garante que os specs sempre mockem a URL que
 * o app efetivamente está configurado para usar.
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

function loadEnvLocal(): Record<string, string> {
  const path = resolve(__dirname, '../../../.env.local')
  const content = (() => {
    try {
      return readFileSync(path, 'utf8')
    } catch {
      return null
    }
  })()
  if (content === null) return {}
  const vars: Record<string, string> = {}
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    vars[key] = value
  }
  return vars
}

const envVars = loadEnvLocal()

export const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? envVars.VITE_SUPABASE_URL ?? 'http://localhost:54321'
export const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? envVars.VITE_SUPABASE_ANON_KEY ?? ''

// supabase-js deriva a chave de localStorage de sb-${hostname.split('.')[0]}-auth-token
// (ver node_modules/@supabase/supabase-js/dist/umd/supabase.js) — precisa bater
// exatamente com a URL real configurada, senão a sessão simulada nunca é encontrada.
export const SUPABASE_STORAGE_KEY = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`
