
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "applications": {
                  Row: {
                    "admin_notes": string | null,"alienating_behaviors": string,"birth_date": string,"city": string,"consent_photos": boolean,"consent_privacy": boolean,"consent_rules": boolean,"created_at": string,"district": string,"email": string,"event_interests": (string)[],"expectations": string,"full_name": string,"group_experience": Database["public"]['Enums']["group_ride_experience"],"heard_from": Database["public"]['Enums']["heard_from"],"id": string,"in_other_clubs": boolean,"instagram": string | null,"languages": (string)[],"license_class": Database["public"]['Enums']["license_class"],"locale": string,"motorcycle_brand": string | null,"motorcycle_cc": number | null,"motorcycle_model": string | null,"other_club_names": string | null,"other_event_interests": string | null,"other_languages": string | null,"owns_motorcycle": boolean,"phone": string,"privacy_notice_version": string,"referrer_name": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"riding_styles": (string)[],"riding_years": number,"side": Database["public"]['Enums']["istanbul_side"] | null,"status": Database["public"]['Enums']["application_status"],"updated_at": string,"utm_campaign": string | null,"utm_content": string | null,"utm_medium": string | null,"utm_source": string | null,"utm_term": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "admin_notes"?: string | null,"alienating_behaviors": string,"birth_date": string,"city"?: string,"consent_photos"?: boolean,"consent_privacy": boolean,"consent_rules": boolean,"created_at"?: string,"district": string,"email": string,"event_interests": (string)[],"expectations": string,"full_name": string,"group_experience": Database["public"]['Enums']["group_ride_experience"],"heard_from": Database["public"]['Enums']["heard_from"],"id"?: string,"in_other_clubs": boolean,"instagram"?: string | null,"languages": (string)[],"license_class": Database["public"]['Enums']["license_class"],"locale"?: string,"motorcycle_brand"?: string | null,"motorcycle_cc"?: number | null,"motorcycle_model"?: string | null,"other_club_names"?: string | null,"other_event_interests"?: string | null,"other_languages"?: string | null,"owns_motorcycle": boolean,"phone": string,"privacy_notice_version": string,"referrer_name"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"riding_styles": (string)[],"riding_years": number,"side"?: Database["public"]['Enums']["istanbul_side"] | null,"status"?: Database["public"]['Enums']["application_status"],"updated_at"?: string,"utm_campaign"?: string | null,"utm_content"?: string | null,"utm_medium"?: string | null,"utm_source"?: string | null,"utm_term"?: string | null
                  }
                  Update: {
                    "admin_notes"?: string | null,"alienating_behaviors"?: string,"birth_date"?: string,"city"?: string,"consent_photos"?: boolean,"consent_privacy"?: boolean,"consent_rules"?: boolean,"created_at"?: string,"district"?: string,"email"?: string,"event_interests"?: (string)[],"expectations"?: string,"full_name"?: string,"group_experience"?: Database["public"]['Enums']["group_ride_experience"],"heard_from"?: Database["public"]['Enums']["heard_from"],"id"?: string,"in_other_clubs"?: boolean,"instagram"?: string | null,"languages"?: (string)[],"license_class"?: Database["public"]['Enums']["license_class"],"locale"?: string,"motorcycle_brand"?: string | null,"motorcycle_cc"?: number | null,"motorcycle_model"?: string | null,"other_club_names"?: string | null,"other_event_interests"?: string | null,"other_languages"?: string | null,"owns_motorcycle"?: boolean,"phone"?: string,"privacy_notice_version"?: string,"referrer_name"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"riding_styles"?: (string)[],"riding_years"?: number,"side"?: Database["public"]['Enums']["istanbul_side"] | null,"status"?: Database["public"]['Enums']["application_status"],"updated_at"?: string,"utm_campaign"?: string | null,"utm_content"?: string | null,"utm_medium"?: string | null,"utm_source"?: string | null,"utm_term"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "applications_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"city": string,"created_at": string,"district": string | null,"full_name": string,"id": string,"preferred_locale": string,"role": Database["public"]['Enums']["member_role"],"side": Database["public"]['Enums']["istanbul_side"] | null,"status": Database["public"]['Enums']["member_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"city"?: string,"created_at"?: string,"district"?: string | null,"full_name"?: string,"id": string,"preferred_locale"?: string,"role"?: Database["public"]['Enums']["member_role"],"side"?: Database["public"]['Enums']["istanbul_side"] | null,"status"?: Database["public"]['Enums']["member_status"],"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"city"?: string,"created_at"?: string,"district"?: string | null,"full_name"?: string,"id"?: string,"preferred_locale"?: string,"role"?: Database["public"]['Enums']["member_role"],"side"?: Database["public"]['Enums']["istanbul_side"] | null,"status"?: Database["public"]['Enums']["member_status"],"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "admin_set_member_access":
{ Args: { "new_role": Database["public"]['Enums']["member_role"],"new_status": Database["public"]['Enums']["member_status"],"target_id": string }; Returns: undefined
                           },
"keep_alive":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           }
          }
          Enums: {
            "application_status": "new"|"contacted"|"approved"|"rejected","group_ride_experience": "none"|"some"|"a_lot","heard_from": "instagram_ad"|"instagram_other"|"friend"|"other","istanbul_side": "asian"|"european","license_class": "a1"|"a2"|"a"|"b"|"none","member_role": "member"|"organizer"|"admin","member_status": "pending"|"active"|"inactive"
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
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
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "public": {
          Enums: {
            "application_status": ["new", "contacted", "approved", "rejected"],"group_ride_experience": ["none", "some", "a_lot"],"heard_from": ["instagram_ad", "instagram_other", "friend", "other"],"istanbul_side": ["asian", "european"],"license_class": ["a1", "a2", "a", "b", "none"],"member_role": ["member", "organizer", "admin"],"member_status": ["pending", "active", "inactive"]
          }
        }
} as const
