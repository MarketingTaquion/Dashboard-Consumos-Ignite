export type PlatformKey = "meta" | "google" | "linkedin" | "tiktok";

export interface PlatformCpl {
  target: number;
  real: number;
  label?: string; // ej. "CPME" en vez de "CPL" para clientes de comunidad
  prevPeriodDeltaPct?: number; // % de cambio del pacing vs. el período anterior (ilustrativo hasta tener histórico real)
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
  source: "mock" | "google-ads" | "windsor";
  today: number; // día del mes actual usado como corte "hoy"
  daysInMonth: number;
  clients: ClientData[];
  warnings?: string[]; // ej. "Google Ads devolvió error, se usó mock para ese cliente"
}

/**
 * Fila de campaña para la vista Medios (ver Artifact "Pulso Ignite — Perfil
 * Medios"). Granularidad campaña, no cuenta — un nivel más profundo que
 * ClientData, que es para la vista de Finanzas.
 */
export interface CampaignRow {
  accountId: string;
  accountName: string;
  campaignId: string;
  campaignName: string;
  impressions: number;
  clicks: number;
  cpm: number;
  ctr: number; // %, 0-100
  cpl: number; // spend / conversions; 0 si conversions es 0
  conversions: number;
  // Exclusivas de Google Ads — undefined si el campo no vino en la
  // respuesta de Windsor para esa campaña (no se fabrica un 0).
  searchImpressionShare?: number; // %, 0-100
  qualityScore?: number; // 1-10, promedio del período
  searchBudgetLostIS?: number; // %, 0-100
  searchRankLostIS?: number; // %, 0-100
  searchAbsoluteTopIS?: number; // %, 0-100
  searchTopIS?: number; // %, 0-100
  optimizationScore?: number; // %, 0-100
}

export interface CampaignsResponse {
  source: "mock" | "windsor";
  platform: PlatformKey;
  campaigns: CampaignRow[];
  warnings?: string[];
}
