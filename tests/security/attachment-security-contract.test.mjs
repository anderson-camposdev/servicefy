import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const root = new URL('../../', import.meta.url)
const migration = await readFile(new URL('supabase/migrations/20260718001200_143_attachment_security_foundation.sql', root), 'utf8')
const client = await readFile(new URL('src/lib/attachment-security.ts', root), 'utf8')
const settings = await readFile(new URL('src/pages/PlatformModuleSettings.tsx', root), 'utf8')
const pkg = JSON.parse(await readFile(new URL('package.json', root), 'utf8'))

test('bucket de anexos é privado e tem teto absoluto de 10 MB', () => {
  assert.match(migration, /'service-attachments'[\s\S]*false[\s\S]*10485760/)
  assert.match(migration, /file_size_limit\s*=\s*EXCLUDED\.file_size_limit/)
  assert.match(migration, /allowed_mime_types\s*=\s*EXCLUDED\.allowed_mime_types/)
})

test('enforcement do Storage confere tenant, tamanho, MIME e extensão', () => {
  assert.match(migration, /can_upload_service_attachment/)
  assert.match(migration, /\(storage\.foldername\(object_name\)\)\[1\]/)
  assert.match(migration, /metadata->>'size'/)
  assert.match(migration, /metadata->>'mimetype'/)
  assert.match(migration, /pdf.*png.*jpg.*jpeg.*txt/is)
})

test('cliente não oferece download e abre preview isolado', () => {
  assert.match(client, /window\.open\(url,\s*'_blank',\s*'noopener,noreferrer'\)/)
  assert.doesNotMatch(client, /\.download\s*=|download=/)
})

test('configuração do tenant nunca supera o teto da plataforma', () => {
  assert.match(settings, /Math\.min\(10,\s*Math\.max\(1,/)
})

test('contrato participa da suíte de segurança padrão', () => {
  assert.match(pkg.scripts['test:security'], /attachment-security-contract\.test\.mjs/)
})
