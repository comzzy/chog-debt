# Chog Debt

Chog Debt is a little app where Chog holders keep a tab on each other. When I help you out, my Chog writes you an IOU. You accept it, and now your Chog owes mine a favour. When I need it back I call it in, and you get a deadline. Pay up and your Chog's trust score goes up. Don't, and anyone can stamp your Chog as a deadbeat, in public, onchain.

The important bit: the debt and the reputation are stored against the Chog's token ID, not your wallet. The Chog is the credit score. If you sell a Chog with a deadbeat mark, the buyer gets the mark. If you buy a Chog that's owed three favours, you get to call them in.

I built it for Chogathon 2026 on Monad.

## How it works

1. **Write an IOU.** From your Chog to another Chog's token ID, with a short note ("reviewed your PR at 3am"). You can also ask for some $CHOG as collateral.
2. **They accept it** (or reject it). If there's $CHOG on it, it's locked in the contract when they accept.
3. **Call it in** whenever you want. You pick a deadline between 1 hour and 30 days.
4. **They repay**, which just means they say "done". Any locked $CHOG goes to whoever holds the creditor Chog right now.
5. **Or they don't.** Once the deadline passes, anyone can mark it defaulted. The debtor Chog gets the DEADBEAT stamp and the creditor gets the collateral.

Paying back three debts after a default washes off the stamp. The default itself stays in the history.

### Trust score

Every Chog starts at 50 and it's clamped to 0-100:

- +8 for each debt repaid, +2 more if it was repaid after being called in
- +3 for each favour you gave that got accepted
- -25 for each default, and -10 while the deadbeat stamp is on

The app also hands out badges like "Good for it", "Helpful Chog", "Pays under pressure" and "Redeemed".

### Rules the contract enforces

- Only the wallet that currently owns a Chog (`ownerOf`) can act for it.
- No IOUs to yourself: you can't use the same Chog, or another Chog in the same wallet. That stops the easiest way to farm trust.
- Memos are 1-140 characters.
- The owner can pause new IOUs, accepts and call-ins. Repay and default still work while paused, so nobody gets stuck. Ownership moves in two steps (`transferOwnership`, then `acceptOwnership`).

## Addresses (Monad mainnet, chain 143)

- Chog Genesis NFT (ERC-721, 1969 supply): `0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763`. I took this from mint.chog.xyz and checked it onchain.
- $CHOG token: `0x350035555E10d9AfAF1566AaebfCeD5BA6C27777`
- ChogDebt: not deployed yet

Monad RPCs: mainnet `https://rpc.monad.xyz` (chain 143), testnet `https://testnet-rpc.monad.xyz` (chain 10143).

## Repo layout

```
contracts/   Foundry project (ChogDebt.sol, tests, deploy script)
web/         Next.js + wagmi + RainbowKit app
```

## Contracts

You need [Foundry](https://getfoundry.sh).

```sh
cd contracts
forge build
forge test -vv
```

The tests use a mock ERC-721 and a mock ERC-20. They cover the whole lifecycle, the permission checks, collateral payouts, the deadbeat and redemption logic, and debts following the NFT when it's transferred.

## Web app

```sh
cd web
cp .env.example .env.local   # then fill in NEXT_PUBLIC_CHOG_DEBT_ADDRESS
npm install
npm run dev                  # or: npm run build && npm start
```

Settings:

| var | what |
| --- | --- |
| `NEXT_PUBLIC_CHAIN_ID` | `143` mainnet or `10143` testnet |
| `NEXT_PUBLIC_RPC_URL` | optional RPC override |
| `NEXT_PUBLIC_CHOG_DEBT_ADDRESS` | the deployed ChogDebt contract |
| `NEXT_PUBLIC_CHOG_NFT_ADDRESS` | Chog NFT (defaults to Chog Genesis) |
| `NEXT_PUBLIC_CHOG_TOKEN_ADDRESS` | $CHOG (defaults to mainnet $CHOG) |
| `NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID` | from cloud.reown.com, needed for mobile wallets |

The Chog contract can't list the tokens in a wallet, so the app asks you which token IDs are yours, then checks `ownerOf` before it lets you use one.

## Deploying

The deploy script reads `CHOG_NFT` and `CHOG_TOKEN` (optional) from the environment. It doesn't read a private key itself. Foundry signs with whatever account you pass on the command line.

The deployer wallet is `0x147D1285EdE460617E9CB9AA849E2290f1917c33`. Its key sits outside this repo, in a `cast wallet new --json` file (`.data[0].private_key`). Don't paste it anywhere. Import it once into Foundry's encrypted keystore, which asks you for a password:

```sh
cast wallet import chogdebt-deployer \
  --private-key "$(jq -r '.data[0].private_key' /home/box/secrets/chogdebt-deployer.json)"
```

Then fund the address with some MON and deploy (try testnet first):

```sh
cd contracts
export CHOG_NFT=0xc96d31F8626c6D03Fae5dCD3d61e3FB9F4a73763
export CHOG_TOKEN=0x350035555E10d9AfAF1566AaebfCeD5BA6C27777
forge script script/Deploy.s.sol --rpc-url https://testnet-rpc.monad.xyz \
  --account chogdebt-deployer --sender 0x147D1285EdE460617E9CB9AA849E2290f1917c33 --broadcast
```

Real Chogs only exist on mainnet. On testnet you'll need to deploy a test ERC-721 (and ERC-20) and point `CHOG_NFT` / `CHOG_TOKEN` at those.

## Licence

MIT
