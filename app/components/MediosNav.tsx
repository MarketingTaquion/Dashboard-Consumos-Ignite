import type { PageKey, Session } from "@/lib/access";

const TABS: { key: PageKey; href: string; label: string }[] = [
  { key: "campanas", href: "/medios", label: "Campañas" },
  { key: "anuncios", href: "/medios/anuncios", label: "Anuncios" },
  { key: "comparacion", href: "/medios/comparacion", label: "Comparación de plataformas" },
  { key: "alertas", href: "/medios/alertas", label: "Alertas" },
];

/** Pestañas de Medios: solo las páginas que el usuario tiene habilitadas. */
export default function MediosNav({ session, current }: { session: Session; current: PageKey }) {
  return (
    <nav className="medios-subnav">
      {TABS.filter((t) => session.pages.includes(t.key)).map((t) => (
        <a key={t.key} href={t.href} aria-current={t.key === current ? "page" : undefined}>
          {t.label}
        </a>
      ))}
    </nav>
  );
}
