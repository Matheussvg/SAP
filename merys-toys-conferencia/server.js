// Servidor da conferência de pedidos Mery's Toys.
// Serve a página (public/index.html) e uma API JSON pequena que todas as telas consultam a cada 2,5 s.
// Dados: Postgres quando DATABASE_URL existe (Render); senão, arquivo data.json (para testar no computador).
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'adm';
const ADMIN_PASS = process.env.ADMIN_PASS || 'adm';
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const MAX_BODY = 256 * 1024;
const COLLECTIONS = ['orders', 'checks'];

const adminToken = crypto.createHmac('sha256', SECRET).update(`admin:${ADMIN_USER}:${ADMIN_PASS}`).digest('hex');
const isAdmin = req => {
  const h = req.headers.authorization || '';
  const t = h.startsWith('Bearer ') ? h.slice(7) : '';
  return t.length === adminToken.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(adminToken));
};
const safeEqual = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};

// ===== Armazenamento =====
function pgStore(pool) {
  return {
    async init() {
      await pool.query(`create sequence if not exists docs_seq;
        create table if not exists docs(
          collection text not null, id text not null, data jsonb not null,
          seq bigint not null default nextval('docs_seq'), primary key(collection, id))`);
    },
    async rev() { return (await pool.query('select coalesce(max(seq),0)::text as r from docs')).rows[0].r; },
    async all() { return (await pool.query('select collection, id, data from docs order by seq')).rows; },
    async get(c, id) { return (await pool.query('select data from docs where collection=$1 and id=$2', [c, id])).rows[0]?.data || null; },
    async put(c, id, data) {
      await pool.query(`insert into docs(collection,id,data) values($1,$2,$3)
        on conflict (collection,id) do update set data=excluded.data, seq=nextval('docs_seq')`, [c, id, data]);
    },
    async create(c, id, data) {
      return (await pool.query('insert into docs(collection,id,data) values($1,$2,$3) on conflict do nothing returning id', [c, id, data])).rowCount === 1;
    },
    // Só grava se o pedido ainda estiver pendente: a primeira decisão vale para todos
    async decide(id, patch) {
      const r = await pool.query(`update docs set data = data || $2::jsonb, seq = nextval('docs_seq')
        where collection='checks' and id=$1 and data->>'status'='pending' returning data`, [id, patch]);
      return r.rowCount ? { ok: true, current: r.rows[0].data } : { ok: false, current: await this.get('checks', id) };
    },
  };
}

function fileStore(file) {
  let db = { seq: 0, docs: {} };
  try { db = JSON.parse(fs.readFileSync(file, 'utf8')); } catch {}
  const key = (c, id) => `${c}/${id}`;
  const save = () => fs.writeFileSync(file, JSON.stringify(db));
  return {
    async init() {},
    async rev() { return String(db.seq); },
    async all() { return Object.values(db.docs); },
    async get(c, id) { return db.docs[key(c, id)]?.data || null; },
    async put(c, id, data) { db.docs[key(c, id)] = { collection: c, id, data, seq: ++db.seq }; save(); },
    async create(c, id, data) { if (db.docs[key(c, id)]) return false; await this.put(c, id, data); return true; },
    async decide(id, patch) {
      const d = db.docs[key('checks', id)];
      if (!d || d.data.status !== 'pending') return { ok: false, current: d?.data || null };
      d.data = { ...d.data, ...patch }; d.seq = ++db.seq; save();
      return { ok: true, current: d.data };
    },
  };
}

let store;
if (process.env.DATABASE_URL) {
  const { Pool } = require('pg');
  store = pgStore(new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSL === 'require' ? { rejectUnauthorized: false } : false,
  }));
} else {
  store = fileStore(path.join(__dirname, 'data.json'));
}

// ===== Página =====
const pagePath = path.join(__dirname, 'public', 'index.html');
// O index.html é o mesmo arquivo publicado no claude.ai (sem <html>/<head>); aqui ele ganha o esqueleto e o endereço da API
const page = () => `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#173c32"><script>window.MT_API="/api"</script></head><body>${fs.readFileSync(pagePath, 'utf8')}</body></html>`;

// ===== Utilidades HTTP =====
const send = (res, status, body, type = 'application/json; charset=utf-8') => {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
};
const readJson = req => new Promise((resolve, reject) => {
  let size = 0; const chunks = [];
  req.on('data', c => { size += c.length; if (size > MAX_BODY) { reject(Object.assign(new Error('Pedido grande demais'), { status: 413 })); req.destroy(); } else chunks.push(c); });
  req.on('end', () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); } catch { reject(Object.assign(new Error('JSON inválido'), { status: 400 })); } });
  req.on('error', reject);
});
const isPlainObject = v => v && typeof v === 'object' && !Array.isArray(v);
const ID_RE = { orders: /^OC-\d{4}-\d{4}$/, checks: /^c\d{10,16}$/ };
const str = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;

// ===== Rotas =====
async function handle(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean).map(decodeURIComponent);

  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) return send(res, 200, page(), 'text/html; charset=utf-8');
  if (req.method === 'GET' && url.pathname === '/healthz') return send(res, 200, { ok: true });
  if (parts[0] !== 'api') return send(res, 404, 'Página não encontrada', 'text/plain; charset=utf-8');

  const [, a, b, c] = parts;

  // Estado completo; responde "unchanged" quando nada mudou desde a última consulta
  if (req.method === 'GET' && a === 'state') {
    const rev = await store.rev();
    if (url.searchParams.get('rev') === rev) return send(res, 200, { rev, unchanged: true });
    const out = { rev, orders: [], checks: [] };
    for (const row of await store.all()) if (out[row.collection]) out[row.collection].push({ id: row.id, ...row.data });
    return send(res, 200, out);
  }

  if (req.method === 'GET' && a === 'doc' && COLLECTIONS.includes(b) && c) return send(res, 200, { data: await store.get(b, c) });

  if (req.method === 'POST' && a === 'login') {
    const { user, pass } = await readJson(req);
    if (safeEqual(user, ADMIN_USER) & safeEqual(pass, ADMIN_PASS)) return send(res, 200, { token: adminToken });
    return send(res, 401, { error: 'Usuário ou senha inválidos' });
  }

  // Administradores: salvar pedido
  if (req.method === 'PUT' && a === 'orders' && b && !c) {
    if (!isAdmin(req)) return send(res, 401, { error: 'Entre como administrador' });
    if (!ID_RE.orders.test(b)) return send(res, 400, { error: 'Número de pedido inválido' });
    const { data } = await readJson(req);
    if (!isPlainObject(data) || data.no !== b || !isPlainObject(data.header) || !Array.isArray(data.items)) return send(res, 400, { error: 'Pedido inválido' });
    await store.put('orders', b, data);
    return send(res, 200, { ok: true });
  }

  // Administradores: enviar pedido para conferência
  if (req.method === 'POST' && a === 'checks' && b && !c) {
    if (!isAdmin(req)) return send(res, 401, { error: 'Entre como administrador' });
    if (!ID_RE.checks.test(b)) return send(res, 400, { error: 'Identificador inválido' });
    const { data } = await readJson(req);
    if (!isPlainObject(data) || !ID_RE.orders.test(data.orderNo) || !isPlainObject(data.nf) || !isPlainObject(data.rec)) return send(res, 400, { error: 'Conferência inválida' });
    const clean = { ...data, status: 'pending', sentAt: new Date().toISOString() };
    delete clean.decidedBy; delete clean.decidedAt; delete clean.reason;
    if (!(await store.create('checks', b, clean))) return send(res, 409, { error: 'Já existe' });
    return send(res, 200, { ok: true });
  }

  // Qualquer conferente: aprovar ou rejeitar (a primeira decisão vale)
  if (req.method === 'POST' && a === 'checks' && b && c === 'decide') {
    const body = await readJson(req);
    if (!['done', 'adjust'].includes(body.status)) return send(res, 400, { error: 'Decisão inválida' });
    if (!str(body.decidedBy, 40) || body.decidedBy.trim().length < 2) return send(res, 400, { error: 'Informe o nome' });
    if (body.status === 'adjust' && (!str(body.reason, 1000) || body.reason.trim().length < 5)) return send(res, 400, { error: 'Informe o motivo' });
    const patch = {
      status: body.status,
      decidedBy: isAdmin(req) ? 'Administrador' : body.decidedBy.trim(),
      decidedRole: isAdmin(req) ? 'admin' : 'checker',
      reason: body.status === 'adjust' ? body.reason.trim() : '',
      decidedAt: new Date().toISOString(),
    };
    const r = await store.decide(b, patch);
    return send(res, r.ok ? 200 : 409, r);
  }

  return send(res, 404, { error: 'Rota não encontrada' });
}

store.init().then(() => {
  http.createServer((req, res) => {
    handle(req, res).catch(e => {
      console.error(e);
      if (!res.headersSent) send(res, e.status || 500, { error: e.status ? e.message : 'Erro no servidor' });
    });
  }).listen(PORT, () => console.log(`Mery's Toys conferência rodando na porta ${PORT} (${process.env.DATABASE_URL ? 'Postgres' : 'data.json'})`));
}).catch(e => { console.error('Falha ao preparar o banco:', e); process.exit(1); });
