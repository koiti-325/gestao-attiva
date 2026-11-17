// Núcleo: estado, permissões, utilidades, interface, gravação com auditoria, exportação e importação.
import * as store from './store.js';
export { store };

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const norm = v => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export const digits = v => String(v ?? '').replace(/\D/g, '');

export const S = {
  user: null, perfil: null, config: {},
  data: { empresas: new Map(), funcionarios: new Map(), processos: new Map(), demandas: new Map(), ferramentas: new Map(), usuarios: new Map(), perfis: new Map(), controle: new Map(), auditorias: new Map() },
};

// ---------- Módulos e permissões ----------
const TODAS = ['ver', 'criar', 'editar', 'excluir', 'exportar'];
export const MODS = [
  { id: 'controle', nome: 'Obrigações', grupo: 'CONTROLE', acoes: ['ver', 'editar', 'conferir', 'exportar'] },
  { id: 'auditfiscal', nome: 'Auditoria XML × EFD', grupo: 'CONTROLE', acoes: ['ver', 'editar', 'exportar'] },
  { id: 'simples', nome: 'Planejamento', grupo: 'CONTROLE', acoes: ['ver', 'editar', 'exportar'] },
  { id: 'demandas', nome: 'Demandas entre setores', grupo: 'CONTROLE', acoes: TODAS },
  { id: 'empresas', nome: 'Empresas', grupo: 'GESTÃO', acoes: TODAS },
  { id: 'carteiras', nome: 'Carteiras', grupo: 'GESTÃO', acoes: ['ver', 'exportar'] },
  { id: 'equipe', nome: 'Equipe e Férias', grupo: 'GESTÃO', acoes: TODAS },
  { id: 'ferramentas', nome: 'Ferramentas', grupo: 'FERRAMENTAS', acoes: ['ver'] },
];
export const ACAO_NOME = { ver: 'Ver', criar: 'Incluir', editar: 'Alterar', excluir: 'Excluir', conferir: 'Conferir', exportar: 'Exportar' };
// índice que as regras do servidor consultam: para cada ação, a lista de módulos liberados
export const idxPerms = perms => Object.fromEntries(Object.keys(ACAO_NOME).map(a => [a, MODS.filter(m => perms?.[m.id]?.[a]).map(m => m.id)]));
export const isAdmin = () => S.user?.perfil === 'admin';
export const can = (mod, act = 'ver') => !!S.user && (isAdmin() || !!S.perfil?.perms?.[mod]?.[act]);

// ---------- Datas ----------
const p2 = n => String(n).padStart(2, '0');
export const hoje = () => { const d = new Date(); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`; };
export const mesAtual = () => hoje().slice(0, 7);
export const compAdd = (c, n) => { let [y, m] = c.split('-').map(Number); m += n; y += Math.floor((m - 1) / 12); m = ((m - 1) % 12 + 12) % 12 + 1; return `${y}-${p2(m)}`; };
export const compAtual = () => compAdd(mesAtual(), -1); // competência em apuração = mês anterior
export const compDiff = (a, b) => { const [y1, m1] = a.split('-').map(Number), [y2, m2] = b.split('-').map(Number); return (y2 - y1) * 12 + (m2 - m1); };
export const addDias = (iso, n) => { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
export const addAnos = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); const r = new Date(y + n, m - 1, d, 12); return r.toISOString().slice(0, 10); };
export const diasAte = iso => Math.round((new Date(iso + 'T12:00:00') - new Date(hoje() + 'T12:00:00')) / 864e5);
export const fmt = {
  data: v => /^\d{4}-\d{2}-\d{2}/.test(v || '') ? `${v.slice(8, 10)}/${v.slice(5, 7)}/${v.slice(0, 4)}` : (v || ''),
  comp: v => /^\d{4}-\d{2}$/.test(v || '') ? `${v.slice(5)}/${v.slice(0, 4)}` : (v || ''),
  cnpj: v => { const d = digits(v); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : (v || ''); },
  hora: v => v ? new Date(v).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '',
};
// aceita 31/12/2026, 2026-12-31, número serial do Excel ou Date
export const parseData = v => {
  if (v == null || v === '') return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'number') return new Date(Math.round((v - 25569) * 864e5)).toISOString().slice(0, 10);
  const s = String(v).trim(); let m;
  if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/))) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${p2(m[2])}-${p2(m[1])}`;
  return '';
};

// ---------- Regras de negócio compartilhadas ----------
export const funcNome = id => S.data.funcionarios.get(id)?.nome || '';
export const respId = e => (e.area && e.resp?.[e.area]) || '';
export const respNome = e => funcNome(respId(e));
export const tipoRegime = e => { const r = norm(e.regime), g = norm(e.grupo); return r.includes('simples') ? 'Simples' : r.includes('real') ? 'Lucro Real' : r.includes('presumido') ? 'Lucro Presumido' : g.startsWith('lucro') || e.area === 'Planejamento' ? 'Lucro' : g.startsWith('simples') ? 'Simples' : ''; };
// Saída de cliente: saida.ultComp = última competência feita pela Attiva. Depois dela a empresa sai do controle.
export const saiu = (e, comp = compAtual()) => !!e.saida?.ultComp && e.saida.ultComp < comp;
export const ativa = (e, comp) => e.status !== 'Inativo' && !saiu(e, comp);
export const situacao = e => e.status === 'Inativo' ? 'Inativa' : saiu(e) ? 'Saiu' : e.saida ? 'Em saída' : 'Ativa';
export const precisaResp = e => ativa(e) && ((e.area === 'Fiscal' && !!e.grupo) || (e.area === 'Planejamento' && !!e.contrato));
export const pendencia = e => !ativa(e) ? '' : !e.area ? 'Pendente de área' : (e.area === 'Fiscal' && !e.grupo) ? 'Pendente de grupo' : (precisaResp(e) && !respId(e)) ? 'Pendente de responsável' : '';
// sem área ou sem grupo (no Fiscal) = sem responsável; Planejamento não tem grupo
export const ajustarEmpresa = e => {
  if (e.area === 'Planejamento') e.grupo = '';
  if (!e.area || (e.area === 'Fiscal' && !e.grupo)) e.resp = {};
  else if (e.resp) e.resp = e.resp[e.area] ? { [e.area]: e.resp[e.area] } : {};
  return e;
};
export const GRUPOS_PADRAO = ['Lucro - Squad 1', 'Lucro - Squad 2', 'Lucro - Squad 3', 'Lucro - Individual', 'Simples - Individual'];
export const opcoes = (campo, extra = []) => [...new Set([...extra, ...[...S.data.empresas.values()].map(e => e[campo]).filter(Boolean)])].sort((a, b) => a.localeCompare(b));
export const grupos = () => [...new Set([...(S.config.grupos || GRUPOS_PADRAO), ...opcoes('grupo'), ...[...S.data.funcionarios.values()].map(f => f.grupo).filter(Boolean)])].sort();
export const funcsAtivos = () => [...S.data.funcionarios].filter(([, f]) => f.ativo !== false).map(([id, f]) => ({ v: id, t: f.nome })).sort((a, b) => a.t.localeCompare(b.t));

// ---------- Gravação com auditoria ----------
const diff = (a, b) => { const o = {}; for (const k of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) if (JSON.stringify(a?.[k]) !== JSON.stringify(b?.[k])) o[k] = [a?.[k] ?? null, b?.[k] ?? null]; return o; };
export function audit(acao, col, id, resumo, antes) {
  if (!S.user) return;
  store.set('auditoria', store.newId(), { ts: new Date().toISOString(), uid: S.user.uid, nome: S.user.nome || S.user.email, acao, col, id: id || '', resumo: resumo || '', antes: antes ? JSON.stringify(antes).slice(0, 20000) : '' });
}
export function gravar(col, id, data, resumo) {
  const antes = S.data[col]?.get(id);
  store.set(col, id, data);
  audit(antes ? 'Alterou' : 'Incluiu', col, id, resumo, antes ? diff(antes, data) : null);
}
export function excluir(col, id, resumo) { const antes = S.data[col]?.get(id); store.del(col, id); audit('Excluiu', col, id, resumo, antes); }
export function gravarLote(col, pares, resumo) {
  if (!pares.length) return;
  store.write(pares.map(([id, data]) => data === null ? { t: 'del', col, id } : { t: 'set', col, id, data }));
  audit('Lote', col, '', `${resumo} (${pares.length} registros)`);
}

// ---------- Interface ----------
export function toast(msg, tipo = 'ok') {
  const t = document.createElement('div'); t.className = 'toast ' + tipo; t.textContent = msg;
  $('#toasts').append(t); setTimeout(() => t.remove(), tipo === 'erro' ? 7000 : 3500);
}
export const modalAberto = () => !!$('.modal-bg');
export function modal({ titulo, html, botoes = [], largo = false, onOpen }) {
  const bg = document.createElement('div'); bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal ${largo ? 'largo' : ''}" role="dialog" aria-modal="true"><div class="modal-h"><h3>${esc(titulo)}</h3><button class="x" aria-label="Fechar">×</button></div><div class="modal-b">${html}</div><div class="modal-f"></div></div>`;
  const close = () => { bg.remove(); document.dispatchEvent(new Event('modal-fechou')); };
  $('.x', bg).onclick = close;
  bg.addEventListener('mousedown', e => { if (e.target === bg) close(); });
  const f = $('.modal-f', bg);
  for (const b of botoes) {
    const el = document.createElement('button'); el.className = 'btn ' + (b.cls || ''); el.textContent = b.t;
    el.onclick = async () => { el.disabled = true; try { if ((await b.on?.(bg)) !== false) close(); } catch (e) { toast(msgErro(e), 'erro'); } el.disabled = false; };
    f.append(el);
  }
  document.body.append(bg); onOpen?.(bg); $('input,select,textarea', $('.modal-b', bg))?.focus();
  return { el: bg, close };
}
export const confirmar = (msg, t = 'Confirmar') => new Promise(res => {
  let ok = false;
  const m = modal({ titulo: 'Confirmação', html: `<p>${esc(msg)}</p>`, botoes: [{ t: 'Cancelar' }, { t, cls: 'pri', on: () => { ok = true; } }] });
  const obs = () => { if (!m.el.isConnected) { document.removeEventListener('modal-fechou', obs); res(ok); } };
  document.addEventListener('modal-fechou', obs);
});
// campos: [{k,label,type,options,req,full,ph,ajuda}]  type: text|date|month|number|select|check|textarea|email
export function campoHtml(c, v) {
  const a = `name="${c.k}" ${c.req ? 'required' : ''} ${c.ph ? `placeholder="${esc(c.ph)}"` : ''}`;
  let inp;
  if (c.type === 'select') inp = `<select ${a}>${(c.vazio === false ? '' : '<option value=""></option>') + c.options.map(o => { const [ov, ot] = typeof o === 'object' ? [o.v, o.t] : [o, o]; return `<option value="${esc(ov)}" ${String(v ?? '') === String(ov) ? 'selected' : ''}>${esc(ot)}</option>`; }).join('')}</select>`;
  else if (c.type === 'check') inp = `<label class="chk"><input type="checkbox" name="${c.k}" ${v ? 'checked' : ''}> ${esc(c.rot || 'Sim')}</label>`;
  else if (c.type === 'textarea') inp = `<textarea ${a} rows="3">${esc(v)}</textarea>`;
  else inp = `<input type="${c.type || 'text'}" ${a} value="${esc(v)}">`;
  return `<div class="campo ${c.full ? 'full' : ''}"><label>${esc(c.label)}${c.req ? ' *' : ''}</label>${inp}${c.ajuda ? `<small>${esc(c.ajuda)}</small>` : ''}</div>`;
}
export function lerForm(root, campos) {
  const o = {};
  for (const c of campos) { const el = $(`[name="${c.k}"]`, root); if (!el) continue; o[c.k] = c.type === 'check' ? el.checked : c.type === 'number' ? (el.value === '' ? '' : Number(el.value)) : el.value.trim(); }
  return o;
}
export function formModal({ titulo, campos, valores = {}, onSave, salvar = 'Salvar', largo = true, extra = '' }) {
  return modal({
    titulo, largo, html: `<form class="form">${campos.map(c => campoHtml(c, valores[c.k])).join('')}</form>${extra}<p class="erro-form"></p>`,
    botoes: [{ t: 'Cancelar' }, {
      t: salvar, cls: 'pri', on: async bg => {
        const v = lerForm(bg, campos); const falta = campos.find(c => c.req && (v[c.k] === '' || v[c.k] == null));
        const r = falta ? `Preencha: ${falta.label}` : await onSave(v, bg);
        if (typeof r === 'string') { $('.erro-form', bg).textContent = r; return false; }
      },
    }],
  });
}
export const msgErro = e => ({
  'auth/invalid-credential': 'E-mail ou senha incorretos.', 'auth/wrong-password': 'E-mail ou senha incorretos.', 'auth/user-not-found': 'E-mail ou senha incorretos.',
  'auth/invalid-email': 'E-mail inválido.', 'auth/email-already-in-use': 'Já existe um login com este e-mail.', 'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/network-request-failed': 'Sem internet: esta ação precisa de conexão.', 'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
  'permission-denied': 'Sem permissão para esta ação.', 'local/reset': 'No modo local não há envio de e-mail.',
}[e?.code] || e?.message || String(e));

// ---------- Exportação ----------
const scripts = {};
export const loadScript = src => scripts[src] ||= new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('Não foi possível carregar ' + src)); document.head.append(s); });
const baixar = (blob, nome) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };
export const baixarJson = (obj, nome) => baixar(new Blob([JSON.stringify(obj)], { type: 'application/json' }), nome);

// planilhas: [{nome, titulo, sub, contadores:[[rotulo,valor]], cols:[{label,w}], rows:[[...]], destaque: i => bool}]
export async function xlsxAttiva(arquivo, planilhas) {
  await loadScript('vendor/exceljs.min.js');
  const wb = new ExcelJS.Workbook(); wb.creator = 'Gestão Attiva';
  const VERDE = 'FF0F3D2E', OURO = 'FFB8863B', ZEBRA = 'FFF3EFE4', DEST = 'FFFFE9A8';
  const fill = c => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: c } });
  const usados = new Set();
  for (const p of planilhas) {
    let nome = String(p.nome || 'Planilha').replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Planilha';
    for (let i = 2; usados.has(nome.toLowerCase()); i++) nome = nome.slice(0, 28) + ' ' + i;
    usados.add(nome.toLowerCase());
    const ws = wb.addWorksheet(nome, { views: [{ showGridLines: false }] }); const n = Math.max(p.cols.length, 2);
    ws.mergeCells(1, 1, 1, n); Object.assign(ws.getCell(1, 1), { value: 'ATTIVA  ·  ' + (p.titulo || nome), fill: fill(VERDE), font: { bold: true, size: 14, color: { argb: 'FFFFFFFF' } }, alignment: { vertical: 'middle', indent: 1 } }); ws.getRow(1).height = 30;
    ws.mergeCells(2, 1, 2, n); Object.assign(ws.getCell(2, 1), { value: p.sub || `Gerado em ${fmt.data(hoje())}`, fill: fill(OURO), font: { bold: true, color: { argb: 'FFFFFFFF' } }, alignment: { indent: 1 } });
    let r = 3;
    if (p.contadores?.length) { ws.getRow(r).values = p.contadores.flatMap(([a, b]) => [a, b]); ws.getRow(r).eachCell((c, i) => { c.font = { bold: i % 2 === 1, color: { argb: VERDE } }; }); r++; }
    r++;
    const hr = ws.getRow(r); hr.values = p.cols.map(c => c.label); hr.height = 20;
    hr.eachCell(c => Object.assign(c, { fill: fill(VERDE), font: { bold: true, color: { argb: 'FFFFFFFF' } }, alignment: { vertical: 'middle', horizontal: 'center', wrapText: true }, border: { bottom: { style: 'medium', color: { argb: OURO } } } }));
    p.rows.forEach((row, i) => {
      const x = ws.getRow(r + 1 + i); x.values = row;
      const cor = p.destaque?.(i) ? DEST : i % 2 ? ZEBRA : null;
      for (let c = 1; c <= p.cols.length; c++) { const cell = x.getCell(c); if (cor) cell.fill = fill(cor); cell.border = { bottom: { style: 'thin', color: { argb: 'FFD9D2BF' } } }; cell.alignment = { vertical: 'middle', wrapText: false }; }
    });
    p.cols.forEach((c, i) => { ws.getColumn(i + 1).width = c.w || Math.min(60, Math.max(10, String(c.label).length + 2, ...p.rows.slice(0, 300).map(rw => String(rw[i] ?? '').length + 2))); });
    ws.autoFilter = { from: { row: r, column: 1 }, to: { row: r, column: p.cols.length } }; ws.views = [{ state: 'frozen', ySplit: r, showGridLines: false }];
  }
  baixar(new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), arquivo.endsWith('.xlsx') ? arquivo : arquivo + '.xlsx');
}
export function pdfAttiva(titulo, cols, rows, sub = '') {
  const w = window.open('', '_blank'); if (!w) return toast('Permita pop-ups para gerar o PDF.', 'erro');
  w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
  body{font:11px Arial,sans-serif;color:#1d2a24;margin:18px}h1{background:#0f3d2e;color:#fff;font-size:15px;padding:9px 12px;margin:0}
  .s{background:#b8863b;color:#fff;padding:4px 12px;font-weight:bold;margin-bottom:10px}table{border-collapse:collapse;width:100%}
  th{background:#0f3d2e;color:#fff;padding:5px;text-align:left;font-size:10px}td{padding:4px 5px;border-bottom:1px solid #d9d2bf}tr:nth-child(even) td{background:#f3efe4}
  @page{size:A4 landscape;margin:10mm}</style></head><body><h1>ATTIVA · ${esc(titulo)}</h1><div class="s">${esc(sub || 'Gerado em ' + fmt.data(hoje()))} · ${rows.length} registros</div>
  <table><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
  <script>onload=()=>setTimeout(()=>print(),200)<\/script></body></html>`);
  w.document.close();
}
// diálogo padrão: escolher colunas e formato
export function exportarDialogo({ titulo, arquivo, cols, rows, sub }) {
  modal({
    titulo: 'Exportar · ' + titulo,
    html: `<p class="dica">Escolha as informações que vão para o arquivo (${rows.length} registros, conforme os filtros ativos).</p>
      <div class="cols-exp">${cols.map((c, i) => `<label class="chk"><input type="checkbox" data-i="${i}" checked> ${esc(c.label)}</label>`).join('')}</div>
      <p><button type="button" class="btn mini" data-t="1">Marcar todas</button> <button type="button" class="btn mini" data-t="0">Desmarcar todas</button></p>`,
    onOpen: bg => $$('[data-t]', bg).forEach(b => b.onclick = () => $$('[data-i]', bg).forEach(x => x.checked = b.dataset.t === '1')),
    botoes: [{ t: 'Cancelar' },
      { t: 'PDF', on: bg => { const ix = $$('[data-i]:checked', bg).map(x => +x.dataset.i); pdfAttiva(titulo, ix.map(i => cols[i].label), rows.map(r => ix.map(i => r[i])), sub); } },
      { t: 'Excel', cls: 'pri', on: async bg => { const ix = $$('[data-i]:checked', bg).map(x => +x.dataset.i); await xlsxAttiva(arquivo, [{ nome: titulo, titulo, sub, cols: ix.map(i => cols[i]), rows: rows.map(r => ix.map(i => r[i])) }]); } }],
  });
}

// ---------- Importação de planilha com mapeamento de colunas ----------
// campos: [{k,label,sin:[sinônimos],req}]  →  onImport(linhas [{k:valor}], nomeDaAba)
export function importarPlanilha({ titulo, campos, onImport }) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.xlsx,.xls,.csv';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { cellDates: true });
      const abas = wb.SheetNames.map(n => ({ n, m: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: true }) })).filter(a => a.m.length > 1);
      if (!abas.length) return toast('Planilha vazia.', 'erro');
      const achaCab = m => { let best = 0, sc = -1; m.slice(0, 15).forEach((row, i) => { const s = row.filter(c => campos.some(cp => [cp.label, ...(cp.sin || [])].some(x => norm(x) === norm(c)))).length; if (s > sc) { sc = s; best = i; } }); return best; };
      const m = modal({
        titulo: 'Importar · ' + titulo, largo: true,
        html: `<div class="form"><div class="campo"><label>Aba(s) da planilha</label><div class="cols-exp">${abas.map((a, i) => `<label class="chk"><input type="checkbox" data-aba="${i}" ${i === 0 || /geral/i.test(a.n) ? 'checked' : ''}> ${esc(a.n)} (${a.m.length - 1} linhas)</label>`).join('')}</div></div></div>
          <p class="dica">Confira de qual coluna da planilha vem cada informação. Registro que já existe é sobrescrito pelos campos importados.</p><div class="mapa"></div>`,
        onOpen: bg => {
          const desenha = () => {
            const a = abas[+($('[data-aba]:checked', bg)?.dataset.aba ?? 0)]; const cab = a.m[achaCab(a.m)].map(String);
            $('.mapa', bg).innerHTML = `<div class="form">${campos.map(cp => { const hit = cab.findIndex(c => [cp.label, ...(cp.sin || [])].some(x => norm(x) === norm(c))); return `<div class="campo"><label>${esc(cp.label)}${cp.req ? ' *' : ''}</label><select data-campo="${cp.k}"><option value="-1">— não importar —</option>${cab.map((c, i) => c ? `<option value="${i}" ${i === hit ? 'selected' : ''}>${esc(c)}</option>` : '').join('')}</select></div>`; }).join('')}</div>`;
          };
          $$('[data-aba]', bg).forEach(x => x.onchange = desenha); desenha();
        },
        botoes: [{ t: 'Cancelar' }, {
          t: 'Importar', cls: 'pri', on: async bg => {
            // o mapeamento vale pelo NOME da coluna, para funcionar em abas com ordem diferente
            const nomes = Object.fromEntries($$('[data-campo]', bg).map(s => [s.dataset.campo, +s.value < 0 ? null : s.selectedOptions[0].textContent]));
            const falta = campos.find(c => c.req && !nomes[c.k]); if (falta) { toast('Indique a coluna de: ' + falta.label, 'erro'); return false; }
            let total = 0;
            for (const x of $$('[data-aba]:checked', bg)) {
              const a = abas[+x.dataset.aba]; const ic = achaCab(a.m); const cab = a.m[ic].map(c => norm(c));
              const mapa = Object.entries(nomes).map(([k, n]) => [k, n ? cab.indexOf(norm(n)) : -1]).filter(([, i]) => i >= 0);
              const linhas = a.m.slice(ic + 1).map(row => Object.fromEntries(mapa.map(([k, i]) => [k, row[i]]))).filter(l => Object.values(l).some(v => v !== '' && v != null));
              total += await onImport(linhas, a.n);
            }
            toast(`${total} registros importados.`);
          },
        }],
      });
    } catch (e) { toast('Não consegui ler a planilha: ' + msgErro(e), 'erro'); }
  };
  inp.click();
}

// ---------- Abas e quadros ----------
export function abas(el, lista, estado) { // lista: [{id, t, fn(corpo) => refresh}]
  el.innerHTML = `<div class="abas" role="tablist">${lista.map(a => `<button role="tab" data-aba="${a.id}">${esc(a.t)}</button>`).join('')}</div><div class="aba-c"></div>`;
  let ref;
  const abrir = id => { estado.aba = id; $$('.abas button', el).forEach(b => b.classList.toggle('on', b.dataset.aba === id)); const c = $('.aba-c', el); c.innerHTML = ''; ref = lista.find(a => a.id === id).fn(c); };
  $$('.abas button', el).forEach(b => b.onclick = () => abrir(b.dataset.aba));
  abrir(lista.some(a => a.id === estado.aba) ? estado.aba : lista[0].id);
  return () => ref?.();
}
export const quadro = (rot, val, o = {}) => `<${o.href ? `a href="${o.href}"` : o.k ? `button data-q="${esc(o.k)}"` : 'div'} class="quadro ${o.cls || ''}"><b>${esc(val)}</b><span>${esc(rot)}</span>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</${o.href ? 'a' : o.k ? 'button' : 'div'}>`;

// ---------- Assinaturas por competência (controle e auditorias) ----------
const subsComp = {};
export function assinarComp(col, comp) {
  const s = subsComp[col] ||= {}; if (s.comp === comp) return; s.un?.(); s.comp = comp; S.data[col] = new Map();
  s.un = store.watch(col, m => { if (s.comp !== comp) return; S.data[col] = m; document.dispatchEvent(new CustomEvent('dados', { detail: col })); }, ['comp', comp]);
}
export const assinarControle = comp => assinarComp('controle', comp);
export const pararControle = () => { for (const s of Object.values(subsComp)) { s.un?.(); s.un = s.comp = null; } };
// pior nível entre as auditorias (EFD ICMS e Contribuições) de uma empresa na competência
const ORD = ['OK', 'Inconclusiva', 'Atenção', 'Crítico'];
export const audsDe = (comp, id) => ['ICMS', 'CONTRIB'].map(t => S.data.auditorias.get(`${comp}__${id}__${t}`)).filter(Boolean);
export const nivelAud = as => as.length ? as.map(a => a.nivel).sort((a, b) => ORD.indexOf(b) - ORD.indexOf(a))[0] : '';
