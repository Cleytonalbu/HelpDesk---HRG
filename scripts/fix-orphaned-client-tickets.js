// Reconecta chamados "órfãos" ao cadastro atual de um cliente.
//
// Contexto: até esta correção, chamados eram vinculados ao cliente pelo e-mail
// (requester_email). Se o e-mail do cliente era editado depois de ele já ter
// chamados abertos, esses chamados antigos ficavam com o e-mail velho gravado
// e "somiam" da lista dele (o sistema agora compara com o e-mail novo).
//
// A causa já foi corrigida em src/routes/clients.js (editar o e-mail agora
// migra os chamados antigos automaticamente). Este script é só para consertar
// o que já ficou órfão ANTES da correção.
//
// Uso (rodar na pasta raiz do projeto, no servidor onde fica a pasta data/ real):
//   node scripts/fix-orphaned-client-tickets.js "<nome ou e-mail do cliente>"           → simula, não grava nada
//   node scripts/fix-orphaned-client-tickets.js "<nome ou e-mail do cliente>" --apply    → aplica de verdade
//
// Exemplo:
//   node scripts/fix-orphaned-client-tickets.js "Ellen Souza"
//   node scripts/fix-orphaned-client-tickets.js "Ellen Souza" --apply

require('dotenv').config();
const db = require('../src/db');

const args  = process.argv.slice(2);
const apply = args.includes('--apply');
const query = args.filter(a => a !== '--apply').join(' ').trim().toLowerCase();

if (!query) {
  console.log('Uso: node scripts/fix-orphaned-client-tickets.js "<nome ou e-mail do cliente>" [--apply]');
  process.exit(1);
}

db.clients.find({}, (err, clients) => {
  const matches = clients.filter(c =>
    c.email.toLowerCase().includes(query) || (c.name || '').toLowerCase().includes(query));

  if (matches.length === 0) {
    console.log(`Nenhum cliente encontrado com nome/e-mail contendo "${query}".`);
    console.log('Clientes cadastrados:');
    clients.forEach(c => console.log(' -', c.name, `<${c.email}>`));
    process.exit(1);
  }
  if (matches.length > 1) {
    console.log(`Mais de um cliente bateu com "${query}" — seja mais específico:`);
    matches.forEach(c => console.log(' -', c.name, `<${c.email}>`));
    process.exit(1);
  }

  const client = matches[0];
  console.log(`Cliente: ${client.name} <${client.email}> (setor: ${client.department || '-'})`);

  db.tickets.find({}, (err2, tickets) => {
    const clientEmails = new Set(clients.map(c => c.email));
    const firstName = client.name.toLowerCase().split(' ')[0];

    // Candidatos: chamados cujo requester_email não bate com o cliente atual
    // E não corresponde a NENHUM cliente cadastrado (ou seja, é um e-mail "morto"),
    // E o nome de quem abriu tem a ver com o cliente procurado.
    const candidates = tickets.filter(t =>
      t.requester_email !== client.email &&
      !clientEmails.has(t.requester_email) &&
      (t.requester_name || '').toLowerCase().includes(firstName)
    );

    if (!candidates.length) {
      console.log('Nenhum chamado órfão encontrado para esse cliente (nada a corrigir, ou já está tudo certo).');
      return;
    }

    console.log(`\n${candidates.length} chamado(s) candidatos (e-mail antigo, nome parecido):\n`);
    candidates.forEach(t => console.log(
      `  #${t.number} — ${t.title}  (requester_email atual no chamado: ${t.requester_email}, aberto em ${(t.created_at||'').slice(0,10)})`
    ));

    if (!apply) {
      console.log('\n[SIMULAÇÃO] Nenhuma alteração foi feita.');
      console.log('Confira a lista acima. Se estiver certa, rode de novo adicionando --apply no final.');
      return;
    }

    const ids = candidates.map(t => t._id);
    db.tickets.update(
      { _id: { $in: ids } },
      { $set: { requester_email: client.email } },
      { multi: true },
      (err3, n) => console.log(`\n✅ ${n} chamado(s) reconectado(s) ao e-mail atual (${client.email}).`)
    );
  });
});
