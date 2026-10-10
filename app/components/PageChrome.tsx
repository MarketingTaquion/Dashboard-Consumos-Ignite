"use client";

import type { ReactNode } from "react";
import NovedadesBell from "./NovedadesBell";

/**
 * Encabezado y sub-navegación comunes. Se dibujan SIEMPRE, también mientras la
 * pantalla carga o si falla: así la campanita y los enlaces nunca desaparecen.
 */

export function PageHeader({ title, sub, link, extra }: { title: string; sub: string; link: { href: string; label: string }; extra?: ReactNode }) {
  return (
    <header className="top">
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/taquion-isotipo.png" alt="Taquión" className="brand-mark" width={30} height={30} />
        <div>
          <h1>{title}</h1>
          <div className="sub">{sub}</div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <div style={{ textAlign: "right" }}>
          {extra}
          <a href={link.href} style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
            {link.label}
          </a>
        </div>
        <NovedadesBell />
      </div>
    </header>
  );
}

const MEDIOS_TABS = [
  { href: "/medios", label: "Campañas" },
  { href: "/medios/anuncios", label: "Anuncios" },
  { href: "/medios/comparacion", label: "Comparación de plataformas" },
  { href: "/medios/alertas", label: "Alertas" },
];

export function MediosSubnav({ current }: { current: string }) {
  return (
    <nav className="medios-subnav">
      {MEDIOS_TABS.map((t) => (
        <a key={t.href} href={t.href} aria-current={t.href === current ? "page" : undefined}>
          {t.label}
        </a>
      ))}
    </nav>
  );
}

export function MediosHeader({ sub }: { sub: string }) {
  return <PageHeader title="Pulso Ignite — Medios" sub={sub} link={{ href: "/", label: "Ver perfil Finanzas →" }} />;
}
