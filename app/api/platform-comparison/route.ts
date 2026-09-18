import { NextResponse } from "next/server";
import { fetchPlatformComparison, hasWindsorCredentials, resolveDateRange, DATE_RANGE_KEYS, type DateRangeKey } from "@/lib/windsor";
import type { PlatformComparisonResponse } from "@/lib/types";

export const dynamic = "force-dynamic";

function parseRangeParam(request: Request): DateRangeKey {
  const raw = new URL(request.url).searchParams.get("range");
  return (DATE_RANGE_KEYS as string[]).includes(raw || "") ? (raw as DateRangeKey) : "month";
}

// Mismos números que el artboard "Comparación" del wireframe — para que el
// mock y el mockup coincidan.
const MOCK_PLATFORMS: PlatformComparisonResponse["platforms"] = [
  { platformKey: "google", label: "Google Ads", spend: 120400, conversions: 135, cpl: 892 },
  { platformKey: "meta", label: "Meta Ads", spend: 27000, conversions: 38, cpl: 711 },
  { platformKey: "tiktok", label: "TikTok Ads", spend: 67800, conversions: 44, cpl: 1541 },
];

export async function GET(request: Request) {
  const rangeKey = parseRangeParam(request);

  if (!hasWindsorCredentials()) {
    const body: PlatformComparisonResponse = { source: "mock", platforms: MOCK_PLATFORMS };
    return NextResponse.json(body);
  }

  try {
    const { platforms, warnings } = await fetchPlatformComparison(resolveDateRange(rangeKey));
    // Real en cuanto se encontró al menos una cuenta en alguna plataforma —
    // el gasto/conversiones de cada una se muestran tal cual, $0 incluido,
    // sin caer a mock por plataforma individual (ver lib/windsor.ts).
    const hasAnyAccount = platforms.some((p) => p.accountCount > 0);
    const body: PlatformComparisonResponse = {
      source: hasAnyAccount ? "windsor" : "mock",
      platforms: hasAnyAccount ? platforms.map(({ platformKey, label, spend, conversions, cpl }) => ({ platformKey, label, spend, conversions, cpl })) : MOCK_PLATFORMS,
      warnings: warnings.length ? warnings : undefined,
    };
    return NextResponse.json(body);
  } catch (err: any) {
    const body: PlatformComparisonResponse = {
      source: "mock",
      platforms: MOCK_PLATFORMS,
      warnings: [`Error inesperado consultando comparación de plataformas, se usó mock: ${err?.message || err}`],
    };
    return NextResponse.json(body);
  }
}
