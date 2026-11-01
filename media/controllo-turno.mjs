/**
 * Estensione «controllo-turno»: due garanzie sul turno, entrambe reversibili con una variabile
 * d'ambiente (`DASH_CONTROLLO=off`).
 *
 * 1. LIMITE DEL RISULTATO — taglia all'ingresso i risultati enormi (`tool-result-limite.mjs`):
 *    meno token nuovi a prezzo pieno, contesto più leggibile, nessun messaggio già inviato viene
 *    riscritto (la cache del prefisso resta valida).
 * 2. GUARDIA ANTI-LOOP — conta le chiamate del turno (`turno-guardia.mjs`) e, quando non si
 *    produce più niente di nuovo, chiede alla dashboard di fermare il turno dichiarando il motivo.
 *
 * L'estensione non deve MAI rompere un turno: ogni suo errore viene loggato e ignorato, e in caso
 * di dubbio non modifica nulla.
 */
import { creaGuardia } from "./turno-guardia.mjs";
import { limitaContenuto } from "./tool-result-limite.mjs";

/**
 * @param {object} opts
 * @param {(m: string) => void} [opts.log]
 * @param {(info: {motivo: string, stato: object}) => void} [opts.onFerma] chiamata UNA volta per turno
 * @param {object} [opts.guardia] parametri di `creaGuardia`
 * @param {object} [opts.limite] parametri di `limitaContenuto`
 */
export function createControlloTurnoExtension({ log = () => {}, onFerma = null, guardia = {}, limite = {} } = {}) {
  const g = creaGuardia(guardia);
  let fermato = false;
  const numeri = { ridotti: 0, caratteriTolti: 0, passi: 0, fermate: 0 };

  const estensione = {
    name: "controllo-turno",
    /** Stato osservabile (per la telemetria: `turni.jsonl` e `/api/state` possono leggerlo). */
    numeri: () => ({ ...numeri }),
    azzera() {
      g.azzera();
      fermato = false;
      numeri.passi = 0;
    },
    factory: (pi) => {
      // Un turno nuovo riparte da zero anche se il precedente era stato fermato.
      pi.on?.("agent_start", () => estensione.azzera());

      pi.on("tool_result", async (event) => {
        try {
          const esito = g.osserva({ toolName: event?.toolName, input: event?.input });
          numeri.passi = esito.stato.passi;

          const taglio = limitaContenuto(event?.content, limite);
          if (taglio.ridotto) {
            numeri.ridotti++;
            numeri.caratteriTolti += taglio.tolto;
            log(
              `[controllo-turno] risultato di ${event?.toolName} ridotto: ` +
                `${taglio.prima} → ${taglio.dopo} caratteri (−${taglio.tolto}, ~${Math.ceil(taglio.tolto / 3.6)} token)`,
            );
          }

          if (esito.ferma && !fermato) {
            fermato = true;
            numeri.fermate++;
            log(`[controllo-turno] turno fermato: ${esito.motivo}`);
            try {
              onFerma?.({ motivo: esito.motivo, stato: esito.stato });
            } catch (e) {
              log(`[controllo-turno] onFerma ha fallito: ${e?.message || e}`);
            }
          }

          return taglio.ridotto ? { content: taglio.content } : undefined;
        } catch (e) {
          log(`[controllo-turno] errore ignorato: ${e?.message || e}`);
          return undefined;
        }
      });
    },
  };
  return estensione;
}
