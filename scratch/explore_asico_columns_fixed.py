import openpyxl
from pathlib import Path
import sys

sys.stdout.reconfigure(encoding='utf-8')

excel_path = Path(r"C:\Users\Riew\Desktop\Job_NBV\KRC\krc-erp\docs\รายการชิ้นงานลูกค้า ASICO 9324 (1).xlsx")
wb = openpyxl.load_workbook(excel_path, read_only=True)
ws = wb['รายการชิ้นงาน โรง 1']

# Let's get the first few non-null elements of row 3 and 4 to see column indices
row3 = next(ws.iter_rows(min_row=3, max_row=3, values_only=True))
row4 = next(ws.iter_rows(min_row=4, max_row=4, values_only=True))

for i in range(15):
    print(f"Col {i}: Row3={row3[i]} | Row4={row4[i]}")
