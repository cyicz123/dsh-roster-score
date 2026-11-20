"""Generate sample rosters used by the roster-score plugin tests and demo."""
import csv
import os
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "samples")
os.makedirs(OUT, exist_ok=True)

STUDENTS_3 = [
    ("2024001", "张伟", "高一(3)班"),
    ("2024002", "李娜", "高一(3)班"),
    ("2024003", "王浩", "高一(3)班"),
]

NAMES = [
    "张伟", "李娜", "王浩", "刘洋", "陈静", "杨帆", "赵敏", "黄磊", "周杰", "吴芳",
    "徐强", "孙丽", "马超", "朱军", "胡雪", "郭鹏", "何静怡", "高远", "林晓", "罗鑫",
    "梁爽", "宋佳", "唐文", "许敏", "邓超", "冯洁", "曹阳", "彭飞", "曾琪", "肖涵",
]
STUDENTS_30 = [(f"2024{i + 1:03d}", n, "高一(3)班") for i, n in enumerate(NAMES)]


def build(path, rows, title):
    wb = Workbook()
    ws = wb.active
    ws.title = "成绩录入"
    ws["A1"] = title
    ws["A1"].font = Font(bold=True, size=14)
    ws["A1"].alignment = Alignment(horizontal="center")
    ws.merge_cells(start_row=1, start_column=1, end_row=1, end_column=3)
    headers = ["学号", "姓名", "班级"]
    ws.append(headers)
    for cell in ws[2]:
        cell.font = Font(bold=True)
    for row in rows:
        ws.append(list(row))
    ws.column_dimensions["A"].width = 12
    ws.column_dimensions["B"].width = 14
    ws.column_dimensions["C"].width = 14
    wb.save(path)


build(os.path.join(OUT, "roster-3.xlsx"), STUDENTS_3, "高一(3)班 第一次月考 成绩单")
build(os.path.join(OUT, "roster-30.xlsx"), STUDENTS_30, "高一(3)班 第一次月考 成绩单")

with open(os.path.join(OUT, "roster-30.csv"), "w", encoding="utf-8-sig", newline="") as fh:
    writer = csv.writer(fh)
    writer.writerow(["学号", "姓名", "班级"])
    writer.writerows(STUDENTS_30)

print("samples written to", os.path.abspath(OUT))
