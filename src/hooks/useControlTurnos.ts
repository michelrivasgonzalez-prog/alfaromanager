import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  consultarTurnosOperativos, iniciarSesionTurnos, tieneSesionTurnos,
} from "@/lib/turnosOperativos";

export function useControlTurnos(usuarioId: string | null | undefined) {
  const client = useQueryClient();
  const [verificado, setVerificado] = useState(() => !!usuarioId && tieneSesionTurnos(usuarioId));

  useEffect(() => {
    const actualizar = () => setVerificado(!!usuarioId && tieneSesionTurnos(usuarioId));
    actualizar();
    window.addEventListener("alfaro-turnos-sesion", actualizar);
    window.addEventListener("focus", actualizar);
    return () => {
      window.removeEventListener("alfaro-turnos-sesion", actualizar);
      window.removeEventListener("focus", actualizar);
    };
  }, [usuarioId]);

  const query = useQuery({
    queryKey: ["alfaro-turnos-activos", usuarioId],
    queryFn: () => consultarTurnosOperativos(usuarioId!),
    enabled: !!usuarioId && verificado,
    refetchInterval: 30000,
    refetchOnWindowFocus: "always",
    retry: false,
  });

  const verificar = useCallback(async (pin: string) => {
    if (!usuarioId) throw new Error("Selecciona un usuario válido.");
    await iniciarSesionTurnos(usuarioId, pin);
    setVerificado(true);
    await client.invalidateQueries({ queryKey: ["alfaro-turnos-activos", usuarioId] });
  }, [usuarioId, client]);

  return {
    turnos: query.data ?? [],
    verificado,
    verificar,
    cargando: query.isLoading && verificado,
    error: query.error,
    recargar: () => query.refetch(),
  };
}
