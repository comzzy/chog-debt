"use client";
import { useEffect, useState } from "react";
import { usePublicClient, useWatchContractEvent } from "wagmi";
import { formatUnits } from "viem";
import { chogDebtAbi } from "./abi";
import { DEBT_ADDRESS, IS_CONFIGURED } from "./config";

// rpc.monad.xyz allows 100 blocks per eth_getLogs call; Monad makes ~3 blocks a second.
const RANGE = BigInt(process.env.NEXT_PUBLIC_LOGS_BLOCK_RANGE || 100);
const LOOKBACK = BigInt(process.env.NEXT_PUBLIC_FEED_LOOKBACK_BLOCKS || 3000);
const DEPLOY_BLOCK = BigInt(process.env.NEXT_PUBLIC_DEPLOY_BLOCK || 0);

export type Activity = { key: string; block: bigint; text: string; emoji: string; tokenIds: bigint[] };

type Log = { eventName?: string; args?: Record<string, unknown>; blockNumber: bigint | null; logIndex: number | null; transactionHash: `0x${string}` | null };

export function describe(log: Log): Activity | null {
  const a = (log.args ?? {}) as Record<string, bigint & string & boolean>;
  const n = (x: bigint) => `#${x}`;
  const chog = (x: bigint) => formatUnits(x, 18);
  let emoji = "📝";
  let text = "";
  let ids: bigint[] = [];
  switch (log.eventName) {
    case "IOUCreated":
      emoji = "✍️";
      text = `Chog ${n(a.creditorId)} says Chog ${n(a.debtorId)} owes them: “${a.memo}”`;
      ids = [a.creditorId, a.debtorId];
      break;
    case "IOUAccepted":
      emoji = "🤝";
      text = `Chog ${n(a.debtorId)} admitted IOU ${n(a.id)}`;
      ids = [a.debtorId];
      break;
    case "IOUCalledIn":
      emoji = "📣";
      text = `Chog ${n(a.creditorId)} called in IOU ${n(a.id)}. Clock's ticking.`;
      ids = [a.creditorId];
      break;
    case "IOURepaid":
      emoji = "💜";
      text = `Chog ${n(a.debtorId)} paid back IOU ${n(a.id)}${a.afterCallIn ? " (after being called in)" : ""}`;
      ids = [a.debtorId];
      break;
    case "IOUDefaulted":
      emoji = "💀";
      text = `Chog ${n(a.debtorId)} defaulted on IOU ${n(a.id)}`;
      ids = [a.debtorId];
      break;
    case "DeadbeatMarked":
      emoji = "🚨";
      text = `Chog ${n(a.tokenId)} is now a DEADBEAT`;
      ids = [a.tokenId];
      break;
    case "DeadbeatCleared":
      emoji = "🌱";
      text = `Chog ${n(a.tokenId)} redeemed themselves`;
      ids = [a.tokenId];
      break;
    case "IOUListed":
      emoji = "🏷️";
      text = `IOU ${n(a.id)} is for sale at ${chog(a.price)} $CHOG`;
      ids = [a.creditorId];
      break;
    case "IOUSold":
      emoji = "💸";
      text = `Chog ${n(a.toCreditorId)} bought IOU ${n(a.id)} from Chog ${n(a.fromCreditorId)} for ${chog(a.price)} $CHOG`;
      ids = [a.fromCreditorId, a.toCreditorId];
      break;
    case "Vouched":
      emoji = "🛡️";
      text = `Chog ${n(a.guarantorId)} vouched for IOU ${n(a.id)}${a.stake > 0n ? ` with ${chog(a.stake)} $CHOG` : ""}`;
      ids = [a.guarantorId];
      break;
    case "VouchSettled":
      emoji = a.honoured ? "✅" : "🔥";
      text = a.honoured ? `Chog ${n(a.guarantorId)}'s vouch on IOU ${n(a.id)} paid off` : `Chog ${n(a.guarantorId)} got burned vouching for IOU ${n(a.id)}`;
      ids = [a.guarantorId];
      break;
    case "BadgeEarned":
      emoji = a === undefined ? "" : Number(a.badge) === 2 ? "🏆" : "🔥";
      text = `Chog ${n(a.tokenId)} earned ${Number(a.badge) === 2 ? "Legend" : "Reliable"}`;
      ids = [a.tokenId];
      break;
    default:
      return null;
  }
  return { key: `${log.transactionHash}-${log.logIndex}`, block: log.blockNumber ?? 0n, text, emoji, tokenIds: ids };
}

/** Recent contract activity: scans back LOOKBACK blocks in RANGE-sized chunks, then watches for new events. */
export function useActivity(filter?: bigint) {
  const client = usePublicClient();
  const [items, setItems] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();

  const add = (logs: Log[]) =>
    setItems((prev) => {
      const map = new Map(prev.map((p) => [p.key, p]));
      for (const l of logs) {
        const d = describe(l);
        if (d) map.set(d.key, d);
      }
      return [...map.values()].sort((x, y) => (y.block > x.block ? 1 : y.block < x.block ? -1 : 0)).slice(0, 200);
    });

  useEffect(() => {
    if (!client || !IS_CONFIGURED) return void setLoading(false);
    let live = true;
    (async () => {
      try {
        const latest = await client.getBlockNumber();
        const floor = latest > LOOKBACK ? latest - LOOKBACK : 0n;
        const stop = floor > DEPLOY_BLOCK ? floor : DEPLOY_BLOCK;
        for (let to = latest; to >= stop && live; to -= RANGE) {
          const from = to - RANGE + 1n > stop ? to - RANGE + 1n : stop;
          const logs = await client.getContractEvents({ address: DEBT_ADDRESS, abi: chogDebtAbi, fromBlock: from, toBlock: to });
          add(logs as unknown as Log[]);
          if (from === stop) break;
        }
      } catch (e) {
        setError((e as { shortMessage?: string }).shortMessage ?? String(e));
      } finally {
        if (live) setLoading(false);
      }
    })();
    return () => {
      live = false;
    };
  }, [client]);

  useWatchContractEvent({
    address: DEBT_ADDRESS,
    abi: chogDebtAbi,
    enabled: IS_CONFIGURED,
    onLogs: (logs) => add(logs as unknown as Log[]),
  });

  const shown = filter === undefined ? items : items.filter((i) => i.tokenIds.includes(filter));
  return { items: shown, loading, error };
}
