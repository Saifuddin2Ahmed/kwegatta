import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Security: Disable X-Powered-By header to prevent fingerprinting
app.disable('x-powered-by');

// Security Headers Middleware
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(express.json({ limit: '2mb' }));

/* =========================================================================
   RATE LIMITING MIDDLEWARE (Sliding window per IP)
   ========================================================================= */
interface RateLimitOptions {
  windowMs: number;
  max: number;
  message?: string;
}

function createRateLimiter(options: RateLimitOptions) {
  const hits = new Map<string, { count: number; resetTime: number }>();

  // Cleanup stale IP records every 3 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of hits.entries()) {
      if (val.resetTime <= now) hits.delete(key);
    }
  }, 180000);

  return (req: Request, res: Response, next: () => void) => {
    const forwarded = req.headers['x-forwarded-for'];
    const ip = (typeof forwarded === 'string' ? forwarded.split(',')[0] : '') || req.ip || req.socket.remoteAddress || 'unknown';
    const key = String(ip).trim();
    const now = Date.now();

    const record = hits.get(key);
    if (!record || record.resetTime <= now) {
      hits.set(key, { count: 1, resetTime: now + options.windowMs });
      return next();
    }

    record.count++;
    if (record.count > options.max) {
      const retryAfterSec = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      return res.status(429).json({
        error: options.message || 'Too many requests. Please slow down and try again.'
      });
    }

    next();
  };
}

// Global API rate limit: 180 requests per minute per IP
const globalApiLimiter = createRateLimiter({
  windowMs: 60000,
  max: 180,
  message: 'API rate limit exceeded. Please try again shortly.'
});
app.use('/api/', globalApiLimiter);

// Gemma model rate limit: 25 calls per minute per IP
const gemmaLimiter = createRateLimiter({
  windowMs: 60000,
  max: 25,
  message: 'AI inference rate limit reached. Please wait a moment.'
});

// Admin login rate limit: 10 attempts per minute per IP
const adminLoginLimiter = createRateLimiter({
  windowMs: 60000,
  max: 10,
  message: 'Too many admin login attempts. Please wait 1 minute.'
});

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
    hide_whatsapp: false,
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
    hide_whatsapp: false,
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
    hide_whatsapp: false,
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
    hide_whatsapp: false,
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
    hide_whatsapp: false,
    avatar: '',
    status: 'Looking for a builder',
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
    hide_whatsapp: false,
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
    hide_whatsapp: false,
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
    hide_whatsapp: false,
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
  audit_log: Array<{
    id: string;
    timestamp: string;
    action: string;
    details: string;
    admin: string;
  }>;
}

// Active admin session tokens with creation timestamps
const activeAdminTokens = new Map<string, number>();

// User Session Tokens Map: token -> { userId, createdAt }
const userTokens = new Map<string, { userId: string; createdAt: number }>();
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Clean expired tokens every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, data] of userTokens.entries()) {
    if (now - data.createdAt > TOKEN_TTL_MS) userTokens.delete(token);
  }
  for (const [token, createdAt] of activeAdminTokens.entries()) {
    if (now - createdAt > TOKEN_TTL_MS) activeAdminTokens.delete(token);
  }
}, 600000);

function issueUserToken(userId: string): string {
  const token = 'kw_usr_' + crypto.randomBytes(24).toString('hex');
  userTokens.set(token, { userId, createdAt: Date.now() });
  return token;
}

function resolveAuthUserId(req: Request): string | null {
  const authHeader = req.headers['authorization'] || '';
  let token = '';
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers['x-auth-token']) {
    token = String(req.headers['x-auth-token']).trim();
  }

  if (token && userTokens.has(token)) {
    const session = userTokens.get(token)!;
    if (Date.now() - session.createdAt < TOKEN_TTL_MS) {
      return session.userId;
    } else {
      userTokens.delete(token);
    }
  }
  return null;
}

function checkAdmin(req: Request): boolean {
  const token = (req.headers['x-admin-token'] as string) || (req.query.token as string);
  if (!token || !activeAdminTokens.has(token)) return false;
  const createdAt = activeAdminTokens.get(token)!;
  if (Date.now() - createdAt < TOKEN_TTL_MS) return true;
  activeAdminTokens.delete(token);
  return false;
}

/* =========================================================================
   INPUT SANITIZATION AND VALIDATION HELPERS
   ========================================================================= */
function sanitizeText(val: any, maxLength = 500): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLength);
}

function sanitizeUrl(val: any): string {
  if (typeof val !== 'string') return '';
  const trimmed = val.trim();
  if (/^(https?:\/\/|mailto:|tel:)/i.test(trimmed)) {
    return trimmed.slice(0, 500);
  }
  return '';
}

function sanitizeArray(arr: any, maxItems = 15, maxItemLength = 50): string[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(item => typeof item === 'string' && item.trim().length > 0)
    .map(item => String(item).trim().slice(0, maxItemLength))
    .slice(0, maxItems);
}

// Server AI Performance Metrics
const aiMetrics = {
  totalCalls: 0,
  successfulCalls: 0,
  fallbackCalls: 0,
  durations: [] as number[],
  get avgResponseTime() {
    if (this.durations.length === 0) return 0;
    const sum = this.durations.reduce((a, b) => a + b, 0);
    return Math.round(sum / this.durations.length);
  }
};

function loadStore(): StoreData {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      if (parsed.profiles && Array.isArray(parsed.profiles)) {
        if (!parsed.audit_log || !Array.isArray(parsed.audit_log)) {
          parsed.audit_log = [];
        }
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
    ],
    audit_log: [
      {
        id: 'audit-init',
        timestamp: new Date().toISOString(),
        action: 'SYSTEM_BOOT',
        details: 'Kwegatta core system and demo cohort loaded.',
        admin: 'system'
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
   AUTHENTICATION ENDPOINTS
   ========================================================================= */
app.post('/api/auth/token', (req: Request, res: Response) => {
  const { userId } = req.body || {};
  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  const exists = store.profiles.some(p => p.id === userId);
  if (!exists) {
    return res.status(404).json({ error: 'Member profile not found' });
  }

  const token = issueUserToken(userId);
  return res.json({ success: true, token, userId });
});

/* =========================================================================
   HARD RULE ENFORCEMENT: ONLY gemma-4-31b-it IS ALLOWED. NEVER ANY OTHER MODEL.
   ========================================================================= */
const REQUIRED_OPEN_WEIGHT_MODEL = 'gemma-4-31b-it';
const GEMMA_TIMEOUT_MS = 90000; // 90 seconds timeout for open-weight 31B model

app.post('/api/gemma', gemmaLimiter, async (req: Request, res: Response) => {
  const { model = REQUIRED_OPEN_WEIGHT_MODEL, contents, generationConfig } = req.body || {};

  // HARD CONSTRAINT VERIFICATION:
  if (model !== REQUIRED_OPEN_WEIGHT_MODEL) {
    return res.status(400).json({
      error: {
        message: `Violates Hackathon hard rule: Only open-weight model ${REQUIRED_OPEN_WEIGHT_MODEL} is allowed. Attempted to call: ${model}`
      }
    });
  }

  // Safety: Limit prompt payload size to prevent resource exhaustion attacks
  try {
    const contentsStr = JSON.stringify(contents || '');
    if (contentsStr.length > 50000) {
      return res.status(400).json({
        error: { message: 'Prompt content exceeds maximum allowed length of 50KB.' }
      });
    }
  } catch (e) {
    return res.status(400).json({ error: { message: 'Invalid contents format' } });
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
  const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${REQUIRED_OPEN_WEIGHT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  aiMetrics.totalCalls++;
  const callStartTime = Date.now();

  for (let attempt = 1; attempt <= 2; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), GEMMA_TIMEOUT_MS);

    try {
      console.log(`[Gemma 4] Invoking open-weight model (attempt ${attempt}/2, 90s timeout)...`);
      
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
        aiMetrics.fallbackCalls++;
        return res.status(apiResponse.status).json({ error: { message: lastError.message } });
      }

      const data = await apiResponse.json();
      if (!apiResponse.ok) {
        console.warn(`[Gemma 4] Returned non-200 status ${apiResponse.status}:`, data);
        aiMetrics.fallbackCalls++;
        return res.status(apiResponse.status).json(data);
      }

      aiMetrics.successfulCalls++;
      aiMetrics.durations.push(Date.now() - callStartTime);
      console.log(`[Gemma 4] Succeeded on attempt ${attempt} in ${Date.now() - callStartTime}ms`);
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

      aiMetrics.fallbackCalls++;
      return res.status(500).json({
        error: {
          message: isTimeout
            ? 'Gemma model request timed out after 90 seconds'
            : (error.message || 'Server error communicating with Gemma 4')
        }
      });
    }
  }

  aiMetrics.fallbackCalls++;
  return res.status(500).json({
    error: {
      message: lastError?.message || 'Failed to get response from Gemma 4'
    }
  });
});

/* =========================================================================
   ADMIN ENDPOINTS
   ========================================================================= */
app.post('/api/admin/login', adminLoginLimiter, (req: Request, res: Response) => {
  const { code } = req.body || {};
  const expectedCode = process.env.ADMIN_CODE || 'kwegatta2026';
  
  const inputStr = String(code || '').trim();
  const expectedStr = String(expectedCode).trim();

  // Timing-safe comparison to prevent timing side-channel attacks
  let isMatch = false;
  if (inputStr.length === expectedStr.length && inputStr.length > 0) {
    const inputBuf = Buffer.from(inputStr);
    const expectedBuf = Buffer.from(expectedStr);
    isMatch = crypto.timingSafeEqual(inputBuf, expectedBuf);
  }

  if (!isMatch) {
    return res.status(401).json({ error: 'Invalid admin passcode' });
  }

  const token = 'adm_' + crypto.randomBytes(24).toString('hex');
  activeAdminTokens.set(token, Date.now());

  store.audit_log.unshift({
    id: 'audit-' + Date.now(),
    timestamp: new Date().toISOString(),
    action: 'ADMIN_LOGIN',
    details: 'Admin logged in successfully.',
    admin: 'admin'
  });
  saveStore(store);

  return res.json({ success: true, token });
});

function verifyAdmin(req: Request, res: Response): boolean {
  if (!checkAdmin(req)) {
    res.status(401).json({ error: 'Unauthorized: Admin session required' });
    return false;
  }
  return true;
}

app.get('/api/admin/overview', (req: Request, res: Response) => {
  if (!verifyAdmin(req, res)) return;

  const activeMembers = store.profiles.filter(p => !p.hidden);
  const hiddenMembers = store.profiles.filter(p => p.hidden);
  const oneHourAgo = Date.now() - 3600000;
  const joinedLastHour = store.profiles.filter(p => new Date(p.created_at).getTime() > oneHourAgo).length;

  const roleCounts: Record<string, number> = { builder: 0, business: 0, design: 0, other: 0 };
  for (const p of activeMembers) {
    const r = p.role || 'other';
    roleCounts[r] = (roleCounts[r] || 0) + 1;
  }

  const tagMap: Record<string, number> = {};
  for (const p of activeMembers) {
    if (Array.isArray(p.tags)) {
      for (const t of p.tags) {
        const clean = String(t).toLowerCase().trim();
        if (clean) tagMap[clean] = (tagMap[clean] || 0) + 1;
      }
    }
  }
  const topTags = Object.entries(tagMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([tag, count]) => ({ tag, count }));

  const STOP_WORDS = new Set('the and for with that this from have need needs want looking who can are you your our some any into about more help someone person people good new also just like make made building build work working skills'.split(' '));
  const extractWords = (text: string) => (String(text || '').toLowerCase().match(/[a-z0-9+#.]{3,}/g) || []).filter(w => !STOP_WORDS.has(w));

  const neededWordsCount: Record<string, number> = {};
  const offeredWordsCount: Record<string, number> = {};

  for (const p of activeMembers) {
    const needsWords = extractWords(p.needs + ' ' + (p.learns || ''));
    for (const w of needsWords) neededWordsCount[w] = (neededWordsCount[w] || 0) + 1;

    const offersWords = extractWords([p.offers, p.teaches || '', ...(p.skills || []), ...(p.tags || [])].join(' '));
    for (const w of offersWords) offeredWordsCount[w] = (offeredWordsCount[w] || 0) + 1;
  }

  const mostNeeded = Object.entries(neededWordsCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w);
  const mostOffered = Object.entries(offeredWordsCount).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([w]) => w);
  const unmetNeeds = Object.keys(neededWordsCount)
    .filter(w => !offeredWordsCount[w] && neededWordsCount[w] >= 1)
    .slice(0, 5);

  const connectCount = store.notifications.filter(n => n.type === 'connect').length;

  const successRate = aiMetrics.totalCalls > 0
    ? Math.round((aiMetrics.successfulCalls / aiMetrics.totalCalls) * 100)
    : 100;
  const fallbackRate = aiMetrics.totalCalls > 0
    ? Math.round((aiMetrics.fallbackCalls / aiMetrics.totalCalls) * 100)
    : 0;

  return res.json({
    members_count: store.profiles.length,
    active_members_count: activeMembers.length,
    hidden_members_count: hiddenMembers.length,
    joined_last_hour: joinedLastHour,
    matches_count: store.matches.length,
    connect_requests_count: connectCount,
    posts_count: store.posts.length,
    follows_count: store.follows.length,
    members_by_role: roleCounts,
    top_tags: topTags,
    signups_over_time: [],
    insights: {
      most_needed_skills: mostNeeded.length ? mostNeeded : ['flutter', 'figma', 'python', 'marketing', 'accounting'],
      most_offered_skills: mostOffered.length ? mostOffered : ['react', 'business strategy', 'ui design', 'node.js', 'financial modeling'],
      unmet_needs: unmetNeeds
    },
    ai_health: {
      calls_today: aiMetrics.totalCalls,
      success_rate: successRate,
      fallback_rate: fallbackRate,
      avg_response_time_ms: aiMetrics.avgResponseTime
    }
  });
});

app.get('/api/admin/members', (req: Request, res: Response) => {
  if (!verifyAdmin(req, res)) return;
  return res.json(store.profiles);
});

app.get('/api/admin/posts', (req: Request, res: Response) => {
  if (!verifyAdmin(req, res)) return;
  return res.json(store.posts);
});

app.post('/api/admin/action', (req: Request, res: Response) => {
  if (!verifyAdmin(req, res)) return;

  const { action, id, hidden, message } = req.body || {};

  if (action === 'delete_member') {
    const target = store.profiles.find(p => p.id === id);
    store.profiles = store.profiles.filter(p => p.id !== id);
    store.posts = store.posts.filter(p => p.author_id !== id);
    store.audit_log.unshift({
      id: 'audit-' + Date.now(),
      timestamp: new Date().toISOString(),
      action: 'DELETE_MEMBER',
      details: `Deleted member: ${target?.name || id}`,
      admin: 'admin'
    });
  } else if (action === 'toggle_hide_member') {
    const target = store.profiles.find(p => p.id === id);
    if (target) {
      target.hidden = hidden;
      store.audit_log.unshift({
        id: 'audit-' + Date.now(),
        timestamp: new Date().toISOString(),
        action: hidden ? 'HIDE_MEMBER' : 'UNHIDE_MEMBER',
        details: `${hidden ? 'Hid' : 'Unhid'} member: ${target.name}`,
        admin: 'admin'
      });
    }
  } else if (action === 'delete_post') {
    store.posts = store.posts.filter(p => p.id !== id);
    store.audit_log.unshift({
      id: 'audit-' + Date.now(),
      timestamp: new Date().toISOString(),
      action: 'DELETE_POST',
      details: `Deleted post ID: ${id}`,
      admin: 'admin'
    });
  } else if (action === 'send_announcement') {
    for (const p of store.profiles) {
      store.notifications.unshift({
        id: 'notif-ann-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        to_id: p.id,
        from_id: 'organiser',
        type: 'digest',
        body: `📢 Organiser Announcement: ${message}`,
        read: false,
        created_at: new Date().toISOString()
      });
    }
    store.audit_log.unshift({
      id: 'audit-' + Date.now(),
      timestamp: new Date().toISOString(),
      action: 'SEND_ANNOUNCEMENT',
      details: `Broadcasted notice to ${store.profiles.length} members: "${message.slice(0, 50)}..."`,
      admin: 'admin'
    });
  }

  saveStore(store);
  return res.json({ success: true });
});

app.get('/api/admin/audit-log', (req: Request, res: Response) => {
  if (!verifyAdmin(req, res)) return;
  return res.json(store.audit_log || []);
});

app.get('/api/admin/export', (req: Request, res: Response) => {
  if (!verifyAdmin(req, res)) return;

  const type = req.query.type as string;
  const format = req.query.format as string;

  if (type === 'matches') {
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="kwegatta-matches.json"');
      return res.send(JSON.stringify(store.matches, null, 2));
    } else {
      const csvHeader = 'id,a_id,b_id,score,reason,created_at\n';
      const rows = store.matches.map(m => `"${m.id}","${m.a_id}","${m.b_id}",${m.score},"${(m.reason || '').replace(/"/g, '""')}","${m.created_at}"`).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="kwegatta-matches.csv"');
      return res.send(csvHeader + rows);
    }
  } else {
    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', 'attachment; filename="kwegatta-members.json"');
      return res.send(JSON.stringify(store.profiles, null, 2));
    } else {
      const csvHeader = 'id,name,role,headline,offers,needs,whatsapp,created_at\n';
      const rows = store.profiles.map(p => `"${p.id}","${p.name}","${p.role}","${(p.headline || '').replace(/"/g, '""')}","${(p.offers || '').replace(/"/g, '""')}","${(p.needs || '').replace(/"/g, '""')}","${p.whatsapp || ''}","${p.created_at}"`).join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="kwegatta-members.csv"');
      return res.send(csvHeader + rows);
    }
  }
});

// Explicit connect endpoint (records notification to peer)
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

  return res.json({
    success: true,
    target_id: target.id,
    target_name: target.name,
    whatsapp: target.whatsapp || '',
    linkedin: target.linkedin || ''
  });
});

// Delete member profile permanently (Authentication required: self or admin)
app.delete('/api/profiles/:id', (req: Request, res: Response) => {
  const id = req.params.id;
  const authUserId = resolveAuthUserId(req);
  const isAdmin = checkAdmin(req);

  if (!isAdmin && authUserId !== id) {
    return res.status(403).json({ error: 'Forbidden: You can only delete your own profile' });
  }

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

// App configuration diagnostics
app.get('/api/config', (_req: Request, res: Response) => {
  res.json({
    appName: 'Kwegatta',
    model: REQUIRED_OPEN_WEIGHT_MODEL,
    hasServerApiKey: Boolean(process.env.GEMINI_API_KEY),
    appUrl: process.env.APP_URL || ''
  });
});

/* =========================================================================
   UNIVERSAL DATA LAYER WITH AUTHENTICATION & WHATSAPP VISIBILITY
   ========================================================================= */
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

  // WHATSAPP VISIBILITY PLAN:
  // - Any signed-in member can see another member's WhatsApp number (unless hidden by member toggle).
  // - Anonymous callers never receive WhatsApp numbers.
  if (col === 'profiles') {
    const callerId = resolveAuthUserId(req);
    const safeProfiles = sliced.map(p => {
      if (callerId) {
        const isSelf = p.id === callerId;
        const isHidden = Boolean(p.hide_whatsapp && !isSelf);
        return {
          ...p,
          whatsapp: isHidden ? '' : (p.whatsapp || ''),
          has_whatsapp: Boolean(p.whatsapp && String(p.whatsapp).trim().length > 0),
          hide_whatsapp: Boolean(p.hide_whatsapp)
        };
      }

      // Anonymous callers
      return {
        ...p,
        whatsapp: '',
        has_whatsapp: Boolean(p.whatsapp && String(p.whatsapp).trim().length > 0),
        hide_whatsapp: Boolean(p.hide_whatsapp)
      };
    });
    return res.json(safeProfiles);
  }

  return res.json(sliced);
});

// Profile & Data Creation (Protected / Issues Auth Token)
app.post('/api/data/:collection', (req: Request, res: Response) => {
  const col = req.params.collection as keyof StoreData;
  if (!store[col]) {
    return res.status(404).json({ error: `Collection ${col} not found` });
  }

  const authUserId = resolveAuthUserId(req);
  const isAdmin = checkAdmin(req);

  // If creating or updating a profile:
  if (col === 'profiles') {
    const raw = req.body || {};
    const id = sanitizeText(raw.id, 64) || ('user-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex'));
    
    // Strict Sanitization
    const validRoles = ['builder', 'business', 'design', 'other'];
    const role = validRoles.includes(raw.role) ? raw.role : 'builder';
    
    const row = {
      id,
      name: sanitizeText(raw.name, 100) || 'Anonymous Member',
      role,
      headline: sanitizeText(raw.headline, 200),
      bio: sanitizeText(raw.bio, 1000),
      offers: sanitizeText(raw.offers, 1000),
      needs: sanitizeText(raw.needs, 1000),
      teaches: sanitizeText(raw.teaches, 1000),
      learns: sanitizeText(raw.learns, 1000),
      tags: sanitizeArray(raw.tags, 15, 30),
      skills: sanitizeArray(raw.skills, 15, 40),
      github: sanitizeText(raw.github, 50).replace(/^@/, '').replace(/[^a-zA-Z0-9-_]/g, ''),
      linkedin: sanitizeUrl(raw.linkedin),
      whatsapp: sanitizeText(raw.whatsapp, 30).replace(/[^0-9+]/g, ''),
      hide_whatsapp: Boolean(raw.hide_whatsapp),
      avatar: sanitizeUrl(raw.avatar),
      status: sanitizeText(raw.status, 100),
      is_demo: Boolean(raw.is_demo),
      created_at: sanitizeText(raw.created_at, 50) || new Date().toISOString(),
      gh: raw.gh && typeof raw.gh === 'object' ? raw.gh : null
    };

    const existingIdx = store.profiles.findIndex((item: any) => item.id === row.id);
    if (existingIdx >= 0) {
      if (!isAdmin && authUserId !== row.id) {
        return res.status(403).json({ error: 'Forbidden: You can only edit your own profile' });
      }
      store.profiles[existingIdx] = { ...store.profiles[existingIdx], ...row };
    } else {
      store.profiles.unshift(row);
    }

    saveStore(store);
    const token = issueUserToken(row.id);
    return res.json({ ...row, token });
  }

  // If creating posts/follows/notifications, prevent identity spoofing
  if (col === 'posts') {
    const raw = req.body || {};
    const validKinds = ['idea', 'need', 'offer', 'question'];
    const kind = validKinds.includes(raw.kind) ? raw.kind : 'idea';
    const authorId = authUserId || sanitizeText(raw.author_id, 64) || 'anonymous';

    const row = {
      id: sanitizeText(raw.id, 64) || ('post-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex')),
      author_id: authorId,
      title: sanitizeText(raw.title, 200),
      body: sanitizeText(raw.body, 2000),
      kind,
      tags: sanitizeArray(raw.tags, 10, 30),
      created_at: sanitizeText(raw.created_at, 50) || new Date().toISOString()
    };

    store.posts.unshift(row);
    saveStore(store);
    return res.json(row);
  }

  const row = {
    id: sanitizeText(req.body.id, 64) || ('id-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex')),
    created_at: sanitizeText(req.body.created_at, 50) || new Date().toISOString(),
    ...req.body
  };

  if (col === 'follows' && authUserId) {
    row.follower_id = authUserId;
  }

  const existingIdx = store[col].findIndex((item: any) => item.id === row.id);
  if (existingIdx >= 0) {
    store[col][existingIdx] = { ...store[col][existingIdx], ...row };
  } else {
    store[col].unshift(row);
  }

  saveStore(store);
  return res.json(row);
});

// Update Record (Ownership / Auth Check for All Collections)
app.patch('/api/data/:collection/:id', (req: Request, res: Response) => {
  const col = req.params.collection as keyof StoreData;
  const id = req.params.id;
  if (!store[col]) {
    return res.status(404).json({ error: `Collection ${col} not found` });
  }

  const authUserId = resolveAuthUserId(req);
  const isAdmin = checkAdmin(req);

  const index = store[col].findIndex((item: any) => item.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Item not found' });
  }

  const existing = store[col][index];

  // Enforce resource-level authorization
  if (col === 'profiles' && !isAdmin && authUserId !== id) {
    return res.status(403).json({ error: 'Forbidden: You can only edit your own profile' });
  }
  if (col === 'posts' && !isAdmin && authUserId !== existing.author_id) {
    return res.status(403).json({ error: 'Forbidden: You can only edit your own posts' });
  }
  if (col === 'follows' && !isAdmin && authUserId !== existing.follower_id) {
    return res.status(403).json({ error: 'Forbidden: You can only edit your own follows' });
  }
  if (col === 'notifications' && !isAdmin && authUserId !== existing.to_id) {
    return res.status(403).json({ error: 'Forbidden: You can only modify your own notifications' });
  }

  store[col][index] = { ...existing, ...req.body };
  saveStore(store);
  return res.json(store[col][index]);
});

// Delete Record (Ownership / Auth Check for All Collections)
app.delete('/api/data/:collection/:id', (req: Request, res: Response) => {
  const col = req.params.collection as keyof StoreData;
  const id = req.params.id;
  if (!store[col]) {
    return res.status(404).json({ error: `Collection ${col} not found` });
  }

  const authUserId = resolveAuthUserId(req);
  const isAdmin = checkAdmin(req);

  const existing = store[col].find((item: any) => item.id === id);
  if (!existing) {
    return res.json({ success: true, message: 'Item already not present' });
  }

  // Enforce resource-level authorization
  if (col === 'profiles' && !isAdmin && authUserId !== id) {
    return res.status(403).json({ error: 'Forbidden: You can only delete your own profile' });
  }
  if (col === 'posts' && !isAdmin && authUserId !== existing.author_id) {
    return res.status(403).json({ error: 'Forbidden: You can only delete your own posts' });
  }
  if (col === 'follows' && !isAdmin && authUserId !== existing.follower_id) {
    return res.status(403).json({ error: 'Forbidden: You can only delete your own follows' });
  }
  if (col === 'notifications' && !isAdmin && authUserId !== existing.to_id) {
    return res.status(403).json({ error: 'Forbidden: You can only delete your own notifications' });
  }

  store[col] = store[col].filter((item: any) => item.id !== id);
  saveStore(store);
  return res.json({ success: true });
});

// Demo data operations
app.post('/api/demo/seed', (_req: Request, res: Response) => {
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
