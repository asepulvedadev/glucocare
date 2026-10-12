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
      account_deletion_requests: {
        Row: {
          completed_at: string | null
          error_code: string | null
          id: string
          reason: string | null
          requested_at: string
          status: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          error_code?: string | null
          id?: string
          reason?: string | null
          requested_at?: string
          status?: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          error_code?: string | null
          id?: string
          reason?: string | null
          requested_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      alert_deliveries: {
        Row: {
          acknowledged_at: string | null
          channel: string
          contact_id: string
          delivered_at: string | null
          failure_code: string | null
          id: string
          incident_id: string
          patient_id: string
          provider_event_id: string | null
          queued_at: string
          status: string
        }
        Insert: {
          acknowledged_at?: string | null
          channel: string
          contact_id: string
          delivered_at?: string | null
          failure_code?: string | null
          id: string
          incident_id: string
          patient_id: string
          provider_event_id?: string | null
          queued_at?: string
          status?: string
        }
        Update: {
          acknowledged_at?: string | null
          channel?: string
          contact_id?: string
          delivered_at?: string | null
          failure_code?: string | null
          id?: string
          incident_id?: string
          patient_id?: string
          provider_event_id?: string | null
          queued_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_deliveries_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "trusted_contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_deliveries_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "emergency_incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_deliveries_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          authorization_number: string | null
          authorized_at: string | null
          created_at: string
          deleted_at: string | null
          facility: string | null
          id: string
          insurer: string | null
          location: string | null
          patient_id: string
          preparation_notes: string | null
          provider: string
          reminder_policy: Json
          requested_at: string | null
          scheduled_at: string | null
          specialty: string | null
          status: string
          title: string
          updated_at: string
          virtual_url: string | null
        }
        Insert: {
          authorization_number?: string | null
          authorized_at?: string | null
          created_at?: string
          deleted_at?: string | null
          facility?: string | null
          id: string
          insurer?: string | null
          location?: string | null
          patient_id: string
          preparation_notes?: string | null
          provider: string
          reminder_policy?: Json
          requested_at?: string | null
          scheduled_at?: string | null
          specialty?: string | null
          status: string
          title: string
          updated_at?: string
          virtual_url?: string | null
        }
        Update: {
          authorization_number?: string | null
          authorized_at?: string | null
          created_at?: string
          deleted_at?: string | null
          facility?: string | null
          id?: string
          insurer?: string | null
          location?: string | null
          patient_id?: string
          preparation_notes?: string | null
          provider?: string
          reminder_policy?: Json
          requested_at?: string | null
          scheduled_at?: string | null
          specialty?: string | null
          status?: string
          title?: string
          updated_at?: string
          virtual_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          action: string
          actor_user_id: string | null
          after_data: Json | null
          before_data: Json | null
          device_id: string | null
          entity_id: string | null
          entity_type: string
          id: string
          occurred_at: string
          patient_id: string
          reason: string | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          device_id?: string | null
          entity_id?: string | null
          entity_type: string
          id?: string
          occurred_at?: string
          patient_id: string
          reason?: string | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          after_data?: Json | null
          before_data?: Json | null
          device_id?: string | null
          entity_id?: string | null
          entity_type?: string
          id?: string
          occurred_at?: string
          patient_id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      care_plan_revisions: {
        Row: {
          author_name: string | null
          clinician_verified: boolean
          content_locale: string
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          patient_id: string
          reviewed_at: string | null
          revision_number: number
          source: string | null
          symptom_actions: Json
          target_bands: Json
          urgent_rules: Json
        }
        Insert: {
          author_name?: string | null
          clinician_verified?: boolean
          content_locale?: string
          created_at?: string
          effective_from: string
          effective_to?: string | null
          id?: string
          patient_id: string
          reviewed_at?: string | null
          revision_number: number
          source?: string | null
          symptom_actions?: Json
          target_bands?: Json
          urgent_rules?: Json
        }
        Update: {
          author_name?: string | null
          clinician_verified?: boolean
          content_locale?: string
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          patient_id?: string
          reviewed_at?: string | null
          revision_number?: number
          source?: string | null
          symptom_actions?: Json
          target_bands?: Json
          urgent_rules?: Json
        }
        Relationships: [
          {
            foreignKeyName: "care_plan_revisions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_cards: {
        Row: {
          allergies: string | null
          birth_date: string | null
          care_provider: string | null
          deleted_at: string | null
          diabetes_type: string | null
          emergency_notes: string | null
          full_name: string
          patient_id: string
          updated_at: string
        }
        Insert: {
          allergies?: string | null
          birth_date?: string | null
          care_provider?: string | null
          deleted_at?: string | null
          diabetes_type?: string | null
          emergency_notes?: string | null
          full_name: string
          patient_id: string
          updated_at?: string
        }
        Update: {
          allergies?: string | null
          birth_date?: string | null
          care_provider?: string | null
          deleted_at?: string | null
          diabetes_type?: string | null
          emergency_notes?: string | null
          full_name?: string
          patient_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_cards_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      emergency_incidents: {
        Row: {
          call_attempted: boolean
          closed_at: string | null
          created_at: string
          id: string
          location: Json | null
          occurred_at: string
          patient_id: string
          reading_id: string | null
          resolution_note: string | null
          symptom_codes: string[]
          timezone: string
          trigger: string
        }
        Insert: {
          call_attempted?: boolean
          closed_at?: string | null
          created_at?: string
          id: string
          location?: Json | null
          occurred_at?: string
          patient_id: string
          reading_id?: string | null
          resolution_note?: string | null
          symptom_codes?: string[]
          timezone: string
          trigger?: string
        }
        Update: {
          call_attempted?: boolean
          closed_at?: string | null
          created_at?: string
          id?: string
          location?: Json | null
          occurred_at?: string
          patient_id?: string
          reading_id?: string | null
          resolution_note?: string | null
          symptom_codes?: string[]
          timezone?: string
          trigger?: string
        }
        Relationships: [
          {
            foreignKeyName: "emergency_incidents_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "emergency_incidents_reading_id_fkey"
            columns: ["reading_id"]
            isOneToOne: false
            referencedRelation: "glucose_readings"
            referencedColumns: ["id"]
          },
        ]
      }
      glucose_readings: {
        Row: {
          care_plan_revision_id: string | null
          classification: string | null
          context: string
          conversion_version: string | null
          deleted_at: string | null
          id: string
          meal_offset_minutes: number | null
          measured_at: string
          note: string | null
          patient_id: string
          recorded_at: string
          rule_id: string | null
          source: string
          symptoms: string[]
          time_edited: boolean
          timezone: string
          unit_original: string
          updated_at: string
          utc_offset_minutes: number | null
          value_mg_dl: number | null
          value_original: number
          version: number
        }
        Insert: {
          care_plan_revision_id?: string | null
          classification?: string | null
          context: string
          conversion_version?: string | null
          deleted_at?: string | null
          id: string
          meal_offset_minutes?: number | null
          measured_at: string
          note?: string | null
          patient_id: string
          recorded_at?: string
          rule_id?: string | null
          source?: string
          symptoms?: string[]
          time_edited?: boolean
          timezone: string
          unit_original: string
          updated_at?: string
          utc_offset_minutes?: number | null
          value_mg_dl?: number | null
          value_original: number
          version?: number
        }
        Update: {
          care_plan_revision_id?: string | null
          classification?: string | null
          context?: string
          conversion_version?: string | null
          deleted_at?: string | null
          id?: string
          meal_offset_minutes?: number | null
          measured_at?: string
          note?: string | null
          patient_id?: string
          recorded_at?: string
          rule_id?: string | null
          source?: string
          symptoms?: string[]
          time_edited?: boolean
          timezone?: string
          unit_original?: string
          updated_at?: string
          utc_offset_minutes?: number | null
          value_mg_dl?: number | null
          value_original?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "glucose_readings_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      measurement_occurrences: {
        Row: {
          completed_at: string | null
          completed_reading_id: string | null
          created_at: string
          id: string
          patient_id: string
          plan_revision_id: string
          scheduled_at: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          completed_reading_id?: string | null
          created_at?: string
          id: string
          patient_id: string
          plan_revision_id: string
          scheduled_at: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          completed_reading_id?: string | null
          created_at?: string
          id?: string
          patient_id?: string
          plan_revision_id?: string
          scheduled_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "measurement_occurrences_completed_reading_id_fkey"
            columns: ["completed_reading_id"]
            isOneToOne: false
            referencedRelation: "glucose_readings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurement_occurrences_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "measurement_occurrences_plan_revision_id_fkey"
            columns: ["plan_revision_id"]
            isOneToOne: false
            referencedRelation: "measurement_plan_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      measurement_plan_revisions: {
        Row: {
          clinician_verified: boolean
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          instructions: string | null
          patient_id: string
          readings_per_day: number
          revision_number: number
          source: string
          times_json: Json
        }
        Insert: {
          clinician_verified?: boolean
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          instructions?: string | null
          patient_id: string
          readings_per_day: number
          revision_number: number
          source?: string
          times_json?: Json
        }
        Update: {
          clinician_verified?: boolean
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          instructions?: string | null
          patient_id?: string
          readings_per_day?: number
          revision_number?: number
          source?: string
          times_json?: Json
        }
        Relationships: [
          {
            foreignKeyName: "measurement_plan_revisions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_occurrences: {
        Row: {
          acted_at: string | null
          created_at: string
          id: string
          medication_id: string
          patient_id: string
          schedule_revision_id: string
          scheduled_at: string
          status: string
        }
        Insert: {
          acted_at?: string | null
          created_at?: string
          id: string
          medication_id: string
          patient_id: string
          schedule_revision_id: string
          scheduled_at: string
          status?: string
        }
        Update: {
          acted_at?: string | null
          created_at?: string
          id?: string
          medication_id?: string
          patient_id?: string
          schedule_revision_id?: string
          scheduled_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_occurrences_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_occurrences_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_occurrences_schedule_revision_id_fkey"
            columns: ["schedule_revision_id"]
            isOneToOne: false
            referencedRelation: "medication_schedule_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      medication_schedule_revisions: {
        Row: {
          created_at: string
          effective_from: string
          effective_to: string | null
          id: string
          medication_id: string
          patient_id: string
          revision_number: number
          times_json: Json
          timezone: string
        }
        Insert: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          medication_id: string
          patient_id: string
          revision_number: number
          times_json?: Json
          timezone?: string
        }
        Update: {
          created_at?: string
          effective_from?: string
          effective_to?: string | null
          id?: string
          medication_id?: string
          patient_id?: string
          revision_number?: number
          times_json?: Json
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "medication_schedule_revisions_medication_id_fkey"
            columns: ["medication_id"]
            isOneToOne: false
            referencedRelation: "medications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "medication_schedule_revisions_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      medications: {
        Row: {
          created_at: string
          deleted_at: string | null
          dose_text: string
          enabled: boolean
          id: string
          name: string
          patient_id: string
          route: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          dose_text: string
          enabled?: boolean
          id: string
          name: string
          patient_id: string
          route: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          dose_text?: string
          enabled?: boolean
          id?: string
          name?: string
          patient_id?: string
          route?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "medications_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      outbox_events: {
        Row: {
          acknowledged_at: string | null
          aggregate_id: string
          aggregate_type: string
          attempt_count: number
          created_at: string
          event_type: string
          id: string
          next_attempt_at: string
          patient_id: string
          payload: Json
          schema_version: number
          status: string
        }
        Insert: {
          acknowledged_at?: string | null
          aggregate_id: string
          aggregate_type: string
          attempt_count?: number
          created_at?: string
          event_type: string
          id: string
          next_attempt_at?: string
          patient_id: string
          payload?: Json
          schema_version?: number
          status?: string
        }
        Update: {
          acknowledged_at?: string | null
          aggregate_id?: string
          aggregate_type?: string
          attempt_count?: number
          created_at?: string
          event_type?: string
          id?: string
          next_attempt_at?: string
          patient_id?: string
          payload?: Json
          schema_version?: number
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "outbox_events_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_access: {
        Row: {
          created_at: string
          patient_id: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          patient_id: string
          role?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          patient_id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_access_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          birth_date: string | null
          cloud_sync_enabled: boolean
          created_at: string
          deleted_at: string | null
          display_name: string
          glucose_unit: string
          id: string
          locale: string
          simple_mode: boolean
          timezone: string
          updated_at: string
          version: number
        }
        Insert: {
          birth_date?: string | null
          cloud_sync_enabled?: boolean
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          glucose_unit?: string
          id: string
          locale?: string
          simple_mode?: boolean
          timezone?: string
          updated_at?: string
          version?: number
        }
        Update: {
          birth_date?: string | null
          cloud_sync_enabled?: boolean
          created_at?: string
          deleted_at?: string | null
          display_name?: string
          glucose_unit?: string
          id?: string
          locale?: string
          simple_mode?: boolean
          timezone?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      trusted_contacts: {
        Row: {
          allowed_event_types: string[]
          allowed_fields: string[]
          consent_changed_at: string | null
          consent_status: string
          created_at: string
          deleted_at: string | null
          email: string | null
          id: string
          name: string
          patient_id: string
          phone: string | null
          quiet_hours: Json
          relationship: string | null
          updated_at: string
        }
        Insert: {
          allowed_event_types?: string[]
          allowed_fields?: string[]
          consent_changed_at?: string | null
          consent_status?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id: string
          name: string
          patient_id: string
          phone?: string | null
          quiet_hours?: Json
          relationship?: string | null
          updated_at?: string
        }
        Update: {
          allowed_event_types?: string[]
          allowed_fields?: string[]
          consent_changed_at?: string | null
          consent_status?: string
          created_at?: string
          deleted_at?: string | null
          email?: string | null
          id?: string
          name?: string
          patient_id?: string
          phone?: string | null
          quiet_hours?: Json
          relationship?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trusted_contacts_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const

