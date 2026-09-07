from pathlib import Path
from pypdf import PdfReader


def main() -> None:
    base = Path(r"C:\Users\Riew\Desktop\Job_NBV\KRC\krc-erp\docs")
    for pdf_path in sorted(base.glob("img20260615_*.pdf")):
        reader = PdfReader(str(pdf_path))
        page_texts = []
        for page in reader.pages:
            page_texts.append((page.extract_text() or "").replace("\n", " ").strip())
        combined = " ".join(part for part in page_texts if part)
        sample = combined[:240]
        image_counts = []
        for page in reader.pages:
            count = len(list(page.images))
            image_counts.append(str(count))
        print(
            f"{pdf_path.name}\tpages={len(reader.pages)}\tchars={len(combined)}"
            f"\timages={','.join(image_counts)}\tsample={sample!r}"
        )


if __name__ == "__main__":
    main()
