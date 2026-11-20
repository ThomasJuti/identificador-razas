"use client";

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  CameraRotate,
  ImageSquare,
  Pause,
  SpinnerGap,
  WarningCircle,
} from "@phosphor-icons/react";
import type { Identificacion } from "@/lib/schema";
import { proyectarCaja, type Marco } from "@/lib/proyectar";

type Fase = "idle" | "mirando" | "identificando" | "pausado";
type Lado = "environment" | "user";
type Codigo =
  | "falta_clave"
  | "imagen_vacia"
  | "imagen_grande"
  | "formato"
  | "respuesta_invalida"
  | "api"
  | "red"
  | "camara";

const MENSAJES: Record<Codigo, string> = {
  falta_clave: "Falta la clave de Gemini en el servidor.",
  imagen_vacia: "No llegó ninguna imagen.",
  imagen_grande: "La imagen pesa demasiado. Prueba con otra foto.",
  formato: "Usa una foto JPG, PNG o WEBP.",
  respuesta_invalida: "La respuesta no se pudo leer. Intenta de nuevo.",
  api: "Gemini no respondió. Revisa la conexión y la clave.",
  red: "No hay conexión con el servidor.",
  camara: "No se pudo usar la cámara. Revisa el permiso del navegador.",
};

const ESPECIE: Record<Identificacion["especie"], string> = {
  perro: "Perro",
  gato: "Gato",
  otro: "Otro",
  no_detectado: "Sin animal",
};

const SEGURIDAD: Record<Identificacion["seguridad"], string> = {
  alta: "Seguridad alta",
  media: "Seguridad media",
  baja: "Seguridad baja",
};

function esperar(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const id = setTimeout(resolve, ms);
    signal.addEventListener(
      "abort",
      () => {
        clearTimeout(id);
        reject(new DOMException("aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

function esCodigo(valor: string): valor is Codigo {
  return valor in MENSAJES;
}

async function pedir(archivo: Blob, signal: AbortSignal): Promise<Identificacion> {
  const form = new FormData();
  form.append("imagen", archivo, "frame.jpg");

  let respuesta: Response;
  try {
    respuesta = await fetch("/api/identificar", { method: "POST", body: form, signal });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new Error("red");
  }

  const data: unknown = await respuesta.json().catch(() => null);
  if (!respuesta.ok) {
    const codigo =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof data.error === "string" &&
      esCodigo(data.error)
        ? data.error
        : "api";
    throw new Error(codigo);
  }

  if (!data || typeof data !== "object" || !("especie" in data)) {
    throw new Error("respuesta_invalida");
  }

  return data as Identificacion;
}

function marco(video: HTMLVideoElement, canvas: HTMLCanvasElement) {
  const ancho = video.videoWidth;
  const alto = video.videoHeight;
  if (!ancho || !alto) return null;
  const escala = Math.min(1, 640 / ancho);
  canvas.width = Math.round(ancho * escala);
  canvas.height = Math.round(alto * escala);
  const contexto = canvas.getContext("2d");
  if (!contexto) return null;
  contexto.drawImage(video, 0, 0, canvas.width, canvas.height);
  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.7);
  });
}

export function Identificador() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const imagenRef = useRef<HTMLImageElement>(null);
  const marcoRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const tokenRef = useRef(0);
  const archivoRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);
  const cambiandoRef = useRef(false);

  const [fase, setFase] = useState<Fase>("idle");
  const [lado, setLado] = useState<Lado>("environment");
  const [enVivo, setEnVivo] = useState(false);
  const [camaraLista, setCamaraLista] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Identificacion | null>(null);
  const [caja, setCaja] = useState<Marco | null>(null);
  const [error, setError] = useState<Codigo | null>(null);

  useEffect(() => {
    const marco = marcoRef.current;
    if (!marco) return;

    function medir() {
      const vista = marcoRef.current;
      const animal = resultado?.caja;
      if (!vista || !animal || (!camaraLista && !preview)) {
        setCaja(null);
        return;
      }

      const fuente = preview
        ? { width: imagenRef.current?.naturalWidth ?? 0, height: imagenRef.current?.naturalHeight ?? 0 }
        : { width: videoRef.current?.videoWidth ?? 0, height: videoRef.current?.videoHeight ?? 0 };
      const rect = vista.getBoundingClientRect();
      setCaja(proyectarCaja(animal, { width: rect.width, height: rect.height }, fuente));
    }

    medir();
    const observador = new ResizeObserver(medir);
    observador.observe(marco);
    const video = videoRef.current;
    video?.addEventListener("loadedmetadata", medir);
    return () => {
      observador.disconnect();
      video?.removeEventListener("loadedmetadata", medir);
    };
  }, [resultado, camaraLista, preview]);

  useEffect(() => {
    previewRef.current = preview;
  }, [preview]);

  useEffect(() => {
    return () => {
      tokenRef.current += 1;
      streamRef.current?.getTracks().forEach((pista) => pista.stop());
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    };
  }, []);

  function detenerBucle() {
    tokenRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setEnVivo(false);
  }

  async function bucle(token: number, signal: AbortSignal) {
    while (tokenRef.current === token && !signal.aborted) {
      if (document.hidden) {
        await esperar(400, signal);
        continue;
      }

      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        await esperar(200, signal);
        continue;
      }

      setFase("identificando");
      const blob = await marco(video, canvas);
      if (!blob || tokenRef.current !== token) return;

      try {
        const ficha = await pedir(blob, signal);
        if (tokenRef.current !== token) return;
        setResultado(ficha);
        setError(null);
        setFase("mirando");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") throw error;
        if (tokenRef.current !== token) return;
        const codigo = error instanceof Error && esCodigo(error.message) ? error.message : "red";
        setError(codigo);
        if (codigo === "falta_clave" || codigo === "formato" || codigo === "imagen_grande") {
          throw error;
        }
        setFase("mirando");
        await esperar(1500, signal);
        continue;
      }

      await esperar(400, signal);
    }
  }

  async function abrirCamara(ladoPedido: Lado) {
    const intentos: MediaTrackConstraints[] = [
      { facingMode: { exact: ladoPedido }, width: { ideal: 1280 } },
      { facingMode: ladoPedido, width: { ideal: 1280 } },
      { width: { ideal: 1280 } },
    ];
    let stream: MediaStream | null = null;
    for (const video of intentos) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        break;
      } catch {
        stream = null;
      }
    }
    if (!stream) throw new Error("camara");

    streamRef.current?.getTracks().forEach((pista) => pista.stop());
    streamRef.current = stream;
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
    const real = stream.getVideoTracks()[0]?.getSettings().facingMode;
    setLado(real === "user" || real === "environment" ? real : ladoPedido);
    setCamaraLista(true);
    setCaja(null);
  }

  async function cambiarLado() {
    if (cambiandoRef.current) return;
    cambiandoRef.current = true;
    const siguiente: Lado = lado === "environment" ? "user" : "environment";
    try {
      await abrirCamara(siguiente);
      setError(null);
    } catch {
      setError("camara");
    } finally {
      cambiandoRef.current = false;
    }
  }

  async function empezar() {
    setError(null);
    if (preview) {
      URL.revokeObjectURL(preview);
      setPreview(null);
    }

    if (!streamRef.current) {
      try {
        await abrirCamara("environment");
      } catch {
        setError("camara");
        setFase("idle");
        return;
      }
    }

    abortRef.current?.abort();
    const token = ++tokenRef.current;
    const control = new AbortController();
    abortRef.current = control;
    setEnVivo(true);
    setFase("mirando");

    try {
      await bucle(token, control.signal);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (tokenRef.current !== token) return;
      const codigo = error instanceof Error && esCodigo(error.message) ? error.message : "red";
      setError(codigo);
      setEnVivo(false);
      setFase("pausado");
      if (codigo === "falta_clave") tokenRef.current += 1;
    }
  }

  function pausar() {
    detenerBucle();
    setFase(camaraLista ? "pausado" : "idle");
  }

  async function subir(archivo: File) {
    detenerBucle();
    setFase("identificando");
    setError(null);
    if (preview) URL.revokeObjectURL(preview);
    const url = URL.createObjectURL(archivo);
    setPreview(url);

    const control = new AbortController();
    try {
      const ficha = await pedir(archivo, control.signal);
      setResultado(ficha);
      setError(null);
    } catch (error) {
      const codigo = error instanceof Error && esCodigo(error.message) ? error.message : "red";
      setError(codigo);
    } finally {
      setFase("pausado");
    }
  }

  const ocupado = fase === "identificando" && !enVivo;
  const boton =
    "inline-flex items-center gap-2.5 rounded-full px-7 py-3.5 text-base font-medium transition duration-200 ease-[var(--ease-out)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:active:scale-100";

  return (
    <>
      <header className="fixed inset-x-0 top-4 z-50 px-6 lg:px-16">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
          <p className="liquid-glass grid h-12 place-items-center rounded-full px-5 font-heading text-xl italic tracking-[-0.03em]">
            Raza
          </p>
          <p className="liquid-glass hidden h-12 items-center rounded-full px-5 text-sm text-stone sm:flex">
            {enVivo ? "En vivo" : fase === "identificando" ? "Identificando" : fase === "idle" ? "Listo" : "En pausa"}
          </p>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-6 pt-28 pb-16 lg:px-16">
        <h1 className="max-w-[12ch] font-heading text-5xl italic leading-[1.05] tracking-[-0.04em] md:text-6xl">
          Qué raza es
        </h1>
        <p className="mt-4 max-w-[42ch] text-lg font-light leading-relaxed text-ink/75">
          Apunta la cámara a un perro o un gato. La ficha se actualiza sola, una foto a la vez.
        </p>

        <div className="mt-10 grid items-start gap-6 lg:grid-cols-12">
          <section className="lg:col-span-7">
            <div
              ref={marcoRef}
              className="relative aspect-[4/3] overflow-hidden rounded-[2rem] bg-ink/5 shadow-[0_18px_50px_rgb(36_28_51/0.08)]"
            >
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="absolute inset-0 h-full w-full object-cover"
              />
              {preview ? (
                // Blob local de la foto que acaba de elegir la persona.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  ref={imagenRef}
                  src={preview}
                  alt="Foto elegida"
                  className="absolute inset-0 h-full w-full object-cover"
                  onLoad={() => {
                    const vista = marcoRef.current;
                    const animal = resultado?.caja;
                    const imagen = imagenRef.current;
                    if (!vista || !animal || !imagen) return;
                    const rect = vista.getBoundingClientRect();
                    setCaja(
                      proyectarCaja(
                        animal,
                        { width: rect.width, height: rect.height },
                        { width: imagen.naturalWidth, height: imagen.naturalHeight },
                      ),
                    );
                  }}
                />
              ) : null}
              {!preview && !camaraLista ? (
                <div className="absolute inset-0 grid place-items-center bg-paper/80 px-8 text-center">
                  <p className="font-heading text-3xl italic leading-tight text-ink/80">
                    Un perro o un gato frente a la cámara
                  </p>
                </div>
              ) : null}
              {caja && resultado && (resultado.especie === "perro" || resultado.especie === "gato") ? (
                <div
                  className="pointer-events-none absolute z-10 rounded-2xl border-2 border-white/90 shadow-[0_0_0_2px_var(--color-iris)] motion-reduce:transition-none transition-[left,top,width,height] duration-700 ease-[var(--ease-out)]"
                  style={{ left: caja.left, top: caja.top, width: caja.width, height: caja.height }}
                >
                  <p className="absolute top-2 left-2 max-w-[calc(100%-1rem)] truncate rounded-full bg-iris px-3 py-1 text-sm font-medium text-white">
                    {ESPECIE[resultado.especie]}
                    {resultado.raza ? ` · ${resultado.raza}` : ""}
                  </p>
                </div>
              ) : null}
              {enVivo ? (
                <p className="liquid-glass absolute top-4 left-4 z-20 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm">
                  {fase === "identificando" ? (
                    <SpinnerGap size={16} className="animate-spin" />
                  ) : (
                    <span className="size-2 rounded-full bg-iris" />
                  )}
                  {fase === "identificando" ? "Identificando" : "Mirando"}
                </p>
              ) : null}
              {camaraLista && !preview ? (
                <button
                  type="button"
                  onClick={() => void cambiarLado()}
                  aria-label={lado === "environment" ? "Usar cámara frontal" : "Usar cámara trasera"}
                  className="liquid-glass absolute right-4 bottom-4 z-20 inline-flex h-12 items-center gap-2 rounded-full px-4 text-sm font-medium text-ink transition duration-200 active:scale-[0.98]"
                >
                  <CameraRotate size={20} />
                  {lado === "environment" ? "Trasera" : "Frontal"}
                </button>
              ) : null}
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              {enVivo ? (
                <button type="button" onClick={pausar} className={`${boton} liquid-glass text-ink`}>
                  <Pause size={20} weight="fill" />
                  Pausar
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => void empezar()}
                  disabled={ocupado}
                  className={`${boton} bg-iris text-white hover:bg-iris-deep`}
                >
                  <Camera size={20} weight="fill" />
                  {camaraLista ? "Reanudar" : "Empezar"}
                </button>
              )}
              <button
                type="button"
                onClick={() => archivoRef.current?.click()}
                disabled={ocupado}
                className={`${boton} liquid-glass text-ink hover:bg-white/40`}
              >
                <ImageSquare size={20} />
                Subir foto
              </button>
              <input
                ref={archivoRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                aria-label="Subir una foto"
                onChange={(evento) => {
                  const archivo = evento.target.files?.[0];
                  evento.target.value = "";
                  if (archivo) void subir(archivo);
                }}
              />
            </div>

            <div aria-live="polite" className="mt-4 min-h-6">
              {error ? (
                <p role="alert" className="inline-flex items-center gap-2 text-sm font-medium text-danger">
                  <WarningCircle size={16} weight="fill" />
                  {MENSAJES[error]}
                </p>
              ) : null}
            </div>
          </section>

          <Ficha resultado={resultado} identificando={fase === "identificando"} />
        </div>
      </main>
      <canvas ref={canvasRef} className="hidden" />
    </>
  );
}

function Ficha({
  resultado,
  identificando,
}: {
  resultado: Identificacion | null;
  identificando: boolean;
}) {
  const esMascota = resultado?.especie === "perro" || resultado?.especie === "gato";

  return (
    <aside className="liquid-glass-strong rounded-[2rem] p-8 lg:col-span-5" aria-live="polite">
      {!resultado ? (
        <div className="flex min-h-64 flex-col justify-end">
          <p className="text-xs font-medium tracking-[0.16em] text-stone uppercase">Ficha</p>
          <h2 className="mt-3 font-heading text-4xl italic leading-tight">
            {identificando ? "Mirando la foto…" : "Todavía no hay un animal"}
          </h2>
          <p className="mt-4 max-w-[28ch] font-light leading-relaxed text-ink/70">
            La especie, la raza y unos rasgos aparecen aquí en cuanto vuelve la primera respuesta.
          </p>
        </div>
      ) : (
        <div>
          <p className="text-xs font-medium tracking-[0.16em] text-stone uppercase">
            {ESPECIE[resultado.especie]}
          </p>
          <h2 className="mt-3 font-heading text-5xl italic leading-[1.05] tracking-[-0.03em]">
            {esMascota ? resultado.raza ?? "Raza por confirmar" : "No veo un perro ni un gato"}
          </h2>
          <p className="mt-4 text-sm text-stone">{SEGURIDAD[resultado.seguridad]}</p>

          {resultado.varios ? (
            <p className="mt-4 font-light leading-relaxed text-ink/75">
              Hay más de un animal. Esta ficha es del que se ve mejor.
            </p>
          ) : null}

          {resultado.razasCercanas.length > 0 ? (
            <p className="mt-4 font-light leading-relaxed text-ink/80">
              También podría ser {resultado.razasCercanas.join(" o ")}.
            </p>
          ) : null}

          {resultado.rasgos.length > 0 ? (
            <ul className="mt-6 flex flex-wrap gap-2">
              {resultado.rasgos.map((rasgo) => (
                <li key={rasgo} className="rounded-full bg-white/55 px-3 py-1.5 text-sm text-ink/80">
                  {rasgo}
                </li>
              ))}
            </ul>
          ) : null}

          {resultado.ficha ? (
            <p className="mt-6 border-t border-ink/10 pt-6 font-light leading-relaxed text-ink/80">
              {resultado.ficha}
            </p>
          ) : null}
        </div>
      )}
    </aside>
  );
}
