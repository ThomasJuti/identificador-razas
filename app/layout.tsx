import type { Metadata, Viewport } from "next";
import { Barlow, Instrument_Serif } from "next/font/google";
import "./globals.css";

const instrument = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-instrument",
});

const barlow = Barlow({
  weight: ["300", "400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-barlow",
});

export const metadata: Metadata = {
  title: "Raza — perros, gatos y su raza",
  description:
    "Apunta la cámara a un perro o un gato y mira la especie, la raza y una ficha breve.",
};

export const viewport: Viewport = {
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${instrument.variable} ${barlow.variable} h-full`}>
      <body className="grain min-h-full">
        <div className="fixed inset-0 -z-10 overflow-hidden" aria-hidden>
          <div className="mancha">
            <span className="mancha__blob" />
            <span className="mancha__blob mancha__blob--b" />
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
