import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { newCuadre, useCuadreStore } from "@/store/cuadreStore";
import PortalDependiente from "./PortalDependiente";

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    nombre: "Leysi D. Paz Rodríguez",
    user: { id: "dependiente-prueba" },
    role: "dependiente",
  }),
}));
vi.mock("@/hooks/useControlTurnos", () => ({
  useControlTurnos: () => ({
    turnos: [], verificado: false, verificar: vi.fn(), cargando: false,
    error: null, recargar: vi.fn(),
  }),
}));
vi.mock("@/components/cuadre/Precuadre", () => ({
  PrecuadreDependiente: () => null,
}));
vi.mock("@/components/efectivo/EntregasDependiente", () => ({
  default: () => null,
}));

describe("PortalDependiente: renderizado del perfil", () => {
  beforeEach(() => {
    useCuadreStore.setState({ history: [] });
  });

  it("abre el perfil de Leysi sin error de JavaScript y muestra salarios pagados", () => {
    const cuadre = {
      ...newCuadre("Cafetería", []),
      dependiente: "Leysi D. Paz Rodríguez",
      finalizado: true,
      salarioDenominaciones: { "1000": 2, "500": 1 },
    };
    useCuadreStore.setState({ history: [cuadre] });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <PortalDependiente />
      </QueryClientProvider>
    );
    expect(screen.getByText("Salarios cobrados")).toBeTruthy();
    expect(screen.getByText(`${(2500).toLocaleString("es", { maximumFractionDigits: 2 })} CUP`)).toBeTruthy();
    expect(screen.getByText("Liquidaciones")).toBeTruthy();
  });
});
