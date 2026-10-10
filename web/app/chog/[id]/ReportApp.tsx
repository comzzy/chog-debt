"use client";
import { useParams } from "next/navigation";
import { useState } from "react";
import { formatUnits } from "viem";
import { useReadContract } from "wagmi";
import { EmptyState, PageHead, Shell } from "../../Shell";
import { STATUS, TrustCard, type IOU } from "../../ChogApp";
import { FeedList } from "../../feed/FeedApp";
import { chogDebtAbi } from "@/lib/abi";
import { DEBT_ADDRESS, IS_CONFIGURED } from "@/lib/config";

export default function ReportApp() {
  const params = useParams<{ id: string }>();
  const valid = /^\d+$/.test(params.id ?? "");
  const id = valid ? BigInt(params.id) : 0n;
  const [copied, setCopied] = useState(false);
  const { data } = useReadContract({
    address: DEBT_ADDRESS,
    abi: chogDebtAbi,
    functionName: "iousOf",
    args: [id],
    query: { enabled: IS_CONFIGURED && valid },
  });
  if (!valid) return <Shell><p className="err">That's not a Chog token ID.</p></Shell>;
  const rows = data ? data[0].map((iid, i) => ({ id: iid, iou: data[1][i] as IOU })).reverse() : [];
  const share = async () => {
    const url = window.location.href;
    const text = `Chog #${id} credit report on Chog Debt`;
    if (navigator.share) await navigator.share({ title: text, url }).catch(() => {});
    else {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    }
  };
  const tweet = `https://x.com/intent/tweet?text=${encodeURIComponent(`Check Chog #${id}'s credit report before you lend it a favour 👀`)}&url=`;
  return (
    <Shell>
      <PageHead title={<>Chog #{id.toString()}<span>Credit report</span></>} sub="Check before you lend this Chog a favour." />
      <div className="card bg-lime">
        <div className="actions">
          <button onClick={share}>{copied ? "Link copied" : "Share"}</button>
          <a href={tweet + (typeof window !== "undefined" ? encodeURIComponent(window.location.href) : "")} target="_blank" rel="noreferrer">
            <button className="ghost">Post on X</button>
          </a>
        </div>
      </div>
      <TrustCard id={id} />
      <div className="card bg-yellow">
        <h3>History</h3>
        {rows.length === 0 && <EmptyState title="No IOUs on record" line="This Chog has a clean sheet: nothing owed, nothing given yet." actions={[{ label: "Write it an IOU", href: "/#app" }, { label: "Reading a report", href: "/docs/credit-report", ghost: true }]} />}
        {rows.map(({ id: iid, iou }) => (
          <div key={iid.toString()} className="iou">
            <div className="iou-body">
              <div className="iou-top">
                <b>{iou.creditorId === id ? `#${iou.debtorId} owes this Chog` : `owes #${iou.creditorId}`}</b>
                <span className="pill">{STATUS[iou.status]}</span>
              </div>
              <p className="memo">“{iou.memo}”</p>
              <div className="meta">
                IOU #{iid.toString()} · {new Date(Number(iou.createdAt) * 1000).toLocaleDateString()}
                {iou.chogAmount > 0n && <> · {formatUnits(iou.chogAmount, 18)} $CHOG</>}
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="card bg-lilac">
        <h3>Recent activity</h3>
        <FeedList filter={id} />
      </div>
    </Shell>
  );
}
