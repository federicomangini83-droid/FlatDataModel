# FinRep Flat Data Model Creator

Applicazione client-side che elabora un workbook Excel FinRep nel browser tramite **Pyodide** e genera un CSV flat.
I CSV possono essere salvati nello **storico su GitHub** (cartella `csv-history/`), riscaricati o eliminati direttamente dall'applicazione.

## Applicazione online

https://federicomangini83-droid.github.io/FlatDataModel/

## Come funziona

1. L'utente carica un file `.xlsx`.
2. Il motore Python (`python/finrep_processor.py`) elabora il workbook nel browser.
3. L'applicazione mostra l'anteprima e permette il download locale del CSV.
4. Con un token GitHub, il CSV può essere salvato nella cartella `csv-history/`.
5. Lo storico mostra i CSV salvati, con download ed eliminazione.

Il nome del file è gestito dall'utente: **se salvi un CSV con un nome già esistente, quello vecchio viene sovrascritto.**

## Storico su GitHub

Lo storico usa la GitHub Contents API:

- **Salvataggio / sovrascrittura:** `PUT /repos/{owner}/{repo}/contents/csv-history/{file}`
- **Elenco:** `GET /repos/{owner}/{repo}/contents/csv-history`
- **Eliminazione:** `DELETE /repos/{owner}/{repo}/contents/csv-history/{file}`

### Token GitHub

Per salvare ed eliminare serve un **fine-grained personal access token** con:

- accesso al solo repository `FlatDataModel`;
- permesso **Contents: Read and write**.

Il token si inserisce nella sezione *Configurazione accesso GitHub* dell'applicazione.
Resta **solo nel browser**: non viene mai scritto nel repository. Con l'opzione "Ricorda il token" viene salvato in `localStorage` di quel browser.

> La sola lettura dello storico (elenco e download) su un repository pubblico funziona anche senza token.

## API per software terzi

Poiché i CSV sono file nel repository, altri software possono recuperarli senza autenticazione (repo pubblico):

**Elenco dei CSV:**
```
GET https://api.github.com/repos/federicomangini83-droid/FlatDataModel/contents/csv-history
```

**Contenuto raw di un CSV:**
```
GET https://raw.githubusercontent.com/federicomangini83-droid/FlatDataModel/main/csv-history/NOME_FILE.csv
```

## Struttura

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
│   └── finrep_processor.py
├── data/
│   └── config.example.json
└── csv-history/
    └── .gitkeep
```

## Pubblicazione su GitHub Pages

1. Carica nella root del repository il contenuto di questo pacchetto.
2. In `Settings → Pages`, pubblica dal branch `main`, cartella `/ (root)`.
3. Attendi il deployment e aggiorna con `Ctrl + F5`.

## Note e limiti

- Ogni salvataggio o eliminazione genera un commit nel repository.
- I CSV in un repository pubblico sono leggibili da chiunque.
- L'eliminazione rimuove il file dalla versione corrente; la cronologia Git può conservarne le versioni precedenti.
- Volumi previsti (pochi CSV al giorno, saltuariamente) ampiamente adatti a questo approccio.
