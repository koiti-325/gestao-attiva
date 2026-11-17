// ADMINISTRAÇÃO: Usuários, Perfis e permissões, Auditoria, Sistema (backup, restauração, configurações).
import { $, $$, esc, S, MODS, ACAO_NOME, idxPerms, store, fmt, hoje, funcNome, funcsAtivos, grupos, GRUPOS_PADRAO, gravar, excluir, audit, toast, modal, confirmar, formModal, msgErro, baixarJson } from './core.js';
import { Grid } from './grid.js';
import { APP_VERSION } from './config.js';

const grids = {};
const semId = ({ id, ...e }) => e;
const perfisOpt = () => [{ v: 'admin', t: 'Administrador (acesso total)' }, ...[...S.data.perfis].map(([id, p]) => ({ v: id, t: p.nome }))];
const perfilNome = id => id === 'admin' ? 'Administrador' : S.data.perfis.get(id)?.nome || '(perfil removido)';
const senhaProv = () => { const c = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'; return [...crypto.getRandomValues(new Uint8Array(10))].map(b => c[b % c.length]).join(''); };

// ================= USUÁRIOS =================
function novoUsuario() {
  formModal({
    titulo: 'Novo usuário', salvar: 'Criar login', valores: { senha: senhaProv() },
    campos: [{ k: 'nome', label: 'Nome', req: true }, { k: 'email', label: 'E-mail (será o login)', type: 'email', req: true }, { k: 'perfil', label: 'Perfil de acesso', type: 'select', vazio: false, options: perfisOpt(), req: true },
      { k: 'funcId', label: 'Colaborador vinculado', type: 'select', options: funcsAtivos() }, { k: 'senha', label: 'Senha provisória', req: true, ajuda: 'A pessoa é obrigada a trocar no primeiro acesso.' }],
    onSave: async v => {
      if (v.senha.length < 6) return 'A senha precisa ter pelo menos 6 caracteres.';
      let uid; try { uid = await store.auth.createUser(v.email, v.senha); } catch (e) { return msgErro(e); }
      const email = v.email.trim().toLowerCase();
      gravar('usuarios', uid, { nome: v.nome, email, perfil: v.perfil, funcId: v.funcId || '', ativo: true, trocarSenha: true, criadoEm: hoje() }, `Usuário ${v.nome}`);
      setTimeout(() => modal({ titulo: 'Login criado', html: `<p>Envie estes dados para <b>${esc(v.nome)}</b>:</p><div class="cred"><div>Login: <b>${esc(email)}</b></div><div>Senha provisória: <b>${esc(v.senha)}</b></div></div><p class="dica">A senha provisória não fica guardada em lugar nenhum. Anote agora.</p>`, botoes: [{ t: 'Copiar', on: () => { navigator.clipboard?.writeText(`Login: ${email}\nSenha provisória: ${v.senha}`); toast('Copiado.'); return false; } }, { t: 'Fechar', cls: 'pri' }] }), 50);
    },
  });
}
function editarUsuario(u) {
  const eu = u.id === S.user.uid;
  const m = formModal({
    titulo: u.nome, valores: { ...u, ativo: u.ativo !== false },
    campos: [{ k: 'nome', label: 'Nome', req: true }, { k: 'perfil', label: 'Perfil de acesso', type: 'select', vazio: false, options: perfisOpt() }, { k: 'funcId', label: 'Colaborador vinculado', type: 'select', options: funcsAtivos() }, { k: 'ativo', label: 'Acesso', type: 'check', rot: 'Usuário ativo (pode entrar)' }],
    extra: `<p class="dica">Login: <b>${esc(u.email)}</b></p><p><button type="button" class="btn mini" data-reset>Enviar e-mail de redefinição de senha</button> ${eu ? '' : '<button type="button" class="btn perigo mini" data-del>Remover acesso definitivamente</button>'}</p>`,
    onSave: v => {
      if (eu && (!v.ativo || v.perfil !== 'admin')) return 'Você não pode desativar nem rebaixar o seu próprio usuário.';
      gravar('usuarios', u.id, { ...semId(u), ...v }, `Usuário ${v.nome}`);
    },
  });
  $('[data-reset]', m.el).onclick = async () => { try { await store.auth.reset(u.email); toast('E-mail de redefinição enviado para ' + u.email); } catch (e) { toast(msgErro(e), 'erro'); } };
  $('[data-del]', m.el)?.addEventListener('click', async () => { if (await confirmar(`Remover o acesso de ${u.nome}? A pessoa não consegue mais entrar.`, 'Remover')) { excluir('usuarios', u.id, `Usuário ${u.nome}`); m.close(); } });
}
function rUsuarios(el) {
  const g = grids.us ||= new Grid({
    titulo: 'Usuários', rows: () => [...S.data.usuarios].map(([id, u]) => ({ id, ...u })), onRow: editarUsuario, rowCls: u => u.ativo === false ? 'inativo' : '',
    cols: [{ key: 'nome', label: 'Nome', w: 200, html: u => `<b>${esc(u.nome)}</b>${u.id === S.user.uid ? ' <span class="tag ouro">você</span>' : ''}` }, { key: 'email', label: 'Login (e-mail)', w: 220 }, { key: 'perfil', label: 'Perfil', get: u => perfilNome(u.perfil) }, { key: 'func', label: 'Colaborador', get: u => funcNome(u.funcId) },
      { key: 'ativo', label: 'Situação', get: u => u.ativo === false ? 'Desativado' : u.trocarSenha ? 'Aguardando 1º acesso' : 'Ativo', html: u => `<span class="chip ${u.ativo === false ? 'verm' : u.trocarSenha ? 'ouro' : 'verde'}">${u.ativo === false ? 'Desativado' : u.trocarSenha ? 'Aguardando 1º acesso' : 'Ativo'}</span>` }, { key: 'ult', label: 'Último acesso', get: u => fmt.hora(u.ultimoAcesso), sort: u => u.ultimoAcesso || '' }],
    acoes: [{ t: '+ Novo usuário', cls: 'pri', on: novoUsuario }],
  });
  el.innerHTML = '<p class="dica">Cada pessoa entra com o próprio e-mail e senha. O perfil define o que ela enxerga e o que pode alterar. Desativar bloqueia o acesso na hora.</p><div class="gr"></div>'; g.mount($('.gr', el)); return () => g.refresh();
}

// ================= PERFIS E PERMISSÕES =================
const comIdx = p => ({ ...p, idx: idxPerms(p.perms) });
export const PERFIS_PADRAO = {
  funcionario: comIdx({ nome: 'Funcionário · Ferramentas', perms: { ferramentas: { ver: true } } }),
  analista: comIdx({ nome: 'Analista · marca as próprias obrigações', perms: { ferramentas: { ver: true }, controle: { ver: true, editar: true } } }),
  lider: comIdx({ nome: 'Líder de squad · confere', perms: { ferramentas: { ver: true }, controle: { ver: true, editar: true, conferir: true, exportar: true }, auditfiscal: { ver: true, editar: true, exportar: true }, empresas: { ver: true }, carteiras: { ver: true, exportar: true } } }),
};
function rPerfis(el) {
  const desenha = () => {
    const ps = [...S.data.perfis].sort((a, b) => a[1].nome.localeCompare(b[1].nome));
    el.innerHTML = `<div class="g-bar"><span class="dica">O Administrador tem acesso total e é o único que entra em Administração. Para os demais, marque o que cada perfil pode fazer.</span><div class="g-acoes"><button class="btn pri" data-novo>+ Novo perfil</button></div></div>
      ${ps.map(([id, p]) => { const n = [...S.data.usuarios.values()].filter(u => u.perfil === id).length; return `<section class="bloco perfil" data-id="${esc(id)}"><div class="perfil-h"><input class="perfil-n" value="${esc(p.nome)}" aria-label="Nome do perfil"><span class="dica">${n} usuário(s)</span><span class="esp"></span><button class="btn mini pri" data-sv>Salvar</button><button class="btn mini perigo" data-rm ${n ? 'disabled title="Há usuários neste perfil"' : ''}>Excluir</button></div>
        <div class="g-wrap"><table class="g perms"><thead><tr><th>Módulo</th>${Object.values(ACAO_NOME).map(a => `<th class="c">${a}</th>`).join('')}</tr></thead><tbody>${MODS.map(m => `<tr><td><small>${m.grupo}</small> ${esc(m.nome)}</td>${Object.keys(ACAO_NOME).map(a => `<td class="c">${m.acoes.includes(a) ? `<input type="checkbox" data-m="${m.id}" data-a="${a}" ${p.perms?.[m.id]?.[a] ? 'checked' : ''} aria-label="${esc(m.nome)}: ${ACAO_NOME[a]}">` : ''}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`; }).join('') || '<p class="vazio">Nenhum perfil criado.</p>'}`;
    $('[data-novo]', el).onclick = () => formModal({ titulo: 'Novo perfil', largo: false, campos: [{ k: 'nome', label: 'Nome do perfil', req: true }], onSave: v => gravar('perfis', store.newId(), comIdx({ nome: v.nome, perms: { ferramentas: { ver: true } } }), `Perfil ${v.nome}`) });
    $$('.perfil', el).forEach(sec => {
      const id = sec.dataset.id;
      // quem pode alterar/incluir/excluir precisa poder ver
      sec.addEventListener('change', e => { const c = e.target; if (!c.dataset.m) return; const ver = $(`[data-m="${c.dataset.m}"][data-a="ver"]`, sec); if (c.dataset.a !== 'ver' && c.checked) ver.checked = true; if (c.dataset.a === 'ver' && !c.checked) $$(`[data-m="${c.dataset.m}"]`, sec).forEach(x => x.checked = false); });
      $('[data-sv]', sec).onclick = () => { const perms = {}; $$('[data-m]:checked', sec).forEach(c => (perms[c.dataset.m] ||= {})[c.dataset.a] = true); const nome = $('.perfil-n', sec).value.trim() || 'Perfil'; gravar('perfis', id, comIdx({ nome, perms }), `Perfil ${nome}`); toast('Perfil salvo. Vale na hora para quem está conectado.'); };
      $('[data-rm]', sec).onclick = async () => { if (await confirmar('Excluir este perfil?', 'Excluir')) excluir('perfis', id, 'Perfil ' + S.data.perfis.get(id)?.nome); };
    });
  };
  desenha(); return () => { if (!el.contains(document.activeElement) || document.activeElement.tagName !== 'INPUT') desenha(); };
}

// ================= AUDITORIA =================
const COL_NOME = { auditorias: 'Auditoria XML × EFD', empresas: 'Empresas', funcionarios: 'Equipe', processos: 'Obrigações', controle: 'Controle', demandas: 'Demandas', ferramentas: 'Ferramentas', usuarios: 'Usuários', perfis: 'Perfis', config: 'Configurações', sistema: 'Sistema' };
function rAuditoria(el) {
  let linhas = [];
  const detalhe = a => {
    let antes = null; try { antes = a.antes ? JSON.parse(a.antes) : null; } catch {}
    const alt = a.acao === 'Alterou' && antes, exc = a.acao === 'Excluiu' && antes;
    modal({
      titulo: `${a.acao} · ${COL_NOME[a.col] || a.col}`, largo: true,
      html: `<p><b>${esc(a.nome)}</b> em ${fmt.hora(a.ts)} — ${esc(a.resumo)}</p>${alt ? `<div class="g-wrap"><table class="g"><thead><tr><th>Campo</th><th>Antes</th><th>Depois</th></tr></thead><tbody>${Object.entries(antes).map(([k, [x, y]]) => `<tr><td>${esc(k)}</td><td>${esc(typeof x === 'object' ? JSON.stringify(x) : x)}</td><td>${esc(typeof y === 'object' ? JSON.stringify(y) : y)}</td></tr>`).join('')}</tbody></table></div>` : exc ? `<pre class="pre">${esc(JSON.stringify(antes, null, 1))}</pre>` : ''}`,
      botoes: [{ t: 'Fechar' }, ...(exc ? [{ t: 'Restaurar registro', cls: 'pri', on: () => { store.set(a.col, a.id, antes); audit('Restaurou', a.col, a.id, a.resumo); toast('Registro restaurado.'); } }] : []),
        ...(alt && S.data[a.col]?.has(a.id) ? [{ t: 'Desfazer esta alteração', cls: 'pri', on: () => { const d = { ...S.data[a.col].get(a.id) }; for (const [k, [x]] of Object.entries(antes)) { if (x === null) delete d[k]; else d[k] = x; } gravar(a.col, a.id, d, 'Desfez: ' + a.resumo); toast('Alteração desfeita.'); } }] : [])],
    });
  };
  const g = new Grid({
    titulo: 'Histórico de alterações', rows: () => linhas, onRow: detalhe, exportar: true, vazio: 'Carregando…',
    cols: [{ key: 'ts', label: 'Data e hora', get: a => fmt.hora(a.ts), sort: a => a.ts, w: 140 }, { key: 'nome', label: 'Usuário' }, { key: 'acao', label: 'Ação', html: a => `<span class="chip ${a.acao === 'Excluiu' ? 'verm' : a.acao === 'Incluiu' ? 'verde' : a.acao === 'Lote' ? 'ouro' : 'cinza'}">${esc(a.acao)}</span>` }, { key: 'col', label: 'Onde', get: a => COL_NOME[a.col] || a.col }, { key: 'resumo', label: 'O quê', w: 360 }],
    acoes: [{ t: 'Atualizar', on: () => carregar() }],
  });
  const carregar = async () => { try { linhas = await store.list('auditoria', { orderBy: 'ts', desc: true, limit: 500 }); g.o.vazio = 'Nenhum registro.'; } catch (e) { g.o.vazio = 'Não foi possível carregar agora: ' + msgErro(e); } g.refresh(); };
  el.innerHTML = '<p class="dica">Últimas 500 ações: quem fez, quando e o quê. Abra um registro para ver o antes e depois, desfazer uma alteração ou restaurar algo excluído.</p><div class="gr"></div>'; g.mount($('.gr', el)); carregar(); return null;
}

// ================= SISTEMA =================
const COLS_BKP = ['empresas', 'funcionarios', 'processos', 'demandas', 'ferramentas', 'usuarios', 'perfis'];
export async function fazerBackup() {
  const b = { app: 'gestao-attiva', versao: APP_VERSION, geradoEm: new Date().toISOString(), por: S.user.nome, dados: {} };
  for (const c of COLS_BKP) b.dados[c] = Object.fromEntries(S.data[c]);
  try { b.dados.controle = Object.fromEntries((await store.list('controle')).map(({ id, ...d }) => [id, d])); } catch { b.dados.controle = Object.fromEntries(S.data.controle); b.aviso = 'Controle: só a competência aberta (sem internet no momento do backup).'; }
  b.dados.config = { geral: S.config };
  baixarJson(b, `backup-gestao-attiva-${hoje()}.json`); localStorage.setItem('attiva.ultimoBackup', hoje()); audit('Backup', 'sistema', '', 'Backup completo baixado');
}
function restaurar() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json';
  inp.onchange = async () => {
    try {
      const b = JSON.parse(await inp.files[0].text()); if (b.app !== 'gestao-attiva' || !b.dados) throw new Error('Este arquivo não é um backup da Gestão Attiva.');
      const n = Object.entries(b.dados).filter(([c]) => c !== 'usuarios').reduce((s, [, d]) => s + Object.keys(d).length, 0);
      if (!await confirmar(`Restaurar o backup de ${fmt.hora(b.geradoEm)} (${n} registros)? Os registros do backup substituem os atuais com o mesmo identificador; o que foi criado depois continua. Usuários e senhas não são alterados.`, 'Restaurar')) return;
      const ops = []; for (const [c, d] of Object.entries(b.dados)) { if (c === 'usuarios') continue; for (const [id, data] of Object.entries(d)) ops.push({ t: 'set', col: c, id, data }); }
      store.write(ops); audit('Restaurou', 'sistema', '', `Backup de ${fmt.hora(b.geradoEm)} restaurado (${n} registros)`); toast(`${n} registros restaurados.`);
    } catch (e) { toast(msgErro(e), 'erro'); }
  };
  inp.click();
}
// Traz os dados do artefato antigo (arquivo gerado pelo botão "Backup para o novo site")
function migrarAntiga(b) {
  if (b.app !== 'gestao-attiva-antiga' || !b.clientes) throw new Error('Este não é o backup da Gestão Attiva antiga.');
  const ops = [], TIPO = { 'PRESTADORA': 'Prestadora', 'SERVIÇO': 'Serviço', 'COMÉRCIO': 'Comércio', 'COMÉRCIO/SERVIÇO': 'Comércio/Serviço' };
  for (const [id, c] of Object.entries(b.clientes)) {
    const e = { ...c, plan: { ...(c.plan || {}) } }, z = b.zeramento?.[id], x = b.exclusao?.[id];
    if (e.area !== 'Fiscal' && e.area !== 'Planejamento') { e.areaAntiga = e.area || ''; e.area = ''; }
    e.resp = Object.fromEntries(Object.entries(e.resp || {}).filter(([k, v]) => v && k === e.area));
    if (z) { if (z.ultZerado) e.plan.zerAte = z.ultZerado; if (z.zerObs) e.plan.zerObs = z.zerObs; }
    if (x) { e.plan.exc = x; e.plan.excObs = [x.excStatus, x.excDecisao, x.excResultado, x.excObs].filter(Boolean).join(' · '); if (!e.plan.meta && x.excMes) e.plan.meta = x.excMes; }
    if (e.nivel && e.nivel.n != null) e.dificuldade = e.nivel.n;
    if (TIPO[e.segmento]) e.tipo = TIPO[e.segmento];
    if (!e.status) e.status = 'Ativo';
    ops.push({ t: 'set', col: 'empresas', id, data: e });
  }
  for (const [id, f] of Object.entries(b.funcionarios || {})) ops.push({ t: 'set', col: 'funcionarios', id, data: { vinculo: 'CLT', ...f } });
  if (b.config && Object.keys(b.config).length) ops.push({ t: 'set', col: 'config', id: 'antiga', data: b.config });
  store.write(ops); audit('Lote', 'sistema', '', `Migração da Gestão Attiva antiga: ${Object.keys(b.clientes).length} empresas, ${Object.keys(b.funcionarios || {}).length} colaboradores`);
  return `${Object.keys(b.clientes).length} empresas e ${Object.keys(b.funcionarios || {}).length} colaboradores trazidos do artefato antigo.`;
}
function importarAntiga() {
  const m = modal({
    titulo: 'Trazer dados da Gestão Attiva antiga', largo: true,
    html: `<p>No artefato antigo, clique em <b>“Backup para o novo site”</b> (canto inferior direito). Ele salva o arquivo <b>backup-gestao-attiva-antiga.json</b> e também deixa copiar o conteúdo.</p><p><button type="button" class="btn pri" data-arq>Escolher o arquivo .json</button></p><p class="dica">Ou cole aqui o conteúdo copiado:</p><textarea rows="6" style="width:100%" aria-label="Conteúdo do backup"></textarea><p class="dica">Registros com o mesmo CNPJ são substituídos pelos do artefato antigo.</p>`,
    botoes: [{ t: 'Cancelar' }, { t: 'Importar o texto colado', cls: 'pri', on: bg => { const t = $('textarea', bg).value.trim(); if (!t) { toast('Cole o conteúdo ou escolha o arquivo.', 'erro'); return false; } toast(migrarAntiga(JSON.parse(t))); } }],
  });
  $('[data-arq]', m.el).onclick = () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json'; inp.onchange = async () => { try { toast(migrarAntiga(JSON.parse(await inp.files[0].text()))); m.close(); } catch (e) { toast(msgErro(e), 'erro'); } }; inp.click(); };
}
function rSistema(el) {
  const desenha = () => {
    const ub = localStorage.getItem('attiva.ultimoBackup'), p = S.config.pesos || [1, 15, 25, 37], nuvem = store.status.mode === 'nuvem';
    el.innerHTML = `<section class="bloco"><h3 class="sec">ONDE OS DADOS ESTÃO</h3>
      <p>${nuvem ? 'Cada alteração é gravada <b>na hora neste aparelho</b> e enviada para a <b>nuvem (Firebase)</b>. Sem internet, o aplicativo continua abrindo e gravando; ao reconectar, tudo é sincronizado sozinho. O indicador no topo mostra a situação.' : '<b>Modo local:</b> os dados estão só neste navegador, para testes. Conecte o Firebase (arquivo js/config.js) para ter login real, nuvem e sincronização entre aparelhos.'}</p>
      <p class="dica">Versão ${APP_VERSION} · ${S.data.empresas.size} empresas · ${S.data.funcionarios.size} colaboradores · ${S.data.usuarios.size} usuários</p></section>
      <section class="bloco"><h3 class="sec">BACKUP</h3><p>Último backup baixado neste aparelho: <b>${ub ? fmt.data(ub) : 'nunca'}</b>. O backup é um arquivo único com todos os cadastros e o histórico de controle.</p>
      <p><button class="btn pri" data-bkp>Baixar backup completo</button> <button class="btn" data-rest>Restaurar de um backup…</button> <button class="btn" data-ant>Trazer dados da Gestão Attiva antiga…</button></p></section>
      <section class="bloco"><h3 class="sec">CONFIGURAÇÕES</h3><div class="form"><div class="campo full"><label for="cfg-g">Grupos (um por linha)</label><textarea id="cfg-g" rows="6">${esc((S.config.grupos || GRUPOS_PADRAO).join('\n'))}</textarea><small>Grupos em uso hoje: ${esc(grupos().join(' · '))}</small></div>
      ${[0, 1, 2, 3].map(i => `<div class="campo"><label for="cfg-p${i}">Carga · dificuldade ${i} (em prestadoras)</label><input id="cfg-p${i}" type="number" min="0" value="${p[i]}"></div>`).join('')}</div><p><button class="btn pri" data-cfg>Salvar configurações</button></p></section>`;
    $('[data-bkp]', el).onclick = () => fazerBackup().then(() => { toast('Backup baixado.'); desenha(); }).catch(e => toast(msgErro(e), 'erro'));
    $('[data-rest]', el).onclick = restaurar; $('[data-ant]', el).onclick = importarAntiga;
    $('[data-cfg]', el).onclick = () => { const cfg = { ...S.config, grupos: $('#cfg-g', el).value.split('\n').map(s => s.trim()).filter(Boolean), pesos: [0, 1, 2, 3].map(i => +$('#cfg-p' + i, el).value || 0) }; store.set('config', 'geral', cfg); audit('Alterou', 'config', 'geral', 'Configurações'); toast('Configurações salvas.'); };
  };
  desenha(); return () => { if (!el.contains(document.activeElement) || !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) desenha(); };
}

export const rotas = {
  usuarios: { titulo: 'Usuários', render: rUsuarios, admin: true }, perfis: { titulo: 'Perfis e permissões', render: rPerfis, admin: true },
  historico: { titulo: 'Histórico de alterações', render: rAuditoria, admin: true }, sistema: { titulo: 'Backup e sistema', render: rSistema, admin: true },
};
