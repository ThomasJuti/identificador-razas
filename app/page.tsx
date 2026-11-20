export default function Home() {
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col justify-center px-6 pb-16 lg:px-16">
      <h1 className="max-w-[12ch] font-heading text-5xl italic leading-[1.05] tracking-[-0.04em] md:text-6xl">
        Qué raza es
      </h1>
      <p className="mt-4 max-w-[42ch] text-lg font-light leading-relaxed text-ink/75">
        Apunta la cámara a un perro o un gato. La ficha se actualiza sola.
      </p>
    </main>
  );
}
