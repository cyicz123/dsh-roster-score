# -*- coding: utf-8 -*-
"""Build a 50-student roster used to test the roster-score plugin format parsing."""
import csv
import os

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

NAMES = [
    "张伟", "李娜", "王浩", "刘洋", "陈静", "杨帆", "赵磊", "黄敏", "周鑫", "吴琼",
    "徐鹏", "孙悦", "马超", "朱婷", "胡楠", "郭强", "何欣", "高翔", "林芳", "罗宇",
    "郑爽", "梁涛", "谢晨", "宋佳", "唐磊", "许诺", "韩雪", "冯坤", "邓鑫", "曹颖",
    "彭飞", "曾琳", "萧然", "田甜", "董超", "潘露", "袁野", "于洋", "蒋雯", "蔡明",
    "欧阳晨", "余嘉", "杜衡", "叶青", "程亮", "苏婉", "魏来", "吕蒙", "丁宁", "任杰",
]

HEADERS = ["序号", "学号", "姓名", "性别", "班级"]
CLASS_NAME = "高一(3)班"
TITLE = "高一(3)班 第一次月考 学生花名册"

HERE = os.path.dirname(os.path.abspath(__file__))
SAMPLES = os.path.join(os.path.dirname(HERE), "samples")
os.makedirs(SAMPLES, exist_ok=True)


def rows():
    out = []
    for index, name in enumerate(NAMES, start=1):
        gender = "男" if index % 2 == 1 else "女"
        student_id = f"2026{index:04d}"
        out.append([index, student_id, name, gender, CLASS_NAME])
    return out


def build_xlsx(path):
    book = Workbook()
    sheet = book.active
    sheet.title = "花名册"

    last_column = get_column_letter(len(HEADERS))
    sheet.merge_cells(f"A1:{last_column}1")
    title_cell = sheet["A1"]
    title_cell.value = TITLE
    title_cell.font = Font(size=14, bold=True)
    title_cell.alignment = Alignment(horizontal="center", vertical="center")
    sheet.row_dimensions[1].height = 26

    header_fill = PatternFill("solid", fgColor="DDEBF7")
    for column, header in enumerate(HEADERS, start=1):
        cell = sheet.cell(row=2, column=column, value=header)
        cell.font = Font(bold=True)
        cell.fill = header_fill
        cell.alignment = Alignment(horizontal="center")

    for offset, row in enumerate(rows()):
        for column, value in enumerate(row, start=1):
            cell = sheet.cell(row=3 + offset, column=column, value=value)
            if column in (1, 2, 4):
                cell.alignment = Alignment(horizontal="center")

    widths = [8, 12, 12, 8, 14]
    for column, width in enumerate(widths, start=1):
        sheet.column_dimensions[get_column_letter(column)].width = width

    sheet.freeze_panes = "A3"
    book.save(path)
    return path


def build_csv(path):
    with open(path, "w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(HEADERS)
        writer.writerows(rows())
    return path


if __name__ == "__main__":
    xlsx_path = build_xlsx(os.path.join(SAMPLES, "roster-50.xlsx"))
    csv_path = build_csv(os.path.join(SAMPLES, "roster-50.csv"))
    print(xlsx_path)
    print(csv_path)
    print(f"students={len(NAMES)}")
