/* Organização e fluxo de aprovação da Mery's Toys.
   Usado pela página (window.MTFlow) e pelo servidor (require). Para mudar equipes ou o fluxo, altere só este arquivo. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.MTFlow = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const AREAS = {
    ti: {
      name: 'TI', login: 'adm_ti',
      manager: { name: 'Matheus Fortunato', role: 'Gerente de TI' },
      members: [
        { name: 'Matheus Fortunato', role: 'Gerente de TI' },
        { name: 'Pietro Macedo dos Santos', role: 'Design' },
        { name: 'Pedro Zanella', role: 'Modelagem 3D' },
        { name: 'Eduarda Tomaz', role: 'Desenvolvimento de Software' },
      ],
    },
    producao: {
      name: 'Produção', login: 'adm_producao',
      manager: { name: 'Alisson Hellmann', role: 'Gerente de Produção' },
      members: [
        { name: 'Henry Gustavo Heiler', role: 'Qualidade/Metrologia' },
        { name: 'Pedro Henrick de Jesus Pereira', role: 'Qualidade/Metrologia' },
        { name: 'Maria Clara', role: 'Operador de máquinas' },
        { name: 'Matheus Valdeci dos Passos', role: 'Laminação, Refugo e Sucata' },
        { name: 'Talles Ethan', role: 'Operador de máquinas' },
      ],
    },
    pcp: {
      name: 'PCP', fullName: 'PCP · Planejamento de Produção', login: 'adm_pcp',
      manager: { name: 'Matheus Valdeci dos Passos', role: 'Gerente PCP' },
      members: [
        { name: 'Matheus Galdino', role: 'Planejamento e PCP' },
      ],
    },
    comunicacao: {
      name: 'Comunicação', login: 'adm_comunicacao',
      manager: { name: 'Ana Karolina', role: 'Gerente Comunicação' },
      members: [
        { name: 'Rayssa Cristiny', role: 'ADM' },
        { name: 'Arthur Murilo', role: 'ADM' },
        { name: 'Neon Gustavo Bruehmueller', role: 'RH' },
        { name: 'Gabriel da Rosa Ferreira', role: 'RH' },
      ],
    },
    logistica: {
      name: 'Logística', login: 'adm_logistica',
      manager: { name: 'Pedro Emanoel Alexi Venceslau', role: 'Gerente de Logística' },
      members: [
        { name: 'Jônatas Rafael', role: 'Estoque' },
        { name: 'João Pedro da Silva', role: 'Almoxarifado' },
        { name: 'Flavia Luhiza', role: 'Recebimento/Expedição' },
        { name: 'Rafael Ludgero', role: 'Almoxarifado' },
      ],
    },
  };

  // Gerentes master: criam pedidos que começam no início do fluxo e enxergam todas as áreas
  const MASTERS = ['Matheus Fortunato', 'Eduarda Tomaz', 'Pedro Zanella'];

  // Ordem das áreas
  const FLOW = ['ti', 'producao', 'pcp', 'comunicacao', 'logistica'];

  // Quem aprova em cada área. Área fora desta lista: qualquer colaborador dela (menos os gerentes master).
  // Área com várias etapas: cada etapa só com a pessoa indicada, na ordem.
  const STAGE_RULES = {
    ti: [{ approvers: ['Matheus Fortunato', 'Eduarda Tomaz', 'Pedro Zanella', 'Pietro Macedo dos Santos'] }],
    logistica: [
      { approvers: ['Jônatas Rafael'] },
      { approvers: ['João Pedro da Silva'] },
      { approvers: ['Rafael Ludgero'] },
      { approvers: ['Flavia Luhiza'] },
    ],
  };

  const plain = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
  const firstName = n => String(n).split(' ')[0];

  // Confere o nome digitado com a equipe da área: aceita o nome completo ou palavras que identifiquem uma só pessoa
  function matchMember(area, input) {
    const q = plain(input);
    if (q.length < 2 || !AREAS[area]) return null;
    const list = AREAS[area].members;
    const exact = list.find(m => plain(m.name) === q);
    if (exact) return exact.name;
    const words = q.split(' ');
    const hits = list.filter(m => { const mw = plain(m.name).split(' '); return words.every(w => mw.includes(w)); });
    return hits.length === 1 ? hits[0].name : null;
  }

  function buildStages(startArea) {
    const i = Math.max(0, FLOW.indexOf(startArea));
    return FLOW.slice(i).flatMap(area => {
      const rules = STAGE_RULES[area];
      if (!rules) return [{ area, approvers: null, step: null, steps: null }];
      return rules.map((r, k) => ({ area, approvers: r.approvers, step: rules.length > 1 ? k + 1 : null, steps: rules.length > 1 ? rules.length : null }));
    });
  }
  const startAreaFor = createdBy => (createdBy && createdBy.role === 'manager' && AREAS[createdBy.area] ? createdBy.area : FLOW[0]);

  function canApprove(stage, name, area) {
    if (!stage || stage.area !== area || !AREAS[area]) return false;
    if (!AREAS[area].members.some(m => m.name === name)) return false;
    if (stage.approvers) return stage.approvers.includes(name);
    return !MASTERS.includes(name);
  }
  function stageLabel(stage) {
    if (!stage) return '';
    const a = AREAS[stage.area]?.name || stage.area;
    return stage.step ? `${a} · etapa ${stage.step}/${stage.steps}` : a;
  }
  function waitingFor(stage) {
    if (!stage) return '';
    if (stage.approvers) return stage.approvers.map(firstName).join(' ou ');
    return `um colaborador de ${AREAS[stage.area]?.name || stage.area}`;
  }

  const money = (v, c) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: c || 'BRL' }).format(Number(v) || 0);
  const date = d => (d ? String(d).split('-').reverse().join('/') : '—');

  // Diferenças entre a NF e o pedido criado
  function compare(nf, rec) {
    const d = [];
    if (plain(nf.supplier) !== plain(rec.supplier)) d.push(`Fornecedor: NF “${nf.supplier}”, pedido “${rec.supplier || '—'}”`);
    if (plain(nf.supplierCode) !== plain(rec.supplierCode)) d.push(`Código do fornecedor: NF ${nf.supplierCode || '—'}, pedido ${rec.supplierCode || '—'}`);
    if (nf.payment !== rec.payment) d.push(`Pagamento: NF ${nf.payment}, pedido ${rec.payment}`);
    if (nf.delivery !== rec.delivery) d.push(`Entrega: NF ${nf.delivery}, pedido ${rec.delivery}`);
    const A = nf.items || [], B = rec.items || [];
    for (let i = 0; i < Math.max(A.length, B.length); i++) {
      const a = A[i], b = B[i], n = (i + 1) * 10;
      if (!b) { d.push(`Item ${n} (${a.code}) está na NF e falta no pedido`); continue; }
      if (!a) { d.push(`Item ${n} (${b.code}) está no pedido e não consta na NF`); continue; }
      if (plain(a.code) !== plain(b.code)) d.push(`Item ${n} · material: NF ${a.code}, pedido ${b.code}`);
      if (plain(a.name) !== plain(b.name)) d.push(`Item ${n} · texto breve: NF “${a.name}”, pedido “${b.name}”`);
      if (Number(a.qty) !== Number(b.qty)) d.push(`Item ${n} · quantidade: NF ${a.qty}, pedido ${b.qty}`);
      if (a.date !== b.date) d.push(`Item ${n} · entrega: NF ${date(a.date)}, pedido ${date(b.date)}`);
      if (a.currency !== b.currency) d.push(`Item ${n} · moeda: NF ${a.currency}, pedido ${b.currency}`);
      if (Math.round(Number(a.price) * 100) !== Math.round(Number(b.price) * 100)) d.push(`Item ${n} · preço: NF ${money(a.price, a.currency)}, pedido ${money(b.price, b.currency)}`);
    }
    return d;
  }

  // Aplica uma decisão na etapa atual: aprovar avança para a próxima etapa (ou conclui); rejeitar devolve ao criador
  function decide(check, { decision, name, reason, at }) {
    const stage = check.stages[check.stageIdx];
    const hit = (compare(check.nf, check.rec).length > 0) === (decision === 'adjust');
    const entry = { stageIdx: check.stageIdx, area: stage.area, step: stage.step || null, decision, by: name, at, reason: decision === 'adjust' ? reason || '' : '', hit };
    const next = { ...check, history: [...(check.history || []), entry], updatedAt: at };
    if (decision === 'adjust') Object.assign(next, { status: 'adjust', decidedBy: name, decidedAt: at, reason: entry.reason, decidedArea: stage.area });
    else if (check.stageIdx + 1 >= check.stages.length) Object.assign(next, { status: 'done', decidedBy: name, decidedAt: at, decidedArea: stage.area });
    else Object.assign(next, { stageIdx: check.stageIdx + 1, stageSince: at });
    return next;
  }

  return { AREAS, MASTERS, FLOW, STAGE_RULES, plain, matchMember, buildStages, startAreaFor, canApprove, stageLabel, waitingFor, compare, decide };
});
