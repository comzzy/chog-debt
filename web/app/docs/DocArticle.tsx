import { ADDR, DOCS, FAQ, type Block, type Doc } from "@/lib/docs";
import { FlowerField, Reveal } from "../Shell";
import { Faq } from "./Faq";

function render(b: Block, i: number) {
  switch (b.t) {
    case "p":
      return <p key={i}>{b.v}</p>;
    case "h":
      return <h2 key={i}>{b.v}</h2>;
    case "note":
      return (
        <div key={i} className="doc-note">
          {b.v}
        </div>
      );
    case "steps":
      return (
        <ol key={i} className="doc-steps">
          {b.v.map((s, j) => (
            <li key={j}>{s}</li>
          ))}
        </ol>
      );
    case "list":
      return (
        <ul key={i} className="doc-list">
          {b.v.map((s, j) => (
            <li key={j}>{s}</li>
          ))}
        </ul>
      );
    case "table":
      return (
        <div key={i} className="doc-table-wrap">
          <table className="doc-table">
            <thead>
              <tr>
                {b.head.map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, j) => (
                <tr key={j}>
                  {r.map((c, k) => (
                    <td key={k}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    default:
      return null;
  }
}

/** Splits a page into chunks at each heading so every section can scroll-reveal on its own. */
function sections(body: Block[]) {
  const out: Block[][] = [];
  for (const b of body) {
    if (b.t === "h" || out.length === 0) out.push([]);
    out[out.length - 1].push(b);
  }
  return out;
}

const explorer = (a: string) => `https://monadvision.com/address/${a}`;

function Contracts() {
  const rows = [
    ["ChogDebt (v2)", ADDR.DEBT, "The IOU contract. Source verified on MonadVision."],
    ["Chog Genesis", ADDR.NFT, "The ERC-721 collection. 1,969 Chogs."],
    ["$CHOG", ADDR.TOKEN, "ERC-20, 18 decimals. Used for collateral, stakes and debt sales."],
  ];
  return (
    <>
      <Reveal>
        <div className="addr-grid">
          {rows.map(([n, a, d], i) => (
            <div key={a} className={`addr bg-${["lime", "yellow", "pink2"][i]}`}>
              <h3>{n}</h3>
              <code>{a}</code>
              <p>{d}</p>
              <a className="btn" href={explorer(a)} target="_blank" rel="noreferrer">
                View on MonadVision
              </a>
            </div>
          ))}
        </div>
      </Reveal>
      <Reveal>
        <h2>Network</h2>
        <div className="doc-table-wrap">
          <table className="doc-table">
            <tbody>
              <tr><td>Network</td><td>Monad mainnet</td></tr>
              <tr><td>Chain ID</td><td>143</td></tr>
              <tr><td>RPC</td><td>https://rpc.monad.xyz</td></tr>
              <tr><td>Explorer</td><td>https://monadvision.com</td></tr>
              <tr><td>ChogDebt deploy block</td><td>112186774</td></tr>
            </tbody>
          </table>
        </div>
        <p>
          Deploy transaction:{" "}
          <a href="https://monadvision.com/tx/0x471e49d24ff4435da91b85f2efe33872fcb404eaac1895219c8781ef06c93e5d" target="_blank" rel="noreferrer">
            0x471e…3e5d
          </a>
        </p>
      </Reveal>
      <Reveal>
        <h2>Ownership</h2>
        <p>
          ChogDebt is owned by <code>0x6c245eAF8F11b05d4220A44CB3F3E8490e5b2Ec1</code>. The owner can pause and unpause, and hand ownership to a new address, which has to accept it. That's all the owner can do.
        </p>
        <p>
          While paused, nobody can create or accept IOUs, call debts in, list or buy debts, or vouch. Repaying, marking defaults, cancelling waiting IOUs, unlisting and withdrawing a vouch keep working, so nobody gets stuck. The owner can't move anyone's $CHOG, change a debt or touch a score, and the contract isn't upgradeable.
        </p>
      </Reveal>
      <Reveal>
        <h2>Source</h2>
        <p>
          The contract, tests and web app are open source at{" "}
          <a href="https://github.com/comzzy/chog-debt" target="_blank" rel="noreferrer">
            github.com/comzzy/chog-debt
          </a>
          . The contract is a single file with no external dependencies. It has 64 tests, including one that runs the full flow against the live deployment on a mainnet fork.
        </p>
      </Reveal>
    </>
  );
}

export function DocArticle({ doc }: { doc: Doc }) {
  const i = DOCS.indexOf(doc);
  const prev = i > 0 ? DOCS[i - 1] : null;
  const next = i < DOCS.length - 1 ? DOCS[i + 1] : null;
  return (
    <article className="doc">
      <header className={`doc-head bg-lilac`}>
        <FlowerField />
        <div className="doc-kicker enter">{doc.group}</div>
        <h1 className="enter d1">{doc.title}</h1>
        <p className="enter d2">{doc.short}</p>
        {doc.tryHref && (
          <a className="btn enter d3" href={doc.tryHref}>
            Try it: {doc.tryLabel}
          </a>
        )}
      </header>
      <div className="doc-body">
        {doc.slug === "faq" && <Faq items={FAQ} />}
        {doc.slug === "contracts" && <Contracts />}
        {sections(doc.body).map((sec, k) => (
          <Reveal key={k}>
            <section>{sec.map(render)}</section>
          </Reveal>
        ))}
        {doc.tryHref && (
          <Reveal>
            <div className={`try bg-${doc.color}`}>
              <b>Ready to try it?</b>
              <a className="btn" href={doc.tryHref}>
                {doc.tryLabel}
              </a>
            </div>
          </Reveal>
        )}
      </div>
      <nav className="prevnext">
        {prev ? (
          <a href={`/docs/${prev.slug}`} className="pn bg-yellow">
            <small>Previous</small>
            <b>{prev.title}</b>
          </a>
        ) : (
          <a href="/docs" className="pn bg-yellow">
            <small>Previous</small>
            <b>Docs overview</b>
          </a>
        )}
        {next && (
          <a href={`/docs/${next.slug}`} className="pn next bg-lime">
            <small>Next</small>
            <b>{next.title}</b>
          </a>
        )}
      </nav>
    </article>
  );
}
