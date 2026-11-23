import { Fragment, useMemo, useRef, useState } from "react";
import { useCuadreStore, PUNTOS, PuntoVenta, type CatalogoItem } from "@/store/cuadreStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/NumberInput";
import {
  Plus,
  Trash2,
  Lock,
  Package,
  Upload,
  Download,
  Coffee,
  Store,
  ScanBarcode,
  Pencil,
  History,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { pushCatalogItem, deleteCatalogItem } from "@/lib/sync";
import { KardexDialog } from "@/components/KardexDialog";
import BarcodeScanner from "@/components/BarcodeScanner";
import EditarProductoDialog, { type EdicionCatalogo } from "@/components/catalogo/EditarProductoDialog";
import CodigosProductoDialog from "@/components/catalogo/CodigosProductoDialog";
import ProductoTarjeta from "@/components/catalogo/ProductoTarjeta";
import { subirFotoProducto, borrarFotoProducto } from "@/lib/fotoCatalogo";
import { buscarDuplicadoCatalogo, buscarPorCodigo, codigosAdicionalesValidos, esCodigoBarrasValido, limpiarCodigoBarras, normalizarNombreProducto } from "@/lib/codigosBarras";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";


export default function Productos() {
  const {
    catalogo,
    addCatalogItem,
    updateCatalogItem,
    removeCatalogItem,
    clearCatalog,
    role,
  } = useCuadreStore();
  const [punto, setPunto] = useState<PuntoVenta>("Cafetería");
  const categorias = useCuadreStore((s) => s.settings.categorias ?? []);
  const fileRef = useRef<HTMLInputElement>(null);
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [herramientasAbiertas, setHerramientasAbiertas] = useState(false);
  const [kardex, setKardex] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState({ nombre: "", precio: 0, costo: 0, categoria: "", codigoBarras: "" });
  const [scannerDestino, setScannerDestino] = useState<string | null>(null);
  const [aliasDraft, setAliasDraft] = useState<{ productoId: string; indice?: number; codigo: string; etiqueta: string } | null>(null);
  const [codigoPendiente, setCodigoPendiente] = useState<string | null>(null);
  const [filtroAsociar, setFiltroAsociar] = useState("");
  const [etiquetaAsociar, setEtiquetaAsociar] = useState("");
  const [editandoProductoId, setEditandoProductoId] = useState<string | null>(null);
  const [codigosProductoId, setCodigosProductoId] = useState<string | null>(null);
  const history = useCuadreStore((s) => s.history);



  const ultimo = useMemo(() => [...history]
    .filter((c) => c.puntoVenta === punto && c.finalizado)
    .sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())[0], [history, punto]);

  const existencias = useMemo(() => {
    const porNombre = new Map<string, number>();
    const porCodigo = new Map<string, number>();
    for (const p of ultimo?.productos ?? []) {
      porNombre.set(normalizarNombreProducto(p.nombre), Number(p.final) || 0);
      if (p.codigoBarras) porCodigo.set(p.codigoBarras, Number(p.final) || 0);
    }
    const mapa = new Map<string, number>();
    for (const item of catalogo) {
      if ((item.punto ?? "Cafetería") !== punto) continue;
      const cantidad = item.codigoBarras && porCodigo.has(item.codigoBarras)
        ? porCodigo.get(item.codigoBarras)!
        : porNombre.get(normalizarNombreProducto(item.nombre)) ?? 0;
      mapa.set(item.id, cantidad);
    }
    return mapa;
  }, [catalogo, ultimo, punto]);

  // Orden solo visual:
  // 1. Con existencia del último cuadre, agrupados por categorías.
  // 2. Sin existencia, también agrupados por categorías.
  // Las categorías siguen el orden configurado en Ajustes; nombres A-Z
  // dentro de cada categoría. No modifica ni catálogo remoto ni cuadres.
  const categoriaProducto = (p: CatalogoItem) => p.categoria?.trim() || "Sin categoría";
  const tieneExistencia = (p: CatalogoItem) => (existencias.get(p.id) ?? 0) > 0;
  const productosPunto = useMemo(() => {
    const ordenCategorias = new Map(
      categorias.map((categoria, indice) => [categoria.trim().toLocaleLowerCase("es"), indice])
    );
    const ordenCategoria = (categoria: string) =>
      ordenCategorias.get(categoria.toLocaleLowerCase("es")) ?? Number.MAX_SAFE_INTEGER;

    return catalogo
      .filter((p) => (p.punto ?? "Cafetería") === punto)
      .sort((a, b) =>
        Number((existencias.get(b.id) ?? 0) > 0) -
        Number((existencias.get(a.id) ?? 0) > 0) ||
        ordenCategoria(categoriaProducto(a)) - ordenCategoria(categoriaProducto(b)) ||
        categoriaProducto(a).localeCompare(categoriaProducto(b), "es", { sensitivity: "base" }) ||
        a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
      );
  }, [catalogo, existencias, punto, categorias]);

  const updateAndSync = async (id: string, patch: Partial<CatalogoItem>) => {
    const anterior = useCuadreStore.getState().catalogo.find((c) => c.id === id);
    if (!anterior) return;
    const siguiente = { ...anterior, ...patch };
    if (!codigosAdicionalesValidos(siguiente.codigoBarras, siguiente.codigosAdicionales ?? [])) {
      toast.error("Un código está repetido o no es válido dentro de este producto.");
      return false;
    }
    const duplicado = buscarDuplicadoCatalogo(
      useCuadreStore.getState().catalogo, punto,
      { nombre: siguiente.nombre, codigoBarras: siguiente.codigoBarras,
        codigosAdicionales: siguiente.codigosAdicionales }, id
    );
    if (duplicado) {
      toast.error('Ya existe "' + duplicado.nombre + '" en ' + punto);
      return false;
    }
    updateCatalogItem(id, patch);
    try {
      const actualizado = useCuadreStore.getState().catalogo.find((c) => c.id === id);
      if (actualizado) await pushCatalogItem(actualizado);
      return true;
    } catch (e: any) {
      updateCatalogItem(id, anterior);
      toast.error(e?.message ?? "No se pudo guardar el producto");
      return false;
    }
  };

  const guardarCodigo = async (id: string, valor: string): Promise<boolean> => {
    const codigo = limpiarCodigoBarras(valor);
    const item = useCuadreStore.getState().catalogo.find((p) => p.id === id);
    if (!item) return false;
    if (codigo === (item.codigoBarras ?? "")) return true;
    if (codigo && !esCodigoBarrasValido(codigo)) {
      toast.error("Código inválido. Revisa los dígitos EAN / UPC / GTIN.");
      return false;
    }
    if (!codigosAdicionalesValidos(codigo, item.codigosAdicionales ?? [])) {
      toast.error("Ese código ya está asociado a una variante de este producto.");
      return false;
    }
    const duplicado = buscarDuplicadoCatalogo(
      useCuadreStore.getState().catalogo, punto, { codigoBarras: codigo }, id
    );
    if (duplicado) {
      toast.warning('El código ya corresponde a "' + duplicado.nombre + '". No se duplicó.');
      return false;
    }
    const guardado = await updateAndSync(id, { codigoBarras: codigo || undefined });
    if (guardado) toast.success("Código principal actualizado.");
    return !!guardado;
  };

  const guardarEdicion = async (
    id: string, datos: EdicionCatalogo, nuevaFoto: File | null, quitarFoto: boolean
  ): Promise<boolean> => {
    const anterior = useCuadreStore.getState().catalogo.find((p) => p.id === id);
    if (!anterior) return false;
    let fotoUrl = anterior.fotoUrl;
    let subida: string | null = null;
    try {
      if (nuevaFoto) {
        subida = await subirFotoProducto(id, nuevaFoto);
        fotoUrl = subida;
      } else if (quitarFoto) {
        fotoUrl = undefined;
      }
      const cambios: Partial<CatalogoItem> = { ...datos, fotoUrl };
      const guardado = await updateAndSync(id, cambios);
      if (!guardado) {
        if (subida) await borrarFotoProducto(subida);
        return false;
      }
      if (anterior.fotoUrl && anterior.fotoUrl !== fotoUrl) {
        void borrarFotoProducto(anterior.fotoUrl);
      }
      toast.success("Producto actualizado.");
      return true;
    } catch (error: any) {
      if (subida) await borrarFotoProducto(subida);
      toast.error(error?.message ?? "No se pudo guardar la fotografía.");
      return false;
    }
  };

  const eliminarProducto = async (item: CatalogoItem) => {
    if (!window.confirm('¿Eliminar "' + item.nombre + '" del catálogo de ' + punto +
      '? Los cuadres anteriores se conservarán.')) return;
    try {
      await deleteCatalogItem(item.id);
      removeCatalogItem(item.id);
      setEditandoProductoId(null);
      if (item.fotoUrl) void borrarFotoProducto(item.fotoUrl);
      toast.success("Producto eliminado del catálogo.");
    } catch (error: any) {
      toast.error(error?.message ?? "No se pudo eliminar el producto.");
    }
  };

  const guardarAlias = async () => {
    if (!aliasDraft) return;
    const item = useCuadreStore.getState().catalogo.find((p) => p.id === aliasDraft.productoId);
    if (!item) return;
    const codigo = limpiarCodigoBarras(aliasDraft.codigo);
    if (!esCodigoBarrasValido(codigo)) {
      toast.error("Introduce o escanea un código EAN/UPC válido.");
      return;
    }
    const adicionales = [...(item.codigosAdicionales ?? [])];
    const entrada = { codigo, etiqueta: aliasDraft.etiqueta.trim() || undefined };
    if (aliasDraft.indice === undefined) {
      adicionales.push(entrada);
    } else {
      adicionales[aliasDraft.indice] = entrada;
    }
    const guardado = await updateAndSync(item.id, { codigosAdicionales: adicionales });
    if (guardado) {
      setAliasDraft(null);
      setCodigosProductoId(item.id);
      toast.success("Código asociado a " + item.nombre + " sin crear otro producto.");
    }
  };

  const eliminarAlias = async (item: CatalogoItem, indice: number) => {
    const alias = item.codigosAdicionales?.[indice];
    if (!alias || !window.confirm('¿Desvincular el código "' + alias.codigo + '" de ' + item.nombre + '?')) return;
    const guardado = await updateAndSync(item.id, {
      codigosAdicionales: (item.codigosAdicionales ?? []).filter((_, i) => i !== indice),
    });
    if (guardado) toast.success("Código desvinculado. Las existencias se conservaron.");
  };

  const escaneado = (codigoRaw: string) => {
    const codigo = limpiarCodigoBarras(codigoRaw);
    if (!esCodigoBarrasValido(codigo)) {
      toast.error("No se puede guardar este formato de código. Introduce un GTIN válido.");
      setScannerDestino(null);
      return;
    }
    const destino = scannerDestino;
    setScannerDestino(null);
    const encontrado = buscarPorCodigo(catalogo, punto, codigo);
    if (destino?.startsWith("primary:")) {
      const id = destino.slice("primary:".length);
      void guardarCodigo(id, codigo).then((guardado) => {
        if (guardado) setCodigosProductoId(id);
      });
      return;
    }
    if (destino?.startsWith("alias:")) {
      const id = destino.slice("alias:".length);
      if (encontrado) {
        toast.warning('Este código ya está asociado a "' + encontrado.nombre + '".');
      } else {
        setAliasDraft({ productoId: id, codigo, etiqueta: "" });
      }
      return;
    }
    if (destino === "buscar") {
      if (encontrado) {
        toast.success('Producto encontrado: ' + encontrado.nombre);
        setTimeout(() => document.getElementById("producto-" + encontrado.id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
      } else {
        // Antes de crear otra ficha permite vincular el sabor a un producto existente.
        setCodigoPendiente(codigo);
        setFiltroAsociar("");
        setEtiquetaAsociar("");
        toast.info("Código nuevo: puedes asociarlo a una ficha ya existente.");
      }
      return;
    }
    if (destino === "nuevo") {
      if (encontrado) {
        toast.warning('Ya existe: "' + encontrado.nombre + '"');
        setNuevoOpen(false);
        setTimeout(() => document.getElementById("producto-" + encontrado.id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
      } else setNuevo((v) => ({ ...v, codigoBarras: codigo }));
      return;
    }
    if (destino) void guardarCodigo(destino, codigo);
  };

  const descargarPlantilla = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["nombre", "costo", "precio", "codigo_barras", "categoria", "codigos_adicionales"],
      ["Café Expreso", 20, 120, "", "Otros", "[]"],
    ]);
    ws["!cols"] = [{ wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 20 }, { wch: 55 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    XLSX.writeFile(wb, "plantilla-productos-" + punto + ".xlsx");
  };

  const exportarExcel = (modo: "todos" | "existencia") => {
    const items = productosPunto.filter((p) =>
      modo === "todos" || (existencias.get(p.id) ?? 0) > 0
    );
    const conExistencia = modo === "existencia";
    if (!items.length) {
      toast.info("No hay productos para exportar");
      return;
    }
    const ws = XLSX.utils.aoa_to_sheet([
      ["nombre", "categoria", "codigo_barras", "codigos_adicionales", "costo", "precio", ...(conExistencia ? ["existencia"] : [])],
      ...items.map((p) => [
        p.nombre, p.categoria ?? "", p.codigoBarras ?? "",
        JSON.stringify(p.codigosAdicionales ?? []), p.costo, p.precio,
        ...(conExistencia ? [existencias.get(p.id) ?? 0] : []),
      ]),
    ]);
    ws["!cols"] = [{ wch: 40 }, { wch: 20 }, { wch: 22 }, { wch: 55 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
    // La celda de código es texto: nunca formatear como número científico.
    for (let fila = 1; fila <= items.length; fila++) {
      const celda = ws[XLSX.utils.encode_cell({ r: fila, c: 2 })];
      if (celda) { celda.t = "s"; celda.v = items[fila - 1].codigoBarras ?? ""; }
      const secundarios = ws[XLSX.utils.encode_cell({ r: fila, c: 3 })];
      if (secundarios) { secundarios.t = "s"; secundarios.v = JSON.stringify(items[fila - 1].codigosAdicionales ?? []); }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    XLSX.writeFile(wb, "productos-" + punto + "-" + modo + ".xlsx");
    toast.success("Exportación completada");
  };

  const importarExcel = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { raw: false });
      let importados = 0, existentes = 0, invalidos = 0, fallidos = 0;
      for (const fila of rows) {
        const keys = Object.fromEntries(Object.entries(fila).map(([k, v]) =>
          [k.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase(), v]
        ));
        const nombre = String(keys.nombre ?? keys.producto ?? "").trim();
        const codigo = limpiarCodigoBarras(String(
          keys.codigo_barras ?? keys["codigo de barras"] ?? keys.barcode ?? keys.ean ?? ""
        ));
        if (!nombre) { invalidos++; continue; }
        if (codigo && !esCodigoBarrasValido(codigo)) { invalidos++; continue; }
        let adicionales: { codigo: string; etiqueta?: string }[] = [];
        const datosExtras = String(keys.codigos_adicionales ?? "").trim();
        if (datosExtras) {
          try {
            const parsed: unknown = JSON.parse(datosExtras);
            if (!Array.isArray(parsed)) throw new Error("Lista esperada");
            adicionales = parsed.map((a: any) => ({
              codigo: limpiarCodigoBarras(String(a.codigo ?? "")),
              etiqueta: String(a.etiqueta ?? "").trim() || undefined,
            }));
          } catch { invalidos++; continue; }
        }
        if (!codigosAdicionalesValidos(codigo || undefined, adicionales)) { invalidos++; continue; }
        const actuales = useCuadreStore.getState().catalogo;
        const duplicado = buscarDuplicadoCatalogo(actuales, punto, {
          nombre, codigoBarras: codigo, codigosAdicionales: adicionales,
        });
        if (duplicado) { existentes++; continue; }
        const precio = Number(String(keys.precio ?? keys["precio venta"] ?? "0").replace(",", ".")) || 0;
        const costo = Number(String(keys.costo ?? keys["precio costo"] ?? "0").replace(",", ".")) || 0;
        addCatalogItem({
          nombre, costo, precio, punto, codigoBarras: codigo || undefined,
          codigosAdicionales: adicionales,
          categoria: String(keys.categoria ?? "").trim() || undefined,
        });
        const nuevoItem = useCuadreStore.getState().catalogo.find(
          (p) => (p.punto ?? "Cafetería") === punto &&
            normalizarNombreProducto(p.nombre) === normalizarNombreProducto(nombre)
        );
        try {
          if (nuevoItem) await pushCatalogItem(nuevoItem);
          importados++;
        } catch (e) {
          if (nuevoItem) removeCatalogItem(nuevoItem.id);
          fallidos++;
          console.warn("No se pudo importar producto", nombre, e);
        }
      }
      toast.info("Importados: " + importados + " · Ya existían: " + existentes +
        " · Inválidos: " + invalidos + " · Errores de nube: " + fallidos);
      if (fallidos) toast.error("Revisa la migración SQL y tu conexión antes de reintentar.");
    } catch (err: any) {
      console.error(err);
      toast.error("Error al leer el Excel: " + (err?.message ?? ""));
    }
  };

  if (role !== "admin") {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Productos</h1>
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <Lock className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Solo el administrador puede gestionar el catálogo de productos, precios y costos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Catálogo de productos</h1>
      <p className="text-xs text-muted-foreground">
        Estos productos y precios se cargarán automáticamente al iniciar un nuevo cuadre.
        Cambiar precios aquí <strong>no afecta</strong> los cuadres ya guardados.
      </p>

      {/* Selector de punto de venta */}
      <div className="grid grid-cols-2 gap-2">
        {PUNTOS.map((p) => {
          const Icon = p === "Cafetería" ? Coffee : Store;
          const active = p === punto;
          return (
            <button
              key={p}
              onClick={() => setPunto(p)}
              className={cn(
                "flex items-center justify-center gap-2 rounded-xl border p-3 text-sm font-semibold transition-smooth",
                active
                  ? "gradient-primary border-0 text-primary-foreground shadow-soft"
                  : "border-border bg-card text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {p}
              <span className="ml-1 rounded-full bg-white/20 px-1.5 text-[10px]">
                {catalogo.filter((c) => (c.punto ?? "Cafetería") === p).length}
              </span>
            </button>
          );
        })}
      </div>

      <Button type="button" variant="outline" aria-expanded={herramientasAbiertas}
        onClick={() => setHerramientasAbiertas((open) => !open)}
        className="h-10 w-full justify-between rounded-xl">
        <span className="flex items-center gap-2"><Upload className="h-4 w-4" /> Herramientas · Excel y catálogo</span>
        <ChevronDown className={"h-4 w-4 transition-transform " + (herramientasAbiertas ? "rotate-180" : "")} />
      </Button>
      {herramientasAbiertas && (

      <div className="rounded-2xl border border-border bg-card p-3 shadow-soft">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Importar desde Excel
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Encabezados: <code className="rounded bg-muted px-1">nombre</code>,{" "}
          <code className="rounded bg-muted px-1">costo</code>,{" "}
          <code className="rounded bg-muted px-1">precio</code>,{" "}
          <code className="rounded bg-muted px-1">codigo_barras</code> (opcional) y
          <code className="rounded bg-muted px-1">categoria</code>.
          Se omiten los productos duplicados; no se borran los existentes en {punto}.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) importarExcel(f);
            e.currentTarget.value = "";
          }}
        />
        <div className="mt-2 grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="h-10 rounded-xl"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="mr-1.5 h-4 w-4" /> Subir Excel
          </Button>
          <Button
            variant="outline"
            className="h-10 rounded-xl"
            onClick={descargarPlantilla}
          >
            <Download className="mr-1.5 h-4 w-4" /> Plantilla
          </Button>
        </div>
        <Button variant="outline" className="mt-2 h-10 w-full rounded-xl" onClick={() => setExportOpen(true)}>
          <Download className="mr-1.5 h-4 w-4" /> Exportar productos de {punto} a Excel
        </Button>
        <Button
          variant="outline"

          className="mt-2 h-10 w-full rounded-xl border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
          onClick={() => {
            const total = catalogo.filter(
              (c) => (c.punto ?? "Cafetería") === punto
            ).length;
            if (total === 0) {
              toast.info(`No hay productos en ${punto}`);
              return;
            }
            if (
              !confirm(
                `¿Eliminar TODOS los ${total} producto(s) de ${punto}? Esta acción no se puede deshacer.`
              )
            )
              return;
            const ids = catalogo
              .filter((c) => (c.punto ?? "Cafetería") === punto)
              .map((c) => c.id);
            clearCatalog(punto);
            ids.forEach((id) => deleteCatalogItem(id).catch(console.error));
            toast.success(`Productos de ${punto} eliminados`);
          }}
        >
          <Trash2 className="mr-1.5 h-4 w-4" /> Eliminar todos los de {punto}
        </Button>
      </div>
      )}

      <div className="space-y-2">
        <div className="rounded-xl border border-border bg-card p-3 space-y-2">
          <p className="text-xs text-muted-foreground">Primero: productos con existencia, agrupados por categoría. Después: productos sin existencia, también por categoría. Dentro de cada categoría, productos A–Z.</p>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" onClick={() => setScannerDestino("buscar")}
              className="h-10 rounded-xl px-2 text-xs sm:text-sm">
              <ScanBarcode className="mr-1.5 h-4 w-4" /> Buscar / Escanear
            </Button>
            <Button type="button" onClick={() => setNuevoOpen(true)}
              className="h-10 rounded-xl px-2 text-xs sm:text-sm">
              <Plus className="mr-1.5 h-4 w-4" /> Nuevo producto
            </Button>
          </div>
        </div>
        {productosPunto.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
            <Package className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Sin productos en {punto}
            </p>
          </div>
        )}
        {productosPunto.map((p, i) => (
          <Fragment key={p.id}>
            {(i === 0 || tieneExistencia(productosPunto[i - 1]) !== tieneExistencia(p)) && (
              <div className="mt-4 rounded-xl bg-muted px-3 py-2 font-semibold text-sm">
                {tieneExistencia(p) ? "Productos con existencia" : "Productos sin existencia"}
                <span className="ml-1 text-xs font-normal text-muted-foreground">
                  (último cuadre de {punto})
                </span>
              </div>
            )}
            {(i === 0 ||
              tieneExistencia(productosPunto[i - 1]) !== tieneExistencia(p) ||
              categoriaProducto(productosPunto[i - 1]) !== categoriaProducto(p)) && (
              <h3 className="px-1 pt-2 text-xs font-bold uppercase tracking-wide text-primary">
                {categoriaProducto(p)}
              </h3>
            )}
          <ProductoTarjeta
            producto={p}
            numero={i + 1}
            existencia={existencias.get(p.id) ?? 0}
            onEditar={() => setEditandoProductoId(p.id)}
            onCodigos={() => setCodigosProductoId(p.id)}
            onHistorial={() => setKardex(p.nombre)}
          />
          </Fragment>
        ))}
      </div>
      <EditarProductoDialog
        producto={catalogo.find((p) => p.id === editandoProductoId) ?? null}
        categorias={categorias}
        onClose={() => setEditandoProductoId(null)}
        onGuardar={guardarEdicion}
        onCodigos={(id) => {
          setEditandoProductoId(null);
          setCodigosProductoId(id);
        }}
        onEliminar={(item) => { void eliminarProducto(item); }}
      />
      <CodigosProductoDialog
        producto={catalogo.find((p) => p.id === codigosProductoId) ?? null}
        onClose={() => setCodigosProductoId(null)}
        onGuardarPrincipal={guardarCodigo}
        onEscanearPrincipal={(id) => {
          setCodigosProductoId(null);
          setScannerDestino("primary:" + id);
        }}
        onAgregar={(id) => {
          setCodigosProductoId(null);
          setAliasDraft({ productoId: id, codigo: "", etiqueta: "" });
        }}
        onEscanearAdicional={(id) => {
          setCodigosProductoId(null);
          setScannerDestino("alias:" + id);
        }}
        onEditar={(id, indice) => {
          const entrada = catalogo.find((p) => p.id === id)?.codigosAdicionales?.[indice];
          if (!entrada) return;
          setCodigosProductoId(null);
          setAliasDraft({
            productoId: id, indice, codigo: entrada.codigo, etiqueta: entrada.etiqueta ?? "",
          });
        }}
        onEliminar={(item, indice) => { void eliminarAlias(item, indice); }}
      />
      <KardexDialog nombre={kardex} punto={punto} onClose={() => setKardex(null)} />
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exportar productos de {punto}</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Qué productos quieres incluir en el Excel?
          </p>
          <div className="space-y-2">
            <Button
              variant="outline"
              className="h-11 w-full rounded-xl"
              onClick={() => {
                setExportOpen(false);
                exportarExcel("todos");
              }}
            >
              <Download className="mr-2 h-4 w-4" /> Lista completa
            </Button>
            <Button
              className="h-11 w-full rounded-xl gradient-primary text-primary-foreground"
              onClick={() => {
                setExportOpen(false);
                exportarExcel("existencia");
              }}
            >
              <Package className="mr-2 h-4 w-4" /> Solo con existencia en el último turno
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            La opción de existencia toma el inventario final del último turno finalizado de{" "}
            {punto} e incluye la columna "existencia", ideal para el IPV de entrega.
          </p>
        </DialogContent>
      </Dialog>

      <Dialog open={nuevoOpen} onOpenChange={setNuevoOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nuevo producto en {punto}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block text-xs">
              <span className="text-muted-foreground">Nombre</span>
              <Input
                value={nuevo.nombre}
                onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })}
                placeholder="Ej. Café espresso"
                className="mt-1 h-11 rounded-xl"
              />
            </label>
            <div className="space-y-1">
              <span className="text-xs text-muted-foreground">Código de barras (opcional)</span>
              <div className="flex gap-2">
                <Input value={nuevo.codigoBarras} inputMode="numeric" placeholder="EAN / UPC / GTIN"
                  onChange={(e) => setNuevo((n) => ({ ...n, codigoBarras: e.target.value }))}
                  className="h-11 flex-1 font-mono text-xs rounded-xl" />
                <Button type="button" variant="outline" size="icon" className="h-11 w-11 rounded-xl"
                  onClick={() => setScannerDestino("nuevo")}><ScanBarcode className="h-4 w-4" /></Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-xs">
                <span className="text-muted-foreground">Precio venta</span>
                <NumberInput
                  value={nuevo.precio}
                  onChange={(v) => setNuevo({ ...nuevo, precio: v })}
                  className="mt-1 h-11 rounded-xl"
                />
              </label>
              <label className="block text-xs">
                <span className="text-muted-foreground">Precio costo</span>
                <NumberInput
                  value={nuevo.costo}
                  onChange={(v) => setNuevo({ ...nuevo, costo: v })}
                  className="mt-1 h-11 rounded-xl"
                />
              </label>
            </div>
            <label className="block text-xs">
              <span className="text-muted-foreground">Categoría</span>
              {categorias.length > 0 ? (
                <select
                  value={nuevo.categoria}
                  onChange={(e) => setNuevo({ ...nuevo, categoria: e.target.value })}
                  className="mt-1 h-11 w-full rounded-xl border border-input bg-background px-2 text-sm"
                >
                  <option value="">Sin categoría</option>
                  {categorias.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  value={nuevo.categoria}
                  onChange={(e) => setNuevo({ ...nuevo, categoria: e.target.value })}
                  placeholder="Gestiona las categorías en Ajustes"
                  className="mt-1 h-11 rounded-xl"
                />
              )}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNuevoOpen(false)}>
              Cancelar
            </Button>
            <Button
              className="gradient-primary text-primary-foreground"
              onClick={async () => {
                const nombre = nuevo.nombre.trim();
                const codigo = limpiarCodigoBarras(nuevo.codigoBarras);
                if (!nombre) {
                  toast.error("Escribe el nombre del producto");
                  return;
                }
                if (codigo && !esCodigoBarrasValido(codigo)) {
                  toast.error("Comprueba el código de barras (dígitos de control inválidos)");
                  return;
                }
                const duplicado = buscarDuplicadoCatalogo(catalogo, punto, { nombre, codigoBarras: codigo });
                if (duplicado) {
                  toast.warning('Ya existe "' + duplicado.nombre + '". Selecciónalo en lugar de duplicarlo.');
                  setNuevoOpen(false);
                  setTimeout(() => document.getElementById("producto-" + duplicado.id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
                  return;
                }
                addCatalogItem({
                  nombre, precio: nuevo.precio, costo: nuevo.costo, punto,
                  categoria: nuevo.categoria.trim() || undefined,
                  codigoBarras: codigo || undefined,
                });
                const last = useCuadreStore.getState().catalogo.find((c) =>
                  (c.punto ?? "Cafetería") === punto &&
                  normalizarNombreProducto(c.nombre) === normalizarNombreProducto(nombre)
                );
                try {
                  if (last) await pushCatalogItem(last);
                  toast.success('Producto "' + nombre + '" registrado');
                  setNuevo({ nombre: "", precio: 0, costo: 0, categoria: "", codigoBarras: "" });
                  setNuevoOpen(false);
                } catch (e: any) {
                  if (last) removeCatalogItem(last.id);
                  toast.error(e?.message ?? "No se pudo guardar el producto en Supabase");
                }
              }}
            >
              Agregar producto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={aliasDraft !== null} onOpenChange={(abierto) => { if (!abierto) setAliasDraft(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{aliasDraft?.indice === undefined ? "Asociar otro código" : "Editar código asociado"}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Variantes o sabores comparten la misma ficha, el mismo precio y la misma existencia.
          </p>
          <label className="space-y-1 text-xs">
            <span>Código de barras</span>
            <div className="flex gap-2">
              <Input inputMode="numeric" value={aliasDraft?.codigo ?? ""}
                onChange={(e) => setAliasDraft((actual) => actual ? { ...actual, codigo: e.target.value } : null)}
                className="h-10 font-mono" placeholder="EAN/UPC/GTIN" />
              <Button variant="outline" size="icon" type="button"
                aria-label="Escanear código asociado"
                onClick={() => {
                  const id = aliasDraft?.productoId;
                  setAliasDraft(null);
                  if (id) setScannerDestino("alias:" + id);
                }}>
                <ScanBarcode className="h-4 w-4"/>
              </Button>
            </div>
          </label>
          <label className="space-y-1 text-xs">
            <span>Sabor o variante (opcional)</span>
            <Input value={aliasDraft?.etiqueta ?? ""} placeholder="Ej. Rosas, Violetas, Cola…"
              onChange={(e) => setAliasDraft((actual) => actual ? { ...actual, etiqueta: e.target.value } : null)}
              className="h-10" />
          </label>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAliasDraft(null)}>Cancelar</Button>
            <Button onClick={() => { void guardarAlias(); }}>Guardar código</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={codigoPendiente !== null}
        onOpenChange={(abierto) => { if (!abierto) setCodigoPendiente(null); }}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>¿A qué producto corresponde este código?</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Código detectado: <strong className="font-mono">{codigoPendiente}</strong>.
            Puedes asociarlo a una ficha existente, como un nuevo sabor, sin duplicar el inventario.
          </p>
          <label className="space-y-1 text-xs">
            <span>Identificar variante (opcional)</span>
            <Input value={etiquetaAsociar} placeholder="Ej. Naranja, Rosas, Violetas"
              onChange={(e) => setEtiquetaAsociar(e.target.value)}/>
          </label>
          <Input placeholder="Buscar producto por nombre…"
            value={filtroAsociar} onChange={(e) => setFiltroAsociar(e.target.value)}/>
          <div className="max-h-52 overflow-y-auto space-y-1.5">
            {productosPunto.filter((p) =>
              normalizarNombreProducto(p.nombre).includes(normalizarNombreProducto(filtroAsociar))
            ).map((p) => (
              <Button key={p.id} type="button" variant="outline"
                className="w-full justify-start h-auto min-h-10 whitespace-normal text-left"
                onClick={() => {
                  if (!codigoPendiente) return;
                  setAliasDraft({
                    productoId: p.id, codigo: codigoPendiente, etiqueta: etiquetaAsociar,
                  });
                  setCodigoPendiente(null);
                }}>
                {p.nombre}
              </Button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCodigoPendiente(null)}>Cancelar</Button>
            <Button type="button" onClick={() => {
              setNuevo((v) => ({ ...v, codigoBarras: codigoPendiente ?? "" }));
              setCodigoPendiente(null);
              setNuevoOpen(true);
            }}>Crear producto nuevo</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <BarcodeScanner open={scannerDestino !== null}
        onOpenChange={(abierto) => { if (!abierto) setScannerDestino(null); }}
        onScan={escaneado} titulo="Escáner de productos" />
    </div>
  );
}