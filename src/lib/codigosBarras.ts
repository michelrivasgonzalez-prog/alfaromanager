import type { CatalogoItem, PuntoVenta } from "@/store/cuadreStore";

/** Un GTIN siempre se conserva como texto (puede comenzar por cero). */
export const limpiarCodigoBarras = (valor: string | null | undefined) =>
  String(valor ?? "").replace(/[\s-]/g, "").trim();

/** Clave canónica GTIN-14 para comparar UPC-A y EAN-13 con cero inicial. */
export const claveGTIN = (valor: string | null | undefined) =>
  limpiarCodigoBarras(valor).padStart(14, "0");

export function esCodigoBarrasValido(valor: string): boolean {
  const codigo = limpiarCodigoBarras(valor);
  if (!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(codigo)) return false;
  const cifras = [...codigo].map(Number);
  const control = cifras.pop()!;
  const suma = cifras.reverse().reduce(
    (total, cifra, i) => total + cifra * (i % 2 === 0 ? 3 : 1),
    0
  );
  return (10 - (suma % 10)) % 10 === control;
}

export const normalizarNombreProducto = (valor: string) =>
  valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es")
    .replace(/(\d)\s+(?=(?:ml|g|kg|lt|l)\b)/g, "$1")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

export function buscarDuplicadoCatalogo(
  catalogo: CatalogoItem[],
  punto: PuntoVenta,
  datos: { nombre?: string; codigoBarras?: string },
  excluirId?: string
): CatalogoItem | undefined {
  const codigo = limpiarCodigoBarras(datos.codigoBarras);
  const nombre = normalizarNombreProducto(datos.nombre ?? "");
  return catalogo.find((p) =>
    p.id !== excluirId &&
    (p.punto ?? "Cafetería") === punto &&
    (
      (codigo.length > 0 && claveGTIN(p.codigoBarras) === claveGTIN(codigo)) ||
      (nombre.length > 0 && normalizarNombreProducto(p.nombre) === nombre)
    )
  );
}

/** Lookup por GTIN dentro del punto actual; mismo código en otro punto está permitido. */
export function buscarPorCodigo(
  catalogo: CatalogoItem[],
  punto: PuntoVenta,
  codigo: string
): CatalogoItem | undefined {
  const exacto = limpiarCodigoBarras(codigo);
  return catalogo.find((p) =>
    (p.punto ?? "Cafetería") === punto &&
    !!p.codigoBarras &&
    claveGTIN(p.codigoBarras) === claveGTIN(exacto)
  );
}
