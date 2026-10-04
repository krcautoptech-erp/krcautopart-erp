export default function DashboardRouteLoading() {
  return (
    <section
      aria-label="กำลังเปิดหน้า"
      aria-live="polite"
      className="animate-pulse space-y-4"
    >
      <div className="flex min-h-16 items-center justify-between border-b border-outline-variant pb-4">
        <div className="space-y-2">
          <div className="h-7 w-56 max-w-[68vw] rounded bg-surface-container" />
          <div className="h-4 w-80 max-w-[78vw] rounded bg-surface-container-low" />
        </div>
        <div className="hidden h-10 w-32 rounded bg-surface-container sm:block" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="h-24 rounded-[6px] border border-outline-variant bg-surface-container-low" key={index} />
        ))}
      </div>
      <div className="overflow-hidden rounded-[6px] border border-outline-variant bg-surface-container-lowest">
        <div className="h-12 border-b border-outline-variant bg-surface-container-low" />
        {Array.from({ length: 7 }, (_, index) => (
          <div className="h-12 border-b border-outline-variant last:border-b-0" key={index} />
        ))}
      </div>
    </section>
  );
}
