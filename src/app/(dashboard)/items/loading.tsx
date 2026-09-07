export default function ItemMasterLoading() {
  return (
    <div className="animate-pulse space-y-4" aria-label="กำลังโหลดข้อมูลสินค้า">
      <div className="flex items-center justify-between border-b border-outline-variant pb-4">
        <div className="space-y-2"><div className="h-7 w-52 rounded bg-surface-container"/><div className="h-4 w-80 max-w-[70vw] rounded bg-surface-container"/></div>
        <div className="h-10 w-32 rounded bg-surface-container"/>
      </div>
      <div className="flex gap-3"><div className="h-11 flex-1 rounded bg-surface-container"/><div className="h-11 w-48 rounded bg-surface-container"/></div>
      <div className="overflow-hidden rounded-[8px] border border-outline-variant">
        <div className="h-11 bg-surface-container"/>
        {Array.from({ length: 8 }, (_, index) => <div className="h-12 border-t border-outline-variant" key={index}/>) }
      </div>
    </div>
  );
}
