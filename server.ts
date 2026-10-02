import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

app.use(express.json({ limit: '10mb' }));

// Initial realistic MUBS / Hack Day Kampala demo cohort
const INITIAL_DEMO_MEMBERS = [
  {
    id: 'demo-amina',
    name: 'Amina Nakato',
    role: 'business',
    headline: 'Market researcher & business development lead',
    bio: 'MUBS business student specializing in market discovery and customer validation. Looking for a mobile engineer to build a digital saving-circles platform.',
    offers: 'Marketing, customer interviews, pitch decks, budgeting and revenue models',
    needs: 'A mobile developer for a savings-group app for student entrepreneurs',
    teaches: 'Financial modeling, pitch deck storytelling and business plans',
    learns: 'Flutter basics and how APIs work',
    tags: ['marketing', 'fintech', 'research', 'pitch-decks', 'mubs'],
    skills: ['Customer Interviews', 'Financial Modeling', 'Pitch Decks', 'Pricing Strategy'],
    github: 'amina-nakato',
    linkedin: 'https://www.linkedin.com/in/amina-nakato-demo',
    whatsapp: '256772123456',
    avatar: '',
    status: 'Looking for a co-founder',
    is_demo: true,
    created_at: new Date(Date.now() - 3600000 * 20).toISOString(),
    gh: {
      login: 'amina-nakato',
      repos: 3,
      langs: ['Markdown', 'HTML'],
      top: [{ name: 'savings-circle-spec', desc: 'Requirements and customer surveys for saving-group apps', lang: 'Markdown', stars: 4, url: 'https://github.com' }]
    }
  },
  {
    id: 'demo-brian',
    name: 'Brian Okello',
    role: 'builder',
    headline: 'Full-stack mobile engineer building with Flutter',
    bio: 'Computer science builder passionate about offline-first fintech tools. Looking for an energetic co-founder who understands local merchant distribution.',
    offers: 'Flutter and Firebase cross-platform mobile apps, REST APIs, state management',
    needs: 'A business partner who understands sales, pricing and merchant outreach',
    teaches: 'Flutter UI, Dart state management, Firebase Firestore integration',
    learns: 'B2B sales and investor pitching',
    tags: ['flutter', 'mobile', 'firebase', 'dart', 'offline-first'],
    skills: ['Flutter', 'Dart', 'Firebase', 'State Management', 'Android'],
    github: 'brian-okello-dev',
    linkedin: 'https://www.linkedin.com/in/brian-okello-demo',
    whatsapp: '256782234567',
    avatar: '',
    status: 'Looking for a team',
    is_demo: true,
    created_at: new Date(Date.now() - 3600000 * 18).toISOString(),
    gh: {
      login: 'brian-okello-dev',
      repos: 14,
      langs: ['Dart', 'TypeScript', 'Kotlin'],
      top: [
        { name: 'kampala-pos', desc: 'Offline retail POS prototype in Flutter', lang: 'Dart', stars: 12, url: 'https://github.com' },
        { name: 'momo-gateway-mock', desc: 'Mobile money API test wrapper', lang: 'TypeScript', stars: 9, url: 'https://github.com' }
      ]
    }
  },
  {
    id: 'demo-grace',
    name: 'Grace Atim',
    role: 'design',
    headline: 'Product designer focusing on accessible UI/UX',
    bio: 'Designer crafting intuitive user interfaces for East African digital products in Figma. Looking for frontend developers who care about pixel precision.',
    offers: 'UI and UX design in Figma, design systems, interactive prototypes, branding',
    needs: 'A developer to turn my designs into a live web or mobile product',
    teaches: 'Figma auto-layout, mobile usability heuristics, brand identity',
    learns: 'Tailwind CSS and responsive web implementation',
    tags: ['ui-ux', 'figma', 'branding', 'design-systems', 'accessibility'],
    skills: ['Figma', 'UI Design', 'Wireframing', 'User Testing', 'Design Tokens'],
    github: 'grace-atim-design',
    linkedin: 'https://www.linkedin.com/in/grace-atim-demo',
    whatsapp: '256701345678',
    avatar: '',
    status: 'Open to projects',
    is_demo: true,
    created_at: new Date(Date.now() - 3600000 * 15).toISOString(),
    gh: {
      login: 'grace-atim-design',
      repos: 5,
      langs: ['CSS', 'HTML'],
      top: [{ name: 'kampala-design-kit', desc: 'Open-source Primer-style UI tokens for Ugandan startups', lang: 'CSS', stars: 15, url: 'https://github.com' }]
    }
  },
  {
    id: 'demo-daniel',
    name: 'Daniel Ssemwanga',
    role: 'builder',
    headline: 'Data analyst & Python developer',
    bio: 'Building data scrapers and predictive models for agriculture markets. Seeking partners who have direct access to cooperative unions and farmers.',
    offers: 'Python, data analysis, Pandas, machine learning, web scraping, backend APIs',
    needs: 'Someone who knows agriculture supply chains and farmer cooperatives',
    teaches: 'Python data science, Jupyter, REST API development with FastAPI',
    learns: 'Agribusiness economics and rural logistics',
    tags: ['python', 'data', 'machine-learning', 'fastapi', 'agritech'],
    skills: ['Python', 'Pandas', 'FastAPI', 'Data Analytics', 'Scikit-learn'],
    github: 'dan-ssemwanga',
    linkedin: 'https://www.linkedin.com/in/daniel-ssemwanga-demo',
    whatsapp: '256752456789',
    avatar: '',
    status: 'Looking for a co-founder',
    is_demo: true,
    created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
    gh: {
      login: 'dan-ssemwanga',
      repos: 19,
      langs: ['Python', 'SQL', 'Shell'],
      top: [
        { name: 'uganda-crop-prices', desc: 'Scraper and visualizer for weekly regional market prices', lang: 'Python', stars: 22, url: 'https://github.com' },
        { name: 'soil-yield-model', desc: 'Predictive regression for maize yields', lang: 'Python', stars: 11, url: 'https://github.com' }
      ]
    }
  },
  {
    id: 'demo-sarah',
    name: 'Sarah Namutebi',
    role: 'business',
    headline: 'Accounting major & grant strategist',
    bio: 'Final year accounting student at MUBS experienced in unit economics and grant applications. Looking for a developer to co-create digital bookkeeping for SMEs.',
    offers: 'Accounting, financial models, grant writing, tax filings, compliance',
    needs: 'A technical co-founder for a simplified WhatsApp bookkeeping tool',
    teaches: 'Cash flow forecasting, business valuation and grant budget preparation',
    learns: 'No-code tools and automation webhooks',
    tags: ['finance', 'accounting', 'grants', 'smes', 'bookkeeping'],
    skills: ['Accounting', 'Financial Modeling', 'Grant Proposals', 'Tax Planning'],
    github: '',
    linkedin: 'https://www.linkedin.com/in/sarah-namutebi-demo',
    whatsapp: '256773567890',
    avatar: '',
    status: 'Looking for a co-founder',
    is_demo: true,
    created_at: new Date(Date.now() - 3600000 * 9).toISOString(),
    gh: null
  },
  {
    id: 'demo-joseph',
    name: 'Joseph Mugisha',
    role: 'builder',
    headline: 'Full-stack TypeScript & React engineer',
    bio: 'Software engineer building web apps with Next.js, React and Node. Eager to partner with a growth marketer to launch hackathon projects to the public.',
    offers: 'Web development with React, TypeScript, Node.js, Express, Tailwind CSS',
    needs: 'A designer and help finding our first 50 paying customers',
    teaches: 'Modern React hooks, TypeScript patterns, Tailwind CSS layouts',
    learns: 'Product positioning, SEO and early user acquisition',
    tags: ['react', 'node', 'typescript', 'tailwind', 'fullstack'],
    skills: ['React', 'TypeScript', 'Node.js', 'Tailwind CSS', 'PostgreSQL'],
    github: 'joseph-mugisha',
    linkedin: 'https://www.linkedin.com/in/joseph-mugisha-demo',
    whatsapp: '256784678901',
    avatar: '',
    status: 'Looking for a team',
    is_demo: true,
    created_at: new Date(Date.now() - 3600000 * 6).toISOString(),
    gh: {
      login: 'joseph-mugisha',
      repos: 28,
      langs: ['TypeScript', 'JavaScript', 'HTML'],
      top: [
        { name: 'kampala-dev-jobs', desc: 'Job board aggregator for Kampala tech talent', lang: 'TypeScript', stars: 31, url: 'https://github.com' },
        { name: 'react-uganda-components', desc: 'Accessible components with mobile money payment drawers', lang: 'TypeScript', stars: 18, url: 'https://github.com' }
      ]
    }
  },
  {
    id: 'demo-esther',
    name: 'Esther Achieng',
    role: 'other',
    headline: 'Agribusiness manager & rural network lead',
    bio: 'Working directly with coffee and maize farming cooperatives in Eastern Uganda. Seeking technical builders to digitize crop collection logs.',
    offers: 'Deep agriculture field domain knowledge, cooperative network, ground logistics',
    needs: 'An app developer and a data person to build an SMS/mobile collection register',
    teaches: 'Field operational logistics, farmer onboarding, cooperative governance',
    learns: 'Digital tools for inventory management',
    tags: ['agritech', 'community', 'operations', 'logistics', 'cooperatives'],
    skills: ['Field Operations', 'Farmer Training', 'Logistics', 'Stakeholder Management'],
    github: '',
    linkedin: 'https://www.linkedin.com/in/esther-achieng-demo',
    whatsapp: '256705789012',
    avatar: '',
    status: 'Looking for a mentor',
    is_demo: true,
    created_at: new Date(Date.now() - 3600000 * 3).toISOString(),
    gh: null
  },
  {
    id: 'demo-peter',
    name: 'Peter Kato',
    role: 'builder',
    headline: 'IoT hardware hacker & embedded systems tinkerer',
    bio: 'Building low-cost solar telemetry and moisture sensors using ESP32 and Arduino. Looking for web devs to build real-time monitoring dashboards.',
    offers: 'Hardware prototyping, Arduino, ESP32, IoT sensors, PCB soldering',
    needs: 'A frontend web developer and advice on prototype grant funding',
    teaches: 'Microcontroller basics, sensor calibration and MQTT networking',
    learns: 'React dashboard visualization and WebSockets',
    tags: ['iot', 'arduino', 'hardware', 'embedded', 'sensors'],
    skills: ['Arduino', 'ESP32', 'C++', 'Circuits', 'MQTT'],
    github: 'peter-kato-iot',
    linkedin: 'https://www.linkedin.com/in/peter-kato-demo',
    whatsapp: '256756890123',
    avatar: '',
    status: 'Open to projects',
    is_demo: true,
    created_at: new Date(Date.now() - 3600000 * 1).toISOString(),
    gh: {
      login: 'peter-kato-iot',
      repos: 11,
      langs: ['C++', 'C', 'Python'],
      top: [{ name: 'solar-monitor-firmware', desc: 'ESP32 firmware logging solar voltage over GSM/GPRS', lang: 'C++', stars: 14, url: 'https://github.com' }]
    }
  }
];

// In-memory data store with disk persistence for multi-device sync
const DATA_FILE = path.join(__dirname, '.kwegatta_store.json');

interface StoreData {
  profiles: any[];
  follows: any[];
  matches: any[];
  notifications: any[];
  posts: any[];
}

function loadStore(): StoreData {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      if (parsed.profiles && Array.isArray(parsed.profiles)) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to read persistent store, initializing fresh store:', err);
  }

  const initial: StoreData = {
    profiles: [...INITIAL_DEMO_MEMBERS],
    follows: [],
    matches: [
      {
        id: 'match-amina-brian',
        a_id: 'demo-amina',
        b_id: 'demo-brian',
        score: 94,
        reason: 'Amina needs a mobile developer for a savings group app, which Brian specializes in with Flutter and Firebase.',
        spark: 'Kampala Student Thrift: mobile savings and lending circle app with automated ledger sync.',
        created_at: new Date(Date.now() - 3600000 * 14).toISOString()
      },
      {
        id: 'match-grace-joseph',
        a_id: 'demo-grace',
        b_id: 'demo-joseph',
        score: 92,
        reason: 'Grace offers complete UI/UX Figma systems that Joseph can immediately implement in React and Tailwind.',
        spark: 'Campus Boda: on-demand campus parcel courier booking web app.',
        created_at: new Date(Date.now() - 3600000 * 8).toISOString()
      },
      {
        id: 'match-daniel-esther',
        a_id: 'demo-daniel',
        b_id: 'demo-esther',
        score: 95,
        reason: 'Daniel provides data science and predictive market scrapers; Esther provides cooperative relationships and ground logistics.',
        spark: 'Gulu Grain Price Predictor: USSD & web grain price advisory for rural cooperatives.',
        created_at: new Date(Date.now() - 3600000 * 4).toISOString()
      }
    ],
    notifications: [],
    posts: [
      {
        id: 'post-1',
        author_id: 'demo-amina',
        title: 'Need a Flutter builder for Hack Day project',
        body: 'We are validating a group savings tool for campus trade associations. Already interviewed 15 students today at MUBS. Looking for a builder to join our pitch team before 4 PM!',
        kind: 'need',
        tags: ['fintech', 'flutter', 'hackday', 'mubs'],
        created_at: new Date(Date.now() - 3600000 * 2).toISOString()
      },
      {
        id: 'post-2',
        author_id: 'demo-peter',
        title: 'Offering ESP32 sensors & hardware kit',
        body: 'I brought 4 ESP32 boards, temperature and soil moisture sensors to the hackathon. If your team has an agritech or climate idea, let me build the hardware layer for you!',
        kind: 'offer',
        tags: ['iot', 'hardware', 'agritech'],
        created_at: new Date(Date.now() - 3600000 * 1.5).toISOString()
      },
      {
        id: 'post-3',
        author_id: 'demo-grace',
        title: 'Primer UI tokens ready for hackathon web apps',
        body: 'Just finished open-sourcing a clean GitHub-style design kit in Figma with dark & light modes. Free for all teams here today!',
        kind: 'idea',
        tags: ['design', 'ui-ux', 'figma'],
        created_at: new Date(Date.now() - 3600000 * 0.8).toISOString()
      }
    ]
  };

  saveStore(initial);
  return initial;
}

function saveStore(store: StoreData) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write store file:', err);
  }
}

let store = loadStore();

/* =========================================================================
   HARD RULE ENFORCEMENT: ONLY gemma-4-31b-it IS ALLOWED. NEVER ANY OTHER MODEL.
   ========================================================================= */
const REQUIRED_OPEN_WEIGHT_MODEL = 'gemma-4-31b-it';
const GEMMA_TIMEOUT_MS = 90000; // 90 seconds timeout for open-weight 31B model

app.post('/api/gemma', async (req: Request, res: Response) => {
  const { model = REQUIRED_OPEN_WEIGHT_MODEL, contents, generationConfig } = req.body || {};

  // HARD CONSTRAINT VERIFICATION:
  if (model !== REQUIRED_OPEN_WEIGHT_MODEL) {
    return res.status(400).json({
      error: {
        message: `Violates Hackathon hard rule: Only open-weight model ${REQUIRED_OPEN_WEIGHT_MODEL} is allowed. Attempted to call: ${model}`
      }
    });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: {
        message: 'GEMINI_API_KEY is not configured on the server environment. Fallback to keyword matching activated.'
      }
    });
  }

  // Attempt up to 2 times (retry once on 500, 503, or timeout)
  let lastError: any = null;
  // Always use v1beta which fully supports gemma-4-31b-it and thinkingLevel
  const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${REQUIRED_OPEN_WEIGHT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMMA_TIMEOUT_MS);

    try {
      console.log(`[Gemma 4] Invoking open-weight model (attempt ${attempt}/2, 90s timeout)...`);
      
      // Set thinking to lowest level the model allows (MINIMAL) to make answers fast
      // CRITICAL: Do NOT send `temperature` to gemma-4-31b-it as it causes upstream 500 "Internal error encountered"
      const userConfig = (generationConfig && typeof generationConfig === 'object') ? generationConfig : {};
      const { temperature, thinkingConfig, ...safeConfig } = userConfig as any;
      const requestPayload: any = {
        contents,
        generationConfig: {
          ...safeConfig,
          thinkingConfig: {
            thinkingLevel: 'MINIMAL'
          }
        }
      };

      const apiResponse = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestPayload),
        signal: controller.signal
      });

      clearTimeout(timeout);

      // On 500 or 503, retry once before failing
      if (apiResponse.status >= 500) {
        const errorText = await apiResponse.text().catch(() => '');
        console.warn(`[Gemma 4] Upstream returned status ${apiResponse.status} on attempt ${attempt}:`, errorText.slice(0, 200));
        lastError = new Error(`Gemma upstream error ${apiResponse.status}: ${errorText.slice(0, 150)}`);
        if (attempt < 2) {
          console.log('[Gemma 4] Retrying request once after 1s delay...');
          await new Promise(r => setTimeout(r, 1000));
          continue;
        }
        return res.status(apiResponse.status).json({ error: { message: lastError.message } });
      }

      const data = await apiResponse.json();
      if (!apiResponse.ok) {
        console.warn(`[Gemma 4] Returned non-200 status ${apiResponse.status}:`, data);
        return res.status(apiResponse.status).json(data);
      }

      console.log(`[Gemma 4] Succeeded on attempt ${attempt}`);
      return res.json(data);
    } catch (error: any) {
      clearTimeout(timeout);
      const isTimeout = error.name === 'AbortError' || error.message?.includes('abort');
      console.warn(`[Gemma 4] Error on attempt ${attempt}:`, isTimeout ? 'Timed out after 90 seconds' : error.message);
      lastError = error;

      if (attempt < 2) {
        console.log('[Gemma 4] Retrying request once after error...');
        await new Promise(r => setTimeout(r, 1000));
        continue;
      }

      return res.status(500).json({
        error: {
          message: isTimeout
            ? 'Gemma model request timed out after 90 seconds'
            : (error.message || 'Server error communicating with Gemma 4')
        }
      });
    }
  }

  return res.status(500).json({
    error: {
      message: lastError?.message || 'Failed to get response from Gemma 4'
    }
  });
});

// Explicit connect endpoint: reveals WhatsApp number ONLY upon intentional connect action
app.post('/api/connect', (req: Request, res: Response) => {
  const { requester_id, target_id, note, reason } = req.body || {};
  if (!target_id) {
    return res.status(400).json({ error: 'Target member ID is required' });
  }

  const target = store.profiles.find((p: any) => p.id === target_id);
  if (!target) {
    return res.status(404).json({ error: 'Target member not found' });
  }

  const requester = store.profiles.find((p: any) => p.id === requester_id);
  const requesterName = requester ? requester.name : 'A member';

  // Dispatch a notification to the target member
  const notif = {
    id: 'notif-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
    to_id: target_id,
    from_id: requester_id || 'anonymous',
    type: 'connect',
    body: `${requesterName} reached out to connect: "${reason || note || 'Let\'s collaborate!'}"`,
    read: false,
    created_at: new Date().toISOString()
  };

  store.notifications.unshift(notif);
  saveStore(store);

  // Return protected contact info ONLY upon this explicit connect interaction
  return res.json({
    success: true,
    target_id: target.id,
    target_name: target.name,
    whatsapp: target.whatsapp || '',
    linkedin: target.linkedin || ''
  });
});

// Delete member profile permanently (Digital Public Goods & Privacy requirement)
app.delete('/api/profiles/:id', (req: Request, res: Response) => {
  const id = req.params.id;
  const initialCount = store.profiles.length;
  store.profiles = store.profiles.filter((p: any) => p.id !== id);
  store.posts = store.posts.filter((p: any) => p.author_id !== id);
  store.follows = store.follows.filter((f: any) => f.follower_id !== id && f.following_id !== id);
  store.matches = store.matches.filter((m: any) => m.a_id !== id && m.b_id !== id);
  store.notifications = store.notifications.filter((n: any) => n.to_id !== id && n.from_id !== id);

  saveStore(store);
  return res.json({
    success: true,
    deleted: initialCount !== store.profiles.length,
    message: 'Profile and associated personal data deleted permanently.'
  });
});

// App configuration diagnostics (NO SECRET KEYS EXPOSED)
app.get('/api/config', (_req: Request, res: Response) => {
  res.json({
    appName: 'Kwegatta',
    model: REQUIRED_OPEN_WEIGHT_MODEL,
    hasServerApiKey: Boolean(process.env.GEMINI_API_KEY),
    appUrl: process.env.APP_URL || ''
  });
});

// Universal multi-device data layer (Profiles, Follows, Matches, Notifications, Posts)
app.get('/api/data/:collection', (req: Request, res: Response) => {
  const col = req.params.collection as keyof StoreData;
  if (!store[col]) {
    return res.status(404).json({ error: `Collection ${col} not found` });
  }

  let items = [...store[col]];
  const eqQuery = req.query.eq as string;
  if (eqQuery) {
    try {
      const eqObj = JSON.parse(eqQuery);
      items = items.filter(item => Object.keys(eqObj).every(k => item[k] === eqObj[k]));
    } catch (e) {
      // ignore parse error
    }
  }

  const after = req.query.after as string;
  if (after) {
    items = items.filter(item => item.created_at && item.created_at > after);
  }

  const limit = Number(req.query.limit) || 300;
  items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const sliced = items.slice(0, limit);

  // Digital Public Goods Privacy Standard:
  // Stop returning WhatsApp numbers in the public member list API.
  // Return the number only for the member's own profile, or when pressing Connect via /api/connect.
  if (col === 'profiles') {
    const callerId = (req.headers['x-user-id'] as string) || (req.query.as_user_id as string) || '';
    const safeProfiles = sliced.map(p => {
      const isSelf = Boolean(callerId && p.id === callerId);
      return {
        ...p,
        whatsapp: isSelf ? (p.whatsapp || '') : '',
        has_whatsapp: Boolean(p.whatsapp && String(p.whatsapp).trim().length > 0)
      };
    });
    return res.json(safeProfiles);
  }

  return res.json(sliced);
});

app.post('/api/data/:collection', (req: Request, res: Response) => {
  const col = req.params.collection as keyof StoreData;
  if (!store[col]) {
    return res.status(404).json({ error: `Collection ${col} not found` });
  }

  const row = {
    id: req.body.id || 'id-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9),
    created_at: req.body.created_at || new Date().toISOString(),
    ...req.body
  };

  // Prevent duplicate id
  const existingIdx = store[col].findIndex((item: any) => item.id === row.id);
  if (existingIdx >= 0) {
    store[col][existingIdx] = { ...store[col][existingIdx], ...row };
  } else {
    store[col].unshift(row);
  }

  saveStore(store);
  return res.json(row);
});

app.patch('/api/data/:collection/:id', (req: Request, res: Response) => {
  const col = req.params.collection as keyof StoreData;
  const id = req.params.id;
  if (!store[col]) {
    return res.status(404).json({ error: `Collection ${col} not found` });
  }

  const index = store[col].findIndex((item: any) => item.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Item not found' });
  }

  store[col][index] = { ...store[col][index], ...req.body };
  saveStore(store);
  return res.json(store[col][index]);
});

app.delete('/api/data/:collection/:id', (req: Request, res: Response) => {
  const col = req.params.collection as keyof StoreData;
  const id = req.params.id;
  if (!store[col]) {
    return res.status(404).json({ error: `Collection ${col} not found` });
  }

  store[col] = store[col].filter((item: any) => item.id !== id);
  saveStore(store);
  return res.json({ success: true });
});

// Demo data operations
app.post('/api/demo/seed', (_req: Request, res: Response) => {
  // Add missing demo profiles
  for (const demo of INITIAL_DEMO_MEMBERS) {
    if (!store.profiles.some(p => p.id === demo.id)) {
      store.profiles.push({ ...demo });
    }
  }
  saveStore(store);
  return res.json({ success: true, count: store.profiles.length });
});

app.post('/api/demo/clear', (_req: Request, res: Response) => {
  store.profiles = store.profiles.filter(p => !p.is_demo);
  saveStore(store);
  return res.json({ success: true, count: store.profiles.length });
});

// Production static assets or Vite middleware in dev
async function setupVite() {
  const isProd = process.env.NODE_ENV === 'production';
  const distPath = path.join(__dirname, 'dist');

  if (isProd && fs.existsSync(distPath)) {
    console.log('Serving production static bundle from dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    console.log('Starting Vite in middleware mode for rapid development');
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: { middlewareMode: true, host: '0.0.0.0' },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Kwegatta server listening on port ${PORT} (0.0.0.0)`);
    console.log(`Gemma Model: ${REQUIRED_OPEN_WEIGHT_MODEL}`);
  });
}

setupVite().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
