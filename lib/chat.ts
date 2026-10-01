/**
 * Envío de mensajes a un Espacio de Google Chat vía webhook entrante
 * (https://developers.google.com/workspace/chat/quickstart/webhooks).
 * Sin dependencias nuevas: un solo POST con `{ "text": "..." }`.
 *
 * Variable de entorno (ver docs/reference/variables-de-entorno.md):
 * - GOOGLE_CHAT_WEBHOOK_URL — URL del webhook del espacio, con `key` y `token`.
 *   **Es una credencial**: con ella cualquiera puede escribir en el espacio.
 *   Va solo en Vercel (marcada como Sensitive) — nunca en el repo ni en un chat.
 *
 * El host se valida a propósito: aunque la variable la carga el equipo, el
 * mensaje lleva datos de gasto de clientes y no debe poder terminar en un
 * destino que no sea Google Chat.
 *
 * Los errores NUNCA incluyen la URL: el token viaja en la query string.
 *
 * SOLO SERVER-SIDE.
 */

const ALLOWED_PREFIX = "https://chat.googleapis.com/v1/spaces/";

/** Google Chat acepta hasta 32.000 bytes por mensaje; se corta muy por debajo para no quedar al borde. */
export const CHAT_MAX_CHARS = 4000;

export type ChatConfig = { url: string } | { missing: true } | { invalid: string };

export function readChatConfig(): ChatConfig {
  const url = process.env.GOOGLE_CHAT_WEBHOOK_URL?.trim();
  if (!url) return { missing: true };
  if (!url.startsWith(ALLOWED_PREFIX)) {
    return { invalid: `GOOGLE_CHAT_WEBHOOK_URL debe empezar con ${ALLOWED_PREFIX}…` };
  }
  return { url };
}

/** Recorta en un salto de línea para no cortar a mitad de una viñeta. */
export function fitChatText(text: string, max: number = CHAT_MAX_CHARS): string {
  if (text.length <= max) return text;
  const note = "\n…(resumen recortado — ver el detalle completo en Pulso)";
  const cut = text.lastIndexOf("\n", max - note.length);
  return text.slice(0, cut > 0 ? cut : max - note.length) + note;
}

export async function sendChatMessage(url: string, text: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ text: fitChatText(text) }),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, error: `Google Chat respondió HTTP ${res.status}: ${String(body?.error?.message ?? "").slice(0, 200)}` };
    }
    return { ok: true };
  } catch (err: any) {
    // err.message de fetch no incluye la URL, pero se acota igual por las dudas.
    return { ok: false, error: `No se pudo contactar a Google Chat: ${String(err?.message || err).slice(0, 200)}` };
  }
}
