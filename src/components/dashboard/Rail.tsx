import Link from "next/link";
import type { LucideIcon } from "lucide-react";

const ITEM = "flex w-16 flex-col items-center gap-1 rounded-lg py-1.5 text-[11px] transition-colors";
const state = (active: boolean) => (active ? "text-ink" : "text-ink-2 hover:text-ink");

function Icon({ icon: Glyph, active }: { icon: LucideIcon; active: boolean }) {
  return (
    <span className={`grid size-9 place-items-center rounded-lg transition-colors ${active ? "bg-white/10" : ""}`}>
      <Glyph aria-hidden className="size-5" />
    </span>
  );
}

export function RailLink({ href, label, icon, active }: { href: string; label: string; icon: LucideIcon; active: boolean }) {
  return (
    <Link href={href} aria-current={active ? "page" : undefined} className={`${ITEM} ${state(active)}`}>
      <Icon icon={icon} active={active} />
      {label}
    </Link>
  );
}

export function RailButton({ label, icon, active, onClick }: { label: string; icon: LucideIcon; active: boolean; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={active} onClick={onClick} className={`${ITEM} ${state(active)}`}>
      <Icon icon={icon} active={active} />
      {label}
    </button>
  );
}
