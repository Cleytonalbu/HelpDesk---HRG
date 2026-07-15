const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db   = require('../db');
const auth = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs   = require('fs');

const UPLOAD_DIR = path.join(__dirname, '../../uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, UPLOAD_DIR),
  filename: (_, file, cb) => cb(null, uuid() + path.extname(file.originalname)),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const now = () => new Date().toISOString();
const SLA_HOURS = { critical:[0.5,2], high:[1,4], medium:[4,8], low:[8,24] };
const slaDeadline = (prio, created, idx) =>
  new Date(new Date(created).getTime() + SLA_HOURS[prio][idx]*3600000).toISOString();

// GET /api/tickets — list with optional filters
router.get('/', auth, (req, res) => {
  const q = {};
  if (req.query.status)        q.status   = req.query.status;
  if (req.query.priority)      q.priority = req.query.priority;
  if (req.query.tier)          q.tier     = req.query.tier;
  if (req.query.agent_id)      q.agent_id = req.query.agent_id;
  if (req.query.updated_since) q.updated_at = { $gt: req.query.updated_since };
  // Clients only see their own tickets
  if (req.user.userType === 'client') q.requester_email = req.user.email;
  db.tickets.find(q).sort({ created_at: -1 }).exec((err, docs) => res.json(docs || []));
});

// GET /api/tickets/client-stream — SSE for clients (only their own tickets)
router.get('/client-stream', (req, res) => {
  const jwt = require('jsonwebtoken');
  const token = req.headers.authorization?.replace('Bearer ','') || req.query.token || '';
  let clientId;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type !== 'client') return res.status(403).end();
    clientId = payload.id;
  } catch { return res.status(401).end(); }

  db.clients.findOne({ _id: clientId, active: true }, (err, client) => {
    if (!client) return res.status(401).end();
    const clientEmail = client.email;

    res.set({
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    res.write('event: connected\ndata: {}\n\n');

    let lastCheck = new Date().toISOString();

    const interval = setInterval(() => {
      const now = new Date().toISOString();
      const checkFrom = lastCheck;
      // Only check tickets belonging to this client that were updated since last check
      db.tickets.find({ requester_email: clientEmail, updated_at: { $gt: checkFrom } }, (err, changed) => {
        if ((changed||[]).length > 0) {
          const ticketIds = changed.map(t => t._id);
          // Check if any of the changes are new agent replies
          db.comments.find({
            ticket_id: { $in: ticketIds },
            type: 'reply',
            agent_id: { $exists: true, $ne: null },
            created_at: { $gt: checkFrom },
          }, (err2, agentReplies) => {
            const repliedIds = new Set((agentReplies||[]).map(c => c.ticket_id));
            const payload = JSON.stringify({
              updated: changed.map(t => ({
                _id: t._id, number: t.number, title: t.title,
                status: t.status, updated_at: t.updated_at,
                comments_count: (t.comments||[]).length,
                has_agent_reply: repliedIds.has(t._id),
              })),
              ts: now,
            });
            res.write(`event: update\ndata: ${payload}\n\n`);
          });
        } else {
          res.write(`event: heartbeat\ndata: {"ts":"${now}"}\n\n`);
        }
        lastCheck = now;
      });
    }, 8000);

    req.on('close', () => { clearInterval(interval); res.end(); });
  });
});


router.get('/stream', (req, res) => {
  // SSE needs token via query param since EventSource/fetch-stream can't always send headers
  const jwt = require('jsonwebtoken');
  const token = req.headers.authorization?.replace('Bearer ','') || req.query.token || '';
  let agentId;
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    if (payload.type === 'client') return res.status(403).end();
    agentId = payload.id;
  } catch { return res.status(401).end(); }

  res.set({
    'Content-Type':  'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection':    'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('event: connected\ndata: {}\n\n');

  let lastCheck = new Date().toISOString();
  let totalSeen = 0;
  db.tickets.count({}, (err, n) => { totalSeen = n || 0; });

  const interval = setInterval(() => {
    const now = new Date().toISOString();
    const checkFrom = lastCheck;
    db.datashow.count({ viewed_at: null }, (errD, datashowUnseen) => {
      db.datashow.find({ created_at: { $gt: checkFrom } }, (errD2, newBookings) => {
        db.tickets.find({ updated_at: { $gt: checkFrom } }, (err, changed) => {
          db.tickets.count({}, (err2, total) => {
            const newCount = total || 0;
            const hasNew   = newCount > totalSeen;
            const hasUpdate= (changed||[]).length > 0;
            if (hasNew || hasUpdate) {
              const ticketIds = (changed||[]).map(t => t._id);
              db.comments.find({
                ticket_id: { $in: ticketIds },
                type: 'reply',
                agent_id: null,
                created_at: { $gt: checkFrom },
              }, (err3, clientReplies) => {
                const repliedIds = new Set((clientReplies||[]).map(c => c.ticket_id));
                const payload = JSON.stringify({
                  new_tickets: hasNew ? newCount - totalSeen : 0,
                  total:       newCount,
                  updated:     (changed||[]).map(t => ({
                    _id: t._id, status: t.status, number: t.number, title: t.title,
                    requester_name: t.requester_name, updated_at: t.updated_at,
                    has_client_reply: repliedIds.has(t._id), viewed_at: t.viewed_at || null,
                  })),
                  datashow_unseen: datashowUnseen || 0,
                  new_datashow: (newBookings||[]).map(d => ({
                    _id: d._id, date: d.date, time: d.time, location: d.location,
                    requester_name: d.requester_name, purpose: d.purpose,
                  })),
                  ts: now,
                });
                res.write(`event: update\ndata: ${payload}\n\n`);
                totalSeen = newCount;
                lastCheck = now;
              });
            } else {
              const payload = JSON.stringify({ ts: now, datashow_unseen: datashowUnseen || 0 });
              res.write(`event: heartbeat\ndata: ${payload}\n\n`);
              lastCheck = now;
            }
          });
        });
      });
    });
  }, 8000);

  req.on('close', () => { clearInterval(interval); res.end(); });
});

// GET /api/tickets/stats
router.get('/stats', auth, (req, res) => {
  const q = req.user.userType === 'client' ? { requester_email: req.user.email } : {};
  db.tickets.find(q, (err, all) => {
    const today = new Date().toISOString().slice(0,10);
    res.json({
      total:     all.length,
      open:      all.filter(t=>t.status==='open').length,
      progress:  all.filter(t=>t.status==='progress').length,
      waiting:   all.filter(t=>t.status==='waiting').length,
      resolved:  all.filter(t=>t.status==='resolved').length,
      closed:    all.filter(t=>t.status==='closed').length,
      escalated: all.filter(t=>t.status==='escalated').length,
      breached:  all.filter(t=>t.sla_breached).length,
      resolvedToday: all.filter(t=>t.resolved_at&&t.resolved_at.startsWith(today)).length,
    });
  });
});

// GET /api/tickets/:id
router.get('/:id', auth, (req, res) => {
  db.tickets.findOne({ _id: req.params.id }, (err, ticket) => {
    if (!ticket) return res.status(404).json({ error: 'Ticket nao encontrado' });

    const respond = (t) => {
      db.comments.find({ ticket_id: t._id }).sort({ created_at: 1 }).exec((err, comments) => {
        db.attachments.find({ ticket_id: t._id }, (err, attachments) => {
          res.json({ ...t, comments: comments||[], attachments: attachments||[] });
        });
      });
    };

    // First time an agent (not the client) opens this ticket — clear the "Novo" badge for everyone
    if (req.user.userType !== 'client' && !ticket.viewed_at) {
      const viewed_at = now();
      db.tickets.update({ _id: ticket._id }, { $set: { viewed_at, updated_at: viewed_at } }, {}, () => {
        respond({ ...ticket, viewed_at, updated_at: viewed_at });
      });
    } else {
      respond(ticket);
    }
  });
});

// POST /api/tickets
router.post('/', auth, (req, res) => {
  const { title, description, priority, category, channel,
          requester_name, requester_email, requester_dept, asset_id } = req.body;
  if (!title || !description || !requester_name || !requester_email)
    return res.status(400).json({ error: 'Campos obrigatorios: title, description, requester_name, requester_email' });
  const prio = priority || 'medium';
  const created = now();
  const tier = prio === 'critical' ? 'N2' : 'N1';
  db.tickets.count({}, (err, count) => {
    const ticket = {
      _id: uuid(), number: 1000 + count + 1, title, description,
      status: 'open', priority: prio, category: category || 'outros',
      channel: channel || 'portal', tier,
      requester_name, requester_email,
      requester_dept: requester_dept || '',
      agent_id: null, asset_id: asset_id || null, viewed_at: null,
      sla_response_deadline: slaDeadline(prio, created, 0),
      sla_resolve_deadline:  slaDeadline(prio, created, 1),
      sla_breached: false, resolved_at: null, closed_at: null,
      created_at: created, updated_at: created,
    };
    db.tickets.insert(ticket, (err, doc) => {
      if (err) return res.status(500).json({ error: 'Erro ao criar ticket' });
      db.comments.insert({ _id:uuid(), ticket_id:doc._id, agent_id:null, author_name:'Sistema',
        body:`Chamado #${doc.number} aberto via ${doc.channel}. Prioridade: ${prio}. Nivel: ${tier}.`,
        type:'system', created_at:now() });
      res.status(201).json(doc);
    });
  });
});

// PATCH /api/tickets/:id
router.patch('/:id', auth, (req, res) => {
  const allowed = ['status','priority','tier','agent_id','asset_id','title','description','category','requester_dept'];
  const update = { updated_at: now() };
  allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
  if (update.status === 'resolved' && !update.resolved_at) update.resolved_at = now();
  if (update.status === 'closed')   update.closed_at = now();
  db.tickets.update({ _id: req.params.id }, { $set: update }, {}, (err, n) => {
    if (!n) return res.status(404).json({ error: 'Nao encontrado' });
    if (req.body.agent_id) {
      db.agents.findOne({ _id: req.body.agent_id }, (err, ag) => {
        if (ag) db.comments.insert({ _id:uuid(), ticket_id:req.params.id,
          agent_id:req.user._id, author_name:'Sistema',
          body:`Chamado atribuido a ${ag.name} (${req.body.tier||''}).`,
          type:'system', created_at:now() });
      });
    }
    res.json({ message: 'Atualizado' });
  });
});

// DELETE /api/tickets/:id — agents only
router.delete('/:id', auth, (req, res) => {
  if (req.user.userType === 'client') return res.status(403).json({ error: 'Acesso negado' });
  db.tickets.remove({ _id: req.params.id }, {}, (err, n) => {
    if (!n) return res.status(404).json({ error: 'Não encontrado' });
    db.comments.remove({ ticket_id: req.params.id }, { multi: true }, () => {});
    db.attachments.remove({ ticket_id: req.params.id }, { multi: true }, () => {});
    res.json({ message: 'Chamado excluído' });
  });
});

// POST /api/tickets/:id/comments
router.post('/:id/comments', auth, (req, res) => {
  const { body, type } = req.body;
  if (!body) return res.status(400).json({ error: 'body obrigatorio' });
  const isAgent = req.user.userType !== 'client';
  const comment = { _id:uuid(), ticket_id:req.params.id,
    agent_id: isAgent ? req.user._id : null, author_name:req.user.name,
    body, type:type||'reply', created_at:now() };
  db.tickets.update({ _id: req.params.id }, { $set: { updated_at: now() } }, {});
  db.comments.insert(comment, (err, doc) => res.status(201).json(doc));
});

// POST /api/tickets/:id/attachments
router.post('/:id/attachments', auth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Arquivo nao enviado' });
  db.tickets.findOne({ _id: req.params.id }, (err, ticket) => {
    if (!ticket) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: 'Ticket nao encontrado' }); }
    if (req.user.userType === 'client' && ticket.requester_email !== req.user.email) {
      fs.unlink(req.file.path, () => {});
      return res.status(403).json({ error: 'Acesso negado' });
    }
    const att = { _id:uuid(), ticket_id:req.params.id, comment_id:req.body.comment_id||null,
      filename:req.file.filename, original_name:req.file.originalname,
      mimetype:req.file.mimetype, size_bytes:req.file.size, created_at:now() };
    db.attachments.insert(att, (err2, doc) => res.status(201).json(doc));
  });
});

router.get('/:id/attachments/:filename', auth, (req, res) => {
  db.tickets.findOne({ _id: req.params.id }, (err, ticket) => {
    if (!ticket) return res.status(404).end();
    if (req.user.userType === 'client' && ticket.requester_email !== req.user.email) return res.status(403).end();
    res.sendFile(path.join(UPLOAD_DIR, req.params.filename));
  });
});

module.exports = router;
