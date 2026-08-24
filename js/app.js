/* ==========================================================================
   FinRep Flat Data Model Creator
   - Elaborazione Excel nel browser con Pyodide + openpyxl
   - Storico CSV salvato nella cartella csv-history/ del repository GitHub
   - Salvataggio, elenco, download e cancellazione tramite GitHub Contents API
   ========================================================================== */

/* ---------- Riferimenti DOM ---------- */
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

/* ---------- Stato ---------- */
let pyodide = null;
let initializationError = null;
let lastCSV = "";
let lastFileName = "output.csv";
let isProcessing = false;

const TOKEN_KEY = "fdm_github_token";

/* ---------- Utility UI ---------- */
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
function bytesLabel(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

/* ---------- Anteprima tabella ---------- */
function renderTable(records) {
  resultTable.innerHTML = "";
  if (!records.length) return;

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
  records.slice(0, 200).forEach((rec) => {
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

/* ---------- Inizializzazione Pyodide ---------- */
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

/* ---------- GitHub Contents API ---------- */
function ghConfig() {
  return {
    owner: (ghOwner.value || "").trim(),
    repo: (ghRepo.value || "").trim(),
    branch: (ghBranch.value || "main").trim(),
    folder: (ghFolder.value || "csv-history").trim().replace(/^\/+|\/+$/g, ""),
    token: (ghToken.value || "").trim()
  };
}
function ghApiBase(cfg) {
  return `https://api.github.com/repos/${cfg.owner}/${cfg.repo}/contents/${cfg.folder}`;
}
function ghHeaders(cfg, withAuth) {
  const h = {
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };
  if (withAuth && cfg.token) h["Authorization"] = `Bearer ${cfg.token}`;
  return h;
}
// UTF-8 safe base64
function toBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary);
}

/* Recupera lo sha di un file esistente (per update/delete). Null se non esiste. */
async function ghGetSha(cfg, fileName) {
  const url = `${ghApiBase(cfg)}/${encodeURIComponent(fileName)}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await fetch(url, { headers: ghHeaders(cfg, true) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Lettura file fallita: HTTP ${res.status}`);
  const data = await res.json();
  return data.sha || null;
}

/* Salva (crea o sovrascrive) un CSV nella cartella dello storico. */
async function ghSaveCSV(cfg, fileName, csvText) {
  const existingSha = await ghGetSha(cfg, fileName);
  const url = `${ghApiBase(cfg)}/${encodeURIComponent(fileName)}`;
  const body = {
    message: `${existingSha ? "Aggiorna" : "Aggiungi"} CSV: ${fileName}`,
    content: toBase64("\uFEFF" + csvText),
    branch: cfg.branch
  };
  if (existingSha) body.sha = existingSha;

  const res = await fetch(url, {
    method: "PUT",
    headers: { ...ghHeaders(cfg, true), "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Salvataggio fallito: HTTP ${res.status} ${detail}`);
  }
  return existingSha ? "aggiornato" : "creato";
}

/* Elenca i CSV presenti nella cartella. Funziona su repo pubblici anche senza token. */
async function ghListCSV(cfg) {
  const url = `${ghApiBase(cfg)}?ref=${encodeURIComponent(cfg.branch)}`;
  const res = await fetch(url, { headers: ghHeaders(cfg, !!cfg.token) });
  if (res.status === 404) return [];
  if (!res.ok) throw new Error(`Elenco non disponibile: HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data)) return [];
  return data
    .filter((it) => it.type === "file" && it.name.toLowerCase().endsWith(".csv"))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* Elimina un CSV dallo storico. */
async function ghDeleteCSV(cfg, fileName, sha) {
  const url = `${ghApiBase(cfg)}/${encodeURIComponent(fileName)}`;
  const res = await fetch(url, {
    method: "DELETE",
    headers: { ...ghHeaders(cfg, true), "Content-Type": "application/json" },
    body: JSON.stringify({
      message: `Elimina CSV: ${fileName}`,
      sha,
      branch: cfg.branch
    })
  });
  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Eliminazione fallita: HTTP ${res.status} ${detail}`);
  }
}

/* Scarica un file dallo storico (nuova tab sul download_url raw). */
function ghDownload(item) {
  const a = document.createElement("a");
  a.href = item.download_url;
  a.download = item.name;
  a.target = "_blank";
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/* ---------- Storico: rendering ---------- */
async function loadHistory() {
  const body = historyTable.querySelector("tbody");
  body.innerHTML = "";
  historyError.classList.add("hidden");

  const cfg = ghConfig();
  if (!cfg.owner || !cfg.repo) return;

  try {
    const items = await ghListCSV(cfg);
    if (!items.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 3;
      td.textContent = "Nessun CSV presente nello storico.";
      tr.appendChild(td);
      body.appendChild(tr);
      return;
    }

    items.forEach((item) => {
      const tr = document.createElement("tr");

      const tdName = document.createElement("td");
      tdName.textContent = item.name;
      tr.appendChild(tdName);

      const tdSize = document.createElement("td");
      tdSize.textContent = bytesLabel(item.size || 0);
      tr.appendChild(tdSize);

      const tdActions = document.createElement("td");
      const box = document.createElement("div");
      box.className = "row-actions";

      const dl = document.createElement("button");
      dl.textContent = "Scarica";
      dl.className = "secondary";
      dl.onclick = () => ghDownload(item);

      const del = document.createElement("button");
      del.textContent = "Elimina";
      del.className = "danger";
      del.onclick = async () => {
        const c = ghConfig();
        if (!c.token) {
          alert("Inserisci il token GitHub nella sezione di configurazione per poter eliminare.");
          return;
        }
        if (!confirm(`Eliminare definitivamente "${item.name}" dallo storico?`)) return;
        del.disabled = true;
        try {
          await ghDeleteCSV(c, item.name, item.sha);
          await loadHistory();
        } catch (e) {
          alert(e.message);
          del.disabled = false;
        }
      };

      box.append(dl, del);
      tdActions.appendChild(box);
      tr.appendChild(tdActions);
      body.appendChild(tr);
    });
  } catch (e) {
    historyError.textContent = `Storico non disponibile: ${e.message}`;
    historyError.classList.remove("hidden");
  }
}

/* ---------- Salvataggio del CSV corrente su GitHub ---------- */
async function saveCurrentToGithub() {
  if (!lastCSV) {
    archiveStatus.textContent = "Genera prima un CSV.";
    return;
  }
  const cfg = ghConfig();
  if (!cfg.owner || !cfg.repo) {
    archiveStatus.textContent = "Configura owner e repository GitHub.";
    return;
  }
  if (!cfg.token) {
    archiveStatus.textContent = "Inserisci il token GitHub per salvare nello storico.";
    return;
  }

  saveGithubBtn.disabled = true;
  archiveStatus.textContent = "Salvataggio nello storico GitHub...";
  try {
    const esito = await ghSaveCSV(cfg, lastFileName, lastCSV);
    archiveStatus.textContent = `CSV ${esito} nello storico: ${lastFileName}`;
    await loadHistory();
  } catch (e) {
    archiveStatus.textContent = `Errore nel salvataggio: ${e.message}`;
  } finally {
    saveGithubBtn.disabled = false;
  }
}

/* ---------- Persistenza opzionale del token ---------- */
function loadSavedToken() {
  try {
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) {
      ghToken.value = saved;
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

/* ---------- Eventi ---------- */
[startNameInput, prefixInput, endNameInput].forEach((i) =>
  i.addEventListener("input", updatePreview)
);
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
    const resultJson = await pyodide.runPythonAsync("process_finrep(workbook_path_from_js)");
    const result = JSON.parse(resultJson);

    if (!result.records || result.records.length === 0) {
      showError("Elaborazione completata, ma nessun record valido è stato trovato. Verifica struttura, stili e contenuto del workbook.");
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
    try { if (pyodide && pyodide.FS) pyodide.FS.unlink(virtualPath); } catch (_) {}
    try { if (pyodide && pyodide.globals) pyodide.globals.delete("workbook_path_from_js"); } catch (_) {}
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

/* ---------- Avvio ---------- */
setBusy(false);
updatePreview();
loadSavedToken();
loadHistory();
