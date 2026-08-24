# FlatDataModel con storico CSV e REST API

Link applicazione https://federicomangini83-droid.github.io/FlatDataModel/

Il pacchetto contiene:

- `frontend/`: applicazione da pubblicare su GitHub Pages;
- `api/`: Cloudflare Worker REST API;
- R2 per archiviare i CSV;
- D1 per metadati e storico.

## 1. Creazione API Cloudflare

```bash
cd api
npm install
npx wrangler login
npx wrangler r2 bucket create flat-data-model-csv
npx wrangler d1 create flat-data-model-history
```

Copia il `database_id` restituito da D1 dentro `api/wrangler.jsonc`, sostituendo `REPLACE_WITH_D1_DATABASE_ID`.

Crea una API key casuale:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Salvala come secret:

```bash
npx wrangler secret put API_KEY
```

Applica la migrazione e pubblica:

```bash
npm run migrate
npm run deploy
```

Conserva URL Worker e API key.

## 2. Configurazione frontend

In `frontend/index.html`, sostituisci:

```javascript
window.APP_CONFIG = {
  apiBaseUrl: "https://YOUR-WORKER.workers.dev",
  apiKey: "CHANGE_ME"
};
```

con URL e chiave reali.

> Nota: la chiave inserita nel frontend è leggibile dal browser. È adatta a un prototipo operativo, non a una protezione forte. Per integrazioni software, crea in futuro una chiave separata e un sistema di autenticazione server-side.

Carica **il contenuto della cartella `frontend`** nella root del repository GitHub Pages.

## Endpoint

```text
POST   /api/csv
GET    /api/csv
GET    /api/csv/{id}/download
DELETE /api/csv/{id}
GET    /api/csv/latest/download
GET    /api/csv/latest/download?fileName=FR_TGK_MAPPING_420.csv
```

Tutte le chiamate richiedono:

```http
Authorization: Bearer API_KEY
```

Upload CSV:

```http
POST /api/csv
Content-Type: text/csv
X-File-Name: FR_TGK_MAPPING_420.csv
X-Record-Count: 13998
```

## Cancellazione

La cancellazione è fisica: elimina sia l'oggetto R2 sia la riga D1.

## CORS

`ALLOWED_ORIGIN` è impostato su:

```text
https://federicomangini83-droid.github.io
```

Se cambi hosting, aggiorna `api/wrangler.jsonc`.
