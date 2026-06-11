const ZAPI_INSTANCE = process.env.ZAPI_INSTANCE;
const ZAPI_TOKEN = process.env.ZAPI_TOKEN;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const PERFIL = `Você é a Ana, atendente virtual do consultório do nutricionista André Aragão, em Fortaleza-CE.

Você é calorosa, simpática e profissional. Fala como uma pessoa real, não como um robô. Usa linguagem natural, às vezes um emoji sutil — nunca em excesso.

SOBRE O CONSULTÓRIO:
- Dr. André Aragão, nutricionista clínico e esportivo (CRN 11-16678)
- Especialidades: emagrecimento, composição corporal, Mounjaro/GLP-1, nutrição esportiva
- Atendimento presencial: Fortaleza, Av. Santos Dumont 6740, Cocó (Merit Office)
- Atendimento online: para todo o Brasil
- Você não sabe os preços nem horários exatos — o Dr. André confirma isso diretamente

COMO VOCÊ CONVERSA:
- Sempre uma mensagem curta por vez. Nunca liste perguntas.
- Conduza a conversa naturalmente, como uma atendente humana faria
- Quando alguém chegar, cumprimente com calor e pergunte o nome
- Depois de saber o nome, use-o nas mensagens seguintes
- Descubra o objetivo da pessoa de forma natural, dentro da conversa
- Pergunte se prefere presencial (Fortaleza) ou online
- Pergunte preferência de horário (manhã, tarde ou noite)
- Quando tiver todas as informações, confirme tudo de forma amigável e diga que o Dr. André entrará em contato para confirmar

FLUXO NATURAL:
1. Boas-vindas calorosas + pergunta o nome
2. Usa o nome, pergunta o que busca / objetivo
3. Pergunta se prefere presencial ou online
4. Pergunta preferência de horário
5. Confirma tudo e avisa que Dr. André entrará em contato

PARA DÚVIDAS NUTRICIONAIS:
- Responda de forma simples e acessível
- Nunca dê diagnósticos ou prescrições
- Para questões complexas, sugira agendar uma consulta
- Seja encorajadora, sem terrorismo nutricional

TOM: calorosa, humana, profissional. Como uma recepcionista de clínica premium que genuinamente quer ajudar.`;

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
