// Port a TypeScript de DMCRIPTO ORDER BLOCK + OSCILADOR-OB (valores por defecto).
// Reproduce solo la lógica que decide las señales LONG/SHORT; no dibuja nada.
// Recorre todas las velas cerradas desde el inicio, igual que Pine, por lo que no necesita estado guardado.

import { atr as calcAtr, dmi, oscilador, pivotHigh, pivotLow, sma, type Vela } from "./indicadores.ts";

export interface Senal {
  fuente: "OB" | "OSC";
  lado: "LONG" | "SHORT";
  i: number; // índice de la vela de la señal (cerrada)
  t: number; // apertura de esa vela (ms)
  entrada: number;
  target?: number;
  tp2?: number;
  tp3?: number;
  sl?: number;
  rr?: number;
  puntaje?: number;
  grado?: string;
}

export interface Estado {
  osc: number;
  adx: number;
  diP: number;
  diM: number;
  ctxBias: string;
  scoreL: number;
  scoreS: number;
  obsActivos: number;
  tradeAbierto: number; // 0 ninguno, 1 long, -1 short
}

// ---- Parámetros por defecto (iguales a los de los .pine) ----
const P = {
  rsiLen: 14, stochLen: 14, stochSmooth: 3, ob: 75, os: 25,
  adxLen: 14, adxSmooth: 14, adxWeak: 20,
  swingLen: 5, lookback: 50, maxOBs: 4, atrLen: 14, volLen: 20,
  domTh: 10, slBuffer: 0.15, tp2R: 1.5, tp3R: 2.5, bePct: 50, ctxLen: 20,
  minLinkScore: 40, minScore: 40, sigWindow: 8, sigMaxOsc: 60, sigCooldown: 5,
  semVigencia: 10, divLen: 5, divMin: 5, divMax: 60, divTol: 10, divMemory: 20, tlLen: 3, tlConfirm: 2,
};

const isNaN_ = Number.isNaN;

/** Constantes que dependen de la temporalidad (modo automático de los .pine). */
export function porTemporalidad(tfMin: number) {
  const s = tfMin * 60;
  return {
    rr: s <= 120 ? 1.0 : s <= 300 ? 1.2 : s <= 900 ? 1.5 : s <= 3600 ? 1.8 : s <= 14400 ? 2.0 : s <= 86400 ? 2.5 : 3.0,
    minSL: s <= 180 ? 0.8 : s <= 300 ? 0.7 : s <= 900 ? 0.5 : 0.4,
    minATR: s <= 180 ? 0.8 : s <= 300 ? 0.7 : s <= 900 ? 0.6 : 0.5,
    /** timeframe mayor del oscilador, en minutos (0 = diario, -1 = semanal) */
    htfMin: s <= 180 ? 60 : s <= 900 ? 240 : s <= 3600 ? 0 : -1,
  };
}

interface Zona {
  top: number;
  bot: number;
  bull: boolean;
  breaker: boolean;
  mit: boolean;
  delta: number;
  rvol: number;
}

export function calcular(c: Vela[], htf: Vela[], tfMin: number): { senales: Senal[]; estado: Estado } {
  const n = c.length;
  const T = porTemporalidad(tfMin);
  const O = c.map((x) => x.o), H = c.map((x) => x.h), L = c.map((x) => x.l), C = c.map((x) => x.c), V = c.map((x) => x.v);

  const osc = oscilador(c, P.rsiLen, P.stochLen, P.stochSmooth);
  const atr = calcAtr(c, P.atrLen);
  const { diP, diM, adx } = dmi(c, P.adxLen, P.adxSmooth);
  const vMA = sma(V, P.volLen);

  // Delta de volumen del contexto ADX (20 velas)
  const dirVol = c.map((x) => (x.c > x.o ? x.v : x.c < x.o ? -x.v : 0));
  const netDelta = sma(dirVol, P.ctxLen).map((x) => x * P.ctxLen);
  const totVol = sma(V, P.ctxLen).map((x) => x * P.ctxLen);

  // Oscilador del timeframe mayor, alineado con lookahead_on y [1]/[2] (como el .pine)
  const oscH = htf.length ? oscilador(htf, P.rsiLen, P.stochLen, P.stochSmooth) : [];
  const htfA = new Array<number>(n).fill(NaN);
  const htfB = new Array<number>(n).fill(NaN);
  if (htf.length) {
    let j = 0;
    for (let i = 0; i < n; i++) {
      while (j + 1 < htf.length && htf[j + 1].t <= c[i].t) j++;
      if (htf[j].t <= c[i].t) {
        htfA[i] = j >= 1 ? oscH[j - 1] : NaN;
        htfB[i] = j >= 2 ? oscH[j - 2] : NaN;
      }
    }
  }

  // Pivotes de estructura y del oscilador
  const ph = pivotHigh(H, P.swingLen, P.swingLen);
  const pl = pivotLow(L, P.swingLen, P.swingLen);
  const oPl = pivotLow(osc, P.tlLen, P.tlLen);
  const oPh = pivotHigh(osc, P.tlLen, P.tlLen);
  const dPL = pivotLow(osc, P.divLen, P.divLen);
  const dPH = pivotHigh(osc, P.divLen, P.divLen);

  // ===== 1) OSCILADOR: puntajes y señales propias =====
  const scoreL = new Array<number>(n).fill(0);
  const scoreS = new Array<number>(n).fill(0);
  const sOsc: Senal[] = [];
  const bosUpA = new Array<boolean>(n).fill(false);
  const bosDnA = new Array<boolean>(n).fill(false);
  let bOB = 0, bOS = 0, xOB = 0, xOS = 0, wOB = false, wOS = false;
  let lPH = NaN, lPL = NaN, lPLb = NaN, lPHb = NaN;
  let bsExhBull = NaN, bsExhBear = NaN, bsOSv = NaN, bsOBv = NaN, bsDivBull = NaN, bsDivBear = NaN, bsSup = NaN, bsRes = NaN;
  let dlOsc = NaN, dlPx = NaN, dlBar = NaN, dhOsc = NaN, dhPx = NaN, dhBar = NaN;
  let sp1 = NaN, sp2 = NaN, spb1 = NaN, spb2 = NaN, supBroken = false;
  let rp1 = NaN, rp2 = NaN, rpb1 = NaN, rpb2 = NaN, resBroken = false;
  let bsNotBelow = NaN, bsNotAbove = NaN;
  let lastBull = -1000, lastBear = -1000;
  const adv = (bs: number, ev: boolean) => (ev ? 0 : isNaN_(bs) ? NaN : bs + 1);

  for (let i = 0; i < n; i++) {
    const o = osc[i];
    const bOBprev = bOB, bOSprev = bOS;
    // contadores de agotamiento
    if (o >= P.ob) { bOB++; wOB = true; xOB = 0; } else if (wOB) { xOB++; if (xOB > 2) { bOB = 0; wOB = false; } } else bOB = 0;
    if (o <= P.os) { bOS++; wOS = true; xOS = 0; } else if (wOS) { xOS++; if (xOS > 2) { bOS = 0; wOS = false; } } else bOS = 0;
    const exhBull = i > 0 && bOSprev >= 3 && o > P.os && osc[i - 1] <= P.os;
    const exhBear = i > 0 && bOBprev >= 3 && o < P.ob && osc[i - 1] >= P.ob;
    bsExhBull = adv(bsExhBull, exhBull);
    bsExhBear = adv(bsExhBear, exhBear);

    // estructura
    if (!isNaN_(ph[i])) { lPH = ph[i]; lPHb = i - P.swingLen; }
    if (!isNaN_(pl[i])) { lPL = pl[i]; lPLb = i - P.swingLen; }
    const bosUp = !isNaN_(lPH) && i > 0 && C[i] > lPH && C[i - 1] <= lPH;
    const bosDn = !isNaN_(lPL) && i > 0 && C[i] < lPL && C[i - 1] >= lPL;
    bosUpA[i] = bosUp;
    bosDnA[i] = bosDn;

    // divergencias
    let bullDiv = false, bearDiv = false;
    if (!isNaN_(dPL[i])) {
      const pb = i - P.divLen, px = L[pb];
      if (!isNaN_(dlBar) && pb - dlBar >= P.divMin && pb - dlBar <= P.divMax && px < dlPx && dPL[i] > dlOsc && dlOsc <= P.os + P.divTol) bullDiv = true;
      dlOsc = dPL[i]; dlPx = px; dlBar = pb;
    }
    if (!isNaN_(dPH[i])) {
      const pb = i - P.divLen, px = H[pb];
      if (!isNaN_(dhBar) && pb - dhBar >= P.divMin && pb - dhBar <= P.divMax && px > dhPx && dPH[i] < dhOsc && dhOsc >= P.ob - P.divTol) bearDiv = true;
      dhOsc = dPH[i]; dhPx = px; dhBar = pb;
    }
    bsDivBull = adv(bsDivBull, bullDiv);
    bsDivBear = adv(bsDivBear, bearDiv);

    // directriz del oscilador (soporte / resistencia) y sus roturas
    if (!isNaN_(oPl[i])) {
      sp2 = sp1; spb2 = spb1; sp1 = oPl[i]; spb1 = i - P.tlLen;
      if (!isNaN_(sp2) && !isNaN_(spb2)) supBroken = false;
    }
    if (!isNaN_(oPh[i])) {
      rp2 = rp1; rpb2 = rpb1; rp1 = oPh[i]; rpb1 = i - P.tlLen;
      if (!isNaN_(rp2) && !isNaN_(rpb2)) resBroken = false;
    }
    const supExists = !isNaN_(sp1) && !isNaN_(sp2) && !isNaN_(spb1) && !isNaN_(spb2) && spb1 > spb2 && sp1 > sp2;
    const resExists = !isNaN_(rp1) && !isNaN_(rp2) && !isNaN_(rpb1) && !isNaN_(rpb2) && rpb1 > rpb2 && rp1 < rp2;
    const supVal = supExists ? sp1 + ((sp1 - sp2) / (spb1 - spb2)) * (i - spb1) : NaN;
    const resVal = resExists ? rp1 + ((rp1 - rp2) / (rpb1 - rpb2)) * (i - rpb1) : NaN;
    const belowSup = supExists && o < supVal;
    const aboveRes = resExists && o > resVal;
    bsNotBelow = adv(bsNotBelow, !belowSup);
    bsNotAbove = adv(bsNotAbove, !aboveRes);
    const breakSup = supExists && !supBroken && belowSup && bsNotBelow >= P.tlConfirm;
    const breakRes = resExists && !resBroken && aboveRes && bsNotAbove >= P.tlConfirm;
    if (breakSup) supBroken = true;
    if (breakRes) resBroken = true;
    bsSup = adv(bsSup, breakSup);
    bsRes = adv(bsRes, breakRes);

    bsOSv = adv(bsOSv, o <= P.os);
    bsOBv = adv(bsOBv, o >= P.ob);
    const rec = (bs: number, lim: number) => !isNaN_(bs) && bs <= lim;
    const htfBullOK = !isNaN_(htfA[i]) && !isNaN_(htfB[i]) && htfA[i] > htfB[i] && htfA[i] < P.ob;
    const htfBearOK = !isNaN_(htfA[i]) && !isNaN_(htfB[i]) && htfA[i] < htfB[i] && htfA[i] > P.os;
    const prev = i > 0 ? osc[i - 1] : NaN;
    const recentOS = rec(bsOSv, P.sigWindow), recentOB = rec(bsOBv, P.sigWindow);
    scoreL[i] = (recentOS ? 20 : o < 40 ? 10 : 0) + (rec(bsExhBull, P.semVigencia) ? 15 : 0) + (rec(bsDivBull, P.divMemory) ? 20 : 0) + (o > prev ? 10 : 0) +
      (adx[i] >= P.adxWeak ? 10 : 0) + (diP[i] > diM[i] ? 5 : 0) + (rec(bsRes, P.semVigencia) ? 10 : 0) + (htfBullOK ? 10 : 0);
    scoreS[i] = (recentOB ? 20 : o > 60 ? 10 : 0) + (rec(bsExhBear, P.semVigencia) ? 15 : 0) + (rec(bsDivBear, P.divMemory) ? 20 : 0) + (o < prev ? 10 : 0) +
      (adx[i] >= P.adxWeak ? 10 : 0) + (diM[i] > diP[i] ? 5 : 0) + (rec(bsSup, P.semVigencia) ? 10 : 0) + (htfBearOK ? 10 : 0);

    // señales del oscilador (modo "Ventana")
    const bullRaw = (recentOS && o <= P.sigMaxOsc && bosUp) || bullDiv;
    const bearRaw = (recentOB && o >= 100 - P.sigMaxOsc && bosDn) || bearDiv;
    const grade = (s: number) => (s >= 70 ? "A" : s >= 50 ? "B" : "C");
    if (bullRaw && scoreL[i] >= P.minScore && i - lastBull > P.sigCooldown) {
      lastBull = i;
      sOsc.push({ fuente: "OSC", lado: "LONG", i, t: c[i].t, entrada: C[i], puntaje: scoreL[i], grado: grade(scoreL[i]) });
    }
    if (bearRaw && scoreS[i] >= P.minScore && i - lastBear > P.sigCooldown) {
      lastBear = i;
      sOsc.push({ fuente: "OSC", lado: "SHORT", i, t: c[i].t, entrada: C[i], puntaje: scoreS[i], grado: grade(scoreS[i]) });
    }
  }

  // ===== 2) ORDER BLOCK =====
  const sOb: Senal[] = [];
  let obs: Zona[] = [];
  lPH = NaN; lPL = NaN; lPLb = NaN; lPHb = NaN;
  let tDir = 0, tStage = 0, tEntry = NaN, tTP = NaN, tTP2 = NaN, tTP3 = NaN, tSL = NaN, tBE = false, tBar = -1;
  let ctxBiasUlt = "NEUTRO";

  const legDelta = (i: number, k: number) => {
    let sd = 0, sv = 0;
    for (let q = 0; q <= k; q++) {
      const x = c[i - q];
      const r = x.h - x.l;
      sd += r > 0 ? (x.v * (2 * x.c - x.h - x.l)) / r : 0;
      sv += x.v;
    }
    return sv > 0 ? (sd / sv) * 100 : 0;
  };

  for (let i = 1; i < n; i++) {
    if (!isNaN_(ph[i])) { lPH = ph[i]; lPHb = i - P.swingLen; }
    if (!isNaN_(pl[i])) { lPL = pl[i]; lPLb = i - P.swingLen; }
    const bosUp = bosUpA[i], bosDn = bosDnA[i];

    // creación de zonas al romper estructura
    for (const dir of [1, -1]) {
      if (dir === 1 ? !bosUp : !bosDn) continue;
      const piv = dir === 1 ? lPLb : lPHb;
      const leg = !isNaN_(piv) ? Math.max(1, Math.min(P.lookback, i - piv)) : Math.max(1, Math.min(P.lookback, i));
      let best = 0, bestI = 1;
      for (let k = 1; k <= leg && i - k >= 0; k++) {
        const d = dir === 1 ? O[i - k] - C[i - k] : C[i - k] - O[i - k];
        if (d > best) { best = d; bestI = k; }
      }
      if (!(best > 0) || i - bestI < 0 || !(best >= atr[i - bestI] * T.minATR)) continue;
      const rv = vMA[i - bestI] !== 0 && !isNaN_(vMA[i - bestI]) ? V[i - bestI] / vMA[i - bestI] : 0;
      const delta = legDelta(i, bestI);
      const top = dir === 1 ? O[i - bestI] : C[i - bestI];
      const bot = dir === 1 ? C[i - bestI] : O[i - bestI];
      const m = obs.find((z) => !z.mit && !z.breaker && z.bull === (dir === 1) && z.top >= bot && z.bot <= top);
      if (m) {
        m.top = Math.max(m.top, top);
        m.bot = Math.min(m.bot, bot);
        if (rv > m.rvol) { m.rvol = rv; m.delta = delta; }
      } else {
        obs.push({ top, bot, bull: dir === 1, breaker: false, mit: false, delta, rvol: rv });
      }
    }

    // toques, breakers y mitigación
    let bullTouch = false, bearTouch = false, bullBot = NaN, bearTop = NaN;
    for (let q = obs.length - 1; q >= 0; q--) {
      const z = obs[q];
      let justBroke = false;
      if (!z.breaker && (z.bull ? C[i] < z.bot : C[i] > z.top)) { z.breaker = true; z.mit = false; justBroke = true; }
      const touched = !justBroke && !z.mit && (z.breaker ? (z.bull ? H[i] >= z.bot : L[i] <= z.top) : (z.bull ? L[i] <= z.top : H[i] >= z.bot));
      if (touched) {
        if (z.breaker) z.mit = true;
        else {
          const domOK = z.bull ? z.delta > -P.domTh : z.delta < P.domTh;
          const rejOK = z.bull ? C[i] > O[i] && C[i] >= z.bot : C[i] < O[i] && C[i] <= z.top;
          if (!domOK) z.mit = true;
          else if (rejOK) {
            z.mit = true;
            if (z.bull && !bullTouch) { bullTouch = true; bullBot = z.bot; }
            if (!z.bull && !bearTouch) { bearTouch = true; bearTop = z.top; }
          }
        }
      }
      const filled = z.breaker ? (z.bull ? C[i] >= z.top : C[i] <= z.bot) : (z.bull ? C[i] <= z.bot : C[i] >= z.top);
      if (filled && !z.mit) z.mit = true;
      if (z.mit && (z.breaker ? true : filled)) obs.splice(q, 1);
    }
    while (obs.length > P.maxOBs) obs.shift();

    // contexto ADX
    const bearConf = diM[i] > diP[i] && netDelta[i] / totVol[i] < 0;
    const bullConf = diP[i] > diM[i] && netDelta[i] / totVol[i] > 0;
    const ctxBias = bearConf || (diM[i] > diP[i] && adx[i] >= P.adxWeak) ? "SHORT" : bullConf || (diP[i] > diM[i] && adx[i] >= P.adxWeak) ? "LONG" : "NEUTRO";
    ctxBiasUlt = ctxBias;

    const base = !isNaN_(osc[i]) && adx[i] >= P.adxWeak;
    const bullSig = tDir === 0 && bullTouch && base && osc[i] <= P.os && ctxBias === "LONG" && scoreL[i] >= P.minLinkScore;
    const bearSig = tDir === 0 && bearTouch && base && osc[i] >= P.ob && ctxBias === "SHORT" && scoreS[i] >= P.minLinkScore;

    if (bullSig) {
      tDir = 1; tBar = i; tStage = 1; tEntry = C[i]; tBE = false;
      tSL = Math.min(bullBot - atr[i] * P.slBuffer, tEntry - atr[i] * T.minSL);
      const risk = tEntry - tSL;
      tTP = tEntry + risk * T.rr; tTP2 = tEntry + risk * P.tp2R; tTP3 = tEntry + risk * P.tp3R;
      sOb.push({ fuente: "OB", lado: "LONG", i, t: c[i].t, entrada: tEntry, target: tTP, tp2: tTP2, tp3: tTP3, sl: tSL, rr: T.rr });
    }
    if (bearSig) {
      tDir = -1; tBar = i; tStage = 1; tEntry = C[i]; tBE = false;
      tSL = Math.max(bearTop + atr[i] * P.slBuffer, tEntry + atr[i] * T.minSL);
      const risk = tSL - tEntry;
      tTP = tEntry - risk * T.rr; tTP2 = tEntry - risk * P.tp2R; tTP3 = tEntry - risk * P.tp3R;
      sOb.push({ fuente: "OB", lado: "SHORT", i, t: c[i].t, entrada: tEntry, target: tTP, tp2: tTP2, tp3: tTP3, sl: tSL, rr: T.rr });
    }

    // gestión de la operación (TP escalonados, break even, SL)
    if (tDir !== 0 && i > tBar) {
      const long = tDir === 1;
      const target = tStage >= 3 ? tTP3 : tStage === 2 ? tTP2 : tTP;
      const hitT = long ? H[i] >= target : L[i] <= target;
      const hitS = long ? L[i] <= tSL : H[i] >= tSL;
      if (hitT && hitS) tDir = 0;
      else if (hitT) {
        if (tStage === 1) { tStage = 2; tSL = tEntry; tBE = true; }
        else if (tStage === 2) { tStage = 3; tSL = tTP; }
        else tDir = 0;
      } else if (hitS) tDir = 0;
      else if (!tBE && (long ? H[i] - tEntry : tEntry - L[i]) >= (long ? tTP - tEntry : tEntry - tTP) * (P.bePct / 100)) { tSL = tEntry; tBE = true; }
    }
  }

  const k = n - 1;
  return {
    senales: [...sOb, ...sOsc].sort((a, b) => a.i - b.i),
    estado: { osc: osc[k], adx: adx[k], diP: diP[k], diM: diM[k], ctxBias: ctxBiasUlt, scoreL: scoreL[k], scoreS: scoreS[k], obsActivos: obs.length, tradeAbierto: tDir },
  };
}
