import { format } from "date-fns";
import { es } from "date-fns/locale";

/**
 * Formatea una lista de días trabajados de forma legible:
 *   - "05, 06 y 07 de julio de 2026"
 *   - "31 de julio, 01 y 02 de agosto de 2026"
 */
export function formatDiasTrabajados(dias: string[] | undefined | null): string {
  if (!dias || dias.length === 0) return "";
  const dates = [...dias]
    .map((d) => new Date(d))
    .filter((d) => !isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());
  if (dates.length === 0) return "";

  const groups: { y: number; m: number; days: number[] }[] = [];
  for (const d of dates) {
    const y = d.getFullYear();
    const m = d.getMonth();
    const last = groups[groups.length - 1];
    if (last && last.y === y && last.m === m) last.days.push(d.getDate());
    else groups.push({ y, m, days: [d.getDate()] });
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const joinDays = (arr: string[]) =>
    arr.length <= 1
      ? arr[0] ?? ""
      : arr.slice(0, -1).join(", ") + " y " + arr[arr.length - 1];

  if (groups.length === 1) {
    const g = groups[0];
    const mesAnio = format(new Date(g.y, g.m, 1), "MMMM 'de' yyyy", { locale: es });
    return `${joinDays(g.days.map(pad))} de ${mesAnio}`;
  }

  // Multi-mes: el último grupo lleva el año.
  const parts = groups.map((g, i) => {
    const ds = joinDays(g.days.map(pad));
    if (i === groups.length - 1) {
      const mesAnio = format(new Date(g.y, g.m, 1), "MMMM 'de' yyyy", { locale: es });
      return `${ds} de ${mesAnio}`;
    }
    const mes = format(new Date(g.y, g.m, 1), "MMMM", { locale: es });
    return `${ds} de ${mes}`;
  });
  return parts.join(", ");
}

/**
 * Detalle legible de un gasto para listados / PDF / mensajes de WhatsApp.
 * Formato objetivo: "Galletas Jolly 2 × 200 (Yoya)"
 */
export function formatGastoDetalle(g: {
  tipo: string;
  productoNombre?: string;
  cantidad?: number;
  precio?: number;
  descripcion?: string;
  nombre?: string;
  items?: { productoNombre: string; cantidad: number; precio: number }[];
}): string {
  if (g.tipo === "Producto" && g.items && g.items.length > 1) {
    const base = g.items
      .map((i) => `${i.productoNombre} ${i.cantidad} × ${Math.round(i.precio * 100) / 100}`)
      .join(" + ");
    return base + (g.descripcion?.trim() ? ` (${g.descripcion.trim()})` : "");
  }
  if (g.tipo === "Producto") {
    const nombre = g.productoNombre ?? "Producto";
    const base = `${nombre} ${g.cantidad ?? 1} × ${Math.round((g.precio ?? 0) * 100) / 100}`;
    const extra =
      g.descripcion && g.descripcion.trim() && g.descripcion.trim().toLowerCase() !== nombre.trim().toLowerCase()
        ? ` (${g.descripcion.trim()})`
        : "";
    return base + extra;
  }
  // Solo mostramos la descripción cuando existe: el nombre ya se muestra
  // en su propia columna y repetirlo duplica la información.
  return (g.descripcion ?? "").trim() || "—";
}

/** Detalle del gasto como líneas verticales: un producto por línea. */
export function gastoLineas(g: Parameters<typeof formatGastoDetalle>[0]): string[] {
  if (g.tipo === "Producto" && g.items && g.items.length > 1) {
    const lineas = g.items.map(
      (i) =>
        `${i.productoNombre} ${i.cantidad} × ${Math.round(i.precio * 100) / 100} = ${Math.round(i.cantidad * i.precio * 100) / 100}`
    );
    if (g.descripcion?.trim()) lineas.push(`(${g.descripcion.trim()})`);
    return lineas;
  }
  return [formatGastoDetalle(g)];
}

/** Iniciales para avatar tipo Google (2 letras máx.) */
export function iniciales(nombre: string): string {
  const parts = (nombre || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

/** Color determinista para el avatar según el nombre. */
export function colorAvatar(nombre: string): string {
  const paleta = [
    "#EF4444", "#F59E0B", "#10B981", "#3B82F6",
    "#8B5CF6", "#EC4899", "#14B8A6", "#F97316",
  ];
  let h = 0;
  for (let i = 0; i < nombre.length; i++) h = (h * 31 + nombre.charCodeAt(i)) >>> 0;
  return paleta[h % paleta.length];
}

const ORDEN_CATEGORIAS = ["Local", "Yanitza", "Salida de efectivo", "Compras", "Cuentas por Cobrar", "Transferencia"];

/** Ordena los gastos por categoría y, dentro de cada una, por quién recibe. */
export function ordenarGastos<T extends { categoria: string; nombre?: string }>(gastos: T[]): T[] {
  const idx = (c: string) => {
    const i = ORDEN_CATEGORIAS.indexOf(c);
    return i < 0 ? ORDEN_CATEGORIAS.length : i;
  };
  return [...gastos].sort(
    (a, b) => idx(a.categoria) - idx(b.categoria) || (a.nombre ?? "").localeCompare(b.nombre ?? "")
  );
}
