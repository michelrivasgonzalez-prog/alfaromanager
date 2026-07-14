import { useMemo } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, Wallet, Phone, Plus, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { listClientes, listDeudas, listAbonos, fmt } from "@/lib/cobrar";
import { EstadoBadge } from "./Cobrar";

export default function ClienteDetalle() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const clientes = useQuery({ queryKey: ["clientes"], queryFn: listClientes });
  const deudas = useQuery({ queryKey: ["deudas", id], queryFn: () => listDeudas(id) });
  const abonos = useQuery({ queryKey: ["abonos", id], queryFn: () => listAbonos(id) });

  const cliente = useMemo(() => clientes.data?.find((c) => c.id === id), [clientes.data, id]);

  const pend = (deudas.data ?? []).filter((d) => d.estado !== "pagada");
  const totalDeuda = pend.reduce((s, d) => s + Number(d.saldo), 0);
  const totalComprado = (deudas.data ?? []).reduce((s, d) => s + Number(d.total), 0);
  const totalPagado = (abonos.data ?? []).reduce((s, a) => s + Number(a.monto), 0);

  if (!cliente) return <div className="p-4 text-sm text-muted-foreground">Cliente no encontrado</div>;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => nav(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold text-primary">{cliente.nombre}</h1>
          {cliente.telefono && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Phone className="h-3 w-3" /> {cliente.telefono}
            </div>
          )}
        </div>
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
        {cliente.telefono && totalDeuda > 0 && (
          <Button
            variant="outline"
            className="h-11 rounded-xl"
            onClick={() => {
              const text = `Hola ${cliente.nombre}, tu saldo pendiente es ${fmt(totalDeuda)}.`;
              window.open(
                `https://wa.me/${cliente.telefono!.replace(/[^\d]/g, "")}?text=${encodeURIComponent(text)}`,
                "_blank"
              );
            }}
          >
            <Share2 className="mr-2 h-4 w-4" /> WhatsApp
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
