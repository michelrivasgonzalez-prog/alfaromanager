import { useMemo } from "react";
import { useCuadreStore } from "@/store/cuadreStore";
import { useAuth } from "@/hooks/useAuth";
import { User, Calendar, AlertCircle, CheckCircle2, ShieldAlert } from "lucide-react";
import { formatDiasTrabajados } from "@/lib/dias";

export default function PortalDependiente() {
  const { nombre } = useAuth();
  const { history } = useCuadreStore();

  // Filtrar cuadres trabajados únicamente por este dependiente
  const misCuadres = useMemo(() => {
    if (!nombre) return [];
    return history.filter(
      (c) => c.dependiente.trim().toLowerCase() === nombre.trim().toLowerCase()
    );
  }, [history, nombre]);

  // Calcular total de faltantes/deuda personal acumulada
  const totalFaltantes = useMemo(() => {
    return misCuadres.reduce((sum, c) => {
      // Sumar faltantes si el estado o resumen reporta faltante
      const faltanteCuadre = (c as any).faltante ?? 0;
      return sum + faltanteCuadre;
    }, 0);
  }, [misCuadres]);

  return (
    <div className="space-y-6 pb-6">
      {/* Cabecera del Portal */}
      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl gradient-primary text-primary-foreground">
            <User className="h-6 w-6" />
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Portal del Dependiente
            </span>
            <h1 className="text-2xl font-bold">{nombre || "Dependiente"}</h1>
          </div>
        </div>
      </div>

      {/* Tarjetas de Métricas Personales */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <Calendar className="h-4 w-4 text-primary" /> Turnos
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            {misCuadres.length}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            completados
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <AlertCircle className="h-4 w-4 text-amber-500" /> Faltantes
          </div>
          <div className={`mt-2 text-2xl font-bold ${totalFaltantes > 0 ? "text-amber-600" : "text-emerald-600"}`}>
            ${totalFaltantes}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {totalFaltantes > 0 ? "Deuda registrada" : "Al día sin faltantes"}
          </div>
        </div>
      </div>

      {/* Lista de Turnos e Historial del Dependiente */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
          Mis Turnos Trabajados
        </h2>

        {misCuadres.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No tienes turnos o cuadres registrados a tu nombre aún.
          </div>
        ) : (
          <div className="space-y-2.5">
            {misCuadres.map((c) => {
              const tieneFaltante = ((c as any).faltante ?? 0) > 0;
              return (
                <div
                  key={c.id}
                  className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        📍 {c.punto}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDiasTrabajados(c.diasTrabajados) || "Fecha no especificada"}
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                        tieneFaltante
                          ? "bg-amber-500/10 text-amber-600"
                          : "bg-emerald-500/10 text-emerald-600"
                      }`}
                    >
                      {tieneFaltante ? (
                        <>
                          <ShieldAlert className="h-3.5 w-3.5" /> Faltante: ${(c as any).faltante}
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" /> Turno Ok
                        </>
                      )}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
