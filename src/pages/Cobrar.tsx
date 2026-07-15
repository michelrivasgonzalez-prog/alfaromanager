import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import {
  Wallet,
  Users,
  Receipt,
  Plus,
  ChevronRight,
  Phone,
  ShieldCheck,
  User as UserIcon,
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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Cliente,
  listClientes,
  upsertCliente,
  listDeudas,
  fmt,
} from "@/lib/cobrar";

export default function Cobrar() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const clientes = useQuery({ queryKey: ["clientes"], queryFn: listClientes });
  const deudas = useQuery({ queryKey: ["deudas-all"], queryFn: () => listDeudas() });

  const pendienteTotal = (deudas.data ?? [])
    .filter((d) => d.estado !== "pagada")
    .reduce((s, d) => s + Number(d.saldo), 0);
  const clientesConDeuda = new Set(
    (deudas.data ?? []).filter((d) => d.estado !== "pagada").map((d) => d.cliente_id)
  ).size;
  const deudasPendientes = (deudas.data ?? []).filter((d) => d.estado !== "pagada").length;

  const [cliDialog, setCliDialog] = useState<Partial<Cliente> | null>(null);
  const [estadoFilter, setEstadoFilter] = useState<string>("");

  return (
    <div className="space-y-4 pb-24">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl gradient-primary text-primary-foreground shadow-soft">
          <Wallet className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-primary">Cuentas por cobrar</h1>
          <p className="text-xs text-muted-foreground">Clientes, deudas y abonos</p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <KpiCard label="Pendiente total" value={fmt(pendienteTotal)} tone="danger" />
        <KpiCard label="Clientes con deuda" value={clientesConDeuda} />
        <KpiCard label="Deudas activas" value={deudasPendientes} />
        <KpiCard label="Clientes totales" value={clientes.data?.length ?? 0} />
      </div>

      <Tabs defaultValue="clientes" className="w-full">
        <TabsList className="grid w-full grid-cols-2 rounded-xl">
          <TabsTrigger value="clientes" className="rounded-lg">
            <Users className="mr-1.5 h-3.5 w-3.5" /> Clientes
          </TabsTrigger>
          <TabsTrigger value="deudas" className="rounded-lg">
            <Receipt className="mr-1.5 h-3.5 w-3.5" /> Deudas
          </TabsTrigger>
        </TabsList>

        <TabsContent value="clientes" className="mt-3 space-y-3">
          <Button
            variant="outline"
            className="h-10 w-full rounded-xl"
            onClick={() => setCliDialog({ nombre: "", telefono: "", observaciones: "" })}
          >
            <Plus className="mr-2 h-4 w-4" /> Nuevo cliente
          </Button>
          {clientes.data?.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              Aún no hay clientes registrados.
            </div>
          )}
          {clientes.data?.map((c) => {
            const cliDeudas = (deudas.data ?? []).filter((d) => d.cliente_id === c.id);
            const saldo = cliDeudas.filter((d) => d.estado !== "pagada").reduce((s, d) => s + Number(d.saldo), 0);
            const sinTelefono = !c.telefono || !c.telefono.trim();
            return (
              <button
                key={c.id}
                onClick={() => nav(`/cobrar/clientes/${c.id}`)}
                className="w-full rounded-2xl border border-border bg-card p-3 text-left shadow-soft transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center gap-3">
                  <Avatar nombre={c.nombre} size={44} />
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-semibold">{c.nombre}</div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      {c.telefono ? (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {c.telefono}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-1.5 py-0.5 font-semibold text-destructive">
                          <PhoneOff className="h-3 w-3" /> Sin teléfono
                        </span>
                      )}
                      <span>· {cliDeudas.length} deuda(s)</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase text-muted-foreground">Saldo</div>
                    <div className={`font-mono text-sm font-bold tabular-nums ${saldo > 0 ? "text-destructive" : "text-secondary"}`}>
                      {fmt(saldo)}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            );
          })}
        </TabsContent>

        <TabsContent value="deudas" className="mt-3 space-y-3">
          <Select value={estadoFilter || "all"} onValueChange={(v) => setEstadoFilter(v === "all" ? "" : v)}>
            <SelectTrigger className="h-9 rounded-xl text-xs">
              <SelectValue placeholder="Estado" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="pendiente">Pendientes</SelectItem>
              <SelectItem value="parcial">Parciales</SelectItem>
              <SelectItem value="pagada">Pagadas</SelectItem>
            </SelectContent>
          </Select>
          {(deudas.data ?? [])
            .filter((d) => !estadoFilter || d.estado === estadoFilter)
            .map((d) => {
              const cli = clientes.data?.find((c) => c.id === d.cliente_id);
              return (
                <Link
                  key={d.id}
                  to={`/cobrar/clientes/${d.cliente_id}`}
                  className="block rounded-2xl border border-border bg-card p-3 shadow-soft"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold">{cli?.nombre ?? "Cliente"}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {format(new Date(d.fecha), "dd MMM yyyy", { locale: es })}
                        {d.cuadre_label ? ` · ${d.cuadre_label}` : ""}
                      </div>
                    </div>
                    <EstadoBadge estado={d.estado} />
                  </div>
                  <div className="mt-2 flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Total {fmt(d.total)}</span>
                    <span className="font-mono font-bold text-destructive tabular-nums">Saldo {fmt(d.saldo)}</span>
                  </div>
                </Link>
              );
            })}
          {(deudas.data ?? []).length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              <ShieldCheck className="mx-auto mb-2 h-6 w-6" /> Sin deudas registradas
            </div>
          )}
        </TabsContent>
      </Tabs>

      <ClienteDialog
        cli={cliDialog}
        onClose={() => setCliDialog(null)}
        onSaved={() => qc.invalidateQueries({ queryKey: ["clientes"] })}
      />
    </div>
  );
}

function ClienteDialog({
  cli,
  onClose,
  onSaved,
}: {
  cli: Partial<Cliente> | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [obs, setObs] = useState("");
  useMemo(() => {
    setNombre(cli?.nombre ?? "");
    setTelefono(cli?.telefono ?? "");
    setObs(cli?.observaciones ?? "");
  }, [cli?.id, cli?.nombre]);
  return (
    <Dialog open={!!cli} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{cli?.id ? "Editar cliente" : "Nuevo cliente"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label>Teléfono</Label>
            <Input value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="+53..." />
          </div>
          <div className="space-y-1">
            <Label>Observaciones</Label>
            <Textarea value={obs} onChange={(e) => setObs(e.target.value)} className="min-h-[60px] rounded-xl" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={async () => {
              if (!nombre.trim()) return toast.error("Nombre requerido");
              try {
                await upsertCliente({
                  id: cli?.id,
                  nombre: nombre.trim(),
                  telefono: telefono.trim() || null,
                  observaciones: obs.trim() || null,
                  uso_count: cli?.uso_count ?? 0,
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
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function EstadoBadge({ estado }: { estado: "pendiente" | "parcial" | "pagada" }) {
  const map = {
    pendiente: { label: "Pendiente", cls: "bg-destructive/10 text-destructive" },
    parcial: { label: "Parcial", cls: "bg-yellow-500/10 text-yellow-700 dark:text-yellow-500" },
    pagada: { label: "Pagada", cls: "bg-secondary/10 text-secondary" },
  } as const;
  const it = map[estado];
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${it.cls}`}>{it.label}</span>
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
