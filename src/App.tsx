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
import Auth from "./pages/Auth";
import NotFound from "./pages/NotFound";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { fullSync } from "@/lib/sync";

const queryClient = new QueryClient();

function RequireAuth({ children }: { children: JSX.Element }) {
  const { session, loading } = useAuth();
  if (loading) return null;
  if (!session) return <Navigate to="/auth" replace />;
  return children;
}

function RequireRole({
  allow,
  children,
}: {
  allow: Array<"admin" | "duena" | "dependiente">;
  children: JSX.Element;
}) {
  const { role, loading } = useAuth();
  if (loading) return null;
  if (!role || !allow.includes(role)) return <Navigate to="/" replace />;
  return children;
}

function SyncBoot() {
  const { role, session } = useAuth();
  useEffect(() => {
    if (session && role) {
      fullSync(role).catch(console.error);
    }
  }, [session, role]);
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <SyncBoot />
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
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
