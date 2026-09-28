import { NextResponse } from "next/server";
import { fetchManualBudget, setManualBudget } from "@/lib/financeBudget";

export const dynamic = "force-dynamic";

/**
 * GET → { value: number | null, warning?: string }
 * POST { value: number } → { ok: true } | { ok: false, error: string }
 *
 * Ver lib/financeBudget.ts para el mecanismo real (Vercel Global Config).
 * Sin autenticación — mismo criterio que el resto del dashboard, todavía
 * sin login (ver docs/explanation/estado-y-limitaciones.md).
 */

export async function GET() {
  const { value, warning } = await fetchManualBudget();
  return NextResponse.json({ value, warning });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const value = Number(body?.value);
  if (!Number.isFinite(value) || value < 0) {
    return NextResponse.json({ ok: false, error: "Valor inválido — tiene que ser un número mayor o igual a 0." }, { status: 400 });
  }
  const result = await setManualBudget(value);
  if (!result.ok) {
    return NextResponse.json(result, { status: 502 });
  }
  return NextResponse.json(result);
}
