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
    clicks: 1350,
    cpm: 1100,
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
    clicks: 988,
    cpm: 1132,
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
    clicks: 2509,
    cpm: 714,
    ctr: 4.9,
    cpl: 590,
    conversions: 62,
  },
];

const META_ADS: AdRow[] = [
  {
    accountId: "mock-norte",
    accountName: "Norte Fintech",
    campaignId: "m1",
    campaignName: "Reels — Awareness",
    adId: "ma1",
    adName: "Reel — \"Empezá a invertir\" v1",
    impressions: 62400,
    clicks: 1747,
    cpm: 182,
    ctr: 2.8,
    cpl: 710,
    conversions: 16,
  },
  {
    accountId: "mock-norte",
    accountName: "Norte Fintech",
    campaignId: "m1",
    campaignName: "Reels — Awareness",
    adId: "ma2",
    adName: "Reel — \"Empezá a invertir\" v2 (testimonio)",
    impressions: 78100,
    clicks: 1484,
    cpm: 166,
    ctr: 1.9,
    cpl: 1180,
    conversions: 11,
  },
  {
    accountId: "mock-andes",
    accountName: "Andes Turismo",
    campaignId: "m2",
    campaignName: "Feed — Conversión",
    adId: "ma3",
    adName: "Feed — \"3 pasos para tu próximo viaje\"",
    impressions: 43700,
    clicks: 1486,
    cpm: 136,
    ctr: 3.4,
    cpl: 540,
    conversions: 11,
  },
];

const TIKTOK_ADS: AdRow[] = [
  {
    accountId: "mock-norte",
    accountName: "Norte Fintech",
    campaignId: "t1",
    campaignName: "In-Feed — Marca",
    adId: "ta1",
    adName: "In-Feed — \"Tu plata, en movimiento\"",
    impressions: 118300,
    clicks: 2011,
    cpm: 159,
    ctr: 1.7,
    cpl: 1340,
    conversions: 14,
  },
  {
    accountId: "mock-andes",
    accountName: "Andes Turismo",
    campaignId: "t2",
    campaignName: "TopView — Lanzamiento",
    adId: "ta2",
    adName: "TopView — \"Tu próximo destino empieza acá\"",
    impressions: 204600,
    clicks: 5933,
    cpm: 140,
    ctr: 2.9,
    cpl: 870,
    conversions: 33,
  },
];

export const MOCK_ADS: Partial<Record<PlatformKey, AdRow[]>> = {
  google: GOOGLE_ADS,
  meta: META_ADS,
  tiktok: TIKTOK_ADS,
};
