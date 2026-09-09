import type { ClientData } from "./types";

// Mismo dataset de ejemplo que la V1 (Artifact "Pulso Ignite"), portado 1:1
// para que el salto de versión no cambie los números que el equipo ya vio.
// Ver: SDD-TAQUION/specs/003-dashboard-consumos.md y
// SDD-TAQUION/mockups/dashboard-consumos.html (V1).
//
// prevPeriodDeltaPct: valores ilustrativos para el toggle "Comparar vs.
// período anterior" — todavía no hay histórico real (ver docs/contexto-madre.md
// y specs/003), se muestran a modo de ejemplo hasta tener datos reales.

export const MOCK_TODAY = 8;
export const MOCK_DAYS_IN_MONTH = 30;

export const MOCK_CLIENTS: ClientData[] = [
  {
    key: "norte",
    name: "Norte Fintech",
    vertical: "Banca & Fintech",
    budget: 18_000_000,
    spend8: 6_100_000,
    mix: { meta: 45, google: 40, linkedin: 15 },
    cpl: {
      meta: { target: 850, real: 910, prevPeriodDeltaPct: 18 },
      google: { target: 1200, real: 1340, prevPeriodDeltaPct: 15 },
      linkedin: { target: 2600, real: 2450, prevPeriodDeltaPct: -6 },
    },
    health: [
      { platform: "linkedin", text: "Insight Tag sin eventos hace 4 días", sev: "serious" },
    ],
  },
  {
    key: "andes",
    name: "Andes Turismo",
    vertical: "Turismo",
    budget: 9_500_000,
    spend8: 1_700_000,
    mix: { meta: 70, google: 20, linkedin: 10 },
    cpl: {
      meta: { target: 450, real: 610, prevPeriodDeltaPct: -22 },
      google: { target: 700, real: 680, prevPeriodDeltaPct: -10 },
      linkedin: { target: 3000, real: 3100, prevPeriodDeltaPct: -8 },
    },
    health: [
      { platform: "meta", text: "Deduplicación de eventos con 18% de discrepancia vs. Ads Manager", sev: "warning" },
    ],
  },
  {
    key: "terra",
    name: "Terra Realty",
    vertical: "Real Estate",
    budget: 14_200_000,
    spend8: 3_900_000,
    mix: { google: 55, meta: 30, linkedin: 15 },
    cpl: {
      google: { target: 1800, real: 1750, prevPeriodDeltaPct: 5 },
      meta: { target: 1100, real: 1050, prevPeriodDeltaPct: 0 },
      linkedin: { target: 2400, real: 2200, prevPeriodDeltaPct: 3 },
    },
    health: [],
  },
  {
    key: "metrovoz",
    name: "MetroVoz",
    vertical: "Gobierno · Comunidad",
    budget: 10_000_000,
    spend8: 2_650_000,
    mix: { meta: 100 },
    cpl: {
      meta: { target: 2200, real: 2380, label: "CPME", prevPeriodDeltaPct: 9 },
    },
    health: [
      { platform: "meta", text: "Última sincronización hace 26 h (esperado cada 6 h)", sev: "warning" },
    ],
  },
];
