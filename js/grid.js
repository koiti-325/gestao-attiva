// Tabela padrão: pesquisa por botão, filtro por coluna estilo Excel (em uso = amarelo), ordenações combinadas,
// Nº que renumera, seleção e ações em lote, edição direto na célula, paginação e exportação Excel/PDF.
import { $, $$, esc, norm, exportarDialogo } from './core.js';

export class Grid {
  constructor(o) { this.o = o; this.q = ''; this.f = {}; this.sorts = []; this.sel = new Set(); this.page = 1; this.size = 100; this.viewRows = []; this.editing = false; }
  cols() { return typeof this.o.cols === 'function' ? this.o.cols() : this.o.cols; }
  val(r, c) { const v = c.get ? c.get(r) : r[c.key]; return v == null ? '' : v; }
  id(r) { return this.o.id ? this.o.id(r) : r.id; }

  mount(el) {
    this.el = el;
    el.innerHTML = `<div class="g-bar"><div class="g-busca"><input type="search" placeholder="Pesquisar…" aria-label="Pesquisar" value="${esc(this.q)}"><button class="btn" data-a="buscar">Pesquisar</button><button class="btn aviso" data-a="limpar" hidden>Limpar todos os filtros</button></div><div class="g-acoes"></div></div>
      <div class="g-lote" hidden></div><div class="g-wrap"><table class="g"><thead></thead><tbody></tbody></table></div><div class="g-pe"></div>`;
    const ac = $('.g-acoes', el);
    for (const a of [...(this.o.acoes || []), ...(this.o.exportar ? [{ t: 'Exportar', on: () => this.exportar() }] : [])]) {
      const b = document.createElement('button'); b.className = 'btn ' + (a.cls || ''); b.textContent = a.t; b.onclick = () => a.on(this); ac.append(b);
    }
    const inp = $('.g-busca input', el);
    const buscar = () => { this.q = inp.value; this.page = 1; this.refresh(); };
    $('[data-a=buscar]', el).onclick = buscar;
    inp.onkeydown = e => { if (e.key === 'Enter') buscar(); };
    inp.addEventListener('search', () => { if (!inp.value && this.q) buscar(); });
    $('[data-a=limpar]', el).onclick = () => { this.q = inp.value = ''; this.f = {}; this.sorts = []; this.page = 1; this.refresh(); };
    el.addEventListener('click', e => this.click(e));
    el.addEventListener('change', e => {
      const t = e.target;
      if (t.matches('.g-sel')) { t.checked ? this.sel.add(t.value) : this.sel.delete(t.value); this.lote(); }
      else if (t.matches('.g-selall')) { this.sel = new Set(t.checked ? this.viewRows.map(r => this.id(r)) : []); this.refresh(); }
      else if (t.matches('.g-size')) { this.size = +t.value; this.page = 1; this.refresh(); }
    });
    this.refresh();
  }

  filtrar(exceto) {
    const cols = this.cols(), q = norm(this.q); let rows = this.o.rows();
    if (q) rows = rows.filter(r => cols.some(c => c.busca !== false && norm(this.val(r, c)).includes(q)));
    for (const [k, set] of Object.entries(this.f)) { if (k === exceto) continue; const c = cols.find(x => x.key === k); if (c) rows = rows.filter(r => set.has(String(this.val(r, c)))); }
    return rows;
  }

  refresh() {
    if (!this.el?.isConnected || this.editing) return;
    const cols = this.cols(); let rows = this.filtrar();
    if (this.sorts.length) {
      const cs = this.sorts.map(s => ({ c: cols.find(x => x.key === s.k), d: s.d })).filter(s => s.c);
      const sv = (r, c) => c.sort ? c.sort(r) : this.val(r, c);
      rows = [...rows].sort((a, b) => { for (const { c, d } of cs) { const x = sv(a, c), y = sv(b, c); const n = (typeof x === 'number' && typeof y === 'number') ? x - y : String(x).localeCompare(String(y), 'pt-BR', { numeric: true }); if (n) return n * d; } return 0; });
    }
    this.viewRows = rows;
    const ids = new Set(rows.map(r => this.id(r))); for (const s of [...this.sel]) if (!ids.has(s)) this.sel.delete(s);
    const pages = this.size ? Math.max(1, Math.ceil(rows.length / this.size)) : 1; this.page = Math.min(this.page, pages);
    const ini = this.size ? (this.page - 1) * this.size : 0, pag = this.size ? rows.slice(ini, ini + this.size) : rows;
    const lote = !!this.o.lote?.length;
    $('thead', this.el).innerHTML = `<tr><th class="n">Nº</th>${lote ? `<th class="c"><input type="checkbox" class="g-selall" aria-label="Selecionar todos" ${rows.length && this.sel.size === rows.length ? 'checked' : ''}></th>` : ''}${cols.map(c => {
      const si = this.sorts.findIndex(s => s.k === c.key), s = this.sorts[si];
      return `<th data-k="${esc(c.key)}" class="${this.f[c.key] ? 'filtrado' : ''} ${c.cls || ''}" ${c.w ? `style="min-width:${c.w}px"` : ''}><span class="th-l" title="Ordenar">${esc(c.label)}${s ? ` <b>${s.d > 0 ? '↑' : '↓'}${this.sorts.length > 1 ? si + 1 : ''}</b>` : ''}</span>${c.filter === false ? '' : '<button class="th-f" title="Filtrar" aria-label="Filtrar coluna">▾</button>'}</th>`;
    }).join('')}</tr>`;
    $('tbody', this.el).innerHTML = pag.length ? pag.map((r, i) => {
      const id = this.id(r);
      return `<tr data-id="${esc(id)}" class="${this.o.rowCls?.(r) || ''} ${this.o.onRow ? 'clic' : ''}"><td class="n">${ini + i + 1}</td>${lote ? `<td class="c"><input type="checkbox" class="g-sel" value="${esc(id)}" ${this.sel.has(id) ? 'checked' : ''} aria-label="Selecionar"></td>` : ''}${cols.map(c => `<td data-k="${esc(c.key)}" class="${c.cls || ''} ${c.edit && this.o.podeEditar !== false ? 'ed' : ''}">${c.html ? c.html(r) : esc(this.val(r, c))}</td>`).join('')}</tr>`;
    }).join('') : `<tr><td class="vazio" colspan="${cols.length + 2}">${this.o.vazio || 'Nenhum registro encontrado.'}</td></tr>`;
    const nf = Object.keys(this.f).length + (this.q ? 1 : 0) + (this.sorts.length ? 1 : 0);
    const bl = $('[data-a=limpar]', this.el); bl.hidden = !nf; bl.textContent = `Limpar todos os filtros${Object.keys(this.f).length + (this.q ? 1 : 0) ? ` (${Object.keys(this.f).length + (this.q ? 1 : 0)})` : ''}`;
    $('.g-pe', this.el).innerHTML = `<span>${rows.length} de ${this.o.rows().length} registros</span><span class="g-pag">${pages > 1 ? `<button class="btn mini" data-a="ant" ${this.page <= 1 ? 'disabled' : ''}>‹ Anterior</button> Página ${this.page} de ${pages} <button class="btn mini" data-a="prox" ${this.page >= pages ? 'disabled' : ''}>Próxima ›</button>` : ''}
      <select class="g-size" aria-label="Linhas por página">${[50, 100, 200, 0].map(n => `<option value="${n}" ${n === this.size ? 'selected' : ''}>${n || 'Todas'}${n ? ' por página' : ''}</option>`).join('')}</select></span>`;
    this.lote(); this.o.onView?.(rows);
  }

  lote() {
    const el = $('.g-lote', this.el); if (!this.o.lote?.length) return; el.hidden = !this.sel.size; if (!this.sel.size) return;
    el.innerHTML = `<b>${this.sel.size} selecionado(s)</b> ${this.o.lote.map((a, i) => `<button class="btn mini ${a.cls || ''}" data-lote="${i}">${esc(a.t)}</button>`).join(' ')} <button class="btn mini" data-a="dessel">Limpar seleção</button>`;
  }

  click(e) {
    const t = e.target, a = t.closest('[data-a]')?.dataset.a;
    if (a === 'ant') { this.page--; return this.refresh(); }
    if (a === 'prox') { this.page++; return this.refresh(); }
    if (a === 'dessel') { this.sel.clear(); return this.refresh(); }
    if (t.dataset.lote) return this.o.lote[+t.dataset.lote].on([...this.sel], this);
    const th = t.closest('th[data-k]');
    if (th) {
      if (t.closest('.th-f')) return this.popFiltro(th);
      if (t.closest('.th-l')) { const k = th.dataset.k, i = this.sorts.findIndex(s => s.k === k); if (i < 0) this.sorts.push({ k, d: 1 }); else if (this.sorts[i].d > 0) this.sorts[i].d = -1; else this.sorts.splice(i, 1); return this.refresh(); }
      return;
    }
    const tr = t.closest('tbody tr[data-id]'); if (!tr || t.closest('.g-sel')) return;
    const row = this.viewRows.find(r => this.id(r) === tr.dataset.id); if (!row) return;
    const td = t.closest('td[data-k]'), col = td && this.cols().find(c => c.key === td.dataset.k);
    if (col?.click && this.o.podeEditar !== false) return col.click(row, e);
    if (t.closest('input,select,button,a,textarea')) return;
    if (td?.classList.contains('ed')) return this.editar(td, row, col);
    this.o.onRow?.(row);
  }

  editar(td, row, col) {
    const ed = col.edit, atual = ed.get ? ed.get(row) : this.val(row, col); this.editing = true; let fim = false;
    const opts = typeof ed.options === 'function' ? ed.options(row) : ed.options;
    td.innerHTML = ed.type === 'select' ? `<select><option value=""></option>${opts.map(o => { const [v, tx] = typeof o === 'object' ? [o.v, o.t] : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(atual) ? 'selected' : ''}>${esc(tx)}</option>`; }).join('')}</select>` : `<input type="${ed.type || 'text'}" value="${esc(atual)}">`;
    const inp = td.firstChild; inp.focus();
    const sair = salvar => { if (fim) return; fim = true; this.editing = false; const v = inp.value.trim(); if (salvar && v !== String(atual ?? '')) ed.save(row, v); this.refresh(); };
    inp.onblur = () => sair(true);
    inp.onkeydown = e => { if (e.key === 'Enter') sair(true); if (e.key === 'Escape') sair(false); };
    if (ed.type === 'select') inp.onchange = () => sair(true);
  }

  popFiltro(th) {
    $('.g-pop')?.remove();
    const k = th.dataset.k, c = this.cols().find(x => x.key === k); if (!c) return;
    const vals = [...new Set(this.filtrar(k).map(r => String(this.val(r, c))))].sort((a, b) => a.localeCompare(b, 'pt-BR', { numeric: true }));
    const cur = this.f[k], pop = document.createElement('div'); pop.className = 'g-pop';
    pop.innerHTML = `<input type="search" placeholder="Procurar valor…" aria-label="Procurar valor"><div class="g-pop-l">${vals.map(v => `<label class="chk"><input type="checkbox" value="${esc(v)}" ${!cur || cur.has(v) ? 'checked' : ''}> ${v === '' ? '<i>(vazio)</i>' : esc(v)}</label>`).join('')}</div>
      <div class="g-pop-b"><button class="btn mini" data-p="todos">Todos</button><button class="btn mini" data-p="nenhum">Nenhum</button><span></span><button class="btn mini" data-p="limpar">Limpar</button><button class="btn mini pri" data-p="ok">Aplicar</button></div>`;
    document.body.append(pop);
    const r = th.getBoundingClientRect(); pop.style.top = Math.min(r.bottom + 2, innerHeight - 340) + 'px'; pop.style.left = Math.max(4, Math.min(r.left, innerWidth - 270)) + 'px';
    const vis = () => $$('.chk', pop).filter(l => !l.hidden).map(l => l.firstChild);
    $('input[type=search]', pop).oninput = e => { const q = norm(e.target.value); $$('.chk', pop).forEach(l => l.hidden = !!q && !norm(l.textContent).includes(q)); };
    const fechar = () => { pop.remove(); document.removeEventListener('mousedown', fora, true); };
    const fora = e => { if (!pop.contains(e.target)) fechar(); };
    setTimeout(() => document.addEventListener('mousedown', fora, true), 0);
    pop.onclick = e => {
      const p = e.target.dataset.p; if (!p) return;
      if (p === 'todos') return vis().forEach(x => x.checked = true);
      if (p === 'nenhum') return vis().forEach(x => x.checked = false);
      if (p === 'limpar') delete this.f[k];
      if (p === 'ok') { const m = vis().filter(x => x.checked).map(x => x.value); if (m.length === vals.length) delete this.f[k]; else this.f[k] = new Set(m); }
      this.page = 1; fechar(); this.refresh();
    };
    $('input[type=search]', pop).focus();
  }

  dados() { // colunas e linhas conforme filtros ativos
    const cols = this.cols().filter(c => c.exp !== false);
    return { cols: cols.map(c => ({ label: c.label })), rows: this.viewRows.map(r => cols.map(c => c.expv ? c.expv(r) : this.val(r, c))) };
  }
  exportar() { const d = this.dados(); exportarDialogo({ titulo: this.o.titulo || 'Relatório', arquivo: this.o.arquivo || this.o.titulo || 'relatorio', ...d, sub: this.o.sub?.() }); }
}
