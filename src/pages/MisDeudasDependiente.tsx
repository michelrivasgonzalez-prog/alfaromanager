import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Wallet,
  ShieldCheck,
  Calendar,
  UserCheck,
  Receipt,
  Eye,
  CheckCircle2,
  Clock,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listClientes, listDeudas, Deuda, Abono, fmt, origenAbono } from "@/lib/cobrar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export default function MisDeudasDependiente() {
  const { nombre } = useAuth();
  const [deudaSeleccionada, setDeudaSeleccionada] = useState<Deuda | null>(null);

  // Cargar clientes y deudas de la base de datos
  const clientesQuery = useQuery({ queryKey: ["clientes"], queryFn: listClientes });
  const deudasQuery = useQuery({ queryKey: ["deudas-all"], queryFn: () => listDeudas() });

  // Buscar el perfil de cliente que coincide exactamente con el nombre del dependiente logueado
  const miCliente = useMemo(() => {
    if (!nombre || !clientesQuery.data) return null;
    return clientesQuery.data.find(
      (c) => c.nombre.trim().toLowerCase() === nombre.trim().toLowerCase()
    );
  }, [nombre, clientesQuery.data]);

  // Filtrar las deudas correspondientes a este dependiente
  const misDeudas = useMemo(() => {
    if (!miCliente || !deudasQuery.data) return [];
    return deudasQuery.data.filter((d) => d.cliente_id === miCliente.id);
  }, [miCliente, deudasQuery.data]);

  // Calcular métricas financieras del dependiente
  const estadisticas = useMemo(() => {
    let totalConsumido = 0;
    let saldoPendiente = 0;
    let totalPagado = 0;

    misDeudas.forEach((d) => {
      const totalDeuda = Number(d.total) || 0;
      const saldoDeuda = Number(d.saldo) || 0;
      totalConsumido += totalDeuda;
      saldoPendiente += saldoDeuda;
      totalPagado += (totalDeuda - saldoDeuda);
    });

    return { totalConsumido, saldoPendiente, totalPagado };
  }, [misDeudas]);

  if (clientesQuery.isLoading || deudasQuery.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
        Cargando información personal...
      </div>
    );
  }

  if (clientesQuery.isError || deudasQuery.isError) {
    return (
      <div role="alert" className="alfaro-surface space-y-3 p-5">
        <p className="text-sm font-semibold text-destructive">No se pudo consultar el estado de tus deudas.</p>
        <p className="text-xs text-muted-foreground">
          Comprueba la conexión. No se mostrará un saldo de cero si faltan datos.
        </p>
        <Button type="button" variant="outline" className="h-10 rounded-xl"
          onClick={() => { void clientesQuery.refetch(); void deudasQuery.refetch(); }}>
          Reintentar consulta
        </Button>
      </div>
    );
  }

  if (!miCliente) {
    return (
      <div className="space-y-4 pb-24">
        <header className="alfaro-page-header flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl gradient-primary text-primary-foreground shadow-soft">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-primary">Mis Deudas</h1>
            <p className="text-xs text-muted-foreground">{nombre}</p>
          </div>
        </header>
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground shadow-soft">
          <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
          No tienes un perfil de cliente registrado en la Mipyme ni deudas pendientes.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      {/* Encabezado */}
      <header className="alfaro-page-header flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl gradient-primary text-primary-foreground shadow-soft">
          <Wallet className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-primary">Mis Deudas</h1>
          <p className="text-xs text-muted-foreground">Panel personal de dependiente</p>
        </div>
      </header>

      {/* Tarjeta de Datos Personales */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Dependiente</span>
          <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
            {miCliente.nombre}
          </span>
        </div>
        {miCliente.telefono && (
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 pt-1 border-t border-border">
            <span>Teléfono:</span> <span className="font-medium text-foreground">{miCliente.telefono}</span>
          </div>
        )}
      </div>

      {/* Saldo personal protagonista; no modifica la deuda ni los abonos. */}
      <section className="space-y-2.5" aria-label="Resumen de deudas personales">
        <div className="relative overflow-hidden rounded-3xl bg-primary p-5 text-primary-foreground shadow-soft">
          <div className="pointer-events-none absolute -right-8 -top-10 h-40 w-40 rounded-full border-[24px] border-white/10"/>
          <p className="relative flex items-center gap-2 text-sm font-medium text-white/85">
            <Wallet className="h-4 w-4"/> Mi saldo pendiente
          </p>
          <p className="relative mt-2 break-words text-3xl font-extrabold tabular-nums sm:text-4xl">
            {fmt(estadisticas.saldoPendiente)}
          </p>
          <p className="relative mt-2 text-xs text-white/80">
            {misDeudas.filter((d) => Number(d.saldo) > 0).length} deuda(s) con saldo por pagar
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          <div className="alfaro-surface min-w-0 p-3.5">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-4 w-4 text-secondary" /> Pagado
            </p>
            <p className="mt-2 break-words text-lg font-extrabold tabular-nums text-secondary">
              {fmt(estadisticas.totalPagado)}
            </p>
          </div>
          <div className="alfaro-surface min-w-0 p-3.5">
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Receipt className="h-4 w-4 text-secondary"/> Total histórico
            </p>
            <p className="mt-2 break-words text-lg font-extrabold tabular-nums">
              {fmt(estadisticas.totalConsumido)}
            </p>
          </div>
        </div>
      </section>

      {/* Listado Histórico de Deudas */}
      <div className="space-y-3 pt-2">
        <h2 className="flex items-center gap-2 px-1 text-sm font-bold"><Receipt className="h-4 w-4 text-secondary"/> Historial de consumos y deudas</h2>
        
        {misDeudas.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground shadow-soft">
            <ShieldCheck className="mx-auto mb-2 h-6 w-6 text-emerald-500" />
            No tienes registros de deudas en este momento.
          </div>
        ) : (
          misDeudas.map((d) => (
            <div key={d.id} className="alfaro-surface space-y-3 p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    <span>{format(new Date(d.fecha), "dd MMM yyyy", { locale: es })}</span>
                    {d.cuadre_label && (
                      <>
                        <span>·</span>
                        <span className="font-medium text-foreground">{d.cuadre_label}</span>
                      </>
                    )}
                  </div>
                </div>
                <EstadoBadge estado={d.estado} />
              </div>

              {/* Importes */}
              <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border text-xs">
                <div>
                  <span className="text-muted-foreground">Total de la deuda:</span>
                  <div className="font-mono font-semibold text-foreground">{fmt(d.total)}</div>
                </div>
                <div className="text-right">
                  <span className="text-muted-foreground">Saldo restante:</span>
                  <div className={`font-mono font-bold tabular-nums ${Number(d.saldo) > 0 ? "text-destructive" : "text-secondary"}`}>
                    {fmt(d.saldo)}
                  </div>
                </div>
              </div>

              {/* Botón para ver abonos (si tiene) */}
              <div className="pt-1 flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-xl text-xs"
                  onClick={() => setDeudaSeleccionada(d)}
                >
                  <Eye className="mr-1.5 h-3.5 w-3.5" /> Ver abonos y detalles
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal para ver los Abonos de una Deuda */}
      <ModalVerAbonos
        deuda={deudaSeleccionada}
        onClose={() => setDeudaSeleccionada(null)}
      />
    </div>
  );
}

// Componente de insignia de estado
function EstadoBadge({ estado }: { estado: "pendiente" | "parcial" | "pagada" }) {
  const map = {
    pendiente: { label: "Pendiente", icon: AlertCircle, cls: "bg-destructive/10 text-destructive" },
    parcial: { label: "Parcial", icon: Clock, cls: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-500" },
    pagada: { label: "Pagada", icon: CheckCircle2, cls: "bg-secondary/10 text-secondary" },
  } as const;
  const it = map[estado];
  const Icon = it.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${it.cls}`}>
      <Icon className="h-3 w-3" /> {it.label}
    </span>
  );
}

// Modal Informativo de Abonos (Solo lectura)
function ModalVerAbonos({
  deuda,
  onClose,
}: {
  deuda: Deuda | null;
  onClose: () => void;
}) {
  const abonosQuery = useQuery({
    queryKey: ["abonos", deuda?.id],
    queryFn: async () => {
      if (!deuda) return [];
      const { data: apps } = await (supabase as any)
        .from("abono_aplicaciones")
        .select("abono_id")
        .eq("deuda_id", deuda.id);
      const ids = (apps ?? []).map((a: any) => a.abono_id);
      if (ids.length === 0) return [];
      const { data: abonos } = await supabase
        .from("abonos")
        .select("*")
        .is("deleted_at", null)
        .in("id", ids)
        .order("fecha", { ascending: false });
      return (abonos ?? []) as Abono[];
    },
    enabled: !!deuda,
  });

  return (
    <Dialog open={!!deuda} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md rounded-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Receipt className="h-4 w-4 text-primary" />
            Detalle de Abonos y Pagos
          </DialogTitle>
        </DialogHeader>

        {deuda && (
          <div className="space-y-4 pt-1">
            {/* Info general de la deuda */}
            <div className="rounded-2xl bg-muted/50 p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Fecha de creación:</span>
                <span className="font-medium">{format(new Date(deuda.fecha), "dd MMM yyyy", { locale: es })}</span>
              </div>
              {deuda.cuadre_label && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Turno:</span>
                  <span className="font-medium">{deuda.cuadre_label}</span>
                </div>
              )}
              <div className="flex justify-between border-t border-border/60 pt-1.5">
                <span className="text-muted-foreground">Monto Total:</span>
                <span className="font-mono font-bold text-foreground">{fmt(deuda.total)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Saldo Restante:</span>
                <span className="font-mono font-bold text-destructive">{fmt(deuda.saldo)}</span>
              </div>
            </div>

            {/* Lista de abonos registrados */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Historial de abonos</h3>
              {abonosQuery.isLoading ? (
                <div className="p-4 text-center text-xs text-muted-foreground">Cargando abonos...</div>
              ) : abonosQuery.data?.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                  No se han registrado abonos para esta deuda todavía.
                </div>
              ) : (
                <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                  {abonosQuery.data?.map((abono: Abono) => (
                    <div key={abono.id} className="rounded-xl border border-border bg-card p-3 shadow-xs space-y-1 text-xs">
                      <div className="font-medium">{origenAbono(abono)}</div>
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-secondary text-sm">
                          +{fmt(abono.monto)}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {format(new Date(abono.fecha), "dd MMM yyyy, HH:mm", { locale: es })}
                        </span>
                      </div>
                      {abono.dependiente_nombre && (
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                          <UserCheck className="h-3 w-3 text-primary" />
                          <span>Atendido por: <strong className="text-foreground">{abono.dependiente_nombre}</strong></span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="pt-2 flex justify-end">
              <Button variant="default" size="sm" className="rounded-xl w-full" onClick={onClose}>
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
