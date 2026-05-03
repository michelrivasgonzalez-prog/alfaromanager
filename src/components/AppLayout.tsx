import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Home, History, BarChart3, Package, Users, Settings, LogOut } from "lucide-react";
import { motion } from "framer-motion";
import { useAuth, AppRole } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";

const ALL_TABS: { to: string; icon: any; label: string; allow: AppRole[] }[] = [
  { to: "/", icon: Home, label: "Inicio", allow: ["admin", "duena", "dependiente"] },
  { to: "/historial", icon: History, label: "Historial", allow: ["admin", "duena", "dependiente"] },
  { to: "/reportes", icon: BarChart3, label: "Reportes", allow: ["admin", "duena"] },
  { to: "/productos", icon: Package, label: "Productos", allow: ["admin"] },
  { to: "/usuarios", icon: Users, label: "Usuarios", allow: ["admin"] },
  { to: "/ajustes", icon: Settings, label: "Ajustes", allow: ["admin", "duena", "dependiente"] },
];

export default function AppLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { role, signOut, nombre } = useAuth();
  const tabs = ALL_TABS.filter((t) => !role || t.allow.includes(role));
  return (
    <div className="min-h-screen gradient-warm">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4 pt-3 text-xs text-muted-foreground">
        <span className="truncate">
          {nombre}
          {role && (
            <span className="ml-2 rounded-full bg-primary/10 px-2 py-0.5 font-semibold text-primary">
              {role === "duena" ? "Dueña" : role === "admin" ? "Admin" : "Dependiente"}
            </span>
          )}
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await signOut();
            navigate("/auth", { replace: true });
          }}
          className="h-7 px-2 text-xs"
        >
          <LogOut className="mr-1 h-3 w-3" /> Salir
        </Button>
      </div>
      <motion.main
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="mx-auto max-w-2xl px-4 pt-4 safe-bottom"
      >
        <Outlet />
      </motion.main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-lg">
        <div className="mx-auto flex max-w-2xl items-center justify-around px-2 py-2">
          {tabs.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 rounded-xl px-2 py-1.5 text-[10px] font-medium transition-smooth ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <div
                    className={`rounded-lg p-1.5 transition-smooth ${
                      isActive ? "gradient-primary text-primary-foreground shadow-soft" : ""
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
