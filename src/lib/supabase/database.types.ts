// Gerado por `npm run tipos:banco` a partir das migrações (Supabase local). Não edite à mão:
// a CI regenera e falha se este arquivo estiver diferente.

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      app_config: {
        Row: {
          key: string;
          updated_at: string;
          value: string;
        };
        ComputedFields: never;
        Insert: {
          key: string;
          updated_at?: string;
          value: string;
        };
        Update: {
          key?: string;
          updated_at?: string;
          value?: string;
        };
        Relationships: [];
      };
      bookings: {
        Row: {
          airline: string;
          amount_cents: number | null;
          channel: string;
          created_at: string;
          currency: string;
          id: string;
          locator: string | null;
          miles: number | null;
          notes: string | null;
          purchased_on: string | null;
          seller: string | null;
          source: string;
          status: string;
          tag: string;
          taxes_cents: number | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          airline?: string;
          amount_cents?: number | null;
          channel?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          locator?: string | null;
          miles?: number | null;
          notes?: string | null;
          purchased_on?: string | null;
          seller?: string | null;
          source?: string;
          status?: string;
          tag?: string;
          taxes_cents?: number | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          airline?: string;
          amount_cents?: number | null;
          channel?: string;
          created_at?: string;
          currency?: string;
          id?: string;
          locator?: string | null;
          miles?: number | null;
          notes?: string | null;
          purchased_on?: string | null;
          seller?: string | null;
          source?: string;
          status?: string;
          tag?: string;
          taxes_cents?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      extracoes: {
        Row: {
          criado_em: string;
          id: number;
          modelo: string;
          motivo_parada: string | null;
          origem: string;
          reforco: boolean;
          resultado: string;
          tokens_cache_escrita: number;
          tokens_cache_leitura: number;
          tokens_entrada: number;
          tokens_saida: number;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          criado_em?: string;
          id?: never;
          modelo: string;
          motivo_parada?: string | null;
          origem: string;
          reforco?: boolean;
          resultado: string;
          tokens_cache_escrita?: number;
          tokens_cache_leitura?: number;
          tokens_entrada?: number;
          tokens_saida?: number;
          user_id: string;
        };
        Update: {
          criado_em?: string;
          id?: never;
          modelo?: string;
          motivo_parada?: string | null;
          origem?: string;
          reforco?: boolean;
          resultado?: string;
          tokens_cache_escrita?: number;
          tokens_cache_leitura?: number;
          tokens_entrada?: number;
          tokens_saida?: number;
          user_id?: string;
        };
        Relationships: [];
      };
      flights: {
        Row: {
          airline: string;
          arrives_at: string | null;
          booking_id: string;
          checkin_done: boolean;
          created_at: string;
          departs_at: string;
          destination: string;
          flight_number: string | null;
          id: string;
          ignore_missing_leg: boolean;
          ignore_missing_return: boolean;
          origin: string;
          passenger: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          airline?: string;
          arrives_at?: string | null;
          booking_id: string;
          checkin_done?: boolean;
          created_at?: string;
          departs_at: string;
          destination: string;
          flight_number?: string | null;
          id?: string;
          ignore_missing_leg?: boolean;
          ignore_missing_return?: boolean;
          origin: string;
          passenger?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          airline?: string;
          arrives_at?: string | null;
          booking_id?: string;
          checkin_done?: boolean;
          created_at?: string;
          departs_at?: string;
          destination?: string;
          flight_number?: string | null;
          id?: string;
          ignore_missing_leg?: boolean;
          ignore_missing_return?: boolean;
          origin?: string;
          passenger?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "flights_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
        ];
      };
      holiday_overrides: {
        Row: {
          action: string;
          created_at: string;
          date: string;
          event_key: string | null;
          id: string;
          kind: string | null;
          name: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          action: string;
          created_at?: string;
          date: string;
          event_key?: string | null;
          id?: string;
          kind?: string | null;
          name?: string | null;
          user_id: string;
        };
        Update: {
          action?: string;
          created_at?: string;
          date?: string;
          event_key?: string | null;
          id?: string;
          kind?: string | null;
          name?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      import_candidates: {
        Row: {
          booking_id: string | null;
          created_at: string;
          decided_at: string | null;
          draft: NonNullable<Json>;
          id: string;
          message_id: string;
          received_at: string | null;
          status: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          booking_id?: string | null;
          created_at?: string;
          decided_at?: string | null;
          draft: NonNullable<Json>;
          id?: string;
          message_id: string;
          received_at?: string | null;
          status?: string;
          user_id: string;
        };
        Update: {
          booking_id?: string | null;
          created_at?: string;
          decided_at?: string | null;
          draft?: NonNullable<Json>;
          id?: string;
          message_id?: string;
          received_at?: string | null;
          status?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "import_candidates_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "import_candidates_message_id_fkey";
            columns: ["message_id"];
            isOneToOne: false;
            referencedRelation: "mail_messages";
            referencedColumns: ["id"];
          },
        ];
      };
      mail_accounts: {
        Row: {
          auto_sync: boolean;
          connected_at: string;
          email: string | null;
          history_id: string | null;
          last_error: string | null;
          last_refresh_ok_at: string | null;
          last_sync_at: string | null;
          provider: string;
          status: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          auto_sync?: boolean;
          connected_at?: string;
          email?: string | null;
          history_id?: string | null;
          last_error?: string | null;
          last_refresh_ok_at?: string | null;
          last_sync_at?: string | null;
          provider?: string;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          auto_sync?: boolean;
          connected_at?: string;
          email?: string | null;
          history_id?: string | null;
          last_error?: string | null;
          last_refresh_ok_at?: string | null;
          last_sync_at?: string | null;
          provider?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      mail_messages: {
        Row: {
          attempts: number;
          class: string | null;
          created_at: string;
          error: string | null;
          id: string;
          provider_message_id: string;
          received_at: string | null;
          scan_id: string | null;
          sender_domain: string | null;
          status: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          attempts?: number;
          class?: string | null;
          created_at?: string;
          error?: string | null;
          id?: string;
          provider_message_id: string;
          received_at?: string | null;
          scan_id?: string | null;
          sender_domain?: string | null;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          attempts?: number;
          class?: string | null;
          created_at?: string;
          error?: string | null;
          id?: string;
          provider_message_id?: string;
          received_at?: string | null;
          scan_id?: string | null;
          sender_domain?: string | null;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "mail_messages_scan_id_fkey";
            columns: ["scan_id"];
            isOneToOne: false;
            referencedRelation: "mail_scans";
            referencedColumns: ["id"];
          },
        ];
      };
      mail_scans: {
        Row: {
          confirmed_at: string | null;
          created_at: string;
          finished_at: string | null;
          id: string;
          kind: string;
          last_error: string | null;
          page_token: string | null;
          query_index: number;
          status: string;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          confirmed_at?: string | null;
          created_at?: string;
          finished_at?: string | null;
          id?: string;
          kind?: string;
          last_error?: string | null;
          page_token?: string | null;
          query_index?: number;
          status?: string;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          confirmed_at?: string | null;
          created_at?: string;
          finished_at?: string | null;
          id?: string;
          kind?: string;
          last_error?: string | null;
          page_token?: string | null;
          query_index?: number;
          status?: string;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      notification_log: {
        Row: {
          attempts: number;
          channels: string[];
          event_key: string;
          id: string;
          last_attempt_at: string | null;
          last_error: string | null;
          sent_at: string;
          status: string;
          title: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          attempts?: number;
          channels?: string[];
          event_key: string;
          id?: string;
          last_attempt_at?: string | null;
          last_error?: string | null;
          sent_at?: string;
          status?: string;
          title: string;
          user_id: string;
        };
        Update: {
          attempts?: number;
          channels?: string[];
          event_key?: string;
          id?: string;
          last_attempt_at?: string | null;
          last_error?: string | null;
          sent_at?: string;
          status?: string;
          title?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      price_alerts: {
        Row: {
          airline: string;
          attempts: number;
          booking_url: string | null;
          channels: string[];
          created_at: string;
          departs_local: string;
          flight_date: string;
          flight_number: string | null;
          id: string;
          last_attempt_at: string | null;
          last_error: string | null;
          monitor_id: string;
          price_cents: number;
          sent_at: string | null;
          signals: string[];
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          airline: string;
          attempts?: number;
          booking_url?: string | null;
          channels?: string[];
          created_at?: string;
          departs_local: string;
          flight_date: string;
          flight_number?: string | null;
          id?: string;
          last_attempt_at?: string | null;
          last_error?: string | null;
          monitor_id: string;
          price_cents: number;
          sent_at?: string | null;
          signals?: string[];
          user_id: string;
        };
        Update: {
          airline?: string;
          attempts?: number;
          booking_url?: string | null;
          channels?: string[];
          created_at?: string;
          departs_local?: string;
          flight_date?: string;
          flight_number?: string | null;
          id?: string;
          last_attempt_at?: string | null;
          last_error?: string | null;
          monitor_id?: string;
          price_cents?: number;
          sent_at?: string | null;
          signals?: string[];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "price_alerts_monitor_id_fkey";
            columns: ["monitor_id"];
            isOneToOne: false;
            referencedRelation: "price_monitors";
            referencedColumns: ["id"];
          },
        ];
      };
      price_checks: {
        Row: {
          checked_at: string;
          dates_in_window: number;
          dates_matched: number;
          dates_with_data: number;
          error: string | null;
          failed: number;
          id: string;
          min_near_holiday: boolean;
          min_price_cents: number | null;
          monitor_id: string;
          near_dates: number;
          near_in_window: number;
          near_provider: string | null;
          near_requests: number;
          near_skipped: string | null;
          near_tp_in_window: number;
          near_tp_with_data: number;
          near_with_data: number;
          provider: string;
          requests: number;
          target_dates: number;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          checked_at?: string;
          dates_in_window?: number;
          dates_matched?: number;
          dates_with_data?: number;
          error?: string | null;
          failed?: number;
          id?: string;
          min_near_holiday?: boolean;
          min_price_cents?: number | null;
          monitor_id: string;
          near_dates?: number;
          near_in_window?: number;
          near_provider?: string | null;
          near_requests?: number;
          near_skipped?: string | null;
          near_tp_in_window?: number;
          near_tp_with_data?: number;
          near_with_data?: number;
          provider: string;
          requests?: number;
          target_dates?: number;
          user_id: string;
        };
        Update: {
          checked_at?: string;
          dates_in_window?: number;
          dates_matched?: number;
          dates_with_data?: number;
          error?: string | null;
          failed?: number;
          id?: string;
          min_near_holiday?: boolean;
          min_price_cents?: number | null;
          monitor_id?: string;
          near_dates?: number;
          near_in_window?: number;
          near_provider?: string | null;
          near_requests?: number;
          near_skipped?: string | null;
          near_tp_in_window?: number;
          near_tp_with_data?: number;
          near_with_data?: number;
          provider?: string;
          requests?: number;
          target_dates?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "price_checks_monitor_id_fkey";
            columns: ["monitor_id"];
            isOneToOne: false;
            referencedRelation: "price_monitors";
            referencedColumns: ["id"];
          },
        ];
      };
      price_monitors: {
        Row: {
          active: boolean;
          airlines: string[];
          allow_connections: boolean;
          created_at: string;
          destination: string;
          frequency: string;
          horizon_weeks: number;
          id: string;
          kind: string;
          last_checked_at: string | null;
          last_error: string | null;
          long_weekend: string | null;
          margin_cents: number | null;
          margin_pct: number | null;
          max_duration_min: number | null;
          name: string | null;
          next_check_at: string | null;
          origin: string;
          provider: string;
          rule: NonNullable<Json>;
          target_cents: number;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          airlines?: string[];
          allow_connections?: boolean;
          created_at?: string;
          destination: string;
          frequency?: string;
          horizon_weeks?: number;
          id?: string;
          kind: string;
          last_checked_at?: string | null;
          last_error?: string | null;
          long_weekend?: string | null;
          margin_cents?: number | null;
          margin_pct?: number | null;
          max_duration_min?: number | null;
          name?: string | null;
          next_check_at?: string | null;
          origin: string;
          provider?: string;
          rule: NonNullable<Json>;
          target_cents: number;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          active?: boolean;
          airlines?: string[];
          allow_connections?: boolean;
          created_at?: string;
          destination?: string;
          frequency?: string;
          horizon_weeks?: number;
          id?: string;
          kind?: string;
          last_checked_at?: string | null;
          last_error?: string | null;
          long_weekend?: string | null;
          margin_cents?: number | null;
          margin_pct?: number | null;
          max_duration_min?: number | null;
          name?: string | null;
          next_check_at?: string | null;
          origin?: string;
          provider?: string;
          rule?: NonNullable<Json>;
          target_cents?: number;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      price_observations: {
        Row: {
          airline: string;
          booking_url: string | null;
          check_id: string | null;
          currency: string;
          departs_local: string;
          duration_min: number | null;
          flight_date: string;
          flight_number: string | null;
          found_at: string | null;
          id: string;
          monitor_id: string;
          near_holiday: boolean;
          observed_at: string;
          price_cents: number;
          provider: string;
          transfers: number;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          airline: string;
          booking_url?: string | null;
          check_id?: string | null;
          currency?: string;
          departs_local: string;
          duration_min?: number | null;
          flight_date: string;
          flight_number?: string | null;
          found_at?: string | null;
          id?: string;
          monitor_id: string;
          near_holiday?: boolean;
          observed_at?: string;
          price_cents: number;
          provider: string;
          transfers?: number;
          user_id: string;
        };
        Update: {
          airline?: string;
          booking_url?: string | null;
          check_id?: string | null;
          currency?: string;
          departs_local?: string;
          duration_min?: number | null;
          flight_date?: string;
          flight_number?: string | null;
          found_at?: string | null;
          id?: string;
          monitor_id?: string;
          near_holiday?: boolean;
          observed_at?: string;
          price_cents?: number;
          provider?: string;
          transfers?: number;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "price_observations_check_id_fkey";
            columns: ["check_id"];
            isOneToOne: false;
            referencedRelation: "price_checks";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "price_observations_monitor_id_fkey";
            columns: ["monitor_id"];
            isOneToOne: false;
            referencedRelation: "price_monitors";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          city_ibge: string | null;
          created_at: string;
          display_name: string | null;
          email: string | null;
          holiday_city: string | null;
          home_city: string | null;
          id: string;
          jewish_israel: boolean;
          notify_email: boolean;
          notify_push: boolean;
          notify_telegram: boolean;
          original_retention_days: number;
          quiet_hours_end: string;
          quiet_hours_start: string;
          show_christian_holidays: boolean;
          show_jewish_holidays: boolean;
          show_optional_holidays: boolean;
          timezone: string;
          uf: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          city_ibge?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          holiday_city?: string | null;
          home_city?: string | null;
          id: string;
          jewish_israel?: boolean;
          notify_email?: boolean;
          notify_push?: boolean;
          notify_telegram?: boolean;
          original_retention_days?: number;
          quiet_hours_end?: string;
          quiet_hours_start?: string;
          show_christian_holidays?: boolean;
          show_jewish_holidays?: boolean;
          show_optional_holidays?: boolean;
          timezone?: string;
          uf?: string | null;
          updated_at?: string;
        };
        Update: {
          city_ibge?: string | null;
          created_at?: string;
          display_name?: string | null;
          email?: string | null;
          holiday_city?: string | null;
          home_city?: string | null;
          id?: string;
          jewish_israel?: boolean;
          notify_email?: boolean;
          notify_push?: boolean;
          notify_telegram?: boolean;
          original_retention_days?: number;
          quiet_hours_end?: string;
          quiet_hours_start?: string;
          show_christian_holidays?: boolean;
          show_jewish_holidays?: boolean;
          show_optional_holidays?: boolean;
          timezone?: string;
          uf?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: string;
          last_seen_at: string;
          p256dh: string;
          user_agent: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          last_seen_at?: string;
          p256dh: string;
          user_agent?: string | null;
          user_id: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          last_seen_at?: string;
          p256dh?: string;
          user_agent?: string | null;
          user_id?: string;
        };
        Relationships: [];
      };
      refunds_credits: {
        Row: {
          amount_cents: number;
          booking_id: string | null;
          created_at: string;
          currency: string;
          expires_on: string | null;
          id: string;
          issued_on: string;
          kind: string;
          notes: string | null;
          provider: string | null;
          remaining_cents: number | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount_cents: number;
          booking_id?: string | null;
          created_at?: string;
          currency?: string;
          expires_on?: string | null;
          id?: string;
          issued_on?: string;
          kind: string;
          notes?: string | null;
          provider?: string | null;
          remaining_cents?: number | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          amount_cents?: number;
          booking_id?: string | null;
          created_at?: string;
          currency?: string;
          expires_on?: string | null;
          id?: string;
          issued_on?: string;
          kind?: string;
          notes?: string | null;
          provider?: string | null;
          remaining_cents?: number | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "refunds_credits_booking_id_fkey";
            columns: ["booking_id"];
            isOneToOne: false;
            referencedRelation: "bookings";
            referencedColumns: ["id"];
          },
        ];
      };
      registro_falhas: {
        Row: {
          criado_em: string;
          id: number;
          mensagem: string;
          origem: string;
        };
        ComputedFields: never;
        Insert: {
          criado_em?: string;
          id?: never;
          mensagem: string;
          origem: string;
        };
        Update: {
          criado_em?: string;
          id?: never;
          mensagem?: string;
          origem?: string;
        };
        Relationships: [];
      };
      telegram_links: {
        Row: {
          chat_id: number | null;
          link_token: string | null;
          linked_at: string | null;
          token_expires_at: string | null;
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          chat_id?: number | null;
          link_token?: string | null;
          linked_at?: string | null;
          token_expires_at?: string | null;
          updated_at?: string;
          user_id: string;
        };
        Update: {
          chat_id?: number | null;
          link_token?: string | null;
          linked_at?: string | null;
          token_expires_at?: string | null;
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [];
      };
      user_integrations: {
        Row: {
          created_at: string;
          encrypted_key: string;
          id: string;
          key_hint: string;
          provider: string;
          status: string;
          updated_at: string;
          user_id: string;
          validated_at: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          encrypted_key: string;
          id?: string;
          key_hint: string;
          provider: string;
          status?: string;
          updated_at?: string;
          user_id: string;
          validated_at?: string | null;
        };
        Update: {
          created_at?: string;
          encrypted_key?: string;
          id?: string;
          key_hint?: string;
          provider?: string;
          status?: string;
          updated_at?: string;
          user_id?: string;
          validated_at?: string | null;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_valid_timezone: { Args: { tz: string }; Returns: boolean };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
