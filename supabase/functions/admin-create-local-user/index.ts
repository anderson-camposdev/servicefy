// ServiceFY — provisiona uma conta administrativa (sysadmin/company_admin)
// com login local (e-mail + senha), sem depender de SSO.
//
// Contexto: hoje o formulário "Adicionar usuário" só insere uma linha em
// public.profiles — a conta de auth.users é criada depois, via JIT no
// primeiro login SSO (handle_new_user, migration 128). Isso funciona bem
// para usuários comuns, mas cria um problema real para contas de
// administrador: se a empresa exige SSO (companies.allow_local_login =
// false) e o provedor de SSO cair ou for mal configurado, ninguém —
// nem o próprio administrador — consegue entrar para corrigir a situação.
//
// Esta função cria a conta de auth.users IMEDIATAMENTE via
// inviteUserByEmail (link de definição de senha por e-mail — a pessoa
// nunca recebe uma senha pronta, define a própria no primeiro acesso,
// reaproveitando a tela de recuperação de senha que já existe) e a
// vincula à linha de profiles correspondente. Só serve para as duas
// roles que precisam funcionar mesmo com SSO fora do ar: sysadmin e
// company_admin — o mecanismo de "quebra-vidro" no login (AuthContext.tsx)
// só permite login local para essas duas roles, então criar contas de
// login local para outras roles não teria efeito nenhum.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

const ALLOWED_ROLES = new Set(['sysadmin', 'company_admin'])

interface CreateLocalUserPayload {
  name: string
  email: string
  role: 'sysadmin' | 'company_admin'
  companyId: string
  department?: string | null
  managerId?: string | null
}

const json = (body: Record<string, unknown>, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  },
})

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)

const parsePayload = (payload: unknown): CreateLocalUserPayload | null => {
  if (!payload || typeof payload !== 'object') return null
  const c = payload as Record<string, unknown>
  if (typeof c.name !== 'string' || !c.name.trim()) return null
  if (typeof c.email !== 'string' || !isValidEmail(c.email)) return null
  if (typeof c.role !== 'string' || !ALLOWED_ROLES.has(c.role)) return null
  if (typeof c.companyId !== 'string' || !c.companyId.trim()) return null
  return {
    name: c.name.trim(),
    email: c.email.trim().toLowerCase(),
    role: c.role as CreateLocalUserPayload['role'],
    companyId: c.companyId,
    department: typeof c.department === 'string' ? c.department.trim() || null : null,
    managerId: typeof c.managerId === 'string' ? c.managerId.trim() || null : null,
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    })
  }
  if (request.method !== 'POST') return json({ success: false, message: 'Método não permitido.' }, 405)

  const authorization = request.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) return json({ success: false, message: 'Autenticação necessária.' }, 401)

  try {
    const payload = parsePayload(await request.json())
    if (!payload) return json({ success: false, message: 'Dados inválidos para criação de administrador local.' }, 400)

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false } })
    const { data: userData, error: authError } = await authClient.auth.getUser(authorization.slice(7))
    if (authError || !userData.user) return json({ success: false, message: 'Sessão inválida.' }, 401)

    const { data: callerProfile, error: callerError } = await admin
      .from('profiles')
      .select('role, company_id, active')
      .eq('auth_id', userData.user.id)
      .maybeSingle()
    if (callerError || !callerProfile?.active) {
      return json({ success: false, message: 'Perfil do solicitante não encontrado ou inativo.' }, 403)
    }

    // Mesma política de update_profile_secure (migration 151) e da UI
    // (AdminDashboard.tsx: isMspAdmin/isTenantAdmin): sysadmin só é
    // concedido por quem já é sysadmin; company_admin só por sysadmin ou
    // pelo company_admin da PRÓPRIA empresa-alvo.
    const isMspAdmin = callerProfile.role === 'sysadmin'
    const isTenantAdminForTarget = callerProfile.role === 'company_admin' && callerProfile.company_id === payload.companyId
    if (payload.role === 'sysadmin' && !isMspAdmin) {
      return json({ success: false, message: 'Somente um administrador do ServiceFY pode criar outra conta de administrador do ServiceFY.' }, 403)
    }
    if (payload.role === 'company_admin' && !isMspAdmin && !isTenantAdminForTarget) {
      return json({ success: false, message: 'Somente um administrador do ServiceFY ou desta empresa pode criar um administrador da empresa.' }, 403)
    }

    const { data: company, error: companyError } = await admin
      .from('companies')
      .select('id, active')
      .eq('id', payload.companyId)
      .maybeSingle()
    if (companyError || !company?.active) {
      return json({ success: false, message: 'Empresa inválida ou inativa.' }, 400)
    }

    const { data: existingProfile } = await admin
      .from('profiles')
      .select('id, auth_id')
      .eq('email', payload.email)
      .eq('company_id', payload.companyId)
      .maybeSingle()
    if (existingProfile?.auth_id) {
      return json({ success: false, message: 'Já existe uma conta de login para este e-mail nesta empresa.' }, 409)
    }

    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(payload.email, {
      redirectTo: `${request.headers.get('origin') ?? SUPABASE_URL}/`,
      data: { name: payload.name },
    })
    if (inviteError || !invited?.user) {
      return json({ success: false, message: `Falha ao criar conta de login: ${inviteError?.message ?? 'erro desconhecido'}` }, 502)
    }

    if (existingProfile) {
      const { error: linkError } = await admin
        .from('profiles')
        .update({ auth_id: invited.user.id, role: payload.role, name: payload.name })
        .eq('id', existingProfile.id)
      if (linkError) {
        await admin.auth.admin.deleteUser(invited.user.id).catch(() => undefined)
        return json({ success: false, message: `Falha ao vincular perfil: ${linkError.message}` }, 500)
      }
    } else {
      const { error: profileError } = await admin.from('profiles').insert({
        auth_id: invited.user.id,
        company_id: payload.companyId,
        name: payload.name,
        email: payload.email,
        role: payload.role,
        department: payload.department,
        manager_id: payload.managerId,
        avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(payload.name.split(' ')[0] ?? payload.name)}`,
        active: true,
      })
      if (profileError) {
        await admin.auth.admin.deleteUser(invited.user.id).catch(() => undefined)
        return json({ success: false, message: `Falha ao criar perfil: ${profileError.message}` }, 500)
      }
    }

    return json({ success: true, message: 'Convite enviado. A pessoa define a própria senha ao acessar o link recebido por e-mail.' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha inesperada ao criar administrador local.'
    console.error('[admin-create-local-user]', message)
    return json({ success: false, message }, 500)
  }
})
