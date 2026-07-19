-- ServiceFY — fundação segura para anexos de chamados e conhecimento.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('service-attachments','service-attachments',false,10485760,
  ARRAY['application/pdf','image/png','image/jpeg','text/plain'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

UPDATE public.attachment_policies
SET max_size_bytes = LEAST(GREATEST(max_size_bytes, 1048576), 10485760),
    allowed_extensions = ARRAY(
      SELECT DISTINCT lower(ext) FROM unnest(allowed_extensions) AS ext
      WHERE lower(ext) = ANY (ARRAY['pdf','png','jpg','jpeg','txt']) ORDER BY lower(ext)
    );
UPDATE public.attachment_policies SET allowed_extensions = ARRAY['pdf','png','jpg','jpeg','txt']
WHERE cardinality(allowed_extensions) = 0;

ALTER TABLE public.attachment_policies
  ALTER COLUMN max_size_bytes SET DEFAULT 10485760,
  ALTER COLUMN allowed_extensions SET DEFAULT ARRAY['pdf','png','jpg','jpeg','txt'];
ALTER TABLE public.attachment_policies
  DROP CONSTRAINT IF EXISTS attachment_policies_size_platform_cap,
  ADD CONSTRAINT attachment_policies_size_platform_cap CHECK (max_size_bytes BETWEEN 1048576 AND 10485760),
  DROP CONSTRAINT IF EXISTS attachment_policies_previewable_extensions,
  ADD CONSTRAINT attachment_policies_previewable_extensions
    CHECK (allowed_extensions <@ ARRAY['pdf','png','jpg','jpeg','txt']::text[]);

CREATE OR REPLACE FUNCTION public.can_upload_service_attachment(object_name text, object_metadata jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_company_id uuid;
  v_extension text;
  v_size bigint;
  v_mime text;
  v_policy public.attachment_policies;
BEGIN
  IF (storage.foldername(object_name))[1] !~* '^[0-9a-f-]{36}$' THEN RETURN false; END IF;
  v_company_id := (storage.foldername(object_name))[1]::uuid;
  IF NOT public.is_current_user_msp_admin()
     AND v_company_id IS DISTINCT FROM public.get_current_user_company_id() THEN RETURN false; END IF;

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
REVOKE ALL ON FUNCTION public.can_upload_service_attachment(text, jsonb) FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS service_attachments_authenticated_insert ON storage.objects;
CREATE POLICY service_attachments_authenticated_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id='service-attachments' AND public.can_upload_service_attachment(name, metadata));

-- Sem SELECT direto: URLs temporárias deverão ser emitidas somente após
-- autorização do chamado ou artigo específico.
DROP POLICY IF EXISTS service_attachments_direct_read ON storage.objects;

COMMENT ON FUNCTION public.can_upload_service_attachment(text, jsonb) IS
  'Valida tenant, tamanho, extensão e MIME antes de inserir no bucket privado de anexos.';
