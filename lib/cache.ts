/**
 * Caché en memoria para las respuestas armadas de las rutas /api/* — SOLO
 * SERVER-SIDE.
 *
 * Reglas (pensadas para que una caída de Windsor.ai no rompa el dashboard ni
 * muestre datos inventados):
 * - Dentro de `freshMs` se devuelve lo guardado, sin tocar Windsor.
 * - Solo se guarda un resultado "limpio" (`isClean`): sin warnings y con datos.
 *   Un resultado parcial (ej. una capa venció por timeout) nunca se cachea.
 * - Si la consulta nueva falla o viene parcial y hay un resultado limpio
 *   anterior de hasta `maxStaleMs`, se sirve ese (marcado `stale`) en vez de
 *   un error o de una tabla incompleta. La UI avisa con un warning.
 * - Consultas idénticas simultáneas comparten una sola llamada a Windsor.
 *
 * Es por instancia de Vercel (no compartida entre instancias ni entre cold
 * starts): mejora mucho el caso de 2 usuarios que recargan, pero no
 * reemplaza un almacenamiento persistente — ese es el histórico en Supabase
 * del backlog.
 */

interface Entry {
  value: unknown;
  at: number;
}

const store = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

export interface CachedResult<T> {
  value: T;
  /** true = se sirvió un resultado anterior porque el nuevo falló o vino parcial. */
  stale: boolean;
  /** Antigüedad del dato servido (0 si es recién consultado). */
  ageMs: number;
  /** Por qué no se pudo refrescar, si `stale`. */
  refreshError?: string;
}

interface Options<T> {
  key: string;
  freshMs: number;
  maxStaleMs: number;
  load: () => Promise<T>;
  isClean: (value: T) => boolean;
  /** Describe por qué un resultado no-limpio no sirvió (para el warning de stale). */
  describe?: (value: T) => string;
}

export async function cachedWithFallback<T>(opts: Options<T>): Promise<CachedResult<T>> {
  const { key, freshMs, maxStaleMs, load, isClean, describe } = opts;

  const hit = store.get(key);
  if (hit && Date.now() - hit.at < freshMs) {
    return { value: hit.value as T, stale: false, ageMs: Date.now() - hit.at };
  }

  let pending = inflight.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = load().finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }

  const servePrevious = (reason: string): CachedResult<T> | null => {
    const prev = store.get(key);
    if (!prev || Date.now() - prev.at >= maxStaleMs) return null;
    return { value: prev.value as T, stale: true, ageMs: Date.now() - prev.at, refreshError: reason };
  };

  let value: T;
  try {
    value = await pending;
  } catch (err: any) {
    const previous = servePrevious(err?.message || String(err));
    if (previous) return previous;
    throw err;
  }

  if (isClean(value)) {
    store.set(key, { value, at: Date.now() });
    return { value, stale: false, ageMs: 0 };
  }
  const previous = servePrevious(describe ? describe(value) : "la consulta vino incompleta");
  if (previous) return previous;
  return { value, stale: false, ageMs: 0 };
}

export function staleWarning(ageMs: number, reason?: string): string {
  const min = Math.max(1, Math.round(ageMs / 60000));
  const detail = reason ? ` Motivo: ${reason.slice(0, 200)}` : "";
  return `Mostrando datos de hace ${min} min — no se pudo actualizar desde Windsor.ai en este momento.${detail}`;
}

/**
 * ¿Este warning indica que una consulta a Windsor falló (resultado parcial)?
 * Los fetchers también emiten warnings puramente informativos ("ninguna
 * campaña tuvo impresiones", "el campo X no vino en ninguna fila") que son
 * normales con cuentas pausadas y NO deben impedir cachear el resultado.
 * Los mensajes de falla siempre dicen "falló …", "no se pudo …", "Timeout …"
 * o "HTTP <status>".
 */
export function isDegradedWarning(warning: string): boolean {
  return /fall[óo]|no se pudo|timeout|HTTP \d{3}/i.test(warning);
}

export function hasDegradedWarning(warnings: string[] | undefined): boolean {
  return !!warnings && warnings.some(isDegradedWarning);
}

/** Tiempos comunes a todas las rutas. */
export const CACHE_FRESH_MS = 5 * 60 * 1000;
export const CACHE_MAX_STALE_MS = 6 * 60 * 60 * 1000;
