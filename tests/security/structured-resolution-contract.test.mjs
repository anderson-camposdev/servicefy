import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260712235900_115_structured_resolution.sql')

test('tickets ganha resolution_code, resolution_notes e kb_candidate (default false)', () => {
  assert.match(sql, /ADD COLUMN IF NOT EXISTS resolution_code text/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS resolution_notes text/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS kb_candidate boolean NOT NULL DEFAULT false/)
})

test('view "incidents" expõe resolution_code/resolution_notes/kb_candidate (sem isso o UPDATE via view nem compila)', () => {
  const viewDef = sql.split('CREATE OR REPLACE VIEW public.incidents AS')[1].split('CREATE OR REPLACE FUNCTION')[0]
  assert.match(viewDef, /t\.resolution_code, t\.resolution_notes, t\.kb_candidate/)
})

test('tg_incidents_view_update encaminha close_code/close_notes/resolution_code/resolution_notes/kb_candidate para tickets (bug de forwarding pré-existente, corrigido aqui)', () => {
  const fnBody = sql.split('CREATE OR REPLACE FUNCTION public.tg_incidents_view_update()')[1].split('\n$$;')[0]
  assert.match(fnBody, /close_code = NEW\.close_code/)
  assert.match(fnBody, /close_notes = NEW\.close_notes/)
  assert.match(fnBody, /resolution_code = NEW\.resolution_code/)
  assert.match(fnBody, /resolution_notes = NEW\.resolution_notes/)
  assert.match(fnBody, /kb_candidate = COALESCE\(NEW\.kb_candidate, false\)/)
})

test('tg_incidents_view_insert também encaminha os mesmos campos de encerramento (consistência com o INSERT)', () => {
  const fnBody = sql.split('CREATE OR REPLACE FUNCTION public.tg_incidents_view_insert()')[1].split('\n$$;')[0]
  assert.match(fnBody, /close_code, close_notes, resolution_code, resolution_notes, kb_candidate/)
  assert.match(fnBody, /NEW\.close_code, NEW\.close_notes, NEW\.resolution_code, NEW\.resolution_notes, COALESCE\(NEW\.kb_candidate, false\)/)
})

test('trg_guard_resolution_governance dispara BEFORE UPDATE OF state, resolution_code, resolution_notes', () => {
  assert.match(sql, /CREATE TRIGGER trg_guard_resolution_governance\s+BEFORE UPDATE OF state, resolution_code, resolution_notes ON public\.tickets/)
})

test('governança exige resolution_code e resolution_notes não vazios (nem NULL nem string em branco) quando state é Resolved ou Closed', () => {
  const fnBody = sql.split('CREATE OR REPLACE FUNCTION public.tg_guard_resolution_governance()')[1].split('\n$$;')[0]
  assert.match(fnBody, /IF NEW\.state IN \('Resolved', 'Closed'\) THEN/)
  assert.match(fnBody, /IF NEW\.resolution_code IS NULL OR btrim\(NEW\.resolution_code\) = '' THEN/)
  assert.match(fnBody, /IF NEW\.resolution_notes IS NULL OR btrim\(NEW\.resolution_notes\) = '' THEN/)
  assert.match(fnBody, /RAISE EXCEPTION/)
})

test('Contrato de resolução estruturada participa da suíte de segurança padrão', () => {
  const packageJson = read('package.json')
  assert.match(packageJson, /structured-resolution-contract\.test\.mjs/)
})
