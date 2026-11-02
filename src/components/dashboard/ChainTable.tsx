"use client";

import { convert, formatSmallMoney } from "@/lib/countries";
import { faceGlobe, useAppStore } from "@/store/appStore";
import { useLiveStore } from "@/store/liveStore";

const NETWORKS = ["Ethereum", "Base", "Solana"] as const;
const CHAIN_COLORS: Record<(typeof NETWORKS)[number], string> = { Ethereum: "#A78BFA", Base: "#3B82F6", Solana: "#10B981" };

/** Each chain's onchain step, cheapest first. Picking one draws it on the globe. */
export function ChainTable() {
  const from = useAppStore((state) => state.from);
  const to = useAppStore((state) => state.to);
  const focusId = useAppStore((state) => state.focus?.id ?? null);
  const conditions = useLiveStore((state) => state.conditions);
  const fx = useLiveStore((state) => state.fx);

  const chains = NETWORKS.map((network) => {
    const row = conditions.find((candidate) => candidate.network === network);
    const usd = row?.feeUSD ? Number(row.feeUSD) : null;
    return { network, usd, seconds: row?.estimatedDurationSeconds ?? null, local: usd !== null && fx ? convert(usd, "USD", to.currency, fx.rates) : null };
  }).sort((a, b) => (a.usd ?? Infinity) - (b.usd ?? Infinity));

  return (
    <table className="mt-1.5 w-full text-[12px]">
      <thead className="text-[10px] tracking-wide text-ink-3 uppercase">
        <tr>
          <th scope="col" className="pb-1 pl-2 text-left font-medium">Chain</th>
          <th scope="col" className="pr-2 pb-1 text-right font-medium">Fee</th>
          <th scope="col" className="pr-2 pb-1 text-right font-medium">Time</th>
        </tr>
      </thead>
      <tbody>
        {chains.map((chain, index) => {
          const id = `chain:${chain.network}`;
          const pick = () => {
            useAppStore.setState({
              focus: {
                id,
                kind: "chain",
                title: `USDC on ${chain.network}`,
                detail: `Example path, ${from.name} to ${to.name}. Capitals shown. Chains have no location, so this isn’t where the network runs.`,
                color: CHAIN_COLORS[chain.network],
              },
            });
            faceGlobe(from, to);
          };
          return (
            <tr
              key={chain.network}
              onClick={pick}
              className={`cursor-pointer border-t border-line transition-colors hover:bg-white/8 ${focusId === id ? "bg-cyan/15" : index === 0 && chain.usd !== null ? "bg-white/5" : ""}`}
            >
              <td className="py-1.5 pl-2 text-[13px]">
                <button type="button" aria-pressed={focusId === id} className="flex items-center gap-2">
                  <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: CHAIN_COLORS[chain.network] }} />
                  {chain.network}
                </button>
              </td>
              <td className="py-1.5 pr-2 text-right font-mono">{chain.local !== null ? formatSmallMoney(chain.local, to.currency) : "—"}</td>
              <td className="py-1.5 pr-2 text-right font-mono text-ink-2">{chain.seconds !== null ? `${chain.seconds}s` : "—"}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
