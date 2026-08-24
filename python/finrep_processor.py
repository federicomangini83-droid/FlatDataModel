"""Motore FinRep per Pyodide.

Adattato dallo script desktop originale FinRepFlatDataModel.py:
- riceve il workbook dal filesystem virtuale del browser;
- nessun percorso Windows fisso;
- restituisce record e CSV a JavaScript.
"""

import csv
import io
import json
import openpyxl

FIELDS = [
    "Id_Tab", "Row", "Column", "Cod_Conto", "Cod_Dest2", "Cod_Dest3",
    "Cod_Dest4", "Cod_Dest5", "Cod_Categoria", "Formula",
    "Calculation_Logic", "DB_Storage_Sign", "EBA_Sign", "Coordinate",
]


def _rgb(cell):
    return getattr(cell.fill.fgColor, "rgb", None)


def _between(text, start_marker, end_marker):
    start = text.find(start_marker)
    end = text.find(end_marker, start + len(start_marker))
    if start == -1 or end == -1:
        return None
    return text[start + len(start_marker):end].strip().strip("'").strip()


def _last(text, marker):
    start = text.find(marker)
    if start == -1:
        return None
    return text[start + len(marker):].strip().strip("'").strip()


def _parse(raw_value):
    if raw_value is None:
        return None

    t = str(raw_value).replace("\n", "")
    A = "Account= "
    D2 = "Dest 2 = "
    D3 = "Dest 3 = "
    D4 = "Dest 4 = "
    D5 = "Dest 5 = "
    C = "Category= "
    F = "Formula= "
    S = "DB Storage Sign= "
    E = "EBA Sign= "
    L = "Calculation logic= "

    result = {k: None for k in FIELDS[3:13]}

    if A in t and F not in t and D2 in t:
        result.update(
            Cod_Conto=_between(t, A, D2),
            Cod_Dest2=_between(t, D2, D3),
            Cod_Dest3=_between(t, D3, D4),
            Cod_Dest4=_between(t, D4, D5),
            Cod_Dest5=_between(t, D5, C),
            Cod_Categoria=_between(t, C, S),
            DB_Storage_Sign=_between(t, S, E),
            EBA_Sign=_between(t, E, L) if L in t else _last(t, E),
            Calculation_Logic=_last(t, L) if L in t else None,
        )
    elif A not in t and F in t and L not in t:
        result.update(
            Formula=_between(t, F, S),
            DB_Storage_Sign=_between(t, S, E),
            EBA_Sign=_last(t, E),
        )
    else:
        return None

    return result if result["EBA_Sign"] is not None else None


def process_finrep(path):
    wb = openpyxl.load_workbook(path, data_only=False)
    names = wb.sheetnames
    if not names:
        raise ValueError("Il file Excel non contiene fogli validi.")

    ref = wb[names[0]]
    color = _rgb(ref["A1"])
    row_style = ref["A2"]._style
    col_style = ref["B1"]._style

    cols = {}
    rows = {}
    max_c = {}
    max_r = {}

    for n in names:
        sh = wb[n]
        cc = cr = 1
        for row in sh.iter_rows():
            for c in row:
                if c.column == 1:
                    continue
                if c.value is not None and (c._style == col_style or _rgb(c) == color):
                    cc += 1
                    cols[(n, cc)] = "c" + str(c.value).zfill(4)
                elif c.value is None:
                    break
            break
        for col in sh.iter_cols():
            for c in col:
                if c.row == 1:
                    continue
                if c.value is not None and (c._style == row_style or _rgb(c) == color):
                    cr += 1
                    rows[(n, cr)] = "r" + str(c.value).zfill(4)
                elif c.value is None:
                    break
            break
        max_c[n] = cc
        max_r[n] = cr

    records = []
    for n in names:
        if n in {"Test_Formula", "Macro"}:
            continue
        sh = wb[n]
        for rr in sh.iter_rows(min_row=2, max_row=max_r[n], min_col=2, max_col=max_c[n]):
            for c in rr:
                if _rgb(c) == color:
                    continue
                parsed = _parse(c.value)
                if parsed:
                    records.append({
                        "Id_Tab": n,
                        "Row": rows.get((n, c.row), c.row),
                        "Column": cols.get((n, c.column), c.column),
                        **parsed,
                        "Coordinate": c.coordinate,
                    })

    out = io.StringIO(newline="")
    writer = csv.DictWriter(out, fieldnames=FIELDS, lineterminator="\n")
    writer.writeheader()
    writer.writerows(records)

    return json.dumps({
        "records": records,
        "csv": out.getvalue(),
        "count": len(records),
    }, ensure_ascii=False)
