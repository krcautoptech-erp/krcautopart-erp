"use client";
export default function Error({ reset }: { reset: () => void }) {
  return <div className="space-y-3 py-8 text-center"><p role="alert">โหลดแผนส่งมอบไม่สำเร็จ</p><button className="rounded border border-outline-variant px-4 py-2" onClick={reset}>ลองใหม่</button></div>;
}
