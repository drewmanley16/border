"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown, ChevronUp, PanelLeftClose } from "lucide-react";
import { convert, COUNTRIES, countryFromLocale, findCountry, formatMoney, type Country } from "@/lib/countries";
import { fetchProviderQuotes, formatDelivery, midMarketRate, type ProviderQuote } from "@/lib/liveData";
import { formatAgo } from "@/lib/format";
import { faceGlobe, useAppStore } from "@/store/appStore";
import { ChainTable } from "./ChainTable";
import { RateChart } from "./RateChart";
import { IconButton, useSecondClock } from "@/components/ui/Primitives";
import { useLiveStore } from "@/store/liveStore";

const FIELD = "mt-1 w-full min-w-0 rounded-lg border border-line bg-void/60 px-2.5 py-2 text-sm text-ink placeholder:text-ink-3";

function CountryField({ id, label, dot, country, onPick }: { id: string; label: string; dot: string; country: Country; onPick: (country: Country) => void }) {
  const [text, setText] = useState<string | null>(null);
  const invalid = text !== null && text !== "" && !findCountry(text);
  return (
    <div>
      <label htmlFor={id} className="flex items-center gap-1.5 text-xs text-ink-2">
        <span aria-hidden className="size-2 rounded-full" style={{ backgroundColor: dot }} />
        {label}
      </label>
      <input
        id={id}
        list="stableflow-countries"
        autoComplete="off"
        value={text ?? country.name}
        onFocus={(event) => event.target.select()}
        onChange={(event) => {
          setText(event.target.value);
          const match = findCountry(event.target.value);
          if (match) onPick(match);
        }}
        onBlur={() => setText(null)}
        aria-invalid={invalid}
        className={FIELD}
      />
      {invalid ? <p className="mt-1 text-[11px] text-gold">Pick a country from the list.</p> : null}
    </div>
  );
}

function ProviderRow({ quote, best, currency, reference, sourceCurrency, selected, onPick }: { quote: ProviderQuote; best: boolean; currency: string; reference: number | null; sourceCurrency: string; selected: boolean; onPick: () => void }) {
  const now = useSecondClock();
  const cost = reference === null ? null : Math.max(0, reference - quote.received);
  return (
    <tr onClick={onPick} className={`cursor-pointer border-t border-line transition-colors hover:bg-white/8 ${selected ? "bg-cyan/15" : best ? "bg-white/5" : ""}`}>
      <td className="max-w-0 py-1.5 pr-2 pl-2">
        <span className="flex items-center gap-1.5 text-[13px]">
          <button type="button" aria-pressed={selected} className="truncate text-left">{quote.name}</button>
          {quote.type === "bank" ? <span className="text-[10px] text-ink-3">Bank</span> : null}
        </span>
        <span className="block truncate text-[10px] text-ink-3">
          {formatMoney(quote.fee, sourceCurrency)} fee{now === 0 ? "" : ` · ${formatAgo(new Date(quote.collectedAt).getTime(), now)}`}
        </span>
      </td>
      <td className="py-1.5 pr-2 text-right font-mono font-medium whitespace-nowrap">{formatMoney(quote.received, currency)}</td>
      <td className="py-1.5 pr-2 text-right font-mono whitespace-nowrap text-ink-2">{cost === null ? "—" : formatMoney(cost, currency)}</td>
      <td className="py-1.5 pr-2 text-right text-[11px] whitespace-nowrap text-ink-2">{formatDelivery(quote.deliveryHours) ?? "—"}</td>
    </tr>
  );
}

const PRESETS = [100, 1_000, 10_000];
const FILTERS = [
  { id: "all", label: "All", test: () => true },
  { id: "banks", label: "Banks", test: (quote: ProviderQuote) => quote.type === "bank" },
  { id: "providers", label: "Providers", test: (quote: ProviderQuote) => quote.type === "provider" },
  { id: "timed", label: "With time", test: (quote: ProviderQuote) => quote.deliveryHours !== null },
] as const;

type QuoteState = { key: string; quotes: ProviderQuote[] | null };

export function SendPanel() {
  const from = useAppStore((state) => state.from);
  const to = useAppStore((state) => state.to);
  const leftOpen = useAppStore((state) => state.leftOpen);
  const [amountText, setAmountText] = useState("1000");
  const [open, setOpen] = useState(false);
  const fx = useLiveStore((state) => state.fx);

  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");

  // A shared link wins, then the browser's region. Nothing here leaves the device.
  const linkRead = useRef(false);
  useEffect(() => {
    if (linkRead.current) return;
    linkRead.current = true;
    const query = new URLSearchParams(window.location.search);
    const sharedFrom = findCountry(query.get("from") ?? "");
    const sharedTo = findCountry(query.get("to") ?? "");
    const local = countryFromLocale(navigator.language);
    useAppStore.setState({
      ...(sharedFrom ?? local ? { from: sharedFrom ?? local } : {}),
      ...(sharedTo ? { to: sharedTo } : {}),
    });
    const sharedAmount = Number(query.get("amount"));
    if (sharedAmount > 0) queueMicrotask(() => setAmountText(String(sharedAmount)));
  }, []);

  useEffect(() => {
    const query = new URLSearchParams({ from: from.code, to: to.code, amount: amountText });
    window.history.replaceState(null, "", `?${query}`);
  }, [from, to, amountText]);

  useEffect(() => {
    // A selection describes one route, so it ends when the route changes.
    useAppStore.setState({ focus: null, pins: { from: { lat: from.lat, lng: from.lng }, to: { lat: to.lat, lng: to.lng } } });
  }, [from, to]);

  const focusId = useAppStore((state) => state.focus?.id ?? null);

  // The card quotes a price, which no longer applies once the amount changes.
  useEffect(() => {
    useAppStore.setState({ focus: null });
  }, [amountText]);

  const face = (country: Country) => faceGlobe(country);

  const amount = Number(amountText);
  const validAmount = amountText !== "" && Number.isFinite(amount) && amount > 0;

  const result = useMemo(() => {
    if (!fx || !validAmount) return null;
    const received = convert(amount, from.currency, to.currency, fx.rates);
    const rate = convert(1, from.currency, to.currency, fx.rates);
    return received === null || rate === null ? null : { received, rate };
  }, [fx, validAmount, amount, from, to]);

  // Keyed by request, so a list is never shown against a different amount or place.
  const quoteKey = validAmount ? `${from.code}:${to.code}:${amount}` : null;
  const [quoteState, setQuoteState] = useState<QuoteState | null>(null);

  useEffect(() => {
    if (quoteKey === null) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const request = { from: from.currency, to: to.currency, amount, fromCountry: from.code, toCountry: to.code };
      fetchProviderQuotes(request, controller.signal)
        .then((quotes) => setQuoteState({ key: quoteKey, quotes }))
        .catch(() => {
          if (!controller.signal.aborted) setQuoteState({ key: quoteKey, quotes: null });
        });
    }, 600);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [quoteKey, from, to, amount]);

  const current = quoteState?.key === quoteKey ? quoteState : null;
  const market = current?.quotes ? midMarketRate(current.quotes) : null;
  const marketValue = market !== null ? amount * market : (result?.received ?? null);

  const activeFilter = FILTERS.find(({ id }) => id === filter)!;
  const visible = (current?.quotes ?? []).filter((quote) => activeFilter.test(quote));

  const summary = result ? formatMoney(result.received, to.currency) : "No rate";

  return (
    <section
      aria-label="Send money calculator"
      className={`glass absolute z-10 flex flex-col !bg-void transition-[translate,visibility] duration-300 max-lg:inset-x-3 max-lg:bottom-[68px] max-lg:rounded-xl lg:inset-y-0 lg:left-[72px] lg:w-[360px] lg:rounded-none lg:border-y-0 lg:border-l-0 ${open ? "max-lg:top-16" : ""} ${leftOpen ? "" : "lg:invisible lg:-translate-x-full"}`}
    >
      <div className="flex shrink-0 items-center border-line lg:h-14 lg:border-b">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex min-w-0 flex-1 items-center justify-between gap-3 p-3 text-left lg:pointer-events-none"
        >
          <span className="text-sm font-medium lg:stat-label">Send money</span>
          <span className="flex min-w-0 items-center gap-2 lg:hidden">
            <span className="truncate text-sm tabular-nums text-ink-2">
              {validAmount ? `${formatMoney(amount, from.currency)} → ${summary}` : summary}
            </span>
            <ChevronUp aria-hidden className={`size-4 shrink-0 text-ink-2 transition-transform ${open ? "rotate-180" : ""}`} />
          </span>
        </button>
        <span className="mr-2 max-lg:hidden">
          <IconButton label="Collapse send money" onClick={() => useAppStore.setState({ leftOpen: false })}>
            <PanelLeftClose className="size-[18px]" />
          </IconButton>
        </span>
      </div>

      <div className={`min-h-0 flex-1 space-y-3 overflow-y-auto px-3 pb-3 lg:pt-3 ${open ? "" : "max-lg:hidden"}`}>
        <datalist id="stableflow-countries">
          {COUNTRIES.map((country) => <option key={country.code} value={country.name} />)}
        </datalist>
        <CountryField id="send-from" label="You’re in" dot="#38BDF8" country={from} onPick={(country) => { useAppStore.setState({ from: country }); face(country); }} />
        <button
          type="button"
          aria-label="Swap countries"
          title="Swap countries"
          onClick={() => useAppStore.setState({ from: to, to: from })}
          className="mx-auto -my-1.5 grid size-7 place-items-center rounded-full border border-line text-ink-2 transition-colors hover:text-ink"
        >
          <ArrowUpDown aria-hidden className="size-3.5" />
        </button>
        <CountryField id="send-to" label="Sending to" dot="#FBBF24" country={to} onPick={(country) => { useAppStore.setState({ to: country }); face(country); }} />
        <div>
          <label htmlFor="send-amount" className="text-xs text-ink-2">Amount in {from.currency}</label>
          <input id="send-amount" inputMode="decimal" value={amountText} onChange={(event) => setAmountText(event.target.value)} aria-invalid={!validAmount} className={`${FIELD} font-mono`} />
          <div className="mt-1.5 flex gap-1">
            {PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-pressed={amount === preset}
                onClick={() => setAmountText(String(preset))}
                className={`rounded-md px-2 py-0.5 font-mono text-[11px] transition-colors ${amount === preset ? "bg-white/10 text-ink" : "text-ink-2 hover:text-ink"}`}
              >
                {preset.toLocaleString("en-US")}
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg bg-white/6 p-3">
          {result ? (
            <>
              <p className="text-xs text-ink-2">Converts to, before fees</p>
              <p className="mt-0.5 font-mono text-2xl font-medium tracking-tight">{formatMoney(result.received, to.currency)}</p>
              <p className="mt-1 text-[11px] leading-4 text-ink-3">
                1 {from.currency} = {result.rate.toLocaleString("en-US", { maximumFractionDigits: 4 })} {to.currency}. ECB reference rate, {fx?.date}.
              </p>
            </>
          ) : (
            <p className="text-sm text-ink-2">{validAmount ? "No exchange rate available right now." : "Enter an amount above zero."}</p>
          )}
        </div>

        <RateChart from={from.currency} to={to.currency} />

        <div>
          <h3 className="stat-label">Provider prices</h3>
          {quoteKey === null ? null : !current ? (
            <p className="mt-1 text-[13px] text-ink-3">Checking provider prices.</p>
          ) : current.quotes === null ? (
            <p className="mt-1 text-[13px] text-ink-3">Provider prices aren’t available right now.</p>
          ) : current.quotes.length === 0 ? (
            <p className="mt-1 text-[13px] text-ink-3">No provider prices for this amount and destination.</p>
          ) : (
            <>
              <div role="group" aria-label="Filter providers" className="mt-1.5 flex gap-1">
                {FILTERS.map(({ id, label }) => (
                  <button
                    key={id}
                    type="button"
                    aria-pressed={filter === id}
                    onClick={() => setFilter(id)}
                    className={`rounded-md px-2 py-0.5 text-[11px] transition-colors ${filter === id ? "bg-white/10 text-ink" : "text-ink-2 hover:text-ink"}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <table className="mt-1.5 w-full table-fixed text-[12px]">
                <colgroup>
                  <col />
                  <col className="w-[84px]" />
                  <col className="w-[68px]" />
                  <col className="w-[56px]" />
                </colgroup>
                <thead className="text-[10px] tracking-wide text-ink-3 uppercase">
                  <tr>
                    <th scope="col" className="pb-1 pl-2 text-left font-medium">Provider</th>
                    <th scope="col" className="pr-2 pb-1 text-right font-medium">Gets</th>
                    <th scope="col" className="pr-2 pb-1 text-right font-medium">Cost</th>
                    <th scope="col" className="pr-2 pb-1 text-right font-medium">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((quote, index) => (
                    <ProviderRow
                      key={quote.name}
                      quote={quote}
                      best={index === 0}
                      currency={to.currency}
                      sourceCurrency={from.currency}
                      reference={marketValue}
                      selected={focusId === `provider:${quote.name}`}
                      onPick={() => {
                        const delivery = formatDelivery(quote.deliveryHours);
                        useAppStore.setState({
                          focus: {
                            id: `provider:${quote.name}`,
                            kind: "provider",
                            title: `${quote.name}: ${formatMoney(quote.received, to.currency)}`,
                            detail: `Example route, ${from.name} to ${to.name}${delivery ? `, ${delivery}` : ""}. Capitals shown. No payment is taking place.`,
                            color: "#38BDF8",
                          },
                        });
                        faceGlobe(from, to);
                      }}
                    />
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-[11px] leading-4 text-ink-3">
                Cost is the total lost to fees and rate, against {market === null ? "the ECB rate" : "the mid-market rate"}. “—” means no delivery time is published. Indicative prices collected by Wise, which is also listed here.
              </p>
            </>
          )}
        </div>


        <div>
          <h3 className="stat-label">Blockchain paths</h3>
          <ChainTable />
          <p className="mt-2 text-[11px] leading-4 text-ink-3">
            Onchain step only, so these can’t be ranked against the providers above. Buying and selling USDC isn’t priced yet.
          </p>
          <button
            type="button"
            onClick={() => useAppStore.setState({ rightOpen: true, rightTab: "paths" })}
            className="mt-1 text-[13px] text-cyan hover:underline max-lg:hidden"
          >
            See every step
          </button>
        </div>
      </div>
    </section>
  );
}
