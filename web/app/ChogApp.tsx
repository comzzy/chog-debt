"use client";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useEffect, useMemo, useState } from "react";
import { formatUnits, parseUnits, type Address } from "viem";
import { useAccount, useReadContract, useReadContracts, useWaitForTransactionReceipt, useWriteContract } from "wagmi";
import { chogDebtAbi, erc20Abi, erc721Abi } from "@/lib/abi";
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
    <div className={`card trust ${rep.deadbeat ? "deadbeat" : ""}`}>
      <div className="trust-head">
        <div className="face-wrap">
          <ChogFace id={id} size={110} />
          {rep.deadbeat && <div className="stamp">DEADBEAT</div>}
        </div>
        <div>
          <h2>Chog #{id.toString()}</h2>
          <div className={`score ${mood}`}>
            {score}
            <small>/100 trust</small>
          </div>
          <div className="bar">
            <div style={{ width: `${score}%` }} />
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
  const send = async (args: Parameters<typeof writeContractAsync>[0]) => {
    setErr(undefined);
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
    <div className="card">
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
    <div className="card">
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
      <div className="card">
        <h3>📥 Chogs that owe you</h3>
        {owedToMe.length === 0 && <p className="hint">Nobody owes you yet. Go help someone.</p>}
        {owedToMe.map((r) => (
          <IOURow key={r.id.toString()} {...r} mine={myId} />
        ))}
      </div>
      <div className="card">
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
    <div className="card">
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
    <div className="card">
      <h3>🔍 Check a Chog before you help them</h3>
      <input value={q} onChange={(e) => setQ(e.target.value.trim())} placeholder="any Chog token ID" />
      {id !== undefined && <TrustCard id={id} />}
    </div>
  );
}

export default function ChogApp() {
  const { address, isConnected } = useAccount();
  const [mine, setMine] = useState<bigint>();
  return (
    <main>
      <header>
        <div className="logo">
          Chog<span>Debt</span>
        </div>
        <nav className="hint">
          <a href="/">Home</a> · <a href="/market">Debt market</a> · <a href="/leaderboard">Leaderboard</a> · <a href="/feed">Live feed</a>
        </nav>
        <ConnectButton chainStatus="icon" showBalance={false} />
      </header>

      {!IS_CONFIGURED && <div className="banner">Heads up: NEXT_PUBLIC_CHOG_DEBT_ADDRESS isn't set, so there's no contract to talk to yet.</div>}

      {!isConnected ? (
        <section className="hero">
          <h1>Your Chog never forgets.</h1>
          <p>
            Help another Chog holder, and your Chog writes them an IOU. They accept, they owe you. Call it in when you need it. Pay back and your
            Chog's trust score goes up. Ghost someone and your Chog wears a <b>DEADBEAT</b> stamp for everyone to see.
          </p>
          <p className="hint">The debt lives on the NFT, not the wallet. Sell a deadbeat Chog and the buyer inherits the shame.</p>
          <ConnectButton label="Connect wallet to open your tab" />
        </section>
      ) : (
        <>
          <ChogPicker owner={address!} selected={mine} onPick={setMine} />
          {mine !== undefined ? (
            <>
              <div className="grid">
                <TrustCard id={mine} />
                <CreateIOU myId={mine} />
              </div>
              <Ledger myId={mine} />
              <VouchCard myId={mine} />
            </>
          ) : (
            <p className="hint center">Pick a Chog to see its tab.</p>
          )}
          <Lookup />
        </>
      )}
      <footer>Built for Chogathon 2026 · Monad · keep your word, Chog.</footer>
    </main>
  );
}
