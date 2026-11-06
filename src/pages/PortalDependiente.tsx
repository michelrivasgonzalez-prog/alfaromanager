import { useMemo } from "react";
import { useCuadreStore, calcCuadre } from "@/store/cuadreStore";
import { useAuth } from "@/hooks/useAuth";
import { User, Calendar, DollarSign, Wallet, Scale } from "lucide-react";
import { formatDiasTrabajados } from "@/lib/dias";
import { Avatar } from "@/components/Avatar";

export default function PortalDependiente() {
  const { nombre } = useAuth();
  const { history } = useCuadreStore();

  // 1. Filtrar cuadres trabajados únicamente por este dependiente
  const misCuadres = useMemo(() => {
    if (!nombre) return [];
    return history.filter(
      (c) => c.dependiente.trim().toLowerCase() === nombre.trim().toLowerCase()
    );
  }, [history, nombre]);

  // 2. Calcular métricas agregadas usando calcCuadre oficial
  const metricas = useMemo(() => {
    let salarioTotal = 0;
    let salarioRealTotal = 0;
    let diferenciasSumadas = 0;

    misCuadres.forEach((c) => {
      const res = calcCuadre(c);
      salarioTotal += res.salarioBruto;
      salarioRealTotal += res.salarioReal;
      diferenciasSumadas += res.diferencia;
    });

    return {
      salarioTotal,
      salarioRealTotal,
      diferenciasSumadas,
    };
  }, [misCuadres]);

  return (
    <div className="space-y-6 pb-6">
      {/* Cabecera del Portal */}
      <div className="rounded-3xl border border-border bg-card p-5 shadow-soft">
        <div className="flex items-center gap-3">
          <Avatar nombre={nombre || "Dependiente"} size={48} className="rounded-2xl" />
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Portal del Dependiente
            </span>
            <h1 className="text-2xl font-bold">{nombre || "Dependiente"}</h1>
          </div>
        </div>
      </div>

      {/* 4 Tarjetas de Métricas Personales */}
      <div className="grid grid-cols-2 gap-3">
        {/* 1. Turnos */}
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

        {/* 2. Salarios Totales */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <DollarSign className="h-4 w-4 text-emerald-500" /> Salarios Totales
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            ${Math.round(metricas.salarioTotal)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            salario base acumulado
          </div>
        </div>

        {/* 3. Salarios Reales */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <Wallet className="h-4 w-4 text-blue-500" /> Salarios Reales
          </div>
          <div className="mt-2 text-2xl font-bold text-foreground">
            ${Math.round(metricas.salarioRealTotal)}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            salario real cobrado
          </div>
        </div>

        {/* 4. Diferencias Sumadas */}
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <Scale className="h-4 w-4 text-amber-500" /> Diferencias
          </div>
          <div
            className={`mt-2 text-2xl font-bold ${
              metricas.diferenciasSumadas < 0
                ? "text-destructive"
                : metricas.diferenciasSumadas > 0
                ? "text-emerald-600"
                : "text-foreground"
            }`}
          >
            {metricas.diferenciasSumadas > 0
              ? `+$${Math.round(metricas.diferenciasSumadas)}`
              : `$${Math.round(metricas.diferenciasSumadas)}`}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            balance faltantes / sobrantes
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
          <div className="space-y-3">
            {misCuadres.map((c) => {
              const res = calcCuadre(c);
              const diff = res.diferencia;

              return (
                <div
                  key={c.id}
                  className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3"
                >
                  {/* Encabezado del Turno */}
                  <div className="flex items-center justify-between pb-2 border-b border-border/40">
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        📍 {c.puntoVenta}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDiasTrabajados(c.diasTrabajados) || "Fecha no especificada"}
                      </div>
                    </div>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        diff < 0
                          ? "bg-destructive/10 text-destructive"
                          : diff > 0
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {diff < 0
                        ? `Faltante: -$${Math.abs(Math.round(diff))}`
                        : diff > 0
                        ? `Sobrante: +$${Math.round(diff)}`
                        : "Sin diferencias"}
                    </span>
                  </div>

                  {/* Datos del Turno */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-muted/40 p-2.5 rounded-xl space-y-0.5">
                      <span className="text-muted-foreground text-[11px]">Ventas Totales</span>
                      <div className="font-semibold text-sm text-foreground">
                        ${Math.round(res.totalVenta)}
                      </div>
                    </div>

                    <div className="bg-muted/40 p-2.5 rounded-xl space-y-0.5">
                      <span className="text-muted-foreground text-[11px]">Gastos</span>
                      <div className="font-semibold text-sm text-foreground">
                        ${Math.round(res.totalGastos)}
                      </div>
                    </div>

                    <div className="bg-muted/40 p-2.5 rounded-xl space-y-0.5">
                      <span className="text-muted-foreground text-[11px]">Salario Base</span>
                      <div className="font-semibold text-sm text-foreground">
                        ${Math.round(res.salarioBruto)}
                      </div>
                    </div>

                    <div className="bg-muted/40 p-2.5 rounded-xl space-y-0.5">
                      <span className="text-muted-foreground text-[11px]">Salario Real</span>
                      <div className="font-semibold text-sm text-primary">
                        ${Math.round(res.salarioReal)}
                      </div>
                    </div>
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
