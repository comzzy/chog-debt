import { ImageResponse } from "next/og";
import { chogImagePng, readReport } from "@/lib/report";

export const runtime = "nodejs";
export const revalidate = 300;
export const maxDuration = 30;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Chog credit report on ChogDebt";

async function font(weight: number) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=Poppins:wght@${weight}`, { next: { revalidate: 86400 } })).text();
    const url = css.match(/src: url\((.+?)\) format\('(opentype|truetype)'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : undefined;
  } catch {
    return undefined;
  }
}

const INK = "#111";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const valid = /^\d{1,6}$/.test(raw);
  const id = valid ? BigInt(raw) : 0n;
  const [r, pic, f9, f7] = await Promise.all([
    valid ? readReport(id).catch(() => null) : null,
    valid ? chogImagePng(id, 380) : Promise.resolve<{ src?: string; err?: string }>({ err: "invalid id" }),
    font(900),
    font(700),
  ]);
  const fonts = [f9 && { name: "Poppins", data: f9, weight: 900 as const }, f7 && { name: "Poppins", data: f7, weight: 700 as const }].filter(Boolean) as { name: string; data: ArrayBuffer; weight: 900 | 700 }[];
  const img = pic.src;
  const score = r?.score ?? 50;
  const box = (bg: string) => ({ display: "flex", background: bg, border: `5px solid ${INK}` });
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#F1CCFF", fontFamily: "Poppins", color: INK, padding: 44 }}>
        <div style={{ ...box("#E59CFF"), flex: 1, boxShadow: `12px 12px 0 ${INK}`, padding: 40, gap: 44, alignItems: "center" }}>
          <div style={{ display: "flex", position: "relative", width: 380, height: 380 }}>
            <div style={{ ...box("#F9E8FF"), width: 380, height: 380, boxShadow: `8px 8px 0 ${INK}`, alignItems: "center", justifyContent: "center", fontSize: 120 }}>
              {img ? <img src={img} width={370} height={370} alt="" /> : "🐾"}
            </div>
            {r?.deadbeat && (
              <div style={{ position: "absolute", left: 30, top: 150, display: "flex", padding: "6px 18px", background: "#fff", border: "7px solid #E8173F", color: "#E8173F", fontSize: 52, fontWeight: 900, letterSpacing: 4, transform: "rotate(-14deg)" }}>DEADBEAT</div>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ display: "flex", fontSize: 30, fontWeight: 700 }}>Credit report</div>
            <div style={{ display: "flex", fontSize: 88, fontWeight: 900, color: "#fff", textShadow: `5px 5px 0 ${INK}`, lineHeight: 1.05 }}>Chog #{valid ? raw : "?"}</div>
            <div style={{ ...box(r?.deadbeat ? "#FFAEDB" : score >= 75 ? "#D8FC8C" : "#FFE08A"), marginTop: 22, padding: "10px 22px", alignItems: "baseline", alignSelf: "flex-start", boxShadow: `6px 6px 0 ${INK}` }}>
              <span style={{ fontSize: 84, fontWeight: 900, lineHeight: 1 }}>{score}</span>
              <span style={{ fontSize: 30, fontWeight: 700, marginLeft: 8 }}>/100 trust</span>
            </div>
            <div style={{ display: "flex", gap: 14, marginTop: 26, fontSize: 25, fontWeight: 700 }}>
              <div style={{ ...box("#D8FC8C"), borderWidth: 4, padding: "6px 14px" }}>Streak {r?.streak ?? 0} · best {r?.best ?? 0}</div>
              <div style={{ ...box("#fff"), borderWidth: 4, padding: "6px 14px" }}>{r?.repaid ?? 0} repaid</div>
              <div style={{ ...box("#fff"), borderWidth: 4, padding: "6px 14px" }}>{r?.defaulted ?? 0} defaulted</div>
            </div>
            <div style={{ display: "flex", marginTop: 30, fontSize: 26, fontWeight: 900 }}>
              <span style={{ background: "#D8FC8C", padding: "0 8px", border: `3px solid ${INK}` }}>ChogDebt</span>
              <span style={{ marginLeft: 12, fontWeight: 700 }}>chog-debt.vercel.app/chog/{valid ? raw : ""}</span>
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts: fonts.length ? fonts : undefined, headers: { "x-chog-image": img ? "ok" : (pic.err ?? "").replace(/[^\x20-\x7e]/g, "") || "none" } },
  );
}
