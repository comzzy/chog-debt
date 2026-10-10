"use client";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import type { ReactNode } from "react";

export function Shell({ children }: { children: ReactNode }) {
  return (
    <main>
      <header>
        <a href="/" className="logo" style={{ color: "inherit", textDecoration: "none" }}>
          Chog<span>Debt</span>
        </a>
        <nav className="hint">
          <a href="/">Home</a> · <a href="/market">Debt market</a> · <a href="/leaderboard">Leaderboard</a> · <a href="/feed">Live feed</a>
        </nav>
        <ConnectButton chainStatus="icon" showBalance={false} />
      </header>
      {children}
      <footer>Built for Chogathon 2026 · Monad · keep your word, Chog.</footer>
    </main>
  );
}
