import { IdentificarError, identificar } from "@/lib/identificar";

export const maxDuration = 30;

const MAX_BYTES = 1.5 * 1024 * 1024;
const TIPOS = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "imagen_vacia" }, { status: 400 });
  }

  const archivo = form.get("imagen");
  if (!(archivo instanceof File) || archivo.size === 0) {
    return Response.json({ error: "imagen_vacia" }, { status: 400 });
  }
  if (archivo.size > MAX_BYTES) {
    return Response.json({ error: "imagen_grande" }, { status: 413 });
  }
  if (!TIPOS.has(archivo.type)) {
    return Response.json({ error: "formato" }, { status: 400 });
  }

  try {
    const bytes = new Uint8Array(await archivo.arrayBuffer());
    const resultado = await identificar(bytes, archivo.type);
    return Response.json(resultado);
  } catch (error) {
    if (error instanceof IdentificarError) {
      const status = error.code === "falta_clave" ? 503 : 502;
      return Response.json({ error: error.code }, { status });
    }
    return Response.json({ error: "api" }, { status: 502 });
  }
}
