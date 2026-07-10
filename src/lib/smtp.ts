import { supabase } from './supabase'

export const SMTP_ENCRYPTION_TYPES = ['tls', 'ssl', 'none'] as const
export type SmtpEncryptionType = typeof SMTP_ENCRYPTION_TYPES[number]

export interface TestSmtpConnectionInput {
  companyId: string
  host: string
  port: number
  user: string
  password: string
  fromEmail: string
  fromName: string
  encryptionType: SmtpEncryptionType
}

export interface TestSmtpConnectionResult {
  success: boolean
  message: string
}

export async function testSmtpConnection(input: TestSmtpConnectionInput): Promise<TestSmtpConnectionResult> {
  const { data, error } = await supabase.functions.invoke('test-smtp-connection', {
    body: input,
  })

  if (error) {
    throw new Error(error.message || 'Não foi possível testar a conexão SMTP.')
  }

  const result = data as TestSmtpConnectionResult | null
  if (!result?.success) {
    throw new Error(result?.message || 'O servidor SMTP recusou a conexão.')
  }

  return result
}
