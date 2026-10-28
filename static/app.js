// ============================================================ utilidades
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const app = $("#app");

const api = async (path, opts = {}) => {
  const res = await fetch("/api" + path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw Object.assign(new Error(data.erro || "Não foi possível concluir a operação"), { data });
  return data;
};

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const money = (v) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const moneyShort = (v) => v >= 1000 ? "R$ " + (v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mil" : money(v);
const fmtDate = (iso) => (iso ? iso.split("-").reverse().join("/") : "—");
const fmtShort = (iso) => new Date(iso + "T12:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
const debounce = (fn, ms = 200) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
const initials = (n) => { const w = (n || "?").split(/\s+/).filter((x) => !/^(d[aeo]s?|e|ltda|me|s\/?a)$/i.test(x)); return ((w[0]?.[0] || "") + (w.length > 1 ? w.at(-1)[0] : "")).toUpperCase(); };
function formatarDocumento(v) {
  const d = (v || "").replace(/\D/g, "");
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5");
  return (v || "").trim();
}
// ============================================================ validação de formulários
// Mesmas regras de validacao.py: "erros" impedem salvar; "avisos" pedem confirmação (possível erro de digitação).
const soDigitos = (v) => String(v ?? "").replace(/\D/g, "");
const semAcento = (v) => String(v ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

function cpfValido(v) {
  const d = soDigitos(v);
  if (d.length !== 11 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += +d[i] * (n + 1 - i); return (s * 10 % 11) % 10; };
  return dv(9) === +d[9] && dv(10) === +d[10];
}
function cnpjValido(v) {
  const d = soDigitos(v);
  if (d.length !== 14 || /^(\d)\1+$/.test(d)) return false;
  const dv = (n) => {
    const pesos = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = pesos.reduce((s, p, i) => s + p * d[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return dv(12) === +d[12] && dv(13) === +d[13];
}
function digitosTelefone(v) {
  let d = soDigitos(v);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  return d;
}
function formatarTelefone(v) {
  const d = digitosTelefone(v);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(v ?? "").trim();
}
// "2.850,50" -> 2850.5 ; vazio -> null ; texto inválido -> NaN
function lerNumero(v) {
  if (v == null || String(v).trim() === "") return null;
  let s = String(v).replace(/R\$|\s/g, "");
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}
const fmtNumero = (n, casas = 2) => (n == null || n === "" ? "" : Number(n).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }));
const diasEntre = (a, b) => Math.round((new Date(b + "T12:00") - new Date(a + "T12:00")) / 864e5);
function distancia(a, b) { // Levenshtein: quantas letras mudam de um nome para o outro
  const m = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) m[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    m[i][j] = Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return m[a.length][b.length];
}

const MINUSCULAS = new Set(["da", "das", "de", "do", "dos", "e", "di", "du"]);
function capitalizarNome(nome) { // só mexe em nomes todo em minúsculas ou todo em MAIÚSCULAS
  if (nome !== nome.toLowerCase() && nome !== nome.toUpperCase()) return nome;
  return nome.toLowerCase().split(" ").map((p, i) => (i && MINUSCULAS.has(p) ? p : p.charAt(0).toUpperCase() + p.slice(1))).join(" ");
}

// campo de dinheiro: digita só números e a máscara monta "2.850,00" (os dois últimos dígitos são os centavos)
const campoMoeda = (name, valor, extra = "") =>
  `<input name="${name}" type="text" inputmode="numeric" data-moeda autocomplete="off" placeholder="0,00" value="${valor == null || valor === "" ? "" : fmtNumero(valor)}" ${extra}>`;
const campoPercentual = (name, valor) =>
  `<input name="${name}" type="text" inputmode="decimal" data-numero autocomplete="off" placeholder="0" value="${valor == null || valor === "" ? "" : String(valor).replace(".", ",")}">`;
function ativarMascaras(form) {
  $$("[data-moeda]", form).forEach((el) => el.addEventListener("input", () => {
    const d = soDigitos(el.value).replace(/^0+(?=\d)/, "");
    el.value = d ? fmtNumero(Number(d) / 100) : "";
  }));
  $$("[data-numero]", form).forEach((el) => el.addEventListener("input", () => { el.value = el.value.replace(/[^\d,.]/g, ""); }));
}
// valores do formulário com os campos numéricos já convertidos para número
function valoresForm(form) {
  const v = formData(form);
  $$("[data-moeda], [data-numero]", form).forEach((el) => { v[el.name] = lerNumero(el.value); });
  return v;
}

function mensagemCampo(input, msg, tipo = "erro") {
  if (!input) return;
  const label = input.closest("label") || input.parentElement;
  let el = label.querySelector(":scope > .field-msg");
  input.toggleAttribute("aria-invalid", Boolean(msg) && tipo === "erro");
  if (!msg) return el?.remove();
  if (!el) { el = document.createElement("small"); label.append(el); }
  el.className = "field-msg " + tipo;
  el.textContent = msg;
}

/* Liga a validação a um formulário. validar() devolve { erros: {campo: msg}, avisos: {campo: msg} }.
   Retorna a função podeSalvar(): mostra tudo, bloqueia se houver erro e, se houver aviso,
   troca o botão para "Confirmar e salvar" e só libera no segundo clique. */
function ligarValidacao(form, validar, botao) {
  const textoOriginal = botao.textContent;
  let confirmado = "";
  const extras = { erros: {}, avisos: {} }; // resultados de checagens no servidor (ex.: duplicados)
  const resultado = () => {
    const r = validar();
    return { erros: { ...r.erros, ...extras.erros }, avisos: { ...r.avisos, ...extras.avisos } };
  };
  const mostrar = (r, so) => {
    for (const el of form.elements) {
      if (!el.name || (so && el !== so)) continue;
      mensagemCampo(el, r.erros[el.name] || r.avisos[el.name], r.erros[el.name] ? "erro" : "aviso");
    }
  };
  const resetarConfirmacao = () => { if (confirmado) { confirmado = ""; botao.textContent = textoOriginal; } };
  form.addEventListener("focusout", (e) => { if (e.target.name) mostrar(resultado(), e.target); });
  form.addEventListener("change", (e) => { if (e.target.name) mostrar(resultado(), e.target); });
  form.addEventListener("input", resetarConfirmacao);
  return {
    extras,
    atualizar: (campo) => mostrar(resultado(), form.elements[campo]),
    erroServidor(e) { // erro devolvido pelo servidor ao salvar: marca o campo certo
      if (!e.data?.campo || !form.elements[e.data.campo]) return false;
      mensagemCampo(form.elements[e.data.campo], e.message, "erro");
      form.elements[e.data.campo].focus();
      return true;
    },
    podeSalvar() {
      const r = resultado();
      mostrar(r);
      const comErro = Object.keys(r.erros).find((c) => form.elements[c]);
      if (comErro) {
        form.elements[comErro].focus();
        toast("Corrija os campos marcados em vermelho", true);
        return false;
      }
      const assinatura = JSON.stringify(r.avisos);
      if (Object.keys(r.avisos).length && confirmado !== assinatura) {
        confirmado = assinatura;
        botao.textContent = "Confirmar e salvar";
        toast("Confira os avisos em amarelo. Se estiver tudo certo, clique em Confirmar e salvar");
        return false;
      }
      return true;
    },
  };
}

function regrasSegurado(form, documentoAnterior) {
  return () => {
    const v = formData(form), erros = {}, avisos = {};
    const nome = v.nome.trim();
    if (nome.length < 3 || !/\p{L}/u.test(nome)) erros.nome = "Informe o nome completo ou a razão social";
    const d = soDigitos(v.documento);
    if (v.documento.trim()) {
      const valido = d.length === 11 ? cpfValido(d) : cnpjValido(d);
      if (!d) erros.documento = "CPF/CNPJ deve conter números";
      else if (d.length !== 11 && d.length !== 14) erros.documento = `${d.length} dígitos: CPF tem 11 e CNPJ tem 14`;
      else if (!valido && d !== soDigitos(documentoAnterior)) erros.documento = `${d.length === 11 ? "CPF" : "CNPJ"} inválido: confira os números digitados`;
      else if (!valido) avisos.documento = "Este documento não passa na verificação. Corrija quando puder";
    }
    const email = v.email.trim();
    if (email && !/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(email)) erros.email = "E-mail incompleto. Exemplo: nome@email.com";
    else if (/@(gmial|gmal|gmail\.co$|hotmial|hotmal|outlok|yahooo)/i.test(email)) avisos.email = "Confira o domínio do e-mail (parece um erro de digitação)";
    if (v.telefone.trim()) {
      const t = digitosTelefone(v.telefone);
      if (t.length !== 10 && t.length !== 11) erros.telefone = "Use DDD + número: (11) 98765-4321 ou (11) 3333-4444";
      else if (+t.slice(0, 2) < 11) erros.telefone = `DDD ${t.slice(0, 2)} não existe`;
      else if (t.length === 11 && t[2] !== "9") erros.telefone = "Celular com 11 dígitos deve ter 9 logo após o DDD";
    }
    if (v.data_nascimento) {
      const idade = (Date.now() - new Date(v.data_nascimento + "T12:00")) / (365.25 * 864e5);
      if (idade < 0) erros.data_nascimento = "A data de nascimento não pode estar no futuro";
      else if (+v.data_nascimento.slice(0, 4) < 1900) erros.data_nascimento = "Confira o ano de nascimento";
      else if (d.length === 14) avisos.data_nascimento = "Empresas (CNPJ) normalmente não têm data de nascimento";
      else if (idade > 105) avisos.data_nascimento = `Idade de ${Math.floor(idade)} anos. Confira o ano`;
      else if (idade < 16) avisos.data_nascimento = `Segurado com ${Math.floor(idade)} anos. Confira a data`;
    }
    return { erros, avisos };
  };
}

function regrasApolice(form, { seguradoras = [], anterior = null } = {}) {
  const tem = (c) => Boolean(form.elements[c]);
  return () => {
    const v = valoresForm(form), erros = {}, avisos = {};
    if (tem("segurado_id") && !v.segurado_id) erros.segurado_id = "Selecione o segurado";
    if (tem("tipo_id") && !v.tipo_id) erros.tipo_id = "Selecione o tipo de seguro";
    if ((v.numero || "").trim().length < 3) erros.numero = "Informe o número da apólice (mínimo 3 caracteres)";
    const cia = (v.seguradora || "").trim();
    if (cia.length < 2) erros.seguradora = "Informe a seguradora";
    else if (!seguradoras.some((s) => semAcento(s) === semAcento(cia))) {
      const parecida = seguradoras.find((s) => distancia(semAcento(s), semAcento(cia)) <= 2);
      avisos.seguradora = parecida ? `Você quis dizer "${parecida}"?` : "Seguradora nova: ainda não usada em nenhuma apólice";
    }
    const ano = (d) => +String(d).slice(0, 4);
    for (const c of ["data_inicio", "data_fim"]) if (v[c] && (ano(v[c]) < 1990 || ano(v[c]) > 2100)) erros[c] = `Ano ${ano(v[c])} fora do esperado. Confira a data`;
    if (!v.data_inicio) erros.data_inicio = "Informe o início da vigência";
    if (!v.data_fim) erros.data_fim = "Informe o fim da vigência";
    if (v.data_inicio && v.data_fim && !erros.data_inicio && !erros.data_fim) {
      const dias = diasEntre(v.data_inicio, v.data_fim);
      if (dias <= 0) erros.data_fim = "O fim deve ser depois do início";
      else if (dias > 3660) erros.data_fim = "Vigência acima de 10 anos. Confira o ano";
      else if (dias < 335 || dias > 395) avisos.data_fim = `Vigência de ${dias < 60 ? dias + " dias" : Math.round(dias / 30.44) + " meses"}. O normal é 1 ano`;
      if (diasEntre(isoDate(new Date()), v.data_inicio) > 90) avisos.data_inicio = "Início daqui a mais de 3 meses. Confira a data";
      if (anterior) {
        const gap = diasEntre(anterior.data_fim, v.data_inicio);
        if (gap > 0) avisos.data_inicio = `${plural(gap, "dia", "dias")} sem cobertura entre a apólice atual e a renovação`;
        else if (gap < 0) avisos.data_inicio = `Começa ${plural(-gap, "dia", "dias")} antes do fim da apólice atual`;
      }
    }
    if (Number.isNaN(v.premio)) erros.premio = "Valor inválido";
    else if (!v.premio) avisos.premio = "Prêmio zerado: a comissão também ficará zerada";
    else if (v.importancia_segurada > 0 && v.premio > v.importancia_segurada) avisos.premio = "Prêmio maior que a importância segurada. Confira os valores";
    else if (anterior?.premio) {
      const variacao = (v.premio - anterior.premio) / anterior.premio;
      if (Math.abs(variacao) > 0.5) avisos.premio = `${variacao > 0 ? "Aumento" : "Redução"} de ${Math.round(Math.abs(variacao) * 100)}% em relação ao prêmio atual. Confira o valor`;
    }
    if (tem("importancia_segurada") && Number.isNaN(v.importancia_segurada)) erros.importancia_segurada = "Valor inválido";
    if (tem("comissao_pct")) {
      if (v.comissao_pct == null) erros.comissao_pct = "Informe o percentual de comissão";
      else if (Number.isNaN(v.comissao_pct) || v.comissao_pct < 0 || v.comissao_pct > 100) erros.comissao_pct = "Use um percentual entre 0 e 100";
      else if (v.comissao_pct > 40) avisos.comissao_pct = "Comissão acima de 40%. Confira o valor";
      else if (v.comissao_pct === 0) avisos.comissao_pct = "Comissão zerada";
    }
    return { erros, avisos };
  };
}

const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
const addYear = (iso) => { const d = new Date(iso + "T12:00"); d.setFullYear(d.getFullYear() + 1); return d.toISOString().slice(0, 10); };

const STATUS_CLASS = { Vigente: "ok", "A vencer": "warn", Vencida: "late", Renovada: "renewed", Cancelada: "off" };
const sc = (s) => STATUS_CLASS[s] || "off";
const statusTag = (s) => `<span class="status ${sc(s)}">${s}</span>`;

function prazo(a) {
  if (a.status === "Renovada" || a.status === "Cancelada") return a.status.toLowerCase();
  const d = a.dias_para_vencer;
  if (d < 0) return `venceu há ${plural(-d, "dia", "dias")}`;
  if (d === 0) return "vence hoje";
  return `vence em ${plural(d, "dia", "dias")}`;
}

function termPct(a) {
  const ini = new Date(a.data_inicio), fim = new Date(a.data_fim), now = new Date();
  return Math.max(0, Math.min(100, ((now - ini) / (fim - ini)) * 100));
}

function termBar(a) {
  return `<div class="term">
    <div class="term-bar ${sc(a.status)}"><div style="width:${termPct(a)}%"></div></div>
    <div class="term-dates"><span>${fmtDate(a.data_inicio)}</span><span>${prazo(a)}</span><span>${fmtDate(a.data_fim)}</span></div>
  </div>`;
}

const ICONS = {
  auto: '<path d="M5 16h14M6 16l1.5-5h9L18 16M6 16v3M18 16v3M8 13.5h.01M16 13.5h.01" />',
  casa: '<path d="M4 11 12 4l8 7M6 9.5V20h12V9.5M10 20v-5h4v5" />',
  vida: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" />',
  saude: '<path d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6Z" />',
  empresa: '<path d="M4 20V8l5 3V8l5 3V5h6v15ZM8 16h.01M12 16h.01M16 16h.01" />',
  viagem: '<path d="m3 13 7 1 4-9 2 1-2 9 6 1 1 2-7 .5L10 21l-2-.5 1-4-6-1.5Z" />',
  outro: '<path d="M12 3 5 6v6c0 4.4 3 7.6 7 9 4-1.4 7-4.6 7-9V6Z" />',
};
function iconFor(nome = "") {
  const n = nome.toLowerCase();
  const key = /auto|carro|ve[ií]c/.test(n) ? "auto" : /resid|casa|im[óo]v|condom/.test(n) ? "casa" : /vida/.test(n) ? "vida"
    : /sa[úu]de|odont|m[ée]dic/.test(n) ? "saude" : /empres|patrim|rc|respons/.test(n) ? "empresa" : /viag/.test(n) ? "viagem" : "outro";
  return `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[key]}</svg>`;
}
const MIX_COLORS = ["#2f8a6f", "#4d74b8", "#e2a823", "#8a5aa6", "#cf5a43", "#6a9a3a", "#3aa0a8", "#b0607e"];

function toast(msg, isError = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast show" + (isError ? " error" : "");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => el.classList.remove("show"), 3200);
}

async function run(fn) {
  try { await fn(); } catch (e) { toast(e.message, true); }
}

const formData = (form) => Object.fromEntries(new FormData(form).entries());

// ============================================================ painel lateral
let lastFocus = null;
function openDrawer(html) {
  lastFocus = document.activeElement;
  $("#drawer-content").innerHTML = html;
  const d = $("#drawer");
  d.scrollTop = 0;
  d.classList.add("open");
  d.setAttribute("aria-hidden", "false");
  $("#scrim").classList.add("open");
  setTimeout(() => ($("input, select, textarea, button.btn", d) || $(".drawer-close")).focus({ preventScroll: true }), 50);
}
function closeDrawer() {
  $("#drawer").classList.remove("open");
  $("#drawer").setAttribute("aria-hidden", "true");
  $("#scrim").classList.remove("open");
  lastFocus?.focus?.({ preventScroll: true });
}

// ============================================================ roteamento
const views = { painel: viewPainel, segurados: viewSegurados, apolices: viewApolices, renovacoes: viewRenovacoes, financeiro: viewFinanceiro, tipos: viewTipos };
let current = "painel";

function route() {
  current = location.hash.slice(1).split("/")[0] || "painel";
  if (!views[current]) current = "painel";
  $$(".nav a").forEach((a) => a.classList.toggle("active", a.dataset.view === current));
  closeDrawer();
  run(views[current]);
  atualizarBadge();
}
window.addEventListener("hashchange", route);

function refresh() { run(views[current]); atualizarBadge(); }

async function atualizarBadge() {
  const lista = await api("/renovacoes?dias=30");
  const b = $("#badge-renov");
  b.textContent = lista.length;
  b.classList.toggle("hidden", !lista.length);
}

// ============================================================ painel
async function viewPainel() {
  const [d, apolices] = await Promise.all([api("/dashboard"), api("/apolices")]);
  const atencao = d.a_vencer_30 + d.vencidas;
  const hoje = new Date();
  d.por_tipo.sort((a, b) => b.premio - a.premio);
  const totalMix = d.por_tipo.reduce((s, t) => s + t.premio, 0) || 1;

  app.innerHTML = `
    <section class="hero">
      <p class="date">${hoje.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).replace(/^./, (c) => c.toUpperCase())}</p>
      <h1>
        <a href="#apolices">${plural(d.apolices_ativas, "apólice ativa protege", "apólices ativas protegem")}</a>
        ${plural(d.total_segurados, "segurado", "segurados")}.
        ${atencao
          ? `<a class="attention" href="#renovacoes">${atencao === 1 ? "Uma precisa" : atencao + " precisam"} de renovação.</a>`
          : `<span class="calm">Nenhuma renovação pendente.</span>`}
      </h1>
      <div class="figures">
        <div class="figure"><strong>${money(d.premio_total)}</strong><span>em prêmios ativos</span></div>
        <div class="figure"><strong>${money(d.comissao_total)}</strong><span>de comissão estimada</span></div>
        <div class="figure"><strong>${d.a_vencer_30}</strong><span>vencem nos próximos 30 dias</span></div>
        <div class="figure"><strong>${d.vencidas}</strong><span>vencidas sem renovação</span></div>
      </div>
    </section>

    <section class="panel timeline">
      <div class="section-head">
        <div><h2>Linha do tempo das vigências</h2><p>Cada faixa é um período de cobertura. A área listrada mostra os próximos 30 dias.</p></div>
        <div class="legend">
          <span><i style="background:var(--ok-bar)"></i>Vigente</span>
          <span><i style="background:var(--amber-bar)"></i>A vencer</span>
          <span><i style="background:var(--red-bar)"></i>Vencida</span>
          <span><i style="background:var(--indigo);opacity:.55"></i>Período renovado</span>
        </div>
      </div>
      <div class="tl-scroll">${timeline(apolices)}</div>
    </section>

    <div class="split">
      <section class="panel">
        <div class="section-head">
          <div><h2>Fila de renovação</h2><p>Vencidas e vencendo em até 30 dias, da mais urgente para a menos urgente</p></div>
          <a class="btn sm" href="#renovacoes">Abrir quadro</a>
        </div>
        ${d.proximas_renovacoes.length ? `<ul class="queue">${d.proximas_renovacoes.map((a) => `
          <li>
            <div class="due ${sc(a.status)}"><strong>${Math.abs(a.dias_para_vencer)}</strong><span>${a.dias_para_vencer < 0 ? "dias atrás" : "dias"}</span></div>
            <div class="who" onclick="detalheApolice(${a.id})">
              <strong>${esc(a.segurado_nome)}</strong>
              <span>${esc(a.tipo_nome)} na ${esc(a.seguradora)}, vence ${fmtDate(a.data_fim)}</span>
            </div>
            <button class="btn sm" onclick="formRenovar(${a.id})">Renovar</button>
          </li>`).join("")}</ul>`
          : `<div class="empty"><h3>Tudo em dia</h3><p>Nenhuma apólice vence nos próximos 30 dias.</p></div>`}
      </section>

      <section class="panel">
        <div class="section-head"><div><h2>Carteira por tipo</h2><p>Participação no prêmio das apólices ativas</p></div></div>
        <div class="mix">${d.por_tipo.map((t, i) => `<div style="flex:${t.premio};background:${MIX_COLORS[i % MIX_COLORS.length]}" title="${esc(t.tipo)}"></div>`).join("")}</div>
        <ul class="mix-list">${d.por_tipo.map((t, i) => `
          <li><i style="background:${MIX_COLORS[i % MIX_COLORS.length]}"></i>
            <span>${esc(t.tipo)} <span class="muted small">(${t.qtd})</span></span>
            <strong>${moneyShort(t.premio)}</strong>
            <span class="pct">${Math.round((t.premio / totalMix) * 100)}%</span></li>`).join("")}
        </ul>
      </section>
    </div>`;
  bindTimeline();
}

function timeline(apolices) {
  const today = new Date(); today.setHours(12, 0, 0, 0);
  const start = new Date(today.getFullYear(), today.getMonth() - 3, 1);
  const end = new Date(today.getFullYear(), today.getMonth() + 12, 1);
  const span = end - start;
  const pct = (d) => Math.max(0, Math.min(100, ((d - start) / span) * 100));
  const date = (iso) => new Date(iso + "T12:00");

  // uma linha por "cadeia" de renovações (apólice original + suas renovações)
  const byId = Object.fromEntries(apolices.map((a) => [a.id, a]));
  const root = (a) => { while (a.renovada_de && byId[a.renovada_de]) a = byId[a.renovada_de]; return a.id; };
  const chains = {};
  apolices.forEach((a) => (chains[root(a)] ||= []).push(a));
  const rows = Object.values(chains)
    .map((list) => list.sort((x, y) => x.data_inicio.localeCompare(y.data_inicio)))
    .filter((list) => date(list.at(-1).data_fim) >= start)
    .sort((x, y) => {
      const lx = x.at(-1), ly = y.at(-1);
      const rank = (a) => (a.status === "Cancelada" ? 2 : 0);
      return rank(lx) - rank(ly) || lx.data_fim.localeCompare(ly.data_fim);
    });

  const months = [];
  for (let m = new Date(start); m < end; m.setMonth(m.getMonth() + 1)) months.push(new Date(m));
  const grid = months.map((m) => `<div class="tl-grid" style="left:${pct(m)}%"></div>`).join("");
  const zone = `<div class="tl-zone" style="left:${pct(today)}%;width:${pct(new Date(+today + 30 * 864e5)) - pct(today)}%"></div>`;
  const now = `<div class="tl-today" style="left:${pct(today)}%"></div>`;

  if (!rows.length) return `<div class="empty"><h3>Nenhuma apólice ainda</h3><p>Cadastre a primeira apólice para ver a linha do tempo.</p><button class="btn primary" onclick="formApolice()">Nova apólice</button></div>`;

  let i = 0;
  return `<div class="tl">
    <div class="tl-row"><div></div><div class="tl-track tl-axis"><div class="tl-today labeled" style="left:${pct(today)}%"></div>${months.map((m) =>
      `<span class="tl-month ${m.getMonth() === 0 ? "year" : ""}" style="left:${pct(m)}%">${m.getMonth() === 0 ? m.getFullYear() : m.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}</span>`).join("")}</div></div>
    ${rows.map((list) => {
      const last = list.at(-1);
      return `<div class="tl-row">
        <div class="tl-label"><strong>${esc(last.segurado_nome)}</strong><span>${esc(last.tipo_nome)} · ${esc(last.seguradora)}</span></div>
        <div class="tl-track">${grid}${zone}${now}
          ${list.map((a) => {
            const l = pct(date(a.data_inicio)), r = pct(date(a.data_fim));
            if (r <= 0 || l >= 100) return "";
            const capped = a.status !== "Renovada" && a.status !== "Cancelada" && r < 100;
            return `<button class="tl-bar ${sc(a.status)}" style="left:${l}%;width:${Math.max(r - l, .6)}%;--i:${i++}"
              data-id="${a.id}" aria-label="Apólice ${esc(a.numero)}, ${esc(a.segurado_nome)}, ${a.status}">${capped ? '<span class="cap"></span>' : ""}</button>`;
          }).join("")}
        </div>
      </div>`;
    }).join("")}
  </div>`;
}

let tlData = {};
function bindTimeline() {
  const tip = $("#tooltip");
  $$(".tl-bar").forEach((b) => {
    b.addEventListener("click", () => detalheApolice(+b.dataset.id));
    const show = async (e) => {
      const id = +b.dataset.id;
      tlData[id] ||= await api("/apolices/" + id);
      const a = tlData[id];
      tip.innerHTML = `<strong>${esc(a.numero)}</strong>${esc(a.segurado_nome)}<br>${esc(a.tipo_nome)}, ${esc(a.seguradora)}<br>${fmtDate(a.data_inicio)} a ${fmtDate(a.data_fim)}<br>${a.status}, ${prazo(a)}`;
      tip.classList.remove("hidden");
      const r = b.getBoundingClientRect();
      const x = e?.clientX ?? r.left + r.width / 2;
      tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 12, Math.max(12, x - tip.offsetWidth / 2)) + "px";
      tip.style.top = (r.top - tip.offsetHeight - 10) + "px";
    };
    b.addEventListener("mouseenter", show);
    b.addEventListener("focus", () => show());
    b.addEventListener("mouseleave", () => tip.classList.add("hidden"));
    b.addEventListener("blur", () => tip.classList.add("hidden"));
  });
  tlData = {};
  // em telas estreitas, abre a linha do tempo já posicionada em "hoje"
  const scroller = $(".tl-scroll"), mark = $(".tl-today.labeled");
  if (scroller && mark && scroller.scrollWidth > scroller.clientWidth) scroller.scrollLeft = mark.offsetLeft + 150 - 60;
}
window.addEventListener("scroll", () => $("#tooltip").classList.add("hidden"), { passive: true });

// ============================================================ segurados
let selSeg = null;
async function viewSegurados() {
  const fromHash = +location.hash.split("/")[1];
  if (fromHash) selSeg = fromHash;
  app.innerHTML = `
    <div class="page-head">
      <div><h1>Segurados</h1><p>Encontre um cliente para ver os dados de contato e todas as apólices dele.</p></div>
      <button class="btn primary" onclick="formSegurado()">Novo segurado</button>
    </div>
    <div class="md">
      <div class="panel md-list">
        <input type="search" id="busca" placeholder="Nome, CPF/CNPJ, telefone, cidade…" aria-label="Buscar segurado">
        <div class="items" id="lista"></div>
      </div>
      <div class="panel md-detail" id="detalhe"></div>
    </div>`;

  const apolices = await api("/apolices");
  const porSeg = {};
  apolices.filter((a) => a.situacao === "ativa").forEach((a) => (porSeg[a.segurado_id] ||= []).push(a));

  const carregar = async () => {
    const lista = await api("/segurados?q=" + encodeURIComponent($("#busca").value));
    if (!selSeg && lista.length) selSeg = lista[0].id;
    $("#lista").innerHTML = lista.map((s) => `
      <button class="person ${s.id === selSeg ? "active" : ""}" data-id="${s.id}">
        <span class="avatar" style="background:${MIX_COLORS[s.id % MIX_COLORS.length]}">${esc(initials(s.nome))}</span>
        <span><strong>${esc(s.nome)}</strong><span>${esc(s.documento || s.cidade || "")}</span></span>
        <span class="dots">${(porSeg[s.id] || []).map((a) => `<i class="${sc(a.status)}"></i>`).join("")}</span>
      </button>`).join("") || `<div class="empty"><p>Nenhum segurado corresponde à busca.</p></div>`;
    $$("#lista .person").forEach((p) => p.onclick = () => {
      selSeg = +p.dataset.id;
      $$("#lista .person").forEach((x) => x.classList.toggle("active", x === p));
      run(mostrarSegurado);
    });
  };
  $("#busca").addEventListener("input", debounce(() => run(carregar)));
  await carregar();
  await mostrarSegurado();
}

async function mostrarSegurado() {
  const el = $("#detalhe");
  if (!el) return;
  if (!selSeg) {
    el.innerHTML = `<div class="empty"><h3>Nenhum segurado cadastrado</h3><p>Cadastre o primeiro cliente para começar.</p><button class="btn primary" onclick="formSegurado()">Novo segurado</button></div>`;
    return;
  }
  let s;
  try { s = await api("/segurados/" + selSeg); } catch { selSeg = null; return mostrarSegurado(); }
  const ativas = s.apolices.filter((a) => a.situacao === "ativa");
  const anteriores = s.apolices.filter((a) => a.situacao !== "ativa");
  const total = ativas.reduce((t, a) => t + (a.premio || 0), 0);
  el.innerHTML = `
    <div class="profile-head">
      <span class="avatar lg" style="background:${MIX_COLORS[s.id % MIX_COLORS.length]}">${esc(initials(s.nome))}</span>
      <div><h2>${esc(s.nome)}</h2><span class="muted">${ativas.length ? `${plural(ativas.length, "apólice ativa", "apólices ativas")}, ${money(total)} em prêmios` : "Sem apólices ativas"}</span></div>
      <div class="actions">
        <button class="btn ghost sm" onclick="formSegurado(${s.id})">Editar</button>
        <button class="btn primary sm" onclick="formApolice(null, ${s.id})">Nova apólice</button>
      </div>
    </div>
    <dl class="facts">
      <div><dt>CPF / CNPJ</dt><dd>${esc(s.documento) || "—"}</dd></div>
      <div><dt>E-mail</dt><dd>${s.email ? `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : "—"}</dd></div>
      <div><dt>Telefone</dt><dd>${s.telefone ? `<a href="tel:${esc(s.telefone.replace(/\D/g, ""))}">${esc(s.telefone)}</a>` : "—"}</dd></div>
      <div><dt>Nascimento</dt><dd>${fmtDate(s.data_nascimento)}</dd></div>
      <div><dt>Endereço</dt><dd>${esc([s.endereco, s.cidade].filter(Boolean).join(", ")) || "—"}</dd></div>
      ${s.observacoes ? `<div style="grid-column:1/-1"><dt>Observações</dt><dd>${esc(s.observacoes)}</dd></div>` : ""}
    </dl>
    <div class="section-head"><h2>Apólices ativas</h2></div>
    <div class="policy-cards">${ativas.map(policyCard).join("") || `<p class="muted">Nenhuma apólice ativa.</p>`}</div>
    ${anteriores.length ? `<div class="section-head" style="margin-top:28px"><h2>Histórico</h2></div><div class="policy-cards">${anteriores.map(policyCard).join("")}</div>` : ""}`;
}

function policyCard(a) {
  return `<button class="policy-card" onclick="detalheApolice(${a.id})">
    <div><h3>${esc(a.tipo_nome)}${a.bem_segurado ? `, ${esc(a.bem_segurado)}` : ""}</h3>
      <div class="meta">${esc(a.numero)} na ${esc(a.seguradora)} ${statusTag(a.status)}</div></div>
    <div class="premium">${money(a.premio)}<div class="muted small" style="font-family:var(--body);font-weight:400">por ano</div></div>
    ${termBar(a)}
  </button>`;
}

async function formSegurado(id) {
  const s = id ? await api("/segurados/" + id) : {};
  const campo = (name, label, type = "text", extra = "") =>
    `<label>${label}<input name="${name}" type="${type}" value="${esc(s[name])}" ${extra}></label>`;
  openDrawer(`
    <h2>${id ? "Editar segurado" : "Novo segurado"}</h2>
    <p class="lead">${id ? esc(s.nome) : "Pessoa física ou empresa que contrata o seguro."}</p>
    <form id="f" class="form">
      <label class="full">Nome ou razão social<input name="nome" value="${esc(s.nome)}" autocomplete="off"></label>
      ${campo("documento", "CPF ou CNPJ", "text", 'inputmode="numeric" autocomplete="off"')}
      ${campo("data_nascimento", "Data de nascimento", "date")}
      <div class="full dup-alert hidden" id="dup-alert" role="alert"></div>
      <div class="group">Contato</div>
      ${campo("email", "E-mail", "text", 'inputmode="email" autocomplete="off" placeholder="nome@email.com"')}
      ${campo("telefone", "Telefone", "tel", 'placeholder="(11) 98765-4321"')}
      ${campo("endereco", "Endereço")}
      ${campo("cidade", "Cidade")}
      <label class="full">Observações<textarea name="observacoes" rows="3">${esc(s.observacoes)}</textarea></label>
    </form>
    <div class="drawer-actions">
      ${id ? `<button class="btn danger" onclick="excluirSegurado(${id})">Excluir segurado</button><span class="spacer"></span>` : ""}
      <button class="btn ghost" onclick="closeDrawer()">Cancelar</button>
      <button class="btn primary" id="salvar">${id ? "Salvar alterações" : "Cadastrar segurado"}</button>
    </div>`);
  // CPF/CNPJ: formata ao sair do campo e avisa na hora se já existe outro segurado com ele
  const doc = $("#f [name=documento]"), alerta = $("#dup-alert");
  const mostrarDuplicado = (outro) => {
    alerta.classList.toggle("hidden", !outro);
    if (!outro) return;
    alerta.innerHTML = `<span><strong>Este CPF/CNPJ já está cadastrado</strong> para ${esc(outro.nome)}.</span>
      <button type="button" class="btn sm" id="abrir-dup">Abrir cadastro existente</button>`;
    $("#abrir-dup").onclick = () => {
      closeDrawer();
      selSeg = outro.id;
      if (current === "segurados") refresh(); else location.hash = "segurados/" + outro.id;
    };
  };
  const f = $("#f");
  const validacao = ligarValidacao(f, regrasSegurado(f, s.documento), $("#salvar"));
  doc.addEventListener("blur", () => run(async () => {
    doc.value = formatarDocumento(doc.value);
    const d = soDigitos(doc.value);
    const completo = (d.length === 11 && cpfValido(d)) || (d.length === 14 && cnpjValido(d)) || d === soDigitos(s.documento);
    const r = completo ? await api(`/segurados/verificar?${new URLSearchParams({ documento: doc.value, ignorar: id || 0 })}`) : {};
    mostrarDuplicado(r.existe ? r : null);
    validacao.extras.erros = r.existe ? { documento: "CPF/CNPJ já cadastrado" } : {};
    validacao.atualizar("documento");
  }));
  doc.addEventListener("input", () => { alerta.classList.add("hidden"); validacao.extras.erros = {}; });
  // padroniza ao sair do campo: telefone "(11) 98765-4321", e-mail minúsculo, nome sem espaços duplos
  f.telefone.addEventListener("blur", () => { f.telefone.value = formatarTelefone(f.telefone.value); });
  f.email.addEventListener("blur", () => { f.email.value = f.email.value.trim().toLowerCase(); });
  f.nome.addEventListener("blur", () => { f.nome.value = capitalizarNome(f.nome.value.replace(/\s+/g, " ").trim()); });

  $("#salvar").onclick = () => run(async () => {
    if (!validacao.podeSalvar()) return;
    let r;
    try {
      r = await api(id ? "/segurados/" + id : "/segurados", { method: id ? "PUT" : "POST", body: formData(f) });
    } catch (e) {
      if (e.data?.segurado_id) { mostrarDuplicado({ id: e.data.segurado_id, nome: e.data.segurado_nome }); doc.focus(); }
      validacao.erroServidor(e);
      throw e;
    }
    closeDrawer();
    toast(id ? "Alterações salvas" : "Segurado cadastrado");
    selSeg = r.id;
    if (current === "segurados") refresh(); else location.hash = "segurados";
  });
}

function excluirSegurado(id) {
  if (!confirm("Excluir este segurado? Todas as apólices dele também serão excluídas.")) return;
  run(async () => { await api("/segurados/" + id, { method: "DELETE" }); selSeg = null; closeDrawer(); toast("Segurado excluído"); refresh(); });
}

// ============================================================ apólices
const apFiltro = { q: "", tipo: "", status: "" };
async function viewApolices() {
  const [tipos, todas] = await Promise.all([api("/tipos"), api("/apolices")]);
  const cont = (s) => todas.filter((a) => !s || a.status === s).length;
  app.innerHTML = `
    <div class="page-head">
      <div><h1>Apólices</h1><p>Busque por número, segurado, CPF/CNPJ, seguradora ou bem segurado (placa, endereço).</p></div>
      <button class="btn primary" onclick="formApolice()">Nova apólice</button>
    </div>
    <div class="filters">
      <input type="search" class="search" id="busca" placeholder="Buscar apólice…" aria-label="Buscar apólice" value="${esc(apFiltro.q)}">
      <select id="f-tipo" aria-label="Tipo de seguro"><option value="">Todos os tipos</option>${tipos.map((t) => `<option value="${t.id}" ${apFiltro.tipo == t.id ? "selected" : ""}>${esc(t.nome)}</option>`).join("")}</select>
      <div class="segmented" role="tablist">
        ${["", "Vigente", "A vencer", "Vencida", "Renovada", "Cancelada"].map((s) =>
          `<button data-s="${s}" class="${apFiltro.status === s ? "active" : ""}">${s || "Todas"} <span class="n">${cont(s)}</span></button>`).join("")}
      </div>
    </div>
    <div class="panel table-wrap"><table>
      <thead><tr><th>Apólice</th><th>Segurado</th><th>Tipo e seguradora</th><th>Vigência</th><th class="num">Prêmio</th><th>Status</th></tr></thead>
      <tbody id="lista"></tbody>
    </table></div>`;

  const carregar = async () => {
    const qs = new URLSearchParams(apFiltro);
    const lista = await api("/apolices?" + qs);
    $("#lista").innerHTML = lista.map((a) => `
      <tr onclick="detalheApolice(${a.id})" tabindex="0" onkeydown="if(event.key==='Enter')detalheApolice(${a.id})">
        <td><strong>${esc(a.numero)}</strong><span class="sub">${esc(a.bem_segurado || "")}</span></td>
        <td>${esc(a.segurado_nome)}<span class="sub">${esc(a.segurado_documento || "")}</span></td>
        <td>${esc(a.tipo_nome)}<span class="sub">${esc(a.seguradora)}</span></td>
        <td>${termBar(a)}</td>
        <td class="num">${money(a.premio)}</td>
        <td>${statusTag(a.status)}</td>
      </tr>`).join("") || `<tr><td colspan="6"><div class="empty"><h3>Nenhuma apólice encontrada</h3><p>Tente outro termo ou limpe os filtros.</p></div></td></tr>`;
  };
  $("#busca").addEventListener("input", debounce((e) => { apFiltro.q = e.target.value; run(carregar); }));
  $("#f-tipo").onchange = (e) => { apFiltro.tipo = e.target.value; run(carregar); };
  $$(".segmented button").forEach((b) => b.onclick = () => {
    apFiltro.status = b.dataset.s;
    $$(".segmented button").forEach((x) => x.classList.toggle("active", x === b));
    run(carregar);
  });
  await carregar();
}

async function detalheApolice(id) {
  $("#tooltip").classList.add("hidden");
  const a = await api("/apolices/" + id);
  const comissao = (a.premio || 0) * (a.comissao_pct || 0) / 100;
  const cadeia = [...a.historico].reverse();
  openDrawer(`
    <h2>${esc(a.tipo_nome)}</h2>
    <p class="lead"><a href="#segurados/${a.segurado_id}">${esc(a.segurado_nome)}</a>${a.segurado_documento ? `, ${esc(a.segurado_documento)}` : ""}</p>
    <div class="doc">
      <span class="stamp ${sc(a.status)}">${a.status}</span>
      <div class="no">Apólice nº ${esc(a.numero)}</div>
      <div class="big">${money(a.premio)}</div>
      ${termBar(a)}
    </div>
    <dl class="facts">
      <div><dt>Seguradora</dt><dd>${esc(a.seguradora)}</dd></div>
      <div><dt>Importância segurada</dt><dd>${money(a.importancia_segurada)}</dd></div>
      <div><dt>Comissão</dt><dd>${a.comissao_pct || 0}%, ${money(comissao)}</dd></div>
      <div><dt>Pagamento</dt><dd>${esc(a.forma_pagamento) || "—"}</dd></div>
      <div style="grid-column:1/-1"><dt>Bem segurado</dt><dd>${esc(a.bem_segurado) || "—"}</dd></div>
      ${a.observacoes ? `<div style="grid-column:1/-1"><dt>Observações</dt><dd>${esc(a.observacoes)}</dd></div>` : ""}
    </dl>
    ${cadeia.length || a.renovacao ? `
      <div class="section-head"><h3>Histórico de renovações</h3></div>
      <ol class="chain">
        ${cadeia.map((h) => `<li><a onclick="detalheApolice(${h.id})">${esc(h.numero)}</a> <span class="muted">${fmtDate(h.data_inicio)} a ${fmtDate(h.data_fim)}, ${money(h.premio)}</span></li>`).join("")}
        <li class="current"><strong>${esc(a.numero)}</strong> <span class="muted">${fmtDate(a.data_inicio)} a ${fmtDate(a.data_fim)}, esta apólice</span></li>
        ${a.renovacao ? `<li><a onclick="detalheApolice(${a.renovacao.id})">${esc(a.renovacao.numero)}</a> <span class="muted">${fmtDate(a.renovacao.data_inicio)} a ${fmtDate(a.renovacao.data_fim)}, ${money(a.renovacao.premio)}</span></li>` : ""}
      </ol>` : ""}
    <div class="drawer-actions">
      <button class="btn danger" onclick="excluirApolice(${a.id})">Excluir</button>
      ${a.situacao === "ativa" ? `<button class="btn ghost" onclick="cancelarApolice(${a.id})">Cancelar apólice</button>` : ""}
      <span class="spacer"></span>
      <button class="btn" onclick="formApolice(${a.id})">Editar</button>
      ${a.situacao === "ativa" ? `<button class="btn primary" onclick="formRenovar(${a.id})">Renovar apólice</button>` : ""}
    </div>`);
}

async function formApolice(id, seguradoId) {
  const [a, segurados, tipos, cias] = await Promise.all([
    id ? api("/apolices/" + id) : Promise.resolve({ segurado_id: seguradoId, comissao_pct: 15 }),
    api("/segurados"), api("/tipos"), api("/seguradoras"),
  ]);
  const opt = (lista, sel) => lista.map((o) => `<option value="${o.id}" ${o.id == sel ? "selected" : ""}>${esc(o.nome)}</option>`).join("");
  openDrawer(`
    <h2>${id ? "Editar apólice" : "Nova apólice"}</h2>
    <p class="lead">${id ? `Nº ${esc(a.numero)}` : "Registre uma apólice emitida pela seguradora."}</p>
    <form id="f" class="form">
      <label class="full">Segurado<select name="segurado_id"><option value="">Selecione o segurado</option>${opt(segurados, a.segurado_id)}</select></label>
      <label>Tipo de seguro<select name="tipo_id"><option value="">Selecione</option>${opt(tipos, a.tipo_id)}</select></label>
      <label>Número da apólice<input name="numero" value="${esc(a.numero)}" autocomplete="off"></label>
      <label class="full">Seguradora<input name="seguradora" list="cias" value="${esc(a.seguradora)}" autocomplete="off">
        <datalist id="cias">${cias.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label>
      <label class="full">Bem segurado <span class="hint">Veículo e placa, endereço do imóvel, número de vidas…</span><input name="bem_segurado" value="${esc(a.bem_segurado)}"></label>
      <div class="group">Vigência</div>
      <label>Início<input name="data_inicio" type="date" value="${esc(a.data_inicio)}"></label>
      <label>Fim <span class="hint">Preenchido com 1 ano após o início</span><input name="data_fim" type="date" value="${esc(a.data_fim)}"></label>
      <div class="group">Valores</div>
      <label>Prêmio anual (R$)${campoMoeda("premio", a.premio)}</label>
      <label>Importância segurada (R$)${campoMoeda("importancia_segurada", a.importancia_segurada)}</label>
      <label>Comissão (%)${campoPercentual("comissao_pct", a.comissao_pct)}</label>
      <label>Forma de pagamento<input name="forma_pagamento" placeholder="Ex.: cartão em 10x" value="${esc(a.forma_pagamento)}"></label>
      ${id ? `<label>Situação<select name="situacao">${[["ativa", "Ativa"], ["renovada", "Renovada"], ["cancelada", "Cancelada"]].map(([v, l]) => `<option value="${v}" ${v === a.situacao ? "selected" : ""}>${l}</option>`).join("")}</select></label>` : ""}
      <label class="full">Observações<textarea name="observacoes" rows="3">${esc(a.observacoes)}</textarea></label>
    </form>
    <div class="drawer-actions">
      <button class="btn ghost" onclick="closeDrawer()">Cancelar</button>
      <button class="btn primary" id="salvar">${id ? "Salvar alterações" : "Cadastrar apólice"}</button>
    </div>`);

  const f = $("#f");
  const ini = f.data_inicio, fim = f.data_fim;
  ini.addEventListener("change", () => { if (!fim.value && ini.value) fim.value = addYear(ini.value); });
  ativarMascaras(f);
  const validacao = ligarValidacao(f, regrasApolice(f, { seguradoras: cias }), $("#salvar"));
  ligarChecagemNumero(f, validacao, cias, id);

  $("#salvar").onclick = () => run(async () => {
    if (!validacao.podeSalvar()) return;
    let r;
    try {
      r = await api(id ? "/apolices/" + id : "/apolices", { method: id ? "PUT" : "POST", body: valoresForm(f) });
    } catch (e) { validacao.erroServidor(e); throw e; }
    toast(id ? "Alterações salvas" : "Apólice cadastrada");
    refresh();
    detalheApolice(r.id);
  });
}

// número da apólice: ao sair do campo, confere no banco se já existe na mesma seguradora;
// seguradora: corrige para a grafia já cadastrada ("porto seguro" -> "Porto Seguro")
function ligarChecagemNumero(f, validacao, cias, ignorarId) {
  const checar = () => run(async () => {
    const numero = f.numero.value.trim(), cia = f.seguradora.value.trim();
    validacao.extras.erros = {};
    if (numero.length >= 3 && cia.length >= 2) {
      const r = await api("/apolices/verificar?" + new URLSearchParams({ numero, seguradora: cia, ignorar: ignorarId || 0 }));
      if (r.existe) validacao.extras.erros = { numero: `A apólice ${r.numero} desta seguradora já está cadastrada (segurado: ${r.segurado_nome})` };
    }
    validacao.atualizar("numero");
  });
  f.numero.addEventListener("blur", () => { f.numero.value = f.numero.value.replace(/\s+/g, " ").trim(); checar(); });
  f.seguradora.addEventListener("blur", () => {
    const igual = cias.find((c) => semAcento(c) === semAcento(f.seguradora.value));
    f.seguradora.value = igual || f.seguradora.value.replace(/\s+/g, " ").trim();
    validacao.atualizar("seguradora");
    checar();
  });
  f.numero.addEventListener("input", () => { validacao.extras.erros = {}; });
}

function excluirApolice(id) {
  if (!confirm("Excluir esta apólice definitivamente?")) return;
  run(async () => { await api("/apolices/" + id, { method: "DELETE" }); closeDrawer(); toast("Apólice excluída"); refresh(); });
}

function cancelarApolice(id) {
  if (!confirm("Cancelar esta apólice? Ela deixa de aparecer nas renovações.")) return;
  run(async () => {
    const a = await api("/apolices/" + id);
    await api("/apolices/" + id, { method: "PUT", body: { ...a, situacao: "cancelada" } });
    toast("Apólice cancelada"); refresh(); detalheApolice(id);
  });
}

// ============================================================ renovações
async function formRenovar(id) {
  const [a, cias] = await Promise.all([api("/apolices/" + id), api("/seguradoras")]);
  openDrawer(`
    <h2>Renovar apólice</h2>
    <p class="lead">${esc(a.segurado_nome)}, ${esc(a.tipo_nome)}. A apólice atual (${esc(a.numero)}) será marcada como renovada.</p>
    <div class="doc">
      <span class="stamp ${sc(a.status)}">${a.status}</span>
      <div class="no">Vigência atual</div>
      <div class="big">${money(a.premio)}</div>
      ${termBar(a)}
    </div>
    <form id="f" class="form">
      <div class="group" style="margin-top:0;border-top:0;padding-top:0">Nova vigência</div>
      <label>Número da nova apólice<input name="numero" value="${esc(a.numero)}-R" autocomplete="off"></label>
      <label>Seguradora<input name="seguradora" list="cias-r" value="${esc(a.seguradora)}" autocomplete="off">
        <datalist id="cias-r">${cias.map((c) => `<option value="${esc(c)}">`).join("")}</datalist></label>
      <label>Início<input name="data_inicio" type="date" value="${a.data_fim}"></label>
      <label>Fim<input name="data_fim" type="date" value="${addYear(a.data_fim)}"></label>
      <label>Novo prêmio (R$) <span class="hint" id="delta"></span>${campoMoeda("premio", a.premio)}</label>
      <label>Importância segurada (R$)${campoMoeda("importancia_segurada", a.importancia_segurada)}</label>
      <label class="full">Observações<textarea name="observacoes" rows="2">${esc(a.observacoes)}</textarea></label>
    </form>
    <div class="drawer-actions">
      <button class="btn ghost" onclick="closeDrawer()">Cancelar</button>
      <button class="btn primary" id="salvar">Renovar apólice</button>
    </div>`);
  const f = $("#f"), premio = f.premio;
  ativarMascaras(f);
  const delta = () => {
    const v = lerNumero(premio.value) || 0, p = a.premio || 0;
    $("#delta").textContent = p ? `${v >= p ? "+" : ""}${(((v - p) / p) * 100).toFixed(1).replace(".", ",")}% em relação ao atual` : "";
  };
  premio.addEventListener("input", delta);
  delta();
  const validacao = ligarValidacao(f, regrasApolice(f, { seguradoras: cias, anterior: a }), $("#salvar"));
  ligarChecagemNumero(f, validacao, cias);
  $("#salvar").onclick = () => run(async () => {
    if (!validacao.podeSalvar()) return;
    let r;
    try {
      r = await api(`/apolices/${id}/renovar`, { method: "POST", body: valoresForm(f) });
    } catch (e) { validacao.erroServidor(e); throw e; }
    toast("Apólice renovada");
    refresh();
    detalheApolice(r.id);
  });
}

const renovFiltro = { de: "", ate: "" };
const isoDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const RENOV_ATALHOS = [
  { t: "Este mês", r: (n) => [new Date(n.getFullYear(), n.getMonth(), 1), new Date(n.getFullYear(), n.getMonth() + 1, 0)] },
  { t: "Próximo mês", r: (n) => [new Date(n.getFullYear(), n.getMonth() + 1, 1), new Date(n.getFullYear(), n.getMonth() + 2, 0)] },
  { t: "Próximos 6 meses", r: (n) => [n, new Date(n.getFullYear(), n.getMonth() + 6, n.getDate())] },
  { t: "Este ano", r: (n) => [new Date(n.getFullYear(), 0, 1), new Date(n.getFullYear(), 11, 31)] },
];

async function viewRenovacoes() {
  const { de, ate } = renovFiltro;
  const periodo = de || ate;
  const lista = await api(periodo ? "/renovacoes?" + new URLSearchParams(renovFiltro) : "/renovacoes?dias=90");
  const total = lista.reduce((s, a) => s + (a.premio || 0), 0);
  const descPeriodo = de && ate ? `entre ${fmtDate(de)} e ${fmtDate(ate)}` : de ? `a partir de ${fmtDate(de)}` : `até ${fmtDate(ate)}`;
  const dataTicket = periodo ? fmtDate : fmtShort;
  const lanes = [
    { t: "Vencidas", c: "var(--red-bar)", f: (d) => d < 0 },
    { t: "Até 7 dias", c: "var(--amber-bar)", f: (d) => d >= 0 && d <= 7 },
    { t: "8 a 30 dias", c: "var(--amber-bar)", f: (d) => d > 7 && d <= 30 },
    { t: periodo ? "Mais de 30 dias" : "31 a 90 dias", c: "var(--ok-bar)", f: (d) => d > 30 },
  ];
  app.innerHTML = `
    <div class="page-head">
      <div><h1>Renovações</h1><p>Apólices ativas agrupadas por urgência. Renove antes do vencimento para o cliente não ficar sem cobertura.</p></div>
    </div>
    <form class="range" id="range">
      <label>Vencimento de<input type="date" name="de" value="${de}"></label>
      <label>até<input type="date" name="ate" value="${ate}"></label>
      <button class="btn primary" type="submit">Buscar</button>
      <div class="segmented" aria-label="Atalhos de período">
        ${RENOV_ATALHOS.map((p, i) => {
          const [a, b] = p.r(new Date()).map(isoDate);
          return `<button type="button" data-de="${a}" data-ate="${b}" class="${de === a && ate === b ? "active" : ""}">${p.t}</button>`;
        }).join("")}
      </div>
      ${periodo ? `<button class="btn ghost" type="button" id="limpar">Limpar período</button>` : ""}
    </form>
    <p class="range-summary">${periodo
      ? (lista.length
        ? `<strong>${plural(lista.length, "apólice vence", "apólices vencem")}</strong> ${descPeriodo}, somando ${money(total)} em prêmios.`
        : `Nenhuma apólice ativa vence ${descPeriodo}. Tente um período maior.`)
      : `Mostrando as vencidas e as que vencem nos próximos 90 dias: ${plural(lista.length, "apólice", "apólices")}, ${money(total)} em prêmios. Escolha um período para buscar outras datas.`}</p>
    <div class="board">${lanes.map((l) => {
      const items = lista.filter((a) => l.f(a.dias_para_vencer));
      const soma = items.reduce((s, a) => s + (a.premio || 0), 0);
      return `<section class="lane" style="--c:${l.c}">
        <div class="lane-head"><h3>${l.t}</h3><span>${items.length ? `${items.length}, ${moneyShort(soma)}` : "0"}</span></div>
        ${items.map((a) => `
          <article class="ticket" style="--c:${l.c}">
            <div class="top"><h4 onclick="detalheApolice(${a.id})">${esc(a.segurado_nome)}</h4>
              <span class="when" style="color:${a.dias_para_vencer < 0 ? "var(--red)" : a.dias_para_vencer <= 30 ? "var(--amber)" : "var(--teal)"}">${dataTicket(a.data_fim)}</span></div>
            <p>${esc(a.tipo_nome)} na ${esc(a.seguradora)}<br>${esc(a.numero)}, ${prazo(a)}</p>
            <div class="foot"><strong>${money(a.premio)}</strong><button class="btn sm primary" onclick="formRenovar(${a.id})">Renovar</button></div>
          </article>`).join("") || `<div class="none">Nada aqui.</div>`}
      </section>`;
    }).join("")}</div>`;

  const form = $("#range");
  form.onsubmit = (e) => {
    e.preventDefault();
    const f = formData(form);
    if (f.de && f.ate && f.de > f.ate) return toast("A data inicial deve ser anterior à data final", true);
    Object.assign(renovFiltro, f);
    run(viewRenovacoes);
  };
  $$("#range .segmented button").forEach((b) => b.onclick = () => {
    Object.assign(renovFiltro, { de: b.dataset.de, ate: b.dataset.ate });
    run(viewRenovacoes);
  });
  const limpar = $("#limpar");
  if (limpar) limpar.onclick = () => { Object.assign(renovFiltro, { de: "", ate: "" }); run(viewRenovacoes); };
}

// ============================================================ financeiro (prêmios e comissões)
const finFiltro = (() => { const y = new Date().getFullYear(); return { de: `${y}-01-01`, ate: `${y}-12-31` }; })();
const pct = (v) => (v * 100).toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%";
const FIN_ATALHOS = [
  { t: "Este mês", r: (n) => [new Date(n.getFullYear(), n.getMonth(), 1), new Date(n.getFullYear(), n.getMonth() + 1, 0)] },
  { t: "Mês passado", r: (n) => [new Date(n.getFullYear(), n.getMonth() - 1, 1), new Date(n.getFullYear(), n.getMonth(), 0)] },
  { t: "Últimos 12 meses", r: (n) => [new Date(n.getFullYear(), n.getMonth() - 11, 1), new Date(n.getFullYear(), n.getMonth() + 1, 0)] },
  { t: "Este ano", r: (n) => [new Date(n.getFullYear(), 0, 1), new Date(n.getFullYear(), 11, 31)] },
  { t: "Ano passado", r: (n) => [new Date(n.getFullYear() - 1, 0, 1), new Date(n.getFullYear() - 1, 11, 31)] },
];
const atalhosHtml = (lista, de, ate) => lista.map((p) => {
  const [a, b] = p.r(new Date()).map(isoDate);
  return `<button type="button" data-de="${a}" data-ate="${b}" class="${de === a && ate === b ? "active" : ""}">${p.t}</button>`;
}).join("");

async function viewFinanceiro() {
  const f = await api("/financeiro?" + new URLSearchParams(finFiltro));
  const maxMes = Math.max(1, ...f.por_mes.map((m) => m.comissao));
  const poucos = f.por_mes.length <= 13;
  app.innerHTML = `
    <div class="page-head">
      <div><h1>Financeiro</h1><p>Prêmios e comissões das apólices com início de vigência no período (apólices canceladas não entram).</p></div>
      <button class="btn primary" onclick="formExcel()">Gerar Excel</button>
    </div>
    <form class="range" id="range">
      <label>Início de vigência de<input type="date" name="de" value="${finFiltro.de}" required></label>
      <label>até<input type="date" name="ate" value="${finFiltro.ate}" required></label>
      <button class="btn primary" type="submit">Buscar</button>
      <div class="segmented" aria-label="Atalhos de período">${atalhosHtml(FIN_ATALHOS, finFiltro.de, finFiltro.ate)}</div>
    </form>
    <p class="range-summary">Período de ${fmtDate(f.de)} a ${fmtDate(f.ate)}.</p>

    <div class="figures fin-figures">
      <div class="figure"><strong>${money(f.premio_total)}</strong><span>em prêmios</span></div>
      <div class="figure"><strong>${money(f.comissao_total)}</strong><span>de comissão</span></div>
      <div class="figure"><strong>${pct(f.pct_medio)}</strong><span>de comissão média sobre o prêmio</span></div>
      <div class="figure"><strong>${f.qtd_apolices}</strong><span>${f.qtd_apolices === 1 ? "apólice" : "apólices"}</span></div>
      <div class="figure"><strong>${f.qtd_clientes}</strong><span>${f.qtd_clientes === 1 ? "cliente" : "clientes"}</span></div>
    </div>

    ${f.qtd_apolices ? `
    <section class="panel fin-chart">
      <div class="section-head"><div><h2>Comissão por mês</h2><p>Passe o mouse sobre um mês para ver o prêmio correspondente</p></div></div>
      <div class="cols ${poucos ? "" : "dense"}">
        ${f.por_mes.map((m) => `
          <div class="col" title="${m.rotulo}: prêmio ${money(m.premio)}, comissão ${money(m.comissao)}">
            <span class="v">${m.comissao ? (poucos ? moneyShort(m.comissao) : "") : ""}</span>
            <div class="b" style="height:${(m.comissao / maxMes) * 100}%"></div>
            <span class="m">${m.rotulo}</span>
          </div>`).join("")}
      </div>
    </section>

    <section class="panel table-wrap">
      <table class="fin-table">
        <thead><tr><th>Cliente</th><th class="num">Apólices</th><th class="num">Prêmio</th><th class="num">Comissão</th><th class="num">% comissão</th><th>Participação na comissão</th></tr></thead>
        <tbody>${f.por_cliente.map((c) => `
          <tr data-seg="${c.segurado_id}" tabindex="0" aria-expanded="false">
            <td><strong>${esc(c.nome)}</strong><span class="sub">${esc(c.documento || "")}</span></td>
            <td class="num">${c.apolices}</td>
            <td class="num">${money(c.premio)}</td>
            <td class="num"><strong>${money(c.comissao)}</strong></td>
            <td class="num">${pct(c.pct_comissao)}</td>
            <td><div class="share"><div class="share-bar"><div style="width:${c.participacao * 100}%"></div></div><span>${pct(c.participacao)}</span></div></td>
          </tr>
          <tr class="detail hidden" data-det="${c.segurado_id}"><td colspan="6">
            <ul class="fin-policies">${f.apolices.filter((a) => a.segurado_id === c.segurado_id).map((a) => `
              <li onclick="detalheApolice(${a.id})"><span>${esc(a.numero)}, ${esc(a.tipo_nome)} na ${esc(a.seguradora)}</span>
                <span class="muted">início ${fmtDate(a.data_inicio)}</span>
                <span>${money(a.premio)} × ${String(a.comissao_pct).replace(".", ",")}% = <strong>${money(a.comissao)}</strong></span></li>`).join("")}
            </ul>
          </td></tr>`).join("")}
        </tbody>
        <tfoot><tr><td>Total</td><td class="num">${f.qtd_apolices}</td><td class="num">${money(f.premio_total)}</td><td class="num">${money(f.comissao_total)}</td><td class="num">${pct(f.pct_medio)}</td><td>100%</td></tr></tfoot>
      </table>
    </section>`
    : `<div class="panel empty"><h3>Nenhuma apólice começou neste período</h3><p>Escolha outro período ou use um dos atalhos acima.</p></div>`}`;

  const form = $("#range");
  form.onsubmit = (e) => {
    e.preventDefault();
    const v = formData(form);
    if (v.de > v.ate) return toast("A data inicial deve ser anterior à data final", true);
    Object.assign(finFiltro, v);
    run(viewFinanceiro);
  };
  $$("#range .segmented button").forEach((b) => b.onclick = () => {
    Object.assign(finFiltro, { de: b.dataset.de, ate: b.dataset.ate });
    run(viewFinanceiro);
  });
  // clique no cliente mostra as apólices que compõem o valor
  $$(".fin-table tr[data-seg]").forEach((tr) => {
    const toggle = () => {
      const det = $(`.fin-table tr[data-det="${tr.dataset.seg}"]`);
      det.classList.toggle("hidden");
      tr.setAttribute("aria-expanded", String(!det.classList.contains("hidden")));
    };
    tr.onclick = toggle;
    tr.onkeydown = (e) => { if (e.key === "Enter") toggle(); };
  });
}

function formExcel() {
  openDrawer(`
    <h2>Gerar planilha Excel</h2>
    <p class="lead">Escolha o período. Entram as apólices com início de vigência entre as duas datas, exceto as canceladas.</p>
    <form id="f" class="form">
      <label>De<input type="date" name="de" required value="${finFiltro.de}"></label>
      <label>Até<input type="date" name="ate" required value="${finFiltro.ate}"></label>
      <div class="full segmented" id="xl-atalhos">${atalhosHtml(FIN_ATALHOS, finFiltro.de, finFiltro.ate)}</div>
    </form>
    <div class="doc" style="margin-top:22px">
      <div class="no">A planilha terá 3 abas</div>
      <ol class="xl-sheets">
        <li><strong>Resumo:</strong> prêmio total, comissão total, comissão média e totais por mês</li>
        <li><strong>Por cliente:</strong> apólices, prêmio, comissão, % de comissão e participação de cada cliente</li>
        <li><strong>Apólices:</strong> cada apólice com datas, prêmio, % e valor da comissão</li>
      </ol>
    </div>
    <div class="drawer-actions">
      <button class="btn ghost" onclick="closeDrawer()">Cancelar</button>
      <button class="btn primary" id="baixar">Baixar planilha</button>
    </div>`);
  const form = $("#f");
  $$("#xl-atalhos button").forEach((b) => b.onclick = () => {
    form.de.value = b.dataset.de;
    form.ate.value = b.dataset.ate;
    $$("#xl-atalhos button").forEach((x) => x.classList.toggle("active", x === b));
  });
  $("#baixar").onclick = () => run(async () => {
    if (!form.reportValidity()) return;
    const v = formData(form);
    if (v.de > v.ate) throw new Error("A data inicial deve ser anterior à data final");
    // no programa (.exe), o Windows abre a janela "Salvar como"
    if (window.pywebview?.api?.salvar_excel) {
      const r = await window.pywebview.api.salvar_excel(v.de, v.ate);
      if (r.erro) throw new Error(r.erro);
      if (r.cancelado) return;
      closeDrawer();
      toast("Planilha salva");
      if (confirm(`Planilha salva em:\n${r.caminho}\n\nAbrir agora no Excel?`)) window.pywebview.api.abrir_arquivo(r.caminho);
      return;
    }
    const res = await fetch("/api/financeiro/excel?" + new URLSearchParams(v));
    if (!res.ok) throw new Error((await res.json()).erro || "Não foi possível gerar a planilha");
    const nome = (res.headers.get("Content-Disposition") || "").match(/filename="(.+)"/)?.[1] || "comissoes.xlsx";
    const url = URL.createObjectURL(await res.blob());
    const link = Object.assign(document.createElement("a"), { href: url, download: nome });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    closeDrawer();
    toast("Planilha baixada: " + nome);
  });
}

// ============================================================ tipos de seguro
async function viewTipos() {
  const [tipos, d] = await Promise.all([api("/tipos"), api("/dashboard")]);
  const premio = Object.fromEntries(d.por_tipo.map((t) => [t.tipo, t.premio]));
  app.innerHTML = `
    <div class="page-head">
      <div><h1>Tipos de seguro</h1><p>Os ramos que a corretora trabalha. Cada apólice pertence a um tipo.</p></div>
    </div>
    <div class="types">
      ${tipos.map((t) => `
        <article class="panel type">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <span class="glyph">${iconFor(t.nome)}</span>
            <div class="row-actions">
              <button class="btn ghost sm" onclick="formTipo(${t.id})">Editar</button>
              <button class="btn danger sm" onclick="excluirTipo(${t.id})">Excluir</button>
            </div>
          </div>
          <h3>${esc(t.nome)}</h3>
          <p>${esc(t.descricao) || "Sem descrição."}</p>
          <div class="stats"><span><strong>${t.qtd_apolices}</strong> ${t.qtd_apolices === 1 ? "apólice ativa" : "apólices ativas"}</span><span><strong>${moneyShort(premio[t.nome] || 0)}</strong> em prêmios</span></div>
        </article>`).join("")}
      <button class="panel type add" onclick="formTipo()">
        <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>
        Adicionar tipo de seguro
      </button>
    </div>`;
}

async function formTipo(id) {
  const todos = await api("/tipos");
  const t = id ? todos.find((x) => x.id === id) : {};
  openDrawer(`
    <h2>${id ? "Editar tipo de seguro" : "Novo tipo de seguro"}</h2>
    <p class="lead">Ex.: Automóvel, Residencial, Vida, Responsabilidade civil.</p>
    <form id="f" class="form">
      <label class="full">Nome<input name="nome" value="${esc(t.nome)}" autocomplete="off"></label>
      <label class="full">Descrição<textarea name="descricao" rows="3">${esc(t.descricao)}</textarea></label>
    </form>
    <div class="drawer-actions">
      <button class="btn ghost" onclick="closeDrawer()">Cancelar</button>
      <button class="btn primary" id="salvar">${id ? "Salvar alterações" : "Adicionar tipo"}</button>
    </div>`);
  const f = $("#f");
  const validacao = ligarValidacao(f, () => {
    const nome = f.nome.value.trim(), erros = {};
    const igual = todos.find((x) => x.id !== id && semAcento(x.nome) === semAcento(nome));
    if (nome.length < 3) erros.nome = "Informe o nome do tipo de seguro (mínimo 3 letras)";
    else if (igual) erros.nome = `Já existe o tipo "${igual.nome}"`;
    return { erros, avisos: {} };
  }, $("#salvar"));
  $("#salvar").onclick = () => run(async () => {
    if (!validacao.podeSalvar()) return;
    try {
      await api(id ? "/tipos/" + id : "/tipos", { method: id ? "PUT" : "POST", body: formData(f) });
    } catch (e) { validacao.erroServidor(e); throw e; }
    closeDrawer(); toast(id ? "Alterações salvas" : "Tipo adicionado"); refresh();
  });
}

function excluirTipo(id) {
  if (!confirm("Excluir este tipo de seguro?")) return;
  run(async () => { await api("/tipos/" + id, { method: "DELETE" }); toast("Tipo excluído"); refresh(); });
}

// ============================================================ paleta de comandos (Ctrl+K)
let pItems = [], pSel = 0;
const ACTIONS = [
  { ic: "+", t: "Nova apólice", s: "Registrar apólice emitida", go: () => formApolice() },
  { ic: "+", t: "Novo segurado", s: "Cadastrar cliente", go: () => formSegurado() },
  { ic: "↻", t: "Ver renovações", s: "Quadro por urgência", go: () => (location.hash = "renovacoes") },
  { ic: "◷", t: "Ir para o painel", s: "Linha do tempo e fila de renovação", go: () => (location.hash = "painel") },
];

function openPalette() {
  $("#palette").classList.remove("hidden");
  const inp = $("#palette-input");
  inp.value = "";
  inp.focus();
  renderPalette("");
}
function closePalette() { $("#palette").classList.add("hidden"); }

function hl(text, q) {
  const t = esc(text);
  if (!q) return t;
  const i = String(text ?? "").toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return t;
  const s = String(text);
  return esc(s.slice(0, i)) + "<mark>" + esc(s.slice(i, i + q.length)) + "</mark>" + esc(s.slice(i + q.length));
}

async function renderPalette(q) {
  q = q.trim();
  let html = "";
  pItems = [];
  const acts = ACTIONS.filter((a) => !q || a.t.toLowerCase().includes(q.toLowerCase()));
  const add = (item, inner) => { pItems.push(item); return `<div class="p-item" data-i="${pItems.length - 1}">${inner}</div>`; };

  let segs = [], aps = [];
  if (q) [segs, aps] = await Promise.all([api("/segurados?q=" + encodeURIComponent(q)), api("/apolices?q=" + encodeURIComponent(q))]);
  if ($("#palette-input").value.trim() !== q) return; // resposta antiga

  if (segs.length) html += "<h5>Segurados</h5>" + segs.slice(0, 6).map((s) => add(
    { go: () => { selSeg = s.id; location.hash = "segurados/" + s.id; if (current === "segurados") refresh(); } },
    `<span class="ic">${esc(initials(s.nome))}</span><div><strong>${hl(s.nome, q)}</strong><span>${hl(s.documento || "", q)} ${s.cidade ? " · " + esc(s.cidade) : ""}</span></div>`)).join("");
  if (aps.length) html += "<h5>Apólices</h5>" + aps.slice(0, 8).map((a) => add(
    { go: () => detalheApolice(a.id) },
    `<span class="ic">${iconFor(a.tipo_nome)}</span><div><strong>${hl(a.numero, q)}, ${hl(a.segurado_nome, q)}</strong><span>${esc(a.tipo_nome)}, ${hl(a.seguradora, q)}${a.bem_segurado ? ", " + hl(a.bem_segurado, q) : ""}</span></div>${statusTag(a.status)}`)).join("");
  if (acts.length) html += "<h5>Ações</h5>" + acts.map((a) => add(a, `<span class="ic">${a.ic}</span><div><strong>${esc(a.t)}</strong><span>${esc(a.s)}</span></div>`)).join("");
  if (!html) html = `<div class="empty"><p>Nada encontrado para “${esc(q)}”.</p></div>`;

  $("#palette-results").innerHTML = html;
  pSel = 0;
  paintSel();
  $$("#palette-results .p-item").forEach((el) => {
    el.onmouseenter = () => { pSel = +el.dataset.i; paintSel(); };
    el.onclick = () => choose(+el.dataset.i);
  });
}
function paintSel() {
  $$("#palette-results .p-item").forEach((el) => el.classList.toggle("sel", +el.dataset.i === pSel));
  $(`#palette-results .p-item[data-i="${pSel}"]`)?.scrollIntoView({ block: "nearest" });
}
function choose(i) { const it = pItems[i]; if (!it) return; closePalette(); run(async () => it.go()); }

$("#palette-input").addEventListener("input", debounce((e) => run(() => renderPalette(e.target.value)), 120));
$("#palette-input").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { e.preventDefault(); pSel = Math.min(pItems.length - 1, pSel + 1); paintSel(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); pSel = Math.max(0, pSel - 1); paintSel(); }
  else if (e.key === "Enter") { e.preventDefault(); choose(pSel); }
});
$("#palette").addEventListener("click", (e) => { if (e.target.id === "palette") closePalette(); });

document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); openPalette(); }
  else if (e.key === "/" && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); openPalette(); }
  else if (e.key === "Escape") {
    if (!$("#palette").classList.contains("hidden")) closePalette();
    else if ($("#drawer").classList.contains("open")) closeDrawer();
  }
});

route();
