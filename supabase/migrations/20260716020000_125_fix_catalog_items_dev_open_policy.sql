-- ============================================================
-- Fix: remove leftover dev_open policy on public.catalog_items
--
-- Migrations 006/068/071 dropped the permissive dev_open policy
-- (USING (true) WITH CHECK (true)) from every RLS-protected table
-- it had been applied to in migration 001 — companies, groups,
-- profiles, incidents, service_requests, problems, changes,
-- change_history, workflow_rules, sla_policies, notifications —
-- except catalog_items, which was missed.
--
-- Since Postgres OR's multiple permissive policies together, this
-- stray policy let ANY authenticated user (any tenant) SELECT the
-- full catalog_items table across all companies, bypassing the
-- correct select_tenant_policy. Table grants limit authenticated
-- to SELECT only, so the write path was never exposed — only the
-- cross-tenant read leak was live.
-- ============================================================

DROP POLICY IF EXISTS dev_open ON public.catalog_items;
