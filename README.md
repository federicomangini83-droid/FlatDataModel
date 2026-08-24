# FinRep Flat Data Model Creator

Applicazione **client-side** (HTML + CSS + JavaScript) che trasforma un file Excel strutturato (workbook FinRep con più fogli) in un file CSV "flat" di mapping.
L'applicazione si trova a questo link https://federicomangini83-droid.github.io/FlatDataModel/.

## Come funziona

- Tutta l'elaborazione avviene **nel browser**: il file Excel caricato non viene mai inviato a un server.
- Il parsing del file `.xlsx` è gestito da [SheetJS](https://sheetjs.com/) (libreria caricata via CDN in `index.html`).
- Il file CSV di output viene generato in memoria e scaricato direttamente dal browser.

## Utilizzo

1. Apri `index.html` in un browser moderno (Chrome, Edge, Firefox), oppure pubblica la cartella su **GitHub Pages** (Settings → Pages → seleziona branch `main` e cartella `/root`).
2. Carica il file Excel `.xlsx`.
3. Imposta i parametri:
   - **Start name** (default `FR_`)
   - **End name** (default `_420`)
   - **Nome file (prefix)** (default `TGK_MAPPING`)
4. Clicca **Elabora file**.
5. Visualizza l'anteprima dei risultati e clicca **Scarica CSV** per ottenere il file `{start_name}{prefix}{end_name}.csv`.

## Limitazioni note

- SheetJS Community Edition legge gli stili/colori di riempimento cella (`fgColor.rgb`) tramite l'opzione `cellStyles: true`, ma il supporto agli stili non è identico al 100% a quello di `openpyxl`. In casi di formattazioni Excel molto particolari (temi, gradient fill, ecc.) potrebbe essere necessario un controllo manuale del risultato.
- L'anteprima in pagina è limitata alle prime 200 righe per motivi di performance; il CSV scaricato contiene invece tutti i record.

## Struttura repository

```
FlatDataModelCreation/
├── index.html
├── css/style.css
├── js/app.js                # gestione UI
├── js/finrepProcessor.js     # logica di parsing/elaborazione
├── data/config.example.json  # esempio config statica (opzionale)
└── README.md
```
