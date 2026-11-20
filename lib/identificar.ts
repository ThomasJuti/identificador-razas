import {
  APICallError,
  generateText,
  NoObjectGeneratedError,
  Output,
} from "ai";
import { google } from "@ai-sdk/google";
import { identificacionSchema, normalizar, type Identificacion } from "./schema";

const MODELO_POR_DEFECTO = "gemini-3.5-flash-lite";

const PROMPT = `Miras una foto y decides si el sujeto principal es un perro o un gato, y de qué raza es.
Responde en español.
Si no hay un perro ni un gato claramente visible, no inventes una raza: usa otro u no_detectado, deja la raza vacía y la ficha vacía.
Si hay varios animales, identifica el que ocupa más la imagen y marca varios.
Si la raza no es clara, marca mestizo y usa hasta dos razas cercanas.
La seguridad es tu estimación, no una probabilidad.
Los rasgos tienen que verse en la foto. No describas lo que no se ve.
La ficha, solo si es perro o gato, cabe en una frase: origen, tamaño y temperamento.
Usa el nombre común de la raza en español.
La caja debe rodear el cuerpo del perro o gato principal, de la punta de las orejas a las patas, sin dejar medio animal afuera. x e y son la esquina superior izquierda. Si no hay perro ni gato, la caja va en ceros.`;

export class IdentificarError extends Error {
  code: "falta_clave" | "respuesta_invalida" | "api";

  constructor(code: IdentificarError["code"]) {
    super(code);
    this.code = code;
  }
}

export async function identificar(
  imagen: Uint8Array,
  mediaType: string,
): Promise<Identificacion> {
  if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY?.trim()) {
    throw new IdentificarError("falta_clave");
  }

  const modelId = process.env.GEMINI_MODEL?.trim() || MODELO_POR_DEFECTO;
  const modeloRapido = modelId.includes("flash-lite");

  try {
    const { output } = await generateText({
      model: google(modelId),
      output: Output.object({ schema: identificacionSchema }),
      providerOptions: modeloRapido
        ? { google: { thinkingConfig: { thinkingLevel: "minimal" } } }
        : undefined,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            { type: "image", image: imagen, mediaType },
          ],
        },
      ],
    });

    return normalizar(output);
  } catch (error) {
    if (error instanceof IdentificarError) throw error;
    if (NoObjectGeneratedError.isInstance(error)) {
      throw new IdentificarError("respuesta_invalida");
    }
    if (APICallError.isInstance(error) && (error.statusCode === 401 || error.statusCode === 403)) {
      throw new IdentificarError("falta_clave");
    }
    throw new IdentificarError("api");
  }
}
