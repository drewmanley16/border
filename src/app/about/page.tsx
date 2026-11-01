import type { Metadata } from "next";

export const metadata: Metadata = { title: "About · StableFlow" };

const SECTIONS = [
  {
    heading: "What you’re looking at",
    body: "StableFlow draws stablecoin transfers as shooting stars between world cities. Each star is one simulated payment. Its color is the stablecoin, its size follows the amount, and its speed follows the settlement time of the chain it uses.",
  },
  {
    heading: "Nothing here is a real payment",
    body: "Every transaction is generated in your browser by a seeded simulator. Corridors, amounts and coin mix are modeled to look plausible, but they aren’t measurements of real traffic. Public blockchains don’t record where senders and recipients are, so a raw onchain transfer can’t be placed on a map or called an international payment.",
  },
  {
    heading: "Reproducing a session",
    body: "The same seed produces the same sequence of transactions. Set one in Settings, or add ?seed=42 to the address.",
  },
  {
    heading: "Connecting real data",
    body: "The app reads transactions through a small provider interface, so a verified feed can replace the simulator. Geography would need to come from an authorized source, such as a licensed payments partner, and private payment details would stay out of the browser.",
  },
  {
    heading: "Map data",
    body: "Coastlines and borders come from Natural Earth, in the public domain, through the world-atlas project.",
  },
];

export default function AboutPage() {
  return (
    <main className="relative z-10 mx-auto min-h-dvh max-w-2xl px-5 pt-28 pb-20">
      <h1 className="text-4xl font-medium tracking-tight">Watch money move at internet speed.</h1>
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
