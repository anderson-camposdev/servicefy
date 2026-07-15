import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const servicesTs = readFileSync(resolve(root, 'src/lib/services.ts'), 'utf8')
const dbTypesTs = readFileSync(resolve(root, 'src/lib/database.types.ts'), 'utf8')
const typesIndexTs = readFileSync(resolve(root, 'src/types/index.ts'), 'utf8')

test('mecanismo morto de schema-por-tenant foi removido de services.ts', () => {
  assert.doesNotMatch(servicesTs, /companySchemaMap/)
  assert.doesNotMatch(servicesTs, /setCompanySchemas/)
  assert.doesNotMatch(servicesTs, /getSupabaseForSchema/)
  assert.doesNotMatch(servicesTs, /schemaClientsCache/)
})

test('CompanyRow e Company (domínio) não declaram mais schema_name/schemaName — coluna nunca existiu em nenhuma migration', () => {
  assert.doesNotMatch(dbTypesTs, /schema_name/)
  assert.doesNotMatch(typesIndexTs, /schemaName/)
})
