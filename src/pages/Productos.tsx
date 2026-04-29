import { useCuadreStore } from "@/store/cuadreStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Lock } from "lucide-react";

export default function Productos() {
  const { current, startCuadre, addProducto, removeProducto, updateProducto, role } =
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

  if (!current) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Productos</h1>
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <p className="mb-4 text-sm text-muted-foreground">
            Inicia un cuadre para gestionar el catálogo.
          </p>
          <Button onClick={startCuadre} className="gradient-primary">
            Iniciar cuadre
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Productos</h1>
      <div className="space-y-2">
        {current.productos.map((p) => (
          <div
            key={p.id}
            className="rounded-2xl border border-border bg-card p-3 shadow-soft"
          >
            <div className="flex items-center gap-2">
              <Input
                value={p.nombre}
                onChange={(e) => updateProducto(p.id, { nombre: e.target.value })}
                className="h-10 flex-1 rounded-xl font-semibold"
              />
              <Button
                variant="ghost"
                size="icon"
                className="text-destructive"
                onClick={() => removeProducto(p.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="text-xs">
                <span className="text-muted-foreground">Precio</span>
                <Input
                  type="number"
                  value={p.precio}
                  onChange={(e) => updateProducto(p.id, { precio: Number(e.target.value) || 0 })}
                  className="mt-0.5 h-9 rounded-lg"
                />
              </label>
              <label className="text-xs">
                <span className="text-muted-foreground">Costo</span>
                <Input
                  type="number"
                  value={p.costo}
                  onChange={(e) => updateProducto(p.id, { costo: Number(e.target.value) || 0 })}
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
        onClick={() =>
          addProducto({
            nombre: "Nuevo producto",
            inicio: 0,
            entradas: 0,
            traslados: 0,
            final: 0,
            precio: 0,
            costo: 0,
          })
        }
      >
        <Plus className="mr-2 h-4 w-4" /> Agregar producto
      </Button>
    </div>
  );
}
