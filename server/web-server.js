const express = require('express');
const path = require('node:path');

const app = express();
const port = Number(process.env.PORT) || 4201;
const apiOnly = process.argv.includes('--api-only');
const host = apiOnly ? '127.0.0.1' : process.env.HOST || '0.0.0.0';
let nextRequestId = 1;

app.use(express.json({ limit: '160kb' }));

app.post('/api/gemini/interactions', async (req, res) => {
  const requestId = `gemini-${Date.now()}-${nextRequestId++}`;
  const startedAt = Date.now();
  console.info(`[${requestId}] POST /api/gemini/interactions received`);
  const apiKey = typeof req.body?.apiKey === 'string' ? req.body.apiKey.trim() : '';
  const sourceText = typeof req.body?.sourceText === 'string' ? req.body.sourceText : '';
  const prompt = typeof req.body?.prompt === 'string' ? req.body.prompt : '';
  const instructions = typeof req.body?.instructions === 'string' ? req.body.instructions : '';
  const maxOutputTokens = Number(req.body?.maxOutputTokens);

  if (!apiKey || apiKey.length > 512) return res.status(400).json({ error: 'Enter a valid Gemini API key.' });
  if (!sourceText || sourceText.length > 24000) return res.status(400).json({ error: 'The extracted text is empty or too long for this request.' });
  if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1 || maxOutputTokens > 1024) {
    return res.status(400).json({ error: 'The summary length setting is invalid.' });
  }

  try {
    const upstream = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
      method: 'POST',
      headers: {
        'x-goog-api-key': apiKey,
        'Content-Type': 'application/json',
        'Api-Revision': '2026-05-20',
      },
      body: JSON.stringify({
        model: 'gemini-3.8-flash',
        input: `${instructions}\n\n${prompt}\n\n<extracted_pdf_text>\n${sourceText}\n</extracted_pdf_text>`,
      }),
    });
    console.info(`[${requestId}] Gemini upstream responded ${upstream.status} in ${Date.now() - startedAt}ms`);
    const interaction = await upstream.json().catch(() => null);
    if (!upstream.ok) {
      const detail = interaction?.error?.message || `Gemini returned HTTP ${upstream.status}.`;
      const error = new Error(detail);
      error.status = upstream.status;
      throw error;
    }
    const text = typeof interaction?.output_text === 'string'
      ? interaction.output_text
      : (interaction?.outputs || []).filter((item) => item?.type === 'text').map((item) => item.text || '').join('');
    if (!text.trim()) throw new Error('Gemini returned no summary. Try a shorter document or another summary style.');
    console.info(`[${requestId}] Summary succeeded in ${Date.now() - startedAt}ms`);
    res.json({ text: text.trim(), requestId });
  } catch (error) {
    const status = Number(error?.status) || 500;
    const upstreamMessage = String(error?.message || '').replaceAll(apiKey, '[redacted]').slice(0, 500);
    const message = status === 429
      ? 'Gemini free-tier rate limit reached. Wait a little and try again.'
      : status === 401 || status === 403
        ? 'Gemini rejected the API key or the key does not have access to this model.'
        : `Gemini request failed${upstreamMessage ? `: ${upstreamMessage}` : '.'}`;
    console.error(`[${requestId}] Gemini Interactions request failed (${status}) after ${Date.now() - startedAt}ms: ${upstreamMessage || 'Unknown error'}`);
    if (!res.headersSent) res.status(status).json({ error: message, requestId });
    else res.end();
  }
});

if (!apiOnly) {
  const browserBuild = path.join(__dirname, '..', 'dist', 'theconvertor', 'browser');
  app.use(express.static(browserBuild));
  app.get(/.*/, (_req, res) => res.sendFile(path.join(browserBuild, 'index.html')));
}

app.listen(port, host, () => {
  console.log(`PDF Master Studio web ${apiOnly ? 'API' : 'app'} server listening on http://127.0.0.1:${port}`);
});
