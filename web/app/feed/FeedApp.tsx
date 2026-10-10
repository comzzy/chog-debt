"use client";
import { Shell } from "../Shell";
import { useActivity } from "@/lib/activity";

export function FeedList({ filter }: { filter?: bigint }) {
  const { items, loading, error } = useActivity(filter);
  return (
    <div>
      {loading && <p className="hint">Reading the chain…</p>}
      {error && <p className="err">{error}</p>}
      {!loading && items.length === 0 && <p className="hint">Nothing in the recent blocks. Quiet day in Chog town.</p>}
      {items.map((i) => (
        <div key={i.key} className="iou">
          <div style={{ fontSize: 24 }}>{i.emoji}</div>
          <div className="iou-body">
            <div>{i.text}</div>
            <div className="meta">
              block {i.block.toString()} ·{" "}
              {i.tokenIds.map((t) => (
                <a key={t.toString()} href={`/chog/${t}`} style={{ marginRight: 6 }}>
                  #{t.toString()}
                </a>
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function FeedApp() {
  return (
    <Shell>
      <div className="card">
        <h3>📡 Live feed</h3>
        <p className="hint">Straight from contract events. New stuff shows up on its own.</p>
        <FeedList />
      </div>
    </Shell>
  );
}
