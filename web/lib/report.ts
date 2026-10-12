import { createPublicClient, http } from "viem";
import { chogDebtAbi, erc721Abi } from "./abi";
import { CHOG_NFT, DEBT_ADDRESS, chain } from "./chain";

const client = createPublicClient({ chain, transport: http() });
const GATEWAYS = ["https://gateway.pinata.cloud/ipfs/", "https://ipfs.io/ipfs/", "https://dweb.link/ipfs/"];
const TIMEOUTS = [15000, 5000, 5000];

async function fetchIpfs(uri: string): Promise<Response | null> {
  const list = uri.startsWith("ipfs://") ? GATEWAYS.map((g) => g + uri.slice(7)) : [uri];
  for (const [i, u] of list.entries()) {
    try {
      const r = await fetch(u, { signal: AbortSignal.timeout(TIMEOUTS[i] ?? 15000), next: { revalidate: 86400 } });
      if (r.ok) return r;
    } catch {}
  }
  return null;
}

export type Report = { id: bigint; score: number; deadbeat: boolean; repaid: number; defaulted: number; open: number; streak: number; best: number; image?: string };

export async function readReport(id: bigint): Promise<Report> {
  const [rep, score, streak] = await Promise.all([
    client.readContract({ address: DEBT_ADDRESS, abi: chogDebtAbi, functionName: "reputationOf", args: [id] }),
    client.readContract({ address: DEBT_ADDRESS, abi: chogDebtAbi, functionName: "trustScore", args: [id] }),
    client.readContract({ address: DEBT_ADDRESS, abi: chogDebtAbi, functionName: "streakOf", args: [id] }),
  ]);
  return { id, score: Number(score), deadbeat: rep.deadbeat, repaid: rep.repaid, defaulted: rep.defaulted, open: rep.open, streak: streak.current, best: streak.best };
}

// Chog art is webp, which the OG renderer can't draw, so convert to png.
export async function chogImagePng(id: bigint, px: number): Promise<{ src?: string; err?: string }> {
  try {
    const uri = await client.readContract({ address: CHOG_NFT, abi: erc721Abi, functionName: "tokenURI", args: [id] });
    const meta = await fetchIpfs(uri);
    const image = meta && ((await meta.json()) as { image?: string }).image;
    if (!image) return { err: "meta" };
    const res = await fetchIpfs(image);
    if (!res) return { err: "image fetch" };
    const sharp = (await import("sharp")).default;
    const png = await sharp(Buffer.from(await res.arrayBuffer())).resize(px, px).png().toBuffer();
    return { src: `data:image/png;base64,${png.toString("base64")}` };
  } catch (e) {
    console.error("chog image", id, e);
    return { err: "convert: " + String(e).slice(0, 120) };
  }
}
