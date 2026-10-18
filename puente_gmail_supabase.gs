/**
 * Puente TradingView -> Gmail -> Supabase
 *
 * Lee los correos de alerta de TradingView (remitente noreply@tradingview.com),
 * extrae el JSON que generan los indicadores con alert() y lo reenvía por POST
 * a la función de Supabase. Cada correo se procesa una sola vez.
 *
 * INSTALACIÓN (una sola vez, con la cuenta de Gmail que recibe las alertas):
 *  1. script.google.com -> Nuevo proyecto -> pega este archivo.
 *  2. Configuración del proyecto -> Propiedades del script -> agrega:
 *       SUPABASE_WEBHOOK_URL = <URL completa de tu función tradingview-webhook>
 *     (la URL lleva una clave dentro: NO la pegues en el código ni la subas a git).
 *  3. Ejecuta la función  crearTrigger  una vez y acepta los permisos de Gmail.
 *  4. Prueba con  probarConUltimoCorreo  (ver abajo) antes de dejarlo automático.
 */

const REMITENTE = 'noreply@tradingview.com';
const ETIQUETA_OK = 'TradingView-Enviado';
const MAX_HILOS = 50;

function procesarSenales() {
  const url = PropertiesService.getScriptProperties().getProperty('SUPABASE_WEBHOOK_URL');
  if (!url) throw new Error('Falta la propiedad SUPABASE_WEBHOOK_URL');

  const etiqueta = GmailApp.getUserLabelByName(ETIQUETA_OK) || GmailApp.createLabel(ETIQUETA_OK);
  const hilos = GmailApp.search('from:' + REMITENTE + ' -label:' + ETIQUETA_OK + ' newer_than:1d', 0, MAX_HILOS);

  hilos.reverse().forEach(function (hilo) {
    let todosOk = true;
    hilo.getMessages().forEach(function (msg) {
      if (msg.getFrom().indexOf(REMITENTE) === -1) return;
      const senal = extraerSenal_(msg.getPlainBody());
      if (!senal) return; // correo sin JSON de señal (por ejemplo, una alerta de precio)
      senal.recibido = msg.getDate().toISOString();
      if (!enviar_(url, senal)) todosOk = false;
    });
    if (todosOk) hilo.addLabel(etiqueta); // si falló el envío se reintenta en la próxima ejecución
  });
}

/** Busca el primer objeto JSON del cuerpo y valida los campos mínimos. */
function extraerSenal_(cuerpo) {
  const texto = cuerpo.replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const m = texto.match(/\{[^{}]*"fuente"[^{}]*\}/);
  if (!m) return null;
  try {
    const s = JSON.parse(m[0]);
    if ((s.fuente !== 'OB' && s.fuente !== 'OSC') || (s.lado !== 'LONG' && s.lado !== 'SHORT') || !s.simbolo) return null;
    return s;
  } catch (e) {
    return null;
  }
}

function enviar_(url, senal) {
  const r = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(senal),
    muteHttpExceptions: true,
  });
  const ok = r.getResponseCode() >= 200 && r.getResponseCode() < 300;
  if (!ok) console.error('Supabase respondió ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 200));
  return ok;
}

/** Ejecútala una vez: revisa Gmail cada minuto. */
function crearTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'procesarSenales') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('procesarSenales').timeBased().everyMinutes(1).create();
}

/** Muestra (sin enviar nada) qué señal extraería del último correo de TradingView. */
function probarConUltimoCorreo() {
  const hilos = GmailApp.search('from:' + REMITENTE, 0, 1);
  if (!hilos.length) return console.log('No hay correos de TradingView.');
  const msgs = hilos[0].getMessages();
  console.log(JSON.stringify(extraerSenal_(msgs[msgs.length - 1].getPlainBody())));
}
