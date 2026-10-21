const express = require('express');
const path = require('node:path');

const app = express();
const port = Number(process.env.PORT) || 4201;
const apiOnly = process.argv.includes('--api-only');
const host = apiOnly ? '127.0.0.1' : process.env.HOST || '0.0.0.0';

app.use(express.json({ limit: '160kb' }));

app.post('/api/gemini/interactions', async (req, res) => {
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

  let clientClosed = false;
  res.on('close', () => { if (!res.writableEnded) clientClosed = true; });
  try {
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: { headers: { 'Api-Revision': '2026-05-20' } },
    });
    const stream = await ai.interactions.create({
      model: 'gemini-3.8-flash',
      input: `${instructions}\n\n${prompt}\n\n<extracted_pdf_text>\n${sourceText}\n</extracted_pdf_text>`,
      stream: true,
      generation_config: { max_output_tokens: maxOutputTokens, thinking_level: 'low' },
    });

    res.status(200);
    res.set({
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    for await (const event of stream) {
      if (clientClosed) break;
      if (event.event_type === 'step.delta' && event.delta.type === 'text' && event.delta.text) {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      } else if (event.event_type === 'interaction.failed') {
        const message = event.error?.message || 'Gemini could not summarize this document.';
        res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
      }
    }
    if (!clientClosed) res.end('data: [DONE]\n\n');
  } catch (error) {
    const status = Number(error?.status) || 500;
    const upstreamMessage = String(error?.message || '').replaceAll(apiKey, '[redacted]').slice(0, 500);
    const message = status === 429
      ? 'Gemini free-tier rate limit reached. Wait a little and try again.'
      : status === 401 || status === 403
        ? 'Gemini rejected the API key or the key does not have access to this model.'
        : `Gemini request failed${upstreamMessage ? `: ${upstreamMessage}` : '.'}`;
    console.error(`Gemini Interactions request failed (${status}): ${upstreamMessage || 'Unknown error'}`);
    if (!res.headersSent) res.status(status).json({ error: message });
    else if (!clientClosed) {
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
      res.end();
    }
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
