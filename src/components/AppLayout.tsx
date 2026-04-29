import { NavLink, Outlet, useLocation } from "react-router-dom";
import { Home, History, BarChart3, Package, Users, Settings } from "lucide-react";
import { motion } from "framer-motion";

const tabs = [
  { to: "/", icon: Home, label: "Inicio" },
  { to: "/historial", icon: History, label: "Historial" },
  { to: "/reportes", icon: BarChart3, label: "Reportes" },
  { to: "/productos", icon: Package, label: "Productos" },
  { to: "/usuarios", icon: Users, label: "Usuarios" },
  { to: "/ajustes", icon: Settings, label: "Ajustes" },
];

export default function AppLayout() {
  const location = useLocation();
  return (
    <div className="min-h-screen gradient-warm">
      <motion.main
        key={location.pathname}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="mx-auto max-w-2xl px-4 pt-6 safe-bottom"
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
