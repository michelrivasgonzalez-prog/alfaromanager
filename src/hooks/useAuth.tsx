// Wrapper de compatibilidad: ahora la auth es por PIN local.
// Mantenemos esta API para que el resto de la app no se rompa.
import { ReactNode } from "react";
import { usePinStore } from "@/store/pinStore";

export type AppRole = "admin" | "duena" | "dependiente";

export function AuthProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export const useAuth = () => {
  const { users, currentUserId, logout } = usePinStore();
  const u = users.find((x) => x.id === currentUserId) ?? null;
  return {
    user: u ? { email: u.recoveryEmail ?? "", id: u.id } : null,
    session: u ? { user: { id: u.id } } : null,
    role: (u?.role ?? null) as AppRole | null,
    nombre: u?.nombre ?? null,
    loading: false,
    signOut: async () => logout(),
  };
};
