"use client";
import dynamic from "next/dynamic";
const App = dynamic(() => import("./FeedApp"), { ssr: false });
export default function Page() {
  return <App />;
}
