// Gemma proxy for Google Cloud Functions (2nd gen) / Cloud Run.
// Keeps the API key strictly on the server and only allows the open-weight model gemma-4-31b-it.
const functions = require('@google-cloud/functions-framework');

functions.http('gemma', async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'content-type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: { message: 'Use POST' } });

  try {
    const { model = 'gemma-4-31b-it', contents, generationConfig } = req.body || {};
    if (model !== 'gemma-4-31b-it') {
      return res.status(400).json({ error: { message: 'Only gemma-4-31b-it open-weight model is allowed' } });
    }
    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(500).json({ error: { message: 'GEMINI_API_KEY is not configured on the server' } });

    const endpoints = [
      `https://generativelanguage.googleapis.com/v1/models/gemma-4-31b-it:generateContent?key=${encodeURIComponent(key)}`,
      `https://generativelanguage.googleapis.com/v1beta/models/gemma-4-31b-it:generateContent?key=${encodeURIComponent(key)}`
    ];

    let lastError = null;

    // Retry once on 500 or timeout with 90s timeout
    for (let attempt = 1; attempt <= 2; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 90000); // 90 seconds
      const targetUrl = attempt === 1 ? endpoints[0] : endpoints[1];

      try {
        const upstream = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents,
            generationConfig: {
              temperature: 0.1,
              ...(generationConfig || {})
            }
          }),
          signal: controller.signal
        });

        clearTimeout(timeout);

        if (upstream.status >= 500 && attempt < 2) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }

        const text = await upstream.text();
        return res.status(upstream.status).type('application/json').send(text);
      } catch (err) {
        clearTimeout(timeout);
        lastError = err;
        if (attempt < 2) {
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        return res.status(500).json({
          error: {
            message: err.name === 'AbortError'
              ? 'Gemma model request timed out after 90 seconds'
              : String(err)
          }
        });
      }
    }

    return res.status(500).json({ error: { message: String(lastError) } });
  } catch (e) {
    res.status(500).json({ error: { message: String(e) } });
  }
});
