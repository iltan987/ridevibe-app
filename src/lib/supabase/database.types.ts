
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "public": {
          Tables: {
            "applications": {
                  Row: {
                    "admin_notes": string | null,"alienating_behaviors": string,"birth_date": string,"city": string,"conflict_handling": string | null,"consent_photos": boolean,"consent_privacy": boolean,"consent_rules": boolean,"created_at": string,"district": string,"email": string,"event_interests": (string)[],"expectations": string,"full_name": string,"group_experience": Database["public"]['Enums']["group_ride_experience"],"heard_from": Database["public"]['Enums']["heard_from"],"id": string,"in_other_clubs": boolean,"instagram": string | null,"languages": (string)[],"license_class": Database["public"]['Enums']["license_class"],"locale": string,"motorcycle_brand": string | null,"motorcycle_cc": number | null,"motorcycle_model": string | null,"other_club_names": string | null,"other_event_interests": string | null,"other_languages": string | null,"owns_motorcycle": boolean,"phone": string,"privacy_notice_version": string,"profile_id": string | null,"referrer_name": string | null,"reviewed_at": string | null,"reviewed_by": string | null,"riding_styles": (string)[],"riding_years": number,"side": Database["public"]['Enums']["istanbul_side"] | null,"status": Database["public"]['Enums']["application_status"],"updated_at": string,"utm_campaign": string | null,"utm_content": string | null,"utm_medium": string | null,"utm_source": string | null,"utm_term": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "admin_notes"?: string | null,"alienating_behaviors": string,"birth_date": string,"city"?: string,"conflict_handling"?: string | null,"consent_photos"?: boolean,"consent_privacy": boolean,"consent_rules": boolean,"created_at"?: string,"district": string,"email": string,"event_interests": (string)[],"expectations": string,"full_name": string,"group_experience": Database["public"]['Enums']["group_ride_experience"],"heard_from": Database["public"]['Enums']["heard_from"],"id"?: string,"in_other_clubs": boolean,"instagram"?: string | null,"languages": (string)[],"license_class": Database["public"]['Enums']["license_class"],"locale"?: string,"motorcycle_brand"?: string | null,"motorcycle_cc"?: number | null,"motorcycle_model"?: string | null,"other_club_names"?: string | null,"other_event_interests"?: string | null,"other_languages"?: string | null,"owns_motorcycle": boolean,"phone": string,"privacy_notice_version": string,"profile_id"?: string | null,"referrer_name"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"riding_styles": (string)[],"riding_years": number,"side"?: Database["public"]['Enums']["istanbul_side"] | null,"status"?: Database["public"]['Enums']["application_status"],"updated_at"?: string,"utm_campaign"?: string | null,"utm_content"?: string | null,"utm_medium"?: string | null,"utm_source"?: string | null,"utm_term"?: string | null
                  }
                  Update: {
                    "admin_notes"?: string | null,"alienating_behaviors"?: string,"birth_date"?: string,"city"?: string,"conflict_handling"?: string | null,"consent_photos"?: boolean,"consent_privacy"?: boolean,"consent_rules"?: boolean,"created_at"?: string,"district"?: string,"email"?: string,"event_interests"?: (string)[],"expectations"?: string,"full_name"?: string,"group_experience"?: Database["public"]['Enums']["group_ride_experience"],"heard_from"?: Database["public"]['Enums']["heard_from"],"id"?: string,"in_other_clubs"?: boolean,"instagram"?: string | null,"languages"?: (string)[],"license_class"?: Database["public"]['Enums']["license_class"],"locale"?: string,"motorcycle_brand"?: string | null,"motorcycle_cc"?: number | null,"motorcycle_model"?: string | null,"other_club_names"?: string | null,"other_event_interests"?: string | null,"other_languages"?: string | null,"owns_motorcycle"?: boolean,"phone"?: string,"privacy_notice_version"?: string,"profile_id"?: string | null,"referrer_name"?: string | null,"reviewed_at"?: string | null,"reviewed_by"?: string | null,"riding_styles"?: (string)[],"riding_years"?: number,"side"?: Database["public"]['Enums']["istanbul_side"] | null,"status"?: Database["public"]['Enums']["application_status"],"updated_at"?: string,"utm_campaign"?: string | null,"utm_content"?: string | null,"utm_medium"?: string | null,"utm_source"?: string | null,"utm_term"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "applications_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "applications_reviewed_by_fkey"
      columns: ["reviewed_by"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"member_contacts": {
                  Row: {
                    "email": string | null,"profile_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "email"?: string | null,"profile_id": string,"updated_at"?: string
                  }
                  Update: {
                    "email"?: string | null,"profile_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "member_contacts_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"member_details": {
                  Row: {
                    "birth_date": string | null,"consent_photos": boolean,"consent_photos_at": string | null,"consent_photos_version": string | null,"instagram": string | null,"profile_id": string,"show_birthday": boolean,"show_instagram": boolean,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "birth_date"?: string | null,"consent_photos"?: boolean,"consent_photos_at"?: string | null,"consent_photos_version"?: string | null,"instagram"?: string | null,"profile_id": string,"show_birthday"?: boolean,"show_instagram"?: boolean,"updated_at"?: string
                  }
                  Update: {
                    "birth_date"?: string | null,"consent_photos"?: boolean,"consent_photos_at"?: string | null,"consent_photos_version"?: string | null,"instagram"?: string | null,"profile_id"?: string,"show_birthday"?: boolean,"show_instagram"?: boolean,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "member_details_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"member_emergency_contacts": {
                  Row: {
                    "created_at": string,"id": string,"name": string,"phone": string,"position": number,"profile_id": string,"relationship": Database["public"]['Enums']["emergency_relationship"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"name": string,"phone": string,"position": number,"profile_id": string,"relationship": Database["public"]['Enums']["emergency_relationship"],"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"name"?: string,"phone"?: string,"position"?: number,"profile_id"?: string,"relationship"?: Database["public"]['Enums']["emergency_relationship"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "member_emergency_contacts_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"member_health": {
                  Row: {
                    "blood_type": Database["public"]['Enums']["blood_type"] | null,"consent_blood_type": boolean,"consent_blood_type_at": string,"consent_blood_type_version": string | null,"profile_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "blood_type"?: Database["public"]['Enums']["blood_type"] | null,"consent_blood_type": boolean,"consent_blood_type_at": string,"consent_blood_type_version"?: string | null,"profile_id": string,"updated_at"?: string
                  }
                  Update: {
                    "blood_type"?: Database["public"]['Enums']["blood_type"] | null,"consent_blood_type"?: boolean,"consent_blood_type_at"?: string,"consent_blood_type_version"?: string | null,"profile_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "member_health_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: true
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"member_motorcycles": {
                  Row: {
                    "brand": string,"cc": number | null,"created_at": string,"id": string,"model": string,"profile_id": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "brand": string,"cc"?: number | null,"created_at"?: string,"id"?: string,"model": string,"profile_id": string,"updated_at"?: string
                  }
                  Update: {
                    "brand"?: string,"cc"?: number | null,"created_at"?: string,"id"?: string,"model"?: string,"profile_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "member_motorcycles_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"city": string,"created_at": string,"district": string | null,"full_name": string,"id": string,"preferred_locale": string,"role_id": string | null,"side": Database["public"]['Enums']["istanbul_side"] | null,"status": Database["public"]['Enums']["member_status"],"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "avatar_url"?: string | null,"city"?: string,"created_at"?: string,"district"?: string | null,"full_name"?: string,"id": string,"preferred_locale"?: string,"role_id"?: string | null,"side"?: Database["public"]['Enums']["istanbul_side"] | null,"status"?: Database["public"]['Enums']["member_status"],"updated_at"?: string
                  }
                  Update: {
                    "avatar_url"?: string | null,"city"?: string,"created_at"?: string,"district"?: string | null,"full_name"?: string,"id"?: string,"preferred_locale"?: string,"role_id"?: string | null,"side"?: Database["public"]['Enums']["istanbul_side"] | null,"status"?: Database["public"]['Enums']["member_status"],"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "profiles_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"role_permissions": {
                  Row: {
                    "permission": Database["public"]['Enums']["permission"],"role_id": string
                  }
                  ComputedFields: never
                  Insert: {
                    "permission": Database["public"]['Enums']["permission"],"role_id": string
                  }
                  Update: {
                    "permission"?: Database["public"]['Enums']["permission"],"role_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "role_permissions_role_id_fkey"
      columns: ["role_id"]
isOneToOne: false
      referencedRelation: "roles"
      referencedColumns: ["id"]
    }
                  ]
                },"roles": {
                  Row: {
                    "created_at": string,"id": string,"is_admin": boolean,"name": string,"updated_at": string
                  }
                  ComputedFields: never
                  Insert: {
                    "created_at"?: string,"id"?: string,"is_admin"?: boolean,"name": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"id"?: string,"is_admin"?: boolean,"name"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    
                  ]
                },"safety_access_log": {
                  Row: {
                    "action": Database["public"]['Enums']["safety_action"],"actor_id": string | null,"created_at": string,"detail": string | null,"id": number,"target_id": string | null
                  }
                  ComputedFields: never
                  Insert: {
                    "action": Database["public"]['Enums']["safety_action"],"actor_id"?: string | null,"created_at"?: string,"detail"?: string | null,"id"?: never,"target_id"?: string | null
                  }
                  Update: {
                    "action"?: Database["public"]['Enums']["safety_action"],"actor_id"?: string | null,"created_at"?: string,"detail"?: string | null,"id"?: never,"target_id"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "safety_access_log_actor_id_fkey"
      columns: ["actor_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "safety_access_log_target_id_fkey"
      columns: ["target_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "application_account":
{ Args: { "application_id": string }; Returns: {
              "email": string,"full_name": string,"id": string,"status": Database["public"]['Enums']["member_status"]
            }[]
                           },
"keep_alive":
{ Args: Record<PropertyKey, never>; Returns: boolean
                           },
"link_application":
{ Args: { "application_id": string,"target_id": string }; Returns: undefined
                           },
"linkable_accounts":
{ Args: { "after_created"?: string,"after_id"?: string,"include_active"?: boolean,"search"?: string }; Returns: {
              "avatar_url": string,"created_at": string,"email": string,"full_name": string,"id": string,"status": Database["public"]['Enums']["member_status"]
            }[]
                           },
"member_directory":
{ Args: { "after_id"?: string,"after_name"?: string,"page_size"?: number,"search"?: string,"side_filter"?: Database["public"]['Enums']["istanbul_side"] }; Returns: {
              "avatar_url": string,"birth_day": number,"birth_month": number,"district": string,"full_name": string,"id": string,"instagram": string,"motorcycles": Json,"side": Database["public"]['Enums']["istanbul_side"]
            }[]
                           },
"member_directory_counts":
{ Args: { "search"?: string }; Returns: {
              "asian": number,"european": number,"total": number
            }[]
                           },
"my_application_status":
{ Args: Record<PropertyKey, never>; Returns: Database["public"]['Enums']["application_status"]
                           },
"pending_application_flags":
{ Args: { "profile_ids": (string)[] }; Returns: {
              "has_application": boolean,"profile_id": string
            }[]
                           },
"set_member_name":
{ Args: { "new_name": string,"target_id": string }; Returns: undefined
                           },
"set_member_role":
{ Args: { "new_role_id": string,"target_id": string }; Returns: undefined
                           },
"set_member_status":
{ Args: { "new_status": Database["public"]['Enums']["member_status"],"target_id": string }; Returns: undefined
                           },
"set_my_birth_date":
{ Args: { "new_date": string }; Returns: undefined
                           },
"set_my_blood_type":
{ Args: { "new_type": Database["public"]['Enums']["blood_type"],"notice_version": string }; Returns: undefined
                           },
"withdraw_my_blood_type_consent":
{ Args: Record<PropertyKey, never>; Returns: undefined
                           }
          }
          Enums: {
            "application_status": "new"|"contacted"|"approved"|"rejected","blood_type": "A+"|"A-"|"B+"|"B-"|"AB+"|"AB-"|"0+"|"0-","emergency_relationship": "spouse_partner"|"parent"|"sibling"|"child"|"friend"|"other","group_ride_experience": "none"|"some"|"a_lot","heard_from": "instagram_ad"|"instagram_other"|"friend"|"other","istanbul_side": "asian"|"european","license_class": "a1"|"a2"|"a"|"b"|"none","member_status": "pending"|"active"|"inactive","permission": "applications.view"|"applications.review"|"applications.decide"|"applications.delete"|"members.manage"|"members.safety","safety_action": "view_card"|"filter_blood_type"|"set_blood_type"|"withdraw_blood_type"
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
            "application_status": ["new", "contacted", "approved", "rejected"],"blood_type": ["A+", "A-", "B+", "B-", "AB+", "AB-", "0+", "0-"],"emergency_relationship": ["spouse_partner", "parent", "sibling", "child", "friend", "other"],"group_ride_experience": ["none", "some", "a_lot"],"heard_from": ["instagram_ad", "instagram_other", "friend", "other"],"istanbul_side": ["asian", "european"],"license_class": ["a1", "a2", "a", "b", "none"],"member_status": ["pending", "active", "inactive"],"permission": ["applications.view", "applications.review", "applications.decide", "applications.delete", "members.manage", "members.safety"],"safety_action": ["view_card", "filter_blood_type", "set_blood_type", "withdraw_blood_type"]
          }
        }
} as const
