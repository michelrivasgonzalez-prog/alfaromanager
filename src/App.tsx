import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import InstallPrompt from "@/components/InstallPrompt";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "./components/AppLayout";
import Index from "./pages/Index";
import Cuadre from "./pages/Cuadre";
import Historial from "./pages/Historial";
import Calendario from "./pages/Calendario";
import Reportes from "./pages/Reportes";
import Productos from "./pages/Productos";
import Usuarios from "./pages/Usuarios";
import Ajustes from "./pages/Ajustes";
import Almacen from "./pages/Almacen";
import Cobrar from "./pages/Cobrar";
import ClienteDetalle from "./pages/ClienteDetalle";
import Abonar from "./pages/Abonar";
import Buscar from "./pages/Buscar";
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
      <InstallPrompt />
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
                <RequireRole allow={["admin", "duena", "dependiente"]}>
                  <Cuadre />
                </RequireRole>
              }
            />
            <Route
              path="/historial"
              element={
                <RequireRole allow={["admin", "duena"]}>
                  <Historial />
                </RequireRole>
              }
            />
            <Route
              path="/calendario"
              element={
                <RequireRole allow={["admin", "duena"]}>
                  <Calendario />
                </RequireRole>
              }
            />
            <Route path="/buscar" element={<Buscar />} />
            <Route
              path="/reportes"
              element={
                <RequireRole allow={["admin", "duena"]}>
                  <Reportes />
                </RequireRole>
              }
            />
            <Route
              path="/productos"
              element={
                <RequireRole allow={["admin", "duena"]}>
                  <Productos />
                </RequireRole>
              }
            />
            <Route
              path="/usuarios"
              element={
                <RequireRole allow={["admin", "duena"]}>
                  <Usuarios />
                </RequireRole>
              }
            />
            <Route
              path="/ajustes"
              element={
                <RequireRole allow={["admin", "duena"]}>
                  <Ajustes />
                </RequireRole>
              }
            />
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
                <RequireRole allow={["admin", "duena", "dependiente"]}>
                  <Cobrar />
                </RequireRole>
              }
            />
            <Route
              path="/cobrar/clientes/:id"
              element={
                <RequireRole allow={["admin", "duena", "dependiente"]}>
                  <ClienteDetalle />
                </RequireRole>
              }
            />
            <Route
              path="/cobrar/clientes/:id/abonar"
              element={
                <RequireRole allow={["admin", "duena", "dependiente"]}>
                  <Abonar />
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
