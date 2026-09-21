// Echo server minimale: mostra al client cosa arriva davvero dal proxy.
// Usato da media/test-caddy-xff.sh per capire se Caddy 2.6.x preserva o
// sostituisce X-Forwarded-For inviato dal client. Solo diagnostica.
import http from "node:http";

const PORT = Number(process.argv[2]) || 9988;

http
  .createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify(
        {
          xff: req.headers["x-forwarded-for"] ?? null,
          xfh: req.headers["x-forwarded-host"] ?? null,
          xfp: req.headers["x-forwarded-proto"] ?? null,
          peer: req.socket.remoteAddress,
          spoofedCustom: req.headers["x-spoof-test"] ?? null,
        },
        null,
        2,
      ),
    );
  })
  .listen(PORT, "127.0.0.1", () => console.log(`echo su 127.0.0.1:${PORT}`));
