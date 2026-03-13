# ShadowPay

Private Bitcoin payments using ERC-5564 stealth addresses on Bitcoin testnet.

## What it does

Every payment generates a **one-time stealth address** derived from the recipient's published meta-address. Observers on-chain cannot link payments to recipients. Only the recipient can scan announcements and claim funds.

## Architecture

```
POST /api/disburse
  └─ generateStealthAddress()   ← ERC-5564 crypto engine (secp256k1)
  └─ prisma.disbursement.create ← status: PENDING
  └─ BitGo wallet.sendCoins()   ← broadcast to testnet
  └─ prisma.disbursement.update ← status: BROADCAST

POST /api/webhook               ← BitGo confirmation events
  └─ prisma.webhookEvent.create ← raw event log
  └─ prisma.disbursement.update ← status: CONFIRMED | FAILED
```

### Key modules

| Path | Purpose |
|---|---|
| `src/lib/stealth.ts` | Pure ERC-5564 crypto (keygen, stealth addr, view tag, key derivation) |
| `src/lib/bitgo.ts` | BitGo SDK singleton (testnet) |
| `src/services/disbursementService.ts` | Orchestrates disburse flow |
| `src/services/walletService.ts` | Recipient-side announcement scanning |
| `src/app/api/disburse/route.ts` | `POST /api/disburse` |
| `src/app/api/webhook/route.ts` | `POST /api/webhook` |
| `src/app/api/health/route.ts` | `GET /api/health` |

## Quick start

```bash
cd shadowpay
cp .env.local.example .env.local   # fill in your keys
npx prisma migrate dev --name init
npm run dev
```

## Environment variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Postgres connection string (Neon) |
| `BITGO_ACCESS_TOKEN` | BitGo API access token |
| `BITGO_WALLET_ID` | BitGo wallet ID (tbtc) |
| `BITGO_WALLET_PASSPHRASE` | BitGo wallet passphrase |

## API

### `POST /api/disburse`

```json
{
  "recipientMetaAddress": "st:eth:0x<spendPubKey><viewPubKey>",
  "recipientAlias": "alice",
  "amountSats": 10000
}
```

Response `201`:
```json
{
  "disbursementId": "uuid",
  "stealthAddress": "0x...",
  "txHash": "...",
  "announcement": { "schemeId": 1, "stealthAddress": "0x...", "ephemeralPubKey": "...", "viewTag": 42 }
}
```

### `POST /api/webhook`

Accepts BitGo transfer events (`transfer_confirmed`, `transfer_failed`). Updates disbursement status automatically.

### `GET /api/health`

```json
{ "status": "ShadowPay backend running" }
```

## Crypto engine

The stealth address implementation follows **ERC-5564 scheme 1** (secp256k1):

1. Sender picks a random ephemeral keypair
2. ECDH with recipient's view key → Keccak256 → view tag + tweak scalar
3. Stealth pub key = spend pub key + (tweak × G)
4. Recipient scans: ECDH check → view tag match → derive stealth private key

All crypto lives in `src/lib/stealth.ts` (zero blockchain I/O, fully unit-tested in the `crypto-algo` repo).

## Tech stack

- **Next.js 16** (App Router, API Routes)
- **Prisma 7** + **Neon Postgres**
- **BitGo SDK** (testnet BTC)
- **@noble/secp256k1 v3** + **@noble/hashes v2**
