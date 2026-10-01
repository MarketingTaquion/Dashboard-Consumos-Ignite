/**
 * Envío de email vía la API de Resend (https://resend.com/docs/api-reference/emails/send-email).
 * Sin dependencias nuevas: un solo POST. Variables de entorno (ver
 * docs/reference/variables-de-entorno.md):
 *
 * - RESEND_API_KEY — API key de Resend.
 * - NOTIFY_FROM    — remitente, ej. "Pulso Ignite <pulso@taquion.com.ar>". El
 *                    dominio tiene que estar verificado en Resend.
 * - NOTIFY_TO      — destinatarios separados por coma.
 *
 * SOLO SERVER-SIDE.
 */

export interface EmailConfig {
  apiKey: string;
  from: string;
  to: string[];
}

/** Devuelve la configuración, o la lista de variables que faltan. */
export function readEmailConfig(): { config: EmailConfig } | { missing: string[] } {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.NOTIFY_FROM?.trim();
  const to = (process.env.NOTIFY_TO ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const missing: string[] = [];
  if (!apiKey) missing.push("RESEND_API_KEY");
  if (!from) missing.push("NOTIFY_FROM");
  if (to.length === 0) missing.push("NOTIFY_TO");
  if (missing.length > 0) return { missing };
  return { config: { apiKey: apiKey!, from: from!, to } };
}

export async function sendEmail(config: EmailConfig, message: { subject: string; html: string; text: string }): Promise<{ ok: true; id?: string } | { ok: false; error: string }> {
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: config.from, to: config.to, subject: message.subject, html: message.html, text: message.text }),
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: `Resend respondió HTTP ${res.status}: ${String(body?.message ?? body?.error ?? "").slice(0, 200)}` };
    }
    return { ok: true, id: typeof body?.id === "string" ? body.id : undefined };
  } catch (err: any) {
    return { ok: false, error: `No se pudo contactar a Resend: ${err?.message || err}` };
  }
}
