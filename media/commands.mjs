/**
 * Registro dei comandi slash della dashboard.
 *
 * Un solo posto per: nome, alias, descrizione, parametri (con completamento
 * dinamico) e tipo di esecuzione. Lo usa il server per `/api/commands` e
 * `/api/command`, e il browser per la palette di suggerimenti.
 *
 * Convenzioni:
 *  - `client: true`  -> il comando vive nel browser (cambia la UI, scarica,
 *                       apre il drawer): il server non lo esegue.
 *  - `client: false` -> il comando agisce sull'harness (sessione, modello,
 *                       thinking, goal, pianificazioni) via POST /api/command.
 *  - `params[].dynamic` -> i valori ammessi arrivano dal runtime al momento
 *                       della richiesta (vedi buildCommandCatalog in dashboard.mjs).
 *  - `params[].rest`    -> assorbe il resto della riga (testo libero).
 *
 * Nessun comando di questo registro esegue shell arbitraria né riavvia il
 * servizio: quelli restano fuori per scelta esplicita.
 */

/** Gruppi per raggruppare i comandi nella palette. */
export const COMMAND_GROUPS = [
  { id: "sessione", label: "Sessione" },
  { id: "agente", label: "Modello e agente" },
  { id: "goal", label: "Goal" },
  { id: "cron", label: "Pianificazioni" },
  { id: "ui", label: "Interfaccia" },
];

/**
 * @typedef {Object} CommandParam
 * @property {string} name
 * @property {string} label
 * @property {"enum"|"text"|"number"} kind
 * @property {string[]} [values]     valori statici
 * @property {string} [dynamic]      chiave di `values` nel catalogo dinamico
 * @property {boolean} [optional]
 * @property {boolean} [rest]        assorbe il resto della riga
 * @property {string} [hint]         segnaposto mostrato nella palette
 */

export const COMMANDS = [
  // ------------------------------- sessione -------------------------------
  {
    name: "help",
    aliases: ["?", "aiuto"],
    group: "sessione",
    desc: "Elenco dei comandi disponibili (oppure dettaglio di uno)",
    usage: "/help [comando]",
    client: true,
    params: [{ name: "comando", label: "comando", kind: "text", optional: true, hint: "nome del comando" }],
  },
  {
    name: "status",
    aliases: ["stato"],
    group: "sessione",
    desc: "Modello, thinking, contesto, token, costi, sessione corrente",
    usage: "/status",
    client: false,
    params: [],
  },
  {
    name: "new",
    aliases: ["nuova"],
    group: "sessione",
    desc: "Apre una nuova chat (il titolo è opzionale e la rinomina subito)",
    usage: "/new [titolo]",
    client: false,
    params: [{ name: "titolo", label: "titolo", kind: "text", optional: true, rest: true, hint: "titolo della chat" }],
  },
  {
    name: "sessions",
    aliases: ["chats", "chat"],
    group: "sessione",
    desc: "Apre l'elenco delle chat",
    usage: "/sessions",
    client: true,
    params: [],
  },
  {
    name: "rename",
    aliases: ["titolo"],
    group: "sessione",
    desc: "Rinomina la chat attiva",
    usage: "/rename <nome>",
    client: false,
    params: [{ name: "nome", label: "nome", kind: "text", rest: true, hint: "nuovo titolo" }],
  },
  {
    name: "export",
    aliases: ["md", "scarica"],
    group: "sessione",
    desc: "Scarica la chat attiva in Markdown",
    usage: "/export",
    client: true,
    params: [],
  },
  {
    name: "compact",
    aliases: ["compatta"],
    group: "sessione",
    desc: "Compatta il contesto (equivalente di /compact della TUI)",
    usage: "/compact [istruzioni]",
    client: false,
    params: [{ name: "istruzioni", label: "istruzioni", kind: "text", optional: true, rest: true, hint: "come riassumere (opzionale)" }],
  },
  {
    name: "stop",
    aliases: ["abort", "annulla"],
    group: "sessione",
    desc: "Interrompe la risposta in corso",
    usage: "/stop",
    client: false,
    params: [],
  },

  // --------------------------- modello e agente ---------------------------
  {
    name: "model",
    aliases: ["modello"],
    group: "agente",
    desc: "Mostra o cambia il modello della sessione",
    usage: "/model [id]",
    client: false,
    params: [{ name: "id", label: "modello", kind: "enum", dynamic: "models", optional: true }],
  },
  {
    name: "think",
    aliases: ["thinking", "pensa"],
    group: "agente",
    desc: "Mostra o cambia il livello di thinking (next = cicla)",
    usage: "/think <livello|next>",
    client: false,
    params: [
      { name: "livello", label: "livello", kind: "enum", dynamic: "thinking", optional: true, extraValues: ["next"] },
    ],
  },
  {
    name: "subagents",
    aliases: ["subagent"],
    group: "agente",
    desc: "Attiva o disattiva i subagent (consumano più token)",
    usage: "/subagents <on|off>",
    client: false,
    params: [{ name: "stato", label: "stato", kind: "enum", values: ["on", "off"], hint: "on o off" }],
  },
  {
    name: "subagents-max",
    aliases: ["subagent-max"],
    group: "agente",
    desc: "Numero massimo di subagent per richiesta (1-64)",
    usage: "/subagents-max <n>",
    client: false,
    params: [{ name: "n", label: "n", kind: "number", hint: "1-64" }],
  },
  {
    name: "browser",
    aliases: ["naviga"],
    group: "agente",
    desc: "Tool browser: auto (si accende quando serve), on, off",
    usage: "/browser <auto|on|off|status>",
    client: false,
    params: [{ name: "modo", label: "modo", kind: "enum", values: ["auto", "on", "off", "status"], hint: "auto, on, off o status" }],
  },

  {
    name: "ask",
    aliases: ["domande"],
    group: "agente",
    desc: "Domande all'utente in chat (tool ask_user): on, off, status",
    usage: "/ask <on|off|status>",
    client: false,
    params: [{ name: "modo", label: "modo", kind: "enum", values: ["on", "off", "status"], hint: "on, off o status" }],
  },

  // -------------------------------- goal ---------------------------------
  {
    name: "goals",
    aliases: ["obiettivi"],
    group: "goal",
    desc: "Elenco dei goal con stato e avanzamento",
    usage: "/goals",
    client: false,
    params: [],
  },
  {
    name: "goal",
    aliases: ["obiettivo"],
    group: "goal",
    desc: "Crea un goal nella scheda Goal",
    usage: "/goal <testo>",
    client: false,
    params: [{ name: "testo", label: "testo", kind: "text", rest: true, hint: "cosa vuoi ottenere" }],
  },
  {
    name: "goal-run",
    aliases: ["esegui-goal"],
    group: "goal",
    desc: "Passa all'agente il piano di un goal",
    usage: "/goal-run <id>",
    client: false,
    params: [{ name: "id", label: "goal", kind: "enum", dynamic: "goals" }],
  },
  {
    name: "goal-done",
    aliases: ["chiudi-goal"],
    group: "goal",
    desc: "Segna un goal come completato",
    usage: "/goal-done <id>",
    client: false,
    params: [{ name: "id", label: "goal", kind: "enum", dynamic: "goals" }],
  },

  // ---------------------------- pianificazioni ----------------------------
  {
    name: "crons",
    aliases: ["schedule", "pianificazioni"],
    group: "cron",
    desc: "Elenco delle pianificazioni con prossima esecuzione",
    usage: "/crons",
    client: false,
    params: [],
  },
  {
    name: "cron",
    aliases: ["pianifica"],
    group: "cron",
    desc: "Crea una pianificazione cron che invia un prompt all'agente",
    usage: '/cron "<min ora giorno mese dow>" <prompt>',
    client: false,
    params: [
      { name: "expr", label: "cron", kind: "text", hint: '"*/30 9-18 * * 1-5"' },
      { name: "nome", label: "nome", kind: "text", hint: "nome breve (virgolette se ha spazi)" },
      { name: "prompt", label: "prompt", kind: "text", rest: true, hint: "cosa deve fare l'agente" },
    ],
  },
  {
    name: "cron-run",
    aliases: ["esegui-cron"],
    group: "cron",
    desc: "Esegue subito una pianificazione senza cambiarne l'orario",
    usage: "/cron-run <id>",
    client: false,
    params: [{ name: "id", label: "pianificazione", kind: "enum", dynamic: "crons" }],
  },
  {
    name: "cron-toggle",
    aliases: ["pausa-cron"],
    group: "cron",
    desc: "Attiva o sospende una pianificazione",
    usage: "/cron-toggle <id>",
    client: false,
    params: [{ name: "id", label: "pianificazione", kind: "enum", dynamic: "crons" }],
  },
  {
    name: "cron-del",
    aliases: ["elimina-cron"],
    group: "cron",
    desc: "Elimina una pianificazione (e il suo log)",
    usage: "/cron-del <id>",
    client: false,
    params: [{ name: "id", label: "pianificazione", kind: "enum", dynamic: "crons" }],
  },

  // ------------------------------ interfaccia -----------------------------
  {
    name: "tab",
    aliases: ["scheda"],
    group: "ui",
    desc: "Apre una scheda della dashboard",
    usage: "/tab <scheda>",
    client: true,
    params: [{ name: "scheda", label: "scheda", kind: "enum", values: ["chat", "files", "goals", "cron", "skills", "progetto", "agenda", "live"] }],
  },
  {
    name: "skills",
    aliases: ["skill-list", "abilita"],
    group: "ui",
    desc: "Apre la vista delle skill (crea, carica, elimina)",
    usage: "/skills",
    client: true,
    params: [],
  },
  {
    name: "files",
    aliases: ["file", "apri"],
    group: "ui",
    desc: "Apre la scheda File, eventualmente su un percorso",
    usage: "/files [percorso]",
    client: true,
    params: [{ name: "percorso", label: "percorso", kind: "text", optional: true, rest: true, hint: "relativo alla root" }],
  },
  {
    name: "clear",
    aliases: ["pulisci"],
    group: "ui",
    desc: "Svuota il campo di scrittura e i messaggi dei comandi mostrati in chat",
    usage: "/clear",
    client: true,
    params: [],
  },
];

/** Indice nome/alias -> comando (in minuscolo). */
const INDEX = new Map();
for (const cmd of COMMANDS) {
  INDEX.set(cmd.name, cmd);
  for (const a of cmd.aliases || []) INDEX.set(a, cmd);
}

/** Ritrova un comando da nome o alias. */
export function findCommand(name) {
  return INDEX.get(String(name || "").replace(/^\//, "").toLowerCase()) || null;
}

/** Nomi (con alias) dei soli comandi eseguibili dal server. */
export const SERVER_COMMAND_NAMES = new Set(
  COMMANDS.filter((c) => !c.client).flatMap((c) => [c.name, ...(c.aliases || [])]),
);

/**
 * Divide una riga in token, rispettando le virgolette doppie/singole.
 * Esempio: una espressione cron fra virgolette resta un token unico.
 * Le virgolette servono solo a tenere insieme i pezzi: vengono rimosse.
 */
export function tokenizeLine(line) {
  const tokens = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(String(line || ""))) !== null) {
    tokens.push(m[1] ?? m[2] ?? m[3]);
  }
  return tokens;
}

/**
 * Interpreta una riga di comando.
 * Ritorna { name, arg, tokens } dove `arg` è il testo dopo il nome (già senza
 * virgolette esterne) e `tokens` i singoli argomenti.
 */
export function parseCommandLine(line) {
  const raw = String(line || "").trim();
  if (!raw.startsWith("/")) return null;
  // "/think  high" -> nome "think"; il resto è l'argomento così com'è scritto
  const withoutSlash = raw.slice(1);
  const sep = withoutSlash.search(/\s/);
  const name = (sep === -1 ? withoutSlash : withoutSlash.slice(0, sep)).toLowerCase();
  const rest = sep === -1 ? "" : withoutSlash.slice(sep + 1).trim();
  return { name, arg: rest, tokens: tokenizeLine(rest) };
}

/** Filtro tollerante: prefisso, poi sottostringa, poi sottosequenza. */
export function scoreCommand(cmd, query) {
  const q = String(query || "").toLowerCase();
  if (!q) return 1;
  const names = [cmd.name, ...(cmd.aliases || [])];
  let best = 0;
  for (const n of names) {
    if (n === q) best = Math.max(best, 100);
    else if (n.startsWith(q)) best = Math.max(best, 80 - n.length);
    else if (n.includes(q)) best = Math.max(best, 50 - n.length);
    else if (isSubsequence(q, n)) best = Math.max(best, 20 - n.length);
  }
  if (best === 0 && cmd.desc.toLowerCase().includes(q)) best = 10;
  return best;
}

function isSubsequence(needle, hay) {
  let i = 0;
  for (const ch of hay) {
    if (ch === needle[i]) i++;
    if (i === needle.length) return true;
  }
  return i === needle.length && needle.length > 0;
}

/** Comandi ordinati per pertinenza rispetto a un testo digitato. */
export function searchCommands(query) {
  return COMMANDS.map((c) => ({ cmd: c, score: scoreCommand(c, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.cmd.name.localeCompare(b.cmd.name))
    .map((x) => x.cmd);
}
