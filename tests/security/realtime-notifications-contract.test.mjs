import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const read = path => readFileSync(new URL('../../' + path, import.meta.url), 'utf8')
const sql = read('supabase/migrations/20260712200000_111_realtime_notifications.sql')
const hook = read('src/hooks/useRealtimeNotifications.ts')

test('notifications ganha company_id (NOT NULL) e link, com backfill antes do NOT NULL', () => {
  assert.match(sql, /ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public\.companies\(id\) ON DELETE CASCADE/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS link text/)
  assert.match(sql, /UPDATE public\.notifications n\s+SET company_id = p\.company_id/)
  assert.match(sql, /ALTER COLUMN company_id SET NOT NULL/)
})

test('RLS usa get_current_profile_id(), não auth.uid() puro (user_id referencia profiles.id)', () => {
  assert.match(sql, /CREATE POLICY notifications_select_own[\s\S]*?USING \(\s*user_id = public\.get_current_profile_id\(\)\s*AND company_id = public\.get_current_user_company_id\(\)\s*\)/)
  assert.match(sql, /CREATE POLICY notifications_update_own[\s\S]*?USING \(\s*user_id = public\.get_current_profile_id\(\)\s*AND company_id = public\.get_current_user_company_id\(\)\s*\)/)
  assert.doesNotMatch(sql, /user_id = auth\.uid\(\)/)
})

test('grant de UPDATE é restrito à coluna read (não à tabela inteira)', () => {
  assert.match(sql, /GRANT UPDATE \(read\) ON public\.notifications TO authenticated/)
  assert.doesNotMatch(sql, /GRANT UPDATE ON public\.notifications TO authenticated/)
})

test('sem INSERT/DELETE para authenticated: escrita só via trigger SECURITY DEFINER', () => {
  assert.match(sql, /REVOKE ALL ON public\.notifications FROM authenticated/)
  assert.doesNotMatch(sql, /GRANT INSERT ON public\.notifications TO authenticated/)
  assert.doesNotMatch(sql, /GRANT DELETE ON public\.notifications TO authenticated/)
})

test('trigger de atribuição filtra company_id explicitamente (SECURITY DEFINER) e usa WHEN para não disparar sem necessidade', () => {
  assert.match(sql, /SECURITY DEFINER/)
  assert.match(sql, /NEW\.company_id, NEW\.assigned_to_id, 'Novo ticket atribuído'/)
  assert.match(sql, /WHEN \(NEW\.assigned_to_id IS NOT NULL\)/)
  assert.match(sql, /WHEN \(NEW\.assigned_to_id IS NOT NULL AND OLD\.assigned_to_id IS DISTINCT FROM NEW\.assigned_to_id\)/)
})

test('duas triggers separadas para INSERT e UPDATE (OLD não é referenciável numa WHEN clause de trigger combinada com INSERT)', () => {
  assert.match(sql, /CREATE TRIGGER tg_notify_ticket_assignment_insert\s+AFTER INSERT ON public\.tickets/)
  assert.match(sql, /CREATE TRIGGER tg_notify_ticket_assignment_update\s+AFTER UPDATE OF assigned_to_id ON public\.tickets/)
})

test('useRealtimeNotifications assina só INSERT, filtrado por user_id no servidor', () => {
  assert.match(hook, /event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq\.\$\{profileId\}`/)
})

test('useRealtimeNotifications faz cleanup real (removeChannel) no unmount', () => {
  assert.match(hook, /void supabase\.removeChannel\(channel\)/)
})

test('useRealtimeNotifications não usa any em nenhum lugar', () => {
  assert.doesNotMatch(hook, /:\s*any\b/)
  assert.doesNotMatch(hook, /as any\b/)
})

test('Contrato de notificações realtime participa da suíte de segurança padrão', () => {
  const packageJson = read('package.json')
  assert.match(packageJson, /realtime-notifications-contract\.test\.mjs/)
})
