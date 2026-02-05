# Database drift & driftshåndtering

## Konfiguration
- Sæt `DATABASE_URL` (fx `mysql://user:pass@localhost:3306/nemtsvar_app`) **eller**
  udfyld `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`.
- Connection pool styres via `DB_POOL_MAX`, `DB_CONNECTION_TIMEOUT_MS`.

## Migrationer
Kør migrationer:
```bash
npm run migrate
```

Rul seneste migration tilbage:
```bash
npm run migrate:rollback
```

## Seed-data
Der er i øjeblikket ingen seed-scripts i repoet. Hvis du har behov for at flytte data ind i
MySQL, anbefales det at bruge en engangs-migrering eller importere via `mysqldump`/`mysql`.

## Backup & restore
Tag en backup:
```bash
mysqldump --single-transaction --routines --triggers "$DB_NAME" > backup.sql
```

Restore:
```bash
mysql "$DB_NAME" < backup.sql
```

## Connection limits
- Sæt `DB_POOL_MAX` lavere end MariaDB `max_connections` minus øvrige services.
- Ved container setups: sørg for at `DB_POOL_MAX` matcher antallet af app-instanser.
