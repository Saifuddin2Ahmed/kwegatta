import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { initializeApp, getApps, type App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth, type Auth as AdminAuth } from 'firebase-admin/auth';

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

app.use(express.json({ limit: '50mb' }));

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

// Persistence Configuration & Mode (Cloud Firestore with fallback to Local Disk in non-production)
const FIREBASE_PROJECT_ID = 'kwegatta';
let firestoreDb: Firestore | null = null;
let adminAuth: AdminAuth | null = null;
let storageMode: 'firestore' | 'disk' = 'disk';
const firestoreUnsubscribers: Array<() => void> = [];

const DATA_FILE = path.join(__dirname, '.kwegatta_store.json');

interface StoreData {
  profiles: any[];
  follows: any[];
  matches: any[];
  notifications: any[];
  posts: any[];
  reports: any[];
  audit_log: Array<{
    id: string;
    timestamp: string;
    action: string;
    details: string;
    admin: string;
  }>;
}

// Active admin session tokens with creation timestamps (passcode flow)
const activeAdminTokens = new Map<string, number>();
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Clean expired admin tokens every 10 minutes
setInterval(() => {
  const now = Date.now();
  const expiredTokens: string[] = [];
  for (const [token, createdAt] of activeAdminTokens.entries()) {
    if (now - createdAt > TOKEN_TTL_MS) {
      activeAdminTokens.delete(token);
      expiredTokens.push(token);
    }
  }
  if (expiredTokens.length > 0 && storageMode === 'firestore' && firestoreDb) {
    batchRemoveDocs('sessions', expiredTokens).catch(() => {});
  }
}, 600000);

function issueAdminToken(): string {
  const token = 'kw_adm_' + crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  activeAdminTokens.set(token, now);
  if (storageMode === 'firestore' && firestoreDb) {
    firestoreDb.collection('sessions').doc(token).set({
      token,
      isAdmin: true,
      createdAt: now
    }).catch(err => {
      console.error('[Firestore] Failed to persist admin session:', err?.message || err);
    });
  }
  return token;
}

interface AuthUserData {
  uid: string;
  email?: string;
  name?: string;
}

// Global Auth middleware: verifies Firebase ID tokens on every write/request via firebase-admin
app.use(async (req: Request, _res: Response, next: () => void) => {
  const authHeader = req.headers['authorization'] || '';
  let token = '';
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  } else if (req.headers['x-auth-token']) {
    token = String(req.headers['x-auth-token']).trim();
  } else if (req.headers['x-firebase-token']) {
    token = String(req.headers['x-firebase-token']).trim();
  }

  if (token && adminAuth) {
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      if (decoded && decoded.uid) {
        (req as any).authUserId = decoded.uid;
        (req as any).authUser = {
          uid: decoded.uid,
          email: decoded.email,
          name: decoded.name
        } as AuthUserData;
      }
    } catch (err: any) {
      // Token expired, malformed, or dev domain
      // console.warn('[Firebase Admin] verifyIdToken note:', err?.message || err);
    }
  }

  next();
});

function resolveAuthUserId(req: Request): string | null {
  return (req as any).authUserId || null;
}

function checkAdmin(req: Request): boolean {
  const token = (req.headers['x-admin-token'] as string) || (req.query.token as string);
  if (!token || !activeAdminTokens.has(token)) return false;
  const createdAt = activeAdminTokens.get(token)!;
  if (Date.now() - createdAt < TOKEN_TTL_MS) return true;
  activeAdminTokens.delete(token);
  if (storageMode === 'firestore' && firestoreDb) {
    removeDoc('sessions', token).catch(() => {});
  }
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

function sanitizeAvatar(val: any): string {
  if (typeof val !== 'string') return '';
  const trimmed = val.trim();
  // Safe base64 image data URL (JPEG, PNG, WebP, GIF) up to 1MB
  if (/^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(trimmed)) {
    if (trimmed.length <= 1024 * 1024) {
      return trimmed;
    }
  }
  // Standard HTTPS or HTTP image URL
  if (/^https?:\/\//i.test(trimmed) && trimmed.length <= 1000) {
    return trimmed;
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

/**
 * PRIVACY PROTECTION HELPER:
 * Never return email, account_uid or auth secrets in public or member-facing responses.
 * A member's email is visible ONLY to that member and platform admins.
 */
function sanitizePublicProfile(p: any, callerAuthUid: string | null, isAdmin: boolean): any {
  if (!p) return null;
  const isSelf = Boolean(callerAuthUid && (p.account_uid === callerAuthUid || p.id === callerAuthUid));
  const canSeeEmail = isSelf || isAdmin;
  const isWhatsAppHidden = Boolean(p.hide_whatsapp && !isSelf);
  const canSeeWhatsApp = Boolean(callerAuthUid && !isWhatsAppHidden);

  const { account_uid, email, blocked_ids, ...rest } = p;

  return {
    ...rest,
    ...(canSeeEmail && email ? { email } : {}),
    ...(canSeeEmail && account_uid ? { account_uid } : {}),
    ...(isSelf && blocked_ids ? { blocked_ids } : {}),
    whatsapp: canSeeWhatsApp ? (p.whatsapp || '') : '',
    has_whatsapp: Boolean(p.whatsapp && String(p.whatsapp).trim().length > 0),
    hide_whatsapp: Boolean(p.hide_whatsapp)
  };
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

// Demo mode setting (default: false in production, true only when DEMO_MODE=true)
const isDemoMode = process.env.DEMO_MODE === 'true';

function loadStore(): StoreData {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      if (parsed.profiles && Array.isArray(parsed.profiles)) {
        if (!parsed.reports || !Array.isArray(parsed.reports)) {
          parsed.reports = [];
        }
        if (!parsed.audit_log || !Array.isArray(parsed.audit_log)) {
          parsed.audit_log = [];
        }
        // Cleanup any security test post with empty body or anonymous author
        if (Array.isArray(parsed.posts)) {
          parsed.posts = parsed.posts.filter((p: any) => p && p.body && String(p.body).trim().length > 0 && p.author_id !== 'anonymous');
        }
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to read persistent store, initializing fresh store:', err);
  }

  const initial: StoreData = {
    profiles: isDemoMode ? [...INITIAL_DEMO_MEMBERS] : [],
    follows: [],
    matches: isDemoMode ? [
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
    ] : [],
    notifications: [],
    posts: isDemoMode ? [
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
    ] : [],
    reports: [],
    audit_log: [
      {
        id: 'audit-init',
        timestamp: new Date().toISOString(),
        action: 'SYSTEM_BOOT',
        details: isDemoMode ? 'Kwegatta system loaded in Demo Mode with sample cohort.' : 'Kwegatta system loaded in clean production state.',
        admin: 'system'
      }
    ]
  };

  saveStore(initial);
  return initial;
}

function saveStore(storeData: StoreData) {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(storeData, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write store file:', err);
  }
}

let store: StoreData = loadStore();

/* =========================================================================
   FIRESTORE PERSISTENCE HELPERS & SNAPSHOT REAL-TIME LISTENERS
   Protect the free quota: All reads served from memory; all writes to Firestore.
   Snapshot listeners keep memory synchronized with Firestore across all instances.
   ========================================================================= */

async function persistDoc(collectionName: string, id: string, docData: any): Promise<void> {
  if (storageMode === 'firestore' && firestoreDb) {
    try {
      await firestoreDb.collection(collectionName).doc(id).set(docData);
    } catch (err: any) {
      console.error(`[Firestore] Failed to write document ${id} to ${collectionName}:`, err?.message || err);
      throw err;
    }
  } else {
    saveStore(store);
  }
}

async function removeDoc(collectionName: string, id: string): Promise<void> {
  if (storageMode === 'firestore' && firestoreDb) {
    try {
      await firestoreDb.collection(collectionName).doc(id).delete();
    } catch (err: any) {
      console.error(`[Firestore] Failed to delete document ${id} from ${collectionName}:`, err?.message || err);
      throw err;
    }
  } else {
    saveStore(store);
  }
}

async function batchPersistDocs(collectionName: string, items: Array<{ id: string; data: any }>): Promise<void> {
  if (storageMode === 'firestore' && firestoreDb) {
    const BATCH_SIZE = 400;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = firestoreDb.batch();
      const chunk = items.slice(i, i + BATCH_SIZE);
      for (const item of chunk) {
        const ref = firestoreDb.collection(collectionName).doc(item.id);
        batch.set(ref, item.data);
      }
      await batch.commit();
    }
  } else {
    saveStore(store);
  }
}

async function batchRemoveDocs(collectionName: string, ids: string[]): Promise<void> {
  if (storageMode === 'firestore' && firestoreDb) {
    const BATCH_SIZE = 400;
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = firestoreDb.batch();
      const chunk = ids.slice(i, i + BATCH_SIZE);
      for (const id of chunk) {
        const ref = firestoreDb.collection(collectionName).doc(id);
        batch.delete(ref);
      }
      await batch.commit();
    }
  } else {
    saveStore(store);
  }
}

async function setupFirestoreListeners(): Promise<void> {
  if (!firestoreDb) return;

  while (firestoreUnsubscribers.length > 0) {
    const unsub = firestoreUnsubscribers.pop();
    try { unsub?.(); } catch (_) {}
  }

  const initialLoadPromises: Promise<void>[] = [];

  // 1. Profiles listener
  initialLoadPromises.push(new Promise((resolve) => {
    let initial = true;
    const unsub = firestoreDb!.collection('profiles').onSnapshot((snap) => {
      const list: any[] = [];
      snap.forEach(doc => {
        const d = doc.data();
        list.push({ ...d, id: d.id || doc.id });
      });
      store.profiles = list;
      if (initial) { initial = false; resolve(); }
    }, (err) => {
      console.error('[Firestore] profiles listener error:', err?.message || err);
      if (initial) { initial = false; resolve(); }
    });
    firestoreUnsubscribers.push(unsub);
  }));

  // 2. Posts listener
  initialLoadPromises.push(new Promise((resolve) => {
    let initial = true;
    const unsub = firestoreDb!.collection('posts').onSnapshot((snap) => {
      const list: any[] = [];
      snap.forEach(doc => {
        const d = doc.data();
        list.push({ ...d, id: d.id || doc.id });
      });
      store.posts = list;
      if (initial) { initial = false; resolve(); }
    }, (err) => {
      console.error('[Firestore] posts listener error:', err?.message || err);
      if (initial) { initial = false; resolve(); }
    });
    firestoreUnsubscribers.push(unsub);
  }));

  // 3. Follows listener
  initialLoadPromises.push(new Promise((resolve) => {
    let initial = true;
    const unsub = firestoreDb!.collection('follows').onSnapshot((snap) => {
      const list: any[] = [];
      snap.forEach(doc => {
        const d = doc.data();
        list.push({ ...d, id: d.id || doc.id });
      });
      store.follows = list;
      if (initial) { initial = false; resolve(); }
    }, (err) => {
      console.error('[Firestore] follows listener error:', err?.message || err);
      if (initial) { initial = false; resolve(); }
    });
    firestoreUnsubscribers.push(unsub);
  }));

  // 4. Matches listener
  initialLoadPromises.push(new Promise((resolve) => {
    let initial = true;
    const unsub = firestoreDb!.collection('matches').onSnapshot((snap) => {
      const list: any[] = [];
      snap.forEach(doc => {
        const d = doc.data();
        list.push({ ...d, id: d.id || doc.id });
      });
      store.matches = list;
      if (initial) { initial = false; resolve(); }
    }, (err) => {
      console.error('[Firestore] matches listener error:', err?.message || err);
      if (initial) { initial = false; resolve(); }
    });
    firestoreUnsubscribers.push(unsub);
  }));

  // 5. Notifications listener
  initialLoadPromises.push(new Promise((resolve) => {
    let initial = true;
    const unsub = firestoreDb!.collection('notifications').onSnapshot((snap) => {
      const list: any[] = [];
      snap.forEach(doc => {
        const d = doc.data();
        list.push({ ...d, id: d.id || doc.id });
      });
      store.notifications = list;
      if (initial) { initial = false; resolve(); }
    }, (err) => {
      console.error('[Firestore] notifications listener error:', err?.message || err);
      if (initial) { initial = false; resolve(); }
    });
    firestoreUnsubscribers.push(unsub);
  }));

  // 6. Admin Sessions listener (Restores active admin sessions so they survive restarts)
  initialLoadPromises.push(new Promise((resolve) => {
    let initial = true;
    const unsub = firestoreDb!.collection('sessions').onSnapshot((snap) => {
      const now = Date.now();
      activeAdminTokens.clear();
      snap.forEach(doc => {
        const d = doc.data();
        const token = doc.id;
        const createdAt = typeof d.createdAt === 'number' ? d.createdAt : now;
        if (now - createdAt < TOKEN_TTL_MS) {
          if (d.isAdmin) {
            activeAdminTokens.set(token, createdAt);
          }
        }
      });
      if (initial) { initial = false; resolve(); }
    }, (err) => {
      console.error('[Firestore] sessions listener error:', err?.message || err);
      if (initial) { initial = false; resolve(); }
    });
    firestoreUnsubscribers.push(unsub);
  }));

  // 7. Audit Log listener
  initialLoadPromises.push(new Promise((resolve) => {
    let initial = true;
    const unsub = firestoreDb!.collection('audit_log').onSnapshot((snap) => {
      const list: any[] = [];
      snap.forEach(doc => {
        list.push(doc.data());
      });
      store.audit_log = list.sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));
      if (initial) { initial = false; resolve(); }
    }, (err) => {
      console.error('[Firestore] audit_log listener error:', err?.message || err);
      if (initial) { initial = false; resolve(); }
    });
    firestoreUnsubscribers.push(unsub);
  }));

  // 8. Reports listener
  initialLoadPromises.push(new Promise((resolve) => {
    let initial = true;
    const unsub = firestoreDb!.collection('reports').onSnapshot((snap) => {
      const list: any[] = [];
      snap.forEach(doc => {
        list.push(doc.data());
      });
      store.reports = list.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
      if (initial) { initial = false; resolve(); }
    }, (err) => {
      console.error('[Firestore] reports listener error:', err?.message || err);
      if (initial) { initial = false; resolve(); }
    });
    firestoreUnsubscribers.push(unsub);
  }));

  await Promise.race([
    Promise.all(initialLoadPromises),
    new Promise(r => setTimeout(r, 6000))
  ]);

  // Purge legacy unlinked profile user-1791217178267 and clean up related state
  const legacyId = 'user-1791217178267';
  if (store.profiles.some((p: any) => p.id === legacyId)) {
    store.profiles = store.profiles.filter((p: any) => p.id !== legacyId);
    store.matches = store.matches.filter((m: any) => m.a_id !== legacyId && m.b_id !== legacyId);
    store.posts = store.posts.filter((p: any) => p.author_id !== legacyId);
    store.follows = store.follows.filter((f: any) => f.follower_id !== legacyId && f.following_id !== legacyId);
    if (firestoreDb) {
      firestoreDb.collection('profiles').doc(legacyId).delete().catch(() => {});
    }
  }

  console.log(`[Storage] Cloud Firestore real-time snapshot sync operational.`);
  console.log(`[Storage] Warm cache: ${store.profiles.length} profiles, ${store.posts.length} posts, ${store.matches.length} matches.`);
}

async function initStorage(): Promise<void> {
  const isProduction = process.env.NODE_ENV === 'production';
  console.log(`[Storage] Initializing persistence layer (Environment: ${process.env.NODE_ENV || 'development'})...`);

  let fbApp: App | null = null;
  try {
    if (getApps().length === 0) {
      fbApp = initializeApp({ projectId: FIREBASE_PROJECT_ID });
    } else {
      fbApp = getApps()[0]!;
    }
    firestoreDb = getFirestore(fbApp);
    try {
      adminAuth = getAdminAuth(fbApp);
      console.log(`✅ [Firebase Admin] Auth initialized successfully for project "${FIREBASE_PROJECT_ID}"`);
    } catch (authInitErr: any) {
      console.warn(`[Firebase Admin] Auth initialization warning:`, authInitErr?.message || authInitErr);
    }
  } catch (err: any) {
    if (isProduction) {
      console.error('FATAL: Could not initialize firebase-admin with projectId "kwegatta" in production:');
      console.error(err?.message || err);
      console.error('Server startup aborted. Silent fallback to disk storage in production is prohibited.');
      process.exit(1);
    } else {
      console.log(`[Storage] Notice: firebase-admin initialization failed in non-production (${err?.message || err}).`);
      console.log('[Storage] Activating local disk storage engine (.kwegatta_store.json).');
      storageMode = 'disk';
      store = loadStore();
      return;
    }
  }

  try {
    const probePromise = firestoreDb.collection('profiles').limit(1).get();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Cloud Firestore connection probe timed out after 8000ms')), 8000)
    );
    await Promise.race([probePromise, timeoutPromise]);

    console.log(`✅ [Storage] Successfully connected to Cloud Firestore (Project: ${FIREBASE_PROJECT_ID}, Region: us-west1, Database: (default))`);
    storageMode = 'firestore';
    await setupFirestoreListeners();
  } catch (err: any) {
    if (isProduction) {
      console.error('========================================================================');
      console.error('FATAL STARTUP ERROR: Cloud Firestore cannot be reached in production environment!');
      console.error(`Target: Project "${FIREBASE_PROJECT_ID}", Database "(default)", Region "us-west1"`);
      console.error(`Reason: ${err?.message || err}`);
      console.error('CRITICAL: As specified, server will NOT fall back to disk silently in production.');
      console.error('Exiting process now.');
      console.error('========================================================================');
      process.exit(1);
    } else {
      console.log(`[Storage] Notice: Cloud Firestore cannot be reached in non-production (${err?.message || err}).`);
      console.log('[Storage] Activating local disk storage engine (.kwegatta_store.json) for development.');
      storageMode = 'disk';
      store = loadStore();
    }
  }
}

/* =========================================================================
   AUTHENTICATION ENDPOINTS (Firebase Auth Integration)
   ========================================================================= */
// Retrieve the authenticated Firebase user's profile on any device (Requirement 3)
app.get('/api/auth/me', (req: Request, res: Response) => {
  const authUser = (req as any).authUser;
  if (!authUser || !authUser.uid) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const profile = store.profiles.find((p: any) => p.account_uid === authUser.uid || p.id === authUser.uid);
  return res.json({
    success: true,
    uid: authUser.uid,
    email: authUser.email,
    profile: profile || null
  });
});

// Attach an existing profile to the current Firebase account (Requirement 5)
app.post('/api/auth/claim-profile', async (req: Request, res: Response) => {
  const authUserId = resolveAuthUserId(req);
  if (!authUserId) {
    return res.status(401).json({ error: 'Firebase authentication required to claim profile' });
  }

  const { profileId } = req.body || {};
  if (!profileId || typeof profileId !== 'string') {
    return res.status(400).json({ error: 'profileId is required' });
  }

  const profile = store.profiles.find((p: any) => p.id === profileId);
  if (!profile) {
    return res.status(404).json({ error: 'Profile not found' });
  }

  // Prevent hijacking: only allow claiming if profile has no account_uid or already belongs to this uid
  if (profile.account_uid && profile.account_uid !== authUserId) {
    return res.status(403).json({ error: 'This profile is already linked to another account' });
  }

  profile.account_uid = authUserId;
  const userEmail = (req as any).authUser?.email;
  if (!profile.email && userEmail) {
    profile.email = userEmail;
  }

  await persistDoc('profiles', profile.id, profile);
  console.log(`[Auth] Existing profile ${profile.id} (${profile.name}) claimed by Firebase UID: ${authUserId}`);

  return res.json({ success: true, profile });
});

// Compatibility token endpoint (returns current Firebase user verification)
app.post('/api/auth/token', (req: Request, res: Response) => {
  const authUserId = resolveAuthUserId(req);
  if (authUserId) {
    return res.json({ success: true, userId: authUserId });
  }
  return res.json({ success: false, message: 'Authenticate via Firebase Web SDK' });
});

/* =========================================================================
   OPEN-WEIGHT GEMMA MODELS CONFIGURATION & CENTRAL SERVER-SIDE GUARD:
   Allowed: gemma-4-26b-a4b-it and gemma-4-31b-it.
   Default: gemma-4-26b-a4b-it (validated as 36x faster TTFT: 0.70s vs 25.58s).
   ========================================================================= */
export const ALLOWED_OPEN_WEIGHT_MODELS = ['gemma-4-26b-a4b-it', 'gemma-4-31b-it'] as const;
export const DEFAULT_OPEN_WEIGHT_MODEL = 'gemma-4-26b-a4b-it';
export const GEMMA_HEDGE_DELAY_MS = 4000; // Start 2nd identical request after 4 seconds of silence
export const GEMMA_HARD_TIMEOUT_MS = 20000; // Give up with clear error after 20 seconds

/**
 * Server-side guard: Every model call MUST go through this validation.
 * Throws immediately if model ID does not start with "gemma-" or is not allowed.
 */
export function validateGemmaModelId(modelId: string): string {
  if (!modelId || typeof modelId !== 'string' || !modelId.startsWith('gemma-')) {
    throw new Error(`Rule Violation: Prohibited model '${modelId}'. This project strictly uses open-weight Gemma models starting with 'gemma-'.`);
  }
  if (!ALLOWED_OPEN_WEIGHT_MODELS.includes(modelId as any)) {
    throw new Error(`Unsupported model '${modelId}'. Allowed open-weight models: ${ALLOWED_OPEN_WEIGHT_MODELS.join(', ')}`);
  }
  return modelId;
}

// Pair Match Cache: key(`${idA}_${idB}`) -> { versionA, versionB, result, updatedAt }
const matchPairCache = new Map<string, { versionA: string; versionB: string; result: any; updatedAt: string }>();

function getPairCacheKey(idA: string, idB: string): string {
  return [idA, idB].sort().join('_');
}

/**
 * Central Gemma execution engine with 4s hedging, resilient 500/503 retry, and 20s hard timeout.
 */
export async function invokeGemmaDirect(
  contents: any,
  generationConfig?: any,
  model: string = DEFAULT_OPEN_WEIGHT_MODEL
): Promise<{ text: string; data: any; elapsedMs: number }> {
  const targetModel = validateGemmaModelId(model);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured on the server environment.');
  }

  aiMetrics.totalCalls++;
  const callStartTime = Date.now();
  const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const userConfig = (generationConfig && typeof generationConfig === 'object') ? generationConfig : {};
  const { temperature, thinkingConfig, ...safeConfig } = userConfig as any;
  const requestPayload = {
    contents,
    generationConfig: {
      ...safeConfig,
      thinkingConfig: {
        thinkingLevel: 'MINIMAL'
      }
    }
  };

  const payloadString = JSON.stringify(requestPayload);

  let isResolved = false;
  let timer4s: NodeJS.Timeout | null = null;
  let timer20s: NodeJS.Timeout | null = null;
  const activeControllers = new Map<number, AbortController>();
  let nextRequestId = 1;
  let lastError: any = null;
  let totalAttempts = 0;

  const cleanup = () => {
    if (timer4s) clearTimeout(timer4s);
    if (timer20s) clearTimeout(timer20s);
  };

  return new Promise<{ text: string; data: any; elapsedMs: number }>((resolve, reject) => {
    const handleWinner = (requestId: number, data: any) => {
      if (isResolved) return;
      isResolved = true;
      cleanup();

      for (const [id, ctrl] of activeControllers.entries()) {
        if (id !== requestId) {
          try { ctrl.abort(); } catch (_) {}
        }
      }
      activeControllers.clear();

      const elapsed = Date.now() - callStartTime;
      aiMetrics.successfulCalls++;
      aiMetrics.durations.push(elapsed);
      console.log(`[Gemma 4 Hedging] Request #${requestId} won in ${elapsed}ms for ${targetModel}`);

      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
      resolve({ text, data, elapsedMs: elapsed });
    };

    const startAttempt = async (forcedId?: number) => {
      if (isResolved) return;
      const requestId = forcedId || nextRequestId++;
      totalAttempts++;
      const controller = new AbortController();
      activeControllers.set(requestId, controller);

      console.log(`[Gemma 4 Hedging] Invoking attempt #${requestId} for ${targetModel}...`);

      try {
        const resp = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: payloadString,
          signal: controller.signal
        });

        if (isResolved) return;

        if (resp.status === 500 || resp.status === 503) {
          const errText = await resp.text().catch(() => '');
          lastError = new Error(`Upstream HTTP ${resp.status}: ${errText.slice(0, 150)}`);
          console.warn(`[Gemma 4 Hedging] Attempt #${requestId} returned ${resp.status}. Active remaining: ${activeControllers.size - 1}`);
          activeControllers.delete(requestId);

          if (isResolved) return;

          if (activeControllers.size > 0) {
            console.log(`[Gemma 4 Hedging] Waiting on other active in-flight request...`);
            return;
          }

          if (totalAttempts < 4 && Date.now() - callStartTime < 18000) {
            console.log(`[Gemma 4 Hedging] No other request running. Starting replacement attempt #${nextRequestId}...`);
            startAttempt();
            return;
          }

          isResolved = true;
          cleanup();
          aiMetrics.fallbackCalls++;
          reject(lastError);
          return;
        }

        const data = await resp.json();
        if (!resp.ok) {
          throw new Error(data?.error?.message || `Upstream error HTTP ${resp.status}`);
        }

        handleWinner(requestId, data);
      } catch (err: any) {
        activeControllers.delete(requestId);
        if (isResolved) return;

        const isAbort = err?.name === 'AbortError';
        if (!isAbort) {
          lastError = err;
          console.warn(`[Gemma 4 Hedging] Attempt #${requestId} failed:`, err?.message || err);

          if (activeControllers.size > 0) {
            console.log(`[Gemma 4 Hedging] Another request is running, waiting...`);
            return;
          }

          if (totalAttempts < 4 && Date.now() - callStartTime < 18000) {
            console.log(`[Gemma 4 Hedging] Starting replacement attempt #${nextRequestId}...`);
            startAttempt();
            return;
          }

          isResolved = true;
          cleanup();
          aiMetrics.fallbackCalls++;
          reject(lastError || new Error('Failed to get response from Gemma 4'));
        }
      }
    };

    // 20s Hard Timeout
    timer20s = setTimeout(() => {
      if (isResolved) return;
      isResolved = true;
      cleanup();
      for (const ctrl of activeControllers.values()) {
        try { ctrl.abort(); } catch (_) {}
      }
      activeControllers.clear();
      console.error(`[Gemma 4 Hedging] All requests timed out after 20 seconds.`);
      aiMetrics.fallbackCalls++;
      reject(new Error('Gemma request timed out after 20 seconds'));
    }, GEMMA_HARD_TIMEOUT_MS);

    // Start Request #1 immediately
    startAttempt(1);

    // 4s Hedged Delay for Request #2
    timer4s = setTimeout(() => {
      if (isResolved) return;
      if (activeControllers.size === 1) {
        console.warn(`[Gemma 4 Hedging] 4s tail latency threshold reached without response. Starting parallel Request #2...`);
        (aiMetrics as any).hedgedCalls = ((aiMetrics as any).hedgedCalls || 0) + 1;
        startAttempt(2);
      }
    }, GEMMA_HEDGE_DELAY_MS);
  });
}

app.post('/api/gemma', gemmaLimiter, async (req: Request, res: Response) => {
  const { model = DEFAULT_OPEN_WEIGHT_MODEL, contents, generationConfig } = req.body || {};

  // HARD CONSTRAINT VERIFICATION: Guard validates model starts with "gemma-"
  try {
    validateGemmaModelId(model);
  } catch (err: any) {
    return res.status(400).json({ error: { message: err.message } });
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

  try {
    const result = await invokeGemmaDirect(contents, generationConfig, model);
    return res.json(result.data);
  } catch (err: any) {
    const isTimeout = err?.message?.includes('timed out');
    return res.status(isTimeout ? 504 : 500).json({
      error: { message: err?.message || 'Failed to get response from Gemma 4' }
    });
  }
});

// STREAMING GEMMA TOKENS TO THE BROWSER (SSE) WITH 4s HEDGING AND RESILIENT 500/503 HANDLING
app.post('/api/gemma/stream', gemmaLimiter, async (req: Request, res: Response) => {
  const { model = DEFAULT_OPEN_WEIGHT_MODEL, contents, generationConfig } = req.body || {};
  let targetModel: string;
  try {
    targetModel = validateGemmaModelId(model);
  } catch (err: any) {
    return res.status(400).json({ error: { message: err.message } });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({ error: { message: 'GEMINI_API_KEY is not configured.' } });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const userConfig = (generationConfig && typeof generationConfig === 'object') ? generationConfig : {};
  const { temperature, thinkingConfig, ...safeConfig } = userConfig as any;
  const requestPayload = {
    contents,
    generationConfig: {
      ...safeConfig,
      thinkingConfig: {
        thinkingLevel: 'MINIMAL'
      }
    }
  };

  const payloadString = JSON.stringify(requestPayload);
  const targetUrl = `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;

  let streamClaimed = false;
  let timer4s: NodeJS.Timeout | null = null;
  let timer20s: NodeJS.Timeout | null = null;
  const activeControllers = new Map<number, AbortController>();
  let nextRequestId = 1;
  let totalAttempts = 0;
  let lastError: any = null;

  const cleanup = () => {
    if (timer4s) clearTimeout(timer4s);
    if (timer20s) clearTimeout(timer20s);
  };

  const streamFromWinner = async (requestId: number, upstream: any) => {
    if (streamClaimed) {
      if (upstream.body) {
        try { upstream.body.cancel(); } catch (_) {}
      }
      return;
    }
    streamClaimed = true;
    cleanup();

    // Cancel all other requests
    for (const [id, ctrl] of activeControllers.entries()) {
      if (id !== requestId) {
        try { ctrl.abort(); } catch (_) {}
      }
    }
    activeControllers.clear();

    console.log(`[Gemma Stream Hedging] Request #${requestId} claimed SSE stream output`);

    try {
      const reader = upstream.body?.getReader();
      if (!reader) {
        res.write(`data: ${JSON.stringify({ error: 'No response body stream' })}\n\n`);
        return res.end();
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.slice(6).trim();
            if (dataStr === '[DONE]') {
              res.write(`data: [DONE]\n\n`);
              continue;
            }
            try {
              const parsed = JSON.parse(dataStr);
              const textChunk = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
              if (textChunk) {
                res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
              }
            } catch (_) {}
          }
        }
      }

      res.write(`data: [DONE]\n\n`);
      return res.end();
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        res.write(`data: ${JSON.stringify({ error: err.message || 'Stream processing error' })}\n\n`);
      }
      return res.end();
    }
  };

  const startStreamAttempt = async (forcedId?: number) => {
    if (streamClaimed) return;
    const requestId = forcedId || nextRequestId++;
    totalAttempts++;
    const controller = new AbortController();
    activeControllers.set(requestId, controller);

    try {
      const upstream = await fetch(targetUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payloadString,
        signal: controller.signal
      });

      if (streamClaimed) return;

      if (!upstream.ok) {
        activeControllers.delete(requestId);
        lastError = new Error(`Upstream stream error HTTP ${upstream.status}`);
        console.warn(`[Gemma Stream Hedging] Stream attempt #${requestId} returned ${upstream.status}`);

        // If another stream is active, let it continue
        if (activeControllers.size > 0) return;

        // If budget remains, try again
        if (totalAttempts < 4) {
          startStreamAttempt();
          return;
        }

        res.write(`data: ${JSON.stringify({ error: lastError.message })}\n\n`);
        return res.end();
      }

      await streamFromWinner(requestId, upstream);
    } catch (err: any) {
      activeControllers.delete(requestId);
      if (streamClaimed) return;

      if (err.name !== 'AbortError') {
        lastError = err;
        console.warn(`[Gemma Stream Hedging] Stream attempt #${requestId} failed:`, err.message);

        if (activeControllers.size > 0) return;
        if (totalAttempts < 4) {
          startStreamAttempt();
          return;
        }

        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        return res.end();
      }
    }
  };

  // 20s Hard Timeout
  timer20s = setTimeout(() => {
    if (streamClaimed) return;
    streamClaimed = true;
    cleanup();
    for (const ctrl of activeControllers.values()) {
      try { ctrl.abort(); } catch (_) {}
    }
    activeControllers.clear();
    console.error(`[Gemma Stream Hedging] Both stream requests timed out after 20 seconds.`);
    res.write(`data: ${JSON.stringify({ error: 'Gemma stream timed out after 20 seconds' })}\n\n`);
    return res.end();
  }, GEMMA_HARD_TIMEOUT_MS);

  // Start Request #1 immediately
  startStreamAttempt(1);

  // 4s Hedged Request #2
  timer4s = setTimeout(() => {
    if (streamClaimed) return;
    if (activeControllers.size === 1) {
      console.warn(`[Gemma Stream Hedging] 4s threshold reached without stream start. Spawning parallel stream Request #2...`);
      (aiMetrics as any).hedgedCalls = ((aiMetrics as any).hedgedCalls || 0) + 1;
      startStreamAttempt(2);
    }
  }, GEMMA_HEDGE_DELAY_MS);
});

/* =========================================================================
   PART D: ASK KWEGATTA (Natural Language Semantic Search with Gemma)
   ========================================================================= */
const askLimiter = createRateLimiter({
  windowMs: 60000,
  max: 20,
  message: 'Search rate limit reached. Please wait a moment before searching again.'
});

app.post('/api/ai/ask-kwegatta', askLimiter, async (req: Request, res: Response) => {
  const { query } = req.body || {};
  const cleanQuery = typeof query === 'string' ? query.trim().slice(0, 300) : '';
  if (!cleanQuery) {
    return res.status(400).json({ error: 'Query is required' });
  }

  const callerId = resolveAuthUserId(req);
  const isAdmin = checkAdmin(req);

  // Require a valid signed-in session: 401 otherwise
  if (!callerId && !isAdmin) {
    return res.status(401).json({ error: 'Sign in required to ask Kwegatta' });
  }

  // Read active members (excluding unlinked legacy profiles and blocked members)
  let activeMembers = store.profiles.filter(p => !p.hidden && Boolean(p.account_uid));
  if (callerId) {
    const callerProfile = store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId);
    const callerBlocked = new Set(callerProfile?.blocked_ids || []);
    activeMembers = activeMembers.filter(p => {
      if (p.id === callerId || p.account_uid === callerId) return false;
      if (callerBlocked.has(p.id)) return false;
      if (Array.isArray(p.blocked_ids) && (p.blocked_ids.includes(callerId) || (callerProfile && p.blocked_ids.includes(callerProfile.id)))) return false;
      return true;
    });
  }

  if (activeMembers.length === 0) {
    return res.json({ matches: [], query: cleanQuery });
  }

  // Member summaries strictly using what members wrote
  const memberList = activeMembers.map(p => ({
    id: p.id,
    name: p.name,
    role: p.role,
    roles: p.roles || [],
    headline: p.headline || '',
    offers: p.offers || '',
    needs: p.needs || '',
    teaches: p.teaches || '',
    learns: p.learns || '',
    skills: p.skills || [],
    tags: p.tags || [],
    location: p.location || '',
    research_area: p.research_area || '',
    institution: p.institution || ''
  }));

  const prompt = `You are Kwegatta's intelligent matchmaking engine for Ugandan builders, creators, and students.
A user asked: "${cleanQuery}".
Based STRICTLY and ONLY on what members wrote in their profiles below, select up to 5 best matching members.

RULES:
1. Never invent or hallucinate facts about any member. Only use facts explicitly written in their profile.
2. For each recommended member, provide exactly one concise, helpful sentence explaining why they fit the user's request.
3. Respond ONLY with a valid JSON array of objects: [{"profile_id": string, "reason": string}]
4. If no members match, return an empty array [].

MEMBERS:
${JSON.stringify(memberList, null, 2)}

JSON Output:`;

  try {
    const response = await invokeGemmaDirect(prompt, { temperature: 0.1 }, DEFAULT_OPEN_WEIGHT_MODEL);

    let matchesRaw: any[] = [];
    try {
      let rawText = response.text?.trim() || '[]';
      // Strip markdown codeblocks like ```json ... ```
      if (rawText.includes('```')) {
        rawText = rawText.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();
      }
      // Extract array bounds [ ... ]
      const startIdx = rawText.indexOf('[');
      const endIdx = rawText.lastIndexOf(']');
      if (startIdx !== -1 && endIdx > startIdx) {
        rawText = rawText.slice(startIdx, endIdx + 1);
      }
      matchesRaw = JSON.parse(rawText);
      if (!Array.isArray(matchesRaw)) {
        matchesRaw = [];
      }
    } catch (parseErr) {
      console.warn('[Ask Kwegatta Gemma] JSON parse error, falling back:', parseErr);
      matchesRaw = [];
    }

    const results = matchesRaw
      .slice(0, 5)
      .map((m: any) => {
        const found = activeMembers.find(p => p.id === m.profile_id);
        if (!found) return null;
        return {
          profile_id: found.id,
          profile: sanitizePublicProfile(found, callerId, isAdmin),
          reason: typeof m.reason === 'string' ? m.reason.slice(0, 300) : 'Matches your search request.'
        };
      })
      .filter(Boolean);

    return res.json({ matches: results, query: cleanQuery });
  } catch (err: any) {
    console.warn('[Ask Kwegatta Gemma] Error:', err?.message || err);
    // Simple keyword fallback
    const qLower = cleanQuery.toLowerCase();
    const keywords = qLower.split(/\s+/).filter(w => w.length > 2);
    const scored = activeMembers.map(p => {
      const haystack = `${p.name} ${p.role} ${p.headline} ${p.offers} ${p.needs} ${p.teaches} ${p.learns} ${(p.skills || []).join(' ')} ${(p.tags || []).join(' ')} ${p.location || ''} ${p.research_area || ''} ${p.institution || ''}`.toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (haystack.includes(kw)) score++;
      }
      return { p, score };
    }).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);

    const fallbackResults = scored.map(s => ({
      profile_id: s.p.id,
      profile: sanitizePublicProfile(s.p, callerId, isAdmin),
      reason: `Matches keywords in their offers, needs or skills (${s.p.role || s.p.name}).`
    }));

    return res.json({ matches: fallbackResults, query: cleanQuery });
  }
});

// MATCH PAIR CACHING ENDPOINTS
app.get('/api/matches/pair-cache', (req: Request, res: Response) => {
  const { a, b, verA, verB } = req.query as { a?: string; b?: string; verA?: string; verB?: string };
  if (!a || !b) {
    return res.status(400).json({ error: 'Parameters a and b required' });
  }
  const key = getPairCacheKey(a, b);
  const cached = matchPairCache.get(key);
  if (cached && cached.versionA === verA && cached.versionB === verB) {
    return res.json({ cached: true, result: cached.result });
  }
  return res.json({ cached: false });
});

app.post('/api/matches/pair-cache', (req: Request, res: Response) => {
  const { a, b, verA, verB, result } = req.body || {};
  if (!a || !b || !result) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }
  const key = getPairCacheKey(a, b);
  matchPairCache.set(key, {
    versionA: String(verA || ''),
    versionB: String(verB || ''),
    result,
    updatedAt: new Date().toISOString()
  });
  return res.json({ success: true });
});

/* =========================================================================
   ADMIN ENDPOINTS
   ========================================================================= */
app.post('/api/admin/login', adminLoginLimiter, async (req: Request, res: Response) => {
  const { code } = req.body || {};
  const expectedCode = process.env.ADMIN_CODE;
  if (!expectedCode || !expectedCode.trim()) {
    return res.status(503).json({ error: 'Admin access is not configured' });
  }
  
  const inputStr = String(code || '').trim();
  const expectedStr = expectedCode.trim();

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

  const token = issueAdminToken();

  const auditEntry = {
    id: 'audit-' + Date.now(),
    timestamp: new Date().toISOString(),
    action: 'ADMIN_LOGIN',
    details: 'Admin logged in successfully.',
    admin: 'admin'
  };
  store.audit_log.unshift(auditEntry);
  await persistDoc('audit_log', auditEntry.id, auditEntry);

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

app.post('/api/admin/action', async (req: Request, res: Response) => {
  if (!verifyAdmin(req, res)) return;

  const { action, id, hidden, message } = req.body || {};

  if (action === 'delete_member') {
    const target = store.profiles.find(p => p.id === id);
    const deletedPosts = store.posts.filter(p => p.author_id === id).map(p => p.id);
    store.profiles = store.profiles.filter(p => p.id !== id);
    store.posts = store.posts.filter(p => p.author_id !== id);
    if (storageMode === 'firestore' && firestoreDb) {
      await removeDoc('profiles', id);
      if (deletedPosts.length > 0) await batchRemoveDocs('posts', deletedPosts);
    }
    const auditEntry = {
      id: 'audit-' + Date.now(),
      timestamp: new Date().toISOString(),
      action: 'DELETE_MEMBER',
      details: `Deleted member: ${target?.name || id}`,
      admin: 'admin'
    };
    store.audit_log.unshift(auditEntry);
    await persistDoc('audit_log', auditEntry.id, auditEntry);
  } else if (action === 'toggle_hide_member') {
    const target = store.profiles.find(p => p.id === id);
    if (target) {
      target.hidden = hidden;
      await persistDoc('profiles', target.id, target);
      const auditEntry = {
        id: 'audit-' + Date.now(),
        timestamp: new Date().toISOString(),
        action: hidden ? 'HIDE_MEMBER' : 'UNHIDE_MEMBER',
        details: `${hidden ? 'Hid' : 'Unhid'} member: ${target.name}`,
        admin: 'admin'
      };
      store.audit_log.unshift(auditEntry);
      await persistDoc('audit_log', auditEntry.id, auditEntry);
    }
  } else if (action === 'delete_post') {
    store.posts = store.posts.filter(p => p.id !== id);
    await removeDoc('posts', id);
    const auditEntry = {
      id: 'audit-' + Date.now(),
      timestamp: new Date().toISOString(),
      action: 'DELETE_POST',
      details: `Deleted post ID: ${id}`,
      admin: 'admin'
    };
    store.audit_log.unshift(auditEntry);
    await persistDoc('audit_log', auditEntry.id, auditEntry);
  } else if (action === 'send_announcement') {
    const newNotifs: Array<{ id: string; data: any }> = [];
    for (const p of store.profiles) {
      const notif = {
        id: 'notif-ann-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        to_id: p.id,
        from_id: 'organiser',
        type: 'digest',
        body: `📢 Organiser Announcement: ${message}`,
        read: false,
        created_at: new Date().toISOString()
      };
      store.notifications.unshift(notif);
      newNotifs.push({ id: notif.id, data: notif });
    }
    if (newNotifs.length > 0) {
      await batchPersistDocs('notifications', newNotifs);
    }
    const auditEntry = {
      id: 'audit-' + Date.now(),
      timestamp: new Date().toISOString(),
      action: 'SEND_ANNOUNCEMENT',
      details: `Broadcasted notice to ${store.profiles.length} members: "${message.slice(0, 50)}..."`,
      admin: 'admin'
    };
    store.audit_log.unshift(auditEntry);
    await persistDoc('audit_log', auditEntry.id, auditEntry);
  }

  if (storageMode === 'disk') {
    saveStore(store);
  }
  return res.json({ success: true });
});

app.get('/api/admin/audit-log', (req: Request, res: Response) => {
  if (!verifyAdmin(req, res)) return;
  return res.json(store.audit_log || []);
});

// Member Safety: Report a profile with reason
app.post('/api/reports', async (req: Request, res: Response) => {
  const authUserId = resolveAuthUserId(req);
  const { reported_id, reason, details } = req.body || {};
  if (!reported_id || typeof reported_id !== 'string') {
    return res.status(400).json({ error: 'Reported member ID is required' });
  }

  const reportedProfile = store.profiles.find((p: any) => p.id === reported_id);
  const reporterProfile = authUserId ? store.profiles.find((p: any) => p.account_uid === authUserId || p.id === authUserId) : null;

  const report = {
    id: 'rep-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex'),
    reporter_id: reporterProfile?.id || authUserId || 'anonymous',
    reporter_name: reporterProfile?.name || 'Anonymous',
    reported_id,
    reported_name: reportedProfile?.name || 'Unknown',
    reason: sanitizeText(reason, 200) || 'Inappropriate behavior',
    details: sanitizeText(details, 1000) || '',
    created_at: new Date().toISOString(),
    status: 'pending'
  };

  store.reports.unshift(report);
  await persistDoc('reports', report.id, report);

  const auditEntry = {
    id: 'audit-' + Date.now(),
    timestamp: new Date().toISOString(),
    action: 'MEMBER_REPORTED',
    details: `Member "${report.reported_name}" (${report.reported_id}) reported by ${report.reporter_name}: ${report.reason}`,
    admin: 'system'
  };
  store.audit_log.unshift(auditEntry);
  await persistDoc('audit_log', auditEntry.id, auditEntry);

  return res.json({ success: true, report });
});

// Admin-only list reports
app.get('/api/admin/reports', (req: Request, res: Response) => {
  if (!verifyAdmin(req, res)) return;
  return res.json(store.reports || []);
});

// Admin-only report action (dismiss or resolve)
app.post('/api/admin/reports/:id/action', async (req: Request, res: Response) => {
  if (!verifyAdmin(req, res)) return;
  const { id } = req.params;
  const { action } = req.body || {};
  const report = store.reports.find((r: any) => r.id === id);
  if (!report) {
    return res.status(404).json({ error: 'Report not found' });
  }

  if (action === 'dismiss') {
    report.status = 'dismissed';
    await persistDoc('reports', report.id, report);
  } else if (action === 'resolve') {
    report.status = 'resolved';
    await persistDoc('reports', report.id, report);
  }

  return res.json({ success: true, report });
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

// Admin-Only Member Import endpoint: Accepts exported JSON and restores members with the exact same IDs
app.post('/api/admin/import', async (req: Request, res: Response) => {
  if (!verifyAdmin(req, res)) return;

  try {
    let members: any[] = [];
    if (Array.isArray(req.body)) {
      members = req.body;
    } else if (req.body && Array.isArray(req.body.profiles)) {
      members = req.body.profiles;
    } else if (req.body && Array.isArray(req.body.members)) {
      members = req.body.members;
    } else if (req.body && typeof req.body.data === 'string') {
      try {
        const parsed = JSON.parse(req.body.data);
        if (Array.isArray(parsed)) members = parsed;
        else if (Array.isArray(parsed.profiles)) members = parsed.profiles;
        else if (Array.isArray(parsed.members)) members = parsed.members;
      } catch (_) {}
    }

    if (!Array.isArray(members) || members.length === 0) {
      return res.status(400).json({
        error: 'Invalid import data: Expected an array of member profile objects or { profiles: [...] }'
      });
    }

    let restoredCount = 0;
    const restoredProfiles: any[] = [];

    for (const raw of members) {
      if (!raw || typeof raw !== 'object') continue;
      const id = String(raw.id || '').trim();
      const rawName = String(raw.name || '').trim();
      if (!id || !rawName) continue;

      const role = sanitizeText(raw.role, 50) || (Array.isArray(raw.roles) && raw.roles[0]) || 'Developer';

      const profile = {
        id, // Preserved exact same ID!
        name: sanitizeText(rawName, 100),
        role,
        roles: sanitizeArray(raw.roles, 2, 40),
        intent: sanitizeText(raw.intent, 100),
        stage: sanitizeText(raw.stage, 100),
        location: sanitizeText(raw.location, 100),
        hours_per_week: sanitizeText(raw.hours_per_week, 50),
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
        website: sanitizeUrl(raw.website),
        whatsapp: sanitizeText(raw.whatsapp, 30).replace(/[^0-9+]/g, ''),
        hide_whatsapp: Boolean(raw.hide_whatsapp),
        avatar: sanitizeAvatar(raw.avatar),
        status: sanitizeText(raw.status, 100),
        is_demo: Boolean(raw.is_demo),
        created_at: sanitizeText(raw.created_at, 50) || new Date().toISOString(),
        gh: raw.gh && typeof raw.gh === 'object' ? raw.gh : null,
        blocked_ids: sanitizeArray(raw.blocked_ids, 200, 64),
        hidden: Boolean(raw.hidden)
      };

      restoredProfiles.push(profile);
      restoredCount++;
    }

    if (restoredCount === 0) {
      return res.status(400).json({ error: 'No valid member profiles found in import payload' });
    }

    // Persist to storage (Firestore or Local Disk)
    if (storageMode === 'firestore' && firestoreDb) {
      const BATCH_SIZE = 400;
      for (let i = 0; i < restoredProfiles.length; i += BATCH_SIZE) {
        const batch = firestoreDb.batch();
        const chunk = restoredProfiles.slice(i, i + BATCH_SIZE);
        for (const p of chunk) {
          const docRef = firestoreDb.collection('profiles').doc(p.id);
          batch.set(docRef, p);
        }
        await batch.commit();
      }
    }

    // Update in-memory store
    for (const p of restoredProfiles) {
      const idx = store.profiles.findIndex(existing => existing.id === p.id);
      if (idx >= 0) {
        store.profiles[idx] = p;
      } else {
        store.profiles.push(p);
      }
    }

    if (storageMode === 'disk') {
      saveStore(store);
    }

    const auditEntry = {
      id: 'audit-' + Date.now(),
      timestamp: new Date().toISOString(),
      action: 'ADMIN_IMPORT',
      details: `Imported and restored ${restoredCount} member profile(s) with preserved IDs.`,
      admin: 'admin'
    };
    store.audit_log.unshift(auditEntry);
    if (storageMode === 'firestore' && firestoreDb) {
      firestoreDb.collection('audit_log').doc(auditEntry.id).set(auditEntry).catch(() => {});
    } else {
      saveStore(store);
    }

    return res.json({
      success: true,
      count: restoredCount,
      message: `Successfully restored ${restoredCount} member profile(s) with preserved IDs.`
    });
  } catch (err: any) {
    console.error('Failed to import members:', err);
    return res.status(500).json({ error: err.message || 'Failed to import members' });
  }
});

// Explicit connect endpoint (records notification to peer - requires session)
app.post('/api/connect', async (req: Request, res: Response) => {
  const authUserId = resolveAuthUserId(req);
  const isAdmin = checkAdmin(req);

  if (!authUserId && !isAdmin) {
    return res.status(401).json({ error: 'Authentication required to send a connection request' });
  }

  const { target_id, note, reason } = req.body || {};
  if (!target_id || typeof target_id !== 'string' || target_id.trim().length === 0) {
    return res.status(400).json({ error: 'Target member ID is required' });
  }

  const target = store.profiles.find((p: any) => p.id === target_id);
  if (!target) {
    return res.status(404).json({ error: 'Target member not found' });
  }

  const requester = store.profiles.find((p: any) => p.account_uid === authUserId || p.id === authUserId);
  const requesterName = requester ? requester.name : 'A member';

  if (target_id === authUserId || (requester && target_id === requester.id)) {
    return res.status(400).json({ error: 'Cannot connect with yourself' });
  }

  // Dispatch a notification to the target member
  const notif = {
    id: 'notif-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'),
    to_id: target_id,
    from_id: requester?.id || authUserId || 'admin',
    type: 'connect',
    body: `${requesterName} reached out to connect: "${sanitizeText(reason || note || 'Let\'s collaborate!', 300)}"`,
    read: false,
    created_at: new Date().toISOString()
  };

  store.notifications.unshift(notif);
  await persistDoc('notifications', notif.id, notif);

  return res.json({
    success: true,
    target_id: target.id,
    target_name: target.name,
    whatsapp: target.whatsapp || '',
    linkedin: target.linkedin || ''
  });
});

// Delete member profile permanently (Authentication required: self or admin)
app.delete('/api/profiles/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  const authUserId = resolveAuthUserId(req);
  const isAdmin = checkAdmin(req);

  if (!authUserId && !isAdmin) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const existing = store.profiles.find((p: any) => p.id === id);
  const isOwner = authUserId && (id === authUserId || existing?.account_uid === authUserId);

  if (!isAdmin && !isOwner) {
    return res.status(403).json({ error: 'Forbidden: You can only delete your own profile' });
  }

  const initialCount = store.profiles.length;
  const deletedPosts = store.posts.filter((p: any) => p.author_id === id).map(p => p.id);
  const deletedFollows = store.follows.filter((f: any) => f.follower_id === id || f.following_id === id).map(f => f.id);
  const deletedMatches = store.matches.filter((m: any) => m.a_id === id || m.b_id === id).map(m => m.id);
  const deletedNotifs = store.notifications.filter((n: any) => n.to_id === id || n.from_id === id).map(n => n.id);

  store.profiles = store.profiles.filter((p: any) => p.id !== id);
  store.posts = store.posts.filter((p: any) => p.author_id !== id);
  store.follows = store.follows.filter((f: any) => f.follower_id !== id && f.following_id !== id);
  store.matches = store.matches.filter((m: any) => m.a_id !== id && m.b_id !== id);
  store.notifications = store.notifications.filter((n: any) => n.to_id !== id && n.from_id !== id);

  if (storageMode === 'firestore' && firestoreDb) {
    await removeDoc('profiles', id);
    if (deletedPosts.length > 0) await batchRemoveDocs('posts', deletedPosts);
    if (deletedFollows.length > 0) await batchRemoveDocs('follows', deletedFollows);
    if (deletedMatches.length > 0) await batchRemoveDocs('matches', deletedMatches);
    if (deletedNotifs.length > 0) await batchRemoveDocs('notifications', deletedNotifs);
  } else {
    saveStore(store);
  }

  // Requirement 9: Deleting a profile also deletes the Firebase user account
  const firebaseUidToDelete = existing?.account_uid || (id.startsWith('user-') || id.startsWith('demo-') ? null : id) || authUserId;
  if (adminAuth && firebaseUidToDelete && !isAdmin) {
    try {
      await adminAuth.deleteUser(firebaseUidToDelete);
      console.log(`[Firebase Admin] Deleted user account ${firebaseUidToDelete} with profile ${id}`);
    } catch (authDelErr: any) {
      console.warn(`[Firebase Admin] Could not delete user account ${firebaseUidToDelete}:`, authDelErr?.message || authDelErr);
    }
  }

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
    model: DEFAULT_OPEN_WEIGHT_MODEL,
    allowedModels: ALLOWED_OPEN_WEIGHT_MODELS,
    hasServerApiKey: Boolean(process.env.GEMINI_API_KEY),
    isDemoMode,
    storage: storageMode,
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

  // WHATSAPP VISIBILITY & PRIVACY ENFORCEMENT:
  // - Never return email, account_uid or auth secrets in public or member-facing responses.
  // - A member's email is visible ONLY to that member and platform admins.
  // - Any profile without an account is hidden from lists and matches.
  if (col === 'profiles') {
    const callerId = resolveAuthUserId(req);
    const isAdmin = checkAdmin(req);
    let filteredProfiles = sliced;

    // Requirement 3: From now on, any profile without an account is hidden from lists and matches
    filteredProfiles = filteredProfiles.filter((p: any) => {
      const isSelf = callerId && (p.id === callerId || p.account_uid === callerId);
      if (isAdmin || isSelf) return true;
      return Boolean(p.account_uid);
    });

    if (callerId) {
      const callerProfile = store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId);
      const callerBlockedSet = new Set(callerProfile?.blocked_ids || []);
      filteredProfiles = filteredProfiles.filter((p: any) => {
        if (p.id === callerId || p.account_uid === callerId) return true;
        // Do not show if caller blocked p
        if (callerBlockedSet.has(p.id)) return false;
        // Do not show if p blocked caller
        if (Array.isArray(p.blocked_ids) && (p.blocked_ids.includes(callerId) || (callerProfile && p.blocked_ids.includes(callerProfile.id)))) return false;
        return true;
      });
    }

    const safeProfiles = filteredProfiles.map(p => sanitizePublicProfile(p, callerId, isAdmin));
    return res.json(safeProfiles);
  }

  // Filter matches so blocked members never match each other
  if (col === 'matches') {
    const callerId = resolveAuthUserId(req);
    if (callerId) {
      const callerProfile = store.profiles.find((p: any) => p.id === callerId);
      const callerBlockedSet = new Set(callerProfile?.blocked_ids || []);
      const safeMatches = sliced.filter((m: any) => {
        const otherId = m.a_id === callerId ? m.b_id : m.b_id === callerId ? m.a_id : null;
        if (otherId) {
          if (callerBlockedSet.has(otherId)) return false;
          const otherProfile = store.profiles.find((p: any) => p.id === otherId);
          if (Array.isArray(otherProfile?.blocked_ids) && otherProfile.blocked_ids.includes(callerId)) return false;
        }
        return true;
      });
      return res.json(safeMatches);
    }
  }

  return res.json(sliced);
});

// Profile & Data Creation (Protected / Strict Validation / Session Required)
app.post('/api/data/:collection', async (req: Request, res: Response) => {
  const col = req.params.collection as keyof StoreData;
  if (!store[col]) {
    return res.status(404).json({ error: `Collection ${col} not found` });
  }

  const authUserId = resolveAuthUserId(req);
  const isAdmin = checkAdmin(req);
  const raw = req.body || {};

  // If creating or updating a profile:
  if (col === 'profiles') {
    const requestedId = raw.id ? sanitizeText(raw.id, 64) : null;

    // Check if user already owns an existing profile (Requirement 3: One profile per account)
    let existingProfile: any = null;
    if (authUserId) {
      existingProfile = store.profiles.find((p: any) => p.account_uid === authUserId || p.id === authUserId);
    }
    if (!existingProfile && requestedId) {
      existingProfile = store.profiles.find((p: any) => p.id === requestedId);
    }

    const userEmail = (req as any).authUser?.email || sanitizeText(raw.email, 100);
    if (!existingProfile && userEmail) {
      const profileWithEmail = store.profiles.find((p: any) => p.email && p.email.toLowerCase() === userEmail.toLowerCase());
      if (profileWithEmail) {
        existingProfile = profileWithEmail;
      }
    }

    // Authorization check
    if (existingProfile) {
      const isOwner = authUserId && (existingProfile.id === authUserId || existingProfile.account_uid === authUserId || !existingProfile.account_uid);
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: 'Forbidden: You can only edit your own profile' });
      }
    } else {
      // New profile creation requires Firebase authentication
      if (!authUserId && !isAdmin) {
        return res.status(401).json({ error: 'Firebase authentication required to create a profile' });
      }
    }

    // Validate name
    const rawName = typeof raw.name === 'string' ? raw.name.trim() : '';
    if (!rawName || rawName.length < 2) {
      return res.status(400).json({ error: 'A valid name (at least 2 characters) is required' });
    }

    const role = sanitizeText(raw.role, 50) || (Array.isArray(raw.roles) && raw.roles[0]) || 'Developer';
    const id = existingProfile ? existingProfile.id : (requestedId || authUserId || ('user-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex')));
    const account_uid = authUserId || existingProfile?.account_uid || null;

    const row = {
      id,
      account_uid,
      email: userEmail || existingProfile?.email || '',
      name: sanitizeText(rawName, 100),
      role,
      roles: sanitizeArray(raw.roles, 2, 40),
      intent: sanitizeText(raw.intent, 100),
      intents: sanitizeArray(raw.intents, 5, 100),
      stage: sanitizeText(raw.stage, 100),
      location: sanitizeText(raw.location, 100),
      hours_per_week: sanitizeText(raw.hours_per_week, 50),
      headline: sanitizeText(raw.headline, 200),
      bio: sanitizeText(raw.bio, 1000),
      offers: sanitizeText(raw.offers, 1000),
      needs: sanitizeText(raw.needs, 1000),
      teaches: sanitizeText(raw.teaches, 1000),
      learns: sanitizeText(raw.learns, 1000),
      tags: sanitizeArray(raw.tags, 15, 30),
      skills: sanitizeArray(raw.skills, 15, 40),
      research_area: sanitizeText(raw.research_area, 200),
      institution: sanitizeText(raw.institution, 200),
      github: sanitizeText(raw.github, 50).replace(/^@/, '').replace(/[^a-zA-Z0-9-_]/g, ''),
      linkedin: sanitizeUrl(raw.linkedin),
      website: sanitizeUrl(raw.website),
      facebook: sanitizeUrl(raw.facebook),
      tiktok: sanitizeUrl(raw.tiktok),
      twitter: sanitizeUrl(raw.twitter || raw.x),
      instagram: sanitizeUrl(raw.instagram),
      youtube: sanitizeUrl(raw.youtube),
      scholar: sanitizeUrl(raw.scholar || raw.google_scholar),
      orcid: sanitizeUrl(raw.orcid),
      whatsapp: sanitizeText(raw.whatsapp, 30).replace(/[^0-9+]/g, ''),
      hide_whatsapp: Boolean(raw.hide_whatsapp),
      avatar: sanitizeAvatar(raw.avatar),
      status: sanitizeText(raw.status, 100),
      is_demo: Boolean(raw.is_demo),
      created_at: sanitizeText(raw.created_at, 50) || existingProfile?.created_at || new Date().toISOString(),
      gh: raw.gh && typeof raw.gh === 'object' ? raw.gh : (existingProfile?.gh || null),
      blocked_ids: sanitizeArray(raw.blocked_ids, 200, 64)
    };

    const existingIdx = store.profiles.findIndex((item: any) => item.id === row.id);
    if (existingIdx >= 0) {
      store.profiles[existingIdx] = { ...store.profiles[existingIdx], ...row };
    } else {
      store.profiles.unshift(row);
    }

    await persistDoc('profiles', row.id, row);
    return res.json(sanitizePublicProfile(row, authUserId, isAdmin));
  }

  // ALL other collections REQUIRE a valid active session
  if (!authUserId && !isAdmin) {
    return res.status(401).json({ error: 'Authentication required. Please log in or create a profile.' });
  }

  // Posts: author is strictly session user, body cannot be empty
  if (col === 'posts') {
    const rawBody = typeof raw.body === 'string' ? raw.body.trim() : '';
    if (!rawBody || rawBody.length === 0) {
      return res.status(400).json({ error: 'Post body cannot be empty' });
    }

    const validKinds = ['idea', 'need', 'offer', 'question'];
    const kind = validKinds.includes(raw.kind) ? raw.kind : 'idea';
    const myProfile = store.profiles.find((p: any) => p.account_uid === authUserId || p.id === authUserId);
    const authorId = myProfile?.id || authUserId || 'admin';

    const row = {
      id: sanitizeText(raw.id, 64) || ('post-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex')),
      author_id: authorId,
      title: sanitizeText(raw.title, 200),
      body: sanitizeText(rawBody, 2000),
      kind,
      tags: sanitizeArray(raw.tags, 10, 30),
      created_at: sanitizeText(raw.created_at, 50) || new Date().toISOString()
    };

    store.posts.unshift(row);
    await persistDoc('posts', row.id, row);
    return res.json(row);
  }

  // Follows: follower is strictly session user
  if (col === 'follows') {
    const myProfile = store.profiles.find((p: any) => p.account_uid === authUserId || p.id === authUserId);
    const followerId = myProfile?.id || authUserId!;
    const followingId = typeof raw.following_id === 'string' ? sanitizeText(raw.following_id, 64) : '';
    if (!followingId || followingId === followerId || followingId === authUserId) {
      return res.status(400).json({ error: 'Invalid following target' });
    }

    const row = {
      id: sanitizeText(raw.id, 64) || ('follow-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex')),
      follower_id: followerId,
      following_id: followingId,
      created_at: sanitizeText(raw.created_at, 50) || new Date().toISOString()
    };

    const existingIdx = store.follows.findIndex((f: any) => f.follower_id === row.follower_id && f.following_id === row.following_id);
    if (existingIdx >= 0) {
      return res.json(store.follows[existingIdx]);
    }

    store.follows.unshift(row);
    await persistDoc('follows', row.id, row);
    return res.json(row);
  }

  // Notifications: sender is session user, recipient must be valid
  if (col === 'notifications') {
    const toId = typeof raw.to_id === 'string' ? sanitizeText(raw.to_id, 64) : '';
    const notifBody = typeof raw.body === 'string' ? sanitizeText(raw.body, 500) : '';
    if (!toId || !notifBody) {
      return res.status(400).json({ error: 'Recipient and notification body are required' });
    }

    const row = {
      id: sanitizeText(raw.id, 64) || ('notif-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex')),
      to_id: toId,
      from_id: authUserId || 'system',
      type: sanitizeText(raw.type, 30) || 'message',
      body: notifBody,
      read: false,
      created_at: sanitizeText(raw.created_at, 50) || new Date().toISOString()
    };

    store.notifications.unshift(row);
    await persistDoc('notifications', row.id, row);
    return res.json(row);
  }

  // Matches
  if (col === 'matches') {
    const aId = typeof raw.a_id === 'string' ? sanitizeText(raw.a_id, 64) : '';
    const bId = typeof raw.b_id === 'string' ? sanitizeText(raw.b_id, 64) : '';
    const score = typeof raw.score === 'number' ? Math.round(raw.score) : 0;
    if (!aId || !bId || score <= 0) {
      return res.status(400).json({ error: 'Valid matching pairs and score required' });
    }

    const row = {
      id: sanitizeText(raw.id, 64) || ('match-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex')),
      a_id: aId,
      b_id: bId,
      score,
      reason: sanitizeText(raw.reason, 500),
      spark: sanitizeText(raw.spark, 300),
      created_at: sanitizeText(raw.created_at, 50) || new Date().toISOString()
    };

    store.matches.unshift(row);
    await persistDoc('matches', row.id, row);
    return res.json(row);
  }

  return res.status(400).json({ error: `Unsupported collection ${col}` });
});

// Update Record (Ownership / Auth Check for All Collections)
app.patch('/api/data/:collection/:id', async (req: Request, res: Response) => {
  const col = req.params.collection as keyof StoreData;
  const id = req.params.id;
  if (!store[col]) {
    return res.status(404).json({ error: `Collection ${col} not found` });
  }

  const authUserId = resolveAuthUserId(req);
  const isAdmin = checkAdmin(req);

  if (!authUserId && !isAdmin) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const index = store[col].findIndex((item: any) => item.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Item not found' });
  }

  const existing = store[col][index];

  const myProfile = store.profiles.find((p: any) => p.account_uid === authUserId || p.id === authUserId);
  const myProfileId = myProfile?.id;

  // Enforce resource-level authorization
  if (col === 'profiles' && !isAdmin) {
    const isOwner = authUserId === id || existing.account_uid === authUserId || myProfileId === id;
    if (!isOwner) {
      return res.status(403).json({ error: 'Forbidden: You can only edit your own profile' });
    }
  }
  if (col === 'posts' && !isAdmin) {
    const isOwner = authUserId === existing.author_id || myProfileId === existing.author_id;
    if (!isOwner) {
      return res.status(403).json({ error: 'Forbidden: You can only edit your own posts' });
    }
  }
  if (col === 'follows' && !isAdmin) {
    const isOwner = authUserId === existing.follower_id || myProfileId === existing.follower_id;
    if (!isOwner) {
      return res.status(403).json({ error: 'Forbidden: You can only edit your own follows' });
    }
  }
  if (col === 'notifications' && !isAdmin) {
    const isOwner = authUserId === existing.to_id || myProfileId === existing.to_id;
    if (!isOwner) {
      return res.status(403).json({ error: 'Forbidden: You can only modify your own notifications' });
    }
  }

  // Validate patch fields
  const patch = req.body || {};
  if (col === 'posts' && patch.body !== undefined) {
    const rawBody = typeof patch.body === 'string' ? patch.body.trim() : '';
    if (!rawBody) return res.status(400).json({ error: 'Post body cannot be empty' });
    patch.body = sanitizeText(rawBody, 2000);
  }
  if (col === 'profiles') {
    if (patch.avatar !== undefined) {
      patch.avatar = sanitizeAvatar(patch.avatar);
    }
    if (patch.blocked_ids !== undefined) {
      patch.blocked_ids = sanitizeArray(patch.blocked_ids, 200, 64);
    }
    if (patch.roles !== undefined) {
      patch.roles = sanitizeArray(patch.roles, 2, 40);
    }
    if (patch.intent !== undefined) {
      patch.intent = sanitizeText(patch.intent, 100);
    }
    if (patch.stage !== undefined) {
      patch.stage = sanitizeText(patch.stage, 100);
    }
    if (patch.location !== undefined) {
      patch.location = sanitizeText(patch.location, 100);
    }
    if (patch.hours_per_week !== undefined) {
      patch.hours_per_week = sanitizeText(patch.hours_per_week, 50);
    }
    if (patch.headline !== undefined) {
      patch.headline = sanitizeText(patch.headline, 200);
    }
    if (patch.bio !== undefined) {
      patch.bio = sanitizeText(patch.bio, 1000);
    }
    if (patch.offers !== undefined) {
      patch.offers = sanitizeText(patch.offers, 1000);
    }
    if (patch.needs !== undefined) {
      patch.needs = sanitizeText(patch.needs, 1000);
    }
    if (patch.teaches !== undefined) {
      patch.teaches = sanitizeText(patch.teaches, 1000);
    }
    if (patch.learns !== undefined) {
      patch.learns = sanitizeText(patch.learns, 1000);
    }
    if (patch.tags !== undefined) {
      patch.tags = sanitizeArray(patch.tags, 15, 30);
    }
    if (patch.skills !== undefined) {
      patch.skills = sanitizeArray(patch.skills, 15, 40);
    }
    if (patch.intents !== undefined) {
      patch.intents = sanitizeArray(patch.intents, 5, 100);
    }
    if (patch.research_area !== undefined) {
      patch.research_area = sanitizeText(patch.research_area, 200);
    }
    if (patch.institution !== undefined) {
      patch.institution = sanitizeText(patch.institution, 200);
    }
    if (patch.github !== undefined) {
      patch.github = sanitizeText(patch.github, 50).replace(/^@/, '').replace(/[^a-zA-Z0-9-_]/g, '');
    }
    if (patch.linkedin !== undefined) {
      patch.linkedin = sanitizeUrl(patch.linkedin);
    }
    if (patch.website !== undefined) {
      patch.website = sanitizeUrl(patch.website);
    }
    if (patch.facebook !== undefined) {
      patch.facebook = sanitizeUrl(patch.facebook);
    }
    if (patch.tiktok !== undefined) {
      patch.tiktok = sanitizeUrl(patch.tiktok);
    }
    if (patch.twitter !== undefined || patch.x !== undefined) {
      patch.twitter = sanitizeUrl(patch.twitter || patch.x);
    }
    if (patch.instagram !== undefined) {
      patch.instagram = sanitizeUrl(patch.instagram);
    }
    if (patch.youtube !== undefined) {
      patch.youtube = sanitizeUrl(patch.youtube);
    }
    if (patch.scholar !== undefined || patch.google_scholar !== undefined) {
      patch.scholar = sanitizeUrl(patch.scholar || patch.google_scholar);
    }
    if (patch.orcid !== undefined) {
      patch.orcid = sanitizeUrl(patch.orcid);
    }
    if (patch.whatsapp !== undefined) {
      patch.whatsapp = sanitizeText(patch.whatsapp, 30).replace(/[^0-9+]/g, '');
    }
    if (patch.hide_whatsapp !== undefined) {
      patch.hide_whatsapp = Boolean(patch.hide_whatsapp);
    }
  }

  store[col][index] = { ...existing, ...patch };
  await persistDoc(col, id, store[col][index]);
  if (col === 'profiles') {
    return res.json(sanitizePublicProfile(store[col][index], authUserId, isAdmin));
  }
  return res.json(store[col][index]);
});

// Delete Record (Ownership / Auth Check for All Collections)
app.delete('/api/data/:collection/:id', async (req: Request, res: Response) => {
  const col = req.params.collection as keyof StoreData;
  const id = req.params.id;
  if (!store[col]) {
    return res.status(404).json({ error: `Collection ${col} not found` });
  }

  const authUserId = resolveAuthUserId(req);
  const isAdmin = checkAdmin(req);

  if (!authUserId && !isAdmin) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const existing = store[col].find((item: any) => item.id === id);
  if (!existing) {
    return res.json({ success: true, message: 'Item already not present' });
  }

  const myProfile = store.profiles.find((p: any) => p.account_uid === authUserId || p.id === authUserId);
  const myProfileId = myProfile?.id;

  // Enforce resource-level authorization
  if (col === 'profiles' && !isAdmin) {
    const isOwner = authUserId === id || existing.account_uid === authUserId || myProfileId === id;
    if (!isOwner) {
      return res.status(403).json({ error: 'Forbidden: You can only delete your own profile' });
    }
  }
  if (col === 'posts' && !isAdmin) {
    const isOwner = authUserId === existing.author_id || myProfileId === existing.author_id;
    if (!isOwner) {
      return res.status(403).json({ error: 'Forbidden: You can only delete your own posts' });
    }
  }
  if (col === 'follows' && !isAdmin) {
    const isOwner = authUserId === existing.follower_id || myProfileId === existing.follower_id;
    if (!isOwner) {
      return res.status(403).json({ error: 'Forbidden: You can only delete your own follows' });
    }
  }
  if (col === 'notifications' && !isAdmin) {
    const isOwner = authUserId === existing.to_id || myProfileId === existing.to_id;
    if (!isOwner) {
      return res.status(403).json({ error: 'Forbidden: You can only delete your own notifications' });
    }
  }

  store[col] = store[col].filter((item: any) => item.id !== id);
  await removeDoc(col, id);
  return res.json({ success: true });
});

// Photo upload for authentic event photos (admin only)
app.post('/api/upload-photo', (req: Request, res: Response) => {
  if (!checkAdmin(req)) {
    return res.status(401).json({ error: 'Admin session required' });
  }
  try {
    const { slot, dataUrl } = req.body;
    if (!slot || !dataUrl) {
      return res.status(400).json({ error: 'Missing slot or dataUrl' });
    }
    const matches = dataUrl.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Invalid base64 dataUrl format' });
    }
    const buffer = Buffer.from(matches[2], 'base64');
    
    // Determine target filenames based on slot
    const slotFilenames: Record<string, string[]> = {
      hero: ['table-coding.jpg', 'kwegatta_table_coding_1791028315565.jpg', 'table-coding-800.webp', 'table-coding-1600.webp'],
      hall: ['mubs-hall.jpg', 'mubs_hackathon_hall_1791028302284.jpg', 'mubs-hall-800.webp', 'mubs-hall-1600.webp'],
      team: ['team-session.jpg', 'mubs_collaborators_session_1791028328078.jpg', 'winning-team.jpg', 'team-session-800.webp', 'team-session-1600.webp']
    };
    
    const targets = slotFilenames[slot] || [`${slot}.jpg`];
    const dirs = [
      path.join(__dirname, 'public', 'images'),
      path.join(__dirname, 'dist', 'images'),
      path.join(__dirname, 'src', 'assets', 'images')
    ];
    
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
      }
      for (const target of targets) {
        try {
          fs.writeFileSync(path.join(dir, target), buffer);
        } catch (_) {}
      }
    }
    
    return res.json({ success: true, slot, targets });
  } catch (err: any) {
    console.error('Failed to save uploaded photo:', err);
    return res.status(500).json({ error: err.message || 'Failed to save photo' });
  }
});

// Demo data operations (Admin session required)
app.post('/api/demo/seed', async (req: Request, res: Response) => {
  if (!checkAdmin(req)) {
    return res.status(401).json({ error: 'Admin session required' });
  }
  const toAdd: Array<{ id: string; data: any }> = [];
  for (const demo of INITIAL_DEMO_MEMBERS) {
    if (!store.profiles.some(p => p.id === demo.id)) {
      store.profiles.push({ ...demo });
      toAdd.push({ id: demo.id, data: { ...demo } });
    }
  }
  if (toAdd.length > 0) {
    await batchPersistDocs('profiles', toAdd);
  } else {
    saveStore(store);
  }
  return res.json({ success: true, count: store.profiles.length });
});

app.post('/api/demo/clear', async (req: Request, res: Response) => {
  if (!checkAdmin(req)) {
    return res.status(401).json({ error: 'Admin session required' });
  }
  const demoIds = store.profiles.filter(p => p.is_demo).map(p => p.id);
  store.profiles = store.profiles.filter(p => !p.is_demo);
  if (demoIds.length > 0 && storageMode === 'firestore' && firestoreDb) {
    await batchRemoveDocs('profiles', demoIds);
  } else {
    saveStore(store);
  }
  return res.json({ success: true, count: store.profiles.length });
});

// Production static assets or Vite middleware in dev
async function setupVite() {
  await initStorage();

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
    console.log(`Gemma Model: ${DEFAULT_OPEN_WEIGHT_MODEL}`);
    console.log(`Storage engine: ${storageMode.toUpperCase()}`);
  });
}

setupVite().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
