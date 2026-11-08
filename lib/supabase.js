// lib/supabase.js
// Inicialización del cliente de Supabase para MECAFUT 2026

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Modo de desarrollo local explícito / Sandbox
export const isExplicitLocalMode =
  process.env.NEXT_PUBLIC_LOCAL_DEV === "true" ||
  (process.env.NODE_ENV !== "production" && !Boolean(supabaseUrl && supabaseAnonKey && supabaseUrl.startsWith("http")));

// Si se activa NEXT_PUBLIC_LOCAL_DEV="true", se desacopla Supabase para operar en Sandbox aislado sin tocar la DB real
export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith("http") &&
  process.env.NEXT_PUBLIC_LOCAL_DEV !== "true"
);

// Error de configuración de producción si no hay Supabase y tampoco modo local explícito
export const isProductionConfigMissing = !isSupabaseConfigured && !isExplicitLocalMode;

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: false
      }
    })
  : null;
