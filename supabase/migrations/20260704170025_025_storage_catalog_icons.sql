-- ============================================================
-- Flowfy ITSM — Migration 025
-- Bucket público 'catalog-icons' para upload de ícones do catálogo
-- (categorias/serviços/itens). Leitura pública; escrita autenticada.
-- ============================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('catalog-icons', 'catalog-icons', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Leitura pública dos ícones
DROP POLICY IF EXISTS "catalog_icons_public_read" ON storage.objects;
CREATE POLICY "catalog_icons_public_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'catalog-icons');

-- Escrita (upload/atualização/remoção) por usuários autenticados
DROP POLICY IF EXISTS "catalog_icons_auth_write" ON storage.objects;
CREATE POLICY "catalog_icons_auth_write" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'catalog-icons')
  WITH CHECK (bucket_id = 'catalog-icons');
