/**
 * Gestione UI: upload, elaborazione, anteprima, download CSV.
 */

const fileInput = document.getElementById("fileInput");
const processBtn = document.getElementById("processBtn");
const spinner = document.getElementById("spinner");
const errorBox = document.getElementById("errorBox");
const resultBox = document.getElementById("resultBox");
const recordCount = document.getElementById("recordCount");
const resultTable = document.getElementById("resultTable");
const downloadBtn = document.getElementById("downloadBtn");
const startNameInput = document.getElementById("startName");
const endNameInput = document.getElementById("endName");
const fileNamePrefixInput = document.getElementById("fileNamePrefix");
const fileNamePreview = document.getElementById("fileNamePreview");

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

function updateFileNamePreview() {
  const startName = startNameInput.value || "";
  const fileNamePrefix = fileNamePrefixInput.value || "";
  const endName = endNameInput.value || "";
  fileNamePreview.textContent = `${startName}${fileNamePrefix}${endName}.csv`;
}

[startNameInput, endNameInput, fileNamePrefixInput].forEach((input) => {
  input.addEventListener("input", updateFileNamePreview);
});
updateFileNamePreview();

function renderTable(records) {
  resultTable.innerHTML = "";
  if (records.length === 0) return;
  const headers = Object.keys(records[0]);

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  headers.forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  resultTable.appendChild(thead);

  const tbody = document.createElement("tbody");
  const preview = records.slice(0, 200); // anteprima limitata per performance
  preview.forEach((rec) => {
    const tr = document.createElement("tr");
    headers.forEach((h) => {
      const td = document.createElement("td");
      td.textContent = rec[h] ?? "";
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  resultTable.appendChild(tbody);
}

processBtn.addEventListener("click", () => {
  clearError();
  resultBox.classList.add("hidden");

  const file = fileInput.files[0];
  if (!file) {
    showError("Seleziona prima un file Excel (.xlsx).");
    return;
  }

  const startName = startNameInput.value || "";
  const endName = endNameInput.value || "";
  const fileNamePrefix = fileNamePrefixInput.value || "";

  spinner.classList.remove("hidden");
  processBtn.disabled = true;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: "array", cellStyles: true });

      const records = processWorkbook(workbook);

      if (records.length === 0) {
        showError(
          "Elaborazione completata ma nessun record valido è stato trovato. Verifica la struttura del file Excel."
        );
      } else {
        lastCSV = toCSV(records);
        lastFileName = `${startName}${fileNamePrefix}${endName}.csv`;
        recordCount.textContent = `Record totali generati: ${records.length} (anteprima limitata alle prime 200 righe)`;
        renderTable(records);
        resultBox.classList.remove("hidden");
      }
    } catch (err) {
      console.error(err);
      showError("Errore durante l'elaborazione del file: " + err.message);
    } finally {
      spinner.classList.add("hidden");
      processBtn.disabled = false;
    }
  };
  reader.onerror = () => {
    spinner.classList.add("hidden");
    processBtn.disabled = false;
    showError("Errore durante la lettura del file.");
  };
  reader.readAsArrayBuffer(file);
});

downloadBtn.addEventListener("click", () => {
  if (!lastCSV) return;
  const blob = new Blob([lastCSV], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = lastFileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
});
