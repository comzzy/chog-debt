"use client";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useEffect, useMemo, useRef, useState } from "react";
import { SFX_FOR, play } from "@/lib/sfx";
import { formatUnits, parseUnits, type Address } from "viem";
import { useAccount, useReadContract, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { chogDebtAbi, erc20Abi, erc721Abi } from "@/lib/abi";
import { Footer, FlowerField, Header, Reveal } from "./Shell";
import { CHOG_NFT, CHOG_TOKEN, DEBT_ADDRESS, IS_CONFIGURED, chain } from "@/lib/config";

export const STATUS = ["None", "Waiting for them", "Owed", "Called in!", "Repaid", "Defaulted", "Cancelled"] as const;
const STATUS_CLASS = ["", "pending", "active", "called", "repaid", "defaulted", "cancelled"];

export type IOU = {
  creditorId: bigint;
  debtorId: bigint;
  chogAmount: bigint;
  createdAt: bigint;
  deadline: bigint;
  status: number;
  memo: string;
};

type Rep = {
  favoursGiven: number;
  favoursReceived: number;
  repaid: number;
  repaidAfterCall: number;
  defaulted: number;
  open: number;
  redemption: number;
  deadbeat: boolean;
};

const ipfs = (u: string) => (u.startsWith("ipfs://") ? `https://ipfs.io/ipfs/${u.slice(7)}` : u);

function useChogImage(id?: bigint) {
  const { data: uri } = useReadContract({
    address: CHOG_NFT,
    abi: erc721Abi,
    functionName: "tokenURI",
    args: id !== undefined ? [id] : undefined,
    query: { enabled: id !== undefined },
  });
  const [img, setImg] = useState<string>();
  useEffect(() => {
    if (!uri) return;
    let live = true;
    fetch(ipfs(uri))
      .then((r) => r.json())
      .then((m) => live && m?.image && setImg(ipfs(m.image)))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [uri]);
  return img;
}

export function ChogFace({ id, size = 72 }: { id: bigint; size?: number }) {
  const img = useChogImage(id);
  return (
    <div className="face" style={{ width: size, height: size }}>
      {img ? <img src={img} alt={`Chog #${id}`} /> : <span>🐾</span>}
    </div>
  );
}

function badges(r: Rep, score: number) {
  const b: { t: string; e: string }[] = [];
  if (r.deadbeat) b.push({ t: "Deadbeat", e: "💀" });
  if (r.repaid >= 1 && r.defaulted === 0) b.push({ t: "Good for it", e: "🤝" });
  if (r.repaid >= 5) b.push({ t: "Reliable Chog", e: "🛡️" });
  if (r.repaidAfterCall >= 3) b.push({ t: "Pays under pressure", e: "⏰" });
  if (r.favoursGiven >= 3) b.push({ t: "Helpful Chog", e: "💜" });
  if (r.favoursGiven >= 10) b.push({ t: "Chog Patron", e: "👑" });
  if (r.defaulted > 0 && !r.deadbeat) b.push({ t: "Redeemed", e: "🌱" });
  if (score >= 90) b.push({ t: "Blue chip", e: "💎" });
  if (b.length === 0) b.push({ t: "Fresh Chog", e: "🥚" });
  return b;
}

export function TrustCard({ id }: { id: bigint }) {
  const { data } = useReadContracts({
    contracts: [
      { address: DEBT_ADDRESS, abi: chogDebtAbi, functionName: "reputationOf", args: [id] },
      { address: DEBT_ADDRESS, abi: chogDebtAbi, functionName: "trustScore", args: [id] },
      { address: DEBT_ADDRESS, abi: chogDebtAbi, functionName: "streakOf", args: [id] },
      { address: DEBT_ADDRESS, abi: chogDebtAbi, functionName: "guarantorRepOf", args: [id] },
    ],
    query: { enabled: IS_CONFIGURED, refetchInterval: 8000 },
  });
  const r = data?.[0]?.result as Rep | undefined;
  const score = Number((data?.[1]?.result as bigint | undefined) ?? 50n);
  const streak = data?.[2]?.result as { current: number; best: number; badges: number } | undefined;
  const gRep = data?.[3]?.result as { vouches: number; honoured: number; failed: number } | undefined;
  const rep: Rep = r ?? { favoursGiven: 0, favoursReceived: 0, repaid: 0, repaidAfterCall: 0, defaulted: 0, open: 0, redemption: 0, deadbeat: false };
  const mood = rep.deadbeat ? "sus" : score >= 75 ? "trusted" : score >= 40 ? "ok" : "shaky";
  return (
    <div className={`card trust ${rep.deadbeat ? "deadbeat" : mood === "trusted" ? "bg-lime" : "bg-yellow"}`}>
      <div className="trust-head">
        <div className="face-wrap">
          <ChogFace id={id} size={110} />
          {rep.deadbeat && <div className="stamp">DEADBEAT</div>}
        </div>
        <div>
          <h2>Chog #{id.toString()}</h2>
          <div className={`score ${mood}`}>
            <CountUp value={score} />
            <small>/100 trust</small>
          </div>
          <div className="bar">
            <div key={score} style={{ width: `${score}%` }} />
          </div>
        </div>
      </div>
      <div className="stats">
        <Stat n={rep.favoursGiven} l="favours given" />
        <Stat n={rep.repaid} l="repaid" />
        <Stat n={rep.open} l="owing now" />
        <Stat n={rep.defaulted} l="defaulted" />
      </div>
      <div className="badges">
        {streak && streak.badges & 2 ? <span className="badge">🏆 Legend</span> : streak && streak.badges & 1 ? <span className="badge">🔥 Reliable</span> : null}
        {badges(rep, score).map((b) => (
          <span key={b.t} className={`badge ${b.t === "Deadbeat" ? "bad" : ""}`}>
            {b.e} {b.t}
          </span>
        ))}
      </div>
      <p className="hint">
        Streak: {streak?.current ?? 0} on-time in a row (best {streak?.best ?? 0}) · Vouched {gRep?.vouches ?? 0}, honoured {gRep?.honoured ?? 0}, burned{" "}
        {gRep?.failed ?? 0} · <a href={`/chog/${id}`}>credit report</a>
      </p>
      {rep.deadbeat && (
        <p className="hint">
          Redemption arc: repay {3 - rep.redemption} more debt{3 - rep.redemption === 1 ? "" : "s"} to wash off the mark.
        </p>
      )}
    </div>
  );
}

function CountUp({ value }: { value: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return setN(value);
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / 900);
      setN(Math.round(from + (value - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{n}</>;
}

function Stat({ n, l }: { n: number; l: string }) {
  return (
    <div className="stat">
      <b>{n}</b>
      <span>{l}</span>
    </div>
  );
}

export function useTx() {
  const { writeContractAsync, isPending } = useWriteContract();
  const [hash, setHash] = useState<`0x${string}`>();
  const [err, setErr] = useState<string>();
  const receipt = useWaitForTransactionReceipt({ hash });
  const fn = useRef<string>("");
  useEffect(() => {
    if (receipt.isSuccess) play(receipt.data?.status === "reverted" ? "womp" : (SFX_FOR[fn.current] ?? "pop"));
  }, [receipt.isSuccess, receipt.data]);
  const send = async (args: Parameters<typeof writeContractAsync>[0]) => {
    setErr(undefined);
    fn.current = String(args.functionName);
    try {
      setHash(await writeContractAsync(args));
    } catch (e) {
      setErr((e as { shortMessage?: string }).shortMessage ?? String(e));
    }
  };
  return { send, busy: isPending || receipt.isLoading, done: receipt.isSuccess, err, hash };
}

export function TxNote({ tx }: { tx: ReturnType<typeof useTx> }) {
  if (tx.err) return <p className="err">😿 {tx.err}</p>;
  if (tx.busy) return <p className="hint">Chog is scribbling it onchain…</p>;
  if (tx.done && tx.hash)
    return (
      <p className="ok">
        ✅ Done.{" "}
        <a href={`${chain.blockExplorers?.default.url}/tx/${tx.hash}`} target="_blank" rel="noreferrer">
          view tx
        </a>
      </p>
    );
  return null;
}

function CreateIOU({ myId }: { myId: bigint }) {
  const [debtor, setDebtor] = useState("");
  const [memo, setMemo] = useState("");
  const [amount, setAmount] = useState("");
  const tx = useTx();
  const valid = /^\d+$/.test(debtor) && BigInt(debtor) !== myId && memo.trim().length > 0 && memo.length <= 140;
  return (
    <div className="card bg-lime">
      <h3>✍️ Write an IOU</h3>
      <p className="hint">You helped another Chog? Put it on their tab. They have to accept it before it counts.</p>
      <label>
        Which Chog owes you? (token ID)
        <input value={debtor} onChange={(e) => setDebtor(e.target.value.trim())} placeholder="e.g. 420" />
      </label>
      <label>
        What did you do for them? ({memo.length}/140)
        <input value={memo} maxLength={140} onChange={(e) => setMemo(e.target.value)} placeholder="reviewed your PR at 3am" />
      </label>
      <label>
        Optional $CHOG they lock up as collateral
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
      </label>
      <button
        disabled={!valid || tx.busy}
        onClick={() =>
          tx.send({
            address: DEBT_ADDRESS,
            abi: chogDebtAbi,
            functionName: "createIOU",
            args: [myId, BigInt(debtor), memo.trim(), amount ? parseUnits(amount, 18) : 0n],
          })
        }
      >
        Put it on their tab
      </button>
      <TxNote tx={tx} />
    </div>
  );
}

function VouchCard({ myId }: { myId: bigint }) {
  const { address } = useAccount();
  const [iouId, setIouId] = useState("");
  const [stake, setStake] = useState("");
  const tx = useTx();
  const amt = stake ? parseUnits(stake, 18) : 0n;
  const { data: allowance } = useReadContract({
    address: CHOG_TOKEN,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, DEBT_ADDRESS] : undefined,
    query: { enabled: !!address && amt > 0n, refetchInterval: 6000 },
  });
  const ok = /^\d+$/.test(iouId);
  return (
    <div className="card bg-lilac">
      <h3>🛡️ Vouch for a Chog</h3>
      <p className="hint">Back someone else's IOU with Chog #{myId.toString()}. If they default, your trust takes a hit and your stake goes to the creditor.</p>
      <label>
        IOU number
        <input value={iouId} onChange={(e) => setIouId(e.target.value.trim())} placeholder="e.g. 12" />
      </label>
      <label>
        Optional $CHOG stake
        <input value={stake} onChange={(e) => setStake(e.target.value)} placeholder="0" />
      </label>
      {amt > 0n && (allowance ?? 0n) < amt ? (
        <button onClick={() => tx.send({ address: CHOG_TOKEN, abi: erc20Abi, functionName: "approve", args: [DEBT_ADDRESS, amt] })}>Approve $CHOG</button>
      ) : (
        <button disabled={!ok || tx.busy} onClick={() => tx.send({ address: DEBT_ADDRESS, abi: chogDebtAbi, functionName: "vouch", args: [BigInt(iouId), myId, amt] })}>
          I vouch for them
        </button>
      )}
      <TxNote tx={tx} />
    </div>
  );
}

export function fmtLeft(deadline: bigint) {
  const s = Number(deadline) - Math.floor(Date.now() / 1000);
  if (s <= 0) return "deadline passed";
  const h = Math.floor(s / 3600);
  return h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h left` : `${h}h ${Math.floor((s % 3600) / 60)}m left`;
}

function IOURow({ id, iou, mine }: { id: bigint; iou: IOU; mine: bigint }) {
  const { address } = useAccount();
  const tx = useTx();
  const [days, setDays] = useState("3");
  const [price, setPrice] = useState("");
  const { data: extra } = useReadContracts({
    contracts: [
      { address: DEBT_ADDRESS, abi: chogDebtAbi, functionName: "getListing", args: [id] },
      { address: DEBT_ADDRESS, abi: chogDebtAbi, functionName: "getGuarantee", args: [id] },
    ],
    query: { refetchInterval: 8000 },
  });
  const listing = extra?.[0]?.result as { price: bigint; seller: Address; active: boolean } | undefined;
  const guarantee = extra?.[1]?.result as { guarantorId: bigint; stake: bigint; active: boolean } | undefined;
  const iAmCreditor = iou.creditorId === mine;
  const other = iAmCreditor ? iou.debtorId : iou.creditorId;
  const { data: allowance } = useReadContract({
    address: CHOG_TOKEN,
    abi: erc20Abi,
    functionName: "allowance",
    args: address ? [address, DEBT_ADDRESS] : undefined,
    query: { enabled: !!address && iou.chogAmount > 0n && iou.status === 1 && !iAmCreditor },
  });
  const call = (functionName: "accept" | "repay" | "cancel" | "markDefault") =>
    tx.send({ address: DEBT_ADDRESS, abi: chogDebtAbi, functionName, args: [id] });
  const overdue = iou.status === 3 && Number(iou.deadline) < Date.now() / 1000;
  const needsApprove = iou.chogAmount > 0n && (allowance ?? 0n) < iou.chogAmount;

  return (
    <div className={`iou ${STATUS_CLASS[iou.status]}`}>
      <ChogFace id={other} size={52} />
      <div className="iou-body">
        <div className="iou-top">
          <b>{iAmCreditor ? `#${other} owes you` : `you owe #${other}`}</b>
          <span className={`pill ${STATUS_CLASS[iou.status]}`}>{STATUS[iou.status]}</span>
        </div>
        <p className="memo">“{iou.memo}”</p>
        <div className="meta">
          IOU #{id.toString()}
          {iou.chogAmount > 0n && <> · 🔒 {formatUnits(iou.chogAmount, 18)} $CHOG</>}
          {iou.status === 3 && <> · ⏳ {fmtLeft(iou.deadline)}</>}
          {guarantee?.active && (
            <>
              {" "}
              · 🛡️ vouched by #{guarantee.guarantorId.toString()}
              {guarantee.stake > 0n && <> ({formatUnits(guarantee.stake, 18)} $CHOG)</>}
            </>
          )}
          {listing?.active && <> · 🏷️ for sale at {formatUnits(listing.price, 18)} $CHOG</>}
        </div>
        <div className="actions">
          {iou.status === 1 && !iAmCreditor && (
            <>
              {needsApprove ? (
                <button onClick={() => tx.send({ address: CHOG_TOKEN, abi: erc20Abi, functionName: "approve", args: [DEBT_ADDRESS, iou.chogAmount] })}>
                  Approve $CHOG
                </button>
              ) : (
                <button onClick={() => call("accept")}>Yeah, I owe you</button>
              )}
              <button className="ghost" onClick={() => call("cancel")}>
                Nope
              </button>
            </>
          )}
          {iou.status === 1 && iAmCreditor && (
            <button className="ghost" onClick={() => call("cancel")}>
              Withdraw
            </button>
          )}
          {(iou.status === 2 || iou.status === 3) && !iAmCreditor && <button onClick={() => call("repay")}>I paid it back 💜</button>}
          {iou.status === 2 && iAmCreditor && (
            <>
              <select value={days} onChange={(e) => setDays(e.target.value)}>
                <option value="1">1 day</option>
                <option value="3">3 days</option>
                <option value="7">7 days</option>
                <option value="14">14 days</option>
              </select>
              <button
                className="warn"
                onClick={() => tx.send({ address: DEBT_ADDRESS, abi: chogDebtAbi, functionName: "callIn", args: [id, BigInt(Number(days) * 86400)] })}
              >
                Call it in 📣
              </button>
            </>
          )}
          {(iou.status === 2 || iou.status === 3) && iAmCreditor && !listing?.active && (
            <>
              <input style={{ width: 90 }} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$CHOG" />
              <button
                className="ghost"
                disabled={!price || Number(price) <= 0}
                onClick={() => tx.send({ address: DEBT_ADDRESS, abi: chogDebtAbi, functionName: "listForSale", args: [id, parseUnits(price, 18)] })}
              >
                Sell this debt 🏷️
              </button>
            </>
          )}
          {listing?.active && iAmCreditor && (
            <button className="ghost" onClick={() => tx.send({ address: DEBT_ADDRESS, abi: chogDebtAbi, functionName: "cancelListing", args: [id] })}>
              Unlist
            </button>
          )}
          {overdue && (
            <button className="danger" onClick={() => call("markDefault")}>
              Mark as deadbeat 💀
            </button>
          )}
        </div>
        <TxNote tx={tx} />
      </div>
    </div>
  );
}

function Ledger({ myId }: { myId: bigint }) {
  const { data } = useReadContract({
    address: DEBT_ADDRESS,
    abi: chogDebtAbi,
    functionName: "iousOf",
    args: [myId],
    query: { enabled: IS_CONFIGURED, refetchInterval: 6000 },
  });
  const [ids, list] = (data as readonly [readonly bigint[], readonly IOU[]] | undefined) ?? [[], []];
  const rows = ids.map((id, i) => ({ id, iou: list[i] })).reverse();
  const owedToMe = rows.filter((r) => r.iou.creditorId === myId);
  const iOwe = rows.filter((r) => r.iou.debtorId === myId);
  return (
    <div className="ledger">
      <div className="card bg-yellow">
        <h3>📥 Chogs that owe you</h3>
        {owedToMe.length === 0 && <p className="hint">Nobody owes you yet. Go help someone.</p>}
        {owedToMe.map((r) => (
          <IOURow key={r.id.toString()} {...r} mine={myId} />
        ))}
      </div>
      <div className="card bg-lilac">
        <h3>📤 What you owe</h3>
        {iOwe.length === 0 && <p className="hint">Clean slate. Nice.</p>}
        {iOwe.map((r) => (
          <IOURow key={r.id.toString()} {...r} mine={myId} />
        ))}
      </div>
    </div>
  );
}

function ChogPicker({ owner, selected, onPick }: { owner: Address; selected?: bigint; onPick: (id: bigint) => void }) {
  const key = `chogdebt:${owner}`;
  const [ids, setIds] = useState<string[]>([]);
  const [input, setInput] = useState("");
  useEffect(() => {
    setIds(JSON.parse(localStorage.getItem(key) ?? "[]"));
  }, [key]);
  const { data: bal } = useReadContract({ address: CHOG_NFT, abi: erc721Abi, functionName: "balanceOf", args: [owner] });
  const { data: owners } = useReadContracts({
    contracts: ids.map((id) => ({ address: CHOG_NFT, abi: erc721Abi, functionName: "ownerOf" as const, args: [BigInt(id)] as const })),
  });
  const save = (next: string[]) => {
    setIds(next);
    localStorage.setItem(key, JSON.stringify(next));
  };
  return (
    <div className="card bg-yellow">
      <h3>🐾 Your Chogs {bal !== undefined && <small>({bal.toString()} in this wallet)</small>}</h3>
      <p className="hint">The Chog collection isn't enumerable, so tell me which token IDs are yours. I'll check onchain.</p>
      <div className="row">
        <input value={input} onChange={(e) => setInput(e.target.value.trim())} placeholder="token ID" />
        <button disabled={!/^\d+$/.test(input) || ids.includes(input)} onClick={() => (save([...ids, input]), setInput(""))}>
          Add
        </button>
      </div>
      <div className="picker">
        {ids.map((id, i) => {
          const o = owners?.[i]?.result as Address | undefined;
          const yours = o?.toLowerCase() === owner.toLowerCase();
          return (
            <button key={id} className={`pick ${selected === BigInt(id) ? "on" : ""}`} disabled={!yours} onClick={() => onPick(BigInt(id))}>
              <ChogFace id={BigInt(id)} size={56} />#{id}
              {o && !yours && <small>not yours</small>}
              <span className="x" onClick={(e) => (e.stopPropagation(), save(ids.filter((x) => x !== id)))}>
                ×
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Lookup() {
  const [q, setQ] = useState("");
  const id = useMemo(() => (/^\d+$/.test(q) ? BigInt(q) : undefined), [q]);
  return (
    <div className="card bg-lime">
      <h3>🔍 Check a Chog before you help them</h3>
      <input value={q} onChange={(e) => setQ(e.target.value.trim())} placeholder="any Chog token ID" />
      {id !== undefined && <TrustCard id={id} />}
    </div>
  );
}

const STEPS = [
  { c: "yellow", icon: "note", t: "Write it down", d: "You helped another Chog. Put it on their tab." },
  { c: "lime", icon: "hand", t: "They say yes", d: "They accept the IOU. Now it counts." },
  { c: "lilac", icon: "bell", t: "Call it in", d: "Need the favour back? Set a deadline." },
  { c: "pink2", icon: "heart", t: "Pay up", d: "Repay on time and your trust score climbs." },
  { c: "lime", icon: "skull", t: "Or get stamped", d: "Miss the deadline and your Chog wears DEADBEAT." },
  { c: "yellow", icon: "tag", t: "Sell or vouch", d: "Trade debts for $CHOG, or back a friend's word." },
];

export function Icon({ name, size = 56 }: { name: string; size?: number }) {
  const s = { width: size, height: size };
  switch (name) {
    case "heart":
      return (
        <svg {...s} viewBox="0 0 60 60" aria-hidden="true">
          <path d="M30 52 8 30a12 12 0 0 1 22-14 12 12 0 0 1 22 14z" fill="#E59CFF" stroke="#111" strokeWidth="2.5" />
        </svg>
      );
    case "daisy":
      return (
        <svg {...s} viewBox="0 0 60 60" aria-hidden="true">
          {[0, 45, 90, 135, 180, 225, 270, 315].map((r) => (
            <ellipse key={r} cx="30" cy="12" rx="7" ry="10" fill="#fff" stroke="#111" strokeWidth="2" transform={`rotate(${r} 30 30)`} />
          ))}
          <circle cx="30" cy="30" r="11" fill="#FFC93C" stroke="#111" strokeWidth="2" />
          <circle cx="26" cy="28" r="1.6" fill="#111" />
          <circle cx="34" cy="28" r="1.6" fill="#111" />
          <path d="M25 33q5 5 10 0" fill="none" stroke="#111" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case "note":
      return (
        <svg {...s} viewBox="0 0 60 60" aria-hidden="true">
          <path d="M12 8h26l10 10v34H12z" fill="#fff" stroke="#111" strokeWidth="2.5" />
          <path d="M38 8v10h10" fill="none" stroke="#111" strokeWidth="2.5" />
          <path d="M19 28h22M19 36h22M19 44h12" stroke="#111" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
      );
    case "hand":
      return (
        <svg {...s} viewBox="0 0 60 60" aria-hidden="true">
          <path d="M6 30l12-12 10 4 8-4 18 12-14 14H24z" fill="#FFE08A" stroke="#111" strokeWidth="2.5" strokeLinejoin="round" />
          <path d="M28 22l-6 8a3 3 0 0 0 5 3l6-5 10 9" fill="none" stroke="#111" strokeWidth="2.5" strokeLinejoin="round" />
        </svg>
      );
    case "bell":
      return (
        <svg {...s} viewBox="0 0 60 60" aria-hidden="true">
          <path d="M14 42h32l-4-6V26a12 12 0 0 0-24 0v10z" fill="#FFE08A" stroke="#111" strokeWidth="2.5" strokeLinejoin="round" />
          <circle cx="30" cy="48" r="4" fill="#111" />
        </svg>
      );
    case "skull":
      return (
        <svg {...s} viewBox="0 0 60 60" aria-hidden="true">
          <path d="M30 8c-12 0-20 8-20 19 0 7 4 11 8 13v8h24v-8c4-2 8-6 8-13 0-11-8-19-20-19z" fill="#fff" stroke="#111" strokeWidth="2.5" />
          <circle cx="22" cy="28" r="5" fill="#111" />
          <circle cx="38" cy="28" r="5" fill="#111" />
          <path d="M26 48v-5M34 48v-5" stroke="#111" strokeWidth="2.5" />
        </svg>
      );
    case "tag":
      return (
        <svg {...s} viewBox="0 0 60 60" aria-hidden="true">
          <path d="M8 30V10h20l24 24-18 18z" fill="#FF80C8" stroke="#111" strokeWidth="2.5" strokeLinejoin="round" />
          <circle cx="19" cy="20" r="4" fill="#fff" stroke="#111" strokeWidth="2.5" />
        </svg>
      );
    default:
      return null;
  }
}

export default function ChogApp() {
  const { address, isConnected } = useAccount();
  const [mine, setMine] = useState<bigint>();
  return (
    <>
      <Header />
      <section className="hero">
        <div className="hero-main bg-lilac">
          <FlowerField />
          <h1 className="enter">
            Favours, written down.
            <span>Debts that stick to your Chog.</span>
          </h1>
          <p className="enter d1">Help a Chog holder, they owe your Chog. Pay back and your trust goes up. Ghost them and everyone sees.</p>
          <div className="enter d2">
            {isConnected ? (
              <a href="#app" className="btn big">
                Open my tab
              </a>
            ) : (
              <ConnectButton.Custom>
                {({ openConnectModal }) => (
                  <button className="btn big" onClick={openConnectModal}>
                    Connect wallet
                  </button>
                )}
              </ConnectButton.Custom>
            )}
          </div>
        </div>
        <div className="hero-tiles">
          <div className="tile bg-yellow enter d1">
            <div className="tile-num">50</div>
            <small>every Chog starts here</small>
          </div>
          <div className="tile bg-lime enter d2">
            <span className="bob">
              <Icon name="heart" size={96} />
            </span>
          </div>
          <div className="tile bg-pink enter d3">
            <span className="spin-slow">
              <Icon name="daisy" size={110} />
            </span>
          </div>
          <div className="tile bg-pink2 enter d4">
            <div className="mini-stamp">DEADBEAT</div>
            <small>the other option</small>
          </div>
        </div>
      </section>

      <main className="wrap">
        {!IS_CONFIGURED && <div className="banner">No contract address set. Add NEXT_PUBLIC_CHOG_DEBT_ADDRESS to talk to the chain.</div>}

        <Reveal>
          <h2 className="section-title">How it works</h2>
        </Reveal>
        <div className="steps">
          {STEPS.map((st, i) => (
            <Reveal key={st.t} delay={i * 70}>
              <div className={`step bg-${st.c}`}>
                <Icon name={st.icon} />
                <h3>{st.t}</h3>
                <p>{st.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
        <Reveal>
          <p className="note-line">Debts live on the NFT, not your wallet. Buy a deadbeat Chog and you inherit the stamp.</p>
        </Reveal>

        <div id="app" />
        {!isConnected ? (
          <Reveal>
            <div className="card bg-yellow center">
              <h3>Your tab is waiting</h3>
              <p>Connect a wallet that holds a Chog to write and settle IOUs.</p>
              <ConnectButton.Custom>
                {({ openConnectModal }) => (
                  <button className="btn" onClick={openConnectModal}>
                    Connect wallet
                  </button>
                )}
              </ConnectButton.Custom>
            </div>
            <Lookup />
          </Reveal>
        ) : (
          <>
            <Reveal>
              <ChogPicker owner={address!} selected={mine} onPick={setMine} />
            </Reveal>
            {mine !== undefined ? (
              <>
                <div className="grid">
                  <Reveal>
                    <TrustCard id={mine} />
                  </Reveal>
                  <Reveal delay={80}>
                    <CreateIOU myId={mine} />
                  </Reveal>
                </div>
                <Reveal>
                  <Ledger myId={mine} />
                </Reveal>
                <Reveal>
                  <VouchCard myId={mine} />
                </Reveal>
              </>
            ) : (
              <p className="hint center">Pick a Chog to see its tab.</p>
            )}
            <Reveal>
              <Lookup />
            </Reveal>
          </>
        )}
      </main>
      <Footer />
    </>
  );
}
