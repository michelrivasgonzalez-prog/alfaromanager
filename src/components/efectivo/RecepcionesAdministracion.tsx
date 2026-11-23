import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, CheckCircle2, Clock3, RefreshCw, AlertTriangle, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { useControlTurnos } from "@/hooks/useControlTurnos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { emptyDen, type Denominaciones } from "@/store/cuadreStore";
import {
  anularEntregaEfectivo, codigoEntrega, contarEntregaEfectivo, desgloseBilletes,
  formatoDinero, formatoFechaEntrega, listarEntregasEfectivo, resolverDiferenciaEfectivo,
  totalDenominaciones, validarDenominaciones, type EntregaEfectivo,
} from "@/lib/entregasEfectivo";
import { ConteoBilletes } from "./ConteoBilletes";

export default function RecepcionesAdministracion() {
  const { user, role } = useAuth();
  const { verificado, verificar } = useControlTurnos(user?.id);
  const qc = useQueryClient();
  const [pin, setPin] = useState("");
  const [validando, setValidando] = useState(false);
  const [conteoId, setConteoId] = useState<string | null>(null);
  const [conteo, setConteo] = useState<Denominaciones>(emptyDen());
  const [notaConteo, setNotaConteo] = useState("");
  const [motivo, setMotivo] = useState<Record<string, string>>({});
  const [ocupado, setOcupado] = useState<string | null>(null);
  const entregas = useQuery({
    queryKey: ["alfaro-efectivo-admin", user?.id],
    queryFn: () => listarEntregasEfectivo(user!.id),
    enabled: !!user?.id && verificado && (role === "admin" || role === "duena"),
    refetchInterval: 30000,
    refetchOnWindowFocus: "always",
    retry: false,
  });
  const pendientes = (entregas.data ?? []).filter((e) =>
    e.estado === "pendiente" || e.estado === "diferencia");
  const anteriores = (entregas.data ?? []).filter((e) =>
    e.estado === "confirmada" || e.estado === "anulada").slice(0, 6);

  const refrescar = async () => {
    await qc.invalidateQueries({ queryKey: ["alfaro-efectivo-admin"] });
    await qc.invalidateQueries({ queryKey: ["alfaro-efectivo-entregas"] });
  };

  const recibir = async (e: EntregaEfectivo) => {
    if (!user?.id) return;
    try { validarDenominaciones(conteo, true); }
    catch (error) { return toast.error(error instanceof Error ? error.message : "Conteo inválido"); }
    if (!window.confirm(
      `¿Confirmar conteo físico del fajo ${codigoEntrega(e.id)} por ${formatoDinero(totalDenominaciones(conteo))}? El importe y las denominaciones reales quedarán registrados.`
    )) return;
    setOcupado(e.id);
    try {
      const recibida = await contarEntregaEfectivo(user.id, e.id, conteo, notaConteo);
      await refrescar();
      setConteoId(null);
      setConteo(emptyDen());
      setNotaConteo("");
      toast[recibida.estado === "confirmada" ? "success" : "warning"](
        recibida.estado === "confirmada"
          ? `Fajo ${codigoEntrega(e.id)} confirmado; listo para Cuadre Oficial.`
          : "El conteo es diferente. Recontar o resolver con motivo antes de conciliar."
      );
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo registrar el conteo.");
    } finally { setOcupado(null); }
  };

  const resolver = async (e: EntregaEfectivo) => {
    if (!user?.id) return;
    const texto = (motivo[e.id] || "").trim();
    if (texto.length < 10) return toast.error("Explica cómo se resolvió esta diferencia.");
    if (!window.confirm(
      `¿Aceptar el importe físicamente contado de ${formatoDinero(Number(e.total_recibido || 0))} con esta justificación?`
    )) return;
    setOcupado(e.id);
    try {
      await resolverDiferenciaEfectivo(user.id, e.id, texto);
      toast.success("Diferencia justificada y recogida confirmada.");
      await refrescar();
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo resolver."); }
    finally { setOcupado(null); }
  };

  const anular = async (e: EntregaEfectivo) => {
    if (!user?.id) return;
    const motivoAnulacion = window.prompt(
      `Motivo de anulación del fajo ${codigoEntrega(e.id)} (mínimo 10 caracteres):`
    )?.trim();
    if (!motivoAnulacion) return;
    if (!window.confirm("¿Anular esta entrega? Permanecerá en el historial de auditoría.")) return;
    setOcupado(e.id);
    try {
      await anularEntregaEfectivo(user.id, e.id, motivoAnulacion);
      toast.success("Entrega anulada, sin borrar el historial.");
      await refrescar();
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo anular."); }
    finally { setOcupado(null); }
  };

  return (
    <section className="alfaro-surface space-y-3 p-4" aria-label="Recepción y conteo de efectivo">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-extrabold">
            <Banknote className="h-5 w-5 text-secondary"/> Recibir efectivo
          </h2>
          <p className="text-[11px] text-muted-foreground">
            Contar fajos recibidos y confirmar las recogidas para el Cuadre Oficial
          </p>
        </div>
        <Button type="button" size="icon" variant="ghost" disabled={!verificado}
          onClick={() => { void entregas.refetch(); }} aria-label="Actualizar fajos">
          <RefreshCw className="h-4 w-4"/>
        </Button>
      </div>

      {!verificado && (
        <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
          <p className="text-xs text-muted-foreground">Confirma tu PIN administrativo para recibir dinero.</p>
          <div className="flex gap-2">
            <Input type="password" inputMode="numeric" maxLength={6} placeholder="PIN"
              value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              className="h-10 rounded-xl"/>
            <Button type="button" disabled={pin.length !== 6 || validando}
              onClick={async () => {
                if (!user?.id) return;
                setValidando(true);
                try { await verificar(pin); setPin(""); }
                catch (error) { toast.error(error instanceof Error ? error.message : "PIN incorrecto."); }
                finally { setValidando(false); }
              }}>Validar</Button>
          </div>
        </div>
      )}
      {verificado && entregas.isLoading && (
        <p className="text-xs text-muted-foreground">Consultando los fajos enviados…</p>
      )}
      {verificado && entregas.isError && (
        <div className="rounded-xl border border-destructive/30 p-3 space-y-2">
          <p className="text-xs text-destructive">
            No se pudieron cargar las entregas. {entregas.error.message}
          </p>
          <Button variant="outline" size="sm" onClick={() => { void entregas.refetch(); }}>
            Reintentar
          </Button>
        </div>
      )}

      {verificado && entregas.isSuccess && (
        <>
          <div className="flex items-center justify-between text-xs font-bold">
            <span>Fajos pendientes de recepción</span>
            <Badge variant="outline" className="tabular-nums">{pendientes.length}</Badge>
          </div>
          {pendientes.length === 0 && (
            <p className="rounded-xl border border-dashed border-border p-4 text-xs text-muted-foreground">
              No hay entregas pendientes. Las recibidas están disponibles en el Cuadre Oficial.
            </p>
          )}
          {pendientes.map((e) => (
            <article key={e.id} className="rounded-xl border border-border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="font-bold text-sm">{e.dependiente} · {codigoEntrega(e.id)}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {e.punto_venta === "Mipyme" ? "MiPyME" : e.punto_venta}
                    {" · "}{formatoFechaEntrega(e.entregado_en)}
                  </p>
                </div>
                <Badge variant="outline" className={e.estado === "diferencia" ? "border-amber-500 text-amber-700" : ""}>
                  {e.estado === "pendiente" ? <Clock3 className="mr-1 h-3 w-3"/> : <AlertTriangle className="mr-1 h-3 w-3"/>}
                  {e.estado === "pendiente" ? "Pendiente" : "Diferencia"}
                </Badge>
              </div>
              <p className="text-xs">
                Declarado: <strong>{formatoDinero(Number(e.total_declarado))}</strong>
              </p>
              <p className="text-[11px] text-muted-foreground">{desgloseBilletes(e.denominaciones_declaradas)}</p>
              {e.total_recibido !== null && (
                <p className="text-xs">
                  Contado: <strong>{formatoDinero(Number(e.total_recibido))}</strong>
                  {Number(e.total_recibido) !== Number(e.total_declarado) &&
                    <span className="ml-1 text-amber-700">
                      ({formatoDinero(Number(e.total_recibido) - Number(e.total_declarado))})
                    </span>}
                </p>
              )}

              {conteoId === e.id ? (
                <div className="space-y-2 rounded-xl bg-muted/30 p-3">
                  <p className="text-xs font-bold">Conteo físico independiente · {codigoEntrega(e.id)}</p>
                  <p className="text-xs text-muted-foreground">
                    Cuenta los billetes que realmente recibiste. No copies las cifras declaradas.
                  </p>
                  <ConteoBilletes value={conteo} onChange={setConteo} idPrefix={`conteo-${e.id}`}
                    disabled={ocupado === e.id}/>
                  <Input value={notaConteo} onChange={(event) => setNotaConteo(event.target.value)}
                    maxLength={500} placeholder="Nota de recepción (opcional)" className="h-10 rounded-xl"/>
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 rounded-xl"
                      disabled={ocupado === e.id} onClick={() => setConteoId(null)}>Cancelar</Button>
                    <Button className="flex-1 rounded-xl" disabled={ocupado === e.id}
                      onClick={() => { void recibir(e); }}>Guardar conteo</Button>
                  </div>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button size="sm" className="flex-1 rounded-xl" disabled={ocupado === e.id}
                    onClick={() => { setConteoId(e.id); setConteo(emptyDen()); setNotaConteo(""); }}>
                    <ShieldCheck className="mr-1.5 h-4 w-4"/>
                    {e.estado === "pendiente" ? "Recibir y contar" : "Recontar"}
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-xl" disabled={ocupado === e.id}
                    onClick={() => { void anular(e); }}>Anular</Button>
                </div>
              )}
              {e.estado === "diferencia" && (
                <div className="space-y-2 rounded-xl border border-amber-500/30 p-3">
                  <p className="text-xs font-bold text-amber-700">
                    <AlertTriangle className="mr-1 inline h-4 w-4"/>
                    No se incluirá en el cuadre hasta resolver la diferencia.
                  </p>
                  <Input value={motivo[e.id] || ""} maxLength={500}
                    placeholder="Explica qué se verificó y por qué aceptas este conteo"
                    onChange={(event) => setMotivo((prev) => ({ ...prev, [e.id]: event.target.value }))}
                    className="h-10 rounded-xl text-xs"/>
                  <Button type="button" variant="outline" size="sm" className="w-full rounded-xl"
                    disabled={ocupado === e.id || (motivo[e.id] || "").trim().length < 10}
                    onClick={() => { void resolver(e); }}>
                    <CheckCircle2 className="mr-1.5 h-4 w-4"/> Resolver y confirmar
                  </Button>
                </div>
              )}
            </article>
          ))}
          {anteriores.length > 0 && (
            <div className="space-y-2 border-t border-border pt-3">
              <h3 className="text-xs font-bold text-muted-foreground">Últimas entregas procesadas</h3>
              {anteriores.map((e) => (
                <div className="flex items-center justify-between gap-2 text-xs" key={e.id}>
                  <div className="min-w-0">
                    <p className="truncate font-medium">{codigoEntrega(e.id)} · {e.dependiente}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {e.recibido_por || "Administración"} · {formatoFechaEntrega(e.entregado_en)}
                    </p>
                  </div>
                  <span className="flex items-center gap-1 text-right font-semibold">
                    {e.estado === "confirmada" ? <CheckCircle2 className="h-3.5 w-3.5 text-secondary"/> :
                      <XCircle className="h-3.5 w-3.5 text-muted-foreground"/>}
                    {e.estado === "confirmada" ? formatoDinero(Number(e.total_recibido || 0)) : "Anulada"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}
