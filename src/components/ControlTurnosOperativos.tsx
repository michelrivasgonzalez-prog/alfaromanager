import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Clock3, KeyRound, RefreshCw, ShieldAlert, UserRoundPlus } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { usePinStore } from "@/store/pinStore";
import { useCuadreStore, PUNTOS, type PuntoVenta } from "@/store/cuadreStore";
import { useControlTurnos } from "@/hooks/useControlTurnos";
import { asignarTurnoOperativo, iniciosDesdeProductos, type AsignacionOperativa } from "@/lib/turnosOperativos";
import { consultarUltimasEntregas, type EntregaReciente } from "@/lib/turnosOperativos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Fuente = "precuadre" | "cuadre" | "manual";
const fecha = (valor?: string | null) => valor ? new Date(valor).toLocaleString("es-CU", {
  day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
}) : "Sin fecha";

export default function ControlTurnosOperativos() {
  const { user } = useAuth();
  const historial = useCuadreStore((s) => s.history);
  const usuarios = usePinStore((s) => s.users);
  const { turnos, verificado, verificar, cargando, error, recargar } = useControlTurnos(user?.id);

  const [pin, setPin] = useState("");
  const [verificando, setVerificando] = useState(false);
  const [editando, setEditando] = useState<PuntoVenta | null>(null);
  const [dependienteId, setDependienteId] = useState("");
  const [fuente, setFuente] = useState<Fuente>("manual");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [visible, setVisible] = useState(true);

  const entregas = useQuery({
    queryKey: ["alfaro-entregas-fuente-turnos"],
    queryFn: consultarUltimasEntregas,
    enabled: verificado && visible,
    refetchOnWindowFocus: "always",
    staleTime: 30000,
  });
  const disponibles = useMemo(() => usuarios
    .filter((u) => u.role === "dependiente")
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es")), [usuarios]);

  const ultimoPrecuadre = (punto: PuntoVenta): EntregaReciente | undefined =>
    (entregas.data ?? []).find((t) => t.punto_venta === punto && (t.data?.productos?.length ?? 0) > 0);

  const ultimoOficial = (punto: PuntoVenta) => [...historial]
    .filter((c) => c.puntoVenta === punto && c.finalizado)
    .sort((a, b) => {
      const dA = a.diasTrabajados?.at(-1) ?? a.fecha;
      const dB = b.diasTrabajados?.at(-1) ?? b.fecha;
      return new Date(dB).getTime() - new Date(dA).getTime();
    })[0];

  const abrirAsignacion = (punto: PuntoVenta) => {
    const p = ultimoPrecuadre(punto);
    setEditando(punto);
    setFuente(p ? "precuadre" : ultimoOficial(punto) ? "cuadre" : "manual");
    setDependienteId("");
    setNota("");
  };

  const confirmar = async () => {
    if (!editando || !user?.id || !dependienteId) return toast.error("Selecciona quién recibirá el turno.");
    const anterior = turnos.find((t) => t.punto_venta === editando);
    if (anterior && nota.trim().length < 6) {
      return toast.error("Explica el motivo del reemplazo administrativo (mínimo 6 caracteres).");
    }
    const pre = ultimoPrecuadre(editando);
    const oficial = ultimoOficial(editando);
    if (fuente === "precuadre" && !pre) return toast.error("No hay una entrega disponible.");
    if (fuente === "cuadre" && !oficial) return toast.error("No hay un cuadre cerrado disponible.");
    const inicios = fuente === "precuadre" ? iniciosDesdeProductos(pre!.data!.productos!, true)
      : fuente === "cuadre" ? iniciosDesdeProductos(oficial!.productos, true) : [];
    if (fuente === "manual" && !nota.trim()) {
      return toast.error("Indica cómo se verificará el inventario inicial de este turno.");
    }
    if (anterior && !window.confirm(
      `¿Reemplazar el turno activo de ${anterior.dependiente} en ${editando}? Quedará registrado en auditoría, sin alterar el cuadre oficial.`
    )) return;
    if (!inicios.length && !window.confirm(
      "Este turno no tiene existencias importadas. ¿Iniciarlo con inventario inicial en cero para verificación manual?"
    )) return;

    const asignacion: AsignacionOperativa = {
      punto: editando,
      dependienteId,
      fuente,
      fuenteId: fuente === "precuadre" ? pre?.id : fuente === "cuadre" ? oficial?.id : null,
      inicios,
      observacion: nota.trim(),
      reemplazar: !!anterior,
    };
    setGuardando(true);
    try {
      await asignarTurnoOperativo(user.id, asignacion);
      toast.success(`Turno de ${editando} asignado correctamente.`);
      setEditando(null);
      await recargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo registrar la asignación.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <section className="alfaro-surface space-y-3 p-4" aria-label="Control de Turnos y Relevos">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-extrabold">Control de Turnos y Relevos</h2>
          <p className="text-[11px] text-muted-foreground">Asignaciones independientes del cuadre oficial</p>
        </div>
        <Button type="button" variant="ghost" size="icon" title="Actualizar turnos"
          onClick={() => { void recargar(); void entregas.refetch(); }} disabled={!verificado}>
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>

      {(!verificado || !!error) && (
        <div className="rounded-xl border border-border bg-muted/30 p-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            <KeyRound className="mr-1 inline h-3.5 w-3.5" />
            Confirma tu PIN de administrador para administrar los turnos.
          </p>
          <div className="flex gap-2">
            <Input type="password" inputMode="numeric" maxLength={6} value={pin}
              placeholder="PIN de 6 dígitos" onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className="h-10 rounded-xl" />
            <Button type="button" size="sm" disabled={verificando || pin.length !== 6}
              onClick={async () => {
                setVerificando(true);
                try { await verificar(pin); setPin(""); toast.success("Control de turnos desbloqueado"); }
                catch (e) { toast.error(e instanceof Error ? e.message : "PIN no válido"); }
                finally { setVerificando(false); }
              }}>Verificar</Button>
          </div>
          {error && <p className="text-xs text-destructive">{error.message}</p>}
        </div>
      )}

      {verificado && !error && (
        <>
          {cargando && <p className="text-xs text-muted-foreground">Consultando asignaciones…</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {PUNTOS.map((punto) => {
              const turno = turnos.find((t) => t.punto_venta === punto);
              return (
                <div key={punto} className="rounded-xl border border-border bg-card p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <strong className="text-sm">{punto === "Mipyme" ? "MiPyME" : punto}</strong>
                    <Badge variant={turno ? "default" : "outline"} className="text-[10px]">
                      {turno ? "En curso" : "Sin asignar"}
                    </Badge>
                  </div>
                  <p className="text-sm font-semibold">{turno?.dependiente || "Ninguna dependienta asignada"}</p>
                  {turno && (
                    <p className="text-[11px] text-muted-foreground">
                      <Clock3 className="mr-1 inline h-3 w-3" />Desde {fecha(turno.inicio)}
                      <span className="block">Inventario recibido: {turno.inicios?.length ?? 0} productos</span>
                    </p>
                  )}
                  <Button type="button" size="sm" variant={turno ? "outline" : "default"}
                    className="w-full rounded-xl text-xs"
                    onClick={() => abrirAsignacion(punto)}>
                    <UserRoundPlus className="mr-1.5 h-4 w-4" />
                    {turno ? "Cambiar asignación" : "Asignar dependienta"}
                  </Button>
                </div>
              );
            })}
          </div>
          {editando && (
            <div className="rounded-xl border border-secondary/40 bg-secondary/5 p-3 space-y-3">
              <h3 className="text-sm font-bold">Asignación · {editando === "Mipyme" ? "MiPyME" : editando}</h3>
              <label className="block space-y-1">
                <span className="text-xs font-medium">Dependiente entrante</span>
                <select value={dependienteId} onChange={(e) => setDependienteId(e.target.value)}
                  className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm">
                  <option value="">Selecciona quién recibe…</option>
                  {disponibles.map((u) => <option value={u.id} key={u.id}>{u.nombre}</option>)}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium">Origen del inventario inicial</span>
                <select value={fuente} onChange={(e) => setFuente(e.target.value as Fuente)}
                  className="h-10 w-full rounded-xl border border-input bg-background px-3 text-sm">
                  {ultimoPrecuadre(editando) && (
                    <option value="precuadre">Última entrega: {ultimoPrecuadre(editando)?.dependiente} ({fecha(ultimoPrecuadre(editando)?.enviado_en)})</option>
                  )}
                  {ultimoOficial(editando) && (
                    <option value="cuadre">Último cuadre oficial: {ultimoOficial(editando)?.dependiente}</option>
                  )}
                  <option value="manual">Sin importación · Verificar inicios manualmente</option>
                </select>
                <span className="block text-[11px] text-muted-foreground">
                  {fuente === "precuadre" ? "Los finales entregados se guardan como inicios del nuevo turno. No requiere cuadre oficial." :
                    fuente === "cuadre" ? "Se conservará una copia de los finales del cuadre elegido." :
                    "Se iniciará en cero; los inicios deberán verificarse y justificarse durante el precuadre."}
                </span>
              </label>
              <label className="block space-y-1">
                <span className="text-xs font-medium">Observaciones {turnos.some((t) => t.punto_venta === editando) ? "(obligatorias)" : "(opcional)"}</span>
                <Input value={nota} onChange={(e) => setNota(e.target.value)}
                  placeholder="Motivo de suplencia o de asignación" className="h-10 rounded-xl text-xs" />
              </label>
              {turnos.some((t) => t.punto_venta === editando) && (
                <p className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                  <ShieldAlert className="h-4 w-4 shrink-0" />
                  Esta acción reemplazará el turno actual; no finalizará su cuadre oficial.
                </p>
              )}
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1 rounded-xl"
                  onClick={() => setEditando(null)}>Cancelar</Button>
                <Button type="button" className="flex-1 rounded-xl" onClick={() => void confirmar()}
                  disabled={guardando || !dependienteId}>
                  <CheckCircle2 className="mr-1.5 h-4 w-4" />{guardando ? "Guardando…" : "Confirmar asignación"}
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      <p className="text-[11px] text-muted-foreground">
        Los cuadres históricos y los turnos operativos se administran por separado.
        Los cambios de asignación se registran en auditoría.
      </p>
    </section>
  );
}
