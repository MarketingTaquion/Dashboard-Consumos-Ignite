import { NextResponse } from "next/server";
import { fetchGoogleAdsAds } from "@/lib/windsorAds";
import { hasWindsorCredentials, DATE_RANGE_KEYS, type DateRangeKey } from "@/lib/windsor";
import { MOCK_ADS } from "@/lib/mockAds";
import type { AdsResponse, PlatformKey } from "@/lib/types";

export const dynamic = "force-dynamic";

// Mismo criterio que app/api/campaigns/route.ts: ALL_PLATFORM_KEYS valida el
// query param, CONNECTED_PLATFORMS dice cuáles ya tienen fetcher real.
const ALL_PLATFORM_KEYS: PlatformKey[] = ["google", "meta", "tiktok", "linkedin"];
const CONNECTED_PLATFORMS: PlatformKey[] = ["google"];

function parseRangeParam(request: Request): DateRangeKey {
  const raw = new URL(request.url).searchParams.get("range");
  return (DATE_RANGE_KEYS as string[]).includes(raw || "") ? (raw as DateRangeKey) : "month";
}

function parsePlatformParam(request: Request): PlatformKey {
  const raw = new URL(request.url).searchParams.get("platform") as PlatformKey | null;
  return raw && ALL_PLATFORM_KEYS.includes(raw) ? raw : "google";
}

function notConnectedResponse(platform: PlatformKey): AdsResponse {
  return {
    source: "mock",
    platform,
    ads: MOCK_ADS[platform] ?? [],
    warnings: [`Anuncios de ${platform} todavía no están conectados a Windsor.ai — mostrando datos de ejemplo.`],
  };
}

export async function GET(request: Request) {
  const platform = parsePlatformParam(request);
  const rangeKey = parseRangeParam(request);

  if (!CONNECTED_PLATFORMS.includes(platform)) {
    return NextResponse.json(notConnectedResponse(platform));
  }

  if (!hasWindsorCredentials()) {
    const body: AdsResponse = { source: "mock", platform, ads: MOCK_ADS[platform] ?? [] };
    return NextResponse.json(body);
  }

  try {
    const { ads, warnings } = await fetchGoogleAdsAds(rangeKey);
    const body: AdsResponse = {
      source: ads.length > 0 ? "windsor" : "mock",
      platform,
      ads: ads.length > 0 ? ads : MOCK_ADS.google ?? [],
      warnings: warnings.length ? warnings : undefined,
    };
    return NextResponse.json(body);
  } catch (err: any) {
    const body: AdsResponse = {
      source: "mock",
      platform,
      ads: MOCK_ADS[platform] ?? [],
      warnings: [`Error inesperado consultando anuncios, se usó mock: ${err?.message || err}`],
    };
    return NextResponse.json(body);
  }
}
