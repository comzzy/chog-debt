import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";

export const metadata: Metadata = {
  metadataBase: new URL("https://chog-debt.vercel.app"),
  title: "ChogDebt: favours between Chogs",
  description: "Write favours as IOUs between Chog NFTs. Trust scores, deadbeat marks and a debt market on Monad.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
