import { colorAvatar, iniciales } from "@/lib/dias";
import { cn } from "@/lib/utils";
import { useCuadreStore } from "@/store/cuadreStore";

interface AvatarProps {
  nombre: string;
  size?: number | "sm" | "md" | "lg" | "xl";
  className?: string;
  src?: string;
}

const SIZES_MAP: Record<string, number> = {
  sm: 28,
  md: 36,
  lg: 44,
  xl: 64,
};

export function Avatar({
  nombre = "",
  size = 40,
  className,
  src,
}: AvatarProps) {
  // Protección opcional (s?.settings) para evitar pantallas blancas si la store no rehidrató
  const fotoGuardada = useCuadreStore((s) => s?.settings?.dependienteFotos?.[nombre]);
  const imagen = src || fotoGuardada;

  // Determinar tamaño numérico real (soporta números o strings como "md", "lg")
  const pxSize = typeof size === "number" ? size : (SIZES_MAP[size] ?? 40);

  if (imagen) {
    return (
      <img
        src={imagen}
        alt={nombre || "Avatar"}
        className={cn(
          "shrink-0 rounded-full object-cover shadow-soft border border-border/60",
          className
        )}
        style={{ width: pxSize, height: pxSize }}
      />
    );
  }

  const bg = colorAvatar(nombre || "?");
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-soft",
        className
      )}
      style={{
        width: pxSize,
        height: pxSize,
        backgroundColor: bg,
        fontSize: pxSize * 0.4,
      }}
    >
      {iniciales(nombre || "?")}
    </div>
  );
}

// Exportación por defecto para evitar errores si algún archivo hace `import Avatar from ...`
export default Avatar;
