// Decorative Turkish licence plate: 34 = Istanbul, RV = Ride & Vibe, 2026 = founded. Plate colours are fixed in both
// themes (it is an object, not UI). Straddles the hero's bottom edge; the route line starts right under it.
export function LicensePlate() {
  return (
    <div aria-hidden className="relative z-10 mx-auto -mt-8 w-full max-w-5xl px-5 md:-mt-10 md:px-8">
      <div className="flex h-16 w-75 max-w-full overflow-hidden rounded-lg border-[3px] border-[#111] bg-[#F6F6F2] text-[#111] shadow-[0_12px_30px_rgba(0,0,0,0.55)] md:h-19 md:w-90">
        <div className="flex w-8 items-end justify-center bg-[#1F4FB3] pb-1.5 text-xs font-bold text-white md:w-[38px] md:text-sm">
          TR
        </div>
        <div className="flex flex-1 items-center justify-center text-[min(2.5rem,10.25vw)] leading-none font-[650] tracking-[0.06em] whitespace-nowrap [font-stretch:88%] md:text-5xl">
          34 RV 2026
        </div>
      </div>
    </div>
  );
}
