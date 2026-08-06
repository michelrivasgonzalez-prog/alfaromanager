import { create } from "zustand";
import { persist } from "zustand/middleware";
import { useCuadreStore } from "./cuadreStore";

export type PinRole = "admin" | "duena" | "dependiente";

export type PinUser = {
  id: string;
  nombre: string;
  role: PinRole;
  pinHash: string;
  recoveryEmail?: string;
};

async function sha256(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashPin(pin: string, salt: string) {
  return sha256(`alfaro::${salt}::${pin}`);
}

interface PinState {
  users: PinUser[];
  currentUserId: string | null;
  createUser: (data: { nombre: string; role: PinRole; pin: string; recoveryEmail?: string }) => Promise<PinUser>;
  updatePin: (id: string, newPin: string) => Promise<boolean>;
  updateUser: (id: string, patch: Partial<Omit<PinUser, "id" | "pinHash">>) => void;
  removeUser: (id: string) => void;
  login: (pin: string) => Promise<PinUser | null>;
  logout: () => void;
}

const applyRole = (role: PinRole | null) => {
  // La dueña tiene los mismos privilegios que un admin.
  useCuadreStore
    .getState()
    .setRole(role === "admin" || role === "duena" ? "admin" : "dependiente");
};

export const usePinStore = create<PinState>()(
  persist(
    (set, get) => ({
      users: [],
      currentUserId: null,

      createUser: async ({ nombre, role, pin, recoveryEmail }) => {
        const id = crypto.randomUUID();
        const pinHash = await hashPin(pin, id);
        const user: PinUser = { id, nombre, role, pinHash, recoveryEmail };
        set((s) => ({ users: [...s.users, user] }));
        return user;
      },

      updatePin: async (id, newPin) => {
        const u = get().users.find((x) => x.id === id);
        if (!u) return false;
        const pinHash = await hashPin(newPin, id);
        set((s) => ({ users: s.users.map((x) => (x.id === id ? { ...x, pinHash } : x)) }));
        return true;
      },

      updateUser: (id, patch) =>
        set((s) => ({ users: s.users.map((u) => (u.id === id ? { ...u, ...patch } : u)) })),

      removeUser: (id) =>
        set((s) => ({
          users: s.users.filter((u) => u.id !== id),
          currentUserId: s.currentUserId === id ? null : s.currentUserId,
        })),

      login: async (pin) => {
        for (const u of get().users) {
          const h = await hashPin(pin, u.id);
          if (h === u.pinHash) {
            set({ currentUserId: u.id });
            applyRole(u.role);
            // Sincroniza en segundo plano tras el login para reflejar
            // cambios de otros dispositivos de inmediato.
            import("@/lib/sync")
              .then((m) => m.fullSync(u.role))
              .catch(console.warn);
            return u;
          }
        }
        return null;
      },

      logout: () => {
        set({ currentUserId: null });
      },
    }),
    {
      name: "alfarocafe-pin",
      onRehydrateStorage: () => (state) => {
        if (state?.currentUserId) {
          const u = state.users.find((x) => x.id === state.currentUserId);
          applyRole(u?.role ?? null);
        }
      },
    }
  )
);

export const useCurrentPinUser = (): PinUser | null => {
  const { users, currentUserId } = usePinStore();
  return users.find((u) => u.id === currentUserId) ?? null;
};
