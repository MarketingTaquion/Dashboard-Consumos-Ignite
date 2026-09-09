export type PlatformKey = "meta" | "google" | "linkedin";

export interface PlatformCpl {
  target: number;
  real: number;
  label?: string; // ej. "CPME" en vez de "CPL" para clientes de comunidad
}

export interface HealthIssue {
  platform: string;
  text: string;
  sev: "warning" | "serious" | "critical";
}

export interface ClientData {
  key: string;
  name: string;
  vertical: string;
  budget: number; // ARS, presupuesto mensual
  spend8: number; // ARS, invertido acumulado al día 8 (o al día "today" que reporte la fuente)
  mix: Partial<Record<PlatformKey, number>>; // % de allocation por plataforma, suma ~100
  cpl: Partial<Record<PlatformKey, PlatformCpl>>;
  health: HealthIssue[];
}

export interface SpendResponse {
  source: "mock" | "google-ads";
  today: number; // día del mes actual usado como corte "hoy"
  daysInMonth: number;
  clients: ClientData[];
  warnings?: string[]; // ej. "Google Ads devolvió error, se usó mock para ese cliente"
}
