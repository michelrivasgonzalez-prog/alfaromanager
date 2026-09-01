import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Warehouse,
  Plus,
  PackagePlus,
  PackageMinus,
  Pencil,
  Trash2,
  RotateCcw,
  AlertTriangle,
  History as HistoryIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { NumberInput } from "@/components/NumberInput";
import {
  AlmProducto,
  AlmMovimiento,
  listProductos,
  upsertProducto,
  softDeleteProducto,
  listMovimientos,
  crearMovimiento,
  corregirMovimiento,
  stockByProducto,
} from "@/lib/almacen";
import { fmtDinero, fmtCant } from "@/lib/format";

export default function Almacen() {
  const qc = useQueryClient();
  const productos = useQuery({ queryKey: ["alm-productos"], queryFn: listProductos });
  const movimientos = useQuery({ queryKey: ["alm-movimientos"], queryFn: () => listMovimientos({ limit: 200 }) });
  const stocks = useQuery({ queryKey: ["alm-stocks"], queryFn: stockByProducto });

  const productosList = productos.data ?? [];
  const bajoMin = productosList.filter((p) => (stocks.data?.[p.id] ?? 0) <= p.stock_minimo).length;
  const total = productosList.length;
  const totalMovs = movimientos.data?.length ?? 0;
  const sinCosto = productosList.filter((p) => !p.costo_actual || Number(p.costo_actual) <= 0);
  const valorInventario = productosList.reduce(
    (s, p) => s + (stocks.data?.[p.id] ?? 0) * Number(p.costo_actual ?? 0),
    0
  );

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["alm-productos"] });
    qc.invalidateQueries({ queryKey: ["alm-movimientos"] });
    qc.invalidateQueries({ queryKey: ["alm-stocks"] });
  };

  const [prodDialog, setProdDialog] = useState<Partial<AlmProducto> | null>(null);
  const [movDialog, setMovDialog] = useState<{ tipo: "entrada" | "salida" } | null>(null);

  return (
    <div className="space-y-4 pb-24">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl gradient-primary text-primary-foreground shadow-soft">
          <Warehouse className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <h1 className="text-xl font-bold text-primary">Almacén</h1>
          <p className="text-xs text-muted-foreground">Control de inventario independiente</p>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <KpiCard label="Productos" value={total} />
        <KpiCard label="Bajo mínimo" value={bajoMin} tone={bajoMin > 0 ? "danger" : undefined} />
        <KpiCard label="Valor inventario" value={fmtDinero(valorInventario)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <KpiCard label="Movimientos" value={totalMovs} />
        <KpiCard
          label="Sin precio de costo"
          value={sinCosto.length}
          tone={sinCosto.length > 0 ? "danger" : undefined}
        />
      </div>
      {sinCosto.length > 0 && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-3 text-[11px] text-destructive">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-3.5 w-3.5" /> {sinCosto.length} producto(s) sin precio de costo
          </div>
          <div className="mt-1 text-destructive/80">
            {sinCosto.map((p) => p.nombre).join(", ")}. Registra el costo en la próxima entrada o edita el producto.
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          className="h-11 rounded-xl gradient-primary text-primary-foreground"
          onClick={() => setMovDialog({ tipo: "entrada" })}
        >
          <PackagePlus className="mr-2 h-4 w-4" /> Entrada
        </Button>
        <Button
          variant="outline"
          className="h-11 rounded-xl"
          onClick={() => setMovDialog({ tipo: "salida" })}
          disabled={productosList.length === 0}
        >
          <PackageMinus className="mr-2 h-4 w-4" /> Salida
        </Button>
      </div>

      <Tabs defaultValue="productos" className="w-full">
        <TabsList className="grid w-full grid-cols-2 rounded-xl">
          <TabsTrigger value="productos" className="rounded-lg">Productos</TabsTrigger>
          <TabsTrigger value="historial" className="rounded-lg">Historial</TabsTrigger>
        </TabsList>

        <TabsContent value="productos" className="mt-3 space-y-3">
          <Button
            variant="outline"
            className="h-10 w-full rounded-xl"
            onClick={() =>
              setProdDialog({ nombre: "", unidad: "u", stock_minimo: 0, permite_negativo: false })
            }
          >
            <Plus className="mr-2 h-4 w-4" /> Nuevo producto
          </Button>
          {productos.isLoading && <div className="text-center text-xs text-muted-foreground">Cargando…</div>}
          {productos.data?.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Aún no hay productos. Crea el primero para empezar.
            </div>
          )}
          {productos.data?.map((p) => {
            const stock = stocks.data?.[p.id] ?? 0;
            const bajo = stock <= p.stock_minimo;
            return (
              <div key={p.id} className="rounded-2xl border border-border bg-card p-3 shadow-soft">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{p.nombre}</div>
                    <div className="text-[11px] text-muted-foreground">
                      Unidad: {p.unidad} · Mínimo: {fmtCant(p.stock_minimo)}
                      {p.permite_negativo && " · Permite negativo"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {p.costo_actual && Number(p.costo_actual) > 0 ? (
                        <>
                          Costo prom.: {fmtDinero(Number(p.costo_actual))} · Valor:{" "}
                          {fmtDinero(stock * Number(p.costo_actual))}
                        </>
                      ) : (
                        <span className="font-semibold text-destructive">Sin precio de costo</span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase text-muted-foreground">Existencia</div>
                    <div
                      className={`font-mono text-lg font-bold tabular-nums ${
                        bajo ? "text-destructive" : "text-primary"
                      }`}
                    >
                      {fmtCant(stock)}
                    </div>
                  </div>
                </div>
                {bajo && (
                  <div className="mt-2 flex items-center gap-1 text-[11px] text-destructive">
                    <AlertTriangle className="h-3 w-3" /> Bajo mínimo
                  </div>
                )}
                <div className="mt-2 flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1 rounded-lg" onClick={() => setProdDialog(p)}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> Editar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    onClick={async () => {
                      if (!confirm(`¿Eliminar "${p.nombre}"? El historial se conserva.`)) return;
                      await softDeleteProducto(p.id);
                      toast.success("Producto eliminado");
                      invalidateAll();
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            );
          })}
        </TabsContent>

        <TabsContent value="historial" className="mt-3 space-y-2">
          <MovimientosHistorial
            movimientos={movimientos.data ?? []}
            productos={productosList}
            onCorregir={async (mov) => {
              if (
                !confirm(
                  "Se generará una reversión que ANULA este movimiento. Esta acción no se puede deshacer. ¿Continuar?"
                )
              )
                return;
              const obs = prompt("Observación de la corrección (opcional):") ?? undefined;
              try {
                await corregirMovimiento(mov, obs || undefined);
                toast.success("Movimiento corregido con reversión");
                invalidateAll();
              } catch (e: any) {
                toast.error(e.message);
              }
            }}
          />
        </TabsContent>
      </Tabs>

      {/* Producto Dialog */}
      <Dialog open={!!prodDialog} onOpenChange={(o) => !o && setProdDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{prodDialog?.id ? "Editar producto" : "Nuevo producto"}</DialogTitle>
          </DialogHeader>
          {prodDialog && (
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Nombre</Label>
                <Input
                  value={prodDialog.nombre ?? ""}
                  onChange={(e) => setProdDialog({ ...prodDialog, nombre: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label>Unidad</Label>
                  <Input
                    value={prodDialog.unidad ?? "u"}
                    onChange={(e) => setProdDialog({ ...prodDialog, unidad: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Stock mínimo</Label>
                  <NumberInput
                    value={prodDialog.stock_minimo ?? 0}
                    onChange={(v) => setProdDialog({ ...prodDialog, stock_minimo: v })}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Precio de costo (promedio)</Label>
                <NumberInput
                  value={Number(prodDialog.costo_actual ?? 0)}
                  onChange={(v) => setProdDialog({ ...prodDialog, costo_actual: v })}
                />
                <p className="text-[11px] text-muted-foreground">
                  Se recalcula automáticamente con las entradas que traigan costo.
                </p>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border p-3">
                <div>
                  <div className="text-sm font-medium">Permitir stock negativo</div>
                  <div className="text-[11px] text-muted-foreground">Solo si sabes lo que haces</div>
                </div>
                <Switch
                  checked={prodDialog.permite_negativo ?? false}
                  onCheckedChange={(v) => setProdDialog({ ...prodDialog, permite_negativo: v })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setProdDialog(null)}>Cancelar</Button>
            <Button
              onClick={async () => {
                if (!prodDialog?.nombre?.trim()) return toast.error("Nombre requerido");
                try {
                  await upsertProducto(prodDialog as any);
                  toast.success("Guardado");
                  setProdDialog(null);
                  invalidateAll();
                } catch (e: any) {
                  toast.error(e.message);
                }
              }}
            >
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Movimiento Dialog */}
      <MovimientoDialog
        open={!!movDialog}
        tipo={movDialog?.tipo ?? "entrada"}
        productos={productosList}
        stocks={stocks.data ?? {}}
        onClose={() => setMovDialog(null)}
        onSaved={invalidateAll}
      />
    </div>
  );
}

function MovimientosHistorial({
  movimientos,
  productos,
  onCorregir,
}: {
  movimientos: AlmMovimiento[];
  productos: AlmProducto[];
  onCorregir: (m: AlmMovimiento) => void;
}) {
  const [productoId, setProductoId] = useState<string>("");
  const [tipo, setTipo] = useState<string>("");
  const nameById = useMemo(
    () => Object.fromEntries(productos.map((p) => [p.id, p.nombre])),
    [productos]
  );
  const filtered = movimientos.filter((m) => {
    if (productoId && m.producto_id !== productoId) return false;
    if (tipo && m.tipo !== tipo) return false;
    return true;
  });
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <Select value={productoId || "all"} onValueChange={(v) => setProductoId(v === "all" ? "" : v)}>
          <SelectTrigger className="h-9 rounded-xl text-xs">
            <SelectValue placeholder="Producto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los productos</SelectItem>
            {productos.map((p) => (
              <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={tipo || "all"} onValueChange={(v) => setTipo(v === "all" ? "" : v)}>
          <SelectTrigger className="h-9 rounded-xl text-xs">
            <SelectValue placeholder="Tipo" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="entrada">Entradas</SelectItem>
            <SelectItem value="salida">Salidas</SelectItem>
          </SelectContent>
        </Select>
      </div>
      {filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          <HistoryIcon className="mx-auto mb-2 h-6 w-6" /> Sin movimientos
        </div>
      )}
      {filtered.map((m) => (
        <div key={m.id} className="rounded-2xl border border-border bg-card p-3 shadow-soft">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-semibold">
                {m.tipo === "entrada" ? (
                  <PackagePlus className="h-4 w-4 text-secondary" />
                ) : (
                  <PackageMinus className="h-4 w-4 text-destructive" />
                )}
                <span className="truncate">{nameById[m.producto_id] ?? "?"}</span>
                {m.reversion_de && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                    REVERSIÓN
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {format(new Date(m.fecha), "dd MMM yyyy · HH:mm", { locale: es })}
                {m.receptor ? ` · ${m.receptor}` : ""}
              </div>
              {m.costo_unitario && Number(m.costo_unitario) > 0 && (
                <div className="text-[11px] text-muted-foreground">
                  Costo unitario: {fmtDinero(Number(m.costo_unitario))} · Importe:{" "}
                  {fmtDinero(Number(m.costo_unitario) * Number(m.cantidad))}
                </div>
              )}
              {m.observacion && (
                <div className="mt-1 text-[11px] italic text-muted-foreground">{m.observacion}</div>
              )}
            </div>
            <div className="text-right">
              <div
                className={`font-mono text-lg font-bold tabular-nums ${
                  m.tipo === "entrada" ? "text-secondary" : "text-destructive"
                }`}
              >
                {m.tipo === "entrada" ? "+" : "−"}
                {fmtCant(m.cantidad)}
              </div>
              {!m.reversion_de && (
                <Button size="sm" variant="ghost" className="mt-1 h-7 px-2 text-[11px]" onClick={() => onCorregir(m)}>
                  <RotateCcw className="mr-1 h-3 w-3" /> Corregir
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function MovimientoDialog({
  open,
  tipo,
  productos,
  stocks,
  onClose,
  onSaved,
}: {
  open: boolean;
  tipo: "entrada" | "salida";
  productos: AlmProducto[];
  stocks: Record<string, number>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [productoId, setProductoId] = useState("");
  const [cantidad, setCantidad] = useState(0);
  const [receptor, setReceptor] = useState("");
  const [observacion, setObservacion] = useState("");
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 16));
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setProductoId("");
    setCantidad(0);
    setReceptor("");
    setObservacion("");
    setFecha(new Date().toISOString().slice(0, 16));
  };

  const submit = async () => {
    if (!productoId) return toast.error("Selecciona un producto");
    if (!cantidad || cantidad <= 0) return toast.error("Cantidad > 0");
    if (tipo === "salida" && !receptor.trim()) return toast.error("Receptor requerido");
    setBusy(true);
    try {
      await crearMovimiento({
        producto_id: productoId,
        tipo,
        cantidad,
        fecha: new Date(fecha).toISOString(),
        receptor: tipo === "salida" ? receptor.trim() : null,
        observacion: observacion.trim() || null,
      });
      toast.success(`${tipo === "entrada" ? "Entrada" : "Salida"} registrada`);
      onSaved();
      reset();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const stockActual = productoId ? stocks[productoId] ?? 0 : null;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {tipo === "entrada" ? (
              <><PackagePlus className="h-4 w-4" /> Registrar entrada</>
            ) : (
              <><PackageMinus className="h-4 w-4" /> Registrar salida</>
            )}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Producto</Label>
            <Select value={productoId} onValueChange={setProductoId}>
              <SelectTrigger className="h-11 rounded-xl">
                <SelectValue placeholder="Selecciona un producto" />
              </SelectTrigger>
              <SelectContent>
                {productos.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.nombre} · stock: {stocks[p.id] ?? 0}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {stockActual !== null && (
              <div className="text-[11px] text-muted-foreground">Existencia actual: {stockActual}</div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label>Cantidad</Label>
              <NumberInput value={cantidad} onChange={setCantidad} />
            </div>
            <div className="space-y-1">
              <Label>Fecha y hora</Label>
              <Input type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </div>
          </div>
          {tipo === "salida" && (
            <div className="space-y-1">
              <Label>Receptor</Label>
              <Input value={receptor} onChange={(e) => setReceptor(e.target.value)} placeholder="A quién se entrega" />
            </div>
          )}
          <div className="space-y-1">
            <Label>Observación (opcional)</Label>
            <Textarea
              value={observacion}
              onChange={(e) => setObservacion(e.target.value)}
              className="min-h-[60px] rounded-xl"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }}>Cancelar</Button>
          <Button disabled={busy} onClick={submit}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function KpiCard({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "danger" }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-soft">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`mt-1 text-xl font-bold ${tone === "danger" ? "text-destructive" : "text-primary"}`}>{value}</div>
    </div>
  );
}
