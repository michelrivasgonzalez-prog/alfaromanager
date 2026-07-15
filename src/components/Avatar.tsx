import { colorAvatar, iniciales } from "@/lib/dias";
import { cn } from "@/lib/utils";

export function Avatar({
  nombre,
  size = 40,
  className,
}: {
  nombre: string;
  size?: number;
  className?: string;
}) {
  const bg = colorAvatar(nombre || "?");
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full font-semibold text-white shadow-soft",
        className
      )}
      style={{ width: size, height: size, backgroundColor: bg, fontSize: size * 0.4 }}
    >
      {iniciales(nombre || "?")}
    </div>
  );
}
