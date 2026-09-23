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
  /** account_id real de Windsor.ai — solo en cuentas reales (key empieza con "windsor-"), para cruzar con `campaigns`. */
  accountId?: string;
  /** Desglose por campaña de esta cuenta, para la vista Finanzas — ver lib/financeCampaigns.ts. Ausente/vacío en clientes mock. */
  campaigns?: FinanceCampaignRow[];
}

/**
 * Fila de campaña simplificada para el desglose de la vista Finanzas —
 * solo lo que un usuario de Finanzas necesita (presupuesto vs. real), no
 * las métricas de performance de CampaignRow (esas son de Medios). Ver
 * lib/financeCampaigns.ts.
 */
export interface FinanceCampaignRow {
  campaignId: string;
  campaignName: string;
  spend: number; // real, ARS
  budget: number; // presupuesto proyectado desde la hoja madre, por campaña; 0 si no hay fila cargada
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
  spend: number; // real, ARS — reutilizado por lib/financeCampaigns.ts para el desglose de Finanzas
  // Presupuesto proyectado de la hoja madre para esta campaña puntual
  // (columna "campaña", ver lib/mediaPlan.ts); 0 si no hay fila cargada —
  // nunca se inventa. Se agrega en app/api/campaigns/route.ts, no en los
  // fetchers de lib/windsorCampaigns.ts/windsorMeta.ts/windsorTiktok.ts —
  // esos son solo de datos de Windsor, el cruce con la hoja va aparte.
  budget: number;
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
  // Comunes a Meta Ads y TikTok Ads — no existen en Google Ads a nivel campaña.
  reach?: number;
  frequency?: number; // promedio de veces que una misma persona vio el anuncio
  // Exclusivas de TikTok Ads. Nota: "quality_ranking"/"engagement_rate_ranking"/
  // "conversion_rate_ranking" y "% video visto" de Meta Ads quedaron afuera de
  // esta tabla a propósito — son métricas de ANUNCIO individual en el modelo
  // de datos real de Meta (un mismo campaign_id agrupa varios ads, cada uno
  // con su propio ranking; promediarlas o mostrar una sola por campaña sería
  // engañoso). Van a aparecer en la vista Anuncios de Meta cuando se conecte.
  avgVideoPlaySeconds?: number;
  likes?: number;
}

export interface CampaignsResponse {
  source: "mock" | "windsor";
  platform: PlatformKey;
  campaigns: CampaignRow[];
  warnings?: string[];
}

/**
 * Fila de anuncio para la vista Medios — un nivel más profundo que
 * CampaignRow. Sin métricas de cuota de subasta/calidad: esas son propias
 * del nivel campaña en Google Ads, no existen por anuncio.
 */
export interface AdRow {
  accountId: string;
  accountName: string;
  campaignId: string;
  campaignName: string;
  adId: string;
  adName: string;
  impressions: number;
  ctr: number; // %, 0-100
  cpl: number; // spend / conversions; 0 si conversions es 0
  conversions: number;
}

export interface AdsResponse {
  source: "mock" | "windsor";
  platform: PlatformKey;
  ads: AdRow[];
  warnings?: string[];
}

/**
 * Comparación agregada por plataforma (no por cuenta/campaña) — reutiliza
 * el mismo descubrimiento de cuentas de lib/windsor.ts que ya alimenta la
 * vista Finanzas, así que las 3 plataformas conectadas (Google/Meta/TikTok)
 * llegan reales desde el día uno, sin fetcher nuevo por plataforma.
 */
export interface PlatformComparisonRow {
  platformKey: PlatformKey;
  label: string;
  spend: number;
  conversions: number;
  cpl: number; // spend / conversions; 0 si conversions es 0
}

export interface PlatformComparisonResponse {
  source: "mock" | "windsor";
  platforms: PlatformComparisonRow[];
  warnings?: string[];
}
