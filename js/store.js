// Camada de dados: Firebase (nuvem + cache offline) ou modo local (navegador).
import { FIREBASE_CONFIG } from './config.js';

const stCbs = new Set(), errCbs = new Set();
export const status = { mode: FIREBASE_CONFIG ? 'nuvem' : 'local', online: navigator.onLine, pending: false };
const emit = () => stCbs.forEach(f => f(status));
export const onStatus = f => { stCbs.add(f); f(status); };
export const onError = f => errCbs.add(f);
const emitError = e => errCbs.forEach(f => f(e));
addEventListener('online', () => { status.online = true; emit(); });
addEventListener('offline', () => { status.online = false; emit(); });

export const newId = () => { const c = 'abcdefghijklmnopqrstuvwxyz0123456789'; let s = ''; for (const b of crypto.getRandomValues(new Uint8Array(20))) s += c[b % 36]; return s; };
const clean = o => JSON.parse(JSON.stringify(o ?? {}));
const deepMerge = (a, b) => { const o = { ...(a || {}) }; for (const k in b) o[k] = (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) ? deepMerge(o[k], b[k]) : b[k]; return o; };

let A;
export async function init() { A = FIREBASE_CONFIG ? await fbAdapter() : localAdapter(); }
export const auth = {
  onChange: cb => A.onAuth(cb), signIn: (e, p) => A.signIn(e, p), signUp: (e, p) => A.signUp(e, p), signOut: () => A.signOut(),
  createUser: (e, p) => A.createUser(e, p), reset: e => A.reset(e), changePassword: (a, n) => A.changePassword(a, n),
};
export const watch = (col, cb, q) => A.watch(col, cb, q);
export const watchDoc = (col, id, cb) => A.watchDoc(col, id, cb);
export const get = (col, id) => A.get(col, id);
export const list = (col, o) => A.list(col, o);
export const write = ops => A.write(ops.map(o => o.t === 'del' ? o : { ...o, data: clean(o.data) }));
export const set = (col, id, data, merge = false) => write([{ t: 'set', col, id, data, merge }]);
export const del = (col, id) => write([{ t: 'del', col, id }]);

// ---------- Firebase ----------
async function fbAdapter() {
  const F = await import('../vendor/firebase.js');
  const app = F.initializeApp(FIREBASE_CONFIG);
  const au = F.getAuth(app);
  let db;
  try { db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) }); }
  catch (e) { db = F.initializeFirestore(app, {}); }
  let seq = 0;
  const track = () => {
    const n = ++seq; status.pending = true; emit();
    F.waitForPendingWrites(db).then(() => { if (n === seq) { status.pending = false; emit(); } }).catch(() => {});
  };
  track(); // gravações que ficaram na fila de uma sessão anterior sem internet
  const toMap = s => { const m = new Map(); s.forEach(d => m.set(d.id, d.data())); return m; };
  return {
    onAuth: cb => F.onAuthStateChanged(au, u => cb(u ? { uid: u.uid, email: u.email } : null)),
    signIn: (e, p) => F.signInWithEmailAndPassword(au, e, p),
    signUp: async (e, p) => (await F.createUserWithEmailAndPassword(au, e, p)).user.uid,
    signOut: () => F.signOut(au),
    reset: e => F.sendPasswordResetEmail(au, e),
    async createUser(e, p) { // cria o login sem derrubar a sessão do administrador
      const a2 = F.initializeApp(FIREBASE_CONFIG, 'cria-' + Date.now());
      try {
        const au2 = F.getAuth(a2); await F.setPersistence(au2, F.inMemoryPersistence);
        const c = await F.createUserWithEmailAndPassword(au2, e, p); await F.signOut(au2); return c.user.uid;
      } finally { F.deleteApp(a2).catch(() => {}); }
    },
    async changePassword(atual, nova) {
      const u = au.currentUser;
      await F.reauthenticateWithCredential(u, F.EmailAuthProvider.credential(u.email, atual));
      await F.updatePassword(u, nova);
    },
    watch(col, cb, q) {
      let ref = F.collection(db, col); if (q) ref = F.query(ref, F.where(q[0], '==', q[1]));
      return F.onSnapshot(ref, s => cb(toMap(s)), e => emitError(e));
    },
    watchDoc: (col, id, cb) => F.onSnapshot(F.doc(db, col, id), s => cb(s.exists() ? s.data() : null, null, { cache: s.metadata.fromCache }), e => cb(null, e, {})),
    async get(col, id) { const s = await F.getDoc(F.doc(db, col, id)); return s.exists() ? s.data() : null; },
    write(ops) {
      for (let i = 0; i < ops.length; i += 400) {
        const b = F.writeBatch(db);
        for (const o of ops.slice(i, i + 400)) { const r = F.doc(db, o.col, o.id); o.t === 'del' ? b.delete(r) : b.set(r, o.data, o.merge ? { merge: true } : {}); }
        b.commit().catch(emitError); // não espera o servidor: o dado já está gravado no aparelho
      }
      track();
    },
    async list(col, { orderBy, desc, limit } = {}) {
      const c = []; if (orderBy) c.push(F.orderBy(orderBy, desc ? 'desc' : 'asc')); if (limit) c.push(F.limit(limit));
      const s = await F.getDocs(F.query(F.collection(db, col), ...c)); return s.docs.map(d => ({ id: d.id, ...d.data() }));
    },
  };
}

// ---------- Modo local (testes / demonstração) ----------
function localAdapter() {
  const K = c => 'attiva.db.' + c;
  const load = c => { try { return JSON.parse(localStorage.getItem(K(c)) || '{}'); } catch { return {}; } };
  const save = (c, o) => localStorage.setItem(K(c), JSON.stringify(o));
  const ws = new Map();
  const notify = c => (ws.get(c) || []).forEach(f => f());
  addEventListener('storage', e => { if (e.key && e.key.startsWith('attiva.db.')) notify(e.key.slice(10)); });
  const authCbs = new Set();
  let sess = null; try { sess = JSON.parse(localStorage.getItem('attiva.sess') || 'null'); } catch {}
  const setSess = s => { sess = s; localStorage.setItem('attiva.sess', JSON.stringify(s)); authCbs.forEach(f => f(s)); };
  const hash = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('attiva:' + s)))].map(b => b.toString(16).padStart(2, '0')).join('');
  const err = code => Object.assign(new Error(code), { code });
  const mk = async (e, p) => {
    e = e.trim().toLowerCase(); const us = load('__auth');
    if (Object.values(us).some(u => u.email === e)) throw err('auth/email-already-in-use');
    if (p.length < 6) throw err('auth/weak-password');
    const uid = newId(); us[uid] = { email: e, h: await hash(p) }; save('__auth', us); return uid;
  };
  return {
    onAuth: cb => { authCbs.add(cb); setTimeout(() => cb(sess), 0); },
    async signIn(e, p) {
      e = e.trim().toLowerCase(); const us = load('__auth'); const h = await hash(p);
      const hit = Object.entries(us).find(([, u]) => u.email === e && u.h === h);
      if (!hit) throw err('auth/invalid-credential'); setSess({ uid: hit[0], email: e });
    },
    async signUp(e, p) { const uid = await mk(e, p); setSess({ uid, email: e.trim().toLowerCase() }); return uid; },
    createUser: mk,
    async signOut() { setSess(null); },
    async reset() { throw err('local/reset'); },
    async changePassword(atual, nova) {
      const us = load('__auth'); const u = us[sess.uid];
      if (u.h !== await hash(atual)) throw err('auth/invalid-credential');
      if (nova.length < 6) throw err('auth/weak-password'); u.h = await hash(nova); save('__auth', us);
    },
    watch(col, cb, q) {
      const f = () => { const m = new Map(Object.entries(load(col))); if (q) for (const [k, v] of m) if (v[q[0]] !== q[1]) m.delete(k); cb(m); };
      if (!ws.has(col)) ws.set(col, new Set()); ws.get(col).add(f); setTimeout(f, 0); return () => ws.get(col).delete(f);
    },
    watchDoc(col, id, cb) {
      const f = () => cb(load(col)[id] || null);
      if (!ws.has(col)) ws.set(col, new Set()); ws.get(col).add(f); setTimeout(f, 0); return () => ws.get(col).delete(f);
    },
    async get(col, id) { return load(col)[id] || null; },
    write(ops) {
      const cols = new Map();
      for (const o of ops) {
        if (!cols.has(o.col)) cols.set(o.col, load(o.col)); const d = cols.get(o.col);
        if (o.t === 'del') delete d[o.id]; else d[o.id] = o.merge ? deepMerge(d[o.id], o.data) : o.data;
      }
      try { for (const [c, d] of cols) save(c, d); } catch (e) { emitError(e); }
      for (const c of cols.keys()) notify(c);
    },
    async list(col, { orderBy, desc, limit } = {}) {
      let r = Object.entries(load(col)).map(([id, d]) => ({ id, ...d }));
      if (orderBy) r.sort((a, b) => String(a[orderBy] ?? '').localeCompare(String(b[orderBy] ?? '')) * (desc ? -1 : 1));
      return limit ? r.slice(0, limit) : r;
    },
  };
}
