"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ClientData, PlatformKey, SpendResponse } from "@/lib/types";

const PLATFORMS: { key: PlatformKey; label: string; varName: string }[] = [
  { key: "meta", label: "Meta Ads", varName: "--plat-meta" },
  { key: "google", label: "Google Ads", varName: "--plat-google" },
  { key: "linkedin", label: "LinkedIn Ads", varName: "--plat-linkedin" },
];

// Patrón semanal (lun..dom aproximado) que se repite cada 7 días para dar
// forma no-lineal a la curva de "acumulado" antes de hoy. No afecta el total
// acumulado a la fecha (ese viene siempre del dato real/mock), solo la forma.
const WEEK_PATTERN = [1.15, 1.05, 0.95, 1.1, 1.2, 0.55, 0.45];

function fmtCompact(n: number): string {
  const sign = n < 0 ? "-" : "";
  n = Math.abs(n);
  if (n >= 1e6) return sign + "$" + (n / 1e6).toFixed(1).replace(".", ",") + "M";
  if (n >= 1e3) return sign + "$" + (n / 1e3).toFixed(0) + "k";
  return sign + "$" + n.toFixed(0);
}
function fmtFull(n: number): string {
  return "$" + Math.round(n).toLocaleString("es-AR");
}

type Status = { key: "good" | "warning" | "critical"; label: string; ratio: number };

function statusFor(c: ClientData, today: number, daysInMonth: number): Status {
  const flat = c.spend8 / today;
  const projected = c.spend8 + flat * (daysInMonth - today);
  const ratio = projected / c.budget;
  if (ratio > 1.1) return { key: "warning", label: "Sobre-ritmo", ratio };
  if (ratio < 0.85) return { key: "critical", label: "Bajo-ritmo", ratio };
  return { key: "good", label: "En ritmo", ratio };
}

function enabledMixFrac(c: ClientData, enabled: Record<PlatformKey, boolean>): number {
  let f = 0;
  PLATFORMS.forEach((p) => {
    if (enabled[p.key]) f += (c.mix[p.key] || 0) / 100;
  });
  return f;
}

interface Series {
  cumulative: number[];
  ideal: number[];
  budget: number;
}

function computeSeries(
  clients: ClientData[],
  today: number,
  daysInMonth: number,
  enabled: Record<PlatformKey, boolean>
): Series {
  const daily = new Array(daysInMonth).fill(0);
  let budgetEnabled = 0;
  const weights: number[] = [];
  for (let i = 0; i < today; i++) weights.push(WEEK_PATTERN[i % 7]);
  const wsum = weights.reduce((a, b) => a + b, 0);

  clients.forEach((c) => {
    const frac = enabledMixFrac(c, enabled);
    budgetEnabled += c.budget * frac;
    for (let i = 0; i < today; i++) {
      daily[i] += c.spend8 * (weights[i] / wsum) * frac;
    }
  });

  const cumulative = new Array(daysInMonth).fill(0);
  let run = 0;
  for (let i = 0; i < today; i++) {
    run += daily[i];
    cumulative[i] = run;
  }
  const flat = cumulative[today - 1] / today;
  for (let i = today; i < daysInMonth; i++) {
    cumulative[i] = cumulative[today - 1] + flat * (i - (today - 1));
  }
  const ideal = new Array(daysInMonth).fill(0);
  for (let i = 0; i < daysInMonth; i++) ideal[i] = (budgetEnabled / daysInMonth) * (i + 1);

  return { cumulative, ideal, budget: budgetEnabled };
}

const M = { l: 48, r: 14, t: 14, b: 26 };
const W = 700;
const H = 230;
const plotW = W - M.l - M.r;
const plotH = H - M.t - M.b;

type SortKey = "pacing" | "objetivo" | "real" | "delta";
interface SortState {
  key: SortKey;
  dir: "asc" | "desc";
}

interface Row {
  clientKey: string;
  clientName: string;
  platKey: PlatformKey;
  platLabel: string;
  platVar: string;
  pacingPct: number;
  target: number;
  real: number;
  deltaPct: number;
  label: string;
  prevPct?: number;
  statusKey: Status["key"];
  statusLabel: string;
}

export default function Dashboard() {
  const [data, setData] = useState<SpendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clientKey, setClientKey] = useState<string>("all");
  const [enabled, setEnabled] = useState<Record<PlatformKey, boolean>>({
    meta: true,
    google: true,
    linkedin: true,
  });
  const [view, setView] = useState<"chart" | "table">("chart");
  const [chartOpen, setChartOpen] = useState(false);
  const [compareOn, setCompareOn] = useState(false);
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [bannerOpen, setBannerOpen] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: "delta", dir: "desc" });
  const [tooltip, setTooltip] = useState<{ x: number; y: number; day: number } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    fetch("/api/spend")
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then((body: SpendResponse) => setData(body))
      .catch((err) => setError(String(err?.message || err)));
  }, []);

  const clientsIncluded = useMemo(() => {
    if (!data) return [];
    return clientKey === "all" ? data.clients : data.clients.filter((c) => c.key === clientKey);
  }, [data, clientKey]);

  const series = useMemo(() => {
    if (!data) return null;
    return computeSeries(clientsIncluded, data.today, data.daysInMonth, enabled);
  }, [data, clientsIncluded, enabled]);

  if (error) {
    return (
      <div className="wrap">
        <div className="loading-state">No se pudo cargar /api/spend: {error}</div>
      </div>
    );
  }
  if (!data || !series) {
    return (
      <div className="wrap">
        <div className="loading-state">Cargando Pulso Ignite…</div>
      </div>
    );
  }

  const { today, daysInMonth } = data;
  const idealPct = today / daysInMonth;

  const maxV = Math.max(series.budget, series.cumulative[daysInMonth - 1]) * 1.12 || 1;
  const xFor = (day: number) => M.l + ((day - 1) / (daysInMonth - 1)) * plotW;
  const yFor = (v: number) => M.t + plotH - (v / maxV) * plotH;
  const baseY = M.t + plotH;

  const actualPts: [number, number][] = [];
  for (let i = 0; i < today; i++) actualPts.push([xFor(i + 1), yFor(series.cumulative[i])]);
  const projPts: [number, number][] = [];
  for (let i = today - 1; i < daysInMonth; i++) projPts.push([xFor(i + 1), yFor(series.cumulative[i])]);
  const idealPts: [number, number][] = [];
  for (let i = 0; i < daysInMonth; i++) idealPts.push([xFor(i + 1), yFor(series.ideal[i])]);

  function pathOf(pts: [number, number][]) {
    return pts.map((p, i) => (i === 0 ? "M" : "L") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  }
  const areaPath =
    pathOf(actualPts) + ` L ${xFor(today).toFixed(1)} ${baseY} L ${xFor(1).toFixed(1)} ${baseY} Z`;

  const yTicks = [0, maxV / 2, maxV];
  const xTicks = [1, Math.round(daysInMonth * 0.27), Math.round(daysInMonth * 0.5), Math.round(daysInMonth * 0.73), daysInMonth].filter(
    (v, i, arr) => arr.indexOf(v) === i
  );

  const ratioForInsight = series.cumulative[daysInMonth - 1] / (series.budget || 1);
  const insightWord = ratioForInsight > 1.1 ? "por encima" : ratioForInsight < 0.85 ? "por debajo" : "alineado con";

  function togglePlatform(key: PlatformKey) {
    const enabledCount = PLATFORMS.filter((p) => enabled[p.key]).length;
    if (enabled[key] && enabledCount === 1) return;
    setEnabled((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  function onSvgMouseMove(evt: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const scaleX = W / rect.width;
    const xUser = (evt.clientX - rect.left) * scaleX;
    let day = Math.round(((xUser - M.l) / plotW) * (daysInMonth - 1)) + 1;
    day = Math.max(1, Math.min(daysInMonth, day));
    setTooltip({ x: evt.clientX - rect.left + 14, y: evt.clientY - rect.top - 48, day });
  }

  // ---- filas de la tabla densa (cliente × plataforma) ----
  const rows: Row[] = [];
  clientsIncluded.forEach((c) => {
    const st = statusFor(c, today, daysInMonth);
    const pacingPct = c.budget === 0 ? 0 : (c.spend8 / c.budget) * 100;
    PLATFORMS.forEach((p) => {
      if (!enabled[p.key]) return;
      const e = c.cpl[p.key];
      if (!e) return;
      const deltaPct = Math.round(((e.real - e.target) / e.target) * 1000) / 10;
      rows.push({
        clientKey: c.key,
        clientName: c.name,
        platKey: p.key,
        platLabel: p.label,
        platVar: p.varName,
        pacingPct,
        target: e.target,
        real: e.real,
        deltaPct,
        label: e.label || "CPL",
        prevPct: e.prevPeriodDeltaPct,
        statusKey: st.key,
        statusLabel: st.label,
      });
    });
  });

  function sortVal(r: Row): number {
    switch (sort.key) {
      case "pacing":
        return r.pacingPct;
      case "objetivo":
        return r.target;
      case "real":
        return r.real;
      case "delta":
        return r.deltaPct;
    }
  }
  const sortedRows = [...rows].sort((a, b) => (sortVal(a) - sortVal(b)) * (sort.dir === "desc" ? -1 : 1));

  function onSort(key: SortKey) {
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "desc" ? "asc" : "desc" } : { key, dir: "desc" }));
  }
  function sortIcon(key: SortKey) {
    if (sort.key !== key) return <span className="sort-ico">⇅</span>;
    return <span className="sort-ico active">{sort.dir === "desc" ? "▼" : "▲"}</span>;
  }
  function prevLabel(p?: number): string {
    if (p === undefined) return "—";
    if (p > 0) return `▲ +${p}%`;
    if (p < 0) return `▼ ${p}%`;
    return "● 0%";
  }

  const healthItems: { client: string; platform: string; text: string; sev: string }[] = [];
  clientsIncluded.forEach((c) => c.health.forEach((h) => healthItems.push({ client: c.name, ...h })));

  const colCount = 7 + (compareOn ? 1 : 0);

  return (
    <div className="wrap">
      <div className={"mock-note" + (data.source === "google-ads" ? " real" : "")}>
        {data.source === "mock" ? (
          <>
            🔥{" "}
            <span>
              <b>Datos de ejemplo.</b> Google Ads todavía no está conectado con credenciales completas (falta
              developer token / OAuth / refresh token válidos) — ver <code>.env.example</code>. Meta Ads y LinkedIn
              Ads siguen siendo mock hasta conectar Windsor.ai u otra vía.
            </span>
          </>
        ) : (
          <>
            ✅{" "}
            <span>
              <b>Google Ads conectado.</b> El resto de las plataformas (Meta, LinkedIn) sigue en mock hasta que se
              integren.
            </span>
          </>
        )}
      </div>
      {data.warnings?.map((w, i) => (
        <div className="mock-note" key={i}>
          ⚠️ <span>{w}</span>
        </div>
      ))}

      <header className="top">
        <div>
          <h1>Pulso Ignite</h1>
          <div className="sub">Consumo de pauta multi-cliente — equipo Ignite, Taquión</div>
        </div>
        <div className="num" style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
          Día <b style={{ color: "var(--text-primary)" }}>{today}</b> de {daysInMonth} · ritmo ideal{" "}
          <b style={{ color: "var(--text-primary)" }}>{Math.round(idealPct * 1000) / 10}%</b>
        </div>
      </header>

      <div className="controls-row">
        <div className="controls-left">
          <div className="dropdown-wrap">
            <button className="chip" aria-expanded={dateMenuOpen} onClick={() => setDateMenuOpen((v) => !v)}>
              📅 Mes en curso <span style={{ fontSize: 10 }}>▾</span>
            </button>
            {dateMenuOpen && (
              <div className="date-menu" role="menu">
                <button role="menuitem" aria-current="true" onClick={() => setDateMenuOpen(false)}>
                  Mes en curso
                </button>
                <button role="menuitem" disabled title="Todavía no disponible">
                  Últimos 7 días <span className="soon">pronto</span>
                </button>
                <button role="menuitem" disabled title="Todavía no disponible">
                  Mes anterior <span className="soon">pronto</span>
                </button>
              </div>
            )}
          </div>
          <button className="toggle-chip" aria-pressed={compareOn} onClick={() => setCompareOn((v) => !v)}>
            <span className="toggle-track">
              <span className="toggle-knob" />
            </span>
            Comparar vs. período anterior
          </button>
        </div>
        <div className="controls-right chip-row" role="group" aria-label="Mostrar/ocultar plataforma">
          {PLATFORMS.map((p) => (
            <button key={p.key} className="chip plat" aria-pressed={enabled[p.key]} onClick={() => togglePlatform(p.key)}>
              <span className="dot" style={{ background: `var(${p.varName})` }} />
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="op-layout">
        <div className="card sidebar">
          <div className="eyebrow">Clientes</div>
          <div className="client-list">
            <button className="client-row" aria-pressed={clientKey === "all"} onClick={() => setClientKey("all")}>
              Todos los clientes
            </button>
            {data.clients.map((c) => {
              const st = statusFor(c, today, daysInMonth);
              return (
                <button key={c.key} className="client-row" aria-pressed={clientKey === c.key} onClick={() => setClientKey(c.key)}>
                  <span className={"status-dot " + st.key} />
                  {c.name}
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="card banner">
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className={"pill " + (healthItems.length ? "warning" : "good")}>
                <span className="dot" />
              </span>
              <span>
                {healthItems.length > 0 ? (
                  <>
                    <b>
                      {healthItems.length} alerta{healthItems.length === 1 ? "" : "s"} técnica
                      {healthItems.length === 1 ? "" : "s"}
                    </b>{" "}
                    activa{healthItems.length === 1 ? "" : "s"} — tracking y sincronización
                  </>
                ) : (
                  "Sin alertas técnicas para esta selección"
                )}
              </span>
            </div>
            {healthItems.length > 0 && (
              <button className="link-btn" onClick={() => setBannerOpen((v) => !v)}>
                {bannerOpen ? "Ocultar ↑" : "Ver detalle →"}
              </button>
            )}
            {bannerOpen && healthItems.length > 0 && (
              <div className="banner-detail">
                {healthItems.map((it, i) => (
                  <div className="health-item" key={i}>
                    <div className={"stripe " + it.sev} />
                    <div>
                      <div className="h-title">
                        {it.client} · {it.platform}
                      </div>
                      <div className="h-sub">{it.text}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            className="card chart-toggle-row"
            role="button"
            tabIndex={0}
            onClick={() => setChartOpen((v) => !v)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") setChartOpen((v) => !v);
            }}
          >
            <span>Ritmo de consumo</span>
            <span style={{ fontWeight: 600, color: "var(--accent)" }}>{chartOpen ? "Contraer ▲" : "Expandir gráfico ▾"}</span>
          </div>

          {chartOpen && (
            <div className="card">
              <div className="card-head">
                <div>
                  <div className="card-sub">
                    {clientKey === "all" ? "Todos los clientes" : clientsIncluded[0].name} · plataformas:{" "}
                    {PLATFORMS.filter((p) => enabled[p.key]).map((p) => p.label).join(", ")}
                  </div>
                </div>
                <div className="chart-toolbar">
                  <button className="toolbar-btn" aria-pressed={view === "chart"} onClick={() => setView("chart")}>
                    Gráfico
                  </button>
                  <button className="toolbar-btn" aria-pressed={view === "table"} onClick={() => setView("table")}>
                    Tabla
                  </button>
                </div>
              </div>

              {view === "chart" ? (
                <div className="chart-wrap">
                  <svg
                    ref={svgRef}
                    className="chart-svg"
                    viewBox={`0 0 ${W} ${H}`}
                    role="img"
                    aria-label="Consumo acumulado de pauta por día"
                    onMouseMove={onSvgMouseMove}
                    onMouseLeave={() => setTooltip(null)}
                  >
                    {yTicks.map((v, i) => (
                      <g key={i}>
                        <line x1={M.l} y1={yFor(v)} x2={M.l + plotW} y2={yFor(v)} stroke="var(--grid)" strokeWidth={1} />
                        <text className="tick-label" x={M.l - 8} y={yFor(v) + 3} textAnchor="end">
                          {fmtCompact(v)}
                        </text>
                      </g>
                    ))}
                    {xTicks.map((d) => (
                      <text key={d} className="tick-label" x={xFor(d)} y={H - 6} textAnchor="middle">
                        {d}
                        {d === today ? " (hoy)" : ""}
                      </text>
                    ))}
                    <line
                      x1={xFor(today)}
                      y1={M.t}
                      x2={xFor(today)}
                      y2={baseY}
                      stroke="var(--axis)"
                      strokeWidth={1}
                      strokeDasharray="2 3"
                    />
                    <path d={pathOf(idealPts)} fill="none" stroke="var(--text-muted)" strokeWidth={1.5} strokeDasharray="1 4" strokeLinecap="round" />
                    <path d={areaPath} fill="var(--accent-fill)" />
                    <path d={pathOf(actualPts)} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                    <path d={pathOf(projPts)} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeDasharray="5 4" opacity={0.65} />
                    <circle cx={actualPts[actualPts.length - 1][0]} cy={actualPts[actualPts.length - 1][1]} r={3.5} fill="var(--accent)" />
                  </svg>
                  <div className="tooltip" style={{ opacity: tooltip ? 1 : 0, left: tooltip?.x, top: tooltip?.y }}>
                    {tooltip && (
                      <>
                        <div className="t-day">
                          Día {tooltip.day}
                          {tooltip.day > today ? " (proyectado)" : ""}
                        </div>
                        <div className="t-row num">
                          <span>Acumulado</span>
                          <span>{fmtFull(series.cumulative[tooltip.day - 1])}</span>
                        </div>
                        <div className="t-row num">
                          <span>Ritmo ideal</span>
                          <span>{fmtFull(series.ideal[tooltip.day - 1])}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ) : (
                <div className="scroll-table">
                  <table className="datatable">
                    <thead>
                      <tr>
                        <th>Día</th>
                        <th className="num">Acumulado</th>
                        <th className="num">Ritmo ideal</th>
                        <th className="num">Δ vs. ideal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {series.cumulative.map((v, d) => {
                        const iv = series.ideal[d];
                        const delta = iv === 0 ? 0 : Math.round(((v - iv) / iv) * 1000) / 10;
                        return (
                          <tr key={d}>
                            <td>
                              Día {d + 1}
                              {d + 1 === today ? " · hoy" : d + 1 > today ? " · proy." : ""}
                            </td>
                            <td className="num">{fmtFull(v)}</td>
                            <td className="num">{fmtFull(iv)}</td>
                            <td className="num" style={{ color: delta >= 0 ? "var(--delta-good-text)" : "var(--delta-bad-text)" }}>
                              {delta >= 0 ? "+" : ""}
                              {delta}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="chart-insight">
                <b>{Math.round(ratioForInsight * 100)}%</b> del presupuesto habilitado proyectado a fin de mes — {insightWord}{" "}
                del ritmo ideal (100%). Línea sólida = real a la fecha, punteada corta = proyección, punteada fina = ritmo
                ideal.
              </div>
            </div>
          )}

          <div className="card" style={{ padding: "6px 8px" }}>
            <table className="datatable dense">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Plataforma</th>
                  <th className="sortable" onClick={() => onSort("pacing")}>
                    Pacing{sortIcon("pacing")}
                  </th>
                  <th className="num sortable" onClick={() => onSort("objetivo")}>
                    Objetivo{sortIcon("objetivo")}
                  </th>
                  <th className="num sortable" onClick={() => onSort("real")}>
                    Real{sortIcon("real")}
                  </th>
                  <th className="num sortable" onClick={() => onSort("delta")}>
                    Δ{sortIcon("delta")}
                  </th>
                  {compareOn && <th className="num">Vs. per. ant.</th>}
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {sortedRows.length === 0 ? (
                  <tr>
                    <td colSpan={colCount} style={{ color: "var(--text-muted)" }}>
                      Sin datos para esta combinación de filtros.
                    </td>
                  </tr>
                ) : (
                  sortedRows.map((r, i) => (
                    <tr key={i}>
                      <td>{r.clientName}</td>
                      <td>
                        <span className="plat-dot" style={{ background: `var(${r.platVar})` }} />
                        {r.platLabel}
                        {r.label !== "CPL" && <span style={{ color: "var(--text-muted)", fontSize: 11 }}> ({r.label})</span>}
                      </td>
                      <td>
                        <span className="mini-track">
                          <span className={"mini-fill " + r.statusKey} style={{ width: Math.min(100, r.pacingPct) + "%" }} />
                        </span>
                        <span className="num" style={{ fontSize: 12, color: "var(--text-muted)" }}>
                          {Math.round(r.pacingPct)}%
                        </span>
                      </td>
                      <td className="num">{fmtFull(r.target)}</td>
                      <td className="num">{fmtFull(r.real)}</td>
                      <td className="num" style={{ color: r.deltaPct <= 0 ? "var(--delta-good-text)" : "var(--delta-bad-text)" }}>
                        {r.deltaPct > 0 ? "+" : ""}
                        {r.deltaPct}%
                      </td>
                      {compareOn && (
                        <td className="num" style={{ color: "var(--text-secondary)", fontSize: 12 }}>
                          {prevLabel(r.prevPct)}
                        </td>
                      )}
                      <td>
                        <span className={"pill " + r.statusKey}>
                          <span className="dot" />
                          {r.statusLabel}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <footer className="foot">
        <span>Fuente de datos: {data.source === "google-ads" ? "Google Ads API (en vivo)" : "mock"} · Meta Ads y LinkedIn Ads: mock hasta conectar Windsor.ai</span>
        <span>V2 — sucesor de SDD-TAQUION/mockups/dashboard-consumos.html (V1)</span>
      </footer>
    </div>
  );
}
