"use client";

import { latLngToUnit } from "@/lib/geo";
import { useAppStore, type GlobePin } from "@/store/appStore";

function Pin({ pin, color, active }: { pin: GlobePin; color: string; active: boolean }) {
  const position = latLngToUnit(pin.lat, pin.lng).map((value) => value * 1.012) as [number, number, number];
  return (
    <mesh position={position}>
      <sphereGeometry args={[active ? 0.028 : 0.016, 16, 16]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

/** Marks only the places the viewer entered. */
export function GlobePins() {
  const pins = useAppStore((state) => state.pins);
  const rail = useAppStore((state) => (state.focus?.kind === "rail" ? state.focus.id : null));
  return (
    <>
      {pins.from ? <Pin pin={pins.from} color="#38BDF8" active={rail?.startsWith("from:") ?? false} /> : null}
      {pins.to ? <Pin pin={pins.to} color="#FBBF24" active={rail?.startsWith("to:") ?? false} /> : null}
    </>
  );
}
