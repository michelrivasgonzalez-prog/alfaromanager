import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { alertasStock } from "@/lib/kardex";
import { Coffee, Play, ArrowRight, Store, X, Search } from "lucide-react";
import coffeeHero from "@/assets/coffee-hero.jpg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCuadreStore, PUNTOS, PuntoVenta } from "@/store/cuadreStore";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { formatDiasTrabajados } from "@/lib/dias";
import PortalDependiente from "./PortalDependiente";

export default function Index() {
  const nav = useNavigate();
  const { currents, activePunto, setActivePunto, startCuadre, history, lastStep, cancelar } =
    useCuadreStore();
  const { role } = useAuth();
  
  if (role === "dependiente") {
    return <PortalDependiente />;
  }

  const canStart = role === "admin" || role === "duena" || role === "dependiente";
  const current = currents[activePunto];
  const catalogo = useCuadreStore((s) => s.catalogo);
  const settings = useCuadreStore((s) => s.settings);
  const alertas = useMemo(() => alertasStock(history, catalogo, settings), [history, catalogo, settings]);
  
  // Ordenar el historial por fecha de forma descendente (del más reciente al más antiguo)
  const sortedHistory = useMemo(() => {
    return [...history].sort((a, b) => {
      const dateA = new Date(a.fecha || a.createdAt || 0).getTime();
      const dateB = new Date(b.fecha || b.createdAt || 0).getTime();
      return dateB - dateA;
    });
  }, [history]);

  // La alerta descartada vuelve a salir si cambia la lista.
  const alertaClave = alertas.map((a) => `${a.punto}|${a.nombre}|${a.existencia}`).join(";");
  const [oculta, setOculta] = useState(() => localStorage.getItem("alfaro-alerta-stock-oculta") ?? "");

  const onStart = (punto: PuntoVenta) => {
    setActivePunto(punto);
    if (!currents[punto]) startCuadre(punto);
    const step = currents[punto] ? lastStep[punto] || 1 : 1;
    nav(`/cuadre/${step}`);
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
        onClick={() => nav("/buscar")}
        className="flex h-12 w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 text-left shadow-soft transition-smooth hover:bg-muted/50"
      >
        <Search className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">Buscar clientes, productos, cuadres…</span>
      </button>

      {(role === "admin" || role === "duena") && alertas.length > 0 && alertaClave !== oculta && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-4">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-destructive">
              Stock bajo: {alertas.length} producto(s)
            </div>
            <button
              onClick={() => {
                localStorage.setItem("alfaro-alerta-stock-oculta", alertaClave);
                setOculta(alertaClave);
              }}
              className="rounded-full p-1 text-muted-foreground hover:bg-muted"
              aria-label="Descartar alerta"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <ul className="space-y-1 text-sm">
            {alertas.map((a) => (
              <li key={a.punto + a.nombre} className="flex justify-between gap-2">
                <span>{a.nombre} <span className="text-xs text-muted-foreground">· {a.punto}</span></span>
                <span className="font-semibold">{a.existencia} / mín. {a.minimo}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3">
        {canStart && PUNTOS.map((p) => {
          const c = currents[p];
          const Icon = p === "Cafetería" ? Coffee : Store;
          return (
            <div
              key={p}
              className={cn(
                "group relative w-full overflow-hidden rounded-3xl p-5 text-left shadow-emerald transition-smooth",
                p === "Cafetería"
                  ? "gradient-emerald text-secondary-foreground"
                  : "gradient-primary text-primary-foreground"
              )}
            >
              <button
                onClick={() => onStart(p)}
                className="flex w-full items-center justify-between text-left"
              >
                <div>
                  <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider opacity-80">
                    <Icon className="h-3.5 w-3.5" /> {p}
                  </div>
                  <div className="text-2xl font-bold">
                    {c ? "Continuar cuadre" : "Iniciar cuadre"}
                  </div>
                  <div className="mt-1 text-sm opacity-80">
                    {c ? `Dependiente: ${c.dependiente || "—"} · Paso ${lastStep[p] || 1}` : "Nuevo turno"}
                  </div>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
                  <Play className="h-5 w-5 fill-current" />
                </div>
              </button>
              {c && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm(`¿Eliminar el cuadre en curso de ${p}? Esta acción no se puede deshacer.`)) {
                      cancelar(p);
                      toast.success(`Cuadre de ${p} eliminado`);
                    }
                  }}
                  className="absolute right-3 top-3 rounded-full bg-white/20 p-1.5 text-current backdrop-blur hover:bg-white/30"
                  aria-label={`Eliminar cuadre de ${p}`}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
        {!canStart && (
          <div className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            Tu rol es <strong>solo lectura</strong>. Puedes consultar el historial y los reportes.
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard label="Cuadres realizados" value={history.length} />
        <StatCard
          label="Última venta"
          value={
            sortedHistory[0]
              ? `$${Math.round(
                  sortedHistory[0].productos.reduce(
                    (s, p) => s + (p.inicio + p.entradas - p.traslados - p.final) * p.precio,
                    0
                  )
                )}`
              : "—"
          }
        />
      </div>

      {sortedHistory.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Historial reciente</h2>
            <Button variant="ghost" size="sm" onClick={() => nav("/historial")}>
              Ver todo <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="space-y-2">
            {sortedHistory.slice(0, 3).map((c) => (
              <div
                key={c.id}
                className="rounded-2xl border border-border bg-card p-4 shadow-soft"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-semibold">{c.dependiente || "Sin nombre"}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDiasTrabajados(c.diasTrabajados) || "Sin días registrados"}
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
