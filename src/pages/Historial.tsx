import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  useCuadreStore,
  calcCuadre,
  Cuadre,
  DENOMINACIONES,
  catLabel,
} from "@/store/cuadreStore";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  FileDown,
  Trash2,
  History as HistoryIcon,
  Eye,
  Receipt,
  Pencil,
  CheckCircle2,
  ChevronDown,
  CloudOff,
  RefreshCw,
} from "lucide-react";
import { generarPDF } from "@/lib/pdf";
import { deleteCuadreRemote, flushPendingCuadres } from "@/lib/sync";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { listClientes, listDeudas, crearDeuda, upsertCliente, actualizarDeuda, eliminarDeuda, type Deuda } from "@/lib/cobrar";
import { ajustarDeuda } from "@/lib/corregirDeudas";
import { formatDiasTrabajados, formatGastoDetalle, gastoLineas, ordenarGastos } from "@/lib/dias";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { fmtDinero, fmtCant } from "@/lib/format";

const fmt = fmtDinero;
const q = fmtCant;


// Extrae los gastos "Cuentas por Cobrar" como productos de la deuda potencial
function gastosCredito(c: Cuadre) {
  return c.gastos.filter((g) => g.categoria === "Cuentas por Cobrar");
}
function totalCredito(c: Cuadre) {
  return gastosCredito(c).reduce((s, g) => s + g.monto, 0);
}
export function fechaTrabajada(c: Cuadre): string {
  return c.diasTrabajados?.[0] ?? c.fecha;
}
// Agrupa los gastos de crédito por cliente (o "Sin asignar" si no lo tiene)
function creditoPorCliente(c: Cuadre) {
  const map = new Map<string, { clienteId?: string; nombre: string; gastos: typeof c.gastos; total: number }>();
  for (const g of gastosCredito(c)) {
    const key =
      g.clienteId ||
      `__nn__${(g.clienteNombre || g.nombre || "Sin asignar").trim().toLowerCase()}`;
    const entry = map.get(key) ?? {
      clienteId: g.clienteId,
      nombre: g.clienteNombre || g.nombre || "Sin asignar",
      gastos: [] as typeof c.gastos,
      total: 0,
    };
    entry.gastos.push(g);
    entry.total += g.monto;
    map.set(key, entry);
  }
  return Array.from(map.values());
}

export default function Historial() {
  const { history, deleteHistory, editCuadre, pendingCuadres } = useCuadreStore();
  const [reintentando, setReintentando] = useState(false);
  const pendientes = useMemo(
    () => (pendingCuadres ?? []).filter((id) => history.some((c) => c.id === id)),
    [pendingCuadres, history]
  );
  const reintentarSync = async () => {
    setReintentando(true);
    try {
      await flushPendingCuadres();
      const restantes = (useCuadreStore.getState().pendingCuadres ?? []).length;
      if (restantes === 0) toast.success("Cuadres sincronizados correctamente.");
      else toast.warning(`Quedan ${restantes} cuadre(s) sin sincronizar. Revisa la conexión.`);
    } catch {
      toast.error("No se pudo sincronizar. Revisa la conexión e inténtalo de nuevo.");
    } finally {
      setReintentando(false);
    }
  };
  const nav = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const cuadreIdUrl = searchParams.get("cuadreId");

  const { role } = useAuth();
  const canDelete = role === "admin" || role === "duena";
  const canPDF = role === "admin" || role === "duena";
  const canDeuda = role === "admin" || role === "duena";
  const canEdit = role === "admin" || role === "duena";
  const [detalle, setDetalle] = useState<Cuadre | null>(null);
  const [deudaFor, setDeudaFor] = useState<{ cuadre: Cuadre; pagada: boolean } | null>(null);
  const [corregirFor, setCorregirFor] = useState<Cuadre | null>(null);
  const [punto, setPunto] = useState<"Cafetería" | "Mipyme">("Cafetería");

    // Efecto para abrir el modal automáticamente cuando existe ?cuadreId en la URL
  useEffect(() => {
    if (!cuadreIdUrl || history.length === 0) return;

    const targetCuadre = history.find(
      (c) => String(c.id) === String(cuadreIdUrl)
    );

    if (targetCuadre) {
      if (targetCuadre.puntoVenta) {
        setPunto(targetCuadre.puntoVenta as "Cafetería" | "Mipyme");
      }
      setDetalle(targetCuadre);
    } else {
      toast.error("El cuadre asociado no se encuentra en el historial local.");
      // Limpia el parámetro para que no se repita el aviso en cada render
      setSearchParams({}, { replace: true });
    }
  }, [cuadreIdUrl, history, setSearchParams]);


  // Manejador para cerrar el modal y limpiar el parámetro de la URL
  const handleCloseDetalle = (open: boolean) => {
    if (!open) {
      setDetalle(null);
      if (searchParams.has("cuadreId")) {
        setSearchParams({}, { replace: true });
      }
    }
  };


  const clientes = useQuery({ queryKey: ["clientes"], queryFn: listClientes, enabled: canDeuda });
  const deudasAll = useQuery({ queryKey: ["deudas-all"], queryFn: () => listDeudas(), enabled: canDeuda });
  const deudaByCuadre = useMemo(() => {
    const m = new Map<string, string>();
    // Solo cuentan las deudas de ventas a crédito; la deuda del faltante del
    // dependiente (o la de pagos con salario) también lleva el cuadre_id y no
    // debe marcar las ventas a crédito como ya registradas.
    const faltanteIds = new Set(
      history.map((c) => c.deudaDependienteId).filter(Boolean) as string[]
    );
    for (const d of deudasAll.data ?? []) {
      if (!d.cuadre_id) continue;
      if (faltanteIds.has(d.id)) continue;
      if ((d.cuadre_label ?? "").startsWith("Faltante")) continue;
      m.set(d.cuadre_id, d.id);
    }
    return m;
  }, [deudasAll.data, history]);

  const fechaT = (c: Cuadre) => c.diasTrabajados?.[c.diasTrabajados.length - 1] ?? c.fecha;

  const lista = useMemo(() => {
    const base = history.filter((c) => c.puntoVenta === punto);
    return [...base].sort(
      (a, b) => new Date(fechaT(b)).getTime() - new Date(fechaT(a)).getTime()
    );
  }, [history, punto]);

  // Agrupado por mes (más recientes primero)
  const grupos = useMemo(() => {
    const m = new Map<string, Cuadre[]>();
    for (const c of lista) {
      const k = format(new Date(fechaT(c)), "yyyy-MM");
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(c);
    }
    return Array.from(m.entries()).sort((a, b) => b[0].localeCompare(a[0]));
  }, [lista]);

  const [cerrados, setCerrados] = useState<Record<string, boolean>>({});
  const toggleMes = (k: string) => setCerrados((s) => ({ ...s, [k]: !s[k] }));


  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Historial de cuadres</h1>
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-muted/60 p-1">
        {(["Cafetería", "Mipyme"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPunto(p)}
            className={`rounded-xl px-2 py-2 text-xs font-semibold transition-smooth ${
              punto === p ? "bg-card shadow-soft text-primary" : "text-muted-foreground"
            }`}
          >
            {p}
          </button>
        ))}
      </div>
      {pendientes.length > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3">
          <div className="flex items-center gap-2 text-xs">
            <CloudOff className="h-4 w-4 shrink-0 text-amber-600" />
            <span className="font-medium text-amber-700 dark:text-amber-400">
              {pendientes.length} cuadre(s) pendiente(s) de sincronizar con la nube.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 shrink-0 rounded-lg border-amber-500/40"
            disabled={reintentando}
            onClick={reintentarSync}
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${reintentando ? "animate-spin" : ""}`} />
            {reintentando ? "Sincronizando…" : "Reintentar"}
          </Button>
        </div>
      )}
      {lista.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <HistoryIcon className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Aún no hay cuadres guardados.
          </p>
        </div>
      )}
      {grupos.map(([mesKey, items]) => {
        const abierto = !cerrados[mesKey];
        const ventaMes = items.reduce((s, c) => s + calcCuadre(c).totalVenta, 0);
        return (
      <section key={mesKey} className="space-y-3">
        <button
          onClick={() => toggleMes(mesKey)}
          className="flex w-full items-center justify-between rounded-2xl border border-border bg-muted/50 px-3 py-2.5 text-left"
        >
          <div>
            <div className="text-sm font-bold capitalize text-primary">
              {format(new Date(`${mesKey}-01T12:00:00`), "MMMM yyyy", { locale: es })}
            </div>
            <div className="text-[11px] text-muted-foreground">
              {items.length} cuadre(s) · {fmt(ventaMes)} en ventas
            </div>
          </div>
          <ChevronDown
            className={`h-4 w-4 text-muted-foreground transition-transform ${abierto ? "" : "-rotate-90"}`}
          />
        </button>
        {abierto && items.map((c) => {

        const r = calcCuadre(c);
        const gastosYanitza =
          (r.gastosPorCategoria["Local"] || 0) +
          (r.gastosPorCategoria["Yanitza"] || 0) +
          r.salarioBruto;
        const otrosMovimientos = c.gastos.reduce(
          (total, gasto) =>
            gasto.categoria === "Salida de efectivo" ||
            gasto.categoria === "Compras" ||
            gasto.categoria === "Transferencia" ||
            gasto.categoria === "Cuentas por Cobrar"
              ? total + gasto.monto
              : total,
          0
        );
        return (
          <div
            key={c.id}
            className="rounded-2xl border border-border bg-card p-4 shadow-soft"
          >
            <div className="flex items-start justify-between">
              <div>
                <div className="font-semibold">{c.dependiente || "Sin nombre"}</div>
                <div className="text-xs text-muted-foreground">
                  {formatDiasTrabajados(c.diasTrabajados)}
                </div>
                {pendientes.includes(c.id) && (
                  <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                    <CloudOff className="h-3 w-3" /> Pendiente de sincronizar
                  </span>
                )}
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Ganancia neta</div>
                <div className="font-mono text-lg font-bold text-secondary">
                  {fmt(r.gananciaNeta)}
                </div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <Mini label="Venta" value={fmt(r.totalVenta)} />
              <Mini label="Gastos Yanitza" value={fmt(gastosYanitza)} />
              <Mini label="Otros" value={fmt(otrosMovimientos)} />
              <Mini
                label="Diferencia"
                value={fmt(r.diferencia)}
                tone={r.diferencia < 0 ? "danger" : r.diferencia > 0 ? "ok" : undefined}
              />
              <Mini label="Salario bruto" value={fmt(r.salarioBruto)} />
              {r.deudaDependiente > 0 ? (
                <Mini label="Deuda" value={fmt(r.deudaDependiente)} tone="danger" />
              ) : (
                <Mini label="Salario pagado" value={fmt(r.salarioReal)} />
              )}
            </div>
            {(() => {
              const credito = totalCredito(c);
              const yaLinked = deudaByCuadre.get(c.id);
              if (credito <= 0) {
                const tieneDeudaVinc = canDeuda && (deudasAll.data ?? []).some((d) => d.cuadre_id === c.id);
                return tieneDeudaVinc ? (
                  <Button size="sm" variant="outline" className="mt-2 h-7 w-full rounded-lg text-xs" onClick={() => setCorregirFor(c)}>
                    <RefreshCw className="mr-1 h-3 w-3" /> Corregir deudas tras editar
                  </Button>
                ) : null;
              }
              return (
                <div className="mt-2 rounded-xl border border-dashed border-primary/30 bg-primary/5 p-2 text-xs">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-primary">Venta a crédito</span>
                      <span className="ml-2 font-mono tabular-nums">{fmt(credito)}</span>
                    </div>
                    {yaLinked && (
                      <span className="rounded-full bg-secondary/10 px-2 py-0.5 text-[10px] font-semibold text-secondary">
                        Deuda registrada
                      </span>
                    )}
                  </div>
                  {canDeuda && yaLinked && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2 h-7 w-full rounded-lg"
                      onClick={() => setCorregirFor(c)}
                    >
                      <RefreshCw className="mr-1 h-3 w-3" /> Corregir deudas tras editar
                    </Button>
                  )}
                  {canDeuda && !yaLinked && (
                    <div className="mt-2 flex gap-2">
                      <Button
                        size="sm"
                        className="h-7 flex-1 rounded-lg"
                        onClick={() => setDeudaFor({ cuadre: c, pagada: false })}
                      >
                        <Receipt className="mr-1 h-3 w-3" /> Registrar deuda
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 flex-1 rounded-lg"
                        onClick={() => setDeudaFor({ cuadre: c, pagada: true })}
                      >
                        <CheckCircle2 className="mr-1 h-3 w-3" /> Ya está pagada
                      </Button>
                    </div>
                  )}
                </div>
              );
            })()}
            <div className="mt-3 flex gap-2">
              <Button
                size="sm"
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => setDetalle(c)}
              >
                <Eye className="mr-1.5 h-3.5 w-3.5" /> Ver
              </Button>
              {canPDF && (
              <Button
                size="sm"
                variant="outline"
                className="flex-1 rounded-xl"
                onClick={() => generarPDF(c)}
              >
                <FileDown className="mr-1.5 h-3.5 w-3.5" /> PDF
              </Button>
              )}
              {canEdit && (
              <Button
                size="sm"
                variant="outline"
                className="rounded-xl"
                onClick={() => {
                  if (!confirm("Al editar este cuadre se saldrá del historial y podrás modificar sus datos. Al finalizar se volverá a guardar. ¿Continuar?")) return;
                  editCuadre(c.id);
                  toast.info("Cuadre en edición. Ve a Cuadre para modificar.");
                  nav("/cuadre/1");
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              )}
              {canDelete && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                onClick={() => {
                  if (!confirm("¿Eliminar este cuadre del historial?")) return;
                  deleteHistory(c.id);
                  deleteCuadreRemote(c.id).catch(console.error);
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
              )}
            </div>
          </div>
        );
      })}
      </section>
        );
      })}
      {corregirFor && (
        <CorregirDeudasDialog
          cuadre={corregirFor}
          deudas={(deudasAll.data ?? []).filter((d) => d.cuadre_id === corregirFor.id)}
          clientes={clientes.data ?? []}
          onClose={() => setCorregirFor(null)}
          onSaved={() => {
            clientes.refetch();
            deudasAll.refetch();
          }}
        />
      )}
      <RegistrarDeudaDialog
        cuadre={deudaFor?.cuadre ?? null}
        pagada={!!deudaFor?.pagada}
        clientes={clientes.data ?? []}
        onClose={() => setDeudaFor(null)}
        onSaved={() => {
          clientes.refetch();
          deudasAll.refetch();
        }}
      />
            <Dialog open={!!detalle} onOpenChange={handleCloseDetalle}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Detalle del cuadre
              {detalle ? ` · ${detalle.dependiente || "Sin nombre"}` : ""}
            </DialogTitle>
          </DialogHeader>
          {detalle && <CuadreDetalle c={detalle} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RegistrarDeudaDialog({
  cuadre,
  pagada,
  clientes,
  onClose,
  onSaved,
}: {
  cuadre: Cuadre | null;
  pagada?: boolean;
  clientes: { id: string; nombre: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  // Para grupos sin cliente asignado, mapa: nombreGrupo -> {clienteId?, nuevoNombre?}
  const [asign, setAsign] = useState<Record<string, { clienteId?: string; nuevo?: string }>>({});

  if (!cuadre) return null;
  const grupos = creditoPorCliente(cuadre);
  const totalTodo = grupos.reduce((s, g) => s + g.total, 0);

  const submit = async () => {
    setBusy(true);
    try {
      for (const grupo of grupos) {
        // Resolver cliente id
        let cliId = grupo.clienteId;
        let cliNombre = grupo.nombre;
        if (!cliId) {
          const map = asign[grupo.nombre] ?? {};
          if (map.clienteId) {
            cliId = map.clienteId;
            cliNombre = clientes.find((c) => c.id === map.clienteId)?.nombre ?? cliNombre;
          } else if (map.nuevo?.trim()) {
            const nuevo = await upsertCliente({ nombre: map.nuevo.trim() });
            cliId = nuevo.id;
            cliNombre = nuevo.nombre;
          } else {
            toast.error(`Asigna un cliente para "${grupo.nombre}"`);
            setBusy(false);
            return;
          }
        }
        const productos = grupo.gastos.flatMap((g) => g.items && g.items.length ? g.items.map((i) => ({ nombre: i.productoNombre, cantidad: i.cantidad, precio: i.precio })) : [{
          nombre: g.tipo === "Producto" ? (g.productoNombre ?? g.descripcion) : g.descripcion || g.nombre || "Venta",
          cantidad: g.tipo === "Producto" ? (g.cantidad ?? 1) : 1,
          precio: g.tipo === "Producto" ? (g.precio ?? g.monto) : g.monto,
        }]);
        await crearDeuda({
          cliente_id: cliId!,
          cuadre_id: cuadre.id,
          cuadre_label: `${cuadre.puntoVenta} · ${format(new Date(fechaTrabajada(cuadre)), "dd MMM yyyy", { locale: es })}${cuadre.dependiente ? ` · ${cuadre.dependiente}` : ""}`,
          productos,
          total: grupo.total,
          fecha: fechaTrabajada(cuadre),
          pagada,
        });
      }
      toast.success(
        pagada
          ? `Se registraron ${grupos.length} venta(s) a crédito ya cobradas`
          : `Se registraron ${grupos.length} deuda(s)`
      );
      qc.invalidateQueries({ queryKey: ["deudas-all"] });
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {pagada ? "Registrar ventas a crédito ya cobradas" : "Registrar deudas del cuadre"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {pagada ? (
              <>
                Se guardará <strong>una venta por cliente</strong> ya marcada como{" "}
                <strong>pagada</strong>, así queda el registro sin saldo pendiente en Cobrar. Total:{" "}
                <strong>{fmt(totalTodo)}</strong>.
              </>
            ) : (
              <>
                Se creará <strong>una deuda por cliente</strong> vinculada a este cuadre. Total a
                registrar: <strong>{fmt(totalTodo)}</strong>.
              </>
            )}
          </p>
          {grupos.map((g) => (
            <div key={g.nombre} className="rounded-xl border border-border bg-muted/40 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">{g.nombre}</div>
                <div className="font-mono text-sm font-bold text-destructive tabular-nums">{fmt(g.total)}</div>
              </div>
              <div className="space-y-0.5 text-[11px] text-muted-foreground">
                {g.gastos.map((gg) => (
                  <div key={gg.id} className="flex justify-between">
                    <span className="truncate">{formatGastoDetalle(gg)}</span>
                    <span className="tabular-nums">{fmt(gg.monto)}</span>
                  </div>
                ))}
              </div>
              {!g.clienteId && (
                <div className="space-y-1 border-t border-border pt-2">
                  <Label className="text-[11px]">Asignar cliente</Label>
                  <Select
                    value={asign[g.nombre]?.clienteId ?? ""}
                    onValueChange={(v) => setAsign((a) => ({ ...a, [g.nombre]: { clienteId: v } }))}
                  >
                    <SelectTrigger className="h-9 rounded-lg">
                      <SelectValue placeholder="— o cliente existente —" />
                    </SelectTrigger>
                    <SelectContent>
                      {clientes.map((c) => (
                        <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="…o crear un cliente nuevo"
                    value={asign[g.nombre]?.nuevo ?? ""}
                    onChange={(e) =>
                      setAsign((a) => ({
                        ...a,
                        [g.nombre]: { nuevo: e.target.value },
                      }))
                    }
                    className="h-9 rounded-lg"
                  />
                </div>
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button disabled={busy || grupos.length === 0} onClick={submit}>
            Guardar {grupos.length > 1 ? `${grupos.length} deudas` : "deuda"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


function CuadreDetalle({ c }: { c: Cuadre }) {
  const r = calcCuadre(c);
  const totalPagado = Object.entries(c.salarioDenominaciones).reduce(
    (s, [b, n]) => s + Number(b) * n,
    0
  );
  return (
    <div className="space-y-4 text-sm">
      <div className="text-xs text-muted-foreground">
        {formatDiasTrabajados(c.diasTrabajados)} · {c.puntoVenta}
      </div>

      {/* IPV — vista en tarjetas (sin scroll horizontal) */}
      <Section title="IPV — Productos">
        <div className="space-y-1.5">
          {r.productos
            .filter(
              (p) =>
                Number(p.inicio) !== 0 ||
                Number(p.entradas) !== 0 ||
                Number(p.traslados) !== 0 ||
                Number(p.total) !== 0 ||
                Number(p.final) !== 0
            )
            .map((p) => (
              <div key={p.id} className="rounded-lg border border-border bg-muted/30 px-2.5 py-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold leading-tight">{p.nombre}</span>
                  <span className="font-mono text-xs font-bold tabular-nums">{fmt(p.importe)}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                  <span>Ini <b className="tabular-nums text-foreground">{q(p.inicio)}</b></span>
                  <span>Ent <b className="tabular-nums text-foreground">{q(p.entradas)}</b></span>
                  <span>Tras <b className="tabular-nums text-foreground">{q(p.traslados)}</b></span>
                  <span>Tot <b className="tabular-nums text-foreground">{q(p.total)}</b></span>
                  <span>Fin <b className="tabular-nums text-foreground">{q(p.final)}</b></span>
                  <span>Vend <b className="tabular-nums text-primary">{q(p.venta)}</b></span>
                  <span>Gan <b className="tabular-nums text-secondary">{fmt(p.ganancia)}</b></span>
                </div>
              </div>
            ))}
          <div className="flex items-center justify-between border-t-2 border-border pt-1.5 text-xs font-bold">
            <span>Totales</span>
            <span className="font-mono tabular-nums">
              {fmt(r.totalVenta)} · <span className="text-secondary">{fmt(r.gananciaTotal)}</span>
            </span>
          </div>
        </div>
      </Section>


      {/* Gastos */}
      <Section title={`Gastos (${c.gastos.length})`}>
        {c.gastos.length === 0 ? (
          <div className="text-xs text-muted-foreground">Sin gastos</div>
        ) : (
          <div className="space-y-1.5">
            {ordenarGastos(c.gastos).map((g) => (
              <div key={g.id} className="rounded-lg border border-border bg-muted/30 px-2.5 py-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold leading-tight">
                    {catLabel(g.categoria)} · {g.tipo}
                  </span>
                  <span className="font-mono text-xs font-bold tabular-nums">{fmt(g.monto)}</span>
                </div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {g.nombre && <div className="font-medium">{g.nombre}</div>}
                  {gastoLineas(g).map((l, i) => (
                    <div key={i}>{l}</div>
                  ))}
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between border-t-2 border-border pt-1.5 text-xs font-bold">
              <span>Total</span>
              <span className="font-mono tabular-nums">{fmt(r.totalGastos)}</span>
            </div>
          </div>
        )}
      </Section>


      {/* Caja + denominación */}
      <div className="grid gap-3 md:grid-cols-2">
        <Section title="Denominación recibida">
          <DenomList den={c.denominaciones} />
          <Row label="Efectivo final en caja" value={fmt(r.efectivoCajaFinal)} bold />
        </Section>
        {(c.recogidas ?? []).length > 0 && (
          <Section title="Efectivo recogido">
            {(c.recogidas ?? []).map((rc) => (
              <div key={rc.id} className="border-b border-border py-1 last:border-0">
                <Row
                  label={`${format(new Date(rc.fecha + "T12:00:00"), "d MMM", { locale: es })}${rc.quien ? ` · ${rc.quien}` : ""}`}
                  value={fmt(rc.monto)}
                />
                <DenomList den={rc.denominaciones} />
              </div>
            ))}
            <Row label="Total recogido" value={fmt(r.efectivoRecogido)} bold />
          </Section>
        )}
        <Section title="Resumen de caja">
          <Row label="Venta total" value={fmt(r.totalVenta)} />
          <Row label="− Total gastos" value={fmt(r.totalGastos)} />
          <Row label="= A depositar" value={fmt(r.efectivoADepositar)} />
          {r.efectivoRecogido > 0 && (
            <>
              <Row label="Efectivo recogido" value={fmt(r.efectivoRecogido)} />
              <Row label="Efectivo final en caja" value={fmt(r.efectivoCajaFinal)} />
            </>
          )}
          <Row label="Total entregado" value={fmt(r.efectivoEnCaja)} />
          <Row
            label={
              r.diferencia < 0
                ? "Faltante"
                : r.diferencia > 0
                ? "Sobrante / propina"
                : "Cuadrado"
            }
            value={fmt(r.diferencia)}
            tone={r.diferencia < 0 ? "danger" : r.diferencia > 0 ? "ok" : undefined}
            bold
          />
        </Section>
      </div>

      {/* Salario */}
      <div className="grid gap-3 md:grid-cols-2">
        <Section title="Salario">
          <Row label="Días trabajados" value={String(r.diasCount)} />
          <Row
            label="Modo"
            value={
              r.salarioModo === "porcentaje"
                ? `${r.porcentajeVenta}% de venta`
                : r.salarioModo === "mixto"
                ? `Base o ${r.porcentajeVenta}% (mayor)`
                : "Base/día"
            }
          />
          <Row label="Salario base/día" value={fmt(c.salarioBase)} />
          {(r.salarioModo === "porcentaje" || r.salarioModo === "mixto") && (
            <>
              <Row label="Calc. por base" value={fmt(r.salarioBasePeriodo)} />
              <Row label={`Calc. por % (${r.porcentajeVenta}%)`} value={fmt(r.salarioPorPorcentaje)} />
            </>
          )}
          <Row label="Salario bruto" value={fmt(r.salarioBruto)} />
          {r.propina > 0 && (
            <Row label="+ Propina" value={fmt(r.propina)} tone="ok" />
          )}
          {r.descuentoFalta > 0 && (
            <Row
              label="− Descuento por faltante"
              value={fmt(r.descuentoFalta)}
              tone="danger"
            />
          )}
          {r.descuentoDeudas > 0 && (
            <Row
              label="− Deudas pagadas del dependiente"
              value={fmt(r.descuentoDeudas)}
              tone="danger"
            />
          )}
          {r.deudaDependiente > 0 ? (
            <Row label="Deuda" value={fmt(r.deudaDependiente)} bold tone="danger" />
          ) : (
            <Row label="Salario real (pagado)" value={fmt(r.salarioReal)} bold tone="ok" />
          )}

        </Section>
        <Section title="Pago — billetes entregados">
          <DenomList den={c.salarioDenominaciones} />
          <Row label="Total entregado" value={fmt(totalPagado)} bold />
        </Section>
      </div>

      {/* Resumen final */}
      <Section title="Resumen final">
        <Row label="Venta total" value={fmt(r.totalVenta)} />
        <Row label="Costo total" value={fmt(r.totalCosto)} />
        <Row label="Ganancia bruta" value={fmt(r.gananciaTotal)} />
        <Row label="− Gastos (Local + Yanitza)" value={fmt(
          (r.gastosPorCategoria["Local"] || 0) + (r.gastosPorCategoria["Yanitza"] || 0)
        )} />
        <Row label="− Salario base" value={fmt(r.salarioBruto)} />
        <Row label="Ganancia neta" value={fmt(r.gananciaNeta)} bold tone="ok" />
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  tone,
}: {
  label: string;
  value: string;
  bold?: boolean;
  tone?: "ok" | "danger";
}) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={`font-mono tabular-nums ${bold ? "font-bold" : ""} ${
          tone === "ok"
            ? "text-secondary"
            : tone === "danger"
            ? "text-destructive"
            : ""
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function DenomList({ den }: { den: Record<string, number> }) {
  const rows = DENOMINACIONES.map((d) => ({ d, n: den[String(d)] || 0 })).filter(
    (x) => x.n > 0
  );
  if (rows.length === 0)
    return <div className="text-xs text-muted-foreground">—</div>;
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {rows.map(({ d, n }) => (
        <span
          key={d}
          className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold tabular-nums"
        >
          ${d} × {n} = {fmt(d * n)}
        </span>
      ))}
    </div>
  );
}

function Mini({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "danger";
}) {
  return (
    <div className="rounded-xl bg-muted/60 p-2">
      <div className="text-[10px] uppercase text-muted-foreground">
        {label}
      </div>
      <div
        className={`font-mono font-semibold tabular-nums ${
          tone === "ok" ? "text-secondary" : tone === "danger" ? "text-destructive" : ""
        }`}
      >
        {value}
      </div>
    </div>
  );
}

type Cambio = {
  key: string;
  nombre: string;
  antes: number;
  despues: number;
  accion: "actualizar" | "crear" | "eliminar" | "igual";
  deuda?: Deuda;
  clienteId?: string;
  productos: { nombre: string; cantidad: number; precio: number }[];
  faltante?: boolean;
};

function productosDeGrupo(gastos: Cuadre["gastos"]) {
  return gastos.flatMap((g) =>
    g.items && g.items.length
      ? g.items.map((i) => ({ nombre: i.productoNombre, cantidad: i.cantidad, precio: i.precio }))
      : [{
          nombre: g.tipo === "Producto" ? (g.productoNombre ?? g.descripcion) : g.descripcion || g.nombre || "Venta",
          cantidad: g.tipo === "Producto" ? (g.cantidad ?? 1) : 1,
          precio: g.tipo === "Producto" ? (g.precio ?? g.monto) : g.monto,
        }]
  );
}

function CorregirDeudasDialog({
  cuadre,
  deudas,
  clientes,
  onClose,
  onSaved,
}: {
  cuadre: Cuadre;
  deudas: Deuda[];
  clientes: { id: string; nombre: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const r = calcCuadre(cuadre);
  const nombreCli = (id: string) => clientes.find((c) => c.id === id)?.nombre ?? "Cliente";
  const esFaltante = (d: Deuda) =>
    d.id === cuadre.deudaDependienteId || (d.cuadre_label ?? "").startsWith("Faltante");

  const cambios: Cambio[] = [];
  const credito = deudas.filter((d) => !esFaltante(d));
  const usadas = new Set<string>();
  for (const g of creditoPorCliente(cuadre)) {
    const cliId =
      g.clienteId ??
      clientes.find((c) => c.nombre.trim().toLowerCase() === g.nombre.trim().toLowerCase())?.id;
    const d = credito.find((x) => x.cliente_id === cliId && !usadas.has(x.id));
    if (d) usadas.add(d.id);
    const despues = Math.round(g.total * 100) / 100;
    cambios.push({
      key: d?.id ?? `n-${g.nombre}`,
      nombre: g.nombre,
      antes: d ? Number(d.total) : 0,
      despues,
      accion: !d ? (cliId ? "crear" : "igual") : Math.abs(Number(d.total) - despues) < 0.01 ? "igual" : "actualizar",
      deuda: d,
      clienteId: cliId,
      productos: productosDeGrupo(g.gastos),
    });
  }
  for (const d of credito) {
    if (usadas.has(d.id)) continue;
    cambios.push({ key: d.id, nombre: nombreCli(d.cliente_id), antes: Number(d.total), despues: 0, accion: "eliminar", deuda: d, productos: d.productos });
  }
  const df = deudas.find(esFaltante);
  if (df) {
    const despues = Math.round(r.deudaDependiente);
    cambios.push({
      key: df.id,
      nombre: `${nombreCli(df.cliente_id)} (faltante)`,
      antes: Number(df.total),
      despues,
      accion: Math.abs(Number(df.total) - despues) < 0.01 ? "igual" : despues > 0 ? "actualizar" : "eliminar",
      deuda: df,
      productos: [],
      faltante: true,
    });
  }
  const pendientes = cambios.filter((c) => c.accion !== "igual");

  const aplicar = async () => {
    setBusy(true);
    try {
      let excedente = 0;
      for (const c of pendientes) {
        if (c.accion === "crear" && c.clienteId) {
          await crearDeuda({
            cliente_id: c.clienteId,
            cuadre_id: cuadre.id,
            cuadre_label: `${cuadre.puntoVenta} · ${format(new Date(fechaTrabajada(cuadre)), "dd MMM yyyy", { locale: es })}${cuadre.dependiente ? ` · ${cuadre.dependiente}` : ""}`,
            productos: c.productos,
            total: c.despues,
            fecha: fechaTrabajada(cuadre),
          });
          continue;
        }
        if (!c.deuda) continue;
        const a = ajustarDeuda(c.deuda, c.despues);
        excedente += a.excedente;
        if (a.eliminar) await eliminarDeuda(c.deuda.id);
        else
          await actualizarDeuda(c.deuda.id, {
            total: a.total,
            saldo: a.saldo,
            estado: a.estado,
            ...(c.faltante ? {} : { productos: c.productos }),
          });
      }
      toast.success(`Deudas corregidas (${pendientes.length})`);
      if (excedente > 0) toast.warning(`Hay ${fmt(excedente)} abonado de más; revísalo en Cobrar.`);
      qc.invalidateQueries({ queryKey: ["deudas-all"] });
      qc.invalidateQueries({ queryKey: ["deudas"] });
      qc.invalidateQueries({ queryKey: ["clientes"] });
      onSaved();
      onClose();
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudieron corregir las deudas");
    } finally {
      setBusy(false);
    }
  };

  const etiqueta = { actualizar: "Se actualiza", crear: "Se crea", eliminar: "Se quita", igual: "Sin cambios" };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Corregir deudas del cuadre</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">
          Compara las deudas guardadas con el cuadre actual. Lo ya abonado se respeta.
        </p>
        <div className="space-y-2">
          {cambios.map((c) => (
            <div key={c.key} className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-sm">
              <div className="min-w-0">
                <div className="truncate font-semibold">{c.nombre}</div>
                <div className="text-xs text-muted-foreground">
                  {c.accion === "igual" && !c.clienteId && !c.deuda ? "Sin cliente asignado" : etiqueta[c.accion]}
                </div>
              </div>
              <div className="text-right font-mono text-xs tabular-nums">
                {fmt(c.antes)} → <strong>{fmt(c.despues)}</strong>
              </div>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={aplicar} disabled={busy || pendientes.length === 0}>
            {pendientes.length === 0 ? "Todo coincide" : busy ? "Guardando…" : "Aplicar correcciones"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
