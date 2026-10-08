"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSessionMemoryUser } from "@/components/session-memory-context";
import { parseFormDraft, readSessionMemory, sessionMemoryKey, writeSessionMemory } from "@/lib/session-memory";

function DraftRecoveryPrompt({ onRestore, onDiscard }: { onRestore: () => Promise<void>; onDiscard: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const dialog = dialogRef.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return <dialog ref={dialogRef} aria-labelledby="draft-recovery-title" onCancel={(event) => event.preventDefault()} className="m-auto w-[calc(100%-2rem)] max-w-md rounded-lg border border-outline-variant bg-surface-container-lowest p-5 text-on-surface shadow-xl backdrop:bg-black/50">
    <h2 id="draft-recovery-title" className="text-lg font-bold">พบงานที่กรอกค้างไว้</h2>
    <p className="mt-2 text-sm">ต้องการทำต่อจากฉบับร่างในแท็บนี้ หรือทิ้งร่างแล้วเริ่มจากข้อมูลล่าสุด?</p>
    {error ? <p role="alert" className="mt-3 text-sm text-red-600">{error}</p> : null}
    <div className="mt-5 flex justify-end gap-2">
      <button type="button" disabled={busy} onClick={onDiscard} className="rounded border border-outline-variant px-4 py-2 text-sm disabled:opacity-50">ทิ้งฉบับร่าง</button>
      <button type="button" autoFocus disabled={busy} onClick={async () => {
        setBusy(true);
        setError("");
        try { await onRestore(); } catch (failure) { setError(failure instanceof Error ? failure.message : "ไม่สามารถคืนฉบับร่างได้"); }
        finally { setBusy(false); }
      }} className="rounded bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50">{busy ? "กำลังตรวจฉบับร่าง…" : "ทำต่อจากฉบับร่าง"}</button>
    </div>
  </dialog>;
}

export function useFormDraft<T>({ key, value, initialValue, onRestore, enabled = true, revision = "" }: {
  key: string;
  value: T;
  initialValue: T;
  onRestore: (value: T) => void | Promise<void>;
  enabled?: boolean;
  revision?: string;
}): { draftPrompt: ReactNode; clearDraft: () => void; hasChanges: boolean } {
  const userId = useSessionMemoryUser();
  const storageKey = sessionMemoryKey(userId ?? "", "draft", key);
  const serialized = JSON.stringify(value);
  const initialSerialized = JSON.stringify(initialValue);
  const [baseline, setBaseline] = useState(initialSerialized);
  const [candidate, setCandidate] = useState<T | null>(null);
  const identity = JSON.stringify([storageKey, revision, initialSerialized]);
  const [loadedIdentity, setLoadedIdentity] = useState("");
  const [storageError, setStorageError] = useState("");
  useEffect(() => {
    if (!userId || !enabled) return;
    const raw = readSessionMemory(storageKey);
    const draft = parseFormDraft(raw, JSON.parse(initialSerialized) as T, revision);
    // Load once for this document; never overwrite recovery data before the user chooses.
    // Hydrate browser storage after SSR; initial form data is the recovery baseline.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCandidate(draft);
    setBaseline(initialSerialized);
    setLoadedIdentity(identity);
    if (raw && !draft) {
      writeSessionMemory(storageKey, null);
      setStorageError("ฉบับร่างเดิมใช้ต่อไม่ได้ เนื่องจากข้อมูลเอกสารเปลี่ยนหรือฉบับร่างไม่สมบูรณ์");
    }
  }, [enabled, identity, initialSerialized, revision, storageKey, userId]);
  const hasChanges = enabled && loadedIdentity === identity && serialized !== baseline;
  useEffect(() => {
    if (!userId || !enabled || loadedIdentity !== identity || candidate !== null) return;
    const success = writeSessionMemory(storageKey, serialized === baseline ? null : JSON.stringify({ revision, value: JSON.parse(serialized) }));
    // Report storage failures instead of claiming that work was saved.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!success) setStorageError("ไม่สามารถเก็บฉบับร่างในแท็บนี้ได้ กรุณาบันทึกเอกสารก่อนออกจากหน้า");
  }, [baseline, candidate, enabled, identity, loadedIdentity, revision, serialized, storageKey, userId]);
  const clearDraft = () => {
    if (userId) writeSessionMemory(storageKey, null);
    setBaseline(serialized);
    setCandidate(null);
    setStorageError("");
  };
  const draftPrompt = enabled && loadedIdentity === identity && candidate !== null
    ? <DraftRecoveryPrompt onDiscard={() => { writeSessionMemory(storageKey, null); setCandidate(null); }} onRestore={async () => { await onRestore(candidate); setCandidate(null); }} />
    : storageError ? <p role="alert" className="border-b border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{storageError}</p>
    : hasChanges ? <p role="status" className="border-b border-outline-variant px-3 py-2 text-xs text-secondary">เก็บงานที่กรอกไว้ในแท็บนี้แล้ว ยังไม่ได้บันทึกเป็นเอกสาร</p> : null;
  return { draftPrompt, clearDraft, hasChanges };
}
