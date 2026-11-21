# Raza

Web para identificar perros y gatos, y decir la raza. La cámara se ve en vivo y la ficha se actualiza sola. También se puede subir una foto.

No entrena un modelo. Cada foto va al servidor y de ahí a Gemini, así que la clave no sale al navegador. La ficha no cambia en cada frame: Gemini tarda un par de segundos, y el navegador manda la siguiente foto cuando vuelve la respuesta.

## Correr en local

1. Crea una clave en [Google AI Studio](https://aistudio.google.com/apikey).
2. Copia `.env.example` a `.env.local` y pega la clave en `GOOGLE_GENERATIVE_AI_API_KEY`.
3. Instala y arranca:

```bash
npm install
npm run dev
```

Abre http://localhost:3000. `GEMINI_MODEL` por defecto es `gemini-3.5-flash-lite`, el más rápido para el bucle. Si las razas salen flojas, cámbialo a `gemini-4-hydrogen`.


