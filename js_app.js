/**
 * Gestione UI: selezione file, drag and drop, elaborazione, anteprima e download CSV.
 * Richiede XLSX, processWorkbook() e toCSV() caricati prima di questo file.
 */
const fileInput = document.getElementById("fileInput");
const dropzone = document.getElementById("dropzone");
const uploadTitle = document.getElementById("uploadTitle");
const uploadHint = document.getElementById("uploadHint");
const fileMeta = document.getElementById("fileMeta");
const processBtn = document.getElementById("processBtn");
const processBtnLabel = document.getElementById("processBtnLabel");
const spinner = document.getElementById("spinner");
const errorBox = document.getElementById("errorBox");
const resultBox = document.getElementById("resultBox");
const recordCount = document.getElementById("recordCount");
const resultTable = document.getElementById("resultTable");
const downloadBtn = document.getElementById("downloadBtn");
const startNameInput = document.getElementById("startName");
const endNameInput = document.getElementById("endName");
const prefixInput = document.getElementById("fileNamePrefix");
const fileNamePreview = document.getElementById("fileNamePreview");

let lastCSV = "";
let lastFileName = "output.csv";

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove("hidden");
  errorBox.scrollIntoView({ behavior: "smooth", block: "center" });
}

function clearError() {
  errorBox.textContent = "";
  errorBox.classList.add("hidden");
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes === 0) return "0 KB";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function getOutputFileName() {
  const startName = startNameInput.value.trim();
  const prefix = prefixInput.value.trim();
  const endName = endNameInput.value.trim();
  return `${startName}${prefix}${endName}.csv`;
}

function updateFileNamePreview() {
  fileNamePreview.textContent = getOutputFileName();
}

function updateSelectedFile(file) {
  clearError();
  resultBox.classList.add("hidden");
  lastCSV = "";

  if (!file) {
    dropzone.classList.remove("has-file");
    uploadTitle.textContent = "Trascina qui il file Excel";
    uploadHint.classList.remove("hidden");
    fileMeta.classList.add("hidden");
    return;
  }

  const validExtension = /\.(xlsx|xls)$/i.test(file.name);
  if (!validExtension) {
    fileInput.value = "";
    updateSelectedFile(null);
    showError("Formato non supportato. Seleziona un file Excel .xlsx o .xls.");
    return;
  }

  dropzone.classList.add("has-file");
  uploadTitle.textContent = file.name;
  uploadHint.classList.add("hidden");
  fileMeta.textContent = `${formatBytes(file.size)} · File pronto per l’elaborazione`;
  fileMeta.classList.remove("hidden");
}

function renderTable(records) {
  resultTable.innerHTML = "";
  if (!records.length) return;

  const headers = Object.keys(records[0]);
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");

  headers.forEach((header) => {
    const th = document.createElement("th");
    th.scope = "col";
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

function setProcessing(isProcessing) {
  processBtn.disabled = isProcessing;
  spinner.classList.toggle("hidden", !isProcessing);
  processBtnLabel.textContent = isProcessing ? "Elaborazione..." : "Elabora file";
  const icon = processBtn.querySelector(".button__icon");
  if (icon) icon.classList.toggle("hidden", isProcessing);
}

[startNameInput, endNameInput, prefixInput].forEach((input) => {
  input.addEventListener("input", updateFileNamePreview);
});

fileInput.addEventListener("change", () => updateSelectedFile(fileInput.files[0]));

["dragenter", "dragover"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropzone.classList.add("is-dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  dropzone.addEventListener(eventName, (event) => {
    event.preventDefault();
    event.stopPropagation();
    dropzone.classList.remove("is-dragging");
  });
});

dropzone.addEventListener("drop", (event) => {
  const file = event.dataTransfer.files[0];
  if (!file) return;

  try {
    const transfer = new DataTransfer();
    transfer.items.add(file);
    fileInput.files = transfer.files;
  } catch (_) {
    // Alcuni browser non permettono di assegnare FileList. Il file viene comunque mostrato.
  }
  updateSelectedFile(file);
});

processBtn.addEventListener("click", () => {
  clearError();
  resultBox.classList.add("hidden");

  const file = fileInput.files[0];
  if (!file) {
    showError("Seleziona prima un file Excel .xlsx o .xls.");
    dropzone.focus();
    return;
  }

  if (typeof XLSX === "undefined" || typeof processWorkbook !== "function" || typeof toCSV !== "function") {
    showError("Le librerie necessarie non sono state caricate. Controlla i percorsi degli script e riprova.");
    return;
  }

  setProcessing(true);
  const reader = new FileReader();

  reader.onload = (event) => {
    try {
      const data = new Uint8Array(event.target.result);
      const workbook = XLSX.read(data, { type: "array", cellStyles: true });
      const records = processWorkbook(workbook);

      if (!Array.isArray(records) || records.length === 0) {
        throw new Error("Nessun record valido trovato nel workbook. Verifica struttura e formattazione del file.");
      }

      lastCSV = toCSV(records);
      lastFileName = getOutputFileName();
      renderTable(records);
      recordCount.textContent = `${records.length.toLocaleString("it-IT")} record generati · ${lastFileName}`;
      resultBox.classList.remove("hidden");
      resultBox.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      console.error(error);
      showError(error?.message || "Si è verificato un errore durante l’elaborazione del file.");
    } finally {
      setProcessing(false);
    }
  };

  reader.onerror = () => {
    setProcessing(false);
    showError("Errore durante la lettura del file. Prova a selezionarlo nuovamente.");
  };

  reader.readAsArrayBuffer(file);
});

downloadBtn.addEventListener("click", () => {
  if (!lastCSV) {
    showError("Non è disponibile alcun CSV da scaricare.");
    return;
  }

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

updateFileNamePreview();
