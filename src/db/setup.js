require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const db = require('./index');

const now = () => new Date().toISOString();
const hAgo = h => new Date(Date.now() - h * 3600000).toISOString();
const slaDeadline = (priority, created, field) => {
  const map = { critical:[0.5,2], high:[1,4], medium:[4,8], low:[8,24] };
  return new Date(new Date(created).getTime() + map[priority][field==='r'?0:1]*3600000).toISOString();
};

db.agents.count({}, (err, n) => {
  if (n > 0) { console.log('DB already seeded.'); return; }
  console.log('Seeding database...');

  // SLA rules
  db.slaRules.insert([
    { _id:uuid(), priority:'critical', response_hours:0.5, resolve_hours:2  },
    { _id:uuid(), priority:'high',     response_hours:1,   resolve_hours:4  },
    { _id:uuid(), priority:'medium',   response_hours:4,   resolve_hours:8  },
    { _id:uuid(), priority:'low',      response_hours:8,   resolve_hours:24 },
  ]);

  // Agents
  const agentList = [
    { name:'Admin HelpDesk', email:'admin@helpdesk.com',   pw:'admin123',   role:'admin', color:'#3b82f6' },
    { name:'Carlos Lima',    email:'carlos@helpdesk.com',  pw:'carlos123',  role:'N1',    color:'#3b82f6' },
    { name:'Ana Torres',     email:'ana@helpdesk.com',     pw:'ana123',     role:'N2',    color:'#10b981' },
    { name:'Mariana Costa',  email:'mariana@helpdesk.com', pw:'mariana123', role:'N3',    color:'#8b5cf6' },
    { name:'Lucas Freitas',  email:'lucas@helpdesk.com',   pw:'lucas123',   role:'N1',    color:'#f59e0b' },
  ];
  db.agents.insert(agentList.map(a => ({
    _id:uuid(), name:a.name, email:a.email, password:bcrypt.hashSync(a.pw,10),
    role:a.role, color:a.color, active:true, created_at:now()
  })), (err, agentDocs) => {
    const byEmail = {};
    agentDocs.forEach(a => byEmail[a.email] = a);
    const carlos = byEmail['carlos@helpdesk.com'];
    const ana    = byEmail['ana@helpdesk.com'];
    const mariana= byEmail['mariana@helpdesk.com'];

    // Demo client
    db.clients.insert([{
      _id:uuid(), name:'João Mendes', email:'joao@empresa.com',
      password:bcrypt.hashSync('joao123',10), department:'TI', active:true, created_at:now()
    }]);

    // Assets
    db.assets.insert([
      { _id:uuid(), code:'PC-JM001',  name:'Dell Inspiron 15',  type:'Notebook',   status:'online',   assigned_to:'João Mendes',  serial:'DL2023', created_at:now(), updated_at:now() },
      { _id:uuid(), code:'SW-MS365',  name:'Microsoft 365',     type:'Software',   status:'online',   assigned_to:'Todos',        serial:null,     created_at:now(), updated_at:now() },
      { _id:uuid(), code:'NET-AP03',  name:'AP Wi-Fi 3 Andar',  type:'Rede',       status:'instavel', assigned_to:null,           serial:'AC2200', created_at:now(), updated_at:now() },
      { _id:uuid(), code:'PRT-HP400', name:'HP LaserJet 400',   type:'Impressora', status:'offline',  assigned_to:'Financeiro',   serial:'HP4000', created_at:now(), updated_at:now() },
      { _id:uuid(), code:'NET-VPNC',  name:'VPN Corporativa',   type:'Rede',       status:'instavel', assigned_to:'Todos',        serial:null,     created_at:now(), updated_at:now() },
      { _id:uuid(), code:'SRV-AD01',  name:'Servidor AD',       type:'Servidor',   status:'online',   assigned_to:null,           serial:'R740',   created_at:now(), updated_at:now() },
    ], (err, assetDocs) => {
      const vpnId = assetDocs.find(a=>a.code==='NET-VPNC')._id;
      const ms365Id= assetDocs.find(a=>a.code==='SW-MS365')._id;

      // KB
      const cats = [
        { _id:uuid(), name:'Acesso e Senhas',      icon:'🔑', color:'#3b82f6' },
        { _id:uuid(), name:'Hardware',             icon:'💻', color:'#f59e0b' },
        { _id:uuid(), name:'Rede e Conectividade', icon:'🌐', color:'#10b981' },
        { _id:uuid(), name:'Software e Sistemas',  icon:'⚙',  color:'#8b5cf6' },
        { _id:uuid(), name:'Impressoras',          icon:'🖨',  color:'#06b6d4' },
        { _id:uuid(), name:'Segurança TI',         icon:'🛡',  color:'#ef4444' },
      ];
      db.kbCategories.insert(cats);
      db.kbArticles.insert([
        { _id:uuid(), category_id:cats[0]._id, title:'Como redefinir sua senha no Active Directory', body:'**Passo 1:** Acesse portal.empresa.com/reset\n\n**Passo 2:** Confirme sua identidade por SMS\n\n**Passo 3:** Defina nova senha com mínimo 8 caracteres, uma maiúscula e um número\n\n> Dica: Se o portal não carregar, use Ctrl+Shift+Del para limpar o cache do navegador.', helpful_pct:94, views:1240, created_at:now(), updated_at:now() },
        { _id:uuid(), category_id:cats[2]._id, title:'VPN não conecta: soluções passo a passo',      body:'**1. Verifique se o cliente VPN está atualizado**\n\nBaixe a versão mais recente em ti.empresa.com/vpn\n\n**2. Tente conectar por outra rede**\n\nSe estiver no Wi-Fi doméstico, tente via cabo.\n\n**3. Limpe o cache de certificados SSL**\n\nAbra o cliente VPN → Preferências → Limpar cache.', helpful_pct:88, views:980, created_at:now(), updated_at:now() },
        { _id:uuid(), category_id:cats[4]._id, title:'HP LaserJet: instalação de drivers',           body:'**1.** Acesse hp.com/support e pesquise seu modelo\n\n**2.** Baixe o driver para Windows 10/11 x64\n\n**3.** Execute o instalador como Administrador\n\n**4.** Reinicie o computador após instalação', helpful_pct:91, views:740, created_at:now(), updated_at:now() },
        { _id:uuid(), category_id:cats[3]._id, title:'Outlook não abre: guia de resolução',          body:'**Modo Seguro:**\nPressione Win+R, digite `outlook.exe /safe` e pressione Enter.\n\n**Desabilitar suplementos:**\nArquivo → Opções → Suplementos → Gerenciar COM → Desmarcar todos\n\n**Reparar Office:**\nPainel de Controle → Programas → Microsoft 365 → Reparar', helpful_pct:85, views:620, created_at:now(), updated_at:now() },
        { _id:uuid(), category_id:cats[5]._id, title:'Como identificar e reportar phishing',         body:'**Sinais de phishing:**\n- Remetente com domínio estranho\n- Links que não correspondem ao texto\n- Urgência excessiva e erros gramaticais\n\n**O que fazer:**\n1. NÃO clique em links\n2. NÃO abra anexos\n3. Encaminhe para seguranca@empresa.com\n4. Delete o e-mail', helpful_pct:97, views:560, created_at:now(), updated_at:now() },
      ]);

      // Tickets
      let ticketNum = 1040;
      const mkTicket = (t) => ({
        _id:uuid(), number:ticketNum++, title:t.title, description:t.desc,
        status:t.status, priority:t.priority, category:t.cat, channel:t.channel,
        tier:t.tier, requester_name:t.rname, requester_email:t.remail,
        agent_id:t.agent?t.agent._id:null, asset_id:t.asset||null,
        sla_response_deadline:slaDeadline(t.priority, t.created, 'r'),
        sla_resolve_deadline:slaDeadline(t.priority, t.created, 'res'),
        sla_breached:false, resolved_at:t.resolved||null, closed_at:null,
        created_at:t.created, updated_at:t.updated,
      });
      const ticketData = [
        { title:'VPN nao conecta no notebook',      desc:'Erro SSL handshake ao conectar a VPN corporativa. Mensagem: SSL negotiation failed.',        status:'progress', priority:'critical', cat:'rede',    channel:'portal',   tier:'N2', rname:'Joao Mendes',   remail:'joao@empresa.com',   agent:carlos,  asset:vpnId,  created:hAgo(2),  updated:hAgo(1) },
        { title:'Tela azul ao iniciar Windows',     desc:'BSOD code 0x00000050 PAGE_FAULT_IN_NONPAGED_AREA ao ligar. Ocorre toda vez.',               status:'escalated',priority:'critical', cat:'hardware',channel:'telefone', tier:'N3', rname:'Maria Silva',   remail:'maria@empresa.com',  agent:mariana, asset:null,   created:hAgo(3),  updated:hAgo(0.5) },
        { title:'Outlook sem conexao com Exchange', desc:'Nao sincroniza e-mails desde ontem 17h. Perfil do Outlook aparece como desconectado.',       status:'progress', priority:'high',     cat:'software',channel:'email',    tier:'N2', rname:'Pedro Alves',   remail:'pedro@empresa.com',  agent:ana,     asset:ms365Id,created:hAgo(4),  updated:hAgo(2) },
        { title:'Sem acesso ao sistema ERP',        desc:'Login retorna erro 403 Forbidden desde esta manha. Outros usuarios do setor tambem afetados.',status:'open',     priority:'high',     cat:'software',channel:'portal',   tier:'N1', rname:'Lucia Costa',   remail:'lucia@empresa.com',  agent:null,    asset:null,   created:hAgo(5),  updated:hAgo(5) },
        { title:'Impressora HP nao imprime',        desc:'Spooler de impressao com falha no setor financeiro. Documentos ficam na fila.',              status:'waiting',  priority:'medium',   cat:'hardware',channel:'portal',   tier:'N1', rname:'Roberto Dias',  remail:'roberto@empresa.com',agent:carlos,  asset:null,   created:hAgo(8),  updated:hAgo(6) },
        { title:'Solicitar instalacao Adobe Acrobat',desc:'Precisamos do Adobe Acrobat Pro para assinar documentos PDF com validade juridica.',         status:'open',     priority:'low',      cat:'software',channel:'portal',   tier:'N1', rname:'Camila Rocha',  remail:'camila@empresa.com', agent:null,    asset:null,   created:hAgo(10), updated:hAgo(10) },
        { title:'Rede Wi-Fi instavel no 3 andar',   desc:'Quedas frequentes a cada 30 minutos aproximadamente. Varios colaboradores afetados.',         status:'progress', priority:'high',     cat:'rede',    channel:'portal',   tier:'N2', rname:'Diego Martins', remail:'diego@empresa.com',  agent:mariana, asset:null,   created:hAgo(6),  updated:hAgo(3) },
        { title:'Redefinicao de senha AD',           desc:'Senha expirou e usuario esta bloqueado. Nao consegue acessar nenhum sistema.',               status:'resolved', priority:'medium',   cat:'acesso',  channel:'portal',   tier:'N1', rname:'Fernanda Lima', remail:'fern@empresa.com',   agent:ana,     asset:null,   created:hAgo(12), updated:hAgo(10), resolved:hAgo(10) },
        { title:'Notebook nao carrega bateria',      desc:'Carregador conectado mas icone mostra "nao carregando". Testado com outro carregador.',       status:'waiting',  priority:'medium',   cat:'hardware',channel:'email',    tier:'N1', rname:'Thiago Souza',  remail:'thiago@empresa.com', agent:carlos,  asset:null,   created:hAgo(14), updated:hAgo(12) },
        { title:'Acesso negado ao SharePoint',       desc:'Ao tentar abrir pasta compartilhada da equipe, recebe erro de permissao insuficiente.',      status:'resolved', priority:'low',      cat:'acesso',  channel:'portal',   tier:'N1', rname:'Patricia Nunes',remail:'pat@empresa.com',     agent:ana,     asset:ms365Id,created:hAgo(20), updated:hAgo(18), resolved:hAgo(18) },
      ];
      const tickets = ticketData.map(mkTicket);
      db.tickets.insert(tickets, (err, ticketDocs) => {
        const t0 = ticketDocs[0]._id;
        db.comments.insert([
          { _id:uuid(), ticket_id:t0, agent_id:null,        author_name:'Sistema',      body:'Chamado aberto via Portal Web. Roteado automaticamente para N1 com prioridade Critica.', type:'system', created_at:hAgo(2) },
          { _id:uuid(), ticket_id:t0, agent_id:null,        author_name:'IA Triagem',   body:'Classificado como problema de rede/VPN. Artigo sugerido: "VPN nao conecta: solucoes passo a passo".', type:'system', created_at:hAgo(2) },
          { _id:uuid(), ticket_id:t0, agent_id:carlos._id,  author_name:'Carlos Lima',  body:'Chamado assumido. Iniciando diagnostico. Vou verificar os logs do cliente VPN e configuracoes SSL.', type:'note', created_at:hAgo(1.5) },
          { _id:uuid(), ticket_id:t0, agent_id:carlos._id,  author_name:'Carlos Lima',  body:'Sessao de acesso remoto iniciada. Identificado certificado expirado no cliente VPN. Renovando...', type:'note', created_at:hAgo(1) },
        ]);
        // Comments on resolved ticket
        const t7 = ticketDocs[7]._id;
        db.comments.insert([
          { _id:uuid(), ticket_id:t7, agent_id:null,     author_name:'Sistema',    body:'Chamado aberto via Portal Web. Roteado para N1.', type:'system', created_at:hAgo(12) },
          { _id:uuid(), ticket_id:t7, agent_id:ana._id,  author_name:'Ana Torres', body:'Senha redefinida com sucesso no Active Directory. Usuario pode fazer login normalmente.', type:'reply', created_at:hAgo(10) },
        ]);
        console.log('\n✅ Database seeded successfully!\n');
        console.log('Agent credentials:');
        console.log('  admin@helpdesk.com    / admin123   (Admin)');
        console.log('  carlos@helpdesk.com   / carlos123  (N1)');
        console.log('  ana@helpdesk.com      / ana123     (N2)');
        console.log('  mariana@helpdesk.com  / mariana123 (N3)');
        console.log('  lucas@helpdesk.com    / lucas123   (N1)\n');
        console.log('Client credentials:');
        console.log('  joao@empresa.com / joao123\n');
        console.log('Server: http://localhost:3000\n');
      });
    });
  });
});
