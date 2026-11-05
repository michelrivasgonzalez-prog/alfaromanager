import type { CatalogoItem, Cuadre, Producto } from "@/store/cuadreStore";
import { sortProductos } from "@/store/cuadreStore";

/** Nombres antiguos → nombre definitivo. */
export const RENOMBRES: Record<string, string> = {
  "cerveza mayabe 700": "Cerveza Mayabe",
  "cerveza bucanero 700": "Cerveza Bucanero",
  "cigarro englishman m-menta": "Cigarro Englishman M-Menta Gordo",
  "cigarro englishman gordo": "Cigarro Englishman M-Menta Gordo",
  "ron poncho": "Ron Rancho",
  "porquecito invite": "Ponqué Invite",
};

/** Productos que siempre van en Confituras. */
export const CONFITURAS = [
  "Cake Joy",
  "Galletas Mantequilla",
  "Galletas Saltiblocks",
  "Ponqué Invite",
  "Pringles Marwa 100g",
];

const key = (s: string) => s.trim().toLowerCase();
export const nombreCanonico = (n: string) => RENOMBRES[key(n)] ?? n.trim();
const esConfitura = (n: string) => CONFITURAS.some((c) => key(c) === key(n));

const vendido = (p: Producto) =>
  Number(p.inicio || 0) + Number(p.entradas || 0) - Number(p.traslados || 0) - Number(p.final || 0);

/**
 * Unifica nombres, suma productos repetidos, asigna categoría desde el catálogo
 * y ordena por categoría. Devuelve null si el cuadre no cambia.
 */
export function unificarCuadre(
  c: Cuadre,
  catalogo: CatalogoItem[],
  categorias: string[]
): Cuadre | null {
  const catDe = (n: string) => {
    if (esConfitura(n)) return "Confituras";
    const it = catalogo.find(
      (x) => key(x.nombre) === key(n) && (x.punto ?? "Cafetería") === c.puntoVenta
    );
    return it?.categoria;
  };
  const porNombre = new Map<string, Producto>();
  const lista: Producto[] = [];
  for (const p of c.productos) {
    const nombre = nombreCanonico(p.nombre);
    const ya = porNombre.get(key(nombre));
    if (!ya) {
      const np: Producto = { ...p, nombre, categoria: catDe(nombre) ?? p.categoria };
      porNombre.set(key(nombre), np);
      lista.push(np);
      continue;
    }
    // Suma cantidades. Si el precio difiere, lo vendido de este va como tramo.
    const tramos = [...(ya.tramos ?? []), ...(p.tramos ?? [])];
    const v = vendido(p) - (p.tramos ?? []).reduce((s, t) => s + Number(t.cantidad || 0), 0);
    const mismoPrecio = Number(p.precio) === Number(ya.precio) && Number(p.costo) === Number(ya.costo);
    if (!ya.precio && p.precio) {
      ya.precio = p.precio;
      ya.costo = p.costo;
    } else if (!mismoPrecio && p.precio && v > 0) {
      tramos.push({ id: crypto.randomUUID(), cantidad: v, precio: p.precio, costo: p.costo, nota: `Antes: ${p.nombre}` });
    }
    ya.inicio = Number(ya.inicio || 0) + Number(p.inicio || 0);
    ya.entradas = Number(ya.entradas || 0) + Number(p.entradas || 0);
    ya.traslados = Number(ya.traslados || 0) + Number(p.traslados || 0);
    ya.final = Number(ya.final || 0) + Number(p.final || 0);
    if (tramos.length) ya.tramos = tramos;
  }
  const productos = sortProductos(lista, categorias);
  const next = { ...c, productos };
  return JSON.stringify(next.productos) === JSON.stringify(c.productos) ? null : next;
}

/** Unifica el catálogo: renombra, quita duplicados por punto y fija Confituras. */
export function unificarCatalogo(items: CatalogoItem[]): {
  catalogo: CatalogoItem[];
  cambiado: boolean;
} {
  let cambiado = false;
  const vistos = new Map<string, CatalogoItem>();
  const out: CatalogoItem[] = [];
  // Primero los que ya tienen el nombre definitivo, para conservarlos.
  const ordenados = [...items].sort(
    (a, b) => Number(!!RENOMBRES[key(a.nombre)]) - Number(!!RENOMBRES[key(b.nombre)])
  );
  for (const it of ordenados) {
    const nombre = nombreCanonico(it.nombre);
    const k = `${it.punto ?? "Cafetería"}|${key(nombre)}`;
    const ya = vistos.get(k);
    if (ya) {
      cambiado = true;
      if (!ya.precio && it.precio) {
        ya.precio = it.precio;
        ya.costo = it.costo;
      }
      continue;
    }
    const categoria = esConfitura(nombre) ? "Confituras" : it.categoria;
    if (nombre !== it.nombre || categoria !== it.categoria) cambiado = true;
    const n = { ...it, nombre, categoria };
    vistos.set(k, n);
    out.push(n);
  }
  return { catalogo: out, cambiado };
}
