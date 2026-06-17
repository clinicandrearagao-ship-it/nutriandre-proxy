// api/image.js — nutriandre-proxy (Vercel)
// Requer: OPENAI_API_KEY nas variáveis de ambiente do Vercel

// Aumenta o timeout da função para 60s (planos Pro) — livre fica em 10s
export const maxDuration = 60;

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

  // Tamanho DALL-E 3: suporta 1024x1792 nativamente (portrait perfeito para Instagram)
  const dalleSize = (size === '1024x1792' || size === '1792x1024') ? size : '1024x1024';

  // Tentativas em ordem: DALL-E 3 (amplamente disponível) → DALL-E 2 fallback
  const tentativas = [
    {
      model: 'dall-e-3',
      body: {
        model: 'dall-e-3',
        prompt: prompt.trim(),
        n: 1,
        size: dalleSize,
        quality: quality === 'hd' ? 'hd' : 'standard',
        response_format: 'b64_json',
      },
    },
    {
      model: 'dall-e-2',
      body: {
        model: 'dall-e-2',
        prompt: prompt.trim().slice(0, 1000), // DALL-E 2 limita a 1000 chars
        n: 1,
        size: '1024x1024',
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
        continue; // tenta o próximo modelo
      }

      const item = data.data?.[0];
      if (!item) { lastError = 'Resposta vazia da API'; continue; }

      // Retorna b64_json diretamente — evita expiração de URLs
      if (item.b64_json) {
        return res.status(200).json({
          b64_json: item.b64_json,
          revised_prompt: item.revised_prompt || prompt,
          model_used: tentativa.model,
        });
      }

      // Fallback: URL (dall-e-2 sem response_format)
      if (item.url) {
        return res.status(200).json({
          url: item.url,
          revised_prompt: item.revised_prompt || prompt,
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
