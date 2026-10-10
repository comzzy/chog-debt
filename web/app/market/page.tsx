"use client";
import dynamic from "next/dynamic";
const App = dynamic(() => import("./MarketApp"), { ssr: false });
export default function Page() {
  return <App />;
}
