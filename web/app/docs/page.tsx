import { DOCS } from "@/lib/docs";
import { FlowerField, Reveal } from "../Shell";

export default function DocsHome() {
  return (
    <article className="doc">
      <header className="doc-head bg-lilac">
        <FlowerField />
        <div className="doc-kicker enter">Docs</div>
        <h1 className="enter d1">
          How ChogDebt works
          <span>Everything, in plain words.</span>
        </h1>
        <p className="enter d2">Write favours down as IOUs between Chogs, keep your word, and build a record that stays with the NFT. Start with why, or jump to any feature.</p>
        <a className="btn enter d3" href="/docs/getting-started">
          Get started
        </a>
      </header>
      <div className="hub">
        {DOCS.map((d, i) => (
          <Reveal key={d.slug} delay={(i % 3) * 70}>
            <a href={`/docs/${d.slug}`} className={`hub-tile bg-${d.color}`}>
              <small>{d.group}</small>
              <h3>{d.title}</h3>
              <p>{d.short}</p>
              <span className="arrow" aria-hidden="true">
                →
              </span>
            </a>
          </Reveal>
        ))}
        <Reveal delay={140}>
          <a href="/#app" className="hub-tile bg-lime">
            <small>Ready?</small>
            <h3>Open the app</h3>
            <p>Pick your Chog and write your first IOU.</p>
            <span className="arrow" aria-hidden="true">
              →
            </span>
          </a>
        </Reveal>
      </div>
    </article>
  );
}
