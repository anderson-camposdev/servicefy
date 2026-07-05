import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const root = process.cwd()
const migrationDir = resolve(root, 'supabase', 'migrations')
const files = readdirSync(migrationDir).filter(name => name.endsWith('.sql')).sort()
const sql = files.map(name => readFileSync(resolve(migrationDir, name), 'utf8')).join('\n')
const requiredCoreTables = [
  'companies', 'profiles', 'incidents', 'incident_history',
  'service_requests', 'problems', 'problem_history',
  'changes', 'change_history', 'notifications',
]

const missing = requiredCoreTables.filter(table => {
  const pattern = new RegExp(`CREATE\\s+TABLE(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+(?:public\\.)?${table}\\b`, 'i')
  return !pattern.test(sql)
})

const prefixes = new Map()
for (const file of files) {
  const prefix = file.split('_')[0]
  prefixes.set(prefix, [...(prefixes.get(prefix) ?? []), file])
}
const duplicates = [...prefixes.entries()].filter(([, names]) => names.length > 1)
const hasConfig = existsSync(resolve(root, 'supabase', 'config.toml'))

console.log(`Migrations SQL: ${files.length}`)
console.log(`supabase/config.toml: ${hasConfig ? 'presente' : 'ausente'}`)
console.log(`Tabelas core sem CREATE versionado: ${missing.length ? missing.join(', ') : 'nenhuma'}`)
console.log(`Prefixos duplicados: ${duplicates.length ? duplicates.map(([p, names]) => `${p} (${names.join(', ')})`).join('; ') : 'nenhum'}`)

if ((missing.length > 0 || !hasConfig) && !process.argv.includes('--report-only')) {
  console.error('\nBaseline incompleto: siga supabase/BASELINE_RECOVERY.md antes de executar db reset.')
  process.exitCode = 1
}
