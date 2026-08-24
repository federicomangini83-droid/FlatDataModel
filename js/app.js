/* FinRep Flat Data Model Creator
 * Pyodide + storico CSV su GitHub con aggiornamento UI immediato.
 */

const $ = (id) => document.getElementById(id);
const fileInput = $("fileInput");
const processBtn = $("processBtn");
const spinner = $("spinner");
const errorBox = $("errorBox");
const resultBox = $("resultBox");
const recordCount = $("recordCount");
const resultTable = $("resultTable");
const downloadBtn = $("downloadBtn");
const saveGithubBtn = $("saveGithubBtn");
const startNameInput = $("startName");
const prefixInput = $("fileNamePrefix");
const endNameInput = $("endName");
const fileNamePreview = $("fileNamePreview");
const archiveStatus = $("archiveStatus");
const refreshHistoryBtn = $("refreshHistoryBtn");
const historyTable = $("historyTable");
const historyError = $("historyError");
const ghOwner = $("ghOwner");
const ghRepo = $("ghRepo");
const ghBranch = $("ghBranch");
const ghFolder = $("ghFolder");
const ghToken = $("ghToken");
const ghRemember = $("ghRemember");

let pyodide = null;
let initializationError = null;
let lastCSV = "";
let lastFileName = "output.csv";
let isProcessing = false;
let historyCache = new Map();

const TOKEN_KEY = "fdm_github_token";

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

function setBusy(isBusy, label = "Elabora file") {
  isProcessing = isBusy;
  spinner.hidden = !isBusy;
  spinner.classList.toggle("hidden", !isBusy);
  spinner.style.display = isBusy ? "inline-block" : "none";
  processBtn.disabled = isBusy;
  processBtn.textContent = isBusy ? label : "Elabora file";
}

function bytesLabel(size) {
  if (size < 1024) return `${size} B`;
  if (size < 1048576) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1048576).toFixed(1)} MB`;
}

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
    initializationError = error;
    processBtn.disabled = true;
    processBtn.title = "Motore Python non disponibile";
    console.error("Inizializzazione Python non riuscita", error);
    throw error;
  }
})();
pythonReady.catch(() => {});

function ghConfig() {
  return {
    owner: (ghOwner.value || "").trim(),
    repo: (ghRepo.value || "").trim(),
    branch: (ghBranch.value || "main").trim(),
    folder: (ghFolder.value || "csv-history").trim().replace(/^\/+|\/+$/g, ""),
    token: (ghToken.value || "").trim()
  };
}

function ghApiBase(config) {
  return `https://api.github.com/repos/${config.owner}/${config.repo}/contents/${config.folder}`;
}

function ghHeaders(config, authenticated = false) {
  const headers = {
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (authenticated && config.token) {
    headers.Authorization = `Bearer ${config.token}`;
  }
  return headers;
}

function toBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

async function ghGetSha(config, fileName) {
  const cached = historyCache.get(fileName);
  if (cached?.sha) return cached.sha;

  const url = `${ghApiBase(config)}/${encodeURIComponent(fileName)}?ref=${encodeURIComponent(config.branch)}`;
  const response = await fetch(url, { headers: ghHeaders(config, true) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Lettura file fallita: HTTP ${response.status}`);
  return (await response.json()).sha || null;
}

async function ghSaveCSV(config, fileName, csvText) {
  const existingSha = await ghGetSha(config, fileName);
  const url = `${ghApiBase(config)}/${encodeURIComponent(fileName)}`;
  const requestBody = {
    message: `${existingSha ? "Aggiorna" : "Aggiungi"} CSV: ${fileName}`,
    content: toBase64("\uFEFF" + csvText),
    branch: config.branch
  };
  if (existingSha) requestBody.sha = existingSha;

  const response = await fetch(url, {
    method: "PUT",
    headers: { ...ghHeaders(config, true), "Content-Type": "application/json" },
    body: JSON.stringify(requestBody)
  });

  if (!response.ok) {
    throw new Error(`Salvataggio fallito: HTTP ${response.status} ${await response.text()}`);
  }

  const result = await response.json();
  return {
    name: fileName,
    sha: result.content?.sha || existingSha,
    size: new Blob(["\uFEFF", csvText]).size,
    download_url: result.content?.download_url || null,
    type: "file",
    wasUpdate: Boolean(existingSha)
  };
}

async function ghListCSV(config) {
  const url = `${ghApiBase(config)}?ref=${encodeURIComponent(config.branch)}`;
  const response = await fetch(url, {
    headers: ghHeaders(config, Boolean(config.token)),
    cache: "no-store"
  });

  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Elenco non disponibile: HTTP ${response.status}`);

  const data = await response.json();
  if (!Array.isArray(data)) return [];
  return data
    .filter((item) => item.type === "file" && item.name.toLowerCase().endsWith(".csv"))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function ghDeleteCSV(config, item) {
  const url = `${ghApiBase(config)}/${encodeURIComponent(item.name)}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { ...ghHeaders(config, true), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Elimina CSV: ${item.name}`,
      sha: item.sha,
      branch: config.branch
    })
  });

  if (!response.ok) {
    throw new Error(`Eliminazione fallita: HTTP ${response.status} ${await response.text()}`);
  }
}

function ghDownload(item) {
  const config = ghConfig();
  const rawUrl = item.download_url ||
    `https://raw.githubusercontent.com/${config.owner}/${config.repo}/${config.branch}/${config.folder}/${encodeURIComponent(item.name)}`;
  const link = document.createElement("a");
  link.href = `${rawUrl}${rawUrl.includes("?") ? "&" : "?"}v=${Date.now()}`;
  link.download = item.name;
  link.target = "_blank";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function emptyHistoryMessage() {
  const body = historyTable.querySelector("tbody");
  if (historyCache.size || body.children.length) return;
  const row = document.createElement("tr");
  row.dataset.empty = "true";
  const cell = document.createElement("td");
  cell.colSpan = 3;
  cell.textContent = "Nessun CSV presente nello storico.";
  row.appendChild(cell);
  body.appendChild(row);
}

function removeEmptyMessage() {
  historyTable.querySelector('tbody tr[data-empty="true"]')?.remove();
}

function createHistoryRow(item) {
  const row = document.createElement("tr");
  row.dataset.fileName = item.name;

  const nameCell = document.createElement("td");
  nameCell.textContent = item.name;

  const sizeCell = document.createElement("td");
  sizeCell.textContent = bytesLabel(item.size || 0);

  const actionsCell = document.createElement("td");
  const actions = document.createElement("div");
  actions.className = "row-actions";

  const downloadButton = document.createElement("button");
  downloadButton.textContent = "Scarica";
  downloadButton.className = "secondary";
  downloadButton.onclick = () => ghDownload(historyCache.get(item.name) || item);

  const deleteButton = document.createElement("button");
  deleteButton.textContent = "Elimina";
  deleteButton.className = "danger";
  deleteButton.onclick = async () => {
    const config = ghConfig();
    const currentItem = historyCache.get(item.name) || item;
    if (!config.token) {
      alert("Inserisci il token GitHub per poter eliminare.");
      return;
    }
    if (!confirm(`Eliminare definitivamente \"${item.name}\" dallo storico?`)) return;

    // L'elemento sparisce subito. Se GitHub fallisce, viene ripristinato.
    const parent = row.parentNode;
    const nextSibling = row.nextSibling;
    row.remove();
    historyCache.delete(item.name);
    emptyHistoryMessage();

    try {
      await ghDeleteCSV(config, currentItem);
      archiveStatus.textContent = `CSV eliminato dallo storico: ${item.name}`;
    } catch (error) {
      removeEmptyMessage();
      if (nextSibling) parent.insertBefore(row, nextSibling);
      else parent.appendChild(row);
      historyCache.set(item.name, currentItem);
      alert(error.message);
    }
  };

  actions.append(downloadButton, deleteButton);
  actionsCell.appendChild(actions);
  row.append(nameCell, sizeCell, actionsCell);
  return row;
}

function upsertHistoryItem(item) {
  historyCache.set(item.name, item);
  removeEmptyMessage();

  const body = historyTable.querySelector("tbody");
  const existingRow = [...body.querySelectorAll("tr")]
    .find((row) => row.dataset.fileName === item.name);
  const newRow = createHistoryRow(item);

  if (existingRow) existingRow.replaceWith(newRow);
  else body.prepend(newRow);
}

function renderHistory(items) {
  const body = historyTable.querySelector("tbody");
  body.innerHTML = "";
  historyCache = new Map(items.map((item) => [item.name, item]));
  items.forEach((item) => body.appendChild(createHistoryRow(item)));
  emptyHistoryMessage();
}

async function loadHistory() {
  historyError.classList.add("hidden");
  const config = ghConfig();
  if (!config.owner || !config.repo) return;

  refreshHistoryBtn.disabled = true;
  refreshHistoryBtn.textContent = "Aggiornamento...";
  try {
    renderHistory(await ghListCSV(config));
  } catch (error) {
    historyError.textContent = `Storico non disponibile: ${error.message}`;
    historyError.classList.remove("hidden");
  } finally {
    refreshHistoryBtn.disabled = false;
    refreshHistoryBtn.textContent = "Aggiorna elenco";
  }
}

async function saveCurrentToGithub() {
  if (!lastCSV) {
    archiveStatus.textContent = "Genera prima un CSV.";
    return;
  }

  const config = ghConfig();
  if (!config.owner || !config.repo) {
    archiveStatus.textContent = "Configura owner e repository GitHub.";
    return;
  }
  if (!config.token) {
    archiveStatus.textContent = "Inserisci il token GitHub per salvare nello storico.";
    return;
  }

  saveGithubBtn.disabled = true;
  archiveStatus.textContent = "Salvataggio nello storico GitHub...";

  try {
    const item = await ghSaveCSV(config, lastFileName, lastCSV);

    // Aggiornamento immediato della tabella, senza ricaricare tutta la cartella.
    upsertHistoryItem(item);
    archiveStatus.textContent = `CSV ${item.wasUpdate ? "sovrascritto" : "salvato"}: ${item.name}`;
  } catch (error) {
    archiveStatus.textContent = `Errore nel salvataggio: ${error.message}`;
  } finally {
    saveGithubBtn.disabled = false;
  }
}

function loadSavedToken() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      ghToken.value = token;
      ghRemember.checked = true;
    }
  } catch (_) {}
}

ghRemember.addEventListener("change", () => {
  try {
    if (ghRemember.checked && ghToken.value.trim()) {
      localStorage.setItem(TOKEN_KEY, ghToken.value.trim());
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch (_) {}
});

ghToken.addEventListener("input", () => {
  if (ghRemember.checked) {
    try { localStorage.setItem(TOKEN_KEY, ghToken.value.trim()); } catch (_) {}
  }
});

[startNameInput, prefixInput, endNameInput].forEach((input) => {
  input.addEventListener("input", updatePreview);
});
refreshHistoryBtn.addEventListener("click", loadHistory);
saveGithubBtn.addEventListener("click", saveCurrentToGithub);

processBtn.addEventListener("click", async () => {
  if (isProcessing) return;

  clearError();
  resultBox.classList.add("hidden");
  archiveStatus.textContent = "";

  const file = fileInput.files[0];
  if (!file) {
    showError("Seleziona prima un file Excel .xlsx.");
    return;
  }

  const virtualPath = "/tmp/finrep_input.xlsx";
  setBusy(true, pyodide ? "Elaborazione..." : "Preparazione...");

  try {
    await pythonReady;
    if (initializationError) throw initializationError;
    processBtn.textContent = "Elaborazione...";

    pyodide.FS.writeFile(virtualPath, new Uint8Array(await file.arrayBuffer()));
    pyodide.globals.set("workbook_path_from_js", virtualPath);
    const result = JSON.parse(
      await pyodide.runPythonAsync("process_finrep(workbook_path_from_js)")
    );

    if (!result.records?.length) {
      showError("Elaborazione completata, ma nessun record valido è stato trovato.");
      return;
    }

    lastCSV = result.csv;
    lastFileName = outputName();
    renderTable(result.records);
    recordCount.textContent = `Record totali generati: ${result.count} (anteprima delle prime 200 righe)`;
    resultBox.classList.remove("hidden");
    archiveStatus.textContent = "CSV pronto. Puoi scaricarlo o salvarlo nello storico GitHub.";
  } catch (error) {
    console.error(error);
    const prefix = initializationError
      ? "Impossibile preparare il motore Python"
      : "Errore durante l'elaborazione Python";
    showError(`${prefix}: ${error.message}`);
  } finally {
    setBusy(false);
    try { if (pyodide?.FS) pyodide.FS.unlink(virtualPath); } catch (_) {}
    try { if (pyodide?.globals) pyodide.globals.delete("workbook_path_from_js"); } catch (_) {}
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

setBusy(false);
updatePreview();
loadSavedToken();
loadHistory();