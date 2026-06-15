// api/image.js — nutriandre-proxy (Vercel)
// Requer: OPENAI_API_KEY nas variáveis de ambiente do Vercel

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método não permitido' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'OPENAI_API_KEY não configurada no Vercel' });

  const { prompt, quality = 'standard', size = '1024x1024' } = req.body || {};

  if (!prompt || typeof prompt !== 'string' || prompt.trim().length < 5) {
    return res.status(400).json({ error: 'Prompt inválido ou ausente' });
  }

  // Tenta gpt-image-1 primeiro (modelo novo), depois dall-e-2 como fallback
  const tentativas = [
    {
      model: 'gpt-image-1',
      body: {
        model: 'gpt-image-1',
        prompt: prompt.trim(),
        n: 1,
        size: size === '1792x1024' ? '1536x1024' : size === '1024x1792' ? '1024x1536' : '1024x1024',
        quality: quality === 'hd' ? 'high' : 'medium',
      },
    },
    {
      model: 'dall-e-2',
      body: {
        model: 'dall-e-2',
        prompt: prompt.trim(),
        n: 1,
        size: '1024x1024',
      },
    },
  ];

  let lastError = '';

  for (const tentativa of tentativas) {
    try {
      const response = await fetch('https://api.openai.com/v1/images/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(tentativa.body),
      });

      const data = await response.json();

      if (!response.ok) {
        lastError = data?.error?.message || `Erro HTTP ${response.status}`;
        console.warn(`[image] ${tentativa.model} falhou:`, lastError);
        continue; // tenta o próximo modelo
      }

      const item = data.data?.[0];
      if (!item) { lastError = 'Resposta vazia da API'; continue; }

      // gpt-image-1 retorna b64_json; dall-e-2 retorna url ou b64_json
      let url = item.url || null;
      if (!url && item.b64_json) {
        url = `data:image/png;base64,${item.b64_json}`;
      }

      if (!url) { lastError = 'Nenhuma imagem na resposta'; continue; }

      return res.status(200).json({
        url,
        revised_prompt: item.revised_prompt || prompt,
        model_used: tentativa.model,
      });

    } catch (err) {
      lastError = err.message;
      console.error(`[image] ${tentativa.model} erro:`, err);
    }
  }

  return res.status(500).json({ error: lastError || 'Falha ao gerar imagem' });
}
