# FinRep Flat Data Model Creator - Pyodide

Applicazione client-side che esegue nel browser il motore Python FinRep tramite Pyodide e genera un CSV flat da un workbook Excel.

## Applicazione online

L'applicazione si trova a questo link:

[https://federicomangini83-droid.github.io/FlatDataModel/](https://federicomangini83-droid.github.io/FlatDataModel/)

## Architettura

```text
index.html
├── css/style.css
├── js/app.js
└── python/finrep_processor.py
```

- `index.html` mantiene l'interfaccia web.
- `js/app.js` inizializza Pyodide, installa `openpyxl`, trasferisce il workbook nel filesystem virtuale e richiama Python.
- `python/finrep_processor.py` contiene la logica derivata dal motore Python originale.
- L'elaborazione avviene localmente nel browser. Il workbook non viene caricato su un server applicativo.

## Prima apertura

Alla prima apertura l'applicazione deve scaricare Pyodide e `openpyxl`. Attendere il messaggio **Motore Python pronto** prima di selezionare il workbook. È necessaria una connessione Internet per inizializzare il runtime.

## Pubblicazione su GitHub Pages

1. Eliminare i vecchi file del repository.
2. Caricare nella root del repository tutto il contenuto di questo pacchetto, mantenendo le cartelle `css`, `js`, `python` e `data`.
3. In `Settings > Pages`, pubblicare dal branch `main` e dalla cartella `/ (root)`.
4. Attendere il deployment e aggiornare la pagina con `Ctrl + F5`.

## Differenze rispetto allo script desktop

- sono stati rimossi i percorsi Windows fissi;
- il workbook viene letto dal filesystem virtuale di Pyodide;
- il CSV viene restituito a JavaScript e scaricato dal browser;
- `pandas` non è necessario: record e CSV sono generati con la libreria standard Python;
- `openpyxl` continua a gestire workbook, stili e colori;
- il parsing dei tre casi di mapping e le esclusioni di `Test_Formula` e `Macro` sono mantenuti.

## Struttura repository

```text
FlatDataModel/
├── index.html
├── README.md
├── .nojekyll
├── css/
│   └── style.css
├── js/
│   └── app.js
├── python/
│   ├── finrep_processor.py
│   └── FinRepFlatDataModel.original.py
└── data/
    └── config.example.json
```

## Debug

Se compare **Errore nel caricamento del motore Python**:

1. verificare la connessione Internet;
2. aprire gli strumenti sviluppatore del browser con `F12`;
3. controllare la scheda `Console`;
4. verificare che GitHub contenga `python/finrep_processor.py` con esattamente lo stesso uso di maiuscole e minuscole.
