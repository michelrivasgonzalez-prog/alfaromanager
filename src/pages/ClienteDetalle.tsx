import { useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft,
  Wallet,
  Phone,
  PhoneOff,
  Plus,
  Share2,
  Pencil,
  Trash2,
  User as UserIcon,
  Banknote,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/NumberInput";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  listClientes,
  listDeudas,
  listAbonos,
  upsertCliente,
  softDeleteCliente,
  crearDeuda,
  fmt,
} from "@/lib/cobrar";
import { EstadoBadge } from "./Cobrar";

type ProdRow = { nombre: string; cantidad: number; precio: number };

export default function ClienteDetalle() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const clientes = useQuery({ queryKey: ["clientes"], queryFn: listClientes });
  const deudas = useQuery({ queryKey: ["deudas", id], queryFn: () => listDeudas(id) });
  const abonos = useQuery({ queryKey: ["abonos", id], queryFn: () => listAbonos(id) });

  const cliente = useMemo(() => clientes.data?.find((c) => c.id === id), [clientes.data, id]);
  const [editing, setEditing] = useState(false);
  const [nuevaDeuda, setNuevaDeuda] = useState(false);

  const pend = (deudas.data ?? []).filter((d) => d.estado !== "pagada");
  const totalDeuda = pend.reduce((s, d) => s + Number(d.saldo), 0);
  const totalComprado = (deudas.data ?? []).reduce((s, d) => s + Number(d.total), 0);
  const totalPagado = (abonos.data ?? []).reduce((s, a) => s + Number(a.monto), 0);

  if (!cliente) return <div className="p-4 text-sm text-muted-foreground">Cliente no encontrado</div>;

  const mensajeWhatsApp = () => {
    const lines: string[] = [];
    lines.push(`Hola, ${cliente.nombre}.`);
    lines.push("");
    lines.push("Resumen de cuenta en AlFaroCafé:");
    for (const d of pend) {
      lines.push("");
      lines.push(d.cuadre_label ?? format(new Date(d.fecha), "dd MMM yyyy", { locale: es }));
      if (d.productos && d.productos.length) {
        for (const p of d.productos) {
          const total = Number(p.precio) * Number(p.cantidad);
          lines.push(`${p.nombre} ${p.cantidad} × ${p.precio} = ${Math.round(total * 100) / 100}`);
        }
      }
      lines.push(`Saldo: ${fmt(d.saldo)}`);
    }
    lines.push("");
    lines.push(`TOTAL A PAGAR: ${fmt(totalDeuda)}`);
    lines.push("");
    lines.push("Saludos de AlFaroCafé.");
    return lines.join("\n");
  };

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => nav(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-foreground shrink-0">
          <UserIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-bold text-primary">{cliente.nombre}</h1>
          {cliente.telefono ? (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" /> {cliente.telefono}
            </div>
          ) : (
            <div className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
              <PhoneOff className="h-3 w-3" /> Sin teléfono registrado
            </div>
          )}
        </div>
        <Button variant="ghost" size="icon" onClick={() => setEditing(true)} title="Editar cliente">
          <Pencil className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Kpi label="Saldo" value={fmt(totalDeuda)} tone="danger" />
        <Kpi label="Comprado" value={fmt(totalComprado)} />
        <Kpi label="Pagado" value={fmt(totalPagado)} tone="ok" />
      </div>

      {cliente.observaciones && (
        <div className="rounded-2xl border border-border bg-card p-3 text-xs text-muted-foreground shadow-soft">
          {cliente.observaciones}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button
          className="h-11 rounded-xl gradient-primary text-primary-foreground"
          onClick={() => nav(`/cobrar/clientes/${id}/abonar`)}
          disabled={pend.length === 0}
        >
          <Wallet className="mr-2 h-4 w-4" /> Registrar abono
        </Button>
        <Button variant="outline" className="h-11 rounded-xl" onClick={() => setNuevaDeuda(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nueva deuda
        </Button>
        {cliente.telefono && totalDeuda > 0 && (
          <Button
            variant="outline"
            className="col-span-2 h-11 rounded-xl"
            onClick={() => {
              window.open(
                `https://wa.me/${cliente.telefono!.replace(/[^\d]/g, "")}?text=${encodeURIComponent(mensajeWhatsApp())}`,
                "_blank"
              );
            }}
          >
            <Share2 className="mr-2 h-4 w-4" /> Enviar resumen por WhatsApp
          </Button>
        )}
      </div>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Deudas</h2>
        {(deudas.data ?? []).length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-xs text-muted-foreground">
            Sin deudas registradas
          </div>
        )}
        {(deudas.data ?? []).map((d) => (
          <div key={d.id} className="rounded-2xl border border-border bg-card p-3 shadow-soft">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-semibold">
                  {d.cuadre_label ?? format(new Date(d.fecha), "dd MMM yyyy", { locale: es })}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {format(new Date(d.fecha), "dd MMM yyyy", { locale: es })}
                </div>
              </div>
              <EstadoBadge estado={d.estado} />
            </div>
            {d.productos && d.productos.length > 0 && (
              <div className="mt-2 rounded-xl bg-muted/60 p-2 text-[11px]">
                {d.productos.map((p, i) => (
                  <div key={i} className="flex justify-between">
                    <span>{p.nombre} × {p.cantidad}</span>
                    <span className="tabular-nums">{fmt(p.precio * p.cantidad)}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="mt-2 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Total {fmt(d.total)}</span>
              <span className="font-mono font-bold text-destructive tabular-nums">Saldo {fmt(d.saldo)}</span>
            </div>
            {d.cuadre_id && (
              <Link
                to="/historial"
                className="mt-2 inline-block text-[11px] text-primary underline-offset-2 hover:underline"
              >
                Ver cuadre asociado →
              </Link>
            )}
          </div>
        ))}
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Historial de abonos</h2>
        {(abonos.data ?? []).length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-xs text-muted-foreground">
            Sin abonos aún
          </div>
        )}
        {(abonos.data ?? []).map((a) => (
          <div key={a.id} className="rounded-xl border border-border bg-card p-3 shadow-soft">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(a.fecha), "dd MMM yyyy · HH:mm", { locale: es })}
                  {a.usuario_nombre ? ` · ${a.usuario_nombre}` : ""}
                </div>
                {a.nota && <div className="text-[11px] italic text-muted-foreground">{a.nota}</div>}
                {a.reversa_de && (
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                    REVERSIÓN
                  </span>
                )}
              </div>
              <div className={`font-mono font-bold tabular-nums ${a.monto < 0 ? "text-destructive" : "text-secondary"}`}>
                {a.monto < 0 ? "" : "+"}{fmt(a.monto)}
              </div>
            </div>
          </div>
        ))}
      </section>

      <EditarClienteDialog
        open={editing}
        cli={cliente}
        onClose={() => setEditing(false)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["clientes"] })}
        onEliminar={async () => {
          if (pend.length > 0) return toast.error("El cliente tiene deudas activas");
          if (!confirm(`¿Eliminar cliente "${cliente.nombre}"?`)) return;
          await softDeleteCliente(cliente.id);
          toast.success("Cliente eliminado");
          qc.invalidateQueries({ queryKey: ["clientes"] });
          nav("/cobrar");
        }}
      />
      <NuevaDeudaDialog
        open={nuevaDeuda}
        clienteId={cliente.id}
        clienteNombre={cliente.nombre}
        onClose={() => setNuevaDeuda(false)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["deudas", cliente.id] });
          qc.invalidateQueries({ queryKey: ["deudas-all"] });
        }}
      />
    </div>
  );
}

function Kpi({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "ok" | "danger" }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-soft">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div
        className={`mt-1 font-mono text-lg font-bold tabular-nums ${
          tone === "danger" ? "text-destructive" : tone === "ok" ? "text-secondary" : "text-primary"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function EditarClienteDialog({
  open,
  cli,
  onClose,
  onSaved,
  onEliminar,
}: {
  open: boolean;
  cli: { id: string; nombre: string; telefono: string | null; observaciones: string | null };
  onClose: () => void;
  onSaved: () => void;
  onEliminar: () => void;
}) {
  const [nombre, setNombre] = useState(cli.nombre);
  const [telefono, setTelefono] = useState(cli.telefono ?? "");
  const [obs, setObs] = useState(cli.observaciones ?? "");
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar cliente</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div>
            <Label>Teléfono</Label>
            <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="+53..." />
          </div>
          <div>
            <Label>Observaciones</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} className="min-h-[60px] rounded-xl" />
          </div>
        </div>
        <DialogFooter className="justify-between gap-2 sm:justify-between">
          <Button variant="ghost" className="text-destructive" onClick={onEliminar}>
            <Trash2 className="mr-1 h-4 w-4" /> Eliminar
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancelar</Button>
            <Button
              onClick={async () => {
                if (!nombre.trim()) return toast.error("Nombre requerido");
                try {
                  await upsertCliente({
                    id: cli.id,
                    nombre: nombre.trim(),
                    telefono: telefono.trim() || null,
                    observaciones: obs.trim() || null,
                  });
                  toast.success("Guardado");
                  onSaved();
                  onClose();
                } catch (e: any) {
                  toast.error(e.message);
                }
              }}
            >
              Guardar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NuevaDeudaDialog({
  open,
  clienteId,
  clienteNombre,
  onClose,
  onSaved,
}: {
  open: boolean;
  clienteId: string;
  clienteNombre: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [productos, setProductos] = useState<ProdRow[]>([{ nombre: "", cantidad: 1, precio: 0 }]);
  const [fecha, setFecha] = useState(() => new Date().toISOString().slice(0, 10));
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);

  const total = productos.reduce((s, p) => s + Number(p.cantidad || 0) * Number(p.precio || 0), 0);

  const reset = () => {
    setProductos([{ nombre: "", cantidad: 1, precio: 0 }]);
    setNota("");
    setFecha(new Date().toISOString().slice(0, 10));
  };

  const submit = async () => {
    const items = productos
      .map((p) => ({ nombre: p.nombre.trim(), cantidad: Number(p.cantidad) || 0, precio: Number(p.precio) || 0 }))
      .filter((p) => p.nombre && p.cantidad > 0 && p.precio >= 0);
    if (items.length === 0) return toast.error("Agrega al menos un producto con nombre y cantidad");
    const totalCalc = items.reduce((s, p) => s + p.cantidad * p.precio, 0);
    if (totalCalc <= 0) return toast.error("El total debe ser mayor que 0");
    setBusy(true);
    try {
      await crearDeuda({
        cliente_id: clienteId,
        cuadre_id: null,
        cuadre_label: nota.trim() || `Deuda manual · ${clienteNombre}`,
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
    <Dialog open={open} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva deuda manual · {clienteNombre}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Fecha</Label>
              <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} className="mt-1 h-10 rounded-xl" />
            </div>
            <div>
              <Label className="text-xs">Etiqueta / nota</Label>
              <Input
                value={nota}
                onChange={(e) => setNota(e.target.value)}
                placeholder="Opcional"
                className="mt-1 h-10 rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Productos</Label>
            {productos.map((p, i) => (
              <div key={i} className="grid grid-cols-12 gap-1 rounded-xl border border-border bg-muted/40 p-2">
                <Input
                  className="col-span-6 h-9 rounded-lg"
                  placeholder="Producto"
                  value={p.nombre}
                  onChange={(e) => {
                    const next = [...productos];
                    next[i] = { ...next[i], nombre: e.target.value };
                    setProductos(next);
                  }}
                />
                <NumberInput
                  className="col-span-2 h-9 rounded-lg text-right"
                  value={p.cantidad}
                  onChange={(v) => {
                    const next = [...productos];
                    next[i] = { ...next[i], cantidad: v };
                    setProductos(next);
                  }}
                />
                <NumberInput
                  className="col-span-3 h-9 rounded-lg text-right"
                  value={p.precio}
                  onChange={(v) => {
                    const next = [...productos];
                    next[i] = { ...next[i], precio: v };
                    setProductos(next);
                  }}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="col-span-1 h-9 w-9 text-destructive"
                  onClick={() => setProductos(productos.filter((_, j) => j !== i))}
                  disabled={productos.length <= 1}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <Button
              variant="outline"
              className="h-9 w-full rounded-xl"
              onClick={() => setProductos([...productos, { nombre: "", cantidad: 1, precio: 0 }])}
            >
              <Plus className="mr-1 h-3.5 w-3.5" /> Agregar producto
            </Button>
          </div>

          <div className="rounded-xl bg-primary/5 p-3 text-right">
            <span className="text-xs text-muted-foreground">Total: </span>
            <span className="font-mono text-lg font-bold text-primary">{fmt(total)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={busy}>Guardar deuda</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
