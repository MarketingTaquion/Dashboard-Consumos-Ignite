"use client";

import { useEffect, useRef, useState } from "react";
import type { CampaignRow, CampaignsResponse, PlatformKey } from "@/lib/types";

const PLATFORMS: { key: PlatformKey; label: string; varName: string }[] = [
  { key: "google", label: "Google Ads", varName: "--plat-google" },
  { key: "meta", label: "Meta Ads", varName: "--plat-meta" },
  { key: "tiktok", label: "TikTok Ads", varName: "--plat-tiktok" },
];

// Mismo set de presets que la vista de Finanzas (ver DATE_PRESETS en
// Dashboard.tsx) — duplicado a propósito, no importado de lib/windsor.ts:
// ese archivo es solo-servidor. "custom" se guarda igual que en Finanzas,
// pero todavía no hay rango personalizado real conectado — cae a "month".
type DatePreset = "today" | "yesterday" | "7d" | "14d" | "28d" | "month" | "lastmonth" | "custom";
const DATE_PRESETS: { key: DatePreset; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "yesterday", label: "Ayer" },
  { key: "7d", label: "Últimos 7 días" },
  { key: "14d", label: "Últimos 14 días" },
  { key: "28d", label: "Últimos 28 días" },
  { key: "month", label: "Este mes" },
  { key: "lastmonth", label: "Mes anterior" },
];

function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("es-AR");
}
function fmtMoney(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-AR");
}
// Mismo formato compacto que los chips "Total presupuesto"/"Total gastado"
// de Finanzas (Dashboard.tsx) — duplicado a propósito, ver la nota sobre
// DatePreset más abajo.
function fmtCompact(n: number): string {
  const sign = n < 0 ? "-" : "";
  n = Math.abs(n);
  if (n >= 1e6) return sign + "$" + (n / 1e6).toFixed(1).replace(".", ",") + "M";
  if (n >= 1e3) return sign + "$" + (n / 1e3).toFixed(0) + "k";
  return sign + "$" + n.toFixed(0);
}
function fmtPct(n?: number): string {
  return n === undefined ? "—" : Math.round(n) + "%";
}
function fmtScore10(n?: number): string {
  return n === undefined ? "—" : n.toFixed(1) + "/10";
}
function fmtFreq(n?: number): string {
  return n === undefined ? "—" : n.toFixed(1);
}
function fmtSeconds(n?: number): string {
  return n === undefined ? "—" : n.toFixed(1) + "s";
}
function extraColCount(platform: PlatformKey): number {
  if (platform === "google") return 7;
  if (platform === "meta") return 2;
  if (platform === "tiktok") return 4;
  return 0;
}

// Presupuesto diario recomendado = remanente / días que quedan en el
// período, para llegar justo al presupuesto proyectado al cierre — mismo
// concepto de pacing que ya usa Finanzas (Dashboard.tsx), acá por campaña.
// undefined (se muestra "—") en 2 casos: sin presupuesto cargado (nada que
// recomendar), o el período ya cerró (today >= daysInPeriod — rangos fijos
// como "Hoy"/"Ayer"/"7d"/"Mes anterior" siempre están 100% transcurridos,
// solo "Este mes" tiene días remanentes de verdad).
function dailyRecommended(budget: number, spend: number, today: number, daysInPeriod: number): number | undefined {
  if (budget === 0) return undefined;
  const daysRemaining = daysInPeriod - today;
  if (daysRemaining <= 0) return undefined;
  return (budget - spend) / daysRemaining;
}
function fmtDailySigned(n: number): string {
  return (n >= 0 ? "+" : "") + fmtMoney(n);
}

// Fila de campaña ya combinada entre plataformas — CampaignRow + de qué
// plataforma vino, para poder mostrar la columna "Plataforma" y elegir sus
// columnas específicas cuando corresponde.
type MergedRow = CampaignRow & { platform: PlatformKey };

export default function MediosView() {
  // Antes era selección única (un solo booleano `platform`) — a pedido
  // explícito 2026-09-25 pasa a multi-selección, para poder tener varias
  // plataformas prendidas a la vez sin que una apague a la otra. Arranca
  // solo con Google Ads activo, igual que el default anterior; el resto se
  // prende a mano.
  // Partial: PlatformKey incluye "linkedin" (usado en Finanzas), que no
  // existe en el PLATFORMS de esta vista — no hace falta una entrada para él.
  const [platformsEnabled, setPlatformsEnabled] = useState<Partial<Record<PlatformKey, boolean>>>({
    google: true,
  });
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  // Un fetch por plataforma activa — se combinan en una sola tabla más abajo.
  const [dataByPlatform, setDataByPlatform] = useState<Partial<Record<PlatformKey, CampaignsResponse>>>({});
  const [error, setError] = useState<string | null>(null);
  // Mismo filtro que Finanzas (Dashboard.tsx) — acá por campaña en vez de
  // por cuenta: oculta campañas sin gasto real en el período elegido.
  // Activado por defecto (a pedido explícito 2026-09-24), en los 2
  // usuarios por igual.
  const [onlyActive, setOnlyActive] = useState(true);
  // Selector de cuentas en la barra lateral — mismo patrón que "Clientes" en
  // Finanzas (Dashboard.tsx), acá a nivel cuenta (que es el nivel real que
  // maneja Medios: CampaignRow no agrupa varias plataformas bajo un mismo
  // "cliente", cada cuenta de Windsor es de una sola plataforma).
  const [accountKey, setAccountKey] = useState<string>("all");
  const dateMenuRef = useRef<HTMLDivElement>(null);

  const enabledKeys = PLATFORMS.filter((p) => platformsEnabled[p.key]).map((p) => p.key);
  const enabledKeysDep = enabledKeys.join(",");

  useEffect(() => {
    if (!dateMenuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (dateMenuRef.current && !dateMenuRef.current.contains(e.target as Node)) {
        setDateMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [dateMenuOpen]);

  useEffect(() => {
    setError(null);
    setDataByPlatform({});
    // "custom" todavía no está conectado (ver nota en el menú de fecha) — se
    // sigue pidiendo "month" hasta que se implemente el rango personalizado.
    const range = datePreset === "custom" ? "month" : datePreset;
    const keys = enabledKeysDep.split(",").filter(Boolean) as PlatformKey[];
    Promise.all(
      keys.map((key) =>
        fetch(`/api/campaigns?platform=${key}&range=${range}`)
          .then((r) => {
            if (!r.ok) throw new Error("HTTP " + r.status);
            return r.json();
          })
          .then((body: CampaignsResponse) => [key, body] as const)
      )
    )
      .then((results) => {
        const next: Partial<Record<PlatformKey, CampaignsResponse>> = {};
        results.forEach(([key, body]) => {
          next[key] = body;
        });
        setDataByPlatform(next);
      })
      .catch((err) => setError(String(err?.message || err)));
  }, [enabledKeysDep, datePreset]);

  // Qué cuentas existen depende de las plataformas activas y el rango — si
  // cambia cualquiera de los dos, la cuenta elegida puede dejar de existir.
  useEffect(() => {
    setAccountKey("all");
  }, [enabledKeysDep, datePreset]);

  function togglePlatform(key: PlatformKey) {
    // No se puede apagar la última plataforma activa — siempre tiene que
    // quedar al menos una, si no la tabla queda sin sentido.
    if (platformsEnabled[key] && enabledKeys.length === 1) return;
    setPlatformsEnabled((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  if (error) {
    return (
      <div className="wrap">
        <div className="loading-state">No se pudo cargar /api/campaigns: {error}</div>
      </div>
    );
  }
  const loaded = enabledKeys.length > 0 && enabledKeys.every((k) => dataByPlatform[k]);
  if (!loaded) {
    return (
      <div className="wrap">
        <div className="loading-state">Cargando campañas…</div>
      </div>
    );
  }

  const showCombined = enabledKeys.length > 1;
  const singlePlatform = !showCombined ? enabledKeys[0] : undefined;
  const activeLabel = enabledKeys.map((k) => PLATFORMS.find((p) => p.key === k)?.label ?? k).join(" + ");
  const dateLabel = DATE_PRESETS.find((d) => d.key === datePreset)?.label ?? "Este mes";

  const allCampaigns: MergedRow[] = [];
  enabledKeys.forEach((k) => {
    dataByPlatform[k]?.campaigns.forEach((c) => allCampaigns.push({ ...c, platform: k }));
  });
  const allMock = enabledKeys.every((k) => dataByPlatform[k]?.source === "mock");
  const mergedWarnings = [...new Set(enabledKeys.flatMap((k) => dataByPlatform[k]?.warnings ?? []))];
  // today/daysInPeriod son iguales para todas las plataformas activas (se
  // derivan solo del rango de fecha elegido, no del dato de cada una).
  const today = dataByPlatform[enabledKeys[0]]?.today ?? 0;
  const daysInPeriod = dataByPlatform[enabledKeys[0]]?.daysInPeriod ?? 0;

  // "Actividad" = gasto real > 0 — no "tiene presupuesto cargado" (mismo
  // criterio que Finanzas). Alimenta el sidebar de cuentas y la tabla.
  const visibleCampaigns = onlyActive ? allCampaigns.filter((c) => c.spend > 0) : allCampaigns;

  // Cuentas para el sidebar — a partir de las campañas ya filtradas por
  // "Solo con actividad" (mismo orden que Finanzas: primero actividad,
  // después la cuenta elegida), sin duplicar por campaña.
  const accountMap = new Map<string, string>();
  visibleCampaigns.forEach((c) => {
    if (!accountMap.has(c.accountId)) accountMap.set(c.accountId, c.accountName);
  });
  const accounts = [...accountMap.entries()].map(([accountId, accountName]) => ({ accountId, accountName }));

  const campaignsIncluded = accountKey === "all" ? visibleCampaigns : visibleCampaigns.filter((c) => c.accountId === accountKey);

  // Totales — suma de las campañas que se están mostrando (plataformas +
  // período + filtro de actividad + cuenta elegidos), mismo par "Total
  // presupuesto"/"Total gastado" que ya tiene Finanzas arriba de su tabla.
  const totalBudget = campaignsIncluded.reduce((sum, c) => sum + c.budget, 0);
  const totalSpend = campaignsIncluded.reduce((sum, c) => sum + c.spend, 0);

  return (
    <div className="wrap">
      <header className="top">
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/taquion-isotipo.png" alt="Taquión" className="brand-mark" width={30} height={30} />
          <div>
            <h1>Pulso Ignite — Medios</h1>
            <div className="sub">Rendimiento por campaña — equipo Medios, Taquión</div>
          </div>
        </div>
        <a href="/" style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
          Ver perfil Finanzas →
        </a>
      </header>

      <nav className="medios-subnav">
        <a href="/medios" aria-current="page">Campañas</a>
        <a href="/medios/anuncios">Anuncios</a>
        <a href="/medios/comparacion">Comparación de plataformas</a>
      </nav>

      {mergedWarnings.map((w, i) => (
        <div className="mock-note" key={i}>
          <span className="tq-arrow" style={{ color: "var(--status-warning)" }}>↘</span> <span>{w}</span>
        </div>
      ))}
      {allMock && mergedWarnings.length === 0 && (
        <div className="mock-note">
          <span className="tq-arrow">↘</span>{" "}
          <span>
            <b>Datos de ejemplo.</b> En cuanto haya campañas reales de {activeLabel} en Windsor.ai, se muestran acá.
          </span>
        </div>
      )}

      <div className="controls-row">
        <div className="controls-left">
          <div className="dropdown-wrap" ref={dateMenuRef}>
            <button className="chip" aria-expanded={dateMenuOpen} onClick={() => setDateMenuOpen((v) => !v)}>
              {dateLabel} <span style={{ fontSize: 10 }}>▾</span>
            </button>
            {dateMenuOpen && (
              <div className="date-menu" role="menu">
                {DATE_PRESETS.map((d) => (
                  <button
                    key={d.key}
                    role="menuitem"
                    aria-current={datePreset === d.key}
                    onClick={() => {
                      setDatePreset(d.key);
                      setDateMenuOpen(false);
                    }}
                  >
                    {d.label}
                  </button>
                ))}
                <div className="date-menu-divider" />
                <div className="date-menu-note">
                  Windsor.ai sincroniza una vez al día — &quot;Hoy&quot; y &quot;Ayer&quot; pueden no reflejar todavía la
                  sincronización más reciente.
                </div>
                <div className="date-menu-divider" />
                <button role="menuitem" aria-current={datePreset === "custom"} onClick={() => setDatePreset("custom")}>
                  Personalizado <span style={{ fontSize: 10 }}>{datePreset === "custom" ? "▴" : "▸"}</span>
                </button>
                {datePreset === "custom" && (
                  <div className="date-custom">
                    <label>
                      Desde
                      <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} />
                    </label>
                    <label>
                      Hasta
                      <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} />
                    </label>
                    <button className="date-apply" onClick={() => setDateMenuOpen(false)}>
                      Aplicar
                    </button>
                    <div className="date-menu-note">
                      El rango se guarda, pero todavía no hay histórico real conectado — sigue mostrando &quot;Este mes&quot;.
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="stat-chip">
            <span className="stat-label">Total presupuesto</span>
            <span className="stat-value num">{fmtCompact(totalBudget)}</span>
          </div>
          <div className="stat-chip">
            <span className="stat-label">Total gastado</span>
            <span className="stat-value num">{fmtCompact(totalSpend)}</span>
          </div>
          <button className="toggle-chip" aria-pressed={onlyActive} onClick={() => setOnlyActive((v) => !v)}>
            <span className="toggle-track">
              <span className="toggle-knob" />
            </span>
            Solo con actividad
          </button>
        </div>
        <div className="chip-row">
          {PLATFORMS.map((p) => (
            <button key={p.key} className="chip plat" aria-pressed={!!platformsEnabled[p.key]} onClick={() => togglePlatform(p.key)}>
              <span className="dot" style={{ background: `var(${p.varName})` }} />
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="op-layout">
        <div className="card sidebar">
          <div className="eyebrow">Cuentas</div>
          <div className="client-list">
            <button className="client-row" aria-pressed={accountKey === "all"} onClick={() => setAccountKey("all")}>
              Todas las cuentas
            </button>
            {accounts.map((a) => (
              <button key={a.accountId} className="client-row" aria-pressed={accountKey === a.accountId} onClick={() => setAccountKey(a.accountId)}>
                {a.accountName}
              </button>
            ))}
            {accounts.length === 0 && (
              <div style={{ color: "var(--text-muted)", fontSize: 12.5, padding: "8px 10px" }}>Sin cuentas con actividad.</div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
        <div className="card">
          <h2>Campañas — {activeLabel}</h2>
          <div className="card-sub">
            {showCombined &&
              "Métricas comunes a las plataformas seleccionadas. Para cuota de subasta/calidad, alcance o video, elegí una sola plataforma a la vez."}
            {singlePlatform === "google" && "Métricas comunes + cuota de subasta y calidad, propias de Google Ads."}
            {singlePlatform === "meta" && "Métricas comunes + alcance y frecuencia, propias de campañas de alcance/awareness."}
            {singlePlatform === "tiktok" && "Métricas comunes + alcance, frecuencia y video — el formato nativo de la plataforma."}
          </div>
          <div className="table-scroll-x" style={{ marginTop: 14 }}>
            <table className="dense">
              <thead>
                <tr>
                  <th>Cuenta</th>
                  {showCombined && <th>Plataforma</th>}
                  <th>Campaña</th>
                  <th className="num">Presupuesto proyectado</th>
                  <th className="num">Real</th>
                  <th className="num">Presup. diario recom.</th>
                  <th className="num">Impr.</th>
                  <th className="num">Clicks</th>
                  <th className="num">CPM</th>
                  <th className="num">CTR</th>
                  <th className="num">CPL</th>
                  <th className="num">Conv.</th>
                  {singlePlatform === "google" && (
                    <>
                      <th className="num">Cuota impr.</th>
                      <th className="num">Nivel calidad</th>
                      <th className="num">Pérd. presup.</th>
                      <th className="num">Pérd. ranking</th>
                      <th className="num">Pos. abs.</th>
                      <th className="num">Pos. superior</th>
                      <th className="num">Punt. optim.</th>
                    </>
                  )}
                  {(singlePlatform === "meta" || singlePlatform === "tiktok") && (
                    <>
                      <th className="num">Alcance</th>
                      <th className="num">Frec.</th>
                    </>
                  )}
                  {singlePlatform === "tiktok" && (
                    <>
                      <th className="num">Tiempo prom.</th>
                      <th className="num">Likes</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {campaignsIncluded.length === 0 ? (
                  <tr>
                    <td
                      colSpan={11 + (showCombined ? 1 : extraColCount(singlePlatform!))}
                      style={{ color: "var(--text-muted)" }}
                    >
                      {allCampaigns.length === 0 ? "Sin campañas para mostrar." : "Sin campañas con los filtros elegidos."}
                    </td>
                  </tr>
                ) : (
                  campaignsIncluded.map((c) => {
                    const daily = dailyRecommended(c.budget, c.spend, today, daysInPeriod);
                    const platMeta = PLATFORMS.find((p) => p.key === c.platform);
                    return (
                    <tr key={c.platform + ":" + c.accountId + ":" + c.campaignId}>
                      <td>{c.accountName}</td>
                      {showCombined && (
                        <td>
                          <span className="plat-dot" style={{ background: `var(${platMeta?.varName})` }} />
                          {platMeta?.label ?? c.platform}
                        </td>
                      )}
                      <td>{c.campaignName}</td>
                      <td className="num">{fmtMoney(c.budget)}</td>
                      <td className="num">{fmtMoney(c.spend)}</td>
                      <td className="num" style={daily === undefined ? undefined : { color: daily < 0 ? "var(--delta-bad-text)" : "var(--delta-good-text)" }}>
                        {daily === undefined ? "—" : fmtDailySigned(daily)}
                      </td>
                      <td className="num">{fmtInt(c.impressions)}</td>
                      <td className="num">{fmtInt(c.clicks)}</td>
                      <td className="num">{fmtMoney(c.cpm)}</td>
                      <td className="num">{c.ctr.toFixed(1)}%</td>
                      <td className="num">{fmtMoney(c.cpl)}</td>
                      <td className="num">{fmtInt(c.conversions)}</td>
                      {singlePlatform === "google" && (
                        <>
                          <td className="num">{fmtPct(c.searchImpressionShare)}</td>
                          <td className="num">{fmtScore10(c.qualityScore)}</td>
                          <td className="num">{fmtPct(c.searchBudgetLostIS)}</td>
                          <td className="num">{fmtPct(c.searchRankLostIS)}</td>
                          <td className="num">{fmtPct(c.searchAbsoluteTopIS)}</td>
                          <td className="num">{fmtPct(c.searchTopIS)}</td>
                          <td className="num">{fmtPct(c.optimizationScore)}</td>
                        </>
                      )}
                      {(singlePlatform === "meta" || singlePlatform === "tiktok") && (
                        <>
                          <td className="num">{fmtInt(c.reach ?? 0)}</td>
                          <td className="num">{fmtFreq(c.frequency)}</td>
                        </>
                      )}
                      {singlePlatform === "tiktok" && (
                        <>
                          <td className="num">{fmtSeconds(c.avgVideoPlaySeconds)}</td>
                          <td className="num">{fmtInt(c.likes ?? 0)}</td>
                        </>
                      )}
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
        </div>
      </div>

      <footer className="foot">
        <span>Fuente de datos: {allMock ? "mock" : "Windsor.ai (en vivo)"}</span>
        <span>Perfil Medios — v1, arranca con Google Ads</span>
      </footer>
    </div>
  );
}
