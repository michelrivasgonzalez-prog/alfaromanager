import { Warehouse, PackagePlus, PackageMinus, History as HistoryIcon } from "lucide-react";

export default function Almacen() {
  return (
    <div className="space-y-4 pb-8">
      <header className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl gradient-primary text-primary-foreground shadow-soft">
          <Warehouse className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-primary">Almacén</h1>
          <p className="text-xs text-muted-foreground">Control de inventario independiente de los cuadres</p>
        </div>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <KpiCard label="Productos" value="—" />
        <KpiCard label="Bajo mínimo" value="—" />
        <KpiCard label="Movimientos" value="—" />
      </div>

      <div className="grid gap-3">
        <ModuleCard
          icon={<PackagePlus className="h-5 w-5" />}
          title="Registrar entrada"
          desc="Añadir mercancía al almacén"
          soon
        />
        <ModuleCard
          icon={<PackageMinus className="h-5 w-5" />}
          title="Registrar salida"
          desc="Retirar mercancía con receptor y observación"
          soon
        />
        <ModuleCard
          icon={<HistoryIcon className="h-5 w-5" />}
          title="Historial de movimientos"
          desc="Trazabilidad completa con reversiones"
          soon
        />
      </div>

      <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-center text-xs text-muted-foreground">
        Módulo en fase de fundaciones. Las funciones se activarán en la Fase 2.
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