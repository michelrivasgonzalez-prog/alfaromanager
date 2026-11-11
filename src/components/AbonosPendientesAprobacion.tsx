import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Check, X, Clock, AlertTriangle, UserCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listarAbonosPendientes, aprobarAbonoPendiente, rechazarAbonoPendiente, fmt, AbonoPendiente } from "@/lib/cobrar";
import { useAuth } from "@/hooks/useAuth";

export default function AbonosPendientesAprobacion() {
  const { role, user, nombre } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  const { data: solicitudes = [], error } = useQuery({
    queryKey: ["abonos-pendientes"],
    queryFn: listarAbonosPendientes,
    enabled: role === "admin" || role === "duena",
    refetchInterval: 30000,
  });

  if (role !== "admin" && role !== "duena") return null;
  if (error) return <p className="text-sm text-destructive">No se pudieron cargar los abonos pendientes: {error.message}</p>;
  if (solicitudes.length === 0) return null;

  const handleAprobar = async (sol: AbonoPendiente) => {
    if (busy) return;
    setBusy(true);
    try {
      await aprobarAbonoPendiente(sol, { id: user?.id, nombre });
      await qc.invalidateQueries({ queryKey: ["abonos-pendientes"] });
      await qc.invalidateQueries({ queryKey: ["clientes"] });
      await qc.invalidateQueries({ queryKey: ["deudas-all"] });
      await qc.invalidateQueries({ queryKey: ["deudas"] });
      await qc.invalidateQueries({ queryKey: ["abonos"] });
      await qc.invalidateQueries({ queryKey: ["abonos-por-deuda"] });
      toast.success(`Abono de ${sol.cliente?.nombre || "Cliente"} confirmado`);
    } catch (error: any) {
      toast.error(error.message || "Error al confirmar abono");
    } finally { setBusy(false); }
  };

  const handleRechazar = async (id: string) => {
    if (!confirm("¿Deseas descartar este registro de abono?")) return;
    if (busy) return;
    setBusy(true);
    try {
      await rechazarAbonoPendiente(id);
      await qc.invalidateQueries({ queryKey: ["abonos-pendientes"] });
      toast.info("Abono descartado");
    } catch (error: any) {
      toast.error(error.message || "Error al descartar");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-2 mb-4">
      <div className="flex items-center gap-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
        <Clock className="h-4 w-4 animate-pulse" />
        <span>Abonos pendientes de entrega ({solicitudes.length})</span>
      </div>

      {solicitudes.map((sol) => (
        <div
          key={sol.id}
          className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3.5 space-y-2.5 shadow-sm"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-bold text-foreground">
                Dependiente <span className="text-primary">{sol.dependiente_nombre}</span> cobró abono de{" "}
                <span className="text-primary">{sol.cliente?.nombre}</span> de{" "}
                <span className="text-emerald-600 font-extrabold">{fmt(Number(sol.monto))}</span>
              </p>
              <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
                <Clock className="h-3 w-3" /> Cobrado hace{" "}
                {formatDistanceToNow(new Date(sol.creado_at), { locale: es, addSuffix: false })}.
                Límite de entrega: 24h.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1 border-t border-border/40">
            <Button
              disabled={busy}
              size="sm"
              className="h-8 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs gap-1"
              onClick={() => handleAprobar(sol)}
            >
              <Check className="h-3.5 w-3.5" /> Aceptar (Dinero recibido)
            </Button>
            <Button
              disabled={busy}
              size="sm"
              variant="outline"
              className="h-8 rounded-xl text-xs"
              onClick={() => toast.info("Abono mantenido en espera hasta recibir el efectivo.")}
            >
              Dejar en espera
            </Button>
            <Button
              disabled={busy}
              size="sm"
              variant="ghost"
              className="h-8 rounded-xl text-xs text-destructive hover:bg-destructive/10"
              onClick={() => handleRechazar(sol.id)}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
