# GlucoCare API y PostgreSQL

Este servicio expone autenticación, sincronización idempotente, invitaciones de
contactos y registro de estados de alertas sobre PostgreSQL propio. La captura
clínica continúa funcionando sin red en SQLite.

## Desarrollo local

```bash
docker run --rm --name glucocare-postgres \
  -e POSTGRES_DB=glucocare \
  -e POSTGRES_USER=glucocare_app \
  -e POSTGRES_PASSWORD=local-only-password \
  -p 5432:5432 postgres:16-alpine

cd server
npm ci
DATABASE_URL=postgresql://glucocare_app:local-only-password@127.0.0.1:5432/glucocare \
  PORT=8084 npm run dev
```

## Variables

| Variable | Propósito |
|---|---|
| `DATABASE_URL` | conexión privada a PostgreSQL (alternativa compacta) |
| `DATABASE_HOST`, `DATABASE_PORT`, `DATABASE_NAME`, `DATABASE_USER`, `DATABASE_PASSWORD` | conexión por campos; preferida en Compose para no depender del escaping de la contraseña |
| `PORT` | puerto HTTP interno, por defecto 8080 |
| `SESSION_DAYS` | duración máxima de una sesión revocable |
| `PUBLIC_API_URL` | URL usada en invitaciones; no contiene secretos |
| `CORS_ORIGIN` | origen web permitido; Compose lo recibe como `GLUCOCARE_CORS_ORIGIN` y debe ser concreto en producción |

El contenedor de producción se ejecuta sin root y con el filesystem de solo
lectura. PostgreSQL solo está en la red interna de Compose.
