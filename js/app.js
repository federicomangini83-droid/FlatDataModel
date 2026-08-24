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
let isProcessing = false;

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

function updatePreview() {
  fileNamePreview.textContent = outputName();
}

/**
 * Gestisce lo stato visivo dell'elaborazione.
 * L'uso di hidden e style.display evita che una regola CSS .spinner
 * possa prevalere sulla classe .hidden e lasciare l'animazione visibile.
 */
function setBusy(isBusy, label = "Elabora file") {
  isProcessing = isBusy;

  spinner.hidden = !isBusy;
  spinner.classList.toggle("hidden", !isBusy);
  spinner.style.display = isBusy ? "inline-block" : "none";
  spinner.setAttribute("aria-hidden", String(!isBusy));

  processBtn.disabled = isBusy;
  processBtn.textContent = isBusy ? label : "Elabora file";
}

// Lo spinner deve essere nascosto fin dal primo rendering della pagina.
setBusy(false);

[startNameInput, prefixInput, endNameInput].forEach((input) => {
  input.addEventListener("input", updatePreview);
});

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

// Il motore Python viene preparato silenziosamente in background.
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

    const response = await fetch("./python/finrep_processor.py", {
      cache: "no-cache"
    });

    if (!response.ok) {
      throw new Error(`Motore Python non trovato: HTTP ${response.status}`);
    }

    const pythonSource = await response.text();
    await pyodide.runPythonAsync(pythonSource);

    return pyodide;
  } catch (error) {
    initializationError = error;
    console.error("Inizializzazione Python non riuscita", error);
    throw error;
  }
})();

// Evita una Promise rejection non gestita. L'errore viene mostrato al click.
pythonReady.catch(() => {});

processBtn.addEventListener("click", async () => {
  if (isProcessing) return;

  clearError();
  resultBox.classList.add("hidden");

  const file = fileInput.files[0];

  if (!file) {
    showError("Seleziona prima un file Excel .xlsx.");
    return;
  }

  const virtualPath = "/tmp/finrep_input.xlsx";
  setBusy(true, pyodide ? "Elaborazione..." : "Preparazione...");

  try {
    await pythonReady;

    if (initializationError) {
      throw initializationError;
    }

    processBtn.textContent = "Elaborazione...";

    const fileBytes = new Uint8Array(await file.arrayBuffer());
    pyodide.FS.writeFile(virtualPath, fileBytes);
    pyodide.globals.set("workbook_path_from_js", virtualPath);

    const resultJson = await pyodide.runPythonAsync(
      "process_finrep(workbook_path_from_js)"
    );

    const result = JSON.parse(resultJson);

    if (!result.records || result.records.length === 0) {
      showError(
        "Elaborazione completata, ma nessun record valido è stato trovato. " +
        "Verifica struttura, stili e contenuto del workbook."
      );
      return;
    }

    lastCSV = result.csv;
    lastFileName = outputName();

    renderTable(result.records);
    recordCount.textContent =
      `Record totali generati: ${result.count} ` +
      "(anteprima delle prime 200 righe)";

    resultBox.classList.remove("hidden");
  } catch (error) {
    console.error(error);

    const prefix = initializationError
      ? "Impossibile preparare il motore Python"
      : "Errore durante l'elaborazione Python";

    showError(`${prefix}: ${error.message}`);
  } finally {
    // Ripristina sempre la UI prima di qualsiasi operazione di pulizia.
    setBusy(false);

    // La pulizia è separata dal ripristino della UI, quindi eventuali errori
    // non possono lasciare lo spinner visibile.
    try {
      if (pyodide && pyodide.FS) {
        pyodide.FS.unlink(virtualPath);
      }
    } catch (cleanupError) {
      console.debug(
        "File temporaneo già rimosso o non disponibile.",
        cleanupError
      );
    }

    try {
      if (pyodide && pyodide.globals) {
        pyodide.globals.delete("workbook_path_from_js");
      }
    } catch (cleanupError) {
      console.debug(
        "Variabile Python già rimossa o non disponibile.",
        cleanupError
      );
    }
  }
});

downloadBtn.addEventListener("click", () => {
  if (!lastCSV) return;

  const blob = new Blob(["\uFEFF", lastCSV], {
    type: "text/csv;charset=utf-8;"
  });

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
