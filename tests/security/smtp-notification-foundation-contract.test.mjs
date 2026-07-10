import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const sql = readFileSync(
  new URL('../../supabase/migrations/20260710100000_100_smtp_notification_foundation.sql', import.meta.url),
  'utf8',
)

const functionBody = (name) => {
  const parts = sql.split('CREATE OR REPLACE FUNCTION public.' + name)
  assert.ok(parts.length > 1, `função ${name} deve existir`)
  return parts[1].split('$$;')[0]
}

test('Credencial SMTP usa Vault e não permanece acessível na tabela do tenant', () => {
  assert.match(sql, /ADD COLUMN IF NOT EXISTS smtp_vault_secret_id uuid/)
  assert.match(sql, /vault\.create_secret/)
  assert.match(sql, /vault\.update_secret/)
  assert.match(sql, /DROP COLUMN IF EXISTS smtp_password_encrypted/)
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON public\.tenant_smtp_settings FROM authenticated/)
  assert.match(sql, /GRANT SELECT \(\s*id,company_id,smtp_host,smtp_port,smtp_user,from_email,from_name,encryption_type,created_at,updated_at\s*\) ON public\.tenant_smtp_settings TO authenticated/)
})

test('RPC SMTP exige admin do tenant e nunca retorna referência ou senha do Vault', () => {
  const body = functionBody('save_tenant_smtp_settings')
  assert.match(body, /public\.is_settings_admin\(p_company_id\)/)
  assert.match(body, /p_password/)
  assert.match(body, /RETURN to_jsonb\(v_saved\)\s*-\s*'smtp_vault_secret_id'/)
  assert.match(sql, /REVOKE ALL ON FUNCTION public\.save_tenant_smtp_settings/)
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.save_tenant_smtp_settings[\s\S]*TO authenticated/)
})

test('Política de fallback é controlada somente pelo MSP e auditada', () => {
  assert.match(sql, /CREATE TABLE IF NOT EXISTS public\.tenant_email_delivery_policies/)
  const body = functionBody('save_tenant_email_delivery_policy')
  assert.match(body, /public\.get_current_user_role\(\) <> 'sysadmin'/)
  assert.match(body, /p_event_type NOT IN \('ticket_opened', 'status_changed', 'assignment_changed', 'ticket_closed', 'public_comment'\)/)
  assert.match(body, /public\.write_admin_audit/)
  assert.match(sql, /REVOKE INSERT, UPDATE, DELETE ON public\.tenant_email_delivery_policies FROM authenticated/)
})
