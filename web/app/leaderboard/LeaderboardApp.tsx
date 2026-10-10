"use client";
import { useReadContract } from "wagmi";
import { EmptyState, PageHead, Shell } from "../Shell";
import { ChogFace } from "../ChogApp";
import { chogDebtAbi } from "@/lib/abi";
import { DEBT_ADDRESS, IS_CONFIGURED } from "@/lib/config";

type Row = { id: bigint; score: number; deadbeat: boolean; defaults: number };

function Board({ title, rows, show, color }: { title: string; rows: Row[]; show: (r: Row) => string; color: string }) {
  return (
    <div className={`card ${color}`}>
      <h3>{title}</h3>
      {rows.length === 0 && <EmptyState title="Nobody here yet" line="Chogs show up once they write, owe or vouch for an IOU." actions={[{ label: "Get on the board", href: "/#app" }]} />}
      {rows.map((r, i) => (
        <a key={r.id.toString()} href={`/chog/${r.id}`} className="iou lb-row" style={{ color: "inherit", textDecoration: "none", alignItems: "center" }}>
          <b style={{ width: 28 }}>{i + 1}</b>
          <ChogFace id={r.id} size={44} />
          <div className="iou-body">
            <b>Chog #{r.id.toString()}</b>
            <div className="meta">{show(r)}</div>
          </div>
        </a>
      ))}
    </div>
  );
}

export default function LeaderboardApp() {
  // One call is fine for small data; page this with offset/limit if it grows past a few thousand Chogs.
  const { data, isLoading } = useReadContract({
    address: DEBT_ADDRESS,
    abi: chogDebtAbi,
    functionName: "participants",
    args: [0n, 5000n],
    query: { enabled: IS_CONFIGURED, refetchInterval: 15000 },
  });
  const rows: Row[] = data ? data[0].map((id, i) => ({ id, score: Number(data[1][i]), deadbeat: data[2][i], defaults: data[3][i] })) : [];
  const trusted = [...rows].sort((a, b) => b.score - a.score).slice(0, 20);
  const deadbeats = rows
    .filter((r) => r.defaults > 0)
    .sort((a, b) => b.defaults - a.defaults || a.score - b.score)
    .slice(0, 20);
  return (
    <Shell>
      <PageHead title={<>Leaderboard<span>Who keeps their word.</span></>} sub="The most trusted Chogs, and the ones nobody should lend to." />
      {isLoading && <p className="hint">Counting Chogs…</p>}
      <div className="grid">
        <Board title="💎 Most trusted Chogs" rows={trusted} color="bg-lime" show={(r) => `${r.score}/100 trust`} />
        <Board title="💀 Worst deadbeats" rows={deadbeats} color="bg-lilac" show={(r) => `${r.defaults} default${r.defaults === 1 ? "" : "s"}${r.deadbeat ? " · stamped" : " · redeemed"} · ${r.score}/100`} />
      </div>
    </Shell>
  );
}
