import * as XLSX from "xlsx";
import { Cuadre, PuntoVenta, GastoCategoria, Producto, Gasto } from "@/store/cuadreStore";

type Row = Record<string, any>;

const norm = (s: any) =>
  String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

const pick = (row: Row, keys: string[]): any => {
  const nk = Object.keys(row).reduce<Record<string, string>>((acc, k) => {
    acc[norm(k)] = k;
    return acc;
  }, {});
  for (const k of keys) {
    const real = nk[norm(k)];
    if (real !== undefined && row[real] !== undefined && row[real] !== null && row[real] !== "") {
      return row[real];
    }
  }
  return undefined;
};

const num = (v: any): number => {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return v;
  const s = String(v).replace(/[^0-9.,-]/g, "").replace(/,/g, ".");
  const n = Number(s);
  return isFinite(n) ? n : 0;
};

const parseDate = (v: any): string => {
  if (!v) return new Date().toISOString();
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "number") {
    const ms = Math.round((v - 25569) * 86400 * 1000);
    return new Date(ms).toISOString();
  }
  const d = new Date(String(v));
  return isFinite(d.getTime()) ? d.toISOString() : new Date().toISOString();
};

const parsePunto = (v: any): PuntoVenta =>
  norm(v).startsWith("mip") ? "Mipyme" : "Cafetería";

const emptyDen = () =>
  Object.fromEntries([1000, 500, 200, 100, 50, 20, 10, 5].map((d) => [String(d), 0]));

export type CuadresImportResult = {
  creados: number;
  errores: string[];
};

/**
 * Plantilla:
 *  Hoja "Cuadres": CuadreID | PuntoVenta | Fecha | Dependiente | SalarioBase
 *  Hoja "Productos": CuadreID | Producto | Inicio | Entradas | Traslados | Final | Precio | Costo
 *  Hoja "Gastos" (opcional): CuadreID | Categoria | Tipo | Recibe | Descripcion | Monto
 */
export async function importCuadresFromFile(file: File): Promise<{
  cuadres: Cuadre[];
  result: CuadresImportResult;
}> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array", cellDates: true });

  const sheetCuadres = wb.Sheets["Cuadres"] ?? wb.Sheets[wb.SheetNames[0]];
  const sheetProductos = wb.Sheets["Productos"];
  const sheetGastos = wb.Sheets["Gastos"];

  const errores: string[] = [];
  if (!sheetCuadres) throw new Error('Falta la hoja "Cuadres"');
  if (!sheetProductos) throw new Error('Falta la hoja "Productos"');

  const cuadresRows = XLSX.utils.sheet_to_json<Row>(sheetCuadres, { defval: "" });
  const productosRows = XLSX.utils.sheet_to_json<Row>(sheetProductos, { defval: "" });
  const gastosRows = sheetGastos ? XLSX.utils.sheet_to_json<Row>(sheetGastos, { defval: "" }) : [];

  const cuadres: Cuadre[] = [];
  const cuadreById = new Map<string, Cuadre>();

  for (const row of cuadresRows) {
    const key = String(pick(row, ["CuadreID", "ID", "Cuadre"]) ?? "").trim();
    if (!key) {
      errores.push("Fila sin CuadreID en 'Cuadres', omitida");
      continue;
    }
    const fecha = parseDate(pick(row, ["Fecha", "Date"]));
    const c: Cuadre = {
      id: crypto.randomUUID(),
      puntoVenta: parsePunto(pick(row, ["PuntoVenta", "Punto"])),
      fecha,
      diasTrabajados: [fecha],
      dependiente: String(pick(row, ["Dependiente", "Nombre"]) ?? "").trim(),
      productos: [],
      gastos: [],
      denominaciones: emptyDen(),
      efectivoDepositado: 0,
      salarioBase: num(pick(row, ["SalarioBase", "Salario"])) || 1000,
      salarioModo: "base",
      porcentajeVenta: 3,
      salarioDenominaciones: emptyDen(),
      finalizado: true,
    };
    cuadreById.set(key, c);
    cuadres.push(c);
  }

  for (const row of productosRows) {
    const key = String(pick(row, ["CuadreID", "ID", "Cuadre"]) ?? "").trim();
    const c = cuadreById.get(key);
    if (!c) {
      errores.push(`Producto sin CuadreID válido (${key})`);
      continue;
    }
    const p: Producto = {
      id: crypto.randomUUID(),
      nombre: String(pick(row, ["Producto", "Nombre"]) ?? "").trim(),
      inicio: num(pick(row, ["Inicio"])),
      entradas: num(pick(row, ["Entradas"])),
      traslados: num(pick(row, ["Traslados"])),
      final: num(pick(row, ["Final"])),
      precio: num(pick(row, ["Precio"])),
      costo: num(pick(row, ["Costo"])),
    };
    if (!p.nombre) continue;
    c.productos.push(p);
  }

  for (const row of gastosRows) {
    const key = String(pick(row, ["CuadreID", "ID", "Cuadre"]) ?? "").trim();
    const c = cuadreById.get(key);
    if (!c) continue;
    const g: Gasto = {
      id: crypto.randomUUID(),
      categoria: (String(pick(row, ["Categoria"]) ?? "Local").trim() as GastoCategoria) || "Local",
      tipo: (String(pick(row, ["Tipo"]) ?? "Efectivo").trim() as any) || "Efectivo",
      nombre: String(pick(row, ["Recibe", "Nombre"]) ?? "").trim(),
      descripcion: String(pick(row, ["Descripcion", "Detalle"]) ?? "").trim(),
      monto: num(pick(row, ["Monto"])),
    };
    if (!g.monto) continue;
    c.gastos.push(g);
  }

  return { cuadres, result: { creados: cuadres.length, errores } };
}

/** Genera y descarga una plantilla XLSX con las tres hojas y filas ejemplo. */
export function downloadPlantillaCuadres() {
  const wb = XLSX.utils.book_new();
  const cuadres = [
    { CuadreID: "C1", PuntoVenta: "Cafetería", Fecha: "2026-07-15", Dependiente: "Mairena", SalarioBase: 1000 },
  ];
  const productos = [
    { CuadreID: "C1", Producto: "Café", Inicio: 20, Entradas: 10, Traslados: 0, Final: 5, Precio: 100, Costo: 40 },
    { CuadreID: "C1", Producto: "Refresco", Inicio: 30, Entradas: 0, Traslados: 0, Final: 10, Precio: 80, Costo: 30 },
  ];
  const gastos = [
    { CuadreID: "C1", Categoria: "Local", Tipo: "Efectivo", Recibe: "Proveedor", Descripcion: "Agua", Monto: 150 },
  ];
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(cuadres), "Cuadres");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(productos), "Productos");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(gastos), "Gastos");
  XLSX.writeFile(wb, "plantilla-cuadres-alfarocafe.xlsx");
}
