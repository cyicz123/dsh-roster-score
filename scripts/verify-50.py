# -*- coding: utf-8 -*-
"""Verify the exported 50-row workbook keeps every row and merges the new score column."""
import json
import urllib.request

from openpyxl import load_workbook

PATH = r"C:\Users\chengyue\Downloads\dsh-roster-score\samples\api-out-50.xlsx"
REPORT = r"C:\Users\chengyue\Downloads\dsh-roster-score\scripts\verify-50-report.txt"

lines = []
book = load_workbook(PATH)
sheet = book.active
lines.append(f"sheet={sheet.title} dims={sheet.dimensions} max_row={sheet.max_row} max_col={sheet.max_column}")
lines.append(f"merged={[str(item) for item in sheet.merged_cells.ranges]}")
lines.append(f"title={sheet['A1'].value}")
lines.append(f"header={[cell.value for cell in sheet[2]]}")
rows = [[cell.value for cell in row] for row in sheet.iter_rows(min_row=3, max_row=sheet.max_row)]
lines.append(f"data_rows={len(rows)}")
lines.append(f"first={rows[0]}")
lines.append(f"second={rows[1]}")
lines.append(f"last={rows[-1]}")
scored = [row for row in rows if row[5] is not None]
lines.append(f"scored_rows={len(scored)}")
for row in scored:
    lines.append(f"scored={row}")
blank_scores = [row for row in rows if row[5] is None]
lines.append(f"blank_score_rows={len(blank_scores)}")

with urllib.request.urlopen("http://127.0.0.1:8178/plugins/roster-score/state") as response:
    state = json.loads(response.read().decode("utf-8"))
lines.append("host_scores=" + json.dumps(
    [(record["id"], record["name"], record["score"]) for record in state["records"] if record["score"] is not None],
    ensure_ascii=False,
))

with open(REPORT, "w", encoding="utf-8") as handle:
    handle.write("\n".join(lines))
print(REPORT)
