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
      abono_aplicaciones: {
        Row: {
          abono_id: string
          created_at: string
          deuda_id: string
          id: string
          monto: number
        }
        Insert: {
          abono_id: string
          created_at?: string
          deuda_id: string
          id?: string
          monto: number
        }
        Update: {
          abono_id?: string
          created_at?: string
          deuda_id?: string
          id?: string
          monto?: number
        }
        Relationships: [
          {
            foreignKeyName: "abono_aplicaciones_abono_id_fkey"
            columns: ["abono_id"]
            isOneToOne: false
            referencedRelation: "abonos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abono_aplicaciones_deuda_id_fkey"
            columns: ["deuda_id"]
            isOneToOne: false
            referencedRelation: "deudas"
            referencedColumns: ["id"]
          },
        ]
      }
      abonos: {
        Row: {
          cliente_id: string
          created_at: string
          deleted_at: string | null
          fecha: string
          id: string
          monto: number
          nota: string | null
          reversa_de: string | null
          updated_at: string
          usuario_id: string | null
          usuario_nombre: string | null
        }
        Insert: {
          cliente_id: string
          created_at?: string
          deleted_at?: string | null
          fecha?: string
          id?: string
          monto: number
          nota?: string | null
          reversa_de?: string | null
          updated_at?: string
          usuario_id?: string | null
          usuario_nombre?: string | null
        }
        Update: {
          cliente_id?: string
          created_at?: string
          deleted_at?: string | null
          fecha?: string
          id?: string
          monto?: number
          nota?: string | null
          reversa_de?: string | null
          updated_at?: string
          usuario_id?: string | null
          usuario_nombre?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "abonos_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "abonos_reversa_de_fkey"
            columns: ["reversa_de"]
            isOneToOne: false
            referencedRelation: "abonos"
            referencedColumns: ["id"]
          },
        ]
      }
      almacen_movimientos: {
        Row: {
          cantidad: number
          created_at: string
          created_by: string | null
          deleted_at: string | null
          fecha: string
          id: string
          observacion: string | null
          producto_id: string
          receptor: string | null
          reversion_de: string | null
          tipo: Database["public"]["Enums"]["movimiento_tipo"]
          updated_at: string
        }
        Insert: {
          cantidad: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          fecha?: string
          id?: string
          observacion?: string | null
          producto_id: string
          receptor?: string | null
          reversion_de?: string | null
          tipo: Database["public"]["Enums"]["movimiento_tipo"]
          updated_at?: string
        }
        Update: {
          cantidad?: number
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          fecha?: string
          id?: string
          observacion?: string | null
          producto_id?: string
          receptor?: string | null
          reversion_de?: string | null
          tipo?: Database["public"]["Enums"]["movimiento_tipo"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "almacen_movimientos_producto_id_fkey"
            columns: ["producto_id"]
            isOneToOne: false
            referencedRelation: "almacen_productos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "almacen_movimientos_reversion_de_fkey"
            columns: ["reversion_de"]
            isOneToOne: false
            referencedRelation: "almacen_movimientos"
            referencedColumns: ["id"]
          },
        ]
      }
      almacen_productos: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          nombre: string
          permite_negativo: boolean
          stock_minimo: number
          unidad: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          nombre: string
          permite_negativo?: boolean
          stock_minimo?: number
          unidad?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          nombre?: string
          permite_negativo?: boolean
          stock_minimo?: number
          unidad?: string
          updated_at?: string
        }
        Relationships: []
      }
      auditoria: {
        Row: {
          accion: string
          detalle: Json | null
          entidad: string
          entidad_id: string | null
          fecha: string
          id: string
          usuario_id: string | null
          usuario_nombre: string | null
        }
        Insert: {
          accion: string
          detalle?: Json | null
          entidad: string
          entidad_id?: string | null
          fecha?: string
          id?: string
          usuario_id?: string | null
          usuario_nombre?: string | null
        }
        Update: {
          accion?: string
          detalle?: Json | null
          entidad?: string
          entidad_id?: string | null
          fecha?: string
          id?: string
          usuario_id?: string | null
          usuario_nombre?: string | null
        }
        Relationships: []
      }
      catalogo: {
        Row: {
          costo: number
          created_at: string
          deleted_at: string | null
          id: string
          nombre: string
          orden: number
          precio: number
          punto: string | null
          updated_at: string
        }
        Insert: {
          costo?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          nombre: string
          orden?: number
          precio?: number
          punto?: string | null
          updated_at?: string
        }
        Update: {
          costo?: number
          created_at?: string
          deleted_at?: string | null
          id?: string
          nombre?: string
          orden?: number
          precio?: number
          punto?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      clientes: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          nombre: string
          observaciones: string | null
          telefono: string | null
          updated_at: string
          uso_count: number
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          nombre: string
          observaciones?: string | null
          telefono?: string | null
          updated_at?: string
          uso_count?: number
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          nombre?: string
          observaciones?: string | null
          telefono?: string | null
          updated_at?: string
          uso_count?: number
        }
        Relationships: []
      }
      cuadres: {
        Row: {
          created_at: string
          created_by: string | null
          data: Json
          deleted_at: string | null
          dependiente: string | null
          fecha: string
          finalizado: boolean
          id: string
          punto_venta: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          data: Json
          deleted_at?: string | null
          dependiente?: string | null
          fecha?: string
          finalizado?: boolean
          id?: string
          punto_venta: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          data?: Json
          deleted_at?: string | null
          dependiente?: string | null
          fecha?: string
          finalizado?: boolean
          id?: string
          punto_venta?: string
          updated_at?: string
        }
        Relationships: []
      }
      dependientes: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          nombre: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          nombre: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      deudas: {
        Row: {
          cliente_id: string
          created_at: string
          cuadre_id: string | null
          cuadre_label: string | null
          deleted_at: string | null
          estado: Database["public"]["Enums"]["deuda_estado"]
          fecha: string
          id: string
          productos: Json
          saldo: number
          total: number
          updated_at: string
        }
        Insert: {
          cliente_id: string
          created_at?: string
          cuadre_id?: string | null
          cuadre_label?: string | null
          deleted_at?: string | null
          estado?: Database["public"]["Enums"]["deuda_estado"]
          fecha?: string
          id?: string
          productos?: Json
          saldo: number
          total: number
          updated_at?: string
        }
        Update: {
          cliente_id?: string
          created_at?: string
          cuadre_id?: string | null
          cuadre_label?: string | null
          deleted_at?: string | null
          estado?: Database["public"]["Enums"]["deuda_estado"]
          fecha?: string
          id?: string
          productos?: Json
          saldo?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deudas_cliente_id_fkey"
            columns: ["cliente_id"]
            isOneToOne: false
            referencedRelation: "clientes"
            referencedColumns: ["id"]
          },
        ]
      }
      pin_users: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          nombre: string
          pin_hash: string
          recovery_email: string | null
          role: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id: string
          nombre: string
          pin_hash: string
          recovery_email?: string | null
          role: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          nombre?: string
          pin_hash?: string
          recovery_email?: string | null
          role?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          nombre: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id: string
          nombre?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          nombre?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      registrar_abono: {
        Args: {
          _aplicaciones: Json
          _cliente_id: string
          _fecha?: string
          _monto: number
          _nota?: string
          _usuario_id?: string
          _usuario_nombre?: string
        }
        Returns: string
      }
      revertir_abono: {
        Args: {
          _abono_id: string
          _nota?: string
          _usuario_id?: string
          _usuario_nombre?: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "duena" | "dependiente"
      deuda_estado: "pendiente" | "parcial" | "pagada"
      movimiento_tipo: "entrada" | "salida"
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
      app_role: ["admin", "duena", "dependiente"],
      deuda_estado: ["pendiente", "parcial", "pagada"],
      movimiento_tipo: ["entrada", "salida"],
    },
  },
} as const
