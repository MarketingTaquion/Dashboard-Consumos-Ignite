import type { AdRow, PlatformKey } from "./types";

/**
 * Datos de ejemplo para la vista Medios → Anuncios. Mismas cuentas/campañas
 * de ejemplo que lib/mockCampaigns.ts, un nivel más profundo. Se usa
 * mientras no hay WINDSOR_API_KEY, o para una plataforma que todavía no
 * tiene fetcher de anuncios (ver app/api/ads/route.ts).
 */

const GOOGLE_ADS: AdRow[] = [
  {
    accountId: "mock-norte",
    accountName: "Norte Fintech",
    campaignId: "c1",
    campaignName: "Search — Marca",
    adId: "a1",
    adName: "RSA — \"Invertí desde $10.000\"",
    impressions: 24100,
    ctr: 5.6,
    cpl: 780,
    conversions: 34,
  },
  {
    accountId: "mock-norte",
    accountName: "Norte Fintech",
    campaignId: "c1",
    campaignName: "Search — Marca",
    adId: "a2",
    adName: "RSA — \"Tu plazo fijo, en minutos\"",
    impressions: 24100,
    ctr: 4.1,
    cpl: 1010,
    conversions: 27,
  },
  {
    accountId: "mock-andes",
    accountName: "Andes Turismo",
    campaignId: "c3",
    campaignName: "Search — Destinos",
    adId: "a3",
    adName: "RSA — \"Bariloche desde $180.000\"",
    impressions: 51200,
    ctr: 4.9,
    cpl: 590,
    conversions: 62,
  },
];

export const MOCK_ADS: Partial<Record<PlatformKey, AdRow[]>> = {
  google: GOOGLE_ADS,
};
