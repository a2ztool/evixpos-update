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
      ad_costs: {
        Row: {
          ad_date: string
          amount: number
          campaign_name: string
          clicks: number
          conversions: number
          created_at: string
          id: string
          impressions: number
          notes: string | null
          platform: string
          revenue: number
          store_id: string | null
          user_id: string
        }
        Insert: {
          ad_date?: string
          amount?: number
          campaign_name?: string
          clicks?: number
          conversions?: number
          created_at?: string
          id?: string
          impressions?: number
          notes?: string | null
          platform?: string
          revenue?: number
          store_id?: string | null
          user_id: string
        }
        Update: {
          ad_date?: string
          amount?: number
          campaign_name?: string
          clicks?: number
          conversions?: number
          created_at?: string
          id?: string
          impressions?: number
          notes?: string | null
          platform?: string
          revenue?: number
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_costs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      ads_accounts: {
        Row: {
          access_token: string | null
          ad_account_id: string | null
          created_at: string | null
          id: string
          store_id: string | null
          user_id: string | null
        }
        Insert: {
          access_token?: string | null
          ad_account_id?: string | null
          created_at?: string | null
          id?: string
          store_id?: string | null
          user_id?: string | null
        }
        Update: {
          access_token?: string | null
          ad_account_id?: string | null
          created_at?: string | null
          id?: string
          store_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      ads_metrics: {
        Row: {
          ad_account_id: string
          clicks: number
          created_at: string
          date_start: string
          date_stop: string
          fetched_at: string
          id: string
          impressions: number
          spend: number
          store_id: string | null
          user_id: string
        }
        Insert: {
          ad_account_id: string
          clicks?: number
          created_at?: string
          date_start: string
          date_stop: string
          fetched_at?: string
          id?: string
          impressions?: number
          spend?: number
          store_id?: string | null
          user_id: string
        }
        Update: {
          ad_account_id?: string
          clicks?: number
          created_at?: string
          date_start?: string
          date_stop?: string
          fetched_at?: string
          id?: string
          impressions?: number
          spend?: number
          store_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      auto_payment_logs: {
        Row: {
          amount: number
          created_at: string
          currency: string
          error_message: string | null
          gateway_id: string | null
          gateway_response: Json | null
          id: string
          plan: string
          plan_activated: boolean
          status: string
          store_id: string | null
          transaction_ref: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          currency?: string
          error_message?: string | null
          gateway_id?: string | null
          gateway_response?: Json | null
          id?: string
          plan?: string
          plan_activated?: boolean
          status?: string
          store_id?: string | null
          transaction_ref?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          error_message?: string | null
          gateway_id?: string | null
          gateway_response?: Json | null
          id?: string
          plan?: string
          plan_activated?: boolean
          status?: string
          store_id?: string | null
          transaction_ref?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_payment_logs_gateway_id_fkey"
            columns: ["gateway_id"]
            isOneToOne: false
            referencedRelation: "payment_gateways"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "auto_payment_logs_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      bot_automations: {
        Row: {
          channel: string
          created_at: string
          delay_minutes: number
          id: string
          is_active: boolean
          message_template: string
          name: string
          store_id: string | null
          trigger_event: string
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          delay_minutes?: number
          id?: string
          is_active?: boolean
          message_template?: string
          name?: string
          store_id?: string | null
          trigger_event?: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          delay_minutes?: number
          id?: string
          is_active?: boolean
          message_template?: string
          name?: string
          store_id?: string | null
          trigger_event?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bot_automations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      business_settings: {
        Row: {
          app_language: string
          business_email: string
          business_name: string
          business_phone: string
          created_at: string
          currencies: Json
          default_currency: string
          id: string
          logo_url: string
          notification_prefs: Json | null
          payment_methods: Json
          shop_url: string
          show_payment_in_pos: boolean
          store_id: string | null
          store_slug: string
          tax_rate: number
          timezone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          app_language?: string
          business_email?: string
          business_name?: string
          business_phone?: string
          created_at?: string
          currencies?: Json
          default_currency?: string
          id?: string
          logo_url?: string
          notification_prefs?: Json | null
          payment_methods?: Json
          shop_url?: string
          show_payment_in_pos?: boolean
          store_id?: string | null
          store_slug?: string
          tax_rate?: number
          timezone?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          app_language?: string
          business_email?: string
          business_name?: string
          business_phone?: string
          created_at?: string
          currencies?: Json
          default_currency?: string
          id?: string
          logo_url?: string
          notification_prefs?: Json | null
          payment_methods?: Json
          shop_url?: string
          show_payment_in_pos?: boolean
          store_id?: string | null
          store_slug?: string
          tax_rate?: number
          timezone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "business_settings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_register_shifts: {
        Row: {
          cash_in: number
          cash_out: number
          closed_at: string | null
          closing_balance: number | null
          expected_balance: number | null
          id: string
          mismatch: number | null
          notes: string | null
          opened_at: string
          opened_by: string | null
          opening_balance: number
          status: string
          store_id: string
          user_id: string
        }
        Insert: {
          cash_in?: number
          cash_out?: number
          closed_at?: string | null
          closing_balance?: number | null
          expected_balance?: number | null
          id?: string
          mismatch?: number | null
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_balance?: number
          status?: string
          store_id: string
          user_id: string
        }
        Update: {
          cash_in?: number
          cash_out?: number
          closed_at?: string | null
          closing_balance?: number | null
          expected_balance?: number | null
          id?: string
          mismatch?: number | null
          notes?: string | null
          opened_at?: string
          opened_by?: string | null
          opening_balance?: number
          status?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_register_shifts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_group_members: {
        Row: {
          group_id: string
          id: string
          joined_at: string | null
          role: string | null
          user_id: string
        }
        Insert: {
          group_id: string
          id?: string
          joined_at?: string | null
          role?: string | null
          user_id: string
        }
        Update: {
          group_id?: string
          id?: string
          joined_at?: string | null
          role?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "chat_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_group_messages: {
        Row: {
          created_at: string | null
          group_id: string
          id: string
          message: string
          sender_id: string
          type: string | null
        }
        Insert: {
          created_at?: string | null
          group_id: string
          id?: string
          message: string
          sender_id: string
          type?: string | null
        }
        Update: {
          created_at?: string | null
          group_id?: string
          id?: string
          message?: string
          sender_id?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_group_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "chat_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_groups: {
        Row: {
          created_at: string | null
          created_by: string
          icon: string | null
          id: string
          name: string
          store_id: string
        }
        Insert: {
          created_at?: string | null
          created_by: string
          icon?: string | null
          id?: string
          name: string
          store_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string
          icon?: string | null
          id?: string
          name?: string
          store_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_groups_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          sender_type: string
          session_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          sender_type?: string
          session_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          sender_type?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          last_message_at: string
          status: string
          tags: string[] | null
          visitor_id: string
          visitor_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          last_message_at?: string
          status?: string
          tags?: string[] | null
          visitor_id: string
          visitor_name?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          last_message_at?: string
          status?: string
          tags?: string[] | null
          visitor_id?: string
          visitor_name?: string
        }
        Relationships: []
      }
      chat_tasks: {
        Row: {
          assigned_by: string
          assigned_to: string
          created_at: string | null
          description: string | null
          group_id: string
          id: string
          order_id: string | null
          priority: string | null
          status: string | null
          term: string | null
          title: string
        }
        Insert: {
          assigned_by: string
          assigned_to: string
          created_at?: string | null
          description?: string | null
          group_id: string
          id?: string
          order_id?: string | null
          priority?: string | null
          status?: string | null
          term?: string | null
          title: string
        }
        Update: {
          assigned_by?: string
          assigned_to?: string
          created_at?: string | null
          description?: string | null
          group_id?: string
          id?: string
          order_id?: string | null
          priority?: string | null
          status?: string | null
          term?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_tasks_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "chat_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          code: string
          created_at: string
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number
          min_order: number
          store_id: string | null
          type: string
          used_count: number
          user_id: string
          value: number
        }
        Insert: {
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number
          min_order?: number
          store_id?: string | null
          type?: string
          used_count?: number
          user_id: string
          value?: number
        }
        Update: {
          code?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number
          min_order?: number
          store_id?: string | null
          type?: string
          used_count?: number
          user_id?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "coupons_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_payments: {
        Row: {
          amount: number
          created_at: string
          customer_id: string
          id: string
          notes: string | null
          payment_method: string
          store_id: string
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          customer_id: string
          id?: string
          notes?: string | null
          payment_method?: string
          store_id: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          customer_id?: string
          id?: string
          notes?: string | null
          payment_method?: string
          store_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_credits: {
        Row: {
          created_at: string
          credit_limit: number
          customer_id: string
          id: string
          last_payment_date: string | null
          store_id: string
          total_due: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credit_limit?: number
          customer_id: string
          id?: string
          last_payment_date?: string | null
          store_id: string
          total_due?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credit_limit?: number
          customer_id?: string
          id?: string
          last_payment_date?: string | null
          store_id?: string
          total_due?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_credits_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_credits_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          store_id: string | null
          tags: string | null
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          store_id?: string | null
          tags?: string | null
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          store_id?: string | null
          tags?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      email_branding: {
        Row: {
          brand_color: string
          company_name: string
          created_at: string
          footer_text: string
          id: string
          logo_url: string | null
          social_links: Json | null
          user_id: string
          website_url: string
        }
        Insert: {
          brand_color?: string
          company_name?: string
          created_at?: string
          footer_text?: string
          id?: string
          logo_url?: string | null
          social_links?: Json | null
          user_id: string
          website_url?: string
        }
        Update: {
          brand_color?: string
          company_name?: string
          created_at?: string
          footer_text?: string
          id?: string
          logo_url?: string | null
          social_links?: Json | null
          user_id?: string
          website_url?: string
        }
        Relationships: []
      }
      email_campaign_tracking: {
        Row: {
          id: string
          ip_address: string | null
          link_url: string | null
          recipient_email: string
          reminder_id: string | null
          store_id: string
          tracked_at: string
          tracking_type: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          id?: string
          ip_address?: string | null
          link_url?: string | null
          recipient_email: string
          reminder_id?: string | null
          store_id: string
          tracked_at?: string
          tracking_type?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          id?: string
          ip_address?: string | null
          link_url?: string | null
          recipient_email?: string
          reminder_id?: string | null
          store_id?: string
          tracked_at?: string
          tracking_type?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_campaign_tracking_reminder_id_fkey"
            columns: ["reminder_id"]
            isOneToOne: false
            referencedRelation: "renewal_reminders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_campaign_tracking_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      email_config: {
        Row: {
          created_at: string
          id: string
          provider: string
          sender_email: string
          sender_name: string
          smtp_host: string
          smtp_password: string
          smtp_port: number
          smtp_secure: boolean
          smtp_username: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          provider?: string
          sender_email?: string
          sender_name?: string
          smtp_host?: string
          smtp_password?: string
          smtp_port?: number
          smtp_secure?: boolean
          smtp_username?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          provider?: string
          sender_email?: string
          sender_name?: string
          smtp_host?: string
          smtp_password?: string
          smtp_port?: number
          smtp_secure?: boolean
          smtp_username?: string
          user_id?: string
        }
        Relationships: []
      }
      email_store_config: {
        Row: {
          api_key: string | null
          connection_status: string | null
          created_at: string
          id: string
          last_tested_at: string | null
          provider_type: string
          rate_limit_per_minute: number | null
          sender_email: string | null
          sender_name: string | null
          smtp_host: string | null
          smtp_pass: string | null
          smtp_port: number | null
          smtp_user: string | null
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key?: string | null
          connection_status?: string | null
          created_at?: string
          id?: string
          last_tested_at?: string | null
          provider_type?: string
          rate_limit_per_minute?: number | null
          sender_email?: string | null
          sender_name?: string | null
          smtp_host?: string | null
          smtp_pass?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          store_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key?: string | null
          connection_status?: string | null
          created_at?: string
          id?: string
          last_tested_at?: string | null
          provider_type?: string
          rate_limit_per_minute?: number | null
          sender_email?: string | null
          sender_name?: string | null
          smtp_host?: string | null
          smtp_pass?: string | null
          smtp_port?: number | null
          smtp_user?: string | null
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_store_config_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      email_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          is_active: boolean
          name: string
          subject: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          subject?: string
          type?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          subject?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      google_sheets_config: {
        Row: {
          created_at: string
          credentials: Json | null
          field_mapping: Json
          id: string
          is_auto_sync: boolean
          last_synced_at: string | null
          sheet_id: string
          status: string
          store_id: string | null
          tab_name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credentials?: Json | null
          field_mapping?: Json
          id?: string
          is_auto_sync?: boolean
          last_synced_at?: string | null
          sheet_id?: string
          status?: string
          store_id?: string | null
          tab_name?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          credentials?: Json | null
          field_mapping?: Json
          id?: string
          is_auto_sync?: boolean
          last_synced_at?: string | null
          sheet_id?: string
          status?: string
          store_id?: string | null
          tab_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "google_sheets_config_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          api_key: string | null
          consumer_key: string | null
          id: string
          phone_number: string | null
          status: string
          store_id: string | null
          store_url: string | null
          type: Database["public"]["Enums"]["integration_type"]
          user_id: string
          webhook_url: string | null
        }
        Insert: {
          api_key?: string | null
          consumer_key?: string | null
          id?: string
          phone_number?: string | null
          status?: string
          store_id?: string | null
          store_url?: string | null
          type?: Database["public"]["Enums"]["integration_type"]
          user_id: string
          webhook_url?: string | null
        }
        Update: {
          api_key?: string | null
          consumer_key?: string | null
          id?: string
          phone_number?: string | null
          status?: string
          store_id?: string | null
          store_url?: string | null
          type?: Database["public"]["Enums"]["integration_type"]
          user_id?: string
          webhook_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "integrations_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_content: {
        Row: {
          content_type: string
          created_at: string
          id: string
          key: string
          section: string
          sort_order: number
          updated_at: string
          value: string
        }
        Insert: {
          content_type?: string
          created_at?: string
          id?: string
          key: string
          section?: string
          sort_order?: number
          updated_at?: string
          value?: string
        }
        Update: {
          content_type?: string
          created_at?: string
          id?: string
          key?: string
          section?: string
          sort_order?: number
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      loyalty_points: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          redeemed_points: number
          store_id: string
          total_points: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          redeemed_points?: number
          store_id: string
          total_points?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          redeemed_points?: number
          store_id?: string
          total_points?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_points_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_points_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          created_at: string
          customer_id: string
          id: string
          notes: string | null
          order_id: string | null
          points: number
          store_id: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          id?: string
          notes?: string | null
          order_id?: string | null
          points?: number
          store_id: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          id?: string
          notes?: string | null
          order_id?: string | null
          points?: number
          store_id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      meta_ad_accounts: {
        Row: {
          access_token: string
          account_name: string | null
          ad_account_id: string | null
          created_at: string
          id: string
          is_active: boolean
          store_id: string
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token: string
          account_name?: string | null
          ad_account_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          store_id: string
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token?: string
          account_name?: string | null
          ad_account_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          store_id?: string
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "meta_ad_accounts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_logs: {
        Row: {
          channel: string
          created_at: string
          error_message: string | null
          id: string
          message: string
          recipient: string
          status: string
          subject: string | null
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          message?: string
          recipient?: string
          status?: string
          subject?: string | null
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          error_message?: string | null
          id?: string
          message?: string
          recipient?: string
          status?: string
          subject?: string | null
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          role: string | null
          store_id: string | null
          title: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          role?: string | null
          store_id?: string | null
          title?: string | null
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          role?: string | null
          store_id?: string | null
          title?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      order_forms: {
        Row: {
          created_at: string
          custom_fields: Json
          description: string
          fields: Json
          id: string
          name: string
          selected_products: Json
          show_coupon: boolean
          slug: string
          status: string
          store_id: string | null
          take_payment: boolean
          user_id: string
        }
        Insert: {
          created_at?: string
          custom_fields?: Json
          description?: string
          fields?: Json
          id?: string
          name?: string
          selected_products?: Json
          show_coupon?: boolean
          slug?: string
          status?: string
          store_id?: string | null
          take_payment?: boolean
          user_id: string
        }
        Update: {
          created_at?: string
          custom_fields?: Json
          description?: string
          fields?: Json
          id?: string
          name?: string
          selected_products?: Json
          show_coupon?: boolean
          slug?: string
          status?: string
          store_id?: string | null
          take_payment?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_forms_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          id: string
          order_id: string
          price: number
          product_id: string | null
          quantity: number
        }
        Insert: {
          id?: string
          order_id: string
          price?: number
          product_id?: string | null
          quantity?: number
        }
        Update: {
          id?: string
          order_id?: string
          price?: number
          product_id?: string | null
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cost_price: number
          created_at: string
          customer_id: string | null
          discount: number
          discount_type: string
          id: string
          meta: Json | null
          notes: string | null
          payment_currency: string
          payment_method: string
          payment_status: string
          source: string
          status: Database["public"]["Enums"]["order_status"]
          store_id: string | null
          total_amount: number
          user_id: string
        }
        Insert: {
          cost_price?: number
          created_at?: string
          customer_id?: string | null
          discount?: number
          discount_type?: string
          id?: string
          meta?: Json | null
          notes?: string | null
          payment_currency?: string
          payment_method?: string
          payment_status?: string
          source?: string
          status?: Database["public"]["Enums"]["order_status"]
          store_id?: string | null
          total_amount?: number
          user_id: string
        }
        Update: {
          cost_price?: number
          created_at?: string
          customer_id?: string | null
          discount?: number
          discount_type?: string
          id?: string
          meta?: Json | null
          notes?: string | null
          payment_currency?: string
          payment_method?: string
          payment_status?: string
          source?: string
          status?: Database["public"]["Enums"]["order_status"]
          store_id?: string | null
          total_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_gateways: {
        Row: {
          api_config: Json | null
          created_at: string
          currency: string
          gateway_name: string
          gateway_type: string
          icon_url: string | null
          id: string
          is_active: boolean
          mode: string
          payment_details: Json | null
          qr_code_url: string | null
          required_fields: Json
          sort_order: number
          updated_at: string
        }
        Insert: {
          api_config?: Json | null
          created_at?: string
          currency?: string
          gateway_name?: string
          gateway_type?: string
          icon_url?: string | null
          id?: string
          is_active?: boolean
          mode?: string
          payment_details?: Json | null
          qr_code_url?: string | null
          required_fields?: Json
          sort_order?: number
          updated_at?: string
        }
        Update: {
          api_config?: Json | null
          created_at?: string
          currency?: string
          gateway_name?: string
          gateway_type?: string
          icon_url?: string | null
          id?: string
          is_active?: boolean
          mode?: string
          payment_details?: Json | null
          qr_code_url?: string | null
          required_fields?: Json
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      plan_history: {
        Row: {
          action: string | null
          changed_by: string | null
          created_at: string | null
          id: string
          new_plan: string | null
          new_volume: number | null
          old_plan: string | null
          old_volume: number | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action?: string | null
          changed_by?: string | null
          created_at?: string | null
          id?: string
          new_plan?: string | null
          new_volume?: number | null
          old_plan?: string | null
          old_volume?: number | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string | null
          changed_by?: string | null
          created_at?: string | null
          id?: string
          new_plan?: string | null
          new_volume?: number | null
          old_plan?: string | null
          old_volume?: number | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      plan_payments: {
        Row: {
          admin_notes: string | null
          amount: number
          created_at: string
          currency: string
          expires_at: string | null
          gateway_id: string | null
          id: string
          payment_data: Json
          plan: string
          proof_url: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          store_id: string | null
          transaction_id: string | null
          user_id: string
        }
        Insert: {
          admin_notes?: string | null
          amount?: number
          created_at?: string
          currency?: string
          expires_at?: string | null
          gateway_id?: string | null
          id?: string
          payment_data?: Json
          plan?: string
          proof_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          store_id?: string | null
          transaction_id?: string | null
          user_id: string
        }
        Update: {
          admin_notes?: string | null
          amount?: number
          created_at?: string
          currency?: string
          expires_at?: string | null
          gateway_id?: string | null
          id?: string
          payment_data?: Json
          plan?: string
          proof_url?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          store_id?: string | null
          transaction_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_payments_gateway_id_fkey"
            columns: ["gateway_id"]
            isOneToOne: false
            referencedRelation: "payment_gateways"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_payments_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      plans_config: {
        Row: {
          created_at: string | null
          customer_limit: number
          id: string
          plan_type: string
          price_inr: number
          product_limit: number
          store_limit: number
          updated_at: string | null
          volume: number
        }
        Insert: {
          created_at?: string | null
          customer_limit?: number
          id?: string
          plan_type: string
          price_inr?: number
          product_limit?: number
          store_limit?: number
          updated_at?: string | null
          volume?: number
        }
        Update: {
          created_at?: string | null
          customer_limit?: number
          id?: string
          plan_type?: string
          price_inr?: number
          product_limit?: number
          store_limit?: number
          updated_at?: string | null
          volume?: number
        }
        Relationships: []
      }
      platform_coupons: {
        Row: {
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          is_active: boolean
          max_uses: number
          used_count: number
        }
        Insert: {
          code: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number
          used_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_uses?: number
          used_count?: number
        }
        Relationships: []
      }
      product_variations: {
        Row: {
          created_at: string
          duration_days: number
          id: string
          is_subscription: boolean
          name: string
          price: number
          product_id: string
          sort_order: number
          stock: number
        }
        Insert: {
          created_at?: string
          duration_days?: number
          id?: string
          is_subscription?: boolean
          name?: string
          price?: number
          product_id: string
          sort_order?: number
          stock?: number
        }
        Update: {
          created_at?: string
          duration_days?: number
          id?: string
          is_subscription?: boolean
          name?: string
          price?: number
          product_id?: string
          sort_order?: number
          stock?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_variations_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          base_cost: number
          category: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          price: number
          sku: string | null
          stock: number
          store_id: string | null
          type: Database["public"]["Enums"]["product_type"]
          user_id: string
        }
        Insert: {
          base_cost?: number
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          price?: number
          sku?: string | null
          stock?: number
          store_id?: string | null
          type?: Database["public"]["Enums"]["product_type"]
          user_id: string
        }
        Update: {
          base_cost?: number
          category?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          price?: number
          sku?: string | null
          stock?: number
          store_id?: string | null
          type?: Database["public"]["Enums"]["product_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          email?: string
          id: string
          name?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      purchase_items: {
        Row: {
          id: string
          product_id: string | null
          purchase_id: string
          quantity: number
          total_cost: number
          unit_cost: number
        }
        Insert: {
          id?: string
          product_id?: string | null
          purchase_id: string
          quantity?: number
          total_cost?: number
          unit_cost?: number
        }
        Update: {
          id?: string
          product_id?: string | null
          purchase_id?: string
          quantity?: number
          total_cost?: number
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_items_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      purchases: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          paid_amount: number
          payment_method: string
          payment_status: string
          purchase_date: string
          store_id: string
          supplier_id: string | null
          total_amount: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          paid_amount?: number
          payment_method?: string
          payment_status?: string
          purchase_date?: string
          store_id: string
          supplier_id?: string | null
          total_amount?: number
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          paid_amount?: number
          payment_method?: string
          payment_status?: string
          purchase_date?: string
          store_id?: string
          supplier_id?: string | null
          total_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchases_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          device_label: string | null
          endpoint: string
          id: string
          last_used_at: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          device_label?: string | null
          endpoint: string
          id?: string
          last_used_at?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          device_label?: string | null
          endpoint?: string
          id?: string
          last_used_at?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      referral_settings: {
        Row: {
          commission_rate: number
          created_at: string
          id: string
          min_withdraw: number
          pending_balance: number
          referral_code: string
          total_clicks: number
          total_earnings: number
          user_id: string
        }
        Insert: {
          commission_rate?: number
          created_at?: string
          id?: string
          min_withdraw?: number
          pending_balance?: number
          referral_code?: string
          total_clicks?: number
          total_earnings?: number
          user_id: string
        }
        Update: {
          commission_rate?: number
          created_at?: string
          id?: string
          min_withdraw?: number
          pending_balance?: number
          referral_code?: string
          total_clicks?: number
          total_earnings?: number
          user_id?: string
        }
        Relationships: []
      }
      referral_withdrawals: {
        Row: {
          account_number: string
          amount: number
          created_at: string
          id: string
          method: string
          notes: string | null
          status: string
          user_id: string
        }
        Insert: {
          account_number?: string
          amount?: number
          created_at?: string
          id?: string
          method?: string
          notes?: string | null
          status?: string
          user_id: string
        }
        Update: {
          account_number?: string
          amount?: number
          created_at?: string
          id?: string
          method?: string
          notes?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      referrals: {
        Row: {
          commission_amount: number
          created_at: string
          id: string
          is_paid: boolean
          plan: string
          referred_email: string
          referred_user_id: string | null
          referrer_id: string
          status: string
        }
        Insert: {
          commission_amount?: number
          created_at?: string
          id?: string
          is_paid?: boolean
          plan?: string
          referred_email?: string
          referred_user_id?: string | null
          referrer_id: string
          status?: string
        }
        Update: {
          commission_amount?: number
          created_at?: string
          id?: string
          is_paid?: boolean
          plan?: string
          referred_email?: string
          referred_user_id?: string | null
          referrer_id?: string
          status?: string
        }
        Relationships: []
      }
      refunds: {
        Row: {
          created_at: string
          id: string
          order_id: string
          reason: string | null
          refund_amount: number
          refund_items: Json
          refund_type: string
          status: string
          store_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          reason?: string | null
          refund_amount?: number
          refund_items?: Json
          refund_type?: string
          status?: string
          store_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          reason?: string | null
          refund_amount?: number
          refund_items?: Json
          refund_type?: string
          status?: string
          store_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      renewal_automation_config: {
        Row: {
          created_at: string
          id: string
          is_active: boolean | null
          is_auto_mode: boolean | null
          reminder_days: Json | null
          schedule_time: string | null
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          is_auto_mode?: boolean | null
          reminder_days?: Json | null
          schedule_time?: string | null
          store_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean | null
          is_auto_mode?: boolean | null
          reminder_days?: Json | null
          schedule_time?: string | null
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "renewal_automation_config_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: true
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      renewal_email_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          is_active: boolean | null
          store_id: string
          subject: string
          template_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          store_id: string
          subject?: string
          template_type: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          is_active?: boolean | null
          store_id?: string
          subject?: string
          template_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "renewal_email_templates_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      renewal_reminders: {
        Row: {
          channel: string
          created_at: string
          customer_id: string | null
          error_message: string | null
          expiry_date: string | null
          id: string
          product_name: string | null
          recipient_email: string | null
          recipient_name: string | null
          reminder_type: string
          sent_at: string | null
          status: string
          store_id: string
          subscription_id: string
          user_id: string
        }
        Insert: {
          channel?: string
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          expiry_date?: string | null
          id?: string
          product_name?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          reminder_type: string
          sent_at?: string | null
          status?: string
          store_id: string
          subscription_id: string
          user_id: string
        }
        Update: {
          channel?: string
          created_at?: string
          customer_id?: string | null
          error_message?: string | null
          expiry_date?: string | null
          id?: string
          product_name?: string | null
          recipient_email?: string | null
          recipient_name?: string | null
          reminder_type?: string
          sent_at?: string | null
          status?: string
          store_id?: string
          subscription_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "renewal_reminders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_reminders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "renewal_reminders_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_members: {
        Row: {
          auth_user_id: string | null
          created_at: string
          email: string
          id: string
          is_active: boolean
          name: string
          permissions: Json
          phone: string
          role: string
          store_id: string | null
          user_id: string
        }
        Insert: {
          auth_user_id?: string | null
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          name?: string
          permissions?: Json
          phone?: string
          role?: string
          store_id?: string | null
          user_id: string
        }
        Update: {
          auth_user_id?: string | null
          created_at?: string
          email?: string
          id?: string
          is_active?: boolean
          name?: string
          permissions?: Json
          phone?: string
          role?: string
          store_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_members_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      staff_messages: {
        Row: {
          created_at: string
          deleted_for: string[] | null
          file_name: string | null
          file_url: string | null
          id: string
          is_deleted_for_everyone: boolean | null
          is_read: boolean
          message: string
          message_type: string
          reactions: Json | null
          receiver_id: string
          reply_to_id: string | null
          sender_id: string
          store_id: string
          task_status: string | null
          task_title: string | null
        }
        Insert: {
          created_at?: string
          deleted_for?: string[] | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          is_deleted_for_everyone?: boolean | null
          is_read?: boolean
          message?: string
          message_type?: string
          reactions?: Json | null
          receiver_id: string
          reply_to_id?: string | null
          sender_id: string
          store_id: string
          task_status?: string | null
          task_title?: string | null
        }
        Update: {
          created_at?: string
          deleted_for?: string[] | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          is_deleted_for_everyone?: boolean | null
          is_read?: boolean
          message?: string
          message_type?: string
          reactions?: Json | null
          receiver_id?: string
          reply_to_id?: string | null
          sender_id?: string
          store_id?: string
          task_status?: string | null
          task_title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_messages_reply_to_id_fkey"
            columns: ["reply_to_id"]
            isOneToOne: false
            referencedRelation: "staff_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_messages_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_alerts: {
        Row: {
          alert_type: string
          created_at: string
          id: string
          is_resolved: boolean
          product_id: string
          store_id: string
          threshold: number
          user_id: string
        }
        Insert: {
          alert_type?: string
          created_at?: string
          id?: string
          is_resolved?: boolean
          product_id: string
          store_id: string
          threshold?: number
          user_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          id?: string
          is_resolved?: boolean
          product_id?: string
          store_id?: string
          threshold?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_alerts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_alerts_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      stores: {
        Row: {
          address: string
          created_at: string
          id: string
          is_active: boolean
          is_default: boolean
          name: string
          phone: string
          store_mode: string
          user_id: string
        }
        Insert: {
          address?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          phone?: string
          store_mode?: string
          user_id: string
        }
        Update: {
          address?: string
          created_at?: string
          id?: string
          is_active?: boolean
          is_default?: boolean
          name?: string
          phone?: string
          store_mode?: string
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          billing_type: string | null
          cost_price: number
          customer_id: string | null
          end_date: string | null
          id: string
          notes: string | null
          plan: Database["public"]["Enums"]["subscription_plan"]
          price: number
          product_name: string
          renewals: number
          start_date: string
          status: string
          store_id: string | null
          user_id: string
          variation: string
          volume: number | null
        }
        Insert: {
          billing_type?: string | null
          cost_price?: number
          customer_id?: string | null
          end_date?: string | null
          id?: string
          notes?: string | null
          plan?: Database["public"]["Enums"]["subscription_plan"]
          price?: number
          product_name?: string
          renewals?: number
          start_date?: string
          status?: string
          store_id?: string | null
          user_id: string
          variation?: string
          volume?: number | null
        }
        Update: {
          billing_type?: string | null
          cost_price?: number
          customer_id?: string | null
          end_date?: string | null
          id?: string
          notes?: string | null
          plan?: Database["public"]["Enums"]["subscription_plan"]
          price?: number
          product_name?: string
          renewals?: number
          start_date?: string
          status?: string
          store_id?: string | null
          user_id?: string
          variation?: string
          volume?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      suppliers: {
        Row: {
          address: string | null
          balance_due: number
          created_at: string
          email: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          store_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          balance_due?: number
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          store_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          balance_due?: number
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          store_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "suppliers_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      support_messages: {
        Row: {
          attachment_url: string | null
          created_at: string
          id: string
          message: string
          sender_type: string
          ticket_id: string
          user_id: string
        }
        Insert: {
          attachment_url?: string | null
          created_at?: string
          id?: string
          message?: string
          sender_type?: string
          ticket_id: string
          user_id: string
        }
        Update: {
          attachment_url?: string | null
          created_at?: string
          id?: string
          message?: string
          sender_type?: string
          ticket_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_messages_ticket_id_fkey"
            columns: ["ticket_id"]
            isOneToOne: false
            referencedRelation: "support_tickets"
            referencedColumns: ["id"]
          },
        ]
      }
      support_tickets: {
        Row: {
          attachment_url: string | null
          category: string
          created_at: string
          description: string
          id: string
          priority: string
          status: string
          store_id: string | null
          subject: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attachment_url?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          priority?: string
          status?: string
          store_id?: string | null
          subject?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attachment_url?: string | null
          category?: string
          created_at?: string
          description?: string
          id?: string
          priority?: string
          status?: string
          store_id?: string | null
          subject?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_tickets_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          priority: string
          status: string
          store_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          store_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          status?: string
          store_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          amount: number
          category: string | null
          created_at: string
          due_date: string | null
          id: string
          is_paid: boolean
          note: string | null
          store_id: string | null
          type: Database["public"]["Enums"]["transaction_type"]
          user_id: string
        }
        Insert: {
          amount?: number
          category?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          is_paid?: boolean
          note?: string | null
          store_id?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
          user_id: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string
          due_date?: string | null
          id?: string
          is_paid?: boolean
          note?: string | null
          store_id?: string | null
          type?: Database["public"]["Enums"]["transaction_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "stores"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_staff_limit: { Args: { _plan: string }; Returns: number }
      get_staff_owner_id: { Args: never; Returns: string }
      get_user_plan: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_chat_group_member: {
        Args: { _group_id: string; _user_id: string }
        Returns: boolean
      }
      is_store_member: { Args: { _store_id: string }; Returns: boolean }
      is_store_owner: {
        Args: { _store_id: string; _user_id: string }
        Returns: boolean
      }
      store_has_min_plan: {
        Args: { _min_plan: string; _store_id: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      integration_type: "woocommerce" | "whatsapp"
      order_status: "pending" | "completed" | "cancelled"
      product_type: "digital" | "physical"
      subscription_plan: "free" | "pro" | "business"
      transaction_type: "income" | "expense"
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
      app_role: ["admin", "user"],
      integration_type: ["woocommerce", "whatsapp"],
      order_status: ["pending", "completed", "cancelled"],
      product_type: ["digital", "physical"],
      subscription_plan: ["free", "pro", "business"],
      transaction_type: ["income", "expense"],
    },
  },
} as const
