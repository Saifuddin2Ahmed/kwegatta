import 'dotenv/config';

async function listModels(apiKey: string) {
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
    if (!res.ok) {
      console.error('List models failed:', res.status, await res.text());
      return [];
    }
    const data = await res.json();
    return data.models || [];
  } catch (e: any) {
    console.error('Error listing models:', e.message);
    return [];
  }
}

async function runBenchmark() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.log('No GEMINI_API_KEY found in process.env');
    return;
  }

  console.log('Querying models available to this API key...');
  const models = await listModels(apiKey);
  const modelNames = models.map((m: any) => m.name.replace('models/', ''));
  console.log('Available models containing gemma:');
  const gemmaModels = modelNames.filter((name: string) => name.toLowerCase().includes('gemma'));
  console.log(gemmaModels);

  const profilePrompt = `Generate a concise headline, bio, and 4 skill tags for a new member on Kwegatta:
Name: Sarah Namubiru
Role: Business Analyst & Founder
Stage: Ideation
Skills: Financial Modeling, Market Research
Looking for: Technical Co-founder for Fintech in Kampala.
Return ONLY valid JSON with keys: headline, bio, tags.`;

  const matchPrompt = `Evaluate the collaboration match between Member A and Member B:
Member A: Sarah Namubiru, Role: Business Analyst, Looking for: Technical Co-founder, Location: Kampala
Member B: David Okello, Role: Full-Stack Developer, Looking for: Business partner for fintech, Location: Kampala
Return ONLY valid JSON with keys: score (0-100), reasoning (1-2 sentences), strengths (array of strings).`;

  const testModels = ['gemma-4-26b-a4b-it', 'gemma-4-31b-it'];

  for (const model of testModels) {
    console.log(`\n========================================`);
    console.log(`Starting benchmark for: ${model}`);
    console.log(`========================================`);

    const ttftList: number[] = [];
    const totalTimeList: number[] = [];
    let failures = 0;
    const sampleOutputs: string[] = [];

    // 10 calls total: 5 profile prompts, 5 match prompts
    for (let i = 0; i < 10; i++) {
      const prompt = i % 2 === 0 ? profilePrompt : matchPrompt;
      const start = Date.now();
      let ttft = 0;
      let totalTime = 0;
      let fullText = '';

      try {
        const streamUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
        const res = await fetch(streamUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.2,
              thinkingConfig: { thinkingLevel: 'MINIMAL' }
            }
          })
        });

        if (!res.ok) {
          failures++;
          console.log(`Call ${i + 1}/10 failed with status ${res.status}`);
          continue;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          failures++;
          continue;
        }

        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (!ttft && chunk.includes('text')) {
            ttft = Date.now() - start;
          }
          buffer += chunk;
        }

        totalTime = Date.now() - start;
        if (!ttft) ttft = totalTime;

        ttftList.push(ttft);
        totalTimeList.push(totalTime);
        if (i < 2) {
          sampleOutputs.push(buffer.slice(0, 200));
        }

        console.log(`Call ${i + 1}/10: TTFT = ${ttft}ms, Total = ${totalTime}ms`);
      } catch (err: any) {
        failures++;
        console.log(`Call ${i + 1}/10 error:`, err.message);
      }
    }

    const avgTtft = ttftList.length ? (ttftList.reduce((a, b) => a + b, 0) / ttftList.length).toFixed(0) : 'N/A';
    const avgTotal = totalTimeList.length ? (totalTimeList.reduce((a, b) => a + b, 0) / totalTimeList.length).toFixed(0) : 'N/A';
    const minTtft = ttftList.length ? Math.min(...ttftList) : 'N/A';
    const minTotal = totalTimeList.length ? Math.min(...totalTimeList) : 'N/A';

    console.log(`\nRESULTS FOR ${model}:`);
    console.log(`- Success Rate: ${10 - failures}/10 (Failures: ${failures})`);
    console.log(`- Avg TTFT: ${avgTtft}ms (Min: ${minTtft}ms)`);
    console.log(`- Avg Total Duration: ${avgTotal}ms (Min: ${minTotal}ms)`);
  }
}

runBenchmark();
