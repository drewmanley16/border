import type { StablecoinTransaction } from "@/types/transaction";
import type { TransactionProvider } from "./types";

/**
 * Where verified data would plug in. Candidates include Solana RPC
 * subscriptions, Helius, Alchemy, Circle APIs and licensed payment partners.
 *
 * Two rules for any implementation:
 *
 * - A raw onchain transfer is not an international payment. Wallets carry no
 *   location, so an origin or destination may only come from an authorized,
 *   reliable source such as a licensed payments partner. Never infer it.
 * - Emit only aggregate, city-level geography, and never expose payer identity
 *   or other private payment details to the browser.
 *
 * Nothing in the UI depends on this class yet, and it never fabricates events.
 */
export class RealTransactionProvider implements TransactionProvider {
  subscribe(callback: (transaction: StablecoinTransaction) => void): () => void {
    void callback;
    throw new Error(
      "RealTransactionProvider has no data source. Connect a verified feed before using it.",
    );
  }
}
