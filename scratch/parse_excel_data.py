import openpyxl
from pathlib import Path
import json

excel_path = Path(r"C:\Users\Riew\Desktop\Job_NBV\KRC\krc-erp\docs\รายการชิ้นงานลูกค้า ASICO 9324 (1).xlsx")
wb = openpyxl.load_workbook(excel_path, data_only=True)
ws = wb['รายการชิ้นงาน โรง 1']

print("Row headers:")
# Row 3 contains titles, Row 4 contains sub-titles
# Let's map data starting from Row 5
rows = list(ws.iter_rows(min_row=5, values_only=True))

mapping_data = []
for r in rows:
    # Check if this row is a data row. Usually a data row has a sequence number or a part number.
    part_no = r[4] # Index 4 is 'หมายเลขชิ้นส่วน' / 'Part Namber'
    if part_no:
        part_no_str = str(part_no).strip()
        if part_no_str and part_no_str != 'Part Namber':
            mapping_data.append({
                'part_number': part_no_str,
                'std_no': str(r[1]).strip() if r[1] is not None else None,
                'material': str(r[3]).strip() if r[3] is not None else None,
                'model': str(r[6]).strip() if r[6] is not None else None,
                'sheet_count': str(r[2]).strip() if r[2] is not None else None,
                'parts_per_sheet': str(r[8]).strip() if r[8] is not None else None,
            })

print(f"Loaded {len(mapping_data)} rows with part numbers from sheet.")
print("First 10 records:")
for m in mapping_data[:10]:
    print(m)
