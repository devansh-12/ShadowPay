import { BitGoAPI } from "@bitgo/sdk-api";
import { env } from "@/config/env";
import { logger } from "@/lib/logger";

let _bitgo: BitGoAPI | null = null;

function getBitGoClient(): BitGoAPI {
  if (!_bitgo) {
    _bitgo = new BitGoAPI({
      accessToken: env.BITGO_ACCESS_TOKEN,
      env: "test", // Bitcoin testnet
    });
    logger.info("[BitGo] client initialised (testnet)");
  }
  return _bitgo;
}

/**
 * Returns the configured BitGo wallet. Cached after first resolution.
 */
export async function getBitGoWallet() {
  const client = getBitGoClient();
  const wallet = await client
    .coin("tbtc")
    .wallets()
    .get({ id: env.BITGO_WALLET_ID });
  return wallet;
}
