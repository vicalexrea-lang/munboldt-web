export const prerender = false;
import type { APIRoute } from 'astro';

// Falls back to import.meta.env for local `astro dev` (Vite loads .env into
// import.meta.env but not process.env there); on Vercel/production, the
// dashboard-configured env var lands in process.env and is used first.
const GROQ_API_KEY = process.env.GROQ_API_KEY ?? import.meta.env.GROQ_API_KEY;
const GROQ_MODEL = 'llama-3.1-8b-instant';
const GROQ_ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

export const POST: APIRoute = async ({ request }) => {
  try {
    const payload = await request.json();
    
    // 🕵️‍♂️ Extraemos el mensaje del navegador
    let extractedMessages = [];
    if (payload.messages && Array.isArray(payload.messages)) {
      extractedMessages = payload.messages;
    } else if (Array.isArray(payload)) {
      extractedMessages = payload;
    } else if (payload.systemPrompt || payload.userText) {
      if (payload.systemPrompt) extractedMessages.push({ role: "system", content: payload.systemPrompt });
      if (payload.userText) extractedMessages.push({ role: "user", content: payload.userText });
    } else {
      extractedMessages = [{ role: "user", content: JSON.stringify(payload) }];
    }

    // 🚀 Llamada a Groq
    const response = await fetch(GROQ_ENDPOINT, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: extractedMessages,
      }),
    });

    const data = await response.json();

    // 🏆 EXTRAEMOS EL TEXTO PURO DE LA RESPUESTA DE GROQ
    const textoRespuesta = data.choices?.[0]?.message?.content || "Hubo un error al procesar el texto.";

    // 🎁 EL "EMPAQUE UNIVERSAL"
    // Le damos a tu página la respuesta en TODOS los formatos posibles para que no falle
    const respuestaUniversal = {
      ...data,                            // Formato original (OpenAI/OpenRouter)
      text: textoRespuesta,               // Formato texto
      reply: textoRespuesta,              // Formato reply
      message: textoRespuesta,            // Formato mensaje directo
      candidates: [                       // Formato GEMINI (el que probablemente busca tu web)
        { content: { parts: [{ text: textoRespuesta }] } }
      ]
    };

    return new Response(JSON.stringify(respuestaUniversal), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error("Error:", error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), { status: 500 });
  }
};