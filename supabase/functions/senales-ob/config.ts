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
export const ENVIAR_OSC = true;

/** Puntaje mínimo (0-100) para enviar señales del oscilador. 50 = solo grados A y B; 40 = todas (más ruido). */
export const MIN_PUNTAJE_OSC = 50;
