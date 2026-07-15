import { supabase } from "@/integrations/supabase/client";

/**
 * Sincronización compartida sin correo.
 *
 * Estrategia: cada dispositivo abre una sesión anónima en Supabase.
 * Las políticas RLS de las tablas de negocio son `USING(true)` para
 * usuarios autenticados, por lo que TODOS los dispositivos comparten
 * los mismos datos (una sola cuenta lógica del negocio).
 *
 * Ventajas:
 *  - No pide correo ni contraseña.
 *  - Multi-dispositivo out-of-the-box.
 *  - Sincronización automática al arrancar la app.
 */
let ensuring: Promise<boolean> | null = null;

export async function ensureCloudSession(): Promise<boolean> {
  if (ensuring) return ensuring;
  ensuring = (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) return true;
      const { error } = await supabase.auth.signInAnonymously();
      if (error) {
        console.warn("Cloud session unavailable:", error.message);
        return false;
      }
      return true;
    } catch (e) {
      console.warn("Cloud bootstrap error:", e);
      return false;
    } finally {
      // permitir reintento en próxima llamada
      setTimeout(() => (ensuring = null), 2000);
    }
  })();
  return ensuring;
}
