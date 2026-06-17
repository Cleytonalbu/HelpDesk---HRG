const router = require('express').Router();
const db   = require('../db');
const auth = require('../middleware/auth');

// Helper: filter tickets by date range
const filterByPeriod = (tickets, from, to) => {
  if (!from && !to) return tickets;
  return tickets.filter(t => {
    const d = t.created_at.slice(0, 10);
    if (from && d < from) return false;
    if (to   && d > to)   return false;
    return true;
  });
};

// GET /api/reports/dashboard — main dashboard KPIs + charts
router.get('/dashboard', auth, (req, res) => {
  db.tickets.find({}, (err, all) => {
    const now   = new Date();
    const today = now.toISOString().slice(0, 10);
    const byStatus={}, byPriority={}, byCategory={}, byChannel={}, byAgent={};
    let breached=0, resolvedToday=0;
    let totalResolveMs = 0, resolvedCount = 0;

    all.forEach(t => {
      byStatus[t.status]     = (byStatus[t.status]||0)+1;
      byPriority[t.priority] = (byPriority[t.priority]||0)+1;
      byCategory[t.category] = (byCategory[t.category]||0)+1;
      byChannel[t.channel]   = (byChannel[t.channel]||0)+1;
      if (t.agent_id) byAgent[t.agent_id]=(byAgent[t.agent_id]||0)+1;
      if (t.sla_breached) breached++;
      if (t.resolved_at && t.resolved_at.startsWith(today)) resolvedToday++;
      if (t.resolved_at) {
        totalResolveMs += new Date(t.resolved_at) - new Date(t.created_at);
        resolvedCount++;
      }
    });

    const avgResolveHours = resolvedCount > 0
      ? Math.round((totalResolveMs / resolvedCount / 3600000) * 10) / 10 : 0;

    // Daily last 7 days
    const daily = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now - i*86400000).toISOString().slice(0, 10);
      daily[d] = { opened:0, resolved:0 };
    }
    all.forEach(t => {
      const d = t.created_at.slice(0, 10); if (daily[d]) daily[d].opened++;
      if (t.resolved_at) { const dr = t.resolved_at.slice(0,10); if(daily[dr]) daily[dr].resolved++; }
    });

    // SLA % 
    const slaOk = all.filter(t => !t.sla_breached).length;
    const slaPct = all.length > 0 ? Math.round((slaOk/all.length)*100) : 100;

    // Last 10 tickets
    const lastTickets = [...all].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,10);

    res.json({
      totals: { all:all.length, ...byStatus, breached, resolvedToday, avgResolveHours, slaPct },
      byPriority, byCategory, byChannel, byAgent,
      daily: Object.entries(daily).map(([date,v])=>({date,...v})),
      lastTickets,
    });
  });
});

// GET /api/reports/tickets — filtered ticket list for reports
// ?from=YYYY-MM-DD&to=YYYY-MM-DD&period=current_month|last_month|last_7|last_30
router.get('/tickets', auth, (req, res) => {
  const { from, to, period, status, priority, category } = req.query;
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

  const q = {};
  if (status)   q.status   = status;
  if (priority) q.priority = priority;
  if (category) q.category = category;

  db.tickets.find(q).sort({ created_at: -1 }).exec((err, all) => {
    const filtered = filterByPeriod(all, dateFrom, dateTo);

    // Aggregations on filtered set
    const byCategory={}, byPriority={}, byStatus={}, byUser={}, byDept={};
    const incidentMap = {};
    let breached=0, resolved=0;
    let totalResolveMs=0, resolvedCount=0;

    filtered.forEach(t => {
      byCategory[t.category] = (byCategory[t.category]||0)+1;
      byPriority[t.priority] = (byPriority[t.priority]||0)+1;
      byStatus[t.status]     = (byStatus[t.status]||0)+1;

      // By user
      const userKey = t.requester_email || t.requester_name;
      if (!byUser[userKey]) byUser[userKey] = { name:t.requester_name, email:t.requester_email, count:0 };
      byUser[userKey].count++;

      // By dept — lookup from requester info or fallback
      const dept = t.requester_dept || 'Sem setor';
      byDept[dept] = (byDept[dept]||0)+1;

      // Incident frequency (title similarity bucket — use category+title prefix)
      const incident = `${t.category}:${t.title.slice(0,30).toLowerCase()}`;
      if (!incidentMap[incident]) incidentMap[incident] = { title:t.title, category:t.category, count:0 };
      incidentMap[incident].count++;

      if (t.sla_breached) breached++;
      if (t.resolved_at) { resolved++; totalResolveMs += new Date(t.resolved_at)-new Date(t.created_at); resolvedCount++; }
    });

    // Enrich tickets with dept from clients collection
    db.clients.find({}, (err2, clients) => {
      const clientByEmail = {};
      (clients||[]).forEach(c => clientByEmail[c.email] = c);

      const enriched = filtered.map(t => {
        const c = clientByEmail[t.requester_email];
        return { ...t, requester_dept: c ? (c.department||'Sem setor') : (t.requester_dept||'Sem setor') };
      });

      // Rebuild byDept with enriched data
      const byDeptFinal = {};
      enriched.forEach(t => {
        const dept = t.requester_dept || 'Sem setor';
        byDeptFinal[dept] = (byDeptFinal[dept]||0)+1;
      });

      const avgResolveHours = resolvedCount > 0
        ? Math.round((totalResolveMs/resolvedCount/3600000)*10)/10 : 0;
      const slaPct = filtered.length > 0 ? Math.round(((filtered.length-breached)/filtered.length)*100) : 100;

      const topIncidents = Object.values(incidentMap)
        .sort((a,b)=>b.count-a.count).slice(0,10);
      const topUsers = Object.values(byUser)
        .sort((a,b)=>b.count-a.count).slice(0,10);

      res.json({
        period: { from: dateFrom, to: dateTo },
        total: filtered.length, resolved, breached, avgResolveHours, slaPct,
        byCategory, byPriority, byStatus,
        byUser: topUsers,
        byDept: byDeptFinal,
        topIncidents,
        tickets: enriched,
      });
    });
  });
});

// GET /api/reports/sla
router.get('/sla', auth, (req, res) => {
  db.tickets.find({ status:{$in:['open','progress','waiting','escalated']} }, (err, open) => {
    const now = new Date();
    const enriched = (open||[]).map(t => {
      const remaining = Math.round((new Date(t.sla_resolve_deadline)-now)/60000);
      return { ...t, sla_remaining_minutes:remaining,
        sla_status: remaining<0?'breached':remaining<60?'risk':'ok' };
    });
    res.json(enriched.sort((a,b)=>a.sla_remaining_minutes-b.sla_remaining_minutes));
  });
});

// GET /api/reports/agents
router.get('/agents', auth, (req, res) => {
  db.agents.find({ active:true }, (err, agents) => {
    db.tickets.find({}, (err, tickets) => {
      res.json((agents||[]).map(agent => {
        const mine = (tickets||[]).filter(t=>t.agent_id===agent._id);
        return { agent_id:agent._id, name:agent.name, role:agent.role, color:agent.color,
          total:mine.length,
          open:mine.filter(t=>['open','progress','waiting'].includes(t.status)).length,
          resolved:mine.filter(t=>t.resolved_at).length };
      }));
    });
  });
});

// GET /api/reports/tv — optimized payload for TV dashboard (no auth — public display)
router.get('/tv', (req, res) => {
  db.tickets.find({}, (err, all) => {
    if (!all) return res.json({});
    const now = new Date();
    const today = now.toISOString().slice(0,10);
    const open = all.filter(t=>['open','progress','waiting','escalated'].includes(t.status));
    const resolved = all.filter(t=>t.resolved_at);
    const resolvedToday = all.filter(t=>t.resolved_at&&t.resolved_at.startsWith(today));
    const breached = all.filter(t=>t.sla_breached);

    let totalMs=0, cnt=0;
    resolved.forEach(t=>{ totalMs+=new Date(t.resolved_at)-new Date(t.created_at); cnt++; });
    const avgH = cnt>0 ? Math.round((totalMs/cnt/3600000)*10)/10 : 0;

    const byCategory={}, byPriority={};
    all.forEach(t=>{
      byCategory[t.category]=(byCategory[t.category]||0)+1;
      byPriority[t.priority]=(byPriority[t.priority]||0)+1;
    });

    // SLA by priority
    const slaByPriority = {};
    ['critical','high','medium','low'].forEach(p => {
      const pt = all.filter(t=>t.priority===p);
      const ptOk = pt.filter(t=>!t.sla_breached);
      slaByPriority[p] = pt.length ? Math.round((ptOk.length/pt.length)*100) : 100;
    });

    // Last 8 tickets
    const lastTickets = [...all].sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,8);

    // Weekly volume
    const daily = {};
    for (let i=6;i>=0;i--) {
      const d = new Date(now-i*86400000).toISOString().slice(0,10);
      daily[d]={opened:0,resolved:0};
    }
    all.forEach(t=>{
      const d=t.created_at.slice(0,10); if(daily[d]) daily[d].opened++;
      if(t.resolved_at){const dr=t.resolved_at.slice(0,10);if(daily[dr])daily[dr].resolved++;}
    });

    const slaPct = all.length ? Math.round(((all.length-breached.length)/all.length)*100) : 100;

    res.json({
      ts: now.toISOString(),
      totals: { all:all.length, open:open.length, resolved:resolved.length,
        resolvedToday:resolvedToday.length, breached:breached.length,
        avgResolveHours:avgH, slaPct },
      byCategory, byPriority, slaByPriority,
      daily: Object.entries(daily).map(([date,v])=>({date,...v})),
      lastTickets,
    });
  });
});

module.exports = router;
