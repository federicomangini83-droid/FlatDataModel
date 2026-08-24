const fileInput = document.getElementById("fileInput");
const processBtn = document.getElementById("processBtn");
const spinner = document.getElementById("spinner");
const errorBox = document.getElementById("errorBox");
const resultBox = document.getElementById("resultBox");
const recordCount = document.getElementById("recordCount");
const resultTable = document.getElementById("resultTable");
const downloadBtn = document.getElementById("downloadBtn");
const startNameInput = document.getElementById("startName");
const prefixInput = document.getElementById("fileNamePrefix");
const endNameInput = document.getElementById("endName");
const fileNamePreview = document.getElementById("fileNamePreview");

let pyodide = null;
let initializationError = null;
let lastCSV = "";
let lastFileName = "output.csv";
processBtn.disabled = true;
processBtn.title = "Preparazione del motore Python in corso";

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
}
function clearError() {
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
}
function outputName() {
  return `${startNameInput.value || ""}${prefixInput.value || ""}${endNameInput.value || ""}.csv`;
}
function updatePreview() { fileNamePreview.textContent = outputName(); }
function setBusy(isBusy, label = "Elabora file") {
  spinner.classList.toggle("hidden", !isBusy);
  processBtn.disabled = isBusy;
  processBtn.textContent = isBusy ? label : "Elabora file";
}

[startNameInput, prefixInput, endNameInput].forEach((input) => input.addEventListener("input", updatePreview));

function renderTable(records) {
  resultTable.innerHTML = "";
  if (!records.length) return;
  const headers = Object.keys(records[0]);
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headers.forEach((header) => {
    const th = document.createElement("th");
    th.textContent = header;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  resultTable.appendChild(thead);

  const tbody = document.createElement("tbody");
  records.slice(0, 200).forEach((record) => {
    const row = document.createElement("tr");
    headers.forEach((header) => {
      const cell = document.createElement("td");
      cell.textContent = record[header] ?? "";
      row.appendChild(cell);
    });
    tbody.appendChild(row);
  });
  resultTable.appendChild(tbody);
}

// Parte immediatamente e silenziosamente in background all'apertura della pagina.
const pythonReady = (async () => {
  try {
    pyodide = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/"
    });
    await pyodide.loadPackage("micropip");
    const micropip = pyodide.pyimport("micropip");
    try {
      await micropip.install("openpyxl");
    } finally {
      micropip.destroy();
    }

    const response = await fetch("./python/finrep_processor.py", { cache: "no-cache" });
    if (!response.ok) throw new Error(`Motore Python non trovato: HTTP ${response.status}`);
    await pyodide.runPythonAsync(await response.text());
    processBtn.disabled = false;
    processBtn.title = "";
    return pyodide;
  } catch (error) {
    processBtn.disabled = true;
    processBtn.title = "Motore Python non disponibile";
    initializationError = error;
    console.error("Inizializzazione Python non riuscita", error);
    throw error;
  }
})();

// Evita un errore non gestito in console; l'errore sarà mostrato al click.
pythonReady.catch(() => {});

processBtn.addEventListener("click", async () => {
  clearError();
  resultBox.classList.add("hidden");
  const file = fileInput.files[0];
  if (!file) {
    showError("Seleziona prima un file Excel .xlsx.");
    return;
  }

  setBusy(true, pyodide ? "Elaborazione..." : "Preparazione... ");
  const virtualPath = "/tmp/finrep_input.xlsx";

  try {
    await pythonReady;
    if (initializationError) throw initializationError;
    processBtn.textContent = "Elaborazione...";

    pyodide.FS.writeFile(virtualPath, new Uint8Array(await file.arrayBuffer()));
    pyodide.globals.set("workbook_path_from_js", virtualPath);
    const resultJson = await pyodide.runPythonAsync("process_finrep(workbook_path_from_js)");
    const result = JSON.parse(resultJson);

    if (!result.records.length) {
      showError("Elaborazione completata, ma nessun record valido è stato trovato. Verifica struttura, stili e contenuto del workbook.");
      return;
    }

    lastCSV = result.csv;
    lastFileName = outputName();
    renderTable(result.records);
    recordCount.textContent = `Record totali generati: ${result.count} (anteprima delle prime 200 righe)`;
    resultBox.classList.remove("hidden");
  } catch (error) {
    console.error(error);
    const prefix = initializationError ? "Impossibile preparare il motore Python" : "Errore durante l'elaborazione Python";
    showError(`${prefix}: ${error.message}`);
  } finally {
    // Ogni operazione di pulizia è isolata, così nessun errore può lasciare lo spinner attivo.
    try { if (pyodide) pyodide.FS.unlink(virtualPath); } catch (_) {}
    try { if (pyodide) pyodide.globals.delete("workbook_path_from_js"); } catch (_) {}
    setBusy(false);
  }
});

downloadBtn.addEventListener("click", () => {
  if (!lastCSV) return;
  const blob = new Blob(["\uFEFF", lastCSV], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = lastFileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

updatePreview();
