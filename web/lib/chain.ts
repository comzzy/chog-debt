// Chain and contract addresses, safe to import on the server.
import { defineChain, type Address } from "viem";

export const monadMainnet = defineChain({
  id: 143,
  name: "Monad",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "MonadVision", url: "https://monadvision.com" } },
});

export const monadTestnet = defineChain({
  id: 10143,
  name: "Monad Testnet",
  nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://testnet-rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "MonadVision", url: "https://testnet.monadvision.com" } },
  testnet: true,
});

const chainId = Number(process.env.NEXT_PUBLIC_CHAIN_ID ?? 143);
const base = chainId === 10143 ? monadTestnet : monadMainnet;
const rpc = process.env.NEXT_PUBLIC_RPC_URL;

export const chain = rpc ? { ...base, rpcUrls: { default: { http: [rpc] } } } : base;

const zero = "0x0000000000000000000000000000000000000000" as Address;
export const DEBT_ADDRESS = (process.env.NEXT_PUBLIC_CHOG_DEBT_ADDRESS || zero) as Address;
// Chog Genesis on Monad mainnet (from mint.chog.xyz)
export const CHOG_NFT = (process.env.NEXT_PUBLIC_CHOG_NFT_ADDRESS || "0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763") as Address;
export const CHOG_TOKEN = (process.env.NEXT_PUBLIC_CHOG_TOKEN_ADDRESS || "0x350035555E10d9AfAF1566AaebfCeD5BA6C27777") as Address;
export const IS_CONFIGURED = DEBT_ADDRESS !== zero;
