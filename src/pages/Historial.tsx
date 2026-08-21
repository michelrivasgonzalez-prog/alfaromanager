import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
} from "lucide-react";
import { generarPDF } from "@/lib/pdf";
import { deleteCuadreRemote } from "@/lib/sync";
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
import { listClientes, listDeudas, crearDeuda, upsertCliente } from "@/lib/cobrar";
import { formatDiasTrabajados, formatGastoDetalle } from "@/lib/dias";
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
    const key = g.clienteId || `__nn__${g.clienteNombre || g.nombre || "Sin asignar"}`;
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
  const { history, deleteHistory, editCuadre } = useCuadreStore();
  const nav = useNavigate();
  const { role } = useAuth();
  const canDelete = role === "admin" || role === "duena";
  const canPDF = role === "admin" || role === "duena";
  const canDeuda = role === "admin" || role === "duena";
  const canEdit = role === "admin" || role === "duena";
  const [detalle, setDetalle] = useState<Cuadre | null>(null);
  const [deudaFor, setDeudaFor] = useState<{ cuadre: Cuadre; pagada: boolean } | null>(null);
  const [punto, setPunto] = useState<"todos" | "Cafetería" | "Mipyme">("todos");

  const clientes = useQuery({ queryKey: ["clientes"], queryFn: listClientes, enabled: canDeuda });
  const deudasAll = useQuery({ queryKey: ["deudas-all"], queryFn: () => listDeudas(), enabled: canDeuda });
  const deudaByCuadre = useMemo(() => {
    const m = new Map<string, string>();
    for (const d of deudasAll.data ?? []) if (d.cuadre_id) m.set(d.cuadre_id, d.id);
    return m;
  }, [deudasAll.data]);

  const lista = useMemo(
    () => (punto === "todos" ? history : history.filter((c) => c.puntoVenta === punto)),
    [history, punto]
  );

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Historial de cuadres</h1>
      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-muted/60 p-1">
        {(["todos", "Cafetería", "Mipyme"] as const).map((p) => (
          <button
            key={p}
            onClick={() => setPunto(p)}
            className={`rounded-xl px-2 py-2 text-xs font-semibold transition-smooth ${
              punto === p ? "bg-card shadow-soft text-primary" : "text-muted-foreground"
            }`}
          >
            {p === "todos" ? "Todos" : p}
          </button>
        ))}
      </div>
      {lista.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <HistoryIcon className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Aún no hay cuadres guardados.
          </p>
        </div>
      )}
      {lista.map((c) => {

        const r = calcCuadre(c);
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
              <Mini label="Gastos" value={fmt(r.totalGastos)} />
              <Mini
                label="Diferencia"
                value={fmt(r.diferencia)}
                tone={r.diferencia < 0 ? "danger" : r.diferencia > 0 ? "ok" : undefined}
              />
            </div>
            {(() => {
              const credito = totalCredito(c);
              const yaLinked = deudaByCuadre.get(c.id);
              if (credito <= 0) return null;
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
      <Dialog open={!!detalle} onOpenChange={(o) => !o && setDetalle(null)}>
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
        const productos = grupo.gastos.map((g) => ({
          nombre: g.tipo === "Producto" ? (g.productoNombre ?? g.descripcion) : g.descripcion || g.nombre || "Venta",
          cantidad: g.tipo === "Producto" ? (g.cantidad ?? 1) : 1,
          precio: g.tipo === "Producto" ? (g.precio ?? g.monto) : g.monto,
        }));
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
            {c.gastos.map((g) => (
              <div key={g.id} className="rounded-lg border border-border bg-muted/30 px-2.5 py-1.5">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold leading-tight">
                    {catLabel(g.categoria)} · {g.tipo}
                  </span>
                  <span className="font-mono text-xs font-bold tabular-nums">{fmt(g.monto)}</span>
                </div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  {[g.nombre, formatGastoDetalle(g)].filter(Boolean).join(" · ") || "—"}
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
          <Row label="Efectivo en caja" value={fmt(r.efectivoEnCaja)} bold />
        </Section>
        <Section title="Resumen de caja">
          <Row label="Venta total" value={fmt(r.totalVenta)} />
          <Row label="− Total gastos" value={fmt(r.totalGastos)} />
          <Row label="= A depositar" value={fmt(r.efectivoADepositar)} />
          <Row label="Efectivo en caja" value={fmt(r.efectivoEnCaja)} />
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
          <Row label="Salario real (pagado)" value={fmt(r.salarioReal)} bold tone="ok" />
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
      <div className="text-[10px] uppercase text-muted-foreground">{label}</div>
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
