# Flat Data Model: Login Worker + Pyodide

Applicazione protetta da Cloudflare Worker. Tutti gli asset, incluso il motore Python, richiedono una sessione valida. Dopo il login, Pyodide viene inizializzato nel browser in background; il pulsante **Elabora file** rimane disabilitato e grigio fino a quando il motore è pronto.

## Prerequisiti

- account Cloudflare;
- Node.js installato;
- repository GitHub privato opzionale per conservare il progetto.

## 1. Installazione

```bash
npm install
npx wrangler login
```

## 2. Generazione di un utente

```bash
npm run user -- federico UnaPasswordLungaESicura
```

Copia l'oggetto JSON generato dentro l'array `users` di un JSON complessivo:

```json
{
  "users": [
    {
      "username": "federico",
      "enabled": true,
      "salt": "...",
      "iterations": 310000,
      "passwordHash": "..."
    }
  ]
}
```

## 3. Configurazione dei secret

Imposta il JSON utenti come secret:

```bash
npx wrangler secret put USERS_JSON
```

Quando Wrangler lo richiede, incolla l'intero JSON su una sola riga.

Genera una chiave casuale, per esempio:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Poi salvala:

```bash
npx wrangler secret put SESSION_SECRET
```

Non inserire password, `USERS_JSON` o `SESSION_SECRET` nel repository.

## 4. Test locale

Crea `.dev.vars` senza effettuare commit:

```dotenv
USERS_JSON={"users":[...]}
SESSION_SECRET=chiave-casuale-lunga
```

Avvia:

```bash
npm run dev
```

## 5. Deployment

```bash
npm run deploy
```

Wrangler restituisce l'URL `workers.dev`. Aprendo il link compare obbligatoriamente la pagina di login.

## Gestione utenti

- Per aggiungere un utente, genera il nuovo oggetto e aggiungilo all'array `users`.
- Per disabilitarlo, imposta `"enabled": false`.
- Dopo ogni modifica, aggiorna `USERS_JSON` con `npx wrangler secret put USERS_JSON`.
- Le sessioni durano 8 ore. Il logout è disponibile all'indirizzo `/auth/logout`.

## Sicurezza implementata

- password memorizzate come PBKDF2-HMAC-SHA-256 con salt casuale e 310.000 iterazioni;
- cookie firmato HMAC;
- cookie `HttpOnly`, `Secure`, `SameSite=Strict`;
- sessione con scadenza di 8 ore;
- tutti gli asset passano dal Worker grazie a `run_worker_first: true`;
- secret esclusi dal repository.

## Struttura

```text
public/               applicazione Pyodide protetta
src/worker.js         login, sessione e protezione asset
scripts/generate-user.mjs
gitignore
package.json
wrangler.jsonc
users.example.json
README.md
```
