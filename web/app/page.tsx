"use client";
import dynamic from "next/dynamic";
const App = dynamic(() => import("./ChogApp"), { ssr: false });
export default function Page() {
  return <App />;
}
