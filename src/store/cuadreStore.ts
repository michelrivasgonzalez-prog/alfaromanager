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
  // Bloqueado por importación de finales del turno anterior.
  // Si está bloqueado, no se puede editar nombre ni inicio salvo
  // que el usuario lo desbloquee con una nota obligatoria.
  bloqueado?: boolean;
  // Nota obligatoria registrada al desbloquear el producto.
  notaDesbloqueo?: string;
};

export type CatalogoItem = {
  id: string;
  nombre: string;
  precio: number;
  costo: number;
  orden?: number;
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
  // Para Transferencia:
  fecha?: string;          // ISO
  transaccion?: string;    // nº/ref
  importe?: number;        // monto base ingresado
  porcentaje?: number;     // % cargo aplicado
  montoRecibido?: number;  // importe + (importe * porcentaje/100)
  // Importe final
  monto: number;
};

export type Denominaciones = Record<string, number>;

export type PuntoVenta = "Cafetería" | "Mipyme";
export const PUNTOS: PuntoVenta[] = ["Cafetería", "Mipyme"];

export type SalarioModo = "base" | "porcentaje" | "mixto";
export const SALARIO_MODOS: { value: SalarioModo; label: string; desc: string }[] = [
  { value: "base", label: "Salario base/día", desc: "Salario base por día × días trabajados" },
  { value: "porcentaje", label: "% de venta", desc: "Porcentaje del total de ventas" },
  { value: "mixto", label: "Base o % (el mayor)", desc: "El mayor entre el salario base y el % de venta" },
];

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
  salarioModo: SalarioModo;
  porcentajeVenta: number;
  salarioDenominaciones: Denominaciones;
  finalizado: boolean;
};

export type Settings = {
  salarioBase: Record<PuntoVenta, number>;
  porcentajeTransferencia: number;
  salarioModo: Record<PuntoVenta, SalarioModo>;
  porcentajeVenta: Record<PuntoVenta, number>;
};

const DEFAULT_SETTINGS: Settings = {
  salarioBase: { "Cafetería": 1000, "Mipyme": 1000 },
  porcentajeTransferencia: 10,
  salarioModo: { "Cafetería": "base", "Mipyme": "base" },
  porcentajeVenta: { "Cafetería": 3, "Mipyme": 3 },
};

const DEFAULT_CATALOG: CatalogoItem[] = [];

export const DENOMINACIONES = [1000, 500, 200, 100, 50, 20, 10, 5];

const emptyDen = (): Denominaciones =>
  Object.fromEntries(DENOMINACIONES.map((d) => [String(d), 0]));

export const sortCatalogo = (items: CatalogoItem[]) =>
  [...items].sort((a, b) => {
    const pa = a.punto ?? "Cafetería";
    const pb = b.punto ?? "Cafetería";
    if (pa !== pb) return PUNTOS.indexOf(pa) - PUNTOS.indexOf(pb);
    return (a.orden ?? 999999) - (b.orden ?? 999999);
  });

export const normalizeCatalogoOrden = (items: CatalogoItem[]) => {
  const counters: Record<PuntoVenta, number> = { "Cafetería": 0, "Mipyme": 0 };
  return sortCatalogo(items).map((item) => {
    const punto = item.punto ?? "Cafetería";
    counters[punto] += 1;
    return { ...item, punto, orden: counters[punto] };
  });
};

export const newCuadre = (
  punto: PuntoVenta,
  catalogo: CatalogoItem[],
  settings: Settings = DEFAULT_SETTINGS
): Cuadre => ({
  id: crypto.randomUUID(),
  puntoVenta: punto,
  fecha: new Date().toISOString(),
  diasTrabajados: [new Date().toISOString()],
  dependiente: "",
  // Snapshot del catálogo: cambios futuros NO afectan este cuadre
  productos: sortCatalogo(catalogo)
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
  salarioBase: settings.salarioBase[punto] ?? 1000,
  salarioModo: settings.salarioModo?.[punto] ?? "base",
  porcentajeVenta: settings.porcentajeVenta?.[punto] ?? 3,
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
  settings: Settings;

  setRole: (r: "admin" | "dependiente") => void;
  updateSettings: (patch: Partial<Settings>) => void;
  setSalarioBasePunto: (p: PuntoVenta, v: number) => void;
  setActivePunto: (p: PuntoVenta) => void;
  setLastStep: (p: PuntoVenta, step: number) => void;

  // Catálogo (master)
  addCatalogItem: (item: Omit<CatalogoItem, "id">) => void;
  updateCatalogItem: (id: string, patch: Partial<CatalogoItem>) => void;
  removeCatalogItem: (id: string) => void;
  importCatalog: (items: Omit<CatalogoItem, "id">[]) => void;
  importCatalogReplace: (items: Omit<CatalogoItem, "id">[], punto: PuntoVenta) => void;
  clearCatalog: (punto?: PuntoVenta) => void;
  moveCatalogItem: (id: string, dir: -1 | 1) => void;
  // Sincroniza precio/costo del cuadre activo al catálogo (busca por nombre+punto)
  syncProductoToCatalog: (productoId: string) => void;

  // Dependientes
  addDependiente: (nombre: string) => void;
  updateDependiente: (oldName: string, newName: string) => void;
  removeDependiente: (nombre: string) => void;

  // Cuadres
  startCuadre: (punto?: PuntoVenta) => void;
  updateCurrent: (patch: Partial<Cuadre>) => void;
  updateProducto: (id: string, patch: Partial<Producto>) => void;
  desbloquearProducto: (id: string, nota: string) => void;
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
  importarFinales: (cuadreId: string) => void;
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
      settings: DEFAULT_SETTINGS,

      setRole: (r) => set({ role: r }),
      updateSettings: (patch) =>
        set((s) => ({ settings: { ...s.settings, ...patch } })),
      setSalarioBasePunto: (p, v) =>
        set((s) => ({
          settings: {
            ...s.settings,
            salarioBase: { ...s.settings.salarioBase, [p]: v },
          },
        })),
      setActivePunto: (p) => set({ activePunto: p }),
      setLastStep: (p, step) =>
        set((s) => ({ lastStep: { ...s.lastStep, [p]: step } })),

      addCatalogItem: (item) =>
        set((s) => ({
          catalogo: normalizeCatalogoOrden([
            ...s.catalogo,
            {
              ...item,
              id: crypto.randomUUID(),
              orden:
                item.orden ??
                Math.max(
                  0,
                  ...s.catalogo
                    .filter((c) => (c.punto ?? "Cafetería") === (item.punto ?? "Cafetería"))
                    .map((c) => c.orden ?? 0)
                ) + 1,
            },
          ]),
        })),
      updateCatalogItem: (id, patch) =>
        set((s) => ({
          catalogo: normalizeCatalogoOrden(
            s.catalogo.map((c) => (c.id === id ? { ...c, ...patch } : c))
          ),
        })),
      removeCatalogItem: (id) =>
        set((s) => ({ catalogo: s.catalogo.filter((c) => c.id !== id) })),
      importCatalog: (items) =>
        set((s) => {
          const next = items.map((i, idx) => ({
            ...i,
            id: crypto.randomUUID(),
            orden:
              i.orden ??
              Math.max(
                0,
                ...s.catalogo
                  .filter((c) => (c.punto ?? "Cafetería") === (i.punto ?? "Cafetería"))
                  .map((c) => c.orden ?? 0)
              ) + idx + 1,
          }));
          return { catalogo: normalizeCatalogoOrden([...s.catalogo, ...next]) };
        }),
      importCatalogReplace: (items, punto) =>
        set((s) => ({
          // Conserva los productos de OTROS puntos y reemplaza por completo
          // los del punto indicado, respetando el orden del Excel.
          catalogo: normalizeCatalogoOrden([
            ...s.catalogo.filter((c) => (c.punto ?? "Cafetería") !== punto),
            ...items.map((i, idx) => ({ ...i, punto, id: crypto.randomUUID(), orden: i.orden ?? idx + 1 })),
          ]),
        })),
      clearCatalog: (punto) =>
        set((s) => ({
          catalogo: punto
            ? s.catalogo.filter((c) => (c.punto ?? "Cafetería") !== punto)
            : [],
        })),
      moveCatalogItem: (id, dir) =>
        set((s) => {
          const ordered = normalizeCatalogoOrden(s.catalogo);
          const item = ordered.find((c) => c.id === id);
          if (!item) return {};
          const punto = item.punto ?? "Cafetería";
          const same = ordered.filter((c) => (c.punto ?? "Cafetería") === punto);
          const pos = same.findIndex((c) => c.id === id);
          const target = pos + dir;
          if (target < 0 || target >= same.length) return {};
          const a = same[pos];
          const b = same[target];
          return {
            catalogo: normalizeCatalogoOrden(
              ordered.map((c) =>
                c.id === a.id
                  ? { ...c, orden: b.orden }
                  : c.id === b.id
                  ? { ...c, orden: a.orden }
                  : c
              )
            ),
          };
        }),
      syncProductoToCatalog: (productoId) =>
        set((s) => {
          const c = s.currents[s.activePunto];
          if (!c) return {};
          const p = c.productos.find((x) => x.id === productoId);
          if (!p) return {};
          const punto = c.puntoVenta;
          const target = s.catalogo.find(
            (ci) =>
              ci.nombre.trim().toLowerCase() === p.nombre.trim().toLowerCase() &&
              (ci.punto ?? "Cafetería") === punto
          );
          if (!target) return {};
          return {
            catalogo: s.catalogo.map((ci) =>
              ci.id === target.id
                ? { ...ci, precio: p.precio, costo: p.costo }
                : ci
            ),
          };
        }),

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
            currents: {
              ...s.currents,
              [p]: newCuadre(p, s.catalogo, s.settings),
            },
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
      desbloquearProducto: (id, nota) =>
        set((s) =>
          updateActive(s, (c) => ({
            ...c,
            productos: c.productos.map((p) =>
              p.id === id ? { ...p, bloqueado: false, notaDesbloqueo: nota } : p
            ),
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
        // Actualiza el catálogo con precios/costos finales del turno
        const punto = c.puntoVenta;
        const catalogo = [...s.catalogo];
        for (const p of c.productos) {
          const nombre = p.nombre.trim();
          if (!nombre) continue;
          const idx = catalogo.findIndex(
            (ci) =>
              ci.nombre.trim().toLowerCase() === nombre.toLowerCase() &&
              (ci.punto ?? "Cafetería") === punto
          );
          if (idx >= 0) {
            catalogo[idx] = { ...catalogo[idx], precio: p.precio, costo: p.costo };
          } else {
            catalogo.push({
              id: crypto.randomUUID(),
              nombre,
              precio: p.precio,
              costo: p.costo,
              punto,
            });
          }
        }
        set({
          history: [
            { ...c, finalizado: true, fecha: new Date().toISOString() },
            ...s.history,
          ],
          currents: { ...s.currents, [s.activePunto]: null },
          lastStep: { ...s.lastStep, [s.activePunto]: 1 },
          catalogo: normalizeCatalogoOrden(catalogo),
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
      importarFinales: (cuadreId) =>
        set((s) => {
          const src = s.history.find((h) => h.id === cuadreId);
          const c = s.currents[s.activePunto];
          if (!src || !c) return {};
          // Toma el ORDEN del cuadre fuente. Bloquea los productos cuyo final
          // del turno anterior fue > 0 (no se puede editar nombre ni inicio).
          // Productos sin existencia final quedan editables.
          const currentByName = new Map(
            c.productos.map((p) => [p.nombre.trim().toLowerCase(), p])
          );
          const usados = new Set<string>();
          const reordenados = src.productos.map((sp) => {
            const key = sp.nombre.trim().toLowerCase();
            const existing = currentByName.get(key);
            usados.add(key);
            const base = existing ?? {
              id: crypto.randomUUID(),
              nombre: sp.nombre,
              entradas: 0,
              traslados: 0,
              final: 0,
              precio: sp.precio,
              costo: sp.costo,
              inicio: 0,
            };
            return {
              ...base,
              nombre: sp.nombre,
              inicio: sp.final,
              bloqueado: sp.final > 0,
              notaDesbloqueo: undefined,
            };
          });
          const restantes = c.productos.filter(
            (p) => !usados.has(p.nombre.trim().toLowerCase())
          );
          const productos = [...reordenados, ...restantes];
          return {
            currents: { ...s.currents, [s.activePunto]: { ...c, productos } },
          };
        }),
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
  const modo: SalarioModo = c.salarioModo ?? "base";
  const pct = c.porcentajeVenta ?? 0;
  const salarioBasePeriodo = diasCount * c.salarioBase;
  const salarioPorPorcentaje = totalVenta * (pct / 100);
  const salarioBruto =
    modo === "porcentaje"
      ? salarioPorPorcentaje
      : modo === "mixto"
      ? Math.max(salarioBasePeriodo, salarioPorPorcentaje)
      : salarioBasePeriodo;
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
    salarioBasePeriodo,
    salarioPorPorcentaje,
    salarioModo: modo,
    porcentajeVenta: pct,
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
  return result;
};
