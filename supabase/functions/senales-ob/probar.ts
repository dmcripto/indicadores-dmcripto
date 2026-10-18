// Prueba local (sin Supabase, sin enviar nada):  node probar.ts BTC [tf]
import { obtenerVelas } from "./fuentes.ts";
import { calcular, porTemporalidad } from "./motor.ts";

const base = (process.argv[2] ?? "BTC").toUpperCase();
const tf = Number(process.argv[3] ?? 5);
const T = porTemporalidad(tf);

const ltf = await obtenerVelas(base, tf);
const htf = await obtenerVelas(base, T.htfMin, true);
const { senales, estado } = calcular(ltf.velas, htf.velas, tf);

console.log(`${base} ${tf}m  velas=${ltf.velas.length} (${ltf.fuente})  htf=${htf.velas.length} (${htf.fuente})`);
console.log("último cierre:", new Date(ltf.velas.at(-1)!.t + tf * 60000).toISOString());
console.log("estado:", JSON.stringify(estado, (_, v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v)));
console.log(`señales en las últimas 300 velas: ${senales.filter((s) => s.i >= ltf.velas.length - 300).length}`);
for (const s of senales.slice(-8)) {
  console.log(new Date(s.t).toISOString(), s.fuente, s.lado, "entrada", s.entrada, s.sl ? `sl ${s.sl.toFixed(4)} tp ${s.target?.toFixed(4)}` : `puntaje ${s.puntaje} ${s.grado}`);
}
