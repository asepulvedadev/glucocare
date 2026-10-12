# ADR-0004: PostgreSQL y API propios en el VPS AutoKing

- Estado: aceptado
- Fecha: 2026-10-12
- Motivo: decisión explícita del propietario del producto

## Decisión

GlucoCare no utilizará Supabase ni otro backend gestionado. La continuidad cloud
se ejecutará en el VPS AutoKing mediante:

- PostgreSQL 16 en un contenedor privado con volumen persistente;
- una API Node.js/TypeScript interna, expuesta solo por un puerto local del VPS
  hasta que exista un dominio TLS revisado;
- autenticación propia con sesiones opacas revocables y contraseñas derivadas con
  `scrypt`;
- registros de salud aislados por `patient_id` en la API y PostgreSQL;
- backups y restauración operados en el VPS, nunca desde el cliente móvil.

La aplicación sigue siendo local-first: SQLite es la fuente de verdad para
captura offline y la API solo añade sincronización, autenticación y estados de
alerta. Las alertas sin proveedor configurado permanecen en estado
`not_configured`; nunca se presentan como entregadas.

## Consecuencias

**A favor:** control de datos y región, sin dependencia de proveedor externo,
coste predecible y despliegue directo junto al resto de la infraestructura.

**Costes:** el equipo debe operar parches de PostgreSQL, backups cifrados,
rotación de secretos, TLS, monitoreo, recuperación ante desastre y pruebas de
autorización. El VPS compartido no debe exponer PostgreSQL a Internet.

## Límites de seguridad

- El puerto 5432 no se publica en el host.
- Las credenciales de PostgreSQL viven en `/srv/glucocare/.env` con permisos 600.
- El cliente móvil recibe únicamente `EXPO_PUBLIC_API_URL`; nunca recibe
  `DATABASE_URL` ni credenciales de base de datos.
- Cada consulta de datos pasa por la API y se filtra por la sesión autenticada.
- El release directo valida la salud de PostgreSQL y la API antes de terminar.

## Migración

La primera migración usa `health_records` JSONB con metadatos de entidad e
idempotencia de eventos. Esto permite reemplazar Supabase sin bloquear el modo
local. Las tablas clínicas normalizadas se pueden introducir como una migración
posterior cuando exista evidencia real de consultas multi-paciente y revisión
clínica; el límite de autorización por paciente no se relaja.
