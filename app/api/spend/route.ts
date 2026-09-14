import { NextResponse } from "next/server";
import { MOCK_CLIENTS, MOCK_TODAY, MOCK_DAYS_IN_MONTH } from "@/lib/mockData";
import { fetchGoogleAdsSpend, hasGoogleAdsCredentials } from "@/lib/googleAds";
import { fetchWindsorSpend, hasWindsorCredentials, resolveDateRange, DATE_RANGE_KEYS, type DateRangeKey } from "@/lib/windsor";
import type { SpendResponse } from "@/lib/types";

export const dynamic = "force-dynamic"; // siempre recalcular, nunca cachear una respuesta vieja

function mockResponse(warnings?: string[]): SpendResponse {
  return {
    source: "mock",
    today: MOCK_TODAY,
    daysInMonth: MOCK_DAYS_IN_MONTH,
    clients: MOCK_CLIENTS,
    warnings,
  };
}

function parseRangeParam(request: Request): DateRangeKey {
  const raw = new URL(request.url).searchParams.get("range");
  return (DATE_RANGE_KEYS as string[]).includes(raw || "") ? (raw as DateRangeKey) : "month";
}

export async function GET(request: Request) {
  // Prioridad: Windsor.ai (capa de ingesta elegida, ver
  // docs/explanation/arquitectura-de-datos.md) > Google Ads API directo
  // (paso intermedio, ver lib/googleAds.ts) > mock. Cada nivel cae al
  // siguiente si falta configuración o si la consulta real tira una
  // excepción no controlada — /api/spend nunca devuelve un error al cliente.
  const rangeKey = parseRangeParam(request);

  if (hasWindsorCredentials()) {
    try {
      const range = resolveDateRange(rangeKey);
      const { clients, warnings } = await fetchWindsorSpend(MOCK_CLIENTS, range);
      const body: SpendResponse = {
        source: "windsor",
        today: range.today,
        daysInMonth: range.daysInPeriod,
        clients,
        warnings: warnings.length ? warnings : undefined,
      };
      return NextResponse.json(body);
    } catch (err: any) {
      return NextResponse.json(
        mockResponse([`Error inesperado consultando Windsor.ai, se usó mock: ${err?.message || err}`])
      );
    }
  }

  if (hasGoogleAdsCredentials()) {
    // lib/googleAds.ts todavía no soporta rangos de fecha (siempre consulta
    // "mes en curso" vía GAQL) — el selector de fecha no tiene efecto en
    // este fallback. No es una limitación nueva: este camino es un paso
    // intermedio sin uso activo en producción (ver docs/how-to/conectar-google-ads.md).
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
      return NextResponse.json(
        mockResponse([`Error inesperado consultando Google Ads, se usó mock: ${err?.message || err}`])
      );
    }
  }

  return NextResponse.json(mockResponse());
}
