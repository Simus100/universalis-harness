/**
 * Tool `ask_user` — l'agente pone all'utente domande o questionari direttamente in chat,
 * in modo interattivo, e attende la risposta (che gli torna come dato strutturato).
 *
 * Il comporto del broker (stati, timeout, validazione, log) sta in `media/ask-broker.mjs`.
 * Qui c'è solo il contratto verso il modello: nome, schema, descrizione e le regole su
 * QUANDO chiedere e quando no. La descrizione del tool è il canale più affidabile per
 * calibrare questo comportamento: vive accanto alla definizione che il modello legge.
 *
 * La soglia (dalle best practice documentate in
 * `media/ricerca-domande-interattive-2026-09-20.md`): chiedere solo quando l'ambiguità cambia
 * l'esito dell'azione successiva — bersaglio, autorità, evidenza, conseguenza — e mai per cose
 * che si possono scoprire da soli o che hanno un default sensato.
 */

const DESCRIPTION = [
  "Pone all'utente una o più domande a scelta multipla in chat e ATTENDE la risposta: la risposta torna come dato strutturato (opzioni scelte, eventuale testo libero), quindi non va interpretata.",
  "Usalo quando la richiesta è ambigua o incompleta e l'informazione mancante CAMBIA l'esito del lavoro (quale bersaglio/file/servizio, quale formato, quale vincolo, un'azione non reversibile). Non usarlo per cose che puoi scoprire da solo (leggi i file, esplora il progetto, guarda il contesto della dashboard) né per farti approvare il tuo piano o chiedere il permesso di procedere.",
  "",
  "Regole:",
  "- 1-4 domande per chiamata; una è la norma. Non trasformare la delega in un interrogatorio.",
  "- Ogni scelta selezionabile va in `options` (2-6), NON nella prosa della domanda: etichetta breve + `description` che dice cosa cambia.",
  "- Se hai una raccomandazione mettila PRIMA e aggiungi «(consigliata)» all'etichetta.",
  "- NON aggiungere un'opzione «Altro»/«Other»: il testo libero l'interfaccia lo offre sempre, e c'è sempre anche «Salta / decidi tu».",
  "- `multiSelect: true` solo se si possono scegliere più voci insieme.",
  "- Mai chiedere credenziali (password, API key, token, dati di carta): la specifica MCP vieta la raccolta di segreti in un form; per quelli indica un file/.env e leggilo tu.",
  "- Se l'utente salta, non risponde o il tempo scade, il risultato te lo dice: prosegui con il tuo miglior giudizio, dichiarando in una riga l'assunzione fatta. Non riproporre la stessa domanda.",
].join("\n");

const PARAMETERS = {
  type: "object",
  properties: {
    context: {
      type: "string",
      description:
        "Perché stai chiedendo, in una riga (es. «il file esiste in due versioni»). L'utente lo vede sopra le domande.",
    },
    questions: {
      type: "array",
      description: "1-4 domande. Ognuna con le sue opzioni.",
      minItems: 1,
      maxItems: 4,
      items: {
        type: "object",
        properties: {
          id: {
            type: "string",
            description: "Chiave breve in snake_case per la risposta (es. «ambiente»). Facoltativa: se manca si ricava dall'header.",
          },
          header: {
            type: "string",
            description: "Etichetta corta della domanda, max 24 caratteri (es. «Ambiente»).",
          },
          question: {
            type: "string",
            description: "La domanda vera e propria, una frase chiara (max 400 caratteri).",
          },
          options: {
            type: "array",
            description: "2-6 scelte. Massimo una con «(consigliata)», e va messa per prima.",
            minItems: 2,
            maxItems: 6,
            items: {
              type: "object",
              properties: {
                label: { type: "string", description: "Etichetta breve dell'opzione (max 60 caratteri)." },
                description: { type: "string", description: "Cosa comporta sceglierla (max 240 caratteri)." },
              },
              required: ["label"],
            },
          },
          multiSelect: {
            type: "boolean",
            description: "true se si possono scegliere più opzioni insieme (default: false).",
          },
        },
        required: ["header", "question", "options"],
      },
    },
    timeoutSeconds: {
      type: "number",
      description:
        "Quanto attendere la risposta, in secondi (default 900, minimo 30, massimo 3600). Alla scadenza prosegui con il tuo giudizio.",
    },
  },
  required: ["questions"],
};

export function createAskExtension({ broker, toolName = "ask_user", log = () => {} } = {}) {
  if (!broker) throw new Error("createAskExtension: broker mancante");

  const TOOL = {
    name: toolName,
    label: "Chiedi all'utente",
    description: DESCRIPTION,
    promptSnippet:
      "ask_user: poni all'utente 1-4 domande a scelta multipla in chat e attendi la risposta " +
      "(usalo solo quando l'ambiguità cambia l'esito, non per chiedere il permesso).",
    promptGuidelines: [
      "Quando la richiesta è ambigua o incompleta e la risposta cambia l'esito (bersaglio, formato, vincolo, azione irreversibile), usa `ask_user` invece di tirare a indovinare: 1-4 domande, con 2-6 opzioni concrete e una consigliata per prima.",
      "Non usare `ask_user` per informazione che puoi ricavare da sola/o (file, contesto, cronologia) né per farti approvare il piano: prima indaga, poi chiedi solo ciò che resta.",
      "Se l'utente salta la domanda o non risponde entro il tempo, prosegui con il tuo miglior giudizio e dichiara l'assunzione in una riga; non riproporre la stessa domanda.",
      "Non chiedere mai credenziali con `ask_user`: indica un file o una variabile d'ambiente e leggili tu.",
    ],
    parameters: PARAMETERS,
    async execute(toolCallId, params, signal, onUpdate, _ctx) {
      try {
        const r = await broker.ask({ id: toolCallId, params: params || {}, signal, reason: "tool ask_user" });
        return { content: [{ type: "text", text: r.text }], details: r.details ?? {} };
      } catch (err) {
        // Errore di validazione o rifiuto (segreti): torna al modello con l'istruzione per correggere.
        const msg = err?.message ?? String(err);
        log(`[ask] chiamata non valida: ${msg}`);
        return {
          content: [
            {
              type: "text",
              text: `DOMANDA NON POSTA — ${msg}`,
            },
          ],
          details: { rejected: true },
          isError: true,
        };
      }
    },
  };

  return {
    name: "ask-tool",
    factory: (pi) => {
      pi.registerTool(TOOL);
      log(`[ask] tool «${toolName}» registrato (domande interattive in chat)`);
    },
  };
}
