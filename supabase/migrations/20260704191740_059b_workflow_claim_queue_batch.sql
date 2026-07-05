CREATE OR REPLACE FUNCTION public.workflow_claim_queue_batch(p_limit INT DEFAULT 50)
RETURNS SETOF public.workflow_action_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.workflow_action_queue q
     SET status = 'processing'
   WHERE q.id IN (
     SELECT id FROM public.workflow_action_queue
      WHERE status = 'pending' AND run_after <= now()
      ORDER BY created_at
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
   )
   RETURNING q.*;
END;
$$;;
