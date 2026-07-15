import { useCuadreStore, calcCuadre, Cuadre } from "@/store/cuadreStore";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const fmt = (n: number) => `$${Math.round(n).toLocaleString("es-ES")}`;
const fechaTrabajada = (c: Cuadre) => c.diasTrabajados?.[0] ?? c.fecha;

export default function Reportes() {
  const { history } = useCuadreStore();

  // Ordena por fecha trabajada (no por fecha de creación del cuadre)
  const ordenados = [...history].sort(
    (a, b) => new Date(fechaTrabajada(a)).getTime() - new Date(fechaTrabajada(b)).getTime()
  );

  const data = ordenados.slice(-10).map((c) => {
    const r = calcCuadre(c);
    return {
      name: format(new Date(fechaTrabajada(c)), "dd/MM", { locale: es }),
      Venta: Math.round(r.totalVenta),
      Ganancia: Math.round(r.gananciaNeta),
    };
  });

  const totalVenta = history.reduce((s, c) => s + calcCuadre(c).totalVenta, 0);
  const totalGanancia = history.reduce((s, c) => s + calcCuadre(c).gananciaNeta, 0);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Reportes</h1>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl gradient-primary p-4 text-primary-foreground shadow-soft">
          <div className="text-[10px] uppercase tracking-widest opacity-80">Venta acumulada</div>
          <div className="mt-1 text-2xl font-bold">{fmt(totalVenta)}</div>
        </div>
        <div className="rounded-2xl gradient-emerald p-4 text-secondary-foreground shadow-soft">
          <div className="text-[10px] uppercase tracking-widest opacity-80">Ganancia neta</div>
          <div className="mt-1 text-2xl font-bold">{fmt(totalGanancia)}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="mb-2 text-sm font-semibold">Últimos cuadres (por fecha trabajada)</div>
        {data.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Sin datos todavía
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" fontSize={11} />
              <YAxis fontSize={11} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 12,
                }}
              />
              <Bar dataKey="Venta" fill="hsl(var(--primary))" radius={[8, 8, 0, 0]} />
              <Bar dataKey="Ganancia" fill="hsl(var(--secondary))" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
