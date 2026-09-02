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
  ChevronDown,
  Printer,
  Receipt,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  listClientes,
  listDeudas,
  listAbonos,
  registrarAbono,
  revertirAbono,
  listAbonosPorDeuda,
  upsertCliente,
  softDeleteCliente,
  fmt,
  type Abono,
  type AbonoAplicacion,
  type Deuda,
} from "@/lib/cobrar";
import NuevaDeudaDialog from "@/components/NuevaDeudaDialog";
import { imprimirRecibo } from "@/lib/recibo";
import { EstadoBadge } from "./Cobrar";
import { useAuth } from "@/hooks/useAuth";
import { usePinStore, hashPin, useCurrentPinUser } from "@/store/pinStore";




export default function ClienteDetalle() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const clientes = useQuery({ queryKey: ["clientes"], queryFn: listClientes });
  const deudas = useQuery({ queryKey: ["deudas", id], queryFn: () => listDeudas(id) });
  const abonos = useQuery({ queryKey: ["abonos", id], queryFn: () => listAbonos(id) });
  const abonosPorDeuda = useQuery({
    queryKey: ["abonos-por-deuda", id],
    queryFn: () => listAbonosPorDeuda(id),
  });

  const cliente = useMemo(() => clientes.data?.find((c) => c.id === id), [clientes.data, id]);
  const [editing, setEditing] = useState(false);
  const [nuevaDeuda, setNuevaDeuda] = useState(false);
  const [deudasOpen, setDeudasOpen] = useState(true);
  const [ocultarPagadas, setOcultarPagadas] = useState(true);
  const [corrigiendo, setCorrigiendo] = useState<string | null>(null);
  const deudasVisibles = (deudas.data ?? []).filter((d) => !ocultarPagadas || d.estado !== "pagada");


  const pend = (deudas.data ?? []).filter((d) => d.estado !== "pagada");
  const totalDeuda = pend.reduce((s, d) => s + Number(d.saldo), 0);
  const totalComprado = (deudas.data ?? []).reduce((s, d) => s + Number(d.total), 0);
  const totalPagado = (abonos.data ?? []).reduce((s, a) => s + Number(a.monto), 0);

  if (!cliente) return <div className="p-4 text-sm text-muted-foreground">Cliente no encontrado</div>;

  const mensajeWhatsApp = () => {
    const primerNombre = cliente.nombre.split(" ")[0] || cliente.nombre;
    const lines: string[] = [];
    lines.push(`☕ *AlFaroCafé* · Resumen de cuenta`);
    lines.push(``);
    lines.push(`Hola *${primerNombre}*, esperamos que estés muy bien 🌿`);
    lines.push(`Este es el detalle actualizado de tu cuenta con nosotros:`);
    lines.push(``);
    pend.forEach((d, idx) => {
      const etiqueta =
        d.cuadre_label ?? format(new Date(d.fecha), "dd 'de' MMMM yyyy", { locale: es });
      lines.push(`━━━━━━━━━━━━━━━`);
      lines.push(`*${idx + 1}. ${etiqueta}*`);
      lines.push(`_${format(new Date(d.fecha), "dd MMM yyyy", { locale: es })}_`);
      if (d.productos && d.productos.length) {
        for (const p of d.productos) {
          const total = Number(p.precio) * Number(p.cantidad);
          lines.push(`  • ${p.nombre}  _${p.cantidad} × ${fmt(p.precio)}_  →  ${fmt(total)}`);
        }
      }
      lines.push(`  💵 Saldo: *${fmt(d.saldo)}*`);
    });
    lines.push(`━━━━━━━━━━━━━━━`);
    lines.push(``);
    lines.push(`🧾 *TOTAL PENDIENTE: ${fmt(totalDeuda)}*`);
    lines.push(``);
    lines.push(`Cuando puedas, pásate por el local para saldar. Cualquier duda estamos a la orden 💬`);
    lines.push(``);
    lines.push(`Gracias por tu preferencia ☕`);
    lines.push(`_AlFaroCafé — Tu cafetería de confianza_`);
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

      <Collapsible open={deudasOpen} onOpenChange={setDeudasOpen}>
        <div className="flex items-center gap-2">
          <CollapsibleTrigger asChild>
            <button className="flex flex-1 items-center justify-between rounded-xl bg-muted/50 px-3 py-2 text-sm font-semibold">
              <span>Deudas ({(deudas.data ?? []).length})</span>
              <ChevronDown
                className={`h-4 w-4 transition-transform ${deudasOpen ? "rotate-180" : ""}`}
              />
            </button>
          </CollapsibleTrigger>
          <label className="flex shrink-0 items-center gap-1.5 rounded-xl border border-border px-2 py-2 text-[11px]">
            <input
              type="checkbox"
              checked={ocultarPagadas}
              onChange={(e) => setOcultarPagadas(e.target.checked)}
              className="h-3.5 w-3.5 accent-primary"
            />
            Ocultar pagadas
          </label>
        </div>
        <CollapsibleContent className="mt-2 space-y-2">
          {deudasVisibles.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-xs text-muted-foreground">
              {(deudas.data ?? []).length === 0 ? "Sin deudas registradas" : "Sin deudas pendientes"}
            </div>
          )}
          {deudasVisibles.map((d) => (
            <DeudaCard
              key={d.id}
              deuda={d}
              clienteNombre={cliente.nombre}
              aplicaciones={abonosPorDeuda.data?.[d.id] ?? []}
            />
          ))}
        </CollapsibleContent>
      </Collapsible>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Historial de abonos</h2>
        {(abonos.data ?? []).length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center text-xs text-muted-foreground">
            Sin abonos aún
          </div>
        )}
        {(abonos.data ?? []).map((a) => {
          const apps = Object.values(abonosPorDeuda.data ?? {})
            .flat()
            .filter((ap) => ap.abono_id === a.id);
          const deudaRef = (deudas.data ?? []).find((d) => d.id === apps[0]?.deuda_id);
          const label =
            deudaRef?.cuadre_label ??
            (deudaRef ? format(new Date(deudaRef.fecha), "dd MMM yyyy", { locale: es }) : "Crédito a favor");
          return (
            <div key={a.id} className="rounded-xl border border-border bg-card p-3 shadow-soft">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-xs text-muted-foreground">
                    {format(new Date(a.fecha), "dd MMM yyyy · HH:mm", { locale: es })}
                    {a.usuario_nombre ? ` · ${a.usuario_nombre}` : ""}
                  </div>
                  <div className="text-[11px] text-muted-foreground">{label}</div>
                  {a.nota && <div className="text-[11px] italic text-muted-foreground">{a.nota}</div>}
                  {a.reversa_de && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
                      REVERSIÓN
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <div className={`font-mono font-bold tabular-nums ${a.monto < 0 ? "text-destructive" : "text-secondary"}`}>
                    {a.monto < 0 ? "" : "+"}{fmt(a.monto)}
                  </div>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-7 w-7 rounded-lg"
                    title="Ver / descargar recibo"
                    onClick={() => {
                      const ok = imprimirRecibo({
                        numero: a.id.slice(0, 6).toUpperCase(),
                        cliente: cliente.nombre,
                        fecha: a.fecha,
                        monto: Number(a.monto),
                        deudaLabel: label,
                        deudaTotal: Number(deudaRef?.total ?? a.monto),
                        saldoDeuda: Number(deudaRef?.saldo ?? 0),
                        usuario: a.usuario_nombre,
                        nota: a.nota,
                      });
                      if (!ok) toast.error("Permite las ventanas emergentes para ver el recibo");
                    }}
                  >
                    <Printer className="h-3.5 w-3.5" />
                  </Button>
                  {!a.reversa_de && Number(a.monto) > 0 && (
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7 rounded-lg border-destructive/40 text-destructive"
                      title="Corregir o eliminar abono"
                      onClick={() => setCorrigiendo(a.id)}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </section>

      <CorregirAbonoDialog
        open={!!corrigiendo}
        abono={(abonos.data ?? []).find((a) => a.id === corrigiendo) ?? null}
        clienteId={id}
        aplicaciones={Object.values(abonosPorDeuda.data ?? {})
          .flat()
          .filter((ap) => ap.abono_id === corrigiendo)}
        onClose={() => setCorrigiendo(null)}
      />


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

/** Tarjeta de deuda con lista desplegable de abonos y recibo imprimible. */
function DeudaCard({
  deuda: d,
  clienteNombre,
  aplicaciones,
}: {
  deuda: Deuda;
  clienteNombre: string;
  aplicaciones: AbonoAplicacion[];
}) {
  const [open, setOpen] = useState(false);
  const [abonando, setAbonando] = useState(false);

  const apps = [...aplicaciones].sort(
    (a, b) =>
      new Date(b.abono?.fecha ?? 0).getTime() - new Date(a.abono?.fecha ?? 0).getTime()
  );
  const pagado = apps.reduce((s, a) => s + Number(a.monto), 0);
  const label = d.cuadre_label ?? format(new Date(d.fecha), "dd MMM yyyy", { locale: es });

  // Saldo tras cada abono (de más antiguo a más nuevo)
  const saldoTras = new Map<string, number>();
  let acc = Number(d.total);
  for (const a of [...apps].reverse()) {
    acc = Math.round((acc - Number(a.monto)) * 100) / 100;
    saldoTras.set(a.id, acc);
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-soft">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-semibold">{label}</div>
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
              <span>
                {p.nombre} × {p.cantidad}
              </span>
              <span className="tabular-nums">{fmt(p.precio * p.cantidad)}</span>
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">Total {fmt(d.total)}</span>
        <span
          className={`font-mono font-bold tabular-nums ${
            Number(d.saldo) > 0 ? "text-destructive" : "text-secondary"
          }`}
        >
          Saldo {fmt(d.saldo)}
        </span>
      </div>

      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="mt-2 flex items-center gap-2">
          <CollapsibleTrigger asChild>
            <button className="flex flex-1 items-center justify-between rounded-xl bg-muted/50 px-3 py-2 text-[11px] font-semibold text-foreground">
              <span className="inline-flex items-center gap-1.5">
                <Receipt className="h-3.5 w-3.5" />
                Abonos ({apps.length}) · {fmt(pagado)} pagado
              </span>
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
              />
            </button>
          </CollapsibleTrigger>
          {Number(d.saldo) > 0 && (
            <Button
              size="icon"
              className="h-9 w-9 shrink-0 rounded-xl gradient-primary text-primary-foreground"
              title="Abonar a esta deuda"
              onClick={() => setAbonando(true)}
            >
              <Plus className="h-4 w-4" />
            </Button>
          )}
        </div>

        <CollapsibleContent className="mt-2 space-y-1.5">
          {apps.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-3 text-center text-[11px] text-muted-foreground">
              Esta deuda aún no tiene abonos.
            </div>
          )}
          {apps.map((a, i) => (
            <div
              key={a.id}
              className="flex items-center justify-between gap-2 rounded-xl border border-border p-2"
            >
              <div className="min-w-0">
                <div className="text-[11px] font-semibold">
                  {a.abono ? format(new Date(a.abono.fecha), "dd MMM yyyy · HH:mm", { locale: es }) : "—"}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {a.abono?.usuario_nombre ? `${a.abono.usuario_nombre} · ` : ""}
                  Saldo tras el pago: {fmt(saldoTras.get(a.id) ?? d.saldo)}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`font-mono text-xs font-bold tabular-nums ${
                    Number(a.monto) < 0 ? "text-destructive" : "text-secondary"
                  }`}
                >
                  {Number(a.monto) < 0 ? "" : "+"}
                  {fmt(a.monto)}
                </span>
                <Button
                  size="icon"
                  variant="outline"
                  className="h-7 w-7 rounded-lg"
                  title="Ver / descargar recibo"
                  onClick={() => {
                    const ok = imprimirRecibo({
                      numero: `${apps.length - i}-${a.id.slice(0, 6).toUpperCase()}`,
                      cliente: clienteNombre,
                      fecha: a.abono?.fecha ?? d.fecha,
                      monto: Number(a.monto),
                      deudaLabel: label,
                      deudaTotal: Number(d.total),
                      saldoDeuda: saldoTras.get(a.id) ?? Number(d.saldo),
                      usuario: a.abono?.usuario_nombre ?? null,
                      nota: a.abono?.nota ?? null,
                    });
                    if (!ok) toast.error("Permite las ventanas emergentes para ver el recibo");
                  }}
                >
                  <Printer className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>

      {d.cuadre_id && (
        <Link
          to="/historial"
          className="mt-2 inline-block text-[11px] text-primary underline-offset-2 hover:underline"
        >
          Ver cuadre asociado →
        </Link>
      )}

      <AbonoDeudaDialog
        open={abonando}
        deuda={d}
        onClose={() => setAbonando(false)}
      />
    </div>

  );
}

/** Abono directo aplicado a una deuda concreta. */
function AbonoDeudaDialog({
  open,
  deuda,
  onClose,
}: {
  open: boolean;
  deuda: Deuda;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { nombre, user } = useAuth();
  const [monto, setMonto] = useState<string>("");
  const [nota, setNota] = useState("");
  const [saving, setSaving] = useState(false);
  const saldo = Number(deuda.saldo);

  const guardar = async () => {
    const m = Number(String(monto).replace(",", "."));
    if (!m || m <= 0) return toast.error("Monto inválido");
    setSaving(true);
    try {
      await registrarAbono({
        cliente_id: deuda.cliente_id,
        monto: m,
        aplicaciones: [{ deuda_id: deuda.id, monto: Math.min(m, saldo) }],
        usuario_id: user?.id ?? null,
        usuario_nombre: nombre ?? null,
        nota: nota.trim() || null,
      });
      toast.success(
        m > saldo
          ? `Abono registrado. Crédito a favor: ${fmt(m - saldo)}`
          : "Abono registrado"
      );
      qc.invalidateQueries({ queryKey: ["deudas", deuda.cliente_id] });
      qc.invalidateQueries({ queryKey: ["abonos", deuda.cliente_id] });
      qc.invalidateQueries({ queryKey: ["abonos-por-deuda", deuda.cliente_id] });
      qc.invalidateQueries({ queryKey: ["clientes"] });
      setMonto("");
      setNota("");
      onClose();
    } catch (e: any) {
      toast.error(e.message || "No se pudo registrar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Abonar a esta deuda</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-xl bg-muted/60 p-3 text-xs">
            Saldo pendiente: <strong>{fmt(saldo)}</strong>
          </div>
          <div>
            <Label>Monto</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0"
              className="mt-1 h-11 rounded-xl"
            />
            <button
              className="mt-1 text-[11px] text-primary underline-offset-2 hover:underline"
              onClick={() => setMonto(String(saldo))}
            >
              Usar saldo completo
            </button>
          </div>
          <div>
            <Label>Nota (opcional)</Label>
            <Input value={nota} onChange={(e) => setNota(e.target.value)} className="mt-1 h-11 rounded-xl" />
          </div>
          <p className="text-[11px] text-muted-foreground">
            Si el monto supera el saldo, la diferencia queda como crédito del cliente.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving} className="gradient-primary">
            {saving ? "Guardando…" : "Registrar abono"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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


/** Corrige o elimina un abono, con confirmación exhaustiva por PIN. */
function CorregirAbonoDialog({
  open,
  abono,
  clienteId,
  aplicaciones,
  onClose,
}: {
  open: boolean;
  abono: Abono | null;
  clienteId: string;
  aplicaciones: AbonoAplicacion[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { nombre, user } = useAuth();
  const pinUser = useCurrentPinUser();
  const [modo, setModo] = useState<"corregir" | "eliminar">("corregir");
  const [nuevoMonto, setNuevoMonto] = useState("");
  const [pin, setPin] = useState("");
  const [confirmado, setConfirmado] = useState(false);
  const [saving, setSaving] = useState(false);

  const cerrar = () => {
    setPin("");
    setNuevoMonto("");
    setConfirmado(false);
    setModo("corregir");
    onClose();
  };

  const ejecutar = async () => {
    if (!abono) return;
    if (!confirmado) return toast.error("Marca la confirmación para continuar");
    if (!pinUser) return toast.error("Sesión no válida");
    const h = await hashPin(pin, pinUser.id);
    if (h !== pinUser.pinHash) return toast.error("PIN incorrecto");

    const monto = Number(String(nuevoMonto).replace(",", "."));
    if (modo === "corregir" && (!monto || monto <= 0)) {
      return toast.error("Escribe el monto correcto");
    }

    setSaving(true);
    try {
      await revertirAbono({
        abono_id: abono.id,
        usuario_id: user?.id ?? null,
        usuario_nombre: nombre ?? null,
        nota: modo === "eliminar" ? "Abono eliminado (corrección)" : "Corrección de abono",
      });

      if (modo === "corregir") {
        const totalApps = aplicaciones.reduce((s, a) => s + Number(a.monto), 0);
        const apps =
          totalApps > 0
            ? aplicaciones.map((a) => ({
                deuda_id: a.deuda_id,
                monto: Math.round(((Number(a.monto) / totalApps) * monto) * 100) / 100,
              }))
            : [];
        // ajuste de redondeo para no exceder el monto
        const suma = apps.reduce((s, a) => s + a.monto, 0);
        if (apps.length > 0 && suma > monto) apps[0].monto -= Math.round((suma - monto) * 100) / 100;
        await registrarAbono({
          cliente_id: clienteId,
          monto,
          aplicaciones: apps.filter((a) => a.monto > 0),
          usuario_id: user?.id ?? null,
          usuario_nombre: nombre ?? null,
          nota: `Corrección del abono ${abono.id.slice(0, 6).toUpperCase()}`,
        });
      }

      toast.success(modo === "eliminar" ? "Abono eliminado" : "Abono corregido");
      qc.invalidateQueries({ queryKey: ["deudas", clienteId] });
      qc.invalidateQueries({ queryKey: ["abonos", clienteId] });
      qc.invalidateQueries({ queryKey: ["abonos-por-deuda", clienteId] });
      qc.invalidateQueries({ queryKey: ["clientes"] });
      cerrar();
    } catch (e: any) {
      toast.error(e.message || "No se pudo completar la operación");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && cerrar()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Corregir o eliminar abono</DialogTitle>
        </DialogHeader>
        {abono && (
          <div className="space-y-3">
            <div className="rounded-xl bg-muted/60 p-3 text-xs">
              Abono del {format(new Date(abono.fecha), "dd MMM yyyy · HH:mm", { locale: es })} por{" "}
              <strong>{fmt(abono.monto)}</strong>. Se generará una reversión que devuelve el saldo a
              las deudas afectadas.
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={modo === "corregir" ? "default" : "outline"}
                className="h-10 rounded-xl"
                onClick={() => setModo("corregir")}
              >
                Corregir monto
              </Button>
              <Button
                variant={modo === "eliminar" ? "default" : "outline"}
                className="h-10 rounded-xl"
                onClick={() => setModo("eliminar")}
              >
                <Trash2 className="mr-1 h-4 w-4" /> Eliminar
              </Button>
            </div>
            {modo === "corregir" && (
              <div>
                <Label>Monto correcto</Label>
                <Input
                  type="number"
                  inputMode="decimal"
                  value={nuevoMonto}
                  onChange={(e) => setNuevoMonto(e.target.value)}
                  placeholder="0"
                  className="mt-1 h-11 rounded-xl"
                />
              </div>
            )}
            <div>
              <Label>PIN de usuario ({pinUser?.nombre ?? "—"})</Label>
              <Input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••"
                className="mt-1 h-11 rounded-xl"
              />
            </div>
            <label className="flex items-start gap-2 text-[11px] text-muted-foreground">
              <input
                type="checkbox"
                checked={confirmado}
                onChange={(e) => setConfirmado(e.target.checked)}
                className="mt-0.5 h-3.5 w-3.5 accent-primary"
              />
              Entiendo que esta operación modifica dinero registrado y queda auditada.
            </label>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={cerrar}>
            Cancelar
          </Button>
          <Button
            onClick={ejecutar}
            disabled={saving || !pin || !confirmado}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {saving ? "Procesando…" : modo === "eliminar" ? "Eliminar abono" : "Aplicar corrección"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
