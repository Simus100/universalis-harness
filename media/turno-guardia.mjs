/**
 * Guardia contro i turni che non progrediscono.
 *
 * Perché esiste (audit 2026-11-01, criticità C2): il turno del 30/10 è durato 770 s con 20 tool
 * call e nessun tetto; l'harness non aveva né un limite di passi né un budget in denaro. Un tetto
 * secco però taglia anche il lavoro legittimo (un audit di sola lettura fa 20 passi senza scrivere
 * niente), quindi la condizione qui non è «quanti passi» ma «stai ripetendo la stessa azione senza
 * produrre niente di nuovo».
 *
 * Modulo PURO: nessun filesystem, nessuna sessione, nessun timer. Si verifica con un test vero.
 */

/** Tool che lasciano un segno: azzerano il contatore dei passi «senza progresso». */
export const STRUMENTI_DI_SCRITTURA = new Set(["write", "edit", "apply_patch", "str_replace", "multi_edit"]);

/** Chiave stabile di una chiamata: stesso tool e stesso input (chiavi ordinate) = stessa azione. */
export function chiave(toolName, input) {
  const nome = String(toolName || "?");
  let corpo = "";
  try {
    corpo = JSON.stringify(input ?? {}, Object.keys(input ?? {}).sort());
  } catch {
    corpo = String(input);
  }
  // un input enorme (un write) non serve a distinguere: la testa basta e non gonfia la memoria
  return `${nome}|${corpo.length > 400 ? corpo.slice(0, 400) : corpo}`;
}

/**
 * @param {object} opts
 * @param {number} opts.maxPassiSenzaProgresso passi consecutivi senza scrittura prima di poter fermare
 * @param {number} opts.maxRipetizioni quante volte la stessa identica azione deve comparire
 * @param {number} opts.maxPassiAssoluti tetto duro, indipendente dal progresso (anti loop infinito)
 */
export function creaGuardia({ maxPassiSenzaProgresso = 15, maxRipetizioni = 3, maxPassiAssoluti = 120 } = {}) {
  let passi = 0;
  let senzaProgresso = 0;
  /** @type {Map<string, number>} */
  const conteggi = new Map();

  function azzera() {
    passi = 0;
    senzaProgresso = 0;
    conteggi.clear();
  }

  function ripetizioneMassima() {
    let max = 0;
    for (const n of conteggi.values()) if (n > max) max = n;
    return max;
  }

  /**
   * Osserva una chiamata a tool conclusa.
   * @returns {{ferma: boolean, motivo: string|null, stato: {passi: number, senzaProgresso: number, ripetizioni: number}}}
   */
  function osserva({ toolName, input } = {}) {
    passi++;
    if (STRUMENTI_DI_SCRITTURA.has(String(toolName))) senzaProgresso = 0;
    else senzaProgresso++;

    const k = chiave(toolName, input);
    conteggi.set(k, (conteggi.get(k) || 0) + 1);
    const rip = ripetizioneMassima();

    let motivo = null;
    if (passi >= maxPassiAssoluti) {
      motivo = `tetto assoluto raggiunto: ${passi} chiamate a tool in un solo turno`;
    } else if (senzaProgresso >= maxPassiSenzaProgresso && rip >= maxRipetizioni) {
      motivo =
        `nessun progresso: ${senzaProgresso} chiamate consecutive senza scrivere file ` +
        `e la stessa azione ripetuta ${rip} volte con argomenti identici`;
    }
    return { ferma: Boolean(motivo), motivo, stato: { passi, senzaProgresso, ripetizioni: rip } };
  }

  return { osserva, azzera, stato: () => ({ passi, senzaProgresso, ripetizioni: ripetizioneMassima() }) };
}
