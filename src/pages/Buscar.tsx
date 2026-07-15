import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, X, Users, Package, Receipt, FileText, History, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCuadreStore } from "@/store/cuadreStore";
import { listClientes, listDeudas, fmt } from "@/lib/cobrar";
import { listProductos } from "@/lib/almacen";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function Buscar() {
  const nav = useNavigate();
  const [q, setQ] = useState("");
  const { history } = useCuadreStore();

  const clientes = useQuery({ queryKey: ["clientes"], queryFn: listClientes });
  const deudas = useQuery({ queryKey: ["deudas-all"], queryFn: () => listDeudas() });
  const productos = useQuery({ queryKey: ["alm-productos"], queryFn: listProductos });

  const term = q.trim().toLowerCase();

  const resultados = useMemo(() => {
    if (!term) return null;
    const clientesR = (clientes.data ?? []).filter(
      (c) =>
        c.nombre.toLowerCase().includes(term) ||
        (c.telefono && c.telefono.toLowerCase().includes(term))
    );
    const productosR = (productos.data ?? []).filter((p) =>
      p.nombre.toLowerCase().includes(term)
    );
    const deudasR = (deudas.data ?? []).filter(
      (d) =>
        (d.cuadre_label && d.cuadre_label.toLowerCase().includes(term)) ||
        clientes.data?.some(
          (c) =>
            c.id === d.cliente_id &&
            (c.nombre.toLowerCase().includes(term) || c.telefono?.toLowerCase().includes(term))
        )
    );
    const cuadresR = history.filter(
      (c) =>
        c.dependiente.toLowerCase().includes(term) ||
        c.puntoVenta.toLowerCase().includes(term) ||
        c.productos.some((p) => p.nombre.toLowerCase().includes(term))
    );
    return { clientes: clientesR, productos: productosR, deudas: deudasR, cuadres: cuadresR };
  }, [term, clientes.data, productos.data, deudas.data, history]);

  useEffect(() => {
    const input = document.getElementById("buscar-input") as HTMLInputElement | null;
    input?.focus();
  }, []);

  const totalHits = useMemo(() => {
    if (!resultados) return 0;
    return (
      resultados.clientes.length +
      resultados.productos.length +
      resultados.deudas.length +
      resultados.cuadres.length
    );
  }, [resultados]);

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="buscar-input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar clientes, productos, deudas o cuadres…"
            className="h-12 rounded-xl pl-10 pr-10"
          />
          {q && (
            <button
              onClick={() => setQ("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => nav(-1)}>
          Cerrar
        </Button>
      </div>

      {!resultados && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          <Search className="mx-auto mb-2 h-8 w-8" />
          Escribe para buscar en clientes, productos, deudas y cuadres.
        </div>
      )}

      {resultados && totalHits === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No se encontraron resultados para "{q}".
        </div>
      )}

      {resultados && resultados.clientes.length > 0 && (
        <Section icon={Users} title="Clientes">
          {resultados.clientes.map((c) => {
            const saldo = resultados.deudas
              .filter((d) => d.cliente_id === c.id && d.estado !== "pagada")
              .reduce((s, d) => s + Number(d.saldo), 0);
            return (
              <button
                key={c.id}
                onClick={() => nav(`/cobrar/clientes/${c.id}`)}
                className="flex w-full items-center justify-between rounded-2xl border border-border bg-card p-3 text-left shadow-soft"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{c.nombre}</div>
                  {c.telefono && <div className="text-[11px] text-muted-foreground">{c.telefono}</div>}
                </div>
                <div className="flex items-center gap-2">
                  {saldo > 0 && <div className="font-mono text-sm font-bold text-destructive">{fmt(saldo)}</div>}
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            );
          })}
        </Section>
      )}

      {resultados && resultados.productos.length > 0 && (
        <Section icon={Package} title="Productos de almacén">
          {resultados.productos.map((p) => (
            <button
              key={p.id}
              onClick={() => nav("/almacen")}
              className="flex w-full items-center justify-between rounded-2xl border border-border bg-card p-3 text-left shadow-soft"
            >
              <div>
                <div className="text-sm font-semibold">{p.nombre}</div>
                <div className="text-[11px] text-muted-foreground">Unidad: {p.unidad}</div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </Section>
      )}

      {resultados && resultados.deudas.length > 0 && (
        <Section icon={Receipt} title="Deudas">
          {resultados.deudas.map((d) => {
            const cli = resultados.clientes.find((c) => c.id === d.cliente_id) ??
              clientes.data?.find((c) => c.id === d.cliente_id);
            return (
              <button
                key={d.id}
                onClick={() => nav(`/cobrar/clientes/${d.cliente_id}`)}
                className="flex w-full items-center justify-between rounded-2xl border border-border bg-card p-3 text-left shadow-soft"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{cli?.nombre ?? "Cliente"}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {d.cuadre_label ?? format(new Date(d.fecha), "dd MMM yyyy", { locale: es })}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      d.estado === "pagada"
                        ? "bg-secondary/10 text-secondary"
                        : d.estado === "parcial"
                        ? "bg-yellow-500/10 text-yellow-700 dark:text-yellow-500"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {d.estado}
                  </span>
                  <div className="font-mono text-sm font-bold text-destructive">{fmt(d.saldo)}</div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </div>
              </button>
            );
          })}
        </Section>
      )}

      {resultados && resultados.cuadres.length > 0 && (
        <Section icon={FileText} title="Cuadres">
          {resultados.cuadres.map((c) => (
            <button
              key={c.id}
              onClick={() => nav("/historial")}
              className="flex w-full items-center justify-between rounded-2xl border border-border bg-card p-3 text-left shadow-soft"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{c.dependiente || "Sin nombre"}</div>
                <div className="text-[11px] text-muted-foreground">
                  {format(new Date(c.fecha), "dd MMM yyyy", { locale: es })} · {c.puntoVenta}
                </div>
              </div>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
            </button>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <h2 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
        <Icon className="h-4 w-4" /> {title}
      </h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}
