import openpyxl
from pathlib import Path
import sys

sys.stdout.reconfigure(encoding='utf-8')

excel_path = Path(r"C:\Users\Riew\Desktop\Job_NBV\KRC\krc-erp\docs\รายการชิ้นงานลูกค้า ASICO 9324 (1).xlsx")
wb = openpyxl.load_workbook(excel_path, read_only=True)
ws = wb['รายการชิ้นงาน โรง 1']

print("First 15 rows of 'รายการชิ้นงาน โรง 1':")
for i, row in enumerate(ws.iter_rows(max_row=15, values_only=True)):
    print(f"Row {i+1}: {row[:15]}")
