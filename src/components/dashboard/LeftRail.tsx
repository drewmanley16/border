"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Send } from "lucide-react";
import { summarizeActivity } from "@/lib/liveData";
import { useAppStore } from "@/store/appStore";
import { useLiveStore } from "@/store/liveStore";
import { LINKS, Logo, Settings } from "./Navbar";
import { RailButton, RailLink } from "./Rail";

export function LeftRail() {
  const pathname = usePathname();
  const leftOpen = useAppStore((state) => state.leftOpen);
  const live = useLiveStore((state) => summarizeActivity(state.activity).isLive);

  return (
    <nav aria-label="Views" className="fixed inset-y-0 left-0 z-30 hidden w-[72px] flex-col items-center gap-1 border-r border-line bg-void py-3 lg:flex">
      <Link href="/" aria-label="StableFlow home" className="mb-3 grid size-9 place-items-center rounded-lg">
        <Logo />
      </Link>
      {LINKS.map(({ href, label, icon }) => (
        <div key={href} className="contents">
          <RailLink href={href} label={label} icon={icon} active={pathname === href} />
          {href === "/" && pathname === "/" ? (
            <RailButton label="Send" icon={Send} active={leftOpen} onClick={() => useAppStore.setState({ leftOpen: !leftOpen })} />
          ) : null}
        </div>
      ))}
      <div className="mt-auto flex flex-col items-center gap-3 pb-14">
        <span className={`flex flex-col items-center gap-1 text-[11px] ${live ? "text-green" : "text-ink-3"}`}>
          <span aria-hidden className={`size-1.5 rounded-full ${live ? "live-dot bg-green" : "bg-ink-3"}`} />
          {live ? "Live" : "No data"}
        </span>
        <Settings />
      </div>
    </nav>
  );
}
