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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      academic_years: {
        Row: {
          created_at: string
          end_date: string
          flexible_default_payment_plan_id: string | null
          id: string
          is_active: boolean
          min_flexible_weeks: number
          name: string
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          flexible_default_payment_plan_id?: string | null
          id?: string
          is_active?: boolean
          min_flexible_weeks?: number
          name: string
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          flexible_default_payment_plan_id?: string | null
          id?: string
          is_active?: boolean
          min_flexible_weeks?: number
          name?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academic_years_flexible_default_payment_plan_id_fkey"
            columns: ["flexible_default_payment_plan_id"]
            isOneToOne: false
            referencedRelation: "payment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      activity_log: {
        Row: {
          action: string
          created_at: string
          created_by: string | null
          entity_id: string
          entity_type: string
          from_status: string | null
          id: string
          message: string | null
          to_status: string | null
        }
        Insert: {
          action: string
          created_at?: string
          created_by?: string | null
          entity_id: string
          entity_type: string
          from_status?: string | null
          id?: string
          message?: string | null
          to_status?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          created_by?: string | null
          entity_id?: string
          entity_type?: string
          from_status?: string | null
          id?: string
          message?: string | null
          to_status?: string | null
        }
        Relationships: []
      }
      amenities: {
        Row: {
          created_at: string
          description: string | null
          icon_url: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon_url?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      application_cashbacks: {
        Row: {
          application_id: string
          applied_at: string
          applied_by: string | null
          campaign_id: string
          cashback_amount: number
          created_at: string
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          application_id: string
          applied_at?: string
          applied_by?: string | null
          campaign_id: string
          cashback_amount: number
          created_at?: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string
          applied_at?: string
          applied_by?: string | null
          campaign_id?: string
          cashback_amount?: number
          created_at?: string
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_cashbacks_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "accounts_receivable_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "application_cashbacks_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "application_cashbacks_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "deposit_installment_breakdown"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "application_cashbacks_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "fully_paid_students"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "application_cashbacks_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "outstanding_balances_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "application_cashbacks_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "partner_referred_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "application_cashbacks_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "application_cashbacks_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "student_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_cashbacks_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "upcoming_and_paid_installments_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "application_cashbacks_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "cashback_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      application_discounts: {
        Row: {
          application_id: string
          applied_at: string
          applied_by: string | null
          campaign_id: string
          created_at: string
          discount_amount: number
          id: string
          notes: string | null
          updated_at: string
        }
        Insert: {
          application_id: string
          applied_at?: string
          applied_by?: string | null
          campaign_id: string
          created_at?: string
          discount_amount: number
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Update: {
          application_id?: string
          applied_at?: string
          applied_by?: string | null
          campaign_id?: string
          created_at?: string
          discount_amount?: number
          id?: string
          notes?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "application_discounts_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "accounts_receivable_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "application_discounts_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "application_discounts_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "deposit_installment_breakdown"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "application_discounts_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "fully_paid_students"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "application_discounts_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "outstanding_balances_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "application_discounts_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "partner_referred_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "application_discounts_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "application_discounts_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "student_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "application_discounts_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "upcoming_and_paid_installments_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "application_discounts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "discount_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_categories: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
          seo_page_id: string | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
          seo_page_id?: string | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
          seo_page_id?: string | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_categories_seo_page_id_fkey"
            columns: ["seo_page_id"]
            isOneToOne: false
            referencedRelation: "seo_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_post_tags: {
        Row: {
          post_id: string
          tag_id: string
        }
        Insert: {
          post_id: string
          tag_id: string
        }
        Update: {
          post_id?: string
          tag_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "blog_post_tags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_post_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "blog_tags"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_posts: {
        Row: {
          author_email: string | null
          author_id: string | null
          author_name: string | null
          category_id: string | null
          content: string
          created_at: string | null
          excerpt: string | null
          featured_image_url: string | null
          id: string
          published_at: string | null
          seo_page_id: string | null
          slug: string
          status: string
          title: string
          updated_at: string | null
          wordpress_id: string | null
          wordpress_url: string | null
        }
        Insert: {
          author_email?: string | null
          author_id?: string | null
          author_name?: string | null
          category_id?: string | null
          content: string
          created_at?: string | null
          excerpt?: string | null
          featured_image_url?: string | null
          id?: string
          published_at?: string | null
          seo_page_id?: string | null
          slug: string
          status?: string
          title: string
          updated_at?: string | null
          wordpress_id?: string | null
          wordpress_url?: string | null
        }
        Update: {
          author_email?: string | null
          author_id?: string | null
          author_name?: string | null
          category_id?: string | null
          content?: string
          created_at?: string | null
          excerpt?: string | null
          featured_image_url?: string | null
          id?: string
          published_at?: string | null
          seo_page_id?: string | null
          slug?: string
          status?: string
          title?: string
          updated_at?: string | null
          wordpress_id?: string | null
          wordpress_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blog_posts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "blog_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blog_posts_seo_page_id_fkey"
            columns: ["seo_page_id"]
            isOneToOne: false
            referencedRelation: "seo_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      blog_tags: {
        Row: {
          created_at: string | null
          id: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      branding_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          setting_key: string
          setting_type: string
          setting_value: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key: string
          setting_type?: string
          setting_value?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          setting_key?: string
          setting_type?: string
          setting_value?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      bulk_messages: {
        Row: {
          completed_at: string | null
          created_at: string
          email_template_id: string | null
          emails_sent: number
          filters: Json | null
          id: string
          message: string
          notification_type: string
          notifications_sent: number
          sent_by: string | null
          status: string
          title: string
          total_recipients: number
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          email_template_id?: string | null
          emails_sent?: number
          filters?: Json | null
          id?: string
          message: string
          notification_type?: string
          notifications_sent?: number
          sent_by?: string | null
          status?: string
          title: string
          total_recipients?: number
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          email_template_id?: string | null
          emails_sent?: number
          filters?: Json | null
          id?: string
          message?: string
          notification_type?: string
          notifications_sent?: number
          sent_by?: string | null
          status?: string
          title?: string
          total_recipients?: number
        }
        Relationships: [
          {
            foreignKeyName: "bulk_messages_email_template_id_fkey"
            columns: ["email_template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      cashback_campaigns: {
        Row: {
          academic_year_id: string | null
          applies_to: string
          cashback_amount: number
          created_at: string
          created_by: string | null
          current_uses: number
          description: string | null
          end_date: string
          id: string
          is_active: boolean
          max_uses: number | null
          name: string
          start_date: string
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          applies_to?: string
          cashback_amount: number
          created_at?: string
          created_by?: string | null
          current_uses?: number
          description?: string | null
          end_date: string
          id?: string
          is_active?: boolean
          max_uses?: number | null
          name: string
          start_date: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          applies_to?: string
          cashback_amount?: number
          created_at?: string
          created_by?: string | null
          current_uses?: number
          description?: string | null
          end_date?: string
          id?: string
          is_active?: boolean
          max_uses?: number | null
          name?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cashback_campaigns_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cashback_campaigns_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "cashback_campaigns_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "cashback_campaigns_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_occupancy_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "cashback_campaigns_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_rebookers_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "cashback_campaigns_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "cashback_campaigns_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_by_year"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "cashback_campaigns_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_status_by_academic_year"
            referencedColumns: ["academic_year_id"]
          },
        ]
      }
      communal_area_housekeeping: {
        Row: {
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          assigned_cleaner_id: string | null
          communal_area_id: string
          created_at: string | null
          id: string
          last_cleaned_at: string | null
          next_clean_due_at: string | null
          notes: string | null
          status: string
          updated_at: string | null
        }
        Insert: {
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          assigned_cleaner_id?: string | null
          communal_area_id: string
          created_at?: string | null
          id?: string
          last_cleaned_at?: string | null
          next_clean_due_at?: string | null
          notes?: string | null
          status?: string
          updated_at?: string | null
        }
        Update: {
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          assigned_cleaner_id?: string | null
          communal_area_id?: string
          created_at?: string | null
          id?: string
          last_cleaned_at?: string | null
          next_clean_due_at?: string | null
          notes?: string | null
          status?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communal_area_housekeeping_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communal_area_housekeeping_assigned_cleaner_id_fkey"
            columns: ["assigned_cleaner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communal_area_housekeeping_communal_area_id_fkey"
            columns: ["communal_area_id"]
            isOneToOne: true
            referencedRelation: "communal_areas"
            referencedColumns: ["id"]
          },
        ]
      }
      communal_areas: {
        Row: {
          cleaning_schedule_days: number[] | null
          cleaning_schedule_time: string | null
          cleaning_schedule_type: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          location: string | null
          name: string
          updated_at: string | null
        }
        Insert: {
          cleaning_schedule_days?: number[] | null
          cleaning_schedule_time?: string | null
          cleaning_schedule_type?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          location?: string | null
          name: string
          updated_at?: string | null
        }
        Update: {
          cleaning_schedule_days?: number[] | null
          cleaning_schedule_time?: string | null
          cleaning_schedule_type?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          location?: string | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communal_areas_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      content_blocks: {
        Row: {
          block_data: Json
          block_order: number
          block_type: string
          created_at: string | null
          id: string
          is_active: boolean | null
          page_path: string
          updated_at: string | null
        }
        Insert: {
          block_data: Json
          block_order?: number
          block_type: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          page_path: string
          updated_at?: string | null
        }
        Update: {
          block_data?: Json
          block_order?: number
          block_type?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          page_path?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      contract_payment_plans: {
        Row: {
          contract_id: string
          created_at: string
          display_order: number
          id: string
          payment_plan_id: string
          updated_at: string
        }
        Insert: {
          contract_id: string
          created_at?: string
          display_order?: number
          id?: string
          payment_plan_id: string
          updated_at?: string
        }
        Update: {
          contract_id?: string
          created_at?: string
          display_order?: number
          id?: string
          payment_plan_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_payment_plans_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "contract_payment_plans_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_payment_plans_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "contract_payment_plans_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "contract_payment_plans_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "upcoming_and_paid_installments_report"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "contract_payment_plans_payment_plan_id_fkey"
            columns: ["payment_plan_id"]
            isOneToOne: false
            referencedRelation: "payment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      contract_payment_schedule: {
        Row: {
          amount: number
          contract_id: string
          created_at: string
          due_date: string
          id: string
          label: string | null
          sequence: number
          updated_at: string
        }
        Insert: {
          amount: number
          contract_id: string
          created_at?: string
          due_date: string
          id?: string
          label?: string | null
          sequence: number
          updated_at?: string
        }
        Update: {
          amount?: number
          contract_id?: string
          created_at?: string
          due_date?: string
          id?: string
          label?: string | null
          sequence?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contract_payment_schedule_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "contract_payment_schedule_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contract_payment_schedule_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "contract_payment_schedule_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "contract_payment_schedule_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "upcoming_and_paid_installments_report"
            referencedColumns: ["contract_id"]
          },
        ]
      }
      contracts: {
        Row: {
          academic_year_id: string
          contract_end: string
          contract_start: string
          created_at: string
          cta_label: string | null
          deposit_override: number | null
          display_order: number
          extra_days: number
          id: string
          is_active: boolean
          is_custom_duration_placeholder: boolean
          name: string
          payment_plan_id: string | null
          slug: string
          source_contract_id: string | null
          student_application_id: string | null
          studio_grade_id: string
          summary: string | null
          updated_at: string
          visible_on_portal: boolean
          weekly_price_override: number | null
          weeks: number
        }
        Insert: {
          academic_year_id: string
          contract_end: string
          contract_start: string
          created_at?: string
          cta_label?: string | null
          deposit_override?: number | null
          display_order?: number
          extra_days?: number
          id?: string
          is_active?: boolean
          is_custom_duration_placeholder?: boolean
          name: string
          payment_plan_id?: string | null
          slug: string
          source_contract_id?: string | null
          student_application_id?: string | null
          studio_grade_id: string
          summary?: string | null
          updated_at?: string
          visible_on_portal?: boolean
          weekly_price_override?: number | null
          weeks: number
        }
        Update: {
          academic_year_id?: string
          contract_end?: string
          contract_start?: string
          created_at?: string
          cta_label?: string | null
          deposit_override?: number | null
          display_order?: number
          extra_days?: number
          id?: string
          is_active?: boolean
          is_custom_duration_placeholder?: boolean
          name?: string
          payment_plan_id?: string | null
          slug?: string
          source_contract_id?: string | null
          student_application_id?: string | null
          studio_grade_id?: string
          summary?: string | null
          updated_at?: string
          visible_on_portal?: boolean
          weekly_price_override?: number | null
          weeks?: number
        }
        Relationships: [
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_occupancy_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_rebookers_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_by_year"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_status_by_academic_year"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_payment_plan_id_fkey"
            columns: ["payment_plan_id"]
            isOneToOne: false
            referencedRelation: "payment_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_source_contract_id_fkey"
            columns: ["source_contract_id"]
            isOneToOne: false
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "contracts_source_contract_id_fkey"
            columns: ["source_contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_source_contract_id_fkey"
            columns: ["source_contract_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "contracts_source_contract_id_fkey"
            columns: ["source_contract_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "contracts_source_contract_id_fkey"
            columns: ["source_contract_id"]
            isOneToOne: false
            referencedRelation: "upcoming_and_paid_installments_report"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "contracts_student_application_id_fkey"
            columns: ["student_application_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "contracts_student_application_id_fkey"
            columns: ["student_application_id"]
            isOneToOne: false
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "contracts_student_application_id_fkey"
            columns: ["student_application_id"]
            isOneToOne: false
            referencedRelation: "deposit_installment_breakdown"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "contracts_student_application_id_fkey"
            columns: ["student_application_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "contracts_student_application_id_fkey"
            columns: ["student_application_id"]
            isOneToOne: false
            referencedRelation: "outstanding_balances_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "contracts_student_application_id_fkey"
            columns: ["student_application_id"]
            isOneToOne: false
            referencedRelation: "partner_referred_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "contracts_student_application_id_fkey"
            columns: ["student_application_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "contracts_student_application_id_fkey"
            columns: ["student_application_id"]
            isOneToOne: false
            referencedRelation: "student_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_student_application_id_fkey"
            columns: ["student_application_id"]
            isOneToOne: false
            referencedRelation: "upcoming_and_paid_installments_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "contracts_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "sales_occupancy_monthly"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "contracts_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_allocation_report"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "contracts_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "contracts_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_by_year"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "contracts_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_summary"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "contracts_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grades"
            referencedColumns: ["id"]
          },
        ]
      }
      credentials: {
        Row: {
          category: string | null
          created_at: string
          credential_key: string
          credential_type: string
          credential_value: string
          description: string | null
          encrypted_value: string | null
          id: string
          is_encrypted: boolean
          last_synced_at: string | null
          requires_encryption: boolean | null
          sync_to_edge_function: boolean | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          credential_key: string
          credential_type?: string
          credential_value: string
          description?: string | null
          encrypted_value?: string | null
          id?: string
          is_encrypted?: boolean
          last_synced_at?: string | null
          requires_encryption?: boolean | null
          sync_to_edge_function?: boolean | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          credential_key?: string
          credential_type?: string
          credential_value?: string
          description?: string | null
          encrypted_value?: string | null
          id?: string
          is_encrypted?: boolean
          last_synced_at?: string | null
          requires_encryption?: boolean | null
          sync_to_edge_function?: boolean | null
          updated_at?: string
        }
        Relationships: []
      }
      debug_logs: {
        Row: {
          application_id: string | null
          created_at: string
          data: Json | null
          function_name: string
          id: string
          message: string
        }
        Insert: {
          application_id?: string | null
          created_at?: string
          data?: Json | null
          function_name: string
          id?: string
          message: string
        }
        Update: {
          application_id?: string | null
          created_at?: string
          data?: Json | null
          function_name?: string
          id?: string
          message?: string
        }
        Relationships: []
      }
      discount_campaigns: {
        Row: {
          academic_year_id: string | null
          amount_type: string
          applies_to: string
          booking_source: string | null
          created_at: string
          created_by: string | null
          current_uses: number
          description: string | null
          discount_amount: number
          end_date: string
          id: string
          is_active: boolean
          max_uses: number | null
          name: string
          start_date: string
          updated_at: string
        }
        Insert: {
          academic_year_id?: string | null
          amount_type?: string
          applies_to?: string
          booking_source?: string | null
          created_at?: string
          created_by?: string | null
          current_uses?: number
          description?: string | null
          discount_amount: number
          end_date: string
          id?: string
          is_active?: boolean
          max_uses?: number | null
          name: string
          start_date: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string | null
          amount_type?: string
          applies_to?: string
          booking_source?: string | null
          created_at?: string
          created_by?: string | null
          current_uses?: number
          description?: string | null
          discount_amount?: number
          end_date?: string
          id?: string
          is_active?: boolean
          max_uses?: number | null
          name?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "discount_campaigns_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "discount_campaigns_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "discount_campaigns_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "discount_campaigns_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_occupancy_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "discount_campaigns_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_rebookers_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "discount_campaigns_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "discount_campaigns_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_by_year"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "discount_campaigns_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_status_by_academic_year"
            referencedColumns: ["academic_year_id"]
          },
        ]
      }
      docusign_envelopes: {
        Row: {
          application_id: string
          created_at: string
          envelope_id: string | null
          envelope_type: string
          id: string
          last_webhook_event: Json | null
          metadata: Json | null
          recipients: Json | null
          signed_document_path: string | null
          status: string
          updated_at: string
        }
        Insert: {
          application_id: string
          created_at?: string
          envelope_id?: string | null
          envelope_type: string
          id?: string
          last_webhook_event?: Json | null
          metadata?: Json | null
          recipients?: Json | null
          signed_document_path?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          created_at?: string
          envelope_id?: string | null
          envelope_type?: string
          id?: string
          last_webhook_event?: Json | null
          metadata?: Json | null
          recipients?: Json | null
          signed_document_path?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "docusign_envelopes_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "docusign_envelopes_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "docusign_envelopes_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "deposit_installment_breakdown"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "docusign_envelopes_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "docusign_envelopes_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "outstanding_balances_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "docusign_envelopes_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "partner_referred_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "docusign_envelopes_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "docusign_envelopes_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "student_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "docusign_envelopes_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "upcoming_and_paid_installments_report"
            referencedColumns: ["application_id"]
          },
        ]
      }
      docusign_templates: {
        Row: {
          academic_year_id: string
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          role_names: Json | null
          template_id: string
          template_type: string
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          role_names?: Json | null
          template_id: string
          template_type: string
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          role_names?: Json | null
          template_id?: string
          template_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "docusign_templates_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "docusign_templates_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "docusign_templates_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "docusign_templates_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_occupancy_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "docusign_templates_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_rebookers_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "docusign_templates_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "docusign_templates_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_by_year"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "docusign_templates_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_status_by_academic_year"
            referencedColumns: ["academic_year_id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body_html: string
          body_text: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          subject: string
          template_type: string
          updated_at: string
          variables: Json | null
        }
        Insert: {
          body_html: string
          body_text?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          subject: string
          template_type: string
          updated_at?: string
          variables?: Json | null
        }
        Update: {
          body_html?: string
          body_text?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          subject?: string
          template_type?: string
          updated_at?: string
          variables?: Json | null
        }
        Relationships: []
      }
      financial_forecast_breakdowns: {
        Row: {
          contract_id: string
          contract_name: string
          contract_weeks: number
          created_at: string
          current_bookings: number
          forecast_id: string
          id: string
          new_bookings_needed: number
          revenue_contribution: number
          students_needed: number
          studio_grade_id: string
          studio_grade_name: string
          total_contract_value: number
          weekly_price: number
        }
        Insert: {
          contract_id: string
          contract_name: string
          contract_weeks: number
          created_at?: string
          current_bookings?: number
          forecast_id: string
          id?: string
          new_bookings_needed: number
          revenue_contribution: number
          students_needed: number
          studio_grade_id: string
          studio_grade_name: string
          total_contract_value: number
          weekly_price: number
        }
        Update: {
          contract_id?: string
          contract_name?: string
          contract_weeks?: number
          created_at?: string
          current_bookings?: number
          forecast_id?: string
          id?: string
          new_bookings_needed?: number
          revenue_contribution?: number
          students_needed?: number
          studio_grade_id?: string
          studio_grade_name?: string
          total_contract_value?: number
          weekly_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "financial_forecast_breakdowns_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "financial_forecast_breakdowns_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_forecast_breakdowns_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "financial_forecast_breakdowns_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "financial_forecast_breakdowns_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "upcoming_and_paid_installments_report"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "financial_forecast_breakdowns_forecast_id_fkey"
            columns: ["forecast_id"]
            isOneToOne: false
            referencedRelation: "financial_forecasts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_forecast_breakdowns_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "sales_occupancy_monthly"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "financial_forecast_breakdowns_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_allocation_report"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "financial_forecast_breakdowns_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "financial_forecast_breakdowns_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_by_year"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "financial_forecast_breakdowns_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_summary"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "financial_forecast_breakdowns_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grades"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_forecasts: {
        Row: {
          academic_year_id: string
          created_at: string
          created_by: string | null
          current_revenue: number
          forecast_date: string
          id: string
          name: string
          revenue_gap: number
          target_revenue: number
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          created_by?: string | null
          current_revenue?: number
          forecast_date?: string
          id?: string
          name: string
          revenue_gap: number
          target_revenue: number
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          created_by?: string | null
          current_revenue?: number
          forecast_date?: string
          id?: string
          name?: string
          revenue_gap?: number
          target_revenue?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_forecasts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_forecasts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "financial_forecasts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "financial_forecasts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_occupancy_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "financial_forecasts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_rebookers_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "financial_forecasts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "financial_forecasts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_by_year"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "financial_forecasts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_status_by_academic_year"
            referencedColumns: ["academic_year_id"]
          },
        ]
      }
      housekeeping_status: {
        Row: {
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          assigned_cleaner_id: string | null
          created_at: string
          id: string
          last_cleaned_at: string | null
          next_clean_due_at: string | null
          notes: string | null
          status: string
          studio_id: string
          updated_at: string
        }
        Insert: {
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          assigned_cleaner_id?: string | null
          created_at?: string
          id?: string
          last_cleaned_at?: string | null
          next_clean_due_at?: string | null
          notes?: string | null
          status?: string
          studio_id: string
          updated_at?: string
        }
        Update: {
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          assigned_cleaner_id?: string | null
          created_at?: string
          id?: string
          last_cleaned_at?: string | null
          next_clean_due_at?: string | null
          notes?: string | null
          status?: string
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "housekeeping_status_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: true
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "housekeeping_status_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: true
            referencedRelation: "studio_status_by_academic_year"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "housekeeping_status_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: true
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
        ]
      }
      import_history: {
        Row: {
          completed_at: string | null
          created_at: string
          errors: Json | null
          failed: number | null
          file_name: string | null
          id: string
          import_type: string
          imported_by: string | null
          report: Json | null
          started_at: string
          status: string
          succeeded: number | null
          total_rows: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          errors?: Json | null
          failed?: number | null
          file_name?: string | null
          id?: string
          import_type: string
          imported_by?: string | null
          report?: Json | null
          started_at?: string
          status?: string
          succeeded?: number | null
          total_rows?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          errors?: Json | null
          failed?: number | null
          file_name?: string | null
          id?: string
          import_type?: string
          imported_by?: string | null
          report?: Json | null
          started_at?: string
          status?: string
          succeeded?: number | null
          total_rows?: number | null
        }
        Relationships: []
      }
      maintenance_requests: {
        Row: {
          academic_year_id: string | null
          application_id: string | null
          approval_status: string | null
          approved_at: string | null
          approved_by: string | null
          assigned_to_user_id: string | null
          category: string | null
          communal_area_id: string | null
          completion_note: string | null
          created_at: string
          created_by: string | null
          description: string
          expected_resolve_at: string | null
          id: string
          images: string[] | null
          is_staff_created: boolean | null
          priority: string
          request_type: string
          resolution_notes: string | null
          resolved_at: string | null
          resolved_by: string | null
          sla_due_at: string | null
          status: string
          student_id: string | null
          studio_id: string | null
          title: string
          updated_at: string
          urgency: string | null
        }
        Insert: {
          academic_year_id?: string | null
          application_id?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          assigned_to_user_id?: string | null
          category?: string | null
          communal_area_id?: string | null
          completion_note?: string | null
          created_at?: string
          created_by?: string | null
          description: string
          expected_resolve_at?: string | null
          id?: string
          images?: string[] | null
          is_staff_created?: boolean | null
          priority?: string
          request_type: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sla_due_at?: string | null
          status?: string
          student_id?: string | null
          studio_id?: string | null
          title: string
          updated_at?: string
          urgency?: string | null
        }
        Update: {
          academic_year_id?: string | null
          application_id?: string | null
          approval_status?: string | null
          approved_at?: string | null
          approved_by?: string | null
          assigned_to_user_id?: string | null
          category?: string | null
          communal_area_id?: string | null
          completion_note?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          expected_resolve_at?: string | null
          id?: string
          images?: string[] | null
          is_staff_created?: boolean | null
          priority?: string
          request_type?: string
          resolution_notes?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          sla_due_at?: string | null
          status?: string
          student_id?: string | null
          studio_id?: string | null
          title?: string
          updated_at?: string
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "maintenance_requests_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "maintenance_requests_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "maintenance_requests_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_occupancy_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "maintenance_requests_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_rebookers_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "maintenance_requests_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "maintenance_requests_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_by_year"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "maintenance_requests_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_status_by_academic_year"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "maintenance_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "maintenance_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "maintenance_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "deposit_installment_breakdown"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "maintenance_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "maintenance_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "outstanding_balances_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "maintenance_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "partner_referred_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "maintenance_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "maintenance_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "student_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "upcoming_and_paid_installments_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "maintenance_requests_communal_area_id_fkey"
            columns: ["communal_area_id"]
            isOneToOne: false
            referencedRelation: "communal_areas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "maintenance_requests_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "maintenance_requests_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio_status_by_academic_year"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "maintenance_requests_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
        ]
      }
      manual_payment_requests: {
        Row: {
          amount: number
          application_id: string
          created_at: string
          id: string
          instalment_id: string
          notes: string | null
          payment_method: string
          reference: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          submitted_at: string
          submitted_by: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          application_id: string
          created_at?: string
          id?: string
          instalment_id: string
          notes?: string | null
          payment_method: string
          reference?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          application_id?: string
          created_at?: string
          id?: string
          instalment_id?: string
          notes?: string | null
          payment_method?: string
          reference?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          submitted_at?: string
          submitted_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_payment_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "manual_payment_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "manual_payment_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "deposit_installment_breakdown"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "manual_payment_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "manual_payment_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "outstanding_balances_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "manual_payment_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "partner_referred_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "manual_payment_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "manual_payment_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "student_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_payment_requests_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "upcoming_and_paid_installments_report"
            referencedColumns: ["application_id"]
          },
        ]
      }
      manual_payments: {
        Row: {
          amount: number
          application_id: string | null
          created_at: string
          id: string
          instalment_id: string | null
          invoice_generated_at: string | null
          invoice_number: string | null
          notes: string | null
          payment_date: string
          payment_method: string
          payment_type: string
          receipt_number: string | null
          recorded_by: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          application_id?: string | null
          created_at?: string
          id?: string
          instalment_id?: string | null
          invoice_generated_at?: string | null
          invoice_number?: string | null
          notes?: string | null
          payment_date?: string
          payment_method: string
          payment_type: string
          receipt_number?: string | null
          recorded_by?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          application_id?: string | null
          created_at?: string
          id?: string
          instalment_id?: string | null
          invoice_generated_at?: string | null
          invoice_number?: string | null
          notes?: string | null
          payment_date?: string
          payment_method?: string
          payment_type?: string
          receipt_number?: string | null
          recorded_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manual_payments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "manual_payments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "manual_payments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "deposit_installment_breakdown"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "manual_payments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "manual_payments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "outstanding_balances_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "manual_payments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "partner_referred_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "manual_payments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "manual_payments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "student_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_payments_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "upcoming_and_paid_installments_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "manual_payments_instalment_id_fkey"
            columns: ["instalment_id"]
            isOneToOne: false
            referencedRelation: "contract_payment_schedule"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manual_payments_instalment_id_fkey"
            columns: ["instalment_id"]
            isOneToOne: false
            referencedRelation: "upcoming_and_paid_installments_report"
            referencedColumns: ["installment_id"]
          },
        ]
      }
      marketing_campaign_recipients: {
        Row: {
          campaign_id: string
          contact_id: string | null
          created_at: string
          email: string
          error_message: string | null
          full_name: string | null
          id: string
          resend_message_id: string | null
          send_status: string
          sent_at: string | null
        }
        Insert: {
          campaign_id: string
          contact_id?: string | null
          created_at?: string
          email: string
          error_message?: string | null
          full_name?: string | null
          id?: string
          resend_message_id?: string | null
          send_status?: string
          sent_at?: string | null
        }
        Update: {
          campaign_id?: string
          contact_id?: string | null
          created_at?: string
          email?: string
          error_message?: string | null
          full_name?: string | null
          id?: string
          resend_message_id?: string | null
          send_status?: string
          sent_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaign_recipients_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "marketing_campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketing_campaign_recipients_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "marketing_contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_campaigns: {
        Row: {
          audience_source: string
          created_at: string
          created_by: string | null
          emails_sent: number
          failed_count: number
          id: string
          name: string
          sent_at: string | null
          sent_by: string | null
          status: string
          template_id: string
          total_recipients: number
          updated_at: string
        }
        Insert: {
          audience_source?: string
          created_at?: string
          created_by?: string | null
          emails_sent?: number
          failed_count?: number
          id?: string
          name: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          template_id: string
          total_recipients?: number
          updated_at?: string
        }
        Update: {
          audience_source?: string
          created_at?: string
          created_by?: string | null
          emails_sent?: number
          failed_count?: number
          id?: string
          name?: string
          sent_at?: string | null
          sent_by?: string | null
          status?: string
          template_id?: string
          total_recipients?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketing_campaigns_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "marketing_email_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      marketing_contacts: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          full_name: string | null
          id: string
          is_subscribed: boolean
          source: string
          tags: string[]
          unsubscribed_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          full_name?: string | null
          id?: string
          is_subscribed?: boolean
          source?: string
          tags?: string[]
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_subscribed?: boolean
          source?: string
          tags?: string[]
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      marketing_email_templates: {
        Row: {
          body_html: string
          body_text: string | null
          created_at: string
          created_by: string | null
          id: string
          is_active: boolean
          name: string
          subject: string
          updated_at: string
        }
        Insert: {
          body_html: string
          body_text?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name: string
          subject: string
          updated_at?: string
        }
        Update: {
          body_html?: string
          body_text?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          is_active?: boolean
          name?: string
          subject?: string
          updated_at?: string
        }
        Relationships: []
      }
      media_library: {
        Row: {
          alt_text: string | null
          caption: string | null
          created_at: string | null
          file_name: string
          file_path: string | null
          file_size: number | null
          file_type: string
          file_url: string
          id: string
          mime_type: string | null
          uploaded_by: string | null
          wordpress_attachment_id: string | null
        }
        Insert: {
          alt_text?: string | null
          caption?: string | null
          created_at?: string | null
          file_name: string
          file_path?: string | null
          file_size?: number | null
          file_type: string
          file_url: string
          id?: string
          mime_type?: string | null
          uploaded_by?: string | null
          wordpress_attachment_id?: string | null
        }
        Update: {
          alt_text?: string | null
          caption?: string | null
          created_at?: string | null
          file_name?: string
          file_path?: string | null
          file_size?: number | null
          file_type?: string
          file_url?: string
          id?: string
          mime_type?: string | null
          uploaded_by?: string | null
          wordpress_attachment_id?: string | null
        }
        Relationships: []
      }
      navigation_items: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          location: string
          opens_in_new_tab: boolean
          title: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          location?: string
          opens_in_new_tab?: boolean
          title: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          location?: string
          opens_in_new_tab?: boolean
          title?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          is_starred: boolean
          login_dialog_shown: boolean
          message: string | null
          metadata: Json | null
          notification_type: string
          read_at: string | null
          title: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          is_starred?: boolean
          login_dialog_shown?: boolean
          message?: string | null
          metadata?: Json | null
          notification_type: string
          read_at?: string | null
          title?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          is_starred?: boolean
          login_dialog_shown?: boolean
          message?: string | null
          metadata?: Json | null
          notification_type?: string
          read_at?: string | null
          title?: string | null
          user_id?: string
        }
        Relationships: []
      }
      opening_hours: {
        Row: {
          close_time: string | null
          created_at: string
          day_name: string
          day_order: number
          id: string
          is_closed: boolean
          open_time: string | null
          special_note: string | null
          updated_at: string
        }
        Insert: {
          close_time?: string | null
          created_at?: string
          day_name: string
          day_order: number
          id?: string
          is_closed?: boolean
          open_time?: string | null
          special_note?: string | null
          updated_at?: string
        }
        Update: {
          close_time?: string | null
          created_at?: string
          day_name?: string
          day_order?: number
          id?: string
          is_closed?: boolean
          open_time?: string | null
          special_note?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      ota_bookings: {
        Row: {
          channel: string
          check_in: string
          check_out: string
          commission_amount: number | null
          created_at: string
          created_by: string | null
          currency: string | null
          external_ref: string
          guest_email: string | null
          guest_name: string
          guest_phone: string | null
          id: string
          internal_notes: string | null
          notes: string | null
          number_of_nights: number | null
          price_per_night: number | null
          status: string
          studio_id: string | null
          total_revenue: number | null
          updated_at: string
        }
        Insert: {
          channel: string
          check_in: string
          check_out: string
          commission_amount?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          external_ref: string
          guest_email?: string | null
          guest_name: string
          guest_phone?: string | null
          id?: string
          internal_notes?: string | null
          notes?: string | null
          number_of_nights?: number | null
          price_per_night?: number | null
          status?: string
          studio_id?: string | null
          total_revenue?: number | null
          updated_at?: string
        }
        Update: {
          channel?: string
          check_in?: string
          check_out?: string
          commission_amount?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string | null
          external_ref?: string
          guest_email?: string | null
          guest_name?: string
          guest_phone?: string | null
          id?: string
          internal_notes?: string | null
          notes?: string | null
          number_of_nights?: number | null
          price_per_night?: number | null
          status?: string
          studio_id?: string | null
          total_revenue?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ota_bookings_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "ota_bookings_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio_status_by_academic_year"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "ota_bookings_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
        ]
      }
      ota_expenses: {
        Row: {
          amount: number
          channel: string | null
          created_at: string
          created_by: string
          description: string
          expense_category: string
          expense_date: string
          id: string
          invoice_number: string | null
          notes: string | null
          ota_booking_id: string | null
          updated_at: string
          updated_by: string | null
          vendor_name: string | null
        }
        Insert: {
          amount: number
          channel?: string | null
          created_at?: string
          created_by: string
          description: string
          expense_category: string
          expense_date: string
          id?: string
          invoice_number?: string | null
          notes?: string | null
          ota_booking_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_name?: string | null
        }
        Update: {
          amount?: number
          channel?: string | null
          created_at?: string
          created_by?: string
          description?: string
          expense_category?: string
          expense_date?: string
          id?: string
          invoice_number?: string | null
          notes?: string | null
          ota_booking_id?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ota_expenses_ota_booking_id_fkey"
            columns: ["ota_booking_id"]
            isOneToOne: false
            referencedRelation: "ota_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      ota_payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          notes: string | null
          ota_booking_id: string
          payment_date: string
          payment_type: string
          received_from: string
          recorded_by: string
          reference_number: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          ota_booking_id: string
          payment_date: string
          payment_type?: string
          received_from?: string
          recorded_by: string
          reference_number: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          notes?: string | null
          ota_booking_id?: string
          payment_date?: string
          payment_type?: string
          received_from?: string
          recorded_by?: string
          reference_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ota_payments_ota_booking_id_fkey"
            columns: ["ota_booking_id"]
            isOneToOne: false
            referencedRelation: "ota_bookings"
            referencedColumns: ["id"]
          },
        ]
      }
      out_of_order_records: {
        Row: {
          created_at: string
          created_by: string | null
          end_at: string | null
          expected_end_at: string | null
          id: string
          is_active: boolean
          is_blocking: boolean
          maintenance_request_id: string | null
          reason: string
          start_at: string
          studio_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_at?: string | null
          expected_end_at?: string | null
          id?: string
          is_active?: boolean
          is_blocking?: boolean
          maintenance_request_id?: string | null
          reason: string
          start_at?: string
          studio_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_at?: string | null
          expected_end_at?: string | null
          id?: string
          is_active?: boolean
          is_blocking?: boolean
          maintenance_request_id?: string | null
          reason?: string
          start_at?: string
          studio_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "out_of_order_records_maintenance_request_id_fkey"
            columns: ["maintenance_request_id"]
            isOneToOne: false
            referencedRelation: "maintenance_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "out_of_order_records_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "out_of_order_records_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio_status_by_academic_year"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "out_of_order_records_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
        ]
      }
      partner_referrals: {
        Row: {
          application_id: string
          commission_amount: number
          commission_percentage: number
          commission_status: string
          created_at: string
          id: string
          notes: string | null
          paid_at: string | null
          paid_by: string | null
          partner_id: string
          referral_code: string | null
          total_contract_value: number
          updated_at: string
        }
        Insert: {
          application_id: string
          commission_amount: number
          commission_percentage: number
          commission_status?: string
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          partner_id: string
          referral_code?: string | null
          total_contract_value: number
          updated_at?: string
        }
        Update: {
          application_id?: string
          commission_amount?: number
          commission_percentage?: number
          commission_status?: string
          created_at?: string
          id?: string
          notes?: string | null
          paid_at?: string | null
          paid_by?: string | null
          partner_id?: string
          referral_code?: string | null
          total_contract_value?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "partner_referrals_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "accounts_receivable_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "partner_referrals_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "partner_referrals_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "deposit_installment_breakdown"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "partner_referrals_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "fully_paid_students"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "partner_referrals_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "outstanding_balances_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "partner_referrals_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "partner_referred_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "partner_referrals_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "partner_referrals_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "student_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "partner_referrals_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: true
            referencedRelation: "upcoming_and_paid_installments_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "partner_referrals_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      partners: {
        Row: {
          commission_percentage: number
          contact_email: string | null
          contact_name: string | null
          contact_phone: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          notes: string | null
          referral_code: string | null
          updated_at: string
        }
        Insert: {
          commission_percentage?: number
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          referral_code?: string | null
          updated_at?: string
        }
        Update: {
          commission_percentage?: number
          contact_email?: string | null
          contact_name?: string | null
          contact_phone?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          referral_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      payment_plan_installments: {
        Row: {
          amount_type: Database["public"]["Enums"]["payment_amount_type"]
          amount_value: number
          created_at: string
          due_date: string | null
          due_date_offset_days: number | null
          id: string
          label: string | null
          payment_plan_id: string
          sequence: number
          updated_at: string
        }
        Insert: {
          amount_type?: Database["public"]["Enums"]["payment_amount_type"]
          amount_value: number
          created_at?: string
          due_date?: string | null
          due_date_offset_days?: number | null
          id?: string
          label?: string | null
          payment_plan_id: string
          sequence: number
          updated_at?: string
        }
        Update: {
          amount_type?: Database["public"]["Enums"]["payment_amount_type"]
          amount_value?: number
          created_at?: string
          due_date?: string | null
          due_date_offset_days?: number | null
          id?: string
          label?: string | null
          payment_plan_id?: string
          sequence?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_plan_installments_payment_plan_id_fkey"
            columns: ["payment_plan_id"]
            isOneToOne: false
            referencedRelation: "payment_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_plans: {
        Row: {
          academic_year_id: string
          created_at: string
          deposit_amount: number | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          source_payment_plan_id: string | null
          student_application_id: string | null
          updated_at: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          deposit_amount?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          source_payment_plan_id?: string | null
          student_application_id?: string | null
          updated_at?: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          deposit_amount?: number | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          source_payment_plan_id?: string | null
          student_application_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_plans_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "payment_plans_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "payment_plans_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_occupancy_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "payment_plans_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_rebookers_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "payment_plans_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "payment_plans_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_by_year"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "payment_plans_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_status_by_academic_year"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "payment_plans_source_payment_plan_id_fkey"
            columns: ["source_payment_plan_id"]
            isOneToOne: false
            referencedRelation: "payment_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_student_application_id_fkey"
            columns: ["student_application_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "payment_plans_student_application_id_fkey"
            columns: ["student_application_id"]
            isOneToOne: false
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "payment_plans_student_application_id_fkey"
            columns: ["student_application_id"]
            isOneToOne: false
            referencedRelation: "deposit_installment_breakdown"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "payment_plans_student_application_id_fkey"
            columns: ["student_application_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "payment_plans_student_application_id_fkey"
            columns: ["student_application_id"]
            isOneToOne: false
            referencedRelation: "outstanding_balances_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "payment_plans_student_application_id_fkey"
            columns: ["student_application_id"]
            isOneToOne: false
            referencedRelation: "partner_referred_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "payment_plans_student_application_id_fkey"
            columns: ["student_application_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "payment_plans_student_application_id_fkey"
            columns: ["student_application_id"]
            isOneToOne: false
            referencedRelation: "student_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_plans_student_application_id_fkey"
            columns: ["student_application_id"]
            isOneToOne: false
            referencedRelation: "upcoming_and_paid_installments_report"
            referencedColumns: ["application_id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          first_name: string | null
          id: string
          last_name: string | null
          partner_id: string | null
          phone: string | null
          role: string
          staff_subrole: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          id: string
          last_name?: string | null
          partner_id?: string | null
          phone?: string | null
          role?: string
          staff_subrole?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          partner_id?: string | null
          phone?: string | null
          role?: string
          staff_subrole?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_partner_id_fkey"
            columns: ["partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
        ]
      }
      refunds: {
        Row: {
          amount_gbp: number | null
          amount_pence: number
          application_id: string | null
          created_at: string
          id: string
          manual_refund_reference: string | null
          payment_intent_id: string
          processed_at: string
          reason: string | null
          refund_source: string | null
          refunded_by: string | null
          status: string
          stripe_refund_id: string | null
          student_id: string
          updated_at: string
        }
        Insert: {
          amount_gbp?: number | null
          amount_pence: number
          application_id?: string | null
          created_at?: string
          id?: string
          manual_refund_reference?: string | null
          payment_intent_id: string
          processed_at?: string
          reason?: string | null
          refund_source?: string | null
          refunded_by?: string | null
          status?: string
          stripe_refund_id?: string | null
          student_id: string
          updated_at?: string
        }
        Update: {
          amount_gbp?: number | null
          amount_pence?: number
          application_id?: string | null
          created_at?: string
          id?: string
          manual_refund_reference?: string | null
          payment_intent_id?: string
          processed_at?: string
          reason?: string | null
          refund_source?: string | null
          refunded_by?: string | null
          status?: string
          stripe_refund_id?: string | null
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "refunds_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "refunds_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "deposit_installment_breakdown"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "refunds_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "refunds_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "outstanding_balances_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "refunds_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "partner_referred_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "refunds_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "refunds_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "student_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "upcoming_and_paid_installments_report"
            referencedColumns: ["application_id"]
          },
        ]
      }
      route_permissions: {
        Row: {
          allowed: boolean
          created_at: string
          id: string
          role: string
          route_name: string
          route_path: string
          updated_at: string
        }
        Insert: {
          allowed?: boolean
          created_at?: string
          id?: string
          role: string
          route_name: string
          route_path: string
          updated_at?: string
        }
        Update: {
          allowed?: boolean
          created_at?: string
          id?: string
          role?: string
          route_name?: string
          route_path?: string
          updated_at?: string
        }
        Relationships: []
      }
      seo_pages: {
        Row: {
          canonical_url: string | null
          created_at: string | null
          focus_keyword: string | null
          id: string
          meta_description: string | null
          meta_title: string | null
          og_description: string | null
          og_image_alt: string | null
          og_image_url: string | null
          og_title: string | null
          page_path: string
          page_type: string
          robots_meta: string | null
          schema_json: Json | null
          twitter_description: string | null
          twitter_image_alt: string | null
          twitter_image_url: string | null
          twitter_title: string | null
          updated_at: string | null
        }
        Insert: {
          canonical_url?: string | null
          created_at?: string | null
          focus_keyword?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          og_description?: string | null
          og_image_alt?: string | null
          og_image_url?: string | null
          og_title?: string | null
          page_path: string
          page_type?: string
          robots_meta?: string | null
          schema_json?: Json | null
          twitter_description?: string | null
          twitter_image_alt?: string | null
          twitter_image_url?: string | null
          twitter_title?: string | null
          updated_at?: string | null
        }
        Update: {
          canonical_url?: string | null
          created_at?: string | null
          focus_keyword?: string | null
          id?: string
          meta_description?: string | null
          meta_title?: string | null
          og_description?: string | null
          og_image_alt?: string | null
          og_image_url?: string | null
          og_title?: string | null
          page_path?: string
          page_type?: string
          robots_meta?: string | null
          schema_json?: Json | null
          twitter_description?: string | null
          twitter_image_alt?: string | null
          twitter_image_url?: string | null
          twitter_title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      social_media_settings: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_enabled: boolean
          platform: string
          updated_at: string
          url: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_enabled?: boolean
          platform: string
          updated_at?: string
          url?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_enabled?: boolean
          platform?: string
          updated_at?: string
          url?: string | null
        }
        Relationships: []
      }
      staff_activity_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: unknown
          payload: Json | null
          staff_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: unknown
          payload?: Json | null
          staff_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: unknown
          payload?: Json | null
          staff_id?: string
        }
        Relationships: []
      }
      stripe_payments: {
        Row: {
          amount: number
          created_at: string
          currency: string
          id: string
          invoice_generated_at: string | null
          invoice_number: string | null
          metadata: Json | null
          payment_plan_id: string | null
          payment_type: string
          status: string
          stripe_customer_id: string | null
          stripe_payment_intent_id: string
          student_application_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          id?: string
          invoice_generated_at?: string | null
          invoice_number?: string | null
          metadata?: Json | null
          payment_plan_id?: string | null
          payment_type: string
          status: string
          stripe_customer_id?: string | null
          stripe_payment_intent_id: string
          student_application_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          id?: string
          invoice_generated_at?: string | null
          invoice_number?: string | null
          metadata?: Json | null
          payment_plan_id?: string | null
          payment_type?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_payment_intent_id?: string
          student_application_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "stripe_payments_payment_plan_id_fkey"
            columns: ["payment_plan_id"]
            isOneToOne: false
            referencedRelation: "payment_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stripe_payments_student_application_id_fkey"
            columns: ["student_application_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "stripe_payments_student_application_id_fkey"
            columns: ["student_application_id"]
            isOneToOne: false
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "stripe_payments_student_application_id_fkey"
            columns: ["student_application_id"]
            isOneToOne: false
            referencedRelation: "deposit_installment_breakdown"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "stripe_payments_student_application_id_fkey"
            columns: ["student_application_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "stripe_payments_student_application_id_fkey"
            columns: ["student_application_id"]
            isOneToOne: false
            referencedRelation: "outstanding_balances_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "stripe_payments_student_application_id_fkey"
            columns: ["student_application_id"]
            isOneToOne: false
            referencedRelation: "partner_referred_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "stripe_payments_student_application_id_fkey"
            columns: ["student_application_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "stripe_payments_student_application_id_fkey"
            columns: ["student_application_id"]
            isOneToOne: false
            referencedRelation: "student_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stripe_payments_student_application_id_fkey"
            columns: ["student_application_id"]
            isOneToOne: false
            referencedRelation: "upcoming_and_paid_installments_report"
            referencedColumns: ["application_id"]
          },
        ]
      }
      student_application_steps: {
        Row: {
          application_id: string
          created_at: string
          id: string
          is_complete: boolean
          payload: Json
          step_number: number
          updated_at: string
        }
        Insert: {
          application_id: string
          created_at?: string
          id?: string
          is_complete?: boolean
          payload?: Json
          step_number: number
          updated_at?: string
        }
        Update: {
          application_id?: string
          created_at?: string
          id?: string
          is_complete?: boolean
          payload?: Json
          step_number?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_application_steps_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_application_steps_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_application_steps_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "deposit_installment_breakdown"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_application_steps_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_application_steps_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "outstanding_balances_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_application_steps_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "partner_referred_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_application_steps_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_application_steps_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "student_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_application_steps_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "upcoming_and_paid_installments_report"
            referencedColumns: ["application_id"]
          },
        ]
      }
      student_applications: {
        Row: {
          actual_check_in_date: string | null
          actual_check_out_date: string | null
          assigned_studio_id: string | null
          booking_source: string | null
          cancelled_at: string | null
          cashback_amount: number | null
          check_in_notes: string | null
          check_out_notes: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          checked_out_at: string | null
          checked_out_by: string | null
          contract_id: string
          created_at: string
          deposit_payment_intent_id: string | null
          discount_amount: number | null
          extension_of_application_id: string | null
          id: string
          internal_notes: string | null
          is_rebooking: boolean | null
          previous_application_id: string | null
          rebooking_approved_at: string | null
          rebooking_approved_by: string | null
          rebooking_reason: string | null
          referred_by_partner_id: string | null
          requested_contract_end: string | null
          requested_contract_start: string | null
          reserved_studio_expires_at: string | null
          selected_payment_plan_id: string | null
          signature_mode: string | null
          status: Database["public"]["Enums"]["application_status"]
          stripe_customer_id: string | null
          student_id: string
          studio_grade_id: string
          submitted_at: string | null
          total_contract_value: number | null
          updated_at: string
          validated_referral_code: string | null
        }
        Insert: {
          actual_check_in_date?: string | null
          actual_check_out_date?: string | null
          assigned_studio_id?: string | null
          booking_source?: string | null
          cancelled_at?: string | null
          cashback_amount?: number | null
          check_in_notes?: string | null
          check_out_notes?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          checked_out_at?: string | null
          checked_out_by?: string | null
          contract_id: string
          created_at?: string
          deposit_payment_intent_id?: string | null
          discount_amount?: number | null
          extension_of_application_id?: string | null
          id?: string
          internal_notes?: string | null
          is_rebooking?: boolean | null
          previous_application_id?: string | null
          rebooking_approved_at?: string | null
          rebooking_approved_by?: string | null
          rebooking_reason?: string | null
          referred_by_partner_id?: string | null
          requested_contract_end?: string | null
          requested_contract_start?: string | null
          reserved_studio_expires_at?: string | null
          selected_payment_plan_id?: string | null
          signature_mode?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          stripe_customer_id?: string | null
          student_id: string
          studio_grade_id: string
          submitted_at?: string | null
          total_contract_value?: number | null
          updated_at?: string
          validated_referral_code?: string | null
        }
        Update: {
          actual_check_in_date?: string | null
          actual_check_out_date?: string | null
          assigned_studio_id?: string | null
          booking_source?: string | null
          cancelled_at?: string | null
          cashback_amount?: number | null
          check_in_notes?: string | null
          check_out_notes?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          checked_out_at?: string | null
          checked_out_by?: string | null
          contract_id?: string
          created_at?: string
          deposit_payment_intent_id?: string | null
          discount_amount?: number | null
          extension_of_application_id?: string | null
          id?: string
          internal_notes?: string | null
          is_rebooking?: boolean | null
          previous_application_id?: string | null
          rebooking_approved_at?: string | null
          rebooking_approved_by?: string | null
          rebooking_reason?: string | null
          referred_by_partner_id?: string | null
          requested_contract_end?: string | null
          requested_contract_start?: string | null
          reserved_studio_expires_at?: string | null
          selected_payment_plan_id?: string | null
          signature_mode?: string | null
          status?: Database["public"]["Enums"]["application_status"]
          stripe_customer_id?: string | null
          student_id?: string
          studio_grade_id?: string
          submitted_at?: string | null
          total_contract_value?: number | null
          updated_at?: string
          validated_referral_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_applications_assigned_studio_id_fkey"
            columns: ["assigned_studio_id"]
            isOneToOne: false
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "student_applications_assigned_studio_id_fkey"
            columns: ["assigned_studio_id"]
            isOneToOne: false
            referencedRelation: "studio_status_by_academic_year"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "student_applications_assigned_studio_id_fkey"
            columns: ["assigned_studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_applications_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "student_applications_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "contracts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_applications_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "student_applications_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "student_applications_contract_id_fkey"
            columns: ["contract_id"]
            isOneToOne: false
            referencedRelation: "upcoming_and_paid_installments_report"
            referencedColumns: ["contract_id"]
          },
          {
            foreignKeyName: "student_applications_extension_of_application_id_fkey"
            columns: ["extension_of_application_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_applications_extension_of_application_id_fkey"
            columns: ["extension_of_application_id"]
            isOneToOne: false
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_applications_extension_of_application_id_fkey"
            columns: ["extension_of_application_id"]
            isOneToOne: false
            referencedRelation: "deposit_installment_breakdown"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_applications_extension_of_application_id_fkey"
            columns: ["extension_of_application_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_applications_extension_of_application_id_fkey"
            columns: ["extension_of_application_id"]
            isOneToOne: false
            referencedRelation: "outstanding_balances_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_applications_extension_of_application_id_fkey"
            columns: ["extension_of_application_id"]
            isOneToOne: false
            referencedRelation: "partner_referred_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_applications_extension_of_application_id_fkey"
            columns: ["extension_of_application_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_applications_extension_of_application_id_fkey"
            columns: ["extension_of_application_id"]
            isOneToOne: false
            referencedRelation: "student_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_applications_extension_of_application_id_fkey"
            columns: ["extension_of_application_id"]
            isOneToOne: false
            referencedRelation: "upcoming_and_paid_installments_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_applications_previous_application_id_fkey"
            columns: ["previous_application_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_applications_previous_application_id_fkey"
            columns: ["previous_application_id"]
            isOneToOne: false
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_applications_previous_application_id_fkey"
            columns: ["previous_application_id"]
            isOneToOne: false
            referencedRelation: "deposit_installment_breakdown"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_applications_previous_application_id_fkey"
            columns: ["previous_application_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_applications_previous_application_id_fkey"
            columns: ["previous_application_id"]
            isOneToOne: false
            referencedRelation: "outstanding_balances_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_applications_previous_application_id_fkey"
            columns: ["previous_application_id"]
            isOneToOne: false
            referencedRelation: "partner_referred_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_applications_previous_application_id_fkey"
            columns: ["previous_application_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_applications_previous_application_id_fkey"
            columns: ["previous_application_id"]
            isOneToOne: false
            referencedRelation: "student_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_applications_previous_application_id_fkey"
            columns: ["previous_application_id"]
            isOneToOne: false
            referencedRelation: "upcoming_and_paid_installments_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_applications_referred_by_partner_id_fkey"
            columns: ["referred_by_partner_id"]
            isOneToOne: false
            referencedRelation: "partners"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_applications_selected_payment_plan_id_fkey"
            columns: ["selected_payment_plan_id"]
            isOneToOne: false
            referencedRelation: "payment_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_applications_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "sales_occupancy_monthly"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "student_applications_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_allocation_report"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "student_applications_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "student_applications_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_by_year"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "student_applications_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_summary"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "student_applications_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grades"
            referencedColumns: ["id"]
          },
        ]
      }
      student_documents: {
        Row: {
          application_id: string
          created_at: string
          document_type: string
          id: string
          mime_type: string | null
          notes: string | null
          original_filename: string | null
          status: Database["public"]["Enums"]["document_status"]
          storage_path: string
          updated_at: string
          uploaded_at: string
          uploaded_by: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          application_id: string
          created_at?: string
          document_type: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          original_filename?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          storage_path: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          application_id?: string
          created_at?: string
          document_type?: string
          id?: string
          mime_type?: string | null
          notes?: string | null
          original_filename?: string | null
          status?: Database["public"]["Enums"]["document_status"]
          storage_path?: string
          updated_at?: string
          uploaded_at?: string
          uploaded_by?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "student_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "deposit_installment_breakdown"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "outstanding_balances_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "partner_referred_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "student_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_documents_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "upcoming_and_paid_installments_report"
            referencedColumns: ["application_id"]
          },
        ]
      }
      student_signatures: {
        Row: {
          application_id: string
          created_at: string
          id: string
          metadata: Json | null
          signature_external_id: string | null
          signature_type: Database["public"]["Enums"]["signature_type"]
          signed_at: string
          storage_path: string
          updated_at: string
        }
        Insert: {
          application_id: string
          created_at?: string
          id?: string
          metadata?: Json | null
          signature_external_id?: string | null
          signature_type: Database["public"]["Enums"]["signature_type"]
          signed_at?: string
          storage_path: string
          updated_at?: string
        }
        Update: {
          application_id?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          signature_external_id?: string | null
          signature_type?: Database["public"]["Enums"]["signature_type"]
          signed_at?: string
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "student_signatures_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "accounts_receivable_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_signatures_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_signatures_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "deposit_installment_breakdown"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_signatures_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_signatures_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "outstanding_balances_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_signatures_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "partner_referred_applications"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_signatures_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["application_id"]
          },
          {
            foreignKeyName: "student_signatures_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "student_applications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "student_signatures_application_id_fkey"
            columns: ["application_id"]
            isOneToOne: false
            referencedRelation: "upcoming_and_paid_installments_report"
            referencedColumns: ["application_id"]
          },
        ]
      }
      studio_allocation_history: {
        Row: {
          changed_by: string | null
          created_at: string
          ends_at: string | null
          id: string
          impacted_ota_bookings_count: number
          metadata: Json | null
          new_allocation: string | null
          policy: string | null
          previous_allocation: string | null
          reason: string | null
          starts_at: string
          studio_id: string
        }
        Insert: {
          changed_by?: string | null
          created_at?: string
          ends_at?: string | null
          id?: string
          impacted_ota_bookings_count?: number
          metadata?: Json | null
          new_allocation?: string | null
          policy?: string | null
          previous_allocation?: string | null
          reason?: string | null
          starts_at?: string
          studio_id: string
        }
        Update: {
          changed_by?: string | null
          created_at?: string
          ends_at?: string | null
          id?: string
          impacted_ota_bookings_count?: number
          metadata?: Json | null
          new_allocation?: string | null
          policy?: string | null
          previous_allocation?: string | null
          reason?: string | null
          starts_at?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_allocation_history_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "studio_allocation_history_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio_status_by_academic_year"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "studio_allocation_history_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_grade_amenities: {
        Row: {
          amenity_id: string
          created_at: string
          description_override: string | null
          id: string
          studio_grade_id: string
          updated_at: string
        }
        Insert: {
          amenity_id: string
          created_at?: string
          description_override?: string | null
          id?: string
          studio_grade_id: string
          updated_at?: string
        }
        Update: {
          amenity_id?: string
          created_at?: string
          description_override?: string | null
          id?: string
          studio_grade_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_grade_amenities_amenity_id_fkey"
            columns: ["amenity_id"]
            isOneToOne: false
            referencedRelation: "amenities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_grade_amenities_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "sales_occupancy_monthly"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studio_grade_amenities_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_allocation_report"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studio_grade_amenities_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studio_grade_amenities_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_by_year"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studio_grade_amenities_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_summary"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studio_grade_amenities_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grades"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_grade_banners: {
        Row: {
          created_at: string
          display_order: number
          id: string
          studio_grade_id: string
          text: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          studio_grade_id: string
          text: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          studio_grade_id?: string
          text?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_grade_banners_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "sales_occupancy_monthly"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studio_grade_banners_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_allocation_report"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studio_grade_banners_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studio_grade_banners_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_by_year"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studio_grade_banners_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_summary"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studio_grade_banners_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grades"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_grade_media: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_hero: boolean
          media_type: string
          position: number
          studio_grade_id: string
          title: string | null
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_hero?: boolean
          media_type: string
          position?: number
          studio_grade_id: string
          title?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_hero?: boolean
          media_type?: string
          position?: number
          studio_grade_id?: string
          title?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_grade_media_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "sales_occupancy_monthly"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studio_grade_media_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_allocation_report"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studio_grade_media_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studio_grade_media_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_by_year"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studio_grade_media_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_summary"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studio_grade_media_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grades"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_grade_prices: {
        Row: {
          academic_year_id: string
          created_at: string
          currency_code: string
          deposit_amount_override: number | null
          id: string
          is_active: boolean
          studio_grade_id: string
          updated_at: string
          weekly_price: number
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          currency_code?: string
          deposit_amount_override?: number | null
          id?: string
          is_active?: boolean
          studio_grade_id: string
          updated_at?: string
          weekly_price: number
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          currency_code?: string
          deposit_amount_override?: number | null
          id?: string
          is_active?: boolean
          studio_grade_id?: string
          updated_at?: string
          weekly_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "studio_grade_prices_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_grade_prices_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "studio_grade_prices_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "studio_grade_prices_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_occupancy_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "studio_grade_prices_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_rebookers_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "studio_grade_prices_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "studio_grade_prices_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_by_year"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "studio_grade_prices_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_status_by_academic_year"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "studio_grade_prices_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "sales_occupancy_monthly"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studio_grade_prices_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_allocation_report"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studio_grade_prices_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studio_grade_prices_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_by_year"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studio_grade_prices_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_summary"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studio_grade_prices_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grades"
            referencedColumns: ["id"]
          },
        ]
      }
      studio_grades: {
        Row: {
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          long_description: string | null
          max_occupancy: number | null
          name: string
          promo_video_url: string | null
          short_description: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          long_description?: string | null
          max_occupancy?: number | null
          name: string
          promo_video_url?: string | null
          short_description?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          long_description?: string | null
          max_occupancy?: number | null
          name?: string
          promo_video_url?: string | null
          short_description?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      studio_maintenance_by_academic_year: {
        Row: {
          academic_year_id: string
          created_at: string
          studio_id: string
        }
        Insert: {
          academic_year_id: string
          created_at?: string
          studio_id: string
        }
        Update: {
          academic_year_id?: string
          created_at?: string
          studio_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "studio_maintenance_by_academic_year_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "studio_maintenance_by_academic_year_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "studio_maintenance_by_academic_year_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "studio_maintenance_by_academic_year_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_occupancy_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "studio_maintenance_by_academic_year_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_rebookers_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "studio_maintenance_by_academic_year_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "studio_maintenance_by_academic_year_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_by_year"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "studio_maintenance_by_academic_year_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_status_by_academic_year"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "studio_maintenance_by_academic_year_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "studio_maintenance_by_academic_year_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studio_status_by_academic_year"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "studio_maintenance_by_academic_year_studio_id_fkey"
            columns: ["studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
        ]
      }
      studios: {
        Row: {
          allocation: string | null
          created_at: string
          floor: string | null
          id: string
          is_active: boolean
          reservation_expires_at: string | null
          status: Database["public"]["Enums"]["studio_status"]
          studio_grade_id: string
          studio_number: string
          updated_at: string
        }
        Insert: {
          allocation?: string | null
          created_at?: string
          floor?: string | null
          id?: string
          is_active?: boolean
          reservation_expires_at?: string | null
          status?: Database["public"]["Enums"]["studio_status"]
          studio_grade_id: string
          studio_number: string
          updated_at?: string
        }
        Update: {
          allocation?: string | null
          created_at?: string
          floor?: string | null
          id?: string
          is_active?: boolean
          reservation_expires_at?: string | null
          status?: Database["public"]["Enums"]["studio_status"]
          studio_grade_id?: string
          studio_number?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "studios_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "sales_occupancy_monthly"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studios_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_allocation_report"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studios_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studios_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_by_year"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studios_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_summary"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studios_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grades"
            referencedColumns: ["id"]
          },
        ]
      }
      utility_payments: {
        Row: {
          academic_year_id: string
          amount: number
          created_at: string
          created_by: string
          description: string
          expense_category: string
          id: string
          invoice_number: string | null
          notes: string | null
          payment_date: string
          receipt_path: string | null
          updated_at: string
          updated_by: string | null
          vendor_name: string | null
        }
        Insert: {
          academic_year_id: string
          amount: number
          created_at?: string
          created_by: string
          description: string
          expense_category: string
          id?: string
          invoice_number?: string | null
          notes?: string | null
          payment_date: string
          receipt_path?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_name?: string | null
        }
        Update: {
          academic_year_id?: string
          amount?: number
          created_at?: string
          created_by?: string
          description?: string
          expense_category?: string
          id?: string
          invoice_number?: string | null
          notes?: string | null
          payment_date?: string
          receipt_path?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "utility_payments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "utility_payments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "utility_payments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "utility_payments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_occupancy_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "utility_payments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_rebookers_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "utility_payments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "utility_payments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_by_year"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "utility_payments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_status_by_academic_year"
            referencedColumns: ["academic_year_id"]
          },
        ]
      }
      website_activity_logs: {
        Row: {
          action: string
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          ip_address: unknown
          metadata: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      website_amenities: {
        Row: {
          created_at: string
          display_order: number
          horizontal_image_url: string | null
          id: string
          is_active: boolean
          short_description: string | null
          title: string
          updated_at: string
          vertical_image_url: string | null
        }
        Insert: {
          created_at?: string
          display_order?: number
          horizontal_image_url?: string | null
          id?: string
          is_active?: boolean
          short_description?: string | null
          title: string
          updated_at?: string
          vertical_image_url?: string | null
        }
        Update: {
          created_at?: string
          display_order?: number
          horizontal_image_url?: string | null
          id?: string
          is_active?: boolean
          short_description?: string | null
          title?: string
          updated_at?: string
          vertical_image_url?: string | null
        }
        Relationships: []
      }
      website_amenity_photos: {
        Row: {
          amenity_id: string
          created_at: string
          id: string
          position: number
          url: string
        }
        Insert: {
          amenity_id: string
          created_at?: string
          id?: string
          position?: number
          url: string
        }
        Update: {
          amenity_id?: string
          created_at?: string
          id?: string
          position?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_amenity_photos_amenity_id_fkey"
            columns: ["amenity_id"]
            isOneToOne: false
            referencedRelation: "website_amenities"
            referencedColumns: ["id"]
          },
        ]
      }
      website_analytics_events: {
        Row: {
          created_at: string
          element_id: string | null
          element_text: string | null
          event_name: string
          id: string
          ip_address: unknown
          metadata: Json | null
          page_path: string
          session_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          element_id?: string | null
          element_text?: string | null
          event_name: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          page_path: string
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          element_id?: string | null
          element_text?: string | null
          event_name?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          page_path?: string
          session_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      website_analytics_page_views: {
        Row: {
          created_at: string
          id: string
          page_path: string
          referrer: string | null
          session_id: string | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          page_path: string
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          page_path?: string
          referrer?: string | null
          session_id?: string | null
          user_agent?: string | null
        }
        Relationships: []
      }
      website_analytics_settings: {
        Row: {
          created_at: string
          google_analytics_id: string | null
          google_tag_manager_id: string | null
          id: string
          is_active: boolean
          last_sync_at: string | null
          sync_error: string | null
          sync_status: string | null
          updated_at: string
          view_id: string | null
        }
        Insert: {
          created_at?: string
          google_analytics_id?: string | null
          google_tag_manager_id?: string | null
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          sync_error?: string | null
          sync_status?: string | null
          updated_at?: string
          view_id?: string | null
        }
        Update: {
          created_at?: string
          google_analytics_id?: string | null
          google_tag_manager_id?: string | null
          id?: string
          is_active?: boolean
          last_sync_at?: string | null
          sync_error?: string | null
          sync_status?: string | null
          updated_at?: string
          view_id?: string | null
        }
        Relationships: []
      }
      website_analytics_tags: {
        Row: {
          category: string | null
          created_at: string
          element_selector: string
          event_name: string
          id: string
          is_active: boolean
          tag_name: string
          updated_at: string
        }
        Insert: {
          category?: string | null
          created_at?: string
          element_selector: string
          event_name?: string
          id?: string
          is_active?: boolean
          tag_name: string
          updated_at?: string
        }
        Update: {
          category?: string | null
          created_at?: string
          element_selector?: string
          event_name?: string
          id?: string
          is_active?: boolean
          tag_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      website_faqs: {
        Row: {
          answer: string
          category: string | null
          created_at: string
          display_order: number
          helpful_count: number
          id: string
          is_active: boolean
          question: string
          updated_at: string
        }
        Insert: {
          answer: string
          category?: string | null
          created_at?: string
          display_order?: number
          helpful_count?: number
          id?: string
          is_active?: boolean
          question: string
          updated_at?: string
        }
        Update: {
          answer?: string
          category?: string | null
          created_at?: string
          display_order?: number
          helpful_count?: number
          id?: string
          is_active?: boolean
          question?: string
          updated_at?: string
        }
        Relationships: []
      }
      website_form_submissions: {
        Row: {
          assigned_to: string | null
          created_at: string
          email: string
          form_type: string
          id: string
          ip_address: unknown
          message: string | null
          metadata: Json | null
          name: string
          notes: string | null
          phone: string | null
          read_at: string | null
          read_by: string | null
          replied_at: string | null
          replied_by: string | null
          status: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          email: string
          form_type: string
          id?: string
          ip_address?: unknown
          message?: string | null
          metadata?: Json | null
          name: string
          notes?: string | null
          phone?: string | null
          read_at?: string | null
          read_by?: string | null
          replied_at?: string | null
          replied_by?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          email?: string
          form_type?: string
          id?: string
          ip_address?: unknown
          message?: string | null
          metadata?: Json | null
          name?: string
          notes?: string | null
          phone?: string | null
          read_at?: string | null
          read_by?: string | null
          replied_at?: string | null
          replied_by?: string | null
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      website_image_slots: {
        Row: {
          alt_text: string | null
          display_name: string
          fallback_url: string | null
          file_url: string | null
          id: string
          slot_key: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          alt_text?: string | null
          display_name: string
          fallback_url?: string | null
          file_url?: string | null
          id?: string
          slot_key: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          alt_text?: string | null
          display_name?: string
          fallback_url?: string | null
          file_url?: string | null
          id?: string
          slot_key?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      website_landing_hero_slides: {
        Row: {
          created_at: string
          cta_label: string | null
          cta_tracking_key: string | null
          cta_type: string
          desktop_image_alt: string | null
          desktop_image_url: string | null
          h1_image_alt: string | null
          h1_image_scale: number | null
          h1_image_scale_mobile: number | null
          h1_image_url: string | null
          homepage_order: number | null
          id: string
          is_active: boolean
          landing_page_id: string
          mobile_image_alt: string | null
          mobile_image_url: string | null
          show_on_homepage: boolean
          sort_order: number
          subtitle: string | null
          subtitle_link_url: string | null
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          cta_label?: string | null
          cta_tracking_key?: string | null
          cta_type?: string
          desktop_image_alt?: string | null
          desktop_image_url?: string | null
          h1_image_alt?: string | null
          h1_image_scale?: number | null
          h1_image_scale_mobile?: number | null
          h1_image_url?: string | null
          homepage_order?: number | null
          id?: string
          is_active?: boolean
          landing_page_id: string
          mobile_image_alt?: string | null
          mobile_image_url?: string | null
          show_on_homepage?: boolean
          sort_order?: number
          subtitle?: string | null
          subtitle_link_url?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          cta_label?: string | null
          cta_tracking_key?: string | null
          cta_type?: string
          desktop_image_alt?: string | null
          desktop_image_url?: string | null
          h1_image_alt?: string | null
          h1_image_scale?: number | null
          h1_image_scale_mobile?: number | null
          h1_image_url?: string | null
          homepage_order?: number | null
          id?: string
          is_active?: boolean
          landing_page_id?: string
          mobile_image_alt?: string | null
          mobile_image_url?: string | null
          show_on_homepage?: boolean
          sort_order?: number
          subtitle?: string | null
          subtitle_link_url?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_landing_hero_slides_landing_page_id_fkey"
            columns: ["landing_page_id"]
            isOneToOne: false
            referencedRelation: "website_landing_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      website_landing_pages: {
        Row: {
          created_at: string
          default_cta_label: string | null
          default_cta_tracking_key: string | null
          default_cta_type: string
          faq_items: Json | null
          google_ads_conversion_id: string | null
          google_ads_conversion_label_lead: string | null
          google_ads_conversion_label_purchase: string | null
          hero_heading: string | null
          hero_subheading: string | null
          id: string
          info_stack_items: Json | null
          is_active: boolean
          meta_pixel_id: string | null
          name: string
          room_grades_description: string | null
          room_grades_heading: string | null
          slug: string
          snapchat_pixel_id: string | null
          tiktok_pixel_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_cta_label?: string | null
          default_cta_tracking_key?: string | null
          default_cta_type?: string
          faq_items?: Json | null
          google_ads_conversion_id?: string | null
          google_ads_conversion_label_lead?: string | null
          google_ads_conversion_label_purchase?: string | null
          hero_heading?: string | null
          hero_subheading?: string | null
          id?: string
          info_stack_items?: Json | null
          is_active?: boolean
          meta_pixel_id?: string | null
          name: string
          room_grades_description?: string | null
          room_grades_heading?: string | null
          slug: string
          snapchat_pixel_id?: string | null
          tiktok_pixel_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_cta_label?: string | null
          default_cta_tracking_key?: string | null
          default_cta_type?: string
          faq_items?: Json | null
          google_ads_conversion_id?: string | null
          google_ads_conversion_label_lead?: string | null
          google_ads_conversion_label_purchase?: string | null
          hero_heading?: string | null
          hero_subheading?: string | null
          id?: string
          info_stack_items?: Json | null
          is_active?: boolean
          meta_pixel_id?: string | null
          name?: string
          room_grades_description?: string | null
          room_grades_heading?: string | null
          slug?: string
          snapchat_pixel_id?: string | null
          tiktok_pixel_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      website_media: {
        Row: {
          cover_image_desktop_url: string | null
          cover_image_mobile_url: string | null
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          media_type: string
          subtitle: string | null
          title: string
          updated_at: string
          video_url: string | null
        }
        Insert: {
          cover_image_desktop_url?: string | null
          cover_image_mobile_url?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          media_type?: string
          subtitle?: string | null
          title: string
          updated_at?: string
          video_url?: string | null
        }
        Update: {
          cover_image_desktop_url?: string | null
          cover_image_mobile_url?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          media_type?: string
          subtitle?: string | null
          title?: string
          updated_at?: string
          video_url?: string | null
        }
        Relationships: []
      }
      website_media_library: {
        Row: {
          alt_text: string | null
          caption: string | null
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          file_type: string
          file_url: string
          folder: string | null
          id: string
          mime_type: string | null
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          alt_text?: string | null
          caption?: string | null
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          file_type?: string
          file_url: string
          folder?: string | null
          id?: string
          mime_type?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          alt_text?: string | null
          caption?: string | null
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          file_type?: string
          file_url?: string
          folder?: string | null
          id?: string
          mime_type?: string | null
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      website_newsletter_settings: {
        Row: {
          button_text: string | null
          created_at: string
          headline: string | null
          id: string
          is_enabled: boolean
          show_after_seconds: number
          show_once_per_day: boolean
          show_once_per_session: boolean
          subheadline: string | null
          success_message: string | null
          updated_at: string
        }
        Insert: {
          button_text?: string | null
          created_at?: string
          headline?: string | null
          id?: string
          is_enabled?: boolean
          show_after_seconds?: number
          show_once_per_day?: boolean
          show_once_per_session?: boolean
          subheadline?: string | null
          success_message?: string | null
          updated_at?: string
        }
        Update: {
          button_text?: string | null
          created_at?: string
          headline?: string | null
          id?: string
          is_enabled?: boolean
          show_after_seconds?: number
          show_once_per_day?: boolean
          show_once_per_session?: boolean
          subheadline?: string | null
          success_message?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      website_newsletter_subscribers: {
        Row: {
          created_at: string
          email: string
          id: string
          source: string | null
          subscribed_at: string
          unsubscribed_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          source?: string | null
          subscribed_at?: string
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          source?: string | null
          subscribed_at?: string
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      website_post_comments: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          author_email: string
          author_name: string
          author_website: string | null
          content: string
          created_at: string
          id: string
          ip_address: unknown
          parent_comment_id: string | null
          post_id: string
          status: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          author_email: string
          author_name: string
          author_website?: string | null
          content: string
          created_at?: string
          id?: string
          ip_address?: unknown
          parent_comment_id?: string | null
          post_id: string
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          author_email?: string
          author_name?: string
          author_website?: string | null
          content?: string
          created_at?: string
          id?: string
          ip_address?: unknown
          parent_comment_id?: string | null
          post_id?: string
          status?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "website_post_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "website_post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "website_post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "blog_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      website_reviews: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          content: string
          created_at: string
          featured: boolean
          helpful_count: number
          id: string
          rating: number
          reviewer_email: string | null
          reviewer_name: string
          status: string
          title: string | null
          updated_at: string
          verified_purchase: boolean
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          content: string
          created_at?: string
          featured?: boolean
          helpful_count?: number
          id?: string
          rating: number
          reviewer_email?: string | null
          reviewer_name: string
          status?: string
          title?: string | null
          updated_at?: string
          verified_purchase?: boolean
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          content?: string
          created_at?: string
          featured?: boolean
          helpful_count?: number
          id?: string
          rating?: number
          reviewer_email?: string | null
          reviewer_name?: string
          status?: string
          title?: string | null
          updated_at?: string
          verified_purchase?: boolean
        }
        Relationships: []
      }
      website_seo_settings: {
        Row: {
          created_at: string
          default_meta_description: string | null
          default_meta_title: string | null
          default_og_image_url: string | null
          google_search_console_verification: string | null
          id: string
          is_active: boolean
          site_name: string
          twitter_handle: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          default_meta_description?: string | null
          default_meta_title?: string | null
          default_og_image_url?: string | null
          google_search_console_verification?: string | null
          id?: string
          is_active?: boolean
          site_name?: string
          twitter_handle?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          default_meta_description?: string | null
          default_meta_title?: string | null
          default_og_image_url?: string | null
          google_search_console_verification?: string | null
          id?: string
          is_active?: boolean
          site_name?: string
          twitter_handle?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      website_studio_grade_features: {
        Row: {
          created_at: string
          display_order: number
          feature_text: string
          id: string
          is_active: boolean
          studio_grade_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          feature_text: string
          id?: string
          is_active?: boolean
          studio_grade_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          feature_text?: string
          id?: string
          is_active?: boolean
          studio_grade_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "website_studio_grade_features_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "sales_occupancy_monthly"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "website_studio_grade_features_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_allocation_report"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "website_studio_grade_features_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "website_studio_grade_features_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_by_year"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "website_studio_grade_features_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_summary"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "website_studio_grade_features_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grades"
            referencedColumns: ["id"]
          },
        ]
      }
      website_testimonials: {
        Row: {
          cover_image_path: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          display_order: number
          id: string
          is_active: boolean
          name: string
          result: string
          updated_at: string
          video_path: string | null
          video_url: string
        }
        Insert: {
          cover_image_path?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name: string
          result: string
          updated_at?: string
          video_path?: string | null
          video_url: string
        }
        Update: {
          cover_image_path?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          display_order?: number
          id?: string
          is_active?: boolean
          name?: string
          result?: string
          updated_at?: string
          video_path?: string | null
          video_url?: string
        }
        Relationships: []
      }
      website_why_us_cards: {
        Row: {
          created_at: string
          description: string
          display_order: number
          icon: string | null
          icon_url: string | null
          id: string
          is_active: boolean
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description: string
          display_order?: number
          icon?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string
          display_order?: number
          icon?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      accounts_receivable_report: {
        Row: {
          academic_year_name: string | null
          adjusted_contract_value: number | null
          application_date: string | null
          application_id: string | null
          application_status:
            | Database["public"]["Enums"]["application_status"]
            | null
          assigned_studio_id: string | null
          cashback_amount: number | null
          contract_end: string | null
          contract_name: string | null
          contract_start: string | null
          discount_amount: number | null
          outstanding_balance: number | null
          payment_plan: string | null
          payment_status: string | null
          student_id: string | null
          student_name: string | null
          studio_grade: string | null
          studio_number: string | null
          total_contract_value: number | null
          total_due: number | null
          total_paid: number | null
        }
        Relationships: [
          {
            foreignKeyName: "student_applications_assigned_studio_id_fkey"
            columns: ["assigned_studio_id"]
            isOneToOne: false
            referencedRelation: "booking_calendar_data"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "student_applications_assigned_studio_id_fkey"
            columns: ["assigned_studio_id"]
            isOneToOne: false
            referencedRelation: "studio_status_by_academic_year"
            referencedColumns: ["studio_id"]
          },
          {
            foreignKeyName: "student_applications_assigned_studio_id_fkey"
            columns: ["assigned_studio_id"]
            isOneToOne: false
            referencedRelation: "studios"
            referencedColumns: ["id"]
          },
        ]
      }
      bank_reconciliation_report: {
        Row: {
          amount_paid: number | null
          contract_name: string | null
          currency: string | null
          entered_by_name: string | null
          entered_by_user_id: string | null
          invoice_generated_at: string | null
          invoice_number: string | null
          manual_entry_notes: string | null
          payment_date: string | null
          payment_id: string | null
          payment_method: string | null
          payment_plan: string | null
          payment_source: string | null
          payment_status: string | null
          payment_type: string | null
          stripe_payment_intent_id: string | null
          student_application_id: string | null
          student_id: string | null
          student_name: string | null
          studio_grade: string | null
        }
        Relationships: []
      }
      booking_calendar_data: {
        Row: {
          academic_year_id: string | null
          academic_year_name: string | null
          actual_check_in_date: string | null
          actual_check_out_date: string | null
          allocation: string | null
          application_created_at: string | null
          application_id: string | null
          application_status: string | null
          cancelled_at: string | null
          check_in_notes: string | null
          check_out_notes: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          checked_out_at: string | null
          checked_out_by: string | null
          contract_end: string | null
          contract_id: string | null
          contract_name: string | null
          contract_start: string | null
          effective_check_in_date: string | null
          effective_check_out_date: string | null
          student_email: string | null
          student_id: string | null
          student_name: string | null
          studio_grade_id: string | null
          studio_grade_name: string | null
          studio_id: string | null
          studio_number: string | null
          studio_status: string | null
          submitted_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_occupancy_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_rebookers_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_by_year"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_status_by_academic_year"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "studios_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "sales_occupancy_monthly"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studios_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_allocation_report"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studios_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studios_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_by_year"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studios_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_summary"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studios_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grades"
            referencedColumns: ["id"]
          },
        ]
      }
      ota_bookings_payment_ledger: {
        Row: {
          amount_due: number | null
          booking_id: string | null
          booking_status: string | null
          channel: string | null
          check_in: string | null
          check_out: string | null
          commission_amount: number | null
          currency: string | null
          external_ref: string | null
          gross_booking_value: number | null
          guest_name: string | null
          last_payment_date: string | null
          number_of_nights: number | null
          payment_count: number | null
          payment_status: string | null
          price_per_night: number | null
          remaining_balance: number | null
          studio_id: string | null
          total_received: number | null
          total_revenue: number | null
        }
        Relationships: []
      }
      debug_policies: {
        Row: {
          cmd: string | null
          permissive: string | null
          policyname: unknown
          qual: string | null
          roles: unknown[] | null
          schemaname: unknown
          tablename: unknown
          with_check: string | null
        }
        Relationships: []
      }
      deposit_installment_breakdown: {
        Row: {
          academic_year_id: string | null
          academic_year_name: string | null
          application_date: string | null
          application_id: string | null
          contract_name: string | null
          deposit_paid: number | null
          deposit_payment_count: number | null
          expected_deposit: number | null
          expected_installments: number | null
          installment_payment_count: number | null
          installments_paid: number | null
          payment_plan: string | null
          status: Database["public"]["Enums"]["application_status"] | null
          student_id: string | null
          student_name: string | null
          studio_grade: string | null
          total_contract_value: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_occupancy_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_rebookers_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_by_year"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_status_by_academic_year"
            referencedColumns: ["academic_year_id"]
          },
        ]
      }
      expense_summary_by_academic_year: {
        Row: {
          academic_year_id: string | null
          academic_year_name: string | null
          expense_category: string | null
          expense_count: number | null
          first_payment_date: string | null
          last_payment_date: string | null
          total_amount: number | null
        }
        Relationships: [
          {
            foreignKeyName: "utility_payments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "utility_payments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "utility_payments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "utility_payments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_occupancy_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "utility_payments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_rebookers_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "utility_payments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "utility_payments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_by_year"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "utility_payments_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_status_by_academic_year"
            referencedColumns: ["academic_year_id"]
          },
        ]
      }
      fully_paid_students: {
        Row: {
          academic_year_id: string | null
          academic_year_name: string | null
          application_created_at: string | null
          application_id: string | null
          application_status:
            | Database["public"]["Enums"]["application_status"]
            | null
          contract_id: string | null
          contract_name: string | null
          first_name: string | null
          last_name: string | null
          last_payment_date: string | null
          payment_plan: string | null
          payment_status: string | null
          remaining_balance: number | null
          student_id: string | null
          studio_grade_name: string | null
          studio_number: string | null
          total_due: number | null
          total_paid: number | null
        }
        Relationships: []
      }
      outstanding_balances_report: {
        Row: {
          academic_year_id: string | null
          academic_year_name: string | null
          application_date: string | null
          application_id: string | null
          application_status:
            | Database["public"]["Enums"]["application_status"]
            | null
          contract_end: string | null
          contract_name: string | null
          contract_start: string | null
          days_overdue: number | null
          oldest_unpaid_due_date: string | null
          outstanding_balance: number | null
          payment_plan: string | null
          student_id: string | null
          student_name: string | null
          studio_grade: string | null
          total_due: number | null
          total_paid: number | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_occupancy_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_rebookers_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_by_year"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_status_by_academic_year"
            referencedColumns: ["academic_year_id"]
          },
        ]
      }
      partner_referred_applications: {
        Row: {
          academic_year_name: string | null
          application_created_at: string | null
          application_id: string | null
          application_status:
            | Database["public"]["Enums"]["application_status"]
            | null
          commission_amount: number | null
          commission_percentage: number | null
          commission_status: string | null
          contract_name: string | null
          first_name: string | null
          last_name: string | null
          paid_at: string | null
          referral_created_at: string | null
          total_contract_value: number | null
          validated_referral_code: string | null
        }
        Relationships: []
      }
      sales_demographics_report: {
        Row: {
          academic_year_id: string | null
          academic_year_name: string | null
          application_id: string | null
          application_status:
            | Database["public"]["Enums"]["application_status"]
            | null
          arrival_date: string | null
          booking_source: string | null
          cashback_applied: boolean | null
          cashback_value: number | null
          company_name: string | null
          confirmed_date: string | null
          country: string | null
          created_at: string | null
          departure_date: string | null
          discount_applied: boolean | null
          discount_value: number | null
          entry_into_uk: string | null
          first_name: string | null
          is_rebooker: boolean | null
          last_name: string | null
          partner_commission: number | null
          partner_name: string | null
          partner_referral_code: string | null
          payment_plan: string | null
          student_id: string | null
          studio_grade: string | null
          studio_number: string | null
          summer_sales_value: number | null
          total_sales_value: number | null
          ucas_id: string | null
          weekly_rent: number | null
          weeks: number | null
        }
        Relationships: []
      }
      sales_occupancy_monthly: {
        Row: {
          academic_year_id: string | null
          academic_year_name: string | null
          capacity: number | null
          confirmed_contracts: number | null
          month_label: string | null
          month_start: string | null
          occupancy_percentage: number | null
          studio_grade_id: string | null
          studio_grade_name: string | null
        }
        Relationships: []
      }
      sales_rebookers_monthly: {
        Row: {
          academic_year_id: string | null
          academic_year_name: string | null
          month_label: string | null
          month_start: string | null
          rebooker_contracts: number | null
          rebooker_share_percentage: number | null
          rebooker_total_sales_value: number | null
          total_contracts: number | null
        }
        Relationships: []
      }
      studio_allocation_report: {
        Row: {
          active_studios: number | null
          allocated_to_keyworkers: number | null
          allocated_to_ota: number | null
          allocated_to_students: number | null
          status_available: number | null
          status_maintenance: number | null
          status_occupied: number | null
          status_reserved: number | null
          studio_grade_id: string | null
          studio_grade_name: string | null
          studio_grade_slug: string | null
          total_studios: number | null
          unallocated: number | null
        }
        Relationships: []
      }
      studio_grade_availability: {
        Row: {
          academic_year_id: string | null
          academic_year_name: string | null
          availability_percentage: number | null
          available_count: number | null
          contract_id: string | null
          contract_name: string | null
          maintenance_count: number | null
          occupied_count: number | null
          reserved_count: number | null
          studio_grade_id: string | null
          studio_grade_name: string | null
          studio_grade_slug: string | null
          total_capacity: number | null
        }
        Relationships: []
      }
      studio_grade_availability_by_year: {
        Row: {
          academic_year_id: string | null
          academic_year_name: string | null
          availability_percentage: number | null
          available_count: number | null
          maintenance_count: number | null
          occupied_count: number | null
          reserved_count: number | null
          studio_grade_id: string | null
          studio_grade_name: string | null
          studio_grade_slug: string | null
          total_capacity: number | null
        }
        Relationships: []
      }
      studio_grade_availability_summary: {
        Row: {
          availability_percentage: number | null
          available_count: number | null
          maintenance_count: number | null
          occupied_count: number | null
          reserved_count: number | null
          studio_grade_id: string | null
          studio_grade_name: string | null
          studio_grade_slug: string | null
          total_capacity: number | null
        }
        Relationships: []
      }
      studio_status_by_academic_year: {
        Row: {
          academic_year_id: string | null
          academic_year_name: string | null
          allocation: string | null
          effective_status: Database["public"]["Enums"]["studio_status"] | null
          floor: string | null
          global_status: Database["public"]["Enums"]["studio_status"] | null
          is_active: boolean | null
          reservation_expires_at: string | null
          studio_grade_id: string | null
          studio_id: string | null
          studio_number: string | null
        }
        Relationships: [
          {
            foreignKeyName: "studios_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "sales_occupancy_monthly"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studios_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_allocation_report"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studios_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studios_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_by_year"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studios_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_summary"
            referencedColumns: ["studio_grade_id"]
          },
          {
            foreignKeyName: "studios_studio_grade_id_fkey"
            columns: ["studio_grade_id"]
            isOneToOne: false
            referencedRelation: "studio_grades"
            referencedColumns: ["id"]
          },
        ]
      }
      unified_payment_history: {
        Row: {
          academic_year_id: string | null
          academic_year_name: string | null
          amount_paid: number | null
          contract_id: string | null
          contract_name: string | null
          currency: string | null
          due_date: string | null
          entered_by_user_id: string | null
          installment_number: number | null
          manual_entry_id: string | null
          manual_entry_notes: string | null
          payment_date: string | null
          payment_id: string | null
          payment_metadata: Json | null
          payment_plan_id: string | null
          payment_source: string | null
          payment_status: string | null
          payment_type: string | null
          stripe_payment_intent_id: string | null
          student_application_id: string | null
          student_id: string | null
          student_name: string | null
          studio_grade: string | null
          studio_number: string | null
          updated_at: string | null
        }
        Relationships: []
      }
      upcoming_and_paid_installments_report: {
        Row: {
          academic_year_id: string | null
          academic_year_name: string | null
          amount: number | null
          amount_paid: number | null
          amount_remaining: number | null
          application_id: string | null
          contract_id: string | null
          contract_name: string | null
          due_date: string | null
          installment_id: string | null
          installment_label: string | null
          is_deposit: boolean | null
          is_paid: boolean | null
          paid_date: string | null
          payment_plan: string | null
          sequence: number | null
          status: string | null
          student_id: string | null
          student_name: string | null
          studio_grade: string | null
          studio_number: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "academic_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "fully_paid_students"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_demographics_report"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_occupancy_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "sales_rebookers_monthly"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_grade_availability_by_year"
            referencedColumns: ["academic_year_id"]
          },
          {
            foreignKeyName: "contracts_academic_year_id_fkey"
            columns: ["academic_year_id"]
            isOneToOne: false
            referencedRelation: "studio_status_by_academic_year"
            referencedColumns: ["academic_year_id"]
          },
        ]
      }
    }
    Functions: {
      admin_release_studio_occupancy: {
        Args: { p_academic_year_id?: string; p_studio_id: string }
        Returns: Json
      }
      append_missing_contract_payment_schedule_rows: {
        Args: { p_contract_id: string; p_payment_plan_id: string }
        Returns: number
      }
      apply_cashback_to_application: {
        Args: {
          p_application_id: string
          p_applied_by?: string
          p_campaign_id: string
        }
        Returns: string
      }
      apply_discount_to_application: {
        Args: {
          p_application_id: string
          p_applied_by?: string
          p_campaign_id: string
        }
        Returns: string
      }
      backfill_contract_payment_schedule_for_contract: {
        Args: { p_contract_id: string; p_payment_plan_id: string }
        Returns: number
      }
      bulk_import_academic_years: {
        Args: { p_data: Json; p_imported_by: string }
        Returns: {
          error_message: string
          record_id: string
          row_number: number
          status: string
        }[]
      }
      bulk_import_applications_custom_contracts: {
        Args: { p_data: Json; p_imported_by: string; p_skip_existing?: boolean }
        Returns: {
          error_message: string
          record_id: string
          row_number: number
          status: string
        }[]
      }
      bulk_import_cashback_campaigns: {
        Args: { p_data: Json; p_imported_by: string }
        Returns: {
          error_message: string
          record_id: string
          row_number: number
          status: string
        }[]
      }
      bulk_import_contracts: {
        Args: { p_data: Json; p_imported_by: string }
        Returns: {
          error_message: string
          record_id: string
          row_number: number
          status: string
        }[]
      }
      bulk_import_discount_campaigns: {
        Args: { p_data: Json; p_imported_by: string }
        Returns: {
          error_message: string
          record_id: string
          row_number: number
          status: string
        }[]
      }
      bulk_import_partners: {
        Args: { p_data: Json; p_imported_by: string }
        Returns: {
          error_message: string
          record_id: string
          row_number: number
          status: string
        }[]
      }
      bulk_import_payment_plan_installments: {
        Args: { p_data: Json; p_imported_by: string }
        Returns: {
          error_message: string
          record_id: string
          row_number: number
          status: string
        }[]
      }
      bulk_import_payment_plans: {
        Args: { p_data: Json; p_imported_by: string }
        Returns: {
          error_message: string
          record_id: string
          row_number: number
          status: string
        }[]
      }
      bulk_import_payment_records: {
        Args: { p_data: Json; p_imported_by: string }
        Returns: {
          error_message: string
          record_id: string
          row_number: number
          status: string
        }[]
      }
      bulk_import_student_applications:
        | {
            Args: { p_data: Json; p_imported_by: string }
            Returns: {
              error_message: string
              record_id: string
              row_number: number
              status: string
            }[]
          }
        | {
            Args: {
              p_data: Json
              p_imported_by: string
              p_skip_existing?: boolean
            }
            Returns: {
              error_message: string
              record_id: string
              row_number: number
              status: string
            }[]
          }
      bulk_import_studio_grade_prices: {
        Args: { p_data: Json; p_imported_by: string }
        Returns: {
          error_message: string
          record_id: string
          row_number: number
          status: string
        }[]
      }
      bulk_import_studio_grades: {
        Args: { p_data: Json; p_imported_by: string }
        Returns: {
          error_message: string
          record_id: string
          row_number: number
          status: string
        }[]
      }
      bulk_import_studios:
        | {
            Args: { p_data: Json; p_imported_by: string }
            Returns: {
              error_message: string
              record_id: string
              row_number: number
              status: string
            }[]
          }
        | {
            Args: {
              p_academic_year_id?: string
              p_data: Json
              p_imported_by: string
            }
            Returns: {
              error_message: string
              record_id: string
              row_number: number
              status: string
            }[]
          }
      calculate_contract_value: {
        Args: { p_contract_id: string }
        Returns: number
      }
      calculate_ota_nights: {
        Args: { p_check_in: string; p_check_out: string }
        Returns: number
      }
      calculate_ota_revenue: {
        Args: {
          p_commission_amount: number
          p_number_of_nights: number
          p_price_per_night: number
        }
        Returns: number
      }
      get_ota_amount_due: {
        Args: { p_booking_id: string }
        Returns: number
      }
      get_ota_payment_summary: {
        Args: { p_booking_id: string }
        Returns: {
          amount_due: number
          gross_booking_value: number
          last_payment_date: string
          payment_count: number
          payment_status: string
          remaining_balance: number
          total_received: number
        }[]
      }
      calculate_partner_commission: {
        Args: { p_application_id: string }
        Returns: number
      }
      can_access_route: {
        Args: { p_role: string; p_route_path: string }
        Returns: boolean
      }
      can_student_rebook: {
        Args: { p_contract_id: string; p_user_id: string }
        Returns: {
          can_rebook: boolean
          message: string
          previous_academic_year: string
          previous_application_id: string
          previous_contract_name: string
        }[]
      }
      check_cashback_eligibility: {
        Args: { p_application_id: string; p_campaign_id: string }
        Returns: boolean
      }
      check_discount_eligibility: {
        Args: { p_application_id: string; p_campaign_id: string }
        Returns: boolean
      }
      check_referral_code_available: {
        Args: { p_referral_code: string }
        Returns: {
          is_already_linked: boolean
          is_available: boolean
          partner_id: string
          partner_name: string
        }[]
      }
      create_partner_referral: {
        Args: {
          p_application_id: string
          p_partner_id: string
          p_referral_code?: string
        }
        Returns: string
      }
      debug_payment_summary: {
        Args: { p_application_id: string }
        Returns: {
          debug_info: Json
        }[]
      }
      decrypt_credential_value: {
        Args: { p_encrypted_value: string; p_encryption_key?: string }
        Returns: string
      }
      delete_all_student_applications: {
        Args: { p_delete_orphaned_users?: boolean }
        Returns: Json
      }
      delete_applications_by_ids: {
        Args: { p_application_ids: string[]; p_delete_orphaned_users?: boolean }
        Returns: Json
      }
      delete_student_application: {
        Args: { p_application_id: string }
        Returns: {
          deleted_tables: Json
          total_deleted: number
        }[]
      }
      delete_student_applications_by_academic_year:
        | {
            Args: {
              p_academic_year_id: string
              p_delete_applications?: boolean
              p_delete_custom_contracts_and_plans?: boolean
              p_delete_orphaned_contracts_and_plans?: boolean
            }
            Returns: Json
          }
        | {
            Args: {
              p_academic_year_id: string
              p_delete_orphaned_users?: boolean
            }
            Returns: Json
          }
      encrypt_credential_value: {
        Args: { p_encryption_key?: string; p_value: string }
        Returns: string
      }
      export_get_enums: {
        Args: never
        Returns: {
          enum_name: string
          enum_values: string[]
          schema_name: string
        }[]
      }
      export_get_functions: {
        Args: never
        Returns: {
          arguments: string
          comment: string
          definition: string
          function_name: string
          return_type: string
          schema_name: string
        }[]
      }
      export_get_grants: {
        Args: never
        Returns: {
          grantee: string
          is_grantable: string
          privilege_type: string
          table_name: string
          table_schema: string
        }[]
      }
      export_get_indexes: {
        Args: never
        Returns: {
          indexdef: string
          indexname: string
          schemaname: string
          tablename: string
        }[]
      }
      export_get_rls_policies: {
        Args: never
        Returns: {
          cmd: string
          permissive: string
          policyname: string
          qual: string
          roles: string[]
          schemaname: string
          tablename: string
          with_check: string
        }[]
      }
      export_get_tables: {
        Args: never
        Returns: {
          columns: Json
          constraints: Json
          table_comment: string
          table_name: string
          table_schema: string
          table_type: string
        }[]
      }
      export_get_triggers: {
        Args: never
        Returns: {
          action_orientation: string
          action_statement: string
          action_timing: string
          event_manipulation: string
          event_object_table: string
          trigger_name: string
          trigger_schema: string
        }[]
      }
      export_get_views: {
        Args: never
        Returns: {
          table_name: string
          table_schema: string
          view_definition: string
        }[]
      }
      find_user_by_email: { Args: { p_email: string }; Returns: string }
      get_admin_dashboard_stats: {
        Args: { p_academic_year_id?: string }
        Returns: {
          confirmed_applications: number
          occupancy_occupied: number
          occupancy_percentage: number
          occupancy_total: number
          pending_verifications: number
          recent_applications: number
          total_applications: number
          total_revenue: number
          total_students: number
          upcoming_instalments_count: number
          upcoming_instalments_next_due: string
          upcoming_instalments_total: number
        }[]
      }
      get_application_total_with_cashback: {
        Args: { p_application_id: string }
        Returns: number
      }
      get_application_total_with_discount: {
        Args: { p_application_id: string }
        Returns: number
      }
      get_applications_for_payment_link: {
        Args: never
        Returns: {
          contract_slug: string
          id: string
          student_email: string
          student_name: string
        }[]
      }
      get_booking_calendar_data: {
        Args: {
          p_academic_year_id?: string
          p_allocation?: string
          p_studio_grade_id?: string
        }
        Returns: {
          academic_year_id: string
          academic_year_name: string
          actual_check_in_date: string
          actual_check_out_date: string
          allocation: string
          application_created_at: string
          application_id: string
          application_status: string
          cancelled_at: string
          check_in_notes: string
          check_out_notes: string
          checked_in_at: string
          checked_in_by: string
          checked_out_at: string
          checked_out_by: string
          contract_end: string
          contract_id: string
          contract_name: string
          contract_start: string
          effective_check_in_date: string
          effective_check_out_date: string
          student_email: string
          student_id: string
          student_name: string
          studio_grade_id: string
          studio_grade_name: string
          studio_id: string
          studio_number: string
          studio_status: string
          submitted_at: string
        }[]
      }
      get_contract_value: {
        Args: { p_application_id: string }
        Returns: number
      }
      get_credential_value: {
        Args: { p_credential_key: string }
        Returns: string
      }
      get_debug_logs: {
        Args: { p_function_name?: string; p_limit?: number }
        Returns: {
          application_id: string
          created_at: string
          data: Json
          function_name: string
          id: string
          message: string
        }[]
      }
      get_encryption_key: { Args: never; Returns: string }
      get_fully_paid_students: {
        Args: {
          p_academic_year_id?: string
          p_contract_id?: string
          p_end_date?: string
          p_start_date?: string
        }
        Returns: {
          academic_year_id: string
          academic_year_name: string
          application_created_at: string
          application_id: string
          application_status: string
          contract_id: string
          contract_name: string
          email: string
          first_name: string
          last_name: string
          last_payment_date: string
          payment_plan: string
          payment_status: string
          remaining_balance: number
          student_id: string
          studio_grade_name: string
          studio_number: string
          total_due: number
          total_paid: number
        }[]
      }
      get_installment_breakdown: {
        Args: { p_application_id: string }
        Returns: {
          amount_due: number
          amount_paid: number
          due_date: string
          installment_id: string
          label: string
          payment_status: string
          remaining_amount: number
          sequence: number
        }[]
      }
      get_partner_id: { Args: never; Returns: string }
      get_partner_referral_payment_summary: {
        Args: { p_partner_id: string }
        Returns: {
          academic_year_name: string
          application_id: string
          commission_amount: number
          commission_status: string
          contract_name: string
          last_payment_date: string
          payment_status: string
          remaining_balance: number
          student_first_name: string
          student_last_name: string
          total_contract_value: number
          total_paid: number
        }[]
      }
      get_payment_summary: {
        Args: { p_application_id: string }
        Returns: {
          last_payment_date: string
          payment_count: number
          payment_status: string
          remaining_balance: number
          total_due: number
          total_paid: number
        }[]
      }
      get_rebooking_data: {
        Args: { p_previous_application_id: string }
        Returns: {
          step1_data: Json
          step2_data: Json
          step3_data: Json
          step4_data: Json
          step5_data: Json
        }[]
      }
      get_revenue_summary: {
        Args: {
          p_end_date?: string
          p_group_by?: string
          p_start_date?: string
        }
        Returns: {
          deposit_revenue: number
          installment_revenue: number
          manual_revenue: number
          net_revenue: number
          payment_count: number
          period_end: string
          period_label: string
          period_start: string
          stripe_revenue: number
          total_refunds: number
          total_revenue: number
        }[]
      }
      get_route_permissions_for_role: {
        Args: { p_role: string }
        Returns: {
          allowed: boolean
          route_name: string
          route_path: string
        }[]
      }
      get_sales_report_cash_summary: {
        Args: { p_academic_year_id?: string }
        Returns: {
          total_deposits_collected: number
          total_installments_collected: number
          total_received: number
        }[]
      }
      get_staff_subrole: { Args: { p_user_id: string }; Returns: string }
      get_studio_availability: {
        Args: { p_contract_id?: string; p_studio_grade_id: string }
        Returns: {
          availability_percentage: number
          available_count: number
          maintenance_count: number
          occupied_count: number
          reserved_count: number
          total_capacity: number
        }[]
      }
      get_users_with_roles: {
        Args: never
        Returns: {
          created_at: string
          email: string
          id: string
          roles: string[]
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      is_partner: { Args: never; Returns: boolean }
      is_staff: { Args: never; Returns: boolean }
      is_superadmin: { Args: never; Returns: boolean }
      link_manual_payment_to_application_by_id: {
        Args: {
          p_application_id: string
          p_instalment_id?: string
          p_payment_id: string
        }
        Returns: string
      }
      link_partner_account: {
        Args: { p_referral_code: string; p_user_id: string }
        Returns: boolean
      }
      link_payment_to_application: {
        Args: { p_application_id: string; p_receipt_number: string }
        Returns: string
      }
      log_staff_activity:
        | {
            Args: {
              p_action: string
              p_entity_id?: string
              p_entity_type?: string
              p_payload?: Json
            }
            Returns: string
          }
        | {
            Args: {
              p_action: string
              p_entity_id?: string
              p_entity_type?: string
              p_ip_address?: unknown
              p_payload?: Json
            }
            Returns: string
          }
      parse_contract_date_range: {
        Args: { p_text: string }
        Returns: {
          contract_end: string
          contract_start: string
        }[]
      }
      parse_duration_weeks_days: {
        Args: { p_text: string }
        Returns: {
          extra_days: number
          weeks: number
        }[]
      }
      preview_studio_allocation_change: {
        Args: { p_new_allocation: string; p_studio_id: string }
        Returns: Json
      }
      reassign_studio_allocation: {
        Args: {
          p_new_allocation: string
          p_policy?: string
          p_reason?: string
          p_studio_id: string
          p_target_studio_id?: string
        }
        Returns: Json
      }
      remove_cashback_from_application: {
        Args: { p_application_id: string }
        Returns: undefined
      }
      remove_discount_from_application: {
        Args: { p_application_id: string }
        Returns: undefined
      }
      reserve_studio_atomic: {
        Args: {
          p_application_id: string
          p_reservation_duration_minutes?: number
          p_student_id: string
          p_studio_id: string
        }
        Returns: Json
      }
      search_applications_by_criteria: {
        Args: { p_search_term: string; p_search_type: string }
        Returns: {
          application_id: string
          contract_name: string
          created_at: string
          status: string
          student_email: string
          student_name: string
          studio_grade_name: string
          studio_number: string
        }[]
      }
      set_selected_payment_plan: {
        Args: { p_application_id: string; p_plan_id: string }
        Returns: {
          actual_check_in_date: string | null
          actual_check_out_date: string | null
          assigned_studio_id: string | null
          booking_source: string | null
          cancelled_at: string | null
          cashback_amount: number | null
          check_in_notes: string | null
          check_out_notes: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          checked_out_at: string | null
          checked_out_by: string | null
          contract_id: string
          created_at: string
          deposit_payment_intent_id: string | null
          discount_amount: number | null
          extension_of_application_id: string | null
          id: string
          internal_notes: string | null
          is_rebooking: boolean | null
          previous_application_id: string | null
          rebooking_approved_at: string | null
          rebooking_approved_by: string | null
          rebooking_reason: string | null
          referred_by_partner_id: string | null
          requested_contract_end: string | null
          requested_contract_start: string | null
          reserved_studio_expires_at: string | null
          selected_payment_plan_id: string | null
          signature_mode: string | null
          status: Database["public"]["Enums"]["application_status"]
          stripe_customer_id: string | null
          student_id: string
          studio_grade_id: string
          submitted_at: string | null
          total_contract_value: number | null
          updated_at: string
          validated_referral_code: string | null
        }
        SetofOptions: {
          from: "*"
          to: "student_applications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_user_password: {
        Args: { p_email: string; p_password: string }
        Returns: boolean
      }
      set_user_password_by_id: {
        Args: { p_password: string; p_user_id: string }
        Returns: boolean
      }
      trigger_release_expired_reservations: { Args: never; Returns: Json }
      update_credential_sync_status: {
        Args: { p_credential_key: string; p_synced?: boolean }
        Returns: undefined
      }
      validate_referral_code: {
        Args: { p_code: string }
        Returns: {
          commission_percentage: number
          is_valid: boolean
          partner_id: string
          partner_name: string
        }[]
      }
      verify_payment_by_receipt: {
        Args: { p_receipt_number: string }
        Returns: {
          amount: number
          application_id: string
          created_at: string
          id: string
          is_linked: boolean
          notes: string
          payment_date: string
          payment_method: string
          payment_type: string
          recorded_by: string
        }[]
      }
    }
    Enums: {
      application_status:
        | "draft"
        | "awaiting_deposit"
        | "awaiting_signature"
        | "awaiting_verification"
        | "confirmed"
        | "cancelled"
        | "expired"
        | "checked_out"
      document_status: "pending" | "approved" | "rejected"
      payment_amount_type: "percentage" | "fixed"
      signature_type: "student" | "guarantor" | "staff" | "witness"
      studio_status: "available" | "reserved" | "occupied" | "maintenance"
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
  public: {
    Enums: {
      application_status: [
        "draft",
        "awaiting_deposit",
        "awaiting_signature",
        "awaiting_verification",
        "confirmed",
        "cancelled",
        "expired",
        "checked_out",
      ],
      document_status: ["pending", "approved", "rejected"],
      payment_amount_type: ["percentage", "fixed"],
      signature_type: ["student", "guarantor", "staff", "witness"],
      studio_status: ["available", "reserved", "occupied", "maintenance"],
    },
  },
} as const
