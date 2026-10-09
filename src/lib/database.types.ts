export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      ai_usage: {
        Row: {
          calls: number
          day: string
          user_id: string
        }
        Insert: {
          calls?: number
          day?: string
          user_id: string
        }
        Update: {
          calls?: number
          day?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      appointment_reschedules: {
        Row: {
          appointment_id: string
          created_at: string
          id: string
          new_date_time: string
          old_date_time: string
          reason: string
          rescheduled_by: string
        }
        Insert: {
          appointment_id: string
          created_at?: string
          id?: string
          new_date_time: string
          old_date_time: string
          reason: string
          rescheduled_by: string
        }
        Update: {
          appointment_id?: string
          created_at?: string
          id?: string
          new_date_time?: string
          old_date_time?: string
          reason?: string
          rescheduled_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointment_reschedules_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: false
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointment_reschedules_rescheduled_by_fkey"
            columns: ["rescheduled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      appointments: {
        Row: {
          clinic_id: string
          created_at: string
          date_time: string
          id: string
          nutritionist_id: string
          patient_id: string
          public_token: string
          public_token_expires_at: string | null
          service_id: string | null
          status: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          date_time: string
          id?: string
          nutritionist_id: string
          patient_id: string
          public_token?: string
          public_token_expires_at?: string | null
          service_id?: string | null
          status?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          date_time?: string
          id?: string
          nutritionist_id?: string
          patient_id?: string
          public_token?: string
          public_token_expires_at?: string | null
          service_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "appointments_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "appointments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_invites: {
        Row: {
          clinic_id: string
          created_at: string
          email: string
          id: string
          name: string | null
          role: string
          status: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          email: string
          id?: string
          name?: string | null
          role: string
          status?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          email?: string
          id?: string
          name?: string | null
          role?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_invites_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
      clinic_members: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinic_members_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "clinic_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      clinics: {
        Row: {
          address: string | null
          cep: string | null
          city: string | null
          complement: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          neighborhood: string | null
          operating_hours: string | null
          owner_id: string
          phone: string | null
          plan_level: string
          state: string | null
          subscription_end_date: string | null
          subscription_status: string
        }
        Insert: {
          address?: string | null
          cep?: string | null
          city?: string | null
          complement?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          neighborhood?: string | null
          operating_hours?: string | null
          owner_id: string
          phone?: string | null
          plan_level?: string
          state?: string | null
          subscription_end_date?: string | null
          subscription_status?: string
        }
        Update: {
          address?: string | null
          cep?: string | null
          city?: string | null
          complement?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          neighborhood?: string | null
          operating_hours?: string | null
          owner_id?: string
          phone?: string | null
          plan_level?: string
          state?: string | null
          subscription_end_date?: string | null
          subscription_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "clinics_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      consultations: {
        Row: {
          anamnese_notes: string | null
          anthropometry_json: Json | null
          appointment_id: string
          clinic_id: string
          created_at: string
          id: string
          patient_id: string
        }
        Insert: {
          anamnese_notes?: string | null
          anthropometry_json?: Json | null
          appointment_id: string
          clinic_id: string
          created_at?: string
          id?: string
          patient_id: string
        }
        Update: {
          anamnese_notes?: string | null
          anthropometry_json?: Json | null
          appointment_id?: string
          clinic_id?: string
          created_at?: string
          id?: string
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consultations_appointment_id_fkey"
            columns: ["appointment_id"]
            isOneToOne: true
            referencedRelation: "appointments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultations_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consultations_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      meal_plans: {
        Row: {
          clinic_id: string
          created_at: string
          id: string
          kcal: number | null
          meals: Json
          nutritionist_id: string
          patient_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          id?: string
          kcal?: number | null
          meals?: Json
          nutritionist_id: string
          patient_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          id?: string
          kcal?: number | null
          meals?: Json
          nutritionist_id?: string
          patient_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meal_plans_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plans_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meal_plans_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_access_grants: {
        Row: {
          clinic_id: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          expires_at: string | null
          grantee_id: string
          id: string
          owner_nutritionist_id: string
          patient_id: string | null
          reason: string | null
          requested_by: string | null
          status: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          expires_at?: string | null
          grantee_id: string
          id?: string
          owner_nutritionist_id: string
          patient_id?: string | null
          reason?: string | null
          requested_by?: string | null
          status?: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          expires_at?: string | null
          grantee_id?: string
          id?: string
          owner_nutritionist_id?: string
          patient_id?: string | null
          reason?: string | null
          requested_by?: string | null
          status?: string
        }
        Relationships: []
      }
      patient_exams: {
        Row: {
          ai_feedback: Json | null
          created_at: string
          exam_date: string
          file_url: string
          id: string
          patient_id: string
          professional_id: string
        }
        Insert: {
          ai_feedback?: Json | null
          created_at?: string
          exam_date?: string
          file_url: string
          id?: string
          patient_id: string
          professional_id: string
        }
        Update: {
          ai_feedback?: Json | null
          created_at?: string
          exam_date?: string
          file_url?: string
          id?: string
          patient_id?: string
          professional_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_exams_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: false
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patient_exams_professional_id_fkey"
            columns: ["professional_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      patient_health: {
        Row: {
          allergies: string | null
          dietary_restrictions: string | null
          medications: string | null
          patient_id: string
          pathologies: string | null
          physical_activity_level: string | null
          profession: string | null
          sleep_quality: string | null
          updated_at: string
        }
        Insert: {
          allergies?: string | null
          dietary_restrictions?: string | null
          medications?: string | null
          patient_id: string
          pathologies?: string | null
          physical_activity_level?: string | null
          profession?: string | null
          sleep_quality?: string | null
          updated_at?: string
        }
        Update: {
          allergies?: string | null
          dietary_restrictions?: string | null
          medications?: string | null
          patient_id?: string
          pathologies?: string | null
          physical_activity_level?: string | null
          profession?: string | null
          sleep_quality?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "patient_health_patient_id_fkey"
            columns: ["patient_id"]
            isOneToOne: true
            referencedRelation: "patients"
            referencedColumns: ["id"]
          },
        ]
      }
      patients: {
        Row: {
          biological_sex: string | null
          birth_date: string | null
          clinic_id: string
          cpf: string | null
          created_at: string
          email: string | null
          form_token: string | null
          id: string
          main_goal: string | null
          name: string
          nutritionist_id: string
          phone: string | null
          portal_access_until: string | null
          portal_terms_accepted_at: string | null
          portal_terms_version: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          biological_sex?: string | null
          birth_date?: string | null
          clinic_id: string
          cpf?: string | null
          created_at?: string
          email?: string | null
          form_token?: string | null
          id?: string
          main_goal?: string | null
          name: string
          nutritionist_id: string
          phone?: string | null
          portal_access_until?: string | null
          portal_terms_accepted_at?: string | null
          portal_terms_version?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          biological_sex?: string | null
          birth_date?: string | null
          clinic_id?: string
          cpf?: string | null
          created_at?: string
          email?: string | null
          form_token?: string | null
          id?: string
          main_goal?: string | null
          name?: string
          nutritionist_id?: string
          phone?: string | null
          portal_access_until?: string | null
          portal_terms_accepted_at?: string | null
          portal_terms_version?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "patients_nutritionist_id_fkey"
            columns: ["nutritionist_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "patients_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          birth_date: string | null
          created_at: string
          crn: string | null
          full_name: string
          id: string
          is_active: boolean
          is_superadmin: boolean
          phone: string | null
          theme_color: string | null
          theme_mode: string | null
        }
        Insert: {
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          crn?: string | null
          full_name: string
          id: string
          is_active?: boolean
          is_superadmin?: boolean
          phone?: string | null
          theme_color?: string | null
          theme_mode?: string | null
        }
        Update: {
          avatar_url?: string | null
          birth_date?: string | null
          created_at?: string
          crn?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          is_superadmin?: boolean
          phone?: string | null
          theme_color?: string | null
          theme_mode?: string | null
        }
        Relationships: []
      }
      public_rpc_attempts: {
        Row: {
          attempted_at: string
          bucket: string
          id: number
        }
        Insert: {
          attempted_at?: string
          bucket: string
          id?: never
        }
        Update: {
          attempted_at?: string
          bucket?: string
          id?: never
        }
        Relationships: []
      }
      reminders: {
        Row: {
          clinic_id: string
          created_at: string
          description: string
          due_date: string
          id: string
          is_completed: boolean
          user_id: string
        }
        Insert: {
          clinic_id: string
          created_at?: string
          description: string
          due_date: string
          id?: string
          is_completed?: boolean
          user_id: string
        }
        Update: {
          clinic_id?: string
          created_at?: string
          description?: string
          due_date?: string
          id?: string
          is_completed?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reminders_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          clinic_id: string
          created_at: string
          duration_minutes: number
          id: string
          modality: string
          name: string
          price: number
        }
        Insert: {
          clinic_id: string
          created_at?: string
          duration_minutes: number
          id?: string
          modality: string
          name: string
          price: number
        }
        Update: {
          clinic_id?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          modality?: string
          name?: string
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "services_clinic_id_fkey"
            columns: ["clinic_id"]
            isOneToOne: false
            referencedRelation: "clinics"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      acting_member_of:
        | { Args: { p_clinic_id: string }; Returns: boolean }
        | { Args: { p_clinic_id: string; p_roles: string[] }; Returns: boolean }
      allocate_user_to_clinic: {
        Args: { p_clinic_id: string; p_role: string; p_user_id: string }
        Returns: undefined
      }
      change_patient_password: {
        Args: { p_new_password: string; p_patient_user_id: string }
        Returns: boolean
      }
      client_ip: { Args: never; Returns: string }
      confirm_appointment_public: {
        Args: { p_status: string; p_token: string }
        Returns: boolean
      }
      create_patient_account: {
        Args: {
          p_biological_sex: string
          p_birth_date: string
          p_clinic_id: string
          p_cpf: string
          p_email: string
          p_main_goal: string
          p_name: string
          p_nutritionist_id?: string
          p_password: string
          p_phone: string
          p_status: string
        }
        Returns: string
      }
      create_staff_member: {
        Args: {
          p_clinic_id: string
          p_crn: string
          p_email: string
          p_name: string
          p_password: string
          p_phone: string
          p_role: string
        }
        Returns: string
      }
      delete_staff_member: {
        Args: { p_clinic_id: string; p_user_id: string }
        Returns: undefined
      }
      delete_user_master: { Args: { p_user_id: string }; Returns: undefined }
      enforce_public_rate_limit: {
        Args: { p_bucket: string; p_max: number; p_window: string }
        Returns: undefined
      }
      get_appointment_details_public: {
        Args: { p_token: string }
        Returns: {
          clinic_name: string
          date_time: string
          patient_name: string
          professional_name: string
          service_name: string
          status: string
        }[]
      }
      get_clinic_staff: {
        Args: { p_clinic_id: string }
        Returns: {
          created_at: string
          crn: string
          email: string
          full_name: string
          is_active: boolean
          phone: string
          role: string
          user_id: string
        }[]
      }
      get_my_clinics: { Args: never; Returns: string[] }
      get_patient_by_token: {
        Args: { p_token: string }
        Returns: {
          allergies: string
          dietary_restrictions: string
          medications: string
          name: string
          pathologies: string
          physical_activity_level: string
          profession: string
          sleep_quality: string
        }[]
      }
      get_patient_meal_plan: {
        Args: { p_birth_date: string; p_plan_id: string }
        Returns: Json
      }
      is_account_active: { Args: { p_user_id: string }; Returns: boolean }
      is_member_of_same_clinic: {
        Args: { p_profile_id: string; p_staff_user_id: string }
        Returns: boolean
      }
      is_patient_of_clinic: {
        Args: { p_profile_id: string; p_staff_user_id: string }
        Returns: boolean
      }
      is_superadmin: { Args: { user_id: string }; Returns: boolean }
      register_ai_call: { Args: { p_daily_limit?: number }; Returns: undefined }
      toggle_patient_status: {
        Args: { p_is_active: boolean; p_patient_user_id: string }
        Returns: boolean
      }
      toggle_staff_member_status: {
        Args: { p_clinic_id: string; p_is_active: boolean; p_user_id: string }
        Returns: undefined
      }
      update_own_profile: {
        Args: {
          p_crn: string
          p_email: string
          p_name: string
          p_phone: string
        }
        Returns: undefined
      }
      update_patient_account: {
        Args: {
          p_biological_sex: string
          p_birth_date: string
          p_clinic_id: string
          p_cpf: string
          p_email: string
          p_main_goal: string
          p_name: string
          p_patient_id: string
          p_phone: string
          p_status: string
        }
        Returns: undefined
      }
      update_patient_clinical_data: {
        Args: {
          p_allergies: string
          p_dietary_restrictions: string
          p_medications: string
          p_pathologies: string
          p_physical_activity_level: string
          p_profession: string
          p_sleep_quality: string
          p_token: string
        }
        Returns: boolean
      }
      update_staff_member: {
        Args: {
          p_clinic_id: string
          p_crn: string
          p_email: string
          p_name: string
          p_phone: string
          p_role: string
          p_user_id: string
        }
        Returns: undefined
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
