import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { compensarDeudaFondo, deudaPorFaltante, fechaCaja, montoCaja, TURNO_KAMILA_FALTANTE, vincularFaltanteKamila } from "@/lib/cajaSobrantes";
import { buscarDeuda, listAbonosPorDeuda, listClientes, listDeudas, normalizarDependiente } from "@/lib/cobrar";
import { pullCuadre } from "@/lib/sync";
import { calcCuadre, useCuadreStore, type Cuadre } from "@/store/cuadreStore";

export default function CompensarDeudaFondo({ disponible, cuadre, embedded = false }: { disponible: number; cuadre?: Cuadre; embedded?: boolean }) {
  const { history, dependientes } = useCuadreStore();
  const qc = useQueryClient();
  const [clienteElegido, setCliente] = useState("");
  const [vinculadaId, setVinculadaId] = useState<string | null>(null);
  const fijaId = cuadre ? cuadre.deudaDependienteId ?? vinculadaId : null;
  const [deuda, setDeuda] = useState("");
  const [importe, setImporte] = useState("");
  const [motivo, setMotivo] = useState("");
  const solicitud = useRef<{ clave: string; id: string } | null>(null);
  const clientes = useQuery({ queryKey: ["clientes"], queryFn: listClientes, enabled: !fijaId });
  const fija = useQuery({ queryKey: ["deudas", "detalle", fijaId], queryFn: () => buscarDeuda(fijaId!), enabled: !!fijaId });
  const deudaDelCuadre = fija.data?.cuadre_id === cuadre?.id ? fija.data : null;
  const nombres = new Set((cuadre ? [cuadre.dependiente] : [...dependientes, ...history.map((c) => c.dependiente)]).map(normalizarDependiente));
  const elegibles = clientes.data?.filter((c) => nombres.has(normalizarDependiente(c.nombre))) ?? [];
  const cliente = deudaDelCuadre?.cliente_id ?? (cuadre && elegibles.length === 1 ? elegibles[0].id : clienteElegido);
  const cuentas = useQuery({ queryKey: ["deudas", cliente], queryFn: () => listDeudas(cliente), enabled: !!cliente && !cuadre });
  const seleccionada = elegibles.find((c) => c.id === cliente);
  const turno = cuadre ?? history.find((c) => c.id === TURNO_KAMILA_FALTANTE);
  const casoKamila = turno?.id === TURNO_KAMILA_FALTANTE && seleccionada
    && normalizarDependiente(seleccionada.nombre) === "kamila sanz friman";
  const cifras = casoKamila ? calcCuadre(turno) : null;
  const concuerda = cifras && Math.round(-cifras.diferencia * 100) === 1537500
    && Math.round(cifras.salarioBruto * 100) === 345663
    && deudaPorFaltante(-cifras.diferencia, cifras.descuentoFalta) === 11918.37;
  const pendientes = (cuentas.data ?? []).filter((d) => d.saldo > 0);
  const cuenta = cuadre ? deudaDelCuadre : pendientes.find((d) => d.id === deuda);
  const aplicaciones = useQuery({
    queryKey: ["abonos-por-deuda", deudaDelCuadre?.cliente_id],
    queryFn: () => listAbonosPorDeuda(deudaDelCuadre!.cliente_id),
    enabled: !!deudaDelCuadre,
  });
  const compensaciones = deudaDelCuadre
    ? (aplicaciones.data?.[deudaDelCuadre.id] ?? []).filter((a) => a.abono?.origen === "fondo_sobrantes")
    : [];
  const monto = Number(importe);

  async function refrescar() {
    await Promise.all(["caja-sobrantes", "deudas", "deudas-all", "abonos", "abonos-por-deuda", "cuadre-historico"].map((key) =>
      qc.invalidateQueries({ queryKey: [key] }),
    ));
  }

  const compensar = useMutation({
    mutationFn: () => compensarDeudaFondo(solicitud.current!.id, cliente, cuenta!.id, monto, motivo.trim()),
    onSuccess: async () => {
      setImporte("");
      setMotivo("");
      solicitud.current = null;
      await refrescar();
    },
  });
  const vincular = useMutation({
    mutationFn: async () => {
      const actual = await pullCuadre(TURNO_KAMILA_FALTANTE);
      return vincularFaltanteKamila(cliente, actual);
    },
    onSuccess: async (id) => {
      if (cuadre) setVinculadaId(id);
      else setDeuda(id);
      await refrescar();
      await pullCuadre(TURNO_KAMILA_FALTANTE);
    },
  });
  const ocupado = compensar.isPending || vincular.isPending;
  const valido = !!cuenta && /^\d+(\.\d{1,2})?$/.test(importe) && monto > 0
    && monto <= disponible && monto <= Number(cuenta.saldo) && Boolean(motivo.trim());

  function confirmar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valido || ocupado || !window.confirm(`¿Compensar ${montoCaja(monto)} con el saldo confirmado del fondo?`)) return;
    const clave = JSON.stringify([cliente, cuenta!.id, monto, motivo.trim()]);
    if (solicitud.current?.clave !== clave) solicitud.current = { clave, id: crypto.randomUUID() };
    compensar.mutate();
  }

  return (
    <form className={embedded ? "space-y-3" : "space-y-3 rounded-xl border bg-card p-4"} onSubmit={confirmar}>
      {!embedded && <h2 className="font-semibold">Compensar deuda con Fondo de Sobrantes</h2>}
      {disponible <= 0 && <p className="text-sm text-muted-foreground">El fondo todavía no tiene saldo confirmado disponible.</p>}
      {(!cuadre || (!fijaId && elegibles.length > 1)) && (
        <label className="block space-y-1 text-sm">
          <span>Dependienta</span>
          <select className="block w-full rounded-md border bg-background p-2" required
            value={cliente} disabled={ocupado} onChange={(event) => { setCliente(event.target.value); setDeuda(""); }}>
            <option value="">Selecciona una dependienta</option>
            {elegibles.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
          </select>
        </label>
      )}
      {casoKamila && !fijaId && !turno?.deudaDependienteId && (
        <div className="space-y-2 rounded-lg bg-muted p-2 text-sm">
          <p>Turno del 17–18 de noviembre. {concuerda
            ? "Faltante 15.375 CUP, salario absorbido 3.456,63 CUP y deuda restante 11.918,37 CUP."
            : "Los importes del historial requieren conciliación antes de vincular la deuda."}</p>
          <Button type="button" variant="outline" disabled={!concuerda || ocupado} onClick={() => {
            if (window.confirm("¿Buscar la deuda de este turno y crearla solo si no existe?")) vincular.mutate();
          }}>Verificar y vincular faltante del turno</Button>
        </div>
      )}
      {!cuadre && (
        <label className="block space-y-1 text-sm">
          <span>Deuda pendiente</span>
          <select className="block w-full rounded-md border bg-background p-2" required value={deuda}
            disabled={!cliente || ocupado} onChange={(event) => setDeuda(event.target.value)}>
            <option value="">Selecciona una deuda</option>
            {pendientes.map((d) => (
              <option key={d.id} value={d.id}>
                {/^faltante/i.test(d.cuadre_label ?? "") || (d.cuadre_id === TURNO_KAMILA_FALTANTE && Number(d.total) === 11918.37) ? "Faltante de caja" : "Cuenta por cobrar"}
                {" · "}{d.cuadre_label ?? new Date(d.fecha).toLocaleDateString("es")}{" · "}{montoCaja(Number(d.saldo))}
              </option>
            ))}
          </select>
        </label>
      )}
      {cuadre && fijaId && fija.isPending && <p role="status" className="text-sm">Consultando la deuda del turno…</p>}
      {cuadre && fijaId && !fija.isPending && !fija.error && !deudaDelCuadre && (
        <p className="text-sm text-muted-foreground">La deuda vinculada requiere revisión en Cuentas por cobrar.</p>
      )}
      {cuadre && !fijaId && !casoKamila && !clientes.isPending && (
        <p className="text-sm text-muted-foreground">Este faltante aún no tiene una deuda vinculada al turno.</p>
      )}
      {deudaDelCuadre && (
        <div className="rounded-lg bg-muted p-3 text-sm">
          <p>Saldo pendiente del faltante: <strong>{montoCaja(Number(deudaDelCuadre.saldo))}</strong></p>
          {compensaciones.map((a) => (
            <p key={a.id} className="mt-1">
              {montoCaja(Number(a.monto))} compensados · {fechaCaja(a.abono!.fecha)}
              {a.abono?.usuario_nombre && ` · ${a.abono.usuario_nombre}`}
            </p>
          ))}
        </div>
      )}
      {(!cuadre || (deudaDelCuadre && Number(deudaDelCuadre.saldo) > 0)) && (
        <>
          <label className="block space-y-1 text-sm">
            <span>Importe (CUP)</span>
            <Input type="number" min="0.01" step="0.01" required disabled={ocupado} value={importe}
              onChange={(event) => setImporte(event.target.value)} />
          </label>
          <label className="block space-y-1 text-sm">
            <span>Motivo</span>
            <Input required disabled={ocupado} value={motivo} onChange={(event) => setMotivo(event.target.value)} />
          </label>
          {cuadre && cuenta && disponible > 0 && (
            <Button type="button" variant="outline" disabled={ocupado} onClick={() =>
              setImporte(Math.min(disponible, Number(cuenta.saldo)).toFixed(2))
            }>
              Usar {montoCaja(Math.min(disponible, Number(cuenta.saldo)))}
            </Button>
          )}
          <Button type="submit" disabled={!valido || ocupado}>Confirmar compensación</Button>
        </>
      )}
      {(compensar.error || vincular.error || clientes.error || cuentas.error || fija.error || aplicaciones.error) && (
        <p role="alert" className="text-sm text-destructive">{(compensar.error || vincular.error || clientes.error || cuentas.error || fija.error || aplicaciones.error)?.message}</p>
      )}
      {compensar.isSuccess && <p role="status" className="text-sm">Compensación registrada.</p>}
    </form>
  );
}
