// api/image.js — adicionar na raiz do projeto do proxy (nutriandre-proxy)
// Requer: variável de ambiente OPENAI_API_KEY no painel do Vercel

export default async function handler(req, res) {

  // CORS — permite chamadas do Estúdio e de localhost
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'OPENAI_API_KEY não configurada no Vercel' });
  }

  const {
    prompt,
    quality = 'standard', // 'standard' ou 'hd'
    size    = '1024x1024', // '1024x1024' | '1024x1792' | '1792x1024'
  } = req.body || {};

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 5) {
    return res.status(400).json({ error: 'Prompt inválido ou ausente' });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:           'dall-e-3',
        prompt:          prompt.trim(),
        n:               1,          // DALL-E 3 só gera 1 por chamada
        quality,
        size,
        response_format: 'url',
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const msg = data?.error?.message || 'Erro na API da OpenAI';
      console.error('[image] OpenAI error:', msg);
      return res.status(response.status).json({ error: msg });
    }

    // Retorna a URL da imagem e o prompt revisado pela OpenAI
    return res.status(200).json({
      url:            data.data[0].url,
      revised_prompt: data.data[0].revised_prompt ?? prompt,
    });

  } catch (err) {
    console.error('[image] fetch error:', err);
    return res.status(500).json({ error: 'Erro interno ao chamar a OpenAI' });
  }
}
