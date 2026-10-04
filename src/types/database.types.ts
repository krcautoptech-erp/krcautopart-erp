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
      app_permissions: {
        Row: {
          action_code: string
          created_at: string
          id: number
          module_code: string
          module_name: string
          module_sort_order: number
          permission_code: string
          permission_name: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          action_code: string
          created_at?: string
          id?: never
          module_code: string
          module_name: string
          module_sort_order?: number
          permission_code: string
          permission_name: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          action_code?: string
          created_at?: string
          id?: never
          module_code?: string
          module_name?: string
          module_sort_order?: number
          permission_code?: string
          permission_name?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      app_roles: {
        Row: {
          created_at: string
          description: string | null
          id: number
          is_owner: boolean
          is_system: boolean
          role_code: string
          role_name: string
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: never
          is_owner?: boolean
          is_system?: boolean
          role_code: string
          role_name: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: never
          is_owner?: boolean
          is_system?: boolean
          role_code?: string
          role_name?: string
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      company_branches: {
        Row: {
          address_line: string
          branch_code: string
          branch_name: string
          company_id: string
          created_at: string
          created_by: string | null
          district: string | null
          email: string | null
          id: string
          is_head_office: boolean
          is_registered_address: boolean
          phone: string | null
          postal_code: string | null
          province: string | null
          status: string
          subdistrict: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address_line: string
          branch_code: string
          branch_name: string
          company_id: string
          created_at?: string
          created_by?: string | null
          district?: string | null
          email?: string | null
          id?: string
          is_head_office?: boolean
          is_registered_address?: boolean
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          status?: string
          subdistrict?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address_line?: string
          branch_code?: string
          branch_name?: string
          company_id?: string
          created_at?: string
          created_by?: string | null
          district?: string | null
          email?: string | null
          id?: string
          is_head_office?: boolean
          is_registered_address?: boolean
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          status?: string
          subdistrict?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_branches_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "company_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_document_settings: {
        Row: {
          company_id: string
          created_at: string
          footer_text_en: string | null
          footer_text_th: string | null
          header_field_order: string[]
          header_style: string
          logo_width_mm: number
          show_address: boolean
          show_email: boolean
          show_phone: boolean
          show_tax_id: boolean
          show_website: boolean
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          company_id: string
          created_at?: string
          footer_text_en?: string | null
          footer_text_th?: string | null
          header_field_order?: string[]
          header_style?: string
          logo_width_mm?: number
          show_address?: boolean
          show_email?: boolean
          show_phone?: boolean
          show_tax_id?: boolean
          show_website?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          company_id?: string
          created_at?: string
          footer_text_en?: string | null
          footer_text_th?: string | null
          header_field_order?: string[]
          header_style?: string
          logo_width_mm?: number
          show_address?: boolean
          show_email?: boolean
          show_phone?: boolean
          show_tax_id?: boolean
          show_website?: boolean
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "company_document_settings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: true
            referencedRelation: "company_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      company_profiles: {
        Row: {
          address_line: string | null
          branch_code: string
          branch_type: string
          company_code: string
          created_at: string
          created_by: string | null
          dark_logo_mode: string
          district: string | null
          email: string | null
          id: string
          is_default: boolean
          legal_name_en: string | null
          legal_name_th: string
          logo_dark_path: string | null
          logo_light_path: string | null
          phone: string | null
          postal_code: string | null
          province: string | null
          status: string
          subdistrict: string | null
          tax_id: string | null
          updated_at: string
          updated_by: string | null
          website: string | null
        }
        Insert: {
          address_line?: string | null
          branch_code?: string
          branch_type?: string
          company_code: string
          created_at?: string
          created_by?: string | null
          dark_logo_mode?: string
          district?: string | null
          email?: string | null
          id?: string
          is_default?: boolean
          legal_name_en?: string | null
          legal_name_th: string
          logo_dark_path?: string | null
          logo_light_path?: string | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          status?: string
          subdistrict?: string | null
          tax_id?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Update: {
          address_line?: string | null
          branch_code?: string
          branch_type?: string
          company_code?: string
          created_at?: string
          created_by?: string | null
          dark_logo_mode?: string
          district?: string | null
          email?: string | null
          id?: string
          is_default?: boolean
          legal_name_en?: string | null
          legal_name_th?: string
          logo_dark_path?: string | null
          logo_light_path?: string | null
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          status?: string
          subdistrict?: string | null
          tax_id?: string | null
          updated_at?: string
          updated_by?: string | null
          website?: string | null
        }
        Relationships: []
      }
      customer_addresses: {
        Row: {
          address_line: string
          address_name: string
          building: string | null
          contact_name: string | null
          country: string | null
          created_at: string
          customer_id: number
          district: string | null
          floor: string | null
          house_no: string | null
          id: number
          is_default: boolean
          phone: string | null
          postal_code: string | null
          province: string | null
          road: string | null
          status: string
          subdistrict: string | null
          updated_at: string
        }
        Insert: {
          address_line: string
          address_name: string
          building?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          customer_id: number
          district?: string | null
          floor?: string | null
          house_no?: string | null
          id?: never
          is_default?: boolean
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          road?: string | null
          status?: string
          subdistrict?: string | null
          updated_at?: string
        }
        Update: {
          address_line?: string
          address_name?: string
          building?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          customer_id?: number
          district?: string | null
          floor?: string | null
          house_no?: string | null
          id?: never
          is_default?: boolean
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          road?: string | null
          status?: string
          subdistrict?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          branch: string | null
          contact_name: string | null
          created_by: string | null
          created_at: string
          credit_term_id: number
          customer_code: string
          customer_name: string
          customer_type_id: number
          email: string | null
          id: number
          phone: string | null
          remark: string | null
          status: string
          tax_no: string
          tax_type_id: number
          updated_at: string
        }
        Insert: {
          branch?: string | null
          contact_name?: string | null
          created_by?: string | null
          created_at?: string
          credit_term_id: number
          customer_code: string
          customer_name: string
          customer_type_id: number
          email?: string | null
          id?: never
          phone?: string | null
          remark?: string | null
          status?: string
          tax_no: string
          tax_type_id: number
          updated_at?: string
        }
        Update: {
          branch?: string | null
          contact_name?: string | null
          created_by?: string | null
          created_at?: string
          credit_term_id?: number
          customer_code?: string
          customer_name?: string
          customer_type_id?: number
          email?: string | null
          id?: never
          phone?: string | null
          remark?: string | null
          status?: string
          tax_no?: string
          tax_type_id?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_credit_term_id_fkey"
            columns: ["credit_term_id"]
            isOneToOne: false
            referencedRelation: "vendor_credit_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_customer_type_id_fkey"
            columns: ["customer_type_id"]
            isOneToOne: false
            referencedRelation: "partner_customer_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_tax_type_id_fkey"
            columns: ["tax_type_id"]
            isOneToOne: false
            referencedRelation: "vendor_tax_types"
            referencedColumns: ["id"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          created_by: string | null
          department_code: string
          department_name: string
          id: number
          manager_user_id: string | null
          remarks: string | null
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department_code: string
          department_name: string
          id?: never
          manager_user_id?: string | null
          remarks?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department_code?: string
          department_name?: string
          id?: never
          manager_user_id?: string | null
          remarks?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      notification_recipients: {
        Row: {
          created_at: string
          notification_id: number
          read_at: string | null
          recipient_user_id: string
        }
        Insert: {
          created_at?: string
          notification_id: number
          read_at?: string | null
          recipient_user_id: string
        }
        Update: {
          created_at?: string
          notification_id?: number
          read_at?: string | null
          recipient_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_recipients_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_url: string | null
          created_at: string
          created_by: string | null
          entity_id: number | null
          entity_type: string | null
          event_key: string
          id: number
          message: string
          notification_type: string
          title: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: number | null
          entity_type?: string | null
          event_key?: string
          id?: never
          message: string
          notification_type: string
          title: string
        }
        Update: {
          action_url?: string | null
          created_at?: string
          created_by?: string | null
          entity_id?: number | null
          entity_type?: string | null
          event_key?: string
          id?: never
          message?: string
          notification_type?: string
          title?: string
        }
        Relationships: []
      }
      partner_customer_types: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: number
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: never
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: never
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          cost_price: number | null
          created_at: string
          erp_code: string | null
          id: string
          material: string | null
          model: string | null
          part_name: string
          part_number: string
          parts_per_sheet: number | null
          plating: string | null
          primary_image: string | null
          selling_price: number | null
          sheet_count: number | null
          status: string
          std_no: string | null
          unit: string
        }
        Insert: {
          cost_price?: number | null
          created_at?: string
          erp_code?: string | null
          id?: string
          material?: string | null
          model?: string | null
          part_name: string
          part_number: string
          parts_per_sheet?: number | null
          plating?: string | null
          primary_image?: string | null
          selling_price?: number | null
          sheet_count?: number | null
          status?: string
          std_no?: string | null
          unit?: string
        }
        Update: {
          cost_price?: number | null
          created_at?: string
          erp_code?: string | null
          id?: string
          material?: string | null
          model?: string | null
          part_name?: string
          part_number?: string
          parts_per_sheet?: number | null
          plating?: string | null
          primary_image?: string | null
          selling_price?: number | null
          sheet_count?: number | null
          status?: string
          std_no?: string | null
          unit?: string
        }
        Relationships: []
      }
      purchase_order_items: {
        Row: {
          created_at: string
          delivery_date: string | null
          discount_amount: number
          id: number
          item_code: string | null
          item_description: string | null
          item_name: string
          line_no: number
          line_subtotal: number | null
          line_total: number | null
          pr_number: string
          purchase_order_id: number
          quantity: number
          raw_material_id: number | null
          remarks: string | null
          requisition_id: number
          requisition_item_id: number
          tax_amount: number | null
          tax_rate: number
          unit_name: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_date?: string | null
          discount_amount?: number
          id?: never
          item_code?: string | null
          item_description?: string | null
          item_name: string
          line_no: number
          line_subtotal?: number | null
          line_total?: number | null
          pr_number: string
          purchase_order_id: number
          quantity: number
          raw_material_id?: number | null
          remarks?: string | null
          requisition_id: number
          requisition_item_id: number
          tax_amount?: number | null
          tax_rate?: number
          unit_name: string
          unit_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_date?: string | null
          discount_amount?: number
          id?: never
          item_code?: string | null
          item_description?: string | null
          item_name?: string
          line_no?: number
          line_subtotal?: number | null
          line_total?: number | null
          pr_number?: string
          purchase_order_id?: number
          quantity?: number
          raw_material_id?: number | null
          remarks?: string | null
          requisition_id?: number
          requisition_item_id?: number
          tax_amount?: number | null
          tax_rate?: number
          unit_name?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_items_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_raw_material_id_fkey"
            columns: ["raw_material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_order_items_requisition_item_id_fkey"
            columns: ["requisition_item_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisition_items"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_order_status_logs: {
        Row: {
          actor_name: string | null
          actor_user_id: string | null
          created_at: string
          from_status: string | null
          id: number
          note: string | null
          purchase_order_id: number
          to_status: string
        }
        Insert: {
          actor_name?: string | null
          actor_user_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: never
          note?: string | null
          purchase_order_id: number
          to_status: string
        }
        Update: {
          actor_name?: string | null
          actor_user_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: never
          note?: string | null
          purchase_order_id?: number
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_status_logs_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          approved_at: string | null
          buyer_name: string
          buyer_user_id: string | null
          cancelled_at: string | null
          created_at: string
          created_by: string | null
          credit_term_id: number | null
          credit_term_name: string | null
          delivery_address: string | null
          delivery_date: string
          discount_amount: number
          document_date: string
          grand_total: number
          id: number
          item_count: number
          ordered_total_qty: number
          payment_method_id: number | null
          payment_method_name: string | null
          po_number: string
          pr_reference_text: string
          pr_references: string[]
          sent_at: string | null
          status: string
          submitted_at: string | null
          subtotal: number
          supplier_note: string | null
          tax_amount: number
          tax_type_id: number | null
          tax_type_name: string | null
          terms_and_conditions: string | null
          updated_at: string
          updated_by: string | null
          vendor_code: string
          vendor_id: number
          vendor_name: string
        }
        Insert: {
          approved_at?: string | null
          buyer_name: string
          buyer_user_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          credit_term_id?: number | null
          credit_term_name?: string | null
          delivery_address?: string | null
          delivery_date: string
          discount_amount?: number
          document_date?: string
          grand_total?: number
          id?: never
          item_count?: number
          ordered_total_qty?: number
          payment_method_id?: number | null
          payment_method_name?: string | null
          po_number: string
          pr_reference_text?: string
          pr_references?: string[]
          sent_at?: string | null
          status?: string
          submitted_at?: string | null
          subtotal?: number
          supplier_note?: string | null
          tax_amount?: number
          tax_type_id?: number | null
          tax_type_name?: string | null
          terms_and_conditions?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_code: string
          vendor_id: number
          vendor_name: string
        }
        Update: {
          approved_at?: string | null
          buyer_name?: string
          buyer_user_id?: string | null
          cancelled_at?: string | null
          created_at?: string
          created_by?: string | null
          credit_term_id?: number | null
          credit_term_name?: string | null
          delivery_address?: string | null
          delivery_date?: string
          discount_amount?: number
          document_date?: string
          grand_total?: number
          id?: never
          item_count?: number
          ordered_total_qty?: number
          payment_method_id?: number | null
          payment_method_name?: string | null
          po_number?: string
          pr_reference_text?: string
          pr_references?: string[]
          sent_at?: string | null
          status?: string
          submitted_at?: string | null
          subtotal?: number
          supplier_note?: string | null
          tax_amount?: number
          tax_type_id?: number | null
          tax_type_name?: string | null
          terms_and_conditions?: string | null
          updated_at?: string
          updated_by?: string | null
          vendor_code?: string
          vendor_id?: number
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_credit_term_id_fkey"
            columns: ["credit_term_id"]
            isOneToOne: false
            referencedRelation: "vendor_credit_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "vendor_payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_tax_type_id_fkey"
            columns: ["tax_type_id"]
            isOneToOne: false
            referencedRelation: "vendor_tax_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_orders_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requisition_approval_logs: {
        Row: {
          action: string
          actor_name: string | null
          actor_user_id: string | null
          created_at: string
          id: number
          note: string | null
          requisition_id: number
        }
        Insert: {
          action: string
          actor_name?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: never
          note?: string | null
          requisition_id: number
        }
        Update: {
          action?: string
          actor_name?: string | null
          actor_user_id?: string | null
          created_at?: string
          id?: never
          note?: string | null
          requisition_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requisition_approval_logs_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisitions"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requisition_items: {
        Row: {
          created_at: string
          id: number
          item_code: string | null
          item_description: string | null
          item_name: string
          item_type: string
          line_no: number
          needed_by_date: string | null
          quantity: number
          raw_material_id: number | null
          remarks: string | null
          requisition_id: number
          unit_id: number | null
          unit_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          item_code?: string | null
          item_description?: string | null
          item_name: string
          item_type?: string
          line_no: number
          needed_by_date?: string | null
          quantity: number
          raw_material_id?: number | null
          remarks?: string | null
          requisition_id: number
          unit_id?: number | null
          unit_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          item_code?: string | null
          item_description?: string | null
          item_name?: string
          item_type?: string
          line_no?: number
          needed_by_date?: string | null
          quantity?: number
          raw_material_id?: number | null
          remarks?: string | null
          requisition_id?: number
          unit_id?: number | null
          unit_name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_requisition_items_raw_material_id_fkey"
            columns: ["raw_material_id"]
            isOneToOne: false
            referencedRelation: "raw_materials"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requisition_items_requisition_id_fkey"
            columns: ["requisition_id"]
            isOneToOne: false
            referencedRelation: "purchase_requisitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "purchase_requisition_items_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "raw_material_units"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_requisitions: {
        Row: {
          approved_at: string | null
          cancelled_at: string | null
          closed_at: string | null
          created_at: string
          created_by: string | null
          department_name: string
          document_date: string
          id: number
          needed_by_date: string | null
          pr_number: string
          rejected_at: string | null
          remarks: string | null
          requested_item_count: number
          requested_total_qty: number
          requester_name: string
          status: string
          submitted_at: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approved_at?: string | null
          cancelled_at?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          department_name: string
          document_date?: string
          id?: never
          needed_by_date?: string | null
          pr_number: string
          rejected_at?: string | null
          remarks?: string | null
          requested_item_count?: number
          requested_total_qty?: number
          requester_name: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approved_at?: string | null
          cancelled_at?: string | null
          closed_at?: string | null
          created_at?: string
          created_by?: string | null
          department_name?: string
          document_date?: string
          id?: never
          needed_by_date?: string | null
          pr_number?: string
          rejected_at?: string | null
          remarks?: string | null
          requested_item_count?: number
          requested_total_qty?: number
          requester_name?: string
          status?: string
          submitted_at?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      raw_material_grades: {
        Row: {
          created_at: string
          grade_code: string
          grade_name: string
          id: number
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          grade_code: string
          grade_name: string
          id?: never
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          grade_code?: string
          grade_name?: string
          id?: never
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      raw_material_groups: {
        Row: {
          created_at: string
          group_code: string
          group_name: string
          id: number
          sort_order: number
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_code: string
          group_name: string
          id?: never
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_code?: string
          group_name?: string
          id?: never
          sort_order?: number
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      raw_material_units: {
        Row: {
          allows_decimal: boolean
          created_at: string
          id: number
          sort_order: number
          status: string
          symbol: string
          unit_code: string
          unit_name: string
          updated_at: string
        }
        Insert: {
          allows_decimal?: boolean
          created_at?: string
          id?: never
          sort_order?: number
          status?: string
          symbol: string
          unit_code: string
          unit_name: string
          updated_at?: string
        }
        Update: {
          allows_decimal?: boolean
          created_at?: string
          id?: never
          sort_order?: number
          status?: string
          symbol?: string
          unit_code?: string
          unit_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      raw_material_warehouses: {
        Row: {
          created_at: string
          id: number
          location_name: string | null
          remarks: string | null
          responsible_user_id: string | null
          sort_order: number
          status: string
          updated_at: string
          warehouse_code: string
          warehouse_name: string
          warehouse_type_id: number
        }
        Insert: {
          created_at?: string
          id?: never
          location_name?: string | null
          remarks?: string | null
          responsible_user_id?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
          warehouse_code: string
          warehouse_name: string
          warehouse_type_id: number
        }
        Update: {
          created_at?: string
          id?: never
          location_name?: string | null
          remarks?: string | null
          responsible_user_id?: string | null
          sort_order?: number
          status?: string
          updated_at?: string
          warehouse_code?: string
          warehouse_name?: string
          warehouse_type_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "raw_material_warehouses_warehouse_type_id_fkey"
            columns: ["warehouse_type_id"]
            isOneToOne: false
            referencedRelation: "warehouse_types"
            referencedColumns: ["id"]
          },
        ]
      }
      raw_materials: {
        Row: {
          created_at: string
          grade_id: number
          group_id: number
          id: number
          length_mm: number
          material_code: string
          material_name: string
          remark: string | null
          reorder_point: number | null
          status: string
          thickness_mm: number
          unit_id: number
          updated_at: string
          warehouse_id: number
          width_mm: number
        }
        Insert: {
          created_at?: string
          grade_id: number
          group_id: number
          id?: never
          length_mm: number
          material_code: string
          material_name: string
          remark?: string | null
          reorder_point?: number | null
          status?: string
          thickness_mm: number
          unit_id: number
          updated_at?: string
          warehouse_id: number
          width_mm: number
        }
        Update: {
          created_at?: string
          grade_id?: number
          group_id?: number
          id?: never
          length_mm?: number
          material_code?: string
          material_name?: string
          remark?: string | null
          reorder_point?: number | null
          status?: string
          thickness_mm?: number
          unit_id?: number
          updated_at?: string
          warehouse_id?: number
          width_mm?: number
        }
        Relationships: [
          {
            foreignKeyName: "raw_materials_grade_id_fkey"
            columns: ["grade_id"]
            isOneToOne: false
            referencedRelation: "raw_material_grades"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_materials_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "raw_material_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_materials_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "raw_material_units"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "raw_materials_warehouse_id_fkey"
            columns: ["warehouse_id"]
            isOneToOne: false
            referencedRelation: "raw_material_warehouses"
            referencedColumns: ["id"]
          },
        ]
      }
      role_permissions: {
        Row: {
          granted_at: string
          granted_by: string | null
          permission_id: number
          role_id: number
        }
        Insert: {
          granted_at?: string
          granted_by?: string | null
          permission_id: number
          role_id: number
        }
        Update: {
          granted_at?: string
          granted_by?: string | null
          permission_id?: number
          role_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "role_permissions_permission_id_fkey"
            columns: ["permission_id"]
            isOneToOne: false
            referencedRelation: "app_permissions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "role_permissions_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "app_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      system_audit_logs: {
        Row: {
          action_code: string
          action_label: string
          actor_name: string
          actor_role: string | null
          actor_user_id: string | null
          changed_fields: Json
          device_summary: string | null
          entity_id: string | null
          entity_number: string | null
          entity_type: string | null
          id: number
          ip_address_masked: string | null
          metadata: Json
          module_code: string
          module_name: string
          occurred_at: string
          outcome: string
          reason: string | null
          request_id: string | null
          severity: string
          source: string
          summary: string
        }
        Insert: {
          action_code: string
          action_label: string
          actor_name?: string
          actor_role?: string | null
          actor_user_id?: string | null
          changed_fields?: Json
          device_summary?: string | null
          entity_id?: string | null
          entity_number?: string | null
          entity_type?: string | null
          id?: never
          ip_address_masked?: string | null
          metadata?: Json
          module_code: string
          module_name: string
          occurred_at?: string
          outcome?: string
          reason?: string | null
          request_id?: string | null
          severity?: string
          source?: string
          summary: string
        }
        Update: {
          action_code?: string
          action_label?: string
          actor_name?: string
          actor_role?: string | null
          actor_user_id?: string | null
          changed_fields?: Json
          device_summary?: string | null
          entity_id?: string | null
          entity_number?: string | null
          entity_type?: string | null
          id?: never
          ip_address_masked?: string | null
          metadata?: Json
          module_code?: string
          module_name?: string
          occurred_at?: string
          outcome?: string
          reason?: string | null
          request_id?: string | null
          severity?: string
          source?: string
          summary?: string
        }
        Relationships: []
      }
      user_admin_audit_logs: {
        Row: {
          action_code: string
          actor_user_id: string | null
          created_at: string
          details: Json
          id: number
          target_user_id: string | null
        }
        Insert: {
          action_code: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          target_user_id?: string | null
        }
        Update: {
          action_code?: string
          actor_user_id?: string | null
          created_at?: string
          details?: Json
          id?: never
          target_user_id?: string | null
        }
        Relationships: []
      }
      user_departments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          department_id: number
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          department_id: number
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          department_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_departments_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["id"]
          },
        ]
      }
      warehouse_types: {
        Row: {
          created_at: string
          id: number
          remarks: string | null
          sort_order: number
          status: string
          type_code: string
          type_name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: never
          remarks?: string | null
          sort_order?: number
          status?: string
          type_code: string
          type_name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: never
          remarks?: string | null
          sort_order?: number
          status?: string
          type_code?: string
          type_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          approver_user_id: string | null
          created_at: string
          created_by: string | null
          employee_code: string | null
          employee_number: number
          first_name: string
          id: number
          last_name: string
          position_name: string | null
          status: string
          updated_at: string
          updated_by: string | null
          user_id: string
          username: string
        }
        Insert: {
          approver_user_id?: string | null
          created_at?: string
          created_by?: string | null
          employee_code?: string | null
          employee_number: number
          first_name: string
          id?: never
          last_name: string
          position_name?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
          username: string
        }
        Update: {
          approver_user_id?: string | null
          created_at?: string
          created_by?: string | null
          employee_code?: string | null
          employee_number?: number
          first_name?: string
          id?: never
          last_name?: string
          position_name?: string | null
          status?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
          username?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          role_id: number
          user_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          role_id: number
          user_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          role_id?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_role_id_fkey"
            columns: ["role_id"]
            isOneToOne: false
            referencedRelation: "app_roles"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_addresses: {
        Row: {
          address_line: string
          address_name: string
          building: string | null
          contact_name: string | null
          country: string | null
          created_at: string
          district: string | null
          floor: string | null
          house_no: string | null
          id: number
          is_default: boolean
          phone: string | null
          postal_code: string | null
          province: string | null
          road: string | null
          status: string
          subdistrict: string | null
          updated_at: string
          vendor_id: number
        }
        Insert: {
          address_line: string
          address_name: string
          building?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          district?: string | null
          floor?: string | null
          house_no?: string | null
          id?: never
          is_default?: boolean
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          road?: string | null
          status?: string
          subdistrict?: string | null
          updated_at?: string
          vendor_id: number
        }
        Update: {
          address_line?: string
          address_name?: string
          building?: string | null
          contact_name?: string | null
          country?: string | null
          created_at?: string
          district?: string | null
          floor?: string | null
          house_no?: string | null
          id?: never
          is_default?: boolean
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          road?: string | null
          status?: string
          subdistrict?: string | null
          updated_at?: string
          vendor_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "vendor_addresses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      vendor_credit_terms: {
        Row: {
          code: string
          created_at: string
          credit_days: number
          description: string | null
          id: number
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          credit_days?: number
          description?: string | null
          id?: never
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          credit_days?: number
          description?: string | null
          id?: never
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      vendor_groups: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: number
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: never
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: never
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      vendor_payment_methods: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: number
          name: string
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: never
          name: string
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: never
          name?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      vendor_tax_types: {
        Row: {
          code: string
          created_at: string
          description: string | null
          id: number
          name: string
          status: string
          tax_rate: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          id?: never
          name: string
          status?: string
          tax_rate?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          id?: never
          name?: string
          status?: string
          tax_rate?: number
          updated_at?: string
        }
        Relationships: []
      }
      vendors: {
        Row: {
          branch: string | null
          contact_name: string | null
          created_by: string | null
          created_at: string
          credit_term_id: number
          email: string | null
          id: number
          payment_method_id: number
          phone: string | null
          remark: string | null
          status: string
          tax_no: string
          tax_type_id: number
          updated_at: string
          vendor_code: string
          vendor_group_id: number
          vendor_name: string
        }
        Insert: {
          branch?: string | null
          contact_name?: string | null
          created_by?: string | null
          created_at?: string
          credit_term_id: number
          email?: string | null
          id?: never
          payment_method_id: number
          phone?: string | null
          remark?: string | null
          status?: string
          tax_no: string
          tax_type_id: number
          updated_at?: string
          vendor_code: string
          vendor_group_id: number
          vendor_name: string
        }
        Update: {
          branch?: string | null
          contact_name?: string | null
          created_by?: string | null
          created_at?: string
          credit_term_id?: number
          email?: string | null
          id?: never
          payment_method_id?: number
          phone?: string | null
          remark?: string | null
          status?: string
          tax_no?: string
          tax_type_id?: number
          updated_at?: string
          vendor_code?: string
          vendor_group_id?: number
          vendor_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "vendors_credit_term_id_fkey"
            columns: ["credit_term_id"]
            isOneToOne: false
            referencedRelation: "vendor_credit_terms"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "vendor_payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_tax_type_id_fkey"
            columns: ["tax_type_id"]
            isOneToOne: false
            referencedRelation: "vendor_tax_types"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "vendors_vendor_group_id_fkey"
            columns: ["vendor_group_id"]
            isOneToOne: false
            referencedRelation: "vendor_groups"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assert_user_admin_rate_limit: {
        Args: { p_action_code: string; p_max_operations?: number }
        Returns: undefined
      }
      authorize: { Args: { requested_permission: string }; Returns: boolean }
      create_app_role: {
        Args: {
          p_description?: string
          p_role_code: string
          p_role_name: string
        }
        Returns: number
      }
      create_department: {
        Args: {
          p_department_code: string
          p_department_name: string
          p_manager_user_id?: string
          p_remarks?: string
          p_status?: string
        }
        Returns: number
      }
      create_purchase_order: {
        Args: {
          p_delivery_address: string
          p_delivery_date: string
          p_document_date: string
          p_items: Json
          p_status: string
          p_supplier_note: string
          p_terms_and_conditions: string
          p_vendor_id: number
        }
        Returns: {
          purchase_order_id: number
          purchase_order_number: string
        }[]
      }
      create_user_profile: {
        Args: {
          p_approver_user_id?: string
          p_department_id: number
          p_first_name: string
          p_last_name: string
          p_position_name: string
          p_role_id: number
          p_user_id: string
          p_username: string
        }
        Returns: {
          employee_code: string
          profile_id: number
        }[]
      }
      decide_purchase_requisition: {
        Args: { p_decision: string; p_note?: string; p_requisition_id: number }
        Returns: {
          decision_status: string
          requisition_number: string
        }[]
      }
      review_purchase_requisition: {
        Args: { p_note?: string | null; p_outcome: string; p_requisition_id: number }
        Returns: {
          requisition_number: string
          review_outcome: string
        }[]
      }
      save_purchase_requisition_operational: {
        Args: {
          p_department_name: string
          p_document_date: string
          p_items: Json
          p_needed_by_date: string
          p_remarks: string | null
          p_requester_name: string
          p_requisition_id: number | null
          p_status: string
        }
        Returns: {
          requisition_id: number
          requisition_number: string
          requisition_status: string
        }[]
      }
      set_vendor_status: {
        Args: { p_status: string; p_vendor_id: number }
        Returns: Database["public"]["Tables"]["vendors"]["Row"]
      }
      decide_purchase_order: {
        Args: {
          p_decision: string
          p_note?: string
          p_purchase_order_id: number
        }
        Returns: {
          decision_status: string
          purchase_order_number: string
        }[]
      }
      delete_department: {
        Args: { p_department_id: number }
        Returns: undefined
      }
      delete_purchase_requisition_draft: {
        Args: { p_requisition_id: number }
        Returns: string
      }
      get_department_manager_candidates: {
        Args: never
        Returns: {
          display_name: string
          user_id: string
        }[]
      }
      get_document_push_targets: {
        Args: {
          p_entity_id: number
          p_event_key: string
          p_notification_type: string
        }
        Returns: {
          action_url: string
          auth_key: string
          endpoint: string
          message: string
          notification_id: number
          p256dh_key: string
          subscription_id: number
          title: string
        }[]
      }
      get_latest_purchase_prices: {
        Args: { p_requisition_item_ids: number[]; p_vendor_id: number }
        Returns: {
          document_date: string
          po_number: string
          requisition_item_id: number
          unit_price: number
        }[]
      }
      get_department_settings: {
        Args: never
        Returns: {
          department_code: string
          department_name: string
          id: number
          manager_name: string
          manager_user_id: string
          remarks: string
          status: string
          user_count: number
        }[]
      }
      get_public_company_branding: {
        Args: never
        Returns: {
          company_id: string
          dark_logo_mode: string
          legal_name_en: string
          legal_name_th: string
          logo_dark_path: string
          logo_light_path: string
          logo_updated_at: string
        }[]
      }
      get_user_management_options: { Args: never; Returns: Json }
      get_user_management_page: {
        Args: {
          p_department_id?: number
          p_page?: number
          p_page_size?: number
          p_role_id?: number
          p_search?: string
          p_status?: string
        }
        Returns: {
          approver_user_id: string
          department_code: string
          department_id: number
          department_name: string
          employee_code: string
          first_name: string
          last_name: string
          last_sign_in_at: string
          position_name: string
          role_code: string
          role_id: number
          role_name: string
          status: string
          total_count: number
          user_id: string
          username: string
        }[]
      }
      is_current_user_active: { Args: never; Returns: boolean }
      is_current_user_owner: { Args: never; Returns: boolean }
      record_user_password_reset: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      record_audit_log_access: {
        Args: { p_action: string }
        Returns: undefined
      }
      report_invalid_document_push_subscription: {
        Args: {
          p_entity_id: number
          p_event_key: string
          p_notification_type: string
          p_status_code: number
          p_subscription_id: number
        }
        Returns: undefined
      }
      replace_role_permissions: {
        Args: { p_permission_ids: number[]; p_role_id: number }
        Returns: undefined
      }
      reserve_business_number: {
        Args: { p_effective_date?: string; p_series_key: string }
        Returns: {
          allocation_id: number
          business_number: string
        }[]
      }
      reserve_raw_material_code: { Args: never; Returns: string }
      save_company_settings: {
        Args: {
          p_company_id: string
          p_document_settings: Json
          p_logo_dark_path?: string
          p_logo_light_path?: string
          p_profile: Json
        }
        Returns: undefined
      }
      save_purchase_requisition: {
        Args: {
          p_department_name: string
          p_document_date: string
          p_items: Json
          p_needed_by_date: string
          p_remarks: string | null
          p_requester_name: string
          p_requisition_id: number | null
          p_status: string
        }
        Returns: {
          requisition_id: number
          requisition_number: string
          requisition_status: string
        }[]
      }
      search_purchase_order_source_items: {
        Args: { p_limit?: number; p_search?: string }
        Returns: {
          available_quantity: number
          item_code: string
          item_description: string
          item_name: string
          needed_by_date: string
          pr_number: string
          requested_quantity: number
          requisition_id: number
          requisition_item_id: number
          unit_name: string
        }[]
      }
      set_department_status: {
        Args: { p_department_id: number; p_status: string }
        Returns: undefined
      }
      set_user_profile_status: {
        Args: { p_status: string; p_user_id: string }
        Returns: undefined
      }
      submit_purchase_requisition: {
        Args: {
          p_department_name: string
          p_items: Json
          p_needed_by_date: string
          p_remarks: string
          p_requester_name: string
        }
        Returns: {
          requisition_id: number
          requisition_number: string
        }[]
      }
      test_ordinality_fn: {
        Args: { p_items: Json }
        Returns: {
          needed_by_date: string
          ordinality: number
          quantity: number
          raw_material_id: number
          remarks: string
        }[]
      }
      update_department: {
        Args: {
          p_department_code: string
          p_department_id: number
          p_department_name: string
          p_manager_user_id?: string
          p_remarks?: string
          p_status?: string
        }
        Returns: undefined
      }
      update_user_profile: {
        Args: {
          p_approver_user_id?: string
          p_department_id: number
          p_first_name: string
          p_last_name: string
          p_position_name: string
          p_role_id: number
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
    Enums: {},
  },
} as const
