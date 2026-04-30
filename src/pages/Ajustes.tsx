import { useCuadreStore, PUNTOS } from "@/store/cuadreStore";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Shield, User, Coffee, Store as StoreIcon, Percent } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/NumberInput";

export default function Ajustes() {
  const { history, role, setRole, settings, setSalarioBasePunto, updateSettings } =
    useCuadreStore();
  const isAdmin = role === "admin";
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Ajustes</h1>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
        <div>
          <div className="text-sm font-semibold">Rol activo</div>
          <div className="text-xs text-muted-foreground">
            El dependiente no puede ver ganancias ni costos, ni editar precios o el catálogo.
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              setRole("admin");
              toast.success("Rol: Administrador");
            }}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl border p-3 text-sm font-semibold transition-smooth",
              role === "admin"
                ? "gradient-primary border-0 text-primary-foreground shadow-soft"
                : "border-border bg-card text-foreground"
            )}
          >
            <Shield className="h-5 w-5" />
            Administrador
          </button>
          <button
            onClick={() => {
              setRole("dependiente");
              toast.success("Rol: Dependiente");
            }}
            className={cn(
              "flex flex-col items-center gap-1 rounded-xl border p-3 text-sm font-semibold transition-smooth",
              role === "dependiente"
                ? "gradient-emerald border-0 text-secondary-foreground shadow-soft"
                : "border-border bg-card text-foreground"
            )}
          >
            <User className="h-5 w-5" />
            Dependiente
          </button>
        </div>
      </div>

      {isAdmin && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
          <div>
            <div className="text-sm font-semibold">Salario base por día</div>
            <div className="text-xs text-muted-foreground">
              Se aplica al iniciar un nuevo cuadre en cada punto de venta.
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {PUNTOS.map((p) => {
              const Icon = p === "Cafetería" ? Coffee : StoreIcon;
              return (
                <div key={p}>
                  <Label className="flex items-center gap-1 text-xs">
                    <Icon className="h-3.5 w-3.5" /> {p}
                  </Label>
                  <NumberInput
                    value={settings.salarioBase[p]}
                    onChange={(v) => setSalarioBasePunto(p, v)}
                    className="mt-1 h-11 rounded-xl"
                  />
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
              Predeterminado al registrar un gasto tipo Transferencia. Editable por gasto.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
        <Row label="Cuadres en historial" value={String(history.length)} />
        <Row label="Versión" value="1.0.0" />
      </div>
      <Button
        variant="destructive"
        className="w-full rounded-xl"
        onClick={() => {
          if (confirm("¿Borrar todos los datos locales?")) {
            localStorage.removeItem("alfarocafe-store");
            toast.success("Datos borrados");
            setTimeout(() => location.reload(), 600);
          }
        }}
      >
        Borrar datos locales
      </Button>
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
