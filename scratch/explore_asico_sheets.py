import openpyxl
from pathlib import Path
import sys

# Force UTF-8 encoding for stdout
sys.stdout.reconfigure(encoding='utf-8')

excel_path = Path(r"C:\Users\Riew\Desktop\Job_NBV\KRC\krc-erp\docs\รายการชิ้นงานลูกค้า ASICO 9324 (1).xlsx")
print(f"Loading workbook: {excel_path.name}...")
wb = openpyxl.load_workbook(excel_path, read_only=True)
print("Sheets in workbook:")
for sheet in wb.sheetnames:
    print(f"  - {sheet}")
