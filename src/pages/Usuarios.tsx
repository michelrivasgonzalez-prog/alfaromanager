import { useState } from "react";
import { usePinStore, PinRole, PinUser } from "@/store/pinStore";
import { useAuth } from "@/hooks/useAuth";
import { useCuadreStore } from "@/store/cuadreStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Trash2, Users as UsersIcon, Lock, Pencil, Shield, Crown, User as UserIcon, KeyRound, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { PinPad } from "@/components/PinPad";

const ROLE_INFO: Record<PinRole, { label: string; Icon: any; cls: string }> = {
  admin: { label: "Admin", Icon: Shield, cls: "gradient-primary text-primary-foreground" },
  duena: { label: "Dueña", Icon: Crown, cls: "gradient-emerald text-secondary-foreground" },
  dependiente: { label: "Dependiente", Icon: UserIcon, cls: "bg-muted text-foreground" },
};

export default function Usuarios() {
  const { role: currentRole } = useAuth();
  const isAdmin = currentRole === "admin";
  const { users, createUser, removeUser, updateUser, updatePin } = usePinStore();
  const [open, setOpen] = useState(false);
  const [pinUser, setPinUser] = useState<PinUser | null>(null);
  const { dependientes, addDependiente, updateDependiente, removeDependiente } =
    useCuadreStore();
  const [nuevoDep, setNuevoDep] = useState("");

  if (!isAdmin) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Usuarios</h1>
        <div className="rounded-2xl border border-dashed border-border bg-card p-6 text-center">
          <Lock className="mx-auto mb-2 h-7 w-7 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Solo el administrador puede gestionar usuarios.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Usuarios</h1>

      {/* Cuentas de acceso (PIN) */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Cuentas de acceso
        </h2>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-xl gradient-primary">
              <Plus className="h-4 w-4 mr-1" /> Nuevo
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-2xl">
            <NewUserForm onDone={() => setOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {users.filter((u) => u.role !== "dependiente").map((u) => {
          const info = ROLE_INFO[u.role];
          const Icon = info.Icon;
          return (
            <div
              key={u.id}
              className="flex items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-soft"
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${info.cls}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1">
                <div className="font-medium">{u.nombre}</div>
                <div className="text-xs text-muted-foreground">{info.label}</div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                title="Cambiar PIN"
                onClick={() => setPinUser(u)}
              >
                <KeyRound className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                title="Renombrar"
                onClick={() => {
                  const v = prompt("Nuevo nombre", u.nombre);
                  if (v && v.trim()) updateUser(u.id, { nombre: v.trim() });
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              {u.role !== "admin" && (
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8 text-destructive"
                  onClick={() => {
                    if (confirm(`¿Eliminar a ${u.nombre}?`)) removeUser(u.id);
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Dependientes (solo nombres para los cuadres) */}
      <div className="pt-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Dependientes
        </h2>
        <p className="text-xs text-muted-foreground mb-2">
          Personas que aparecen al asignar un turno. No tienen cuenta ni inician sesión.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const n = nuevoDep.trim();
            if (!n) return;
            if (dependientes.includes(n)) {
              toast.error("Ya existe ese dependiente");
              return;
            }
            addDependiente(n);
            setNuevoDep("");
            toast.success("Dependiente agregado");
          }}
          className="flex gap-2 mb-2"
        >
          <Input
            placeholder="Nombre del dependiente"
            value={nuevoDep}
            onChange={(e) => setNuevoDep(e.target.value)}
          />
          <Button type="submit" className="rounded-xl gradient-emerald">
            <UserPlus className="h-4 w-4 mr-1" /> Añadir
          </Button>
        </form>
        <div className="space-y-2">
          {dependientes.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card p-4 text-center text-xs text-muted-foreground">
              No hay dependientes. Añade uno arriba.
            </div>
          )}
          {dependientes.map((d) => (
            <div
              key={d}
              className="flex items-center gap-2 rounded-2xl border border-border bg-card p-3 shadow-soft"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-foreground">
                <UserIcon className="h-4 w-4" />
              </div>
              <div className="flex-1 font-medium">{d}</div>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8"
                title="Renombrar"
                onClick={() => {
                  const v = prompt("Nuevo nombre", d);
                  if (v && v.trim() && v.trim() !== d) updateDependiente(d, v.trim());
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-8 w-8 text-destructive"
                onClick={() => {
                  if (confirm(`¿Eliminar a ${d}?`)) removeDependiente(d);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={!!pinUser} onOpenChange={(v) => !v && setPinUser(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Nuevo PIN para {pinUser?.nombre}</DialogTitle>
          </DialogHeader>
          {pinUser && (
            <ChangePinForm
              user={pinUser}
              onDone={async (pin) => {
                await updatePin(pinUser.id, pin);
                toast.success("PIN actualizado");
                setPinUser(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function NewUserForm({ onDone }: { onDone: () => void }) {
  const { createUser } = usePinStore();
  const [nombre, setNombre] = useState("");
  const [role, setRole] = useState<PinRole>("duena");
  const [stage, setStage] = useState<"form" | "pin" | "confirm">("form");
  const [first, setFirst] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (stage === "form") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!nombre.trim()) return;
          setStage("pin");
        }}
        className="space-y-3"
      >
        <DialogHeader>
          <DialogTitle>Nuevo usuario</DialogTitle>
        </DialogHeader>
        <div className="space-y-1">
          <Label>Nombre</Label>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>Rol</Label>
          <Select value={role} onValueChange={(v) => setRole(v as PinRole)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="duena">Dueña</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="submit" className="h-11 w-full rounded-xl gradient-primary">
          Crear PIN
        </Button>
      </form>
    );
  }
  if (stage === "pin") {
    return (
      <div className="space-y-3">
        <DialogHeader>
          <DialogTitle>PIN de 6 dígitos</DialogTitle>
        </DialogHeader>
        <PinPad
          error={error}
          onComplete={(p) => {
            setFirst(p);
            setError(null);
            setStage("confirm");
          }}
        />
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <DialogHeader>
        <DialogTitle>Confirma el PIN</DialogTitle>
      </DialogHeader>
      <PinPad
        error={error}
        onComplete={async (p) => {
          if (p !== first) {
            setError("No coincide");
            setFirst("");
            setStage("pin");
            return;
          }
          await createUser({ nombre: nombre.trim(), role, pin: p });
          toast.success("Usuario creado");
          onDone();
        }}
      />
    </div>
  );
}

function ChangePinForm({ user, onDone }: { user: PinUser; onDone: (pin: string) => void }) {
  const [first, setFirst] = useState("");
  const [stage, setStage] = useState<"new" | "confirm">("new");
  const [error, setError] = useState<string | null>(null);
  if (stage === "new") {
    return (
      <PinPad
        error={error}
        onComplete={(p) => {
          setFirst(p);
          setStage("confirm");
        }}
      />
    );
  }
  return (
    <PinPad
      error={error}
      onComplete={(p) => {
        if (p !== first) {
          setError("No coincide");
          setFirst("");
          setStage("new");
          return;
        }
        onDone(p);
      }}
    />
  );
}
