// AUDITORIA XML × EFD: lê EFD ICMS/IPI e Contribuições (ReceitanetBX) e XMLs (SEFAZ), confronta e grava o resultado por empresa/competência.
import { $, $$, esc, S, can, store, fmt, hoje, compAtual, compAdd, respNome, tipoRegime, audit, toast, modal, xlsxAttiva, loadScript, abas, quadro, assinarComp, audsDe, nivelAud } from './core.js';
import { Grid } from './grid.js';
import { spedParser, parseSped, parseXml, auditar, TIPOS } from './audit.js';

const st = { comp: compAtual() }; let ultimo = [], grid;
const EFD = { ICMS: 'EFD ICMS/IPI', CONTRIB: 'EFD Contribuições' }, CLS = { OK: 'verde', 'Atenção': 'ouro', 'Crítico': 'verm', Inconclusiva: 'cinza' };
const chip = n => n ? `<span class="chip ${CLS[n]}">${n}</span>` : '<span class="na">Não auditada</span>';
const nomeEmp = cnpj => S.data.empresas.get(cnpj)?.razao;

async function lerSped(file) { // em fluxo: aguenta EFD grande sem carregar tudo na memória
  const p = spedParser(), rd = file.stream().pipeThrough(new TextDecoderStream('latin1')).getReader(); let resto = '';
  for (;;) { const { value, done } = await rd.read(); if (done) break; const ls = (resto + value).split('\n'); resto = ls.pop(); for (const l of ls) p.linha(l); }
  if (resto) p.linha(resto); return p.fim();
}
async function processar(files, log) {
  const xmls = new Map(), cancs = new Set(), speds = []; let n = 0, ign = 0;
  const xml = t => { const x = parseXml(t); if (!x) return ign++; if (x.tipo === 'evento') { if (x.canc) cancs.add(x.chave); } else if (!xmls.has(x.chave) || x.cStat) xmls.set(x.chave, x); };
  const sped = s => { if (s.tipo && s.cnpj && s.ini) speds.push(s); else ign++; };
  if (files.some(f => /\.zip$/i.test(f.name))) await loadScript('vendor/fflate.min.js');
  for (const f of files) {
    try {
      if (/\.xml$/i.test(f.name)) xml(await f.text());
      else if (/\.txt$/i.test(f.name)) sped(await lerSped(f));
      else if (/\.zip$/i.test(f.name)) { const z = fflate.unzipSync(new Uint8Array(await f.arrayBuffer()), { filter: a => /\.(xml|txt)$/i.test(a.name) }); for (const [zn, u8] of Object.entries(z)) /\.xml$/i.test(zn) ? xml(new TextDecoder().decode(u8)) : sped(parseSped(new TextDecoder('latin1').decode(u8))); }
      else ign++;
    } catch (e) { console.warn(f.name, e); ign++; }
    if (++n % 150 === 0) { log(`Lendo arquivos… ${n} de ${files.length}`); await new Promise(r => setTimeout(r)); }
  }
  log(`Confrontando ${speds.length} EFD com ${xmls.size} XML…`); await new Promise(r => setTimeout(r));
  return { res: speds.map(s => auditar(s, xmls, cancs)), nXml: xmls.size, nCanc: cancs.size, ign };
}
function gravarResultados(res) {
  const eu = S.user.nome || S.user.email, em = new Date().toISOString();
  store.write(res.map(r => ({ t: 'set', col: 'auditorias', id: `${r.comp}__${r.cnpj}__${r.tipo}`, data: { comp: r.comp, emp: r.cnpj, nome: r.nome, tipo: r.tipo, em, por: eu, nivel: r.nivel, nSped: r.nSped, nXml: r.nXml, crit: r.crit, aten: r.aten, consolidado: r.consolidado, resumo: r.resumo, top: r.divs.slice(0, 30).map(d => ({ ...d, det: d.det.slice(0, 240) })) } })));
  audit('Lote', 'auditorias', '', `Auditoria XML × EFD: ${res.length} escriturações (${res.filter(r => r.nivel === 'Crítico').length} críticas)`);
}
const relatorio = res => xlsxAttiva(`AUDITORIA_XML_EFD_${hoje()}`, [
  { nome: 'Resumo', titulo: 'AUDITORIA XML × EFD · RESUMO', sub: `Gerado em ${fmt.data(hoje())} · ${res.length} escriturações`, contadores: [['CRÍTICAS', res.filter(r => r.nivel === 'Crítico').length], ['ATENÇÃO', res.filter(r => r.nivel === 'Atenção').length], ['OK', res.filter(r => r.nivel === 'OK').length]],
    cols: [{ label: 'Empresa', w: 44 }, { label: 'CNPJ', w: 20 }, { label: 'Responsável', w: 20 }, { label: 'Competência', w: 12 }, { label: 'Escrituração', w: 18 }, { label: 'Resultado', w: 13 }, { label: 'Notas na EFD', w: 12 }, { label: 'XML no período', w: 13 }, ...Object.values(TIPOS).map(t => ({ label: t, w: 16 }))],
    rows: res.map(r => { const e = S.data.empresas.get(r.cnpj); return [e?.razao || r.nome, fmt.cnpj(r.cnpj), e ? respNome(e) : '', fmt.comp(r.comp), EFD[r.tipo], r.nivel, r.nSped, r.nXml, ...Object.keys(TIPOS).map(t => r.resumo[t] || 0)]; }), destaque: i => res[i].nivel === 'Crítico' },
  (() => { const l = res.flatMap(r => r.divs.map(d => [r, d])); return { nome: 'Divergências', titulo: 'AUDITORIA XML × EFD · DIVERGÊNCIAS', sub: 'Linha destacada = crítica (corrigir/retificar). Demais = conferir.',
    cols: [{ label: 'Empresa', w: 40 }, { label: 'CNPJ', w: 20 }, { label: 'Comp.', w: 9 }, { label: 'Escrituração', w: 17 }, { label: 'Gravidade', w: 10 }, { label: 'Apontamento', w: 34 }, { label: 'Nº', w: 9 }, { label: 'Série', w: 6 }, { label: 'Data', w: 11 }, { label: 'Detalhe', w: 90 }, { label: 'Chave', w: 48 }],
    rows: l.map(([r, d]) => [nomeEmp(r.cnpj) || r.nome, fmt.cnpj(r.cnpj), fmt.comp(r.comp), EFD[r.tipo], d.g === 'C' ? 'Crítica' : 'Atenção', TIPOS[d.t], d.num, d.ser, fmt.data(d.dt), d.det, d.chave]), destaque: i => l[i][1].g === 'C' }; })(),
]);
const tabDivs = divs => `<div class="g-wrap"><table class="g"><thead><tr><th>Gravidade</th><th>Apontamento</th><th>Nº</th><th>Data</th><th>Detalhe</th></tr></thead><tbody>${divs.map(d => `<tr><td><span class="chip ${d.g === 'C' ? 'verm' : 'ouro'}">${d.g === 'C' ? 'Crítica' : 'Atenção'}</span></td><td>${esc(TIPOS[d.t])}</td><td>${esc(d.num)}</td><td>${fmt.data(d.dt)}</td><td style="white-space:normal;max-width:520px">${esc(d.det)}</td></tr>`).join('') || '<tr><td class="vazio" colspan="5">Nenhuma divergência.</td></tr>'}</tbody></table></div>`;

function auditarTela(el) {
  const pode = can('auditfiscal', 'editar');
  const desenha = () => {
    el.innerHTML = `<div class="solta"><b>Selecione os arquivos da competência</b>
      <span class="dica">EFD ICMS/IPI e EFD Contribuições em <b>.txt</b> (como saem do ReceitanetBX) e os XML de NF-e em <b>.xml</b> ou <b>.zip</b> (como saem da SEFAZ). Pode misturar várias empresas e meses: o sistema separa pelo CNPJ e pelo período que estão dentro dos arquivos. Nada é enviado para fora; só o resultado é gravado.</span>
      <div class="g-acoes"><button class="btn pri" data-f ${pode ? '' : 'disabled'}>Escolher arquivos…</button><button class="btn" data-p ${pode ? '' : 'disabled'}>Escolher uma pasta inteira…</button></div>
      <input type="file" multiple accept=".txt,.xml,.zip" hidden data-if><input type="file" webkitdirectory hidden data-ip><span class="dica" data-log role="status"></span></div>
      ${ultimo.length ? `<div class="g-bar" style="margin-top:14px"><b>${ultimo.length} escriturações auditadas nesta sessão</b><div class="g-acoes"><button class="btn pri" data-rel>Relatório completo em Excel</button></div></div>
      <div class="g-wrap"><table class="g"><thead><tr><th class="n">Nº</th><th>Empresa</th><th>CNPJ</th><th>Comp.</th><th>Escrituração</th><th>Resultado</th><th class="num">Críticas</th><th class="num">Atenção</th><th class="num">Notas EFD</th><th class="num">XML período</th><th>Principais apontamentos</th></tr></thead><tbody>
      ${ultimo.map((r, i) => `<tr class="clic" data-i="${i}"><td class="n">${i + 1}</td><td>${esc(nomeEmp(r.cnpj) || r.nome + ' (fora da base)')}</td><td>${fmt.cnpj(r.cnpj)}</td><td>${fmt.comp(r.comp)}</td><td>${EFD[r.tipo]}</td><td>${chip(r.nivel)}</td><td class="num">${r.crit}</td><td class="num">${r.aten}</td><td class="num">${r.nSped}</td><td class="num">${r.nXml}</td><td>${esc(Object.entries(r.resumo).map(([t, n]) => `${n} ${TIPOS[t].toLowerCase()}`).join(' · ') || (r.nivel === 'Inconclusiva' ? 'Nenhum XML desta empresa no período: baixe os XML e audite de novo' : '—'))}${r.consolidado ? ' · escrituração consolidada (C180/C190): sem confronto de omissão por chave' : ''}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
    const log = t => { $('[data-log]', el).textContent = t; };
    const rodar = async files => {
      files = [...files].filter(f => /\.(txt|xml|zip)$/i.test(f.name)); if (!files.length) return toast('Nenhum arquivo .txt, .xml ou .zip encontrado.', 'erro');
      $$('button', el).forEach(b => b.disabled = true); log(`Lendo ${files.length} arquivos…`);
      try {
        const { res, nXml, ign } = await processar(files, log);
        if (!res.length) { toast('Nenhuma EFD reconhecida nos arquivos.', 'erro'); log(`${nXml} XML lidos, mas nenhuma EFD (.txt) válida foi encontrada.`); $$('button', el).forEach(b => b.disabled = false); return; }
        ultimo = res.sort((a, b) => b.crit - a.crit || b.aten - a.aten); gravarResultados(res); st.comp = res[0].comp;
        toast(`${res.length} escriturações auditadas e gravadas.`); desenha(); $('[data-log]', el).textContent = `${nXml} XML e ${res.length} EFD lidos${ign ? ` · ${ign} arquivo(s) ignorado(s)` : ''}. Resultado gravado na competência.`;
      } catch (e) { console.error(e); toast('Falha na auditoria: ' + (e.message || e), 'erro'); desenha(); }
    };
    $('[data-f]', el).onclick = () => $('[data-if]', el).click(); $('[data-p]', el).onclick = () => $('[data-ip]', el).click();
    $('[data-if]', el).onchange = e => rodar(e.target.files); $('[data-ip]', el).onchange = e => rodar(e.target.files);
    $('[data-rel]', el)?.addEventListener('click', () => relatorio(ultimo));
    $$('tr[data-i]', el).forEach(tr => tr.onclick = () => { const r = ultimo[+tr.dataset.i]; modal({ titulo: `${nomeEmp(r.cnpj) || r.nome} · ${EFD[r.tipo]} ${fmt.comp(r.comp)}`, largo: true, html: tabDivs(r.divs.slice(0, 300)) + (r.divs.length > 300 ? `<p class="dica">Mostrando 300 de ${r.divs.length}. O Excel traz todas.</p>` : ''), botoes: [{ t: 'Fechar' }, { t: 'Excel desta escrituração', cls: 'pri', on: () => relatorio([r]) }] }); });
  };
  desenha(); return null;
}

function resultados(el) {
  assinarComp('auditorias', st.comp);
  const rows = () => {
    const m = new Map();
    for (const [id, e] of S.data.empresas) if (e.status !== 'Inativo' && e.area === 'Fiscal' && tipoRegime(e).startsWith('Lucro')) m.set(id, { id, e, as: audsDe(st.comp, id) });
    for (const a of S.data.auditorias.values()) if (!m.has(a.emp)) m.set(a.emp, { id: a.emp, e: S.data.empresas.get(a.emp) || { razao: a.nome + ' (fora da base)', cnpj: a.emp }, as: audsDe(st.comp, a.emp) });
    return [...m.values()];
  };
  const de = (r, t) => r.as.find(a => a.tipo === t), soma = (r, k) => r.as.reduce((s, a) => s + (a[k] || 0), 0);
  grid ||= new Grid({
    titulo: 'Auditoria XML × EFD', rows, exportar: can('auditfiscal', 'exportar'), sub: () => `Competência ${fmt.comp(st.comp)}`,
    cols: [{ key: 'niv', label: 'Resultado', get: r => nivelAud(r.as) || 'Não auditada', html: r => chip(nivelAud(r.as)) }, { key: 'razao', label: 'Empresa', w: 240, get: r => r.e.razao }, { key: 'cnpj', label: 'CNPJ', w: 140, get: r => fmt.cnpj(r.e.cnpj) }, { key: 'grupo', label: 'Grupo', get: r => r.e.grupo || '' }, { key: 'resp', label: 'Responsável', get: r => r.e.area ? respNome(r.e) : '' },
      { key: 'icms', label: 'EFD ICMS/IPI', get: r => de(r, 'ICMS')?.nivel || 'Não auditada', html: r => chip(de(r, 'ICMS')?.nivel) }, { key: 'contrib', label: 'EFD Contribuições', get: r => de(r, 'CONTRIB')?.nivel || 'Não auditada', html: r => chip(de(r, 'CONTRIB')?.nivel) },
      { key: 'crit', label: 'Críticas', cls: 'num', get: r => soma(r, 'crit') }, { key: 'aten', label: 'Atenção', cls: 'num', get: r => soma(r, 'aten') }, { key: 'em', label: 'Auditada em', get: r => fmt.hora(r.as.map(a => a.em).sort().pop()), sort: r => r.as.map(a => a.em).sort().pop() || '' }, { key: 'por', label: 'Por', get: r => r.as[0]?.por || '' }],
    onRow: r => r.as.length && modal({ titulo: `${r.e.razao} · ${fmt.comp(st.comp)}`, largo: true, html: r.as.map(a => `<h3 class="sec">${EFD[a.tipo]} ${chip(a.nivel)} <span class="dica">${a.nSped} notas na EFD · ${a.nXml} XML no período · ${esc(a.por)} em ${fmt.hora(a.em)}</span></h3><p class="dica">${esc(Object.entries(a.resumo || {}).map(([t, n]) => `${n} ${TIPOS[t].toLowerCase()}`).join(' · ') || 'Sem divergências.')}</p>${tabDivs(a.top || [])}`).join('') + '<p class="dica">Ficam gravados os 30 primeiros apontamentos de cada escrituração; o relatório completo é o Excel gerado na hora da auditoria.</p>', botoes: [{ t: 'Fechar', cls: 'pri' }] }),
  });
  grid.sorts.length || grid.sorts.push({ k: 'crit', d: -1 });
  grid.o.onView = () => { const l = rows(), n = k => l.filter(r => (nivelAud(r.as) || 'Não auditada') === k).length; $('.quadros', el).innerHTML = quadro('Empresas com EFD (Lucro na Rotina)', l.length) + quadro('Críticas', n('Crítico'), { cls: n('Crítico') ? 'alerta' : '' }) + quadro('Atenção', n('Atenção'), { cls: 'ouro' }) + quadro('OK', n('OK')) + quadro('Inconclusivas', n('Inconclusiva'), { sub: 'faltou XML' }) + quadro('Não auditadas', n('Não auditada'), { cls: n('Não auditada') ? 'alerta' : '' }); };
  el.innerHTML = `<div class="g-bar"><div class="g-busca"><label for="acmp"><b>Competência</b></label><button class="btn mini" data-m="-1" aria-label="Competência anterior">‹</button><input id="acmp" type="month" value="${st.comp}"><button class="btn mini" data-m="1" aria-label="Próxima competência">›</button><span class="dica">Toda empresa do Lucro na Rotina aparece aqui: o que não foi auditado fica à vista.</span></div></div><div class="quadros"></div><div class="gr"></div>`;
  const troca = c => { if (/^\d{4}-\d{2}$/.test(c)) { st.comp = c; resultados(el); } };
  $('#acmp', el).onchange = e => troca(e.target.value); $$('[data-m]', el).forEach(b => b.onclick = () => troca(compAdd(st.comp, +b.dataset.m)));
  grid.mount($('.gr', el)); return () => grid.refresh();
}
const rAudit = el => abas(el, [{ id: 'res', t: 'Resultados da competência', fn: resultados }, { id: 'aud', t: 'Auditar arquivos', fn: auditarTela }], st);

export const rotas = { auditfiscal: { titulo: 'Auditoria XML × EFD', render: rAudit } };
