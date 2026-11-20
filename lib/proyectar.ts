import type { Caja } from "./schema";

export type Marco = { left: number; top: number; width: number; height: number };

export function proyectarCaja(
  caja: Caja,
  vista: { width: number; height: number },
  fuente: { width: number; height: number },
): Marco | null {
  if (vista.width < 1 || vista.height < 1 || fuente.width < 1 || fuente.height < 1) {
    return null;
  }

  const escala = Math.max(vista.width / fuente.width, vista.height / fuente.height);
  const anchoVisible = fuente.width * escala;
  const altoVisible = fuente.height * escala;
  const origenX = (vista.width - anchoVisible) / 2;
  const origenY = (vista.height - altoVisible) / 2;

  return {
    left: origenX + caja.x * anchoVisible,
    top: origenY + caja.y * altoVisible,
    width: caja.ancho * anchoVisible,
    height: caja.alto * altoVisible,
  };
}
