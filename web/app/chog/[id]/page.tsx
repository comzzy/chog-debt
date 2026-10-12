import type { Metadata } from "next";
import ReportPage from "./ReportPage";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const title = `Chog #${id} credit report · ChogDebt`;
  const description = `Trust score, streak and IOU history for Chog #${id} on Monad.`;
  return { title, description, openGraph: { title, description }, twitter: { card: "summary_large_image", title, description } };
}

export default function Page() {
  return <ReportPage />;
}
