"use client";

import { useEffect, useRef, useState } from "react";
import type { AdsResponse, PlatformKey } from "@/lib/types";

const PLATFORMS: { key: PlatformKey; label: string; varName: string }[] = [
  { key: "google", label: "Google Ads", varName: "--plat-google" },
  { key: "meta", label: "Meta Ads", varName: "--plat-meta" },
  { key: "tiktok", label: "TikTok Ads", varName: "--plat-tiktok" },
];

// Mismo set de presets que Dashboard.tsx / MediosView.tsx — duplicado a
// propósito, ver la nota en MediosView.tsx.
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

export default function AnunciosView() {
  const [platform, setPlatform] = useState<PlatformKey>("google");
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [data, setData] = useState<AdsResponse | null>(null);
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
    setError(null);
    const range = datePreset === "custom" ? "month" : datePreset;
    // Timeout del lado del cliente — verificado en vivo 2026-09-21: la
    // consulta de anuncios de Meta se quedó colgada en "Cargando
    // anuncios…" indefinidamente. El fetch server-side ya tiene su propio
    // timeout (ver lib/windsorAdsMeta.ts), pero esto asegura que la UI
    // nunca se quede esperando para siempre pase lo que pase del otro lado.
    const controller = new AbortController();
    // Distingue el abort del timeout del abort por cleanup (cambio de
    // plataforma/fecha antes de que responda la anterior) — solo el primero
    // es un error real que vale la pena mostrarle al usuario.
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, 20000);
    fetch(`/api/ads?platform=${platform}&range=${range}`, { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then((body: AdsResponse) => setData(body))
      .catch((err) => {
        if (err?.name === "AbortError") {
          if (timedOut) setError("La consulta tardó demasiado (más de 20s) y se canceló. Probá de nuevo.");
        } else {
          setError(String(err?.message || err));
        }
      })
      .finally(() => clearTimeout(timeout));
    return () => controller.abort();
  }, [platform, datePreset]);

  if (error) {
    return (
      <div className="wrap">
        <div className="loading-state">No se pudo cargar /api/ads: {error}</div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="wrap">
        <div className="loading-state">Cargando anuncios…</div>
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
        <a href="/medios">Campañas</a>
        <a href="/medios/anuncios" aria-current="page">Anuncios</a>
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
            <b>Datos de ejemplo.</b> En cuanto haya anuncios reales de {activeLabel} en Windsor.ai, se muestran acá.
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
        <h2>Anuncios — {activeLabel}</h2>
        <div className="card-sub">Un nivel más de detalle que la tabla de campañas — mismas métricas, ahora por pieza individual.</div>

        {data.ads.length === 0 ? (
          <div style={{ color: "var(--text-muted)", marginTop: 14 }}>Sin anuncios para mostrar.</div>
        ) : (
          <div className="ad-grid">
            {data.ads.map((ad) => (
              <div className="ad-card" key={ad.accountId + ":" + ad.campaignId + ":" + ad.adId}>
                <div
                  className="ad-thumb"
                  style={
                    platform !== "google"
                      ? { background: `linear-gradient(135deg, var(--plat-${platform}), color-mix(in srgb, var(--plat-${platform}) 55%, #000))` }
                      : undefined
                  }
                >
                  {activeLabel}
                </div>
                <div className="ad-body">
                  <div className="ad-name">{ad.adName}</div>
                  <div className="ad-meta">{ad.accountName} · {ad.campaignName}</div>
                  <div className="ad-metric-row"><span>Impresiones</span><span className="num">{fmtInt(ad.impressions)}</span></div>
                  <div className="ad-metric-row"><span>CTR</span><span className="num">{ad.ctr.toFixed(1)}%</span></div>
                  <div className="ad-metric-row"><span>CPL</span><span className="num">{fmtMoney(ad.cpl)}</span></div>
                  <div className="ad-metric-row"><span>Conversiones</span><span className="num">{fmtInt(ad.conversions)}</span></div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <footer className="foot">
        <span>Fuente de datos: {data.source === "windsor" ? "Windsor.ai (en vivo)" : "mock"}</span>
        <span>Perfil Medios — v1, arranca con Google Ads</span>
      </footer>
    </div>
  );
}
