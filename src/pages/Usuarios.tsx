import { useState } from "react";
import { usePinStore, PinRole, PinUser, hashPin } from "@/store/pinStore";
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
  Search,
  UsersRound,
  ShieldCheck,
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

type FormDependiente = { nombreOriginal: string; nombre: string; nombres?: string; apellidos?: string; punto?: PuntoVenta | "ambos"; foto?: string; inactivo: boolean; permisoCobrar?: boolean; pin?: string; };

export default function Usuarios() {
  const { role: currentRole } = useAuth();
  const isAdmin = currentRole === "admin";
  const { users, removeUser, updateUser, updatePin, createUser } = usePinStore();
  const [open, setOpen] = useState(false);
  const [pinUser, setPinUser] = useState<PinUser | null>(null);
  const [nuevoPinNombre, setNuevoPinNombre] = useState<string | null>(null);

  const { dependientes, addDependiente, updateDependiente, removeDependiente, settings, history, updateSettings } =
    useCuadreStore();
  const [filtroDependientes, setFiltroDependientes] = useState<"todos" | "activos" | "inactivos">("todos");
  const [buscarDependiente, setBuscarDependiente] = useState("");

  const [depEditing, setDepEditing] = useState<FormDependiente | null>(null);

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
  const dependientesActivos = dependientes.filter((d) =>
    !settings.dependientesInactivos?.includes(d));
  const dependientesInactivos = dependientes.length - dependientesActivos.length;
  const sinPin = dependientes.filter((d) =>
    !users.some((u) => u.nombre.trim().toLowerCase() === d.trim().toLowerCase())).length;
  const dependientesOrdenados = [...dependientes]
    .filter((d) => {
      const inactivo = Boolean(settings.dependientesInactivos?.includes(d));
      if (filtroDependientes === "activos" && inactivo) return false;
      if (filtroDependientes === "inactivos" && !inactivo) return false;
      const nombre = d.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      const busca = buscarDependiente.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
      return !busca || nombre.includes(busca);
    })
    .sort((a, b) => {
    const aInactivo = Boolean((settings as any).dependientesInactivos?.includes(a));
    const bInactivo = Boolean((settings as any).dependientesInactivos?.includes(b));

    if (aInactivo !== bInactivo) {
      return aInactivo ? 1 : -1; // Activos (false) arriba, Inactivos (true) abajo
    }
    return a.localeCompare(b, "es");
  });

  return (
    <div className="space-y-4 pb-16">
      <header className="alfaro-page-header">
        <h1 className="text-xl font-extrabold sm:text-2xl">Usuarios</h1>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">Personal, roles y PIN de acceso</p>
      </header>
      <section className="grid grid-cols-3 gap-2" aria-label="Resumen del personal">
        <div className="alfaro-surface min-w-0 p-3">
          <CheckCircle2 className="h-4 w-4 text-secondary" />
          <p className="mt-2 text-[11px] text-muted-foreground">Activos</p>
          <p className="text-lg font-extrabold tabular-nums">{dependientesActivos.length}</p>
        </div>
        <div className="alfaro-surface min-w-0 p-3">
          <XCircle className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-[11px] text-muted-foreground">Inactivos</p>
          <p className="text-lg font-extrabold tabular-nums">{dependientesInactivos}</p>
        </div>
        <div className="alfaro-surface min-w-0 p-3">
          <KeyRound className="h-4 w-4 text-amber-600" />
          <p className="mt-2 text-[11px] text-muted-foreground">Sin PIN</p>
          <p className="text-lg font-extrabold tabular-nums">{sinPin}</p>
        </div>
      </section>

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
        <div className="space-y-2 pb-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/>
            <Input aria-label="Buscar dependiente" value={buscarDependiente}
              onChange={(e) => setBuscarDependiente(e.target.value)}
              placeholder="Buscar dependiente…" className="h-11 rounded-xl pl-10"/>
          </div>
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1" role="group" aria-label="Estado del personal">
            {([
              ["todos", "Todos"],
              ["activos", "Activos"],
              ["inactivos", "Inactivos"],
            ] as const).map(([value, label]) => (
              <button key={value} type="button" aria-pressed={filtroDependientes === value}
                onClick={() => setFiltroDependientes(value)}
                className={"min-h-10 rounded-lg px-2 text-xs font-semibold transition-colors " +
                  (filtroDependientes === value ? "bg-card text-secondary shadow-sm" : "text-muted-foreground")}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <Button className="mb-3 w-full rounded-xl gradient-emerald" onClick={() => setDepEditing({ nombreOriginal:"", nombre:"", nombres:"", apellidos:"", punto:"Cafetería", inactivo:false, permisoCobrar:false })}>
          <UserPlus className="h-4 w-4 mr-1"/> Añadir dependiente
        </Button>

        <div className="space-y-2">
          {dependientesOrdenados.length === 0 && (
            <div className="rounded-2xl border border-dashed border-border bg-card p-4 text-center text-xs text-muted-foreground">
              {dependientes.length ? "No hay personal que coincida con el filtro." : "No hay dependientes. Añade uno arriba."}
            </div>
          )}

          {dependientesOrdenados.map((d) => {
            const puntoHab = settings.dependientesAmbosPuntos?.includes(d) ? "Ambos puntos" : settings.dependientePunto?.[d] || puntoHabitual(d, settings, history);
            const isInactivo = (settings as any).dependientesInactivos?.includes(d);
            const cuentaPin = users.find((u) => u.nombre.trim().toLowerCase() === d.trim().toLowerCase());

            return (
              <div
                key={d}
                className="flex items-center justify-between gap-2 rounded-2xl border border-border/70 bg-card p-3.5 shadow-soft"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
                  <Avatar nombre={d} size="md" />
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate text-foreground flex items-center gap-1.5">
                      {d}
                      {cuentaPin && (
                        <span title="PIN Configurado"><KeyRound className="h-3 w-3 text-emerald-500" /></span>
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
                  className="h-10 w-10 shrink-0 rounded-xl border border-border/70 text-secondary hover:bg-muted"
                  aria-label={"Editar dependiente " + d}
                  title="Editar dependiente y PIN"
                  onClick={() => {
                    setDepEditing({
                      nombreOriginal: d,
                      nombre: d,
                      punto: settings.dependientesAmbosPuntos?.includes(d) ? "ambos" : settings.dependientePunto?.[d],
                      nombres: settings.dependienteNombres?.[d]?.nombres,
                      apellidos: settings.dependienteNombres?.[d]?.apellidos,
                      permisoCobrar: (settings.dependientesPermisoCobrar ?? []).includes(d),
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
          onSave={async (data) => {
            const oldName = data.nombreOriginal;
            const newName = data.nombre.trim();
            const key = (n: string) => n.trim().toLowerCase();
            if (!newName || (!data.nombres?.trim() || !data.apellidos?.trim())) throw Error("Completa nombre y apellidos.");
            if (dependientes.some(d=>key(d)===key(newName)&&key(d)!==key(oldName))) throw Error("Ya existe ese dependiente.");
            const cuenta = usePinStore.getState().users.find(v=>key(v.nombre)===key(oldName || newName));
            if (cuenta && cuenta.role !== "dependiente") throw Error("El nombre pertenece a otro usuario.");
            if (usePinStore.getState().users.some(v=>key(v.nombre)===key(newName)&&v.id!==cuenta?.id)) throw Error("El nombre ya tiene otra cuenta PIN.");
            if ((!cuenta || data.pin) && !/^\d{6}$/.test(data.pin ?? "")) throw Error("Asigna un PIN de seis dígitos.");
            if(data.pin) {
              for(const otro of usePinStore.getState().users) if(otro.id!==cuenta?.id && await hashPin(data.pin,otro.id)===otro.pinHash) throw Error("Ese PIN ya está asignado a otro usuario.");
            }
            if(!oldName) {
              await pushDependiente(newName);
              addDependiente(newName);
            } else if(oldName!==newName) {
              await pushDependiente(newName);
              updateDependiente(oldName,newName);
            }
            if(cuenta) {
              const pinHash = data.pin ? await hashPin(data.pin,cuenta.id) : cuenta.pinHash;
              await pushPinUser({...cuenta,nombre:newName,pinHash});
              if(data.pin) await updatePin(cuenta.id,data.pin);
              updateUser(cuenta.id,{nombre:newName});
            } else {
              const nuevoUsuario = await createUser({nombre:newName,role:"dependiente",pin:data.pin!});
              await pushPinUser(nuevoUsuario);
            }
            if(oldName && oldName!==newName) await deleteDependiente(oldName);
            const actuales=useCuadreStore.getState().settings;
            const nextPuntos={...(actuales.dependientePunto??{})};
            const nextFotos={...(actuales.dependienteFotos??{})};
            const nextNombres={...(actuales.dependienteNombres??{})};
            const filtrar=(list?:string[]) => (list??[]).filter(n=>key(n)!==key(oldName)&&key(n)!==key(newName));
            delete nextPuntos[oldName]; delete nextPuntos[newName];
            delete nextFotos[oldName]; delete nextNombres[oldName];
            if(data.punto && data.punto!=="ambos") nextPuntos[newName]=data.punto;
            if(data.foto) nextFotos[newName]=data.foto; else delete nextFotos[newName];
            nextNombres[newName]={nombres:data.nombres!,apellidos:data.apellidos!};
            updateSettings({
              dependientePunto:nextPuntos,dependienteFotos:nextFotos,dependienteNombres:nextNombres,
              dependientesAmbosPuntos:[...filtrar(actuales.dependientesAmbosPuntos),...(data.punto==="ambos"?[newName]:[])],
              dependientesInactivos:[...filtrar(actuales.dependientesInactivos),...(data.inactivo?[newName]:[])],
              dependientesPermisoCobrar:[...filtrar(actuales.dependientesPermisoCobrar),...(data.permisoCobrar?[newName]:[])],
            });
            await pushSettings();
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
        />
      )}
    </div>
  );
}

function EditarDependienteModal({dep,users,onClose,onSave,onDelete}:{
  dep: FormDependiente; users: PinUser[]; onClose:()=>void; onSave:(data:FormDependiente)=>Promise<void>; onDelete:(nombre:string)=>void;
}) {
  const [form,setForm]=useState<FormDependiente>({...dep});
  const [nombres,setNombres]=useState(dep.nombres ?? dep.nombre.split(" ")[0] ?? "");
  const [apellidos,setApellidos]=useState(dep.apellidos ?? dep.nombre.split(" ").slice(1).join(" "));
  const [pin,setPin]=useState("");
  const [confirmPin,setConfirmPin]=useState("");
  const [guardando,setGuardando]=useState(false);
  const cuentaPin=users.find(u=>u.nombre.trim().toLowerCase()===dep.nombreOriginal.trim().toLowerCase());
  const nombreCompleto=[nombres.trim(),apellidos.trim()].filter(Boolean).join(" ");
  const guardar=async()=>{
    if(!nombres.trim()||!apellidos.trim()) return toast.error("Completa nombre y apellidos.");
    if(!cuentaPin||pin||confirmPin) {
      if(!/^\d{6}$/.test(pin)||pin!==confirmPin) return toast.error("Confirma un PIN de seis dígitos que coincida.");
    }
    setGuardando(true);
    try{await onSave({...form,nombre:nombreCompleto,nombres:nombres.trim(),apellidos:apellidos.trim(),pin:pin||undefined});}
    catch(e){toast.error(e instanceof Error?e.message:"No se pudo completar el guardado. Revisa la conexión.");}
    finally{setGuardando(false);}
  };

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
    <Dialog open={true} onOpenChange={(v) => !v && !guardando && onClose()}>
      <DialogContent className="rounded-2xl max-w-sm max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{dep.nombreOriginal ? "Editar dependiente" : "Nuevo dependiente"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Foto */}
          <div className="flex flex-col items-center justify-center gap-2">
            <Avatar nombre={nombreCompleto || "Dependiente"} src={form.foto} size="xl" className="border-2 border-primary/20 shadow-md" />
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

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1"><Label>Nombre(s)</Label><Input value={nombres} onChange={e=>setNombres(e.target.value)} placeholder="Nombre" className="rounded-xl"/></div>
            <div className="space-y-1"><Label>Apellidos</Label><Input value={apellidos} onChange={e=>setApellidos(e.target.value)} placeholder="Apellidos" className="rounded-xl"/></div>
          </div>
          <div className="space-y-2 rounded-xl border border-border p-3">
            <Label className="flex items-center gap-2"><KeyRound className="h-4 w-4"/>{cuentaPin?"Cambiar PIN (opcional)":"Asignar PIN"}</Label>
            <Input type="password" inputMode="numeric" maxLength={6} autoComplete="new-password" value={pin} onChange={e=>setPin(e.target.value.replace(/\D/g,""))} placeholder="PIN de seis dígitos"/>
            <Input type="password" inputMode="numeric" maxLength={6} autoComplete="new-password" value={confirmPin} onChange={e=>setConfirmPin(e.target.value.replace(/\D/g,""))} placeholder="Confirmar PIN"/>
            {cuentaPin&&<p className="text-xs text-muted-foreground">Déjalo vacío para conservar el PIN actual.</p>}
          </div>

          {/* Punto de Venta */}
          <div className="space-y-1">
            <Label className="text-xs font-semibold">Punto de Venta Habitual</Label>
            <Select
              value={form.punto || "ninguno"}
              onValueChange={(v) =>
                setForm((prev) => ({
                  ...prev,
                  punto: v === "ninguno" ? undefined : (v as PuntoVenta | "ambos"),
                }))
              }
            >
              <SelectTrigger className="rounded-xl">
                <SelectValue placeholder="Sin punto asignado" />
              </SelectTrigger>
              <SelectContent className="rounded-2xl">
                <SelectItem value="ninguno">Sin asignar (Por historial)</SelectItem>
                <SelectItem value="Cafetería">Cafetería</SelectItem>
                <SelectItem value="Mipyme">MiPyME</SelectItem>
                <SelectItem value="ambos">Ambos puntos de venta</SelectItem>
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
          {/* Permiso especial de Cobros (Solo Abonos) */}
          <div className="flex items-center justify-between p-3 rounded-xl border border-border bg-muted/20">
            <div>
              <span className="text-xs font-semibold block text-foreground">Permitir Cobrar (solo abonos)</span>
              <span className="text-[11px] text-muted-foreground">
                Acceso para registrar pagos de clientes sin crear deudas ni editar clientes
              </span>
            </div>
            <input type="checkbox" checked={!!form.permisoCobrar} onChange={e=>setForm(prev=>({...prev,permisoCobrar:e.target.checked}))}
              className="h-4 w-4 rounded accent-primary cursor-pointer"
            />
          </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between pt-2">
          {dep.nombreOriginal && <Button
            type="button"
            variant="ghost"
            disabled={guardando}
            onClick={() => onDelete(form.nombreOriginal)}
            className="rounded-xl text-destructive hover:bg-destructive/10 justify-start sm:justify-center"
          >
            <Trash2 className="h-4 w-4 mr-1.5" /> Eliminar
          </Button>}

          <div className="flex items-center gap-2 justify-end">
            <Button type="button" variant="outline" disabled={guardando} onClick={onClose} className="rounded-xl">
              Cancelar
            </Button>
            <Button type="button" disabled={guardando} onClick={()=>void guardar()} className="rounded-xl gradient-primary">
              {guardando?"Guardando…":"Guardar"}
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
