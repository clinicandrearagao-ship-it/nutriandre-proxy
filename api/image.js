// api/image.js — nutriandre-proxy (Vercel)
// Requer: OPENAI_API_KEY nas variáveis de ambiente do Vercel

export const maxDuration = 60; // Pro plan: até 60s | Hobby: ignorado (10s)

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

  // DALL-E 2 primeiro: rápido (5-8s), cabe no timeout do Vercel Hobby (10s)
  // DALL-E 3 como fallback: mais bonito mas mais lento (15-25s), precisa do Pro
  const tentativas = [
    {
      model: 'dall-e-2',
      body: {
        model: 'dall-e-2',
        prompt: prompt.trim().slice(0, 1000), // limite DALL-E 2: 1000 chars
        n: 1,
        size: '1024x1024',
        response_format: 'b64_json',
      },
    },
    {
      model: 'dall-e-3',
      body: {
        model: 'dall-e-3',
        prompt: prompt.trim(),
        n: 1,
        size: (size === '1024x1792' || size === '1792x1024') ? size : '1024x1024',
        quality: quality === 'hd' ? 'hd' : 'standard',
        response_format: 'b64_json',
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
        continue;
      }

      const item = data.data?.[0];
      if (!item) { lastError = 'Resposta vazia da API'; continue; }

      if (item.b64_json) {
        return res.status(200).json({
          b64_json: item.b64_json,
          model_used: tentativa.model,
        });
      }

      if (item.url) {
        return res.status(200).json({
          url: item.url,
          model_used: tentativa.model,
        });
      }

      lastError = 'Nenhuma imagem na resposta';

    } catch (err) {
      lastError = err.message;
      console.error(`[image] ${tentativa.model} erro:`, err);
    }
  }

  return res.status(500).json({ error: lastError || 'Falha ao gerar imagem' });
}
