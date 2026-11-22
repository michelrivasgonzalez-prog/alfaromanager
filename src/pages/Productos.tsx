import { useMemo, useRef, useState } from "react";
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
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { pushCatalogItem, deleteCatalogItem } from "@/lib/sync";
import { KardexDialog } from "@/components/KardexDialog";
import BarcodeScanner from "@/components/BarcodeScanner";
import { buscarDuplicadoCatalogo, buscarPorCodigo, esCodigoBarrasValido, limpiarCodigoBarras, normalizarNombreProducto } from "@/lib/codigosBarras";
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
  const [kardex, setKardex] = useState<string | null>(null);
  const [nuevo, setNuevo] = useState({ nombre: "", precio: 0, costo: 0, categoria: "", codigoBarras: "" });
  const [scannerDestino, setScannerDestino] = useState<string | null>(null);
  const [codigosBorrador, setCodigosBorrador] = useState<Record<string, string>>({});
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

  // Solo orden visual: activos del último cuadre primero, luego agotados;
  // cada grupo en orden alfabético español, sin alterar los registros.
  const productosPunto = useMemo(() => catalogo
    .filter((p) => (p.punto ?? "Cafetería") === punto)
    .sort((a, b) =>
      Number((existencias.get(b.id) ?? 0) > 0) -
      Number((existencias.get(a.id) ?? 0) > 0) ||
      a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" })
    ), [catalogo, existencias, punto]);

  const updateAndSync = async (id: string, patch: Partial<CatalogoItem>) => {
    const anterior = useCuadreStore.getState().catalogo.find((c) => c.id === id);
    if (!anterior) return;
    const siguiente = { ...anterior, ...patch };
    const duplicado = buscarDuplicadoCatalogo(
      useCuadreStore.getState().catalogo, punto,
      { nombre: siguiente.nombre, codigoBarras: siguiente.codigoBarras }, id
    );
    if (duplicado) {
      toast.error('Ya existe "' + duplicado.nombre + '" en ' + punto);
      return;
    }
    updateCatalogItem(id, patch);
    try {
      const actualizado = useCuadreStore.getState().catalogo.find((c) => c.id === id);
      if (actualizado) await pushCatalogItem(actualizado);
    } catch (e: any) {
      updateCatalogItem(id, anterior);
      toast.error(e?.message ?? "No se pudo guardar el producto");
    }
  };

  const guardarCodigo = (id: string, valor: string) => {
    const codigo = limpiarCodigoBarras(valor);
    const item = catalogo.find((p) => p.id === id);
    if (!item || codigo === (item.codigoBarras ?? "")) {
      setCodigosBorrador((prev) => { const n = { ...prev }; delete n[id]; return n; });
      return;
    }
    if (codigo && !esCodigoBarrasValido(codigo)) {
      toast.error("Código inválido. Revisa los dígitos EAN / UPC / GTIN.");
      return;
    }
    const duplicado = buscarDuplicadoCatalogo(catalogo, punto, { codigoBarras: codigo }, id);
    if (duplicado) {
      toast.warning('El código ya corresponde a "' + duplicado.nombre + '". No se duplicó.');
      document.getElementById("producto-" + duplicado.id)?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setCodigosBorrador((prev) => { const n = { ...prev }; delete n[id]; return n; });
    void updateAndSync(id, { codigoBarras: codigo || undefined });
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
    if (destino === "buscar") {
      if (encontrado) {
        toast.success('Producto encontrado: ' + encontrado.nombre);
        setTimeout(() => document.getElementById("producto-" + encontrado.id)?.scrollIntoView({ behavior: "smooth", block: "center" }), 120);
      } else {
        setNuevo((v) => ({ ...v, codigoBarras: codigo }));
        setNuevoOpen(true);
        toast.info("Código nuevo. Comprueba el nombre antes de crear el producto.");
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
    if (destino) guardarCodigo(destino, codigo);
  };

  const descargarPlantilla = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["nombre", "costo", "precio", "codigo_barras", "categoria"],
      ["Café Expreso", 20, 120, "", "Otros"],
    ]);
    ws["!cols"] = [{ wch: 40 }, { wch: 14 }, { wch: 14 }, { wch: 22 }, { wch: 20 }];
    XLSX.writeFile(
      Object.assign(XLSX.utils.book_new(), { SheetNames: ["Productos"], Sheets: { Productos: ws } }),
      "plantilla-productos-" + punto + ".xlsx"
    );
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
      ["nombre", "categoria", "codigo_barras", "costo", "precio", ...(conExistencia ? ["existencia"] : [])],
      ...items.map((p) => [
        p.nombre, p.categoria ?? "", p.codigoBarras ?? "", p.costo, p.precio,
        ...(conExistencia ? [existencias.get(p.id) ?? 0] : []),
      ]),
    ]);
    ws["!cols"] = [{ wch: 40 }, { wch: 20 }, { wch: 22 }, { wch: 14 }, { wch: 14 }, { wch: 12 }];
    // La celda de código es texto: nunca formatear como número científico.
    for (let fila = 1; fila <= items.length; fila++) {
      const celda = ws[XLSX.utils.encode_cell({ r: fila, c: 2 })];
      if (celda) { celda.t = "s"; celda.v = items[fila - 1].codigoBarras ?? ""; }
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
        const actuales = useCuadreStore.getState().catalogo;
        const duplicado = buscarDuplicadoCatalogo(actuales, punto, { nombre, codigoBarras: codigo });
        if (duplicado) { existentes++; continue; }
        const precio = Number(String(keys.precio ?? keys["precio venta"] ?? "0").replace(",", ".")) || 0;
        const costo = Number(String(keys.costo ?? keys["precio costo"] ?? "0").replace(",", ".")) || 0;
        addCatalogItem({
          nombre, costo, precio, punto, codigoBarras: codigo || undefined,
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

      {/* Importación Excel */}
      <div className="rounded-2xl border border-border bg-card p-3 shadow-soft">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Importar desde Excel
        </div>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Encabezados requeridos: <code className="rounded bg-muted px-1">orden</code>,{" "}
          <code className="rounded bg-muted px-1">nombre</code>,{" "}
          <code className="rounded bg-muted px-1">costo</code>,{" "}
          <code className="rounded bg-muted px-1">precio</code>. Los productos se agregan al
          punto seleccionado ({punto}).
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

      <div className="space-y-2">
        <div className="rounded-xl border border-border bg-card p-3 space-y-2">
          <p className="text-xs text-muted-foreground">Primero: productos con existencia en el último cuadre, ordenados alfabéticamente. Después: productos agotados, también A–Z.</p>
          <Button type="button" variant="outline" onClick={() => setScannerDestino("buscar")} className="w-full rounded-xl h-10">
            <ScanBarcode className="mr-2 h-4 w-4" /> Buscar por código de barras con cámara
          </Button>
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
          <div
            id={"producto-" + p.id}
            key={p.id}
            className="rounded-2xl border border-border bg-card p-3 shadow-soft scroll-mt-24"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs w-8 text-center font-semibold text-muted-foreground">{i + 1}.</span>
              <Input
                value={p.nombre}
                onChange={(e) => updateAndSync(p.id, { nombre: e.target.value })}
                className="h-10 flex-1 rounded-xl font-semibold"
              />
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                onClick={() => {
                  removeCatalogItem(p.id);
                  deleteCatalogItem(p.id).catch(console.error);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-2 flex items-center gap-2 text-[11px]">
              <span className={(existencias.get(p.id) ?? 0) > 0 ? "font-semibold text-emerald-600" : "text-muted-foreground"}>
                Existencia final: {(existencias.get(p.id) ?? 0).toLocaleString("es-ES")}
              </span>
              {ultimo && <span className="text-muted-foreground">· Último cuadre</span>}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-xs">
                <span className="text-muted-foreground">Precio</span>
                <NumberInput
                  value={p.precio}
                  onChange={(v) => updateAndSync(p.id, { precio: v })}
                  className="mt-0.5 h-9 rounded-lg"
                />
              </label>
              <label className="text-xs">
                <span className="text-muted-foreground">Costo</span>
                <NumberInput
                  value={p.costo}
                  onChange={(v) => updateAndSync(p.id, { costo: v })}
                  className="mt-0.5 h-9 rounded-lg"
                />
              </label>
            </div>
            <div className="mt-2 space-y-1">
              <span className="text-xs text-muted-foreground">Código de barras (EAN / UPC / GTIN)</span>
              <div className="flex gap-2">
                <Input value={codigosBorrador[p.id] ?? p.codigoBarras ?? ""} inputMode="numeric"
                  placeholder="Escanear o introducir código"
                  onChange={(e) => setCodigosBorrador((prev) => ({ ...prev, [p.id]: e.target.value }))}
                  onBlur={() => guardarCodigo(p.id, codigosBorrador[p.id] ?? p.codigoBarras ?? "")}
                  className="h-10 flex-1 rounded-xl font-mono text-xs" />
                <Button type="button" size="icon" variant="outline" className="h-10 w-10 shrink-0 rounded-xl"
                  aria-label={"Escanear código de " + p.nombre}
                  onClick={() => setScannerDestino(p.id)}><ScanBarcode className="h-4 w-4" /></Button>
              </div>
            </div>
            <label className="mt-2 block text-xs">
              <span className="text-muted-foreground">Categoría</span>
              {categorias.length > 0 ? (
                <select
                  value={p.categoria ?? ""}
                  onChange={(e) => updateAndSync(p.id, { categoria: e.target.value || undefined })}
                  className="mt-0.5 h-9 w-full rounded-lg border border-input bg-background px-2 text-sm"
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
                  value={p.categoria ?? ""}
                  onChange={(e) => updateAndSync(p.id, { categoria: e.target.value || undefined })}
                  placeholder="Gestiona las categorías en Ajustes"
                  className="mt-0.5 h-9 rounded-lg"
                />
              )}
            </label>
            <Button variant="outline" size="sm" className="mt-2 h-8 w-full rounded-lg" onClick={() => setKardex(p.nombre)}>
              Historial de movimientos
            </Button>
          </div>
        ))}
      </div>
      <KardexDialog nombre={kardex} punto={punto} onClose={() => setKardex(null)} />
      <Button
        className="h-11 w-full rounded-xl gradient-primary text-primary-foreground"
        onClick={() => setNuevoOpen(true)}
      >
        <Plus className="mr-2 h-4 w-4" /> Nuevo producto
      </Button>

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
      <BarcodeScanner open={scannerDestino !== null}
        onOpenChange={(abierto) => { if (!abierto) setScannerDestino(null); }}
        onScan={escaneado} titulo="Escáner de productos" />
    </div>
  );
}