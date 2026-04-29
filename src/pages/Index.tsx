import { useNavigate } from "react-router-dom";
import { Coffee, Play, ArrowRight } from "lucide-react";
import coffeeHero from "@/assets/coffee-hero.jpg";
import { Button } from "@/components/ui/button";
import { useCuadreStore } from "@/store/cuadreStore";

export default function Index() {
  const nav = useNavigate();
  const { current, startCuadre, history } = useCuadreStore();

  const onStart = () => {
    if (!current) startCuadre();
    nav("/cuadre/1");
  };

  return (
    <div className="space-y-6 pb-4">
      <div className="relative overflow-hidden rounded-3xl shadow-elegant">
        <img
          src={coffeeHero}
          alt="Café AlFaro"
          width={1280}
          height={896}
          className="h-64 w-full object-cover"
        />
        <div
          className="absolute inset-0"
          style={{ background: "var(--gradient-hero)" }}
        />
        <div className="absolute inset-x-0 bottom-0 p-5 text-primary-foreground">
          <div className="mb-1 flex items-center gap-2 text-xs uppercase tracking-widest opacity-90">
            <Coffee className="h-3.5 w-3.5" />
            AlFaroCafé
          </div>
          <h1 className="text-3xl font-bold leading-tight">
            Bienvenido al cuadre del día
          </h1>
          <p className="mt-1 text-sm opacity-90">
            Gestiona inventario, ventas y caja en un solo lugar.
          </p>
        </div>
      </div>

      <button
        onClick={onStart}
        className="group relative w-full overflow-hidden rounded-3xl gradient-emerald p-6 text-left text-secondary-foreground shadow-emerald transition-smooth hover:scale-[1.01] active:scale-[0.99]"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wider opacity-80">
              {current ? "Cuadre en curso" : "Nuevo turno"}
            </div>
            <div className="text-2xl font-bold">
              {current ? "Continuar cuadre" : "Iniciar cuadre"}
            </div>
            <div className="mt-1 text-sm opacity-80">
              {current
                ? `Dependiente: ${current.dependiente || "—"}`
                : "Selecciona días y dependiente"}
            </div>
          </div>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
            <Play className="h-6 w-6 fill-current" />
          </div>
        </div>
      </button>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Cuadres realizados" value={history.length} />
        <StatCard
          label="Última venta"
          value={
            history[0]
              ? `$${Math.round(
                  history[0].productos.reduce(
                    (s, p) => s + (p.inicio + p.entradas - p.traslados - p.final) * p.precio,
                    0
                  )
                )}`
              : "—"
          }
        />
      </div>

      {history.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Historial reciente</h2>
            <Button variant="ghost" size="sm" onClick={() => nav("/historial")}>
              Ver todo <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="space-y-2">
            {history.slice(0, 3).map((c) => (
              <div
                key={c.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-soft"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">{c.dependiente || "Sin nombre"}</div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(c.fecha).toLocaleString("es-ES", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>
                  <div className="rounded-full bg-secondary/10 px-3 py-1 text-xs font-semibold text-secondary">
                    {c.diasTrabajados.length} día(s)
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold text-primary">{value}</div>
    </div>
  );
}
