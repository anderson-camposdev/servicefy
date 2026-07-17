// Gerado via: npx supabase gen types typescript --local
// Fonte: schema Postgres local (todas as migrations ate a 125 aplicadas) — mais
// atual que o projeto remoto enxtvrvsfwvcnpyspyfl, que ainda nao recebeu o push
// de algumas migrations recentes.
// NAO EDITAR A MAO. Regenerar com o mesmo comando quando o schema mudar.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      active_sessions: {
        Row: {
          company_id: string
          connected_at: string
          device_type: string | null
          disconnect_reason: string | null
          disconnected_at: string | null
          id: string
          ip_address: string | null
          last_ping: string
          session_token: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          company_id: string
          connected_at?: string
          device_type?: string | null
          disconnect_reason?: string | null
          disconnected_at?: string | null
          id?: string
          ip_address?: string | null
          last_ping?: string
          session_token: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          company_id?: string
          connected_at?: string
          device_type?: string | null
          disconnect_reason?: string | null
          disconnected_at?: string | null
          id?: string
          ip_address?: string | null
          last_ping?: string
          session_token?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "active_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "active_sessions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "active_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_events: {
        Row: {
          action: string
          actor_profile_id: string | null
          actor_role: string
          after_data: Json | null
          before_data: Json | null
          company_id: string
          correlation_id: string
          created_at: string
          id: string
          ip_address: unknown
          resource_id: string | null
          resource_type: string
          user_agent: string | null
        }
        Insert: {
          action: string
          actor_profile_id?: string | null
          actor_role: string
          after_data?: Json | null
          before_data?: Json | null
          company_id: string
          correlation_id?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          resource_id?: string | null
          resource_type: string
          user_agent?: string | null
        }
        Update: {
          action?: string
          actor_profile_id?: string | null
          actor_role?: string
          after_data?: Json | null
          before_data?: Json | null
          company_id?: string
          correlation_id?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          resource_id?: string | null
          resource_type?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_events_actor_profile_id_fkey"
            columns: ["actor_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
        ]
      }
      approval_tokens: {
        Row: {
          approver_email: string
          approver_name: string | null
          company_id: string
          created_at: string
          decision: string | null
          expires_at: string
          id: string
          ip_address: string | null
          rejection_reason: string | null
          request_id: string
          token: string
          used_at: string | null
          user_agent: string | null
        }
        Insert: {
          approver_email: string
          approver_name?: string | null
          company_id: string
          created_at?: string
          decision?: string | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          rejection_reason?: string | null
          request_id: string
          token?: string
          used_at?: string | null
          user_agent?: string | null
        }
        Update: {
          approver_email?: string
          approver_name?: string | null
          company_id?: string
          created_at?: string
          decision?: string | null
          expires_at?: string
          id?: string
          ip_address?: string | null
          rejection_reason?: string | null
          request_id?: string
          token?: string
          used_at?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "approval_tokens_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "approval_tokens_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "approval_tokens_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_groups: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          is_default_triage: boolean
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default_triage?: boolean
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          is_default_triage?: boolean
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_groups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_groups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
        ]
      }
      attachment_policies: {
        Row: {
          allowed_extensions: string[]
          blocked_extensions: string[]
          company_id: string
          id: string
          malware_scan_required: boolean
          max_size_bytes: number
          retention_days: number
          service_domain_id: string | null
        }
        Insert: {
          allowed_extensions?: string[]
          blocked_extensions?: string[]
          company_id: string
          id?: string
          malware_scan_required?: boolean
          max_size_bytes?: number
          retention_days?: number
          service_domain_id?: string | null
        }
        Update: {
          allowed_extensions?: string[]
          blocked_extensions?: string[]
          company_id?: string
          id?: string
          malware_scan_required?: boolean
          max_size_bytes?: number
          retention_days?: number
          service_domain_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "attachment_policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "attachment_policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "attachment_policies_service_domain_id_fkey"
            columns: ["service_domain_id"]
            isOneToOne: false
            referencedRelation: "service_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      bi_daily_snapshots: {
        Row: {
          aging_bucket: string
          breached_count: number
          company_id: string
          group_name: string
          open_count: number
          priority: string
          record_type: string
          snapshot_date: string
          state_group: string
        }
        Insert: {
          aging_bucket?: string
          breached_count?: number
          company_id: string
          group_name?: string
          open_count?: number
          priority?: string
          record_type: string
          snapshot_date: string
          state_group: string
        }
        Update: {
          aging_bucket?: string
          breached_count?: number
          company_id?: string
          group_name?: string
          open_count?: number
          priority?: string
          record_type?: string
          snapshot_date?: string
          state_group?: string
        }
        Relationships: [
          {
            foreignKeyName: "bi_daily_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bi_daily_snapshots_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
        ]
      }
      bi_dimensions: {
        Row: {
          data_type: string
          is_time_dim: boolean
          key: string
          label_pt: string
          record_types: string[]
          sort_order: number
          sql_expr: string
        }
        Insert: {
          data_type?: string
          is_time_dim?: boolean
          key: string
          label_pt: string
          record_types?: string[]
          sort_order?: number
          sql_expr: string
        }
        Update: {
          data_type?: string
          is_time_dim?: boolean
          key?: string
          label_pt?: string
          record_types?: string[]
          sort_order?: number
          sql_expr?: string
        }
        Relationships: []
      }
      bi_measures: {
        Row: {
          format: string
          key: string
          label_pt: string
          sort_order: number
          sql_expr: string
        }
        Insert: {
          format?: string
          key: string
          label_pt: string
          sort_order?: number
          sql_expr: string
        }
        Update: {
          format?: string
          key?: string
          label_pt?: string
          sort_order?: number
          sql_expr?: string
        }
        Relationships: []
      }
      bi_saved_reports: {
        Row: {
          chart_type: string
          company_id: string
          created_at: string
          created_by: string
          id: string
          is_public: boolean
          name: string
          query_config: Json
          report_kind: string
          schema_version: number
          updated_at: string
        }
        Insert: {
          chart_type: string
          company_id: string
          created_at?: string
          created_by: string
          id?: string
          is_public?: boolean
          name: string
          query_config?: Json
          report_kind?: string
          schema_version?: number
          updated_at?: string
        }
        Update: {
          chart_type?: string
          company_id?: string
          created_at?: string
          created_by?: string
          id?: string
          is_public?: boolean
          name?: string
          query_config?: Json
          report_kind?: string
          schema_version?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bi_saved_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bi_saved_reports_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
        ]
      }
      case_access_grants: {
        Row: {
          case_id: string
          company_id: string
          created_at: string
          expires_at: string | null
          granted_by: string | null
          id: string
          permission: string
          subject_id: string
          subject_type: string
        }
        Insert: {
          case_id: string
          company_id: string
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          permission?: string
          subject_id: string
          subject_type: string
        }
        Update: {
          case_id?: string
          company_id?: string
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          permission?: string
          subject_id?: string
          subject_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_access_grants_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_access_grants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_access_grants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "case_access_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      case_configuration_items: {
        Row: {
          case_id: string
          configuration_item_id: string
          relationship: string
        }
        Insert: {
          case_id: string
          configuration_item_id: string
          relationship?: string
        }
        Update: {
          case_id?: string
          configuration_item_id?: string
          relationship?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_configuration_items_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_configuration_items_configuration_item_id_fkey"
            columns: ["configuration_item_id"]
            isOneToOne: false
            referencedRelation: "configuration_items"
            referencedColumns: ["id"]
          },
        ]
      }
      case_types: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          form_schema: Json
          id: string
          initial_state: string
          key: string
          name: string
          service_domain_id: string
          specialization: Database["public"]["Enums"]["case_specialization"]
          updated_at: string
          workflow_config: Json
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          form_schema?: Json
          id?: string
          initial_state?: string
          key: string
          name: string
          service_domain_id: string
          specialization?: Database["public"]["Enums"]["case_specialization"]
          updated_at?: string
          workflow_config?: Json
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          form_schema?: Json
          id?: string
          initial_state?: string
          key?: string
          name?: string
          service_domain_id?: string
          specialization?: Database["public"]["Enums"]["case_specialization"]
          updated_at?: string
          workflow_config?: Json
        }
        Relationships: [
          {
            foreignKeyName: "case_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "case_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "case_types_service_domain_id_fkey"
            columns: ["service_domain_id"]
            isOneToOne: false
            referencedRelation: "service_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      cases: {
        Row: {
          assigned_to_id: string | null
          assignment_group_id: string | null
          case_type_id: string
          closed_at: string | null
          company_id: string
          created_at: string
          description: string | null
          form_data: Json
          id: string
          number: string
          priority: number
          requester_id: string | null
          resolved_at: string | null
          service_domain_id: string
          sla_resolution_deadline: string | null
          sla_response_deadline: string | null
          source_channel: string
          state: string
          title: string
          updated_at: string
          visibility: Database["public"]["Enums"]["service_domain_privacy"]
        }
        Insert: {
          assigned_to_id?: string | null
          assignment_group_id?: string | null
          case_type_id: string
          closed_at?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          form_data?: Json
          id?: string
          number: string
          priority?: number
          requester_id?: string | null
          resolved_at?: string | null
          service_domain_id: string
          sla_resolution_deadline?: string | null
          sla_response_deadline?: string | null
          source_channel?: string
          state: string
          title: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["service_domain_privacy"]
        }
        Update: {
          assigned_to_id?: string | null
          assignment_group_id?: string | null
          case_type_id?: string
          closed_at?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          form_data?: Json
          id?: string
          number?: string
          priority?: number
          requester_id?: string | null
          resolved_at?: string | null
          service_domain_id?: string
          sla_resolution_deadline?: string | null
          sla_response_deadline?: string | null
          source_channel?: string
          state?: string
          title?: string
          updated_at?: string
          visibility?: Database["public"]["Enums"]["service_domain_privacy"]
        }
        Relationships: [
          {
            foreignKeyName: "cases_assigned_to_id_fkey"
            columns: ["assigned_to_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_assignment_group_id_fkey"
            columns: ["assignment_group_id"]
            isOneToOne: false
            referencedRelation: "assignment_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_case_type_id_fkey"
            columns: ["case_type_id"]
            isOneToOne: false
            referencedRelation: "case_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "cases_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cases_service_domain_id_fkey"
            columns: ["service_domain_id"]
            isOneToOne: false
            referencedRelation: "service_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_categories: {
        Row: {
          company_id: string
          created_at: string
          department_id: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          ui_config: Json | null
        }
        Insert: {
          company_id: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          ui_config?: Json | null
        }
        Update: {
          company_id?: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          ui_config?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "catalog_categories_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_items: {
        Row: {
          active: boolean
          category: string
          category_id: string | null
          company_id: string
          created_at: string
          description: string | null
          estimated_delivery_days: number
          form_fields: Json
          icon: string
          id: string
          name: string
          requires_approval: boolean
          sla_hours: number
          visible_to_roles: Database["public"]["Enums"]["user_role"][]
        }
        Insert: {
          active?: boolean
          category: string
          category_id?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          estimated_delivery_days?: number
          form_fields?: Json
          icon?: string
          id?: string
          name: string
          requires_approval?: boolean
          sla_hours?: number
          visible_to_roles?: Database["public"]["Enums"]["user_role"][]
        }
        Update: {
          active?: boolean
          category?: string
          category_id?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          estimated_delivery_days?: number
          form_fields?: Json
          icon?: string
          id?: string
          name?: string
          requires_approval?: boolean
          sla_hours?: number
          visible_to_roles?: Database["public"]["Enums"]["user_role"][]
        }
        Relationships: [
          {
            foreignKeyName: "catalog_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "catalog_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
        ]
      }
      catalog_service_symptoms: {
        Row: {
          active: boolean
          assignment_group_id: string | null
          company_id: string
          created_at: string
          fixed_priority: number | null
          form_fields: Json
          form_template_id: string | null
          id: string
          service_id: string
          sla_calendar_id: string | null
          sla_hours: number
          symptom_id: string
          ui_config: Json
        }
        Insert: {
          active?: boolean
          assignment_group_id?: string | null
          company_id: string
          created_at?: string
          fixed_priority?: number | null
          form_fields?: Json
          form_template_id?: string | null
          id?: string
          service_id: string
          sla_calendar_id?: string | null
          sla_hours?: number
          symptom_id: string
          ui_config?: Json
        }
        Update: {
          active?: boolean
          assignment_group_id?: string | null
          company_id?: string
          created_at?: string
          fixed_priority?: number | null
          form_fields?: Json
          form_template_id?: string | null
          id?: string
          service_id?: string
          sla_calendar_id?: string | null
          sla_hours?: number
          symptom_id?: string
          ui_config?: Json
        }
        Relationships: [
          {
            foreignKeyName: "catalog_service_symptoms_assignment_group_id_fkey"
            columns: ["assignment_group_id"]
            isOneToOne: false
            referencedRelation: "assignment_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_service_symptoms_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_service_symptoms_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "catalog_service_symptoms_form_template_id_fkey"
            columns: ["form_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_service_symptoms_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "catalog_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_service_symptoms_sla_calendar_id_fkey"
            columns: ["sla_calendar_id"]
            isOneToOne: false
            referencedRelation: "sla_calendars"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_service_symptoms_symptom_id_fkey"
            columns: ["symptom_id"]
            isOneToOne: false
            referencedRelation: "system_symptoms"
            referencedColumns: ["id"]
          },
        ]
      }
      catalog_services: {
        Row: {
          category_id: string
          company_id: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          sort_order: number
          ui_config: Json | null
        }
        Insert: {
          category_id: string
          company_id: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          ui_config?: Json | null
        }
        Update: {
          category_id?: string
          company_id?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          ui_config?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "catalog_services_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "catalog_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "catalog_services_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
        ]
      }
      change_history: {
        Row: {
          change_id: string
          changed_by_id: string | null
          changed_by_name: string
          comment: string | null
          created_at: string
          field_name: string
          id: string
          is_public: boolean
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          change_id: string
          changed_by_id?: string | null
          changed_by_name: string
          comment?: string | null
          created_at?: string
          field_name: string
          id?: string
          is_public?: boolean
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          change_id?: string
          changed_by_id?: string | null
          changed_by_name?: string
          comment?: string | null
          created_at?: string
          field_name?: string
          id?: string
          is_public?: boolean
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "change_history_change_id_fkey"
            columns: ["change_id"]
            isOneToOne: false
            referencedRelation: "changes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_history_changed_by_id_fkey"
            columns: ["changed_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      change_incidents: {
        Row: {
          change_id: string
          incident_id: string
        }
        Insert: {
          change_id: string
          incident_id: string
        }
        Update: {
          change_id?: string
          incident_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "change_incidents_change_id_fkey"
            columns: ["change_id"]
            isOneToOne: false
            referencedRelation: "changes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_incidents_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "change_incidents_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      changes: {
        Row: {
          backout_plan: string | null
          cab_approvals: Json
          cab_approvers: Json
          change_window_end: string | null
          change_window_start: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          implementation_plan: string | null
          implementer_id: string | null
          implementer_name: string | null
          justification: string | null
          number: string
          related_problem_id: string | null
          requested_by_id: string | null
          requested_by_name: string
          risk: Database["public"]["Enums"]["change_risk"]
          short_description: string
          state: Database["public"]["Enums"]["change_state"]
          test_plan: string | null
          type: Database["public"]["Enums"]["change_type"]
          updated_at: string
        }
        Insert: {
          backout_plan?: string | null
          cab_approvals?: Json
          cab_approvers?: Json
          change_window_end?: string | null
          change_window_start?: string | null
          company_id: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          implementation_plan?: string | null
          implementer_id?: string | null
          implementer_name?: string | null
          justification?: string | null
          number: string
          related_problem_id?: string | null
          requested_by_id?: string | null
          requested_by_name: string
          risk?: Database["public"]["Enums"]["change_risk"]
          short_description: string
          state?: Database["public"]["Enums"]["change_state"]
          test_plan?: string | null
          type?: Database["public"]["Enums"]["change_type"]
          updated_at?: string
        }
        Update: {
          backout_plan?: string | null
          cab_approvals?: Json
          cab_approvers?: Json
          change_window_end?: string | null
          change_window_start?: string | null
          company_id?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          implementation_plan?: string | null
          implementer_id?: string | null
          implementer_name?: string | null
          justification?: string | null
          number?: string
          related_problem_id?: string | null
          requested_by_id?: string | null
          requested_by_name?: string
          risk?: Database["public"]["Enums"]["change_risk"]
          short_description?: string
          state?: Database["public"]["Enums"]["change_state"]
          test_plan?: string | null
          type?: Database["public"]["Enums"]["change_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "changes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "changes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "changes_implementer_id_fkey"
            columns: ["implementer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "changes_related_problem_id_fkey"
            columns: ["related_problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "changes_requested_by_id_fkey"
            columns: ["requested_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_connections: {
        Row: {
          address: string | null
          capabilities: Json
          company_id: string
          config: Json
          created_at: string
          created_by: string | null
          enabled: boolean
          external_account_id: string | null
          id: string
          last_error_code: string | null
          last_error_message: string | null
          last_health_check_at: string | null
          name: string
          provider: Database["public"]["Enums"]["channel_provider"]
          rotation_required: boolean
          scope: Database["public"]["Enums"]["channel_scope"]
          status: string
          subscription_expires_at: string | null
          updated_at: string
          vault_secret_id: string | null
        }
        Insert: {
          address?: string | null
          capabilities?: Json
          company_id: string
          config?: Json
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          external_account_id?: string | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_health_check_at?: string | null
          name: string
          provider: Database["public"]["Enums"]["channel_provider"]
          rotation_required?: boolean
          scope?: Database["public"]["Enums"]["channel_scope"]
          status?: string
          subscription_expires_at?: string | null
          updated_at?: string
          vault_secret_id?: string | null
        }
        Update: {
          address?: string | null
          capabilities?: Json
          company_id?: string
          config?: Json
          created_at?: string
          created_by?: string | null
          enabled?: boolean
          external_account_id?: string | null
          id?: string
          last_error_code?: string | null
          last_error_message?: string | null
          last_health_check_at?: string | null
          name?: string
          provider?: Database["public"]["Enums"]["channel_provider"]
          rotation_required?: boolean
          scope?: Database["public"]["Enums"]["channel_scope"]
          status?: string
          subscription_expires_at?: string | null
          updated_at?: string
          vault_secret_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_connections_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "channel_connections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_delivery_events: {
        Row: {
          company_id: string
          error_code: string | null
          error_message: string | null
          id: string
          message_id: string
          occurred_at: string
          payload: Json | null
          provider_event_id: string | null
          status: Database["public"]["Enums"]["delivery_status"]
        }
        Insert: {
          company_id: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          message_id: string
          occurred_at?: string
          payload?: Json | null
          provider_event_id?: string | null
          status: Database["public"]["Enums"]["delivery_status"]
        }
        Update: {
          company_id?: string
          error_code?: string | null
          error_message?: string | null
          id?: string
          message_id?: string
          occurred_at?: string
          payload?: Json | null
          provider_event_id?: string | null
          status?: Database["public"]["Enums"]["delivery_status"]
        }
        Relationships: [
          {
            foreignKeyName: "channel_delivery_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_delivery_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "channel_delivery_events_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "channel_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_message_attachments: {
        Row: {
          company_id: string
          content_type: string
          created_at: string
          external_id: string | null
          file_name: string
          id: string
          malware_status: string
          message_id: string
          size_bytes: number | null
          storage_path: string | null
        }
        Insert: {
          company_id: string
          content_type: string
          created_at?: string
          external_id?: string | null
          file_name: string
          id?: string
          malware_status?: string
          message_id: string
          size_bytes?: number | null
          storage_path?: string | null
        }
        Update: {
          company_id?: string
          content_type?: string
          created_at?: string
          external_id?: string | null
          file_name?: string
          id?: string
          malware_status?: string
          message_id?: string
          size_bytes?: number | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_message_attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_message_attachments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "channel_message_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "channel_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_messages: {
        Row: {
          body_html: string | null
          body_text: string
          company_id: string
          connection_id: string
          conversation_id: string
          created_at: string
          delivery_status: Database["public"]["Enums"]["delivery_status"]
          direction: string
          external_event_id: string | null
          external_message_id: string
          id: string
          occurred_at: string
          raw_payload: Json | null
          references_header: string[]
          reply_to_external_id: string | null
          sender_identity_id: string | null
          sender_profile_id: string | null
          subject: string | null
          ticket_message_id: string | null
        }
        Insert: {
          body_html?: string | null
          body_text?: string
          company_id: string
          connection_id: string
          conversation_id: string
          created_at?: string
          delivery_status?: Database["public"]["Enums"]["delivery_status"]
          direction: string
          external_event_id?: string | null
          external_message_id: string
          id?: string
          occurred_at: string
          raw_payload?: Json | null
          references_header?: string[]
          reply_to_external_id?: string | null
          sender_identity_id?: string | null
          sender_profile_id?: string | null
          subject?: string | null
          ticket_message_id?: string | null
        }
        Update: {
          body_html?: string | null
          body_text?: string
          company_id?: string
          connection_id?: string
          conversation_id?: string
          created_at?: string
          delivery_status?: Database["public"]["Enums"]["delivery_status"]
          direction?: string
          external_event_id?: string | null
          external_message_id?: string
          id?: string
          occurred_at?: string
          raw_payload?: Json | null
          references_header?: string[]
          reply_to_external_id?: string | null
          sender_identity_id?: string | null
          sender_profile_id?: string | null
          subject?: string | null
          ticket_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "channel_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "channel_messages_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_messages_sender_identity_id_fkey"
            columns: ["sender_identity_id"]
            isOneToOne: false
            referencedRelation: "external_identities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_messages_sender_profile_id_fkey"
            columns: ["sender_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_messages_ticket_message_id_fkey"
            columns: ["ticket_message_id"]
            isOneToOne: false
            referencedRelation: "ticket_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_outbox: {
        Row: {
          attempt_count: number
          company_id: string
          connection_id: string
          conversation_id: string
          correlation_id: string
          created_at: string
          id: string
          last_error: string | null
          locked_at: string | null
          next_attempt_at: string
          payload: Json
          source_ticket_message_id: number | null
          status: Database["public"]["Enums"]["delivery_status"]
        }
        Insert: {
          attempt_count?: number
          company_id: string
          connection_id: string
          conversation_id: string
          correlation_id: string
          created_at?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          next_attempt_at?: string
          payload: Json
          source_ticket_message_id?: number | null
          status?: Database["public"]["Enums"]["delivery_status"]
        }
        Update: {
          attempt_count?: number
          company_id?: string
          connection_id?: string
          conversation_id?: string
          correlation_id?: string
          created_at?: string
          id?: string
          last_error?: string | null
          locked_at?: string | null
          next_attempt_at?: string
          payload?: Json
          source_ticket_message_id?: number | null
          status?: Database["public"]["Enums"]["delivery_status"]
        }
        Relationships: [
          {
            foreignKeyName: "channel_outbox_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_outbox_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "channel_outbox_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_outbox_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_routes: {
        Row: {
          assignment_group_id: string | null
          connection_id: string
          created_at: string
          enabled: boolean
          id: string
          match_type: string
          match_value: string | null
          priority: number
          service_domain_id: string | null
          target_company_id: string
        }
        Insert: {
          assignment_group_id?: string | null
          connection_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          match_type: string
          match_value?: string | null
          priority?: number
          service_domain_id?: string | null
          target_company_id: string
        }
        Update: {
          assignment_group_id?: string | null
          connection_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          match_type?: string
          match_value?: string | null
          priority?: number
          service_domain_id?: string | null
          target_company_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_routes_assignment_group_id_fkey"
            columns: ["assignment_group_id"]
            isOneToOne: false
            referencedRelation: "assignment_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_routes_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_routes_domain_fk"
            columns: ["service_domain_id"]
            isOneToOne: false
            referencedRelation: "service_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_routes_target_company_id_fkey"
            columns: ["target_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_routes_target_company_id_fkey"
            columns: ["target_company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
        ]
      }
      channel_triage_events: {
        Row: {
          body_excerpt: string | null
          company_id: string
          connection_id: string
          created_at: string
          external_event_id: string
          external_message_id: string | null
          id: string
          provider: Database["public"]["Enums"]["channel_provider"]
          raw_payload: Json
          reason: string
          recipients: string[]
          resolved_at: string | null
          resolved_by: string | null
          resolved_company_id: string | null
          sender: string | null
          status: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          body_excerpt?: string | null
          company_id: string
          connection_id: string
          created_at?: string
          external_event_id: string
          external_message_id?: string | null
          id?: string
          provider: Database["public"]["Enums"]["channel_provider"]
          raw_payload?: Json
          reason: string
          recipients?: string[]
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_company_id?: string | null
          sender?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          body_excerpt?: string | null
          company_id?: string
          connection_id?: string
          created_at?: string
          external_event_id?: string
          external_message_id?: string | null
          id?: string
          provider?: Database["public"]["Enums"]["channel_provider"]
          raw_payload?: Json
          reason?: string
          recipients?: string[]
          resolved_at?: string | null
          resolved_by?: string | null
          resolved_company_id?: string | null
          sender?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_triage_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_triage_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "channel_triage_events_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_triage_events_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_triage_events_resolved_company_id_fkey"
            columns: ["resolved_company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_triage_events_resolved_company_id_fkey"
            columns: ["resolved_company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
        ]
      }
      chatbot_blocked_attempts: {
        Row: {
          attempted_at: string
          block_reason: string
          channel: string
          id: string
          message: string | null
          phone_e164: string | null
          raw_payload: Json | null
          teams_user: string | null
        }
        Insert: {
          attempted_at?: string
          block_reason: string
          channel: string
          id?: string
          message?: string | null
          phone_e164?: string | null
          raw_payload?: Json | null
          teams_user?: string | null
        }
        Update: {
          attempted_at?: string
          block_reason?: string
          channel?: string
          id?: string
          message?: string | null
          phone_e164?: string | null
          raw_payload?: Json | null
          teams_user?: string | null
        }
        Relationships: []
      }
      chatbot_config: {
        Row: {
          bot_name: string
          business_days: number[] | null
          business_hours_end: string | null
          business_hours_start: string | null
          company_id: string
          created_at: string
          id: string
          outside_hours_message: string | null
          rotation_required: boolean
          teams_app_id: string | null
          teams_app_secret: string | null
          teams_enabled: boolean
          teams_tenant_id: string | null
          teams_vault_secret_id: string | null
          unauthorized_message: string
          updated_at: string
          welcome_message: string | null
          whatsapp_enabled: boolean
          whatsapp_phone_number_id: string | null
          whatsapp_token: string | null
          whatsapp_vault_secret_id: string | null
          whatsapp_webhook_secret: string | null
          whatsapp_webhook_vault_secret_id: string | null
        }
        Insert: {
          bot_name?: string
          business_days?: number[] | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          company_id: string
          created_at?: string
          id?: string
          outside_hours_message?: string | null
          rotation_required?: boolean
          teams_app_id?: string | null
          teams_app_secret?: string | null
          teams_enabled?: boolean
          teams_tenant_id?: string | null
          teams_vault_secret_id?: string | null
          unauthorized_message?: string
          updated_at?: string
          welcome_message?: string | null
          whatsapp_enabled?: boolean
          whatsapp_phone_number_id?: string | null
          whatsapp_token?: string | null
          whatsapp_vault_secret_id?: string | null
          whatsapp_webhook_secret?: string | null
          whatsapp_webhook_vault_secret_id?: string | null
        }
        Update: {
          bot_name?: string
          business_days?: number[] | null
          business_hours_end?: string | null
          business_hours_start?: string | null
          company_id?: string
          created_at?: string
          id?: string
          outside_hours_message?: string | null
          rotation_required?: boolean
          teams_app_id?: string | null
          teams_app_secret?: string | null
          teams_enabled?: boolean
          teams_tenant_id?: string | null
          teams_vault_secret_id?: string | null
          unauthorized_message?: string
          updated_at?: string
          welcome_message?: string | null
          whatsapp_enabled?: boolean
          whatsapp_phone_number_id?: string | null
          whatsapp_token?: string | null
          whatsapp_vault_secret_id?: string | null
          whatsapp_webhook_secret?: string | null
          whatsapp_webhook_vault_secret_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_config_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
        ]
      }
      chatbot_messages: {
        Row: {
          channel: string
          company_id: string
          content: string
          created_at: string
          direction: string
          id: string
          linked_ticket_id: string | null
          linked_ticket_type: string | null
          metadata: Json
          processed: boolean
          processed_at: string | null
          sender_ref: string | null
          user_id: string | null
        }
        Insert: {
          channel: string
          company_id: string
          content: string
          created_at?: string
          direction: string
          id?: string
          linked_ticket_id?: string | null
          linked_ticket_type?: string | null
          metadata?: Json
          processed?: boolean
          processed_at?: string | null
          sender_ref?: string | null
          user_id?: string | null
        }
        Update: {
          channel?: string
          company_id?: string
          content?: string
          created_at?: string
          direction?: string
          id?: string
          linked_ticket_id?: string | null
          linked_ticket_type?: string | null
          metadata?: Json
          processed?: boolean
          processed_at?: string | null
          sender_ref?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "chatbot_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chatbot_whitelist: {
        Row: {
          active: boolean
          approved_at: string | null
          approved_by: string | null
          company_id: string
          created_at: string
          id: string
          phone_e164: string
          revoked_at: string | null
          revoked_reason: string | null
          teams_enabled: boolean
          teams_user_id: string | null
          updated_at: string
          user_id: string | null
          whatsapp_enabled: boolean
        }
        Insert: {
          active?: boolean
          approved_at?: string | null
          approved_by?: string | null
          company_id: string
          created_at?: string
          id?: string
          phone_e164: string
          revoked_at?: string | null
          revoked_reason?: string | null
          teams_enabled?: boolean
          teams_user_id?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp_enabled?: boolean
        }
        Update: {
          active?: boolean
          approved_at?: string | null
          approved_by?: string | null
          company_id?: string
          created_at?: string
          id?: string
          phone_e164?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          teams_enabled?: boolean
          teams_user_id?: string | null
          updated_at?: string
          user_id?: string | null
          whatsapp_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "chatbot_whitelist_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_whitelist_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chatbot_whitelist_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "chatbot_whitelist_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ci_classes: {
        Row: {
          active: boolean
          attribute_schema: Json
          company_id: string
          created_at: string
          id: string
          key: string
          name: string
          parent_id: string | null
        }
        Insert: {
          active?: boolean
          attribute_schema?: Json
          company_id: string
          created_at?: string
          id?: string
          key: string
          name: string
          parent_id?: string | null
        }
        Update: {
          active?: boolean
          attribute_schema?: Json
          company_id?: string
          created_at?: string
          id?: string
          key?: string
          name?: string
          parent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ci_classes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ci_classes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "ci_classes_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "ci_classes"
            referencedColumns: ["id"]
          },
        ]
      }
      ci_relationship_types: {
        Row: {
          active: boolean
          company_id: string
          id: string
          inverse_name: string
          key: string
          name: string
        }
        Insert: {
          active?: boolean
          company_id: string
          id?: string
          inverse_name: string
          key: string
          name: string
        }
        Update: {
          active?: boolean
          company_id?: string
          id?: string
          inverse_name?: string
          key?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "ci_relationship_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ci_relationship_types_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
        ]
      }
      ci_relationships: {
        Row: {
          attributes: Json
          company_id: string
          created_at: string
          id: string
          relationship_type_id: string
          source_ci_id: string
          target_ci_id: string
        }
        Insert: {
          attributes?: Json
          company_id: string
          created_at?: string
          id?: string
          relationship_type_id: string
          source_ci_id: string
          target_ci_id: string
        }
        Update: {
          attributes?: Json
          company_id?: string
          created_at?: string
          id?: string
          relationship_type_id?: string
          source_ci_id?: string
          target_ci_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ci_relationships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ci_relationships_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "ci_relationships_relationship_type_id_fkey"
            columns: ["relationship_type_id"]
            isOneToOne: false
            referencedRelation: "ci_relationship_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ci_relationships_source_ci_id_fkey"
            columns: ["source_ci_id"]
            isOneToOne: false
            referencedRelation: "configuration_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ci_relationships_target_ci_id_fkey"
            columns: ["target_ci_id"]
            isOneToOne: false
            referencedRelation: "configuration_items"
            referencedColumns: ["id"]
          },
        ]
      }
      ci_source_records: {
        Row: {
          company_id: string
          configuration_item_id: string
          external_id: string
          fingerprint: string | null
          id: string
          last_seen_at: string
          source_id: string
          source_payload: Json
        }
        Insert: {
          company_id: string
          configuration_item_id: string
          external_id: string
          fingerprint?: string | null
          id?: string
          last_seen_at?: string
          source_id: string
          source_payload?: Json
        }
        Update: {
          company_id?: string
          configuration_item_id?: string
          external_id?: string
          fingerprint?: string | null
          id?: string
          last_seen_at?: string
          source_id?: string
          source_payload?: Json
        }
        Relationships: [
          {
            foreignKeyName: "ci_source_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ci_source_records_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "ci_source_records_configuration_item_id_fkey"
            columns: ["configuration_item_id"]
            isOneToOne: false
            referencedRelation: "configuration_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ci_source_records_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "discovery_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          accent_color: string
          active: boolean
          allow_local_login: boolean
          background_url: string | null
          bg_color: string
          brand_name: string | null
          branding_settings: Json
          catalog_headline: string | null
          catalog_headline_color: string | null
          catalog_headline_size: string | null
          catalog_ui_config: Json | null
          concurrent_licenses: number
          created_at: string
          default_sla_calendar_id: string | null
          domain: string
          greeting_color: string | null
          greeting_prefix: string | null
          id: string
          is_provider_tenant: boolean
          license_alert_threshold: number
          license_expires_at: string | null
          license_plan: string
          logo_url: string | null
          max_analysts_licenses: number
          name: string
          primary_color: string
          secondary_color: string | null
          slug: string
          sso_providers: Json
          subtitle_color: string | null
          subtitle_font: string | null
          subtitle_size: string | null
          title_color: string | null
          title_font: string | null
          title_size: string | null
          updated_at: string
          welcome_subtitle: string
          welcome_title: string
        }
        Insert: {
          accent_color?: string
          active?: boolean
          allow_local_login?: boolean
          background_url?: string | null
          bg_color?: string
          brand_name?: string | null
          branding_settings?: Json
          catalog_headline?: string | null
          catalog_headline_color?: string | null
          catalog_headline_size?: string | null
          catalog_ui_config?: Json | null
          concurrent_licenses?: number
          created_at?: string
          default_sla_calendar_id?: string | null
          domain: string
          greeting_color?: string | null
          greeting_prefix?: string | null
          id?: string
          is_provider_tenant?: boolean
          license_alert_threshold?: number
          license_expires_at?: string | null
          license_plan?: string
          logo_url?: string | null
          max_analysts_licenses?: number
          name: string
          primary_color?: string
          secondary_color?: string | null
          slug: string
          sso_providers?: Json
          subtitle_color?: string | null
          subtitle_font?: string | null
          subtitle_size?: string | null
          title_color?: string | null
          title_font?: string | null
          title_size?: string | null
          updated_at?: string
          welcome_subtitle?: string
          welcome_title?: string
        }
        Update: {
          accent_color?: string
          active?: boolean
          allow_local_login?: boolean
          background_url?: string | null
          bg_color?: string
          brand_name?: string | null
          branding_settings?: Json
          catalog_headline?: string | null
          catalog_headline_color?: string | null
          catalog_headline_size?: string | null
          catalog_ui_config?: Json | null
          concurrent_licenses?: number
          created_at?: string
          default_sla_calendar_id?: string | null
          domain?: string
          greeting_color?: string | null
          greeting_prefix?: string | null
          id?: string
          is_provider_tenant?: boolean
          license_alert_threshold?: number
          license_expires_at?: string | null
          license_plan?: string
          logo_url?: string | null
          max_analysts_licenses?: number
          name?: string
          primary_color?: string
          secondary_color?: string | null
          slug?: string
          sso_providers?: Json
          subtitle_color?: string | null
          subtitle_font?: string | null
          subtitle_size?: string | null
          title_color?: string | null
          title_font?: string | null
          title_size?: string | null
          updated_at?: string
          welcome_subtitle?: string
          welcome_title?: string
        }
        Relationships: [
          {
            foreignKeyName: "companies_default_sla_calendar_id_fkey"
            columns: ["default_sla_calendar_id"]
            isOneToOne: false
            referencedRelation: "sla_calendars"
            referencedColumns: ["id"]
          },
        ]
      }
      company_login_domains: {
        Row: {
          company_id: string
          created_at: string
          domain: string
          id: string
          is_primary: boolean
          updated_at: string
          verified_at: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          domain: string
          id?: string
          is_primary?: boolean
          updated_at?: string
          verified_at?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          domain?: string
          id?: string
          is_primary?: boolean
          updated_at?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_login_domains_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      company_module_entitlements: {
        Row: {
          company_id: string
          created_at: string
          enabled: boolean
          ends_at: string | null
          id: string
          limits: Json
          module_key: string
          source: string
          starts_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          enabled?: boolean
          ends_at?: string | null
          id?: string
          limits?: Json
          module_key: string
          source?: string
          starts_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          enabled?: boolean
          ends_at?: string | null
          id?: string
          limits?: Json
          module_key?: string
          source?: string
          starts_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_module_entitlements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "company_module_entitlements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "company_module_entitlements_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      configuration_items: {
        Row: {
          asset_tag: string | null
          attributes: Json
          class_id: string
          company_id: string
          created_at: string
          criticality: string
          hostname: string | null
          id: string
          last_discovered_at: string | null
          lifecycle: string
          name: string
          primary_source_id: string | null
          serial_number: string | null
          updated_at: string
        }
        Insert: {
          asset_tag?: string | null
          attributes?: Json
          class_id: string
          company_id: string
          created_at?: string
          criticality?: string
          hostname?: string | null
          id?: string
          last_discovered_at?: string | null
          lifecycle?: string
          name: string
          primary_source_id?: string | null
          serial_number?: string | null
          updated_at?: string
        }
        Update: {
          asset_tag?: string | null
          attributes?: Json
          class_id?: string
          company_id?: string
          created_at?: string
          criticality?: string
          hostname?: string | null
          id?: string
          last_discovered_at?: string | null
          lifecycle?: string
          name?: string
          primary_source_id?: string | null
          serial_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "configuration_items_class_id_fkey"
            columns: ["class_id"]
            isOneToOne: false
            referencedRelation: "ci_classes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "configuration_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "configuration_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "configuration_items_primary_source_id_fkey"
            columns: ["primary_source_id"]
            isOneToOne: false
            referencedRelation: "discovery_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_entitlements: {
        Row: {
          catalog_item_id: string | null
          company_id: string
          config: Json
          consumed: number
          contract_id: string
          id: string
          monthly_limit: number | null
          service_domain_id: string | null
          sla_policy_id: string | null
        }
        Insert: {
          catalog_item_id?: string | null
          company_id: string
          config?: Json
          consumed?: number
          contract_id: string
          id?: string
          monthly_limit?: number | null
          service_domain_id?: string | null
          sla_policy_id?: string | null
        }
        Update: {
          catalog_item_id?: string | null
          company_id?: string
          config?: Json
          consumed?: number
          contract_id?: string
          id?: string
          monthly_limit?: number | null
          service_domain_id?: string | null
          sla_policy_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contract_entitlements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_entitlements_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "contract_entitlements_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "service_contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_entitlements_service_domain_id_fkey"
            columns: ["service_domain_id"]
            isOneToOne: false
            referencedRelation: "service_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_entitlements_sla_policy_id_fkey"
            columns: ["sla_policy_id"]
            isOneToOne: false
            referencedRelation: "sla_policies"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assigned_group_id: string | null
          assigned_to_id: string | null
          case_id: string | null
          company_id: string
          connection_id: string
          created_at: string
          external_conversation_id: string
          id: string
          incident_id: string | null
          last_message_at: string | null
          metadata: Json
          requester_identity_id: string | null
          status: string
          subject: string | null
          updated_at: string
        }
        Insert: {
          assigned_group_id?: string | null
          assigned_to_id?: string | null
          case_id?: string | null
          company_id: string
          connection_id: string
          created_at?: string
          external_conversation_id: string
          id?: string
          incident_id?: string | null
          last_message_at?: string | null
          metadata?: Json
          requester_identity_id?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Update: {
          assigned_group_id?: string | null
          assigned_to_id?: string | null
          case_id?: string | null
          company_id?: string
          connection_id?: string
          created_at?: string
          external_conversation_id?: string
          id?: string
          incident_id?: string | null
          last_message_at?: string | null
          metadata?: Json
          requester_identity_id?: string | null
          status?: string
          subject?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_group_id_fkey"
            columns: ["assigned_group_id"]
            isOneToOne: false
            referencedRelation: "assignment_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_assigned_to_id_fkey"
            columns: ["assigned_to_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_case_fk"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "conversations_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "channel_connections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_requester_identity_id_fkey"
            columns: ["requester_identity_id"]
            isOneToOne: false
            referencedRelation: "external_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      csat_surveys: {
        Row: {
          comment: string | null
          company_id: string
          created_at: string
          id: string
          incident_id: string
          rating: number | null
          requester_id: string
          sent_at: string
          status: string
          submitted_at: string | null
        }
        Insert: {
          comment?: string | null
          company_id: string
          created_at?: string
          id?: string
          incident_id: string
          rating?: number | null
          requester_id: string
          sent_at?: string
          status?: string
          submitted_at?: string | null
        }
        Update: {
          comment?: string | null
          company_id?: string
          created_at?: string
          id?: string
          incident_id?: string
          rating?: number | null
          requester_id?: string
          sent_at?: string
          status?: string
          submitted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "csat_surveys_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csat_surveys_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "csat_surveys_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: true
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csat_surveys_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: true
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "csat_surveys_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          alternate_manager_id: string | null
          company_id: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          location_id: string | null
          manager_id: string | null
          name: string
          parent_id: string | null
          sort_order: number
          ui_config: Json | null
          updated_at: string
          visible_to_groups: string[] | null
        }
        Insert: {
          alternate_manager_id?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          location_id?: string | null
          manager_id?: string | null
          name: string
          parent_id?: string | null
          sort_order?: number
          ui_config?: Json | null
          updated_at?: string
          visible_to_groups?: string[] | null
        }
        Update: {
          alternate_manager_id?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          location_id?: string | null
          manager_id?: string | null
          name?: string
          parent_id?: string | null
          sort_order?: number
          ui_config?: Json | null
          updated_at?: string
          visible_to_groups?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "departments_alternate_manager_id_fkey"
            columns: ["alternate_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "departments_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "departments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      discovery_sources: {
        Row: {
          company_id: string
          config: Json
          created_at: string
          enabled: boolean
          id: string
          last_error: string | null
          last_sync_at: string | null
          name: string
          precedence: number
          provider: string
          status: string
          vault_secret_id: string | null
        }
        Insert: {
          company_id: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          name: string
          precedence?: number
          provider: string
          status?: string
          vault_secret_id?: string | null
        }
        Update: {
          company_id?: string
          config?: Json
          created_at?: string
          enabled?: boolean
          id?: string
          last_error?: string | null
          last_sync_at?: string | null
          name?: string
          precedence?: number
          provider?: string
          status?: string
          vault_secret_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "discovery_sources_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discovery_sources_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
        ]
      }
      external_identities: {
        Row: {
          company_id: string
          created_at: string
          display_name: string | null
          email: string | null
          external_id: string
          id: string
          metadata: Json
          phone_e164: string | null
          profile_id: string | null
          provider: Database["public"]["Enums"]["channel_provider"]
          updated_at: string
          verified: boolean
        }
        Insert: {
          company_id: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          external_id: string
          id?: string
          metadata?: Json
          phone_e164?: string | null
          profile_id?: string | null
          provider: Database["public"]["Enums"]["channel_provider"]
          updated_at?: string
          verified?: boolean
        }
        Update: {
          company_id?: string
          created_at?: string
          display_name?: string | null
          email?: string | null
          external_id?: string
          id?: string
          metadata?: Json
          phone_e164?: string | null
          profile_id?: string | null
          provider?: Database["public"]["Enums"]["channel_provider"]
          updated_at?: string
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "external_identities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "external_identities_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "external_identities_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      form_templates: {
        Row: {
          created_at: string
          fields: Json
          id: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fields?: Json
          id?: string
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fields?: Json
          id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "form_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "form_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
        ]
      }
      groups: {
        Row: {
          company_id: string
          created_at: string
          description: string | null
          id: string
          name: string
        }
        Insert: {
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
        ]
      }
      incident_attributes: {
        Row: {
          category: string
          company_id: string
          created_at: string
          impact: string | null
          is_major_incident: boolean
          related_problem_id: string | null
          root_cause: string | null
          ticket_id: string
          urgency: string | null
          workaround: string | null
        }
        Insert: {
          category?: string
          company_id: string
          created_at?: string
          impact?: string | null
          is_major_incident?: boolean
          related_problem_id?: string | null
          root_cause?: string | null
          ticket_id: string
          urgency?: string | null
          workaround?: string | null
        }
        Update: {
          category?: string
          company_id?: string
          created_at?: string
          impact?: string | null
          is_major_incident?: boolean
          related_problem_id?: string | null
          root_cause?: string | null
          ticket_id?: string
          urgency?: string | null
          workaround?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incident_attributes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_attributes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "incident_attributes_related_problem_id_fkey"
            columns: ["related_problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_attributes_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_attributes_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_catalog_items: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_catalog_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_catalog_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
        ]
      }
      incident_catalog_subitems: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          description: string | null
          id: string
          item_id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          item_id: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          item_id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_catalog_subitems_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_catalog_subitems_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "incident_catalog_subitems_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "incident_catalog_items"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_catalog_symptoms: {
        Row: {
          active: boolean
          auto_assign_group_id: string | null
          company_id: string
          created_at: string
          default_priority: string
          description: string | null
          id: string
          item_id: string
          name: string
          search_vector: unknown
          sla_resolution_mins: number
          sla_response_mins: number
          sort_order: number
          subitem_id: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          auto_assign_group_id?: string | null
          company_id: string
          created_at?: string
          default_priority?: string
          description?: string | null
          id?: string
          item_id: string
          name: string
          search_vector?: unknown
          sla_resolution_mins?: number
          sla_response_mins?: number
          sort_order?: number
          subitem_id: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          auto_assign_group_id?: string | null
          company_id?: string
          created_at?: string
          default_priority?: string
          description?: string | null
          id?: string
          item_id?: string
          name?: string
          search_vector?: unknown
          sla_resolution_mins?: number
          sla_response_mins?: number
          sort_order?: number
          subitem_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_catalog_symptoms_auto_assign_group_id_fkey"
            columns: ["auto_assign_group_id"]
            isOneToOne: false
            referencedRelation: "assignment_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_catalog_symptoms_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_catalog_symptoms_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "incident_catalog_symptoms_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "incident_catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_catalog_symptoms_subitem_id_fkey"
            columns: ["subitem_id"]
            isOneToOne: false
            referencedRelation: "incident_catalog_subitems"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_history: {
        Row: {
          changed_by_id: string | null
          changed_by_name: string
          comment: string | null
          created_at: string
          field_name: string
          id: string
          incident_id: string
          is_public: boolean
          new_value: string | null
          old_value: string | null
        }
        Insert: {
          changed_by_id?: string | null
          changed_by_name: string
          comment?: string | null
          created_at?: string
          field_name: string
          id?: string
          incident_id: string
          is_public?: boolean
          new_value?: string | null
          old_value?: string | null
        }
        Update: {
          changed_by_id?: string | null
          changed_by_name?: string
          comment?: string | null
          created_at?: string
          field_name?: string
          id?: string
          incident_id?: string
          is_public?: boolean
          new_value?: string | null
          old_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incident_history_changed_by_id_fkey"
            columns: ["changed_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_history_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_history_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      job_titles: {
        Row: {
          active: boolean
          code: string | null
          company_id: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          code?: string | null
          company_id: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          code?: string | null
          company_id?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_titles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "job_titles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
        ]
      }
      knowledge_article_cases: {
        Row: {
          article_id: string
          case_id: string
          company_id: string
          created_at: string
          id: string
          linked_by: string | null
          usage: string
        }
        Insert: {
          article_id: string
          case_id: string
          company_id: string
          created_at?: string
          id?: string
          linked_by?: string | null
          usage?: string
        }
        Update: {
          article_id?: string
          case_id?: string
          company_id?: string
          created_at?: string
          id?: string
          linked_by?: string | null
          usage?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_article_cases_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "knowledge_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_article_cases_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_article_cases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_article_cases_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "knowledge_article_cases_linked_by_fkey"
            columns: ["linked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_article_feedback: {
        Row: {
          article_id: string
          comment: string | null
          company_id: string
          created_at: string
          helpful: boolean
          id: string
          profile_id: string | null
        }
        Insert: {
          article_id: string
          comment?: string | null
          company_id: string
          created_at?: string
          helpful: boolean
          id?: string
          profile_id?: string | null
        }
        Update: {
          article_id?: string
          comment?: string | null
          company_id?: string
          created_at?: string
          helpful?: boolean
          id?: string
          profile_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_article_feedback_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "knowledge_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_article_feedback_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_article_feedback_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "knowledge_article_feedback_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_article_grants: {
        Row: {
          article_id: string
          company_id: string
          created_at: string
          expires_at: string | null
          granted_by: string | null
          id: string
          subject_id: string
          subject_type: string
        }
        Insert: {
          article_id: string
          company_id: string
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          subject_id: string
          subject_type: string
        }
        Update: {
          article_id?: string
          company_id?: string
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          subject_id?: string
          subject_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_article_grants_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "knowledge_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_article_grants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_article_grants_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "knowledge_article_grants_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_article_versions: {
        Row: {
          article_id: string
          body: string
          company_id: string
          created_at: string
          id: string
          snapshot_by: string | null
          status: string
          summary: string | null
          title: string
          version: number
          visibility: string
        }
        Insert: {
          article_id: string
          body: string
          company_id: string
          created_at?: string
          id?: string
          snapshot_by?: string | null
          status: string
          summary?: string | null
          title: string
          version: number
          visibility: string
        }
        Update: {
          article_id?: string
          body?: string
          company_id?: string
          created_at?: string
          id?: string
          snapshot_by?: string | null
          status?: string
          summary?: string | null
          title?: string
          version?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_article_versions_article_id_fkey"
            columns: ["article_id"]
            isOneToOne: false
            referencedRelation: "knowledge_articles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_article_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_article_versions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "knowledge_article_versions_snapshot_by_fkey"
            columns: ["snapshot_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_articles: {
        Row: {
          author_id: string | null
          body: string
          category_id: string | null
          company_id: string
          created_at: string
          deflection_count: number
          id: string
          published_at: string | null
          reviewer_id: string | null
          scheduled_at: string | null
          search_vector: unknown
          search_vector_unaccent: unknown
          service_domain_id: string | null
          slug: string
          source_ticket_id: string | null
          status: string
          summary: string | null
          tags: string[]
          title: string
          updated_at: string
          version: number
          view_count: number
          visibility: string
        }
        Insert: {
          author_id?: string | null
          body: string
          category_id?: string | null
          company_id: string
          created_at?: string
          deflection_count?: number
          id?: string
          published_at?: string | null
          reviewer_id?: string | null
          scheduled_at?: string | null
          search_vector?: unknown
          search_vector_unaccent?: unknown
          service_domain_id?: string | null
          slug: string
          source_ticket_id?: string | null
          status?: string
          summary?: string | null
          tags?: string[]
          title: string
          updated_at?: string
          version?: number
          view_count?: number
          visibility?: string
        }
        Update: {
          author_id?: string | null
          body?: string
          category_id?: string | null
          company_id?: string
          created_at?: string
          deflection_count?: number
          id?: string
          published_at?: string | null
          reviewer_id?: string | null
          scheduled_at?: string | null
          search_vector?: unknown
          search_vector_unaccent?: unknown
          service_domain_id?: string | null
          slug?: string
          source_ticket_id?: string | null
          status?: string
          summary?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
          version?: number
          view_count?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_articles_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_articles_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "knowledge_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_articles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_articles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "knowledge_articles_reviewer_id_fkey"
            columns: ["reviewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_articles_service_domain_id_fkey"
            columns: ["service_domain_id"]
            isOneToOne: false
            referencedRelation: "service_domains"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_articles_source_ticket_id_fkey"
            columns: ["source_ticket_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_articles_source_ticket_id_fkey"
            columns: ["source_ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      knowledge_categories: {
        Row: {
          company_id: string
          id: string
          name: string
          service_domain_id: string | null
          slug: string
        }
        Insert: {
          company_id: string
          id?: string
          name: string
          service_domain_id?: string | null
          slug: string
        }
        Update: {
          company_id?: string
          id?: string
          name?: string
          service_domain_id?: string | null
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "knowledge_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "knowledge_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "knowledge_categories_service_domain_id_fkey"
            columns: ["service_domain_id"]
            isOneToOne: false
            referencedRelation: "service_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      locations: {
        Row: {
          active: boolean
          address: Json
          code: string | null
          company_id: string
          id: string
          name: string
          parent_id: string | null
          timezone: string
        }
        Insert: {
          active?: boolean
          address?: Json
          code?: string | null
          company_id: string
          id?: string
          name: string
          parent_id?: string | null
          timezone?: string
        }
        Update: {
          active?: boolean
          address?: Json
          code?: string | null
          company_id?: string
          id?: string
          name?: string
          parent_id?: string | null
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "locations_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "locations_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
        ]
      }
      major_incidents: {
        Row: {
          bridge_url: string | null
          case_id: string | null
          commander_id: string | null
          company_id: string
          created_at: string
          id: string
          number: string
          public_summary: string | null
          resolved_at: string | null
          severity: number
          started_at: string
          status: string
          title: string
        }
        Insert: {
          bridge_url?: string | null
          case_id?: string | null
          commander_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          number: string
          public_summary?: string | null
          resolved_at?: string | null
          severity?: number
          started_at?: string
          status?: string
          title: string
        }
        Update: {
          bridge_url?: string | null
          case_id?: string | null
          commander_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          number?: string
          public_summary?: string | null
          resolved_at?: string | null
          severity?: number
          started_at?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "major_incidents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "major_incidents_commander_id_fkey"
            columns: ["commander_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "major_incidents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "major_incidents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
        ]
      }
      notification_templates: {
        Row: {
          body_template: string
          channel: string
          company_id: string
          created_at: string
          enabled: boolean
          id: string
          key: string
          locale: string
          name: string
          subject_template: string | null
          updated_at: string
          variables: Json
        }
        Insert: {
          body_template: string
          channel: string
          company_id: string
          created_at?: string
          enabled?: boolean
          id?: string
          key: string
          locale?: string
          name: string
          subject_template?: string | null
          updated_at?: string
          variables?: Json
        }
        Update: {
          body_template?: string
          channel?: string
          company_id?: string
          created_at?: string
          enabled?: boolean
          id?: string
          key?: string
          locale?: string
          name?: string
          subject_template?: string | null
          updated_at?: string
          variables?: Json
        }
        Relationships: [
          {
            foreignKeyName: "notification_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_templates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
        ]
      }
      notifications: {
        Row: {
          company_id: string
          created_at: string
          id: string
          link: string | null
          linked_ticket_id: string | null
          linked_ticket_type: string | null
          message: string
          read: boolean
          title: string
          type: string
          user_id: string
        }
        Insert: {
          company_id: string
          created_at?: string
          id?: string
          link?: string | null
          linked_ticket_id?: string | null
          linked_ticket_type?: string | null
          message: string
          read?: boolean
          title: string
          type: string
          user_id: string
        }
        Update: {
          company_id?: string
          created_at?: string
          id?: string
          link?: string | null
          linked_ticket_id?: string | null
          linked_ticket_type?: string | null
          message?: string
          read?: boolean
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ola_policies: {
        Row: {
          active: boolean
          assignment_group_id: string
          company_id: string
          id: string
          name: string
          resolution_minutes: number
          response_minutes: number
        }
        Insert: {
          active?: boolean
          assignment_group_id: string
          company_id: string
          id?: string
          name: string
          resolution_minutes: number
          response_minutes: number
        }
        Update: {
          active?: boolean
          assignment_group_id?: string
          company_id?: string
          id?: string
          name?: string
          resolution_minutes?: number
          response_minutes?: number
        }
        Relationships: [
          {
            foreignKeyName: "ola_policies_assignment_group_id_fkey"
            columns: ["assignment_group_id"]
            isOneToOne: false
            referencedRelation: "assignment_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ola_policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ola_policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
        ]
      }
      outbound_webhooks: {
        Row: {
          company_id: string
          consecutive_failures: number
          created_at: string
          created_by: string | null
          events_subscribed: string[]
          id: string
          is_active: boolean
          target_url: string
          updated_at: string
          vault_secret_id: string | null
        }
        Insert: {
          company_id: string
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          events_subscribed?: string[]
          id?: string
          is_active?: boolean
          target_url: string
          updated_at?: string
          vault_secret_id?: string | null
        }
        Update: {
          company_id?: string
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          events_subscribed?: string[]
          id?: string
          is_active?: boolean
          target_url?: string
          updated_at?: string
          vault_secret_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outbound_webhooks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outbound_webhooks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "outbound_webhooks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_reasons: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          name: string
          pauses_sla: boolean
          requires_customer_action: boolean
          slug: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          id?: string
          name: string
          pauses_sla?: boolean
          requires_customer_action?: boolean
          slug: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          name?: string
          pauses_sla?: boolean
          requires_customer_action?: boolean
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "pending_reasons_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pending_reasons_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
        ]
      }
      plans: {
        Row: {
          active: boolean
          created_at: string
          description: string | null
          feature_flags: Json
          id: string
          key: string
          max_agents: number | null
          max_tickets_per_month: number | null
          monthly_price_cents: number
          name: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          description?: string | null
          feature_flags?: Json
          id?: string
          key: string
          max_agents?: number | null
          max_tickets_per_month?: number | null
          monthly_price_cents?: number
          name: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          description?: string | null
          feature_flags?: Json
          id?: string
          key?: string
          max_agents?: number | null
          max_tickets_per_month?: number | null
          monthly_price_cents?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      problem_history: {
        Row: {
          changed_by_id: string | null
          changed_by_name: string
          comment: string | null
          created_at: string
          field_name: string
          id: string
          is_public: boolean
          new_value: string | null
          old_value: string | null
          problem_id: string
        }
        Insert: {
          changed_by_id?: string | null
          changed_by_name: string
          comment?: string | null
          created_at?: string
          field_name: string
          id?: string
          is_public?: boolean
          new_value?: string | null
          old_value?: string | null
          problem_id: string
        }
        Update: {
          changed_by_id?: string | null
          changed_by_name?: string
          comment?: string | null
          created_at?: string
          field_name?: string
          id?: string
          is_public?: boolean
          new_value?: string | null
          old_value?: string | null
          problem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "problem_history_changed_by_id_fkey"
            columns: ["changed_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "problem_history_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["id"]
          },
        ]
      }
      problem_incidents: {
        Row: {
          incident_id: string
          problem_id: string
        }
        Insert: {
          incident_id: string
          problem_id: string
        }
        Update: {
          incident_id?: string
          problem_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "problem_incidents_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "problem_incidents_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "problem_incidents_problem_id_fkey"
            columns: ["problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["id"]
          },
        ]
      }
      problems: {
        Row: {
          assigned_group_id: string | null
          assigned_group_name: string | null
          assigned_to_id: string | null
          assigned_to_name: string | null
          category: Database["public"]["Enums"]["incident_category"]
          company_id: string
          created_at: string
          description: string | null
          id: string
          known_error: boolean
          number: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          resolved_at: string | null
          root_cause: string | null
          short_description: string
          state: Database["public"]["Enums"]["problem_state"]
          updated_at: string
          workaround: string | null
        }
        Insert: {
          assigned_group_id?: string | null
          assigned_group_name?: string | null
          assigned_to_id?: string | null
          assigned_to_name?: string | null
          category?: Database["public"]["Enums"]["incident_category"]
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          known_error?: boolean
          number: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolved_at?: string | null
          root_cause?: string | null
          short_description: string
          state?: Database["public"]["Enums"]["problem_state"]
          updated_at?: string
          workaround?: string | null
        }
        Update: {
          assigned_group_id?: string | null
          assigned_group_name?: string | null
          assigned_to_id?: string | null
          assigned_to_name?: string | null
          category?: Database["public"]["Enums"]["incident_category"]
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          known_error?: boolean
          number?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          resolved_at?: string | null
          root_cause?: string | null
          short_description?: string
          state?: Database["public"]["Enums"]["problem_state"]
          updated_at?: string
          workaround?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "problems_assigned_group_id_fkey"
            columns: ["assigned_group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "problems_assigned_to_id_fkey"
            columns: ["assigned_to_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "problems_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "problems_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
        ]
      }
      profile_groups: {
        Row: {
          group_id: string
          profile_id: string
        }
        Insert: {
          group_id: string
          profile_id: string
        }
        Update: {
          group_id?: string
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_groups_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          active: boolean
          alternate_manager_id: string | null
          auth_id: string | null
          avatar_url: string | null
          company_id: string
          created_at: string
          department: string | null
          email: string
          id: string
          job_title_id: string | null
          location_id: string | null
          manager_id: string | null
          name: string
          phone: string | null
          profile_role: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          alternate_manager_id?: string | null
          auth_id?: string | null
          avatar_url?: string | null
          company_id: string
          created_at?: string
          department?: string | null
          email: string
          id?: string
          job_title_id?: string | null
          location_id?: string | null
          manager_id?: string | null
          name: string
          phone?: string | null
          profile_role?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          alternate_manager_id?: string | null
          auth_id?: string | null
          avatar_url?: string | null
          company_id?: string
          created_at?: string
          department?: string | null
          email?: string
          id?: string
          job_title_id?: string | null
          location_id?: string | null
          manager_id?: string | null
          name?: string
          phone?: string | null
          profile_role?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_alternate_manager_id_fkey"
            columns: ["alternate_manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "profiles_job_title_id_fkey"
            columns: ["job_title_id"]
            isOneToOne: false
            referencedRelation: "job_titles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_location_id_fkey"
            columns: ["location_id"]
            isOneToOne: false
            referencedRelation: "locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      reconciliation_conflicts: {
        Row: {
          candidate_ci_ids: string[]
          company_id: string
          conflicting_fields: Json
          created_at: string
          external_id: string
          id: string
          resolved_at: string | null
          resolved_by: string | null
          source_id: string
          status: string
        }
        Insert: {
          candidate_ci_ids?: string[]
          company_id: string
          conflicting_fields?: Json
          created_at?: string
          external_id: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          source_id: string
          status?: string
        }
        Update: {
          candidate_ci_ids?: string[]
          company_id?: string
          conflicting_fields?: Json
          created_at?: string
          external_id?: string
          id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          source_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "reconciliation_conflicts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_conflicts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "reconciliation_conflicts_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reconciliation_conflicts_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "discovery_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      request_approvals: {
        Row: {
          approver_id: string
          company_id: string
          created_at: string
          decided_at: string | null
          decision_note: string | null
          id: string
          incident_id: string
          status: string
        }
        Insert: {
          approver_id: string
          company_id: string
          created_at?: string
          decided_at?: string | null
          decision_note?: string | null
          id?: string
          incident_id: string
          status?: string
        }
        Update: {
          approver_id?: string
          company_id?: string
          created_at?: string
          decided_at?: string | null
          decision_note?: string | null
          id?: string
          incident_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_approvals_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_approvals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_approvals_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "request_approvals_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_approvals_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      request_catalog_items: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_catalog_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_catalog_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
        ]
      }
      request_catalog_subitems: {
        Row: {
          active: boolean
          approval_email_template: string | null
          company_id: string
          cost: number | null
          created_at: string
          currency: string | null
          description: string | null
          estimated_delivery_days: number
          form_fields: Json
          id: string
          item_id: string
          name: string
          requires_manager_approval: boolean
          sort_order: number
          updated_at: string
          visible_to_roles: string[]
        }
        Insert: {
          active?: boolean
          approval_email_template?: string | null
          company_id: string
          cost?: number | null
          created_at?: string
          currency?: string | null
          description?: string | null
          estimated_delivery_days?: number
          form_fields?: Json
          id?: string
          item_id: string
          name: string
          requires_manager_approval?: boolean
          sort_order?: number
          updated_at?: string
          visible_to_roles?: string[]
        }
        Update: {
          active?: boolean
          approval_email_template?: string | null
          company_id?: string
          cost?: number | null
          created_at?: string
          currency?: string | null
          description?: string | null
          estimated_delivery_days?: number
          form_fields?: Json
          id?: string
          item_id?: string
          name?: string
          requires_manager_approval?: boolean
          sort_order?: number
          updated_at?: string
          visible_to_roles?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "request_catalog_subitems_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_catalog_subitems_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "request_catalog_subitems_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "request_catalog_items"
            referencedColumns: ["id"]
          },
        ]
      }
      request_categories: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          department_id: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          sort_order: number
          ui_config: Json | null
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          sort_order?: number
          ui_config?: Json | null
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          department_id?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number
          ui_config?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "request_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_categories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "request_categories_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      request_history: {
        Row: {
          changed_by_id: string | null
          changed_by_name: string
          comment: string | null
          created_at: string
          field_name: string
          id: string
          is_public: boolean
          new_value: string | null
          old_value: string | null
          request_id: string
        }
        Insert: {
          changed_by_id?: string | null
          changed_by_name: string
          comment?: string | null
          created_at?: string
          field_name: string
          id?: string
          is_public?: boolean
          new_value?: string | null
          old_value?: string | null
          request_id: string
        }
        Update: {
          changed_by_id?: string | null
          changed_by_name?: string
          comment?: string | null
          created_at?: string
          field_name?: string
          id?: string
          is_public?: boolean
          new_value?: string | null
          old_value?: string | null
          request_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_history_changed_by_id_fkey"
            columns: ["changed_by_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_history_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      request_items: {
        Row: {
          active: boolean
          approval_group_id: string | null
          approval_mode: string
          approval_type: string
          assignment_group_id: string | null
          company_id: string
          created_at: string
          description: string | null
          fixed_priority: number | null
          form_fields: Json
          form_template_id: string | null
          icon: string | null
          id: string
          name: string
          request_category_id: string | null
          request_subcategory_id: string | null
          requires_approval: boolean
          sla_calendar_id: string | null
          sort_order: number
          ui_config: Json
        }
        Insert: {
          active?: boolean
          approval_group_id?: string | null
          approval_mode?: string
          approval_type?: string
          assignment_group_id?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          fixed_priority?: number | null
          form_fields?: Json
          form_template_id?: string | null
          icon?: string | null
          id?: string
          name: string
          request_category_id?: string | null
          request_subcategory_id?: string | null
          requires_approval?: boolean
          sla_calendar_id?: string | null
          sort_order?: number
          ui_config?: Json
        }
        Update: {
          active?: boolean
          approval_group_id?: string | null
          approval_mode?: string
          approval_type?: string
          assignment_group_id?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          fixed_priority?: number | null
          form_fields?: Json
          form_template_id?: string | null
          icon?: string | null
          id?: string
          name?: string
          request_category_id?: string | null
          request_subcategory_id?: string | null
          requires_approval?: boolean
          sla_calendar_id?: string | null
          sort_order?: number
          ui_config?: Json
        }
        Relationships: [
          {
            foreignKeyName: "request_items_approval_group_id_fkey"
            columns: ["approval_group_id"]
            isOneToOne: false
            referencedRelation: "assignment_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_items_assignment_group_id_fkey"
            columns: ["assignment_group_id"]
            isOneToOne: false
            referencedRelation: "assignment_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_items_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "request_items_form_template_id_fkey"
            columns: ["form_template_id"]
            isOneToOne: false
            referencedRelation: "form_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_items_request_category_id_fkey"
            columns: ["request_category_id"]
            isOneToOne: false
            referencedRelation: "request_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_items_request_subcategory_id_fkey"
            columns: ["request_subcategory_id"]
            isOneToOne: false
            referencedRelation: "request_subcategories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_items_sla_calendar_id_fkey"
            columns: ["sla_calendar_id"]
            isOneToOne: false
            referencedRelation: "sla_calendars"
            referencedColumns: ["id"]
          },
        ]
      }
      request_subcategories: {
        Row: {
          active: boolean
          category_id: string
          company_id: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          name: string
          sort_order: number
          ui_config: Json | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          category_id: string
          company_id: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          sort_order?: number
          ui_config?: Json | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          category_id?: string
          company_id?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number
          ui_config?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_subcategories_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "request_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_subcategories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_subcategories_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
        ]
      }
      response_macros: {
        Row: {
          active: boolean
          body: string
          company_id: string
          created_at: string
          created_by: string | null
          id: string
          name: string
          updated_at: string
          usage_count: number
          visibility: string
        }
        Insert: {
          active?: boolean
          body: string
          company_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          updated_at?: string
          usage_count?: number
          visibility?: string
        }
        Update: {
          active?: boolean
          body?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          updated_at?: string
          usage_count?: number
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "response_macros_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "response_macros_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "response_macros_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      service_contracts: {
        Row: {
          company_id: string
          created_at: string
          currency: string
          ends_at: string | null
          id: string
          name: string
          number: string
          starts_at: string | null
          status: string
          supplier_id: string | null
          terms: Json
          value: number | null
        }
        Insert: {
          company_id: string
          created_at?: string
          currency?: string
          ends_at?: string | null
          id?: string
          name: string
          number: string
          starts_at?: string | null
          status?: string
          supplier_id?: string | null
          terms?: Json
          value?: number | null
        }
        Update: {
          company_id?: string
          created_at?: string
          currency?: string
          ends_at?: string | null
          id?: string
          name?: string
          number?: string
          starts_at?: string | null
          status?: string
          supplier_id?: string | null
          terms?: Json
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "service_contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_contracts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "service_contracts_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      service_domains: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          default_assignment_group_id: string | null
          description: string | null
          id: string
          key: string
          metadata: Json
          name: string
          privacy: Database["public"]["Enums"]["service_domain_privacy"]
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          default_assignment_group_id?: string | null
          description?: string | null
          id?: string
          key: string
          metadata?: Json
          name: string
          privacy?: Database["public"]["Enums"]["service_domain_privacy"]
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          default_assignment_group_id?: string | null
          description?: string | null
          id?: string
          key?: string
          metadata?: Json
          name?: string
          privacy?: Database["public"]["Enums"]["service_domain_privacy"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_domains_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_domains_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "service_domains_default_assignment_group_id_fkey"
            columns: ["default_assignment_group_id"]
            isOneToOne: false
            referencedRelation: "assignment_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      service_request_attributes: {
        Row: {
          company_id: string
          cost: number | null
          created_at: string
          currency: string | null
          form_data: Json
          request_item_id: string | null
          ticket_id: string
        }
        Insert: {
          company_id: string
          cost?: number | null
          created_at?: string
          currency?: string | null
          form_data?: Json
          request_item_id?: string | null
          ticket_id: string
        }
        Update: {
          company_id?: string
          cost?: number | null
          created_at?: string
          currency?: string | null
          form_data?: Json
          request_item_id?: string | null
          ticket_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_request_attributes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_attributes_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "service_request_attributes_request_item_id_fkey"
            columns: ["request_item_id"]
            isOneToOne: false
            referencedRelation: "request_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_attributes_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_attributes_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: true
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      service_requests: {
        Row: {
          approved_at: string | null
          approver_id: string | null
          approver_name: string | null
          assigned_to_id: string | null
          assigned_to_name: string | null
          case_id: string | null
          catalog_item_id: string | null
          catalog_item_name: string
          company_id: string
          cost: number | null
          created_at: string
          currency: string | null
          form_data: Json
          fulfilled_at: string | null
          id: string
          number: string
          priority: Database["public"]["Enums"]["ticket_priority"]
          rejection_reason: string | null
          request_catalog_item_id: string | null
          request_catalog_subitem_id: string | null
          requester_id: string | null
          requester_name: string
          state: Database["public"]["Enums"]["request_state"]
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approver_id?: string | null
          approver_name?: string | null
          assigned_to_id?: string | null
          assigned_to_name?: string | null
          case_id?: string | null
          catalog_item_id?: string | null
          catalog_item_name: string
          company_id: string
          cost?: number | null
          created_at?: string
          currency?: string | null
          form_data?: Json
          fulfilled_at?: string | null
          id?: string
          number: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          rejection_reason?: string | null
          request_catalog_item_id?: string | null
          request_catalog_subitem_id?: string | null
          requester_id?: string | null
          requester_name: string
          state?: Database["public"]["Enums"]["request_state"]
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approver_id?: string | null
          approver_name?: string | null
          assigned_to_id?: string | null
          assigned_to_name?: string | null
          case_id?: string | null
          catalog_item_id?: string | null
          catalog_item_name?: string
          company_id?: string
          cost?: number | null
          created_at?: string
          currency?: string | null
          form_data?: Json
          fulfilled_at?: string | null
          id?: string
          number?: string
          priority?: Database["public"]["Enums"]["ticket_priority"]
          rejection_reason?: string | null
          request_catalog_item_id?: string | null
          request_catalog_subitem_id?: string | null
          requester_id?: string | null
          requester_name?: string
          state?: Database["public"]["Enums"]["request_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_requests_approver_id_fkey"
            columns: ["approver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_assigned_to_id_fkey"
            columns: ["assigned_to_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "service_requests_request_catalog_item_id_fkey"
            columns: ["request_catalog_item_id"]
            isOneToOne: false
            referencedRelation: "request_catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_request_catalog_subitem_id_fkey"
            columns: ["request_catalog_subitem_id"]
            isOneToOne: false
            referencedRelation: "request_catalog_subitems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_calendar_holidays: {
        Row: {
          calendar_id: string
          holiday: string
          id: string
          name: string | null
        }
        Insert: {
          calendar_id: string
          holiday: string
          id?: string
          name?: string | null
        }
        Update: {
          calendar_id?: string
          holiday?: string
          id?: string
          name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sla_calendar_holidays_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "sla_calendars"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_calendar_shifts: {
        Row: {
          calendar_id: string
          end_time: string
          id: string
          start_time: string
          weekday: number
        }
        Insert: {
          calendar_id: string
          end_time: string
          id?: string
          start_time: string
          weekday: number
        }
        Update: {
          calendar_id?: string
          end_time?: string
          id?: string
          start_time?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "sla_calendar_shifts_calendar_id_fkey"
            columns: ["calendar_id"]
            isOneToOne: false
            referencedRelation: "sla_calendars"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_calendars: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          is_24x7: boolean
          name: string
          timezone: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          id?: string
          is_24x7?: boolean
          name: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          is_24x7?: boolean
          name?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sla_calendars_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_calendars_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
        ]
      }
      sla_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          incident_id: string
          metadata: Json
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          incident_id: string
          metadata?: Json
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          incident_id?: string
          metadata?: Json
        }
        Relationships: [
          {
            foreignKeyName: "sla_events_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_events_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_policies: {
        Row: {
          active: boolean
          company_id: string
          created_at: string
          id: string
          priority: number
          resolution_time_minutes: number
          response_time_minutes: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_id: string
          created_at?: string
          id?: string
          priority: number
          resolution_time_minutes: number
          response_time_minutes: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_id?: string
          created_at?: string
          id?: string
          priority?: number
          resolution_time_minutes?: number
          response_time_minutes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sla_policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sla_policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
        ]
      }
      sla_priority_matrix: {
        Row: {
          id: string
          impact: string
          resulting_priority: number
          urgency: string
        }
        Insert: {
          id?: string
          impact: string
          resulting_priority: number
          urgency: string
        }
        Update: {
          id?: string
          impact?: string
          resulting_priority?: number
          urgency?: string
        }
        Relationships: []
      }
      status_updates: {
        Row: {
          body: string
          company_id: string
          id: string
          major_incident_id: string | null
          published_at: string
          published_by: string | null
          status: string
          title: string
          visibility: string
        }
        Insert: {
          body: string
          company_id: string
          id?: string
          major_incident_id?: string | null
          published_at?: string
          published_by?: string | null
          status: string
          title: string
          visibility?: string
        }
        Update: {
          body?: string
          company_id?: string
          id?: string
          major_incident_id?: string | null
          published_at?: string
          published_by?: string | null
          status?: string
          title?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "status_updates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_updates_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "status_updates_major_incident_id_fkey"
            columns: ["major_incident_id"]
            isOneToOne: false
            referencedRelation: "major_incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "status_updates_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          company_id: string
          created_at: string
          current_period_end: string | null
          current_period_start: string
          external_customer_id: string | null
          external_subscription_id: string | null
          id: string
          metadata: Json
          plan_id: string
          status: string
          updated_at: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          company_id: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          external_customer_id?: string | null
          external_subscription_id?: string | null
          id?: string
          metadata?: Json
          plan_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          cancel_at_period_end?: boolean
          company_id?: string
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string
          external_customer_id?: string | null
          external_subscription_id?: string | null
          id?: string
          metadata?: Json
          plan_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          company_id: string
          contacts: Json
          created_at: string
          id: string
          metadata: Json
          name: string
          status: string
          tax_id: string | null
        }
        Insert: {
          company_id: string
          contacts?: Json
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          status?: string
          tax_id?: string | null
        }
        Update: {
          company_id?: string
          contacts?: Json
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          status?: string
          tax_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "suppliers_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
        ]
      }
      system_settings: {
        Row: {
          created_at: string
          description: string | null
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          description?: string | null
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      system_symptoms: {
        Row: {
          icon: string | null
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          icon?: string | null
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      tenant_email_delivery_policies: {
        Row: {
          allow_global_fallback: boolean
          company_id: string
          created_at: string
          event_type: string
          id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allow_global_fallback?: boolean
          company_id: string
          created_at?: string
          event_type: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allow_global_fallback?: boolean
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_email_delivery_policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_email_delivery_policies_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "tenant_email_delivery_policies_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_smtp_settings: {
        Row: {
          company_id: string
          created_at: string
          encryption_type: string
          from_email: string
          from_name: string
          id: string
          rotation_required: boolean
          smtp_host: string
          smtp_port: number
          smtp_user: string
          smtp_vault_secret_id: string | null
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          encryption_type: string
          from_email: string
          from_name: string
          id?: string
          rotation_required?: boolean
          smtp_host: string
          smtp_port: number
          smtp_user: string
          smtp_vault_secret_id?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          encryption_type?: string
          from_email?: string
          from_name?: string
          id?: string
          rotation_required?: boolean
          smtp_host?: string
          smtp_port?: number
          smtp_user?: string
          smtp_vault_secret_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tenant_smtp_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_smtp_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
        ]
      }
      ticket_email_delivery_events: {
        Row: {
          company_id: string
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          metadata: Json
          outbox_id: string
          transport: string
        }
        Insert: {
          company_id: string
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          metadata?: Json
          outbox_id: string
          transport?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          outbox_id?: string
          transport?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_email_delivery_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_email_delivery_events_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "ticket_email_delivery_events_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "ticket_email_outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_email_outbox: {
        Row: {
          attempt_count: number
          company_id: string
          created_at: string
          event_type: string
          id: string
          idempotency_key: string
          last_error: string | null
          locked_at: string | null
          next_attempt_at: string
          payload: Json
          recipient_email: string
          sent_at: string | null
          status: string
          ticket_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          company_id: string
          created_at?: string
          event_type: string
          id?: string
          idempotency_key: string
          last_error?: string | null
          locked_at?: string | null
          next_attempt_at?: string
          payload?: Json
          recipient_email: string
          sent_at?: string | null
          status?: string
          ticket_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          idempotency_key?: string
          last_error?: string | null
          locked_at?: string | null
          next_attempt_at?: string
          payload?: Json
          recipient_email?: string
          sent_at?: string | null
          status?: string
          ticket_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_email_outbox_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_email_outbox_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "ticket_email_outbox_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_email_outbox_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_macros: {
        Row: {
          company_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          operations: Json
          updated_at: string
        }
        Insert: {
          company_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          operations?: Json
          updated_at?: string
        }
        Update: {
          company_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          operations?: Json
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_macros_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_macros_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "ticket_macros_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_messages: {
        Row: {
          actor_type: string
          body: string
          case_id: string | null
          company_id: string
          created_at: string
          id: string
          incident_id: string
          is_internal: boolean
          sender_id: string | null
          sender_name: string | null
        }
        Insert: {
          actor_type?: string
          body: string
          case_id?: string | null
          company_id: string
          created_at?: string
          id?: string
          incident_id: string
          is_internal?: boolean
          sender_id?: string | null
          sender_name?: string | null
        }
        Update: {
          actor_type?: string
          body?: string
          case_id?: string | null
          company_id?: string
          created_at?: string
          id?: string
          incident_id?: string
          is_internal?: boolean
          sender_id?: string | null
          sender_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ticket_messages_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "ticket_messages_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_messages_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      ticket_tasks: {
        Row: {
          assigned_group_id: string | null
          assigned_to_id: string | null
          closed_at: string | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          incident_id: string | null
          number: string | null
          parent_task_id: string | null
          request_id: string | null
          short_description: string
          state: string
          updated_at: string
        }
        Insert: {
          assigned_group_id?: string | null
          assigned_to_id?: string | null
          closed_at?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          incident_id?: string | null
          number?: string | null
          parent_task_id?: string | null
          request_id?: string | null
          short_description: string
          state?: string
          updated_at?: string
        }
        Update: {
          assigned_group_id?: string | null
          assigned_to_id?: string | null
          closed_at?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          incident_id?: string | null
          number?: string | null
          parent_task_id?: string | null
          request_id?: string | null
          short_description?: string
          state?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ticket_tasks_assigned_group_id_fkey"
            columns: ["assigned_group_id"]
            isOneToOne: false
            referencedRelation: "assignment_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_tasks_assigned_to_id_fkey"
            columns: ["assigned_to_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "ticket_tasks_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_tasks_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "ticket_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ticket_tasks_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "service_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          accumulated_paused_time_minutes: number
          accumulated_reopen_time_minutes: number
          approval_decided_at: string | null
          approval_paused_at: string | null
          approval_status: string
          assigned_group_id: string | null
          assigned_group_name: string | null
          assigned_to_id: string | null
          assigned_to_name: string | null
          assignment_group_id: string | null
          caller_id: string | null
          caller_name: string
          case_id: string | null
          catalog_item_id: string | null
          catalog_service_id: string | null
          catalog_subitem_id: string | null
          catalog_symptom_id: string | null
          close_code: string | null
          close_notes: string | null
          closed_at: string | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_resolution_breached: boolean
          is_response_breached: boolean
          kb_candidate: boolean
          mtta_minutes: number | null
          mttr_minutes: number | null
          number: string
          opened_via: string | null
          paused_at: string | null
          pending_reason_id: string | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          priority_level: number | null
          request_subcategory_id: string | null
          resolution_code: string | null
          resolution_notes: string | null
          resolved_at: string | null
          responded_at: string | null
          short_description: string
          sla_breached: boolean
          sla_deadline: string | null
          sla_managed_by_client: boolean
          sla_resolution_deadline: string | null
          sla_response_deadline: string | null
          sla_warning_notified: boolean
          state: Database["public"]["Enums"]["incident_state"]
          symptom_id: string | null
          tags: string[]
          ticket_type: string
          updated_at: string
        }
        Insert: {
          accumulated_paused_time_minutes?: number
          accumulated_reopen_time_minutes?: number
          approval_decided_at?: string | null
          approval_paused_at?: string | null
          approval_status?: string
          assigned_group_id?: string | null
          assigned_group_name?: string | null
          assigned_to_id?: string | null
          assigned_to_name?: string | null
          assignment_group_id?: string | null
          caller_id?: string | null
          caller_name: string
          case_id?: string | null
          catalog_item_id?: string | null
          catalog_service_id?: string | null
          catalog_subitem_id?: string | null
          catalog_symptom_id?: string | null
          close_code?: string | null
          close_notes?: string | null
          closed_at?: string | null
          company_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_resolution_breached?: boolean
          is_response_breached?: boolean
          kb_candidate?: boolean
          mtta_minutes?: number | null
          mttr_minutes?: number | null
          number: string
          opened_via?: string | null
          paused_at?: string | null
          pending_reason_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          priority_level?: number | null
          request_subcategory_id?: string | null
          resolution_code?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          responded_at?: string | null
          short_description: string
          sla_breached?: boolean
          sla_deadline?: string | null
          sla_managed_by_client?: boolean
          sla_resolution_deadline?: string | null
          sla_response_deadline?: string | null
          sla_warning_notified?: boolean
          state?: Database["public"]["Enums"]["incident_state"]
          symptom_id?: string | null
          tags?: string[]
          ticket_type?: string
          updated_at?: string
        }
        Update: {
          accumulated_paused_time_minutes?: number
          accumulated_reopen_time_minutes?: number
          approval_decided_at?: string | null
          approval_paused_at?: string | null
          approval_status?: string
          assigned_group_id?: string | null
          assigned_group_name?: string | null
          assigned_to_id?: string | null
          assigned_to_name?: string | null
          assignment_group_id?: string | null
          caller_id?: string | null
          caller_name?: string
          case_id?: string | null
          catalog_item_id?: string | null
          catalog_service_id?: string | null
          catalog_subitem_id?: string | null
          catalog_symptom_id?: string | null
          close_code?: string | null
          close_notes?: string | null
          closed_at?: string | null
          company_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_resolution_breached?: boolean
          is_response_breached?: boolean
          kb_candidate?: boolean
          mtta_minutes?: number | null
          mttr_minutes?: number | null
          number?: string
          opened_via?: string | null
          paused_at?: string | null
          pending_reason_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority"]
          priority_level?: number | null
          request_subcategory_id?: string | null
          resolution_code?: string | null
          resolution_notes?: string | null
          resolved_at?: string | null
          responded_at?: string | null
          short_description?: string
          sla_breached?: boolean
          sla_deadline?: string | null
          sla_managed_by_client?: boolean
          sla_resolution_deadline?: string | null
          sla_response_deadline?: string | null
          sla_warning_notified?: boolean
          state?: Database["public"]["Enums"]["incident_state"]
          symptom_id?: string | null
          tags?: string[]
          ticket_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "incidents_assigned_to_id_fkey"
            columns: ["assigned_to_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_assignment_group_id_fkey"
            columns: ["assignment_group_id"]
            isOneToOne: false
            referencedRelation: "assignment_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_caller_id_fkey"
            columns: ["caller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "incident_catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_catalog_service_id_fkey"
            columns: ["catalog_service_id"]
            isOneToOne: false
            referencedRelation: "catalog_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_catalog_subitem_id_fkey"
            columns: ["catalog_subitem_id"]
            isOneToOne: false
            referencedRelation: "incident_catalog_subitems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_catalog_symptom_id_fkey"
            columns: ["catalog_symptom_id"]
            isOneToOne: false
            referencedRelation: "incident_catalog_symptoms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "incidents_pending_reason_id_fkey"
            columns: ["pending_reason_id"]
            isOneToOne: false
            referencedRelation: "pending_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_request_subcategory_id_fkey"
            columns: ["request_subcategory_id"]
            isOneToOne: false
            referencedRelation: "request_subcategories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_symptom_id_fkey"
            columns: ["symptom_id"]
            isOneToOne: false
            referencedRelation: "system_symptoms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_assigned_group_id_fkey"
            columns: ["assigned_group_id"]
            isOneToOne: false
            referencedRelation: "assignment_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      user_groups: {
        Row: {
          group_id: string
          user_id: string
        }
        Insert: {
          group_id: string
          user_id: string
        }
        Update: {
          group_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_groups_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "assignment_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_groups_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      virtual_agent_actions: {
        Row: {
          action_key: string
          company_id: string
          config: Json
          enabled: boolean
          id: string
          min_confidence: number
          name: string
          requires_confirmation: boolean
          service_domain_id: string | null
        }
        Insert: {
          action_key: string
          company_id: string
          config?: Json
          enabled?: boolean
          id?: string
          min_confidence?: number
          name: string
          requires_confirmation?: boolean
          service_domain_id?: string | null
        }
        Update: {
          action_key?: string
          company_id?: string
          config?: Json
          enabled?: boolean
          id?: string
          min_confidence?: number
          name?: string
          requires_confirmation?: boolean
          service_domain_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "virtual_agent_actions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "virtual_agent_actions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "virtual_agent_actions_service_domain_id_fkey"
            columns: ["service_domain_id"]
            isOneToOne: false
            referencedRelation: "service_domains"
            referencedColumns: ["id"]
          },
        ]
      }
      virtual_agent_executions: {
        Row: {
          action_id: string | null
          case_id: string | null
          company_id: string
          confidence: number | null
          confirmation_status: string
          conversation_id: string | null
          created_at: string
          error_message: string | null
          id: string
          identity_id: string | null
          intent: string | null
          result_status: string
          safe_input: Json
          safe_output: Json
          source_article_ids: string[]
        }
        Insert: {
          action_id?: string | null
          case_id?: string | null
          company_id: string
          confidence?: number | null
          confirmation_status?: string
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          identity_id?: string | null
          intent?: string | null
          result_status: string
          safe_input?: Json
          safe_output?: Json
          source_article_ids?: string[]
        }
        Update: {
          action_id?: string | null
          case_id?: string | null
          company_id?: string
          confidence?: number | null
          confirmation_status?: string
          conversation_id?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          identity_id?: string | null
          intent?: string | null
          result_status?: string
          safe_input?: Json
          safe_output?: Json
          source_article_ids?: string[]
        }
        Relationships: [
          {
            foreignKeyName: "virtual_agent_executions_action_id_fkey"
            columns: ["action_id"]
            isOneToOne: false
            referencedRelation: "virtual_agent_actions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "virtual_agent_executions_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "virtual_agent_executions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "virtual_agent_executions_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "virtual_agent_executions_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "virtual_agent_executions_identity_id_fkey"
            columns: ["identity_id"]
            isOneToOne: false
            referencedRelation: "external_identities"
            referencedColumns: ["id"]
          },
        ]
      }
      webhook_events_queue: {
        Row: {
          attempts: number
          claimed_at: string | null
          company_id: string
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          max_attempts: number
          payload: Json
          processed_at: string | null
          run_after: string
          status: string
          webhook_id: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          company_id: string
          created_at?: string
          event_type: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          payload: Json
          processed_at?: string | null
          run_after?: string
          status?: string
          webhook_id: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          company_id?: string
          created_at?: string
          event_type?: string
          id?: string
          last_error?: string | null
          max_attempts?: number
          payload?: Json
          processed_at?: string | null
          run_after?: string
          status?: string
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_events_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "webhook_events_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "webhook_events_queue_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "outbound_webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_action_queue: {
        Row: {
          action: Json
          attempts: number
          chain_id: string | null
          claimed_at: string | null
          company_id: string
          created_at: string
          id: string
          incident_id: string
          last_error: string | null
          max_attempts: number
          processed_at: string | null
          rule_id: string | null
          run_after: string
          sequence_no: number
          status: string
        }
        Insert: {
          action: Json
          attempts?: number
          chain_id?: string | null
          claimed_at?: string | null
          company_id: string
          created_at?: string
          id?: string
          incident_id: string
          last_error?: string | null
          max_attempts?: number
          processed_at?: string | null
          rule_id?: string | null
          run_after?: string
          sequence_no?: number
          status?: string
        }
        Update: {
          action?: Json
          attempts?: number
          chain_id?: string | null
          claimed_at?: string | null
          company_id?: string
          created_at?: string
          id?: string
          incident_id?: string
          last_error?: string | null
          max_attempts?: number
          processed_at?: string | null
          rule_id?: string | null
          run_after?: string
          sequence_no?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_action_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_action_queue_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "workflow_action_queue_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_action_queue_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_action_queue_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "workflow_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_execution_log: {
        Row: {
          actions_summary: string | null
          company_id: string
          created_at: string
          duration_ms: number | null
          id: string
          incident_id: string | null
          incident_number: string | null
          matched: boolean
          rule_id: string | null
          rule_name: string
          status: string
          trigger_event: string
        }
        Insert: {
          actions_summary?: string | null
          company_id: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          incident_id?: string | null
          incident_number?: string | null
          matched: boolean
          rule_id?: string | null
          rule_name: string
          status: string
          trigger_event: string
        }
        Update: {
          actions_summary?: string | null
          company_id?: string
          created_at?: string
          duration_ms?: number | null
          id?: string
          incident_id?: string | null
          incident_number?: string | null
          matched?: boolean
          rule_id?: string | null
          rule_name?: string
          status?: string
          trigger_event?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_execution_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_execution_log_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "workflow_execution_log_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_execution_log_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "tickets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_execution_log_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "workflow_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_rules: {
        Row: {
          actions: Json
          active: boolean
          company_id: string
          conditions: Json
          created_at: string
          description: string | null
          id: string
          name: string
          priority_order: number
          ticket_type: string
          trigger_event: string
          trigger_source: string
          updated_at: string
        }
        Insert: {
          actions?: Json
          active?: boolean
          company_id: string
          conditions?: Json
          created_at?: string
          description?: string | null
          id?: string
          name: string
          priority_order?: number
          ticket_type: string
          trigger_event: string
          trigger_source?: string
          updated_at?: string
        }
        Update: {
          actions?: Json
          active?: boolean
          company_id?: string
          conditions?: Json
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          priority_order?: number
          ticket_type?: string
          trigger_event?: string
          trigger_source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_rules_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
        ]
      }
    }
    Views: {
      bi_tickets_unified: {
        Row: {
          age_minutes: number | null
          aging_bucket: string | null
          assigned_to_id: string | null
          assigned_to_name: string | null
          caller_id: string | null
          caller_name: string | null
          category: string | null
          change_type: string | null
          change_window_end: string | null
          change_window_start: string | null
          close_code: string | null
          closed_at: string | null
          company_id: string | null
          created_at: string | null
          department_id: string | null
          department_name: string | null
          form_data: Json | null
          group_id: string | null
          group_name: string | null
          has_root_cause: boolean | null
          id: string | null
          impact: string | null
          is_open: boolean | null
          is_resolution_breached: boolean | null
          is_response_breached: boolean | null
          known_error: boolean | null
          mtta_minutes: number | null
          mttr_minutes: number | null
          number: string | null
          opened_via: string | null
          paused_minutes: number | null
          priority: string | null
          priority_level: number | null
          record_type: string | null
          reopen_minutes: number | null
          request_item_name: string | null
          resolved_at: string | null
          responded_at: string | null
          risk: string | null
          service_category_name: string | null
          service_id: string | null
          service_name: string | null
          short_description: string | null
          sla_breached: boolean | null
          state: string | null
          state_group: string | null
          symptom_name: string | null
          tags: string[] | null
          updated_at: string | null
          urgency: string | null
          was_reopened: boolean | null
        }
        Relationships: []
      }
      incidents: {
        Row: {
          accumulated_paused_time_minutes: number | null
          accumulated_reopen_time_minutes: number | null
          approval_decided_at: string | null
          approval_status: string | null
          assigned_group_id: string | null
          assigned_group_name: string | null
          assigned_to_id: string | null
          assigned_to_name: string | null
          assignment_group_id: string | null
          caller_id: string | null
          caller_name: string | null
          case_id: string | null
          catalog_item_id: string | null
          catalog_service_id: string | null
          catalog_subitem_id: string | null
          catalog_symptom_id: string | null
          category: string | null
          close_code: string | null
          close_notes: string | null
          closed_at: string | null
          company_id: string | null
          cost: number | null
          created_at: string | null
          currency: string | null
          description: string | null
          form_data: Json | null
          id: string | null
          impact: string | null
          is_major_incident: boolean | null
          is_resolution_breached: boolean | null
          is_response_breached: boolean | null
          kb_candidate: boolean | null
          number: string | null
          opened_via: string | null
          paused_at: string | null
          pending_reason_id: string | null
          priority: Database["public"]["Enums"]["ticket_priority"] | null
          priority_level: number | null
          related_problem_id: string | null
          request_item_id: string | null
          request_subcategory_id: string | null
          resolution_code: string | null
          resolution_notes: string | null
          resolved_at: string | null
          responded_at: string | null
          root_cause: string | null
          short_description: string | null
          sla_breached: boolean | null
          sla_deadline: string | null
          sla_managed_by_client: boolean | null
          sla_resolution_deadline: string | null
          sla_response_deadline: string | null
          sla_warning_notified: boolean | null
          state: Database["public"]["Enums"]["incident_state"] | null
          symptom_id: string | null
          tags: string[] | null
          ticket_type: string | null
          updated_at: string | null
          urgency: string | null
          workaround: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incident_attributes_related_problem_id_fkey"
            columns: ["related_problem_id"]
            isOneToOne: false
            referencedRelation: "problems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_assigned_to_id_fkey"
            columns: ["assigned_to_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_assignment_group_id_fkey"
            columns: ["assignment_group_id"]
            isOneToOne: false
            referencedRelation: "assignment_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_caller_id_fkey"
            columns: ["caller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_case_id_fkey"
            columns: ["case_id"]
            isOneToOne: false
            referencedRelation: "cases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_catalog_item_id_fkey"
            columns: ["catalog_item_id"]
            isOneToOne: false
            referencedRelation: "incident_catalog_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_catalog_service_id_fkey"
            columns: ["catalog_service_id"]
            isOneToOne: false
            referencedRelation: "catalog_services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_catalog_subitem_id_fkey"
            columns: ["catalog_subitem_id"]
            isOneToOne: false
            referencedRelation: "incident_catalog_subitems"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_catalog_symptom_id_fkey"
            columns: ["catalog_symptom_id"]
            isOneToOne: false
            referencedRelation: "incident_catalog_symptoms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "v_license_usage"
            referencedColumns: ["company_id"]
          },
          {
            foreignKeyName: "incidents_pending_reason_id_fkey"
            columns: ["pending_reason_id"]
            isOneToOne: false
            referencedRelation: "pending_reasons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_request_subcategory_id_fkey"
            columns: ["request_subcategory_id"]
            isOneToOne: false
            referencedRelation: "request_subcategories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_symptom_id_fkey"
            columns: ["symptom_id"]
            isOneToOne: false
            referencedRelation: "system_symptoms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_request_attributes_request_item_id_fkey"
            columns: ["request_item_id"]
            isOneToOne: false
            referencedRelation: "request_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_assigned_group_id_fkey"
            columns: ["assigned_group_id"]
            isOneToOne: false
            referencedRelation: "assignment_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      v_license_usage: {
        Row: {
          active_connections: number | null
          available_slots: number | null
          company_id: string | null
          company_name: string | null
          license_expires_at: string | null
          license_limit: number | null
          license_plan: string | null
          license_status: string | null
          usage_pct: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      accept_incident_resolution: {
        Args: { p_incident_id: string }
        Returns: {
          accumulated_paused_time_minutes: number
          accumulated_reopen_time_minutes: number
          approval_decided_at: string | null
          approval_paused_at: string | null
          approval_status: string
          assigned_group_id: string | null
          assigned_group_name: string | null
          assigned_to_id: string | null
          assigned_to_name: string | null
          assignment_group_id: string | null
          caller_id: string | null
          caller_name: string
          case_id: string | null
          catalog_item_id: string | null
          catalog_service_id: string | null
          catalog_subitem_id: string | null
          catalog_symptom_id: string | null
          close_code: string | null
          close_notes: string | null
          closed_at: string | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_resolution_breached: boolean
          is_response_breached: boolean
          kb_candidate: boolean
          mtta_minutes: number | null
          mttr_minutes: number | null
          number: string
          opened_via: string | null
          paused_at: string | null
          pending_reason_id: string | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          priority_level: number | null
          request_subcategory_id: string | null
          resolution_code: string | null
          resolution_notes: string | null
          resolved_at: string | null
          responded_at: string | null
          short_description: string
          sla_breached: boolean
          sla_deadline: string | null
          sla_managed_by_client: boolean
          sla_resolution_deadline: string | null
          sla_response_deadline: string | null
          sla_warning_notified: boolean
          state: Database["public"]["Enums"]["incident_state"]
          symptom_id: string | null
          tags: string[]
          ticket_type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      apply_ticket_macro: {
        Args: { p_macro_id: string; p_ticket_id: string }
        Returns: {
          accumulated_paused_time_minutes: number
          accumulated_reopen_time_minutes: number
          approval_decided_at: string | null
          approval_paused_at: string | null
          approval_status: string
          assigned_group_id: string | null
          assigned_group_name: string | null
          assigned_to_id: string | null
          assigned_to_name: string | null
          assignment_group_id: string | null
          caller_id: string | null
          caller_name: string
          case_id: string | null
          catalog_item_id: string | null
          catalog_service_id: string | null
          catalog_subitem_id: string | null
          catalog_symptom_id: string | null
          close_code: string | null
          close_notes: string | null
          closed_at: string | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_resolution_breached: boolean
          is_response_breached: boolean
          kb_candidate: boolean
          mtta_minutes: number | null
          mttr_minutes: number | null
          number: string
          opened_via: string | null
          paused_at: string | null
          pending_reason_id: string | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          priority_level: number | null
          request_subcategory_id: string | null
          resolution_code: string | null
          resolution_notes: string | null
          resolved_at: string | null
          responded_at: string | null
          short_description: string
          sla_breached: boolean
          sla_deadline: string | null
          sla_managed_by_client: boolean
          sla_resolution_deadline: string | null
          sla_response_deadline: string | null
          sla_warning_notified: boolean
          state: Database["public"]["Enums"]["incident_state"]
          symptom_id: string | null
          tags: string[]
          ticket_type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      auto_close_resolved_incidents: { Args: never; Returns: undefined }
      batch_invite_users: {
        Args: { p_payload: Json }
        Returns: Json
      }
      bi_aging_bucket: {
        Args: { p_closed: string; p_created: string; p_resolved: string }
        Returns: string
      }
      bi_backlog_trend: {
        Args: {
          p_company_id: string
          p_date_from?: string
          p_date_to?: string
          p_record_types?: string[]
        }
        Returns: {
          breached_count: number
          open_count: number
          record_type: string
          snapshot_date: string
        }[]
      }
      bi_build_filter_sql: {
        Args: { p_company_id: string; p_filters: Json; p_param_ref: string }
        Returns: string
      }
      bi_cube: {
        Args: {
          p_company_id: string
          p_date_field?: string
          p_date_from?: string
          p_date_to?: string
          p_dimensions?: string[]
          p_filters?: Json
          p_limit?: number
          p_measures?: string[]
          p_record_types?: string[]
        }
        Returns: {
          dims: Json
          measures: Json
        }[]
      }
      bi_dimension_values: {
        Args: {
          p_company_id: string
          p_dimension: string
          p_record_types?: string[]
          p_search?: string
        }
        Returns: {
          occurrences: number
          value: string
        }[]
      }
      bi_drilldown: {
        Args: {
          p_company_id: string
          p_date_field?: string
          p_date_from?: string
          p_date_to?: string
          p_filters?: Json
          p_limit?: number
          p_offset?: number
          p_record_types?: string[]
        }
        Returns: {
          assigned_to_name: string
          created_at: string
          group_name: string
          id: string
          number: string
          priority: string
          record_type: string
          short_description: string
          sla_breached: boolean
          state: string
          total_count: number
        }[]
      }
      bi_form_dimensions: {
        Args: { p_company_id: string }
        Returns: {
          data_type: string
          key: string
          label: string
          source: string
        }[]
      }
      bi_normalize_state: { Args: { p_state: string }; Returns: string }
      bi_resolve_dimension: {
        Args: { p_company_id: string; p_key: string }
        Returns: string
      }
      bi_take_daily_snapshot: { Args: never; Returns: undefined }
      calculate_incident_priority: {
        Args: { impact: string; urgency: string }
        Returns: Database["public"]["Enums"]["ticket_priority"]
      }
      can_read_case: { Args: { p_case_id: string }; Returns: boolean }
      can_read_knowledge_article: {
        Args: { p_article_id: string }
        Returns: boolean
      }
      cast_change_cab_vote: {
        Args: { p_approve: boolean; p_change_id: string }
        Returns: {
          backout_plan: string | null
          cab_approvals: Json
          cab_approvers: Json
          change_window_end: string | null
          change_window_start: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          implementation_plan: string | null
          implementer_id: string | null
          implementer_name: string | null
          justification: string | null
          number: string
          related_problem_id: string | null
          requested_by_id: string | null
          requested_by_name: string
          risk: Database["public"]["Enums"]["change_risk"]
          short_description: string
          state: Database["public"]["Enums"]["change_state"]
          test_plan: string | null
          type: Database["public"]["Enums"]["change_type"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "changes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      check_license_available: {
        Args: { p_company_id: string }
        Returns: boolean
      }
      check_sla_breaches: { Args: never; Returns: undefined }
      check_sla_warnings: { Args: never; Returns: undefined }
      check_tenant_feature_access: {
        Args: { p_company_id: string; p_feature_name: string }
        Returns: boolean
      }
      claim_channel_outbox: {
        Args: { p_limit?: number }
        Returns: {
          attempt_count: number
          company_id: string
          connection_id: string
          conversation_id: string
          id: string
          payload: Json
          provider: Database["public"]["Enums"]["channel_provider"]
          vault_secret_id: string
        }[]
      }
      claim_ticket_email_outbox: {
        Args: { p_limit?: number }
        Returns: {
          attempt_count: number
          company_id: string
          event_type: string
          id: string
          payload: Json
          recipient_email: string
          ticket_id: string
        }[]
      }
      claim_ticket_secure: {
        Args: { p_ticket_id: string }
        Returns: {
          accumulated_paused_time_minutes: number
          accumulated_reopen_time_minutes: number
          approval_decided_at: string | null
          approval_paused_at: string | null
          approval_status: string
          assigned_group_id: string | null
          assigned_group_name: string | null
          assigned_to_id: string | null
          assigned_to_name: string | null
          assignment_group_id: string | null
          caller_id: string | null
          caller_name: string
          case_id: string | null
          catalog_item_id: string | null
          catalog_service_id: string | null
          catalog_subitem_id: string | null
          catalog_symptom_id: string | null
          close_code: string | null
          close_notes: string | null
          closed_at: string | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_resolution_breached: boolean
          is_response_breached: boolean
          kb_candidate: boolean
          mtta_minutes: number | null
          mttr_minutes: number | null
          number: string
          opened_via: string | null
          paused_at: string | null
          pending_reason_id: string | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          priority_level: number | null
          request_subcategory_id: string | null
          resolution_code: string | null
          resolution_notes: string | null
          resolved_at: string | null
          responded_at: string | null
          short_description: string
          sla_breached: boolean
          sla_deadline: string | null
          sla_managed_by_client: boolean
          sla_resolution_deadline: string | null
          sla_response_deadline: string | null
          sla_warning_notified: boolean
          state: Database["public"]["Enums"]["incident_state"]
          symptom_id: string | null
          tags: string[]
          ticket_type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      cmdb_predict_incident_impact: {
        Args: {
          p_company_id: string
          p_direction?: string
          p_max_depth?: number
          p_root_ci_id: string
        }
        Returns: {
          ci_id: string
          ci_name: string
          class_name: string
          criticality: string
          depth: number
          path: string[]
        }[]
      }
      complete_channel_outbox: {
        Args: {
          p_error?: string
          p_id: string
          p_provider_event_id?: string
          p_status: string
        }
        Returns: undefined
      }
      complete_ticket_email_delivery: {
        Args: {
          p_error?: string
          p_outbox_id: string
          p_outcome: string
          p_transport?: string
        }
        Returns: undefined
      }
      create_approval_token: {
        Args: {
          p_approver_email: string
          p_approver_name?: string
          p_company_id: string
          p_request_id: string
        }
        Returns: string
      }
      decide_request_approval: {
        Args: { p_approval_id: string; p_approve: boolean; p_note?: string }
        Returns: {
          approver_id: string
          company_id: string
          created_at: string
          decided_at: string | null
          decision_note: string | null
          id: string
          incident_id: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "request_approvals"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      enqueue_ticket_email_notification: {
        Args: {
          p_company_id: string
          p_event_type: string
          p_idempotency_key: string
          p_payload: Json
          p_recipient_email: string
          p_ticket_id: string
        }
        Returns: undefined
      }
      ensure_virtual_agent_connection: {
        Args: { p_company_id: string }
        Returns: string
      }
      expire_stale_sessions: { Args: never; Returns: number }
      get_current_profile_id: { Args: never; Returns: string }
      get_current_user_company_id: { Args: never; Returns: string }
      get_current_user_role: { Args: never; Returns: string }
      get_executive_metrics: {
        Args: { p_end_date: string; p_start_date: string }
        Returns: Json
      }
      get_tenant_smtp_delivery_credential: {
        Args: { p_company_id: string }
        Returns: {
          encryption_type: string
          from_email: string
          from_name: string
          smtp_host: string
          smtp_password: string
          smtp_port: number
          smtp_user: string
        }[]
      }
      get_webhook_signing_secret: {
        Args: { p_webhook_id: string }
        Returns: {
          signing_secret: string
          target_url: string
        }[]
      }
      immutable_unaccent: { Args: { "": string }; Returns: string }
      is_chatbot_authorized: {
        Args: { p_channel?: string; p_company_id: string; p_phone_e164: string }
        Returns: Json
      }
      is_current_user_change_reader: { Args: never; Returns: boolean }
      is_current_user_msp_admin: { Args: never; Returns: boolean }
      is_current_user_ticket_staff: { Args: never; Returns: boolean }
      is_settings_admin: { Args: { p_company_id: string }; Returns: boolean }
      itsm_service_desk_readiness: {
        Args: { p_company_id: string }
        Returns: Json
      }
      kb_duplicate_article: {
        Args: { p_article_id: string; p_company_id: string }
        Returns: {
          author_id: string | null
          body: string
          category_id: string | null
          company_id: string
          created_at: string
          deflection_count: number
          id: string
          published_at: string | null
          reviewer_id: string | null
          scheduled_at: string | null
          search_vector: unknown
          search_vector_unaccent: unknown
          service_domain_id: string | null
          slug: string
          source_ticket_id: string | null
          status: string
          summary: string | null
          tags: string[]
          title: string
          updated_at: string
          version: number
          view_count: number
          visibility: string
        }
        SetofOptions: {
          from: "*"
          to: "knowledge_articles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      kb_register_article_usage: {
        Args: { p_article_id: string; p_case_id: string; p_usage?: string }
        Returns: {
          article_id: string
          case_id: string
          company_id: string
          created_at: string
          id: string
          linked_by: string | null
          usage: string
        }
        SetofOptions: {
          from: "*"
          to: "knowledge_article_cases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      kb_search_articles: {
        Args: {
          p_category_id?: string
          p_company_id: string
          p_domain_id?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
        }
        Returns: {
          category_id: string
          id: string
          rank: number
          service_domain_id: string
          slug: string
          status: string
          summary: string
          tags: string[]
          title: string
          total_count: number
          updated_at: string
          view_count: number
          visibility: string
        }[]
      }
      kb_set_article_status: {
        Args: { p_article_id: string; p_company_id: string; p_status: string }
        Returns: {
          author_id: string | null
          body: string
          category_id: string | null
          company_id: string
          created_at: string
          deflection_count: number
          id: string
          published_at: string | null
          reviewer_id: string | null
          scheduled_at: string | null
          search_vector: unknown
          search_vector_unaccent: unknown
          service_domain_id: string | null
          slug: string
          source_ticket_id: string | null
          status: string
          summary: string | null
          tags: string[]
          title: string
          updated_at: string
          version: number
          view_count: number
          visibility: string
        }
        SetofOptions: {
          from: "*"
          to: "knowledge_articles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      kb_suggest_for_case: {
        Args: { p_case_id: string; p_limit?: number }
        Returns: {
          id: string
          rank: number
          slug: string
          summary: string
          title: string
          visibility: string
        }[]
      }
      kb_touch_article: {
        Args: { p_article_id: string; p_deflected?: boolean }
        Returns: undefined
      }
      log_blocked_attempt: {
        Args: {
          p_channel: string
          p_message: string
          p_payload?: Json
          p_phone: string
          p_reason: string
          p_teams_user?: string
        }
        Returns: string
      }
      materialize_channel_message: {
        Args: { p_message_id: string }
        Returns: Json
      }
      process_approval_token: {
        Args: {
          p_decision: string
          p_ip?: string
          p_reason?: string
          p_token: string
          p_user_agent?: string
        }
        Returns: Json
      }
      provision_tenant: {
        Args: {
          p_accent_color?: string
          p_bg_color?: string
          p_concurrent_licenses?: number
          p_domain: string
          p_license_plan?: string
          p_logo_url?: string
          p_name: string
          p_primary_color?: string
          p_slug: string
          p_welcome_subtitle?: string
          p_welcome_title?: string
        }
        Returns: {
          accent_color: string
          active: boolean
          allow_local_login: boolean
          background_url: string | null
          bg_color: string
          brand_name: string | null
          branding_settings: Json
          catalog_headline: string | null
          catalog_headline_color: string | null
          catalog_headline_size: string | null
          catalog_ui_config: Json | null
          concurrent_licenses: number
          created_at: string
          default_sla_calendar_id: string | null
          domain: string
          greeting_color: string | null
          greeting_prefix: string | null
          id: string
          is_provider_tenant: boolean
          license_alert_threshold: number
          license_expires_at: string | null
          license_plan: string
          logo_url: string | null
          max_analysts_licenses: number
          name: string
          primary_color: string
          secondary_color: string | null
          slug: string
          sso_providers: Json
          subtitle_color: string | null
          subtitle_font: string | null
          subtitle_size: string | null
          title_color: string | null
          title_font: string | null
          title_size: string | null
          updated_at: string
          welcome_subtitle: string
          welcome_title: string
        }
        SetofOptions: {
          from: "*"
          to: "companies"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      record_response_macro_use: {
        Args: { p_macro_id: string }
        Returns: undefined
      }
      record_webhook_delivery_result: {
        Args: {
          p_failure_threshold?: number
          p_success: boolean
          p_webhook_id: string
        }
        Returns: undefined
      }
      register_session: {
        Args: {
          p_company_id: string
          p_device_type?: string
          p_ip?: string
          p_session_token: string
          p_user_agent?: string
          p_user_id: string
        }
        Returns: Json
      }
      release_session: {
        Args: { p_reason?: string; p_session_token: string }
        Returns: boolean
      }
      resolve_channel_triage: {
        Args: { p_action: string; p_id: string; p_target_company_id?: string }
        Returns: {
          body_excerpt: string | null
          company_id: string
          connection_id: string
          created_at: string
          external_event_id: string
          external_message_id: string | null
          id: string
          provider: Database["public"]["Enums"]["channel_provider"]
          raw_payload: Json
          reason: string
          recipients: string[]
          resolved_at: string | null
          resolved_by: string | null
          resolved_company_id: string | null
          sender: string | null
          status: string
          subject: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "channel_triage_events"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      revoke_channel_connection: {
        Args: { p_company_id: string; p_connection_id: string }
        Returns: undefined
      }
      save_channel_connection: {
        Args: {
          p_address: string
          p_company_id: string
          p_config?: Json
          p_connection_id: string
          p_enabled: boolean
          p_name: string
          p_provider: Database["public"]["Enums"]["channel_provider"]
          p_scope: Database["public"]["Enums"]["channel_scope"]
          p_secret?: string
        }
        Returns: Json
      }
      save_outbound_webhook: {
        Args: {
          p_company_id: string
          p_events_subscribed: string[]
          p_is_active: boolean
          p_secret?: string
          p_target_url: string
          p_webhook_id: string
        }
        Returns: Json
      }
      save_tenant_email_delivery_policy: {
        Args: {
          p_allow_global_fallback: boolean
          p_company_id: string
          p_event_type: string
        }
        Returns: Json
      }
      save_tenant_smtp_settings: {
        Args: {
          p_company_id: string
          p_encryption_type: string
          p_from_email: string
          p_from_name: string
          p_password?: string
          p_smtp_host: string
          p_smtp_port: number
          p_smtp_user: string
        }
        Returns: Json
      }
      schedule_standard_change: {
        Args: { p_change_id: string }
        Returns: {
          backout_plan: string | null
          cab_approvals: Json
          cab_approvers: Json
          change_window_end: string | null
          change_window_start: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          implementation_plan: string | null
          implementer_id: string | null
          implementer_name: string | null
          justification: string | null
          number: string
          related_problem_id: string | null
          requested_by_id: string | null
          requested_by_name: string
          risk: Database["public"]["Enums"]["change_risk"]
          short_description: string
          state: Database["public"]["Enums"]["change_state"]
          test_plan: string | null
          type: Database["public"]["Enums"]["change_type"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "changes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_portal_omnichannel: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          id: string
          rank: number
          slug: string
          snippet: string
          title: string
          type: string
        }[]
      }
      session_heartbeat: { Args: { p_session_token: string }; Returns: boolean }
      set_change_incident_links: {
        Args: { p_change_id: string; p_incident_ids: string[] }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sla_add_business_minutes: {
        Args: { p_calendar_id: string; p_from: string; p_mins: number }
        Returns: string
      }
      sla_business_minutes_between: {
        Args: { p_calendar_id: string; p_from: string; p_to: string }
        Returns: number
      }
      sla_calendar_for: {
        Args: {
          p_company_id: string
          p_request_item_id: string
          p_symptom_id: string
        }
        Returns: string
      }
      sla_is_paused_state: { Args: { p_state: string }; Returns: boolean }
      sla_log_event: {
        Args: { p_event_type: string; p_incident_id: string; p_metadata?: Json }
        Returns: undefined
      }
      start_ticket_service: {
        Args: { p_incident_id: string }
        Returns: {
          accumulated_paused_time_minutes: number
          accumulated_reopen_time_minutes: number
          approval_decided_at: string | null
          approval_paused_at: string | null
          approval_status: string
          assigned_group_id: string | null
          assigned_group_name: string | null
          assigned_to_id: string | null
          assigned_to_name: string | null
          assignment_group_id: string | null
          caller_id: string | null
          caller_name: string
          case_id: string | null
          catalog_item_id: string | null
          catalog_service_id: string | null
          catalog_subitem_id: string | null
          catalog_symptom_id: string | null
          close_code: string | null
          close_notes: string | null
          closed_at: string | null
          company_id: string
          created_at: string
          description: string | null
          id: string
          is_resolution_breached: boolean
          is_response_breached: boolean
          kb_candidate: boolean
          mtta_minutes: number | null
          mttr_minutes: number | null
          number: string
          opened_via: string | null
          paused_at: string | null
          pending_reason_id: string | null
          priority: Database["public"]["Enums"]["ticket_priority"]
          priority_level: number | null
          request_subcategory_id: string | null
          resolution_code: string | null
          resolution_notes: string | null
          resolved_at: string | null
          responded_at: string | null
          short_description: string
          sla_breached: boolean
          sla_deadline: string | null
          sla_managed_by_client: boolean
          sla_resolution_deadline: string | null
          sla_response_deadline: string | null
          sla_warning_notified: boolean
          state: Database["public"]["Enums"]["incident_state"]
          symptom_id: string | null
          tags: string[]
          ticket_type: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "tickets"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_change_for_cab: {
        Args: { p_change_id: string }
        Returns: {
          backout_plan: string | null
          cab_approvals: Json
          cab_approvers: Json
          change_window_end: string | null
          change_window_start: string | null
          company_id: string
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          implementation_plan: string | null
          implementer_id: string | null
          implementer_name: string | null
          justification: string | null
          number: string
          related_problem_id: string | null
          requested_by_id: string | null
          requested_by_name: string
          risk: Database["public"]["Enums"]["change_risk"]
          short_description: string
          state: Database["public"]["Enums"]["change_state"]
          test_plan: string | null
          type: Database["public"]["Enums"]["change_type"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "changes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      submit_csat: {
        Args: { p_comment?: string; p_rating: number; p_survey_id: string }
        Returns: {
          comment: string | null
          company_id: string
          created_at: string
          id: string
          incident_id: string
          rating: number | null
          requester_id: string
          sent_at: string
          status: string
          submitted_at: string | null
        }
        SetofOptions: {
          from: "*"
          to: "csat_surveys"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_company_branding: {
        Args: { p_company_id: string; p_settings: Json }
        Returns: Database["public"]["Tables"]["companies"]["Row"]
      }
      update_company_login_policy: {
        Args: {
          p_allow_local_login: boolean
          p_company_id: string
          p_sso_providers: Json
        }
        Returns: Database["public"]["Tables"]["companies"]["Row"]
      }
      update_profile_secure: {
        Args: { p_patch: Json; p_profile_id: string }
        Returns: {
          active: boolean
          alternate_manager_id: string | null
          auth_id: string | null
          avatar_url: string | null
          company_id: string
          created_at: string
          department: string | null
          email: string
          id: string
          job_title_id: string | null
          location_id: string | null
          manager_id: string | null
          name: string
          phone: string | null
          profile_role: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      virtual_agent_confirm_action: {
        Args: { p_confirmed: boolean; p_execution_id: string }
        Returns: Json
      }
      virtual_agent_process_message: {
        Args: { p_conversation_id?: string; p_text: string }
        Returns: Json
      }
      virtual_agent_run_action: {
        Args: {
          p_action_key: string
          p_caller_name: string
          p_company_id: string
          p_input_text: string
          p_profile_id: string
        }
        Returns: {
          reply: string
          result_status: string
          safe_output: Json
        }[]
      }
      virtual_agent_triage_complete: {
        Args: {
          p_conversation_id: string
          p_incident_id: string
          p_summary: Json
        }
        Returns: undefined
      }
      virtual_agent_triage_sync: {
        Args: {
          p_conversation_id: string
          p_inbound: string
          p_outbound: string
          p_state: Json
        }
        Returns: string
      }
      webhook_claim_queue_batch: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          claimed_at: string | null
          company_id: string
          created_at: string
          event_type: string
          id: string
          last_error: string | null
          max_attempts: number
          payload: Json
          processed_at: string | null
          run_after: string
          status: string
          webhook_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "webhook_events_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      workflow_bump_priority: {
        Args: { p_current: Database["public"]["Enums"]["ticket_priority"] }
        Returns: Database["public"]["Enums"]["ticket_priority"]
      }
      workflow_claim_queue_batch: {
        Args: { p_limit?: number }
        Returns: {
          action: Json
          attempts: number
          chain_id: string | null
          claimed_at: string | null
          company_id: string
          created_at: string
          id: string
          incident_id: string
          last_error: string | null
          max_attempts: number
          processed_at: string | null
          rule_id: string | null
          run_after: string
          sequence_no: number
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "workflow_action_queue"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      workflow_dispatch_actions: {
        Args: {
          p_incident: Database["public"]["Tables"]["tickets"]["Row"]
          p_rule: Database["public"]["Tables"]["workflow_rules"]["Row"]
        }
        Returns: undefined
      }
      workflow_eval_condition: {
        Args: {
          p_condition: Json
          p_incident: Database["public"]["Tables"]["tickets"]["Row"]
        }
        Returns: boolean
      }
      workflow_eval_conditions: {
        Args: {
          p_conditions: Json
          p_incident: Database["public"]["Tables"]["tickets"]["Row"]
        }
        Returns: boolean
      }
      workflow_execute_sync_action: {
        Args: {
          p_action: Json
          p_incident: Database["public"]["Tables"]["tickets"]["Row"]
          p_rule: Database["public"]["Tables"]["workflow_rules"]["Row"]
        }
        Returns: undefined
      }
      workflow_incident_department_id: {
        Args: { p_incident: Database["public"]["Tables"]["tickets"]["Row"] }
        Returns: string
      }
      workflow_run_queued_sync: {
        Args: { p_queue_id: string }
        Returns: undefined
      }
      write_admin_audit: {
        Args: {
          p_action: string
          p_after?: Json
          p_before?: Json
          p_company_id: string
          p_correlation_id?: string
          p_resource_id?: string
          p_resource_type: string
        }
        Returns: string
      }
    }
    Enums: {
      case_specialization: "incident" | "request" | "general"
      change_risk: "Low" | "Medium" | "High" | "Critical"
      change_state:
        | "Draft"
        | "Awaiting CAB Approval"
        | "CAB Approved"
        | "CAB Rejected"
        | "Scheduled"
        | "In Implementation"
        | "Completed"
        | "Failed"
        | "Cancelled"
      change_type: "Standard" | "Normal" | "Emergency"
      channel_provider:
        | "microsoft_graph"
        | "microsoft_teams"
        | "gmail"
        | "google_chat"
        | "whatsapp_cloud"
        | "imap_smtp"
        | "portal"
        | "api"
      channel_scope: "tenant" | "provider"
      delivery_status:
        | "pending"
        | "processing"
        | "sent"
        | "delivered"
        | "read"
        | "failed"
        | "dead_letter"
      incident_category:
        | "Hardware"
        | "Software"
        | "Network"
        | "Database"
        | "Security"
        | "Inquiry"
        | "Other"
      incident_state:
        | "New"
        | "In Progress"
        | "On Hold"
        | "Pending User"
        | "Resolved"
        | "Closed"
      problem_state:
        | "New"
        | "Under Investigation"
        | "Root Cause Identified"
        | "Known Error"
        | "Resolved"
        | "Closed"
      request_state:
        | "Draft"
        | "Awaiting Approval"
        | "Approved"
        | "In Fulfillment"
        | "Fulfilled"
        | "Rejected"
        | "Cancelled"
      service_domain_privacy: "standard" | "private" | "restricted"
      sso_provider_type: "microsoft" | "google" | "active_directory"
      ticket_priority:
        | "P1 - Critical"
        | "P2 - High"
        | "P3 - Moderate"
        | "P4 - Low"
        | "P5 - Planning"
      ticket_type_enum: "incident" | "request"
      user_role: "sysadmin" | "company_admin" | "agent" | "end_user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      case_specialization: ["incident", "request", "general"],
      change_risk: ["Low", "Medium", "High", "Critical"],
      change_state: [
        "Draft",
        "Awaiting CAB Approval",
        "CAB Approved",
        "CAB Rejected",
        "Scheduled",
        "In Implementation",
        "Completed",
        "Failed",
        "Cancelled",
      ],
      change_type: ["Standard", "Normal", "Emergency"],
      channel_provider: [
        "microsoft_graph",
        "microsoft_teams",
        "gmail",
        "google_chat",
        "whatsapp_cloud",
        "imap_smtp",
        "portal",
        "api",
      ],
      channel_scope: ["tenant", "provider"],
      delivery_status: [
        "pending",
        "processing",
        "sent",
        "delivered",
        "read",
        "failed",
        "dead_letter",
      ],
      incident_category: [
        "Hardware",
        "Software",
        "Network",
        "Database",
        "Security",
        "Inquiry",
        "Other",
      ],
      incident_state: [
        "New",
        "In Progress",
        "On Hold",
        "Pending User",
        "Resolved",
        "Closed",
      ],
      problem_state: [
        "New",
        "Under Investigation",
        "Root Cause Identified",
        "Known Error",
        "Resolved",
        "Closed",
      ],
      request_state: [
        "Draft",
        "Awaiting Approval",
        "Approved",
        "In Fulfillment",
        "Fulfilled",
        "Rejected",
        "Cancelled",
      ],
      service_domain_privacy: ["standard", "private", "restricted"],
      sso_provider_type: ["microsoft", "google", "active_directory"],
      ticket_priority: [
        "P1 - Critical",
        "P2 - High",
        "P3 - Moderate",
        "P4 - Low",
        "P5 - Planning",
      ],
      ticket_type_enum: ["incident", "request"],
      user_role: ["sysadmin", "company_admin", "agent", "end_user"],
    },
  },
} as const
