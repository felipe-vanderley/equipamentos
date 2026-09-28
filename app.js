/* =====================================================================
   PORTAL DE EQUIPAMENTOS — aplicação (sem etapa de build)
   ===================================================================== */
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, NOME_EMPRESA } from './config.js';
import { arred, quantidadeSugerida, gerarParcelas } from './calc.js';

const app = document.getElementById('app');
const nav = document.getElementById('nav');
document.getElementById('marca').textContent = NOME_EMPRESA;
document.title = NOME_EMPRESA;

if (!SUPABASE_URL || SUPABASE_URL.includes('SEU-PROJETO')) {
  app.innerHTML = `<div class="card"><h2>Configuração pendente</h2>
    <p>Preencha o arquivo <code>config.js</code> com a URL e a chave <em>anon</em> do seu projeto Supabase (veja o LEIAME).</p></div>`;
  throw new Error('config.js não preenchido');
}

const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let sessao = null, perfil = null;
const isAdmin = () => perfil?.papel === 'admin';

/* ---------------------------------------------------------------------
   UTILITÁRIOS
   --------------------------------------------------------------------- */
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = v => Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const dataBR = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';
const hoje = () => { const d = new Date(); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10); };
const nz = v => (v === '' || v == null) ? null : (typeof v === 'string' ? (v.trim() || null) : v);
const slug = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9.]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'arquivo';
const diasAte = d => Math.round((Date.parse(d) - Date.parse(hoje())) / 86400000);
const soma = arr => arred(arr.reduce((s, l) => s + Number(l.valor), 0));

const PERIODO = { hora: 'Hora', dia: 'Dia', mes: 'Mês', ano: 'Ano' };
const PERIODO_PLURAL = { hora: 'horas', dia: 'dias', mes: 'meses', ano: 'anos' };
const CATEGORIAS = {
  receita: { locacao: 'Locação', outra_receita: 'Outra receita' },
  despesa: { administrativa: 'Administrativa', consumo: 'Consumo', manutencao: 'Manutenção' },
};
const CAT_NOME = { ...CATEGORIAS.receita, ...CATEGORIAS.despesa };
const TIPOS_DOC = ['Laudo de inspeção', 'ART', 'Prontuário', 'Relatório técnico', 'APR', 'Certificado', 'Manual', 'Outro'];
const NORMAS = ['NR-11', 'NR-12', 'NR-13', 'NR-35', 'Outra'];

function traduzErro(m) {
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/row-level security|permission denied|not allowed/i.test(m)) return 'Sem permissão para esta ação.';
  if (/Email not confirmed/i.test(m)) return 'E-mail ainda não confirmado.';
  return m;
}
function ok(res) { if (res.error) throw new Error(traduzErro(res.error.message)); return res.data; }

function toast(msg, erro = false) {
  const t = document.createElement('div');
  t.className = 'toast' + (erro ? ' erro' : '');
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3800);
}

/** Abre um formulário em janela. aoEnviar(form, dados) salva; erro mantém a janela aberta. */
function modal(titulo, corpo, aoEnviar, { rotulo = 'Salvar', somenteLeitura = false } = {}) {
  const fundo = document.createElement('div');
  fundo.className = 'modal-fundo';
  fundo.innerHTML = `<form class="modal" novalidate>
    <header><h3>${esc(titulo)}</h3><button type="button" class="x" aria-label="Fechar">×</button></header>
    <div class="modal-corpo">${corpo}</div>
    <footer>${somenteLeitura
      ? '<button type="button" class="btn sec cancelar">Fechar</button>'
      : `<button type="button" class="btn sec cancelar">Cancelar</button><button type="submit" class="btn">${esc(rotulo)}</button>`}</footer>
  </form>`;
  document.body.appendChild(fundo);
  const fechar = () => fundo.remove();
  fundo.querySelector('.x').onclick = fechar;
  fundo.querySelector('.cancelar').onclick = fechar;
  fundo.addEventListener('mousedown', e => { if (e.target === fundo) fechar(); });
  const form = fundo.querySelector('form');
  form.onsubmit = async e => {
    e.preventDefault();
    if (!aoEnviar || !form.reportValidity()) return;
    const b = form.querySelector('[type=submit]');
    b.disabled = true; b.textContent = 'Salvando…';
    try { await aoEnviar(form, Object.fromEntries(new FormData(form))); fechar(); }
    catch (err) { console.error(err); toast(err.message, true); b.disabled = false; b.textContent = rotulo; }
  };
  return form;
}

const campo = (rotulo, nome, valor = '', tipo = 'text', extra = '') =>
  `<label>${rotulo}<input name="${nome}" type="${tipo}" value="${esc(valor)}" ${extra}></label>`;
const opcoes = (pares, sel) => pares.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(sel ?? '') ? 'selected' : ''}>${esc(t)}</option>`).join('');

function badgeData(d, rotulo) {
  if (!d) return '';
  const n = diasAte(d);
  if (n < 0) return `<span class="badge vermelho">${rotulo} vencida (${dataBR(d)})</span>`;
  if (n <= 30) return `<span class="badge amarelo">${rotulo}: ${n === 0 ? 'hoje' : `em ${n} dia${n === 1 ? '' : 's'}`}</span>`;
  return `<span class="badge verde">${rotulo}: ${dataBR(d)}</span>`;
}
const fotoURL = p => p ? sb.storage.from('fotos').getPublicUrl(p).data.publicUrl : null;

async function comprimirImagem(arquivo, max = 1600) {
  if (!arquivo?.type?.startsWith('image/')) return arquivo;
  try {
    const bmp = await createImageBitmap(arquivo);
    const f = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * f); c.height = Math.round(bmp.height * f);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
    return blob ? new File([blob], 'foto.jpg', { type: 'image/jpeg' }) : arquivo;
  } catch { return arquivo; }
}

function exportarCSV(linhas, nome) {
  const csv = '\ufeff' + linhas.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function ir(h) { if (location.hash === h) rota(); else location.hash = h; }

/* ---------------------------------------------------------------------
   SESSÃO E NAVEGAÇÃO
   --------------------------------------------------------------------- */
async function carregarPerfil() {
  const { data: { session } } = await sb.auth.getSession();
  sessao = session; perfil = null;
  if (session) perfil = ok(await sb.from('perfis').select('*, clientes(nome)').eq('id', session.user.id).maybeSingle());
}

function renderNav(seg) {
  let h = '';
  const at = s => seg === s ? 'class="ativo"' : '';
  if (sessao) {
    h += `<a href="#/" ${at(undefined)}>Equipamentos</a>`;
    if (isAdmin() || perfil?.cliente_id) h += `<a href="#/financeiro" ${at('financeiro')}>Financeiro</a>`;
    if (isAdmin()) h += `<a href="#/admin" ${at('admin')}>Administração</a>`;
    h += `<span class="usuario">${esc(perfil?.nome || sessao.user.email)}</span><button class="btn sec pequeno" id="sair">Sair</button>`;
  } else {
    h += `<a class="btn pequeno" href="#/login">Entrar</a>`;
  }
  nav.innerHTML = h;
  const s = document.getElementById('sair');
  if (s) s.onclick = async () => { await sb.auth.signOut(); sessao = null; perfil = null; ir('#/login'); };
}

async function rota() {
  let h = location.hash.slice(1);
  if (!h || h.includes('=')) h = '/';
  const [, seg, id] = h.split('/');
  renderNav(seg || undefined);
  app.onclick = null; app.onchange = null; app.oninput = null;
  app.innerHTML = '<p class="carregando">Carregando…</p>';
  try {
    if (seg === 'equipamento' && id) return await telaEquipamento(id);
    if (!sessao) {
      if (seg && seg !== 'login') sessionStorage.setItem('voltar', '#' + h);
      return telaLogin();
    }
    if (seg === 'login') return ir('#/');
    if (seg === 'financeiro') return await telaFinanceiro();
    if (seg === 'admin') return isAdmin() ? await telaAdmin() : ir('#/');
    return await telaInicio();
  } catch (e) {
    console.error(e);
    app.innerHTML = `<div class="card erro"><h3>Algo deu errado</h3><p>${esc(e.message)}</p></div>`;
  }
}
window.addEventListener('hashchange', rota);

sb.auth.onAuthStateChange((ev, session) => {
  if (ev === 'SIGNED_OUT') { sessao = null; perfil = null; setTimeout(rota, 0); }
  if (ev === 'TOKEN_REFRESHED') sessao = session;
  if (ev === 'PASSWORD_RECOVERY') setTimeout(telaNovaSenha, 0);
});

(async () => {
  try { await carregarPerfil(); } catch (e) { console.error(e); }
  if (new URLSearchParams(location.search).has('recuperar') && sessao) return telaNovaSenha();
  rota();
})();

/* ---------------------------------------------------------------------
   LOGIN / SENHA
   --------------------------------------------------------------------- */
function telaLogin() {
  app.innerHTML = `<div class="login card">
    <h2>Acesso do cliente</h2>
    <p class="mut" style="margin-bottom:16px">Entre para baixar documentos e acessar a área financeira.</p>
    <form id="fLogin">
      ${campo('E-mail', 'email', '', 'email', 'required autocomplete="username"')}
      ${campo('Senha', 'senha', '', 'password', 'required autocomplete="current-password"')}
      <button class="btn largo">Entrar</button>
    </form>
    <button class="link" id="esqueci">Esqueci minha senha</button>
  </div>`;
  const f = document.getElementById('fLogin');
  f.onsubmit = async e => {
    e.preventDefault();
    const b = f.querySelector('button'); b.disabled = true; b.textContent = 'Entrando…';
    try {
      ok(await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.senha.value }));
      await carregarPerfil();
      const v = sessionStorage.getItem('voltar') || '#/';
      sessionStorage.removeItem('voltar');
      ir(v);
    } catch (err) { toast(err.message, true); b.disabled = false; b.textContent = 'Entrar'; }
  };
  document.getElementById('esqueci').onclick = async () => {
    const email = f.email.value.trim();
    if (!email) return toast('Digite seu e-mail no campo acima.', true);
    try {
      ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + '?recuperar=1' }));
      toast('Enviamos um link de redefinição para o seu e-mail.');
    } catch (err) { toast(err.message, true); }
  };
}

function telaNovaSenha() {
  renderNav();
  app.innerHTML = `<div class="login card"><h2>Definir nova senha</h2>
    <form id="fSenha">
      ${campo('Nova senha (mín. 8 caracteres)', 'senha', '', 'password', 'required minlength="8" autocomplete="new-password"')}
      ${campo('Repita a senha', 'senha2', '', 'password', 'required minlength="8" autocomplete="new-password"')}
      <button class="btn largo">Salvar senha</button></form></div>`;
  const f = document.getElementById('fSenha');
  f.onsubmit = async e => {
    e.preventDefault();
    if (f.senha.value !== f.senha2.value) return toast('As senhas não conferem.', true);
    try {
      ok(await sb.auth.updateUser({ password: f.senha.value }));
      history.replaceState(null, '', location.pathname + '#/');
      toast('Senha alterada.');
      await carregarPerfil(); rota();
    } catch (err) { toast(err.message, true); }
  };
}

/* ---------------------------------------------------------------------
   LISTA DE EQUIPAMENTOS
   --------------------------------------------------------------------- */
async function telaInicio() {
  if (!isAdmin() && !perfil?.cliente_id) {
    app.innerHTML = `<div class="card"><h2>Acesso em configuração</h2>
      <p class="mut">Seu usuário ainda não foi vinculado a uma empresa. Entre em contato com o responsável técnico.</p></div>`;
    return;
  }
  const eqs = ok(await sb.from('equipamentos')
    .select('id,tag,tipo,norma,fabricante,modelo,localizacao,foto_frente,proxima_inspecao,cliente_id,clientes(nome)')
    .order('tag'));

  app.innerHTML = `<div class="topo">
      <div><h2>Equipamentos</h2><p class="mut">${isAdmin() ? `${eqs.length} equipamento(s) de todos os clientes` : esc(perfil.clientes?.nome || '')}</p></div>
      <div class="acoes"><input id="busca" type="search" placeholder="Buscar tag, tipo, fabricante…" style="min-width:240px">
      ${isAdmin() ? '<button class="btn" id="novoEq">+ Novo equipamento</button>' : ''}</div>
    </div><div class="grade" id="grade"></div>`;

  const desenhar = termo => {
    const t = termo.toLowerCase();
    const lista = eqs.filter(e => !t || [e.tag, e.tipo, e.norma, e.fabricante, e.modelo, e.localizacao, e.clientes?.nome]
      .some(v => String(v || '').toLowerCase().includes(t)));
    document.getElementById('grade').innerHTML = lista.length ? lista.map(e => {
      const f = fotoURL(e.foto_frente);
      return `<a class="card-eq" href="#/equipamento/${e.id}">
        <div class="thumb">${f ? `<img src="${f}" alt="" loading="lazy">` : '<span>Sem foto</span>'}</div>
        <div class="info"><strong>${esc(e.tag)}</strong>
          <span>${esc([e.tipo, e.norma].filter(Boolean).join(' · '))}</span>
          <span class="mut">${esc([e.fabricante, e.modelo].filter(Boolean).join(' · '))}</span>
          ${isAdmin() ? `<span class="mut">${esc(e.clientes?.nome)}</span>` : ''}
          ${badgeData(e.proxima_inspecao, 'Inspeção')}</div></a>`;
    }).join('') : '<p class="mut">Nenhum equipamento encontrado.</p>';
  };
  desenhar('');
  document.getElementById('busca').oninput = e => desenhar(e.target.value);
  const n = document.getElementById('novoEq'); if (n) n.onclick = () => formEquipamento();
}

/* ---------------------------------------------------------------------
   CADASTRO DE EQUIPAMENTO (admin)
   --------------------------------------------------------------------- */
async function formEquipamento(eq = null) {
  const clientes = ok(await sb.from('clientes').select('id,nome').order('nome'));
  if (!clientes.length) return toast('Cadastre um cliente primeiro em Administração.', true);
  const v = eq || {};
  modal(eq ? 'Editar equipamento' : 'Novo equipamento', `
    <label>Cliente (proprietário)<select name="cliente_id" required ${eq ? 'disabled' : ''}>${opcoes(clientes.map(c => [c.id, c.nome]), v.cliente_id)}</select></label>
    <div class="duas">
      ${campo('Tag / identificação *', 'tag', v.tag, 'text', 'required')}
      ${campo('Tipo (ex.: Guindaste, Compressor)', 'tipo', v.tipo)}
      <label>Norma<select name="norma"><option value="">—</option>${opcoes(NORMAS.map(n => [n, n]), v.norma)}</select></label>
      ${campo('Fabricante', 'fabricante', v.fabricante)}
      ${campo('Modelo', 'modelo', v.modelo)}
      ${campo('Nº de série', 'numero_serie', v.numero_serie)}
      ${campo('Ano de fabricação', 'ano_fabricacao', v.ano_fabricacao, 'number', 'min="1900" max="2100"')}
      ${campo('Capacidade', 'capacidade', v.capacidade)}
      ${campo('Localização', 'localizacao', v.localizacao)}
      ${campo('Próxima inspeção', 'proxima_inspecao', v.proxima_inspecao, 'date')}
    </div>
    <label>Especificações adicionais<textarea name="especificacoes" rows="3">${esc(v.especificacoes)}</textarea></label>
    <div class="duas">
      <label>Foto frontal ${v.foto_frente ? '(substituir)' : ''}<input name="foto_frente" type="file" accept="image/*"></label>
      <label>Foto lateral ${v.foto_lateral ? '(substituir)' : ''}<input name="foto_lateral" type="file" accept="image/*"></label>
    </div>`,
  async (form, d) => {
    const dados = {
      tag: d.tag.trim(), tipo: nz(d.tipo), norma: nz(d.norma), fabricante: nz(d.fabricante), modelo: nz(d.modelo),
      numero_serie: nz(d.numero_serie), ano_fabricacao: d.ano_fabricacao ? Number(d.ano_fabricacao) : null,
      capacidade: nz(d.capacidade), localizacao: nz(d.localizacao), proxima_inspecao: nz(d.proxima_inspecao),
      especificacoes: nz(d.especificacoes),
    };
    let reg = eq
      ? ok(await sb.from('equipamentos').update(dados).eq('id', eq.id).select().single())
      : ok(await sb.from('equipamentos').insert({ ...dados, cliente_id: d.cliente_id }).select().single());
    const fotos = {};
    for (const lado of ['foto_frente', 'foto_lateral']) {
      const arq = form.elements[lado].files[0];
      if (!arq) continue;
      const img = await comprimirImagem(arq);
      const path = `${reg.cliente_id}/${reg.id}/${lado}-${Date.now()}.jpg`;
      ok(await sb.storage.from('fotos').upload(path, img, { contentType: img.type || 'image/jpeg' }));
      if (eq?.[lado]) await sb.storage.from('fotos').remove([eq[lado]]);
      fotos[lado] = path;
    }
    if (Object.keys(fotos).length) reg = ok(await sb.from('equipamentos').update(fotos).eq('id', reg.id).select().single());
    toast('Equipamento salvo.');
    ir(`#/equipamento/${reg.id}`);
  });
}

/* ---------------------------------------------------------------------
   PÁGINA DO EQUIPAMENTO (pública: dados + fotos + lista de documentos)
   --------------------------------------------------------------------- */
async function telaEquipamento(id) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) { app.innerHTML = '<div class="card"><h2>Equipamento não encontrado</h2></div>'; return; }
  const eq = ok(await sb.rpc('equipamento_publico', { p_id: id }));
  if (!eq) { app.innerHTML = '<div class="card"><h2>Equipamento não encontrado</h2></div>'; return; }

  let completo = null;
  if (sessao) completo = ok(await sb.from('equipamentos').select('*').eq('id', id).maybeSingle());
  const gerir = !!completo;

  const fotoBox = (url, rot) => `<figure class="foto"><div>${url ? `<img src="${url}" alt="${rot}" data-zoom="${url}">` : '<span>Sem foto</span>'}</div><figcaption>${rot}</figcaption></figure>`;
  const linhas = [['Tag', eq.tag], ['Tipo', eq.tipo], ['Norma', eq.norma], ['Fabricante', eq.fabricante], ['Modelo', eq.modelo],
    ['Nº de série', eq.numero_serie], ['Ano de fabricação', eq.ano_fabricacao], ['Capacidade', eq.capacidade],
    ['Localização', eq.localizacao], ['Proprietário', eq.cliente],
    ['Próxima inspeção', eq.proxima_inspecao ? dataBR(eq.proxima_inspecao) : null]].filter(([, v]) => v != null && v !== '');

  const docs = eq.documentos || [];
  app.innerHTML = `
  <div class="topo">
    <div><p class="mut">${esc([eq.tipo || 'Equipamento', eq.norma].filter(Boolean).join(' · '))}</p><h2>${esc(eq.tag)}</h2>${badgeData(eq.proxima_inspecao, 'Inspeção')}</div>
    <div class="acoes">${isAdmin() ? `<button class="btn sec" id="qr">QR code</button><button class="btn sec" id="editar">Editar</button><button class="btn perigo" id="excluirEq">Excluir</button>` : ''}</div>
  </div>
  <div class="eq-layout">
    <section class="fotos">${fotoBox(fotoURL(eq.foto_frente), 'Vista frontal')}${fotoBox(fotoURL(eq.foto_lateral), 'Vista lateral')}</section>
    <section class="card"><h3>Dados técnicos</h3>
      <dl class="ficha">${linhas.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      ${eq.especificacoes ? `<p class="espec">${esc(eq.especificacoes)}</p>` : ''}</section>
  </div>
  <section class="card">
    <div class="card-topo"><h3>Documentos (${docs.length})</h3>${isAdmin() ? '<button class="btn pequeno" id="novoDoc">+ Adicionar PDF</button>' : ''}</div>
    ${!sessao ? '<p class="aviso-login">🔒 Os documentos estão listados abaixo. Para baixar, <a href="#" data-login>faça login</a>.</p>' : ''}
    ${!sessao || gerir || !docs.length ? '' : '<p class="aviso-login">Este equipamento não pertence à sua empresa — download indisponível.</p>'}
    ${docs.length ? `<div class="rolagem"><table class="tabela">
      <thead><tr><th>Tipo</th><th>Documento</th><th>Emissão</th><th>Validade</th><th></th></tr></thead>
      <tbody>${docs.map(d => `<tr>
        <td>${esc(d.tipo)}</td>
        <td><strong>${esc(d.titulo)}</strong>${d.numero ? `<br><span class="mut">Nº ${esc(d.numero)}</span>` : ''}</td>
        <td>${dataBR(d.data_emissao)}</td>
        <td>${d.validade ? badgeData(d.validade, 'Validade') : '—'}</td>
        <td class="acoes-td"><button class="btn pequeno" data-baixar="${d.id}">⬇ Baixar PDF</button>
          ${isAdmin() ? `<button class="icone" data-del-doc="${d.id}" title="Excluir">🗑</button>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="mut">Nenhum documento cadastrado.</p>'}
  </section>
  ${gerir ? '<section class="card" id="locacoes"></section>' : ''}`;

  app.onclick = async e => {
    const t = e.target.closest('[data-baixar],[data-del-doc],[data-login],[data-zoom],[data-del-loc],#novaLoc');
    if (!t) return;
    if (t.dataset.login !== undefined) { e.preventDefault(); sessionStorage.setItem('voltar', location.hash); return ir('#/login'); }
    if (t.dataset.zoom) return window.open(t.dataset.zoom, '_blank');
    if (t.dataset.baixar) return baixarDocumento(t.dataset.baixar, t);
    if (t.dataset.delDoc) return excluirDocumento(t.dataset.delDoc);
    if (t.dataset.delLoc) return excluirLocacao(t.dataset.delLoc, completo);
    if (t.id === 'novaLoc') return formLocacao(completo);
  };
  if (isAdmin()) {
    document.getElementById('editar').onclick = () => formEquipamento(completo);
    document.getElementById('novoDoc').onclick = () => formDocumento(completo);
    document.getElementById('excluirEq').onclick = () => excluirEquipamento(completo);
    document.getElementById('qr').onclick = () => mostrarQR(eq);
  }
  if (gerir) await renderLocacoes(completo);
}

async function baixarDocumento(docId, botao) {
  if (!sessao) { sessionStorage.setItem('voltar', location.hash); return ir('#/login'); }
  const txt = botao.textContent; botao.disabled = true; botao.textContent = 'Preparando…';
  try {
    const d = ok(await sb.from('documentos').select('arquivo,titulo,tipo').eq('id', docId).maybeSingle());
    if (!d) throw new Error('Você não tem permissão para baixar este documento.');
    const nome = slug(`${d.tipo}-${d.titulo}`) + '.pdf';
    const { signedUrl } = ok(await sb.storage.from('documentos').createSignedUrl(d.arquivo, 120, { download: nome }));
    window.location.href = signedUrl;
  } catch (err) { toast(err.message, true); }
  finally { botao.disabled = false; botao.textContent = txt; }
}

function formDocumento(eq) {
  modal('Adicionar documento', `
    <div class="duas">
      <label>Tipo<select name="tipo" required>${opcoes(TIPOS_DOC.map(t => [t, t]))}</select></label>
      ${campo('Nº do documento / ART', 'numero')}
    </div>
    ${campo('Título *', 'titulo', '', 'text', 'required placeholder="Ex.: Laudo de inspeção periódica 2026"')}
    <div class="duas">
      ${campo('Data de emissão', 'data_emissao', hoje(), 'date')}
      ${campo('Validade', 'validade', '', 'date')}
    </div>
    <label>Arquivo PDF *<input name="arquivo" type="file" accept="application/pdf,.pdf" required></label>`,
  async (form, d) => {
    const arq = form.elements.arquivo.files[0];
    if (!arq) throw new Error('Selecione o arquivo PDF.');
    if (!/\.pdf$/i.test(arq.name) && arq.type !== 'application/pdf') throw new Error('O arquivo precisa ser PDF.');
    const path = `${eq.cliente_id}/${eq.id}/${Date.now()}-${slug(arq.name.replace(/\.pdf$/i, ''))}.pdf`;
    ok(await sb.storage.from('documentos').upload(path, arq, { contentType: 'application/pdf' }));
    const r = await sb.from('documentos').insert({
      equipamento_id: eq.id, cliente_id: eq.cliente_id, tipo: d.tipo, titulo: d.titulo.trim(),
      numero: nz(d.numero), data_emissao: nz(d.data_emissao), validade: nz(d.validade), arquivo: path,
    });
    if (r.error) { await sb.storage.from('documentos').remove([path]); ok(r); }
    toast('Documento adicionado.');
    rota();
  }, { rotulo: 'Enviar' });
}

async function excluirDocumento(id) {
  if (!confirm('Excluir este documento? O PDF será apagado.')) return;
  try {
    const d = ok(await sb.from('documentos').select('arquivo').eq('id', id).single());
    ok(await sb.from('documentos').delete().eq('id', id));
    await sb.storage.from('documentos').remove([d.arquivo]);
    toast('Documento excluído.'); rota();
  } catch (err) { toast(err.message, true); }
}

async function excluirEquipamento(eq) {
  if (!confirm(`Excluir o equipamento ${eq.tag}? Documentos, locações e lançamentos vinculados também serão apagados.`)) return;
  try {
    const docs = ok(await sb.from('documentos').select('arquivo').eq('equipamento_id', eq.id));
    ok(await sb.from('equipamentos').delete().eq('id', eq.id));
    if (docs.length) await sb.storage.from('documentos').remove(docs.map(d => d.arquivo));
    const fotos = [eq.foto_frente, eq.foto_lateral].filter(Boolean);
    if (fotos.length) await sb.storage.from('fotos').remove(fotos);
    toast('Equipamento excluído.'); ir('#/');
  } catch (err) { toast(err.message, true); }
}

async function mostrarQR(eq) {
  const url = location.origin + location.pathname + '#/equipamento/' + eq.id;
  let img = '';
  try {
    const mod = await import('https://cdn.jsdelivr.net/npm/qrcode@1.5.4/+esm');
    const QR = mod.default || mod;
    const png = await QR.toDataURL(url, { width: 480, margin: 1 });
    img = `<img src="${png}" alt="QR code"><p><a class="btn" download="QR-${slug(eq.tag)}.png" href="${png}">Baixar imagem do QR</a></p>`;
  } catch (e) { console.error(e); }
  modal(`QR code — ${eq.tag}`, `<div class="qr">${img}<p class="mut">Cole a etiqueta no equipamento. Qualquer pessoa vê os dados técnicos; o download dos PDFs exige login.</p>
    <input readonly value="${esc(url)}" onclick="this.select()"></div>`, null, { somenteLeitura: true });
}

/* ---------------------------------------------------------------------
   LOCAÇÕES
   --------------------------------------------------------------------- */
function resumoLocacao(l) {
  const lc = l.lancamentos || [], h = hoje();
  return {
    total: arred(Number(l.valor_unitario) * Number(l.quantidade)),
    recebido: soma(lc.filter(x => x.pago)),
    aReceber: soma(lc.filter(x => !x.pago)),
    vencido: soma(lc.filter(x => !x.pago && x.vencimento < h)),
  };
}
function badgeSituacao(l) {
  const h = hoje();
  if (h < l.data_inicio) return '<span class="badge azul">Agendada</span>';
  if (h <= l.data_termino) return '<span class="badge verde">Em andamento</span>';
  return '<span class="badge cinza">Encerrada</span>';
}

async function renderLocacoes(eq) {
  const box = document.getElementById('locacoes');
  const locs = ok(await sb.from('locacoes').select('*, lancamentos(valor,pago,vencimento)')
    .eq('equipamento_id', eq.id).order('data_inicio', { ascending: false }));
  box.innerHTML = `<div class="card-topo"><h3>Locações</h3><button class="btn pequeno" id="novaLoc">+ Nova locação</button></div>
    ${locs.length ? `<div class="rolagem"><table class="tabela">
      <thead><tr><th>Locatário</th><th>Período</th><th>Cobrança</th><th class="num">Contrato</th><th class="num">Recebido</th><th class="num">A receber</th><th>Situação</th><th></th></tr></thead>
      <tbody>${locs.map(l => {
        const r = resumoLocacao(l);
        return `<tr><td><strong>${esc(l.locatario)}</strong>${l.observacoes ? `<br><span class="mut">${esc(l.observacoes)}</span>` : ''}</td>
          <td>${dataBR(l.data_inicio)} a ${dataBR(l.data_termino)}</td>
          <td>${num(l.quantidade)} ${PERIODO_PLURAL[l.tipo_periodo]} × ${brl(l.valor_unitario)}</td>
          <td class="num">${brl(r.total)}</td><td class="num receita">${brl(r.recebido)}</td>
          <td class="num">${brl(r.aReceber)}${r.vencido > 0 ? `<br><span class="badge vermelho">${brl(r.vencido)} vencido</span>` : ''}</td>
          <td>${badgeSituacao(l)}</td>
          <td class="acoes-td"><button class="icone" data-del-loc="${l.id}" title="Excluir locação">🗑</button></td></tr>`;
      }).join('')}</tbody></table></div>` : '<p class="mut">Nenhuma locação registrada.</p>'}
    <p style="margin-bottom:0"><a href="#/financeiro">Ir para a área financeira →</a></p>`;
}

function formLocacao(eq) {
  const form = modal(`Nova locação — ${eq.tag}`, `
    ${campo('Locatário (quem alugou) *', 'locatario', '', 'text', 'required')}
    <div class="duas">
      <label>Tipo de locação<select name="tipo_periodo">${opcoes(Object.entries(PERIODO), 'mes')}</select></label>
      ${campo('Valor por período (R$) *', 'valor_unitario', '', 'number', 'step="0.01" min="0" required')}
      ${campo('Data de início *', 'data_inicio', hoje(), 'date', 'required')}
      ${campo('Data de término *', 'data_termino', '', 'date', 'required')}
      ${campo('Quantidade de períodos *', 'quantidade', '', 'number', 'step="0.01" min="0.01" required')}
      <label>Cobrança<select name="modo"><option value="periodo">Uma parcela por período</option><option value="unica">Parcela única no término</option></select></label>
    </div>
    <label>Observações<textarea name="observacoes" rows="2"></textarea></label>
    <div class="previa" id="previa">Preencha valor e datas para ver o valor do contrato.</div>`,
  async (f, d) => {
    if (d.data_termino < d.data_inicio) throw new Error('A data de término deve ser igual ou posterior ao início.');
    const loc = ok(await sb.from('locacoes').insert({
      equipamento_id: eq.id, cliente_id: eq.cliente_id, locatario: d.locatario.trim(), tipo_periodo: d.tipo_periodo,
      valor_unitario: Number(d.valor_unitario), quantidade: Number(d.quantidade),
      data_inicio: d.data_inicio, data_termino: d.data_termino, observacoes: nz(d.observacoes),
    }).select().single());
    const parcelas = gerarParcelas({ ...d });
    const r = await sb.from('lancamentos').insert(parcelas.map(p => ({
      cliente_id: eq.cliente_id, equipamento_id: eq.id, locacao_id: loc.id, tipo: 'receita', categoria: 'locacao',
      descricao: `Locação ${eq.tag} – ${loc.locatario}${p.de > 1 ? ` (${p.n}/${p.de})` : ''}`,
      valor: p.valor, vencimento: p.vencimento,
    })));
    if (r.error) { await sb.from('locacoes').delete().eq('id', loc.id); ok(r); }
    toast(`Locação registrada com ${parcelas.length} parcela(s) a receber.`);
    rota();
  });

  const q = form.elements.quantidade;
  const atualizar = e => {
    const tp = form.elements.tipo_periodo.value, ini = form.elements.data_inicio.value, fim = form.elements.data_termino.value;
    // Datas/tipo alteradas -> sugere a quantidade (continua editável)
    if (['tipo_periodo', 'data_inicio', 'data_termino'].includes(e?.target?.name) && tp !== 'hora') {
      const s = quantidadeSugerida(tp, ini, fim);
      if (s != null) q.value = s;
    }
    q.previousSibling.textContent = tp === 'hora' ? 'Total de horas *' : `Quantidade de ${PERIODO_PLURAL[tp]} *`;
    const vu = Number(form.elements.valor_unitario.value), qt = Number(q.value);
    const prev = form.querySelector('#previa');
    if (!vu || !qt || !ini || !fim) { prev.textContent = 'Preencha valor e datas para ver o valor do contrato.'; return; }
    if (fim < ini) { prev.textContent = 'A data de término é anterior ao início.'; return; }
    const ps = gerarParcelas({ tipo: tp, valor_unitario: vu, quantidade: qt, data_inicio: ini, data_termino: fim, modo: form.elements.modo.value });
    prev.innerHTML = `<strong>Valor total do contrato: ${brl(vu * qt)}</strong> — ${ps.length} parcela(s)
      <ul>${ps.map(p => `<li>${dataBR(p.vencimento)} — ${brl(p.valor)}</li>`).join('')}</ul>`;
  };
  form.addEventListener('input', atualizar);
  form.addEventListener('change', atualizar);
}

async function excluirLocacao(id, eq) {
  if (!confirm('Excluir esta locação? As parcelas a receber vinculadas também serão apagadas.')) return;
  try { ok(await sb.from('locacoes').delete().eq('id', id)); toast('Locação excluída.'); await renderLocacoes(eq); }
  catch (err) { toast(err.message, true); }
}

/* ---------------------------------------------------------------------
   ÁREA FINANCEIRA (restrita)
   --------------------------------------------------------------------- */
const filtroFin = { equip: '', tipo: '', status: '', de: '', ate: '' };

async function telaFinanceiro() {
  let clienteId = perfil?.cliente_id, clientes = [];
  if (isAdmin()) {
    clientes = ok(await sb.from('clientes').select('id,nome').order('nome'));
    clienteId = sessionStorage.getItem('finCliente');
    if (!clientes.some(c => c.id === clienteId)) clienteId = clientes[0]?.id;
  }
  if (!clienteId) { app.innerHTML = '<div class="card"><h2>Financeiro</h2><p class="mut">Nenhum cliente disponível.</p></div>'; return; }

  const [lancs, locs, eqs] = (await Promise.all([
    sb.from('lancamentos').select('*, equipamentos(tag), locacoes(locatario)').eq('cliente_id', clienteId).order('vencimento'),
    sb.from('locacoes').select('*, equipamentos(tag), lancamentos(valor,pago,vencimento)').eq('cliente_id', clienteId).order('data_inicio', { ascending: false }),
    sb.from('equipamentos').select('id,tag').eq('cliente_id', clienteId).order('tag'),
  ])).map(ok);

  const h = hoje();
  const rec = lancs.filter(l => l.tipo === 'receita'), des = lancs.filter(l => l.tipo === 'despesa');
  const k = {
    recebido: soma(rec.filter(l => l.pago)),
    futuro: soma(rec.filter(l => !l.pago && l.vencimento >= h)),
    vencido: soma(rec.filter(l => !l.pago && l.vencimento < h)),
    despPagas: soma(des.filter(l => l.pago)),
    despAbertas: soma(des.filter(l => !l.pago)),
  };
  k.saldo = arred(k.recebido - k.despPagas);
  k.projetado = arred(k.saldo + k.futuro + k.vencido - k.despAbertas);
  const porCat = Object.entries(CATEGORIAS.despesa).map(([c, n]) => [n, soma(des.filter(l => l.categoria === c))]);
  const locsAtivas = locs.filter(l => resumoLocacao(l).aReceber > 0 || h <= l.data_termino);

  app.innerHTML = `
  <div class="topo">
    <div><h2>Financeiro</h2><p class="mut">Área restrita · ${esc(isAdmin() ? '' : perfil.clientes?.nome || '')}</p></div>
    <div class="acoes">
      ${isAdmin() ? `<select id="selCliente">${opcoes(clientes.map(c => [c.id, c.nome]), clienteId)}</select>` : ''}
      <button class="btn sec" id="csv">Exportar CSV</button>
      <button class="btn" id="novoLanc">+ Lançamento</button>
    </div>
  </div>
  <div class="kpis">
    <div class="kpi verde"><span>Recebido</span><strong>${brl(k.recebido)}</strong></div>
    <div class="kpi azul"><span>Valor futuro dos contratos</span><strong>${brl(k.futuro)}</strong><small>a receber, ainda no prazo</small></div>
    <div class="kpi vermelho"><span>Pendente (vencido)</span><strong>${brl(k.vencido)}</strong><small>receitas não informadas como recebidas</small></div>
    <div class="kpi amarelo"><span>Despesas pagas</span><strong>${brl(k.despPagas)}</strong><small>em aberto: ${brl(k.despAbertas)}</small></div>
    <div class="kpi escuro"><span>Saldo realizado</span><strong class="${k.saldo < 0 ? 'despesa' : ''}">${brl(k.saldo)}</strong><small>projetado: ${brl(k.projetado)}</small></div>
  </div>

  <section class="card"><h3>Contratos de locação</h3>
    ${locsAtivas.length ? `<div class="rolagem"><table class="tabela">
      <thead><tr><th>Equipamento</th><th>Locatário</th><th>Período</th><th class="num">Valor do contrato</th><th class="num">Recebido</th><th class="num">Valor futuro</th><th class="num">Pendente</th><th>Situação</th></tr></thead>
      <tbody>${locsAtivas.map(l => { const r = resumoLocacao(l); return `<tr>
        <td><a href="#/equipamento/${l.equipamento_id}">${esc(l.equipamentos?.tag)}</a></td><td>${esc(l.locatario)}</td>
        <td>${dataBR(l.data_inicio)} a ${dataBR(l.data_termino)}<br><span class="mut">${num(l.quantidade)} ${PERIODO_PLURAL[l.tipo_periodo]} × ${brl(l.valor_unitario)}</span></td>
        <td class="num">${brl(r.total)}</td><td class="num receita">${brl(r.recebido)}</td>
        <td class="num">${brl(arred(r.aReceber - r.vencido))}</td>
        <td class="num ${r.vencido > 0 ? 'despesa' : ''}">${brl(r.vencido)}</td><td>${badgeSituacao(l)}</td></tr>`; }).join('')}
      </tbody></table></div>` : '<p class="mut">Nenhum contrato ativo ou com valores a receber. Registre locações na página de cada equipamento.</p>'}
  </section>

  <section class="card"><h3>Despesas por categoria</h3>
    <div class="kpis" style="margin:0">${porCat.map(([n, v]) => `<div class="kpi"><span>${n}</span><strong>${brl(v)}</strong></div>`).join('')}</div>
  </section>

  <section class="card">
    <div class="card-topo"><h3>Lançamentos</h3>
      <div class="filtros">
        <label>Equipamento<select data-f="equip"><option value="">Todos</option>${opcoes(eqs.map(e => [e.id, e.tag]), filtroFin.equip)}</select></label>
        <label>Tipo<select data-f="tipo">${opcoes([['', 'Todos'], ['receita', 'Receitas'], ['despesa', 'Despesas']], filtroFin.tipo)}</select></label>
        <label>Situação<select data-f="status">${opcoes([['', 'Todas'], ['aberto', 'Em aberto'], ['vencido', 'Vencidos'], ['pago', 'Pagos/recebidos']], filtroFin.status)}</select></label>
        <label>Vencimento de<input type="date" data-f="de" value="${filtroFin.de}"></label>
        <label>até<input type="date" data-f="ate" value="${filtroFin.ate}"></label>
      </div></div>
    <div class="rolagem" id="tabLanc"></div>
  </section>`;

  const filtrados = () => lancs.filter(l =>
    (!filtroFin.equip || l.equipamento_id === filtroFin.equip) &&
    (!filtroFin.tipo || l.tipo === filtroFin.tipo) &&
    (!filtroFin.status || (filtroFin.status === 'pago' ? l.pago : filtroFin.status === 'aberto' ? !l.pago : (!l.pago && l.vencimento < h))) &&
    (!filtroFin.de || l.vencimento >= filtroFin.de) && (!filtroFin.ate || l.vencimento <= filtroFin.ate));

  const desenhar = () => {
    const lista = filtrados();
    const tRec = soma(lista.filter(l => l.tipo === 'receita')), tDes = soma(lista.filter(l => l.tipo === 'despesa'));
    document.getElementById('tabLanc').innerHTML = lista.length ? `<table class="tabela">
      <thead><tr><th>Vencimento</th><th>Descrição</th><th>Equipamento</th><th>Categoria</th><th class="num">Valor</th><th>Situação</th><th></th></tr></thead>
      <tbody>${lista.map(l => {
        const venc = !l.pago && l.vencimento < h;
        const sit = l.pago
          ? `<span class="badge verde">${l.tipo === 'receita' ? 'Recebido' : 'Pago'} ${dataBR(l.data_pagamento)}</span>`
          : venc ? '<span class="badge vermelho">Vencido</span>' : '<span class="badge amarelo">Em aberto</span>';
        const acao = l.pago
          ? `<button class="btn sec pequeno" data-desfazer="${l.id}">Desfazer</button>`
          : `<button class="btn ok pequeno" data-pagar="${l.id}">${l.tipo === 'receita' ? '✓ Informar recebimento' : '✓ Marcar pago'}</button>`;
        return `<tr><td>${dataBR(l.vencimento)}</td><td>${esc(l.descricao || '—')}</td><td>${esc(l.equipamentos?.tag || '—')}</td>
          <td>${CAT_NOME[l.categoria] || l.categoria}</td>
          <td class="num ${l.tipo}">${l.tipo === 'despesa' ? '−' : ''}${brl(l.valor)}</td><td>${sit}</td>
          <td class="acoes-td">${acao}<button class="icone" data-editar="${l.id}" title="Editar">✎</button><button class="icone" data-excluir="${l.id}" title="Excluir">🗑</button></td></tr>`;
      }).join('')}</tbody>
      <tfoot><tr><td colspan="4">Totais do filtro</td><td class="num"><span class="receita">${brl(tRec)}</span><br><span class="despesa">−${brl(tDes)}</span></td><td colspan="2">Resultado: ${brl(tRec - tDes)}</td></tr></tfoot>
      </table>` : '<p class="mut">Nenhum lançamento para este filtro.</p>';
  };
  desenhar();

  app.onchange = e => {
    if (e.target.dataset.f) { filtroFin[e.target.dataset.f] = e.target.value; desenhar(); }
    if (e.target.id === 'selCliente') { sessionStorage.setItem('finCliente', e.target.value); filtroFin.equip = ''; rota(); }
  };
  app.onclick = async e => {
    const t = e.target.closest('[data-pagar],[data-desfazer],[data-editar],[data-excluir]');
    if (!t) return;
    const l = lancs.find(x => x.id === (t.dataset.pagar || t.dataset.desfazer || t.dataset.editar || t.dataset.excluir));
    if (t.dataset.pagar) {
      modal(l.tipo === 'receita' ? 'Informar recebimento' : 'Marcar como pago',
        `<p><strong>${esc(l.descricao || '')}</strong><br>${brl(l.valor)} · vencimento ${dataBR(l.vencimento)}</p>
         ${campo(l.tipo === 'receita' ? 'Data do recebimento' : 'Data do pagamento', 'data', hoje(), 'date', 'required')}`,
        async (f, d) => {
          ok(await sb.from('lancamentos').update({ pago: true, data_pagamento: d.data, confirmado_por: sessao.user.id }).eq('id', l.id));
          toast('Registrado.'); rota();
        }, { rotulo: 'Confirmar' });
    } else if (t.dataset.desfazer) {
      if (!confirm('Voltar este lançamento para "em aberto"?')) return;
      try { ok(await sb.from('lancamentos').update({ pago: false, data_pagamento: null, confirmado_por: null }).eq('id', l.id)); rota(); }
      catch (err) { toast(err.message, true); }
    } else if (t.dataset.editar) {
      formLancamento(clienteId, eqs, l);
    } else if (t.dataset.excluir) {
      if (!confirm('Excluir este lançamento?')) return;
      try { ok(await sb.from('lancamentos').delete().eq('id', l.id)); toast('Lançamento excluído.'); rota(); }
      catch (err) { toast(err.message, true); }
    }
  };
  document.getElementById('novoLanc').onclick = () => formLancamento(clienteId, eqs);
  document.getElementById('csv').onclick = () => exportarCSV([
    ['Vencimento', 'Tipo', 'Categoria', 'Descrição', 'Equipamento', 'Valor', 'Situação', 'Data pagamento'],
    ...filtrados().map(l => [dataBR(l.vencimento), l.tipo, CAT_NOME[l.categoria], l.descricao, l.equipamentos?.tag,
      Number(l.valor).toFixed(2).replace('.', ','), l.pago ? 'Pago' : (l.vencimento < h ? 'Vencido' : 'Em aberto'), l.pago ? dataBR(l.data_pagamento) : '']),
  ], `financeiro-${hoje()}.csv`);
}

function formLancamento(clienteId, eqs, l = null) {
  const v = l || { tipo: 'despesa', vencimento: hoje() };
  const catOpts = tipo => opcoes(Object.entries(CATEGORIAS[tipo]), v.categoria);
  const form = modal(l ? 'Editar lançamento' : 'Novo lançamento', `
    <div class="duas">
      <label>Tipo<select name="tipo" ${l?.locacao_id ? 'disabled' : ''}>${opcoes([['despesa', 'Despesa'], ['receita', 'Receita']], v.tipo)}</select></label>
      <label>Categoria<select name="categoria" ${l?.locacao_id ? 'disabled' : ''}>${catOpts(v.tipo)}</select></label>
    </div>
    ${campo('Descrição *', 'descricao', v.descricao, 'text', 'required placeholder="Ex.: Troca de cabo de aço"')}
    <div class="duas">
      <label>Equipamento<select name="equipamento_id"><option value="">— Geral —</option>${opcoes(eqs.map(e => [e.id, e.tag]), v.equipamento_id)}</select></label>
      ${campo('Valor (R$) *', 'valor', v.valor, 'number', 'step="0.01" min="0" required')}
      ${campo('Vencimento *', 'vencimento', v.vencimento, 'date', 'required')}
      ${campo('Data do pagamento', 'data_pagamento', v.data_pagamento, 'date')}
    </div>
    <label class="check"><input type="checkbox" name="pago" ${v.pago ? 'checked' : ''}> Já pago / recebido</label>`,
  async (f, d) => {
    const pago = !!d.pago;
    const dados = {
      descricao: d.descricao.trim(), equipamento_id: nz(d.equipamento_id), valor: Number(d.valor), vencimento: d.vencimento,
      pago, data_pagamento: pago ? (nz(d.data_pagamento) || hoje()) : null, confirmado_por: pago ? sessao.user.id : null,
    };
    if (!l?.locacao_id) { dados.tipo = d.tipo; dados.categoria = d.categoria; }
    if (l) ok(await sb.from('lancamentos').update(dados).eq('id', l.id));
    else ok(await sb.from('lancamentos').insert({ ...dados, cliente_id: clienteId }));
    toast('Lançamento salvo.'); rota();
  });
  form.elements.tipo.onchange = e => {
    form.elements.categoria.innerHTML = opcoes(Object.entries(CATEGORIAS[e.target.value]));
  };
}

/* ---------------------------------------------------------------------
   ADMINISTRAÇÃO (clientes e usuários)
   --------------------------------------------------------------------- */
async function telaAdmin() {
  const [clientes, perfis, eqs] = (await Promise.all([
    sb.from('clientes').select('*').order('nome'),
    sb.from('perfis').select('*').order('email'),
    sb.from('equipamentos').select('cliente_id'),
  ])).map(ok);
  const qtdEq = id => eqs.filter(e => e.cliente_id === id).length;

  app.innerHTML = `
  <div class="topo"><div><h2>Administração</h2><p class="mut">Clientes, usuários de acesso e equipamentos</p></div>
    <div class="acoes"><button class="btn" id="novoCli">+ Novo cliente</button><button class="btn sec" id="novoEq">+ Novo equipamento</button></div></div>

  <section class="card"><h3>Clientes (${clientes.length})</h3>
    ${clientes.length ? `<div class="rolagem"><table class="tabela">
      <thead><tr><th>Nome</th><th>CNPJ/CPF</th><th>Contato</th><th>Telefone</th><th>E-mail</th><th class="num">Equip.</th><th></th></tr></thead>
      <tbody>${clientes.map(c => `<tr><td><strong>${esc(c.nome)}</strong></td><td>${esc(c.documento || '—')}</td><td>${esc(c.contato || '—')}</td>
        <td>${esc(c.telefone || '—')}</td><td>${esc(c.email || '—')}</td><td class="num">${qtdEq(c.id)}</td>
        <td class="acoes-td"><button class="icone" data-edit-cli="${c.id}" title="Editar">✎</button><button class="icone" data-del-cli="${c.id}" title="Excluir">🗑</button></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="mut">Nenhum cliente cadastrado.</p>'}
  </section>

  <section class="card"><h3>Usuários de acesso</h3>
    <p class="mut" style="margin-bottom:12px">Para criar um login: Supabase → <strong>Authentication → Users → Add user</strong> (marque “Auto Confirm User”). O usuário aparece aqui; vincule-o à empresa e salve.</p>
    <div class="rolagem"><table class="tabela">
      <thead><tr><th>E-mail</th><th>Nome</th><th>Papel</th><th>Empresa</th><th></th></tr></thead>
      <tbody>${perfis.map(p => `<tr data-perfil="${p.id}">
        <td>${esc(p.email)}</td>
        <td><input data-campo="nome" value="${esc(p.nome)}" placeholder="Nome"></td>
        <td><select data-campo="papel" ${p.id === sessao.user.id ? 'disabled' : ''}>${opcoes([['cliente', 'Cliente'], ['admin', 'Administrador']], p.papel)}</select></td>
        <td><select data-campo="cliente_id"><option value="">— sem vínculo —</option>${opcoes(clientes.map(c => [c.id, c.nome]), p.cliente_id)}</select></td>
        <td class="acoes-td"><button class="btn pequeno" data-salvar-perfil="${p.id}">Salvar</button></td></tr>`).join('')}
      </tbody></table></div>
  </section>`;

  document.getElementById('novoCli').onclick = () => formCliente();
  document.getElementById('novoEq').onclick = () => formEquipamento();
  app.onclick = async e => {
    const t = e.target.closest('[data-edit-cli],[data-del-cli],[data-salvar-perfil]');
    if (!t) return;
    if (t.dataset.editCli) return formCliente(clientes.find(c => c.id === t.dataset.editCli));
    if (t.dataset.delCli) {
      const c = clientes.find(x => x.id === t.dataset.delCli);
      if (!confirm(`Excluir o cliente ${c.nome}? TODOS os equipamentos, documentos, locações e lançamentos dele serão apagados.`)) return;
      try {
        const [docs, fts] = (await Promise.all([
          sb.from('documentos').select('arquivo').eq('cliente_id', c.id),
          sb.from('equipamentos').select('foto_frente,foto_lateral').eq('cliente_id', c.id),
        ])).map(ok);
        ok(await sb.from('clientes').delete().eq('id', c.id));
        if (docs.length) await sb.storage.from('documentos').remove(docs.map(d => d.arquivo));
        const fotos = fts.flatMap(f => [f.foto_frente, f.foto_lateral]).filter(Boolean);
        if (fotos.length) await sb.storage.from('fotos').remove(fotos);
        toast('Cliente excluído.'); rota();
      } catch (err) { toast(err.message, true); }
      return;
    }
    if (t.dataset.salvarPerfil) {
      const tr = t.closest('tr'), val = n => tr.querySelector(`[data-campo="${n}"]`).value;
      const dados = { nome: nz(val('nome')), cliente_id: nz(val('cliente_id')) };
      if (t.dataset.salvarPerfil !== sessao.user.id) dados.papel = val('papel');
      try { ok(await sb.from('perfis').update(dados).eq('id', t.dataset.salvarPerfil)); toast('Usuário atualizado.'); await carregarPerfil(); renderNav('admin'); }
      catch (err) { toast(err.message, true); }
    }
  };
}

function formCliente(c = null) {
  const v = c || {};
  modal(c ? 'Editar cliente' : 'Novo cliente', `
    ${campo('Nome / razão social *', 'nome', v.nome, 'text', 'required')}
    <div class="duas">
      ${campo('CNPJ / CPF', 'documento', v.documento)}
      ${campo('Contato', 'contato', v.contato)}
      ${campo('Telefone', 'telefone', v.telefone, 'tel')}
      ${campo('E-mail', 'email', v.email, 'email')}
    </div>`,
  async (f, d) => {
    const dados = { nome: d.nome.trim(), documento: nz(d.documento), contato: nz(d.contato), telefone: nz(d.telefone), email: nz(d.email) };
    if (c) ok(await sb.from('clientes').update(dados).eq('id', c.id));
    else ok(await sb.from('clientes').insert(dados));
    toast('Cliente salvo.'); rota();
  });
}
