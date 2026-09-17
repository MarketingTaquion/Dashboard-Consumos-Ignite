import { NextResponse } from "next/server";
import { fetchGoogleAdsCampaigns } from "@/lib/windsorCampaigns";
import { hasWindsorCredentials, DATE_RANGE_KEYS, type DateRangeKey } from "@/lib/windsor";
import { MOCK_CAMPAIGNS } from "@/lib/mockCampaigns";
import type { CampaignsResponse, PlatformKey } from "@/lib/types";

export const dynamic = "force-dynamic";

// Todas las plataformas que el selector de la vista Medios puede pedir —
// distinto de "cuáles ya tienen fetcher real" (eso se resuelve más abajo).
// OJO: esta lista es la que valida el query param; si solo tuviera "google"
// acá, pedir ?platform=meta caería siempre a "google" antes de llegar al
// branch que sí sabe manejar "todavía no conectado" (bug real, encontrado
// probando esto en vivo).
const ALL_PLATFORM_KEYS: PlatformKey[] = ["google", "meta", "tiktok", "linkedin"];

// De esas, cuáles ya tienen fetcher de campañas contra Windsor.ai real.
const CONNECTED_PLATFORMS: PlatformKey[] = ["google"];

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

  // Plataforma sin fetcher real todavía (Meta, TikTok, LinkedIn): mock
  // explícito con warning, sin importar si hay API key configurada o no.
  if (!CONNECTED_PLATFORMS.includes(platform)) {
    return NextResponse.json(notConnectedResponse(platform));
  }

  if (!hasWindsorCredentials()) {
    const body: CampaignsResponse = { source: "mock", platform, campaigns: MOCK_CAMPAIGNS[platform] ?? [] };
    return NextResponse.json(body);
  }

  try {
    const { campaigns, warnings } = await fetchGoogleAdsCampaigns(rangeKey);
    const body: CampaignsResponse = {
      source: campaigns.length > 0 ? "windsor" : "mock",
      platform,
      campaigns: campaigns.length > 0 ? campaigns : MOCK_CAMPAIGNS.google ?? [],
      warnings: warnings.length ? warnings : undefined,
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
