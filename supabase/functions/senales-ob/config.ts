// Monedas a vigilar (futuros USDT perpetuos). Agrega o quita las que quieras.
// Solo funcionan las que existan en Bybit, OKX o Binance (SOXS, MSTR, SPCX, etc. solo existen en LBank).
export const MONEDAS = [
  "BTC", "ETH", "SOL", "XRP", "BNB", "ZEC", "NEAR", "HYPE", "ONDO", "TAO", "LINK",
  "ADA", "AVAX", "AAVE", "SUI", "XLM", "HBAR", "ENA", "DOGE", "SAND", "XAUT",
];

/** Temporalidad en minutos. Los parámetros automáticos (R:R, SL mínimo, filtro ATR, TF mayor) se ajustan solos. */
export const TF_MIN = 5;

/** Cuántas velas cerradas hacia atrás se revisan en cada ejecución (por si falla una corrida). */
export const VENTANA_VELAS = 3;

/** Qué señales enviar. */
export const ENVIAR_OB = true;
// El webhook de la app exige entrada, TP y SL; el oscilador solo da dirección y puntaje, por eso va apagado.
export const ENVIAR_OSC = false;

/** Puntaje mínimo (0-100) para enviar señales del oscilador. 50 = solo grados A y B; 40 = todas (más ruido). */
export const MIN_PUNTAJE_OSC = 50;

/** false = se envía solo el TP principal (tarjeta con un único TARGET). true = también TP2 y TP3 (tarjeta con TARGET 1, 2 y 3). */
export const ENVIAR_TPS_EXTRA = false;

/**
 * Además de tus monedas, vigila las N de mayor volumen del mercado (24 h) de futuros USDT.
 * 0 = desactivado, 20 = Top 20, 40 = Top 40. También se puede forzar con ?top=20 en la URL.
 */
export const TOP_VOLUMEN = 40;

/** true = la lista final es TOP_VOLUMEN + MONEDAS (sin repetidas). false = solo el Top por volumen. */
export const INCLUIR_MIS_MONEDAS = true;

/**
 * Filtro de desbloqueos de tokens (usa la tabla token_unlocks que ya llena tu app con datos de Tokenomist).
 * "cuidadoso" = no enviar COMPRAS (LONG) de un activo con un desbloqueo grande próximo. "off" = sin filtro.
 */
export const FILTRO_DESBLOQUEOS: "off" | "cuidadoso" = "cuidadoso";
/** Cuántos días antes del desbloqueo se aplica el filtro (igual que el modo cuidadoso de VELTRIX). */
export const DESBLOQUEO_DIAS = 7;
/** Tamaño mínimo del desbloqueo, en % de la oferta circulante (igual que el modo cuidadoso de VELTRIX). */
export const DESBLOQUEO_MIN_PCT = 5;

/** true = las señales llevan "auto": true y la tarjeta sale como «SEÑAL AUTOMÁTICA · BOT DE VELTRIX» (requiere el parche del webhook). */
export const MARCAR_COMO_AUTOMATICA = true;
