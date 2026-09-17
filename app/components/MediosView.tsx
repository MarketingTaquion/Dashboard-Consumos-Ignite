"use client";

import { useEffect, useState } from "react";
import type { CampaignsResponse, PlatformKey } from "@/lib/types";

const PLATFORMS: { key: PlatformKey; label: string; varName: string }[] = [
  { key: "google", label: "Google Ads", varName: "--plat-google" },
  { key: "meta", label: "Meta Ads", varName: "--plat-meta" },
  { key: "tiktok", label: "TikTok Ads", varName: "--plat-tiktok" },
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

export default function MediosView() {
  const [platform, setPlatform] = useState<PlatformKey>("google");
  const [data, setData] = useState<CampaignsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setData(null);
    fetch(`/api/campaigns?platform=${platform}&range=month`)
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then((body: CampaignsResponse) => setData(body))
      .catch((err) => setError(String(err?.message || err)));
  }, [platform]);

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

      <div className="chip-row" style={{ margin: "20px 0 16px" }}>
        {PLATFORMS.map((p) => (
          <button key={p.key} className="chip plat" aria-pressed={platform === p.key} onClick={() => setPlatform(p.key)}>
            <span className="dot" style={{ background: `var(${p.varName})` }} />
            {p.label}
          </button>
        ))}
      </div>

      <div className="card">
        <h2>Campañas — {activeLabel}</h2>
        <div className="card-sub">
          {platform === "google"
            ? "Métricas comunes + cuota de subasta y calidad, propias de Google Ads."
            : "Todavía sin conectar — se suma con el mismo mecanismo que Google Ads."}
        </div>
        <div className="table-scroll-x" style={{ marginTop: 14 }}>
          <table className="dense">
            <thead>
              <tr>
                <th>Cuenta</th>
                <th>Campaña</th>
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
              </tr>
            </thead>
            <tbody>
              {data.campaigns.length === 0 ? (
                <tr>
                  <td colSpan={platform === "google" ? 15 : 8} style={{ color: "var(--text-muted)" }}>
                    Sin campañas para mostrar.
                  </td>
                </tr>
              ) : (
                data.campaigns.map((c) => (
                  <tr key={c.accountId + ":" + c.campaignId}>
                    <td>{c.accountName}</td>
                    <td>{c.campaignName}</td>
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
