import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Banknote, CheckCircle2, Clock, AlertTriangle, Plus, RefreshCw, Send, Tag, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { emptyDen, type Denominaciones } from "@/store/cuadreStore";
import type { TurnoOperativo } from "@/lib/turnosOperativos";
import {
  codigoEntrega, enviarEntregaEfectivo, formatoDinero, formatoFechaEntrega,
  listarEntregasEfectivo, totalDenominaciones, validarDenominaciones,
  desgloseBilletes,
} from "@/lib/entregasEfectivo";
import { ConteoBilletes } from "./ConteoBilletes";

type Props = { usuarioId: string; turno: TurnoOperativo };

export default function EntregasDependiente({ usuarioId, turno }: Props) {
  const qc = useQueryClient();
  const [formulario, setFormulario] = useState(false);
  const [den, setDen] = useState<Denominaciones>(emptyDen());
  const [observacion, setObservacion] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [ultima, setUltima] = useState<string | null>(null);
  const lista = useQuery({
    queryKey: ["alfaro-efectivo-entregas", usuarioId, turno.id],
    queryFn: () => listarEntregasEfectivo(usuarioId, turno.id),
    refetchInterval: 30000,
    refetchOnWindowFocus: "always",
    retry: false,
  });
  const entregas = lista.data ?? [];
  const confirmadas = entregas.filter((e) => e.estado === "confirmada");
  const pendientes = entregas.filter((e) => e.estado === "pendiente" || e.estado === "diferencia");
  const totalConfirmado = confirmadas.reduce((s, e) => s + Number(e.total_recibido || 0), 0);

  const enviar = async () => {
    try {
      validarDenominaciones(den);
    } catch (e) {
      return toast.error(e instanceof Error ? e.message : "Revisa las denominaciones.");
    }
    const total = totalDenominaciones(den);
    if (!window.confirm(
      `¿Enviar entrega de ${formatoDinero(total)}? Debes colocar en el fajo tu nombre, fecha y hora. El dinero quedará PENDIENTE hasta que administración lo cuente.`
    )) return;
    setEnviando(true);
    try {
      const entrega = await enviarEntregaEfectivo(usuarioId, turno.id, den, observacion);
      setUltima(entrega.id);
      setDen(emptyDen());
      setObservacion("");
      setFormulario(false);
      await qc.invalidateQueries({ queryKey: ["alfaro-efectivo-entregas", usuarioId, turno.id] });
      await qc.invalidateQueries({ queryKey: ["alfaro-efectivo-admin"] });
      toast.success(`Entrega ${codigoEntrega(entrega.id)} enviada; pendiente de recepción.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo enviar el efectivo. Intenta de nuevo cuando tengas conexión.");
    } finally { setEnviando(false); }
  };

  return (
    <section className="space-y-4" aria-label="Entregas de efectivo en turno">
      <header className="flex items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-extrabold">
            <Banknote className="h-5 w-5 text-secondary" /> Entregas de efectivo en turno
          </h2>
          <p className="text-xs text-muted-foreground">
            {turno.punto_venta === "Mipyme" ? "MiPyME" : turno.punto_venta} · {turno.dependiente}
          </p>
        </div>
        <Button type="button" variant="outline" size="icon" aria-label="Actualizar entregas"
          onClick={() => { void lista.refetch(); }}><RefreshCw className="h-4 w-4" /></Button>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <div className="alfaro-surface p-3">
          <p className="text-[11px] text-muted-foreground">Recibido y confirmado</p>
          <p className="text-lg font-extrabold tabular-nums text-secondary">{formatoDinero(totalConfirmado)}</p>
        </div>
        <div className="alfaro-surface p-3">
          <p className="text-[11px] text-muted-foreground">Esperando recepción</p>
          <p className="text-lg font-extrabold tabular-nums">{pendientes.length}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-3">
        <p className="flex items-center gap-2 text-xs font-bold">
          <Tag className="h-4 w-4 text-amber-700" /> Identifica cada fajo físicamente
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Escribe tu nombre, fecha, hora y el código EFE que aparece después de enviar.
          Ejemplo: <strong>Leysi Daniela · 23/11 · 6:38 p. m.</strong>
          No mezcles fajos de diferentes entregas.
        </p>
      </div>

      {ultima && (
        <div className="rounded-xl border border-secondary/30 bg-secondary/5 p-3 space-y-1">
          <p className="text-xs font-bold text-secondary">Etiqueta del último fajo enviado</p>
          {entregas.filter((e) => e.id === ultima).map((e) => (
            <div key={e.id}>
              <p className="font-bold text-sm">{e.dependiente} · {formatoFechaEntrega(e.entregado_en)}</p>
              <p className="text-xs">{codigoEntrega(e.id)} · {formatoDinero(Number(e.total_declarado))}</p>
            </div>
          ))}
        </div>
      )}

      {!formulario ? (
        <Button type="button" className="w-full h-12 rounded-2xl font-bold"
          onClick={() => setFormulario(true)}>
          <Plus className="mr-2 h-4 w-4" /> Nueva entrega de efectivo
        </Button>
      ) : (
        <div className="alfaro-surface space-y-3 p-4">
          <div>
            <h3 className="font-bold">Nuevo fajo · Conteo de billetes</h3>
            <p className="text-xs text-muted-foreground">
              Introduce la cantidad de billetes de cada denominación. El total se calcula solo.
            </p>
          </div>
          <ConteoBilletes value={den} onChange={setDen} disabled={enviando} idPrefix="entregar-billetes" />
          <label className="block space-y-1">
            <span className="text-xs font-medium">Observaciones (opcional)</span>
            <Textarea value={observacion} maxLength={500} onChange={(e) => setObservacion(e.target.value)}
              placeholder="Por ejemplo, primera recogida del día" className="min-h-16 rounded-xl text-sm"/>
          </label>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="flex-1 rounded-xl"
              disabled={enviando} onClick={() => setFormulario(false)}>Dejar sin enviar</Button>
            <Button type="button" className="flex-1 rounded-xl" disabled={enviando}
              onClick={() => { void enviar(); }}>
              <Send className="mr-1.5 h-4 w-4"/> {enviando ? "Enviando…" : "Enviar fajo"}
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Sin confirmación del servidor la entrega NO queda registrada. No se considera recibida
            hasta que administración cuente el efectivo.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <h3 className="text-sm font-bold">Historial de este turno</h3>
        {lista.isLoading && <p className="text-xs text-muted-foreground">Consultando entregas…</p>}
        {lista.isError && (
          <div className="alfaro-surface space-y-2 p-3 text-xs text-destructive">
            <p>No se pudo consultar el historial: {lista.error.message}</p>
            <Button size="sm" variant="outline" onClick={() => { void lista.refetch(); }}>Reintentar</Button>
          </div>
        )}
        {lista.isSuccess && entregas.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
            Todavía no se ha enviado efectivo en este turno.
          </div>
        )}
        {entregas.map((e) => (
          <article key={e.id} className="alfaro-surface space-y-2 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-bold">{codigoEntrega(e.id)}</p>
                <p className="text-[11px] text-muted-foreground">{formatoFechaEntrega(e.entregado_en)}</p>
              </div>
              <Badge variant={e.estado === "confirmada" ? "default" : "outline"}
                className={e.estado === "diferencia" ? "border-amber-600 text-amber-700" : ""}>
                {e.estado === "confirmada" ? <CheckCircle2 className="mr-1 h-3 w-3"/> :
                  e.estado === "anulada" ? <XCircle className="mr-1 h-3 w-3"/> :
                  e.estado === "diferencia" ? <AlertTriangle className="mr-1 h-3 w-3"/> :
                  <Clock className="mr-1 h-3 w-3"/>}
                {e.estado === "confirmada" ? "Confirmada" : e.estado === "diferencia" ? "Con diferencia" :
                  e.estado === "anulada" ? "Anulada" : "Pendiente"}
              </Badge>
            </div>
            <p className="text-sm font-bold">Declarado: {formatoDinero(Number(e.total_declarado))}</p>
            <p className="text-xs text-muted-foreground">{desgloseBilletes(e.denominaciones_declaradas)}</p>
            {e.total_recibido !== null && <p className="text-xs">
              Contado por {e.recibido_por || "administración"}: <strong>{formatoDinero(Number(e.total_recibido))}</strong>
            </p>}
            {e.estado === "diferencia" && (
              <p className="text-xs font-medium text-amber-700">Administración está revisando la diferencia.</p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
