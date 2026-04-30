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

export type CatalogoItem = {
  id: string;
  nombre: string;
  precio: number;
  costo: number;
  punto?: "Cafetería" | "Mipyme";
};

export type GastoTipo = "Efectivo" | "Producto";

export type Gasto = {
  id: string;
  categoria: "Local" | "Yanitza" | "Compras" | "Cuentas por Cobrar" | "Transferencia";
  nombre: string; // quién recibe
  tipo: GastoTipo;
  descripcion: string;
  // Para tipo Producto:
  productoId?: string;
  productoNombre?: string;
  cantidad?: number;
  precio?: number;
  // Importe final
  monto: number;
};

export type Denominaciones = Record<string, number>;

export type PuntoVenta = "Cafetería" | "Mipyme";
export const PUNTOS: PuntoVenta[] = ["Cafetería", "Mipyme"];

export type Cuadre = {
  id: string;
  puntoVenta: PuntoVenta;
  fecha: string;
  diasTrabajados: string[];
  dependiente: string;
  productos: Producto[];
  gastos: Gasto[];
  denominaciones: Denominaciones;
  efectivoDepositado: number;
  salarioBase: number;
  salarioDenominaciones: Denominaciones;
  finalizado: boolean;
};

const DEFAULT_CATALOG: CatalogoItem[] = [
  { id: "p1", nombre: "Café", precio: 50, costo: 20, punto: "Cafetería" },
  { id: "p2", nombre: "Azúcar", precio: 5, costo: 2, punto: "Cafetería" },
  { id: "p3", nombre: "Leche", precio: 30, costo: 15, punto: "Cafetería" },
  { id: "p4", nombre: "Vasos", precio: 5, costo: 2, punto: "Cafetería" },
];

export const DENOMINACIONES = [1000, 500, 200, 100, 50, 20, 10, 5];

const emptyDen = (): Denominaciones =>
  Object.fromEntries(DENOMINACIONES.map((d) => [String(d), 0]));

export const newCuadre = (
  punto: PuntoVenta,
  catalogo: CatalogoItem[]
): Cuadre => ({
  id: crypto.randomUUID(),
  puntoVenta: punto,
  fecha: new Date().toISOString(),
  diasTrabajados: [new Date().toISOString()],
  dependiente: "",
  // Snapshot del catálogo: cambios futuros NO afectan este cuadre
  productos: catalogo
    .filter((c) => !c.punto || c.punto === punto)
    .map((c) => ({
    id: crypto.randomUUID(),
    nombre: c.nombre,
    inicio: 0,
    entradas: 0,
    traslados: 0,
    final: 0,
    precio: c.precio,
    costo: c.costo,
  })),
  gastos: [],
  denominaciones: emptyDen(),
  efectivoDepositado: 0,
  salarioBase: 500,
  salarioDenominaciones: emptyDen(),
  finalizado: false,
});

interface State {
  // Cuadres en curso por punto de venta
  currents: Record<PuntoVenta, Cuadre | null>;
  activePunto: PuntoVenta;
  // Último paso visitado por cuadre (para reanudar)
  lastStep: Record<PuntoVenta, number>;
  history: Cuadre[];
  catalogo: CatalogoItem[];
  dependientes: string[];
  role: "admin" | "dependiente";

  setRole: (r: "admin" | "dependiente") => void;
  setActivePunto: (p: PuntoVenta) => void;
  setLastStep: (p: PuntoVenta, step: number) => void;

  // Catálogo (master)
  addCatalogItem: (item: Omit<CatalogoItem, "id">) => void;
  updateCatalogItem: (id: string, patch: Partial<CatalogoItem>) => void;
  removeCatalogItem: (id: string) => void;
  importCatalog: (items: Omit<CatalogoItem, "id">[]) => void;

  // Dependientes
  addDependiente: (nombre: string) => void;
  updateDependiente: (oldName: string, newName: string) => void;
  removeDependiente: (nombre: string) => void;

  // Cuadres
  startCuadre: (punto?: PuntoVenta) => void;
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
  cancelar: (punto?: PuntoVenta) => void;
  deleteHistory: (id: string) => void;
}

const updateActive = (
  s: State,
  fn: (c: Cuadre) => Cuadre
): Partial<State> => {
  const c = s.currents[s.activePunto];
  if (!c) return {};
  return {
    currents: { ...s.currents, [s.activePunto]: fn(c) },
  };
};

export const useCuadreStore = create<State>()(
  persist(
    (set, get) => ({
      currents: { "Cafetería": null, "Mipyme": null },
      activePunto: "Cafetería",
      lastStep: { "Cafetería": 1, "Mipyme": 1 },
      history: [],
      catalogo: DEFAULT_CATALOG,
      dependientes: [],
      role: "admin",

      setRole: (r) => set({ role: r }),
      setActivePunto: (p) => set({ activePunto: p }),
      setLastStep: (p, step) =>
        set((s) => ({ lastStep: { ...s.lastStep, [p]: step } })),

      addCatalogItem: (item) =>
        set((s) => ({
          catalogo: [...s.catalogo, { ...item, id: crypto.randomUUID() }],
        })),
      updateCatalogItem: (id, patch) =>
        set((s) => ({
          catalogo: s.catalogo.map((c) => (c.id === id ? { ...c, ...patch } : c)),
        })),
      removeCatalogItem: (id) =>
        set((s) => ({ catalogo: s.catalogo.filter((c) => c.id !== id) })),
      importCatalog: (items) =>
        set((s) => ({
          catalogo: [
            ...s.catalogo,
            ...items.map((i) => ({ ...i, id: crypto.randomUUID() })),
          ],
        })),

      addDependiente: (nombre) =>
        set((s) =>
          s.dependientes.includes(nombre)
            ? s
            : { dependientes: [...s.dependientes, nombre] }
        ),
      updateDependiente: (oldName, newName) =>
        set((s) => ({
          dependientes: s.dependientes.map((d) => (d === oldName ? newName : d)),
        })),
      removeDependiente: (nombre) =>
        set((s) => ({ dependientes: s.dependientes.filter((d) => d !== nombre) })),

      startCuadre: (punto) =>
        set((s) => {
          const p = punto ?? s.activePunto;
          return {
            activePunto: p,
            currents: { ...s.currents, [p]: newCuadre(p, s.catalogo) },
            lastStep: { ...s.lastStep, [p]: 1 },
          };
        }),

      updateCurrent: (patch) => set((s) => updateActive(s, (c) => ({ ...c, ...patch }))),
      updateProducto: (id, patch) =>
        set((s) =>
          updateActive(s, (c) => ({
            ...c,
            productos: c.productos.map((p) => (p.id === id ? { ...p, ...patch } : p)),
          }))
        ),
      addProducto: (p) =>
        set((s) =>
          updateActive(s, (c) => ({
            ...c,
            productos: [...c.productos, { ...p, id: crypto.randomUUID() }],
          }))
        ),
      removeProducto: (id) =>
        set((s) =>
          updateActive(s, (c) => ({
            ...c,
            productos: c.productos.filter((p) => p.id !== id),
          }))
        ),
      addGasto: (g) =>
        set((s) =>
          updateActive(s, (c) => ({
            ...c,
            gastos: [...c.gastos, { ...g, id: crypto.randomUUID() }],
          }))
        ),
      updateGasto: (id, patch) =>
        set((s) =>
          updateActive(s, (c) => ({
            ...c,
            gastos: c.gastos.map((g) => (g.id === id ? { ...g, ...patch } : g)),
          }))
        ),
      removeGasto: (id) =>
        set((s) =>
          updateActive(s, (c) => ({ ...c, gastos: c.gastos.filter((g) => g.id !== id) }))
        ),
      setDenominacion: (billete, cantidad) =>
        set((s) =>
          updateActive(s, (c) => ({
            ...c,
            denominaciones: { ...c.denominaciones, [billete]: cantidad },
          }))
        ),
      setSalarioDen: (billete, cantidad) =>
        set((s) =>
          updateActive(s, (c) => ({
            ...c,
            salarioDenominaciones: { ...c.salarioDenominaciones, [billete]: cantidad },
          }))
        ),
      finalizar: () => {
        const s = get();
        const c = s.currents[s.activePunto];
        if (!c) return;
        set({
          history: [
            { ...c, finalizado: true, fecha: new Date().toISOString() },
            ...s.history,
          ],
          currents: { ...s.currents, [s.activePunto]: null },
          lastStep: { ...s.lastStep, [s.activePunto]: 1 },
        });
      },
      cancelar: (punto) =>
        set((s) => {
          const p = punto ?? s.activePunto;
          return {
            currents: { ...s.currents, [p]: null },
            lastStep: { ...s.lastStep, [p]: 1 },
          };
        }),
      deleteHistory: (id) =>
        set((s) => ({ history: s.history.filter((c) => c.id !== id) })),
    }),
    { name: "alfarocafe-store" }
  )
);

// Conveniencia: cuadre activo
export const useCurrent = () => {
  const c = useCuadreStore((s) => s.currents[s.activePunto]);
  return c;
};

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
  // Solo Gastos Local + Gastos Yanitza afectan la ganancia neta.
  // Compras, Cuentas por Cobrar y Transferencias NO se restan.
  const gastosNeta =
    (gastosPorCategoria["Local"] || 0) + (gastosPorCategoria["Yanitza"] || 0);

  const efectivoEnCaja = Object.entries(c.denominaciones).reduce(
    (s, [b, n]) => s + Number(b) * n,
    0
  );
  const efectivoADepositar = totalVenta - totalGastos;
  // Diferencia simple: en caja - a depositar  (positivo = sobrante / propina, negativo = faltante)
  const diferencia = efectivoEnCaja - efectivoADepositar;

  const diasCount = c.diasTrabajados.length;
  const salarioBruto = diasCount * c.salarioBase;
  const descuentoFalta = diferencia < 0 ? Math.abs(diferencia) : 0;
  const propina = diferencia > 0 ? diferencia : 0;
  // Salario real = bruto + propina - descuento por faltante
  const salarioReal = salarioBruto + propina - descuentoFalta;

  // Ganancia Neta = Ganancia Bruta - Gastos Local - Gastos Yanitza - Salario Base
  const gananciaNeta = gananciaTotal - gastosNeta - salarioBruto;

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

export const sugerirPagoSalario = (
  monto: number,
  disponibles: Denominaciones
): Denominaciones => {
  const result: Denominaciones = Object.fromEntries(
    DENOMINACIONES.map((d) => [String(d), 0])
  );
  let restante = Math.floor(monto);
  const orden = [...DENOMINACIONES].sort((a, b) => a - b);
  for (const bill of orden) {
    const dispo = disponibles[String(bill)] || 0;
    if (dispo === 0 || restante < bill) continue;
    const usar = Math.min(dispo, Math.floor(restante / bill));
    result[String(bill)] = usar;
    restante -= usar * bill;
  }
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
