import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Banknote, Package, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NumberInput } from "@/components/NumberInput";
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
import { crearDeuda, fmt } from "@/lib/cobrar";

type ProdRow = { nombre: string; cantidad: number; precio: number };

/**
 * Diálogo para crear una deuda suelta (sin cuadre asociado).
 * Si no se pasa `clienteId`, se muestra un selector de cliente.
 */
export default function NuevaDeudaDialog({
  open,
  clienteId,
  clienteNombre,
  clientes,
  onClose,
  onSaved,
}: {
  open: boolean;
  clienteId?: string;
  clienteNombre?: string;
  clientes?: { id: string; nombre: string }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [cliSel, setCliSel] = useState<string>(clienteId ?? "");
  const [modo, setModo] = useState<"efectivo" | "productos">("efectivo");
  const [monto, setMonto] = useState<number>(0);
  const [productos, setProductos] = useState<ProdRow[]>([{ nombre: "", cantidad: 1, precio: 0 }]);
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setCliSel(clienteId ?? "");
  }, [open, clienteId]);

  const totalProductos = productos.reduce(
    (s, p) => s + Number(p.cantidad || 0) * Number(p.precio || 0),
    0
  );
  const total = modo === "efectivo" ? Number(monto || 0) : totalProductos;

  const nombreCliente =
    clienteNombre ?? clientes?.find((c) => c.id === cliSel)?.nombre ?? "Cliente";

  const reset = () => {
    setModo("efectivo");
    setMonto(0);
    setProductos([{ nombre: "", cantidad: 1, precio: 0 }]);
    setNota("");
    setFecha(new Date().toISOString().slice(0, 10));
  };

  const submit = async () => {
    if (!cliSel) return toast.error("Selecciona un cliente");
    let items: ProdRow[] = [];
    let totalCalc = 0;
    if (modo === "efectivo") {
      const m = Number(monto) || 0;
      if (m <= 0) return toast.error("El monto debe ser mayor que 0");
      items = [{ nombre: nota.trim() || "Deuda en efectivo", cantidad: 1, precio: m }];
      totalCalc = m;
    } else {
      items = productos
        .map((p) => ({
          nombre: p.nombre.trim(),
          cantidad: Number(p.cantidad) || 0,
          precio: Number(p.precio) || 0,
        }))
        .filter((p) => p.nombre && p.cantidad > 0 && p.precio >= 0);
      if (items.length === 0) return toast.error("Agrega al menos un producto");
      totalCalc = items.reduce((s, p) => s + p.cantidad * p.precio, 0);
      if (totalCalc <= 0) return toast.error("El total debe ser mayor que 0");
    }
    setBusy(true);
    try {
      await crearDeuda({
        cliente_id: cliSel,
        cuadre_id: null,
        cuadre_label:
          nota.trim() ||
          (modo === "efectivo"
            ? `Deuda en efectivo · ${nombreCliente}`
            : `Deuda manual · ${nombreCliente}`),
        productos: items,
        total: totalCalc,
        fecha: new Date(fecha).toISOString(),
      });
      toast.success("Deuda registrada");
      onSaved();
      reset();
      onClose();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Nueva deuda{clienteNombre ? ` · ${clienteNombre}` : ""}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {!clienteId && (
            <div className="space-y-1">
              <Label className="text-xs">Cliente</Label>
              <Select value={cliSel} onValueChange={setCliSel}>
                <SelectTrigger className="h-10 rounded-xl">
                  <SelectValue placeholder="Selecciona un cliente" />
                </SelectTrigger>
                <SelectContent>
                  {(clientes ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setModo("efectivo")}
              className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-xs transition-colors ${
                modo === "efectivo"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              <Banknote className="h-5 w-5" />
              <span className="font-semibold">En efectivo</span>
              <span className="text-[10px]">Solo un monto</span>
            </button>
            <button
              type="button"
              onClick={() => setModo("productos")}
              className={`flex flex-col items-center gap-1 rounded-xl border p-3 text-xs transition-colors ${
                modo === "productos"
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-card text-muted-foreground"
              }`}
            >
              <Package className="h-5 w-5" />
              <span className="font-semibold">Con productos</span>
              <span className="text-[10px]">Detalle por línea</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Fecha</Label>
              <Input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="h-10 rounded-xl"
              />
            </div>
            {modo === "efectivo" && (
              <div className="space-y-1">
                <Label className="text-xs">Monto</Label>
                <NumberInput value={monto} onChange={setMonto} className="h-10 rounded-xl" />
              </div>
            )}
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Concepto / nota</Label>
            <Input
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              placeholder="Ej. Préstamo, consumo del sábado…"
              className="h-10 rounded-xl"
            />
          </div>

          {modo === "productos" && (
            <div className="space-y-2">
              {productos.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-1.5">
                  <Input
                    value={p.nombre}
                    onChange={(e) =>
                      setProductos((rs) =>
                        rs.map((r, j) => (j === i ? { ...r, nombre: e.target.value } : r))
                      )
                    }
                    placeholder="Producto"
                    className="h-9 rounded-lg text-xs"
                  />
                  <NumberInput
                    value={p.cantidad}
                    onChange={(v) =>
                      setProductos((rs) => rs.map((r, j) => (j === i ? { ...r, cantidad: v } : r)))
                    }
                    className="h-9 w-16 rounded-lg text-xs"
                  />
                  <NumberInput
                    value={p.precio}
                    onChange={(v) =>
                      setProductos((rs) => rs.map((r, j) => (j === i ? { ...r, precio: v } : r)))
                    }
                    className="h-9 w-20 rounded-lg text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-9 w-9 text-destructive"
                    onClick={() => setProductos((rs) => rs.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-full rounded-lg"
                onClick={() =>
                  setProductos((rs) => [...rs, { nombre: "", cantidad: 1, precio: 0 }])
                }
              >
                <Plus className="mr-1 h-3.5 w-3.5" /> Añadir línea
              </Button>
            </div>
          )}

          <div className="flex items-center justify-between rounded-xl bg-muted/60 p-3 text-sm">
            <span className="text-muted-foreground">Total de la deuda</span>
            <span className="font-mono font-bold text-destructive tabular-nums">{fmt(total)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={busy} onClick={submit}>
            Guardar deuda
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
