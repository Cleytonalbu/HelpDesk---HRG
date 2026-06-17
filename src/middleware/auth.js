const jwt = require('jsonwebtoken');
const db  = require('../db');
module.exports = (req, res, next) => {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Token nao fornecido' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const col = payload.type === 'client' ? db.clients : db.agents;
    col.findOne({ _id: payload.id, active: true }, (err, user) => {
      if (!user) return res.status(401).json({ error: 'Usuario nao encontrado' });
      const { password, ...safe } = user;
      req.user = { ...safe, userType: payload.type || 'agent' };
      next();
    });
  } catch {
    res.status(401).json({ error: 'Token invalido ou expirado' });
  }
};
