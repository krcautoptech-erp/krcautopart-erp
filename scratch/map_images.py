import os
import re

drawings_dir = r"C:\Users\Riew\Desktop\Job_NBV\KRC\krc-erp\public\products\asico"
filenames = os.listdir(drawings_dir)

def normalize_key(part):
    return re.sub(r'[^A-Z0-9]', '', part.upper())

image_map = {}
for fname in filenames:
    # Try parsing format: plant-X-part-[PARTNUMBER]-[ID]_transparent.png or similar
    # We want to extract the part number portion.
    # Typically: plant-1-part-111504728R02-70_transparent.png -> part number is likely between 'part-' and '-[digits]_transparent.png'
    match = re.search(r'part-(.*?)-\d+_transparent\.png', fname)
    if match:
        part_part = match.group(1)
        norm_part = normalize_key(part_part)
        image_map[norm_part] = f"/products/asico/{fname}"
    else:
        # fallback parsing
        base = fname.replace("_transparent.png", "")
        parts = base.split("-")
        if len(parts) >= 4:
            part_part = parts[3]
            norm_part = normalize_key(part_part)
            image_map[norm_part] = f"/products/asico/{fname}"

print(f"Mapped {len(image_map)} images.")
# Print a few examples
for k, v in list(image_map.items())[:10]:
    print(f"  {k} -> {v}")
