"use client";

import { useEffect, useRef, useState } from "react";
import type { CampaignsResponse, PlatformKey } from "@/lib/types";

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

export default function MediosView() {
  const [platform, setPlatform] = useState<PlatformKey>("google");
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [data, setData] = useState<CampaignsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dateMenuRef = useRef<HTMLDivElement>(null);

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
    setData(null);
    // "custom" todavía no está conectado (ver nota en el menú de fecha) — se
    // sigue pidiendo "month" hasta que se implemente el rango personalizado.
    const range = datePreset === "custom" ? "month" : datePreset;
    fetch(`/api/campaigns?platform=${platform}&range=${range}`)
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then((body: CampaignsResponse) => setData(body))
      .catch((err) => setError(String(err?.message || err)));
  }, [platform, datePreset]);

  if (error) {
    return (
      <div className="wrap">
        <div className="loading-state">No se pudo cargar /api/campaigns: {error}</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="wrap">
        <div className="loading-state">Cargando campañas…</div>
      </div>
    );
  }

  const activeLabel = PLATFORMS.find((p) => p.key === platform)?.label ?? platform;
  const dateLabel = DATE_PRESETS.find((d) => d.key === datePreset)?.label ?? "Este mes";

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

      {data.warnings?.map((w, i) => (
        <div className="mock-note" key={i}>
          <span className="tq-arrow" style={{ color: "var(--status-warning)" }}>↘</span> <span>{w}</span>
        </div>
      ))}
      {data.source === "mock" && !data.warnings && (
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
        </div>
        <div className="chip-row">
          {PLATFORMS.map((p) => (
            <button key={p.key} className="chip plat" aria-pressed={platform === p.key} onClick={() => setPlatform(p.key)}>
              <span className="dot" style={{ background: `var(${p.varName})` }} />
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Campañas — {activeLabel}</h2>
        <div className="card-sub">
          {platform === "google" && "Métricas comunes + cuota de subasta y calidad, propias de Google Ads."}
          {platform === "meta" && "Métricas comunes + alcance y frecuencia, propias de campañas de alcance/awareness."}
          {platform === "tiktok" && "Métricas comunes + alcance, frecuencia y video — el formato nativo de la plataforma."}
        </div>
        <div className="table-scroll-x" style={{ marginTop: 14 }}>
          <table className="dense">
            <thead>
              <tr>
                <th>Cuenta</th>
                <th>Campaña</th>
                <th className="num">Presupuesto proyectado</th>
                <th className="num">Real</th>
                <th className="num">Impr.</th>
                <th className="num">Clicks</th>
                <th className="num">CPM</th>
                <th className="num">CTR</th>
                <th className="num">CPL</th>
                <th className="num">Conv.</th>
                {platform === "google" && (
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
                {(platform === "meta" || platform === "tiktok") && (
                  <>
                    <th className="num">Alcance</th>
                    <th className="num">Frec.</th>
                  </>
                )}
                {platform === "tiktok" && (
                  <>
                    <th className="num">Tiempo prom.</th>
                    <th className="num">Likes</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {data.campaigns.length === 0 ? (
                <tr>
                  <td colSpan={10 + extraColCount(platform)} style={{ color: "var(--text-muted)" }}>
                    Sin campañas para mostrar.
                  </td>
                </tr>
              ) : (
                data.campaigns.map((c) => (
                  <tr key={c.accountId + ":" + c.campaignId}>
                    <td>{c.accountName}</td>
                    <td>{c.campaignName}</td>
                    <td className="num">{fmtMoney(c.budget)}</td>
                    <td className="num">{fmtMoney(c.spend)}</td>
                    <td className="num">{fmtInt(c.impressions)}</td>
                    <td className="num">{fmtInt(c.clicks)}</td>
                    <td className="num">{fmtMoney(c.cpm)}</td>
                    <td className="num">{c.ctr.toFixed(1)}%</td>
                    <td className="num">{fmtMoney(c.cpl)}</td>
                    <td className="num">{fmtInt(c.conversions)}</td>
                    {platform === "google" && (
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
                    {(platform === "meta" || platform === "tiktok") && (
                      <>
                        <td className="num">{fmtInt(c.reach ?? 0)}</td>
                        <td className="num">{fmtFreq(c.frequency)}</td>
                      </>
                    )}
                    {platform === "tiktok" && (
                      <>
                        <td className="num">{fmtSeconds(c.avgVideoPlaySeconds)}</td>
                        <td className="num">{fmtInt(c.likes ?? 0)}</td>
                      </>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <footer className="foot">
        <span>Fuente de datos: {data.source === "windsor" ? "Windsor.ai (en vivo)" : "mock"}</span>
        <span>Perfil Medios — v1, arranca con Google Ads</span>
      </footer>
    </div>
  );
}
