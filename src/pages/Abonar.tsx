import { useCuadreStore } from "@/store/cuadreStore";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, Wallet, Share2, CheckCircle2, Image as ImageIcon, Download } from "lucide-react";
import { toast } from "sonner";
import { toPng } from "html-to-image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NumberInput } from "@/components/NumberInput";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { listClientes, listDeudas, registrarAbono, crearSolicitudAbono, fmt, Deuda } from "@/lib/cobrar";
import { AlertCircle, Clock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function Abonar() {
  const { id = "" } = useParams();
  const nav = useNavigate();
  const qc = useQueryClient();
  const { nombre, user, role } = useAuth();
  const esDependiente = role === "dependiente";
  const permisosCobrar = useCuadreStore((s) => s.settings.dependientesPermisoCobrar);
  const tienePermisoCobrar = !!nombre && (permisosCobrar ?? []).some(
    (n) => n.trim().toLowerCase() === nombre.trim().toLowerCase()
  );
  const clientes = useQuery({ queryKey: ["clientes"], queryFn: listClientes });
  const deudasQ = useQuery({ queryKey: ["deudas", id], queryFn: () => listDeudas(id) });

  const cliente = clientes.data?.find((c) => c.id === id);
  const pendientes = useMemo(
    () =>
      (deudasQ.data ?? [])
        .filter((d) => d.estado !== "pagada")
        .sort((a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()),
    [deudasQ.data]
  );

  const [monto, setMonto] = useState(0);
  const [aplicaciones, setAplicaciones] = useState<Record<string, number>>({});
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  const [comprobante, setComprobante] = useState<null | {
    monto: number;
    aplicaciones: { deuda: Deuda; monto: number }[];
    saldoRestante: number;
  }>(null);
  const receiptRef = useRef<HTMLDivElement>(null);

  const generarImagen = async (): Promise<Blob | null> => {
    if (!receiptRef.current) return null;
    const dataUrl = await toPng(receiptRef.current, { pixelRatio: 2, backgroundColor: "#ffffff" });
    const res = await fetch(dataUrl);
    return await res.blob();
  };

  const descargarImagen = async () => {
    try {
      const blob = await generarImagen();
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `comprobante-${cliente?.nombre?.replace(/\s+/g, "_") || "abono"}.png`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Imagen descargada");
    } catch (e: any) {
      toast.error("No se pudo generar la imagen");
    }
  };

  const compartirWhatsApp = async () => {
    try {
      const blob = await generarImagen();
      if (!blob) return;
      const file = new File([blob], "comprobante.png", { type: "image/png" });
      const texto = comprobanteTexto();
      const nav: any = navigator;
      if (nav.canShare && nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], text: texto, title: "Comprobante de abono" });
        return;
      }
      // Fallback: descargar imagen + abrir WhatsApp con texto
      await descargarImagen();
      if (cliente?.telefono) {
        window.open(
          `https://wa.me/${cliente.telefono.replace(/[^\d]/g, "")}?text=${encodeURIComponent(texto)}`,
          "_blank"
        );
      }
      toast.info("Adjunta la imagen descargada al chat de WhatsApp");
    } catch (e: any) {
      toast.error("No se pudo compartir");
    }
  };


  // Auto-distribuir al más antiguo
  useEffect(() => {
    const next: Record<string, number> = {};
    let rest = monto;
    for (const d of pendientes) {
      if (rest <= 0) break;
      const apply = Math.min(rest, Number(d.saldo));
      next[d.id] = Number(apply.toFixed(2));
      rest -= apply;
    }
    setAplicaciones(next);
  }, [monto, pendientes]);

  const sumaApp = Object.values(aplicaciones).reduce((s, v) => s + (Number(v) || 0), 0);
  const excede = sumaApp > monto + 0.001;
  const totalSaldo = pendientes.reduce((s, d) => s + Number(d.saldo), 0);

  const submit = async () => {
    if (busy || comprobante) return;
    if (!user) return toast.error("Inicia sesión para registrar el abono");
    if (esDependiente && !tienePermisoCobrar &&
        cliente?.nombre.trim().toLowerCase() !== nombre?.trim().toLowerCase()) {
      return toast.error("El administrador debe activar tu permiso para cobrar a otros clientes");
    }
    if (!Number.isFinite(monto) || monto <= 0) return toast.error("Monto > 0");
    if (excede) return toast.error("La distribución supera el monto");
    const apps = pendientes
      .map((d) => ({ deuda_id: d.id, monto: Number((aplicaciones[d.id] || 0).toFixed(2)) }))
      .filter((a) => a.monto > 0);
    if (apps.length === 0) return toast.error("Distribuye el pago en al menos una deuda");
    setBusy(true);

    try {
      if (esDependiente) {
        await crearSolicitudAbono({
          cliente_id: id,
          monto,
          aplicaciones: apps,
          dependiente_id: user?.id ?? null,
          dependiente_nombre: nombre ?? "Dependiente",
          nota: nota.trim() || undefined,
        });
        await qc.invalidateQueries({ queryKey: ["abonos-pendientes"] });
        toast.warning("Abono enviado a aprobación. Tienes 24h para entregar el efectivo a la dueña o admin.");
      } else {
        await registrarAbono({
          cliente_id: id,
          monto,
          aplicaciones: apps,
          usuario_id: user?.id ?? null,
          usuario_nombre: nombre ?? null,
          nota: nota.trim() || undefined,
        });
        await qc.invalidateQueries({ queryKey: ["clientes"] });
        await qc.invalidateQueries({ queryKey: ["deudas", id] });
        await qc.invalidateQueries({ queryKey: ["abonos", id] });
        await qc.invalidateQueries({ queryKey: ["abonos-por-deuda", id] });
        await qc.invalidateQueries({ queryKey: ["deudas-all"] });
        toast.success("Abono registrado con éxito");
      }
      const detalle = apps.map((a) => ({
        deuda: pendientes.find((d) => d.id === a.deuda_id)!,
        monto: a.monto,
      }));
      setMonto(0);
      setNota("");
      setComprobante({
        monto,
        aplicaciones: detalle,
        saldoRestante: esDependiente ? totalSaldo : totalSaldo - apps.reduce((s, a) => s + a.monto, 0),
      });
      qc.invalidateQueries({ queryKey: ["deudas", id] });
      qc.invalidateQueries({ queryKey: ["deudas-all"] });
      qc.invalidateQueries({ queryKey: ["abonos", id] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const comprobanteTexto = () => {
    if (!cliente || !comprobante) return "";
    const lines = [
      `📋 Comprobante de abono — AlFaroCafé`,
      esDependiente ? "PENDIENTE DE APROBACIÓN — El saldo se actualiza al confirmar la entrega." : "",
      `Cliente: ${cliente.nombre}`,
      `Fecha: ${format(new Date(), "dd MMM yyyy HH:mm", { locale: es })}`,
      `Monto abonado: ${fmt(comprobante.monto)}`,
      ``,
      `Distribución:`,
      ...comprobante.aplicaciones.map(
        (a) => `• ${a.deuda.cuadre_label ?? format(new Date(a.deuda.fecha), "dd/MM", { locale: es })}: ${fmt(a.monto)}  (saldo ${fmt(Number(a.deuda.saldo) - (esDependiente ? 0 : a.monto))})`
      ),
      ``,
      `Saldo pendiente total: ${fmt(comprobante.saldoRestante)}`,
      nombre ? `Registrado por: ${nombre}` : "",
    ].filter(Boolean);
    return lines.join("\n");
  };

  if (!cliente) return <div className="p-4 text-sm text-muted-foreground">Cargando…</div>;

  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={() => nav(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-primary">Registrar abono</h1>
          <p className="text-xs text-muted-foreground">{cliente.nombre} · Saldo total {fmt(totalSaldo)}</p>
        </div>
      </div>

      {pendientes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
          <CheckCircle2 className="mx-auto mb-2 h-8 w-8 text-secondary" />
          <p className="text-sm text-muted-foreground">Este cliente no tiene deudas pendientes.</p>
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-2">
            <Label>Monto entregado</Label>
            <NumberInput value={monto} onChange={setMonto} className="h-12 text-lg" />
            <p className="text-[11px] text-muted-foreground">
              Se distribuye automáticamente al más antiguo; ajústalo si es necesario.
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold uppercase tracking-wider text-muted-foreground">
                Distribución
              </span>
              <span className={`font-mono ${excede ? "text-destructive" : "text-muted-foreground"}`}>
                {fmt(sumaApp)} / {fmt(monto)}
              </span>
            </div>
            {pendientes.map((d) => (
              <div key={d.id} className="rounded-2xl border border-border bg-card p-3 shadow-soft">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-sm">
                      {d.cuadre_label ?? format(new Date(d.fecha), "dd MMM yyyy", { locale: es })}
                    </div>
                    <div className="text-[11px] text-muted-foreground">Saldo: {fmt(d.saldo)}</div>
                  </div>
                  <NumberInput
                    value={aplicaciones[d.id] || 0}
                    onChange={(v) =>
                      setAplicaciones((prev) => ({
                        ...prev,
                        [d.id]: Math.min(v, Number(d.saldo)),
                      }))
                    }
                    className="w-28 text-right"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="rounded-2xl border border-border bg-card p-4 shadow-soft space-y-2">
            <Label>Nota (opcional)</Label>
            <Textarea value={nota} onChange={(e) => setNota(e.target.value)} className="min-h-[60px] rounded-xl" />
          </div>

          <Button
            disabled={busy || excede || monto <= 0}
            onClick={submit}
            className="h-12 w-full rounded-xl gradient-primary text-primary-foreground"
          >
            <Wallet className="mr-2 h-4 w-4" /> Confirmar abono {fmt(monto)}
          </Button>
        </>
      )}

      <Dialog open={!!comprobante} onOpenChange={(o) => { if (!o) { setComprobante(null); nav(`/cobrar/clientes/${id}`); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-secondary" /> Comprobante
            </DialogTitle>
          </DialogHeader>
          {comprobante && (
            <div className="space-y-2">
              <pre className="whitespace-pre-wrap rounded-xl bg-muted/60 p-3 text-xs">{comprobanteTexto()}</pre>
              {/* Receipt visual para exportar como imagen */}
              <div className="fixed left-[-9999px] top-0" aria-hidden>
                <div
                  ref={receiptRef}
                  style={{
                    width: 420,
                    padding: 20,
                    background: "white",
                    fontFamily: "system-ui, -apple-system, sans-serif",
                    color: "#1a1a1a",
                  }}
                >
                  <div style={{ borderBottom: "2px solid #4B3621", paddingBottom: 8, marginBottom: 10 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: "#4B3621" }}>AlFaroCafé</div>
                    <div style={{ fontSize: 11, color: "#666" }}>{esDependiente ? "Abono pendiente de aprobación" : "Comprobante de abono"}</div>
                  </div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}><strong>Cliente:</strong> {cliente.nombre}</div>
                  <div style={{ fontSize: 12, marginBottom: 4 }}><strong>Fecha:</strong> {format(new Date(), "dd MMM yyyy HH:mm", { locale: es })}</div>
                  <div style={{ fontSize: 14, margin: "10px 0", padding: "8px 10px", background: "#065F46", color: "white", borderRadius: 8, textAlign: "center", fontWeight: 700 }}>
                    Monto abonado: {fmt(comprobante.monto)}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 4, color: "#4B3621" }}>Distribución</div>
                  {comprobante.aplicaciones.map((a, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", fontSize: 11, borderBottom: "1px solid #eee", padding: "4px 0" }}>
                      <span>{a.deuda.cuadre_label ?? format(new Date(a.deuda.fecha), "dd/MM/yyyy", { locale: es })}</span>
                      <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmt(a.monto)}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 10, padding: "6px 10px", background: "#f5efe6", borderRadius: 6, fontSize: 12, display: "flex", justifyContent: "space-between" }}>
                    <span>Saldo pendiente</span>
                    <strong>{fmt(comprobante.saldoRestante)}</strong>
                  </div>
                  {nombre && (
                    <div style={{ marginTop: 8, fontSize: 10, color: "#666", textAlign: "right" }}>
                      Registrado por: {nombre}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="flex-wrap gap-2">
            <Button variant="outline" onClick={descargarImagen}>
              <Download className="mr-2 h-4 w-4" /> Imagen
            </Button>
            <Button variant="outline" onClick={compartirWhatsApp}>
              <ImageIcon className="mr-2 h-4 w-4" /> WhatsApp con imagen
            </Button>
            {cliente.telefono && (
              <Button
                variant="outline"
                onClick={() => {
                  window.open(
                    `https://wa.me/${cliente.telefono!.replace(/[^\d]/g, "")}?text=${encodeURIComponent(comprobanteTexto())}`,
                    "_blank"
                  );
                }}
              >
                <Share2 className="mr-2 h-4 w-4" /> Solo texto
              </Button>
            )}
            <Button onClick={() => { setComprobante(null); nav(`/cobrar/clientes/${id}`); }}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
