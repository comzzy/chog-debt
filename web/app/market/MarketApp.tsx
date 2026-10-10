"use client";
import { useState } from "react";
import { formatUnits, type Address } from "viem";
import { useAccount, useReadContract } from "wagmi";
import { Shell } from "../Shell";
import { ChogFace, STATUS, TxNote, fmtLeft, useTx, type IOU } from "../ChogApp";
import { chogDebtAbi, erc20Abi } from "@/lib/abi";
import { CHOG_TOKEN, DEBT_ADDRESS, IS_CONFIGURED } from "@/lib/config";

function ListingRow({ id, iou, price }: { id: bigint; iou: IOU; price: bigint }) {
  const { address } = useAccount();
  const [myChog, setMyChog] = useState("");
  const tx = useTx();
  const { data: allowance } = useReadContract({
    address: CHOG_TOKEN,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, DEBT_ADDRESS] : undefined,
    query: { enabled: !!address, refetchInterval: 6000 },
  });
  const { data: score } = useReadContract({ address: DEBT_ADDRESS, abi: chogDebtAbi, functionName: "trustScore", args: [iou.debtorId] });
  const ok = /^\d+$/.test(myChog);
  return (
    <div className="iou">
      <ChogFace id={iou.debtorId} size={52} />
      <div className="iou-body">
        <div className="iou-top">
          <b>
            <a href={`/chog/${iou.debtorId}`}>Chog #{iou.debtorId.toString()}</a> owes <a href={`/chog/${iou.creditorId}`}>#{iou.creditorId.toString()}</a>
          </b>
          <span className="pill">{STATUS[iou.status]}</span>
        </div>
        <p className="memo">“{iou.memo}”</p>
        <div className="meta">
          IOU #{id.toString()} · price {formatUnits(price, 18)} $CHOG · debtor trust {score?.toString() ?? "?"}/100
          {iou.chogAmount > 0n && <> · 🔒 {formatUnits(iou.chogAmount, 18)} $CHOG collateral</>}
          {iou.status === 3 && <> · ⏳ {fmtLeft(iou.deadline)}</>}
        </div>
        {address && (
          <div className="actions">
            <input style={{ width: 120 }} value={myChog} onChange={(e) => setMyChog(e.target.value.trim())} placeholder="your Chog ID" />
            {(allowance ?? 0n) < price ? (
              <button onClick={() => tx.send({ address: CHOG_TOKEN, abi: erc20Abi, functionName: "approve", args: [DEBT_ADDRESS, price] })}>Approve $CHOG</button>
            ) : (
              <button disabled={!ok} onClick={() => tx.send({ address: DEBT_ADDRESS, abi: chogDebtAbi, functionName: "buyDebt", args: [id, BigInt(myChog), price] })}>
                Buy this debt
              </button>
            )}
          </div>
        )}
        <TxNote tx={tx} />
      </div>
    </div>
  );
}

export default function MarketApp() {
  const { data, isLoading } = useReadContract({
    address: DEBT_ADDRESS,
    abi: chogDebtAbi,
    functionName: "activeListings",
    query: { enabled: IS_CONFIGURED, refetchInterval: 10000 },
  });
  const rows = data ? data[0].map((id, i) => ({ id, iou: data[1][i] as IOU, price: data[2][i].price, seller: data[2][i].seller as Address })) : [];
  return (
    <Shell>
      <div className="card">
        <h3>🏷️ Debt market</h3>
        <p className="hint">Buy the right to collect. The debt, any collateral and the right to call it in move to your Chog. List your own from the home page.</p>
        {isLoading && <p className="hint">Loading…</p>}
        {!isLoading && rows.length === 0 && <p className="hint">No debts for sale right now.</p>}
        {rows.map((r) => (
          <ListingRow key={r.id.toString()} {...r} />
        ))}
      </div>
    </Shell>
  );
}
