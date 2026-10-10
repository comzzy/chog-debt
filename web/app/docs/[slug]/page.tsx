import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DOCS } from "@/lib/docs";
import { DocArticle } from "../DocArticle";

export const dynamicParams = false;

export function generateStaticParams() {
  return DOCS.map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const d = DOCS.find((x) => x.slug === slug);
  return { title: d ? `${d.title} | ChogDebt docs` : "ChogDebt docs", description: d?.short };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = DOCS.find((d) => d.slug === slug);
  if (!doc) notFound();
  return <DocArticle doc={doc} />;
}
