import { OFFLINE_KEY } from "@/lib/offline";

/**
 * Página aberta pelo service worker quando não há internet. É autossuficiente
 * (sem React nem arquivos externos), porque offline nada mais pode ser baixado.
 * Lê do próprio aparelho os próximos voos guardados pelo app (localStorage) e
 * monta a tela com textContent (os dados nunca viram HTML).
 */
const HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#1e4fd8">
<title>Sem conexão · Minhas Passagens</title>
<style>
  :root { --bg:#f6f5f1; --fg:#14161a; --muted:#5b606b; --card:#fff; --line:#e2e5ea; --brand:#1e4fd8; --on:#dde5fb; }
  @media (prefers-color-scheme: dark) {
    :root { --bg:#0e1116; --fg:#ecedef; --muted:#a3a9b5; --card:#171b22; --line:#262b35; --brand:#1b2440; --on:#cdd2da; }
  }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--fg); font:16px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
  main { max-width: 640px; margin: 0 auto; padding: 24px 16px 48px; display:flex; flex-direction:column; gap:16px; }
  .banner { background:#fef3c7; color:#78350f; border-radius:14px; padding:12px 14px; font-size:14px; font-weight:600; }
  @media (prefers-color-scheme: dark) { .banner { background:#451a03; color:#fde68a; } }
  h1 { font-size:22px; margin:0; }
  .muted { color:var(--muted); font-size:13px; }
  .pass { background:var(--brand); color:#fff; border-radius:24px; overflow:hidden; }
  .pass .top { padding:18px 18px 14px; display:flex; flex-direction:column; gap:8px; }
  .pass .stub { padding:14px 18px 18px; border-top:2px dashed rgba(255,255,255,.4); }
  .label { font-size:12px; font-weight:700; letter-spacing:.08em; text-transform:uppercase; color:var(--on); }
  .codes { display:flex; justify-content:space-between; align-items:flex-end; }
  .code { font: 600 38px/1 ui-monospace, SFMono-Regular, Menlo, monospace; }
  .city { font-size:12px; color:var(--on); }
  .locator { font: 600 26px/1.2 ui-monospace, SFMono-Regular, Menlo, monospace; letter-spacing:.2em; }
  .on { color:var(--on); font-size:13px; }
  ul { list-style:none; margin:0; padding:0; background:var(--card); border:1px solid var(--line); border-radius:16px; }
  li { padding:12px 14px; border-top:1px solid var(--line); display:flex; flex-direction:column; gap:2px; }
  li:first-child { border-top:0; }
  .route { font-weight:600; }
  button { align-self:flex-start; font:600 14px system-ui, sans-serif; color:#fff; background:#1e4fd8; border:0; border-radius:12px; padding:10px 16px; }
</style>
</head>
<body>
<main>
  <p class="banner" role="status">Sem conexão. Mostrando o que ficou guardado neste aparelho.</p>
  <h1>Seus próximos voos</h1>
  <div id="conteudo"></div>
  <button type="button" onclick="location.reload()">Tentar de novo</button>
</main>
<script>
(function () {
  var box = document.getElementById("conteudo");
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  var data = null;
  try { data = JSON.parse(localStorage.getItem(${JSON.stringify(OFFLINE_KEY)}) || "null"); } catch (e) {}
  if (!data || !data.flights || !data.flights.length) {
    box.appendChild(el("p", "muted", "Nada guardado ainda. Abra o app com internet uma vez e os próximos voos ficam disponíveis aqui."));
    return;
  }
  var f = data.flights[0];
  var pass = el("section", "pass");
  pass.setAttribute("aria-label", "Próximo voo");
  var top = el("div", "top");
  top.appendChild(el("span", "label", "Próximo voo"));
  var codes = el("div", "codes");
  var a = el("div"); a.appendChild(el("div", "code", f.origin)); a.appendChild(el("div", "city", f.originCity));
  var b = el("div"); b.style.textAlign = "right"; b.appendChild(el("div", "code", f.destination)); b.appendChild(el("div", "city", f.destinationCity));
  codes.appendChild(a); codes.appendChild(b); top.appendChild(codes);
  top.appendChild(el("div", null, f.when + (f.arrives ? " · chega " + f.arrives : "")));
  top.appendChild(el("div", "on", [f.airline, f.flightNumber, f.airport].filter(Boolean).join(" · ")));
  pass.appendChild(top);
  if (f.locator) {
    var stub = el("div", "stub");
    stub.appendChild(el("div", "label", "Localizador"));
    stub.appendChild(el("div", "locator", f.locator));
    pass.appendChild(stub);
  }
  box.appendChild(pass);
  if (data.flights.length > 1) {
    var ul = el("ul");
    ul.setAttribute("aria-label", "Depois");
    for (var i = 1; i < data.flights.length; i++) {
      var g = data.flights[i];
      var li = el("li");
      li.appendChild(el("span", "route", g.origin + " → " + g.destination));
      li.appendChild(el("span", "muted", g.when + (g.arrives ? " · chega " + g.arrives : "")));
      li.appendChild(el("span", "muted", [g.airline, g.flightNumber, g.locator ? "localizador " + g.locator : null].filter(Boolean).join(" · ")));
      ul.appendChild(li);
    }
    box.appendChild(ul);
  }
  var saved = new Date(data.savedAt);
  box.appendChild(el("p", "muted", "Guardado em " + saved.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) + ". Confira mudanças de horário quando tiver conexão."));
})();
</script>
</body>
</html>`;

export function GET() {
  return new Response(HTML, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // O service worker guarda esta página; o navegador sempre busca a versão nova online.
      "cache-control": "no-cache",
    },
  });
}
