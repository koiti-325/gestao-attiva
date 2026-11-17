// CONTROLE: Painel, Obrigações por competência, Zeramento/Exclusão do Simples, Demandas entre setores.
import { $, $$, esc, norm, digits, parseData, importarPlanilha, S, can, isAdmin, store, fmt, hoje, mesAtual, compAdd, compAtual, compDiff, funcNome, respId, respNome, tipoRegime, pendencia, funcsAtivos, gravar, excluir, gravarLote, audit, toast, modal, confirmar, formModal, xlsxAttiva, abas, quadro, assinarControle, assinarComp, audsDe, nivelAud } from './core.js';
import { Grid } from './grid.js';
import { ferias, ferrVisiveis, cartoesFerr } from './mod-gestao.js';

const st = { controle: { comp: compAtual() }, simples: {} }, grids = {};
const emps = () => [...S.data.empresas].map(([id, e]) => ({ id, ...e }));
const semId = ({ id, ...e }) => e;
const REGIMES = ['Simples Nacional', 'Lucro Presumido', 'Lucro Real'];

// ================= OBRIGAÇÕES =================
const procs = () => [...S.data.processos].map(([id, p]) => ({ id, ...p })).filter(p => p.ativo !== false).sort((a, b) => (a.ordem || 0) - (b.ordem || 0) || a.nome.localeCompare(b.nome));
const aplica = (p, e) => {
  if (e.status === 'Inativo' || e.area !== 'Fiscal' || (p.exigeIE && !e.ie)) return false;
  const t = tipoRegime(e), rs = p.regimes || []; if (!rs.length) return true;
  return t === 'Lucro' ? rs.some(r => r.startsWith('Lucro')) : rs.includes(t === 'Simples' ? 'Simples Nacional' : t);
};
const venc = (p, comp) => { if (!p.vencDia) return ''; const m = compAdd(comp, 1), [y, mm] = m.split('-').map(Number); return `${m}-${String(Math.min(p.vencDia, new Date(y, mm, 0).getDate())).padStart(2, '0')}`; };
const item = (p, e, comp) => S.data.controle.get(`${comp}__${p.id}`)?.itens?.[e.id];
const sit = (p, e, comp) => { if (!aplica(p, e)) return '—'; const s = item(p, e, comp)?.s; if (s === 'C') return 'Concluída'; if (s === 'V') return 'Conferida'; if (s === 'E') return 'Com erro'; if (s === 'D') return 'Dispensada'; const v = venc(p, comp); return v && hoje() > v ? 'Atrasada' : 'Pendente'; };
const CLS = { 'Concluída': 'verde', 'Conferida': 'conf', 'Com erro': 'erro', 'Dispensada': 'azul', 'Atrasada': 'verm', 'Pendente': 'cinza' };
const FEITA = new Set(['Concluída', 'Conferida', 'Dispensada']), SIT_NOME = { P: 'Pendente', C: 'Concluída', V: 'Conferida', E: 'Com erro', D: 'Dispensada' };
// conferência (V) guarda quem conferiu sem apagar quem concluiu
const marcar = (p, ids, s, comp, nota) => { const eu = S.user.nome || S.user.email, it = { s, ...(s === 'V' ? { cd: hoje(), cu: eu } : { d: hoje(), u: eu }), ...(nota !== undefined ? { n: nota } : {}) }; store.set('controle', `${comp}__${p.id}`, { comp, proc: p.id, itens: Object.fromEntries(ids.map(id => [id, it])) }, true); };
export function resumoObrig(comp, lista = emps()) {
  return procs().map(p => { const ap = lista.filter(e => aplica(p, e)), ss = ap.map(e => sit(p, e, comp)); return { p, total: ap.length, ok: ss.filter(s => FEITA.has(s)).length, conf: ss.filter(s => s === 'Conferida').length, erro: ss.filter(s => s === 'Com erro').length, atras: ss.filter(s => s === 'Atrasada').length, venc: venc(p, comp) }; }).filter(r => r.total);
}
export const barrasObrig = (rs) => rs.map(r => { const pc = r.total ? Math.round(r.ok / r.total * 100) : 0; return `<div class="prog"><div class="prog-t"><b>${esc(r.p.nome)}</b><span>${r.ok}/${r.total} · ${pc}%</span></div><div class="prog-b"><i style="width:${pc}%" class="${pc === 100 ? 'ok' : ''}"></i></div><small>${r.venc ? `Vence ${fmt.data(r.venc)}` : 'Sem vencimento definido'}${r.conf ? ` · ${r.conf} conferida(s)` : ''}${r.atras ? ` · <span class="tx-verm">${r.atras} atrasada(s)</span>` : ''}${r.erro ? ` · <span class="tx-verm">${r.erro} com erro</span>` : ''}</small></div>`; }).join('');

function acompanhamento(el) {
  const s = st.controle; assinarControle(s.comp);
  const g = grids.ctrl ||= new Grid({
    titulo: 'Controle de obrigações', podeEditar: can('controle', 'editar'), rows: () => { const ps = procs(); return emps().filter(e => ps.some(p => aplica(p, e))); },
    sub: () => `Competência ${fmt.comp(s.comp)} · posição em ${fmt.data(hoje())}`,
    cols: () => [{ key: 'razao', label: 'Empresa', w: 230, html: e => `${e.prioritario ? '<span class="tag ouro">★</span> ' : ''}${esc(e.razao)}` }, { key: 'cnpj', label: 'CNPJ', get: e => fmt.cnpj(e.cnpj), w: 140 }, { key: 'reg', label: 'Regime', get: tipoRegime }, { key: 'grupo', label: 'Grupo' }, { key: 'resp', label: 'Responsável', get: respNome },
      ...procs().map(p => ({ key: 'p_' + p.id, label: p.nome, cls: 'c', get: e => sit(p, e, s.comp), html: e => { const x = sit(p, e, s.comp), it = item(p, e, s.comp); return x === '—' ? '<span class="na">—</span>' : `<span class="chip ${CLS[x]}" title="${esc(it?.n || 'Clique para alterar')}">${x}${it?.n ? ' •' : ''}</span>`; },
        click: (e, ev) => { if (aplica(p, e)) menuSit(p, e, s.comp, ev); } }))],
    lote: can('controle', 'editar') ? [{
      t: 'Marcar obrigação…', on: ids => formModal({
        titulo: `Marcar ${ids.length} empresas`, largo: false, salvar: 'Aplicar',
        campos: [{ k: 'p', label: 'Obrigação', type: 'select', vazio: false, options: procs().map(p => ({ v: p.id, t: p.nome })) }, { k: 's', label: 'Situação', type: 'select', vazio: false, options: [{ v: 'C', t: 'Concluída' }, ...(can('controle', 'conferir') ? [{ v: 'V', t: 'Conferida' }] : []), { v: 'E', t: 'Com erro (refazer)' }, { v: 'D', t: 'Dispensada' }, { v: 'P', t: 'Pendente' }] }],
        onSave: v => { const p = procs().find(x => x.id === v.p), ok = ids.filter(id => aplica(p, { id, ...S.data.empresas.get(id) })); marcar(p, ok, v.s, s.comp); audit('Lote', 'controle', `${s.comp}__${p.id}`, `${p.nome} ${fmt.comp(s.comp)}: ${ok.length} empresas → ${SIT_NOME[v.s]}`); toast(`${ok.length} empresas marcadas.`); },
      }),
    }] : [],
    acoes: [...(can('controle', 'editar') ? [{ t: 'Importar do G-Click', on: () => importarGclick(s.comp) }] : []), ...(can('controle', 'exportar') ? [{ t: 'Resumo por responsável', on: gr => resumoResp(gr.viewRows, s.comp) }, { t: 'Exportar pendências', cls: 'pri', on: gr => exportarPend(gr.viewRows, s.comp) }, { t: 'Exportar', on: gr => gr.exportar() }] : [])],
    vazio: procs().length ? 'Nenhuma empresa da Rotina se enquadra nas obrigações cadastradas.' : 'Cadastre as obrigações na aba “Cadastro de obrigações” para começar o controle.',
  });
  if (!s.meu && !isAdmin() && funcNome(S.user.funcId)) { s.meu = true; g.f.resp = new Set([funcNome(S.user.funcId)]); } // colaborador abre na própria carteira
  el.innerHTML = `<div class="g-bar"><div class="g-busca"><label for="cmp"><b>Competência</b></label><button class="btn mini" data-m="-1" aria-label="Competência anterior">‹</button><input id="cmp" type="month" value="${s.comp}"><button class="btn mini" data-m="1" aria-label="Próxima competência">›</button>
    <span class="dica">Apurada em ${fmt.comp(compAdd(s.comp, 1))}. Clique na situação para marcar, conferir ou apontar erro.</span></div></div><div class="resumo progs"></div><div class="gr"></div>`;
  const troca = c => { if (!/^\d{4}-\d{2}$/.test(c)) return; s.comp = c; acompanhamento(el); };
  $('#cmp', el).onchange = e => troca(e.target.value); $$('[data-m]', el).forEach(b => b.onclick = () => troca(compAdd(s.comp, +b.dataset.m)));
  g.o.onView = rows => { const r = resumoObrig(s.comp, rows); $('.resumo', el).innerHTML = r.length ? barrasObrig(r) : ''; }; // usa sempre a tela atual
  g.mount($('.gr', el)); return () => g.refresh();
}
function menuSit(p, e, comp, ev) {
  $('.g-pop')?.remove(); const it = item(p, e, comp) || {}, pop = document.createElement('div'); pop.className = 'g-pop';
  const ops = ['P', 'C', ...(can('controle', 'conferir') ? ['V'] : []), 'E', 'D'];
  pop.innerHTML = `<b>${esc(p.nome)}</b><small>${esc(e.razao)}</small>${it.u ? `<small>Marcada por ${esc(it.u)} em ${fmt.data(it.d)}${it.cu ? ` · conferida por ${esc(it.cu)} em ${fmt.data(it.cd)}` : ''}</small>` : ''}
    <input type="text" placeholder="Observação ou nº do recibo (opcional)" value="${esc(it.n || '')}" aria-label="Observação"><div class="sit-ops">${ops.map(x => `<button class="btn mini ${(it.s || 'P') === x ? 'pri' : ''}" data-s="${x}">${SIT_NOME[x]}</button>`).join('')}</div>`;
  document.body.append(pop); pop.style.top = Math.min(ev.clientY + 8, innerHeight - 230) + 'px'; pop.style.left = Math.max(4, Math.min(ev.clientX - 130, innerWidth - 270)) + 'px';
  const fechar = () => { pop.remove(); document.removeEventListener('mousedown', fora, true); }, fora = x => { if (!pop.contains(x.target)) fechar(); };
  setTimeout(() => document.addEventListener('mousedown', fora, true), 0);
  pop.onclick = x => { const k = x.target.dataset.s; if (!k) return; marcar(p, [e.id], k, comp, $('input', pop).value.trim()); fechar(); };
}
// Radar: uma linha por responsável (ou grupo) com execução, conferência, atrasos, erros e auditoria
function radar(el) {
  const s = st.controle; assinarControle(s.comp); if (can('auditfiscal')) assinarComp('auditorias', s.comp);
  const linhas = () => {
    const ps = procs(), m = new Map();
    for (const e of emps()) {
      const ap = ps.filter(p => aplica(p, e)); if (!ap.length) continue;
      const k = s.porGrupo ? (e.grupo || '(sem grupo)') : (respNome(e) || 'Sem responsável');
      const o = m.get(k) || m.set(k, { id: k, nome: k, emp: 0, tot: 0, ok: 0, conf: 0, atr: 0, err: 0, aud: 0, crit: 0 }).get(k);
      o.emp++; for (const p of ap) { const x = sit(p, e, s.comp); o.tot++; if (FEITA.has(x)) o.ok++; if (x === 'Conferida') o.conf++; if (x === 'Atrasada') o.atr++; if (x === 'Com erro') o.err++; }
      const as = audsDe(s.comp, e.id); if (as.length) { o.aud++; if (nivelAud(as) === 'Crítico') o.crit++; }
    }
    return [...m.values()];
  };
  const pc = (a, b) => b ? Math.round(a / b * 100) : 0, barra = (v, cls = '') => `<div class="mini-b"><i class="${cls}" style="width:${v}%"></i></div> ${v}%`;
  const g = grids.radar ||= new Grid({
    titulo: 'Radar do departamento', rows: linhas, exportar: can('controle', 'exportar'), sub: () => `Competência ${fmt.comp(s.comp)} · posição em ${fmt.data(hoje())}`,
    cols: () => [{ key: 'nome', label: s.porGrupo ? 'Grupo' : 'Responsável', w: 190, html: o => o.nome.startsWith('Sem ') || o.nome.startsWith('(') ? `<span class="tag verm">${esc(o.nome)}</span>` : `<b>${esc(o.nome)}</b>` }, { key: 'emp', label: 'Empresas', cls: 'num' }, { key: 'tot', label: 'Obrigações', cls: 'num' },
      { key: 'pok', label: 'Concluído', w: 150, get: o => pc(o.ok, o.tot), html: o => barra(pc(o.ok, o.tot), pc(o.ok, o.tot) === 100 ? 'ok' : '') }, { key: 'pcf', label: 'Conferido', w: 150, get: o => pc(o.conf, o.tot), html: o => barra(pc(o.conf, o.tot), 'ok') },
      { key: 'pen', label: 'Pendentes', cls: 'num', get: o => o.tot - o.ok }, { key: 'atr', label: 'Atrasadas', cls: 'num', html: o => o.atr ? `<span class="chip verm">${o.atr}</span>` : '0' }, { key: 'err', label: 'Com erro', cls: 'num', html: o => o.err ? `<span class="chip erro">${o.err}</span>` : '0' },
      { key: 'aud', label: 'Auditadas', cls: 'num', get: o => o.aud, html: o => `${o.aud}/${o.emp}` }, { key: 'crit', label: 'Auditoria crítica', cls: 'num', html: o => o.crit ? `<span class="chip verm">${o.crit}</span>` : '0' }],
    acoes: [{ t: 'Alternar responsável / grupo', on: gr => { s.porGrupo = !s.porGrupo; gr.refresh(); } }],
    vazio: 'Cadastre as obrigações e as empresas da Rotina para o radar aparecer.',
  });
  g.sorts.length || g.sorts.push({ k: 'atr', d: -1 }, { k: 'pen', d: -1 });
  g.o.onView = () => {
    const l = linhas(), t = k => l.reduce((a, o) => a + o[k], 0), tot = t('tot'), sem = l.find(o => o.nome === 'Sem responsável');
    $('.quadros', el).innerHTML = quadro('Obrigações na competência', tot, { sub: `${t('emp')} empresas` }) + quadro('Concluído', pc(t('ok'), tot) + '%', { sub: `${t('ok')} de ${tot}` }) + quadro('Conferido', pc(t('conf'), tot) + '%', { sub: `${t('conf')} conferidas`, cls: 'ouro' })
      + quadro('Atrasadas', t('atr'), { cls: t('atr') ? 'alerta' : '' }) + quadro('Com erro', t('err'), { cls: t('err') ? 'alerta' : '' }) + quadro('Sem responsável', sem ? sem.emp : 0, { cls: sem ? 'alerta' : '', sub: 'empresas com obrigação' }) + quadro('Auditoria crítica', t('crit'), { cls: t('crit') ? 'alerta' : '', sub: `${t('aud')} empresas auditadas` });
  };
  el.innerHTML = `<p class="dica">Competência <b>${fmt.comp(s.comp)}</b> (troque na aba Acompanhamento). Concluído = o responsável marcou; Conferido = o líder revisou; Auditoria = confronto XML × EFD gravado na competência. Clique nos títulos para ordenar.</p><div class="quadros"></div><div class="gr"></div>`;
  g.mount($('.gr', el)); return () => g.refresh();
}
// Importa o relatório de tarefas do G-Click: concluída lá = Concluída aqui (não mexe em Conferida, Com erro nem Dispensada)
function importarGclick(comp) {
  importarPlanilha({
    titulo: `Tarefas do G-Click · competência ${fmt.comp(comp)}`,
    campos: [{ k: 'cli', label: 'Cliente (com CNPJ)', sin: ['Cliente', 'CNPJ', 'Empresa', 'Inscrição'], req: true }, { k: 'obr', label: 'Nome da tarefa / obrigação', sin: ['Nome', 'Obrigação', 'Tarefa', 'Obrigacao'], req: true }, { k: 'st', label: 'Status', sin: ['Status', 'Situação'], req: true }, { k: 'cmp', label: 'Competência (se houver)', sin: ['Competência', 'Competencia'] }, { k: 'dt', label: 'Data de conclusão', sin: ['Conclusão', 'Conclusao', 'Concluída em', 'Data conclusão', 'Data de conclusão'] }],
    onImport: async linhas => {
      const ps = procs().map(p => ({ p, al: [p.nome, ...String(p.gclick || '').split(';')].map(norm).filter(Boolean) })), acc = new Map(), semObr = new Map(); let semEmp = 0, fora = 0;
      for (const l of linhas) {
        if (l.cmp) { const c = l.cmp instanceof Date ? l.cmp.toISOString().slice(0, 7) : (String(l.cmp).match(/(\d{2})\/(\d{4})/) || []).slice(1).reverse().join('-'); if (c && c !== comp) { fora++; continue; } }
        const ob = String(l.obr || '').trim(), hit = ps.find(x => x.al.includes(norm(ob))); if (!hit) { if (ob) semObr.set(ob, (semObr.get(ob) || 0) + 1); continue; }
        const m = String(l.cli || '').match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/g), id = m ? digits(m.pop()) : digits(l.cli).padStart(14, '0');
        if (!S.data.empresas.has(id)) { semEmp++; continue; }
        const k = hit.p.id + '|' + id, o = acc.get(k) || acc.set(k, { p: hit.p, id, ok: true, dt: '' }).get(k);
        if (/conclu/i.test(String(l.st))) o.dt = parseData(l.dt) || o.dt; else o.ok = false;
      }
      const porProc = new Map(); let conc = 0, reab = 0;
      for (const o of acc.values()) {
        const cur = item(o.p, { id: o.id }, comp), s = cur?.s || 'P'; let it;
        if (o.ok && s === 'P') { it = { s: 'C', d: o.dt || hoje(), u: 'G-Click', g: true }; conc++; }
        else if (!o.ok && s === 'C' && cur.g) { it = { s: 'P', d: hoje(), u: 'G-Click', g: true }; reab++; } // reaberta no G-Click
        if (it) (porProc.get(o.p.id) || porProc.set(o.p.id, {}).get(o.p.id))[o.id] = it;
      }
      for (const [pid, itens] of porProc) store.set('controle', `${comp}__${pid}`, { comp, proc: pid, itens }, true);
      audit('Lote', 'controle', comp, `Importação G-Click ${fmt.comp(comp)}: ${conc} concluídas, ${reab} reabertas, ${acc.size} tarefas reconhecidas`);
      setTimeout(() => modal({ titulo: 'Importação do G-Click', html: `<p><b>${acc.size}</b> obrigações reconhecidas · <b>${conc}</b> marcadas como concluídas · <b>${reab}</b> reabertas.</p>${fora ? `<p class="dica">${fora} linha(s) de outra competência foram ignoradas.</p>` : ''}${semEmp ? `<p class="tx-verm">${semEmp} linha(s) de CNPJ que não está no cadastro de empresas.</p>` : ''}${semObr.size ? `<p class="tx-verm">Tarefas sem obrigação correspondente (informe o nome em Cadastro de obrigações › “Nome(s) da tarefa no G-Click”):</p><ul>${[...semObr].map(([n, q]) => `<li>${esc(n)} (${q})</li>`).join('')}</ul>` : ''}`, botoes: [{ t: 'Fechar', cls: 'pri' }] }), 80);
      return conc + reab;
    },
  });
}
function pendencias(rows, comp) {
  const out = [];
  for (const e of rows) for (const p of procs()) { const x = sit(p, e, comp); if (x === 'Pendente' || x === 'Atrasada' || x === 'Com erro') out.push({ e, p, x, resp: respNome(e) || 'Sem responsável' }); }
  return out;
}
function resumoResp(rows, comp) {
  const ps = procs(), m = new Map();
  for (const e of rows) { const k = respNome(e) || 'Sem responsável'; if (!m.has(k)) m.set(k, {}); for (const p of ps) { const x = sit(p, e, comp); if (x === '—') continue; const o = m.get(k)[p.id] ||= { t: 0, ok: 0, at: 0 }; o.t++; if (FEITA.has(x)) o.ok++; if (x === 'Atrasada' || x === 'Com erro') o.at++; } }
  const linhas = [...m].sort((a, b) => a[0].localeCompare(b[0]));
  modal({
    titulo: `Resumo por responsável · ${fmt.comp(comp)}`, largo: true,
    html: `<div class="g-wrap"><table class="g"><thead><tr><th>Responsável</th>${ps.map(p => `<th class="c">${esc(p.nome)}</th>`).join('')}</tr></thead><tbody>${linhas.map(([n, o]) => `<tr><td><b>${esc(n)}</b></td>${ps.map(p => { const x = o[p.id]; return `<td class="c">${x ? `<span class="chip ${x.ok === x.t ? 'verde' : x.at ? 'verm' : 'cinza'}">${x.ok}/${x.t}</span>` : '<span class="na">—</span>'}</td>`; }).join('')}</tr>`).join('')}</tbody></table></div><p class="dica">Concluídas (ou dispensadas) / aplicáveis, conforme os filtros da tela.</p>`,
    botoes: [{ t: 'Fechar' }, { t: 'Excel', cls: 'pri', on: () => xlsxAttiva(`RESUMO_OBRIGACOES_${comp}`, [{ nome: 'Resumo', titulo: 'RESUMO POR RESPONSÁVEL', sub: `Competência ${fmt.comp(comp)} · concluídas/aplicáveis`, cols: [{ label: 'Responsável', w: 30 }, ...ps.map(p => ({ label: p.nome, w: 18 }))], rows: linhas.map(([n, o]) => [n, ...ps.map(p => o[p.id] ? `${o[p.id].ok}/${o[p.id].t}` : '—')]) }]) }],
  });
}
function exportarPend(rows, comp) {
  const pend = pendencias(rows, comp); if (!pend.length) return toast('Nenhuma pendência nos filtros atuais.');
  formModal({
    titulo: `Exportar ${pend.length} pendências`, largo: false, salvar: 'Gerar Excel',
    campos: [{ k: 'modo', label: 'Formato', type: 'select', vazio: false, options: [{ v: 'abas', t: 'Uma aba por responsável (para enviar a cada um)' }, { v: 'geral', t: 'Aba geral única' }] }],
    onSave: async v => {
      const cols = [{ label: 'Nº', w: 6 }, { label: 'Empresa', w: 50 }, { label: 'CNPJ', w: 21 }, { label: 'Grupo', w: 20 }, { label: 'Responsável', w: 22 }, { label: 'Obrigação', w: 24 }, { label: 'Situação', w: 12 }, { label: 'Vencimento', w: 13 }];
      const aba = (nome, l) => ({ nome, titulo: `PENDÊNCIAS · ${nome.toUpperCase()}`, sub: `Competência ${fmt.comp(comp)} · posição em ${fmt.data(hoje())}`, contadores: [['PENDÊNCIAS', l.length], ['ATRASADAS OU COM ERRO', l.filter(x => x.x !== 'Pendente').length]], cols, rows: l.map((x, i) => [i + 1, x.e.razao, fmt.cnpj(x.e.cnpj), x.e.grupo || '', x.resp, x.p.nome, x.x, fmt.data(venc(x.p, comp))]), destaque: i => l[i].x !== 'Pendente' });
      const rs = [...new Set(pend.map(x => x.resp))].sort();
      await xlsxAttiva(`PENDENCIAS_${comp}`, v.modo === 'abas' ? rs.map(r => aba(r, pend.filter(x => x.resp === r))) : [aba('Geral', pend)]);
    },
  });
}
function cadastroObrig(el) {
  const editar = p => {
    const m = formModal({
      titulo: p ? p.nome : 'Nova obrigação', valores: p ? { ...p, ativo: p.ativo !== false } : { ativo: true },
      campos: [{ k: 'nome', label: 'Nome da obrigação', req: true, ph: 'Ex.: DAS, ICMS + EFD ICMS' }, { k: 'gclick', label: 'Nome(s) da tarefa no G-Click', ph: 'Ex.: ICMS; EFD ICMS/IPI (DIA 15)', ajuda: 'Separe por ponto e vírgula. Com mais de uma tarefa, só conclui quando todas estiverem concluídas.' }, { k: 'vencDia', label: 'Vence no dia (mês seguinte à competência)', type: 'number', ajuda: 'Deixe vazio se não quiser controle de atraso.' }, { k: 'ordem', label: 'Ordem na tela', type: 'number' }, { k: 'exigeIE', label: 'Só para quem tem I.E.', type: 'check', rot: 'Exige Inscrição Estadual' }, { k: 'ativo', label: 'Situação', type: 'check', rot: 'Obrigação ativa' }, { k: 'obs', label: 'Observação', type: 'textarea', full: true }],
      extra: `<div class="campo full"><label>Regimes em que se aplica (nenhum marcado = todos)</label><div class="cols-exp">${REGIMES.map(r => `<label class="chk"><input type="checkbox" data-rg="${r}" ${p?.regimes?.includes(r) ? 'checked' : ''}> ${r}</label>`).join('')}</div></div>${p ? '<p><button type="button" class="btn perigo mini" data-del>Excluir obrigação</button></p>' : ''}`,
      onSave: (v, bg) => { if (v.vencDia !== '' && (v.vencDia < 1 || v.vencDia > 31)) return 'Dia de vencimento entre 1 e 31.'; gravar('processos', p?.id || store.newId(), { ...v, regimes: $$('[data-rg]:checked', bg).map(x => x.dataset.rg) }, v.nome); },
    });
    $('[data-del]', m.el)?.addEventListener('click', async () => { if (await confirmar(`Excluir a obrigação ${p.nome}? O histórico marcado continua guardado.`, 'Excluir')) { excluir('processos', p.id, p.nome); m.close(); } });
  };
  const g = grids.proc ||= new Grid({
    titulo: 'Obrigações', rows: () => [...S.data.processos].map(([id, p]) => ({ id, ...p })), onRow: isAdmin() ? editar : null,
    cols: [{ key: 'ordem', label: 'Ordem', cls: 'num' }, { key: 'nome', label: 'Obrigação', w: 220 }, { key: 'gclick', label: 'Tarefa no G-Click', w: 200 }, { key: 'reg', label: 'Regimes', get: p => p.regimes?.join(', ') || 'Todos' }, { key: 'ie', label: 'Exige I.E.', get: p => p.exigeIE ? 'Sim' : 'Não' }, { key: 'venc', label: 'Vence dia', cls: 'num', get: p => p.vencDia || '' }, { key: 'ativo', label: 'Ativa', get: p => p.ativo === false ? 'Não' : 'Sim' }, { key: 'obs', label: 'Observação', w: 240 }],
    acoes: isAdmin() ? [{ t: 'Carregar sugestões', on: () => { if (S.data.processos.size) return toast('Já existem obrigações cadastradas.', 'erro'); gravarLote('processos', [['DAS', ['Simples Nacional'], false, 20, 'DAS SIMPLES'], ['IRRF Aluguel', [], false, 20, 'IRRF SOBRE ALUGUEL'], ['ICMS + EFD ICMS', ['Lucro Presumido', 'Lucro Real'], true, '', 'ICMS; EFD ICMS/IPI (DIA 15)']].map(([nome, regimes, exigeIE, vencDia, gclick], i) => [store.newId(), { nome, regimes, exigeIE, vencDia, gclick, ordem: i + 1, ativo: true, obs: vencDia ? '' : 'Defina o dia de vencimento.' }]), 'Obrigações sugeridas'); } }, { t: '+ Nova obrigação', cls: 'pri', on: () => editar() }] : [],
    vazio: 'Nenhuma obrigação cadastrada. Use “Carregar sugestões” ou “+ Nova obrigação”.',
  });
  el.innerHTML = '<p class="dica">Cada obrigação vira uma coluna no acompanhamento. A competência é o mês apurado; o vencimento cai no mês seguinte. Confira os dias de vencimento antes de usar.</p><div class="gr"></div>'; g.mount($('.gr', el)); return () => g.refresh();
}
const rControle = el => abas(el, [{ id: 'ac', t: 'Acompanhamento', fn: acompanhamento }, { id: 'radar', t: 'Radar do departamento', fn: radar }, ...(isAdmin() ? [{ id: 'cad', t: 'Cadastro de obrigações', fn: cadastroObrig }] : [])], st.controle);

// ================= ZERAMENTO E EXCLUSÃO DO SIMPLES =================
const plan = () => emps().filter(e => e.area === 'Planejamento' && e.status !== 'Inativo');
const svPlan = (e, k, v, rot) => gravar('empresas', e.id, { ...semId(e), plan: { ...(e.plan || {}), [k]: v } }, `${rot}: ${e.razao}`);
// zerar da Comp. Lucro até o mês anterior ao atual
export const zer = e => { const c = e.plan?.compLucro; if (!c) return { pend: '', st: 'Sem Comp. Lucro' }; const ult = compAdd(mesAtual(), -1), z = e.plan?.zerAte, ini = z && z >= c ? compAdd(z, 1) : c, n = Math.max(0, compDiff(ini, ult) + 1); return { pend: n, st: n ? 'PENDENTE' : 'EM DIA' }; };
export const exc = e => { const m = e.plan?.meta; if (e.sn?.sit === 'Excluída') return 'Excluída'; if (!m) return 'Sem meta'; return m < mesAtual() ? 'Atrasada' : m === mesAtual() ? 'Meta deste mês' : 'No prazo'; };
const mes = (k, rot) => ({ type: 'month', get: e => e.plan?.[k] || '', save: (e, v) => svPlan(e, k, v, rot) });
function gridZer(el) {
  const s = st.simples;
  const g = grids.zer ||= new Grid({
    titulo: 'Zeramento do Simples', podeEditar: can('simples', 'editar'), exportar: can('simples', 'exportar'), rows: () => plan().filter(e => s.zTodas || e.plan?.compLucro),
    cols: [{ key: 'pend', label: 'Pendentes', cls: 'num', get: e => zer(e).pend, html: e => { const z = zer(e); return z.pend ? `<span class="chip verm">${z.pend}</span>` : esc(z.pend); } }, { key: 'st', label: 'Status', get: e => zer(e).st, html: e => { const x = zer(e).st; return `<span class="chip ${x === 'EM DIA' ? 'verde' : x === 'PENDENTE' ? 'verm' : 'cinza'}">${x}</span>`; } },
      { key: 'razao', label: 'Empresa', w: 240 }, { key: 'cnpj', label: 'CNPJ', get: e => fmt.cnpj(e.cnpj), w: 140 }, { key: 'resp', label: 'Responsável', get: respNome },
      { key: 'cl', label: 'Comp. Lucro', get: e => fmt.comp(e.plan?.compLucro), sort: e => e.plan?.compLucro || '', edit: mes('compLucro', 'Comp. Lucro') }, { key: 'za', label: 'Zerado até', get: e => fmt.comp(e.plan?.zerAte), sort: e => e.plan?.zerAte || '', edit: mes('zerAte', 'Zeramento') },
      { key: 'sn', label: 'Situação SN', get: e => e.sn?.txt || e.sn?.sit || '' }, { key: 'zo', label: 'Observação', w: 240, get: e => e.plan?.zerObs || '', edit: { type: 'text', save: (e, v) => svPlan(e, 'zerObs', v, 'Zeramento') } }],
    acoes: [{ t: 'Mostrar todas do Planejamento', on: gr => { s.zTodas = !s.zTodas; gr.refresh(); toast(s.zTodas ? 'Mostrando todas as empresas do Planejamento.' : 'Mostrando só empresas com Comp. Lucro.'); } }],
  });
  g.sorts.length || g.sorts.push({ k: 'pend', d: -1 });
  el.innerHTML = '<p class="dica">Zerar a partir da Comp. Lucro até o mês anterior ao atual. EM DIA = declarada zerada até a última competência. Clique em Comp. Lucro, Zerado até ou Observação para editar direto na célula.</p><div class="gr"></div>'; g.mount($('.gr', el)); return () => g.refresh();
}
function gridExc(el) {
  const s = st.simples;
  const g = grids.exc ||= new Grid({
    titulo: 'Exclusão do Simples', podeEditar: can('simples', 'editar'), exportar: can('simples', 'exportar'), rows: () => plan().filter(e => s.eTodas || (e.plan?.meta && e.plan.meta <= mesAtual() && e.sn?.sit !== 'Excluída')),
    cols: [{ key: 'st', label: 'Status', get: exc, html: e => { const x = exc(e); return `<span class="chip ${x === 'Excluída' ? 'verde' : x === 'Atrasada' ? 'verm' : x === 'Meta deste mês' ? 'ouro' : 'cinza'}">${x}</span>`; } }, { key: 'razao', label: 'Empresa', w: 240 }, { key: 'cnpj', label: 'CNPJ', get: e => fmt.cnpj(e.cnpj), w: 140 }, { key: 'resp', label: 'Responsável', get: respNome },
      { key: 'meta', label: 'META', get: e => fmt.comp(e.plan?.meta), sort: e => e.plan?.meta || '', edit: mes('meta', 'Meta de exclusão') }, { key: 'sn', label: 'Situação SN', get: e => e.sn?.txt || e.sn?.sit || '' }, { key: 'ex', label: 'Excluída em', get: e => fmt.data(e.sn?.excluidaEm) },
      { key: 'eo', label: 'Observação', w: 260, get: e => e.plan?.excObs || '', edit: { type: 'text', save: (e, v) => svPlan(e, 'excObs', v, 'Exclusão') } }],
    acoes: [{ t: 'Mostrar todas do Planejamento', on: gr => { s.eTodas = !s.eTodas; gr.refresh(); toast(s.eTodas ? 'Mostrando todas as empresas do Planejamento.' : 'Mostrando só metas até o mês atual, ainda não excluídas.'); } }],
  });
  g.sorts.length || g.sorts.push({ k: 'meta', d: 1 });
  el.innerHTML = '<p class="dica">Aparecem as empresas com META até o mês atual que ainda não foram excluídas. A situação do Simples vem do cadastro da empresa.</p><div class="gr"></div>'; g.mount($('.gr', el)); return () => g.refresh();
}
const rSimples = el => abas(el, [{ id: 'zer', t: 'Zeramento do Simples', fn: gridZer }, { id: 'exc', t: 'Exclusão do Simples', fn: gridExc }], st.simples);

// ================= DEMANDAS ENTRE SETORES =================
const DEPS = ['Contábil', 'Departamento Pessoal', 'Societário', 'Cadastro', 'Financeiro'];
const demSit = d => ['Concluída', 'Cancelada'].includes(d.status) ? d.status : d.prazo && d.prazo < hoje() ? 'Atrasada' : d.status || 'Aberta';
function editarDem(d) {
  const novo = !d, pode = can('demandas', novo ? 'criar' : 'editar');
  const m = formModal({
    titulo: novo ? 'Nova demanda' : d.titulo, valores: d || { aberta: hoje(), status: 'Aberta', sentido: 'NIT enviou' }, salvar: pode ? 'Salvar' : 'Fechar',
    campos: [{ k: 'titulo', label: 'O que foi pedido', req: true, full: true }, { k: 'dep', label: 'Setor', type: 'select', vazio: false, options: DEPS, req: true }, { k: 'sentido', label: 'Sentido', type: 'select', vazio: false, options: ['NIT enviou', 'NIT recebeu'] },
      { k: 'empresa', label: 'Empresa' }, { k: 'quem', label: 'Quem cuida no NIT', type: 'select', options: funcsAtivos() }, { k: 'contato', label: 'Quem cuida no outro setor' }, { k: 'aberta', label: 'Aberta em', type: 'date', req: true }, { k: 'prazo', label: 'Prazo', type: 'date' },
      { k: 'status', label: 'Status', type: 'select', vazio: false, options: ['Aberta', 'Em andamento', 'Concluída', 'Cancelada'] }, { k: 'concluidaEm', label: 'Concluída em', type: 'date' }, { k: 'obs', label: 'Anotações', type: 'textarea', full: true }],
    extra: !novo && can('demandas', 'excluir') ? '<p><button type="button" class="btn perigo mini" data-del>Excluir demanda</button></p>' : '',
    onSave: v => { if (!pode) return; if (v.status === 'Concluída' && !v.concluidaEm) v.concluidaEm = hoje(); gravar('demandas', d?.id || store.newId(), { ...(d ? semId(d) : {}), ...v }, v.titulo); },
  });
  $('[data-del]', m.el)?.addEventListener('click', async () => { if (await confirmar('Excluir esta demanda?', 'Excluir')) { excluir('demandas', d.id, d.titulo); m.close(); } });
}
const dems = () => [...S.data.demandas].map(([id, d]) => ({ id, ...d }));
function rDemandas(el) {
  const g = grids.dem ||= new Grid({
    titulo: 'Demandas entre setores', rows: dems, onRow: editarDem, exportar: can('demandas', 'exportar'),
    cols: [{ key: 'sit', label: 'Situação', get: demSit, html: d => { const x = demSit(d); return `<span class="chip ${x === 'Concluída' ? 'verde' : x === 'Atrasada' ? 'verm' : x === 'Em andamento' ? 'azul' : 'cinza'}">${x}</span>`; } }, { key: 'dep', label: 'Setor' }, { key: 'sentido', label: 'Sentido' }, { key: 'titulo', label: 'Demanda', w: 280 }, { key: 'empresa', label: 'Empresa', w: 180 },
      { key: 'quem', label: 'Quem (NIT)', get: d => funcNome(d.quem) }, { key: 'contato', label: 'Quem (setor)' }, { key: 'aberta', label: 'Aberta em', get: d => fmt.data(d.aberta), sort: d => d.aberta || '' }, { key: 'prazo', label: 'Prazo', get: d => fmt.data(d.prazo), sort: d => d.prazo || '' }, { key: 'concl', label: 'Concluída em', get: d => fmt.data(d.concluidaEm), sort: d => d.concluidaEm || '' }],
    acoes: can('demandas', 'criar') ? [{ t: '+ Nova demanda', cls: 'pri', on: () => editarDem() }] : [],
  });
  g.sorts.length || g.sorts.push({ k: 'aberta', d: -1 });
  el.innerHTML = '<div class="quadros"></div><div class="gr"></div>'; g.mount($('.gr', el));
  const q = () => { const l = dems(), ab = l.filter(d => !['Concluída', 'Cancelada'].includes(demSit(d))); $('.quadros', el).innerHTML = quadro('Em aberto', ab.length) + quadro('Atrasadas', l.filter(d => demSit(d) === 'Atrasada').length, { cls: 'alerta' }) + quadro('NIT enviou (abertas)', ab.filter(d => d.sentido === 'NIT enviou').length) + quadro('NIT recebeu (abertas)', ab.filter(d => d.sentido === 'NIT recebeu').length); };
  q(); return () => { q(); g.refresh(); };
}

// ================= PAINEL =================
function rPainel(el) {
  const comp = compAtual(); if (can('controle')) assinarControle(comp); if (can('auditfiscal')) assinarComp('auditorias', comp);
  const desenha = () => {
    const l = emps().filter(e => e.status !== 'Inativo'), n = f => l.filter(f).length; let h = `<p class="saud">Olá, <b>${esc((S.user.nome || '').split(' ')[0])}</b>. Hoje é ${fmt.data(hoje())} · competência em apuração: <b>${fmt.comp(comp)}</b>.</p>`;
    const alertas = [];
    if (can('empresas')) { for (const k of ['Pendente de responsável', 'Pendente de grupo', 'Pendente de área']) { const q = n(e => pendencia(e) === k); if (q) alertas.push([`${q} empresa(s): ${k.toLowerCase()}`, '#empresas']); } }
    if (can('simples')) { const z = plan().filter(e => zer(e).pend > 0).length, x = plan().filter(e => ['Atrasada', 'Meta deste mês'].includes(exc(e))).length; if (z) alertas.push([`${z} empresa(s) com zeramento pendente`, '#simples']); if (x) alertas.push([`${x} exclusão(ões) do Simples com meta vencida ou neste mês`, '#simples']); }
    if (can('equipe')) { const fl = [...S.data.funcionarios.values()].map(f => [f, ferias(f)]).filter(([, x]) => x && (x.sit === 'Vencida' || x.sit === 'Alerta')).sort((a, b) => a[1].dias - b[1].dias); if (fl.length) alertas.push([`Férias: ${fl.length} colaborador(es) com prazo limite vencido ou a menos de 90 dias (${fl.slice(0, 3).map(([f, x]) => `${f.nome.split(' ')[0]} ${fmt.data(x.limite)}`).join(', ')}${fl.length > 3 ? '…' : ''})`, '#equipe']); }
    if (can('auditfiscal')) { const c = new Set([...S.data.auditorias.values()].filter(a => a.nivel === 'Crítico').map(a => a.emp)).size; if (c) alertas.unshift([`${c} empresa(s) com divergência crítica na auditoria XML × EFD de ${fmt.comp(comp)}`, '#auditfiscal']); }
    if (can('demandas')) { const a = dems().filter(d => demSit(d) === 'Atrasada').length; if (a) alertas.push([`${a} demanda(s) entre setores atrasada(s)`, '#demandas']); }
    if (can('controle')) {
      const r = resumoObrig(comp), at = r.reduce((s, x) => s + x.atras, 0), er = r.reduce((s, x) => s + x.erro, 0); if (er) alertas.unshift([`${er} obrigação(ões) apontada(s) com erro, aguardando refazer`, '#controle']); if (at) alertas.unshift([`${at} obrigação(ões) atrasada(s) na competência ${fmt.comp(comp)}`, '#controle']);
      h += `<section class="bloco"><h3 class="sec">CONTROLE · o que tinha de ser feito, foi feito? <a href="#controle">abrir</a></h3><div class="progs">${r.length ? barrasObrig(r) : '<p class="vazio">Cadastre as obrigações para acompanhar a competência.</p>'}</div></section>`;
    }
    if (alertas.length) h += `<section class="bloco"><h3 class="sec">ATENÇÃO AGORA</h3><ul class="alertas">${alertas.map(([t, href]) => `<li><a href="${href}">${esc(t)} →</a></li>`).join('')}</ul></section>`;
    if (can('empresas') || can('carteiras')) {
      const porResp = new Map(); for (const e of l) { const r = respId(e); if (r) porResp.set(r, (porResp.get(r) || 0) + 1); }
      const top = [...porResp].sort((a, b) => b[1] - a[1]), max = top[0]?.[1] || 1;
      h += `<section class="bloco"><h3 class="sec">GESTÃO · como a carteira está distribuída <a href="#${can('carteiras') ? 'carteiras' : 'empresas'}">abrir</a></h3><div class="quadros">${quadro('Empresas ativas', l.length)}${quadro('Na Rotina', n(e => e.area === 'Fiscal'))}${quadro('No Planejamento', n(e => e.area === 'Planejamento'))}${quadro('Prioritárias', n(e => e.prioritario), { cls: 'ouro' })}${quadro('Colaboradores ativos', [...S.data.funcionarios.values()].filter(f => f.ativo !== false).length)}</div>
        <div class="barras">${top.map(([id, q]) => `<div class="barra"><span>${esc(funcNome(id) || '—')}</span><div><i style="width:${Math.round(q / max * 100)}%"></i></div><b>${q}</b></div>`).join('') || '<p class="vazio">Nenhuma empresa com responsável ainda.</p>'}</div></section>`;
    }
    if (can('ferramentas')) { const f = ferrVisiveis(); h += `<section class="bloco"><h3 class="sec">FERRAMENTAS <a href="#ferramentas">ver todas</a></h3><div class="ferrs">${f.length ? cartoesFerr(f.slice(0, 8)).replace(/<button[^>]*data-ed[^>]*>.*?<\/button>/g, '') : '<p class="vazio">Nenhuma ferramenta liberada ainda.</p>'}</div></section>`; }
    el.innerHTML = h;
  };
  desenha(); return desenha;
}

export const rotas = {
  painel: { titulo: 'Painel', render: rPainel }, controle: { titulo: 'Obrigações', render: rControle },
  simples: { titulo: 'Zeramento e Exclusão do Simples', render: rSimples }, demandas: { titulo: 'Demandas entre setores', render: rDemandas },
};
