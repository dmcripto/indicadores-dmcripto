// Edge Function: calcula las señales de DMCRIPTO ORDER BLOCK + OSCILADOR con velas públicas
// y las envía a tu webhook (SIGNAL_WEBHOOK_URL). Se ejecuta cada 5 minutos con pg_cron.
//
//   ?dry=1        calcula y devuelve lo que enviaría, sin enviar ni guardar nada
//   ?moneda=BTC   solo esa moneda

import { createClient } from "jsr:@supabase/supabase-js@2";
import { ENVIAR_OB, ENVIAR_OSC, ENVIAR_TPS_EXTRA, MIN_PUNTAJE_OSC, MONEDAS, TF_MIN, VENTANA_VELAS } from "./config.ts";
import { obtenerVelas } from "./fuentes.ts";
import { calcular, porTemporalidad, type Senal } from "./motor.ts";

const redondear = (x?: number) => (x === undefined || Number.isNaN(x) ? undefined : Number(x.toPrecision(7)));

async function procesar(base: string) {
  const T = porTemporalidad(TF_MIN);
  const [ltf, htf] = await Promise.all([obtenerVelas(base, TF_MIN), obtenerVelas(base, T.htfMin, true)]);
  const n = ltf.velas.length;
  const { senales, estado } = calcular(ltf.velas, htf.velas, TF_MIN);
  const nuevas = senales.filter((s: Senal) => s.i >= n - VENTANA_VELAS && ((s.fuente === "OB" && ENVIAR_OB) || (s.fuente === "OSC" && ENVIAR_OSC && (s.puntaje ?? 0) >= MIN_PUNTAJE_OSC)));
  return {
    base,
    estado,
    datos: ltf.fuente,
    senales: nuevas.map((s: Senal) => ({
      clave: `${s.fuente}|${base}|${TF_MIN}|${s.lado}|${s.t}`,
      // Nombres que entiende tradingview-webhook de VELTRIX: symbol, direction, entry, tp, tp2, tp3, sl
      payload: {
        symbol: `${base}USDT.P`,
        direction: s.lado,
        entry: redondear(s.entrada),
        tp: redondear(s.target),
        tp2: ENVIAR_TPS_EXTRA ? redondear(s.tp2) : undefined,
        tp3: ENVIAR_TPS_EXTRA ? redondear(s.tp3) : undefined,
        sl: redondear(s.sl),
        fuente: s.fuente,
        tf: String(TF_MIN),
        rr: s.rr,
        puntaje: s.puntaje,
        grado: s.grado,
        hora: new Date(s.t + TF_MIN * 60_000).toISOString(),
        datos: ltf.fuente,
      },
    })),
  };
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  // Acceso: código secreto en ?k=... (la función se despliega sin verificación JWT)
  const token = Deno.env.get("CRON_TOKEN");
  if (!token || url.searchParams.get("k") !== token) return Response.json({ error: "no autorizado" }, { status: 401 });
  const dry = url.searchParams.get("dry") === "1";
  const unica = url.searchParams.get("moneda")?.toUpperCase();
  const webhook = Deno.env.get("SIGNAL_WEBHOOK_URL");
  if (!dry && !webhook) return Response.json({ error: "Falta el secreto SIGNAL_WEBHOOK_URL" }, { status: 500 });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const lista = unica ? [unica] : MONEDAS;
  const resumen: Record<string, unknown>[] = [];
  const errores: Record<string, string> = {};

  // Lotes de 5 para no saturar las APIs públicas
  for (let k = 0; k < lista.length; k += 5) {
    const lote = lista.slice(k, k + 5);
    const res = await Promise.allSettled(lote.map(procesar));
    for (let j = 0; j < res.length; j++) {
      const r = res[j];
      if (r.status === "rejected") {
        errores[lote[j]] = String(r.reason?.message ?? r.reason).slice(0, 300);
        continue;
      }
      const { base, senales, datos, estado } = r.value;
      if (dry) {
        resumen.push({ base, datos, estado, enviaria: senales.map((s) => s.payload) });
        continue;
      }
      if (!senales.length) continue;
      const { data: ya } = await db.from("senales_enviadas").select("clave").in("clave", senales.map((s) => s.clave));
      const vistas = new Set((ya ?? []).map((x: { clave: string }) => x.clave));
      for (const s of senales.filter((x) => !vistas.has(x.clave))) {
        try {
          const resp = await fetch(webhook!, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(s.payload), signal: AbortSignal.timeout(10_000) });
          if (resp.ok) {
            await db.from("senales_enviadas").insert({ clave: s.clave });
            resumen.push({ base, enviada: s.payload.fuente + " " + s.payload.lado, hora: s.payload.hora });
          } else {
            errores[`${base}:envio`] = `webhook respondió ${resp.status}`; // se reintenta en la próxima ejecución
          }
        } catch (e) {
          errores[`${base}:envio`] = String((e as Error).message).slice(0, 200);
        }
      }
    }
  }
  return Response.json({ ok: Object.keys(errores).length === 0, monedas: lista.length, resumen, errores });
});
