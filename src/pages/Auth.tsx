import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Coffee, Mail, Cloud, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { PinPad } from "@/components/PinPad";
import { usePinStore } from "@/store/pinStore";
import { entrarConPinDeCaja } from "@/lib/cajaSobrantes";
import { ensureCloudSession } from "@/lib/cloudBootstrap";
import { pullPinUsers, syncPinUsers } from "@/lib/sync";

export default function Auth() {
  const nav = useNavigate();
  const { users, currentUserId, createUser, login } = usePinStore();
  const hasAdmin = users.some((u) => u.role === "admin");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checkingCloud, setCheckingCloud] = useState(true);

  // onboarding state
  const [step, setStep] = useState<"form" | "pin" | "confirm">("form");
  const [nombre, setNombre] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [showRecover, setShowRecover] = useState(false);

  // Al arrancar: si el dispositivo está vacío, intenta traer usuarios PIN
  // desde la nube. Si ya hay una cuenta creada allá, saltamos el onboarding
  // y mostramos la pantalla de PIN.
  useEffect(() => {
    (async () => {
      if (users.length > 0) {
        setCheckingCloud(false);
        return;
      }
      try {
        const ok = await ensureCloudSession();
        if (!ok) return;
        const remote = await pullPinUsers();
        if (remote.length > 0) {
          usePinStore.setState({ users: remote });
          toast.success("Cuenta encontrada en la nube. Ingresa tu PIN.");
        }
      } catch {
        // silencioso: sin red, seguirá el flujo local
      } finally {
        setCheckingCloud(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (currentUserId) nav("/", { replace: true });
  }, [currentUserId, nav]);

  if (currentUserId) return <Navigate to="/" replace />;

  if (checkingCloud && users.length === 0) {
    return (
      <Wrapper subtitle="Buscando cuenta en la nube…">
        <div className="flex flex-col items-center gap-3 py-6 text-muted-foreground">
          <RefreshCw className="h-6 w-6 animate-spin" />
          <p className="text-xs">Un momento…</p>
        </div>
      </Wrapper>
    );
  }

  // ---- Onboarding (no admin yet, local + cloud vacíos) ----
  if (!hasAdmin) {
    if (step === "form") {
      return (
        <Wrapper subtitle="Crea tu cuenta de administrador">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!nombre.trim() || !recoveryEmail.trim()) return;
              setStep("pin");
            }}
            className="space-y-3"
          >
            <div className="space-y-1">
              <Label>Tu nombre</Label>
              <Input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1">
              <Label className="flex items-center gap-1">
                <Mail className="h-3.5 w-3.5" /> Email de recuperación
              </Label>
              <Input
                type="email"
                value={recoveryEmail}
                onChange={(e) => setRecoveryEmail(e.target.value)}
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Solo se usa si olvidas tu PIN. Funciona offline.
              </p>
            </div>
            <Button type="submit" className="h-11 w-full rounded-xl gradient-primary">
              Continuar
            </Button>
          </form>
        </Wrapper>
      );
    }
    if (step === "pin") {
      return (
        <Wrapper subtitle="Crea un PIN de 6 dígitos">
          <PinPad
            onComplete={(p) => {
              setFirstPin(p);
              setStep("confirm");
            }}
            error={error}
          />
        </Wrapper>
      );
    }
    return (
      <Wrapper subtitle="Confirma tu PIN">
        <PinPad
          busy={busy}
          error={error}
          onComplete={async (p) => {
            if (p !== firstPin) {
              setError("Los PIN no coinciden");
              setFirstPin("");
              setStep("pin");
              return;
            }
            setBusy(true);
            try {
              const u = await createUser({
                nombre: nombre.trim(),
                role: "admin",
                pin: p,
                recoveryEmail: recoveryEmail.trim(),
              });
              await login(p);
              // Sube el nuevo usuario a la nube para que otros dispositivos lo vean
              syncPinUsers(true).catch(console.warn);
              toast.success(`Bienvenido, ${u.nombre}`);
            } catch (err: any) {
              setError(err.message || "Error");
            } finally {
              setBusy(false);
            }
          }}
        />
      </Wrapper>
    );
  }

  // ---- Login ----
  if (showRecover) {
    return <Recovery onClose={() => setShowRecover(false)} />;
  }

  return (
    <Wrapper subtitle="Ingresa tu PIN">
      <div className="mb-2 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
        <Cloud className="h-3 w-3" />
        Sincronización automática activa
      </div>
      <PinPad
        busy={busy}
        error={error}
                onComplete={async (p) => {
          setBusy(true);
          setError(null);
          try {
                        const u = await login(p);
            if (u) {
              // Si es dependiente, verificar si está inactiva en los ajustes
              if (u.role === "dependiente") {
                const settings = useCuadreStore.getState().settings;
                const inactivos: string[] = (settings as any).dependientesInactivos ?? [];
                if (inactivos.some((n) => n.trim().toLowerCase() === u.nombre.trim().toLowerCase())) {
                  usePinStore.getState().logout();
                  setError("Esta cuenta de dependiente se encuentra desactivada. Consulta con la administración.");
                  return;
                }
              }

              // Si es admin o dueña, activar la caja con este mismo PIN automáticamente
              if (u.role === "admin" || u.role === "duena") {
                await entrarConPinDeCaja(p).catch(console.warn);
              }
              toast.success(`Hola, ${u.nombre}`);
              return;
            }
            // Fallback por si inicia con PIN validado desde el servidor
            const deCaja = await entrarConPinDeCaja(p);
            if (deCaja) {
              toast.success(`Hola, ${deCaja.nombre}`);
              return;
            }
            setError("PIN incorrecto");
          } catch (error) {
            setError(error instanceof Error ? error.message : "No se pudo verificar el PIN.");
          } finally {
            setBusy(false);
          }
        }}
      />
      <button
        onClick={() => setShowRecover(true)}
        className="mt-6 w-full text-center text-xs text-muted-foreground hover:text-foreground"
      >
        ¿Olvidaste tu PIN?
      </button>
    </Wrapper>
  );
}

function Wrapper({
  subtitle,
  children,
}: {
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background px-4 py-8">
      <div className="pointer-events-none absolute -left-40 -top-40 h-80 w-80 rounded-full bg-secondary/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-40 h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
      <div className="relative w-full max-w-sm rounded-3xl border border-border/70 bg-card/95 p-5 shadow-elegant sm:p-7">
        <div className="mb-6 space-y-3 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-secondary/10 text-secondary">
            <img src="/alfaro-logo-oficial.webp" alt="Logo oficial de AlFaro Café" className="h-full w-full rounded-2xl object-cover" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">
              AlFaroCafé <span className="text-secondary">Manager</span>
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>
        {children}
        <p className="mt-6 text-center text-[11px] text-muted-foreground">
          Acceso al sistema de gestión del negocio
        </p>
      </div>
    </div>
  );
}

function Recovery({ onClose }: { onClose: () => void }) {
  const { users, updatePin } = usePinStore();
  const admin = users.find((u) => u.role === "admin");
  const [email, setEmail] = useState("");
  const [stage, setStage] = useState<"verify" | "newpin" | "confirmpin">("verify");
  const [busy, setBusy] = useState(false);
  const [pin1, setPin1] = useState("");
  const [error, setError] = useState<string | null>(null);

  const verifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!admin) return;
    setBusy(true);
    setError(null);
    try {
      const localOk =
        admin.recoveryEmail &&
        admin.recoveryEmail.trim().toLowerCase() === email.trim().toLowerCase();
      if (!localOk) {
        setError("Email no coincide con el registrado");
        return;
      }
      setStage("newpin");
    } finally {
      setBusy(false);
    }
  };

  if (stage === "verify") {
    return (
      <Wrapper subtitle="Recuperar PIN">
        <form onSubmit={verifyEmail} className="space-y-3">
          <div className="space-y-1">
            <Label>Email de recuperación</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>
          <Button
            type="submit"
            disabled={busy}
            className="h-11 w-full rounded-xl gradient-primary"
          >
            Verificar
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            className="h-10 w-full rounded-xl"
          >
            Cancelar
          </Button>
        </form>
      </Wrapper>
    );
  }
  if (stage === "newpin") {
    return (
      <Wrapper subtitle="Nuevo PIN de 6 dígitos">
        <PinPad
          onComplete={(p) => {
            setPin1(p);
            setStage("confirmpin");
          }}
        />
      </Wrapper>
    );
  }
  return (
    <Wrapper subtitle="Confirma el nuevo PIN">
      <PinPad
        busy={busy}
        error={error}
        onComplete={async (p) => {
          if (!admin) return;
          if (p !== pin1) {
            setError("No coincide");
            setPin1("");
            setStage("newpin");
            return;
          }
          setBusy(true);
          await updatePin(admin.id, p);
          setBusy(false);
          toast.success("PIN actualizado. Ingresa con tu nuevo PIN.");
          onClose();
        }}
      />
    </Wrapper>
  );
}
