DO $$
DECLARE
  r RECORD;
  fn_names TEXT[] := ARRAY[
    'set_incident_number','set_updated_at','set_request_number','set_problem_number','set_change_number',
    'create_approval_token','process_approval_token','auto_assign_incident_sla','check_license_available',
    'is_chatbot_authorized','log_blocked_attempt','register_session','session_heartbeat','release_session',
    'expire_stale_sessions','is_current_user_msp_admin','get_current_profile_id','get_current_user_company_id',
    'get_current_user_role','handle_new_user','provision_tenant','reopen_incident_on_user_message',
    'calculate_incident_priority','trg_set_incident_priority','auto_close_resolved_incidents',
    'sla_business_minutes_between','sla_add_business_minutes','sla_is_paused_state','generate_ticket_task_number',
    'workflow_bump_priority','tg_reset_sla_warning_on_deadline_push','bi_normalize_state','bi_aging_bucket',
    'tg_bi_saved_reports_touch'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public'
       AND p.proname = ANY(fn_names)
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', r.sig);
  END LOOP;
END $$;;
