import { supabase } from './supabase'

export interface TicketAttachmentRow {
  id: string
  company_id: string
  incident_id: string
  uploaded_by: string | null
  storage_path: string
  filename: string
  mime_type: string
  size_bytes: number
  created_at: string
}

/**
 * ticket_attachments (migration 152) ainda não está em database.generated.ts
 * — mesma view estrutural mínima usada em PlatformModuleSettings.tsx para
 * tabelas fora do union tipado do supabase-js.
 */
interface AttachmentsTableClient {
  from(table: 'ticket_attachments'): {
    select(columns: string): {
      eq(column: string, value: string): {
        order(column: string, opts: { ascending: boolean }): Promise<{ data: TicketAttachmentRow[] | null; error: { message: string } | null }>
      }
    }
    insert(payload: Record<string, unknown>): {
      select(columns: string): {
        single(): Promise<{ data: TicketAttachmentRow | null; error: { message: string } | null }>
      }
    }
    delete(): {
      eq(column: string, value: string): Promise<{ error: { message: string } | null }>
    }
  }
}
const attachmentsTable = supabase as unknown as AttachmentsTableClient

const BUCKET = 'service-attachments'

export const attachmentsService = {
  async list(incidentId: string): Promise<TicketAttachmentRow[]> {
    const { data, error } = await attachmentsTable.from('ticket_attachments')
      .select('*').eq('incident_id', incidentId).order('created_at', { ascending: false })
    if (error) throw new Error(error.message)
    return data ?? []
  },

  async upload(params: { companyId: string; incidentId: string; uploadedBy: string; file: File }): Promise<TicketAttachmentRow> {
    const { companyId, incidentId, uploadedBy, file } = params
    const extension = file.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? 'bin'
    const storagePath = `${companyId}/${incidentId}/${crypto.randomUUID()}.${extension}`

    const { error: uploadError } = await supabase.storage.from(BUCKET)
      .upload(storagePath, file, { contentType: file.type || undefined, upsert: false })
    if (uploadError) throw new Error(uploadError.message)

    const { data, error } = await attachmentsTable.from('ticket_attachments').insert({
      company_id: companyId,
      incident_id: incidentId,
      uploaded_by: uploadedBy,
      storage_path: storagePath,
      filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
    }).select('*').single()

    if (error) {
      await supabase.storage.from(BUCKET).remove([storagePath]).catch(() => undefined)
      throw new Error(error.message)
    }
    if (!data) throw new Error('Falha ao registrar o anexo.')
    return data
  },

  async getSignedUrl(storagePath: string): Promise<string> {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(storagePath, 60)
    if (error || !data?.signedUrl) throw new Error(error?.message ?? 'Falha ao gerar link temporário.')
    return data.signedUrl
  },

  async remove(attachment: Pick<TicketAttachmentRow, 'id' | 'storage_path'>): Promise<void> {
    const { error } = await attachmentsTable.from('ticket_attachments').delete().eq('id', attachment.id)
    if (error) throw new Error(error.message)
    await supabase.storage.from(BUCKET).remove([attachment.storage_path]).catch(() => undefined)
  },
}
