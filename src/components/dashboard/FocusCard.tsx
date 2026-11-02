"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useAppStore } from "@/store/appStore";
import { IconButton } from "@/components/ui/Primitives";

/** Says what the globe is showing, so a drawn route can't pass for a real payment. */
export function FocusCard() {
  const focus = useAppStore((state) => state.focus);

  useEffect(() => {
    if (!focus) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") useAppStore.setState({ focus: null });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focus]);

  if (!focus) return null;
  return (
    <section
      aria-label="Shown on the globe"
      aria-live="polite"
      className="glass absolute z-[5] flex items-center gap-3 rounded-xl !bg-void/90 py-2 pr-1.5 pl-3 max-lg:inset-x-3 max-lg:bottom-[132px] lg:bottom-5 lg:left-[calc((100vw+var(--left-inset)-var(--right-inset))/2)] lg:w-[min(420px,calc(100vw-var(--left-inset)-var(--right-inset)-2rem))] lg:-translate-x-1/2"
    >
      <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: focus.color }} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{focus.title}</p>
        <p className="text-[11px] leading-4 text-ink-2">{focus.detail}</p>
      </div>
      <IconButton label="Clear globe selection" onClick={() => useAppStore.setState({ focus: null })}>
        <X className="size-4" />
      </IconButton>
    </section>
  );
}
