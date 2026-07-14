import { Wallet, Users, Receipt, ShieldCheck } from "lucide-react";

export default function Cobrar() {
  return (
    <div className="space-y-4 pb-8">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl gradient-primary text-primary-foreground shadow-soft">
          <Wallet className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-primary">Cuentas por cobrar</h1>
          <p className="text-xs text-muted-foreground">Clientes, deudas y abonos</p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2">
        <KpiCard label="Pendiente total" value="—" />
        <KpiCard label="Clientes con deuda" value="—" />
        <KpiCard label="Cobrado hoy" value="—" />
        <KpiCard label="Cobrado mes" value="—" />
      </div>

      <div className="grid gap-3">
        <ModuleCard
          icon={<Users className="h-5 w-5" />}
          title="Clientes"
          desc="Ficha, historial y saldos"
          soon
        />
        <ModuleCard
          icon={<Receipt className="h-5 w-5" />}
          title="Deudas"
          desc="Generadas desde cuadres a crédito"
          soon
        />
        <ModuleCard
          icon={<ShieldCheck className="h-5 w-5" />}
          title="Registrar abono"
          desc="Distribuir un pago entre deudas y compartir comprobante"
          soon
        />
      </div>

      <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-center text-xs text-muted-foreground">
        Módulo en fase de fundaciones. Las funciones se activarán en la Fase 3.
      </div>
    </div>
  );
}

function KpiCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-soft">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-bold text-primary">{value}</div>
    </div>
  );
}

function ModuleCard({
  icon,
  title,
  desc,
  soon,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  soon?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-soft">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        {icon}
      </div>
      <div className="flex-1">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground">{desc}</div>
      </div>
      {soon && (
        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
          Próximamente
        </span>
      )}
    </div>
  );
}