import { motion } from "framer-motion";
import { RefreshCw, Cloud } from "lucide-react";

interface Props {
  nombreUser?: string;
}

export default function SincronizandoOverlay({ nombreUser }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background/95 backdrop-blur-md px-6 text-center"
    >
      <div className="relative flex items-center justify-center mb-6">
        {/* Glow de fondo */}
        <div className="absolute h-24 w-24 rounded-full bg-primary/20 blur-xl animate-pulse" />
        
        {/* Logo / Ícono */}
        <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl gradient-primary text-primary-foreground shadow-lg">
          <Cloud className="h-10 w-10 animate-bounce" />
        </div>
      </div>

      <h2 className="text-xl font-bold text-foreground tracking-tight">
        Sincronizando datos...
      </h2>
      
      <p className="mt-1 text-xs text-muted-foreground max-w-xs">
        {nombreUser ? `Hola, ${nombreUser}. ` : ""}
        Estamos actualizando los cuadres, productos y cuentas con la nube. Por favor espera un momento.
      </p>

      <div className="mt-6 flex items-center gap-2 rounded-full bg-muted/60 px-4 py-2 text-xs font-medium text-primary shadow-xs">
        <RefreshCw className="h-4 w-4 animate-spin text-primary" />
        <span>Cargando información...</span>
      </div>
    </motion.div>
  );
}
