const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE;
const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const PERFIL = `Você é a assistente virtual do consultório do nutricionista André Aragão (CRN 11-16678), em Fortaleza-CE. Seu nome é Nutri IA.

SOBRE O CONSULTÓRIO:
- Nutricionista clínico e esportivo, especialista em emagrecimento, composição corporal, Mounjaro/GLP-1 e nutrição esportiva
- Atende presencialmente em Fortaleza (Av. Santos Dumont, 6740 - Cocó, Merit Office) e online para todo o Brasil
- WhatsApp para agendamento: responda sempre com cordialidade e agilidade

SUAS FUNÇÕES:
1. Responder dúvidas nutricionais básicas de forma simples e acessível
2. Informar sobre os serviços e formas de atendimento
3. Fazer triagem de novos pacientes (coletar nome, objetivo, se é presencial ou online)
4. Encaminhar para agendamento

REGRAS:
- Seja cordial, acessível e profissional
- Respostas curtas e diretas — máximo 3 parágrafos
- Nunca dê diagnósticos ou prescrições
- Para dúvidas complexas, oriente a agendar uma consulta
- Quando o paciente quiser agendar, colete: nome, objetivo principal, preferência de horário e se é presencial ou online
- Após coletar as informações, informe que o Dr. André entrará em contato para confirmar o horário
- Não invente informações sobre preços ou horários específicos — diga que o Dr. André confirmará

TOM DE VOZ:
- Acessível mas competente
- Sem terrorismo nutricional
- Sem promessas milagrosas
- Linguagem simples e humana`;

// Histórico de conversas em memória
const conversas = {};

async function responderIA(telefone, mensagem) {
  if (!conversas[telefone]) {
    conversas[telefone] = [];
  }

  conversas[telefone].push({ role: 'user', content: mensagem });

  // Manter apenas últimas 10 mensagens por conversa
  if (conversas[telefone].length > 10) {
    conversas[telefone] = conversas[telefone].slice(-10);
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      system: PERFIL,
      messages: conversas[telefone],
    }),
  });

  const data = await response.json();
  const resposta = data.content?.[0]?.text || 'Desculpe, não consegui processar sua mensagem. Tente novamente.';

  conversas[telefone].push({ role: 'assistant', content: resposta });

  return resposta;
}

async function enviarMensagem(telefone, mensagem) {
  await fetch(`https://api.z-api.io/instances/${ZAPI_INSTANCE}/token/${ZAPI_TOKEN}/send-text`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: telefone, message: mensagem }),
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  try {
    const body = req.body;

    // Ignorar mensagens enviadas pelo próprio número ou notificações
    if (!body?.phone || !body?.text?.message || body?.fromMe) {
      return res.status(200).json({ ok: true });
    }

    const telefone = body.phone;
    const mensagem = body.text.message;

    // Ignorar mensagens de grupo
    if (telefone.includes('@g.us')) {
      return res.status(200).json({ ok: true });
    }

    console.log(`Mensagem de ${telefone}: ${mensagem}`);

    const resposta = await responderIA(telefone, mensagem);
    await enviarMensagem(telefone, resposta);

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Erro no agente:', error);
    return res.status(500).json({ error: error.message });
  }
}
