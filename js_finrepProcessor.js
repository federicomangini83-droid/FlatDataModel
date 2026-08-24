/**
 * Logica di elaborazione del workbook FinRep - equivalente JS di FinRepFlatDataModel.py
 */

const FIELD_MARKERS = [
  { key: "Conto", marker: "Account= '" },
  { key: "Dest2", marker: "Dest 2 = '" },
  { key: "Dest3", marker: "Dest 3 = '" },
  { key: "Dest4", marker: "Dest 4 = '" },
  { key: "Dest5", marker: "Dest 5 = '" },
  { key: "Categoria", marker: "Category= '" },
  { key: "Sign", marker: "DB Storage Sign= '" },
  { key: "EBASign", marker: "EBA Sign= '" },
  { key: "Formula", marker: "Formula= '" },
  { key: "CC", marker: "Calculation logic= '" },
];

function getMarkerPositions(mapping) {
  const pos = {};
  for (const { key, marker } of FIELD_MARKERS) {
    pos[key] = mapping.indexOf(marker);
  }
  return pos;
}

/**
 * Estrae i campi da una singola cella di mapping, replicando i 3 casi
 * gestiti nello script Python originale.
 */
function parseMappingText(rawValue) {
  if (rawValue === null || rawValue === undefined) return null;
  let mapping = String(rawValue).replace(/\n/g, "");
  const pos = getMarkerPositions(mapping);
  const has = (k) => pos[k] !== -1;

  const result = {
    Conto: null, Dest2: null, Dest3: null, Dest4: null, Dest5: null,
    Categoria: null, Formula: null, CC: null, Sign: null, EBASign: null,
  };

  const lenMapping = mapping.length;

  const slice = (startKey, endPos) => {
    const marker = FIELD_MARKERS.find((f) => f.key === startKey).marker;
    const start = pos[startKey] + marker.length + 1;
    return mapping.slice(start, endPos - 1).trim();
  };

  if (has("Conto") && !has("Formula") && has("Dest2") && !has("CC")) {
    // Caso 1: Account + Dest senza Formula, senza Calculation logic
    result.Conto = slice("Conto", pos.Dest2);
    result.Dest2 = slice("Dest2", pos.Dest3);
    result.Dest3 = slice("Dest3", pos.Dest4);
    result.Dest4 = slice("Dest4", pos.Dest5);
    result.Dest5 = slice("Dest5", pos.Categoria);
    result.Categoria = slice("Categoria", pos.Sign);
    result.Sign = slice("Sign", pos.EBASign);
    result.EBASign = mapping.slice(pos.EBASign + FIELD_MARKERS.find(f=>f.key==="EBASign").marker.length + 1, lenMapping - 1).trim();
  } else if (!has("Conto") && has("Formula") && !has("CC")) {
    // Caso 2: Formula, senza Account, senza Calculation logic
    result.Formula = slice("Formula", pos.Sign);
    result.Sign = slice("Sign", pos.EBASign);
    result.EBASign = mapping.slice(pos.EBASign + FIELD_MARKERS.find(f=>f.key==="EBASign").marker.length + 1, lenMapping - 1).trim();
  } else if (has("Conto") && !has("Formula") && has("Dest2") && has("CC")) {
    // Caso 3: Account + Dest + Calculation logic
    result.Conto = slice("Conto", pos.Dest2);
    result.Dest2 = slice("Dest2", pos.Dest3);
    result.Dest3 = slice("Dest3", pos.Dest4);
    result.Dest4 = slice("Dest4", pos.Dest5);
    result.Dest5 = slice("Dest5", pos.Categoria);
    result.Categoria = slice("Categoria", pos.Sign);
    result.Sign = slice("Sign", pos.EBASign);
    result.EBASign = slice("EBASign", pos.CC);
    result.CC = mapping.slice(pos.CC + FIELD_MARKERS.find(f=>f.key==="CC").marker.length + 1, lenMapping - 1).trim();
  } else {
    return result; // tutti null, EBASign null -> verrà scartato a monte
  }
  return result;
}

/** Ottiene il colore ARGB/RGB di riempimento di una cella SheetJS, se disponibile. */
function getCellFillColor(cell) {
  if (!cell || !cell.s || !cell.s.fgColor) return null;
  return cell.s.fgColor.rgb || null;
}

/** Identifica lo stile/colore di riferimento dalle celle A1/A2/B1 del primo foglio. */
function getReferenceStyle(workbook) {
  const firstSheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[firstSheetName];
  const a1 = sheet["A1"];
  const a2 = sheet["A2"];
  const b1 = sheet["B1"];
  return {
    refColor: getCellFillColor(a1),
    valRowStyle: a2 ? a2.s : null,
    valColStyle: b1 ? b1.s : null,
  };
}

function cellMatchesReference(cell, refColor) {
  const color = getCellFillColor(cell);
  return color !== null && refColor !== null && color === refColor;
}

/** Estrae le intestazioni di colonna (prima riga) di un foglio. */
function extractColumns(sheet, sheetName, refColor, range) {
  const cols = [];
  let countC = 1;
  const rowIdx = range.s.r; // prima riga (0-based)
  for (let c = range.s.c + 1; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: rowIdx, c });
    const cell = sheet[addr];
    if (!cell || cell.v === undefined || cell.v === null) break;
    if (cellMatchesReference(cell, refColor)) {
      countC++;
      cols.push({
        IdTabCol: sheetName,
        ValCol: String(cell.v).padStart(4, "0"),
        NumCol: countC,
      });
    }
  }
  return { cols, maxC: countC };
}

/** Estrae le intestazioni di riga (prima colonna) di un foglio. */
function extractRows(sheet, sheetName, refColor, range) {
  const rows = [];
  let countR = 1;
  const colIdx = range.s.c; // prima colonna (0-based)
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const addr = XLSX.utils.encode_cell({ r, c: colIdx });
    const cell = sheet[addr];
    if (!cell || cell.v === undefined || cell.v === null) break;
    if (cellMatchesReference(cell, refColor)) {
      countR++;
      rows.push({
        IdTabRow: sheetName,
        ValRow: String(cell.v).padStart(4, "0"),
        NumRow: countR,
      });
    }
  }
  return { rows, maxR: countR };
}

/**
 * Elabora l'intero workbook e restituisce l'array di record finali
 * (stesso schema colonne del CSV Python).
 */
function processWorkbook(workbook) {
  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error("Il file Excel non contiene fogli validi.");
  }

  const ref = getReferenceStyle(workbook);
  if (ref.refColor === null) {
    throw new Error(
      "Impossibile determinare lo stile/colore di riferimento dalla cella A1 del primo foglio. Verifica che il file abbia la formattazione attesa."
    );
  }

  const allCols = [];
  const allRows = [];
  const maxColBySheet = {};
  const maxRowBySheet = {};

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
    const { cols, maxC } = extractColumns(sheet, sheetName, ref.refColor, range);
    const { rows, maxR } = extractRows(sheet, sheetName, ref.refColor, range);
    allCols.push(...cols);
    allRows.push(...rows);
    maxColBySheet[sheetName] = maxC;
    maxRowBySheet[sheetName] = maxR;
  }

  const mappingList = [];

  for (const sheetName of workbook.SheetNames) {
    if (sheetName === "Test_Formula" || sheetName === "Macro") continue;
    const sheet = workbook.Sheets[sheetName];
    const maxC = maxColBySheet[sheetName];
    const maxR = maxRowBySheet[sheetName];

    // range dati: righe 2..maxR, colonne 2..maxC (1-based come in Python) -> 0-based: r=1..maxR-1, c=1..maxC-1
    for (let r = 1; r <= maxR - 1; r++) {
      for (let c = 1; c <= maxC - 1; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[addr];
        if (!cell) continue;
        const color = getCellFillColor(cell);
        if (color === ref.refColor) continue; // è una cella di intestazione, non di mapping

        const parsed = parseMappingText(cell.v);
        if (parsed && parsed.EBASign) {
          mappingList.push({
            Id_Tab: sheetName,
            Row: r + 1, // 1-based come openpyxl
            Column: c + 1,
            Cod_Conto: parsed.Conto,
            Cod_Dest2: parsed.Dest2,
            Cod_Dest3: parsed.Dest3,
            Cod_Dest4: parsed.Dest4,
            Cod_Dest5: parsed.Dest5,
            Cod_Categoria: parsed.Categoria,
            Formula: parsed.Formula,
            Calculation_Logic: parsed.CC,
            DB_Storage_Sign: parsed.Sign,
            EBA_Sign: parsed.EBASign,
            Coordinate: addr,
          });
        }
      }
    }
  }

  // Sostituzione NumCol/NumRow con i valori c0001/r0001
  const finalTab = mappingList.map((record) => {
    const final = { ...record };
    const colMatch = allCols.find(
      (c) => c.IdTabCol === record.Id_Tab && c.NumCol === record.Column
    );
    if (colMatch) final.Column = "c" + String(colMatch.ValCol).padStart(4, "0");
    const rowMatch = allRows.find(
      (rw) => rw.IdTabRow === record.Id_Tab && rw.NumRow === record.Row
    );
    if (rowMatch) final.Row = "r" + String(rowMatch.ValRow).padStart(4, "0");
    return final;
  });

  return finalTab;
}

/** Converte l'array di record in stringa CSV. */
function toCSV(records) {
  if (records.length === 0) return "";
  const headers = Object.keys(records[0]);
  const escape = (val) => {
    if (val === null || val === undefined) return "";
    const s = String(val);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  };
  const lines = [headers.join(",")];
  for (const rec of records) {
    lines.push(headers.map((h) => escape(rec[h])).join(","));
  }
  return lines.join("\n");
}