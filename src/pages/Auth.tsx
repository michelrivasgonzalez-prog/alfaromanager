import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Coffee, Shield, Mail } from "lucide-react";
import { toast } from "sonner";
import { PinPad } from "@/components/PinPad";
import { usePinStore } from "@/store/pinStore";
import { supabase } from "@/integrations/supabase/client";

export default function Auth() {
  const nav = useNavigate();
  const { users, currentUserId, createUser, login } = usePinStore();
  const hasAdmin = users.some((u) => u.role === "admin");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // onboarding state
  const [step, setStep] = useState<"form" | "pin" | "confirm">("form");
  const [nombre, setNombre] = useState("");
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [firstPin, setFirstPin] = useState("");
  const [showRecover, setShowRecover] = useState(false);

  useEffect(() => {
    if (currentUserId) nav("/", { replace: true });
  }, [currentUserId, nav]);

  if (currentUserId) return <Navigate to="/" replace />;

  // ---- Onboarding (no admin yet) ----
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
      <PinPad
        busy={busy}
        error={error}
        onComplete={async (p) => {
          setBusy(true);
          setError(null);
          const u = await login(p);
          setBusy(false);
          if (!u) {
            setError("PIN incorrecto");
            return;
          }
          toast.success(`Hola, ${u.nombre}`);
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
    <div className="min-h-screen gradient-warm flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-6 shadow-elegant">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl gradient-primary text-primary-foreground">
            <Coffee className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold">AlFaroCafé</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {children}
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
      // Verificación local: el email de recuperación coincide
      const localOk =
        admin.recoveryEmail &&
        admin.recoveryEmail.trim().toLowerCase() === email.trim().toLowerCase();
      if (!localOk) {
        setError("Email no coincide con el registrado");
        return;
      }
      // Si hay internet, también enviamos un OTP por email para mayor seguridad
      if (navigator.onLine) {
        const { error: authErr } = await supabase.auth.signInWithOtp({
          email: admin.recoveryEmail!,
          options: { shouldCreateUser: true },
        });
        if (authErr) {
          // Sin red real, seguimos con verificación local
          console.warn("OTP no enviado:", authErr.message);
        } else {
          toast.message("Te enviamos un correo de verificación (opcional)");
        }
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
