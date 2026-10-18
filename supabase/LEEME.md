# Señales en la nube (Supabase)

Calcula las señales de **DMCRIPTO ORDER BLOCK** y del **OSCILADOR** con velas públicas de Bybit/OKX/Binance
y las envía a tu webhook cada 5 minutos, sin TradingView y sin tu PC.

## Instalar (una sola vez)

Necesitas la [CLI de Supabase](https://supabase.com/docs/guides/cli) y haber hecho `supabase login`.
Desde esta carpeta (`smart ob fvg`):

```bash
supabase link --project-ref TU_REF
supabase db push
supabase secrets set SIGNAL_WEBHOOK_URL="TU_URL_DEL_WEBHOOK"
supabase functions deploy senales-ob
```

`TU_URL_DEL_WEBHOOK` es la URL de tu función `tradingview-webhook` (la que lleva la clave al final).
Va solo como secreto de Supabase: no se guarda en ningún archivo.

## Probar sin enviar nada

Abre en el navegador (o con curl y tu anon key en `Authorization: Bearer ...`):

```
https://TU_REF.supabase.co/functions/v1/senales-ob?dry=1&moneda=BTC
```

Devuelve el estado de los indicadores y las señales que enviaría, sin enviar ni guardar nada.

## Activar el programador

Edita `programar_cron.sql` (TU_REF y TU_ANON_KEY) y ejecútalo en el SQL Editor de Supabase.

## Qué se envía

JSON por POST, por ejemplo:

```json
{"fuente":"OB","lado":"LONG","simbolo":"BTCUSDT.P","tf":"5","entrada":81200,"target":81900,"tp2":82250,"tp3":82700,"sl":80600,"rr":1.2,"hora":"2026-10-18T05:05:00.000Z","datos":"Bybit"}
{"fuente":"OSC","lado":"SHORT","simbolo":"ETHUSDT.P","tf":"5","entrada":2417.5,"puntaje":75,"grado":"A","hora":"...","datos":"Bybit"}
```

## Ajustes (`senales-ob/config.ts`)

Monedas, temporalidad (`TF_MIN`), enviar OB y/o oscilador, y `MIN_PUNTAJE_OSC` (50 = solo grados A/B).
Después de cambiar algo: `supabase functions deploy senales-ob`.

## Diferencias con TradingView

- Los precios y el volumen vienen de Bybit/OKX/Binance, no de LBank: las señales pueden diferir un poco.
- SOXS, MSTR, SPCX, SILVER, XTI, SPX500 no existen en esos exchanges y no están incluidos.
- El código replica la lógica con los valores por defecto de los `.pine` (filtros, zonas, TP/SL, puntaje del oscilador).
  Si cambias parámetros en TradingView, hay que cambiarlos también en `motor.ts`.
- Con los filtros por defecto, las señales del Order Block son poco frecuentes (el oscilador debe estar en
  sobreventa/sobrecompra justo al tocar la zona). Es lo esperado, no un fallo.
- Prueba local (sin Supabase): `node probar.ts BTC 5` dentro de `senales-ob/` (Node 22+).
