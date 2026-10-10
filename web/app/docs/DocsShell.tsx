"use client";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { DOCS } from "@/lib/docs";
import { Footer, Header } from "../Shell";

const GROUPS = ["Start here", "Features", "Reference"];

export function DocsShell({ children }: { children: ReactNode }) {
  const path = usePathname() ?? "/docs";
  const [open, setOpen] = useState(false);
  const current = DOCS.find((d) => path === `/docs/${d.slug}`);
  return (
    <>
      <Header />
      <div className="docs">
        <aside className={`docs-side ${open ? "open" : ""}`}>
          <button className="docs-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            <span>{current ? current.title : "Docs overview"}</span>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform .2s" }}>
              <path d="M3 6l5 5 5-5" fill="none" stroke="#111" strokeWidth="2.5" />
            </svg>
          </button>
          <nav className="docs-nav">
            <a href="/docs" className={path === "/docs" ? "here" : ""}>
              Overview
            </a>
            {GROUPS.map((g) => (
              <div key={g}>
                <div className="docs-group">{g}</div>
                {DOCS.filter((d) => d.group === g).map((d) => (
                  <a key={d.slug} href={`/docs/${d.slug}`} className={path === `/docs/${d.slug}` ? "here" : ""}>
                    {d.title}
                  </a>
                ))}
              </div>
            ))}
          </nav>
        </aside>
        <main className="docs-main">{children}</main>
      </div>
      <Footer />
    </>
  );
}
