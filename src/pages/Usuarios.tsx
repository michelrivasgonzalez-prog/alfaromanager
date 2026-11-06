import { useState } from "react";
import { usePinStore, PinUser, PinRole } from "@/store/pinStore";
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
import { Plus, Trash2, Users as UsersIcon, Lock, Pencil, Shield, Crown, User as UserIcon, KeyRound, UserPlus, Camera } from "lucide-react";
import { toast } from "sonner";
import { PinPad } from "@/components/PinPad";
import { deleteDependiente, deletePinUserRemote, pushDependiente, pushPinUser, pushSettings } from "@/lib/sync";
import { Avatar } from "@/components/Avatar";

const ROLE_INFO: Record<PinRole, { label: string; Icon: any; cls: string }> = {
  admin: { label: "Admin", Icon: Shield, cls: "gradient-primary text-primary-foreground" },
  duena: { label: "Dueña", Icon: Crown, cls: "gradient-emerald text-secondary-foreground" },
  dependiente: { label: "Dependiente", Icon: UserIcon, cls: "bg-muted text-foreground" },
};

export default function Usuarios() {
  const { users, deleteUser, activeUserId, currentUser } = usePinStore();
  const { dependientes, settings, history, addDependiente, deleteDependiente: removeDependiente } =
    useCuadreStore();

  const [openNew, setOpenNew] = useState(false);
  const [pinUser, setPinUser] = useState<PinUser | null>(null);
  const [nuevoDep, setNuevoDep] = useState("");
  const [puntoNuevoDep, setPuntoNuevoDep] = useState<PuntoVenta>("Cafetería");

  const me = currentUser();
  const isDuena = me?.role === "duena";

  return (
    <div className="space-y-6 pb-6">
      {/* Cabecera */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Usuarios y Personal</h1>
          <p className="text-xs text-muted-foreground">
            Control de accesos con PIN y catálogo de dependientes
          </p>
        </div>
        <Dialog open={openNew} onOpenChange={setOpenNew}>
          <DialogTrigger asChild>
            <Button size="sm" className="rounded-xl gradient-primary text-xs">
              <Plus className="mr-1.5 h-3.5 w-3.5" /> Nuevo usuario
            </Button>
          </DialogTrigger>
          <DialogContent className="rounded-2xl">
            <NewUserForm onDone={() => setOpenNew(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Lista de usuarios con PIN */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <Lock className="h-3.5 w-3.5" /> Cuentas con acceso (PIN)
        </div>
        <div className="grid gap-2">
          {users.map((u) => {
            const role = ROLE_INFO[u.role] ?? ROLE_INFO.dependiente;
            const Icon = role.Icon;
            const isMe = u.id === activeUserId;
            const protegido = u.role === "admin" && isDuena;

            return (
              <div
                key={u.id}
                className="flex items-center justify-between rounded-2xl border border-border bg-card p-3.5 shadow-soft"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl shadow-soft ${role.cls}`}
                  >
                    <Icon className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm">{u.nombre}</span>
                      {isMe && (
                        <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          Tú
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground">{role.label}</span>
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {!protegido && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-xl"
                      title="Cambiar PIN"
                      onClick={() => setPinUser(u)}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {!protegido && !isMe && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 rounded-xl text-destructive hover:text-destructive"
                      title="Eliminar cuenta"
                      onClick={async () => {
                        if (confirm(`¿Eliminar la cuenta de ${u.nombre}?`)) {
                          await deleteUser(u.id);
                          deletePinUserRemote(u.id).catch((e) => toast.error(e.message));
                          toast.success("Cuenta eliminada");
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Lista de Dependientes */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <UsersIcon className="h-3.5 w-3.5" /> Dependientes ({dependientes.length})
          </div>
        </div>

        {/* Formulario rápido para agregar dependiente */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const nom = nuevoDep.trim();
            if (!nom) return;
            if (dependientes.includes(nom)) {
              toast.error("Ya existe un dependiente con ese nombre");
              return;
            }
            addDependiente(nom);
            const current = settings.dependientePunto ?? {};
            updateDependientesSettings({
              dependientePunto: { ...current, [nom]: puntoNuevoDep },
            });
            pushDependiente(nom).catch((e) => toast.error(e.message));
            pushSettings().catch((e) => toast.error(e.message));
            setNuevoDep("");
            toast.success(`Dependiente ${nom} agregado`);
          }}
          className="flex gap-2"
        >
          <Input
            placeholder="Nombre del nuevo dependiente…"
            value={nuevoDep}
            onChange={(e) => setNuevoDep(e.target.value)}
            className="rounded-xl h-10 text-xs flex-1"
          />
          <Select
            value={puntoNuevoDep}
            onValueChange={(v) => setPuntoNuevoDep(v as PuntoVenta)}
          >
            <SelectTrigger className="w-[120px] rounded-xl h-10 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-popover">
              <SelectItem value="Cafetería">Cafetería</SelectItem>
              <SelectItem value="Mipyme">Mipyme</SelectItem>
            </SelectContent>
          </Select>
          <Button type="submit" className="rounded-xl gradient-primary h-10 px-3 text-xs shrink-0">
            <UserPlus className="h-4 w-4 mr-1" /> Agregar
          </Button>
        </form>

        {/* Tarjetas de dependientes ordenados: Activos primero, Inactivos al final */}
        <div className="grid gap-2">
          {dependientes.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
              No hay dependientes registrados.
            </div>
          )}

          {dependientes
            .slice()
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
                      <Avatar nombre={d} size={36} />
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
          try {
            const nuevo = await createUser({ nombre, role, pin: p });
            pushPinUser(nuevo).catch((e) => toast.error(e.message));
            toast.success(`Usuario ${nombre} creado`);
            onDone();
          } catch (e: any) {
            setError(e.message);
          }
        }}
      />
    </div>
  );
}

function ChangePinForm({ user, onDone }: { user: PinUser; onDone: (pin: string) => void }) {
  const [stage, setStage] = useState<"pin" | "confirm">("pin");
  const [first, setFirst] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (stage === "pin") {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">Escribe el nuevo PIN de 6 dígitos</p>
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
      <p className="text-xs text-muted-foreground">Confirma el nuevo PIN</p>
      <PinPad
        error={error}
        onComplete={(p) => {
          if (p !== first) {
            setError("No coincide");
            setFirst("");
            setStage("pin");
            return;
          }
          onDone(p);
        }}
      />
    </div>
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
  const [foto, setFoto] = useState<string | null>(settings.dependienteFotos?.[dependiente] ?? null);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        const size = 180;
        canvas.width = size;
        canvas.height = size;
        const minDim = Math.min(img.width, img.height);
        const sx = (img.width - minDim) / 2;
        const sy = (img.height - minDim) / 2;
        ctx?.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
        setFoto(dataUrl);
      };
      img.src = evt.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

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

    // 2. Guardar Punto habitual, Estado y Foto
    const targetNombre = nuevoNombre !== dependiente ? nuevoNombre : dependiente;
    const nextPuntos = { ...(settings.dependientePunto ?? {}), [targetNombre]: punto };
    const nextInactivos = !activo
      ? Array.from(new Set([...inactivos, targetNombre]))
      : inactivos.filter((n) => n !== targetNombre);

    const nextFotos = { ...(settings.dependienteFotos ?? {}) };
    if (nuevoNombre !== dependiente && nextFotos[dependiente]) {
      delete nextFotos[dependiente];
    }
    if (foto) {
      nextFotos[targetNombre] = foto;
    } else {
      delete nextFotos[targetNombre];
    }

    updateSettings({
      dependientePunto: nextPuntos,
      dependientesInactivos: nextInactivos,
      dependienteFotos: nextFotos,
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
          {/* Vista previa y carga de foto */}
          <div className="flex flex-col items-center justify-center gap-2.5 pb-2">
            <Avatar nombre={nombre || dependiente} src={foto || undefined} size={76} />
            <div className="flex items-center gap-2">
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleImageChange}
                />
                <Button size="sm" variant="outline" className="rounded-xl h-8 text-xs pointer-events-none" asChild>
                  <span>
                    <Camera className="mr-1.5 h-3.5 w-3.5" />
                    {foto ? "Cambiar foto" : "Subir foto"}
                  </span>
                </Button>
              </label>
              {foto && (
                <Button
                  size="sm"
                  variant="ghost"
                  className="rounded-xl h-8 text-xs text-destructive hover:text-destructive"
                  onClick={() => setFoto(null)}
                >
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                  Quitar
                </Button>
              )}
            </div>
          </div>

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
