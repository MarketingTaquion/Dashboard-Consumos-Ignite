/**
 * Único punto de salida hacia connectors.windsor.ai — antes cada lib/windsor*.ts
 * tenía su propio `fetchLayer` copiado, unos con timeout y otros sin.
 *
 * - Timeout de WINDSOR_TIMEOUT_MS por consulta (incluye la lectura del body).
 *   Medido en producción 2026-09-30: Meta y TikTok a nivel anuncio tardan
 *   ~9s, así que el 8s anterior los cortaba a mitad de camino.
 * - Un reintento ante 429 / 5xx / error de red. Un timeout NO se reintenta:
 *   duplicaría la espera sin evidencia de que el segundo intento sea más rápido.
 * - Máximo MAX_CONCURRENT consultas en vuelo por instancia: las capas de cada
 *   plataforma ahora corren en paralelo, esto evita disparar ~25 requests
 *   simultáneos contra Windsor cuando se abre Finanzas.
 *
 * SOLO SERVER-SIDE (usa WINDSOR_API_KEY).
 */

const WINDSOR_BASE_URL = "https://connectors.windsor.ai";

export const WINDSOR_TIMEOUT_MS = 20000;
const MAX_CONCURRENT = 8;
const RETRY_DELAY_MS = 500;

class WindsorHttpError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(`HTTP ${status} — ${detail}`);
    this.status = status;
  }
}

class WindsorTimeoutError extends Error {
  constructor() {
    super(`Timeout de ${WINDSOR_TIMEOUT_MS / 1000}s consultando Windsor.ai`);
  }
}

let active = 0;
const waiters: Array<() => void> = [];

async function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return;
  }
  // El lugar se traspasa directo al siguiente en la cola: `active` no baja.
  await new Promise<void>((resolve) => waiters.push(resolve));
}

function release(): void {
  const next = waiters.shift();
  if (next) next();
  else active--;
}

async function requestOnce(url: string): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), WINDSOR_TIMEOUT_MS);
  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new WindsorHttpError(res.status, text.slice(0, 300));
    }
    return await res.json();
  } catch (err: any) {
    if (err?.name === "AbortError") throw new WindsorTimeoutError();
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function isRetryable(err: unknown): boolean {
  if (err instanceof WindsorTimeoutError) return false;
  if (err instanceof WindsorHttpError) return err.status === 429 || err.status >= 500;
  return true; // error de red
}

async function requestWithRetry(url: string): Promise<any> {
  await acquire();
  try {
    try {
      return await requestOnce(url);
    } catch (err) {
      if (!isRetryable(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return await requestOnce(url);
    }
  } finally {
    release();
  }
}

/** Una consulta de un connector de Windsor → array de filas. Tira si falla. */
export async function fetchWindsorRows(connector: string, fields: string, dateFrom: string, dateTo: string): Promise<any[]> {
  const params = new URLSearchParams({ api_key: process.env.WINDSOR_API_KEY!, fields, date_from: dateFrom, date_to: dateTo });
  const json = await requestWithRetry(`${WINDSOR_BASE_URL}/${connector}?${params.toString()}`);
  const rows = Array.isArray(json) ? json : json?.data;
  if (!Array.isArray(rows)) throw new Error("Respuesta inesperada de Windsor.ai (ni array ni { data: [...] })");
  return rows;
}

/** Mensaje legible de un resultado rechazado de Promise.allSettled. */
export function reasonMessage(result: PromiseRejectedResult): string {
  return (result.reason as any)?.message || String(result.reason);
}
