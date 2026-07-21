const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db   = require('../db');
const auth = require('../middleware/auth');
const now  = () => new Date().toISOString();

const agentOnly = (req, res, next) =>
  req.user.userType === 'client' ? res.status(403).json({ error: 'Acesso negado' }) : next();

// Helper: filter activities by date range (over performed_at)
const filterByPeriod = (activities, from, to) => {
  if (!from && !to) return activities;
  return activities.filter(a => {
    const d = a.performed_at;
    if (from && d < from) return false;
    if (to   && d > to)   return false;
    return true;
  });
};

const resolvePeriod = (query) => {
  const { from, to, period } = query;
  const now = new Date();
  let dateFrom = from, dateTo = to;
  if (period) {
    const y = now.getFullYear(), m = now.getMonth();
    if (period === 'current_month') {
      dateFrom = new Date(y, m, 1).toISOString().slice(0,10);
      dateTo   = new Date(y, m+1, 0).toISOString().slice(0,10);
    } else if (period === 'last_month') {
      dateFrom = new Date(y, m-1, 1).toISOString().slice(0,10);
      dateTo   = new Date(y, m, 0).toISOString().slice(0,10);
    } else if (period === 'last_7') {
      dateFrom = new Date(now - 7*86400000).toISOString().slice(0,10);
      dateTo   = now.toISOString().slice(0,10);
    } else if (period === 'last_30') {
      dateFrom = new Date(now - 30*86400000).toISOString().slice(0,10);
      dateTo   = now.toISOString().slice(0,10);
    }
  }
  return { dateFrom, dateTo };
};

// GET /api/activities — list, optional filters
router.get('/', auth, agentOnly, (req, res) => {
  const q = {};
  if (req.query.dept)     q.dept     = req.query.dept;
  if (req.query.type)     q.type     = req.query.type;
  if (req.query.agent_id) q.agent_id = req.query.agent_id;
  db.activities.find(q).sort({ performed_at: -1, created_at: -1 }).exec((err, docs) => res.json(docs || []));
});

// GET /api/activities/report — aggregated metrics for a period
// ?period=current_month|last_month|last_7|last_30  OR  ?from=&to=
router.get('/report', auth, agentOnly, (req, res) => {
  const { dateFrom, dateTo } = resolvePeriod(req.query);
  db.activities.find({}).sort({ performed_at: -1 }).exec((err, all) => {
    const filtered = filterByPeriod(all || [], dateFrom, dateTo);

    const byDept={}, byType={}, byAgent={};
    let concluded = 0;
    filtered.forEach(a => {
      byDept[a.dept] = (byDept[a.dept]||0)+1;
      byType[a.type] = (byType[a.type]||0)+1;
      const agentKey = a.agent_name || 'Sem técnico';
      byAgent[agentKey] = (byAgent[agentKey]||0)+1;
      if (a.status === 'concluido') concluded++;
    });

    res.json({
      period: { from: dateFrom, to: dateTo },
      total: filtered.length,
      concluded, pending: filtered.length - concluded,
      byDept, byType, byAgent,
      activities: filtered,
    });
  });
});

// POST /api/activities — create
router.post('/', auth, agentOnly, (req, res) => {
  const { performed_at, dept, type, description, asset_id, agent_id, notes, status } = req.body;
  if (!performed_at || !dept || !type || !description)
    return res.status(400).json({ error: 'Campos obrigatorios: performed_at, dept, type, description' });

  const finishCreate = (agentDoc) => {
    const activity = {
      _id: uuid(), performed_at, dept, type, description,
      asset_id: asset_id || null,
      agent_id: agentDoc ? agentDoc._id : null,
      agent_name: agentDoc ? agentDoc.name : '',
      notes: notes || '',
      status: status === 'pendente' ? 'pendente' : 'concluido',
      created_by: req.user._id,
      created_at: now(), updated_at: now(),
    };
    db.activities.insert(activity, (err, doc) => {
      if (err) return res.status(500).json({ error: 'Erro ao registrar atividade' });
      res.status(201).json(doc);
    });
  };

  if (agent_id) {
    db.agents.findOne({ _id: agent_id }, (err, agentDoc) => finishCreate(agentDoc));
  } else {
    finishCreate(req.user);
  }
});

// PATCH /api/activities/:id
router.patch('/:id', auth, agentOnly, (req, res) => {
  const allowed = ['performed_at','dept','type','asset_id','description','notes','agent_id','status'];
  const update = { updated_at: now() };
  allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

  const finishUpdate = () => {
    db.activities.update({ _id: req.params.id }, { $set: update }, {}, (err, n) =>
      n ? res.json({ message: 'Atualizado' }) : res.status(404).json({ error: 'Nao encontrado' }));
  };

  if (update.agent_id) {
    db.agents.findOne({ _id: update.agent_id }, (err, agentDoc) => {
      update.agent_name = agentDoc ? agentDoc.name : '';
      finishUpdate();
    });
  } else {
    finishUpdate();
  }
});

// DELETE /api/activities/:id
router.delete('/:id', auth, agentOnly, (req, res) => {
  db.activities.remove({ _id: req.params.id }, {}, (err, n) =>
    n ? res.json({ message: 'Atividade excluída' }) : res.status(404).json({ error: 'Nao encontrado' }));
});

module.exports = router;
