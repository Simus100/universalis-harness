#!/usr/bin/env python3
"""
Timestral — servizio locale di previsione su serie temporali, condiviso da TUTTE le
istanze dell'harness presenti su questa VPS.

Perché un servizio e non una chiamata per richiesta: i pesi vanno letti dal disco e
portati in RAM (Timestral-28M: 0,64 s; Timestral-209M: 27 s). Un processo solo, che tiene
il modello caldo e lo SCARICA quando nessuno lo usa, costa la RAM una volta sola invece di
una volta per istanza. Misure su questa macchina in media/timestral-bench.py.

Confine: qui non si sa nulla dell'agente, dei tool o della UI. Riceve serie numeriche e
restituisce previsioni probabilistiche; formattazione e decisioni stanno in media/timestral-tool.mjs.

Avvio: /opt/timestral-venv/bin/python media/timestral-service.py [--port 8018] [--size 28M]
"""
from __future__ import annotations

import argparse
import gc
import json
import os
import resource
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import numpy as np

# Taglie disponibili: la RAM dichiarata è quella MISURATA (RSS di picco) su questa VPS.
SIZES = {
    "5M": {"params": "5M", "weights_mb": 21, "rss_picco_mb": 281, "load_s": 0.35},
    "28M": {"params": "28M", "weights_mb": 111, "rss_picco_mb": 471, "load_s": 0.64},
    "123M": {"params": "123M", "weights_mb": 490, "rss_picco_mb": 1199, "load_s": 15.9},
    "209M": {"params": "209M", "weights_mb": 837, "rss_picco_mb": 1901, "load_s": 27.0},
}
TOKEN_FILE = os.environ.get("TIMESTRAL_TOKEN_FILE", "/etc/timestral/token")
MAX_SERIES = 64
MAX_CONTEXT = 32768
MAX_HORIZON = 4096
MAX_BODY = 16 * 1024 * 1024


def rss_mb() -> float | None:
    try:
        with open("/proc/self/status") as f:
            for line in f:
                if line.startswith("VmRSS:"):
                    return round(int(line.split()[1]) / 1024, 1)
    except OSError:
        return None
    return None


def read_token() -> str:
    """Token condiviso: un file leggibile dal servizio e dalle istanze (anche non-root).

    Non è un segreto di rete: il servizio ascolta SOLO su 127.0.0.1 e serve unicamente
    previsioni. Il token separa le istanze da un altro processo locale, non protegge dati.
    """
    env = os.environ.get("TIMESTRAL_TOKEN")
    if env:
        return env
    try:
        with open(TOKEN_FILE) as f:
            t = f.read().strip()
            if t:
                return t
    except OSError:
        pass
    t = os.urandom(16).hex()
    os.makedirs(os.path.dirname(TOKEN_FILE), exist_ok=True)
    with open(TOKEN_FILE, "w") as f:
        f.write(t + "\n")
    os.chmod(TOKEN_FILE, 0o644)  # leggibile: le istanze non privilegiate devono poterlo usare
    return t


TOKEN = read_token()


class Motore:
    """Un solo modello in memoria per volta, protetto da un lock: l'inferenza è CPU-bound e
    la macchina ha 6 vCPU condivise con quattro istanze dell'harness."""

    def __init__(self, size: str, idle_seconds: int):
        self.size = size if size in SIZES else "28M"
        self.idle_seconds = idle_seconds
        self._fc = None
        self._lock = threading.Lock()
        self._last_use = 0.0
        self.richieste = 0
        self.ultimo_errore: str | None = None
        self._stop = threading.Event()

    # ---- ciclo di vita ----
    def carica(self):
        if self._fc is not None:
            return self._fc
        from timestral import TimestralForecaster  # import lento: solo quando serve davvero

        repo = f"mistralai/Timestral-{self.size}"
        t0 = time.time()
        # Prima OFFLINE: `local_files_only=True` evita la chiamata di rete con cui
        # huggingface_hub controlla gli aggiornamenti. Misurato su questa VPS: con la verifica
        # online il primo caricamento arrivava a 2 minuti e 15 s, senza 0,6 s — perché la rete
        # verso l'Hub qui è lenta e a volte resetta la connessione. Si scende in rete solo se i
        # pesi non sono in cache.
        try:
            self._fc = TimestralForecaster.from_pretrained(repo, local_files_only=True)
        except Exception:  # noqa: BLE001
            print(f"[timestral] {repo} non in cache locale: lo scarico dall'Hub (una volta sola)", flush=True)
            self._fc = TimestralForecaster.from_pretrained(repo)
        self.load_s = round(time.time() - t0, 2)
        self._last_use = time.time()
        return self._fc

    def scarica(self, motivo: str = ""):
        if self._fc is None:
            return
        self._fc = None
        gc.collect()
        print(f"[timestral] modello {self.size} scaricato dalla RAM ({motivo}); rss={rss_mb()} MB", flush=True)

    def cambia_taglia(self, size: str):
        if size not in SIZES:
            raise ValueError(f"taglia sconosciuta: {size} (disponibili: {', '.join(SIZES)})")
        with self._lock:
            if size != self.size:
                self.scarica("cambio taglia")
                self.size = size
                self.carica()
        return self.stato()

    def _sorveglia(self):
        """Scarica il modello dopo `idle_seconds` di inattività: la RAM torna a quella del
        solo processo Python, senza che nessuno debba ricordarsi di spegnere niente."""
        while not self._stop.wait(30):
            if self._fc is not None and time.time() - self._last_use > self.idle_seconds:
                with self._lock:
                    if self._fc is not None and time.time() - self._last_use > self.idle_seconds:
                        self.scarica(f"inattività {self.idle_seconds}s")

    def avvia_sorveglianza(self):
        threading.Thread(target=self._sorveglia, daemon=True).start()

    # ---- stato ----
    def stato(self) -> dict:
        s = SIZES[self.size]
        return {
            "ok": True,
            "servizio": "timestral",
            "taglia": self.size,
            "caricato": self._fc is not None,
            "taglie": SIZES,
            "ram_processo_mb": rss_mb(),
            "ram_picco_taglia_mb": s["rss_picco_mb"],
            "load_s_atteso": s["load_s"],
            "idle_s": round(time.time() - self._last_use, 1) if self._fc is not None else None,
            "idle_unload_s": self.idle_seconds,
            "richieste": self.richieste,
            "ultimo_errore": self.ultimo_errore,
            "thread": int(os.environ.get("TIMESTRAL_THREADS", "4")),
        }

    # ---- previsione ----
    def prevedi(self, req: dict) -> dict:
        series = req.get("series")
        if not isinstance(series, list) or not series:
            raise ValueError("campo `series` obbligatorio: lista di serie, o lista di {name, values}")
        nomi = []
        matrici = []
        for i, s in enumerate(series[:MAX_SERIES]):
            if isinstance(s, dict):
                vals = s.get("values")
                nomi.append(str(s.get("name") or f"serie {i + 1}")[:80])
            else:
                vals = s
                nomi.append(f"serie {i + 1}")
            arr = np.asarray([np.nan if v is None else float(v) for v in vals], dtype=np.float64)
            if arr.size < 8:
                raise ValueError(f"serie {nomi[-1]}: servono almeno 8 punti")
            if arr.size > MAX_CONTEXT:
                arr = arr[-MAX_CONTEXT:]  # il modello tiene i passi più recenti
            matrici.append(arr)

        h = int(req.get("prediction_length") or 30)
        if not (1 <= h <= MAX_HORIZON):
            raise ValueError(f"prediction_length fuori intervallo (1..{MAX_HORIZON})")

        # più serie = variate dello stesso sistema, previsone congiunta: è la forza del modello,
        # ma solo se le serie sono davvero legate fra loro. Il chiamante decide.
        T = max(m.size for m in matrici)
        # tutte le serie allineate a DESTRA (il presente è in fondo) e riempite a sinistra con NaN,
        # che il modello tratta come valore mancante: nessun valore inventato.
        impilate = [m if m.size == T else np.concatenate([np.full(T - m.size, np.nan), m]) for m in matrici]
        # `mode`: "joint" = variate di UN sistema (il modello usa le dipendenze); "separate"
        # (default) = una previsione indipendente per serie. Il default è "separate" perché
        # supporre un legame che non c'è peggiora le previsioni, e la scelta spetta al chiamante.
        congiunta = str(req.get("mode", "separate")).lower() == "joint" and len(matrici) > 1
        if congiunta:
            ctx = np.stack(impilate, axis=0)[None, :, :]  # (1, V, T)
        else:
            ctx = np.stack(impilate, axis=0)[:, None, :]  # (B, 1, T)

        def cov(chiave, T_atteso):
            raw = req.get(chiave)
            if raw is None:
                return None
            a = np.asarray(raw, dtype=np.float64)
            if a.ndim == 1:
                a = a[None, None, :]
            elif a.ndim == 2:
                a = a[None, :, :]
            if a.shape[-1] != T_atteso:
                raise ValueError(f"{chiave}: ultima dimensione {a.shape[-1]}, attesa {T_atteso}")
            return a

        if not congiunta and (req.get("past_covariates") is not None or req.get("known_covariates") is not None):
            raise ValueError("le covariate valgono solo con mode=\"joint\": in modalità separata ogni serie è indipendente")

        fc = self.carica()
        self._last_use = time.time()
        with self._lock:
            t0 = time.time()
            f = fc.forecast(
                ctx,
                prediction_length=h,
                past_covariates=cov("past_covariates", ctx.shape[-1]),
                known_covariates=cov("known_covariates", ctx.shape[-1] + h),
            )
            lat = round(time.time() - t0, 3)
            self.richieste += 1
            self._last_use = time.time()

        q = f.quantiles.detach().cpu().numpy()  # (B, V, H, Q)
        # Vista normalizzata: qs[s] = quantili (H, Q) della serie s, in entrambe le modalità.
        qs = q[0] if q.shape[0] == 1 else q[:, 0, :, :]
        livelli = list(f.quantile_levels)

        def q_at(level):
            return qs[:, :, livelli.index(level)]  # (S, H), una riga per serie

        out_series = []
        for vi, nome in enumerate(nomi[: qs.shape[0]]):
            storico = matrici[vi] if vi < len(matrici) else matrici[0]
            non_nan = storico[~np.isnan(storico)]
            ultimo = float(non_nan[-1]) if non_nan.size else None
            mediana = q_at(0.5)[vi]
            serie = {
                "name": nome,
                "last_observed": ultimo,
                "median": [round(float(x), 6) for x in mediana],
                "q05": [round(float(x), 6) for x in q_at(0.05)[vi]],
                "q10": [round(float(x), 6) for x in q_at(0.1)[vi]],
                "q25": [round(float(x), 6) for x in q_at(0.25)[vi]],
                "q75": [round(float(x), 6) for x in q_at(0.75)[vi]],
                "q90": [round(float(x), 6) for x in q_at(0.9)[vi]],
                "q95": [round(float(x), 6) for x in q_at(0.95)[vi]],
                "stats": statistiche(qs[vi], livelli, ultimo),
            }
            out_series.append(serie)

        return {
            "ok": True,
            "taglia": self.size,
            "prediction_length": h,
            "latency_s": lat,
            "congiunta": congiunta,
            "quantile_levels": livelli,
            "series": out_series,
            "nota": "Previsione probabilistica da modello pre-addestrato (zero-shot): è una STIMA con "
                    "un'incertezza dichiarata dai quantili, non un fatto. Le probabilità derivano dai "
                    "quantili marginali del modello.",
        }


    # ---- verifica storica (backtest) ----
    def backtest(self, req: dict) -> dict:
        """Rolling-origin sullo storico: quanto avrebbe sbagliato il modello, e quanto è
        onesta la sua banda. Senza questo, una previsione è solo un disegno.

        Ritorna MAE modello vs MAE del naive («domani come oggi») e la COPERTURA empirica
        delle bande 80%/95%: se la banda dichiarata contiene il valore reale molto meno
        dell'80% delle volte, l'incertezza è sottostimata e va detto.
        """
        valori = req.get("values")
        if not isinstance(valori, list) or len(valori) < 40:
            raise ValueError("servono almeno 40 punti per una verifica storica")
        y_all = np.asarray([np.nan if v is None else float(v) for v in valori], dtype=np.float64)
        y_all = y_all[~np.isnan(y_all)]
        h = int(req.get("prediction_length") or 30)
        if not (1 <= h <= MAX_HORIZON):
            raise ValueError(f"prediction_length fuori intervallo (1..{MAX_HORIZON})")
        folds = max(1, min(10, int(req.get("folds") or 5)))
        # contesto automatico: metà dello storico disponibile (più finestre di verifica),
        # con un tetto a 1000 punti; chi chiama può imporlo
        ctx = int(req.get("context") or min(1000, max(32, (len(y_all) - h) // 2)))
        if ctx < 16:
            raise ValueError("storico troppo corto per la verifica storica")
        step = max(h, ctx // 2)

        righe = []
        fc = self.carica()
        t0 = time.time()
        with self._lock:
            self._last_use = time.time()
            for i in range(folds):
                origine = len(y_all) - h - i * step
                if origine - ctx < 0:
                    break
                y = y_all[origine:origine + h]
                contesto = y_all[origine - ctx:origine].reshape(1, 1, -1)
                f = fc.forecast(contesto, prediction_length=h)
                q = f.quantiles.detach().cpu().numpy()[0, 0]  # (H, Q)
                livelli = list(f.quantile_levels)
                med = q[:, livelli.index(0.5)]
                naive = np.full(h, y_all[origine - 1])
                righe.append({
                    "mae_modello": float(np.mean(np.abs(y - med))),
                    "mae_naive": float(np.mean(np.abs(y - naive))),
                    "pinball_modello": _pinball(q, y, livelli),
                    "dentro80": float(np.mean((y >= q[:, livelli.index(0.1)]) & (y <= q[:, livelli.index(0.9)]))),
                    "dentro95": float(np.mean((y >= q[:, livelli.index(0.05)]) & (y <= q[:, livelli.index(0.95)]))),
                })
            self.richieste += 1
            self._last_use = time.time()
        if not righe:
            raise ValueError("storico troppo corto per la verifica storica: servono più punti, o un contesto più piccolo")
        mae_m = float(np.mean([r["mae_modello"] for r in righe]))
        mae_n = float(np.mean([r["mae_naive"] for r in righe]))
        return {
            "ok": True,
            "taglia": self.size,
            "folds": len(righe),
            "passi_per_fold": h,
            "contesto": ctx,
            "mae_modello": round(mae_m, 6),
            "mae_naive": round(mae_n, 6),
            "skill_mae_pct": round(100 * (1 - mae_m / mae_n), 2) if mae_n else None,
            "pinball_modello": round(float(np.mean([r["pinball_modello"] for r in righe])), 6),
            "copertura80_pct": round(100 * float(np.mean([r["dentro80"] for r in righe])), 1),
            "copertura95_pct": round(100 * float(np.mean([r["dentro95"] for r in righe])), 1),
            "latency_s": round(time.time() - t0, 2),
        }


def statistiche(qv: np.ndarray, livelli: list[float], ultimo: float | None) -> dict:
    """Numeri che servono a decidere, calcolati DAI QUANTILI (nessuna simulazione inventata)."""
    qf = qv[-1]  # passo finale: (Q,)
    med = float(qf[livelli.index(0.5)])
    out = {
        "median_end": round(med, 6),
        "q05_end": round(float(qf[livelli.index(0.05)]), 6),
        "q95_end": round(float(qf[livelli.index(0.95)]), 6),
        "band80_width_pct": None,
        "p_rise_end": None,
        "expected_change_end": None,
        "expected_change_end_pct": None,
    }
    lo, hi = float(qf[livelli.index(0.1)]), float(qf[livelli.index(0.9)])
    if med != 0:
        out["band80_width_pct"] = round(100 * (hi - lo) / abs(med), 2)
    if ultimo is not None and ultimo != 0:
        # F(ultimo) interpolata sui quantili → P(y_fine > ultimo)
        xs = np.asarray(livelli, dtype=np.float64)
        f_ultimo = float(np.interp(ultimo, qf, xs))
        out["p_rise_end"] = round(1.0 - f_ultimo, 3)
        out["expected_change_end"] = round(med - ultimo, 6)
        out["expected_change_end_pct"] = round(100 * (med - ultimo) / abs(ultimo), 3)
    return out


def _pinball(q: np.ndarray, y: np.ndarray, livelli: list[float]) -> float:
    """Pinball loss medio su tutti i quantili (la loss di training; proxy del CRPS)."""
    diff = y[:, None] - q
    lv = np.asarray(livelli, dtype=np.float64)[None, :]
    return float(np.mean(np.maximum(lv * diff, (lv - 1) * diff)))


MOTORE = Motore(os.environ.get("TIMESTRAL_SIZE", "28M"),
                int(os.environ.get("TIMESTRAL_IDLE_UNLOAD_S", "900")))


class Handler(BaseHTTPRequestHandler):
    server_version = "timestral/1.0"

    def log_message(self, fmt, *args):  # meno rumore nei log di sistema
        return

    def _json(self, code: int, obj: dict):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _autorizzato(self) -> bool:
        got = self.headers.get("X-Timestral-Token") or ""
        return got == TOKEN

    def do_GET(self):
        if self.path.startswith("/health"):
            return self._json(200, MOTORE.stato())
        self._json(404, {"ok": False, "error": "rotta sconosciuta"})

    def do_POST(self):
        if not self._autorizzato():
            return self._json(401, {"ok": False, "error": "token mancante o errato (X-Timestral-Token)"})
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n <= 0 or n > MAX_BODY:
                return self._json(400, {"ok": False, "error": "corpo assente o troppo grande"})
            req = json.loads(self.rfile.read(n) or b"{}")
        except Exception as e:  # noqa: BLE001
            return self._json(400, {"ok": False, "error": f"JSON non valido: {e}"})
        try:
            if self.path.startswith("/model"):
                return self._json(200, MOTORE.cambia_taglia(str(req.get("size", ""))))
            if self.path.startswith("/unload"):
                MOTORE.scarica("richiesta esplicita")
                return self._json(200, MOTORE.stato())
            if self.path.startswith("/forecast"):
                return self._json(200, MOTORE.prevedi(req))
            if self.path.startswith("/backtest"):
                return self._json(200, MOTORE.backtest(req))
            self._json(404, {"ok": False, "error": "rotta sconosciuta"})
        except ValueError as e:
            MOTORE.ultimo_errore = str(e)
            self._json(400, {"ok": False, "error": str(e)})
        except Exception as e:  # noqa: BLE001
            MOTORE.ultimo_errore = f"{type(e).__name__}: {e}"
            self._json(500, {"ok": False, "error": MOTORE.ultimo_errore})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=int(os.environ.get("TIMESTRAL_PORT", "8018")))
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--size", default=MOTORE.size)
    ap.add_argument("--idle", type=int, default=MOTORE.idle_seconds)
    ap.add_argument("--preload", action="store_true", help="carica i pesi all'avvio invece che alla prima richiesta")
    a = ap.parse_args()
    MOTORE.size = a.size if a.size in SIZES else MOTORE.size
    MOTORE.idle_seconds = a.idle
    if a.preload:
        MOTORE.carica()
    MOTORE.avvia_sorveglianza()
    srv = ThreadingHTTPServer((a.host, a.port), Handler)
    print(f"[timestral] in ascolto su http://{a.host}:{a.port} · taglia {MOTORE.size} · "
          f"scarico dopo {MOTORE.idle_seconds}s di inattività · rss={rss_mb()} MB", flush=True)
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        MOTORE._stop.set()


if __name__ == "__main__":
    main()
