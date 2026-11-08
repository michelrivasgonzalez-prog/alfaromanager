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
  categoria?: string;
  // Bloqueado por importación de finales del turno anterior.
  // Si está bloqueado, no se puede editar nombre ni inicio salvo
  // que el usuario lo desbloquee con una nota obligatoria.
  bloqueado?: boolean;
  // Nota obligatoria registrada al desbloquear el producto.
  notaDesbloqueo?: string;
  // Precios mixtos: parte de lo vendido a otro precio de venta/costo
  // (cambio de precio a mitad del turno o lote con costo diferente).
  tramos?: PrecioTramo[];
};

export type PrecioTramo = {
  id: string;
  cantidad: number;
  precio: number;
  costo: number;
  nota?: string;
};

export type CatalogoItem = {
  id: string;
  nombre: string;
  precio: number;
  costo: number;
  orden?: number;
  categoria?: string;
  punto?: "Cafetería" | "Mipyme";
};


export type GastoTipo = "Efectivo" | "Producto";

// "Compras" queda por compatibilidad con cuadres antiguos guardados en local;
// las nuevas UI usan "Salida de efectivo".
export type GastoCategoria =
  | "Local"
  | "Yanitza"
  | "Salida de efectivo"
  | "Compras"
  | "Cuentas por Cobrar"
  | "Transferencia";

export const catLabel = (c: GastoCategoria) =>
  c === "Compras" ? "Salida de efectivo" : c;

export type GastoItem = { productoId?: string; productoNombre: string; cantidad: number; precio: number };

export type Gasto = {
  id: string;
  categoria: GastoCategoria;
  nombre: string; // quién recibe
  tipo: GastoTipo;
  descripcion: string;
  // Para tipo Producto:
  productoId?: string;
  productoNombre?: string;
  cantidad?: number;
  precio?: number;
  // Canasta: varios productos en una sola operación
  items?: GastoItem[];
  // Para Transferencia:
  fecha?: string;          // ISO
  transaccion?: string;    // nº/ref
  importe?: number;        // monto base ingresado
  porcentaje?: number;     // % cargo aplicado
  montoRecibido?: number;  // importe + (importe * porcentaje/100)
  // Para Cuentas por Cobrar: cliente asignado (se usa al crear la deuda desde el historial)
  clienteId?: string;
  clienteNombre?: string;
  // Importe final
  monto: number;
  sinClasificar?: boolean;
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
export type SalarioProductoExcepcion = {
  id: string;
  productoNombre: string;
  tarifaPorUnidad: number; // Ej: 10 para 10 CUP por cada unidad vendida
};

/** Billetes en otra moneda convertidos a CUP. */
export type Divisa = {
  id: string;
  moneda: string;
  denominacion: number;
  cantidad: number;
  /** Cambio de 1 unidad de la moneda a CUP. */
  tasa: number;
};

export const totalDivisas = (divisas?: Divisa[]) =>
  (divisas ?? []).reduce(
    (s, d) => s + Number(d.denominacion || 0) * Number(d.cantidad || 0) * Number(d.tasa || 0),
    0
  );

export type Cuadre = {
  id: string;
  puntoVenta: PuntoVenta;
  fecha: string;
  diasTrabajados: string[];
  dependiente: string;
  productos: Producto[];
  gastos: Gasto[];
  denominaciones: Denominaciones;
  divisas?: Divisa[];
  efectivoDepositado: number;
  salarioBase: number;
  salarioModo: SalarioModo;
  porcentajeVenta: number;
  salarioDenominaciones: Denominaciones;
  finalizado: boolean;
  /** ID de la cuenta por cobrar creada por el faltante del dependiente. */
  deudaDependienteId?: string | null;
  /** Monto del salario usado para pagar deudas propias del dependiente. */
  descuentoDeudas?: number;
  /** ID del abono creado al descontar deudas del salario. */
  abonoDeudasId?: string | null;
  /** Recogidas de efectivo hechas durante el turno (antes del arqueo final). */
  recogidas?: Recogida[];
  /** Turno del que se importaron los finales como inicios. */
  importadoDe?: string;
precuadre?: {
    turnoId?: string;
    tipoRelevo?: "dependiente" | "admin";
    entrante?: string;
    firma?: string;
    firmadoEn?: string;
  };
};

export type Recogida = {
  id: string;
  fecha: string; // yyyy-MM-dd
  quien?: string;
  denominaciones: Denominaciones;
  monto: number;
};

export const totalRecogidas = (r?: Recogida[]) =>
  (r ?? []).reduce((s, x) => s + Number(x.monto || 0), 0);

export type Settings = {
  salarioBase: Record<PuntoVenta, number>;
  porcentajeTransferencia: number;
  salarioModo: Record<PuntoVenta, SalarioModo>;
  porcentajeVenta: Record<PuntoVenta, number>;
  salarioExcepcionesProductos?: SalarioProductoExcepcion[];
  /** Días marcados como "no trabajado" en ambos puntos (formato yyyy-MM-dd). */
  diasNoTrabajados?: string[];
  /** Días "no trabajado" solo para un punto de venta. */
  diasNoTrabajadosPunto?: Partial<Record<PuntoVenta, string[]>>;
  /** Categorías de producto en el orden en que deben mostrarse. */
  categorias?: string[];
  /** Reportes mensuales guardados (clave yyyy-MM). */
  reportesMensuales?: Record<string, any>;
  /** Punto de venta habitual de cada dependiente (por nombre). */
  dependientePunto?: Record<string, PuntoVenta>;
  /** Dependientes desactivados sin eliminar su historial. */
  dependientesInactivos?: string[];
  /** Existencia mínima por producto (clave "punto|nombre en minúsculas"). */
  stockMinimo?: Record<string, number>;
  ocultarAlmacen?: boolean;
  /** Dependientes desactivados sin eliminar su historial. */
  dependientesInactivos?: string[];
  /** Fotos de perfil de dependientes (por nombre en Base64). */
  dependienteFotos?: Record<string, string>;
  /** Existencia mínima por producto (clave "punto|nombre en minúsculas"). */
  stockMinimo?: Record<string, number>;

};

/** Punto habitual: el asignado o, si no hay, el más frecuente en su historial. */
export const puntoHabitual = (
  nombre: string,
  settings: Settings,
  history: { dependiente: string; puntoVenta: PuntoVenta }[]
): PuntoVenta | undefined => {
  const asignado = settings.dependientePunto?.[nombre];
  if (asignado) return asignado;
  const n: Record<string, number> = {};
  for (const h of history) if (h.dependiente === nombre) n[h.puntoVenta] = (n[h.puntoVenta] ?? 0) + 1;
  const best = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
  return best?.[0] as PuntoVenta | undefined;
};

const DEFAULT_SETTINGS: Settings = {
  salarioBase: { "Cafetería": 1000, "Mipyme": 1000 },
  porcentajeTransferencia: 10,
  salarioModo: { "Cafetería": "base", "Mipyme": "base" },
  porcentajeVenta: { "Cafetería": 3, "Mipyme": 3 },
  salarioExcepcionesProductos: [
    { id: "mayabe", productoNombre: "Cerveza Mayabe", tarifaPorUnidad: 10 },
  ],
  diasNoTrabajados: [],
  diasNoTrabajadosPunto: { "Cafetería": [], "Mipyme": [] },
    categorias: [],
  dependientesInactivos: [],
  dependienteFotos: {},
  ocultarAlmacen: false,
};

const DEFAULT_CATALOG: CatalogoItem[] = [];

export const DENOMINACIONES = [20000, 10000, 5000, 2000, 1000, 500, 200, 100, 50, 20, 10, 5];

export const emptyDen = (): Denominaciones =>
  Object.fromEntries(DENOMINACIONES.map((d) => [String(d), 0]));

const categoriasActuales = (): string[] => {
  try {
    return useCuadreStore.getState().settings.categorias ?? [];
  } catch {
    return [];
  }
};

/** Índice de categoría: las configuradas primero (en su orden), luego el resto y al final las vacías. */
const catIndex = (cat: string | undefined, cats: string[]) => {
  const c = (cat ?? "").trim();
  if (!c) return cats.length + 2;
  const i = cats.findIndex((x) => x.trim().toLowerCase() === c.toLowerCase());
  return i >= 0 ? i : cats.length + 1;
};

/** Orden: punto de venta → categoría (según Ajustes) → alfabético. */
export const sortCatalogo = (items: CatalogoItem[], categorias?: string[]) => {
  const cats = categorias ?? categoriasActuales();
  return [...items].sort((a, b) => {
    const pa = a.punto ?? "Cafetería";
    const pb = b.punto ?? "Cafetería";
    if (pa !== pb) return PUNTOS.indexOf(pa) - PUNTOS.indexOf(pb);
    const ca = catIndex(a.categoria, cats);
    const cb = catIndex(b.categoria, cats);
    if (ca !== cb) return ca - cb;
    const nameCat = (a.categoria ?? "").localeCompare(b.categoria ?? "", "es");
    if (ca > cats.length && nameCat !== 0) return nameCat;
    return a.nombre.localeCompare(b.nombre, "es");
  });
};

/** Ordena los productos de un cuadre igual que el catálogo (categoría → alfabético). */
export const sortProductos = <T extends { nombre: string; categoria?: string }>(
  productos: T[],
  categorias?: string[]
): T[] => {
  const cats = categorias ?? categoriasActuales();
  return [...productos].sort((a, b) => {
    const ca = catIndex(a.categoria, cats);
    const cb = catIndex(b.categoria, cats);
    if (ca !== cb) return ca - cb;
    const nameCat = (a.categoria ?? "").localeCompare(b.categoria ?? "", "es");
    if (ca > cats.length && nameCat !== 0) return nameCat;
    return a.nombre.localeCompare(b.nombre, "es");
  });
};

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
  diasTrabajados: [],
  dependiente: "",
  // Snapshot del catálogo: cambios futuros NO afectan este cuadre
  productos: sortCatalogo(catalogo, settings.categorias)
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
    categoria: c.categoria,
  })),
  gastos: [],
  denominaciones: emptyDen(),
  divisas: [],
  efectivoDepositado: 0,

  salarioBase: settings.salarioBase[punto] ?? 1000,
  salarioModo: settings.salarioModo?.[punto] ?? "base",
  porcentajeVenta: settings.porcentajeVenta?.[punto] ?? 3,
  salarioExcepcionesProductos: settings.salarioExcepcionesProductos ?? [
    { id: "mayabe", productoNombre: "Cerveza Mayabe", tarifaPorUnidad: 10 },
  ],
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
  settingsUpdatedAt: string;
  // Tombstones para propagar eliminaciones de forma segura entre dispositivos.
  // Clave -> fecha ISO de la eliminación.
  tombstones: {
    catalogo: Record<string, string>;     // por id
    dependientes: Record<string, string>; // por nombre
    cuadres: Record<string, string>;      // por id
  };
  /** IDs de cuadres guardados localmente que aún no se han subido a la nube. */
  pendingCuadres: string[];
  markPendingCuadre: (id: string) => void;
  clearPendingCuadre: (id: string) => void;

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
  cargarPrecuadre: (data: Partial<Cuadre>) => void;
  updateProducto: (id: string, patch: Partial<Producto>) => void;
  desbloquearProducto: (id: string, nota: string) => void;
  addProducto: (p: Omit<Producto, "id">) => void;
  removeProducto: (id: string) => void;
  addGasto: (g: Omit<Gasto, "id">) => void;
  updateGasto: (id: string, patch: Partial<Gasto>) => void;
  removeGasto: (id: string) => void;
  setDenominacion: (billete: string, cantidad: number) => void;
  setSalarioDen: (billete: string, cantidad: number) => void;
  addDivisa: (d: Omit<Divisa, "id">) => void;
  removeDivisa: (id: string) => void;
  addRecogida: (r: Omit<Recogida, "id">) => void;
  removeRecogida: (id: string) => void;

  finalizar: () => void;
  cancelar: (punto?: PuntoVenta) => void;
  deleteHistory: (id: string) => void;
  importarFinales: (cuadreId: string) => void;
  editCuadre: (cuadreId: string) => void;
  importCuadresBulk: (cuadres: Cuadre[]) => void;
  // Tombstones (uso interno de sincronización)
  addTombstone: (kind: "catalogo" | "dependientes" | "cuadres", key: string) => void;
  clearTombstone: (kind: "catalogo" | "dependientes" | "cuadres", key: string) => void;
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
      settingsUpdatedAt: new Date(0).toISOString(),
      tombstones: { catalogo: {}, dependientes: {}, cuadres: {} },
      pendingCuadres: [],
      markPendingCuadre: (id) =>
        set((s) => ({
          pendingCuadres: (s.pendingCuadres ?? []).includes(id)
            ? s.pendingCuadres
            : [...(s.pendingCuadres ?? []), id],
        })),
      clearPendingCuadre: (id) =>
        set((s) => ({ pendingCuadres: (s.pendingCuadres ?? []).filter((x) => x !== id) })),

      setRole: (r) => set({ role: r }),
      updateSettings: (patch) =>
        set((s) => ({
          settings: { ...s.settings, ...patch },
          settingsUpdatedAt: new Date().toISOString(),
        })),
      setSalarioBasePunto: (p, v) =>
        set((s) => ({
          settings: {
            ...s.settings,
            salarioBase: { ...s.settings.salarioBase, [p]: v },
          },
          settingsUpdatedAt: new Date().toISOString(),
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
        set((s) => ({
          catalogo: s.catalogo.filter((c) => c.id !== id),
        })),
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
        set((s) => {
          return {
            catalogo: normalizeCatalogoOrden([
              ...s.catalogo.filter((c) => (c.punto ?? "Cafetería") !== punto),
              ...items.map((i, idx) => ({
                ...i,
                punto,
                id: crypto.randomUUID(),
                orden: i.orden ?? idx + 1,
              })),
            ]),
          };
        }),
      clearCatalog: (punto) =>
        set((s) => {
          return {
            catalogo: punto
              ? s.catalogo.filter((c) => (c.punto ?? "Cafetería") !== punto)
              : [],
          };
        }),
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
        set((s) => {
          const inactivos = s.settings.dependientesInactivos ?? [];
          const dependientesInactivos = inactivos.map((d) =>
            d === oldName ? newName : d
          );

          const dependientePunto = { ...(s.settings.dependientePunto ?? {}) };

          if (dependientePunto[oldName]) {
            dependientePunto[newName] = dependientePunto[oldName];
            delete dependientePunto[oldName];
          }

          return {
            dependientes: s.dependientes.map((d) =>
              d === oldName ? newName : d
            ),
            settings: {
              ...s.settings,
              dependientesInactivos,
              dependientePunto,
            },
            settingsUpdatedAt: new Date().toISOString(),
          };
        }),
      removeDependiente: (nombre) =>
        set((s) => ({
          dependientes: s.dependientes.filter((d) => d !== nombre),
        })),

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
      cargarPrecuadre: (data) =>
        set((s) => {
          const punto = data.puntoVenta ?? s.activePunto;
          const base = s.currents[punto] ?? newCuadre(punto, s.catalogo, s.settings);

          // Vincula los productos con su precio de costo del catálogo maestro
          const productosConCosto = (data.productos ?? base.productos).map((p) => {
            const catItem = s.catalogo.find(
              (c) =>
                c.nombre.trim().toLowerCase() === p.nombre.trim().toLowerCase() &&
                (!c.punto || c.punto === punto)
            );
            return {
              ...p,
              costo: p.costo || catItem?.costo || 0,
            };
          });

          return {
            activePunto: punto,
            currents: {
              ...s.currents,
              [punto]: {
                ...base,
                ...data,
                productos: productosConCosto,
                puntoVenta: punto,
              },
            },
            lastStep: { ...s.lastStep, [punto]: 1 },
          };
        }),
      updateProducto: (id, patch) =>
        set((s) =>
          updateActive(s, (c) => {
            const productos = c.productos.map((p) =>
              p.id === id ? { ...p, ...patch } : p
            );
            // Reordenar solo cuando cambia el nombre o la categoría, para no
            // mover las filas mientras se escriben cantidades.
            const reordenar = "nombre" in patch || "categoria" in patch;
            return {
              ...c,
              productos: reordenar
                ? sortProductos(productos, s.settings.categorias)
                : productos,
            };
          })
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
            productos: sortProductos(
              [...c.productos, { ...p, id: crypto.randomUUID() }],
              s.settings.categorias
            ),
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
      addDivisa: (d) =>
        set((s) =>
          updateActive(s, (c) => ({
            ...c,
            divisas: [...(c.divisas ?? []), { ...d, id: crypto.randomUUID() }],
          }))
        ),
      removeDivisa: (id) =>
        set((s) =>
          updateActive(s, (c) => ({
            ...c,
            divisas: (c.divisas ?? []).filter((d) => d.id !== id),
          }))
        ),
      addRecogida: (r) =>
        set((s) =>
          updateActive(s, (c) => ({
            ...c,
            recogidas: [...(c.recogidas ?? []), { ...r, id: crypto.randomUUID() }],
          }))
        ),
      removeRecogida: (id) =>
        set((s) =>
          updateActive(s, (c) => ({
            ...c,
            recogidas: (c.recogidas ?? []).filter((r) => r.id !== id),
          }))
        ),
      finalizar: () => {
        const s = get();
        const c = s.currents[s.activePunto];
        if (!c) return;
        // El catálogo del punto se REEMPLAZA por los productos del cuadre:
        // así se corrigen nombres cambiados y no quedan duplicados.
        // Si un producto quedó en 0 (se terminó), se limpia precio y costo
        // para no arrastrar valores anteriores.
        const punto = c.puntoVenta;
        const otros = s.catalogo.filter((ci) => (ci.punto ?? "Cafetería") !== punto);
        const previos = s.catalogo.filter((ci) => (ci.punto ?? "Cafetería") === punto);
        const delPunto: CatalogoItem[] = [];
        const vistos = new Set<string>();
        for (const p of c.productos) {
          const nombre = p.nombre.trim();
          if (!nombre) continue;
          const key = nombre.toLowerCase();
          if (vistos.has(key)) continue;
          vistos.add(key);
          const prev = previos.find((ci) => ci.nombre.trim().toLowerCase() === key);
          const agotado = Number(p.final) === 0;
          delPunto.push({
            id: prev?.id ?? crypto.randomUUID(),
            nombre,
            precio: agotado ? 0 : p.precio,
            costo: agotado ? 0 : p.costo,
            categoria: p.categoria ?? prev?.categoria,
            punto,
          });
        }
        const catalogo = [...otros, ...delPunto];

                set({
          // Se elimina cualquier versión previa con el mismo id (p. ej. al
          // editar un cuadre) para que nunca se duplique en el historial.
          history: [
            { ...c, finalizado: true, fecha: c.fecha || new Date().toISOString() },
            ...s.history.filter((h) => h.id !== c.id),
          ].sort((a, b) => {
            const fA = a.diasTrabajados?.[a.diasTrabajados.length - 1] ?? a.fecha;
            const fB = b.diasTrabajados?.[b.diasTrabajados.length - 1] ?? b.fecha;
            return new Date(fB).getTime() - new Date(fA).getTime();
          }),
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
        set((s) => ({
          history: s.history.filter((c) => c.id !== id),
          pendingCuadres: (s.pendingCuadres ?? []).filter((x) => x !== id),
        })),
      addTombstone: (kind, key) =>
        set((s) => ({
          tombstones: {
            ...s.tombstones,
            [kind]: { ...s.tombstones[kind], [key]: new Date().toISOString() },
          },
        })),
      clearTombstone: (kind, key) =>
        set((s) => {
          const next = { ...s.tombstones[kind] };
          delete next[key];
          return { tombstones: { ...s.tombstones, [kind]: next } };
        }),
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
          const productos = sortProductos(
            [...reordenados, ...restantes],
            s.settings.categorias
          );
          return {
            currents: {
              ...s.currents,
              [s.activePunto]: { ...c, productos, importadoDe: cuadreId },
            },
          };
        }),
      editCuadre: (cuadreId) =>
        set((s) => {
          const src = s.history.find((h) => h.id === cuadreId);
          if (!src) return {};
          const p = src.puntoVenta;
          return {
            activePunto: p,
            currents: { ...s.currents, [p]: { ...src, finalizado: false } },
            history: s.history.filter((h) => h.id !== cuadreId),
            lastStep: { ...s.lastStep, [p]: 1 },
          };
        }),
      importCuadresBulk: (cuadres) =>
        set((s) => ({
          history: [...cuadres.map((c) => ({ ...c, finalizado: true })), ...s.history],
        })),
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
  // Precios mixtos: unidades vendidas a otros precios; el resto va al precio base.
  const tramos = (p.tramos ?? []).filter((t) => Number(t.cantidad) > 0);
  const cantTramos = tramos.reduce((s, t) => s + Number(t.cantidad), 0);
  const resto = venta - cantTramos;
  const importe =
    resto * p.precio + tramos.reduce((s, t) => s + Number(t.cantidad) * Number(t.precio), 0);
  const costoTotal =
    resto * p.costo + tramos.reduce((s, t) => s + Number(t.cantidad) * Number(t.costo), 0);
  const ganancia = importe - costoTotal;
  return { total, venta, importe, costoTotal, ganancia, resto, mixto: tramos.length > 0 };
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

  const efectivoDivisas = totalDivisas(c.divisas);
  const efectivoCup = Object.entries(c.denominaciones).reduce(
    (s, [b, n]) => s + Number(b) * n,
    0
  );
  const efectivoCajaFinal = efectivoCup + efectivoDivisas;
  const efectivoRecogido = totalRecogidas(c.recogidas);
  // Total entregado = recogidas parciales + arqueo final en caja.
  const efectivoEnCaja = efectivoCajaFinal + efectivoRecogido;

  const efectivoADepositar = totalVenta - totalGastos;
  // Diferencia simple: en caja - a depositar  (positivo = sobrante / propina, negativo = faltante)
  const diferencia = efectivoEnCaja - efectivoADepositar;

  const diasCount = c.diasTrabajados.length;
  const modo: SalarioModo = c.salarioModo ?? "base";
  const pct = c.porcentajeVenta ?? 0;
  const salarioBasePeriodo = diasCount * c.salarioBase;

// --- CÁLCULO CON PRODUCTOS EXCLUIDOS Y TARIFA FIJA ---
const excepciones = c.salarioExcepcionesProductos ?? [];
let comisionFijaTotal = 0;
let ventaExcluidaTotal = 0;
const desgloseExcepciones: { nombre: string; unidades: number; tarifa: number; total: number }[] = [];

if (excepciones.length > 0) {
  for (const exc of excepciones) {
    const prodMatch = productos.find(
      (p) => p.nombre.trim().toLowerCase() === exc.productoNombre.trim().toLowerCase()
    );
    if (prodMatch) {
      const unidadesVendidas = Math.max(0, prodMatch.venta);
      const subtotalFijo = unidadesVendidas * Number(exc.tarifaPorUnidad || 0);
      comisionFijaTotal += subtotalFijo;
      ventaExcluidaTotal += prodMatch.importe;
      desgloseExcepciones.push({
        nombre: prodMatch.nombre,
        unidades: unidadesVendidas,
        tarifa: exc.tarifaPorUnidad,
        total: subtotalFijo,
      });
    }
  }
}

const ventaGeneral = Math.max(0, totalVenta - ventaExcluidaTotal);
const salarioPorPorcentaje = (ventaGeneral * (pct / 100)) + comisionFijaTotal;
// -----------------------------------------------------

  const salarioBruto =
    modo === "porcentaje"
      ? salarioPorPorcentaje
      : modo === "mixto"
      ? Math.max(salarioBasePeriodo, salarioPorPorcentaje)
      : salarioBasePeriodo;
  const faltanteBruto = diferencia < 0 ? Math.abs(diferencia) : 0;
  const propina = diferencia > 0 ? diferencia : 0;
  // El faltante primero se descuenta del salario. Si aún queda faltante
  // por cubrir después de agotar el salario, ESE excedente es deuda real
  // del dependiente. Si el salario cubre el faltante, no hay deuda.
  const descuentoFalta = Math.min(faltanteBruto, salarioBruto);
  const deudaDependiente = Math.max(0, faltanteBruto - salarioBruto);
  const salarioAntesDeudas = salarioBruto + propina - descuentoFalta;
  // Deudas propias del dependiente pagadas con su salario.
  const descuentoDeudas = Math.min(
    Math.max(0, c.descuentoDeudas ?? 0),
    Math.max(0, salarioAntesDeudas)
  );
  const salarioReal = salarioAntesDeudas - descuentoDeudas;

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
    efectivoCajaFinal,
    efectivoRecogido,
    efectivoCup,
    efectivoDivisas,

    efectivoADepositar,
    diferencia,
    diasCount,
    salarioBruto,
    salarioBasePeriodo,
    salarioPorPorcentaje,
    salarioModo: modo,
    porcentajeVenta: pct,
    ventaGeneral,
    comisionFijaTotal,
    desgloseExcepciones,
    salarioReal,
    salarioAntesDeudas,
    descuentoDeudas,
    descuentoFalta,
    deudaDependiente,
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
