// Inicialização: login, primeiro acesso, troca de senha, navegação, assinaturas de dados e indicador de gravação.
import { $, $$, esc, S, MODS, can, isAdmin, store, toast, msgErro, modalAberto, hoje, formModal, pararControle } from './core.js';
import { rotas as rc } from './mod-controle.js';
import { rotas as rg } from './mod-gestao.js';
import { rotas as ra, PERFIS_PADRAO } from './mod-admin.js';
import { rotas as rf } from './mod-audit.js';
import { APP_VERSION } from './config.js';

const ROTAS = { ...rc, ...rf, ...rg, ...ra };
const ADMIN = [['usuarios', 'Usuários'], ['perfis', 'Perfis e permissões'], ['historico', 'Histórico de alterações'], ['sistema', 'Backup e sistema']];
const DEP = { empresas: ['empresas', 'carteiras', 'controle', 'simples', 'auditfiscal'], funcionarios: ['equipe', 'empresas', 'carteiras', 'controle', 'simples', 'demandas', 'auditfiscal'], processos: ['controle'], demandas: ['demandas'], ferramentas: ['ferramentas'] };
let refresh = null, iniciado = false, criando = false, unUser, unPerfil, perfilAtual, sujo = false, timer, acessoGravado = false;
const subs = new Map();

const tela = id => { for (const v of ['v-carrega', 'v-login', 'v-troca', 'v-app']) $('#' + v).hidden = v !== id; };
const erroEm = (sel, msg) => { $(sel).textContent = msg || ''; };

function pill(s) {
  const [t, c] = s.mode === 'local' ? ['Modo local (teste)', 'cinza'] : !s.online ? ['Sem internet · gravando neste aparelho', 'ouro'] : s.pending ? ['Sincronizando…', 'ouro'] : ['Tudo salvo na nuvem', 'verde'];
  const el = $('#sync'); el.textContent = t; el.className = 'pill ' + c;
}

// ---------- sessão ----------
function limpar() {
  unUser?.(); unPerfil?.(); unUser = unPerfil = perfilAtual = null; for (const u of subs.values()) u(); subs.clear(); pararControle();
  for (const k in S.data) S.data[k] = new Map(); S.user = S.perfil = null; S.config = {}; iniciado = acessoGravado = false; refresh = null;
}
async function sair(msg) {
  limpar(); tela('v-login'); erroEm('#e-login', msg);
  let sis; try { sis = await store.get('config', 'sistema'); } catch { sis = 'sem-rede'; }
  $('#f-primeiro').hidden = sis !== null; $('#f-login').hidden = sis === null;
}
const negar = msg => { criando = false; store.auth.signOut().then(() => erroEm('#e-login', msg)); };

function entrar(u) {
  unUser?.(); tela(iniciado ? 'v-app' : 'v-carrega');
  setTimeout(() => { if (!S.user && !$('#v-carrega').hidden) { $('#v-carrega p').innerHTML = 'Sem internet e sem dados guardados neste aparelho ainda.<br>Conecte-se para o primeiro acesso. <button class="link" style="color:#d9b676" id="c-sair">Voltar ao login</button>'; $('#c-sair').onclick = () => store.auth.signOut(); } }, 10000);
  unUser = store.watchDoc('usuarios', u.uid, (doc, err, meta) => {
    if (!doc) { if (criando || meta?.cache) return; return negar(err ? 'Não foi possível verificar o seu acesso. Confira a internet e tente de novo.' : 'Seu acesso ainda não foi liberado pelo administrador.'); }
    if (doc.ativo === false) return negar('Seu usuário está desativado. Fale com o administrador.');
    criando = false; S.user = { uid: u.uid, email: u.email, ...doc };
    if (doc.trocarSenha) return tela('v-troca');
    if (doc.perfil === 'admin') { unPerfil?.(); unPerfil = perfilAtual = null; S.perfil = null; return iniciar(); }
    if (perfilAtual === doc.perfil) return iniciar();
    unPerfil?.(); perfilAtual = doc.perfil; unPerfil = store.watchDoc('perfis', doc.perfil, p => { S.perfil = p || { perms: {} }; iniciar(); });
  });
}

function assinar() {
  const quer = new Set(Object.entries(DEP).filter(([, mods]) => isAdmin() || mods.some(m => can(m))).map(([c]) => c));
  if (isAdmin()) { quer.add('usuarios'); quer.add('perfis'); }
  for (const [c, u] of subs) if (c !== 'config' && !quer.has(c)) { u(); subs.delete(c); S.data[c] = new Map(); }
  for (const c of quer) if (!subs.has(c)) subs.set(c, store.watch(c, m => { S.data[c] = m; document.dispatchEvent(new CustomEvent('dados', { detail: c })); }));
  if (!subs.has('config')) subs.set('config', store.watchDoc('config', 'geral', d => { S.config = d || {}; document.dispatchEvent(new CustomEvent('dados', { detail: 'config' })); }));
}

function iniciar() {
  assinar(); nav();
  $('#u-nome').textContent = S.user.nome || S.user.email; $('#u-perfil').textContent = isAdmin() ? 'Administrador' : (S.perfil?.nome || '');
  if (!acessoGravado) { acessoGravado = true; store.set('usuarios', S.user.uid, { ultimoAcesso: new Date().toISOString() }, true); }
  if (!iniciado) {
    iniciado = true; tela('v-app'); rota();
    const ub = localStorage.getItem('attiva.ultimoBackup');
    if (isAdmin() && store.status.mode === 'nuvem' && (!ub || (new Date(hoje()) - new Date(ub)) / 864e5 > 7)) setTimeout(() => toast('Faz mais de 7 dias sem backup baixado. Vá em Administração › Backup e sistema.', 'aviso'), 2500);
  } else if (!modalAberto()) rota();
}

// ---------- navegação ----------
function nav() {
  const link = (id, t) => `<a href="#${id}" data-r="${id}">${esc(t)}</a>`; let h = link('painel', 'Painel'), g = '';
  for (const m of MODS) { if (!can(m.id)) continue; if (m.grupo !== g) { g = m.grupo; h += `<h4>${g}</h4>`; } h += link(m.id, m.nome); }
  if (isAdmin()) h += '<h4>ADMINISTRAÇÃO</h4>' + ADMIN.map(([id, t]) => link(id, t)).join('');
  $('#menu').innerHTML = h; marcar();
}
const rotaAtual = () => location.hash.slice(1) || 'painel';
const marcar = () => $$('#menu a').forEach(a => a.classList.toggle('on', a.dataset.r === rotaAtual()));
function rota() {
  if (!iniciado) return; const id = rotaAtual(), r = ROTAS[id];
  if (!r || !(id === 'painel' || (r.admin ? isAdmin() : can(id)))) { if (id !== 'painel') location.hash = 'painel'; return; }
  $('.g-pop')?.remove(); document.body.classList.remove('nav-aberta'); $('#titulo').textContent = r.titulo; marcar();
  const main = $('#main'); main.innerHTML = ''; main.scrollTop = 0;
  try { refresh = r.render(main); } catch (e) { console.error(e); main.innerHTML = `<p class="vazio">Não foi possível abrir esta tela: ${esc(msgErro(e))}</p>`; refresh = null; }
}
addEventListener('hashchange', rota);
document.addEventListener('dados', () => { clearTimeout(timer); timer = setTimeout(() => { if (!iniciado) return; if (modalAberto()) { sujo = true; return; } try { refresh?.(); } catch (e) { console.error(e); } }, 120); });
document.addEventListener('modal-fechou', () => { if (sujo && !modalAberto()) { sujo = false; try { refresh?.(); } catch (e) { console.error(e); } } });

// ---------- formulários de acesso ----------
const val = (f, n) => f.elements[n].value;
$('#f-login').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target, b = $('button[type=submit]', f); erroEm('#e-login'); b.disabled = true;
  try { await store.auth.signIn(val(f, 'email').trim(), val(f, 'senha')); f.elements.senha.value = ''; } catch (err) { erroEm('#e-login', msgErro(err)); }
  b.disabled = false;
});
$('#esqueci').addEventListener('click', async () => {
  const email = $('#f-login').elements.email.value.trim(); if (!email) return erroEm('#e-login', 'Digite o seu e-mail acima e clique de novo em “Esqueci minha senha”.');
  try { await store.auth.reset(email); erroEm('#e-login', 'Enviamos um e-mail com o link para criar uma nova senha.'); } catch (err) { erroEm('#e-login', msgErro(err)); }
});
$('#f-primeiro').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target, b = $('button[type=submit]', f); erroEm('#e-login');
  if (val(f, 'senha') !== val(f, 'senha2')) return erroEm('#e-login', 'As senhas não conferem.');
  b.disabled = true; criando = true;
  try {
    const email = val(f, 'email').trim().toLowerCase(), uid = await store.auth.signUp(email, val(f, 'senha'));
    store.write([{ t: 'set', col: 'usuarios', id: uid, data: { nome: val(f, 'nome').trim(), email, perfil: 'admin', ativo: true, criadoEm: hoje() } }, { t: 'set', col: 'config', id: 'sistema', data: { criadoEm: new Date().toISOString(), versao: APP_VERSION } }]);
    store.write(Object.entries(PERFIS_PADRAO).map(([id, data]) => ({ t: 'set', col: 'perfis', id, data })));
    f.reset();
  } catch (err) { criando = false; erroEm('#e-login', msgErro(err)); }
  b.disabled = false;
});
$('#f-troca').addEventListener('submit', async e => {
  e.preventDefault(); const f = e.target, b = $('button[type=submit]', f); erroEm('#e-troca');
  if (val(f, 'nova') !== val(f, 'nova2')) return erroEm('#e-troca', 'As senhas novas não conferem.');
  if (val(f, 'nova') === val(f, 'atual')) return erroEm('#e-troca', 'A nova senha precisa ser diferente da provisória.');
  b.disabled = true;
  try { await store.auth.changePassword(val(f, 'atual'), val(f, 'nova')); store.set('usuarios', S.user.uid, { trocarSenha: false }, true); f.reset(); } catch (err) { erroEm('#e-troca', msgErro(err)); }
  b.disabled = false;
});
$('#troca-sair').addEventListener('click', () => store.auth.signOut());
$('#b-sair').addEventListener('click', () => store.auth.signOut());
$('#b-senha').addEventListener('click', () => formModal({
  titulo: 'Trocar senha', largo: false, salvar: 'Trocar senha',
  campos: [{ k: 'atual', label: 'Senha atual', type: 'password', req: true }, { k: 'nova', label: 'Nova senha', type: 'password', req: true }, { k: 'nova2', label: 'Repita a nova senha', type: 'password', req: true }],
  onSave: async v => { if (v.nova !== v.nova2) return 'As senhas novas não conferem.'; try { await store.auth.changePassword(v.atual, v.nova); toast('Senha alterada.'); } catch (e) { return msgErro(e); } },
}));
$('#b-menu').addEventListener('click', () => document.body.classList.toggle('nav-aberta'));

// ---------- partida ----------
(async () => {
  try { await store.init(); } catch (e) { console.error(e); $('#v-carrega').innerHTML = `<p class="vazio">Não foi possível iniciar o aplicativo: ${esc(msgErro(e))}</p>`; return; }
  $('#versao').textContent = 'v' + APP_VERSION; $('#modo-local').hidden = store.status.mode !== 'local';
  store.onStatus(pill);
  store.onError(e => { console.warn(e); toast(e?.code === 'permission-denied' ? 'Alteração recusada pelo servidor: sem permissão.' : 'Erro ao gravar: ' + msgErro(e), 'erro'); });
  store.auth.onChange(u => u ? entrar(u) : sair());
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
