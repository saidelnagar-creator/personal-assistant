#!/usr/bin/env python3
# يستخرج كل خلايا ملف الإكسيل (القيمة المحسوبة + المعادلة) إلى JSON ليقرأه tools/import-excel.mjs.
# التشغيل:  python3 -I tools/excel_extract.py input/farm.xlsx input/farm-extracted.json
# الملفات في input/ خارج git دائماً (بيانات حقيقية).
import json
import sys
import warnings
import datetime

warnings.filterwarnings("ignore")
import openpyxl  # noqa: E402


def conv(v):
    if isinstance(v, (datetime.datetime, datetime.date)):
        return v.strftime("%Y-%m-%d")
    return v


def main(src, dst):
    wf = openpyxl.load_workbook(src, data_only=False)
    wv = openpyxl.load_workbook(src, data_only=True)
    out = {"source": src.split("/")[-1], "sheets": []}
    for i, ws in enumerate(wf.worksheets):
        wsv = wv.worksheets[i]
        cells = {}
        for row in ws.iter_rows():
            for c in row:
                if c.value is None:
                    continue
                f = c.value if isinstance(c.value, str) and c.value.startswith("=") else None
                cells[c.coordinate] = {"r": c.row, "c": c.column, "v": conv(wsv[c.coordinate].value), **({"f": f} if f else {})}
        out["sheets"].append({"name": ws.title, "cells": cells})
    with open(dst, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False)
    print(f"{dst}: {len(out['sheets'])} sheets")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
