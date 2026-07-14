import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const migration = readFileSync(resolve(root, 'supabase/migrations/20260716020000_125_fix_catalog_items_dev_open_policy.sql'), 'utf8')

test('migration remove a policy dev_open órfã de catalog_items (leak cross-tenant via OR de policies permissivas)', () => {
  assert.match(migration, /DROP POLICY IF EXISTS dev_open ON public\.catalog_items/)
})
