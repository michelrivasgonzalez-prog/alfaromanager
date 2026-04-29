import { Users } from "lucide-react";

export default function Usuarios() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Usuarios</h1>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-soft">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl gradient-primary text-primary-foreground">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <div className="font-semibold">Dependiente actual</div>
            <div className="text-xs text-muted-foreground">
              El nombre se asigna al iniciar cada cuadre.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
