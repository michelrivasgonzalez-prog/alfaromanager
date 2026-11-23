import type { CatalogoItem, PuntoVenta, CodigoBarraAdicional } from "@/store/cuadreStore";

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

/** Incluye el código principal y todos los adicionales, sin duplicados. */
export function codigosDeProducto(
  producto: Pick<CatalogoItem, "codigoBarras" | "codigosAdicionales">
): string[] {
  const vistos = new Set<string>();
  const resultado: string[] = [];
  for (const raw of [
    producto.codigoBarras,
    ...(producto.codigosAdicionales ?? []).map((x) => x.codigo),
  ]) {
    const codigo = limpiarCodigoBarras(raw);
    if (!codigo) continue;
    const key = claveGTIN(codigo);
    if (vistos.has(key)) continue;
    vistos.add(key);
    resultado.push(codigo);
  }
  return resultado;
}

/** Confirma que dos variantes no puedan ocupar el mismo código. */
export function codigosAdicionalesValidos(
  principal: string | undefined,
  adicionales: CodigoBarraAdicional[]
): boolean {
  const vistos = new Set<string>();
  for (const codigo of [principal, ...adicionales.map((x) => x.codigo)]) {
    const limpio = limpiarCodigoBarras(codigo);
    if (!limpio) continue;
    if (!esCodigoBarrasValido(limpio)) return false;
    const key = claveGTIN(limpio);
    if (vistos.has(key)) return false;
    vistos.add(key);
  }
  return true;
}

export function buscarDuplicadoCatalogo(
  catalogo: CatalogoItem[],
  punto: PuntoVenta,
  datos: { nombre?: string; codigoBarras?: string; codigosAdicionales?: CodigoBarraAdicional[] },
  excluirId?: string
): CatalogoItem | undefined {
  const candidatos = new Set(
    codigosDeProducto(datos).map(claveGTIN)
  );
  const nombre = normalizarNombreProducto(datos.nombre ?? "");
  return catalogo.find((p) =>
    p.id !== excluirId &&
    (p.punto ?? "Cafetería") === punto &&
    (
      ([...candidatos].some((key) =>
        codigosDeProducto(p).some((codigo) => claveGTIN(codigo) === key))) ||
      (nombre.length > 0 && normalizarNombreProducto(p.nombre) === nombre)
    )
  );
}

/** Coincidencia por cualquiera de los códigos asociados al mismo producto. */
export function buscarPorCodigo(
  catalogo: CatalogoItem[],
  punto: PuntoVenta,
  codigo: string
): CatalogoItem | undefined {
  const exacto = limpiarCodigoBarras(codigo);
  if (!exacto) return undefined;
  return catalogo.find((p) =>
    (p.punto ?? "Cafetería") === punto &&
    codigosDeProducto(p).some((x) => claveGTIN(x) === claveGTIN(exacto))
  );
}
