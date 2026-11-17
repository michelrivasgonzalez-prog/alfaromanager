import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { entrarCaja, useSesionCaja } from "@/lib/cajaSobrantes";

export function SesionCaja({ children }: { children: ReactNode }) {
  const cuenta = useSesionCaja((s) => s.cuenta);
  const [error, setError] = useState("");
  const [ocupado, setOcupado] = useState(false);

  if (cuenta) return <>{children}</>;

  async function entrar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setOcupado(true);
    setError("");
    try {
      await entrarCaja(String(form.get("email")).trim(), String(form.get("password")));
    } catch (error) {
      setError(error instanceof Error ? error.message : "No se pudo iniciar sesión");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <form onSubmit={entrar} className="space-y-3 rounded-xl border bg-card p-4">
      <p className="text-sm text-muted-foreground">Inicia sesión con tu cuenta autorizada de Caja de Sobrantes.</p>
      <label className="block space-y-1 text-sm">
        <span>Correo</span>
        <Input name="email" type="email" autoComplete="username" required />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Contraseña</span>
        <Input name="password" type="password" autoComplete="current-password" required />
      </label>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button disabled={ocupado} type="submit">{ocupado ? "Ingresando…" : "Entrar a caja"}</Button>
    </form>
  );
}
