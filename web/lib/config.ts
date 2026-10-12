import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { chain } from "./chain";

export * from "./chain";

export const wagmiConfig = getDefaultConfig({
  appName: "Chog Debt",
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || "chog-debt-local",
  chains: [chain],
  ssr: true,
});
