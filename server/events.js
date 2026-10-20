// Public invalidations contain no customer, order, session or pricing payload.
const clients = new Set();
const byIP = new Map();
export function catalogEvents(req, res) {
  if (clients.size >= 200 || (byIP.get(req.ip) || 0) >= 10)
    return res.status(429).json({ error: "Too many live update connections." });
  byIP.set(req.ip, (byIP.get(req.ip) || 0) + 1);
  res
    .status(200)
    .set({
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
  res.flushHeaders();
  res.write(": connected\n\n");
  clients.add(res);
  const heartbeat = setInterval(() => res.write(": keepalive\n\n"), 20000);
  heartbeat.unref();
  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(res);
    const n = (byIP.get(req.ip) || 1) - 1;
    if (n) byIP.set(req.ip, n);
    else byIP.delete(req.ip);
  });
}
export function notifyCatalog() {
  for (const res of clients) res.write("event: catalog\ndata: changed\n\n");
}
