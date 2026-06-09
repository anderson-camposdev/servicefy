// ============================================================
// Flowfy ITSM — Criação dos usuários demo no Supabase Auth
//
// Descobre automaticamente os profiles de seed que aguardam
// linkagem (auth_id IS NULL) e cria o usuário correspondente no
// Supabase Auth. O trigger handle_new_user (migration 011) faz a
// linkagem por e-mail no momento da criação.
//
// USO (PowerShell):
//   $env:SUPABASE_URL = "https://enxtvrvsfwvcnpyspyfl.supabase.co"
//   $env:SUPABASE_SERVICE_ROLE_KEY = "<service_role key do Dashboard>"
//   $env:DEMO_PASSWORD = "Flowfy@2026"   # opcional
//   node scratch/create_demo_users.mjs
//
// A SERVICE ROLE KEY é secreta — NÃO faça commit dela. Use só local.
// ============================================================

import { createClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const password = process.env.DEMO_PASSWORD || 'Flowfy@2026'

if (!url || !serviceKey) {
  console.error('✗ Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.')
  process.exit(1)
}

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// Service role ignora RLS — lista os profiles ainda sem auth_id.
const { data: profiles, error } = await admin
  .from('profiles')
  .select('email, name, role')
  .is('auth_id', null)
  .order('email')

if (error) {
  console.error('✗ Erro ao listar profiles:', error.message)
  process.exit(1)
}

if (!profiles?.length) {
  console.log('✓ Nenhum profile pendente de linkagem. Tudo já vinculado.')
  process.exit(0)
}

console.log(`→ ${profiles.length} profile(s) pendente(s). Senha padrão: "${password}"\n`)

let created = 0
let skipped = 0
for (const p of profiles) {
  const { error: createErr } = await admin.auth.admin.createUser({
    email: p.email,
    password,
    email_confirm: true,
    user_metadata: { name: p.name },
  })

  if (createErr) {
    // Usuário já existe no Auth (ou outro erro) — segue em frente.
    console.warn(`  ⚠ ${p.email} (${p.role}): ${createErr.message}`)
    skipped++
  } else {
    console.log(`  ✓ ${p.email} (${p.role}) criado e linkado`)
    created++
  }
}

console.log(`\nResumo: ${created} criado(s), ${skipped} ignorado(s)/já existente(s).`)
console.log('Valide a linkagem com a query do guia (auth_id preenchido).')
