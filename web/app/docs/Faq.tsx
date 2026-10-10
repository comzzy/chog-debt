"use client";
import { useState } from "react";
import { Reveal } from "../Shell";

export function Faq({ items }: { items: { q: string; a: string }[] }) {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <div className="faq">
      {items.map((it, i) => (
        <Reveal key={it.q} delay={Math.min(i, 6) * 40}>
          <div className={`faq-item ${open === i ? "open" : ""}`}>
            <button className="faq-q" aria-expanded={open === i} onClick={() => setOpen(open === i ? null : i)}>
              <span>{it.q}</span>
              <i aria-hidden="true">+</i>
            </button>
            <div className="faq-a">
              <p>{it.a}</p>
            </div>
          </div>
        </Reveal>
      ))}
    </div>
  );
}
