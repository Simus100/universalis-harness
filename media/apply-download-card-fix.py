#!/usr/bin/env python3
"""
Applica il fix "card dei file scaricabili" (resolve-files + cartelle in .zip + card in
streaming) alle altre istanze dell'harness.

Perché non una copia dei file: ogni istanza ha le sue differenze (tester_07 ha quota e
modello bloccato). Le modifiche si applicano quindi come PATCH TESTUALI, prendendo i blocchi
nuovi dall'istanza già corretta (/root/pi-harness) e verificando che ogni blocco di partenza
esista esattamente una volta nel file di destinazione. Se un'ancora non c'è, lo script si
ferma senza scrivere: mai un file a metà.

Uso: python3 apply-download-card-fix.py <dir_istanza> [<dir_istanza> ...]
"""
import pathlib
import re
import shutil
import subprocess
import sys
import time

SRC = pathlib.Path("/root/pi-harness")
BASE_HTML = pathlib.Path("/tmp/base.html")
BASE_MJS = pathlib.Path("/tmp/base.mjs")


def grab(text: str, start: str, end: str) -> str:
    """Blocco `start`..`end` (end escluso), con controllo di unicità su start."""
    if text.count(start) != 1:
        raise SystemExit(f"ancora non unica/assente: {start!r} ({text.count(start)})")
    i = text.index(start)
    j = text.index(end, i)
    return text[i:j]


def load_patches():
    """Didascalie: (file, vecchio, nuovo) costruite dalla base e dall'istanza corretta."""
    base_html = BASE_HTML.read_text(encoding="utf-8")
    base_mjs = BASE_MJS.read_text(encoding="utf-8")
    new_html = (SRC / "dashboard.html").read_text(encoding="utf-8")
    new_mjs = (SRC / "dashboard.mjs").read_text(encoding="utf-8")
    P = []

    # ---- dashboard.mjs ----------------------------------------------------
    P.append((
        "mjs",
        'import { extractZip, safeEntryPath } from "./media/unzip.mjs";',
        'import { extractZip, safeEntryPath } from "./media/unzip.mjs";\n'
        'import { zipDirectory } from "./media/zip-write.mjs";',
    ))
    P.append((
        "mjs",
        "const MAX_UPLOAD = 64 * 1024 * 1024; // 64 MB per l'upload",
        "const MAX_UPLOAD = 64 * 1024 * 1024; // 64 MB per l'upload\n"
        "// Tetti per lo scarico di una CARTELLA: l'archivio si costruisce in memoria.\n"
        "const MAX_ZIP_FILES = 3000;\n"
        "const MAX_ZIP_BYTES = 128 * 1024 * 1024; // 128 MB non compressi",
    ))
    P.append((
        "mjs",
        grab(base_mjs, "/** Converte un messaggio della sessione nel formato usato dalla UI. */",
             "function toUiMessage(msg, toolResults = null) {"),
        grab(new_mjs, "/** Percorso toccato da una chiamata di tool", "function toUiMessage(msg, toolResults = null) {"),
    ))
    P.append((
        "mjs",
        grab(base_mjs, "async function listDir(rel) {", "  const abs = await safeResolve(rel);"),
        grab(new_mjs, "/**\n * Risolve un percorso CITATO", "  const abs = await safeResolve(rel);"),
    ))
    P.append((
        "mjs",
        """        } else if (b.type === "toolCall") {
          const a = b.arguments || {};
          const p = a.path ?? a.file_path ?? a.filePath ?? null;
          const t = {
            name: b.name,
            path: typeof p === "string" ? p : null,""",
        """        } else if (b.type === "toolCall") {
          const a = b.arguments || {};
          const t = {
            name: b.name,
            path: toolPathFromArgs(a),""",
    ))
    P.append((
        "mjs",
        """    const seg = {
      kind: "tool",
      id: event.toolCallId || null,
      name: event.toolName,
      summary: toolSummary(event.args),
      status: "running",
    };""",
        grab(new_mjs, "    const seg = {\n      kind: \"tool\",", "    // Le domande si portano DENTRO il segmento"),
    ))
    P.append((
        "mjs",
        """    broadcast("tool_start", { toolCallId: seg.id, toolName: seg.name, summary: seg.summary });""",
        """    broadcast("tool_start", { toolCallId: seg.id, toolName: seg.name, summary: seg.summary, path: seg.path });""",
    ))
    P.append((
        "mjs",
        """    if (seg) seg.status = event.isError ? "error" : "ok";
    broadcast("tool_end", { toolCallId: event.toolCallId || null, toolName: event.toolName, isError: event.isError });""",
        """    if (seg) seg.status = event.isError ? "error" : "ok";
    broadcast("tool_end", {
      toolCallId: event.toolCallId || null,
      toolName: event.toolName,
      isError: event.isError,
      path: seg?.path ?? null,
    });""",
    ))
    P.append((
        "mjs",
        grab(base_mjs, '    if (req.method === "GET" && url.pathname === "/api/download") {',
             '    if (req.method === "POST" && url.pathname === "/api/upload") {'),
        grab(new_mjs, "    // ---------------- resolve-files ----------------",
             '    if (req.method === "POST" && url.pathname === "/api/upload") {'),
    ))

    # ---- dashboard.html ---------------------------------------------------
    P.append((
        "html",
        grab(base_html, "function basenameOf(p)", "function appendUserMessage(text, attachments) {"),
        grab(new_html, "function basenameOf(p)", "function appendUserMessage(text, attachments) {"),
    ))
    P.append((
        "html",
        "          if (bl.path) continue; // i file diventano card scaricabili più sotto",
        "          // il tool si mostra come gli altri: la card scaricabile gli sta accanto, sotto",
    ))
    P.append((
        "html",
        "          if (t.path) continue; // i file diventano card scaricabili più sotto",
        "          // (compatibilità) come sopra: la card del file arriva in fondo al messaggio",
    ))
    P.append((
        "html",
        """      const paths = new Set();
      for (const t of m.tools || []) if (t.path) paths.add(t.path);
      if (m.text) for (const p of extractRootPaths(m.text)) paths.add(p);
      for (const p of paths) wrap.appendChild(fileCard(p));""",
        """      // file toccati dai tool + percorsi citati nel testo: il server conferma quali
      // esistono e la card si disegna solo su quelli (con il percorso normalizzato)
      const toolPaths = (m.tools || []).map((t) => t.path).filter(Boolean);
      wrap.appendChild(fileCardsBox(toolPaths, m.text));""",
    ))
    P.append((
        "html",
        ".imgs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; justify-content: flex-end; }",
        ".filecard { margin: 8px 0; }\n"
        ".filecards { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }\n"
        ".imgs { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 8px; justify-content: flex-end; }",
    ))
    P.append((
        "html",
        """es.addEventListener("tool_end", (e) => {
  let d; try { d = JSON.parse(e.data); } catch { d = {}; }
  endToolCard(d);
});""",
        """es.addEventListener("tool_end", (e) => {
  let d; try { d = JSON.parse(e.data); } catch { d = {}; }
  endToolCard(d);
  // il file appena scritto/letto si può scaricare SUBITO: niente più card solo dopo il reload
  if (d.path) attachStreamFile(d.path, d.toolCallId ? cur.tools?.get(d.toolCallId) : null);
});""",
    ))
    P.append((
        "html",
        "/* =============== DOMANDE INTERATTIVE ALL'UTENTE (tool `ask_user`) ===============",
        grab(new_html, "/* Un file creato/letto durante la risposta",
             "/* =============== DOMANDE INTERATTIVE ALL'UTENTE (tool `ask_user`) ===============")
        + "/* =============== DOMANDE INTERATTIVE ALL'UTENTE (tool `ask_user`) ===============",
    ))
    P.append((
        "html",
        """  cur.assistant = null; cur.thinking = null; cur.tools = new Map();
  for (const s of segments || []) {""",
        """  cur.assistant = null; cur.thinking = null; cur.tools = new Map();
  const streamPaths = new Set();
  for (const s of segments || []) {""",
    ))
    P.append((
        "html",
        """      cur.wrap.appendChild(card);
      if (s.id) cur.tools.set(s.id, card);
    }
  }
  scheduleAutoscroll();
}""",
        """      cur.wrap.appendChild(card);
      if (s.id) cur.tools.set(s.id, card);
      if (s.path) streamPaths.add(s.path);
    }
  }
  if (streamPaths.size) cur.wrap.appendChild(fileCardsBox([...streamPaths], ""));
  scheduleAutoscroll();
}""",
    ))
    P.append((
        "html",
        """        <div style="display:flex;gap:8px;margin-top:6px"><button class="ghost" data-dir="${escAttr(p)}">apri cartella</button></div>
      </div>`);""",
        """        <div style="display:flex;gap:8px;margin-top:6px">
          <button class="ghost" data-dir="${escAttr(p)}">apri cartella</button>
          <button class="ghost" data-dl="${escAttr(p)}" title="Scarica la cartella come ${escAttr(d.name)}.zip">⬇ zip</button>
        </div>
      </div>`);""",
    ))
    P.append((
        "html",
        '  card.textContent = "🔧 " + (info.name || "tool");',
        '  // gli eventi SSE portano `toolName`, i messaggi salvati `name`: si accettano entrambi\n'
        '  card.textContent = "🔧 " + (info.name || info.toolName || "tool");',
    ))
    return P


def apply_to(dirpath: pathlib.Path, patches, backups: pathlib.Path):
    files = {"mjs": dirpath / "dashboard.mjs", "html": dirpath / "dashboard.html"}
    texts = {k: p.read_text(encoding="utf-8") for k, p in files.items()}

    # prima si verifica tutto, poi si scrive (nessun file a metà)
    plan = []
    for kind, old, new in patches:
        t = texts[kind]
        n = t.count(old)
        if n != 1:
            raise SystemExit(f"[{dirpath.name}] ancora trovata {n} volte ({kind}): {old[:70]!r}")
        plan.append((kind, old, new))

    backups.mkdir(parents=True, exist_ok=True)
    for kind, path in files.items():
        shutil.copy2(path, backups / f"{dirpath.name}-{path.name}")
    # lo zip writer è nuovo: si copia così com'è
    shutil.copy2(SRC / "media" / "zip-write.mjs", dirpath / "media" / "zip-write.mjs")

    for kind, old, new in plan:
        texts[kind] = texts[kind].replace(old, new, 1)
    for kind, path in files.items():
        path.write_text(texts[kind], encoding="utf-8")

    # controllo di sintassi: mjs direttamente, l'HTML estraendo lo script inline
    subprocess.run(["node", "--check", str(files["mjs"])], check=True)
    html = texts["html"]
    inline = html[html.index("<script>\nconst $ =") + 8: html.rindex("</script>")]
    tmp = pathlib.Path("/tmp") / f"inline-{dirpath.name}.js"
    tmp.write_text(inline, encoding="utf-8")
    subprocess.run(["node", "--check", str(tmp)], check=True)
    print(f"[{dirpath.name}] patch applicate: {len(plan)} · sintassi OK (mjs + js inline)")


def main():
    targets = [pathlib.Path(a) for a in sys.argv[1:]]
    if not targets:
        raise SystemExit(__doc__)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    backups = pathlib.Path("/root/pi-harness/backups") / f"fix-card-download-{stamp}"
    patches = load_patches()
    for t in targets:
        apply_to(t, patches, backups)
    print(f"backup dei file originali: {backups}")


if __name__ == "__main__":
    main()
