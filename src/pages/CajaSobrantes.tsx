import { useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownLeft, ArrowUpRight, Check, ChevronDown, ChevronRight, ChevronUp,
  Clock3, HandCoins, History, LockKeyhole, RefreshCw, ShieldCheck,
  Wallet, X,
} from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import CompensarDeudaFondo from "@/components/CompensarDeudaFondo";
import { SesionCaja } from "@/components/SesionCaja";
import {
  confirmarAjusteSobrante, confirmarSobrante, fechaCaja, listarCaja, montoCaja,
  retirarSobrante, useSesionCaja, type MovimientoFondo,
} from "@/lib/cajaSobrantes";
import {
  etiquetaMovimientoCaja, filtrarMovimientosCaja,
  requiereConfirmacionFisica, type FiltroCaja,
} from "@/lib/cajaSobrantesVista";
import { pullCuadre } from "@/lib/sync";

type Operacion = "retiro" | "compensacion" | null;
type Vista = "movimientos" | "operaciones";

const simbolo = (monto: number) => montoCaja(Number(monto) || 0);
const numero = (monto: number) => (Number(monto) || 0).toLocaleString("es", {
  minimumFractionDigits: 0, maximumFractionDigits: 2,
});

export default function CajaSobrantes() {
  return (
    <section className="mx-auto max-w-5xl space-y-5 pb-8">
      <SesionCaja><Fondo /></SesionCaja>
    </section>
  );
}

function Estadistica({
  icono: Icon, etiqueta, valor,
}: {
  icono: typeof Wallet; etiqueta: string; valor: number;
}) {
  return (
    <div className="min-w-0 space-y-2 rounded-2xl border border-border bg-card p-3">
      <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
      <p className="text-[11px] leading-tight text-muted-foreground">{etiqueta}</p>
      <p className="break-words text-sm font-bold tabular-nums sm:text-base" title={simbolo(valor)}>
        {numero(valor)}
      </p>
    </div>
  );
}

function Fondo() {
  const cuenta = useSesionCaja((s) => s.cuenta);
  const qc = useQueryClient();
  const fondo = useQuery({ queryKey: ["caja-sobrantes", cuenta], queryFn: listarCaja, retry: false });
  const [vista, setVista] = useState<Vista>("movimientos");
  const [filtro, setFiltro] = useState<FiltroCaja>("todos");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [operacion, setOperacion] = useState<Operacion>(null);
  const [importe, setImporte] = useState("");
  const [motivo, setMotivo] = useState("");
  const idRetiro = useRef<string | null>(null);
  const [porConfirmar, setPorConfirmar] = useState<string | null>(null);

  const confirmar = useMutation({
    mutationFn: (movimiento: MovimientoFondo) => {
      const ajuste = movimiento.detalles?.ajuste_pendiente;
      return ajuste
        ? confirmarAjusteSobrante(movimiento.id, Number(ajuste.total))
        : confirmarSobrante(movimiento.id);
    },
    onSuccess: async (movimiento) => {
      setPorConfirmar(null);
      await qc.invalidateQueries({ queryKey: ["caja-sobrantes"] });
      if (movimiento.cuadre_id) void pullCuadre(movimiento.cuadre_id).catch(console.warn);
      toast.success("Ingreso físico confirmado.");
    },
  });
  const retirar = useMutation({
    mutationFn: ({ id, monto, motivo }: { id: string; monto: number; motivo: string }) =>
      retirarSobrante(id, monto, motivo),
    onSuccess: async () => {
      idRetiro.current = null;
      setImporte("");
      setMotivo("");
      await qc.invalidateQueries({ queryKey: ["caja-sobrantes"] });
      setOperacion(null);
      setVista("movimientos");
      toast.success("Retiro registrado.");
    },
  });
  const saldo = fondo.data?.saldo;
  const movimientos = fondo.data?.movimientos ?? [];
  const pendientes = useMemo(
    () => movimientos.filter(requiereConfirmacionFisica),
    [movimientos]
  );
  const filtrados = useMemo(
    () => filtrarMovimientosCaja(movimientos, filtro),
    [movimientos, filtro]
  );
  const monto = Number(importe);
  // Mismas condiciones de la operación original; el formulario solo cambia de ubicación.
  const valido = !!saldo && Number.isFinite(monto) && monto > 0 &&
    monto <= saldo.saldo_disponible && !!motivo.trim();

  function enviarRetiro(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!valido || retirar.isPending) return;
    idRetiro.current ??= crypto.randomUUID();
    retirar.mutate({ id: idRetiro.current, monto, motivo: motivo.trim() });
  }

  const abrirPendientes = () => {
    setVista("movimientos");
    setFiltro("pendientes");
    setExpandido(null);
  };

  const filtros: { value: FiltroCaja; label: string }[] = [
    { value: "todos", label: "Todos" },
    { value: "ingresos", label: "Ingresos" },
    { value: "retiros", label: "Retiros" },
    { value: "pendientes", label: "Pendientes" },
  ];

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <Wallet className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-tight sm:text-2xl">Caja de Sobrantes</h1>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <LockKeyhole className="h-3.5 w-3.5" /> Acceso protegido · Control financiero
            </p>
          </div>
        </div>
        <Button variant="outline" size="icon" className="h-10 w-10 shrink-0 rounded-xl"
          aria-label="Actualizar movimientos y saldo" title="Actualizar"
          disabled={fondo.isFetching} onClick={() => { void fondo.refetch(); }}>
          <RefreshCw className={"h-4 w-4" + (fondo.isFetching ? " animate-spin" : "")} />
        </Button>
      </header>

      {fondo.isPending && (
        <div role="status" className="space-y-3 rounded-2xl border bg-card p-5">
          <div className="h-4 w-36 animate-pulse rounded bg-muted" />
          <div className="h-9 w-52 animate-pulse rounded bg-muted" />
          <p className="text-xs text-muted-foreground">Cargando saldo y movimientos…</p>
        </div>
      )}
      {fondo.error && (
        <div role="alert" className="space-y-2 rounded-xl border border-destructive/30 bg-destructive/5 p-3">
          <p className="text-sm font-medium text-destructive">No se pudo consultar la caja.</p>
          <p className="text-xs text-muted-foreground">{fondo.error.message}</p>
          <Button variant="outline" size="sm" onClick={() => { void fondo.refetch(); }}>Reintentar</Button>
        </div>
      )}

      {saldo && fondo.data && (
        <>
          <div className="space-y-3 rounded-3xl border border-primary/10 bg-primary/5 p-5 sm:p-6">
            <p className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
              Saldo disponible
            </p>
            <p className="break-words text-3xl font-extrabold leading-tight tracking-tight tabular-nums sm:text-4xl">
              {numero(saldo.saldo_disponible)}
              <span className="ml-2 text-sm font-medium tracking-normal text-muted-foreground">CUP</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Dinero confirmado disponible para operaciones.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Estadistica icono={Clock3} etiqueta="Pendiente" valor={saldo.pendiente_ingresar} />
            <Estadistica icono={ArrowDownLeft} etiqueta="Ingresos" valor={saldo.ingresos_confirmados} />
            <Estadistica icono={ArrowUpRight} etiqueta="Retiros" valor={saldo.retiros_confirmados} />
          </div>

          {pendientes.length > 0 ? (
            <button type="button" onClick={abrirPendientes}
              className="flex w-full items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3.5 text-left transition-colors hover:bg-amber-500/10">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 dark:text-amber-400">
                <Clock3 className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Ingresos por confirmar · {pendientes.length}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Revisar las entregas físicas pendientes de confirmación.
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </button>
          ) : (
            <div className="flex items-center gap-2 rounded-xl border border-border p-3 text-xs text-muted-foreground">
              <Check className="h-4 w-4 text-emerald-600" />
              No hay movimientos pendientes de confirmación física.
            </div>
          )}

          <Tabs value={vista} onValueChange={(v) => setVista(v as Vista)} className="space-y-3">
            <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl">
              <TabsTrigger value="movimientos" className="h-full rounded-lg">
                <History className="mr-1.5 h-4 w-4" /> Movimientos
              </TabsTrigger>
              <TabsTrigger value="operaciones" className="h-full rounded-lg">
                <HandCoins className="mr-1.5 h-4 w-4" /> Operaciones
              </TabsTrigger>
            </TabsList>

            <TabsContent value="movimientos" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">Actividad de la caja</h2>
                <span className="text-xs text-muted-foreground">{filtrados.length} movimientos</span>
              </div>
              <div className="flex flex-wrap gap-2" aria-label="Filtrar movimientos de la caja">
                {filtros.map((item) => (
                  <Button key={item.value} type="button"
                    aria-pressed={filtro === item.value}
                    variant={filtro === item.value ? "default" : "outline"}
                    size="sm" className="h-9 rounded-full px-3 text-xs"
                    onClick={() => { setFiltro(item.value); setExpandido(null); setPorConfirmar(null); }}>
                    {item.label}
                  </Button>
                ))}
              </div>

              {filtrados.length === 0 ? (
                <div className="rounded-2xl border border-dashed bg-card p-8 text-center">
                  <History className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    {filtro === "todos"
                      ? "Todavía no hay movimientos registrados."
                      : "No hay movimientos en este filtro."}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {filtrados.map((m) => {
                    const ajuste = m.detalles?.ajuste_pendiente;
                    const montoIngreso = ajuste ? Number(ajuste.monto) : Number(m.monto);
                    const cuadreId = m.cuadre_id ?? m.detalles?.cuadre_id;
                    const pendiente = requiereConfirmacionFisica(m);
                    const abierto = expandido === m.id;
                    const ingreso = m.tipo === "ingreso";
                    const Icon = pendiente ? Clock3 : ingreso ? ArrowDownLeft : ArrowUpRight;
                    return (
                      <article key={m.id}
                        className="overflow-hidden rounded-2xl border border-border bg-card">
                        <button type="button"
                          aria-expanded={abierto}
                          aria-controls={"detalle-fondo-" + m.id}
                          className="flex w-full items-center gap-3 p-3.5 text-left hover:bg-muted/30"
                          onClick={() => {
                            setExpandido(abierto ? null : m.id);
                            if (abierto) setPorConfirmar(null);
                          }}>
                          <div className={"flex h-10 w-10 shrink-0 items-center justify-center rounded-xl " +
                            (pendiente ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" :
                              ingreso ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" :
                                "bg-rose-500/10 text-rose-700 dark:text-rose-400")}>
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <p className="text-sm font-semibold">{etiquetaMovimientoCaja(m)}</p>
                            <p className="truncate text-[11px] text-muted-foreground">
                              {m.dependiente || m.punto_venta} · {fechaCaja(m.realizado_en)}
                            </p>
                            <span className={"inline-block rounded-full px-2 py-0.5 text-[10px] font-medium " +
                              (m.estado === "anulado" ? "bg-muted text-muted-foreground" :
                                pendiente ? "bg-amber-500/10 text-amber-700 dark:text-amber-400" :
                                  "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400")}>
                              {pendiente ? "Pendiente de ingreso físico" :
                                m.estado === "confirmado" ? "Confirmado" :
                                  m.estado === "anulado" ? "Anulado" : "Pendiente"}
                            </span>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <div className="text-right">
                              <p className={"whitespace-nowrap text-sm font-bold tabular-nums " +
                                (ingreso ? "text-emerald-700 dark:text-emerald-400" :
                                  "text-rose-700 dark:text-rose-400")}>
                                {ingreso ? "+" : "−"}{simbolo(Math.abs(Number(m.monto)))}
                              </p>
                              {ajuste && <p className="text-[10px] text-amber-700 dark:text-amber-400">Ajuste pendiente</p>}
                            </div>
                            {abierto ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> :
                              <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          </div>
                        </button>
                        {abierto && (
                          <div id={"detalle-fondo-" + m.id}
                            className="space-y-2 border-t border-border/60 bg-muted/10 p-3.5 text-xs">
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <p className="text-muted-foreground">Punto de venta</p>
                                <p className="mt-0.5 font-medium">{m.punto_venta}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Registrado por</p>
                                <p className="mt-0.5 font-medium">{m.realizado_por}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Fecha de registro</p>
                                <p className="mt-0.5 font-medium">{fechaCaja(m.realizado_en)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Estado</p>
                                <p className="mt-0.5 font-medium capitalize">{m.estado}</p>
                              </div>
                              {m.periodo_desde && (
                                <div className="col-span-2">
                                  <p className="text-muted-foreground">Período del turno</p>
                                  <p className="mt-0.5 font-medium">
                                    {m.periodo_desde} a {m.periodo_hasta ?? m.periodo_desde}
                                  </p>
                                </div>
                              )}
                              {m.confirmado_en && (
                                <div className="col-span-2">
                                  <p className="text-muted-foreground">Confirmación</p>
                                  <p className="mt-0.5 font-medium">
                                    {m.confirmado_por} · {fechaCaja(m.confirmado_en)}
                                  </p>
                                </div>
                              )}
                            </div>
                            <div className="rounded-xl border border-border/70 bg-card p-3">
                              <p className="text-muted-foreground">Motivo</p>
                              <p className="mt-1 whitespace-pre-wrap break-words font-medium">{m.motivo || "Sin descripción"}</p>
                            </div>
                            {cuadreId && (
                              <Link className="inline-flex min-h-9 items-center gap-1 font-semibold text-primary underline-offset-2 hover:underline"
                                to={ "/historial?cuadreId=" + encodeURIComponent(cuadreId)}>
                                Ver cuadre vinculado <ChevronRight className="h-4 w-4" />
                              </Link>
                            )}
                            {ajuste && (
                              <p className="rounded-lg bg-amber-500/10 p-2 font-medium text-amber-700 dark:text-amber-400">
                                Ajuste pendiente de ingreso físico: {simbolo(montoIngreso)}
                              </p>
                            )}
                            {pendiente && (
                              porConfirmar === m.id ? (
                                <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                                  <p className="font-semibold">
                                    ¿Recibiste físicamente {simbolo(montoIngreso)}?
                                  </p>
                                  <p className="text-muted-foreground">
                                    Confirma únicamente después de recibir y contar el dinero.
                                  </p>
                                  <div className="flex flex-wrap gap-2">
                                    <Button size="sm" disabled={confirmar.isPending} onClick={() => confirmar.mutate(m)}>
                                      {confirmar.isPending ? "Confirmando…" :
                                        ajuste ? "Confirmar ingreso de la diferencia" : "Confirmar ingreso"}
                                    </Button>
                                    <Button size="sm" variant="outline" disabled={confirmar.isPending}
                                      onClick={() => setPorConfirmar(null)}>
                                      Cancelar
                                    </Button>
                                  </div>
                                  {confirmar.error && (
                                    <p role="alert" className="text-destructive">{confirmar.error.message}</p>
                                  )}
                                </div>
                              ) : (
                                <Button size="sm" variant="outline" className="w-full rounded-xl"
                                  disabled={confirmar.isPending}
                                  onClick={() => { confirmar.reset(); setPorConfirmar(m.id); }}>
                                  <Check className="mr-1.5 h-4 w-4" />
                                  {ajuste ? "Registrar ingreso de la diferencia" : "Registrar ingreso físico"}
                                </Button>
                              )
                            )}
                          </div>
                        )}
                      </article>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="operaciones" className="space-y-3">
              <p className="text-sm font-semibold">¿Qué deseas hacer?</p>
              <button type="button" onClick={() => setOperacion("retiro")}
                className="flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left hover:bg-muted/30">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <ArrowUpRight className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">Registrar retiro</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Extraer fondos con importe y motivo obligatorio.
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
              <button type="button" onClick={() => setOperacion("compensacion")}
                className="flex w-full items-center gap-3 rounded-2xl border bg-card p-4 text-left hover:bg-muted/30">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted">
                  <HandCoins className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">Compensar deuda</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Aplicar fondos confirmados a una deuda pendiente.
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
              <p className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 shrink-0" />
                Se conservan las verificaciones y permisos de la caja.
              </p>
            </TabsContent>
          </Tabs>

          <Drawer open={operacion === "retiro"}
            onOpenChange={(abierto) => { if (!abierto && !retirar.isPending) setOperacion(null); }}
            shouldScaleBackground={false}>
            <DrawerContent className="max-h-[94dvh] rounded-t-3xl">
              <DrawerHeader className="pb-2 text-left">
                <DrawerTitle className="flex items-center gap-2">
                  <ArrowUpRight className="h-5 w-5 text-primary" /> Registrar retiro
                </DrawerTitle>
                <DrawerDescription>
                  Saldo confirmado disponible: {simbolo(saldo.saldo_disponible)}
                </DrawerDescription>
              </DrawerHeader>
              <form onSubmit={enviarRetiro}
                className="space-y-4 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
                <label className="block space-y-1.5 text-sm font-medium">
                  Importe (CUP)
                  <Input type="number" min="0.01" max={saldo.saldo_disponible} step="0.01"
                    inputMode="decimal" autoComplete="off"
                    value={importe} required disabled={retirar.isPending}
                    onChange={(e) => { setImporte(e.target.value); idRetiro.current = null; }}
                    className="h-12 rounded-xl text-lg font-semibold tabular-nums" />
                </label>
                <label className="block space-y-1.5 text-sm font-medium">
                  Motivo del retiro
                  <Input value={motivo} required disabled={retirar.isPending}
                    placeholder="Escribe el motivo de la operación"
                    onChange={(e) => { setMotivo(e.target.value); idRetiro.current = null; }}
                    className="h-11 rounded-xl" />
                </label>
                <p className="flex items-start gap-2 rounded-xl bg-muted/50 p-3 text-xs text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  El retiro se registra en la caja y queda identificado con su motivo.
                </p>
                {retirar.error && (
                  <p role="alert" className="text-sm text-destructive">{retirar.error.message}</p>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" className="h-11 rounded-xl"
                    disabled={retirar.isPending} onClick={() => setOperacion(null)}>Cancelar</Button>
                  <Button type="submit" className="h-11 rounded-xl"
                    disabled={!valido || retirar.isPending}>
                    {retirar.isPending ? "Registrando…" : "Registrar retiro"}
                  </Button>
                </div>
              </form>
            </DrawerContent>
          </Drawer>

          <Drawer open={operacion === "compensacion"}
            onOpenChange={(abierto) => { if (!abierto) setOperacion(null); }}
            shouldScaleBackground={false}>
            <DrawerContent className="max-h-[94dvh] rounded-t-3xl">
              <DrawerHeader className="pb-2 text-left">
                <DrawerTitle className="flex items-center gap-2">
                  <HandCoins className="h-5 w-5 text-primary" /> Compensar deuda
                </DrawerTitle>
                <DrawerDescription>
                  Utilizar saldo confirmado para una deuda pendiente.
                </DrawerDescription>
              </DrawerHeader>
              <div className="overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
                {operacion === "compensacion" && (
                  <CompensarDeudaFondo disponible={saldo.saldo_disponible} embedded />
                )}
              </div>
            </DrawerContent>
          </Drawer>
        </>
      )}
    </div>
  );
}
