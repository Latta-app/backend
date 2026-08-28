/* ============================================================================
 * A PÁGINA DE COMPARTILHAMENTO
 * ============================================================================
 *
 * A página que o tutor abre pelo botão do template, pra mandar a arte pro
 * Instagram. Ela é ARQUIVO ESTÁTICO no repo `landing-page`, servido pelo
 * Netlify — não é uma rota do backend.
 *
 * 🚨 Então esta camada NÃO PUBLICA NADA. Ela GERA os dois arquivos que a página
 * exige e mostra o resultado; quem publica é quem tem o repo na mão. A aba
 * existe pra tirar do operador a parte que quebra em silêncio, que são os dois
 * arquivos abaixo — não pra dar a ele um botão de publicar que ele não tem.
 *
 * ── OS DOIS ARQUIVOS, E POR QUE O SEGUNDO É O PERIGOSO ───────────────────────
 *
 * 1. `public/<slug>/index.html` — a página, com a copy da campanha.
 *
 * 2. duas linhas no `public/_redirects`, e é aqui que mora o defeito silencioso:
 *
 *    🚨 A página precisa MONTAR o arquivo (fetch + new File) pra Web Share API
 *    aceitar `files`. Exibir num `<img>` não basta. E fetch cross-origin exige
 *    CORS — o do bucket libera `latta.app.br`, que não é o domínio da landing.
 *    Um link direto pro S3 falha do jeito mais silencioso possível: a imagem
 *    APARECE na tela e o botão de compartilhar não leva arquivo nenhum.
 *
 *    Com `200` (e não `301`) o Netlify busca e serve pelo próprio domínio: pro
 *    navegador é same-origin, e CORS deixa de existir como problema.
 * ============================================================================ */

const texto = (v) => String(v ?? '').trim();

/** Escapa o que vai virar HTML. A copy é digitada, então ela é entrada. */
const escapar = (v) =>
  texto(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export const PADRAO_DA_PAGINA = {
  slug: '',
  kicker: '',
  titulo: 'Compartilhe a homenagem',
  instrucao: 'Toque em compartilhar e escolha o Instagram. Marque a gente em @latta.app.',
  botao: 'Compartilhar a imagem',
};

/**
 * As duas linhas do `_redirects`, na ordem que importa.
 *
 * 🚨 A do `arte/*` vem ANTES da do `/<slug>/*`: a primeira regra que casa vence,
 * e invertidas a página se serviria no lugar da imagem. O sintoma seria a arte
 * não aparecer pra ninguém.
 */
export const linhasDeRedirect = ({ slug, campaignId }) => [
  `/${slug}/arte/*   https://ai-images-n8n.s3.sa-east-1.amazonaws.com/campanhas/${campaignId}/p/:splat   200`,
  `/${slug}/*   /${slug}/index.html   200`,
];

/**
 * O HTML da página.
 *
 * Segue o mesmo esqueleto do `dia-do-cachorro`, que foi medido no aparelho de
 * verdade: Web Share API com `files`, botão de baixar como saída, e o bloco de
 * diagnóstico atrás de `?debug=1`.
 *
 * 🚨 O bloco de diagnóstico fica. Ele é o que respondeu "por que o compartilhar
 * não funciona naquele aparelho" em 26/08, e sem ele a resposta vira adivinhação.
 * E o `.diag[hidden] { display: none }` fica junto: `display:flex` vence o
 * atributo `hidden`, e sem essa linha o bloco aparece pro tutor.
 */
export const montarHtml = ({ pagina, campaignId }) => {
  const p = { ...PADRAO_DA_PAGINA, ...(pagina || {}) };
  const slug = texto(p.slug);
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="robots" content="noindex">
<title>${escapar(p.titulo)} | Latta</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap">
<style>
  :root { --ground:#FFFFFF; --surface:#F8F6FC; --border:#E4DDF1; --ink:#1F2937;
    --ink-strong:#14101F; --muted:#6B6480; --primary:#5B21B6; --magenta:#C026D3; }
  @media (prefers-color-scheme: dark) {
    :root { --ground:#131019; --surface:#1A1623; --border:#302941; --ink:#E9E4F2;
      --ink-strong:#FBFAFE; --muted:#A79FBA; --primary:#B79BFB; --magenta:#E879F9; }
  }
  * { box-sizing: border-box; }
  body { background:var(--ground); color:var(--ink); font-family:Inter, system-ui, sans-serif;
    line-height:1.6; margin:0; padding:1.5rem 1.15rem 3rem; -webkit-font-smoothing:antialiased; }
  .wrap { max-width:27rem; margin:0 auto; display:flex; flex-direction:column; gap:1.1rem; }
  .kicker { font-size:.7rem; letter-spacing:.16em; text-transform:uppercase;
    color:var(--magenta); font-weight:600; }
  h1 { font-size:1.5rem; font-weight:800; letter-spacing:-.03em; margin:0; color:var(--ink-strong); }
  p { margin:0; }
  p.lede { color:var(--muted); font-size:.95rem; }
  img.art { width:100%; border-radius:12px; display:block; border:1px solid var(--border); }
  button { font:inherit; font-weight:600; font-size:1.05rem; width:100%; padding:.95rem 1rem;
    border-radius:10px; border:none; background:var(--primary); color:#fff; cursor:pointer; }
  button:disabled { opacity:.45; cursor:not-allowed; }
  a.ghost { display:block; text-align:center; font-weight:600; font-size:1.05rem;
    padding:.95rem 1rem; border-radius:10px; border:1.5px solid var(--border);
    color:var(--primary); text-decoration:none; }
  .diag { background:var(--surface); border:1px solid var(--border); border-radius:10px;
    padding:.9rem 1rem; font-family:monospace; font-size:.75rem; display:flex;
    flex-direction:column; gap:.35rem; overflow-x:auto; }
  /* 🚨 display:flex VENCE o atributo hidden. Sem esta linha o diagnostico
     aparece pro tutor, e parece cache. */
  .diag[hidden] { display:none; }
  #status { font-size:.9rem; color:var(--muted); min-height:1.4em; }
</style>
</head>
<body>
<div class="wrap">
  <div>
    ${p.kicker ? `<div class="kicker">${escapar(p.kicker)}</div>` : ''}
    <h1>${escapar(p.titulo)}</h1>
  </div>
  <p class="lede">${escapar(p.instrucao)}</p>
  <img class="art" id="art" alt="${escapar(p.titulo)}">
  <button id="share">${escapar(p.botao)}</button>
  <a class="ghost" id="dl" download="${escapar(slug)}-latta.jpg">Baixar a imagem</a>
  <p id="status"></p>
  <div class="diag" id="diag" hidden></div>
</div>
<script>
  var el = function (id) { return document.getElementById(id); };
  var status = el("status"), file = null;
  if (/[?&]debug=1\\b/.test(location.search)) el("diag").hidden = false;

  // O token vem no ULTIMO segmento do path: /${slug}/<token>.
  // 🚨 Ele e OPACO de proposito: o nome do arquivo da peca e derivado do
  // telefone, e este link e publicado pelo proprio tutor.
  function artUrl() {
    var seg = location.pathname.replace(/\\/+$/, "").split("/").pop();
    if (!seg || seg === "${slug}") return "";
    // Proxy same-origin (_redirects) -> S3. Nunca aponte direto pro bucket:
    // cross-origin sem CORS deixa o <img> aparecer e o fetch falhar calado.
    return "/${slug}/arte/" + encodeURIComponent(seg) + ".jpg";
  }

  function linha(rotulo, valor) {
    var d = document.createElement("div");
    d.textContent = rotulo + ": " + valor;
    el("diag").appendChild(d);
  }

  async function boot() {
    var url = artUrl();
    linha("token", url ? "ok" : "ausente");
    if (!url) { status.textContent = "Abra pelo link que a Latta te mandou."; return; }
    el("art").src = url;
    el("dl").href = url;
    try {
      var resp = await fetch(url);
      var blob = await resp.blob();
      file = new File([blob], "${slug}-latta.jpg", { type: "image/jpeg" });
      linha("arquivo", Math.round(blob.size / 1024) + " KB");
    } catch (e) {
      linha("fetch", "falhou: " + e.message);
    }
  }

  el("share").addEventListener("click", async function () {
    if (!file || !navigator.canShare || !navigator.canShare({ files: [file] })) {
      status.textContent = "Seu aparelho nao abre o compartilhar aqui. Use o botao de baixar.";
      return;
    }
    try {
      await navigator.share({ files: [file] });
    } catch (e) {
      if (e.name !== "AbortError") status.textContent = "Nao deu pra compartilhar.";
    }
  });

  boot();
</script>
</body>
</html>`;
};

export default { montarHtml, linhasDeRedirect, PADRAO_DA_PAGINA };
