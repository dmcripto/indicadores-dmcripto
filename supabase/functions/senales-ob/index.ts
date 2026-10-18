// Edge Function: calcula las señales de DMCRIPTO ORDER BLOCK + OSCILADOR con velas públicas
// y las envía a tu webhook (SIGNAL_WEBHOOK_URL). Se ejecuta cada 5 minutos con pg_cron.
//
//   ?dry=1        calcula y devuelve lo que enviaría, sin enviar ni guardar nada
//   ?moneda=BTC   solo esa moneda

import { createClient } from "jsr:@supabase/supabase-js@2";
import { DESBLOQUEO_DIAS, DESBLOQUEO_MIN_PCT, ENVIAR_OB, ENVIAR_OSC, ENVIAR_TPS_EXTRA, FILTRO_DESBLOQUEOS, INCLUIR_MIS_MONEDAS, MIN_PUNTAJE_OSC, MONEDAS, TF_MIN, TOP_VOLUMEN, VENTANA_VELAS } from "./config.ts";
import { obtenerTop, obtenerVelas } from "./fuentes.ts";
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
        symbol: `${base}USDT`,
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
  const errores: Record<string, string> = {};
  const topN = Number(url.searchParams.get("top") ?? TOP_VOLUMEN);
  let lista = unica ? [unica] : [...MONEDAS];
  if (!unica && topN > 0) {
    try {
      const top = await obtenerTop(topN);
      lista = INCLUIR_MIS_MONEDAS ? [...new Set([...top.monedas, ...MONEDAS])] : top.monedas;
    } catch (e) {
      errores["top"] = String((e as Error).message).slice(0, 300); // si falla, se usan solo tus monedas
    }
  }
  const resumen: Record<string, unknown>[] = [];
  const omitidas: string[] = [];

  // Desbloqueos grandes próximos (misma tabla y regla que el modo cuidadoso de VELTRIX)
  let desbloqueos: Array<{ symbol: string; at: string; pct: number }> = [];
  if (FILTRO_DESBLOQUEOS !== "off") {
    const { data, error } = await db
      .from("token_unlocks")
      .select("symbol,at,pct")
      .gt("at", new Date().toISOString())
      .lte("at", new Date(Date.now() + DESBLOQUEO_DIAS * 86_400_000).toISOString())
      .gte("pct", DESBLOQUEO_MIN_PCT);
    if (error) errores["desbloqueos"] = error.message.slice(0, 200); // sin tabla: se sigue sin filtro
    else desbloqueos = data ?? [];
  }
  const normSym = (x: string) => x.toUpperCase().replace(/\.P$|PERP$/, "").replace(/(USDC|USD)$/, "USDT");

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
      const { base } = r.value;
      const { datos, estado } = r.value;
      const prox = desbloqueos.find((e) => normSym(e.symbol) === `${base}USDT`);
      const senales = r.value.senales.filter((x) => {
        if (prox && x.payload.direction === "LONG") {
          omitidas.push(`${base} LONG omitida: desbloqueo ${prox.pct}% el ${prox.at.slice(0, 10)}`);
          return false;
        }
        return true;
      });
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
  return Response.json({ ok: !Object.keys(errores).some((k) => k.endsWith(":envio")), monedas: lista.length, desbloqueos: desbloqueos.length, omitidas, resumen, errores });
});
