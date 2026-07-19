import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const files = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
  .split('\0')
  .filter(Boolean)

const excluded = new Set([
  'scripts/audit-secrets.mjs',
  'tests/security/ci-security-contract.test.mjs',
])

const rules = [
  {
    name: 'private key',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
  {
    name: 'GitHub personal access token',
    pattern: /\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/,
  },
  {
    name: 'AWS access key',
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
  },
  {
    name: 'Stripe live secret',
    pattern: /\bsk_live_[A-Za-z0-9]{20,}\b/,
  },
  {
    name: 'Supabase service role assignment',
    pattern: /SUPABASE_SERVICE_ROLE_KEY\s*=\s*["'][^"'$<\s]{20,}["']/,
  },
]

const findings = []

for (const file of files) {
  if (excluded.has(file)) continue

  let content
  try {
    content = readFileSync(file, 'utf8')
  } catch {
    continue
  }

  for (const rule of rules) {
    if (rule.pattern.test(content)) findings.push({ file, rule: rule.name })
  }
}

if (findings.length > 0) {
  console.error('Possíveis segredos encontrados em arquivos versionados:')
  for (const finding of findings) console.error(`- ${finding.file}: ${finding.rule}`)
  process.exitCode = 1
} else {
  console.log(`Secret scan: ${files.length} arquivos versionados, nenhum segredo de alto impacto encontrado.`)
}
