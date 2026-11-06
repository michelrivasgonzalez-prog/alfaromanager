import { useState } from "react";
import { usePinStore, PinRole, PinUser } from "@/store/pinStore";
import { useAuth } from "@/hooks/useAuth";
import { useCuadreStore, puntoHabitual, PuntoVenta } from "@/store/cuadreStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  Lock,
  Pencil,
  Shield,
  Crown,
  User as UserIcon,
  KeyRound,
  UserPlus,
  Upload,
  X,
  Building2,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { PinPad } from "@/components/PinPad";
import { deleteDependiente, deletePinUserRemote, pushDependiente, pushPinUser, pushSettings } from "@/lib/sync";
import Avatar from "@/components/Avatar";

const ROLE_INFO: Record<PinRole, { label: string; Icon: any; cls: string }> = {
  admin: { label: "Admin", Icon: Shield, cls: "gradient-primary text-primary-foreground" },
  duena: { label: "Dueña", Icon: Crown, cls: "gradient-emerald text-secondary-foreground" },
  dependiente: { label: "Dependiente", Icon: UserIcon, cls: "bg-muted text-foreground" },
};

export default function Usuarios() {
  const { role: currentRole } = useAuth();
  const isAdmin = currentRole === "admin";
  const { users, removeUser, updateUser, updatePin } = usePinStore();
  const [open, setOpen] = useState(false);
  const [pinUser, setPinUser] = useState<PinUser | null>(null);
  const [nuevoPinNombre, setNuevoPinNombre] = useState<string | null>(null);

  const { dependientes, addDependiente, updateDependiente, removeDependiente, settings, history, updateSettings } =
    useCuadreStore();
  const [nuevoDep, setNuevoDep] = useState("");

  const [depEditing, setDepEditing] = useState<{
    nombreOriginal: string;
    nombre: string;
    punto?: PuntoVenta;
    foto?: string;
    inactivo: boolean;
  } | null>(null);

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

  // Ordenar dependientes: primero activos, luego inactivos (y alfabéticamente dentro de cada grupo)
  const dependientesOrdenados = [...dependientes].sort((a, b) => {
    const aInactivo = Boolean((settings as any).dependientesInactivos?.includes(a));
    const bInactivo = Boolean((settings as any).dependientesInactivos?.includes(b));

    if (aInactivo !== bInactivo) {
      return aInactivo ? 1 : -1; // Activos (false) arriba, Inactivos (true) abajo
    }
    return a.localeCompare(b, "es");
  });

  return (
    <div className="space-y-4 pb-16">
      <h1 className="text-2xl font-bold">Usuarios</h1>

      {/* Cuentas de acceso administrativas */}
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Cuentas administrativas
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
                <div className="font-medium text-sm">{u.nombre}</div>
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

      {/* Dependientes */}
      <div className="pt-2">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Dependientes
        </h2>
        <p className="text-xs text-muted-foreground mb-2">
          Gestión de dependientes, foto, punto de venta y PIN de acceso.
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
          className="flex gap-2 mb-3"
        >
          <Input
            placeholder="Nombre del dependiente"
            value={nuevoDep}
            onChange={(e) => setNuevoDep(e.target.value)}
            className="rounded-xl"
          />
          <Button type="submit" className="rounded-xl gradient-emerald">
            <UserPlus className="h-4 w-4 mr-1" /> Añadir
          </Button>
        </form>

        <div className="space-y-2">
          {dependientesOrdenados.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card p-4 text-center text-xs text-muted-foreground">
              No hay dependientes. Añade uno arriba.
            </div>
          )}

          {dependientesOrdenados.map((d) => {
            const puntoHab = settings.dependientePunto?.[d] || puntoHabitual(d, settings, history);
            const isInactivo = (settings as any).dependientesInactivos?.includes(d);
            const cuentaPin = users.find((u) => u.nombre.trim().toLowerCase() === d.trim().toLowerCase());

            return (
              <div
                key={d}
                className="flex items-center justify-between rounded-2xl border border-border bg-card p-3 shadow-soft"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
                  <Avatar nombre={d} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate text-foreground flex items-center gap-1.5">
                      {d}
                      {cuentaPin && (
                        <KeyRound className="h-3 w-3 text-emerald-500" title="PIN Configurado" />
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                      <span className="flex items-center gap-1">
                        <Building2 className="h-3 w-3 text-primary/70" />
                        {puntoHab || "Sin punto"}
                      </span>
                      <span>•</span>
                      {isInactivo ? (
                        <span className="inline-flex items-center gap-0.5 font-medium text-destructive">
                          <XCircle className="h-3 w-3" /> Inactivo
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-0.5 font-medium text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" /> Activo
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <Button
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9 rounded-xl text-muted-foreground hover:bg-muted"
                  title="Editar dependiente y PIN"
                  onClick={() => {
                    setDepEditing({
                      nombreOriginal: d,
                      nombre: d,
                      punto: settings.dependientePunto?.[d],
                      foto: settings.dependienteFotos?.[d],
                      inactivo: Boolean((settings as any).dependientesInactivos?.includes(d)),
                    });
                  }}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Modal Cambiar PIN Existente */}
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

      {/* Modal Crear PIN Nuevo para Dependiente */}
      <Dialog open={!!nuevoPinNombre} onOpenChange={(v) => !v && setNuevoPinNombre(null)}>
        <DialogContent className="rounded-2xl">
          {nuevoPinNombre && (
            <CrearPinDependienteForm
              nombre={nuevoPinNombre}
              onDone={() => setNuevoPinNombre(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Modal Editar Dependiente */}
      {depEditing && (
        <EditarDependienteModal
          dep={depEditing}
          users={users}
          onClose={() => setDepEditing(null)}
          onSave={(data) => {
            const oldName = data.nombreOriginal;
            const newName = data.nombre.trim();

            if (!newName) {
              toast.error("El nombre no puede estar vacío");
              return;
            }

            if (oldName !== newName) {
              updateDependiente(oldName, newName);
              const cuentaUser = users.find((u) => u.nombre.trim().toLowerCase() === oldName.trim().toLowerCase());
              if (cuentaUser) {
                updateUser(cuentaUser.id, { nombre: newName });
                pushPinUser({ ...cuentaUser, nombre: newName }).catch((e) => toast.error(e.message));
              }
              Promise.all([deleteDependiente(oldName), pushDependiente(newName)]).catch((e) =>
                toast.error(e.message)
              );
            }

            const nextPuntos = { ...(settings.dependientePunto ?? {}) };
            const nextFotos = { ...(settings.dependienteFotos ?? {}) };
            let nextInactivos = [...((settings as any).dependientesInactivos ?? [])];

            if (oldName !== newName) {
              delete nextPuntos[oldName];
              delete nextFotos[oldName];
              nextInactivos = nextInactivos.filter((x) => x !== oldName);
            }

            if (data.punto) {
              nextPuntos[newName] = data.punto;
            } else {
              delete nextPuntos[newName];
            }

            if (data.foto) {
              nextFotos[newName] = data.foto;
            } else {
              delete nextFotos[newName];
            }

            if (data.inactivo) {
              if (!nextInactivos.includes(newName)) nextInactivos.push(newName);
            } else {
              nextInactivos = nextInactivos.filter((x) => x !== newName);
            }

            updateSettings({
              dependientePunto: nextPuntos,
              dependienteFotos: nextFotos,
              dependientesInactivos: nextInactivos,
            } as any);

            pushSettings().catch((er) => toast.error(er.message));
            toast.success("Dependiente guardado");
            setDepEditing(null);
          }}
          onDelete={(nombre) => {
            if (confirm(`¿Seguro que deseas eliminar a ${nombre}?`)) {
              removeDependiente(nombre);
              const cuentaUser = users.find((u) => u.nombre.trim().toLowerCase() === nombre.trim().toLowerCase());
              if (cuentaUser) {
                removeUser(cuentaUser.id);
                deletePinUserRemote(cuentaUser.id).catch((e) => toast.error(e.message));
              }
              deleteDependiente(nombre).catch((e) => toast.error(e.message));
              toast.success("Dependiente eliminado");
              setDepEditing(null);
            }
          }}
          onOpenPinModal={(u) => setPinUser(u)}
          onCrearPin={(nombre) => setNuevoPinNombre(nombre)}
        />
      )}
    </div>
  );
}

function EditarDependienteModal({
  dep,
  users,
  onClose,
  onSave,
  onDelete,
  onOpenPinModal,
  onCrearPin,
}: {
  dep: {
    nombreOriginal: string;
    nombre: string;
    punto?: PuntoVenta;
    foto?: string;
    inactivo: boolean;
  };
  users: PinUser[];
  onClose: () => void;
  onSave: (data: typeof dep) => void;
  onDelete: (nombre: string) => void;
  onOpenPinModal: (u: PinUser) => void;
  onCrearPin: (nombre: string) => void;
}) {
  const [form, setForm] = useState({ ...dep });
  const cuentaPin = users.find(
    (u) => u.nombre.trim().toLowerCase() === form.nombreOriginal.trim().toLowerCase()
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      return toast.error("Selecciona una imagen válida");
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const MAX_SIZE = 200;

        let width = img.width;
        let height = img.height;
        let minDim = Math.min(width, height);
        let sx = (width - minDim) / 2;
        let sy = (height - minDim) / 2;

        canvas.width = MAX_SIZE;
        canvas.height = MAX_SIZE;

        if (ctx) {
          ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, MAX_SIZE, MAX_SIZE);
          const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
          setForm((prev) => ({ ...prev, foto: dataUrl }));
          toast.success("Foto procesada correctamente");
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  return (
    <Dialog open={true} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="rounded-2xl max-w-sm">
        <DialogHeader>
          <DialogTitle>Editar Dependiente</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Foto */}
          <div className="flex flex-col items-center justify-center gap-2">
            <Avatar nombre={form.nombre} src={form.foto} size="xl" className="border-2 border-primary/20 shadow-md" />
            <div className="flex items-center gap-3 mt-1">
              <label
                htmlFor="modal-foto-upload"
                className="cursor-pointer text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
              >
                <Upload className="h-3.5 w-3.5" />
                {form.foto ? "Cambiar foto" : "Subir foto"}
                <input
                  id="modal-foto-upload"
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </label>

              {form.foto && (
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, foto: undefined }))}
                  className="text-xs font-semibold text-destructive hover:underline inline-flex items-center gap-1"
                >
                  <X className="h-3.5 w-3.5" /> Quitar foto
                </button>
              )}
            </div>
          </div>

          {/* Nombre */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Nombre Completo</Label>
            <Input
              value={form.nombre}
              onChange={(e) => setForm((prev) => ({ ...prev, nombre: e.target.value }))}
              placeholder="Nombre del dependiente"
              className="rounded-xl"
            />
          </div>

          {/* Gestión de PIN */}
          <div className="space-y-1 bg-muted/30 p-2.5 rounded-xl border border-border/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold flex items-center gap-1">
                <KeyRound className="h-3.5 w-3.5 text-primary" /> PIN de Acceso
              </span>
              {cuentaPin ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs rounded-lg"
                  onClick={() => onOpenPinModal(cuentaPin)}
                >
                  Cambiar PIN
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="h-7 text-xs rounded-lg gradient-primary"
                  onClick={() => onCrearPin(form.nombre)}
                >
                  <Plus className="h-3 w-3 mr-1" /> Crear PIN
                </Button>
              )}
            </div>
          </div>

          {/* Punto de Venta */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Punto de Venta Habitual</Label>
            <Select
              value={form.punto || "ninguno"}
              onValueChange={(v) =>
                setForm((prev) => ({
                  ...prev,
                  punto: v === "ninguno" ? undefined : (v as PuntoVenta),
                }))
              }
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Sin punto asignado" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="ninguno">Sin asignar (Por historial)</SelectItem>
                <SelectItem value="Cafetería">Cafetería</SelectItem>
                <SelectItem value="Mipyme">Mipyme</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Estado */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Estado del Dependiente</Label>
            <Select
              value={form.inactivo ? "inactivo" : "activo"}
              onValueChange={(v) =>
                setForm((prev) => ({ ...prev, inactivo: v === "inactivo" }))
              }
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="activo">🟢 Activo (Disponible en turnos)</SelectItem>
                <SelectItem value="inactivo">🔴 Inactivo (Oculto en turnos)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between pt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={() => onDelete(form.nombreOriginal)}
            className="rounded-xl text-destructive hover:bg-destructive/10 justify-start sm:justify-center"
          >
            <Trash2 className="h-4 w-4 mr-1.5" /> Eliminar
          </Button>

          <div className="flex items-center gap-2 justify-end">
            <Button type="button" variant="outline" onClick={onClose} className="rounded-xl">
              Cancelar
            </Button>
            <Button type="button" onClick={() => onSave(form)} className="rounded-xl gradient-primary">
              Guardar
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CrearPinDependienteForm({ nombre, onDone }: { nombre: string; onDone: () => void }) {
  const { createUser } = usePinStore();
  const [stage, setStage] = useState<"pin" | "confirm">("pin");
  const [first, setFirst] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (stage === "pin") {
    return (
      <div className="space-y-3">
        <DialogHeader>
          <DialogTitle>PIN de 6 dígitos para {nombre}</DialogTitle>
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
          const created = await createUser({ nombre, role: "dependiente", pin: p });
          pushPinUser(created).catch((e) => toast.error(e.message));
          toast.success(`PIN creado para ${nombre}`);
          onDone();
        }}
      />
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

// reload
