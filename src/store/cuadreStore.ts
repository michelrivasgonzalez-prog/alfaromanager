import { create } from "zustand";
import { persist } from "zustand/middleware";

export type Producto = {
  id: string;
  nombre: string;
  inicio: number;
  entradas: number;
  traslados: number;
  final: number;
  precio: number;
  costo: number;
};

export type Gasto = {
  id: string;
  categoria: "Local" | "Yanitza" | "Compras" | "Cuentas por Cobrar" | "Transferencia";
  descripcion: string;
  monto: number;
};

export type Denominaciones = Record<string, number>; // billete -> cantidad

export type Cuadre = {
  id: string;
  fecha: string; // ISO
  diasTrabajados: string[]; // ISO dates
  dependiente: string;
  productos: Producto[];
  gastos: Gasto[];
  denominaciones: Denominaciones;
  efectivoDepositado: number;
  salarioBase: number;
  salarioDenominaciones: Denominaciones;
  finalizado: boolean;
};

const DEFAULT_PRODUCTS: Producto[] = [
  { id: "p1", nombre: "Café", inicio: 0, entradas: 0, traslados: 0, final: 0, precio: 50, costo: 20 },
  { id: "p2", nombre: "Azúcar", inicio: 0, entradas: 0, traslados: 0, final: 0, precio: 5, costo: 2 },
  { id: "p3", nombre: "Leche", inicio: 0, entradas: 0, traslados: 0, final: 0, precio: 30, costo: 15 },
  { id: "p4", nombre: "Vasos", inicio: 0, entradas: 0, traslados: 0, final: 0, precio: 5, costo: 2 },
];

export const DENOMINACIONES = [1000, 500, 200, 100, 50, 20, 10, 5];

const emptyDen = (): Denominaciones =>
  Object.fromEntries(DENOMINACIONES.map((d) => [String(d), 0]));

export const newCuadre = (): Cuadre => ({
  id: crypto.randomUUID(),
  fecha: new Date().toISOString(),
  diasTrabajados: [new Date().toISOString()],
  dependiente: "",
  productos: DEFAULT_PRODUCTS.map((p) => ({ ...p })),
  gastos: [],
  denominaciones: emptyDen(),
  efectivoDepositado: 0,
  salarioBase: 500,
  salarioDenominaciones: emptyDen(),
  finalizado: false,
});

interface State {
  current: Cuadre | null;
  history: Cuadre[];
  startCuadre: () => void;
  updateCurrent: (patch: Partial<Cuadre>) => void;
  updateProducto: (id: string, patch: Partial<Producto>) => void;
  addProducto: (p: Omit<Producto, "id">) => void;
  removeProducto: (id: string) => void;
  addGasto: (g: Omit<Gasto, "id">) => void;
  updateGasto: (id: string, patch: Partial<Gasto>) => void;
  removeGasto: (id: string) => void;
  setDenominacion: (billete: string, cantidad: number) => void;
  setSalarioDen: (billete: string, cantidad: number) => void;
  finalizar: () => void;
  cancelar: () => void;
  deleteHistory: (id: string) => void;
}

export const useCuadreStore = create<State>()(
  persist(
    (set, get) => ({
      current: null,
      history: [],
      startCuadre: () => set({ current: newCuadre() }),
      updateCurrent: (patch) =>
        set((s) => (s.current ? { current: { ...s.current, ...patch } } : s)),
      updateProducto: (id, patch) =>
        set((s) =>
          s.current
            ? {
                current: {
                  ...s.current,
                  productos: s.current.productos.map((p) =>
                    p.id === id ? { ...p, ...patch } : p
                  ),
                },
              }
            : s
        ),
      addProducto: (p) =>
        set((s) =>
          s.current
            ? {
                current: {
                  ...s.current,
                  productos: [...s.current.productos, { ...p, id: crypto.randomUUID() }],
                },
              }
            : s
        ),
      removeProducto: (id) =>
        set((s) =>
          s.current
            ? {
                current: {
                  ...s.current,
                  productos: s.current.productos.filter((p) => p.id !== id),
                },
              }
            : s
        ),
      addGasto: (g) =>
        set((s) =>
          s.current
            ? {
                current: {
                  ...s.current,
                  gastos: [...s.current.gastos, { ...g, id: crypto.randomUUID() }],
                },
              }
            : s
        ),
      updateGasto: (id, patch) =>
        set((s) =>
          s.current
            ? {
                current: {
                  ...s.current,
                  gastos: s.current.gastos.map((g) => (g.id === id ? { ...g, ...patch } : g)),
                },
              }
            : s
        ),
      removeGasto: (id) =>
        set((s) =>
          s.current
            ? {
                current: { ...s.current, gastos: s.current.gastos.filter((g) => g.id !== id) },
              }
            : s
        ),
      setDenominacion: (billete, cantidad) =>
        set((s) =>
          s.current
            ? {
                current: {
                  ...s.current,
                  denominaciones: { ...s.current.denominaciones, [billete]: cantidad },
                },
              }
            : s
        ),
      setSalarioDen: (billete, cantidad) =>
        set((s) =>
          s.current
            ? {
                current: {
                  ...s.current,
                  salarioDenominaciones: { ...s.current.salarioDenominaciones, [billete]: cantidad },
                },
              }
            : s
        ),
      finalizar: () => {
        const c = get().current;
        if (!c) return;
        set((s) => ({
          history: [{ ...c, finalizado: true, fecha: new Date().toISOString() }, ...s.history],
          current: null,
        }));
      },
      cancelar: () => set({ current: null }),
      deleteHistory: (id) =>
        set((s) => ({ history: s.history.filter((c) => c.id !== id) })),
    }),
    { name: "alfarocafe-store" }
  )
);

// ============ Selectors / calculations ============
export const calcProducto = (p: Producto) => {
  const total = p.inicio + p.entradas - p.traslados;
  const venta = total - p.final;
  const importe = venta * p.precio;
  const costoTotal = venta * p.costo;
  const ganancia = importe - costoTotal;
  return { total, venta, importe, costoTotal, ganancia };
};

export const calcCuadre = (c: Cuadre) => {
  const productos = c.productos.map((p) => ({ ...p, ...calcProducto(p) }));
  const totalVenta = productos.reduce((s, p) => s + p.importe, 0);
  const totalCosto = productos.reduce((s, p) => s + p.costoTotal, 0);
  const gananciaTotal = totalVenta - totalCosto;

  const gastosPorCategoria = c.gastos.reduce<Record<string, number>>((acc, g) => {
    acc[g.categoria] = (acc[g.categoria] || 0) + g.monto;
    return acc;
  }, {});
  const totalGastos = c.gastos.reduce((s, g) => s + g.monto, 0);

  const efectivoEnCaja = Object.entries(c.denominaciones).reduce(
    (s, [b, n]) => s + Number(b) * n,
    0
  );
  const efectivoADepositar = totalVenta - totalGastos;
  const diferencia = c.efectivoDepositado - efectivoADepositar;

  const diasCount = c.diasTrabajados.length;
  const salarioBruto = diasCount * c.salarioBase;
  // diferencia negativa => falta dinero => se descuenta del salario
  // diferencia positiva => sobra (propina) no afecta salario base
  const descuentoFalta = diferencia < 0 ? Math.abs(diferencia) : 0;
  const salarioReal = salarioBruto - descuentoFalta;
  const propina = diferencia > 0 ? diferencia : 0;

  const gananciaNeta = gananciaTotal - totalGastos - salarioReal;

  return {
    productos,
    totalVenta,
    totalCosto,
    gananciaTotal,
    gastosPorCategoria,
    totalGastos,
    efectivoEnCaja,
    efectivoADepositar,
    diferencia,
    diasCount,
    salarioBruto,
    salarioReal,
    descuentoFalta,
    propina,
    gananciaNeta,
  };
};

// Suggest payment denominations using smallest bills first based on availability
export const sugerirPagoSalario = (
  monto: number,
  disponibles: Denominaciones
): Denominaciones => {
  const result: Denominaciones = Object.fromEntries(
    DENOMINACIONES.map((d) => [String(d), 0])
  );
  let restante = Math.floor(monto);
  // ascending (smallest first)
  const orden = [...DENOMINACIONES].sort((a, b) => a - b);
  for (const bill of orden) {
    const dispo = disponibles[String(bill)] || 0;
    if (dispo === 0 || restante < bill) continue;
    const usar = Math.min(dispo, Math.floor(restante / bill));
    result[String(bill)] = usar;
    restante -= usar * bill;
  }
  // if remainder, fall back to larger bills (no availability check)
  if (restante > 0) {
    const desc = [...DENOMINACIONES].sort((a, b) => b - a);
    for (const bill of desc) {
      if (restante < bill) continue;
      const usar = Math.floor(restante / bill);
      result[String(bill)] = (result[String(bill)] || 0) + usar;
      restante -= usar * bill;
    }
  }
  return result;
};
