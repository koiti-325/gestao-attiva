// Motor da auditoria XML × EFD (ICMS/IPI e Contribuições). Funções puras, sem tela.
const numS = s => { const n = parseFloat(String(s || '').replace(',', '.')); return isNaN(n) ? 0 : n; };
const dataS = s => /^\d{8}$/.test(s || '') ? `${s.slice(4)}-${s.slice(2, 4)}-${s.slice(0, 2)}` : '';
const r2 = n => Math.round(n * 100) / 100;
const brl = n => r2(n).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
const dif = (a, b) => Math.abs(a - b) > 0.02;

// ---------- EFD: alimentar linha a linha (arquivos grandes) ----------
export function spedParser() {
  const r = { tipo: '', cnpj: '', nome: '', ini: '', fim: '', comp: '', notas: [], consolidado: false };
  let cur = null, estab = '';
  return {
    linha(l) {
      if (l.charCodeAt(0) !== 124) return; // só linhas que começam com |
      const f = l.split('|'), reg = f[1];
      if (reg === '0000') {
        const icms = /^\d{8}$/.test(f[4]) && /^\d{8}$/.test(f[5]), o = icms ? 0 : 2;
        r.tipo = icms ? 'ICMS' : 'CONTRIB'; r.ini = dataS(f[4 + o]); r.fim = dataS(f[5 + o]); r.nome = f[6 + o]; r.cnpj = f[7 + o]; r.comp = r.ini.slice(0, 7); estab = r.cnpj;
      } else if (reg === 'C010') { estab = f[2]; cur = null; }
      else if (reg === 'C100') {
        cur = null; if (f[5] !== '55' && f[5] !== '65') return;
        cur = { estab, op: f[2] === '0' ? 'E' : 'S', propria: f[3] === '0', mod: f[5], sit: f[6], ser: f[7], num: f[8], chave: f[9], dt: dataS(f[10]), vl: numS(f[12]), icms: numS(f[22]), g: [], itens: [] };
        r.notas.push(cur);
      } else if (reg === 'C190' && r.tipo === 'ICMS') { if (cur) cur.g.push({ cst: f[2], cfop: f[3], aliq: numS(f[4]), bc: numS(f[6]), icms: numS(f[7]) }); }
      else if (reg === 'C170') { if (cur) cur.itens.push({ cst: f[10], cfop: f[11], pis: f[25], cof: f[31] }); }
      else if (r.tipo === 'CONTRIB' && (reg === 'C180' || reg === 'C190')) { r.consolidado = true; cur = null; }
      else if (!reg || reg.slice(0, 2) !== 'C1') cur = null;
    },
    fim: () => r,
  };
}
export function parseSped(texto) { const p = spedParser(); for (const l of texto.split(/\r?\n/)) p.linha(l); return p.fim(); }

// ---------- XML de NF-e / evento ----------
const tag = (s, n) => { const i = s.indexOf('<' + n + '>'); if (i < 0) return ''; const j = s.indexOf('</' + n + '>', i); return j < 0 ? '' : s.slice(i + n.length + 2, j); };
const bloco = (s, n) => { let i = s.indexOf('<' + n + '>'); if (i < 0) i = s.indexOf('<' + n + ' '); if (i < 0) return ''; const j = s.indexOf('</' + n + '>', i); return j < 0 ? '' : s.slice(i, j); };
export function parseXml(t) {
  if (t.includes('<infEvento')) { const tp = tag(t, 'tpEvento'), ch = tag(t, 'chNFe'); return ch ? { tipo: 'evento', chave: ch, canc: tp === '110111' || tp === '110112' } : null; }
  const m = t.match(/Id="NFe(\d{44})"/); if (!m) return null;
  const ide = bloco(t, 'ide'), emit = bloco(t, 'emit'), dest = bloco(t, 'dest'), tot = bloco(t, 'ICMSTot'), prot = bloco(t, 'protNFe');
  const n = { tipo: 'nfe', chave: m[1], mod: tag(ide, 'mod'), ser: tag(ide, 'serie'), num: tag(ide, 'nNF'), dt: (tag(ide, 'dhEmi') || tag(ide, 'dEmi')).slice(0, 10), tpNF: tag(ide, 'tpNF'), emit: tag(emit, 'CNPJ') || tag(emit, 'CPF'), dest: tag(dest, 'CNPJ') || tag(dest, 'CPF'), vl: +tag(tot, 'vNF') || 0, icms: +tag(tot, 'vICMS') || 0, cStat: tag(prot, 'cStat'), g: {}, pis: [], sn: false };
  for (const d of t.split('<det ').slice(1)) {
    const ic = bloco(d, 'ICMS'), cst = tag(ic, 'CST'), cfop = tag(d, 'CFOP'), al = +tag(ic, 'pICMS') || 0;
    if (!cst) n.sn = true;
    const k = `${cst ? tag(ic, 'orig') + cst : 'SN' + tag(ic, 'CSOSN')}|${cfop}|${al.toFixed(2)}`, o = n.g[k] ||= { bc: 0, icms: 0 };
    o.bc += +tag(ic, 'vBC') || 0; o.icms += +tag(ic, 'vICMS') || 0;
    const p = tag(bloco(d, 'PIS'), 'CST'); if (p && !n.pis.includes(p)) n.pis.push(p);
  }
  return n;
}

// ---------- Confronto ----------
const REG = new Set(['00', '01', '06', '07', '08']), CANC = new Set(['02', '03']);
const X_CANC = new Set(['101', '151', '155']), X_DEN = new Set(['110', '301', '302', '303']);
export const TIPOS = { omSaida: 'Saída não escriturada', omEntrada: 'Entrada não escriturada no período', semXml: 'Nota na EFD sem XML na base', sit: 'Situação divergente (autorizada × cancelada)', valor: 'Valor divergente', trib: 'Tributação alterada', credito: 'Crédito maior que o destacado', seq: 'Quebra de sequência', dup: 'Chave em duplicidade' };

// sped: resultado do parser · xmls: Map(chave → nfe) · cancs: Set(chaves com evento de cancelamento)
export function auditar(sped, xmls, cancs = new Set()) {
  const estabs = new Set([sped.cnpj, ...sped.notas.map(n => n.estab)]), divs = [], idx = new Map(), icms = sped.tipo === 'ICMS';
  const add = (t, g, n, det) => divs.push({ t, g, chave: n.chave || '', num: n.num || '', ser: n.ser || '', dt: n.dt || '', det });
  const xCanc = x => cancs.has(x.chave) || X_CANC.has(x.cStat);
  for (const n of sped.notas) {
    if (!n.chave) continue;
    if (idx.has(n.chave + n.estab)) { add('dup', 'C', n, 'A mesma chave aparece mais de uma vez na EFD.'); continue; }
    idx.set(n.chave + n.estab, n); idx.set(n.chave, n);
    const x = xmls.get(n.chave), reg = REG.has(n.sit);
    if (!x) { if (reg) add('semXml', 'A', n, `${n.op === 'S' ? 'Saída' : 'Entrada'} de R$ ${brl(n.vl)} escriturada, mas o XML não está na base baixada.`); continue; }
    if (xCanc(x) && reg) { add('sit', 'C', n, `Cancelada na SEFAZ e escriturada como regular (COD_SIT ${n.sit}), valor R$ ${brl(n.vl)}.`); continue; }
    if (X_DEN.has(x.cStat) && reg) { add('sit', 'C', n, 'Denegada na SEFAZ e escriturada como regular.'); continue; }
    if (!xCanc(x) && CANC.has(n.sit)) { add('sit', 'C', n, `Autorizada na SEFAZ (R$ ${brl(x.vl)}) e escriturada como cancelada.`); continue; }
    if (!reg) continue;
    if (dif(x.vl, n.vl)) add('valor', n.propria ? 'C' : 'A', n, `XML R$ ${brl(x.vl)} × EFD R$ ${brl(n.vl)} (diferença ${brl(n.vl - x.vl)}).`);
    if (icms) {
      if (n.propria && !x.sn && n.g.length) { // emissão própria: o C190 tem de espelhar o XML
        const sg = {}; for (const g of n.g) { const o = sg[`${g.cst}|${g.cfop}|${g.aliq.toFixed(2)}`] ||= { bc: 0, icms: 0 }; o.bc += g.bc; o.icms += g.icms; }
        const er = [];
        for (const k of new Set([...Object.keys(x.g), ...Object.keys(sg)])) {
          const a = x.g[k], b = sg[k], [cst, cfop, al] = k.split('|'), rot = `CST ${cst} CFOP ${cfop} ${+al}%`;
          if (!b) er.push(`${rot} está no XML e não na EFD`); else if (!a) er.push(`${rot} está na EFD e não no XML`);
          else if (dif(a.bc, b.bc) || dif(a.icms, b.icms)) er.push(`${rot}: BC ${brl(a.bc)}→${brl(b.bc)}, ICMS ${brl(a.icms)}→${brl(b.icms)}`);
        }
        if (er.length) add('trib', 'C', n, 'Saída escriturada diferente do XML: ' + er.slice(0, 4).join('; ') + (er.length > 4 ? '…' : ''));
      }
      if (!n.propria && n.op === 'E') {
        if (n.icms > x.icms + 0.02) add('credito', 'C', n, `ICMS creditado R$ ${brl(n.icms)} × destacado no XML R$ ${brl(x.icms)}.`);
        const ruim = n.g.find(g => /^[567]/.test(g.cfop)); if (ruim) add('trib', 'C', n, `CFOP de saída (${ruim.cfop}) usado em nota de entrada.`);
      }
    } else if (n.itens.length) {
      const sp = [...new Set(n.itens.map(i => i.pis).filter(Boolean))];
      if (n.propria && n.op === 'S') { if (sp.sort().join() !== [...x.pis].sort().join()) add('trib', 'A', n, `CST PIS/COFINS da saída: XML ${x.pis.join(', ') || '—'} × EFD ${sp.join(', ') || '—'}.`); }
      else if (sp.some(c => c >= '50' && c <= '66') && x.pis.length && x.pis.every(c => ['04', '05', '06', '07', '08', '09'].includes(c))) add('credito', 'A', n, `Crédito de PIS/COFINS (CST ${sp.join(', ')}) em nota cujo XML é todo monofásico, alíquota zero ou sem incidência (CST ${x.pis.join(', ')}).`);
    }
  }
  // o que está no XML e não foi escriturado
  let nXml = 0; const seq = {};
  for (const x of xmls.values()) {
    const propria = estabs.has(x.emit); if (!propria && !estabs.has(x.dest)) continue;
    const noPer = x.dt >= sped.ini && x.dt <= sped.fim; if (noPer) nXml++;
    if (propria && x.mod === '55' && noPer) (seq[`${x.emit}|${x.ser}`] ||= new Set()).add(+x.num);
    if (idx.has(x.chave) || !noPer) continue;
    const canc = xCanc(x) || X_DEN.has(x.cStat);
    if (propria) { if (!canc) { if (!sped.consolidado) add('omSaida', 'C', x, `Nota própria autorizada de R$ ${brl(x.vl)} não está na EFD.`); } else if (icms) add('omSaida', 'A', x, 'Nota própria cancelada/denegada não informada na EFD (COD_SIT 02/04).'); }
    else if (icms && !canc) add('omEntrada', 'A', x, `Entrada de R$ ${brl(x.vl)} emitida no período e não escriturada (pode estar na competência seguinte).`);
  }
  for (const n of sped.notas) if (n.propria && n.mod === '55' && +n.num) (seq[`${n.estab}|${n.ser}`] ||= new Set()).add(+n.num);
  if (icms) for (const [k, set] of Object.entries(seq)) {
    const ns = [...set].sort((a, b) => a - b), fal = [];
    for (let i = 1; i < ns.length; i++) if (ns[i] - ns[i - 1] > 1) fal.push(ns[i] - ns[i - 1] === 2 ? `${ns[i] - 1}` : `${ns[i - 1] + 1}–${ns[i] - 1}`);
    if (fal.length) add('seq', 'A', { ser: k.split('|')[1] }, `Série ${k.split('|')[1]}: faltam os números ${fal.slice(0, 15).join(', ')}${fal.length > 15 ? '…' : ''} (conferir inutilização).`);
  }
  const resumo = {}; for (const d of divs) resumo[d.t] = (resumo[d.t] || 0) + 1;
  const crit = divs.filter(d => d.g === 'C').length;
  const nivel = !nXml ? 'Inconclusiva' : crit ? 'Crítico' : divs.length ? 'Atenção' : 'OK';
  return { tipo: sped.tipo, cnpj: sped.cnpj, nome: sped.nome, comp: sped.comp, ini: sped.ini, fim: sped.fim, nSped: sped.notas.length, nXml, consolidado: sped.consolidado, resumo, crit, aten: divs.length - crit, nivel, divs };
}
