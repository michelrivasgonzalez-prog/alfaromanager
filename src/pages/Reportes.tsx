import { useMemo, useState } from "react";
import { useCuadreStore, calcCuadre, Cuadre, catLabel, GastoCategoria } from "@/store/cuadreStore";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Receipt, CreditCard, Building2, User, ArrowUpRight, Wallet } from "lucide-react";

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

  // Desglose de gastos del mes agrupados por categoría
  const desgloseGastos = useMemo(() => {
    const mapa: Record<string, { total: number; cantidad: number }> = {
      Local: { total: 0, cantidad: 0 },
      Yanitza: { total: 0, cantidad: 0 },
      "Salida de efectivo": { total: 0, cantidad: 0 },
      "Cuentas por Cobrar": { total: 0, cantidad: 0 },
      Transferencia: { total: 0, cantidad: 0 },
    };

    for (const c of delMes) {
      for (const g of c.gastos) {
        const catNorm = catLabel(g.categoria);
        if (!mapa[catNorm]) {
          mapa[catNorm] = { total: 0, cantidad: 0 };
        }
        mapa[catNorm].total += Number(g.monto || 0);
        mapa[catNorm].cantidad += 1;
      }
    }
    return mapa;
  }, [delMes]);


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

            {/* Sección Desglose Mensual de Gastos */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold">Gastos del mes por categoría</h2>
          </div>
          <span className="font-mono text-base font-bold tabular-nums text-destructive">
            {fmt(totalGastos)}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {[
            { key: "Local", label: "Local", icon: Building2, color: "text-amber-500 bg-amber-500/10" },
            { key: "Yanitza", label: "Yanitza", icon: User, color: "text-purple-500 bg-purple-500/10" },
            { key: "Salida de efectivo", label: "Salidas / Compras", icon: Wallet, color: "text-blue-500 bg-blue-500/10" },
            { key: "Cuentas por Cobrar", label: "Cuentas por Cobrar", icon: ArrowUpRight, color: "text-orange-500 bg-orange-500/10" },
            { key: "Transferencia", label: "Transferencias", icon: CreditCard, color: "text-cyan-500 bg-cyan-500/10" },
          ].map((cat) => {
            const dataCat = desgloseGastos[cat.key] ?? { total: 0, cantidad: 0 };
            const pct = totalGastos > 0 ? Math.round((dataCat.total / totalGastos) * 100) : 0;
            const Icon = cat.icon;

            return (
              <div key={cat.key} className="rounded-xl border border-border bg-muted/40 p-2.5 flex flex-col justify-between space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted-foreground truncate" title={cat.label}>
                    {cat.label}
                  </span>
                  <div className={`p-1 rounded-md shrink-0 ${cat.color}`}>
                    <Icon className="h-3 w-3" />
                  </div>
                </div>
                <div>
                  <div className="font-mono text-sm font-bold tabular-nums">
                    {fmt(dataCat.total)}
                  </div>
                  <div className="flex justify-between items-center text-[10px] text-muted-foreground mt-0.5">
                    <span>{dataCat.cantidad} op.</span>
                    <span className="font-semibold">{pct}%</span>
                  </div>
                </div>
              </div>
            );
          })}
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
