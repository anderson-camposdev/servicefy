-- ServiceFY — anexos de chamados: metadados + leitura segura via signed URL.
-- O bucket privado `service-attachments` e a validação de upload
-- (can_upload_service_attachment) já existem desde a migration 143.
-- Faltava: (1) uma tabela de metadados para listar o que foi anexado a cada
-- chamado, e (2) uma forma de gerar signed URL sem expor um SELECT amplo em
-- storage.objects — resolvido restringindo o caminho do objeto ao formato
-- {company_id}/{incident_id}/{arquivo} e reaproveitando can_read_ticket().

CREATE TABLE public.ticket_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  incident_id uuid NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  uploaded_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  storage_path text NOT NULL UNIQUE,
  filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ticket_attachments_incident ON public.ticket_attachments(incident_id);

ALTER TABLE public.ticket_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY ticket_attachments_select ON public.ticket_attachments FOR SELECT TO authenticated
  USING (public.can_read_ticket(incident_id));

CREATE POLICY ticket_attachments_insert ON public.ticket_attachments FOR INSERT TO authenticated
  WITH CHECK (
    public.can_read_ticket(incident_id)
    AND (public.is_current_user_msp_admin() OR company_id = public.get_current_user_company_id())
    AND uploaded_by = public.get_current_profile_id()
  );

CREATE POLICY ticket_attachments_delete ON public.ticket_attachments FOR DELETE TO authenticated
  USING (
    public.can_read_ticket(incident_id)
    AND (
      uploaded_by = public.get_current_profile_id()
      OR public.is_current_user_ticket_staff()
      OR public.is_current_user_msp_admin()
    )
  );

REVOKE ALL ON public.ticket_attachments FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON public.ticket_attachments TO authenticated;

-- Endurece can_upload_service_attachment: além de tenant/tamanho/MIME/
-- extensão, o segundo segmento do caminho precisa ser um incident_id que o
-- próprio usuário tem permissão de ler (mesma tabela `tickets`).
CREATE OR REPLACE FUNCTION public.can_upload_service_attachment(object_name text, object_metadata jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_company_id uuid;
  v_incident_id uuid;
  v_extension text;
  v_size bigint;
  v_mime text;
  v_policy public.attachment_policies;
BEGIN
  IF (storage.foldername(object_name))[1] !~* '^[0-9a-f-]{36}$' THEN RETURN false; END IF;
  IF (storage.foldername(object_name))[2] !~* '^[0-9a-f-]{36}$' THEN RETURN false; END IF;
  v_company_id := (storage.foldername(object_name))[1]::uuid;
  v_incident_id := (storage.foldername(object_name))[2]::uuid;

  IF NOT public.is_current_user_msp_admin()
     AND v_company_id IS DISTINCT FROM public.get_current_user_company_id() THEN RETURN false; END IF;

  IF NOT public.can_read_ticket(v_incident_id) THEN RETURN false; END IF;

  v_extension := lower(substring(object_name FROM '\.([a-z0-9]+)$'));
  v_size := COALESCE((object_metadata->>'size')::bigint, 0);
  v_mime := lower(COALESCE(object_metadata->>'mimetype', ''));
  SELECT * INTO v_policy FROM public.attachment_policies
   WHERE company_id = v_company_id AND service_domain_id IS NULL LIMIT 1;

  RETURN v_size BETWEEN 1 AND LEAST(COALESCE(v_policy.max_size_bytes, 10485760), 10485760)
    AND v_extension = ANY (COALESCE(v_policy.allowed_extensions, ARRAY['pdf','png','jpg','jpeg','txt']))
    AND NOT (v_extension = ANY (COALESCE(v_policy.blocked_extensions, ARRAY[]::text[])))
    AND ((v_extension='pdf' AND v_mime='application/pdf')
      OR (v_extension='png' AND v_mime='image/png')
      OR (v_extension IN ('jpg','jpeg') AND v_mime='image/jpeg')
      OR (v_extension='txt' AND v_mime='text/plain'));
EXCEPTION WHEN OTHERS THEN RETURN false;
END;
$$;
GRANT EXECUTE ON FUNCTION public.can_upload_service_attachment(text, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.can_upload_service_attachment(text, jsonb) FROM PUBLIC, anon;

-- Leitura do binário: só via signed URL (client chama createSignedUrl, que
-- exige esta policy de SELECT em storage.objects). Sem policy de leitura
-- ampla — cada leitura ainda passa por can_read_ticket do incident_id
-- embutido no caminho do objeto.
DROP POLICY IF EXISTS service_attachments_direct_read ON storage.objects;
CREATE POLICY service_attachments_ticket_read ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'service-attachments'
    AND (storage.foldername(name))[2] ~* '^[0-9a-f-]{36}$'
    AND public.can_read_ticket(((storage.foldername(name))[2])::uuid)
  );

-- Exclusão do objeto binário segue a mesma regra da linha de metadados.
CREATE POLICY service_attachments_ticket_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'service-attachments'
    AND (storage.foldername(name))[2] ~* '^[0-9a-f-]{36}$'
    AND public.can_read_ticket(((storage.foldername(name))[2])::uuid)
    AND (
      public.is_current_user_ticket_staff()
      OR public.is_current_user_msp_admin()
      OR EXISTS (
        SELECT 1 FROM public.ticket_attachments ta
        WHERE ta.storage_path = name AND ta.uploaded_by = public.get_current_profile_id()
      )
    )
  );

COMMENT ON TABLE public.ticket_attachments IS
  'Metadados de anexos de chamados. O binário fica em storage.objects (bucket service-attachments); caminho {company_id}/{incident_id}/{uuid}-{filename}.';
