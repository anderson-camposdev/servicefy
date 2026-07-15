import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const servicesTs = readFileSync(resolve(root, 'src/lib/services.ts'), 'utf8')

test('list/listActive/listForUser de assignmentGroupsService passam por um cache em memória compartilhado', () => {
  assert.match(servicesTs, /const groupsCache = new Map/)
  assert.match(servicesTs, /cachedGroupsFetch\(`list:\$\{companyId\}`/)
  assert.match(servicesTs, /cachedGroupsFetch\(`listActive:\$\{companyId\}`/)
  assert.match(servicesTs, /cachedGroupsFetch\(`listForUser:\$\{userId\}`/)
})

test('toda mutação de grupo (create/update/remove/addMember/removeMember) invalida o cache', () => {
  const body = servicesTs.slice(servicesTs.indexOf('export const assignmentGroupsService'))
  const mutators = ['async create(', 'async update(', 'async remove(', 'async addMember(', 'async removeMember(']
  for (const marker of mutators) {
    const start = body.indexOf(marker)
    assert.notEqual(start, -1, `método ${marker} não encontrado`)
    const nextMarkerStarts = mutators
      .map(m => body.indexOf(m, start + 1))
      .filter(i => i !== -1)
    const end = nextMarkerStarts.length > 0 ? Math.min(...nextMarkerStarts) : start + 400
    const slice = body.slice(start, end)
    assert.match(slice, /invalidateGroupsCache\(\)/, `${marker} deveria invalidar o cache`)
  }
})

test('listMembers (dados por-grupo, consultados logo após mutação de membership) permanece sem cache', () => {
  const start = servicesTs.indexOf('async listMembers(')
  const end = servicesTs.indexOf('listForUser(', start)
  const slice = servicesTs.slice(start, end)
  assert.doesNotMatch(slice, /cachedGroupsFetch/)
})
