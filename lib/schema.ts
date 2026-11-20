import { z } from "zod";

export const identificacionSchema = z.object({
  especie: z
    .enum(["perro", "gato", "otro", "no_detectado"])
    .describe(
      "perro o gato si el sujeto principal lo es; otro si es otro animal; no_detectado si no hay un animal claro",
    ),
  raza: z
    .string()
    .nullable()
    .describe(
      "Nombre común de la raza en español. Mestizo si no hay una raza clara. null si no es perro ni gato",
    ),
  mestizo: z
    .boolean()
    .describe("true si parece cruce o la raza no se puede afirmar"),
  razasCercanas: z
    .array(z.string())
    .max(2)
    .describe("Hasta dos razas parecidas, solo si es mestizo o la seguridad es baja"),
  seguridad: z
    .enum(["alta", "media", "baja"])
    .describe("Estimación propia, no una probabilidad calibrada"),
  rasgos: z
    .array(z.string())
    .max(3)
    .describe("Dos o tres rasgos que se vean en la foto. Vacío si no hay perro ni gato"),
  ficha: z
    .string()
    .nullable()
    .describe(
      "Una frase sobre origen, tamaño y temperamento. null si no es perro ni gato",
    ),
  varios: z
    .boolean()
    .describe("true si hay más de un animal y la ficha es del principal"),
  caja: z
    .object({
      x: z.number().describe("Borde izquierdo del animal, fracción del ancho de la foto"),
      y: z.number().describe("Borde superior del animal, fracción del alto de la foto"),
      ancho: z.number().describe("Ancho del animal, fracción del ancho de la foto"),
      alto: z.number().describe("Alto del animal, fracción del alto de la foto"),
    })
    .describe(
      "Rectángulo que encierra el cuerpo del perro o gato principal. Ceros si no hay perro ni gato",
    ),
});

export type Caja = { x: number; y: number; ancho: number; alto: number };

type IdentificacionCruda = z.infer<typeof identificacionSchema>;

export type Identificacion = Omit<IdentificacionCruda, "caja"> & {
  caja: Caja | null;
};

function unidad(tope: number) {
  if (tope > 100) return 1000;
  if (tope > 1.5) return 100;
  return 1;
}

function fraccion(valor: number, divisor: number) {
  if (!Number.isFinite(valor)) return 0;
  return Math.min(1, Math.max(0, valor / divisor));
}

export function normalizar(data: IdentificacionCruda): Identificacion {
  const rasgos = data.rasgos.map((rasgo) => rasgo.trim()).filter(Boolean).slice(0, 3);
  const cercanas = data.razasCercanas
    .map((raza) => raza.trim())
    .filter(Boolean)
    .slice(0, 2);

  const divisor = unidad(Math.max(data.caja.x, data.caja.y, data.caja.ancho, data.caja.alto));
  const x = fraccion(data.caja.x, divisor);
  const y = fraccion(data.caja.y, divisor);
  const ancho = Math.min(fraccion(data.caja.ancho, divisor), 1 - x);
  const alto = Math.min(fraccion(data.caja.alto, divisor), 1 - y);
  const caja = ancho >= 0.04 && alto >= 0.04 ? { x, y, ancho, alto } : null;

  if (data.especie !== "perro" && data.especie !== "gato") {
    return {
      ...data,
      raza: null,
      mestizo: false,
      razasCercanas: [],
      rasgos,
      ficha: null,
      caja: null,
    };
  }

  const raza = data.mestizo ? "Mestizo" : data.raza?.trim() || null;

  return {
    ...data,
    raza,
    razasCercanas: cercanas,
    rasgos,
    ficha: data.ficha?.trim() || null,
    caja,
  };
}
