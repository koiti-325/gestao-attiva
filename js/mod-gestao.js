// GESTÃO: Empresas, Carteiras, Equipe e Férias, Ferramentas.
import { ativa, situacao, saiu, compAtual, $, $$, esc, norm, digits, S, can, isAdmin, store, fmt, hoje, parseData, addAnos, addDias, diasAte, funcNome, respId, respNome, tipoRegime, pendencia, ajustarEmpresa, grupos, opcoes, funcsAtivos, gravar, excluir, gravarLote, toast, modal, confirmar, formModal, campoHtml, lerForm, xlsxAttiva, importarPlanilha, abas, quadro } from './core.js';
import { Grid } from './grid.js';

const st = { empresas: {}, equipe: {}, carteiras: {} }, grids = {};
const emps = () => [...S.data.empresas].map(([id, e]) => ({ id, ...e }));
const REGIMES = ['Simples Nacional', 'Lucro Presumido', 'Lucro Real'], TIPOS = ['Prestadora', 'Serviço', 'Comércio', 'Comércio/Serviço'];
const semId = ({ id, ...e }) => e;

// ================= EMPRESAS =================
const camposEmp = () => [
  { k: 'razao', label: 'Razão social', req: true, full: true }, { k: 'cnpj', label: 'CNPJ / CPF', req: true }, { k: 'ie', label: 'I.E.' }, { k: 'uf', label: 'UF' },
  { k: 'regime', label: 'Regime tributário', type: 'select', options: REGIMES }, { k: 'area', label: 'Área', type: 'select', options: ['Fiscal', 'Planejamento'], ajuda: 'Fiscal = Rotina. Planejamento não tem grupo.' },
  { k: 'grupo', label: 'Grupo', type: 'select', options: grupos() }, { k: 'respF', label: 'Responsável', type: 'select', options: funcsAtivos(), ajuda: 'Sem área ou sem grupo = sem responsável.' },
  { k: 'segmento', label: 'Segmento' }, { k: 'tipo', label: 'Tipo (Simples)', type: 'select', options: TIPOS }, { k: 'dificuldade', label: 'Grau de dificuldade', type: 'select', options: [{ v: 0, t: '0 · Fácil (sem compra/venda)' }, { v: 1, t: '1 · Média (vendas até 100 mil)' }, { v: 2, t: '2 · Difícil (até 200 mil)' }, { v: 3, t: '3 · Muito difícil (acima de 200 mil)' }] },
  { k: 'prioritario', label: 'Prioridade do financeiro', type: 'check', rot: 'Empresa prioritária' }, { k: 'ci', label: 'Nº C.I.' }, { k: 'ciData', label: 'Data ativação C.I.', type: 'date' },
  { k: 'contrato', label: 'Data do contrato', type: 'date' }, { k: 'respTec', label: 'Resp. técnica / Repasse', type: 'date' }, { k: 'cumulatividade', label: 'Cumulatividade' },
  { k: 'snSit', label: 'Situação Simples Nacional', type: 'select', options: ['Optante', 'Não optante', 'Excluída'] }, { k: 'snTxt', label: 'Detalhe da situação SN' }, { k: 'snConsulta', label: 'Consulta SN em', type: 'date' },
  { k: 'status', label: 'Status', type: 'select', vazio: false, options: ['Ativo', 'Inativo'] }, { k: 'saidaUlt', label: 'Saída · última competência da Attiva', type: 'month', ajuda: 'Preencha quando o cliente sair. Depois dessa competência a empresa sai do controle.' }, { k: 'saidaCom', label: 'Saída · comunicada em', type: 'date' }, { k: 'saidaCi', label: 'Saída · Nº C.I. de inativação' }, { k: 'saidaMot', label: 'Saída · motivo / nova contabilidade', type: 'textarea', full: true }, { k: 'obs', label: 'Observação', type: 'textarea', full: true },
];
function editarEmpresa(e) {
  const novo = !e, pode = can('empresas', novo ? 'criar' : 'editar');
  const v = e ? { ...e, respF: respId(e), snSit: e.sn?.sit, snTxt: e.sn?.txt, snConsulta: e.sn?.consultaEm, saidaUlt: e.saida?.ultComp, saidaCom: e.saida?.comunicadoEm, saidaCi: e.saida?.ci, saidaMot: e.saida?.motivo } : { status: 'Ativo', uf: 'GO' };
  const m = formModal({
    titulo: novo ? 'Nova empresa' : e.razao, campos: camposEmp(), valores: v, salvar: pode ? 'Salvar' : 'Fechar',
    extra: !novo && can('empresas', 'excluir') ? '<p><button type="button" class="btn perigo mini" data-del>Excluir empresa</button></p>' : '',
    onSave: f => {
      if (!pode) return;
      const id = novo ? digits(f.cnpj) || store.newId() : e.id;
      if (novo && S.data.empresas.has(id)) return 'Já existe uma empresa com este CNPJ.';
      const { respF, snSit, snTxt, snConsulta, saidaUlt, saidaCom, saidaCi, saidaMot, ...d } = f;
      const doc = ajustarEmpresa({ ...(e ? semId(e) : { criadoEm: hoje() }), ...d, cnpj: digits(f.cnpj), dificuldade: f.dificuldade === '' ? '' : +f.dificuldade, resp: f.area && respF ? { [f.area]: respF } : {}, sn: { ...(e?.sn || {}), sit: snSit, txt: snTxt, consultaEm: snConsulta } });
      if (saidaUlt || saidaCom || saidaMot) doc.saida = { ultComp: saidaUlt, comunicadoEm: saidaCom, ci: saidaCi, motivo: saidaMot }; else delete doc.saida;
      gravar('empresas', id, doc, doc.razao); toast('Empresa salva.');
    },
  });
  $('[data-del]', m.el)?.addEventListener('click', async () => { if (await confirmar(`Excluir ${e.razao}? O registro pode ser restaurado pelo Histórico de alterações.`, 'Excluir')) { excluir('empresas', e.id, e.razao); m.close(); } });
}
function loteEmpresas(ids) {
  const defs = { area: { k: 'v', label: 'Nova área', type: 'select', options: ['Fiscal', 'Planejamento'] }, grupo: { k: 'v', label: 'Novo grupo', type: 'select', options: grupos() }, resp: { k: 'v', label: 'Novo responsável', type: 'select', options: funcsAtivos() }, regime: { k: 'v', label: 'Novo regime', type: 'select', options: REGIMES }, status: { k: 'v', label: 'Novo status', type: 'select', vazio: false, options: ['Ativo', 'Inativo'] }, prioritario: { k: 'v', label: 'Prioridade do financeiro', type: 'select', vazio: false, options: ['Sim', 'Não'] }, segmento: { k: 'v', label: 'Novo segmento' }, tipo: { k: 'v', label: 'Novo tipo', type: 'select', options: TIPOS } };
  modal({
    titulo: `Alterar ${ids.length} empresas em lote`,
    html: `<div class="form"><div class="campo"><label>Campo</label><select data-c>${Object.entries({ area: 'Área', grupo: 'Grupo', resp: 'Responsável', regime: 'Regime', status: 'Status', prioritario: 'Prioridade', segmento: 'Segmento', tipo: 'Tipo' }).map(([k, t]) => `<option value="${k}">${t}</option>`).join('')}</select></div><div data-v></div></div><p class="dica">Valor vazio limpa o campo. Empresa sem área ou sem grupo perde o responsável.</p>`,
    onOpen: bg => { const d = () => $('[data-v]', bg).innerHTML = campoHtml(defs[$('[data-c]', bg).value]); $('[data-c]', bg).onchange = d; d(); },
    botoes: [{ t: 'Cancelar' }, {
      t: 'Aplicar', cls: 'pri', on: bg => {
        const c = $('[data-c]', bg).value, v = $('[name=v]', bg).value.trim();
        gravarLote('empresas', ids.map(id => { const e = { ...S.data.empresas.get(id) }; if (c === 'resp') e.resp = e.area && v ? { [e.area]: v } : {}; else if (c === 'prioritario') e.prioritario = v === 'Sim'; else e[c] = v; return [id, ajustarEmpresa(e)]; }), `Alteração em lote: ${c} = ${c === 'resp' ? funcNome(v) : v || '(vazio)'}`);
        toast(`${ids.length} empresas alteradas.`);
      },
    }],
  });
}
const CAMPOS_IMP = [
  { k: 'razao', label: 'Razão social', sin: ['Razão', 'Empresa', 'Nome', 'Cliente', 'Razao social', 'Nome/Razão social'] }, { k: 'cnpj', label: 'CNPJ', sin: ['CNPJ/CPF', 'CPF/CNPJ', 'Inscrição'], req: true }, { k: 'ie', label: 'I.E.', sin: ['IE', 'Inscrição Estadual', 'Insc. Estadual'] },
  { k: 'uf', label: 'UF', sin: ['Estado'] }, { k: 'regime', label: 'Regime tributário', sin: ['Regime', 'Tributação'] }, { k: 'area', label: 'Área', sin: ['Area'] }, { k: 'grupo', label: 'Grupo', sin: ['Carteira', 'Squad'] }, { k: 'resp', label: 'Responsável', sin: ['Responsavel', 'Responsável Fiscal', 'Analista'] },
  { k: 'segmento', label: 'Segmento', sin: ['Atividade'] }, { k: 'tipo', label: 'Tipo', sin: [] }, { k: 'prioritario', label: 'Prioridade', sin: ['Prioritário', 'Prioridade financeiro'] }, { k: 'ci', label: 'Nº C.I.', sin: ['CI', 'Nº CI', 'N° C.I.'] }, { k: 'ciData', label: 'Data ativação C.I.', sin: ['Ativação CI', 'Ativação C.I.', 'Data ativação CI'] },
  { k: 'contrato', label: 'Data do contrato', sin: ['Contrato', 'Data contrato'] }, { k: 'respTec', label: 'Resp. técnica / Repasse', sin: ['Repasse', 'Data de repasse', 'Responsabilidade técnica', 'Data da responsabilidade técnica'] }, { k: 'cumulatividade', label: 'Cumulatividade', sin: [] }, { k: 'status', label: 'Status', sin: ['Situação'] }, { k: 'obs', label: 'Observação', sin: ['Obs', 'Observações'] },
];
function importarEmpresas() {
  importarPlanilha({
    titulo: 'Empresas', campos: CAMPOS_IMP, onImport: async (linhas, aba) => {
      const fs = [...S.data.funcionarios].map(([id, f]) => [id, norm(f.nome)]), pares = [];
      for (const l of linhas) {
        let c = digits(l.cnpj); if (c.length > 11 && c.length < 14) c = c.padStart(14, '0'); if (c.length < 11) continue;
        const e = { ...(S.data.empresas.get(c) || { criadoEm: hoje(), status: 'Ativo', resp: {} }) };
        for (const k of ['razao', 'ie', 'uf', 'regime', 'area', 'grupo', 'segmento', 'tipo', 'ci', 'cumulatividade', 'status', 'obs']) if (l[k] != null && String(l[k]).trim() !== '') e[k] = String(l[k]).trim();
        for (const k of ['ciData', 'contrato', 'respTec']) { const d = parseData(l[k]); if (d) e[k] = d; }
        if (l.prioritario != null && l.prioritario !== '') e.prioritario = /^(s|sim|x|true|1|priorit)/i.test(String(l.prioritario).trim());
        e.cnpj = c; if (!e.regime && /simples/i.test(aba)) e.regime = 'Simples Nacional'; if (!e.area && /geral|rotina|fiscal/i.test(aba)) e.area = 'Fiscal';
        if (e.area && /^plan/i.test(e.area)) e.area = 'Planejamento'; else if (e.area && /^(fisc|rot)/i.test(e.area)) e.area = 'Fiscal';
        if (l.resp && e.area) { const n = norm(l.resp), hit = fs.find(([, fn]) => fn === n) || fs.find(([, fn]) => fn.startsWith(n) || n.startsWith(fn)); if (hit) e.resp = { [e.area]: hit[0] }; }
        if (!e.razao) continue; pares.push([c, ajustarEmpresa(e)]);
      }
      gravarLote('empresas', pares, `Importação da aba ${aba}`); return pares.length;
    },
  });
}
const colsEmp = () => [
  { key: 'razao', label: 'Razão social', w: 240, html: e => `${e.prioritario ? '<span class="tag ouro" title="Prioridade do financeiro">★</span> ' : ''}${esc(e.razao)}` }, { key: 'cnpj', label: 'CNPJ', get: e => fmt.cnpj(e.cnpj), w: 140 }, { key: 'ie', label: 'I.E.' }, { key: 'uf', label: 'UF' },
  { key: 'regime', label: 'Regime' }, { key: 'area', label: 'Área' }, { key: 'grupo', label: 'Grupo' }, { key: 'resp', label: 'Responsável', get: respNome }, { key: 'segmento', label: 'Segmento' },
  { key: 'prior', label: 'Prioridade', get: e => e.prioritario ? 'Sim' : 'Não' }, { key: 'ci', label: 'Nº C.I.' }, { key: 'ciData', label: 'Ativação C.I.', get: e => fmt.data(e.ciData), sort: e => e.ciData || '' },
  { key: 'contrato', label: 'Contrato', get: e => fmt.data(e.contrato), sort: e => e.contrato || '' }, { key: 'respTec', label: 'Resp. téc./Repasse', get: e => fmt.data(e.respTec), sort: e => e.respTec || '' },
  { key: 'sn', label: 'Situação SN', get: e => e.sn?.txt || e.sn?.sit || '' }, { key: 'status', label: 'Situação', get: situacao, html: e => { const s = situacao(e); return s === 'Ativa' ? 'Ativa' : `<span class="tag ${s === 'Em saída' ? 'ouro' : 'verm'}">${s}</span>`; } },
  { key: 'ultComp', label: 'Última comp. (saída)', get: e => fmt.comp(e.saida?.ultComp), sort: e => e.saida?.ultComp || '' }, { key: 'saidaMot', label: 'Motivo da saída', w: 200, get: e => e.saida?.motivo || '' },
  { key: 'pend', label: 'Pendência', get: pendencia, html: e => { const p = pendencia(e); return p ? `<span class="tag verm">${esc(p)}</span>` : ''; } },
];
function gridEmpresas(el, id, filtro, titulo, comQuadros) {
  const g = grids[id] ||= new Grid({
    titulo, arquivo: titulo, cols: colsEmp, rows: () => emps().filter(filtro), onRow: editarEmpresa, exportar: can('empresas', 'exportar'), rowCls: e => ativa(e) ? '' : 'inativo',
    acoes: [...(can('empresas', 'criar') ? [{ t: '+ Nova empresa', cls: 'pri', on: () => editarEmpresa() }, { t: 'Importar planilha', on: importarEmpresas }] : [])],
    lote: [...(can('empresas', 'editar') ? [{ t: 'Alterar em lote', on: loteEmpresas }] : []), ...(can('empresas', 'excluir') ? [{ t: 'Excluir selecionadas', cls: 'perigo', on: async ids => { if (await confirmar(`Excluir ${ids.length} empresas?`, 'Excluir')) gravarLote('empresas', ids.map(i => [i, null]), 'Exclusão em lote'); } }] : [])],
  });
  el.innerHTML = `${comQuadros ? '<div class="quadros"></div>' : ''}<div class="gr"></div>`; g.mount($('.gr', el));
  const quadros = () => {
    if (!comQuadros) return; const tudo = emps(), l = tudo.filter(e => ativa(e)), n = f => l.filter(f).length, at = k => g.f.pend?.has(k) ? 'on' : '';
    $('.quadros', el).innerHTML = quadro('Empresas ativas', l.length) + quadro('Na Rotina (Fiscal)', n(e => e.area === 'Fiscal')) + quadro('No Planejamento', n(e => e.area === 'Planejamento')) + quadro('Prioritárias', n(e => e.prioritario), { cls: 'ouro' }) + quadro('Em saída', n(e => !!e.saida), { cls: 'ouro', sub: 'ainda no controle' }) + quadro('Saíram', tudo.filter(e => saiu(e)).length, { sub: 'fora do controle' })
      + ['Pendente de responsável', 'Pendente de grupo', 'Pendente de área'].map(k => quadro(k, n(e => pendencia(e) === k), { k, cls: 'alerta ' + at(k) })).join('');
    $$('[data-q]', el).forEach(b => b.onclick = () => { const k = b.dataset.q; if (g.f.pend?.has(k)) delete g.f.pend; else g.f.pend = new Set([k]); g.page = 1; g.refresh(); quadros(); });
  };
  quadros(); return () => { quadros(); g.refresh(); };
}
const rEmpresas = el => abas(el, [
  { id: 'gerais', t: 'Empresas gerais', fn: c => gridEmpresas(c, 'eg', () => true, 'Empresas gerais', true) },
  { id: 'rotina', t: 'Empresas na Rotina', fn: c => gridEmpresas(c, 'er', e => e.area === 'Fiscal', 'Empresas na Rotina') },
  { id: 'plan', t: 'Empresas no Planejamento', fn: c => gridEmpresas(c, 'ep', e => e.area === 'Planejamento', 'Empresas no Planejamento') },
  { id: 'saidas', t: 'Saídas de clientes', fn: c => gridEmpresas(c, 'es', e => !!e.saida || e.status === 'Inativo', 'Saídas de clientes') },
], st.empresas);

// ================= CARTEIRAS =================
const peso = e => { const p = S.config.pesos || [1, 15, 25, 37]; return e.tipo === 'Prestadora' || e.dificuldade === '' || e.dificuldade == null ? 1 : (p[+e.dificuldade] ?? 1); };
function carteiras(por) {
  const m = new Map();
  for (const e of emps()) {
    if (!ativa(e) || !e.area) continue;
    const k = por === 'grupo' ? (e.grupo || (e.area === 'Planejamento' ? 'Planejamento' : '(sem grupo)')) : (respId(e) || '(sem responsável)');
    if (!m.has(k)) m.set(k, { id: k, nome: por === 'grupo' ? k : (funcNome(k) || 'Sem responsável'), grupo: por === 'grupo' ? '' : (S.data.funcionarios.get(k)?.grupo || ''), l: [] });
    m.get(k).l.push(e);
  }
  return [...m.values()].map(c => ({ ...c, n: c.l.length, prior: c.l.filter(e => e.prioritario).length, ie: c.l.filter(e => e.ie).length, fora: c.l.filter(e => e.uf && e.uf !== 'GO').length, sn: c.l.filter(e => tipoRegime(e) === 'Simples').length, lucro: c.l.filter(e => tipoRegime(e).startsWith('Lucro')).length, carga: c.l.reduce((s, e) => s + peso(e), 0), semClass: c.l.filter(e => e.tipo !== 'Prestadora' && (e.dificuldade === '' || e.dificuldade == null)).length }));
}
const COLS_CART = [{ label: 'Nº', w: 6 }, { label: 'Razão social', w: 52 }, { label: 'CNPJ', w: 21 }, { label: 'I.E.', w: 16 }, { label: 'UF', w: 6 }, { label: 'Segmento', w: 30 }, { label: 'Prioridade', w: 14 }];
const abaCarteira = c => { const l = [...c.l].sort((a, b) => a.razao.localeCompare(b.razao)); return { nome: c.nome, titulo: 'CARTEIRA · ' + c.nome.toUpperCase(), sub: `${c.grupo ? c.grupo + ' · ' : ''}Posição em ${fmt.data(hoje())} · ★ linha destacada = prioridade do financeiro`, contadores: [['EMPRESAS', l.length], ['PRIORIDADE FINANCEIRO', c.prior]], cols: COLS_CART, rows: l.map((e, i) => [i + 1, e.razao, fmt.cnpj(e.cnpj), e.ie || '', e.uf || '', e.segmento || '', e.prioritario ? 'PRIORIDADE' : '']), destaque: i => l[i].prioritario }; };
function exportarCarteiras(lista, por) {
  formModal({
    titulo: 'Exportar carteiras', salvar: 'Gerar Excel', largo: false,
    campos: [{ k: 'qual', label: 'Quais carteiras', type: 'select', vazio: false, options: [{ v: '*', t: `Todas (${lista.length})` }, ...lista.map(c => ({ v: c.id, t: `${c.nome} (${c.n})` }))] }, { k: 'modo', label: 'Formato', type: 'select', vazio: false, options: [{ v: 'abas', t: por === 'grupo' ? 'Uma aba por grupo' : 'Uma aba por responsável' }, { v: 'geral', t: 'Aba geral única' }] }],
    onSave: async v => {
      const sel = v.qual === '*' ? lista : lista.filter(c => c.id === v.qual);
      const pl = v.modo === 'abas' ? sel.map(abaCarteira) : [abaCarteira({ nome: 'Geral', grupo: '', l: sel.flatMap(c => c.l), prior: sel.reduce((s, c) => s + c.prior, 0) })];
      await xlsxAttiva(`CARTEIRA_${hoje().slice(5, 7)}-${hoje().slice(0, 4)}_${v.qual === '*' ? 'TODAS' : sel[0].nome.toUpperCase().replace(/\W+/g, '_')}`, pl);
    },
  });
}
function gridCarteiras(el, por) {
  const g = grids['c' + por] ||= new Grid({
    titulo: por === 'grupo' ? 'Carteiras por grupo' : 'Carteiras por responsável', exportar: false, rows: () => carteiras(por),
    cols: [{ key: 'nome', label: por === 'grupo' ? 'Grupo' : 'Responsável', w: 200, html: c => c.id.startsWith('(') ? `<span class="tag verm">${esc(c.nome)}</span>` : `<b>${esc(c.nome)}</b>` }, ...(por === 'grupo' ? [] : [{ key: 'grupo', label: 'Grupo' }]),
      { key: 'n', label: 'Empresas', cls: 'num' }, { key: 'prior', label: 'Prioritárias', cls: 'num' }, { key: 'ie', label: 'Com I.E.', cls: 'num' }, { key: 'fora', label: 'Fora de GO', cls: 'num' }, { key: 'sn', label: 'Simples', cls: 'num' }, { key: 'lucro', label: 'Lucro', cls: 'num' },
      { key: 'carga', label: 'Carga (prestadoras equiv.)', cls: 'num', html: c => `${c.carga}${c.semClass ? ` <small title="Empresas sem grau de dificuldade contam como 1">(${c.semClass} sem classificação)</small>` : ''}` }],
    acoes: can('carteiras', 'exportar') ? [{ t: 'Exportar carteiras', cls: 'pri', on: () => exportarCarteiras(carteiras(por), por) }] : [],
    onRow: c => modal({ titulo: `${c.nome} · ${c.n} empresas`, largo: true, html: `<div class="g-wrap"><table class="g"><thead><tr><th class="n">Nº</th><th>Razão social</th><th>CNPJ</th><th>I.E.</th><th>UF</th><th>Regime</th><th>Segmento</th><th>Dif.</th></tr></thead><tbody>${[...c.l].sort((a, b) => a.razao.localeCompare(b.razao)).map((e, i) => `<tr class="${e.prioritario ? 'prior' : ''}"><td class="n">${i + 1}</td><td>${e.prioritario ? '★ ' : ''}${esc(e.razao)}</td><td>${fmt.cnpj(e.cnpj)}</td><td>${esc(e.ie)}</td><td>${esc(e.uf)}</td><td>${esc(tipoRegime(e))}</td><td>${esc(e.segmento)}</td><td>${esc(e.dificuldade ?? '')}</td></tr>`).join('')}</tbody></table></div>`, botoes: [{ t: 'Fechar' }, ...(can('carteiras', 'exportar') ? [{ t: 'Excel desta carteira', cls: 'pri', on: () => xlsxAttiva(`CARTEIRA_${c.nome.toUpperCase().replace(/\W+/g, '_')}`, [abaCarteira(c)]) }] : [])] }),
  });
  g.sorts.length || g.sorts.push({ k: 'n', d: -1 }); g.mount(el); return () => g.refresh();
}
const rCarteiras = el => abas(el, [{ id: 'resp', t: 'Por responsável', fn: c => gridCarteiras(c, 'resp') }, { id: 'grupo', t: 'Por grupo', fn: c => gridCarteiras(c, 'grupo') }], st.carteiras);

// ================= EQUIPE E FÉRIAS =================
const FERR = ['G-Click', 'Digisac', 'SAAM', 'Domínio', 'Econet'];
const funcs = () => [...S.data.funcionarios].map(([id, f]) => ({ id, ...f }));
function editarFunc(f) {
  const novo = !f, pode = can('equipe', novo ? 'criar' : 'editar');
  const campos = [{ k: 'nome', label: 'Nome do colaborador', req: true }, { k: 'email', label: 'E-mail de trabalho', type: 'email' }, { k: 'admissao', label: 'Data de admissão', type: 'date' }, { k: 'vinculo', label: 'Vínculo', type: 'select', vazio: false, options: ['CLT', 'PJ'], ajuda: 'PJ não entra na programação de férias.' },
    { k: 'setor', label: 'Setor', type: 'select', options: ['Fiscal', 'Planejamento', 'Cadastro', 'Contábil', 'Departamento Pessoal', 'Societário', 'Gestão'] }, { k: 'grupo', label: 'Grupo', type: 'select', options: grupos() }, { k: 'lider', label: 'Líder do grupo', type: 'select', options: grupos() },
    ...FERR.map(x => ({ k: 'ferr_' + x, label: 'Acesso · ' + x, type: 'select', options: [{ v: 'ok', t: 'Liberado' }, { v: 'pendente', t: 'Pendente' }, { v: 'nao', t: 'Não usa' }] })), { k: 'ativo', label: 'Situação', type: 'check', rot: 'Colaborador ativo' }, { k: 'obs', label: 'Observação', type: 'textarea', full: true }];
  const v = f ? { vinculo: 'CLT', ...f, ativo: f.ativo !== false, ...Object.fromEntries(FERR.map(x => ['ferr_' + x, f.ferr?.[x] || ''])) } : { ativo: true, vinculo: 'CLT' };
  const m = formModal({
    titulo: novo ? 'Novo colaborador' : f.nome, campos, valores: v, salvar: pode ? 'Salvar' : 'Fechar',
    extra: !novo && can('equipe', 'excluir') ? '<p><button type="button" class="btn perigo mini" data-del>Excluir colaborador</button></p>' : '',
    onSave: x => { if (!pode) return; const d = { ...(f ? semId(f) : {}) }, ferr = {}; for (const [k, val] of Object.entries(x)) k.startsWith('ferr_') ? (val && (ferr[k.slice(5)] = val)) : (d[k] = val); gravar('funcionarios', f?.id || 'f' + store.newId().slice(0, 8), { ...d, ferr }, d.nome); toast('Colaborador salvo.'); },
  });
  $('[data-del]', m.el)?.addEventListener('click', async () => { const n = emps().filter(e => respId(e) === f.id).length; if (await confirmar(`Excluir ${f.nome}?${n ? ` Ele(a) é responsável por ${n} empresas, que ficarão pendentes de responsável.` : ''}`, 'Excluir')) { excluir('funcionarios', f.id, f.nome); m.close(); } });
}
const rotFerr = v => ({ ok: '✔', pendente: 'Pendente', nao: '—' }[v] || '');
function gridFuncs(el) {
  const g = grids.func ||= new Grid({
    titulo: 'Equipe', rows: funcs, onRow: editarFunc, exportar: can('equipe', 'exportar'), rowCls: f => f.ativo === false ? 'inativo' : '',
    cols: [{ key: 'nome', label: 'Nome', w: 180, html: f => `<b>${esc(f.nome)}</b>${f.lider ? ` <span class="tag ouro">Líder</span>` : ''}` }, { key: 'admissao', label: 'Admissão', get: f => fmt.data(f.admissao), sort: f => f.admissao || '' }, { key: 'email', label: 'E-mail' }, { key: 'setor', label: 'Setor' }, { key: 'grupo', label: 'Grupo' }, { key: 'vinculo', label: 'Vínculo', get: f => f.vinculo || 'CLT' },
      { key: 'emp', label: 'Empresas', cls: 'num', get: f => emps().filter(e => ativa(e) && respId(e) === f.id).length },
      ...FERR.map(x => ({ key: 'f_' + x, label: x, get: f => rotFerr(f.ferr?.[x]), html: f => f.ferr?.[x] === 'pendente' ? '<span class="tag verm">Pendente</span>' : esc(rotFerr(f.ferr?.[x])) })), { key: 'ativo', label: 'Ativo', get: f => f.ativo === false ? 'Não' : 'Sim' }, { key: 'obs', label: 'Observação', w: 200 }],
    acoes: can('equipe', 'criar') ? [{ t: '+ Novo colaborador', cls: 'pri', on: () => editarFunc() }, { t: 'Importar planilha', on: importarFuncs }] : [],
  });
  g.mount(el); return () => g.refresh();
}
function importarFuncs() {
  importarPlanilha({
    titulo: 'Equipe', campos: [{ k: 'nome', label: 'Nome', sin: ['Nome colaborador', 'Colaborador', 'Funcionário'], req: true }, { k: 'admissao', label: 'Data de admissão', sin: ['Admissão', 'Data admissão'] }, { k: 'email', label: 'E-mail', sin: ['E-mail de trabalho', 'Email'] }, { k: 'setor', label: 'Setor', sin: [] }, { k: 'grupo', label: 'Grupo', sin: [] }, { k: 'vinculo', label: 'Vínculo', sin: ['Vinculo'] }, ...FERR.map(x => ({ k: 'ferr_' + x, label: x, sin: [] })), { k: 'obs', label: 'Observação', sin: ['Obs'] }],
    onImport: async linhas => {
      const ex = funcs(), pares = [];
      for (const l of linhas) {
        const nome = String(l.nome || '').trim(); if (!nome) continue; const at = ex.find(f => norm(f.nome) === norm(nome)), d = at ? semId(at) : { ativo: true, vinculo: 'CLT', ferr: {} };
        d.nome = nome; for (const k of ['email', 'setor', 'grupo']) if (l[k]) d[k] = String(l[k]).trim(); if (l.vinculo) d.vinculo = /pj/i.test(l.vinculo) ? 'PJ' : 'CLT'; const a = parseData(l.admissao); if (a) d.admissao = a; if (l.obs) d.obs = String(l.obs);
        d.ferr = { ...(d.ferr || {}) }; for (const x of FERR) { const v = norm(l['ferr_' + x]); if (v) d.ferr[x] = /^(ok|sim|x|lib|✔)/.test(v) ? 'ok' : /^pend/.test(v) ? 'pendente' : 'nao'; }
        pares.push([at?.id || 'f' + store.newId().slice(0, 8), d]);
      }
      gravarLote('funcionarios', pares, 'Importação da equipe'); return pares.length;
    },
  });
}
// aquisição = 1 ano após a admissão ou após a última aquisição quitada; prazo limite = aquisição + 335 dias
export function ferias(f) {
  if (!f.admissao || f.vinculo === 'PJ' || f.ativo === false) return null;
  let aq;
  if (f.ferias?.quitadaAte) aq = addAnos(f.ferias.quitadaAte, 1);
  else { aq = addAnos(f.admissao, 1); while (addAnos(aq, 1) <= hoje()) aq = addAnos(aq, 1); }
  const limite = addDias(aq, 335), d = diasAte(limite);
  return { aq, limite, dias: d, sit: aq > hoje() ? 'Em aquisição' : d < 0 ? 'Vencida' : d <= 90 ? 'Alerta' : 'No prazo' };
}
function gridFerias(el) {
  const sv = (f, k, v) => gravar('funcionarios', f.id, { ...semId(f), ferias: { ...(f.ferias || {}), [k]: v } }, `Férias de ${f.nome}`);
  const g = grids.fer ||= new Grid({
    titulo: 'Programação de férias', rows: () => funcs().filter(ferias), exportar: can('equipe', 'exportar'), podeEditar: can('equipe', 'editar'),
    cols: [{ key: 'nome', label: 'Colaborador', w: 180 }, { key: 'grupo', label: 'Grupo' }, { key: 'admissao', label: 'Admissão', get: f => fmt.data(f.admissao), sort: f => f.admissao },
      { key: 'aq', label: 'Aquisição', get: f => fmt.data(ferias(f).aq), sort: f => ferias(f).aq }, { key: 'lim', label: 'Prazo limite', get: f => fmt.data(ferias(f).limite), sort: f => ferias(f).limite }, { key: 'dias', label: 'Dias até o limite', cls: 'num', get: f => ferias(f).dias },
      { key: 'sit', label: 'Situação', get: f => ferias(f).sit, html: f => { const s = ferias(f).sit; return `<span class="tag ${s === 'Vencida' ? 'verm' : s === 'Alerta' ? 'ouro' : s === 'No prazo' ? 'verde' : ''}">${s}</span>`; } },
      { key: 'prog', label: 'Programação', w: 180, get: f => f.ferias?.prog || '', edit: { type: 'text', save: (f, v) => sv(f, 'prog', v) } }, { key: 'fd', label: 'Dias a gozar', cls: 'num', get: f => f.ferias?.dias ?? '', edit: { type: 'number', save: (f, v) => sv(f, 'dias', v === '' ? '' : +v) } },
      { key: 'quit', label: 'Última aquisição quitada', get: f => fmt.data(f.ferias?.quitadaAte), edit: { type: 'date', get: f => f.ferias?.quitadaAte || '', save: (f, v) => sv(f, 'quitadaAte', v) } },
      { key: 'ok', label: '', filter: false, exp: false, html: () => '<button class="btn mini">Período gozado</button>', click: async f => { const x = ferias(f); if (x.aq > hoje()) return toast('O período atual ainda está em aquisição.', 'erro'); if (await confirmar(`Marcar como gozadas as férias da aquisição de ${fmt.data(x.aq)} de ${f.nome}? A programação é zerada e o próximo período passa a ser acompanhado.`)) gravar('funcionarios', f.id, { ...semId(f), ferias: { quitadaAte: x.aq, prog: '', dias: '' } }, `Férias gozadas: ${f.nome}`); } }],
  });
  g.sorts.length || g.sorts.push({ k: 'lim', d: 1 });
  el.innerHTML = '<p class="dica">Aquisição = 1 ano após a admissão ou após a última aquisição. Prazo limite = aquisição + 335 dias. Colaboradores PJ não aparecem. Clique nas células de Programação, Dias e Última aquisição para editar.</p><div class="gr"></div>'; g.mount($('.gr', el)); return () => g.refresh();
}
const rEquipe = el => abas(el, [{ id: 'func', t: 'Colaboradores e acessos', fn: gridFuncs }, { id: 'ferias', t: 'Programação de férias', fn: gridFerias }], st.equipe);

// ================= FERRAMENTAS =================
const A = 'https://claude.ai/artifact/';
const FERR_PADRAO = [
  ['Centro de Ferramentas NIT', 'GERAL', A + 'BwHLQ4j4qAcHwMx55Dmvzi', 'Prévia de ICMS, Validador SPED x XML, Relatório XML e demais ferramentas do NIT.'], ['Livros Fiscais GO', 'GERAL', A + '69sQ7jCWzqDtmJvvUMD5HB', 'Livros de Entradas e Inventário autenticados na Sefaz-GO.'],
  ['Painel de Controle NIT', 'REGIME NORMAL', A + 'TwXMspoi3oTnQNNaBzgb5a', 'Créditos, cotas e projeções das empresas do Lucro.'], ['Estoque Contábil/Fiscal', 'REGIME NORMAL', A + 'Ja4AMFobp2cFUVBqvLNQod', 'Demonstrativo de estoque até a competência atual.'],
  ['Monofasia do SN - Domínio', 'SIMPLES NACIONAL', A + 'WQpr1BoGPnUX4ZZ6r6ea6i', 'Planilha de produtos monofásicos para importar na Domínio.'], ['Cadastro Attiva', 'CADASTRO', A + 'Pk9mKuiPHJ9EMsTLcfwxZj', 'Correção do cadastro de produtos e demandas da Rotina.'],
];
export const ferrVisiveis = () => [...S.data.ferramentas].map(([id, f]) => ({ id, ...f })).filter(f => isAdmin() || !f.perfis?.length || f.perfis.includes(S.user.perfil)).sort((a, b) => (a.grupo || '').localeCompare(b.grupo || '') || (a.ordem || 0) - (b.ordem || 0) || a.nome.localeCompare(b.nome));
export const cartoesFerr = l => l.map(f => `<div class="ferr"><a href="${esc(f.url)}" target="_blank" rel="noopener"><b>${esc(f.nome)}</b><span>${esc(f.desc)}</span><i>Abrir ↗</i></a>${isAdmin() ? `<button class="btn mini" data-ed="${esc(f.id)}" aria-label="Editar ${esc(f.nome)}">Editar</button>` : ''}</div>`).join('');
function editarFerr(f) {
  const perfis = [...S.data.perfis].map(([id, p]) => ({ id, nome: p.nome }));
  const m = formModal({
    titulo: f ? f.nome : 'Nova ferramenta', valores: f || {},
    campos: [{ k: 'nome', label: 'Nome', req: true }, { k: 'grupo', label: 'Grupo', ph: 'REGIME NORMAL, SIMPLES NACIONAL, GERAL…', req: true }, { k: 'url', label: 'Link', req: true, full: true, ph: 'https://…' }, { k: 'desc', label: 'Descrição', full: true }, { k: 'ordem', label: 'Ordem', type: 'number' }],
    extra: `<div class="campo full"><label>Quem enxerga (nenhum marcado = todos os perfis)</label><div class="cols-exp">${perfis.map(p => `<label class="chk"><input type="checkbox" data-pf="${esc(p.id)}" ${f?.perfis?.includes(p.id) ? 'checked' : ''}> ${esc(p.nome)}</label>`).join('') || '<small>Nenhum perfil criado ainda.</small>'}</div></div>${f ? '<p><button type="button" class="btn perigo mini" data-del>Excluir ferramenta</button></p>' : ''}`,
    onSave: (v, bg) => { if (!/^https?:\/\//i.test(v.url)) return 'O link precisa começar com http:// ou https://'; gravar('ferramentas', f?.id || store.newId(), { ...v, grupo: v.grupo.toUpperCase(), perfis: $$('[data-pf]:checked', bg).map(x => x.dataset.pf) }, v.nome); },
  });
  $('[data-del]', m.el)?.addEventListener('click', async () => { if (await confirmar(`Excluir a ferramenta ${f.nome}?`, 'Excluir')) { excluir('ferramentas', f.id, f.nome); m.close(); } });
}
function rFerramentas(el) {
  const desenha = () => {
    const l = ferrVisiveis(), gs = [...new Set(l.map(f => f.grupo || 'GERAL'))];
    el.innerHTML = `${isAdmin() ? `<div class="g-bar"><span class="dica">Você define aqui as ferramentas que a equipe enxerga ao entrar.</span><div class="g-acoes">${l.length ? '' : '<button class="btn" data-seed>Carregar ferramentas da Attiva</button>'}<button class="btn pri" data-nova>+ Nova ferramenta</button></div></div>` : ''}
      ${gs.map(g => `<h3 class="sec">${esc(g)}</h3><div class="ferrs">${cartoesFerr(l.filter(f => (f.grupo || 'GERAL') === g))}</div>`).join('') || '<p class="vazio">Nenhuma ferramenta liberada para o seu perfil ainda.</p>'}`;
    $('[data-nova]', el)?.addEventListener('click', () => editarFerr());
    $('[data-seed]', el)?.addEventListener('click', () => gravarLote('ferramentas', FERR_PADRAO.map(([nome, grupo, url, desc], i) => [store.newId(), { nome, grupo, url, desc, ordem: i + 1, perfis: [] }]), 'Ferramentas padrão'));
    $$('[data-ed]', el).forEach(b => b.onclick = () => editarFerr(ferrVisiveis().find(f => f.id === b.dataset.ed)));
  };
  desenha(); return desenha;
}

export const rotas = {
  empresas: { titulo: 'Empresas', render: rEmpresas }, carteiras: { titulo: 'Carteiras', render: rCarteiras },
  equipe: { titulo: 'Equipe e Férias', render: rEquipe }, ferramentas: { titulo: 'Ferramentas', render: rFerramentas },
};
