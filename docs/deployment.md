# Deployment & drift

## Build af frontend
```bash
npm install
npm run build
```

Bygningen producerer en `dist/`-mappe, som kan serveres direkte af en statisk webserver
eller via Express som beskrevet nedenfor.

## cPanel-setup (nemtsvar.dk)
Opsætningen er delt i en statisk frontend og en Node-backend:

- **Frontend**: Upload indholdet af `dist/` til `public_html/` på serveren.
- **Backend**: Læg hele repoet (inkl. `server/`) i mappen `app/`.

### Anbefalet routing
Frontend-koden kalder `/api/...` på samme domæne. Derfor skal `/api` pege på Node-appen:

1. I cPanel → **Setup Node.js App**:
   - Application root: `/home/<user>/app`
   - Application URL: `https://nemtsvar.dk/api`
   - Startup file: `server/index.js`
   - Node.js version: `20.x`
2. Hvis cPanel ikke tillader `/api` som URL, så opret en reverse proxy i
   `public_html/.htaccess`, som videresender `/api` til Node-porten.

### Alternativ (Express serverer frontend)
Hvis du ønsker at backend også serverer frontend:

```bash
SERVE_STATIC_DIST=true \
DIST_DIR=/home/<user>/public_html \
node server/index.js
```

## Server `dist/` via Express (fallback til index.html)
Hvis du vil lade Express servere den byggede frontend, kan du sætte
`SERVE_STATIC_DIST=true` (og evt. `DIST_DIR` hvis mappen ikke hedder `dist`).

Eksempel (cPanel eller andet Node-setup):
```bash
SERVE_STATIC_DIST=true \
DIST_DIR=/home/<user>/app/dist \
node server/index.js
```

I koden svarer det til noget i stil med:
```js
app.use(express.static("dist"));
app.get("*", (req, res) => {
  res.sendFile(path.join("dist", "index.html"));
});
```

## Migrationer mod MySQL
Standarddatabasen er sat til `DB_NAME=nemtsvar_app`.

Kør migrationer:
```bash
DB_NAME=nemtsvar_app npm run migrate
```

Rollback seneste migration:
```bash
DB_NAME=nemtsvar_app npm run migrate:rollback
```

## Miljøvariabler (DB, Stripe, JWT, OpenAI)

### Database
Sæt enten én samlet URL eller individuelle værdier:
- `DATABASE_URL=mysql://user:pass@localhost:3306/nemtsvar_app`
- eller `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`

Eksempel:
```bash
DB_HOST=localhost
DB_PORT=3306
DB_USER=nemtsvar_Lars2
DB_PASSWORD=<indsæt-password>
DB_NAME=nemtsvar_app
```

#### Preprod (SSL til MySQL)
Preprod kræver SSL for databasen. Sæt følgende miljøvariabler:
- `DB_SSL=true`
- `DB_SSL_CA` (CA-certifikat i PEM-format)
- `DB_SSL_REJECT_UNAUTHORIZED` (`true` anbefales; sæt `false` hvis leverandøren kræver det)

### Stripe
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_ID`
- `STRIPE_PUBLISHABLE_KEY`
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`
- `STRIPE_PORTAL_RETURN_URL`

### JWT / auth cookies
- `JWT_SECRET` (påkrævet i production – serveren starter ikke uden)
- `COOKIE_NAME` (default: `yes_auth`)
- `AUTH_COOKIE_SECURE` (`true` tvinger secure cookies)

### CORS (production)
Sæt `CORS_ORIGIN` til en kommasepareret liste med alle tilladte frontend-domæner.
Det er vigtigt, at domænet matcher den faktiske frontend-URL, ellers blokerer
browseren auth-kald pga. CORS.

Eksempel:
```bash
CORS_ORIGIN=https://www.nemtsvar.dk,https://nemtsvar.dk
```

### OpenAI
Server-side:
- `OPENAI_API_KEY`
- `OPENAI_MODEL` (optional, default `gpt-5-mini`)

Client-side (direkte mode):
- `VITE_OPENAI_API_KEY`
- `VITE_USE_DIRECT_OPENAI=true`
