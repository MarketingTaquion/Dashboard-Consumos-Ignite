import { NextResponse } from "next/server";
import { MOCK_CLIENTS, MOCK_TODAY, MOCK_DAYS_IN_MONTH } from "@/lib/mockData";
import { fetchGoogleAdsSpend, hasGoogleAdsCredentials } from "@/lib/googleAds";
import type { SpendResponse } from "@/lib/types";

export const dynamic = "force-dynamic"; // siempre recalcular, nunca cachear una respuesta vieja

export async function GET() {
  if (!hasGoogleAdsCredentials()) {
    const body: SpendResponse = {
      source: "mock",
      today: MOCK_TODAY,
      daysInMonth: MOCK_DAYS_IN_MONTH,
      clients: MOCK_CLIENTS,
    };
    return NextResponse.json(body);
  }

  try {
    const { clients, warnings } = await fetchGoogleAdsSpend(MOCK_CLIENTS);
    const now = new Date();
    const body: SpendResponse = {
      source: "google-ads",
      today: now.getDate(),
      daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
      clients,
      warnings: warnings.length ? warnings : undefined,
    };
    return NextResponse.json(body);
  } catch (err: any) {
    // Cualquier falla inesperada de la integración real -> no romper el dashboard.
    const body: SpendResponse = {
      source: "mock",
      today: MOCK_TODAY,
      daysInMonth: MOCK_DAYS_IN_MONTH,
      clients: MOCK_CLIENTS,
      warnings: [`Error inesperado consultando Google Ads, se usó mock: ${err?.message || err}`],
    };
    return NextResponse.json(body);
  }
}
