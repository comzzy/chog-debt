import type { Metadata } from "next";
import { DocsShell } from "./DocsShell";

export const metadata: Metadata = {
  title: "Docs | ChogDebt",
  description: "How ChogDebt works: IOUs between Chog NFTs, trust scores, deadbeat marks, the debt market, guarantors and streak badges.",
};

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  return <DocsShell>{children}</DocsShell>;
}
