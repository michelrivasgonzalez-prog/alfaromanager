import { useEffect, useState } from "react";
import { useCuadreStore, PUNTOS, SALARIO_MODOS, SalarioModo } from "@/store/cuadreStore";
import { usePinStore } from "@/store/pinStore";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Coffee, Store as StoreIcon, Percent, Cloud, CloudOff, RefreshCw, Trash2, Wifi } from "lucide-react";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/NumberInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { fullSync } from "@/lib/sync";

export default function Ajustes() {
  const { history, settings, setSalarioBasePunto, updateSettings } = useCuadreStore();
  const { role } = useAuth();
  const { logout } = usePinStore();
  const isAdmin = role === "admin";

  const [cloudUser, setCloudUser] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showCloudForm, setShowCloudForm] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Detect existing cloud session
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setCloudUser(data.session?.user.email ?? null);
    });
  }, []);

  const connectCloud = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      let { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error && error.message.toLowerCase().includes("invalid")) {
        // Intentar registrar
        const r = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (r.error) throw r.error;
        toast.success("Cuenta creada en la nube. Revisa tu correo si pide confirmación.");
      } else if (error) throw error;
      const { data } = await supabase.auth.getSession();
      setCloudUser(data.session?.user.email ?? email);
      setShowCloudForm(false);
      toast.success("Conectado a la nube");
    } catch (err: any) {
      toast.error(err.message || "Error");
    } finally {
      setBusy(false);
    }
  };

  const disconnectCloud = async () => {
    await supabase.auth.signOut();
    setCloudUser(null);
    toast.success("Desconectado de la nube");
  };

  const sync = async () => {
    if (!navigator.onLine) {
      toast.error("Sin conexión a internet");
      return;
    }
    if (!cloudUser) {
      toast.error("Conecta tu cuenta de nube primero");
      return;
    }
    setBusy(true);
    try {
      await fullSync("admin");
      toast.success("Sincronización completa");
    } catch (err: any) {
      toast.error("Error de sync: " + (err.message || ""));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Ajustes</h1>

      {/* Estado de conexión */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-2">
        <div className="flex items-center gap-2 text-sm">
          <Wifi className={`h-4 w-4 ${navigator.onLine ? "text-secondary" : "text-muted-foreground"}`} />
          <span className="font-semibold">{navigator.onLine ? "En línea" : "Sin conexión"}</span>
          <span className="ml-auto text-xs text-muted-foreground">Modo offline siempre activo</span>
        </div>
      </div>

      {/* Nube (solo admin) */}
      {isAdmin && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
          <div className="flex items-center gap-2">
            {cloudUser ? <Cloud className="h-4 w-4 text-secondary" /> : <CloudOff className="h-4 w-4 text-muted-foreground" />}
            <div className="text-sm font-semibold">Sincronización con la nube</div>
          </div>
          {cloudUser ? (
            <>
              <div className="text-xs text-muted-foreground">
                Conectado como <span className="font-medium text-foreground">{cloudUser}</span>
              </div>
              <div className="flex gap-2">
                <Button onClick={sync} disabled={busy} className="flex-1 rounded-xl gradient-emerald">
                  <RefreshCw className={`mr-1 h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Sincronizar
                </Button>
                <Button variant="outline" onClick={disconnectCloud} className="rounded-xl">
                  Desconectar
                </Button>
              </div>
            </>
          ) : showCloudForm ? (
            <form onSubmit={connectCloud} className="space-y-2">
              <Input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                type="password"
                placeholder="Contraseña (mín 6)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
              />
              <div className="flex gap-2">
                <Button type="submit" disabled={busy} className="flex-1 rounded-xl gradient-primary">
                  Conectar
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowCloudForm(false)}>
                  Cancelar
                </Button>
              </div>
            </form>
          ) : (
            <>
              <p className="text-xs text-muted-foreground">
                Opcional. Solo el admin lo necesita. Sirve para respaldar y compartir entre dispositivos.
              </p>
              <Button onClick={() => setShowCloudForm(true)} className="w-full rounded-xl gradient-primary">
                Conectar a la nube
              </Button>
            </>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
          <div>
            <div className="text-sm font-semibold">Salario de dependientes</div>
            <div className="text-xs text-muted-foreground">
              Configura modo, base por día y % de venta por punto. Se aplica al iniciar nuevos cuadres.
            </div>
          </div>
          <div className="space-y-4">
            {PUNTOS.map((p) => {
              const Icon = p === "Cafetería" ? Coffee : StoreIcon;
              const modo = settings.salarioModo?.[p] ?? "base";
              return (
                <div key={p} className="rounded-xl border border-border/60 bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center gap-1 text-sm font-semibold">
                    <Icon className="h-4 w-4" /> {p}
                  </div>
                  <div>
                    <Label className="text-xs">Modo de cálculo</Label>
                    <Select
                      value={modo}
                      onValueChange={(v) =>
                        updateSettings({
                          salarioModo: { ...settings.salarioModo, [p]: v as SalarioModo },
                        })
                      }
                    >
                      <SelectTrigger className="mt-1 h-11 rounded-xl">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-popover">
                        {SALARIO_MODOS.map((m) => (
                          <SelectItem key={m.value} value={m.value}>
                            {m.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {SALARIO_MODOS.find((m) => m.value === modo)?.desc}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Base/día</Label>
                      <NumberInput
                        value={settings.salarioBase[p]}
                        onChange={(v) => setSalarioBasePunto(p, v)}
                        className="mt-1 h-11 rounded-xl"
                        disabled={modo === "porcentaje"}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">% de venta</Label>
                      <NumberInput
                        value={settings.porcentajeVenta?.[p] ?? 3}
                        onChange={(v) =>
                          updateSettings({
                            porcentajeVenta: { ...settings.porcentajeVenta, [p]: v },
                          })
                        }
                        className="mt-1 h-11 rounded-xl"
                        disabled={modo === "base"}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            <Label className="flex items-center gap-1 text-xs">
              <Percent className="h-3.5 w-3.5" /> Cargo por transferencia (%)
            </Label>
            <NumberInput
              value={settings.porcentajeTransferencia}
              onChange={(v) => updateSettings({ porcentajeTransferencia: v })}
              className="mt-1 h-11 rounded-xl"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Predeterminado al registrar un gasto tipo Transferencia.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
        <Row label="Cuadres en historial" value={String(history.length)} />
        <Row label="Versión" value="1.0.0" />
      </div>

      {isAdmin && (
        <Button
          variant="destructive"
          className="w-full rounded-xl"
          onClick={() => {
            if (confirm("¿Borrar TODOS los datos locales (cuadres, productos, usuarios PIN)? Esta acción no se puede deshacer.")) {
              localStorage.removeItem("alfarocafe-store");
              localStorage.removeItem("alfarocafe-pin");
              logout();
              toast.success("Datos borrados");
              setTimeout(() => location.reload(), 600);
            }
          }}
        >
          <Trash2 className="mr-1 h-4 w-4" /> Borrar todos los datos
        </Button>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
