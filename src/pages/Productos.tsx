import { useCuadreStore } from "@/store/cuadreStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NumberInput } from "@/components/NumberInput";
import { Plus, Trash2, Lock, Package } from "lucide-react";
import { toast } from "sonner";

export default function Productos() {
  const { catalogo, addCatalogItem, updateCatalogItem, removeCatalogItem, role } =
    useCuadreStore();

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

      <div className="space-y-2">
        {catalogo.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
            <Package className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Sin productos en el catálogo</p>
          </div>
        )}
        {catalogo.map((p) => (
          <div
            key={p.id}
            className="rounded-2xl border border-border bg-card p-3 shadow-soft"
          >
            <div className="flex items-center gap-2">
              <Input
                value={p.nombre}
                onChange={(e) => updateCatalogItem(p.id, { nombre: e.target.value })}
                className="h-10 flex-1 rounded-xl font-semibold"
              />
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                onClick={() => removeCatalogItem(p.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-xs">
                <span className="text-muted-foreground">Precio</span>
                <NumberInput
                  value={p.precio}
                  onChange={(v) => updateCatalogItem(p.id, { precio: v })}
                  className="mt-0.5 h-9 rounded-lg"
                />
              </label>
              <label className="text-xs">
                <span className="text-muted-foreground">Costo</span>
                <NumberInput
                  value={p.costo}
                  onChange={(v) => updateCatalogItem(p.id, { costo: v })}
                  className="mt-0.5 h-9 rounded-lg"
                />
              </label>
            </div>
          </div>
        ))}
      </div>
      <Button
        variant="outline"
        className="h-11 w-full rounded-xl"
        onClick={() => {
          addCatalogItem({ nombre: "Nuevo producto", precio: 0, costo: 0 });
          toast.success("Producto agregado al catálogo");
        }}
      >
        <Plus className="mr-2 h-4 w-4" /> Agregar producto al catálogo
      </Button>
    </div>
  );
}
