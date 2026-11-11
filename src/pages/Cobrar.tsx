import { useMemo, useState, useEffect } from "react";
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
import NuevaDeudaDialog from "@/components/NuevaDeudaDialog";
import { useAuth } from "@/hooks/useAuth";
import { useCuadreStore } from "@/store/cuadreStore";

export default function Cobrar() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const { role, nombre } = useAuth();

  const clientes = useQuery({ queryKey: ["clientes"], queryFn: listClientes });
  const deudas = useQuery({ queryKey: ["deudas-all"], queryFn: () => listDeudas() });

    const esDependiente = role === "dependiente";
  const { settings } = useCuadreStore();
  const tienePermisoCobrar =
    esDependiente &&
    Boolean(
      nombre &&
      settings.dependientesPermisoCobrar?.some(
        (n) => n.trim().toLowerCase() === nombre.trim().toLowerCase()
      )
    );

  const miCliente = useMemo(() => {
    if (!esDependiente || !nombre || !clientes.data) return null;
    return clientes.data.find(
      (c) => c.nombre.trim().toLowerCase() === nombre.trim().toLowerCase()
    );
  }, [esDependiente, nombre, clientes.data]);

  useEffect(() => {
    // Si es dependiente pero NO tiene permiso de cobro general
    if (esDependiente && !tienePermisoCobrar && clientes.isSuccess) {
      if (miCliente) {
        nav(`/cobrar/clientes/${miCliente.id}`, { replace: true });
      } else {
        nav("/", { replace: true });
      }
    }
  }, [esDependiente, tienePermisoCobrar, clientes.isSuccess, miCliente, nav]);

  const pendienteTotal = (deudas.data ?? [])
    .filter((d) => d.estado !== "pagada")
    .reduce((s, d) => s + Number(d.saldo), 0);
  const clientesConDeuda = new Set(
    (deudas.data ?? []).filter((d) => d.estado !== "pagada").map((d) => d.cliente_id)
  ).size;
  const deudasPendientes = (deudas.data ?? []).filter((d) => d.estado !== "pagada").length;
  // Estado para el orden de la lista de clientes
  const [ordenClientes, setOrdenClientes] = useState<"consumo" | "saldo" | "alfabetico">("consumo");

  // Clientes ordenados según el criterio seleccionado
  const clientesOrdenados = useMemo(() => {
    const ds = deudas.data ?? [];
    const info = (id: string) => {
      const propias = ds.filter((d) => d.cliente_id === id);
      return {
        consumo: propias.reduce((s, d) => s + Number(d.total), 0),
        saldo: propias
          .filter((d) => d.estado !== "pagada")
          .reduce((s, d) => s + Number(d.saldo), 0),
      };
    };
    return [...(clientes.data ?? [])].sort((a, b) => {
      const ia = info(a.id), ib = info(b.id);

      if (ordenClientes === "alfabetico") {
        return a.nombre.localeCompare(b.nombre, "es");
      }

      if (ordenClientes === "saldo") {
        // Los que tienen deuda primero; mayor saldo arriba
        const za = ia.saldo <= 0 ? 1 : 0, zb = ib.saldo <= 0 ? 1 : 0;
        if (za !== zb) return za - zb;
        if (ib.saldo !== ia.saldo) return ib.saldo - ia.saldo;
        return a.nombre.localeCompare(b.nombre, "es");
      }

      // "consumo" (por defecto): mayor consumo histórico primero, saldos cero al final
      const za = ia.saldo <= 0 ? 1 : 0, zb = ib.saldo <= 0 ? 1 : 0;
      if (za !== zb) return za - zb;
      if (ib.consumo !== ia.consumo) return ib.consumo - ia.consumo;
      return a.nombre.localeCompare(b.nombre, "es");
    });
  }, [clientes.data, deudas.data, ordenClientes]);

  const [cliDialog, setCliDialog] = useState<Partial<Cliente> | null>(null);
  const [deudaLibre, setDeudaLibre] = useState(false);
  const [estadoFilter, setEstadoFilter] = useState<string>("");
  const [busqueda, setBusqueda] = useState("");
  const [soloDeuda, setSoloDeuda] = useState(false);
  const clientesFiltrados = useMemo(() => {
    const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const q = norm(busqueda.trim());
    const ds = deudas.data ?? [];
    return clientesOrdenados.filter((c) => {
      if (q && !norm(c.nombre).includes(q) && !(c.telefono ?? "").includes(q)) return false;
      if (soloDeuda) {
        const saldo = ds
          .filter((d) => d.cliente_id === c.id && d.estado !== "pagada")
          .reduce((s, d) => s + Number(d.saldo), 0);
        if (saldo <= 0) return false;
      }
      return true;
    });
  }, [clientesOrdenados, busqueda, soloDeuda, deudas.data]);

    // Si es dependiente SIN permiso y aún no tiene ficha de cliente registrada
  if (esDependiente && !tienePermisoCobrar && !miCliente && !clientes.isLoading) {
    return (
      <div className="space-y-4 pb-24">
        <header className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl gradient-primary text-primary-foreground shadow-soft">
            <Wallet className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-primary">Mis Deudas</h1>
            <p className="text-xs text-muted-foreground">{nombre}</p>
          </div>
        </header>
        <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-emerald-500" />
          No tienes deudas ni registro de faltantes pendientes.
        </div>
      </div>
    );
  }

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
          {!esDependiente && (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="h-10 w-full rounded-xl"
                onClick={() => setCliDialog({ nombre: "", telefono: "", observaciones: "" })}
              >
                <Plus className="mr-2 h-4 w-4" /> Nuevo cliente
              </Button>
              <Button
                variant="outline"
                className="h-10 w-full rounded-xl"
                onClick={() => setDeudaLibre(true)}
              >
                <Plus className="mr-2 h-4 w-4" /> Nueva deuda
              </Button>
            </div>
          )}
          <Input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por nombre o teléfono…"
            className="h-10 rounded-xl"
          />
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant={soloDeuda ? "outline" : "default"} className="rounded-xl" onClick={() => setSoloDeuda(false)}>
              Todos
            </Button>
            <Button size="sm" variant={soloDeuda ? "default" : "outline"} className="rounded-xl" onClick={() => setSoloDeuda(true)}>
              Solo con saldo pendiente
            </Button>
          </div>
              <div className="flex items-center justify-between gap-2 pt-1">
            <span className="text-[11px] text-muted-foreground">
              {clientesFiltrados.length} cliente(s)
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-muted-foreground">Ordenar:</span>
              <Select value={ordenClientes} onValueChange={(v) => setOrdenClientes(v as "consumo" | "saldo" | "alfabetico")}>
                <SelectTrigger className="h-8 w-[145px] rounded-xl text-xs bg-card">
                  <SelectValue placeholder="Ordenar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="consumo">Mayor consumo</SelectItem>
                  <SelectItem value="saldo">Mayor deuda</SelectItem>
                  <SelectItem value="alfabetico">Nombre (A - Z)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {clientesFiltrados.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
              No hay clientes que coincidan.
            </div>
          )}
          {clientesFiltrados.map((c) => {
            const cliDeudas = (deudas.data ?? []).filter((d) => d.cliente_id === c.id);
            const saldo = cliDeudas.filter((d) => d.estado !== "pagada").reduce((s, d) => s + Number(d.saldo), 0);
            return (
              <button
                key={c.id}
                onClick={() => nav(`/cobrar/clientes/${c.id}`)}
                className="w-full rounded-2xl border border-border bg-card p-3 text-left shadow-soft transition-colors hover:bg-muted/40"
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground">
                    <UserIcon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="truncate text-sm font-semibold">{c.nombre}</div>
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      {c.telefono ? (
                        <span className="inline-flex items-center gap-1">
                          <Phone className="h-3 w-3" /> {c.telefono}
                        </span>
                      ) : null}
                      <span>{cliDeudas.length} deuda(s)</span>
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
      <NuevaDeudaDialog
        open={deudaLibre}
        clientes={clientes.data ?? []}
        onClose={() => setDeudaLibre(false)}
        onSaved={() => {
          qc.invalidateQueries({ queryKey: ["deudas-all"] });
          qc.invalidateQueries({ queryKey: ["clientes"] });
        }}
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
