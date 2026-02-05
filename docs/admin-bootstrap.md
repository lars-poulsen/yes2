# Admin-bruger bootstrap (server)

Backenden kan automatisk oprette eller opdatere en admin-bruger ved opstart ved hjælp af miljøvariabler.

## Miljøvariabler

- `ADMIN_EMAIL`: Email-adressen der skal bruges til admin-brugeren.
- `ADMIN_PASSWORD`: Adgangskoden til admin-brugeren (min. 8 tegn).

Når begge variabler er sat:

- Hvis brugeren ikke findes, oprettes den med rollen `admin`.
- Hvis brugeren findes, men ikke er admin, opgraderes rollen til `admin`.

## Eksempel

```bash
ADMIN_EMAIL=admin@example.com \
ADMIN_PASSWORD=supersecret \
node server/index.js
```
