# Señales en la nube (Supabase)

Calcula las señales de **DMCRIPTO ORDER BLOCK** con velas públicas (Bybit, con OKX y Binance de respaldo)
y las envía a tu webhook `tradingview-webhook` cada 5 minutos, sin TradingView y sin PC.

Flujo: `pg_cron` (cada 5 min) → función `senales-ob` → webhook de la app → operación + Telegram + comunidad.

## Qué vigila

- Tus monedas (`MONEDAS`) **más** el Top 40 por volumen en 24 h (`TOP_VOLUMEN`; 0 lo desactiva).
- Solo señales del Order Block. El oscilador está apagado (`ENVIAR_OSC`): el webhook exige TP y SL y el oscilador no los da.
- Se envía un solo TP (`ENVIAR_TPS_EXTRA = false`) y el símbolo sin `.P` (la tarjeta muestra `BTC/USDT`).
- Filtro de desbloqueos (modo cuidadoso de VELTRIX): no envía LONG si la tabla `token_unlocks` tiene un
  desbloqueo ≥ 5 % en los próximos 7 días (`FILTRO_DESBLOQUEOS`, `DESBLOQUEO_DIAS`, `DESBLOQUEO_MIN_PCT`).

Todo se ajusta en `functions/senales-ob/config.ts`. Después de cambiar algo hay que volver a desplegar.

## Instalación (ya hecha en el proyecto hbkveqilauhqahwuuasc)

En PowerShell usa `npx.cmd` en lugar de `npx` (la política de scripts bloquea `npx.ps1`).

1. SQL Editor: ejecutar `migrations/20261018000000_senales_enviadas.sql` (tabla anti-duplicados).
2. `npx.cmd supabase@latest login`, `init`, `link --project-ref hbkveqilauhqahwuuasc`.
3. Secretos (no se guardan en ningún archivo):
   - `npx.cmd supabase@latest secrets set SIGNAL_WEBHOOK_URL="<URL completa del webhook>"`
   - `npx.cmd supabase@latest secrets set CRON_TOKEN="<código aleatorio largo>"`
4. Desplegar **sin** verificación JWT (la protección es el código `?k=`):
   `npx.cmd supabase@latest functions deploy senales-ob --no-verify-jwt`
5. SQL Editor: ejecutar `programar_cron.sql` cambiando `TU_CODIGO` por el valor de `CRON_TOKEN`.
   (No uses una clave JWT en el SQL: el editor de Supabase la altera y el programador recibe 401.)

## Probar sin enviar nada

```
curl.exe "https://hbkveqilauhqahwuuasc.supabase.co/functions/v1/senales-ob?dry=1&moneda=BTC&k=<CRON_TOKEN>"
```

Sin `moneda` revisa toda la lista. La respuesta incluye `desbloqueos` (cuántos en la ventana), `omitidas` y `enviaria`.
Sin el código `?k=` responde 401. Prueba local sin Supabase: `node probar.ts BTC 5` dentro de `functions/senales-ob/`.

## Ver que corre

```sql
select id, status_code, left(content::text, 400) as respuesta, created
from net._http_response where content::text like '%monedas%' order by created desc limit 5;
```

Detener: `select cron.unschedule('senales-ob-5m');`

## Diferencias con TradingView

- Los precios y el volumen vienen de Bybit/OKX/Binance, no de LBank: las señales pueden diferir un poco.
- SOXS, MSTR, SPCX, SILVER, XTI y SPX500 solo existen en LBank y no se cubren.
- El motor (`motor.ts`) replica los valores por defecto de los `.pine`; si cambias parámetros en TradingView, cámbialos también allí.
- Con los filtros por defecto las señales del Order Block son poco frecuentes: el oscilador debe estar en
  sobreventa/sobrecompra justo al tocar la zona. Es lo esperado, no un fallo.

## Seguridad

La URL del webhook y el código `?k=` son contraseñas: quien los tenga puede dar de alta operaciones o lanzar la función.
Si se filtran, regenera la clave del webhook en la app y cambia `CRON_TOKEN` (y el SQL del programador).
