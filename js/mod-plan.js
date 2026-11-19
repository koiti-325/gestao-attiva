// PLANEJAMENTO: base geral, Zeramento do Simples, Exclusão do Simples e Retorno ao Planejamento
// (mesmas regras do artefato Gestão Attiva antigo, incluindo a transição automática para a Rotina).
import { ativa, $, $$, esc, S, can, fmt, hoje, mesAtual, compAdd, funcNome, respNome, gravar, gravarLote, toast, xlsxAttiva, abas, quadro } from './core.js';
import { Grid } from './grid.js';

const st = {}, grids = {};
const emps = () => [...S.data.empresas].map(([id, e]) => ({ id, ...e }));
const semId = ({ id, ...e }) => e;
const isPlan = e => e.area === 'Planejamento';
const P = e => e.plan || {}, Z = e => e.zer || {}, X = e => e.exc || {};
const termoSim = v => /^(sim|s)\b/i.test(String(v || '').trim());
const voltaP = e => P(e).voltaPlan;
const pendRet = e => !!voltaP(e) && !voltaP(e).retornou;
const snTxt = e => e.sn?.txt || e.sn?.sit || P(e).opcaoTxt || '';
const optante = e => (e.sn?.sit || (P(e).optante === 'Sim' ? 'Optante' : '')) === 'Optante';

// Zeramento: zerar da Comp. Lucro (o mês que será Lucro) até o mês anterior ao atual
export function zerCalc(e) {
  const cl = P(e).compLucro; if (!cl) return { start: '', pend: [] };
  const alvo = compAdd(mesAtual(), -1), u = Z(e).ultZerado; let from = cl; if (u && u >= from) from = compAdd(u, 1);
  const pend = []; for (let m = from; m <= alvo && pend.length < 240; m = compAdd(m, 1)) pend.push(m);
  return { start: cl, pend };
}
const pendTxt = z => !z.start ? 'Informe a Comp. Lucro' : z.pend.length ? `${fmt.comp(z.pend[0])}${z.pend.length > 1 ? ' a ' + fmt.comp(z.pend.at(-1)) : ''} (${z.pend.length} ${z.pend.length > 1 ? 'meses' : 'mês'})` : 'EM DIA';
const zerAcomp = e => ativa(e) && !pendRet(e) && (isPlan(e) || !!e.zer || !!P(e).transicao || !!P(e).meta || !!P(e).voltaPlan);
const zerFase = e => isPlan(e) ? 'No Planejamento' : pendRet(e) ? 'Na Rotina · retorno agendado' : P(e).transicao ? 'Na Rotina · desde ' + fmt.data(P(e).transicao.em) : 'Na Rotina';
const fatDec = e => X(e).excDecisao || P(e).transicao?.decisao || '';
const fatAl = e => fatDec(e) === 'FICAR NO SN' ? (Z(e).fatVolta ? 'Faturamento retomado em ' + fmt.comp(Z(e).fatVolta) : 'Voltar faturamento') : '';
// Exclusão
const excSit = e => X(e).excStatus || 'Já excluída';
export const excAtrasada = e => excSit(e) === 'Em exclusão' && (P(e).meta || X(e).excMes || '9999') < mesAtual();
const trMeta = e => P(e).meta || '';
const trDest = v => !v ? '' : v.startsWith('squad:') ? v.slice(6) : funcNome(v);
const trSit = e => { const m = trMeta(e), now = mesAtual(); if (!m || m > now) return ''; if (!X(e).excResultado) return 'Resultado pendente'; if (!X(e).excDecisao) return 'Decisão pendente'; if (!P(e).destRotina) return 'Resp. na Rotina pendente'; return m < now ? 'Pronta para transição' : 'Vai para a Rotina em ' + fmt.data(compAdd(m, 1) + '-01'); };
const trOpts = dec => {
  const F = [...S.data.funcionarios].filter(([, f]) => f.ativo !== false);
  return dec === 'MIGRAR' ? [...['Lucro - Squad 1', 'Lucro - Squad 2', 'Lucro - Squad 3'].map(g => ({ v: 'squad:' + g, t: g })), ...F.filter(([, f]) => /lucro.*individual/i.test(f.grupo || '')).map(([id, f]) => ({ v: id, t: 'Lucro Individual · ' + f.nome }))]
    : dec === 'FICAR NO SN' ? F.filter(([, f]) => /simples/i.test(f.grupo || '')).map(([id, f]) => ({ v: id, t: f.nome })) : [];
};
// Retorno ao Planejamento (Termo de Exclusão SN = SIM: fica na Rotina até 12/AAAA e volta em 01/02/AAAA+1)
const retSit = e => hoje() >= voltaP(e).retorno ? 'Retorno vencido' : compAdd(mesAtual(), 1) >= voltaP(e).retorno.slice(0, 7) ? 'Retorna no próximo mês' : 'Aguardando retorno';
function retFix(d) {
  const p = d.plan || {};
  if (isPlan(d) && termoSim(p.termo) && !p.voltaPlan) {
    const y = +hoje().slice(0, 4); d.plan = { ...p, voltaPlan: { desde: hoje(), ate: `${y}-12`, retorno: `${y + 1}-02-01`, resp: d.resp?.Planejamento || '' } };
    d.area = 'Fiscal'; d.resp = {}; toast(`${d.razao}: Termo de Exclusão = SIM. Foi para a Rotina até a apuração de 12/${y} e volta ao Planejamento em 01/02/${y + 1}. Defina grupo e responsável na Rotina.`, 'aviso');
  } else if (isPlan(d) && p.voltaPlan && !p.voltaPlan.retornou) d.plan = { ...p, voltaPlan: { ...p.voltaPlan, retornou: hoje() } };
  return d;
}
function salvar(e, caminho, v, rot) {
  const d = structuredClone(semId(e)), [a, b] = caminho.split('.');
  if (b) { d[a] = { ...(d[a] || {}) }; if (v === '' || v == null) delete d[a][b]; else d[a][b] = v; } else d[a] = v;
  if (a === 'exc' && b === 'excResultado' && !v) delete d.exc.excDecisao;
  if (a === 'exc' && b === 'excDecisao') { d.plan = { ...(d.plan || {}) }; delete d.plan.destRotina; }
  gravar('empresas', e.id, retFix(d), `${rot}: ${e.razao}`);
}

// Automações (só quem pode alterar): transição Planejamento → Rotina após a META e retorno agendado ao Planejamento
const feitos = new Set();
export function automacoes() {
  if (!can('simples', 'editar') || !navigator.onLine) return;
  const now = mesAtual(), pares = [];
  for (const e of emps()) {
    if (feitos.has(e.id) || !ativa(e)) continue; const p = P(e);
    if (isPlan(e) && p.meta && p.meta < now && X(e).excDecisao && X(e).excResultado && p.destRotina) {
      const v = p.destRotina, sq = v.startsWith('squad:'), dec = X(e).excDecisao;
      const grupo = sq ? v.slice(6) : dec === 'FICAR NO SN' ? 'Simples' : 'Lucro - Individual';
      pares.push([e.id, { ...semId(e), area: 'Fiscal', grupo, resp: sq ? {} : { Fiscal: v }, plan: { ...p, transicao: { em: hoje(), meta: p.meta, decisao: dec, resultado: X(e).excResultado, de: e.resp?.Planejamento || '', para: v } } }]);
    } else if (pendRet(e) && hoje() >= voltaP(e).retorno) {
      const v = voltaP(e);
      pares.push([e.id, { ...semId(e), area: 'Planejamento', grupo: '', resp: v.resp ? { Planejamento: v.resp } : {}, plan: { ...p, voltaPlan: { ...v, retornou: hoje() } } }]);
    }
  }
  if (!pares.length) return; pares.forEach(([id]) => feitos.add(id));
  gravarLote('empresas', pares, 'Planejamento automático (transição para a Rotina / retorno agendado)');
  toast(`${pares.length} empresa(s) mudaram de área automaticamente (meta encerrada ou retorno agendado).`, 'aviso');
}

// ---------- Colunas por aba ----------
const chip = (v, cls) => v ? `<span class="chip ${cls}">${esc(v)}</span>` : '';
const mes = (caminho, rot) => ({ type: 'month', get: e => caminho.split('.').reduce((o, k) => o?.[k], e) || '', save: (e, v) => salvar(e, caminho, v, rot) });
const txt = (caminho, rot) => ({ type: 'text', get: e => caminho.split('.').reduce((o, k) => o?.[k], e) || '', save: (e, v) => salvar(e, caminho, v, rot) });
const data = (caminho, rot) => ({ type: 'date', get: e => e[caminho] || '', save: (e, v) => salvar(e, caminho, v, rot) });
const C = {
  razao: { key: 'razao', label: 'Razão social', w: 240, html: e => `${e.prioritario ? '<span class="tag ouro">★</span> ' : ''}${esc(e.razao)}` },
  cnpj: { key: 'cnpj', label: 'CNPJ', w: 140, get: e => fmt.cnpj(e.cnpj) },
  sn: { key: 'sn', label: 'Situação Simples Nacional', w: 200, get: snTxt, html: e => chip(snTxt(e), optante(e) ? 'verde' : 'verm') || '<span class="chip cinza">Não consultada</span>' },
  compLucro: { key: 'compLucro', label: 'Comp. Lucro', get: e => fmt.comp(P(e).compLucro), sort: e => P(e).compLucro || '', edit: mes('plan.compLucro', 'Comp. Lucro') },
  termo: { key: 'termo', label: 'Termo exclusão SN', get: e => P(e).termo || '', html: e => termoSim(P(e).termo) ? chip(P(e).termo, 'ouro') : esc(P(e).termo || ''), edit: txt('plan.termo', 'Termo de exclusão') },
  repasse: { key: 'respTec', label: 'Repasse', get: e => fmt.data(e.respTec), sort: e => e.respTec || '', edit: data('respTec', 'Repasse'), html: e => e.respTec ? fmt.data(e.respTec) : (isPlan(e) ? chip('Pendente', 'verm') : '') },
};
const COLS = {
  base: () => [C.razao, C.cnpj, { key: 'ie', label: 'I.E.' }, { key: 'resp', label: 'Responsável', get: e => funcNome(e.resp?.Planejamento), html: e => e.resp?.Planejamento ? esc(funcNome(e.resp.Planejamento)) : chip('Pendente de responsável', 'verm') }, { key: 'regime', label: 'Regime' },
    { key: 'contrato', label: 'Contrato', get: e => fmt.data(e.contrato), sort: e => e.contrato || '', edit: data('contrato', 'Contrato'), html: e => e.contrato ? fmt.data(e.contrato) : chip('Pendente', 'verm') }, C.repasse, C.termo, C.compLucro,
    { key: 'meta', label: 'Meta', get: e => fmt.comp(P(e).meta), sort: e => P(e).meta || '', edit: mes('plan.meta', 'Meta') }, C.sn,
    { key: 'trans', label: 'Transição p/ Rotina', get: trSit, html: e => { const v = trSit(e); return v ? chip(v, /pendente/.test(v) ? 'verm' : /Pronta/.test(v) ? 'verde' : 'azul') : ''; } }],
  zer: () => [{ key: 'pend', label: 'Pendentes hoje', get: e => pendTxt(zerCalc(e)), sort: e => zerCalc(e).pend.length, html: e => { const z = zerCalc(e); return chip(pendTxt(z), z.pend.length || !z.start ? 'verm' : 'verde'); } }, C.razao, C.cnpj, C.repasse, C.sn, C.compLucro,
    { key: 'zerDe', label: 'Zerar a partir de', get: e => fmt.comp(P(e).compLucro), sort: e => P(e).compLucro || '' },
    { key: 'ult', label: 'Último zerado (feito)', get: e => fmt.comp(Z(e).ultZerado), sort: e => Z(e).ultZerado || '', edit: mes('zer.ultZerado', 'Zeramento') },
    { key: 'zerObs', label: 'Observação', w: 240, get: e => Z(e).zerObs || '', edit: txt('zer.zerObs', 'Zeramento') },
    { key: 'fatAl', label: 'Alerta faturamento', get: fatAl, html: e => { const v = fatAl(e); return v ? chip((/retomado/.test(v) ? '✓ ' : '⚠ ') + v, /retomado/.test(v) ? 'verde' : 'verm') : ''; } },
    { key: 'fatVolta', label: 'Faturamento retomado em', get: e => fmt.comp(Z(e).fatVolta), sort: e => Z(e).fatVolta || '', edit: mes('zer.fatVolta', 'Faturamento retomado') },
    { key: 'fase', label: 'Fase', get: zerFase, html: e => chip(zerFase(e), isPlan(e) ? 'azul' : 'cinza') }],
  exc: () => [{ key: 'excStatus', label: 'Situação', get: e => excAtrasada(e) ? 'Atrasada' : excSit(e), html: e => chip(excAtrasada(e) ? 'Atrasada' : excSit(e), excAtrasada(e) ? 'verm' : excSit(e) === 'Em exclusão' ? 'ouro' : 'cinza'), edit: { type: 'select', options: ['Em exclusão', 'Já excluída'], get: excSit, save: (e, v) => salvar(e, 'exc.excStatus', v || 'Já excluída', 'Exclusão') } },
    { key: 'meta', label: 'Meta', get: e => fmt.comp(P(e).meta || X(e).excMes), sort: e => P(e).meta || X(e).excMes || '' }, C.razao,
    { key: 'area', label: 'Área', get: e => isPlan(e) ? 'Planejamento' : e.area === 'Fiscal' ? 'Rotina' : 'Pendente' }, C.cnpj,
    { key: 'res', label: 'Resultado', w: 140, get: e => X(e).excResultado || '', html: e => X(e).excResultado ? esc(X(e).excResultado) : trMeta(e) && trMeta(e) <= mesAtual() ? chip('Pendente', 'verm') : '', edit: txt('exc.excResultado', 'Resultado da exclusão') },
    { key: 'dec', label: 'Decisão', get: e => X(e).excDecisao || '', html: e => X(e).excDecisao ? chip(X(e).excDecisao, X(e).excDecisao === 'MIGRAR' ? 'azul' : 'ouro') : X(e).excResultado ? chip('Definir', 'verm') : '<span class="na">preencha o Resultado</span>', edit: { type: 'select', options: ['MIGRAR', 'FICAR NO SN'], get: e => X(e).excDecisao || '', save: (e, v) => X(e).excResultado ? salvar(e, 'exc.excDecisao', v, 'Decisão da exclusão') : toast('Preencha o Resultado antes da Decisão.', 'erro') } },
    { key: 'dest', label: 'Resp. na Rotina', get: e => trDest(P(e).destRotina), html: e => P(e).destRotina ? esc(trDest(P(e).destRotina)) : X(e).excDecisao ? chip('Definir', 'verm') : '', edit: { type: 'select', options: e => trOpts(X(e).excDecisao), get: e => P(e).destRotina || '', save: (e, v) => X(e).excDecisao ? salvar(e, 'plan.destRotina', v, 'Destino na Rotina') : toast('Defina a Decisão antes.', 'erro') } },
    { key: 'termo', label: 'Termo exclusão SN', get: e => (isPlan(e) || pendRet(e)) ? P(e).termo || '' : X(e).excTermo || '', edit: { type: 'text', get: e => (isPlan(e) || pendRet(e)) ? P(e).termo || '' : X(e).excTermo || '', save: (e, v) => salvar(e, (isPlan(e) || pendRet(e)) ? 'plan.termo' : 'exc.excTermo', v, 'Termo de exclusão') } },
    { key: 'per', label: 'Período Lucro', get: e => fmt.comp((isPlan(e) || pendRet(e)) ? P(e).compLucro : X(e).excPeriodo), sort: e => ((isPlan(e) || pendRet(e)) ? P(e).compLucro : X(e).excPeriodo) || '', edit: { type: 'month', get: e => ((isPlan(e) || pendRet(e)) ? P(e).compLucro : X(e).excPeriodo) || '', save: (e, v) => salvar(e, (isPlan(e) || pendRet(e)) ? 'plan.compLucro' : 'exc.excPeriodo', v, 'Período Lucro') } },
    { key: 'excObs', label: 'Observação', w: 240, get: e => X(e).excObs || '', edit: txt('exc.excObs', 'Exclusão') }],
  ret: () => [{ key: 'sit', label: 'Situação', get: retSit, html: e => chip(retSit(e), /vencido/.test(retSit(e)) ? 'verm' : /próximo/.test(retSit(e)) ? 'ouro' : 'azul') }, C.razao, C.cnpj,
    { key: 'grupo', label: 'Grupo na Rotina', get: e => e.grupo || '', html: e => e.grupo ? esc(e.grupo) : chip('Definir', 'verm') }, { key: 'respF', label: 'Responsável na Rotina', get: respNome },
    { key: 'respP', label: 'Responsável no Planejamento', get: e => funcNome(voltaP(e).resp) }, { key: 'termo', label: 'Termo exclusão SN', get: e => P(e).termo || '' },
    { key: 'ate', label: 'Fica na Rotina até', get: e => fmt.comp(voltaP(e).ate), sort: e => voltaP(e).ate }, { key: 'retorno', label: 'Retorno ao Planejamento', get: e => fmt.data(voltaP(e).retorno), sort: e => voltaP(e).retorno },
    { key: 'desde', label: 'Na Rotina desde', get: e => fmt.data(voltaP(e).desde), sort: e => voltaP(e).desde }],
};
const ROWS = {
  base: () => emps().filter(e => isPlan(e) && ativa(e)),
  zer: () => emps().filter(zerAcomp),
  exc: () => {
    const now = mesAtual(), out = new Map();
    for (const e of emps()) {
      if (!ativa(e)) continue;
      if ((isPlan(e) || pendRet(e)) && P(e).meta && P(e).meta <= now) out.set(e.id, e);
      else if (!isPlan(e) && e.exc && (!X(e).excMes || X(e).excMes <= now)) out.set(e.id, e);
    }
    return [...out.values()];
  },
  ret: () => emps().filter(e => pendRet(e) && ativa(e)),
};
const DICA = {
  base: 'Todas as empresas com Área = Planejamento. Contrato, Repasse, Termo, Comp. Lucro e Meta são editados direto na célula. Termo de exclusão = SIM manda a empresa para a Rotina até a apuração de 12/AAAA, com retorno automático ao Planejamento em 01/02.',
  zer: 'Empresas que estão, estiveram ou vão passar pelo Planejamento (coluna Fase). Meses a zerar: da Comp. Lucro até o mês anterior ao atual; EM DIA = declarada até a última competência. Se a empresa decidiu FICAR NO SN, acende o alerta: o faturamento tem que voltar; informe o mês em que voltou.',
  exc: 'Empresas com META até o mês atual (as próximas entram quando o mês chegar), incluindo as da Rotina ainda em exclusão. Preencha o Resultado, depois a Decisão (MIGRAR = Squad/Lucro; FICAR NO SN = responsável do Simples) e o Resp. na Rotina. No dia 1º do mês seguinte à META a empresa passa sozinha para a Rotina.',
  ret: 'Empresas do Planejamento com Termo de Exclusão SN = SIM: seguem Simples até dezembro, ficam na Rotina até a apuração de 12/AAAA e voltam sozinhas ao Planejamento na data de retorno.',
};
const QUADROS = {
  base: l => quadro('Empresas no Planejamento', l.length) + quadro('Aguardando contrato', l.filter(e => !e.contrato).length, { cls: 'alerta' }) + quadro('Aguardando repasse', l.filter(e => !e.respTec).length, { cls: 'alerta' }) + quadro('Sem responsável', l.filter(e => !e.resp?.Planejamento).length, { cls: 'alerta' }) + quadro('Ainda optantes pelo Simples', l.filter(optante).length, { cls: 'ouro' }) + quadro('Com meses a zerar hoje', l.filter(e => zerCalc(e).pend.length).length, { cls: 'alerta' }),
  zer: l => { const zs = l.map(zerCalc); return quadro('Ficaram no Simples: voltar faturamento', l.filter(e => fatAl(e) === 'Voltar faturamento').length, { cls: 'alerta' }) + quadro('No Planejamento agora', l.filter(isPlan).length) + quadro('Já passaram (acompanhamento)', l.filter(e => !isPlan(e)).length) + quadro('Com meses a zerar hoje', zs.filter(z => z.pend.length).length, { cls: 'alerta' }) + quadro(`Meses a zerar (até ${fmt.comp(compAdd(mesAtual(), -1))})`, zs.reduce((s, z) => s + z.pend.length, 0), { cls: 'alerta' }) + quadro('Sem Comp. Lucro', l.filter(e => !P(e).compLucro).length, { cls: 'alerta' }); },
  exc: l => quadro('Transição para a Rotina pendente', l.filter(e => isPlan(e) && /pendente/.test(trSit(e))).length, { cls: 'alerta' }) + quadro(`Atrasadas (META antes de ${fmt.comp(mesAtual())})`, l.filter(excAtrasada).length, { cls: 'alerta' }) + quadro(`Com META até ${fmt.comp(mesAtual())}`, l.length) + quadro('Ainda não excluídas', l.filter(e => excSit(e) === 'Em exclusão').length, { cls: 'ouro' }) + quadro('Já excluídas', l.filter(e => excSit(e) === 'Já excluída').length),
  ret: l => quadro('Aguardando retorno', l.length) + quadro('Retornam no próximo mês', l.filter(e => /próximo/.test(retSit(e))).length, { cls: 'ouro' }) + quadro('Retorno vencido', l.filter(e => /vencido/.test(retSit(e))).length, { cls: 'alerta' }),
};
const NOMES = { base: 'Base do Planejamento', zer: 'Zeramento do Simples', exc: 'Exclusão do Simples', ret: 'Retorno ao Planejamento' };

function exportarTudo() {
  const aba = k => { const cols = COLS[k](); return { nome: NOMES[k], titulo: NOMES[k].toUpperCase(), sub: `Posição em ${fmt.data(hoje())}`, cols: cols.map(c => ({ label: c.label })), rows: ROWS[k]().sort((a, b) => a.razao.localeCompare(b.razao)).map(e => cols.map(c => c.get ? c.get(e) : e[c.key] ?? '')) }; };
  xlsxAttiva(`PLANEJAMENTO_${hoje()}`, ['base', 'zer', 'exc', 'ret'].map(aba));
}
function tela(k) {
  return el => {
    const g = grids[k] ||= new Grid({ titulo: NOMES[k], arquivo: NOMES[k], rows: ROWS[k], cols: COLS[k], podeEditar: can('simples', 'editar'), exportar: can('simples', 'exportar'), acoes: can('simples', 'exportar') ? [{ t: 'Excel (4 abas)', on: exportarTudo }] : [], vazio: 'Nenhuma empresa nesta lista.' });
    if (!g.sorts.length) g.sorts.push(k === 'zer' ? { k: 'pend', d: -1 } : k === 'ret' ? { k: 'retorno', d: 1 } : k === 'exc' ? { k: 'meta', d: 1 } : { k: 'razao', d: 1 });
    g.o.onView = () => { const q = $('.quadros', el); if (q) q.innerHTML = QUADROS[k](ROWS[k]()); };
    el.innerHTML = `<p class="dica">${esc(DICA[k])}</p><div class="quadros"></div><div class="gr"></div>`; g.mount($('.gr', el)); return () => g.refresh();
  };
}
function rPlan(el) {
  automacoes();
  return abas(el, [{ id: 'base', t: 'Base do Planejamento', fn: tela('base') }, { id: 'zer', t: 'Zeramento do Simples', fn: tela('zer') }, { id: 'exc', t: 'Exclusão do Simples', fn: tela('exc') }, { id: 'ret', t: 'Retorno ao Planejamento', fn: tela('ret') }], st);
}
// alertas para o Painel
export function alertasPlan() {
  const l = emps(), out = [], b = ROWS.base(), z = ROWS.zer().filter(e => zerCalc(e).pend.length).length, x = ROWS.exc().filter(excAtrasada).length;
  const tr = b.filter(e => /pendente/.test(trSit(e))).length, fa = ROWS.zer().filter(e => fatAl(e) === 'Voltar faturamento').length, sc = b.filter(e => !e.contrato).length;
  if (z) out.push([`${z} empresa(s) com meses a zerar no Simples`, '#simples']);
  if (x) out.push([`${x} exclusão(ões) do Simples atrasada(s)`, '#simples']);
  if (tr) out.push([`${tr} empresa(s) com transição para a Rotina pendente (Resultado, Decisão ou Responsável)`, '#simples']);
  if (fa) out.push([`${fa} empresa(s) ficaram no Simples: o faturamento tem que voltar`, '#simples']);
  if (sc) out.push([`${sc} empresa(s) do Planejamento aguardando contrato`, '#simples']);
  return out;
}
export const rotas = { simples: { titulo: 'Planejamento', render: rPlan } };
