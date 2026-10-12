"use client";
import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import { chogDebtAbi } from "@/lib/abi";
import { DEBT_ADDRESS, IS_CONFIGURED } from "@/lib/config";

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;
type Stats = { written: number; repaid: number; open: number; deadbeats: number };

// Counts come straight from the contract: every IOU by id, then the deadbeat flag of each Chog that ever defaulted.
async function loadStats(client: NonNullable<ReturnType<typeof usePublicClient>>): Promise<Stats> {
  const n = Number(await client.readContract({ address: DEBT_ADDRESS, abi: chogDebtAbi, functionName: "iouCount" }));
  let repaid = 0;
  let open = 0;
  const defaulted = new Set<bigint>();
  for (let start = 1; start <= n; start += 200) {
    const ids = Array.from({ length: Math.min(200, n - start + 1) }, (_, i) => BigInt(start + i));
    const res = await client.multicall({
      multicallAddress: MULTICALL3,
      allowFailure: false,
      contracts: ids.map((id) => ({ address: DEBT_ADDRESS, abi: chogDebtAbi, functionName: "getIOU", args: [id] }) as const),
    });
    for (const iou of res as { debtorId: bigint; status: number }[]) {
      if (iou.status === 4) repaid++;
      else if (iou.status === 2 || iou.status === 3) open++;
      else if (iou.status === 5) defaulted.add(iou.debtorId);
    }
  }
  let deadbeats = 0;
  if (defaulted.size) {
    const reps = await client.multicall({
      multicallAddress: MULTICALL3,
      allowFailure: false,
      contracts: [...defaulted].map((t) => ({ address: DEBT_ADDRESS, abi: chogDebtAbi, functionName: "reputationOf", args: [t] }) as const),
    });
    deadbeats = (reps as { deadbeat: boolean }[]).filter((r) => r.deadbeat).length;
  }
  return { written: n, repaid, open, deadbeats };
}

export function LiveStats() {
  const client = usePublicClient();
  const [s, setS] = useState<Stats>();
  useEffect(() => {
    if (!client || !IS_CONFIGURED) return;
    let live = true;
    const run = () => loadStats(client).then((x) => live && setS(x)).catch(() => {});
    run();
    const t = setInterval(run, 30000);
    return () => {
      live = false;
      clearInterval(t);
    };
  }, [client]);
  const cell = (n: number | undefined, l: string, c: string) => (
    <div className={`ls-cell ${c}`}>
      <b>{n ?? "–"}</b>
      <span>{l}</span>
    </div>
  );
  return (
    <section className="live-stats" aria-label="Live numbers from the contract">
      <div className="ls-label">
        <i className="ls-dot" />
        Live on Monad
      </div>
      {cell(s?.written, "IOUs written", "bg-lime")}
      {cell(s?.repaid, "repaid", "bg-yellow")}
      {cell(s?.open, "open debts", "bg-lilac")}
      {cell(s?.deadbeats, "DEADBEAT Chogs", "bg-pink2")}
    </section>
  );
}
