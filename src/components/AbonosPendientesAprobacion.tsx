import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Check, X, Clock, AlertTriangle, UserCheck, ChevronDown, ChevronUp, Wallet, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { listarAbonosPendientes, aprobarAbonoPendiente, rechazarAbonoPendiente, fmt, AbonoPendiente } from "@/lib/cobrar";
import { useAuth } from "@/hooks/useAuth";

export default function AbonosPendientesAprobacion() {
  const { role, user, nombre } = useAuth();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<string | null>(null);

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
      setConfirmandoId(null);
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
    <section className="space-y-2.5" aria-label="Abonos pendientes de entrega física">
      <div className="flex items-center justify-between gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
        <span className="flex min-w-0 items-center gap-2 text-sm font-bold text-amber-700 dark:text-amber-400">
          <Clock className="h-4 w-4 shrink-0"/>
          Abonos por confirmar
        </span>
        <span className="shrink-0 rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-bold text-amber-700 dark:text-amber-400">
          {solicitudes.length}
        </span>
      </div>
      <p className="px-1 text-xs text-muted-foreground">
        Confirma cada operación únicamente después de recibir y contar el dinero entregado.
      </p>
      {solicitudes.map((sol) => {
        const abierto = expandido === sol.id;
        const requiereConfirmacion = confirmandoId === sol.id;
        return (
          <article key={sol.id} className="overflow-hidden rounded-2xl border border-amber-500/30 bg-card shadow-soft">
            <button type="button" aria-expanded={abierto}
              className="flex w-full items-center gap-3 p-3.5 text-left hover:bg-muted/30"
              onClick={() => {
                setExpandido(abierto ? null : sol.id);
                setConfirmandoId(null);
              }}>
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400">
                <Wallet className="h-5 w-5"/>
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block truncate text-sm font-bold">{sol.cliente?.nombre || "Cliente"}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  Entrega: {sol.dependiente_nombre || "Dependiente no registrado"}
                </span>
                <span className="block text-[11px] font-medium text-amber-700 dark:text-amber-400">
                  Pendiente de recepción física
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5">
                <span className="text-sm font-extrabold tabular-nums text-foreground">{fmt(Number(sol.monto))}</span>
                {abierto ? <ChevronUp className="h-4 w-4 text-muted-foreground"/> :
                  <ChevronDown className="h-4 w-4 text-muted-foreground"/>}
              </span>
            </button>
            {abierto && (
              <div className="space-y-3 border-t border-border/60 bg-muted/10 p-3.5">
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0"/>
                  Registrado hace {formatDistanceToNow(new Date(sol.creado_at), { locale: es, addSuffix: false })}.
                  Plazo de entrega: 24 horas.
                </p>
                {requiereConfirmacion ? (
                  <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
                    <p className="flex items-center gap-2 text-sm font-bold">
                      <ShieldCheck className="h-4 w-4 text-secondary"/>
                      ¿Recibiste y contaste {fmt(Number(sol.monto))}?
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Esta acción confirmará el abono. No la utilices si el dinero todavía no fue entregado.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" size="sm" className="h-10 rounded-xl"
                        disabled={busy} onClick={() => void handleAprobar(sol)}>
                        <Check className="mr-1 h-4 w-4"/> Sí, confirmar
                      </Button>
                      <Button type="button" size="sm" variant="outline" className="h-10 rounded-xl"
                        disabled={busy} onClick={() => setConfirmandoId(null)}>
                        Cancelar
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" size="sm" className="h-11 rounded-xl bg-secondary text-secondary-foreground hover:bg-secondary/90"
                      disabled={busy} onClick={() => setConfirmandoId(sol.id)}>
                      <Check className="mr-1 h-4 w-4" /> Revisar entrega
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-11 rounded-xl"
                      disabled={busy} onClick={() => toast.info("El abono se mantiene pendiente hasta recibir el efectivo.")}>
                      Dejar en espera
                    </Button>
                    <Button type="button" size="sm" variant="ghost"
                      className="col-span-2 h-10 rounded-xl text-destructive hover:bg-destructive/10"
                      disabled={busy} onClick={() => void handleRechazar(sol.id)}>
                      <X className="mr-1 h-4 w-4" /> Rechazar solicitud
                    </Button>
                  </div>
                )}
              </div>
            )}
          </article>
        );
      })}
    </section>
  );
}
