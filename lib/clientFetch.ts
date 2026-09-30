/**
 * fetch + JSON para los componentes cliente. Si la ruta responde con error,
 * incluye el motivo que manda el servidor (`{ error }`) en vez de solo
 * "HTTP 502" — así la pantalla de error dice qué pasó realmente.
 */
export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    let detail = "";
    try {
      const body = await res.json();
      if (body && typeof body.error === "string") detail = body.error;
    } catch {
      // body sin JSON — alcanza con el status
    }
    throw new Error(`HTTP ${res.status}${detail ? " — " + detail : ""}`);
  }
  return res.json() as Promise<T>;
}
