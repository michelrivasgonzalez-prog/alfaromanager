import { useState } from "react";
import { useCuadreStore } from "@/store/cuadreStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, Users as UsersIcon, Lock, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { pushDependiente, deleteDependiente } from "@/lib/sync";

export default function Usuarios() {
  const { dependientes, addDependiente, removeDependiente, updateDependiente, role } =
    useCuadreStore();
  const [nuevo, setNuevo] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const isAdmin = role === "admin";

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Dependientes</h1>

      {!isAdmin && (
        <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
          <Lock className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Solo el administrador puede gestionar los dependientes.
          </p>
        </div>
      )}

      {isAdmin && (
        <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-2">
          <div className="text-sm font-semibold">Agregar dependiente</div>
          <div className="flex gap-2">
            <Input
              value={nuevo}
              onChange={(e) => setNuevo(e.target.value)}
              placeholder="Nombre completo"
              className="h-11 rounded-xl"
            />
            <Button
              onClick={() => {
                const n = nuevo.trim();
                if (!n) return;
                addDependiente(n);
                pushDependiente(n).catch(console.error);
                setNuevo("");
                toast.success("Dependiente agregado");
              }}
              className="rounded-xl gradient-primary"
            >
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {dependientes.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center">
            <UsersIcon className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Sin dependientes registrados</p>
          </div>
        )}
        {dependientes.map((d) => (
          <div
            key={d}
            className="flex items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-soft"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-xl gradient-emerald text-secondary-foreground">
              <UsersIcon className="h-4 w-4" />
            </div>
            {editing === d ? (
              <>
                <Input
                  autoFocus
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  className="h-9 flex-1 rounded-lg"
                />
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-secondary"
                  onClick={() => {
                    const v = editValue.trim();
                    if (v) {
                      updateDependiente(d, v);
                      deleteDependiente(d).catch(console.error);
                      pushDependiente(v).catch(console.error);
                    }
                    setEditing(null);
                  }}
                >
                  <Check className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => setEditing(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <>
                <div className="flex-1 font-medium">{d}</div>
                {isAdmin && (
                  <>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => {
                        setEditing(d);
                        setEditValue(d);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive"
                      onClick={() => removeDependiente(d)}
                      onClickCapture={() => deleteDependiente(d).catch(console.error)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
