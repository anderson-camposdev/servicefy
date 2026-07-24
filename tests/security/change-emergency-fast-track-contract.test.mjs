import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')

const packageJson = read('package.json')
const migration071 = read('supabase/migrations/20260705203001_071_rbac_and_cab_hardening.sql')
const migration170 = read('supabase/migrations/20260723000500_170_change_emergency_single_vote_fast_track.sql')

// Pente fino de 2026-07-23: "Voto Rápido" de mudança Emergency
// (ChangeManagementDashboard.tsx: "Emergency (Emergencial / Voto Rápido)")
// era só rótulo — cast_change_cab_vote exigia a mesma unanimidade de uma
// mudança Normal. Decisão do usuário: 1 voto "sim" já agenda uma
// Emergency; qualquer rejeição continua bloqueando (inalterado).
// Verificado ao vivo: Emergency agenda com 1 voto, Emergency rejeita com
// 1 voto contrário, Normal continua exigindo unanimidade (1 voto não
// basta, mas o 2º completa).

test('migration 071 original exigia unanimidade também para Emergency (sem tratamento por tipo)', () => {
  const fn = migration071.split('CREATE OR REPLACE FUNCTION public.cast_change_cab_vote')[1].split('CREATE OR REPLACE FUNCTION public.schedule_standard_change')[0]
  assert.doesNotMatch(fn, /v_change\.type::text = 'Emergency'/)
})

test('migration 170: Emergency agenda com o primeiro voto de aprovação, sem esperar unanimidade', () => {
  const fn = migration170.split('CREATE OR REPLACE FUNCTION public.cast_change_cab_vote')[1]
  assert.match(fn, /WHEN v_change\.type::text = 'Emergency' THEN 'Scheduled'::public\.change_state/)
})

test('migration 170: rejeição continua bloqueando antes do fast-track de Emergency ser avaliado', () => {
  const fn = migration170.split('CREATE OR REPLACE FUNCTION public.cast_change_cab_vote')[1]
  const caseBlock = fn.split('v_new_state := CASE')[1].split('END;')[0]
  const rejectIdx = caseBlock.indexOf("WHEN NOT p_approve THEN 'CAB Rejected'")
  const emergencyIdx = caseBlock.indexOf("WHEN v_change.type::text = 'Emergency'")
  assert.ok(rejectIdx >= 0 && emergencyIdx > rejectIdx, 'a checagem de rejeição precisa vir antes da checagem de Emergency no CASE')
})

test('migration 170: mudança Normal/Standard continua exigindo unanimidade (v_all_approved preservado)', () => {
  const fn = migration170.split('CREATE OR REPLACE FUNCTION public.cast_change_cab_vote')[1]
  assert.match(fn, /WHEN v_all_approved THEN 'Scheduled'::public\.change_state/)
})

test('Contrato de fast-track de Emergency participa da suíte de segurança padrão', () => {
  assert.match(packageJson, /tests\/security\/change-emergency-fast-track-contract\.test\.mjs/)
})
