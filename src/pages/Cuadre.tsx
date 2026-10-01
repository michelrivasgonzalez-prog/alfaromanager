import { useEffect, useMemo, useRef, useState } from "react";
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
  Lock,
  LockOpen,
  Search,
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
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import StepShell from "@/components/cuadre/StepShell";
import { NumberInput } from "@/components/NumberInput";
import {
  DENOMINACIONES,
  Gasto,
  GastoCategoria,
  catLabel,
  PUNTOS,
  PuntoVenta,
  SALARIO_MODOS,
  SalarioModo,
  calcCuadre,
  calcProducto,
  sugerirPagoSalario,
  totalDivisas,

  useCuadreStore,
} from "@/store/cuadreStore";
import { generarPDF } from "@/lib/pdf";
import { formatGastoDetalle } from "@/lib/dias";
import {
  listClientes,
  upsertCliente,
  crearDeuda,
  listDeudas,
  registrarAbono,
  type Cliente,
  type Deuda,
} from "@/lib/cobrar";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { pushAllCatalogo, pushCuadre } from "@/lib/sync";
import { fmtDinero, fmtCant } from "@/lib/format";


const fmt = (n: number) => fmtDinero(n);
const n2 = (n: number) => fmtCant(n);


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
  } = useCuadreStore();
  const dependientesList = [...dependientes].sort((a, b) => a.localeCompare(b));
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
          <Select
            value={current.dependiente}
            onValueChange={(v) => updateCurrent({ dependiente: v })}
          >
            <SelectTrigger className="h-12 rounded-xl">
              <SelectValue placeholder="Selecciona un dependiente" />
            </SelectTrigger>
            <SelectContent>
              {dependientesList.length === 0 && (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  Agrega dependientes en la sección Usuarios
                </div>
              )}
              {dependientesList.map((d) => (
                <SelectItem key={d} value={d}>
                  {d}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
                    diasTrabajados: (d ?? [])
                      .slice()
                      .sort((a, b) => a.getTime() - b.getTime())
                      .map((x) => x.toISOString()),
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
  const {
    currents,
    activePunto,
    updateProducto,
    removeProducto,
    history,
    importarFinales,
    desbloquearProducto,
  } = useCuadreStore();

  const current = currents[activePunto];
  const [unlockId, setUnlockId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string | null>(null);
  const [unlockNote, setUnlockNote] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  if (!current) return null;

  const previos = history.filter((h) => h.puntoVenta === activePunto);
  const isInicio = field === "inicio";
  const productoUnlock = current.productos.find((p) => p.id === unlockId);

  const q = busqueda.trim().toLowerCase();
  // En el inventario final no tiene sentido mostrar productos sin existencia
  // (inicio + entradas − traslados = 0).
  const base = isInicio
    ? current.productos
    : current.productos.filter((p) => calcProducto(p).total !== 0);
  const visibles = q
    ? base.filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          (p.categoria ?? "").toLowerCase().includes(q)
      )
    : base;

  const focusNext = (currentId: string) => {
    const ids = visibles
      .filter((p) => !(isInicio && p.bloqueado))
      .map((p) => p.id);
    const idx = ids.indexOf(currentId);
    const nextId = ids[idx + 1];
    if (nextId) {
      const next = inputRefs.current[nextId];
      next?.focus();
      next?.select?.();
    }
  };

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
              {previos.map((h) => {
                const dia = h.diasTrabajados?.[h.diasTrabajados.length - 1] ?? h.fecha;
                return (
                  <SelectItem key={h.id} value={h.id}>
                    {h.dependiente || "Sin nombre"}, {format(new Date(dia), "dd 'de' MMMM 'de' yyyy", { locale: es })}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            Copia los finales del turno elegido como inicios de este cuadre.
          </p>
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar producto…"
          className="h-11 rounded-xl pl-9"
        />
      </div>
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-soft">
        <table className="w-full text-sm">
          <thead className="bg-muted/60">
            <tr className="text-left">
              <th className="px-3 py-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Producto
              </th>
              <th className="px-3 py-1 text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Cantidad
              </th>
              <th className="px-2 py-1 w-20"></th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                  Sin resultados
                </td>
              </tr>
            )}
            {visibles.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-3 py-1.5 font-medium min-w-[11rem] leading-tight">
                  <div className="flex items-center gap-2">
                    {isInicio && p.bloqueado && (
                      <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                    {editingName === p.id && !(isInicio && p.bloqueado) ? (
                      <Input
                        autoFocus
                        defaultValue={p.nombre}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v) updateProducto(p.id, { nombre: v });
                          setEditingName(null);
                        }}
                        className="h-8 rounded-lg"
                      />
                    ) : (
                      <span
                        className={cn(
                          !(isInicio && p.bloqueado) &&
                            "cursor-pointer underline-offset-2 hover:underline"
                        )}
                        onClick={() => {
                          if (!(isInicio && p.bloqueado)) setEditingName(p.id);
                        }}
                      >
                        {p.nombre}
                      </span>
                    )}
                  </div>
                  {isInicio && p.notaDesbloqueo && (
                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                      Nota: {p.notaDesbloqueo}
                    </div>
                  )}
                </td>
                <td className="px-3 py-1 text-right">
                  {isInicio && p.bloqueado ? (
                    <span className="font-mono tabular-nums text-muted-foreground">{p[field]}</span>
                  ) : (
                    <NumberInput
                      value={p[field]}
                      onChange={(v) => updateProducto(p.id, { [field]: v } as any)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          focusNext(p.id);
                        }
                      }}
                      ref={(el) => {
                        inputRefs.current[p.id] = el;
                      }}
                      className="ml-auto h-9 w-24 rounded-lg text-right"
                    />
                  )}
                </td>
                <td className="px-2 py-1 text-right">
                  <div className="flex items-center justify-end gap-0.5">
                    {isInicio && p.bloqueado ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        title="Desbloquear (requiere nota)"
                        onClick={() => {
                          setUnlockId(p.id);
                          setUnlockNote("");
                        }}
                      >
                        <Lock className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        title="Cambiar nombre"
                        onClick={() => setEditingName(p.id)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-lg text-destructive"
                      title="Eliminar producto de este cuadre"
                      onClick={() => {
                        if (!confirm(`¿Eliminar "${p.nombre}" de este cuadre?`)) return;
                        removeProducto(p.id);
                        toast.success("Producto eliminado");
                      }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}

          </tbody>
        </table>
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Pulsa el botón "Siguiente" del teclado para avanzar de producto en producto.
      </p>

      <Dialog
        open={!!unlockId}
        onOpenChange={(o) => {
          if (!o) {
            setUnlockId(null);
            setUnlockNote("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <LockOpen className="h-4 w-4" /> Desbloquear inicio
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Producto: <strong>{productoUnlock?.nombre}</strong>
            </p>
            <Label className="text-xs">Nota (obligatoria)</Label>
            <Textarea
              value={unlockNote}
              onChange={(e) => setUnlockNote(e.target.value)}
              placeholder="Motivo del cambio (ej. error de conteo del turno anterior)"
              className="min-h-[80px] rounded-xl"
            />
            <p className="text-[11px] text-muted-foreground">
              La nota se anexará en el resumen y en el PDF del IPV.
            </p>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setUnlockId(null);
                setUnlockNote("");
              }}
            >
              Cancelar
            </Button>
            <Button
              disabled={!unlockNote.trim()}
              onClick={() => {
                if (!unlockId) return;
                desbloquearProducto(unlockId, unlockNote.trim());
                toast.success("Producto desbloqueado");
                setUnlockId(null);
                setUnlockNote("");
              }}
            >
              Desbloquear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StepShell>
  );
}

/* ================== Step 3: entradas y traslados ================== */
function Step4() {
  const {
    currents,
    activePunto,
    updateProducto,
    addProducto,
    removeProducto,
    role,
    settings,
  } = useCuadreStore();
  const current = currents[activePunto];
  const [productoId, setProductoId] = useState("");
  const [tipo, setTipo] = useState<"entrada" | "traslado">("entrada");
  const [cantidad, setCantidad] = useState(0);
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [nuevo, setNuevo] = useState({
    nombre: "",
    precio: 0,
    costo: 0,
    categoria: "",
    cantidad: 0,
  });
  const [editingName, setEditingName] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  if (!current) return null;

  const categorias = settings.categorias ?? [];
  const q = busqueda.trim().toLowerCase();
  const visibles = q
    ? current.productos.filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          (p.categoria ?? "").toLowerCase().includes(q)
      )
    : current.productos;

  const aplicar = () => {
    if (!productoId || !cantidad) return;
    const p = current.productos.find((x) => x.id === productoId);
    if (!p) return;
    if (tipo === "entrada") updateProducto(p.id, { entradas: p.entradas + cantidad });
    else updateProducto(p.id, { traslados: p.traslados + cantidad });
    setCantidad(0);
    toast.success(`${tipo === "entrada" ? "Entrada" : "Traslado"} registrado`);
  };

  const crearProducto = () => {
    const nombre = nuevo.nombre.trim();
    if (!nombre) {
      toast.error("Escribe el nombre del producto");
      return;
    }
    addProducto({
      nombre,
      inicio: 0,
      entradas: nuevo.cantidad,
      traslados: 0,
      final: 0,
      precio: nuevo.precio,
      costo: nuevo.costo,
      categoria: nuevo.categoria || undefined,
    });
    setNuevo({ nombre: "", precio: 0, costo: 0, categoria: "", cantidad: 0 });
    setNuevoOpen(false);
    toast.success("Producto agregado a este cuadre");
  };

  return (
    <StepShell>
      {role === "admin" && (
        <Button
          variant="outline"
          className="h-11 w-full rounded-xl"
          onClick={() => setNuevoOpen(true)}
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

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar producto…"
          className="h-11 rounded-xl pl-9"
        />
      </div>
      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
        <table className="w-full min-w-[620px] text-xs">
          <thead className="bg-muted/60">
            <tr>
              <th className="px-3 py-1 text-left font-semibold">Producto</th>
              <th className="px-2 py-1 text-right font-semibold">Entr.</th>
              <th className="px-2 py-1 text-right font-semibold">Trasl.</th>
              <th className="px-2 py-1 text-right font-semibold">Precio</th>
              <th className="px-2 py-1 text-right font-semibold">Costo</th>
              <th className="px-2 py-1 w-16"></th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                  Sin resultados
                </td>
              </tr>
            )}
            {visibles.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="px-3 py-1 min-w-[11rem] leading-tight">
                  {editingName === p.id ? (
                    <Input
                      autoFocus
                      defaultValue={p.nombre}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v) updateProducto(p.id, { nombre: v });
                        setEditingName(null);
                      }}
                      className="h-8 rounded-lg text-xs"
                    />
                  ) : (
                    <span
                      className="cursor-pointer underline-offset-2 hover:underline"
                      onClick={() => setEditingName(p.id)}
                    >
                      {p.nombre}
                    </span>
                  )}
                  {p.categoria && (
                    <div className="text-[10px] text-muted-foreground">{p.categoria}</div>
                  )}
                </td>
                <td className="px-2 py-1 text-right">
                  <NumberInput
                    value={p.entradas}
                    onChange={(v) => updateProducto(p.id, { entradas: v })}
                    className="ml-auto h-8 w-16 rounded-lg text-right text-xs"
                  />
                </td>
                <td className="px-2 py-1 text-right">
                  <NumberInput
                    value={p.traslados}
                    onChange={(v) => updateProducto(p.id, { traslados: v })}
                    className="ml-auto h-8 w-16 rounded-lg text-right text-xs"
                  />
                </td>
                <td className="px-2 py-1 text-right">
                  <NumberInput
                    value={p.precio}
                    onChange={(v) => updateProducto(p.id, { precio: v })}
                    className="ml-auto h-8 w-20 rounded-lg text-right text-xs"
                  />
                </td>
                <td className="px-2 py-1 text-right">
                  <NumberInput
                    value={p.costo}
                    onChange={(v) => updateProducto(p.id, { costo: v })}
                    className="ml-auto h-8 w-20 rounded-lg text-right text-xs"
                  />
                </td>
                <td className="px-2 py-1 text-right">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg text-destructive"
                    title="Eliminar producto de este cuadre"
                    onClick={() => {
                      if (!confirm(`¿Eliminar "${p.nombre}" de este cuadre?`)) return;
                      removeProducto(p.id);
                      toast.success("Producto eliminado");
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={nuevoOpen} onOpenChange={setNuevoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo producto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input
                value={nuevo.nombre}
                onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
                className="h-11 rounded-xl"
                placeholder="Ej. Refresco de cola"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Precio venta</Label>
                <NumberInput
                  value={nuevo.precio}
                  onChange={(v) => setNuevo({ ...nuevo, precio: v })}
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Costo</Label>
                <NumberInput
                  value={nuevo.costo}
                  onChange={(v) => setNuevo({ ...nuevo, costo: v })}
                  className="h-11 rounded-xl"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Categoría</Label>
              {categorias.length > 0 ? (
                <Select
                  value={nuevo.categoria}
                  onValueChange={(v) => setNuevo({ ...nuevo, categoria: v })}
                >
                  <SelectTrigger className="h-11 rounded-xl">
                    <SelectValue placeholder="Sin categoría" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={nuevo.categoria}
                  onChange={(e) => setNuevo({ ...nuevo, categoria: e.target.value })}
                  className="h-11 rounded-xl"
                  placeholder="Gestiona categorías en Ajustes"
                />
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Entrada inicial (opcional)</Label>
              <NumberInput
                value={nuevo.cantidad}
                onChange={(v) => setNuevo({ ...nuevo, cantidad: v })}
                className="h-11 rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={crearProducto}
              className="h-11 w-full rounded-xl gradient-emerald text-secondary-foreground"
            >
              Agregar producto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </StepShell>
  );

}

/* ================== Step 5: Resultados ================== */
function Step5() {
  const { currents, activePunto, updateProducto, syncProductoToCatalog, role } =
    useCuadreStore();
  const current = currents[activePunto];
  const [mixtoId, setMixtoId] = useState<string | null>(null);
  if (!current) return null;
  const isAdmin = role === "admin" || role === "duena";
  const totalImporte = current.productos.reduce(
    (s, p) => s + calcProducto(p).importe,
    0
  );
  const totalGanancia = current.productos.reduce(
    (s, p) => s + calcProducto(p).ganancia,
    0
  );

  // Validaciones de avance:
  // 1) Final no puede ser mayor que Total (inicio + entradas - traslados)
  // 2) Si hubo ventas (venta > 0), debe existir precio y costo > 0
  const errores = current.productos
    .map((p) => {
      const c = calcProducto(p);
      const errs: string[] = [];
      if (p.final > c.total) errs.push("Final mayor al Total");
      if (c.venta > 0 && (!p.precio || p.precio <= 0))
        errs.push("Falta precio de venta");
      if (c.venta > 0 && (!p.costo || p.costo <= 0))
        errs.push("Falta precio de costo");
      if (c.mixto && c.resto < 0)
        errs.push("Los precios mixtos superan las unidades vendidas");
      return errs.length ? { nombre: p.nombre, errs } : null;
    })
    .filter(Boolean) as { nombre: string; errs: string[] }[];
  const hayErrores = errores.length > 0;

  // Se ocultan los productos sin existencia (inicio, entradas y total en 0)
  // para reducir ruido visual y no ocuparlos en el PDF.
  const visibles = current.productos.filter((p) => {
    const c = calcProducto(p);
    return !(
      Number(p.inicio) === 0 &&
      Number(p.entradas) === 0 &&
      Number(c.total) === 0
    );
  });
  const ocultos = current.productos.length - visibles.length;


  return (
    <StepShell onNextDisabled={hayErrores}>
      {hayErrores && (
        <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          <div className="mb-1 flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-4 w-4" /> Corrige antes de continuar
          </div>
          <ul className="list-disc space-y-0.5 pl-5">
            {errores.map((e) => (
              <li key={e.nombre}>
                <strong>{e.nombre}:</strong> {e.errs.join(", ")}
              </li>
            ))}
          </ul>
        </div>
      )}
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
              <th className="px-2 py-1 text-left">Producto</th>
              <th className="px-2 py-1 text-right">Inicio</th>
              <th className="px-2 py-1 text-right">Entr.</th>
              <th className="px-2 py-1 text-right">Trasl.</th>
              <th className="px-2 py-1 text-right">Total</th>
              <th className="px-2 py-1 text-right">Final</th>
              <th className="px-2 py-1 text-right">Vendidos</th>
              {isAdmin && <th className="px-2 py-1 text-right">Precio</th>}
              <th className="px-2 py-1 text-right">Importe</th>
              {isAdmin && <th className="px-2 py-1 text-right">Costo</th>}
              {isAdmin && <th className="px-2 py-1 text-right">Ganancia</th>}
            </tr>
          </thead>
          <tbody>
            {visibles.map((p) => {

              const c = calcProducto(p);
              return (
                <tr key={p.id} className="border-t border-border">
                  <td className="px-2 py-1 font-medium min-w-[11rem] leading-tight">
                    {p.nombre}
                    {isAdmin && c.venta > 0 && (
                      <button
                        onClick={() => setMixtoId(p.id)}
                        className={cn(
                          "ml-1 rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
                          c.mixto ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground"
                        )}
                      >
                        {c.mixto ? `Mixto (${(p.tramos ?? []).length})` : "+ Precio mixto"}
                      </button>
                    )}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">{n2(p.inicio)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{n2(p.entradas)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{n2(p.traslados)}</td>
                  <td className="px-2 py-1 text-right tabular-nums font-semibold">
                    {n2(c.total)}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">{n2(p.final)}</td>
                  <td className="px-2 py-1 text-right tabular-nums font-semibold">
                    {n2(c.venta)}
                  </td>
                  {isAdmin && (
                    <td className="px-2 py-1 text-right tabular-nums">
                      <NumberInput
                        value={p.precio}
                        onChange={(v) => updateProducto(p.id, { precio: v })}
                        onBlur={() => syncProductoToCatalog(p.id)}
                        className="ml-auto h-7 w-16 rounded-md text-right text-xs"
                      />
                    </td>
                  )}
                  <td className="px-2 py-1 text-right tabular-nums font-semibold text-secondary">
                    {fmt(c.importe)}
                  </td>
                  {isAdmin && (
                    <td className="px-2 py-1 text-right tabular-nums">
                      <NumberInput
                        value={p.costo}
                        onChange={(v) => updateProducto(p.id, { costo: v })}
                        onBlur={() => syncProductoToCatalog(p.id)}
                        className="ml-auto h-7 w-16 rounded-md text-right text-xs"
                      />
                    </td>
                  )}
                  {isAdmin && (
                    <td className="px-2 py-1 text-right tabular-nums font-semibold text-primary">
                      {fmt(c.ganancia)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {ocultos > 0 && (
        <p className="text-center text-[10px] text-muted-foreground">
          {ocultos} producto(s) sin existencia ocultos (no aparecen en el PDF).
        </p>
      )}

      <PreciosMixtosDialog
        producto={current.productos.find((p) => p.id === mixtoId) ?? null}
        onClose={() => setMixtoId(null)}
        onSave={(tramos) => mixtoId && updateProducto(mixtoId, { tramos } as any)}
      />
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
const CATEGORIAS: GastoCategoria[] = [
  "Local",
  "Yanitza",
  "Salida de efectivo",
  "Cuentas por Cobrar",
  "Transferencia",
];

function Step6() {
  const { currents, activePunto, addGasto, updateGasto, removeGasto, settings } =
    useCuadreStore();
  const current = currents[activePunto];
  const [cat, setCat] = useState<GastoCategoria>("Local");
  const [tipo, setTipo] = useState<"Efectivo" | "Producto">("Efectivo");
  const [nombre, setNombre] = useState("");
  const [desc, setDesc] = useState("");
  const [monto, setMonto] = useState(0);
  const [cantidad, setCantidad] = useState(0);
  const [precio, setPrecio] = useState(0);
  const [productoId, setProductoId] = useState<string>("");
  const [editingGastoId, setEditingGastoId] = useState<string | null>(null);
  const [productoOpen, setProductoOpen] = useState(false);
  // Cuentas por Cobrar: cliente asignado + creación rápida
  const qc = useQueryClient();
  const clientesQ = useQuery({ queryKey: ["clientes"], queryFn: listClientes });
  const [clienteId, setClienteId] = useState<string>("");
  const [clienteOpen, setClienteOpen] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState("");
  // Estado específico para Transferencia
  const [trFecha, setTrFecha] = useState<Date | undefined>(new Date());
  const [trTransaccion, setTrTransaccion] = useState("");
  const [trImporte, setTrImporte] = useState(0);
  const [trPorcentaje, setTrPorcentaje] = useState(settings.porcentajeTransferencia);
  const trMontoRecibido = trImporte + (trImporte * trPorcentaje) / 100;
  // Si cambia la categoría a Transferencia, resetea el % al predeterminado
  useEffect(() => {
    if (cat === "Transferencia") setTrPorcentaje(settings.porcentajeTransferencia);
  }, [cat, settings.porcentajeTransferencia]);
  const isTransfer = cat === "Transferencia";
  const isCredito = cat === "Cuentas por Cobrar";
  if (!current) return null;

  const importeProducto = cantidad * precio;
  const total = current.gastos.reduce((s, g) => s + g.monto, 0);
  const productoSel = current.productos.find((p) => p.id === productoId);
  const clienteSel = clientesQ.data?.find((c) => c.id === clienteId);

  const limpiar = (opts?: { keepCliente?: boolean }) => {
    setEditingGastoId(null);
    setNombre("");
    setDesc("");
    setMonto(0);
    setCantidad(0);
    setPrecio(0);
    setProductoId("");
    if (!opts?.keepCliente) {
      setClienteId("");
      setNuevoCliente("");
    }
    setTrTransaccion("");
    setTrImporte(0);
    setTrFecha(new Date());
    setTrPorcentaje(settings.porcentajeTransferencia);
  };

  const cargarParaEditar = (g: Gasto) => {
    setEditingGastoId(g.id);
    setCat(g.categoria);
    setTipo(g.tipo);
    setNombre(g.nombre || "");
    setDesc(g.descripcion || "");
    setClienteId(g.clienteId || "");
    if (g.categoria === "Transferencia") {
      setTrFecha(g.fecha ? new Date(g.fecha) : new Date());
      setTrTransaccion(g.transaccion || "");
      setTrImporte(g.importe || g.monto || 0);
      setTrPorcentaje(g.porcentaje ?? settings.porcentajeTransferencia);
    } else if (g.tipo === "Producto") {
      setProductoId(g.productoId || "");
      setCantidad(g.cantidad || 0);
      setPrecio(g.precio || 0);
    } else {
      setMonto(g.monto || 0);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const guardar = async () => {
    const baseId = editingGastoId;
    if (isTransfer) {
      if (!trImporte) return;
      const payload: Omit<Gasto, "id"> = {
        categoria: "Transferencia",
        nombre: trTransaccion || "—",
        tipo: "Efectivo",
        descripcion: "",
        fecha: trFecha?.toISOString(),
        transaccion: trTransaccion,
        importe: trImporte,
        porcentaje: trPorcentaje,
        montoRecibido: trMontoRecibido,
        monto: trImporte,
      };
      if (baseId) updateGasto(baseId, payload);
      else addGasto(payload);
      limpiar();
      toast.success(baseId ? "Transferencia actualizada" : "Transferencia agregada");
      return;
    }
    // Cuentas por Cobrar: exigir cliente y resolver (existente o nuevo)
    let cliId: string | undefined;
    let cliNombre: string | undefined;
    if (isCredito) {
      if (clienteId) {
        cliId = clienteId;
        cliNombre = clienteSel?.nombre;
      } else if (nuevoCliente.trim()) {
        try {
          const c = await upsertCliente({ nombre: nuevoCliente.trim() });
          cliId = c.id;
          cliNombre = c.nombre;
          qc.invalidateQueries({ queryKey: ["clientes"] });
        } catch (e: any) {
          toast.error("No se pudo crear el cliente: " + e.message);
          return;
        }
      } else {
        toast.error("Selecciona o crea un cliente para la cuenta por cobrar");
        return;
      }
    }
    if (tipo === "Efectivo" && !monto) return;
    if (tipo === "Producto" && (!productoId || !cantidad || !precio)) return;
    const payload: Omit<Gasto, "id"> = {
      categoria: cat,
      nombre: cliNombre || nombre || "—",
      tipo,
      // Solo se guarda la descripción si el usuario escribió algo,
      // para no duplicar información ya visible en la fila del gasto.
      descripcion: desc.trim(),
      productoId: tipo === "Producto" ? productoId : undefined,
      productoNombre: tipo === "Producto" ? productoSel?.nombre : undefined,
      cantidad: tipo === "Producto" ? cantidad : undefined,
      precio: tipo === "Producto" ? precio : undefined,
      clienteId: cliId,
      clienteNombre: cliNombre,
      monto: tipo === "Producto" ? importeProducto : monto,
    };
    if (baseId) updateGasto(baseId, payload);
    else addGasto(payload);
    // En Cuentas por Cobrar mantenemos el cliente seleccionado para agregar
    // varios gastos seguidos sin tener que elegirlo de nuevo.
    limpiar({ keepCliente: isCredito });
    toast.success(baseId ? "Gasto actualizado" : "Gasto agregado");
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
                    {catLabel(c)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className={cn(isTransfer && "opacity-50 pointer-events-none")}>
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

        {isCredito && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-3 space-y-2">
            <div className="text-[11px] font-semibold text-primary">
              Cliente de la cuenta por cobrar
            </div>
            <Popover open={clienteOpen} onOpenChange={setClienteOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  className="h-10 w-full justify-between rounded-xl font-normal"
                >
                  <span className="flex items-center gap-2 truncate">
                    <Search className="h-4 w-4 opacity-60" />
                    {clienteSel ? (
                      <span className="truncate">{clienteSel.nombre}</span>
                    ) : (
                      <span className="text-muted-foreground">Buscar cliente…</span>
                    )}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                <Command>
                  <CommandInput placeholder="Escribe el nombre…" />
                  <CommandList>
                    <CommandEmpty>Sin resultados</CommandEmpty>
                    <CommandGroup>
                      <CommandItem
                        value="__nuevo cliente__"
                        onSelect={() => {
                          setClienteId("");
                          setClienteOpen(false);
                        }}
                      >
                        + Nuevo cliente…
                      </CommandItem>
                      {(clientesQ.data ?? []).map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.nombre}
                          onSelect={() => {
                            setClienteId(c.id);
                            setNuevoCliente("");
                            setClienteOpen(false);
                          }}
                        >
                          {c.nombre}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {!clienteId && (
              <Input
                placeholder="Nombre del nuevo cliente"
                value={nuevoCliente}
                onChange={(e) => setNuevoCliente(e.target.value)}
                className="h-10 rounded-xl"
              />
            )}
            <p className="text-[11px] text-muted-foreground">
              Al terminar el turno se generará una deuda por cliente sumando
              todos los gastos que le hayas asignado en este cuadre.
            </p>
          </div>
        )}


        {isTransfer ? (
          <>
            <div>
              <Label className="text-xs">Fecha</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "mt-1 h-11 w-full justify-start rounded-xl text-left font-normal",
                      !trFecha && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {trFecha
                      ? format(trFecha, "dd MMM yyyy", { locale: es })
                      : "Selecciona fecha"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={trFecha}
                    onSelect={setTrFecha}
                    className={cn("p-3 pointer-events-auto")}
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-xs">Transacción</Label>
              <Input
                placeholder="Nº de transacción / referencia"
                value={trTransaccion}
                onChange={(e) => setTrTransaccion(e.target.value)}
                className="mt-1 h-11 rounded-xl"
              />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <Label className="text-xs">Importe</Label>
                <NumberInput
                  value={trImporte}
                  onChange={setTrImporte}
                  className="mt-1 h-11 rounded-xl"
                />
              </div>
              <div>
                <Label className="text-xs">Cargo %</Label>
                <NumberInput
                  value={trPorcentaje}
                  onChange={setTrPorcentaje}
                  className="mt-1 h-11 rounded-xl"
                />
              </div>
              <div>
                <Label className="text-xs">Monto recibido</Label>
                <Input
                  value={fmt(trMontoRecibido)}
                  readOnly
                  disabled
                  className="mt-1 h-11 rounded-xl bg-muted text-right font-mono"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Monto recibido = Importe + ({trPorcentaje}% por usar este método de pago).
            </p>
          </>
        ) : (
          <>
            {!isCredito && (
              <div>
                <Label className="text-xs">Nombre (quién recibe)</Label>
                <Input
                  placeholder="Nombre"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  className="mt-1 h-11 rounded-xl"
                />
              </div>
            )}
            <div>
              <Label className="text-xs">Descripción</Label>
              <Input
                placeholder={isCredito ? "Nota (opcional, aparece entre paréntesis)" : "Descripción"}
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
              <Popover open={productoOpen} onOpenChange={setProductoOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="mt-1 h-11 w-full justify-between rounded-xl font-normal"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <Search className="h-4 w-4 opacity-60" />
                      {productoSel ? (
                        <span className="truncate">
                          {productoSel.nombre} · {fmt(productoSel.precio)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Buscar producto…</span>
                      )}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Escribe para buscar…" />
                    <CommandList>
                      <CommandEmpty>Sin resultados</CommandEmpty>
                      <CommandGroup>
                        {current.productos.map((p) => (
                          <CommandItem
                            key={p.id}
                            value={p.nombre}
                            onSelect={() => {
                              setProductoId(p.id);
                              setPrecio(p.precio);
                              setProductoOpen(false);
                            }}
                          >
                            {p.nombre} · {fmt(p.precio)}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
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
          </>
        )}

        <Button
          onClick={guardar}
          className="h-11 w-full rounded-xl bg-primary text-primary-foreground"
        >
          <Plus className="mr-2 h-4 w-4" />
          {editingGastoId ? "Guardar cambios" : "Agregar gasto"}
        </Button>
        {editingGastoId && (
          <Button
            variant="outline"
            onClick={() => limpiar()}
            className="h-10 w-full rounded-xl"
          >
            Cancelar edición
          </Button>
        )}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-soft">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-muted/60 text-[10px] uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-3 py-1 text-left">Categoría</th>
              <th className="px-3 py-1 text-left">Nombre</th>
              <th className="px-3 py-1 text-left">Detalle</th>
              <th className="px-3 py-1 text-right">Monto</th>
              <th className="w-16"></th>
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
            {[...current.gastos]
              .sort(
                (a, b) =>
                  CATEGORIAS.indexOf(a.categoria) - CATEGORIAS.indexOf(b.categoria)
              )
              .map((g) => (
              <tr key={g.id} className="border-t border-border align-top">
                <td className="px-3 py-1 text-xs whitespace-nowrap">
                  <span className="rounded-full bg-muted px-2 py-0.5 font-medium">
                    {catLabel(g.categoria)}
                  </span>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{g.tipo}</div>
                </td>
                <td className="px-3 py-1 text-xs font-medium whitespace-nowrap">{g.nombre}</td>
                <td className="px-3 py-1 text-xs whitespace-nowrap">
                  <div>{formatGastoDetalle(g)}</div>
                </td>
                <td className="px-3 py-1 text-right font-mono font-semibold tabular-nums whitespace-nowrap">
                  {fmt(g.monto)}
                </td>
                <td className="px-2 py-1 whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => cargarParaEditar(g)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => removeGasto(g.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="bg-muted/40 font-bold">
            <tr>
              <td colSpan={3} className="px-3 py-1.5">
                Total
              </td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-destructive">
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
  const { currents, activePunto, setDenominacion, addDivisa, removeDivisa } =
    useCuadreStore();
  const current = currents[activePunto];
  const [divisaOpen, setDivisaOpen] = useState(false);
  const [divisa, setDivisa] = useState({
    moneda: "USD",
    denominacion: 0,
    cantidad: 0,
    tasa: 0,
  });
  if (!current) return null;
  const r = calcCuadre(current);
  const divisas = current.divisas ?? [];
  const totalMonedas = totalDivisas(divisas);
  const totalCup = Object.entries(current.denominaciones).reduce(
    (s, [b, n]) => s + Number(b) * n,
    0
  );
  const total = totalCup + totalMonedas;
  const restante = r.efectivoADepositar - total;

  const guardarDivisa = () => {
    if (!divisa.moneda.trim() || !divisa.denominacion || !divisa.cantidad || !divisa.tasa) {
      toast.error("Completa moneda, denominación, cantidad y cambio a CUP");
      return;
    }
    addDivisa({
      moneda: divisa.moneda.trim().toUpperCase(),
      denominacion: divisa.denominacion,
      cantidad: divisa.cantidad,
      tasa: divisa.tasa,
    });
    setDivisa({ moneda: divisa.moneda, denominacion: 0, cantidad: 0, tasa: divisa.tasa });
    setDivisaOpen(false);
    toast.success("Divisa agregada");
  };

  return (
    <StepShell>
      <div className="grid grid-cols-2 gap-3">
        <SummaryTile label="A depositar" value={fmt(r.efectivoADepositar)} accent="primary" />
        <SummaryTile
          label={restante > 0 ? "Falta contar" : restante < 0 ? "Sobrante" : "Cuadrado"}
          value={fmt(Math.abs(restante))}
          accent={restante > 0 ? "destructive" : "emerald"}
        />
      </div>

      <div className="rounded-2xl gradient-primary p-5 text-primary-foreground shadow-elegant">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest opacity-80">
          <Wallet className="h-3.5 w-3.5" /> Efectivo en caja
        </div>
        <div className="mt-1 text-4xl font-bold">{fmt(total)}</div>
        {totalMonedas > 0 && (
          <div className="mt-1 text-[11px] opacity-90">
            CUP {fmt(totalCup)} · Divisas {fmt(totalMonedas)}
          </div>
        )}
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

      <div className="rounded-2xl border border-border bg-card p-3 shadow-soft space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs uppercase tracking-widest text-muted-foreground">
            Billetes en otra moneda
          </Label>
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg"
            onClick={() => setDivisaOpen(true)}
          >
            <Plus className="mr-1 h-3.5 w-3.5" /> Agregar
          </Button>
        </div>
        {divisas.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            Sin billetes en otra moneda.
          </p>
        ) : (
          <div className="space-y-1.5">
            {divisas.map((d) => (
              <div
                key={d.id}
                className="flex items-center gap-2 rounded-xl border border-border p-2 text-xs"
              >
                <div className="flex-1">
                  <div className="font-semibold">
                    {d.cantidad} × {d.denominacion} {d.moneda}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Cambio {fmt(d.tasa)} / {d.moneda}
                  </div>
                </div>
                <div className="font-mono font-semibold tabular-nums">
                  {fmt(d.denominacion * d.cantidad * d.tasa)}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-lg text-destructive"
                  onClick={() => removeDivisa(d.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex justify-between border-t border-border pt-1.5 text-xs font-bold">
              <span>Total divisas</span>
              <span className="font-mono tabular-nums">{fmt(totalMonedas)}</span>
            </div>
          </div>
        )}
      </div>

      <Dialog open={divisaOpen} onOpenChange={setDivisaOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Billetes en otra moneda</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Moneda</Label>
              <Input
                value={divisa.moneda}
                onChange={(e) => setDivisa({ ...divisa, moneda: e.target.value })}
                className="h-11 rounded-xl"
                placeholder="USD, EUR, MLC…"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Denominación</Label>
                <NumberInput
                  value={divisa.denominacion}
                  onChange={(v) => setDivisa({ ...divisa, denominacion: v })}
                  className="h-11 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Cantidad</Label>
                <NumberInput
                  value={divisa.cantidad}
                  onChange={(v) => setDivisa({ ...divisa, cantidad: v })}
                  className="h-11 rounded-xl"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Cambio a CUP (por 1 {divisa.moneda || "unidad"})</Label>
              <NumberInput
                value={divisa.tasa}
                onChange={(v) => setDivisa({ ...divisa, tasa: v })}
                className="h-11 rounded-xl"
              />
            </div>
            <div className="rounded-xl bg-muted/60 p-2 text-center text-xs">
              {divisa.cantidad} × {divisa.denominacion} × {divisa.tasa} ={" "}
              <strong>
                {fmt(divisa.cantidad * divisa.denominacion * divisa.tasa)}
              </strong>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={guardarDivisa}
              className="h-11 w-full rounded-xl gradient-emerald text-secondary-foreground"
            >
              Agregar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
  const { currents, activePunto, updateCurrent, setSalarioDen, settings } =
    useCuadreStore();
  const current = currents[activePunto];
  if (!current) return null;

  // Sincroniza el salario base con lo definido en Ajustes para este punto.
  // Solo lo aplica cuando difiere, así si el admin lo edita manualmente en
  // este paso se respeta su edición posterior.
  useEffect(() => {
    const conf = settings.salarioBase[activePunto];
    if (conf && conf !== current.salarioBase) {
      updateCurrent({ salarioBase: conf });
    }
    const modoConf = settings.salarioModo?.[activePunto];
    if (modoConf && modoConf !== current.salarioModo) {
      updateCurrent({ salarioModo: modoConf });
    }
    const pctConf = settings.porcentajeVenta?.[activePunto];
    if (pctConf != null && pctConf !== current.porcentajeVenta) {
      updateCurrent({ porcentajeVenta: pctConf });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePunto, settings.salarioBase[activePunto], settings.salarioModo?.[activePunto], settings.porcentajeVenta?.[activePunto]]);

  const c = calcCuadre(current);
  const sugerencia = useMemo(
    () => sugerirPagoSalario(c.salarioReal, current.denominaciones),
    [c.salarioReal, current.denominaciones]
  );
  const efectivoRecibido = c.efectivoEnCaja;
  const noHayEfectivo = efectivoRecibido <= 0;

  useEffect(() => {
    const totalSet = Object.values(current.salarioDenominaciones).reduce(
      (s, n) => s + n,
      0
    );
    if (noHayEfectivo && totalSet > 0) {
      DENOMINACIONES.forEach((d) => setSalarioDen(String(d), 0));
      return;
    }
    if (totalSet === 0 && c.salarioReal > 0 && !noHayEfectivo) {
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
        <div>
          <Label>Modo de salario</Label>
          <Select
            value={current.salarioModo ?? "base"}
            onValueChange={(v) => updateCurrent({ salarioModo: v as SalarioModo })}
          >
            <SelectTrigger className="mt-1 h-11 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              {SALARIO_MODOS.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {SALARIO_MODOS.find((m) => m.value === (current.salarioModo ?? "base"))?.desc}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
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
            <Label>Base/día</Label>
            <NumberInput
              value={current.salarioBase}
              onChange={(v) => updateCurrent({ salarioBase: v })}
              className="mt-1 h-11 rounded-xl"
              disabled={current.salarioModo === "porcentaje"}
            />
          </div>
          <div>
            <Label>% venta</Label>
            <NumberInput
              value={current.porcentajeVenta ?? 0}
              onChange={(v) => updateCurrent({ porcentajeVenta: v })}
              className="mt-1 h-11 rounded-xl"
              disabled={current.salarioModo === "base"}
            />
          </div>
        </div>
        <div className="rounded-xl bg-muted/40 p-2 text-[11px] text-muted-foreground grid grid-cols-2 gap-2">
          <div>Por base: <span className="font-semibold text-foreground">{fmt(c.salarioBasePeriodo)}</span></div>
          <div>Por %: <span className="font-semibold text-foreground">{fmt(c.salarioPorPorcentaje)}</span></div>
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
        {c.deudaDependiente > 0 ? (
          <div className="rounded-2xl bg-destructive p-3 text-destructive-foreground shadow-soft">
            <div className="text-[10px] font-semibold uppercase opacity-80">Deuda</div>
            <div className="text-lg font-bold">{fmt(c.deudaDependiente)}</div>
          </div>
        ) : (
          <SummaryTile label="A pagar" value={fmt(c.salarioReal)} accent="emerald" />
        )}
      </div>

      {c.deudaDependiente > 0 && (
        <DeudaDependientePanel monto={c.deudaDependiente} />
      )}

      <PagarDeudasDependientePanel disponible={c.salarioAntesDeudas} />




      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="font-semibold">Pago sugerido</div>
            <div className="text-xs text-muted-foreground">
              Desde efectivo recibido en caja: {fmt(efectivoRecibido)}
            </div>
          </div>
        </div>
        {noHayEfectivo ? (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-4 text-center text-xs font-medium text-destructive">
            No tienes efectivo en caja para pagar.
          </div>
        ) : sugerenciaCompacta.length === 0 ? (
          <div className="rounded-xl bg-muted/60 px-3 py-4 text-center text-xs text-muted-foreground">
            No alcanza el efectivo recibido para sugerir una denominación completa.
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
            disabled={noHayEfectivo}
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
              <div className="flex h-9 w-16 flex-col items-center justify-center rounded-lg bg-muted text-xs font-bold leading-tight">
                <span>${d}</span>
                <span className="text-[9px] font-medium text-muted-foreground">
                  max {current.denominaciones[String(d)] || 0}
                </span>
              </div>
              <NumberInput
                value={current.salarioDenominaciones[String(d)] || 0}
                onChange={(v) =>
                  setSalarioDen(
                    String(d),
                    Math.min(v, current.denominaciones[String(d)] || 0)
                  )
                }
                disabled={noHayEfectivo}
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
    // Snapshot ANTES de finalizar (finalizar limpia currents)
    const snap = { ...current, finalizado: true, fecha: new Date().toISOString() };
    finalizar();
    Promise.all([pushCuadre(snap), pushAllCatalogo()]).catch((e) => {
      console.error(e);
      toast.warning("Guardado local. Se sincronizará cuando haya conexión.");
    });
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
        {c.descuentoDeudas > 0 && (
          <Row
            label="− Deudas pagadas del dependiente"
            value={fmt(c.descuentoDeudas)}
            highlight="destructive"
          />
        )}
        {c.deudaDependiente > 0 ? (
          <Row label="Deuda" value={fmt(c.deudaDependiente)} highlight="destructive" />
        ) : (
          <Row label="Salario real (pagado)" value={fmt(c.salarioReal)} highlight="emerald" />
        )}
      </div>

      {current.productos.some((p) => p.notaDesbloqueo) && (
        <div className="rounded-2xl border border-amber-300/60 bg-amber-50 p-4 shadow-soft text-sm dark:bg-amber-950/30">
          <div className="mb-2 flex items-center gap-2 font-semibold">
            <LockOpen className="h-4 w-4" /> Notas de desbloqueo de inicios
          </div>
          <ul className="space-y-1.5 text-xs">
            {current.productos
              .filter((p) => p.notaDesbloqueo)
              .map((p) => (
                <li key={p.id}>
                  <strong>{p.nombre}:</strong> {p.notaDesbloqueo}
                </li>
              ))}
          </ul>
        </div>
      )}

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

/* ========== Deuda del dependiente (faltante > salario bruto) ========== */
function DeudaDependientePanel({ monto }: { monto: number }) {
  const { currents, activePunto, updateCurrent } = useCuadreStore();
  const current = currents[activePunto];
  const qc = useQueryClient();
  const [guardando, setGuardando] = useState(false);
  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes"],
    queryFn: listClientes,
  });
  if (!current) return null;

  const registrada = !!current.deudaDependienteId;
  const nombre = current.dependiente?.trim() || "Dependiente";

  const registrar = async () => {
    setGuardando(true);
    try {
      let cliente: Cliente | undefined = clientes.find(
        (c) => c.nombre.trim().toLowerCase() === nombre.toLowerCase()
      );
      if (!cliente) {
        cliente = (await upsertCliente({
          nombre,
          observaciones: "Dependiente",
        })) as Cliente;
      }
      const deuda = await crearDeuda({
        cliente_id: cliente.id,
        cuadre_id: current.id,
        cuadre_label: `Faltante · ${current.puntoVenta} · ${format(
          new Date(current.fecha),
          "dd MMM yyyy",
          { locale: es }
        )}`,
        productos: [],
        total: Math.round(monto),
      });
      updateCurrent({ deudaDependienteId: deuda.id });
      qc.invalidateQueries({ queryKey: ["clientes"] });
      qc.invalidateQueries({ queryKey: ["deudas"] });
      toast.success(`Deuda registrada a ${nombre}`);
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo registrar la deuda");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="rounded-2xl border border-destructive/40 bg-destructive/10 p-4 shadow-soft space-y-2">
      <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
        <AlertTriangle className="h-4 w-4" />
        El faltante supera el salario bruto
      </div>
      <p className="text-xs text-muted-foreground">
        No hay salario a pagar. Queda una deuda de{" "}
        <strong className="text-foreground">{fmt(monto)}</strong> a nombre de{" "}
        <strong className="text-foreground">{nombre}</strong>.
      </p>
      <Button
        onClick={registrar}
        disabled={registrada || guardando}
        className="h-11 w-full rounded-xl"
        variant={registrada ? "outline" : "destructive"}
      >
        {registrada
          ? "Deuda ya registrada en Cuentas por cobrar"
          : guardando
          ? "Registrando…"
          : "Registrar como cuenta por cobrar"}
      </Button>
    </div>
  );
}

/* ========== Pagar deudas propias del dependiente con su salario ========== */
function PagarDeudasDependientePanel({ disponible }: { disponible: number }) {
  const { currents, activePunto, updateCurrent } = useCuadreStore();
  const current = currents[activePunto];
  const qc = useQueryClient();
  const [abierto, setAbierto] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [sel, setSel] = useState<Record<string, number>>({});

  const nombre = current?.dependiente?.trim() ?? "";
  const { data: clientes = [] } = useQuery({ queryKey: ["clientes"], queryFn: listClientes });
  const cliente = clientes.find(
    (c) => c.nombre.trim().toLowerCase() === nombre.toLowerCase()
  );
  const { data: deudas = [] } = useQuery({
    queryKey: ["deudas", cliente?.id],
    queryFn: () => listDeudas(cliente!.id),
    enabled: !!cliente?.id,
  });

  if (!current) return null;

  const pendientes = (deudas as Deuda[]).filter((d) => d.saldo > 0.009);
  const yaPagado = current.descuentoDeudas ?? 0;
  const totalSel = Object.values(sel).reduce((s, n) => s + (n || 0), 0);
  const restante = Math.max(0, disponible - yaPagado - totalSel);
  const excede = totalSel > disponible - yaPagado + 0.009;

  const registrar = async () => {
    if (!cliente || totalSel <= 0) return;
    setGuardando(true);
    try {
      const aplicaciones = Object.entries(sel)
        .filter(([, m]) => m > 0)
        .map(([deuda_id, monto]) => ({ deuda_id, monto }));
      const abonoId = await registrarAbono({
        cliente_id: cliente.id,
        monto: totalSel,
        aplicaciones,
        usuario_nombre: nombre,
        nota: `Descontado del salario · ${current.puntoVenta}`,
      });
      updateCurrent({
        descuentoDeudas: yaPagado + totalSel,
        abonoDeudasId: abonoId,
      });
      setSel({});
      setAbierto(false);
      qc.invalidateQueries({ queryKey: ["deudas"] });
      qc.invalidateQueries({ queryKey: ["clientes"] });
      toast.success("Deudas descontadas del salario");
    } catch (e: any) {
      toast.error(e?.message ?? "No se pudo descontar");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-sm font-semibold">Deudas del dependiente</div>
          <div className="text-[11px] text-muted-foreground">
            {!nombre
              ? "Selecciona un dependiente en el paso 1"
              : !cliente
              ? `${nombre} no tiene ficha de cliente`
              : pendientes.length === 0
              ? `${nombre} no tiene deudas pendientes`
              : `${pendientes.length} deuda(s) pendiente(s)`}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-9 rounded-xl text-xs"
          disabled={!cliente || pendientes.length === 0 || disponible - yaPagado <= 0}
          onClick={() => setAbierto(true)}
        >
          Pagar deudas
        </Button>
      </div>

      {yaPagado > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-muted/50 px-3 py-2 text-xs">
          <span className="text-muted-foreground">Descontado del salario</span>
          <span className="font-mono font-bold tabular-nums text-destructive">
            −{fmt(yaPagado)}
          </span>
        </div>
      )}

      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Pagar deudas de {nombre}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {pendientes.map((d) => (
              <div key={d.id} className="rounded-xl border border-border p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">
                    {d.cuadre_label ??
                      format(new Date(d.fecha), "dd MMM yyyy", { locale: es })}
                  </span>
                  <span className="font-mono tabular-nums text-muted-foreground">
                    saldo {fmt(d.saldo)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <NumberInput
                    value={sel[d.id] ?? 0}
                    onChange={(v) =>
                      setSel((s) => ({ ...s, [d.id]: Math.min(v, d.saldo) }))
                    }
                    className="h-9 flex-1 rounded-lg"
                    placeholder="0"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-9 rounded-lg text-xs"
                    onClick={() =>
                      setSel((s) => ({
                        ...s,
                        [d.id]: Math.min(
                          d.saldo,
                          Math.max(0, disponible - yaPagado - (totalSel - (s[d.id] ?? 0)))
                        ),
                      }))
                    }
                  >
                    Máx
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <div className="space-y-1 rounded-xl bg-muted/50 p-3 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Salario disponible</span>
              <span className="font-mono tabular-nums">{fmt(disponible - yaPagado)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">A descontar</span>
              <span className="font-mono tabular-nums text-destructive">
                −{fmt(totalSel)}
              </span>
            </div>
            <div className="flex justify-between font-semibold">
              <span>Queda por pagar</span>
              <span className="font-mono tabular-nums text-secondary">{fmt(restante)}</span>
            </div>
          </div>
          {excede && (
            <p className="text-xs font-medium text-destructive">
              El total supera el salario disponible.
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button onClick={registrar} disabled={totalSel <= 0 || excede || guardando}>
              {guardando ? "Guardando…" : "Descontar y pagar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
