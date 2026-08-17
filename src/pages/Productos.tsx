import { useRef, useState } from "react";
import { useCuadreStore, PUNTOS, PuntoVenta, sortCatalogo } from "@/store/cuadreStore";
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
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { pushCatalogItem, deleteCatalogItem } from "@/lib/sync";

export default function Productos() {
  const {
    catalogo,
    addCatalogItem,
    updateCatalogItem,
    removeCatalogItem,
    importCatalog,
    importCatalogReplace,
    clearCatalog,
    moveCatalogItem,
    role,
  } = useCuadreStore();
  const [punto, setPunto] = useState<PuntoVenta>("Cafetería");
  const categorias = useCuadreStore((s) => s.settings.categorias ?? []);
  const fileRef = useRef<HTMLInputElement>(null);


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

  const productosPunto = sortCatalogo(catalogo).filter((p) => (p.punto ?? "Cafetería") === punto);
  const moveItem = (id: string, dir: -1 | 1) => {
    moveCatalogItem(id, dir);
    useCuadreStore
      .getState()
      .catalogo.filter((c) => (c.punto ?? "Cafetería") === punto)
      .forEach((c) => pushCatalogItem(c).catch(console.error));
  };

  const updateAndSync = (id: string, patch: any) => {
    updateCatalogItem(id, patch);
    const state = useCuadreStore.getState();
    if ("orden" in patch) {
      state.catalogo
        .filter((c) => (c.punto ?? "Cafetería") === punto)
        .forEach((c) => pushCatalogItem(c).catch(console.error));
      return;
    }
    const next = state.catalogo.find((c) => c.id === id);
    if (next) pushCatalogItem(next).catch(console.error);
  };

  const descargarPlantilla = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ["orden", "nombre", "costo", "precio"],
      [1, "Café espresso", 20, 50],
      [2, "Capuchino", 35, 80],
    ]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    XLSX.writeFile(wb, `plantilla-productos-${punto}.xlsx`);
    toast.success("Plantilla descargada");
  };

  const importarExcel = async (file: File) => {
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws);
      const items = rows
        .map((r, idx) => {
          // tolerante a mayúsculas/acentos
          const keys = Object.fromEntries(
            Object.entries(r).map(([k, v]) => [k.toLowerCase().trim(), v])
          );
          const orden = Number(
            keys["orden"] ?? keys["lugar"] ?? keys["no"] ?? keys["#"] ?? idx + 1
          );
          const nombre = String(keys["nombre"] ?? keys["producto"] ?? "").trim();
          const costo = Number(keys["costo"] ?? keys["precio costo"] ?? 0);
          const precio = Number(keys["precio"] ?? keys["precio venta"] ?? 0);
          return nombre ? { nombre, costo, precio, orden: orden || idx + 1, punto } : null;
        })
        .filter(Boolean)
        .sort((a: any, b: any) => a.orden - b.orden) as {
        nombre: string;
        costo: number;
        precio: number;
        orden: number;
        punto: PuntoVenta;
      }[];
      if (items.length === 0) {
        toast.error("No se encontraron filas válidas");
        return;
      }
      const existentes = useCuadreStore
        .getState()
        .catalogo.filter((c) => (c.punto ?? "Cafetería") === punto);
      const reemplazar =
        existentes.length === 0 ||
        confirm(
          `Hay ${existentes.length} producto(s) en ${punto}. ` +
            `¿Reemplazarlos por los del Excel manteniendo el orden de la hoja?\n\n` +
            `Aceptar = Reemplazar (recomendado para conservar el orden).\n` +
            `Cancelar = Agregar al final.`
        );
      if (reemplazar) {
        importCatalogReplace(items, punto);
        existentes.forEach((c) => deleteCatalogItem(c.id).catch(console.error));
      } else {
        importCatalog(items);
      }
      toast.success(`${items.length} productos importados a ${punto}`);
      const nuevos = useCuadreStore
        .getState()
        .catalogo.filter((c) => (c.punto ?? "Cafetería") === punto);
      nuevos.forEach((c) => pushCatalogItem(c).catch(console.error));
    } catch (e) {
      console.error(e);
      toast.error("Error al leer el archivo");
    }
  };

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
            key={p.id}
            className="rounded-2xl border border-border bg-card p-3 shadow-soft"
          >
            <div className="flex items-center gap-2">
              <NumberInput
                value={p.orden ?? i + 1}
                onChange={(v) => updateAndSync(p.id, { orden: v || i + 1 })}
                className="h-10 w-14 rounded-xl text-center font-semibold"
                aria-label="Orden"
              />
              <div className="flex flex-col">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={i === 0}
                  onClick={() => moveItem(p.id, -1)}
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  disabled={i === productosPunto.length - 1}
                  onClick={() => moveItem(p.id, 1)}
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
              </div>
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

          </div>
        ))}
      </div>
      <Button
        variant="outline"
        className="h-11 w-full rounded-xl"
        onClick={() => {
          const orden = productosPunto.length + 1;
          addCatalogItem({ nombre: "Nuevo producto", precio: 0, costo: 0, punto, orden });
          toast.success(`Producto agregado a ${punto}`);
          const last = useCuadreStore.getState().catalogo.slice(-1)[0];
          if (last) pushCatalogItem(last).catch(console.error);
        }}
      >
        <Plus className="mr-2 h-4 w-4" /> Agregar producto al catálogo
      </Button>
    </div>
  );
}
