const router = require('express').Router();
const { v4: uuid } = require('uuid');
const db   = require('../db');
const auth = require('../middleware/auth');
const now  = () => new Date().toISOString();

// GET /api/datashow — list all reservations (optionally filter by date range)
router.get('/', auth, (req, res) => {
  const q = {};
  if (req.query.date)      q.date = req.query.date;           // exact date YYYY-MM-DD
  if (req.query.date_from) q.date = { $gte: req.query.date_from };
  if (req.query.date_from && req.query.date_to)
    q.date = { $gte: req.query.date_from, $lte: req.query.date_to };
  db.datashow.find(q).sort({ date: 1, time: 1 }).exec((err, docs) => res.json(docs || []));
});

// GET /api/datashow/check — check if a slot is available
// ?date=2026-05-21&time=09:00&duration=60&location=Auditório
router.get('/check', auth, (req, res) => {
  const { date, time, duration, exclude_id, location } = req.query;
  if (!date || !time) return res.status(400).json({ error: 'date e time obrigatorios' });
  const dur = parseInt(duration) || 60;
  const [sh, sm] = time.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin   = startMin + dur;

  // Filter by location too if provided
  const q = location ? { date, location } : { date };
  db.datashow.find(q, (err, reservations) => {
    const conflicts = (reservations || []).filter(r => {
      if (exclude_id && r._id === exclude_id) return false;
      const [rh, rm] = r.time.split(':').map(Number);
      const rStart = rh * 60 + rm;
      const rEnd   = rStart + (parseInt(r.duration) || 60);
      return startMin < rEnd && endMin > rStart;
    });
    res.json({ available: conflicts.length === 0, conflicts });
  });
});

// POST /api/datashow — create reservation
router.post('/', auth, (req, res) => {
  const { date, time, duration, location, requester_name, requester_email, requester_dept, purpose, notes } = req.body;
  if (!date || !time || !location || !requester_name || !purpose)
    return res.status(400).json({ error: 'Campos obrigatorios: date, time, location, requester_name, purpose' });

  const dur = parseInt(duration) || 60;
  const [sh, sm] = time.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin   = startMin + dur;

  // Conflict check — same date AND same location
  db.datashow.find({ date, location }, (err, existing) => {
    const conflict = (existing || []).find(r => {
      const [rh, rm] = r.time.split(':').map(Number);
      const rStart = rh * 60 + rm;
      const rEnd   = rStart + (parseInt(r.duration) || 60);
      return startMin < rEnd && endMin > rStart;
    });

    if (conflict) {
      return res.status(409).json({
        error: `Horário indisponível — já existe agendamento das ${conflict.time} (${conflict.purpose}) no local ${conflict.location}`,
        conflict,
      });
    }

    const reservation = {
      _id: uuid(), date, time, duration: dur, location,
      requester_name, requester_email: requester_email || '',
      requester_dept: requester_dept || '',
      purpose, notes: notes || '',
      status: 'confirmed',
      created_by: req.user._id,
      created_by_name: req.user.name,
      created_at: now(), updated_at: now(),
    };
    db.datashow.insert(reservation, (err, doc) => {
      if (err) return res.status(500).json({ error: 'Erro ao criar agendamento' });
      res.status(201).json(doc);
    });
  });
});

// PATCH /api/datashow/:id — update status or details
router.patch('/:id', auth, (req, res) => {
  const allowed = ['date','time','duration','location','purpose','notes','status',
                   'requester_name','requester_email','requester_dept'];
  const update  = { updated_at: now() };
  allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });

  // If changing date/time/location, re-check for conflicts
  if (update.date || update.time || update.location) {
    // Get current record first
    db.datashow.findOne({ _id: req.params.id }, (err, current) => {
      if (!current) return res.status(404).json({ error: 'Nao encontrado' });
      const date     = update.date     || current.date;
      const time     = update.time     || current.time;
      const duration = update.duration || current.duration || 60;
      const location = update.location || current.location;
      const [sh, sm] = time.split(':').map(Number);
      const startMin = sh * 60 + sm;
      const endMin   = startMin + parseInt(duration);

      db.datashow.find({ date, location }, (err2, existing) => {
        const conflict = (existing || []).find(r => {
          if (r._id === req.params.id) return false; // exclude self
          const [rh, rm] = r.time.split(':').map(Number);
          const rStart = rh * 60 + rm;
          const rEnd   = rStart + (parseInt(r.duration) || 60);
          return startMin < rEnd && endMin > rStart;
        });
        if (conflict) {
          return res.status(409).json({
            error: `Horário indisponível — já existe agendamento das ${conflict.time} (${conflict.purpose}) no local ${location}`,
            conflict,
          });
        }
        db.datashow.update({ _id: req.params.id }, { $set: update }, {}, (err3, n) =>
          n ? res.json({ message: 'Atualizado' }) : res.status(404).json({ error: 'Nao encontrado' }));
      });
    });
  } else {
    db.datashow.update({ _id: req.params.id }, { $set: update }, {}, (err, n) =>
      n ? res.json({ message: 'Atualizado' }) : res.status(404).json({ error: 'Nao encontrado' }));
  }
});

// DELETE /api/datashow/:id
router.delete('/:id', auth, (req, res) => {
  db.datashow.remove({ _id: req.params.id }, {}, (err, n) =>
    n ? res.json({ message: 'Cancelado' }) : res.status(404).json({ error: 'Nao encontrado' }));
});

module.exports = router;
