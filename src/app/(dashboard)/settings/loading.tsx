export default function SettingsLoading() {
  return (
    <section aria-label="กำลังโหลดหน้าตั้งค่า" aria-live="polite" className="animate-pulse">
      <div className="flex items-start justify-between border-b border-outline-variant pb-4">
        <div className="space-y-2">
          <div className="h-7 w-44 bg-surface-container-high" />
          <div className="h-4 w-72 max-w-[60vw] bg-surface-container-low" />
        </div>
        <div className="h-9 w-28 bg-surface-container-high" />
      </div>
      <div className="mt-4 h-10 w-full border border-outline-variant bg-surface-container-low" />
      <div className="mt-3 overflow-hidden border border-outline-variant">
        <div className="h-10 border-b border-outline-variant bg-surface-container-high" />
        {[0, 1, 2, 3, 4].map((row) => (
          <div className="h-12 border-b border-outline-variant bg-surface-container-lowest last:border-b-0" key={row} />
        ))}
      </div>
    </section>
  );
}
