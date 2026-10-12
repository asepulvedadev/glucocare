# GlucoCare API y PostgreSQL

Este servicio expone autenticación, sincronización idempotente, invitaciones de
contactos y registro de estados de alertas sobre PostgreSQL propio. La captura
clínica continúa funcionando sin red en SQLite.

Las invitaciones solo habilitan alertas después de que la persona de apoyo abre
el enlace de aceptación. Las rutas de autenticación, invitaciones y alertas
tienen límites básicos por IP o paciente; un despliegue con varias réplicas
debe mover este contador a un almacén compartido antes de abrir tráfico público.

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
| `RESEND_API_KEY`, `RESEND_FROM` | habilitan el adaptador de correo; déjalas vacías para mantener `not_configured` |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM` | habilitan el adaptador SMS; déjalas vacías para mantener `not_configured` |
| `ALERT_WORKER_INTERVAL_MS`, `ALERT_WORKER_BATCH_SIZE`, `ALERT_WORKER_MAX_ATTEMPTS` | frecuencia, lote y reintentos del worker privado |
| `ALERT_WORKER_HEARTBEAT_FILE` | ruta writable del heartbeat usado por el healthcheck del contenedor; por defecto `/tmp/glucocare-alert-worker.heartbeat` |

El contenedor de producción se ejecuta sin root y con el filesystem de solo
lectura. PostgreSQL solo está en la red interna de Compose.

## Worker privado de alertas

`dist/alertWorker.js` se ejecuta como `glucocare-alert-worker` sin puerto
publicado. Reclama entregas con `SKIP LOCKED`, reintenta errores transitorios
con backoff y solo cambia a `provider_accepted` cuando el proveedor devuelve un
identificador. No convierte esa aceptación en `delivered`: los callbacks de
entrega requieren una integración y una revisión operacional. Sin credenciales
o sin un dato de contacto válido, la entrega queda explícitamente en
`not_configured`.
