import assert from "node:assert/strict";
import { mock, test } from "node:test";

test("the shared renderer returns PDF bytes with the requested paper", async () => {
  const { requestDocumentPdf } = await import("./document-pdf.ts");
  const fetchMock = mock.method(globalThis, "fetch", async (_url: string, request: RequestInit) => {
    assert.equal(_url, "/api/documents/pdf");
    assert.deepEqual(JSON.parse(request.body as string), { html: "<p>ทดสอบ</p>", paperSize: "A5", orientation: "landscape" });
    return new Response("%PDF-test", { headers: { "Content-Type": "application/pdf" } });
  });
  try {
    const pdf = await requestDocumentPdf("<p>ทดสอบ</p>", { paperSize: "A5", orientation: "landscape" });
    assert.equal(await pdf.text(), "%PDF-test");
  } finally { fetchMock.mock.restore(); }
});

test("does not silently export a document with a missing signature image", async () => {
  const { createHtmlPdf } = await import("./document-print.ts");
  const previousParser = Object.getOwnPropertyDescriptor(globalThis, "DOMParser");
  Object.defineProperty(globalThis, "DOMParser", { configurable: true, value: class {
    parseFromString() {
      return { querySelectorAll: () => [{
        removeAttribute() {}, getAttribute: () => "https://example.test/signature.png", loading: "lazy",
      }] };
    }
  } });
  const fetchMock = mock.method(globalThis, "fetch", async (url: string) => {
    assert.equal(url, "https://example.test/signature.png");
    return new Response("expired", { status: 403 });
  });
  try {
    await assert.rejects(createHtmlPdf("<p>test</p>", { filename: "test" }), /โหลดรูปประกอบเอกสารไม่สำเร็จ/);
    assert.equal(fetchMock.mock.callCount(), 1);
  } finally {
    fetchMock.mock.restore();
    if (previousParser) Object.defineProperty(globalThis, "DOMParser", previousParser);
    else Reflect.deleteProperty(globalThis, "DOMParser");
  }
});

test("rejects login HTML and preserves the PDF renderer's error", async () => {
  const { requestDocumentPdf } = await import("./document-pdf.ts");
  const fetchMock = mock.method(globalThis, "fetch", async () => new Response("login", { headers: { "Content-Type": "text/html" } }));
  try {
    await assert.rejects(requestDocumentPdf("test"), /ไม่ได้ส่งไฟล์ PDF/);
    fetchMock.mock.mockImplementation(async () => Response.json({ error: "กรุณาเข้าสู่ระบบ" }, { status: 401 }));
    await assert.rejects(requestDocumentPdf("test"), /กรุณาเข้าสู่ระบบ/);
  } finally { fetchMock.mock.restore(); }
});
