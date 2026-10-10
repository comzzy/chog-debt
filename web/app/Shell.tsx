"use client";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { useAccount, useWatchContractEvent } from "wagmi";
import { chogDebtAbi } from "@/lib/abi";
import { DEBT_ADDRESS, IS_CONFIGURED } from "@/lib/config";
import { isMuted, onMuteChange, play, setMuted } from "@/lib/sfx";

export function MuteToggle() {
  const [muted, set] = useState(true);
  useEffect(() => {
    set(isMuted());
    return onMuteChange(set);
  }, []);
  return (
    <button
      className="mute"
      aria-pressed={!muted}
      aria-label={muted ? "Turn sounds on" : "Turn sounds off"}
      title={muted ? "Sounds off" : "Sounds on"}
      onClick={() => {
        setMuted(!muted);
        if (muted) setTimeout(() => play("pop"), 0);
      }}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 9h4l5-4v14l-5-4H3z" fill="#111" />
        {muted ? (
          <path d="M16 9l6 6M22 9l-6 6" stroke="#111" strokeWidth="2.5" strokeLinecap="round" />
        ) : (
          <path d="M16 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" stroke="#111" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        )}
      </svg>
      <span>{muted ? "Sound off" : "Sound on"}</span>
    </button>
  );
}

/** Plays a little fanfare when any Chog earns a streak badge while you have the site open. */
function BadgeListener() {
  const { isConnected } = useAccount();
  useWatchContractEvent({
    address: DEBT_ADDRESS,
    abi: chogDebtAbi,
    eventName: "BadgeEarned",
    enabled: IS_CONFIGURED && isConnected,
    onLogs: () => play("fanfare"),
  });
  return null;
}

export function LogoMark({ size = 40 }: { size?: number }) {
  // a folded IOU note with a little heart seal
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden="true">
      <rect x="2" y="2" width="36" height="36" fill="#111" />
      <path d="M9 10h16l6 6v14H9z" fill="#D8FC8C" />
      <path d="M25 10v6h6" fill="#FFE08A" stroke="#111" strokeWidth="1.5" />
      <text x="11.5" y="23" fontSize="8" fontWeight="900" fontFamily="inherit" fill="#111">IOU</text>
      <path d="M20 31.5l-3.2-3a2 2 0 0 1 3.2-2.4 2 2 0 0 1 3.2 2.4z" fill="#FF80C8" stroke="#111" strokeWidth="1" />
    </svg>
  );
}

export function Logo() {
  return (
    <a href="/" className="logo" aria-label="ChogDebt home">
      <LogoMark />
      <span>
        Chog<b>Debt</b>
      </span>
    </a>
  );
}

export function Flower({ style, color = "#D8FC8C", size = 54 }: { style?: CSSProperties; color?: string; size?: number }) {
  const petals = [0, 72, 144, 216, 288];
  return (
    <svg className="flower" style={style} width={size} height={size} viewBox="0 0 60 60" aria-hidden="true">
      <g fill="none" stroke={color} strokeWidth="2.2">
        {petals.map((r) => (
          <ellipse key={r} cx="30" cy="16" rx="8" ry="11" transform={`rotate(${r} 30 30)`} />
        ))}
        <circle cx="30" cy="30" r="6" />
      </g>
    </svg>
  );
}

const FLOWERS: { top: string; left: string; size: number; color: string; d: number }[] = [
  { top: "6%", left: "6%", size: 52, color: "#D8FC8C", d: 0 },
  { top: "4%", left: "78%", size: 48, color: "#FFE08A", d: 1.2 },
  { top: "18%", left: "42%", size: 44, color: "#D8FC8C", d: 2.1 },
  { top: "70%", left: "82%", size: 50, color: "#D8FC8C", d: 0.6 },
  { top: "82%", left: "12%", size: 46, color: "#FFE08A", d: 1.7 },
  { top: "88%", left: "52%", size: 40, color: "#D8FC8C", d: 2.6 },
];

export function FlowerField() {
  return (
    <div className="flower-field" aria-hidden="true">
      {FLOWERS.map((f, i) => (
        <Flower key={i} size={f.size} color={f.color} style={{ top: f.top, left: f.left, animationDelay: `${f.d}s` }} />
      ))}
    </div>
  );
}

/** Fades/slides children in when they scroll into view. */
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <div ref={ref} className={`reveal ${shown ? "in" : ""} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}

const LINKS = [
  { href: "/", label: "My tab" },
  { href: "/market", label: "Debt market" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/feed", label: "Live feed" },
];

export function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <header className="topbar">
      <Logo />
      <button className={`menu-btn ${open ? "open" : ""}`} aria-label="Menu" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span />
        <span />
        <span />
      </button>
      <nav className={open ? "open" : ""}>
        {LINKS.map((l) => (
          <a key={l.href} href={l.href} className={path === l.href ? "here" : ""}>
            {l.label}
          </a>
        ))}
        <MuteToggle />
        <BadgeListener />
        <div className="nav-connect">
          <ConnectButton chainStatus="icon" showBalance={false} accountStatus="address" />
        </div>
      </nav>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="foot">
      <LogoMark size={28} />
      <span>Keep your word. Your Chog remembers.</span>
    </footer>
  );
}

export function PageHead({ title, sub, color = "lilac" }: { title: ReactNode; sub?: ReactNode; color?: string }) {
  return (
    <section className={`page-head bg-${color}`}>
      <FlowerField />
      <h1 className="enter">{title}</h1>
      {sub && <p className="enter d1">{sub}</p>}
    </section>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <>
      <Header />
      <main className="wrap">{children}</main>
      <Footer />
    </>
  );
}
