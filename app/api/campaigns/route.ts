import { NextResponse } from "next/server";
import { fetchGoogleAdsCampaigns } from "@/lib/windsorCampaigns";
import { fetchMetaCampaigns } from "@/lib/windsorMeta";
import { fetchTiktokCampaigns } from "@/lib/windsorTiktok";
import { hasWindsorCredentials, DATE_RANGE_KEYS, type DateRangeKey } from "@/lib/windsor";
import { fetchMediaPlanBudgetByCampaign } from "@/lib/mediaPlan";
import { MOCK_CAMPAIGNS } from "@/lib/mockCampaigns";
import type { CampaignRow, CampaignsResponse, PlatformKey } from "@/lib/types";

export const dynamic = "force-dynamic";

// Todas las plataformas que el selector de la vista Medios puede pedir —
// distinto de "cuáles ya tienen fetcher real" (eso se resuelve más abajo).
// OJO: esta lista es la que valida el query param; si solo tuviera "google"
// acá, pedir ?platform=meta caería siempre a "google" antes de llegar al
// branch que sí sabe manejar "todavía no conectado" (bug real, encontrado
// probando esto en vivo).
const ALL_PLATFORM_KEYS: PlatformKey[] = ["google", "meta", "tiktok", "linkedin"];

// De esas, cuáles ya tienen fetcher de campañas contra Windsor.ai real.
const CONNECTED_PLATFORMS: PlatformKey[] = ["google", "meta", "tiktok"];

function fetchCampaignsForPlatform(platform: PlatformKey, rangeKey: DateRangeKey): Promise<{ campaigns: CampaignRow[]; warnings: string[] }> {
  switch (platform) {
    case "google":
      return fetchGoogleAdsCampaigns(rangeKey);
    case "meta":
      return fetchMetaCampaigns(rangeKey);
    case "tiktok":
      return fetchTiktokCampaigns(rangeKey);
    default:
      return Promise.resolve({ campaigns: [], warnings: [] });
  }
}

function parseRangeParam(request: Request): DateRangeKey {
  const raw = new URL(request.url).searchParams.get("range");
  return (DATE_RANGE_KEYS as string[]).includes(raw || "") ? (raw as DateRangeKey) : "month";
}

function parsePlatformParam(request: Request): PlatformKey {
  const raw = new URL(request.url).searchParams.get("platform") as PlatformKey | null;
  return raw && ALL_PLATFORM_KEYS.includes(raw) ? raw : "google";
}

function notConnectedResponse(platform: PlatformKey): CampaignsResponse {
  return {
    source: "mock",
    platform,
    campaigns: MOCK_CAMPAIGNS[platform] ?? [],
    warnings: [`Campañas de ${platform} todavía no están conectadas a Windsor.ai — mostrando datos de ejemplo.`],
  };
}

export async function GET(request: Request) {
  const platform = parsePlatformParam(request);
  const rangeKey = parseRangeParam(request);

  // Plataforma sin fetcher real todavía (LinkedIn): mock explícito con
  // warning, sin importar si hay API key configurada o no.
  if (!CONNECTED_PLATFORMS.includes(platform)) {
    return NextResponse.json(notConnectedResponse(platform));
  }

  if (!hasWindsorCredentials()) {
    const body: CampaignsResponse = { source: "mock", platform, campaigns: MOCK_CAMPAIGNS[platform] ?? [] };
    return NextResponse.json(body);
  }

  try {
    // Presupuesto proyectado por campaña (hoja madre) en paralelo — cruce
    // aparte de los datos de Windsor, no vive en los fetchers de campaña
    // (esos son solo de Windsor). Mismo mecanismo que ya usa
    // lib/financeCampaigns.ts para Finanzas.
    const [{ campaigns, warnings }, budgets] = await Promise.all([
      fetchCampaignsForPlatform(platform, rangeKey),
      fetchMediaPlanBudgetByCampaign(),
    ]);
    const campaignsWithBudget: CampaignRow[] = campaigns.map((c) => ({
      ...c,
      budget: budgets.byCampaign.get(`${c.accountId}:${c.campaignName}`) ?? 0,
    }));
    const allWarnings = budgets.warning ? [...warnings, budgets.warning] : warnings;
    const body: CampaignsResponse = {
      source: campaignsWithBudget.length > 0 ? "windsor" : "mock",
      platform,
      campaigns: campaignsWithBudget.length > 0 ? campaignsWithBudget : MOCK_CAMPAIGNS[platform] ?? [],
      warnings: allWarnings.length ? allWarnings : undefined,
    };
    return NextResponse.json(body);
  } catch (err: any) {
    const body: CampaignsResponse = {
      source: "mock",
      platform,
      campaigns: MOCK_CAMPAIGNS[platform] ?? [],
      warnings: [`Error inesperado consultando campañas, se usó mock: ${err?.message || err}`],
    };
    return NextResponse.json(body);
  }
}
