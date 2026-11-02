import type { Metadata } from "next";

export const metadata: Metadata = { title: "About · StableFlow" };

const SECTIONS = [
  {
    heading: "What you’re looking at",
    body: "StableFlow reads public blockchains and shows what it finds: real USDC and USDT transfers on Ethereum and Base, and the current cost of a transfer on Ethereum, Base and Solana. Every transfer links to its transaction on a block explorer, so you can check it yourself.",
  },
  {
    heading: "Why the globe has no routes",
    body: "Blockchains don’t record where senders and recipients are, so drawing a transfer between two places would mean making the places up. The globe only marks the places you choose yourself.",
  },
  {
    heading: "How to read the numbers",
    body: "Each refresh samples a few recent blocks, so the totals are a snapshot and not a market total. They include exchange and contract movements, which means a transfer isn’t always a payment. Tokens are valued at $1. Fees are estimates for a typical transfer, based on current gas prices, block times and Chainlink prices.",
  },
  {
    heading: "Sending money",
    body: "The send calculator uses European Central Bank reference rates and current chain fees. The rate chart shows published ECB rates for the last 30 days. When shown, provider prices are indicative figures collected by Wise, which is also one of the listed providers, and each shows when it was priced. The calculator lists each country’s main payment rails without fees, because each bank sets its own. Pins mark the capital of the countries you choose.",
  },
  {
    heading: "When data is missing",
    body: "If a chain can’t be read, the page says so and shows nothing for it. No figure is ever estimated to fill the gap.",
  },
  {
    heading: "Map data",
    body: "Coastlines and borders come from Natural Earth, in the public domain, through the world-atlas project.",
  },
];

export default function AboutPage() {
  return (
    <main className="relative z-10 mx-auto min-h-dvh max-w-2xl px-5 pt-28 pb-20 lg:pl-[92px]">
      <h1 className="text-4xl font-medium tracking-tight">Stablecoin activity, as it is onchain.</h1>
      <div className="mt-12 space-y-10">
        {SECTIONS.map(({ heading, body }) => (
          <section key={heading}>
            <h2 className="text-base font-medium">{heading}</h2>
            <p className="mt-2 leading-7 text-ink-2">{body}</p>
          </section>
        ))}
      </div>
    </main>
  );
}
