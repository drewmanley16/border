import type { StablecoinTransaction } from "@/types/transaction";

/**
 * The app's only dependency on where transactions come from. A provider emits a
 * transaction when it is first seen, and emits it again under the same `id`
 * each time its status changes.
 */
export interface TransactionProvider {
  subscribe(callback: (transaction: StablecoinTransaction) => void): () => void;
}
