import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../../', import.meta.url)
const workflow = await readFile(new URL('.github/workflows/ci-cd-staging.yml', root), 'utf8')
const dependabot = await readFile(new URL('.github/dependabot.yml', root), 'utf8')
const packageJson = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))
const scanner = await readFile(new URL('scripts/audit-secrets.mjs', root), 'utf8')

test('workflow usa permissões mínimas e gate de supply chain antes do deploy', () => {
  assert.match(workflow, /^permissions:\s*\n\s+contents:\s+read/m)
  assert.match(workflow, /security-gates:/)
  assert.match(workflow, /npm audit --omit=dev --audit-level=high/)
  assert.match(workflow, /npm run audit:secrets/)
  assert.match(workflow, /npm run audit:migrations/)
  assert.match(workflow, /needs:\s*\[automated-tests,\s*security-gates\]/)
})

test('dependabot acompanha npm e GitHub Actions semanalmente', () => {
  assert.match(dependabot, /package-ecosystem:\s*"npm"/)
  assert.match(dependabot, /package-ecosystem:\s*"github-actions"/)
  assert.match(dependabot, /interval:\s*"weekly"/g)
  assert.match(dependabot, /open-pull-requests-limit:/)
})

test('scanner cobre segredos de alto impacto sem depender de serviço externo', () => {
  assert.equal(packageJson.scripts['audit:secrets'], 'node scripts/audit-secrets.mjs')
  assert.match(scanner, /PRIVATE KEY/)
  assert.match(scanner, /OPENSSH/)
  assert.match(scanner, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(scanner, /github_pat_/)
  assert.match(scanner, /git[\s\S]*ls-files/)
  assert.match(scanner, /process\.exitCode\s*=\s*1/)
})
