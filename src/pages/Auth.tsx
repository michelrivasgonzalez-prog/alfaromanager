import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { Coffee } from "lucide-react";

export default function Auth() {
  const { session, loading } = useAuth();
  const nav = useNavigate();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nombre, setNombre] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) nav("/", { replace: true });
  }, [session, nav]);

  if (loading) return null;
  if (session) return <Navigate to="/" replace />;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { nombre },
          },
        });
        if (error) throw error;
        toast.success("Cuenta creada. Revisa tu email para confirmarla.");
        setMode("login");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Sesión iniciada");
      }
    } catch (err: any) {
      toast.error(err.message || "Error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen gradient-warm flex items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-elegant">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl gradient-primary text-primary-foreground">
            <Coffee className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold">AlFaroCafé</h1>
          <p className="text-sm text-muted-foreground">
            {mode === "login" ? "Inicia sesión" : "Crea tu cuenta"}
          </p>
        </div>
        <form onSubmit={submit} className="space-y-3">
          {mode === "signup" && (
            <div className="space-y-1">
              <Label>Nombre</Label>
              <Input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
            </div>
          )}
          <div className="space-y-1">
            <Label>Email</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="space-y-1">
            <Label>Contraseña</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </div>
          <Button
            type="submit"
            disabled={busy}
            className="h-11 w-full rounded-xl gradient-primary text-primary-foreground"
          >
            {busy ? "..." : mode === "login" ? "Entrar" : "Crear cuenta"}
          </Button>
        </form>
        <button
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          className="mt-4 w-full text-center text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "login"
            ? "¿No tienes cuenta? Regístrate"
            : "¿Ya tienes cuenta? Inicia sesión"}
        </button>
        <p className="mt-4 text-[11px] text-center text-muted-foreground">
          El primer usuario que se registre será el administrador.
        </p>
      </div>
    </div>
  );
}