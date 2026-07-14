import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "./components/AppLayout";
import Index from "./pages/Index";
import Cuadre from "./pages/Cuadre";
import Historial from "./pages/Historial";
import Reportes from "./pages/Reportes";
import Productos from "./pages/Productos";
import Usuarios from "./pages/Usuarios";
import Ajustes from "./pages/Ajustes";
import Almacen from "./pages/Almacen";
import Cobrar from "./pages/Cobrar";
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import { usePinStore } from "@/store/pinStore";

const queryClient = new QueryClient();

function RequireAuth({ children }: { children: JSX.Element }) {
  const currentUserId = usePinStore((s) => s.currentUserId);
  if (!currentUserId) return <Navigate to="/auth" replace />;
  return children;
}

function RequireRole({
  allow,
  children,
}: {
  allow: Array<"admin" | "duena" | "dependiente">;
  children: JSX.Element;
}) {
  const { users, currentUserId } = usePinStore();
  const u = users.find((x) => x.id === currentUserId);
  if (!u || !allow.includes(u.role)) return <Navigate to="/" replace />;
  return children;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/auth" element={<Auth />} />
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route path="/" element={<Index />} />
            <Route
              path="/cuadre/:step"
              element={
                <RequireRole allow={["admin", "dependiente"]}>
                  <Cuadre />
                </RequireRole>
              }
            />
            <Route path="/historial" element={<Historial />} />
            <Route path="/reportes" element={<Reportes />} />
            <Route
              path="/productos"
              element={
                <RequireRole allow={["admin"]}>
                  <Productos />
                </RequireRole>
              }
            />
            <Route
              path="/usuarios"
              element={
                <RequireRole allow={["admin"]}>
                  <Usuarios />
                </RequireRole>
              }
            />
            <Route path="/ajustes" element={<Ajustes />} />
            <Route
              path="/almacen"
              element={
                <RequireRole allow={["admin", "duena"]}>
                  <Almacen />
                </RequireRole>
              }
            />
            <Route
              path="/cobrar"
              element={
                <RequireRole allow={["admin", "duena"]}>
                  <Cobrar />
                </RequireRole>
              }
            />
          </Route>
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
