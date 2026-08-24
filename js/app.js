const fileInput = document.getElementById("fileInput");
const processBtn = document.getElementById("processBtn");
const spinner = document.getElementById("spinner");
const errorBox = document.getElementById("errorBox");
const resultBox = document.getElementById("resultBox");
const recordCount = document.getElementById("recordCount");
const resultTable = document.getElementById("resultTable");
const downloadBtn = document.getElementById("downloadBtn");
const runtimeBox = document.getElementById("runtimeBox");
const runtimeStatus = document.getElementById("runtimeStatus");
const runtimeSpinner = document.getElementById("runtimeSpinner");
const startNameInput = document.getElementById("startName");
const prefixInput = document.getElementById("fileNamePrefix");
const endNameInput = document.getElementById("endName");
const fileNamePreview = document.getElementById("fileNamePreview");

let pyodide = null;
let lastCSV = "";
let lastFileName = "output.csv";

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

async function initializePython() {
  try {
    pyodide = await loadPyodide({
      indexURL: "https://cdn.jsdelivr.net/pyodide/v0.28.3/full/"
    });
    await pyodide.loadPackage("micropip");
    const micropip = pyodide.pyimport("micropip");
    await micropip.install("openpyxl");
    micropip.destroy();

    const response = await fetch("./python/finrep_processor.py");
    if (!response.ok) throw new Error(`Motore Python non trovato: HTTP ${response.status}`);
    const pythonSource = await response.text();
    await pyodide.runPythonAsync(pythonSource);

    runtimeStatus.textContent = "Motore Python pronto";
    runtimeSpinner.classList.add("hidden");
    runtimeBox.classList.add("ready");
    fileInput.disabled = false;
    processBtn.disabled = false;
  } catch (error) {
    console.error(error);
    runtimeStatus.textContent = "Errore nel caricamento del motore Python";
    runtimeSpinner.classList.add("hidden");
    runtimeBox.classList.add("failed");
    showError(`${error.message}. Verifica la connessione Internet e ricarica la pagina.`);
  }
}

processBtn.addEventListener("click", async () => {
  clearError();
  resultBox.classList.add("hidden");
  const file = fileInput.files[0];
  if (!file) {
    showError("Seleziona prima un file Excel .xlsx.");
    return;
  }
  if (!pyodide) {
    showError("Il motore Python non è ancora pronto.");
    return;
  }

  spinner.classList.remove("hidden");
  processBtn.disabled = true;
  processBtn.textContent = "Elaborazione...";
  const virtualPath = "/tmp/finrep_input.xlsx";

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    pyodide.FS.writeFile(virtualPath, bytes);
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
    showError(`Errore durante l'elaborazione Python: ${error.message}`);
  } finally {
    try { pyodide.FS.unlink(virtualPath); } catch (_) {}
    pyodide.globals.delete("workbook_path_from_js");
    spinner.classList.add("hidden");
    processBtn.disabled = false;
    processBtn.textContent = "Elabora file";
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
initializePython();
