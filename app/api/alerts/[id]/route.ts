import { NextResponse } from "next/server";
import { moderateAlert, readStoreConfig } from "@/lib/alertLog";
import { isValidAlertId, validateModeration } from "@/lib/alertTypes";

export const dynamic = "force-dynamic";

/**
 * PATCH { status: "pending" | "reviewed" | "dismissed", note?, by } → modera una alerta.
 *
 * - `by` (quién modera) es obligatorio y queda en el historial de la alerta.
 * - Descartar exige una `note` con el motivo.
 * - Cada cambio se agrega al historial; nada se borra.
 *
 * ⚠️ Sin autenticación (no hay login todavía): `by` es el nombre que escribe quien
 * modera, no una identidad verificada. Proteger esta ruta es parte del login con
 * Supabase Auth del próximo sprint — igual que POST /api/finance-budget.
 */
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  if (!isValidAlertId(params.id)) {
    return NextResponse.json({ error: "Identificador de alerta inválido." }, { status: 400 });
  }
  if (!readStoreConfig()) {
    return NextResponse.json({ error: "El registro de alertas no está configurado." }, { status: 503 });
  }
  const body = await request.json().catch(() => null);
  const parsed = validateModeration(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const updated = await moderateAlert(params.id, parsed.value);
    if (!updated) return NextResponse.json({ error: "La alerta no existe." }, { status: 404 });
    return NextResponse.json({ ok: true, alert: updated });
  } catch (err: any) {
    return NextResponse.json({ error: String(err?.message || err) }, { status: 502 });
  }
}
