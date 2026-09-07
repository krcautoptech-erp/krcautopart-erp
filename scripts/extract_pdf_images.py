from pathlib import Path
from pypdf import PdfReader


def main() -> None:
    base = Path(r"C:\Users\Riew\Desktop\Job_NBV\KRC\krc-erp\docs")
    out_dir = Path(r"C:\Users\Riew\Desktop\Job_NBV\KRC\krc-erp\tmp\pdf-images")
    out_dir.mkdir(parents=True, exist_ok=True)

    for pdf_path in sorted(base.glob("img20260615_*.pdf")):
        reader = PdfReader(str(pdf_path))
        page = reader.pages[0]
        for idx, image_file in enumerate(page.images):
            image_name = f"{pdf_path.stem}_{idx + 1}{Path(image_file.name).suffix or '.bin'}"
            output_path = out_dir / image_name
            output_path.write_bytes(image_file.data)
            print(output_path)


if __name__ == "__main__":
    main()
