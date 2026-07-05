ALTER TABLE public.request_items
  DROP CONSTRAINT IF EXISTS request_items_request_subcategory_id_fkey;

ALTER TABLE public.request_items
  ADD CONSTRAINT request_items_request_subcategory_id_fkey
  FOREIGN KEY (request_subcategory_id)
  REFERENCES public.request_subcategories(id)
  ON DELETE SET NULL;;
