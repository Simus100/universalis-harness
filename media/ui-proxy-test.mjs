/**
 * Proxy di SOLA LETTURA per il test della UI: inoltra a un'istanza di prova della
 * dashboard aggiungendo l'header Basic auth, così un browser headless può aprirla
 * senza gestire il login (Chrome non accetta più le credenziali nell'URL).
 *
 * Non tocca la dashboard di produzione: ascolta solo su 127.0.0.1 e va usato a mano.
 *   node media/ui-proxy-test.mjs <portaAscolto> <portaDashboard> <user> <password>
 */
import http from "node:http";

const [listenPort, dashPort, user, pass] = process.argv.slice(2);
if (!listenPort || !dashPort || !user || !pass) {
  console.error("uso: node media/ui-proxy-test.mjs <portaAscolto> <portaDashboard> <user> <password>");
  process.exit(1);
}
const AUTH = "Basic " + Buffer.from(`${user}:${pass}`).toString("base64");

http
  .createServer((req, res) => {
    const up = http.request(
      {
        host: "127.0.0.1",
        port: Number(dashPort),
        path: req.url,
        method: req.method,
        headers: { ...req.headers, authorization: AUTH },
      },
      (pr) => {
        res.writeHead(pr.statusCode || 502, pr.headers);
        pr.pipe(res);
      },
    );
    up.on("error", (e) => {
      res.writeHead(502, { "content-type": "text/plain" });
      res.end("proxy error: " + e.message);
    });
    req.pipe(up);
  })
  .listen(Number(listenPort), "127.0.0.1", () => {
    console.log(`proxy di test: http://127.0.0.1:${listenPort} -> dashboard :${dashPort} (con Basic auth iniettata)`);
  });
