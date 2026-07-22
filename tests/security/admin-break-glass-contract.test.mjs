import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')

const authService = read('src/auth/authService.ts')
const authContext = read('src/auth/AuthContext.tsx')
const loginScreen = read('src/components/TenantLoginScreen.tsx')
const adminDashboard = read('src/pages/AdminDashboard.tsx')
const services = read('src/lib/services.ts')
const edgeFunction = read('supabase/functions/admin-create-local-user/index.ts')
const migration164 = read('supabase/migrations/20260722000200_164_fix_companies_anon_grant_missing_login_policy_columns.sql')
const packageJson = read('package.json')

// ── Item 2: quebra-vidro no login ──────────────────────────────

test('BREAK_GLASS_ROLES cobre só sysadmin/company_admin — nunca papéis operacionais', () => {
  assert.match(authService, /BREAK_GLASS_ROLES = new Set\(\['sysadmin', 'company_admin'\]\)/)
})

test('signIn (AuthContext) desloga na hora se a empresa exige SSO e o papel não é de quebra-vidro', () => {
  assert.match(authContext, /const \{ user \} = await signInWithPassword\(email, password\)/)
  assert.match(authContext, /const ssoRequired = authProfile\?\.company\?\.allow_local_login === false/)
  assert.match(authContext, /if \(ssoRequired && !canUseLocalLoginBreakGlass\(authProfile\)\)/)
  assert.match(authContext, /await authSignOut\(\)/)
})

test('a checagem de quebra-vidro só roda no caminho de senha, nunca no de SSO (signInWithProvider não é tocado)', () => {
  const signInWithProviderBody = authContext.split('const signInWithProvider = useCallback(async (provider: SsoProvider) => {')[1].split('}, [])')[0]
  assert.doesNotMatch(signInWithProviderBody, /canUseLocalLoginBreakGlass|allow_local_login/)
})

test('TenantLoginScreen: SSO obrigatório esconde o formulário local por padrão, mas oferece um link de emergência', () => {
  assert.match(loginScreen, /const \[breakGlassRevealed, setBreakGlassRevealed\] = useState\(false\)/)
  assert.match(loginScreen, /allowLocalLogin \|\| breakGlassRevealed/)
  assert.match(loginScreen, /Sou administrador e preciso de acesso de emergência/)
  // O aviso de "só admin" só aparece quando o link foi usado, nunca quando allowLocalLogin já é true.
  assert.match(loginScreen, /!allowLocalLogin && \(\s*<div className="rounded-2xl border border-amber-100/)
})

// ── Item 4: criação de conta admin/sysadmin com login local ────

test('admin-create-local-user: exige Bearer token e só aceita sysadmin/company_admin', () => {
  assert.match(edgeFunction, /if \(!authorization\.startsWith\('Bearer '\)\) return json\(\{ success: false, message: 'Autenticação necessária\.' \}, 401\)/)
  assert.match(edgeFunction, /const ALLOWED_ROLES = new Set\(\['sysadmin', 'company_admin'\]\)/)
})

test('admin-create-local-user: reproduz a mesma política de update_profile_secure — sysadmin só cria sysadmin, company_admin só cria admin do próprio tenant', () => {
  assert.match(edgeFunction, /const isMspAdmin = callerProfile\.role === 'sysadmin'/)
  assert.match(edgeFunction, /const isTenantAdminForTarget = callerProfile\.role === 'company_admin' && callerProfile\.company_id === payload\.companyId/)
  assert.match(edgeFunction, /if \(payload\.role === 'sysadmin' && !isMspAdmin\)/)
  assert.match(edgeFunction, /if \(payload\.role === 'company_admin' && !isMspAdmin && !isTenantAdminForTarget\)/)
})

test('admin-create-local-user: nunca gera nem transmite uma senha — usa inviteUserByEmail (a pessoa define a própria senha)', () => {
  assert.match(edgeFunction, /admin\.auth\.admin\.inviteUserByEmail\(payload\.email/)
  assert.doesNotMatch(edgeFunction, /password:\s*['"`]/)
  assert.doesNotMatch(edgeFunction, /generatePassword|randomPassword|Math\.random\(\).*password/i)
})

test('admin-create-local-user: reverte a conta de auth criada se a escrita em profiles falhar (evita usuário fantasma)', () => {
  const deleteUserCalls = edgeFunction.match(/admin\.auth\.admin\.deleteUser\(invited\.user\.id\)/g) ?? []
  assert.ok(deleteUserCalls.length >= 2, 'esperado rollback tanto no caminho de update quanto no de insert de profiles')
})

test('AdminDashboard: checkbox de login local só aparece para sysadmin/company_admin, nunca para os demais papéis', () => {
  assert.match(adminDashboard, /const isBreakGlassRole = usrRole === 'sysadmin' \|\| usrRole === 'company_admin'/)
  assert.match(adminDashboard, /\{isBreakGlassRole && \(/)
})

test('AdminDashboard: quando o checkbox está marcado, chama createLocalAdmin em vez do insert direto em profiles', () => {
  const handleSaveUserBody = adminDashboard.split('const handleSaveUser = async (e: React.FormEvent) => {')[1].split('\n  const handleUpdateUser')[0]
  assert.match(handleSaveUserBody, /if \(isBreakGlassRole && usrLocalLogin\)/)
  assert.match(handleSaveUserBody, /await profilesService\.createLocalAdmin\(/)
})

test('profilesService.createLocalAdmin chama a edge function (não insere profiles diretamente)', () => {
  assert.match(services, /async createLocalAdmin\(payload: \{/)
  assert.match(services, /supabase\.functions\.invoke\('admin-create-local-user'/)
})

// ── Bug real encontrado ao verificar o item 2: grant de anon quebrava a tela de login ──

test('migration 164: anon volta a enxergar allow_local_login e sso_providers (sem elas, a tela de login nunca sabia exigir SSO)', () => {
  assert.match(migration164, /GRANT SELECT \(%s\) ON public\.companies TO anon/)
  // A lista de exclusão (dentro do NOT IN) é o que importa — as duas
  // colunas precisam ter SAÍDO dali. O restante do arquivo (comentários)
  // legitimamente menciona os nomes das colunas para explicar o bug.
  const exclusionList = migration164.split('column_name NOT IN (')[1].split(');')[0]
  assert.doesNotMatch(exclusionList, /'allow_local_login'/)
  assert.doesNotMatch(exclusionList, /'sso_providers'/)
  // As colunas de licenciamento continuam de fora — não são necessárias
  // para a tela de login e são sensíveis (dados de faturamento).
  assert.match(exclusionList, /'license_plan', 'concurrent_licenses', 'license_expires_at',\s*\n\s*'license_alert_threshold', 'branding_settings'/)
})

test('Contrato de quebra-vidro administrativo participa da suíte de segurança padrão', () => {
  assert.match(packageJson, /tests\/security\/admin-break-glass-contract\.test\.mjs/)
})

// ── Bug real encontrado ao testar o convite ponta a ponta: link de invite
// caía direto no dashboard sem nunca pedir para definir senha ──
//
// supabase-js só dispara PASSWORD_RECOVERY para links type=recovery; um
// link de invite dispara SIGNED_IN (mesmo evento de um login comum), e
// sem o marcador abaixo o AuthContext não tinha como distinguir os dois
// casos — a pessoa convidada caía direto no dashboard, sem senha alguma
// definida na conta.

test('admin-create-local-user: redirectTo do invite carrega o marcador ?invite=1', () => {
  assert.match(edgeFunction, /redirectTo: `\$\{request\.headers\.get\('origin'\) \?\? SUPABASE_URL\}\/\?invite=1`/)
})

test('AuthContext: sessão de convite (?invite=1) ativa o mesmo recoveryMode que os links de recuperação de senha usam', () => {
  assert.match(authContext, /useState\(\s*\(\) => new URLSearchParams\(window\.location\.search\)\.get\('invite'\) === '1'\s*\)/)
  assert.match(authContext, /url\.searchParams\.delete\('invite'\)/)
  assert.match(authContext, /window\.history\.replaceState\(window\.history\.state, '', url\.toString\(\)\)/)
})
