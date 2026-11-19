import { useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { compensarDeudaFondo, montoCaja, vincularFaltanteKamila } from "@/lib/cajaSobrantes";
import { listClientes, listDeudas, normalizarDependiente } from "@/lib/cobrar";
import { pullCuadre } from "@/lib/sync";
import { calcCuadre, useCuadreStore } from "@/store/cuadreStore";

const TURNO_KAMILA = "8fe85acf-9a34-4760-ab8e-18d746f76ea5";

export default function CompensarDeudaFondo({ disponible }: { disponible: number }) {
  const { history, dependientes } = useCuadreStore();
  const qc = useQueryClient();
  const [cliente, setCliente] = useState("");
  const [deuda, setDeuda] = useState("");
  const [importe, setImporte] = useState("");
  const [motivo, setMotivo] = useState("");
  const solicitud = useRef<{ clave: string; id: string } | null>(null);
  const clientes = useQuery({ queryKey: ["clientes"], queryFn: listClientes });
  const cuentas = useQuery({ queryKey: ["deudas", cliente], queryFn: () => listDeudas(cliente), enabled: !!cliente });
  const nombres = new Set([...dependientes, ...history.map((c) => c.dependiente)].map(normalizarDependiente));
  const elegibles = clientes.data?.filter((c) => nombres.has(normalizarDependiente(c.nombre))) ?? [];
  const seleccionada = elegibles.find((c) => c.id === cliente);
  const turno = history.find((c) => c.id === TURNO_KAMILA);
  const casoKamila = seleccionada && normalizarDependiente(seleccionada.nombre) === "kamila sanz friman" && turno;
  const cifras = casoKamila ? calcCuadre(turno) : null;
  const concuerda = cifras && Math.round(-cifras.diferencia * 100) === 1537500
    && Math.round(cifras.salarioBruto * 100) === 345663 && Math.round(cifras.deudaDependiente * 100) === 1191837;
  const pendientes = (cuentas.data ?? []).filter((d) => d.saldo > 0);
  const cuenta = pendientes.find((d) => d.id === deuda);
  const monto = Number(importe);

  async function refrescar() {
    await Promise.all(["caja-sobrantes", "deudas", "deudas-all", "abonos", "abonos-por-deuda"].map((key) =>
      qc.invalidateQueries({ queryKey: [key] }),
    ));
  }

  const compensar = useMutation({
    mutationFn: () => compensarDeudaFondo(solicitud.current!.id, cliente, deuda, monto, motivo.trim()),
    onSuccess: async () => {
      setImporte("");
      setMotivo("");
      solicitud.current = null;
      await refrescar();
    },
  });
  const vincular = useMutation({
    mutationFn: () => vincularFaltanteKamila(cliente, turno!),
    onSuccess: async (id) => {
      setDeuda(id);
      await refrescar();
      await pullCuadre(TURNO_KAMILA);
    },
  });
  const ocupado = compensar.isPending || vincular.isPending;
  const valido = !!cuenta && /^\d+(\.\d{1,2})?$/.test(importe) && monto > 0
    && monto <= disponible && monto <= Number(cuenta.saldo) && Boolean(motivo.trim());

  function confirmar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valido || ocupado || !window.confirm(`¿Compensar ${montoCaja(monto)} con el saldo confirmado del fondo?`)) return;
    const clave = JSON.stringify([cliente, deuda, monto, motivo.trim()]);
    if (solicitud.current?.clave !== clave) solicitud.current = { clave, id: crypto.randomUUID() };
    compensar.mutate();
  }

  return (
    <form className="space-y-3 rounded-xl border bg-card p-4" onSubmit={confirmar}>
      <h2 className="font-semibold">Compensar deuda con Fondo de Sobrantes</h2>
      {disponible <= 0 && <p className="text-sm text-muted-foreground">El fondo todavía no tiene saldo confirmado disponible.</p>}
      <label className="block space-y-1 text-sm">
        <span>Dependienta</span>
        <select className="block w-full rounded-md border bg-background p-2" required
          value={cliente} disabled={ocupado} onChange={(event) => { setCliente(event.target.value); setDeuda(""); }}>
          <option value="">Selecciona una dependienta</option>
          {elegibles.map((item) => <option key={item.id} value={item.id}>{item.nombre}</option>)}
        </select>
      </label>
      {casoKamila && !turno.deudaDependienteId && (
        <div className="space-y-2 rounded-lg bg-muted p-2 text-sm">
          <p>Turno del 17–18 de noviembre. {concuerda
            ? "Faltante 15.375 CUP, salario absorbido 3.456,63 CUP y deuda restante 11.918,37 CUP."
            : "Los importes del historial requieren conciliación antes de vincular la deuda."}</p>
          <Button type="button" variant="outline" disabled={!concuerda || ocupado} onClick={() => {
            if (window.confirm("¿Buscar la deuda de este turno y crearla solo si no existe?")) vincular.mutate();
          }}>Verificar y vincular faltante del turno</Button>
        </div>
      )}
      <label className="block space-y-1 text-sm">
        <span>Deuda pendiente</span>
        <select className="block w-full rounded-md border bg-background p-2" required value={deuda}
          disabled={!cliente || ocupado} onChange={(event) => setDeuda(event.target.value)}>
          <option value="">Selecciona una deuda</option>
          {pendientes.map((d) => (
            <option key={d.id} value={d.id}>
              {/^faltante/i.test(d.cuadre_label ?? "") || d.cuadre_id === TURNO_KAMILA ? "Faltante de caja" : "Cuenta por cobrar"}
              {" · "}{d.cuadre_label ?? new Date(d.fecha).toLocaleDateString("es")}{" · "}{montoCaja(Number(d.saldo))}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-sm">
        <span>Importe (CUP)</span>
        <Input type="number" min="0.01" step="0.01" required disabled={ocupado} value={importe}
          onChange={(event) => setImporte(event.target.value)} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Motivo</span>
        <Input required disabled={ocupado} value={motivo} onChange={(event) => setMotivo(event.target.value)} />
      </label>
      {(compensar.error || vincular.error || clientes.error || cuentas.error) && (
        <p role="alert" className="text-sm text-destructive">{(compensar.error || vincular.error || clientes.error || cuentas.error)?.message}</p>
      )}
      {compensar.isSuccess && <p role="status" className="text-sm">Compensación registrada.</p>}
      <Button type="submit" disabled={!valido || ocupado}>Confirmar compensación</Button>
    </form>
  );
}
