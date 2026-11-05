import { useState } from "react";
import { usePinStore, PinRole, PinUser } from "@/store/pinStore";
import { useAuth } from "@/hooks/useAuth";
import { useCuadreStore, puntoHabitual, PuntoVenta } from "@/store/cuadreStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

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
import { deleteDependiente, deletePinUserRemote, pushDependiente, pushPinUser, pushSettings } from "@/lib/sync";
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
  const { dependientes, addDependiente, settings, history } = useCuadreStore();
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
                  if (v && v.trim()) {
                    updateUser(u.id, { nombre: v.trim() });
                    const next = { ...u, nombre: v.trim() };
                    pushPinUser(next).catch((e) => toast.error(e.message));
                  }
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
                    if (!confirm(`¿Eliminar a ${u.nombre}?`)) return;
                    removeUser(u.id);
                    deletePinUserRemote(u.id).catch((e) => toast.error(e.message));
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
            pushDependiente(n).catch((e) => toast.error(e.message));
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
                              {dependientes.slice()
  .sort((a, b) => {
    const inactivos = settings.dependientesInactivos ?? [];
    const aInactivo = inactivos.includes(a);
    const bInactivo = inactivos.includes(b);
    return Number(aInactivo) - Number(bInactivo);
  })
  .map((d) => {
            const cuentaAsociada = users.find(
              (u) => u.nombre.trim().toLowerCase() === d.trim().toLowerCase()
            );
            const inactivos = settings.dependientesInactivos ?? [];
            const estaInactivo = inactivos.includes(d);
            const puntoActual = puntoHabitual(d, settings, history);

            return (
              <div
                key={d}
                className="rounded-2xl border border-border bg-card p-3.5 shadow-soft space-y-2.5"
              >
                {/* Cabecera: Avatar, Nombre completo y Estado */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                      <UserIcon className="h-4 w-4" />
                    </div>
                    <span className="font-semibold text-sm truncate">{d}</span>
                  </div>

                  <span
                    className={
                      estaInactivo
                        ? "px-2.5 py-0.5 rounded-full bg-muted text-[11px] font-medium text-muted-foreground"
                        : "px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-[11px] font-medium text-emerald-600"
                    }
                  >
                    {estaInactivo ? "Inactivo" : "Activo"}
                  </span>
                </div>

                {/* Pie: Etiquetas informativas y Acciones */}
                <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* Badge de Punto habitual */}
                    <span className="text-[11px] px-2.5 py-1 rounded-lg bg-muted/60 text-foreground font-medium border border-border/40">
                      📍 {puntoActual ?? "Sin punto"}
                    </span>

                    {/* Badge de PIN */}
                    <span
                      className={`text-[11px] px-2.5 py-1 rounded-lg font-medium flex items-center gap-1 ${
                        cuentaAsociada
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <KeyRound className="h-3 w-3 inline" />
                      {cuentaAsociada ? "PIN activo" : "Sin PIN"}
                    </span>
                  </div>

                  {/* Acciones de PIN y Edición */}
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-xl"
                      title={cuentaAsociada ? "Cambiar PIN" : "Asignar PIN de acceso"}
                      onClick={() => {
                        if (cuentaAsociada) {
                          setPinUser(cuentaAsociada);
                        } else {
                          const nuevoUsuario: PinUser = {
                            id: crypto.randomUUID(),
                            nombre: d,
                            role: "dependiente",
                            pinHash: "",
                          };
                          setPinUser(nuevoUsuario);
                        }
                      }}
                    >
                      <KeyRound
                        className={`h-4 w-4 ${
                          cuentaAsociada ? "text-emerald-500" : "text-muted-foreground"
                        }`}
                      />
                    </Button>

                    <EditDependienteDialog
                      dependiente={d}
                      cuentaAsociada={cuentaAsociada}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Dialog open={!!pinUser} onOpenChange={(v) => !v && setPinUser(null)}>
        <DialogContent className="rounded-2xl">
          <DialogHeader>
            <DialogTitle>Asignar / Cambiar PIN a {pinUser?.nombre}</DialogTitle>
          </DialogHeader>
          {pinUser && (
            <ChangePinForm
              user={pinUser}
              onDone={async (pin) => {
                const existe = users.some((u) => u.id === pinUser.id);
                if (existe) {
                  await updatePin(pinUser.id, pin);
                  toast.success(`PIN actualizado para ${pinUser.nombre}`);
                } else {
                  const nuevo = await createUser({
                    nombre: pinUser.nombre,
                    role: pinUser.role || "dependiente",
                    pin: pin,
                  });
                  pushPinUser(nuevo).catch((e) => toast.error(e.message));
                  toast.success(`PIN de acceso creado para ${pinUser.nombre}`);
                }
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
            <SelectTrigger className="rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="duena">Dueña</SelectItem>
              <SelectItem value="dependiente">Dependiente</SelectItem>
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
          const created = await createUser({ nombre: nombre.trim(), role, pin: p });
          pushPinUser(created).catch((e) => toast.error(e.message));
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
        const nextHash = crypto.subtle
          ? import("@/store/pinStore").then((m) => m.hashPin(p, user.id))
          : Promise.resolve(user.pinHash);
        nextHash
          .then((pinHash) => pushPinUser({ ...user, pinHash }))
          .catch((e) => toast.error(e.message));
      }}
    />
  );
}
function EditDependienteDialog({
  dependiente,
  cuentaAsociada,
}: {
  dependiente: string;
  cuentaAsociada?: PinUser;
}) {
  const [open, setOpen] = useState(false);
  const { settings, history, updateDependiente, updateSettings } = useCuadreStore();
  const { updateUser } = usePinStore();

  const [nombre, setNombre] = useState(dependiente);
  const [punto, setPunto] = useState<PuntoVenta>(
    puntoHabitual(dependiente, settings, history) ?? "Cafetería"
  );
  const inactivos = settings.dependientesInactivos ?? [];
  const [activo, setActivo] = useState(!inactivos.includes(dependiente));

  const handleSave = async () => {
    const nuevoNombre = nombre.trim();
    if (!nuevoNombre) return;

    // 1. Renombrar si cambió
    if (nuevoNombre !== dependiente) {
      updateDependiente(dependiente, nuevoNombre);
      if (cuentaAsociada) {
        updateUser(cuentaAsociada.id, { nombre: nuevoNombre });
        pushPinUser({ ...cuentaAsociada, nombre: nuevoNombre }).catch(console.warn);
      }
      await Promise.all([
        deleteDependiente(dependiente),
        pushDependiente(nuevoNombre),
      ]).catch((e) => toast.error(e.message));
    }

    // 2. Guardar Punto habitual y Estado Activo/Inactivo
    const targetNombre = nuevoNombre !== dependiente ? nuevoNombre : dependiente;
    const nextPuntos = { ...(settings.dependientePunto ?? {}), [targetNombre]: punto };
    const nextInactivos = !activo
      ? Array.from(new Set([...inactivos, targetNombre]))
      : inactivos.filter((n) => n !== targetNombre);

    updateSettings({
      dependientePunto: nextPuntos,
      dependientesInactivos: nextInactivos,
    });

    pushSettings()
      .then(() => {
        toast.success("Dependiente actualizado");
        setOpen(false);
      })
      .catch((e) => toast.error(e.message));
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-xl" title="Editar">
          <Pencil className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-2xl space-y-4">
        <DialogHeader>
          <DialogTitle>Editar dependiente</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs">Nombre completo</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              className="rounded-xl h-10"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs">Punto de venta habitual</Label>
            <Select value={punto} onValueChange={(v) => setPunto(v as PuntoVenta)}>
              <SelectTrigger className="rounded-xl h-10">
                <SelectValue />
              </SelectTrigger>
                            <SelectContent className="bg-popover">
                <SelectItem value="Cafetería">Cafetería</SelectItem>
                <SelectItem value="Mipyme">Mipyme</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Label className="text-xs">Estado de la cuenta</Label>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {activo ? "Activo" : "Inactivo"}
              </span>
              <Switch checked={activo} onCheckedChange={setActivo} />
            </div>
          </div>

          <Button
            onClick={handleSave}
            className="w-full h-11 rounded-xl gradient-primary mt-2"
          >
            Guardar cambios
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
