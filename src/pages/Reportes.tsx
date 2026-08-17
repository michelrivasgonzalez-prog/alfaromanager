import { useMemo, useState } from "react";
import { useCuadreStore, calcCuadre, Cuadre } from "@/store/cuadreStore";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

const fmt = (n: number) => `$${Math.round(n).toLocaleString("es-ES")}`;
const fechaTrabajada = (c: Cuadre) => c.diasTrabajados?.[0] ?? c.fecha;
const mesKey = (d: string | Date) => format(new Date(d), "yyyy-MM");

export default function Reportes() {
  const { history } = useCuadreStore();

  // Meses con cuadres (más reciente primero)
  const meses = useMemo(() => {
    const set = new Set(history.map((c) => mesKey(fechaTrabajada(c))));
    const arr = [...set].sort();
    if (arr.length === 0) arr.push(mesKey(new Date()));
    return arr;
  }, [history]);

  const [idx, setIdx] = useState(meses.length - 1);
  const mes = meses[Math.min(idx, meses.length - 1)] ?? meses[0];

  const delMes = useMemo(
    () =>
      history
        .filter((c) => mesKey(fechaTrabajada(c)) === mes)
        .sort(
          (a, b) =>
            new Date(fechaTrabajada(a)).getTime() - new Date(fechaTrabajada(b)).getTime()
        ),
    [history, mes]
  );

  const data = delMes.map((c) => {
    const r = calcCuadre(c);
    return {
      name: format(new Date(fechaTrabajada(c)), "dd/MM", { locale: es }),
      Venta: Math.round(r.totalVenta),
      Ganancia: Math.round(r.gananciaNeta),
    };
  });

  const totalVenta = delMes.reduce((s, c) => s + calcCuadre(c).totalVenta, 0);
  const totalGanancia = delMes.reduce((s, c) => s + calcCuadre(c).gananciaNeta, 0);
  const totalGastos = delMes.reduce((s, c) => s + calcCuadre(c).totalGastos, 0);

  const etiquetaMes = format(new Date(`${mes}-01T12:00:00`), "MMMM yyyy", { locale: es });

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Reportes</h1>

      {/* Selector de mes */}
      <div className="flex items-center justify-between rounded-2xl border border-border bg-card p-2 shadow-soft">
        <Button
          variant="ghost"
          size="icon"
          disabled={idx <= 0}
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="text-center">
          <div className="text-sm font-semibold capitalize">{etiquetaMes}</div>
          <div className="text-[11px] text-muted-foreground">{delMes.length} cuadre(s)</div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          disabled={idx >= meses.length - 1}
          onClick={() => setIdx((i) => Math.min(meses.length - 1, i + 1))}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl gradient-primary p-4 text-primary-foreground shadow-soft">
          <div className="text-[10px] uppercase tracking-widest opacity-80">Venta del mes</div>
          <div className="mt-1 text-2xl font-bold">{fmt(totalVenta)}</div>
        </div>
        <div className="rounded-2xl gradient-emerald p-4 text-secondary-foreground shadow-soft">
          <div className="text-[10px] uppercase tracking-widest opacity-80">Ganancia neta</div>
          <div className="mt-1 text-2xl font-bold">{fmt(totalGanancia)}</div>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Gastos del mes</span>
          <span className="font-mono font-bold tabular-nums">{fmt(totalGastos)}</span>
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft">
        <div className="mb-2 text-sm font-semibold">Cuadres del mes (por fecha trabajada)</div>
        {data.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Sin cuadres en este mes
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
