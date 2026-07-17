import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const supabaseTs = readFileSync(resolve(root, 'src/lib/supabase.ts'), 'utf8')
const servicesTs = readFileSync(resolve(root, 'src/lib/services.ts'), 'utf8')
const generatedTs = readFileSync(resolve(root, 'src/lib/database.generated.ts'), 'utf8')

test('o client raiz do Supabase usa o Database gerado, não createClient<any>', () => {
  assert.match(supabaseTs, /createClient<Database>/)
  assert.doesNotMatch(supabaseTs, /createClient<any>/)
})

test('services.ts usa os tipos Database/Json gerados em vez de any — sem client próprio (schema-per-tenant foi removido; getClientForCompany() só retorna o client único)', () => {
  assert.match(servicesTs, /import type \{ Database, Json \} from '\.\/database\.generated'/)
  assert.doesNotMatch(servicesTs, /createClient<any>/)
})

test('database.generated.ts exporta o tipo Database usado pelos clients', () => {
  assert.match(generatedTs, /export type Database = \{/)
})
