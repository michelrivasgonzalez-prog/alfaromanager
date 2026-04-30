import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Pencil,
  Plus,
  Trash2,
  CalendarIcon,
  AlertTriangle,
  CheckCircle2,
  FileDown,
  Wallet,
  TrendingUp,
  TrendingDown,
  Coffee,
  Store,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import StepShell from "@/components/cuadre/StepShell";
import { NumberInput } from "@/components/NumberInput";
import {
  DENOMINACIONES,
  Gasto,
  PUNTOS,
  PuntoVenta,
  calcCuadre,
  calcProducto,
  sugerirPagoSalario,
  useCuadreStore,
} from "@/store/cuadreStore";
import { generarPDF } from "@/lib/pdf";

const fmt = (n: number) =>
  `$${n.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

export default function Cuadre() {
  const { step } = useParams();
  const nav = useNavigate();
  const { activePunto, currents, startCuadre, setLastStep } = useCuadreStore();
  const current = currents[activePunto];
  const idx = Math.max(1, Math.min(10, Number(step) || 1));

  useEffect(() => {
    if (!current) startCuadre(activePunto);
  }, [current, activePunto, startCuadre]);

  useEffect(() => {
    setLastStep(activePunto, idx);
  }, [idx, activePunto, setLastStep]);

  if (!current) return null;

  switch (idx) {
    case 1: return <Step1 />;
    case 2: return <StepInventario field="inicio" title="Inventario inicial" />;
    case 3: return <Step4 />;
    case 4: return <StepInventario field="final" title="Inventario final" />;
    case 5: return <Step5 />;
    case 6: return <Step6 />;
    case 7: return <Step7 />;
    case 8: return <Step8 />;
    case 9: return <Step9 />;
    case 10: return <Step10 onClose={() => nav("/")} />;
  }
  return null;
}

/* ================== Step 1 ================== */
function Step1() {
  const {
    currents,
    activePunto,
    setActivePunto,
    startCuadre,
    updateCurrent,
    dependientes,
    role,
  } = useCuadreStore();
  const current = currents[activePunto];
  if (!current) return null;
  const days = current.diasTrabajados.map((d) => new Date(d));
  const otherPunto: PuntoVenta = activePunto === "Cafetería" ? "Mipyme" : "Cafetería";
  const otherActive = !!currents[otherPunto];

  return (
    <StepShell onNextDisabled={!current.dependiente.trim() || days.length === 0}>
      {/* Selector de punto de venta */}
      <div className="rounded-2xl border border-border bg-card p-3 shadow-soft">
        <Label className="text-xs uppercase tracking-widest text-muted-foreground">
          Punto de venta
        </Label>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {PUNTOS.map((p) => {
            const active = p === activePunto;
            const hasCuadre = !!currents[p];
            const Icon = p === "Cafetería" ? Coffee : Store;
            return (
              <button
                key={p}
                onClick={() => {
                  setActivePunto(p);
                  if (!currents[p]) startCuadre(p);
                }}
                className={cn(
                  "relative flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-smooth",
                  active
                    ? "gradient-primary border-0 text-primary-foreground shadow-soft"
                    : "border-border bg-card text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {p}
                {hasCuadre && !active && (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-secondary ring-2 ring-card" />
                )}
              </button>
            );
          })}
        </div>
        {otherActive && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            Tienes un cuadre abierto también en <strong>{otherPunto}</strong>. Puedes alternar
            entre ambos sin perder datos.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft space-y-4">
        <div className="space-y-2">
          <Label>Nombre del dependiente</Label>
          {role === "dependiente" ? (
            <Input
              value={current.dependiente}
              readOnly
              disabled
              placeholder="Selecciona un dependiente"
              className="h-12 rounded-xl"
            />
          ) : (
            <Select
              value={current.dependiente}
              onValueChange={(v) => updateCurrent({ dependiente: v })}
            >
              <SelectTrigger className="h-12 rounded-xl">
                <SelectValue placeholder="Selecciona un dependiente" />
              </SelectTrigger>
              <SelectContent>
                {dependientes.length === 0 && (
                  <div className="px-3 py-2 text-xs text-muted-foreground">
                    Agrega dependientes en la sección Usuarios
                  </div>
                )}
                {dependientes.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {role === "dependiente" && (
            <p className="text-[11px] text-muted-foreground">
              Solo el administrador puede asignar el dependiente del turno.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <Label>Días trabajados</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "h-12 w-full justify-start rounded-xl text-left font-normal",
                  days.length === 0 && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {days.length > 0
                  ? `${days.length} día(s) seleccionados`
                  : "Selecciona días"}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="multiple"
                selected={days}
                onSelect={(d) =>
                  updateCurrent({
                    diasTrabajados: (d ?? []).map((x) => x.toISOString()),
                  })
                }
                className={cn("p-3 pointer-events-auto")}
                locale={es}
              />
            </PopoverContent>
          </Popover>
          {days.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-1">
              {days.map((d) => (
                <span
                  key={d.toISOString()}
                  className="rounded-full bg-secondary/10 px-2.5 py-1 text-xs font-medium text-secondary"
                >
                  {format(d, "dd MMM", { locale: es })}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </StepShell>
  );
}

/* ================== Step 2/4: inventario ================== */
function StepInventario({
  field,
  title,
}: {
  field: "inicio" | "final";
  title: string;
}) {
  const { currents, activePunto, updateProducto, history, importarFinales } =
    useCuadreStore();
  const current = currents[activePunto];
  const [editing, setEditing] = useState<string | null>(null);
  if (!current) return null;

  const previos = history.filter((h) => h.puntoVenta === activePunto);

  return (
    <StepShell title={title}>
      {field === "inicio" && previos.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-3 shadow-soft space-y-2">
          <Label className="text-xs uppercase tracking-widest text-muted-foreground">
            Importar finales del turno anterior
          </Label>
          <Select
            onValueChange={(v) => {
              importarFinales(v);
              toast.success("Inicios cargados desde el turno seleccionado");
            }}
          >
            <SelectTrigger className="h-11 rounded-xl">
              <SelectValue placeholder="Selecciona un turno previo" />
            </SelectTrigger>
            <SelectContent>
              {previos.map((h) => (
                <SelectItem key={h.id} value={h.id}>
                  {format(new Date(h.fecha), "dd MMM yyyy HH:mm", { locale: es })}
                  {h.dependiente ? ` · ${h.dependiente}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Copia los finales del turno elegido como inicios de este cuadre.
          </p>
        </div>
      )}
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-muted/60">
            <tr className="text-left">
              <th className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Producto
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cantidad
              </th>
              <th className="px-2 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {current.productos.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-3 py-3 font-medium">{p.nombre}</td>
                <td className="px-3 py-2 text-right">
                  {editing === p.id ? (
                    <NumberInput
                      autoFocus
                      value={p[field]}
                      onChange={(v) => updateProducto(p.id, { [field]: v } as any)}
                      onBlur={() => setEditing(null)}
                      className="ml-auto h-9 w-24 rounded-lg text-right"
                    />
                  ) : (
                    <span className="font-mono tabular-nums">{p[field]}</span>
                  )}
                </td>
                <td className="px-2 py-2 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    onClick={() => setEditing(editing === p.id ? null : p.id)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Para agregar productos nuevos, ve al paso de Entradas y traslados.
      </p>
    </StepShell>
  );
}

/* ================== Step 3: entradas y traslados ================== */
function Step4() {
  const { currents, activePunto, updateProducto, addProducto, role } = useCuadreStore();
  const current = currents[activePunto];
  const [productoId, setProductoId] = useState("");
  const [tipo, setTipo] = useState<"entrada" | "traslado">("entrada");
  const [cantidad, setCantidad] = useState(0);
  if (!current) return null;

  const aplicar = () => {
    if (!productoId || !cantidad) return;
    const p = current.productos.find((x) => x.id === productoId);
    if (!p) return;
    if (tipo === "entrada") updateProducto(p.id, { entradas: p.entradas + cantidad });
    else updateProducto(p.id, { traslados: p.traslados + cantidad });
    setCantidad(0);
    toast.success(`${tipo === "entrada" ? "Entrada" : "Traslado"} registrado`);
  };

  return (
    <StepShell>
      {role === "admin" && (
        <Button
          variant="outline"
          className="h-11 w-full rounded-xl"
          onClick={() => {
            const nombre = prompt("Nombre del nuevo producto:");
            if (!nombre) return;
            addProducto({
              nombre,
              inicio: 0,
              entradas: 0,
              traslados: 0,
              final: 0,
              precio: 0,
              costo: 0,
            });
            toast.success("Producto agregado a este cuadre");
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> Agregar producto
        </Button>
      )}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant={tipo === "entrada" ? "default" : "outline"}
            onClick={() => setTipo("entrada")}
            className={cn(
              "h-11 rounded-xl",
              tipo === "entrada" && "gradient-emerald text-secondary-foreground border-0"
            )}
          >
            Entrada
          </Button>
          <Button
            variant={tipo === "traslado" ? "default" : "outline"}
            onClick={() => setTipo("traslado")}
            className={cn(
              "h-11 rounded-xl",
              tipo === "traslado" && "gradient-primary text-primary-foreground border-0"
            )}
          >
            Traslado
          </Button>
        </div>
        <div className="space-y-2">
          <Label>Producto</Label>
          <Select value={productoId} onValueChange={setProductoId}>
            <SelectTrigger className="h-12 rounded-xl">
              <SelectValue placeholder="Selecciona producto" />
            </SelectTrigger>
            <SelectContent>
              {current.productos.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.nombre}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Cantidad</Label>
          <NumberInput
            value={cantidad}
            onChange={setCantidad}
            className="h-12 rounded-xl"
          />
        </div>
        <Button
          onClick={aplicar}
          className="h-11 w-full rounded-xl gradient-emerald text-secondary-foreground"
        >
          <Plus className="mr-2 h-4 w-4" /> Registrar movimiento
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <table className="w-full text-xs">
          <thead className="bg-muted/60">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Producto</th>
              <th className="px-2 py-2 text-right font-semibold">Entr.</th>
              <th className="px-2 py-2 text-right font-semibold">Trasl.</th>
            </tr>
          </thead>
          <tbody>
            {current.productos.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-3 py-2">{p.nombre}</td>
                <td className="px-2 py-2 text-right font-mono tabular-nums text-secondary">
                  +{p.entradas}
                </td>
                <td className="px-2 py-2 text-right font-mono tabular-nums text-primary">
                  -{p.traslados}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </StepShell>
  );
}

/* ================== Step 5: Resultados ================== */
function Step5() {
  const { currents, activePunto, updateProducto, role } = useCuadreStore();
  const current = currents[activePunto];
  if (!current) return null;
  const isAdmin = role === "admin";
  const totalImporte = current.productos.reduce(
    (s, p) => s + calcProducto(p).importe,
    0
  );
  const totalGanancia = current.productos.reduce(
    (s, p) => s + calcProducto(p).ganancia,
    0
  );

  return (
    <StepShell>
      <div className="grid grid-cols-2 gap-3">
        <SummaryTile label="Venta total" value={fmt(totalImporte)} accent="emerald" />
        {isAdmin ? (
          <SummaryTile label="Ganancia" value={fmt(totalGanancia)} accent="primary" />
        ) : (
          <SummaryTile
            label="Unidades vendidas"
            value={String(
              current.productos.reduce((s, p) => s + calcProducto(p).venta, 0)
            )}
            accent="primary"
          />
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
        <table className="w-full min-w-[640px] text-xs">
          <thead className="bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-2 py-2 text-left">Producto</th>
              <th className="px-2 py-2 text-right">Inicio</th>
              <th className="px-2 py-2 text-right">Entr.</th>
              <th className="px-2 py-2 text-right">Trasl.</th>
              <th className="px-2 py-2 text-right">Total</th>
              <th className="px-2 py-2 text-right">Final</th>
              <th className="px-2 py-2 text-right">Vendidos</th>
              {isAdmin && <th className="px-2 py-2 text-right">Precio</th>}
              <th className="px-2 py-2 text-right">Importe</th>
              {isAdmin && <th className="px-2 py-2 text-right">Costo</th>}
              {isAdmin && <th className="px-2 py-2 text-right">Ganancia</th>}
            </tr>
          </thead>
          <tbody>
            {current.productos.map((p) => {
              const c = calcProducto(p);
              return (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-2 py-2 font-medium">{p.nombre}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{p.inicio}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{p.entradas}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{p.traslados}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-semibold">
                    {c.total}
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums">{p.final}</td>
                  <td className="px-2 py-2 text-right tabular-nums font-semibold">
                    {c.venta}
                  </td>
                  {isAdmin && (
                    <td className="px-2 py-2 text-right tabular-nums">
                      <NumberInput
                        value={p.precio}
                        onChange={(v) => updateProducto(p.id, { precio: v })}
                        className="ml-auto h-7 w-16 rounded-md text-right text-xs"
                      />
                    </td>
                  )}
                  <td className="px-2 py-2 text-right tabular-nums font-semibold text-secondary">
                    {fmt(c.importe)}
                  </td>
                  {isAdmin && (
                    <td className="px-2 py-2 text-right tabular-nums">
                      <NumberInput
                        value={p.costo}
                        onChange={(v) => updateProducto(p.id, { costo: v })}
                        className="ml-auto h-7 w-16 rounded-md text-right text-xs"
                      />
                    </td>
                  )}
                  {isAdmin && (
                    <td className="px-2 py-2 text-right tabular-nums font-semibold text-primary">
                      {fmt(c.ganancia)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </StepShell>
  );
}

function SummaryTile({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: "emerald" | "primary" | "destructive";
}) {
  const cls =
    accent === "emerald"
      ? "gradient-emerald text-secondary-foreground"
      : accent === "destructive"
      ? "bg-destructive text-destructive-foreground"
      : "gradient-primary text-primary-foreground";
  return (
    <div className={`rounded-2xl p-4 shadow-soft ${cls}`}>
      <div className="text-[10px] font-semibold uppercase tracking-widest opacity-80">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

/* ================== Step 6: Gastos ================== */
const CATEGORIAS: Gasto["categoria"][] = [
  "Local",
  "Yanitza",
  "Compras",
  "Cuentas por Cobrar",
  "Transferencia",
];

function Step6() {
  const { currents, activePunto, addGasto, removeGasto } = useCuadreStore();
  const current = currents[activePunto];
  const [cat, setCat] = useState<Gasto["categoria"]>("Local");
  const [tipo, setTipo] = useState<"Efectivo" | "Producto">("Efectivo");
  const [nombre, setNombre] = useState("");
  const [desc, setDesc] = useState("");
  const [monto, setMonto] = useState(0);
  const [cantidad, setCantidad] = useState(0);
  const [precio, setPrecio] = useState(0);
  const [productoId, setProductoId] = useState<string>("");
  if (!current) return null;

  const importeProducto = cantidad * precio;
  const total = current.gastos.reduce((s, g) => s + g.monto, 0);
  const productoSel = current.productos.find((p) => p.id === productoId);

  const limpiar = () => {
    setNombre("");
    setDesc("");
    setMonto(0);
    setCantidad(0);
    setPrecio(0);
    setProductoId("");
  };

  const guardar = () => {
    if (tipo === "Efectivo" && !monto) return;
    if (tipo === "Producto" && (!productoId || !cantidad || !precio)) return;
    addGasto({
      categoria: cat,
      nombre: nombre || "—",
      tipo,
      descripcion:
        desc ||
        (tipo === "Producto"
          ? `${productoSel?.nombre ?? "Producto"} x${cantidad}`
          : cat),
      productoId: tipo === "Producto" ? productoId : undefined,
      productoNombre: tipo === "Producto" ? productoSel?.nombre : undefined,
      cantidad: tipo === "Producto" ? cantidad : undefined,
      precio: tipo === "Producto" ? precio : undefined,
      monto: tipo === "Producto" ? importeProducto : monto,
    });
    limpiar();
    toast.success("Gasto agregado");
  };

  return (
    <StepShell>
      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Categoría</Label>
            <Select value={cat} onValueChange={(v) => setCat(v as any)}>
              <SelectTrigger className="mt-1 h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CATEGORIAS.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as any)}>
              <SelectTrigger className="mt-1 h-11 rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Efectivo">Efectivo</SelectItem>
                <SelectItem value="Producto">Producto</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <Label className="text-xs">Nombre (quién recibe)</Label>
          <Input
            placeholder="Nombre"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className="mt-1 h-11 rounded-xl"
          />
        </div>

        <div>
          <Label className="text-xs">Descripción</Label>
          <Input
            placeholder="Descripción"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
            className="mt-1 h-11 rounded-xl"
          />
        </div>

        {tipo === "Efectivo" ? (
          <div>
            <Label className="text-xs">Monto</Label>
            <NumberInput
              value={monto}
              onChange={setMonto}
              className="mt-1 h-11 rounded-xl"
            />
          </div>
        ) : (
          <>
            <div>
              <Label className="text-xs">Producto</Label>
              <Select
                value={productoId}
                onValueChange={(v) => {
                  setProductoId(v);
                  const p = current.productos.find((x) => x.id === v);
                  if (p) setPrecio(p.precio);
                }}
              >
                <SelectTrigger className="mt-1 h-11 rounded-xl">
                  <SelectValue placeholder="Buscar producto…" />
                </SelectTrigger>
                <SelectContent>
                  {current.productos.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.nombre} · {fmt(p.precio)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Cantidad</Label>
              <NumberInput
                value={cantidad}
                onChange={setCantidad}
                className="mt-1 h-11 rounded-xl"
              />
            </div>
            <div>
              <Label className="text-xs">Precio</Label>
              <NumberInput
                value={precio}
                onChange={setPrecio}
                className="mt-1 h-11 rounded-xl"
              />
            </div>
            <div>
              <Label className="text-xs">Importe</Label>
              <Input
                value={fmt(importeProducto)}
                readOnly
                disabled
                className="mt-1 h-11 rounded-xl bg-muted text-right font-mono"
              />
            </div>
          </div>
          </>
        )}

        <Button
          onClick={guardar}
          className="h-11 w-full rounded-xl bg-primary text-primary-foreground"
        >
          <Plus className="mr-2 h-4 w-4" /> Agregar gasto
        </Button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left">Categoría</th>
              <th className="px-3 py-2 text-left">Nombre</th>
              <th className="px-3 py-2 text-left">Detalle</th>
              <th className="px-3 py-2 text-right">Monto</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody>
            {current.gastos.length === 0 && (
              <tr>
                <td
                  colSpan={5}
                  className="px-3 py-6 text-center text-muted-foreground"
                >
                  Sin gastos registrados
                </td>
              </tr>
            )}
            {current.gastos.map((g) => (
              <tr key={g.id} className="border-t border-border align-top">
                <td className="px-3 py-2 text-xs">
                  <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                    {g.categoria}
                  </span>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{g.tipo}</div>
                </td>
                <td className="px-3 py-2 text-xs font-medium">{g.nombre}</td>
                <td className="px-3 py-2 text-xs">
                  <div>{g.descripcion}</div>
                  {g.tipo === "Producto" && (
                    <div className="text-[10px] text-muted-foreground">
                      {g.cantidad} × {fmt(g.precio || 0)}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums">
                  {fmt(g.monto)}
                </td>
                <td className="px-2 py-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-destructive"
                    onClick={() => removeGasto(g.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/40 font-bold">
            <tr>
              <td colSpan={3} className="px-3 py-3">
                Total
              </td>
              <td className="px-3 py-3 text-right font-mono tabular-nums text-destructive">
                {fmt(total)}
              </td>
              <td></td>
            </tr>
          </tfoot>
        </table>
      </div>
    </StepShell>
  );
}

/* ================== Step 7: Cuadre de efectivo ================== */
function Step7() {
  const { currents, activePunto, setDenominacion } = useCuadreStore();
  const current = currents[activePunto];
  if (!current) return null;
  const total = Object.entries(current.denominaciones).reduce(
    (s, [b, n]) => s + Number(b) * n,
    0
  );

  return (
    <StepShell>
      <div className="rounded-2xl gradient-primary p-5 text-primary-foreground shadow-elegant">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest opacity-80">
          <Wallet className="h-3.5 w-3.5" /> Efectivo en caja
        </div>
        <div className="mt-1 text-4xl font-bold">{fmt(total)}</div>
      </div>

      <div className="space-y-2">
        {DENOMINACIONES.map((d) => {
          const n = current.denominaciones[String(d)] || 0;
          return (
            <div
              key={d}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3 shadow-soft"
            >
              <div className="flex h-12 w-16 items-center justify-center rounded-xl gradient-emerald text-sm font-bold text-secondary-foreground">
                ${d}
              </div>
              <div className="flex-1">
                <NumberInput
                  value={n}
                  onChange={(v) => setDenominacion(String(d), v)}
                  className="h-11 rounded-xl"
                  placeholder="0"
                />
              </div>
              <div className="w-20 text-right font-mono text-sm font-semibold tabular-nums">
                {fmt(d * n)}
              </div>
            </div>
          );
        })}
      </div>
    </StepShell>
  );
}

/* ================== Step 8: Diferencia ================== */
function Step8() {
  const { currents, activePunto } = useCuadreStore();
  const current = currents[activePunto];
  if (!current) return null;
  const c = calcCuadre(current);
  const falta = c.diferencia < 0;
  const sobra = c.diferencia > 0;

  return (
    <StepShell>
      <div className="grid grid-cols-2 gap-3">
        <SummaryTile label="A depositar" value={fmt(c.efectivoADepositar)} accent="primary" />
        <SummaryTile label="En caja" value={fmt(c.efectivoEnCaja)} accent="emerald" />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">En caja</span>
          <span className="font-mono tabular-nums">{fmt(c.efectivoEnCaja)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-muted-foreground">A depositar</span>
          <span className="font-mono tabular-nums">− {fmt(c.efectivoADepositar)}</span>
        </div>
        <div className="my-2 border-t border-border" />
        <div className="flex justify-between font-semibold">
          <span>Diferencia</span>
          <span
            className={cn(
              "font-mono tabular-nums",
              falta && "text-destructive",
              sobra && "text-secondary"
            )}
          >
            {fmt(c.diferencia)}
          </span>
        </div>
      </div>

      <div
        className={cn(
          "rounded-2xl p-5 shadow-elegant",
          falta && "bg-destructive text-destructive-foreground",
          sobra && "gradient-emerald text-secondary-foreground",
          !falta && !sobra && "bg-card border border-border"
        )}
      >
        <div className="flex items-center gap-3">
          {falta ? (
            <AlertTriangle className="h-7 w-7" />
          ) : sobra ? (
            <CheckCircle2 className="h-7 w-7" />
          ) : (
            <CheckCircle2 className="h-7 w-7 text-muted-foreground" />
          )}
          <div className="flex-1">
            <div className="text-xs font-semibold uppercase tracking-widest opacity-80">
              {falta ? "Falta dinero" : sobra ? "Sobrante (propina)" : "Caja cuadrada"}
            </div>
            <div className="text-3xl font-bold">{fmt(Math.abs(c.diferencia))}</div>
          </div>
        </div>
      </div>
    </StepShell>
  );
}

/* ================== Step 9: Salario ================== */
function Step9() {
  const { currents, activePunto, updateCurrent, setSalarioDen } = useCuadreStore();
  const current = currents[activePunto];
  if (!current) return null;
  const c = calcCuadre(current);
  const sugerencia = useMemo(
    () => sugerirPagoSalario(c.salarioReal, current.denominaciones),
    [c.salarioReal, current.denominaciones]
  );

  useEffect(() => {
    const totalSet = Object.values(current.salarioDenominaciones).reduce(
      (s, n) => s + n,
      0
    );
    if (totalSet === 0 && c.salarioReal > 0) {
      Object.entries(sugerencia).forEach(([b, n]) => setSalarioDen(b, n));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalPagado = Object.entries(current.salarioDenominaciones).reduce(
    (s, [b, n]) => s + Number(b) * n,
    0
  );

  // Lista compacta del pago sugerido (solo billetes con cantidad > 0)
  const sugerenciaCompacta = Object.entries(sugerencia)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => Number(b) - Number(a));

  return (
    <StepShell>
      <div className="rounded-2xl border border-border bg-card p-5 shadow-soft space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Días trabajados</Label>
            <Input
              type="number"
              value={c.diasCount}
              readOnly
              className="mt-1 h-11 rounded-xl bg-muted"
            />
          </div>
          <div>
            <Label>Salario base/día</Label>
            <NumberInput
              value={current.salarioBase}
              onChange={(v) => updateCurrent({ salarioBase: v })}
              className="mt-1 h-11 rounded-xl"
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <SummaryTile label="Bruto" value={fmt(c.salarioBruto)} accent="primary" />
        {c.descuentoFalta > 0 ? (
          <div className="rounded-2xl bg-destructive p-3 text-destructive-foreground shadow-soft">
            <div className="text-[10px] font-semibold uppercase opacity-80">Descuento</div>
            <div className="text-lg font-bold">{fmt(c.descuentoFalta)}</div>
          </div>
        ) : (
          <div className="rounded-2xl gradient-emerald p-3 text-secondary-foreground shadow-soft">
            <div className="text-[10px] font-semibold uppercase opacity-80">Propina</div>
            <div className="text-lg font-bold">{fmt(c.propina)}</div>
          </div>
        )}
        <SummaryTile label="A pagar" value={fmt(c.salarioReal)} accent="emerald" />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="font-semibold">Pago sugerido</div>
            <div className="text-xs text-muted-foreground">
              Total: {fmt(c.salarioReal)}
            </div>
          </div>
        </div>
        {sugerenciaCompacta.length === 0 ? (
          <div className="rounded-xl bg-muted/60 px-3 py-4 text-center text-xs text-muted-foreground">
            Sin sugerencia
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sugerenciaCompacta.map(([b, n]) => (
              <span
                key={b}
                className="rounded-full bg-secondary/10 px-3 py-1.5 text-sm font-semibold text-secondary"
              >
                ${b} × {n}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="mb-2 flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold">Denominación a entregar</div>
            <div className="text-[11px] text-muted-foreground">
              Acepta la sugerencia o edita manualmente
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-8 rounded-lg text-xs"
            onClick={() => {
              Object.entries(sugerencia).forEach(([b, n]) => setSalarioDen(b, n));
              toast.success("Sugerencia aplicada");
            }}
          >
            Aceptar sugerencia
          </Button>
        </div>
        <div className="mt-3 mb-2 flex items-center justify-between">
          <div className="text-xs text-muted-foreground">Pagado</div>
          <div
            className={cn(
              "font-mono font-bold tabular-nums",
              totalPagado === c.salarioReal ? "text-secondary" : "text-destructive"
            )}
          >
            {fmt(totalPagado)}
          </div>
        </div>
        <div className="space-y-2">
          {DENOMINACIONES.map((d) => (
            <div key={d} className="flex items-center gap-3">
              <div className="flex h-9 w-14 items-center justify-center rounded-lg bg-muted text-xs font-bold">
                ${d}
              </div>
              <NumberInput
                value={current.salarioDenominaciones[String(d)] || 0}
                onChange={(v) => setSalarioDen(String(d), v)}
                className="h-9 flex-1 rounded-lg"
                placeholder="0"
              />
              <div className="w-20 text-right font-mono text-xs tabular-nums">
                {fmt(d * (current.salarioDenominaciones[String(d)] || 0))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </StepShell>
  );
}

/* ================== Step 10: Resumen ================== */
function Step10({ onClose }: { onClose: () => void }) {
  const { currents, activePunto, finalizar, role } = useCuadreStore();
  const current = currents[activePunto];
  if (!current) return null;
  const isAdmin = role === "admin";
  const c = calcCuadre(current);

  const finalizarTurno = () => {
    finalizar();
    toast.success("Cuadre guardado en historial");
    onClose();
  };

  return (
    <StepShell hideNext>
      <div className="rounded-2xl gradient-primary p-5 text-primary-foreground shadow-elegant">
        <div className="text-xs font-semibold uppercase tracking-widest opacity-80">
          {current.puntoVenta} · {current.dependiente} ·{" "}
          {format(new Date(current.fecha), "dd MMM yyyy", { locale: es })}
        </div>
        <div className="mt-2 text-4xl font-bold">
          {isAdmin ? fmt(c.gananciaNeta) : fmt(c.totalVenta)}
        </div>
        <div className="mt-1 text-sm opacity-90">
          {isAdmin ? "Ganancia neta del turno" : "Venta total del turno"}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SummaryTile label="Venta total" value={fmt(c.totalVenta)} accent="emerald" />
        {isAdmin && (
          <SummaryTile label="Costo total" value={fmt(c.totalCosto)} accent="primary" />
        )}
        {isAdmin && (
          <SummaryTile label="Ganancia bruta" value={fmt(c.gananciaTotal)} accent="emerald" />
        )}
        <SummaryTile label="Total gastos" value={fmt(c.totalGastos)} accent="destructive" />
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="mb-2 text-sm font-semibold">Gastos por categoría</div>
        <div className="space-y-1.5 text-sm">
          {CATEGORIAS.map((cat) => (
            <div key={cat} className="flex justify-between">
              <span className="text-muted-foreground">{cat}</span>
              <span className="font-mono tabular-nums">
                {fmt(c.gastosPorCategoria[cat] || 0)}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-1.5 text-sm">
        <Row label="Efectivo a depositar" value={fmt(c.efectivoADepositar)} />
        <Row label="Efectivo en caja" value={fmt(c.efectivoEnCaja)} />
        <Row
          label="Diferencia"
          value={fmt(c.diferencia)}
          highlight={c.diferencia < 0 ? "destructive" : c.diferencia > 0 ? "emerald" : undefined}
          icon={c.diferencia < 0 ? TrendingDown : c.diferencia > 0 ? TrendingUp : undefined}
        />
        <Row label="Salario bruto" value={fmt(c.salarioBruto)} />
        {c.propina > 0 && <Row label="+ Propina" value={fmt(c.propina)} highlight="emerald" />}
        {c.descuentoFalta > 0 && (
          <Row
            label="− Descuento por faltante"
            value={fmt(c.descuentoFalta)}
            highlight="destructive"
          />
        )}
        <Row label="Salario real (pagado)" value={fmt(c.salarioReal)} highlight="emerald" />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {isAdmin ? (
          <Button
            variant="outline"
            className="h-12 rounded-xl"
            onClick={() => generarPDF(current)}
          >
            <FileDown className="mr-2 h-4 w-4" /> Generar PDF
          </Button>
        ) : (
          <div />
        )}
        <Button
          onClick={finalizarTurno}
          className="h-12 rounded-xl gradient-emerald text-secondary-foreground shadow-emerald"
        >
          <CheckCircle2 className="mr-2 h-4 w-4" /> Finalizar turno
        </Button>
      </div>
    </StepShell>
  );
}

function Row({
  label,
  value,
  highlight,
  icon: Icon,
}: {
  label: string;
  value: string;
  highlight?: "emerald" | "destructive";
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={cn(
          "flex items-center gap-1 font-mono font-semibold tabular-nums",
          highlight === "emerald" && "text-secondary",
          highlight === "destructive" && "text-destructive"
        )}
      >
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {value}
      </span>
    </div>
  );
}
