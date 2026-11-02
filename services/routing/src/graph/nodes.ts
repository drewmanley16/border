import type { EdgeKind } from "../domain/types.js";

export type NodeKind = "funding" | "fiat" | "sender" | "recipient" | "payout";

/**
 * Node ids describe where value sits. Fiat is scoped to the venue holding it,
 * since dollars at one provider can't reach another without a real transfer.
 * Onchain balances aren't venue-scoped, which is what lets providers hand off.
 */
export const node = {
  funding: (method: string, currency: string, country: string) => `funding:${method}:${currency}:${country}`,
  fiat: (currency: string, venue: string) => `fiat:${currency}@${venue}`,
  sender: (stablecoin: string, network: string) => `sender:${stablecoin}:${network}`,
  recipient: (stablecoin: string, network: string) => `recipient:${stablecoin}:${network}`,
  payout: (method: string, currency: string, country: string) => `payout:${method}:${currency}:${country}`,
};

export function nodeKind(id: string): NodeKind {
  const kind = id.slice(0, id.indexOf(":"));
  if (kind === "funding" || kind === "fiat" || kind === "sender" || kind === "recipient" || kind === "payout") {
    return kind;
  }
  throw new Error(`Malformed node id: ${id}`);
}

/** The only transitions money can make. Anything else is a modeling error. */
export const VALID_TRANSITIONS: Readonly<Record<EdgeKind, readonly [NodeKind, NodeKind]>> = {
  funding: ["funding", "fiat"],
  fx: ["fiat", "fiat"],
  onramp: ["fiat", "sender"],
  bridge: ["sender", "sender"],
  transfer: ["sender", "recipient"],
  offramp: ["recipient", "fiat"],
  payout: ["fiat", "payout"],
};
