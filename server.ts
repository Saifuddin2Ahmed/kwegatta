import 'dotenv/config';
import express, { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { initializeApp, getApps, type App } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth as getAdminAuth, type Auth as AdminAuth } from 'firebase-admin/auth';
import nodemailer from 'nodemailer';
import sharp from 'sharp';
import wawoff2 from 'wawoff2';
import { ISO_COUNTRIES, deriveLocation } from './src/lib/countries';
import { ROLE_CHOICES, STAGE_CHOICES, normalizeIntent } from './src/lib/profileChoices';
import { normalizeTicketCode } from './src/lib/ticketCode';
import { formatTzLabel } from './src/lib/timezoneLabel';
import { validateEventTitle } from './src/lib/eventTitle';
import { validateTeamPayload, checkPhotoDataUrl, checkX, checkWebsite, whatsappLink, TEAM_VISIBILITY_FLAGS } from './src/lib/teamFields';
import { getEffectiveStartMs, getEffectiveEndMs, getOpportunityDeadlineMs, sortForTab, findRecentDuplicate } from './src/lib/eventTiming';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export let fontConfigInitError: string | null = null;
let fontConfigReady = false;
let fontConfigInitPromise: Promise<boolean> | null = null;

export async function ensureFontConfigInitialized(): Promise<boolean> {
  if (fontConfigReady) return true;
  if (!fontConfigInitPromise) {
    fontConfigInitPromise = (async () => {
      try {
        const fontDir = path.join(os.tmpdir(), 'kw-fonts');
        const cacheDir = path.join(os.tmpdir(), 'kw-fontconfig-cache');
        fs.mkdirSync(fontDir, { recursive: true });
        fs.mkdirSync(cacheDir, { recursive: true });

        const candidatePaths = [
          path.resolve(process.cwd(), 'public/fonts/inter.woff2'),
          path.resolve(__dirname, 'public/fonts/inter.woff2'),
          path.resolve(process.cwd(), 'dist/fonts/inter.woff2'),
          path.resolve(__dirname, 'dist/fonts/inter.woff2'),
          path.resolve(__dirname, '../public/fonts/inter.woff2')
        ];

        let woff2Path = '';
        for (const p of candidatePaths) {
          if (fs.existsSync(p)) {
            woff2Path = p;
            break;
          }
        }

        if (!woff2Path) {
          fontConfigInitError = `Could not locate public/fonts/inter.woff2 in candidatePaths: ${JSON.stringify(candidatePaths)}`;
          console.warn('[FontConfig]', fontConfigInitError);
          return false;
        }

        const decompressFn =
          typeof (wawoff2 as any)?.decompress === 'function'
            ? (wawoff2 as any).decompress
            : typeof (wawoff2 as any)?.default?.decompress === 'function'
              ? (wawoff2 as any).default.decompress
              : null;

        if (!decompressFn) {
          fontConfigInitError = `wawoff2.decompress function not found on import: ${JSON.stringify(Object.keys(wawoff2 || {}))}`;
          console.warn('[FontConfig]', fontConfigInitError);
          return false;
        }

        const woff2Buf = fs.readFileSync(woff2Path);
        const ttfBuf = await decompressFn(new Uint8Array(woff2Buf));
        const ttfPath = path.join(fontDir, 'Inter.ttf');
        fs.writeFileSync(ttfPath, Buffer.from(ttfBuf));

        const fontsConfPath = path.join(fontDir, 'fonts.conf');
        const confXml = `<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <dir>${fontDir}</dir>
  <cachedir>${cacheDir}</cachedir>
</fontconfig>
`;
        fs.writeFileSync(fontsConfPath, confXml, 'utf-8');
        process.env.FONTCONFIG_FILE = fontsConfPath;
        fontConfigReady = true;
        fontConfigInitError = null;
        return true;
      } catch (err: any) {
        fontConfigInitError = err?.stack || err?.message || String(err);
        console.warn('[FontConfig] Failed to initialize fonts for sharp/librsvg:', fontConfigInitError);
        fontConfigReady = false;
        fontConfigInitPromise = null;
        return false;
      }
    })();
  }
  return fontConfigInitPromise;
}

// Automatically initiate font decompression once at startup
ensureFontConfigInitialized().catch(() => {});

export function filterRoles(inputRoles: any, existingRoles: string[] = []): string[] {
  if (!Array.isArray(inputRoles)) return existingRoles;
  const filtered: string[] = [];
  for (const item of inputRoles) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (ROLE_CHOICES.includes(trimmed) && !filtered.includes(trimmed)) {
        filtered.push(trimmed);
        if (filtered.length === 2) break;
      }
    }
  }
  return filtered.length > 0 ? filtered : existingRoles;
}

export const PRIVACY_VERSION = '2026-10';

export const app = express();
const PORT =
  Number(process.env.DEFAULT_APP_PORT) ||
  (process.env.NGINX_PORT && process.env.PORT === process.env.NGINX_PORT ? 3000 : Number(process.env.PORT)) ||
  3000;

/**
 * Express async handler wrapper: passes any rejected promise or thrown error to next(err).
 */
export function asyncHandler(fn: any) {
  if (typeof fn !== 'function') return fn;
  if (fn.length === 4) return fn;
  return (req: Request, res: Response, next: express.NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// Automatically wrap every handler registered on app.get/post/patch/put/delete
const httpMethods = ['get', 'post', 'patch', 'put', 'delete'] as const;
for (const method of httpMethods) {
  const originalMethod = (app as any)[method].bind(app);
  (app as any)[method] = (path: any, ...handlers: any[]) => {
    const wrappedHandlers = handlers.map((h: any) =>
      typeof h === 'function' && h.length <= 3 ? asyncHandler(h) : h
    );
    return originalMethod(path, ...wrappedHandlers);
  };
}

/**
 * Recursively strips undefined values from objects and arrays,
 * leaving null, false, 0, and '' untouched.
 */
export function stripUndefined<T>(value: T): T {
  if (value === undefined) {
    return undefined as any;
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (value instanceof Date) {
    return value;
  }
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefined(item)) as any;
  }
  const result: Record<string, any> = {};
  for (const [key, val] of Object.entries(value)) {
    if (val !== undefined) {
      result[key] = stripUndefined(val);
    }
  }
  return result as T;
}

// Security: Disable X-Powered-By header to prevent fingerprinting
app.disable('x-powered-by');

// Configure Express trust proxy for Google Cloud Run (1 proxy hop = Google Front End / GFE).
// GFE appends the true connecting client IP as the last IP entry in X-Forwarded-For.
// Setting 'trust proxy' to 1 instructs Express to trust exactly 1 upstream proxy hop (GFE)
// and derive req.ip from the right-most address appended by GFE, preventing clients from
// forging their IP by injecting arbitrary left-most X-Forwarded-For values.
app.set('trust proxy', 1);

// Security Headers Middleware
app.use((_req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://accounts.google.com https://www.gstatic.com; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: blob: https:; connect-src 'self' https://apis.google.com https://accounts.google.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firestore.googleapis.com https://*.firebaseio.com https://*.googleapis.com; frame-src 'self' https://accounts.google.com https://*.firebaseapp.com; object-src 'none'; base-uri 'self';"
  );
  next();
});

// JSON body size: 2 MB covers profiles (avatar up to 1 MB) and event covers.
// Admin uploads (team and event photos) get more room; nothing else needs it.
const jsonDefault = express.json({ limit: '2mb' });
const jsonLarge = express.json({ limit: '12mb' });
export function needsLargeJsonBody(path: string): boolean {
  return path.startsWith('/api/admin/') || path === '/api/upload-photo';
}
app.use((req, res, next) => (needsLargeJsonBody(req.path) ? jsonLarge : jsonDefault)(req, res, next));

interface AuthUserData {
  uid: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
}

// Global Auth middleware: verifies Firebase ID tokens on every request via firebase-admin
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
          email_verified: decoded.email_verified === true,
          name: decoded.name
        } as AuthUserData;
      }
    } catch (err: any) {
      // Token expired, malformed, or dev domain
    }
  } else if (token && (process.env.NODE_ENV === 'test' || process.env.VITEST)) {
    // In test environment, support mock test tokens
    (req as any).authUserId = token;
    (req as any).authUser = {
      uid: token,
      email: `${token}@kwegatta.test`,
      email_verified: !token.startsWith('unverified-'),
      name: `User ${token}`
    } as AuthUserData;
  }

  next();
});

function resolveAuthUserId(req: Request): string | null {
  return (req as any).authUserId || null;
}

/**
 * Helper to retrieve the real verified client IP address.
 * Uses Express req.ip (which trusts 1 proxy hop via GFE).
 * If req.ip is absent or invalid, falls back to req.socket.remoteAddress or '0.0.0.0'.
 */
export function getClientIp(req: Request): string {
  if (req.ip) {
    return req.ip;
  }
  const socketIp = req.socket?.remoteAddress;
  if (socketIp) {
    return socketIp;
  }
  return '0.0.0.0';
}

/* =========================================================================
   GENERIC DATA ROUTE ALLOWLIST (PRIVACY & SECURITY)
   ========================================================================= */
export const PUBLIC_READ_COLLECTIONS = ['profiles', 'posts', 'events', 'team'] as const;
export const SIGNED_IN_OWN_COLLECTIONS = ['notifications', 'matches', 'follows'] as const;
export const ALLOWED_DATA_COLLECTIONS = [...PUBLIC_READ_COLLECTIONS, ...SIGNED_IN_OWN_COLLECTIONS] as const;

export function isAllowedDataCollection(col: string): boolean {
  return (ALLOWED_DATA_COLLECTIONS as readonly string[]).includes(col);
}

/* =========================================================================
   RATE LIMITING MIDDLEWARE
   - Signed-in accounts: 240 req/min each
   - Visitors (anonymous): 1200 req/min per IP (high limit for shared networks)
   - Gemma models: 25 req/min per IP
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
    const ip = getClientIp(req);
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

function createSmartApiRateLimiter() {
  const hits = new Map<string, { count: number; resetTime: number }>();

  // Cleanup stale records every 3 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, val] of hits.entries()) {
      if (val.resetTime <= now) hits.delete(key);
    }
  }, 180000);

  return (req: Request, res: Response, next: () => void) => {
    const authUserId = resolveAuthUserId(req);
    const now = Date.now();
    let key: string;
    let limit: number;

    if (authUserId) {
      key = `user:${authUserId}`;
      limit = 240; // 240 requests per minute per signed-in account
    } else {
      const ip = getClientIp(req);
      key = `ip:${String(ip).trim()}`;
      limit = 1200; // 1200 requests per minute for visitors on shared event/university networks
    }

    const record = hits.get(key);
    if (!record || record.resetTime <= now) {
      hits.set(key, { count: 1, resetTime: now + 60000 });
      return next();
    }

    record.count++;
    if (record.count > limit) {
      const retryAfterSec = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader('Retry-After', retryAfterSec);
      return res.status(429).json({
        error: authUserId
          ? 'Account rate limit exceeded (240 req/min). Please slow down and try again.'
          : 'Network rate limit exceeded (1200 req/min). Please slow down and try again.'
      });
    }

    next();
  };
}

// Global API rate limit: smart 240/min per account or 1200/min per IP
const globalApiLimiter = createSmartApiRateLimiter();
app.use('/api/', globalApiLimiter);

// Admin login rate limit: 10 attempts per minute per IP
const adminLoginLimiter = createRateLimiter({
  windowMs: 60000,
  max: 10,
  message: 'Too many admin login attempts. Please wait 1 minute.'
});

// Reports: 10 per IP per 10 minutes
const reportLimiter = createRateLimiter({
  windowMs: 10 * 60 * 1000,
  max: 10,
  message: 'Too many reports sent. Please wait a few minutes.'
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

export type StorageMode = 'firestore' | 'disk' | 'memory';

export function isTestEnv(): boolean {
  return process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
}

export function assertStorageModeForTest(mode: StorageMode): void {
  if (isTestEnv() && mode === 'firestore') {
    throw new Error('FATAL GUARD VIOLATION: Test run cannot resolve storageMode to "firestore". Tests must run against isolated in-memory store only.');
  }
}

export let storageMode: StorageMode = isTestEnv() ? 'memory' : 'disk';

export function getStorageMode(): StorageMode {
  return storageMode;
}

const firestoreUnsubscribers: Array<() => void> = [];

const DATA_FILE = path.join(__dirname, '.kwegatta_store.json');

export interface TeamMember {
  id: string;
  name: string;
  title: string;
  line1: string;
  line2: string;
  github?: string | null;
  linkedin?: string | null;
  bio?: string;
  x?: string | null;
  website?: string | null;
  whatsapp?: string | null;
  linked_profile_id?: string | null;
  photo?: string | null;
  order: number;
  hidden: boolean;
  show_title?: boolean;
  show_line1?: boolean;
  show_bio?: boolean;
  show_linkedin?: boolean;
  show_x?: boolean;
  show_website?: boolean;
  show_whatsapp?: boolean;
  team_since?: string | null;
  show_since?: boolean;
  created_at?: string;
  updated_at?: string;
}

export const INITIAL_TEAM_MEMBERS: TeamMember[] = [
  {
    id: 'team-saifuddin',
    name: 'Saifuddin Ahmed',
    title: 'Team lead and engineering',
    line1: 'Software and AI Engineer • Systems Architect',
    line2: 'Future Stars Center for Development and Capacity Building',
    github: 'Saifuddin2Ahmed',
    linkedin: null,
    linked_profile_id: null,
    photo: null,
    order: 0,
    hidden: false
  },
  {
    id: 'team-abubaker',
    name: 'Abubaker Mohamed Adam',
    title: 'Community and NGO partnerships',
    line1: 'NGO volunteer',
    line2: 'Sub-Saharan College',
    github: 'abubakermohammed092077-bit',
    linkedin: null,
    linked_profile_id: null,
    photo: null,
    order: 1,
    hidden: false
  },
  {
    id: 'team-adinan',
    name: 'Adinan Juuko',
    title: 'Testing and quality',
    line1: 'Software Engineering',
    line2: 'Victoria University',
    github: 'Aditech-191',
    linkedin: null,
    linked_profile_id: null,
    photo: null,
    order: 2,
    hidden: false
  },
  {
    id: 'team-amme',
    name: 'Amme Patience Esther',
    title: 'Marketing and communications',
    line1: 'Bachelor of Marketing',
    line2: 'Makerere University Business School',
    github: null,
    linkedin: null,
    linked_profile_id: null,
    photo: null,
    order: 3,
    hidden: false
  },
  {
    id: 'team-mupole',
    name: 'Mupole Uwizeye Alexis',
    title: 'Product and data',
    line1: 'Business Computing',
    line2: 'Bugema University',
    github: 'Alexis-Mupole',
    linkedin: null,
    linked_profile_id: null,
    photo: null,
    order: 4,
    hidden: false
  },
  {
    id: 'team-nabagulanyi',
    name: 'Nabagulanyi Prossy Sherry',
    title: 'User research and outreach',
    line1: 'Student',
    line2: 'Makerere University Business School',
    github: null,
    linkedin: null,
    linked_profile_id: null,
    photo: null,
    order: 5,
    hidden: false
  },
  {
    id: 'team-ojambo',
    name: 'Ojambo Emmanuel',
    title: 'Business model and sustainability',
    line1: 'Accounting',
    line2: 'Makerere University Business School',
    github: null,
    linkedin: null,
    linked_profile_id: null,
    photo: null,
    order: 6,
    hidden: false
  }
];

interface StoreData {
  profiles: any[];
  follows: any[];
  matches: any[];
  notifications: any[];
  posts: any[];
  reports: any[];
  events: any[];
  event_questions: any[];
  event_guests: any[];
  event_checkins: any[];
  event_match_feedback: any[];
  pinned_announcement: any;
  admin_emails: string[];
  team: TeamMember[];
  team_details_enabled?: boolean;
  audit_log: Array<{
    id: string;
    timestamp: string;
    action: string;
    details: string;
    admin: string;
  }>;
  migrations?: Record<string, any>;
}

// Active admin session tokens with creation timestamps (emergency fallback passcode flow)
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

function getEnvAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
}

export function getAdminEmailsList(): string[] {
  const envEmails = getEnvAdminEmails();

  const storedEmails = Array.isArray(store.admin_emails)
    ? store.admin_emails.map((e: string) => String(e).trim().toLowerCase()).filter(Boolean)
    : [];

  const combined = new Set([...envEmails, ...storedEmails]);
  return Array.from(combined);
}

export function resolveAdminInfo(req: Request): { isAdmin: boolean; adminName: string; adminEmail: string } {
  // 1. Primary: the signed-in account's own email (from the verified ID token).
  // A profile's stored email is never used, because members can edit their profiles.
  // Emails added from the Admin panel also need a verified address, so nobody can
  // register an unverified account under an admin email that has not signed up yet.
  const authUser = (req as any).authUser as AuthUserData | undefined;
  if (authUser && authUser.email) {
    const userEmail = authUser.email.trim().toLowerCase();
    const envEmails = getEnvAdminEmails();
    const allowed = envEmails.includes(userEmail) || (authUser.email_verified === true && getAdminEmailsList().includes(userEmail));
    if (allowed) {
      return {
        isAdmin: true,
        adminName: authUser.name || authUser.email.split('@')[0] || 'Admin',
        adminEmail: userEmail
      };
    }
  }

  // 2. Emergency fallback: ADMIN_FALLBACK=true + session token
  const token = req.headers['x-admin-token'] as string;
  if (token && activeAdminTokens.has(token)) {
    if (process.env.ADMIN_FALLBACK === 'true') {
      const createdAt = activeAdminTokens.get(token)!;
      if (Date.now() - createdAt < TOKEN_TTL_MS) {
        return {
          isAdmin: true,
          adminName: 'Fallback Admin',
          adminEmail: 'fallback-admin@kwegatta.internal'
        };
      } else {
        activeAdminTokens.delete(token);
      }
    }
  }

  return {
    isAdmin: false,
    adminName: '',
    adminEmail: ''
  };
}

export function checkAdmin(req: Request): boolean {
  return resolveAdminInfo(req).isAdmin;
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

export function sanitizeHttpsUrl(val: any): string {
  if (typeof val !== 'string') return '';
  const trimmed = val.trim();
  if (/^https:\/\/[^\s]+$/i.test(trimmed)) {
    return trimmed.slice(0, 500);
  }
  return '';
}

export function sanitizeDomainUrl(val: any, allowedDomains: string[]): string {
  if (typeof val !== 'string') return '';
  const trimmed = val.trim();
  if (!trimmed) return '';
  try {
    const urlStr = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase();
    const isAllowed = allowedDomains.some(d => host === d.toLowerCase() || host.endsWith('.' + d.toLowerCase()));
    if (isAllowed) {
      return parsed.href.slice(0, 500);
    }
  } catch (_) {}
  return '';
}

export function sanitizeCustomLinks(arr: any): Array<{ label: string; url: string }> {
  if (!Array.isArray(arr)) return [];
  const results: Array<{ label: string; url: string }> = [];
  for (const item of arr) {
    if (results.length >= 3) break;
    if (!item || typeof item !== 'object') continue;
    const label = sanitizeText(item.label, 24);
    const rawUrl = typeof item.url === 'string' ? item.url.trim() : '';
    if (label && /^https:\/\/[^\s]+$/i.test(rawUrl)) {
      results.push({ label, url: rawUrl.slice(0, 500) });
    }
  }
  return results;
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

function resolveAvatar(incoming: any, existing: string = ''): string {
  if (incoming === undefined) return existing;
  if (typeof incoming === 'string' && incoming.trim().startsWith('/api/avatar/')) {
    return existing;
  }
  const sanitized = sanitizeAvatar(incoming);
  if (sanitized) return sanitized;
  return existing;
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
export function sanitizePublicProfile(p: any, callerAuthUid: string | null, isAdmin: boolean = false): any {
  if (!p) return null;
  const isSelf = Boolean(callerAuthUid && (p.account_uid === callerAuthUid || p.id === callerAuthUid));
  const canSeeEmail = isSelf || isAdmin;
  const isWhatsAppHidden = Boolean(p.hide_whatsapp && !isSelf);
  const canSeeWhatsApp = Boolean(callerAuthUid && !isWhatsAppHidden);

  const { account_uid, email, blocked_ids, privacy_accepted_at, privacy_version, notify_new_events, ...rest } = p;

  return {
    ...rest,
    ...(canSeeEmail && email ? { email } : {}),
    ...(isSelf ? { notify_new_events: getNewEventNotifyChoice(p) } : {}),
    ...(canSeeEmail && account_uid ? { account_uid } : {}),
    ...(isSelf && blocked_ids ? { blocked_ids } : {}),
    avatar: p.avatar && p.avatar.startsWith('data:') ? `/api/avatar/${p.id}` : (p.avatar || ''),
    whatsapp: canSeeWhatsApp ? (p.whatsapp || '') : '',
    has_whatsapp: Boolean(p.whatsapp && String(p.whatsapp).trim().length > 0),
    hide_whatsapp: Boolean(p.hide_whatsapp),
    followers_count: typeof p.followers_count === 'number' ? p.followers_count : ((store?.follows || []).filter((f: any) => f.following_id === p.id).length),
    following_count: typeof p.following_count === 'number' ? p.following_count : ((store?.follows || []).filter((f: any) => f.follower_id === p.id).length)
  };
}

export function sanitizePostForPublic(post: any, req: Request): any {
  if (!post) return post;
  const counts = { like: 0, launch: 0, love: 0, idea: 0 };
  if (post.reactions && typeof post.reactions === 'object') {
    for (const [k, v] of Object.entries(post.reactions)) {
      const num = Number(v) || 0;
      if (k === '👍' || k === 'like') counts.like += num;
      else if (k === '🚀' || k === 'launch') counts.launch += num;
      else if (k === '❤️' || k === 'love') counts.love += num;
      else if (k === '💡' || k === 'idea') counts.idea += num;
    }
  }
  const reactionsBy = post.reactions_by || {};
  for (const [, type] of Object.entries(reactionsBy)) {
    if (type === 'like') counts.like++;
    else if (type === 'launch') counts.launch++;
    else if (type === 'love') counts.love++;
    else if (type === 'idea') counts.idea++;
  }

  const authUserId = resolveAuthUserId(req);
  const myProfile = authUserId ? store.profiles.find((p: any) => p.account_uid === authUserId || p.id === authUserId) : null;
  const callerProfileId = myProfile?.id || authUserId;
  const my_reaction = callerProfileId ? (reactionsBy[callerProfileId] || null) : null;

  const { reactions_by, reactions, ...rest } = post;
  return {
    ...rest,
    reaction_counts: counts,
    my_reaction,
    comments: Array.isArray(post.comments) ? post.comments : []
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

function createInitialStore(demo: boolean = isDemoMode): StoreData {
  return {
    profiles: demo ? [...INITIAL_DEMO_MEMBERS] : [],
    follows: [],
    matches: demo ? [
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
    posts: demo ? [
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
    events: demo ? [
      {
        id: 'event-hackday-showcase',
        kind: 'event',
        title: 'Hack Day Kampala 2026 Showcase & Demo Day',
        description: 'Live product demonstrations, founder matchmaking, and networking with student builders and tech teams across Makerere, MUBS, and Kyambogo.',
        datetime: new Date(Date.now() + 86400000 * 5).toISOString(),
        location: 'Makerere Innovation Pod, Kampala',
        cover_image: '',
        registration_link: 'https://kwegatta.ai.studio/#/events',
        created_at: new Date(Date.now() - 3600000 * 24).toISOString(),
        published: true,
        attendee_ids: ['demo-amina', 'demo-brian', 'demo-joseph']
      },
      {
        id: 'opp-uganda-ai-grant',
        kind: 'opportunity',
        title: 'Uganda Open-Weight AI Grant (Cohort 2)',
        description: 'Up to $5,000 equity-free seed funding and compute credits for builder teams applying open-weight models to local agriculture, education, and fintech in Uganda.',
        opportunity_type: 'Grant',
        deadline: new Date(Date.now() + 86400000 * 18).toISOString(),
        link: 'https://kwegatta.ai.studio',
        created_at: new Date(Date.now() - 3600000 * 12).toISOString(),
        published: true,
        attendee_ids: ['demo-grace', 'demo-peter']
      },
      {
        id: 'opp-climate-hackathon',
        kind: 'opportunity',
        title: 'Kampala Clean Energy & Solar Sprint',
        description: '48-hour hardware and IoT sprint focused on solar energy monitoring, clean cooking tech, and urban sustainability.',
        opportunity_type: 'Hackathon',
        deadline: new Date(Date.now() + 86400000 * 10).toISOString(),
        link: 'https://kwegatta.ai.studio',
        created_at: new Date(Date.now() - 3600000 * 6).toISOString(),
        published: true,
        attendee_ids: ['demo-peter', 'demo-amina']
      }
    ] : [],
    event_questions: [],
    event_guests: [],
    event_checkins: [],
    event_match_feedback: [],
    pinned_announcement: null,
    admin_emails: [],
    team: [...INITIAL_TEAM_MEMBERS],
    team_details_enabled: false,
    audit_log: [
      {
        id: 'audit-init',
        timestamp: new Date().toISOString(),
        action: 'SYSTEM_BOOT',
        details: demo ? 'Kwegatta system loaded in Demo Mode with sample cohort.' : 'Kwegatta system loaded in clean production state.',
        admin: 'system'
      }
    ],
    migrations: {}
  };
}

function loadStore(): StoreData {
  if (isTestEnv()) {
    storageMode = 'memory';
    return createInitialStore(true);
  }

  try {
    if (fs.existsSync(DATA_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      if (parsed.profiles && Array.isArray(parsed.profiles)) {
        if (!parsed.reports || !Array.isArray(parsed.reports)) {
          parsed.reports = [];
        }
        if (!parsed.events || !Array.isArray(parsed.events)) {
          parsed.events = [];
        } else {
          // One-time sanitization: purge any leftover test events with test author
          parsed.events = parsed.events.filter((e: any) => e.author_id !== 'test-user-unapproved-author');
        }
        if (!parsed.event_questions || !Array.isArray(parsed.event_questions)) {
          parsed.event_questions = [];
        }
        if (!parsed.event_guests || !Array.isArray(parsed.event_guests)) {
          parsed.event_guests = [];
        }
        if (!parsed.event_checkins || !Array.isArray(parsed.event_checkins)) {
          parsed.event_checkins = [];
        }
        if (!parsed.admin_emails || !Array.isArray(parsed.admin_emails)) {
          parsed.admin_emails = [];
        }
        if (parsed.pinned_announcement === undefined) {
          parsed.pinned_announcement = null;
        }
        if (!parsed.team || !Array.isArray(parsed.team) || parsed.team.length === 0) {
          parsed.team = [...INITIAL_TEAM_MEMBERS];
        }
        if (typeof parsed.team_details_enabled !== 'boolean') {
          parsed.team_details_enabled = false;
        }
        if (!parsed.audit_log || !Array.isArray(parsed.audit_log)) {
          parsed.audit_log = [];
        }
        if (!parsed.migrations || typeof parsed.migrations !== 'object') {
          parsed.migrations = {};
        }
        // Cleanup any security test post with empty body or anonymous author
        if (Array.isArray(parsed.posts)) {
          parsed.posts = parsed.posts.filter((p: any) => p && p.body && String(p.body).trim().length > 0 && p.author_id !== 'anonymous');
        }
        if (!parsed.profiles || !Array.isArray(parsed.profiles) || parsed.profiles.length === 0) {
          parsed.profiles = [...INITIAL_DEMO_MEMBERS];
        }
        if (!parsed.matches || !Array.isArray(parsed.matches) || parsed.matches.length === 0) {
          parsed.matches = [
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
          ];
        }
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to read persistent store, initializing fresh store:', err);
  }

  const initial = createInitialStore(isDemoMode);
  saveStore(initial);
  return initial;
}

function saveStore(storeData: StoreData) {
  if (isTestEnv() || storageMode === 'memory') {
    return;
  }
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(storeData, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to write store file:', err);
  }
}

export let store: StoreData = loadStore();

/* =========================================================================
   FIRESTORE PERSISTENCE HELPERS & SNAPSHOT REAL-TIME LISTENERS
   Protect the free quota: All reads served from memory; all writes to Firestore.
   Snapshot listeners keep memory synchronized with Firestore across all instances.
   ========================================================================= */

export type StorageWriter = (collectionName: string, id: string, docData: any) => Promise<void> | void;
let testStorageWriter: StorageWriter | null = null;

export function setTestStorageWriter(writer: StorageWriter | null): void {
  if (isTestEnv()) {
    testStorageWriter = writer;
  }
}

async function persistDoc(collectionName: string, id: string, docData: any): Promise<void> {
  assertStorageModeForTest(storageMode);
  const cleanData = stripUndefined(docData);

  if (isTestEnv() && testStorageWriter) {
    await testStorageWriter(collectionName, id, cleanData);
    return;
  }

  if (storageMode === 'firestore' && firestoreDb) {
    if (isTestEnv()) {
      throw new Error('FATAL GUARD VIOLATION: persistDoc cannot write to Firestore in test environment!');
    }
    try {
      await firestoreDb.collection(collectionName).doc(id).set(cleanData);
    } catch (err: any) {
      console.error(`[Firestore] Failed to write document ${id} to ${collectionName}:`, err?.message || err);
      throw err;
    }
  } else if (storageMode === 'disk') {
    saveStore(store);
  }
}

async function removeDoc(collectionName: string, id: string): Promise<void> {
  assertStorageModeForTest(storageMode);
  if (storageMode === 'firestore' && firestoreDb) {
    if (isTestEnv()) {
      throw new Error('FATAL GUARD VIOLATION: removeDoc cannot write to Firestore in test environment!');
    }
    try {
      await firestoreDb.collection(collectionName).doc(id).delete();
    } catch (err: any) {
      console.error(`[Firestore] Failed to delete document ${id} from ${collectionName}:`, err?.message || err);
      throw err;
    }
  } else if (storageMode === 'disk') {
    saveStore(store);
  }
}

async function batchPersistDocs(collectionName: string, items: Array<{ id: string; data: any }>): Promise<void> {
  assertStorageModeForTest(storageMode);
  if (isTestEnv() && testStorageWriter) {
    for (const item of items) {
      await testStorageWriter(collectionName, item.id, stripUndefined(item.data));
    }
    return;
  }
  if (storageMode === 'firestore' && firestoreDb) {
    if (isTestEnv()) {
      throw new Error('FATAL GUARD VIOLATION: batchPersistDocs cannot write to Firestore in test environment!');
    }
    const BATCH_SIZE = 400;
    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const batch = firestoreDb.batch();
      const chunk = items.slice(i, i + BATCH_SIZE);
      for (const item of chunk) {
        const ref = firestoreDb.collection(collectionName).doc(item.id);
        batch.set(ref, stripUndefined(item.data));
      }
      await batch.commit();
    }
  } else if (storageMode === 'disk') {
    saveStore(store);
  }
}

async function batchRemoveDocs(collectionName: string, ids: string[]): Promise<void> {
  assertStorageModeForTest(storageMode);
  if (storageMode === 'firestore' && firestoreDb) {
    if (isTestEnv()) {
      throw new Error('FATAL GUARD VIOLATION: batchRemoveDocs cannot write to Firestore in test environment!');
    }
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
  } else if (storageMode === 'disk') {
    saveStore(store);
  }
}

/**
 * Audited list of every Firestore collection written via persistDoc, removeDoc,
 * batchPersistDocs, or batchRemoveDocs. Every collection in PERSISTED_COLLECTIONS
 * has a real-time onSnapshot listener in setupFirestoreListeners(), except those in
 * WRITE_ONLY_COLLECTIONS, which are read once at boot.
 */
export const PERSISTED_COLLECTIONS = [
  'profiles',
  'posts',
  'follows',
  'matches',
  'notifications',
  'sessions',
  'audit_log',
  'reports',
  'team',
  'events',
  'event_guests',
  'event_questions',
  'event_checkins',
  'event_match_feedback',
  'migrations'
] as const;

// Collections written with persistDoc but not loaded by a listener.
// "migrations" holds flag and settings documents that are read once at boot (loadStoredAdminEmails, migration checks).
export const WRITE_ONLY_COLLECTIONS: readonly string[] = ['migrations'] as const;

let usingMockFirestoreInTest = false;
export function setMockFirestoreDbForTest(mockDb: any): void {
  if (isTestEnv()) {
    firestoreDb = mockDb;
    usingMockFirestoreInTest = Boolean(mockDb);
  }
}

export async function setupFirestoreListeners(customDbForTest?: any): Promise<void> {
  assertStorageModeForTest(storageMode);
  if (isTestEnv() && customDbForTest) {
    firestoreDb = customDbForTest;
    usingMockFirestoreInTest = true;
  }
  if (isTestEnv() && !usingMockFirestoreInTest) {
    throw new Error('FATAL GUARD VIOLATION: Snapshot listeners must not be started in test environment.');
  }
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

  // 9. Team listener (Seeded once in Firestore if collection is empty)
  initialLoadPromises.push(new Promise((resolve) => {
    let initial = true;
    const unsub = firestoreDb!.collection('team').onSnapshot((snap) => {
      const list: any[] = [];
      snap.forEach(doc => {
        const d = doc.data();
        const docId = d.id || doc.id;
        if (docId === '__team_settings__' || d.is_settings) {
          store.team_details_enabled = Boolean(d.team_details_enabled);
        } else {
          list.push({ ...d, id: docId });
        }
      });
      if (list.length > 0) {
        store.team = list.sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0));
      } else {
        store.team = [...INITIAL_TEAM_MEMBERS];
        if (!isTestEnv()) {
          INITIAL_TEAM_MEMBERS.forEach(m => {
            firestoreDb!.collection('team').doc?.(m.id)?.set?.(m)?.catch?.(() => {});
          });
        }
      }
      if (initial) { initial = false; resolve(); }
    }, (err) => {
      console.error('[Firestore] team listener error:', err?.message || err);
      if (!store.team || store.team.length === 0) store.team = [...INITIAL_TEAM_MEMBERS];
      if (initial) { initial = false; resolve(); }
    });
    firestoreUnsubscribers.push(unsub);
  }));

  // 10. Events listener
  initialLoadPromises.push(new Promise((resolve) => {
    let initial = true;
    const unsub = firestoreDb!.collection('events').onSnapshot((snap) => {
      const list: any[] = [];
      snap.forEach(doc => {
        const d = doc.data();
        list.push({ ...d, id: d.id || doc.id });
      });
      store.events = list;
      if (initial) { initial = false; resolve(); }
    }, (err) => {
      console.error('[Firestore] events listener error:', err?.message || err);
      if (initial) { initial = false; resolve(); }
    });
    firestoreUnsubscribers.push(unsub);
  }));

  // 11. Event Guests listener
  initialLoadPromises.push(new Promise((resolve) => {
    let initial = true;
    const unsub = firestoreDb!.collection('event_guests').onSnapshot((snap) => {
      const list: any[] = [];
      snap.forEach(doc => {
        const d = doc.data();
        list.push({ ...d, id: d.id || doc.id });
      });
      store.event_guests = list;
      if (initial) { initial = false; resolve(); }
    }, (err) => {
      console.error('[Firestore] event_guests listener error:', err?.message || err);
      if (initial) { initial = false; resolve(); }
    });
    firestoreUnsubscribers.push(unsub);
  }));

  // 12. Event Questions listener
  initialLoadPromises.push(new Promise((resolve) => {
    let initial = true;
    const unsub = firestoreDb!.collection('event_questions').onSnapshot((snap) => {
      const list: any[] = [];
      snap.forEach(doc => {
        const d = doc.data();
        list.push({ ...d, id: d.id || doc.id });
      });
      store.event_questions = list;
      if (initial) { initial = false; resolve(); }
    }, (err) => {
      console.error('[Firestore] event_questions listener error:', err?.message || err);
      if (initial) { initial = false; resolve(); }
    });
    firestoreUnsubscribers.push(unsub);
  }));

  // 13. Event Check-ins listener
  initialLoadPromises.push(new Promise((resolve) => {
    let initial = true;
    const unsub = firestoreDb!.collection('event_checkins').onSnapshot((snap) => {
      const list: any[] = [];
      snap.forEach(doc => {
        const d = doc.data();
        list.push({ ...d, id: d.id || doc.id });
      });
      store.event_checkins = list;
      if (initial) { initial = false; resolve(); }
    }, (err) => {
      console.error('[Firestore] event_checkins listener error:', err?.message || err);
      if (initial) { initial = false; resolve(); }
    });
    firestoreUnsubscribers.push(unsub);
  }));

  // 14. Event Match Feedback listener
  initialLoadPromises.push(new Promise((resolve) => {
    let initial = true;
    const unsub = firestoreDb!.collection('event_match_feedback').onSnapshot((snap) => {
      const list: any[] = [];
      snap.forEach(doc => {
        const d = doc.data();
        list.push({ ...d, id: d.id || doc.id });
      });
      store.event_match_feedback = list;
      if (initial) { initial = false; resolve(); }
    }, (err) => {
      console.error('[Firestore] event_match_feedback listener error:', err?.message || err);
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
    if (firestoreDb && !isTestEnv()) {
      firestoreDb.collection('profiles').doc(legacyId).delete().catch(() => {});
    }
  }

  console.log(`[Storage] Cloud Firestore real-time snapshot sync operational.`);
  console.log(`[Storage] Warm cache: ${store.profiles.length} profiles, ${store.posts.length} posts, ${store.matches.length} matches, ${(store.events || []).length} events.`);
}

export async function initStorage(mockDbForTest?: any): Promise<void> {
  if (isTestEnv()) {
    storageMode = 'memory';
    assertStorageModeForTest(storageMode);
    if (mockDbForTest) {
      try {
        await setupFirestoreListeners(mockDbForTest);
        await runSaifuddinProfileMigration();
        await runSaifuddinProfileMigrationV2();
        await runSaifuddinProfileMigrationV3();
        await cleanupTestEvents();
        await publishExistingPendingEvents();
      } finally {
        setMockFirestoreDbForTest(null);
      }
      return;
    }
    console.log('[Storage] Test environment detected: isolated in-memory store active (storageMode: memory).');
    return;
  }

  assertStorageModeForTest(storageMode);
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
    firestoreDb.settings({ ignoreUndefinedProperties: true });
    try {
      adminAuth = getAdminAuth(fbApp);
      console.log(`✅ [Firebase Admin] Auth initialized successfully for project "${FIREBASE_PROJECT_ID}"`);
    } catch (authInitErr: any) {
      if (!isTestEnv()) {
        console.error('ERROR: [Firebase Admin] adminAuth failed to initialise at startup outside of tests:', authInitErr?.message || authInitErr);
      } else {
        console.warn(`[Firebase Admin] Auth initialization warning:`, authInitErr?.message || authInitErr);
      }
    }
  } catch (err: any) {
    if (!isTestEnv()) {
      console.error('ERROR: [Firebase Admin] adminAuth failed to initialise at startup outside of tests:', err?.message || err);
    }
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

  if (!adminAuth && !isTestEnv()) {
    console.error('ERROR: [Firebase Admin] adminAuth is unavailable outside of tests. Every request with a token will be treated as unauthenticated.');
  }

  try {
    const probeTimeoutMs = isProduction ? 8000 : 1200;
    const probePromise = firestoreDb.collection('profiles').limit(1).get();
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`Cloud Firestore connection probe timed out after ${probeTimeoutMs}ms`)), probeTimeoutMs)
    );
    await Promise.race([probePromise, timeoutPromise]);

    console.log(`✅ [Storage] Successfully connected to Cloud Firestore (Project: ${FIREBASE_PROJECT_ID}, Region: us-west1, Database: (default))`);
    assertStorageModeForTest('firestore');
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

  await loadStoredAdminEmails();

  // One-time profile migrations (v1, v2, v3) and test events cleanup run after the
  // server starts listening, so they do not add to cold start. Each is flag-guarded.
  void (async () => {
    try {
      await runSaifuddinProfileMigration();
      await runSaifuddinProfileMigrationV2();
      await runSaifuddinProfileMigrationV3();
      await cleanupTestEvents();
      await publishExistingPendingEvents();
    } catch (mErr: any) {
      console.warn('[Migration/Cleanup] Notice during migrations or cleanup:', mErr?.message || mErr);
    }
  })();
}

/* Admin emails added from the Admin panel are kept in one settings document. */
const ADMIN_EMAILS_SETTINGS_DOC = 'admin_emails_settings';

async function loadStoredAdminEmails(): Promise<void> {
  if (storageMode !== 'firestore' || !firestoreDb) return;
  try {
    const snap = await firestoreDb.collection('migrations').doc(ADMIN_EMAILS_SETTINGS_DOC).get();
    const emails = snap.exists ? snap.data()?.emails : null;
    if (Array.isArray(emails)) {
      store.admin_emails = emails.map((e: unknown) => String(e).trim().toLowerCase()).filter(Boolean);
    }
  } catch (err: any) {
    console.warn('[Admin] Could not load stored admin emails:', err?.message || err);
  }
}

async function persistStoredAdminEmails(): Promise<void> {
  if (storageMode === 'disk') {
    saveStore(store);
    return;
  }
  await persistDoc('migrations', ADMIN_EMAILS_SETTINGS_DOC, {
    id: ADMIN_EMAILS_SETTINGS_DOC,
    emails: store.admin_emails || [],
    updated_at: new Date().toISOString()
  });
}

/* =========================================================================
   ONE-TIME PROFILE MIGRATION
   Target: member profile with GitHub username "Saifuddin2Ahmed" and account email in ADMIN_EMAILS.
   Preserves: photo, WhatsApp number, visibility settings, roles, account.
   Records execution in Firestore and local store so it never runs twice or overwrites later edits.
   Clears cached matches for this member so they are recalculated from the new profile.
   ========================================================================= */
export const SAIFUDDIN_PROFILE_MIGRATION_FLAG = 'saifuddin_profile_migration_v1';

export async function runSaifuddinProfileMigration(): Promise<boolean> {
  // Flag check: stops it running twice or overwriting later edits
  if (store.migrations && store.migrations[SAIFUDDIN_PROFILE_MIGRATION_FLAG]?.completed) {
    return false;
  }
  if (storageMode === 'firestore' && firestoreDb) {
    try {
      const docSnap = await firestoreDb.collection('migrations').doc(SAIFUDDIN_PROFILE_MIGRATION_FLAG).get();
      if (docSnap.exists && docSnap.data()?.completed) {
        if (!store.migrations) store.migrations = {};
        store.migrations[SAIFUDDIN_PROFILE_MIGRATION_FLAG] = { completed: true };
        return false;
      }
    } catch (_) {}
  }

  const adminEmails = getAdminEmailsList().map(e => e.toLowerCase());

  // Find target member profile in memory store
  let target: any = (store.profiles || []).find((p: any) => {
    const isGh = p.github && String(p.github).trim().toLowerCase() === 'saifuddin2ahmed';
    const isEmail = p.email && adminEmails.includes(String(p.email).trim().toLowerCase());
    return isGh && isEmail;
  });

  // If not found by direct email, check account_uid via adminAuth if available
  if (!target && adminAuth) {
    for (const p of (store.profiles || [])) {
      if (p.github && String(p.github).trim().toLowerCase() === 'saifuddin2ahmed' && p.account_uid) {
        try {
          const u = await adminAuth.getUser(p.account_uid);
          if (u.email && adminEmails.includes(u.email.toLowerCase())) {
            target = p;
            break;
          }
        } catch (_) {}
      }
    }
  }

  // If not found in memory store and in firestore mode, query Firestore
  if (!target && storageMode === 'firestore' && firestoreDb) {
    try {
      const snap = await firestoreDb.collection('profiles').where('github', '==', 'Saifuddin2Ahmed').get();
      for (const doc of snap.docs) {
        const d = doc.data();
        let email = d.email;
        if (!email && d.account_uid && adminAuth) {
          try {
            const u = await adminAuth.getUser(d.account_uid);
            email = u.email;
          } catch (_) {}
        }
        if (email && adminEmails.includes(email.toLowerCase())) {
          target = { ...d, id: doc.id };
          break;
        }
      }
    } catch (_) {}
  }

  if (!target) {
    return false;
  }

  // Apply updates exactly as requested without Gemma processing and without touching photo, WhatsApp, visibility, roles, account
  target.headline = 'Software and AI engineer building for communities';
  target.bio = 'Electronic control engineer and AI researcher with five years of software development, building intelligent systems for businesses and communities across Africa and the Middle East. I focus on solutions that keep working without constant internet, and I created Kwegatta.';
  target.offers = 'Software and AI engineering, cloud and ERP systems, offline-first solutions for remote communities, taking a product from idea to launch';
  target.needs = 'Universities, NGOs and communities to pilot Kwegatta, plus designers and community organisers';
  target.teaches = 'Python, AI and deep learning foundations, building with open models, cloud deployment';
  target.learns = 'Product design, growth and community building';
  target.location = 'Kampala';
  target.city = 'Kampala';
  target.linkedin = 'https://www.linkedin.com/in/saifuddin2ahmed';
  target.github = 'Saifuddin2Ahmed';
  target.website = 'https://otwox.com/en/about-us/founder';
  target.twitter = 'https://x.com/Saifuddin1Ahmed';
  target.instagram = 'https://www.instagram.com/saifuddin1ahmed';
  target.facebook = 'https://www.facebook.com/Saifuddin2Ahmed';
  target.huggingface = 'https://huggingface.co/saifuddin2ahmed';
  target.kaggle = 'https://www.kaggle.com/saifuddinahmed';
  target.gitlab = 'https://gitlab.com/saifuddinahmed';
  target.google_play = 'https://play.google.com/store/apps/dev?id=6759566582761793518';
  target.google_dev = 'https://g.dev/SaifuddinAhmed';
  target.ieee = 'https://ieee-collabratec.ieee.org/app/p/SaifuddinAhmed';
  target.updated_at = new Date().toISOString();

  // Save to memory store
  const idx = store.profiles.findIndex((p: any) => p.id === target.id);
  if (idx >= 0) {
    store.profiles[idx] = target;
  } else {
    store.profiles.push(target);
  }

  // Persist updated profile
  await persistDoc('profiles', target.id, target);

  // Clear cached matches for this member so they are recalculated from the new profile
  const memberId = target.id;
  store.matches = store.matches.filter((m: any) => m.a_id !== memberId && m.b_id !== memberId);
  if (storageMode === 'firestore' && firestoreDb) {
    try {
      const snapA = await firestoreDb.collection('matches').where('a_id', '==', memberId).get();
      const snapB = await firestoreDb.collection('matches').where('b_id', '==', memberId).get();
      const batch = firestoreDb.batch();
      snapA.forEach(doc => batch.delete(doc.ref));
      snapB.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    } catch (_) {}
  }

  // Record in Firestore and local store that migration has run, preventing it from running twice
  const record = {
    completed: true,
    target_id: memberId,
    migrated_at: new Date().toISOString()
  };
  if (!store.migrations) store.migrations = {};
  store.migrations[SAIFUDDIN_PROFILE_MIGRATION_FLAG] = record;

  if (storageMode === 'disk') {
    saveStore(store);
  }
  if (storageMode === 'firestore' && firestoreDb) {
    try {
      await firestoreDb.collection('migrations').doc(SAIFUDDIN_PROFILE_MIGRATION_FLAG).set(record);
    } catch (e) {
      console.warn('[Migration] Warning persisting migration flag in Firestore:', e);
    }
  }

  console.log(`[Migration] Profile migration ${SAIFUDDIN_PROFILE_MIGRATION_FLAG} successfully executed for member ${target.name} (${target.id})`);
  return true;
}

export const SAIFUDDIN_PROFILE_MIGRATION_V2_FLAG = 'saifuddin_profile_migration_v2';

export async function runSaifuddinProfileMigrationV2(): Promise<boolean> {
  // Flag check: stops it running twice or overwriting later edits
  if (store.migrations && store.migrations[SAIFUDDIN_PROFILE_MIGRATION_V2_FLAG]?.completed) {
    return false;
  }
  if (storageMode === 'firestore' && firestoreDb) {
    try {
      const docSnap = await firestoreDb.collection('migrations').doc(SAIFUDDIN_PROFILE_MIGRATION_V2_FLAG).get();
      if (docSnap.exists && docSnap.data()?.completed) {
        if (!store.migrations) store.migrations = {};
        store.migrations[SAIFUDDIN_PROFILE_MIGRATION_V2_FLAG] = { completed: true };
        return false;
      }
    } catch (_) {}
  }

  const adminEmails = getAdminEmailsList().map(e => e.toLowerCase());

  // Find target member profile in memory store
  let target: any = (store.profiles || []).find((p: any) => {
    const isGh = p.github && String(p.github).trim().toLowerCase() === 'saifuddin2ahmed';
    const isEmail = p.email && adminEmails.includes(String(p.email).trim().toLowerCase());
    return isGh && isEmail;
  });

  // If not found by direct email, check account_uid via adminAuth if available
  if (!target && adminAuth) {
    for (const p of (store.profiles || [])) {
      if (p.github && String(p.github).trim().toLowerCase() === 'saifuddin2ahmed' && p.account_uid) {
        try {
          const u = await adminAuth.getUser(p.account_uid);
          if (u.email && adminEmails.includes(u.email.toLowerCase())) {
            target = p;
            break;
          }
        } catch (_) {}
      }
    }
  }

  // If not found in memory store and in firestore mode, query Firestore
  if (!target && storageMode === 'firestore' && firestoreDb) {
    try {
      const snap = await firestoreDb.collection('profiles').where('github', '==', 'Saifuddin2Ahmed').get();
      for (const doc of snap.docs) {
        const d = doc.data();
        let email = d.email;
        if (!email && d.account_uid && adminAuth) {
          try {
            const u = await adminAuth.getUser(d.account_uid);
            email = u.email;
          } catch (_) {}
        }
        if (email && adminEmails.includes(email.toLowerCase())) {
          target = { ...d, id: doc.id };
          break;
        }
      }
    } catch (_) {}
  }

  if (!target) {
    return false;
  }

  // Append one sentence to the end of the bio, only if it is not already there:
  const degreeSentence = 'B.Sc. (Honours) in Electronic Control Engineering, Al Neelain University.';
  const currentBio = target.bio || '';
  if (!currentBio.includes(degreeSentence)) {
    target.bio = currentBio.trim() ? `${currentBio.trim()} ${degreeSentence}` : degreeSentence;
  }

  // Replace the tags with exactly: software-engineering, ai, open-models, offline-first, cloud, erp, community-tech, kampala
  target.tags = [
    'software-engineering',
    'ai',
    'open-models',
    'offline-first',
    'cloud',
    'erp',
    'community-tech',
    'kampala'
  ];

  // Replace the "Core competencies" / skills text with:
  // "Software architecture, Offline-first systems, Cloud & ERP, Open-weight AI, Community engineering"
  target.skills = [
    'Software architecture',
    'Offline-first systems',
    'Cloud & ERP',
    'Open-weight AI',
    'Community engineering'
  ];

  target.updated_at = new Date().toISOString();

  // Save to memory store
  const idx = store.profiles.findIndex((p: any) => p.id === target.id);
  if (idx >= 0) {
    store.profiles[idx] = target;
  } else {
    store.profiles.push(target);
  }

  // Persist updated profile
  await persistDoc('profiles', target.id, target);

  // Clear cached matches for this member so they are recalculated from the new profile
  const memberId = target.id;
  store.matches = store.matches.filter((m: any) => m.a_id !== memberId && m.b_id !== memberId);
  if (storageMode === 'firestore' && firestoreDb) {
    try {
      const snapA = await firestoreDb.collection('matches').where('a_id', '==', memberId).get();
      const snapB = await firestoreDb.collection('matches').where('b_id', '==', memberId).get();
      const batch = firestoreDb.batch();
      snapA.forEach(doc => batch.delete(doc.ref));
      snapB.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
    } catch (_) {}
  }

  // Record in Firestore and local store that migration has run, preventing it from running twice
  const record = {
    completed: true,
    target_id: memberId,
    migrated_at: new Date().toISOString()
  };
  if (!store.migrations) store.migrations = {};
  store.migrations[SAIFUDDIN_PROFILE_MIGRATION_V2_FLAG] = record;

  if (storageMode === 'disk') {
    saveStore(store);
  }
  if (storageMode === 'firestore' && firestoreDb) {
    try {
      await firestoreDb.collection('migrations').doc(SAIFUDDIN_PROFILE_MIGRATION_V2_FLAG).set(record);
    } catch (e) {
      console.warn('[Migration] Warning persisting migration flag v2 in Firestore:', e);
    }
  }

  console.log(`[Migration] Profile migration ${SAIFUDDIN_PROFILE_MIGRATION_V2_FLAG} successfully executed for member ${target.name} (${target.id})`);
  return true;
}

export const SAIFUDDIN_PROFILE_MIGRATION_V3_FLAG = 'saifuddin_profile_migration_v3';

export async function runSaifuddinProfileMigrationV3(): Promise<boolean> {
  // Flag check: stops it running twice or overwriting later edits
  if (store.migrations && store.migrations[SAIFUDDIN_PROFILE_MIGRATION_V3_FLAG]?.completed) {
    return false;
  }
  if (storageMode === 'firestore' && firestoreDb) {
    try {
      const docSnap = await firestoreDb.collection('migrations').doc(SAIFUDDIN_PROFILE_MIGRATION_V3_FLAG).get();
      if (docSnap.exists && docSnap.data()?.completed) {
        if (!store.migrations) store.migrations = {};
        store.migrations[SAIFUDDIN_PROFILE_MIGRATION_V3_FLAG] = { completed: true };
        return false;
      }
    } catch (_) {}
  }

  const adminEmails = getAdminEmailsList().map(e => e.toLowerCase());

  // Find target member profile in memory store
  let target: any = (store.profiles || []).find((p: any) => {
    const isGh = p.github && String(p.github).trim().toLowerCase() === 'saifuddin2ahmed';
    const isEmail = p.email && adminEmails.includes(String(p.email).trim().toLowerCase());
    return isGh && isEmail;
  });

  // If not found by direct email, check account_uid via adminAuth if available
  if (!target && adminAuth) {
    for (const p of (store.profiles || [])) {
      if (p.github && String(p.github).trim().toLowerCase() === 'saifuddin2ahmed' && p.account_uid) {
        try {
          const u = await adminAuth.getUser(p.account_uid);
          if (u.email && adminEmails.includes(u.email.toLowerCase())) {
            target = p;
            break;
          }
        } catch (_) {}
      }
    }
  }

  // If not found in memory store and in firestore mode, query Firestore
  if (!target && storageMode === 'firestore' && firestoreDb) {
    try {
      const snap = await firestoreDb.collection('profiles').where('github', '==', 'Saifuddin2Ahmed').get();
      for (const doc of snap.docs) {
        const d = doc.data();
        let email = d.email;
        if (!email && d.account_uid && adminAuth) {
          try {
            const u = await adminAuth.getUser(d.account_uid);
            email = u.email;
          } catch (_) {}
        }
        if (email && adminEmails.includes(email.toLowerCase())) {
          target = { ...d, id: doc.id };
          break;
        }
      }
    } catch (_) {}
  }

  // Part 9a: Touch nothing else. Do not set the flag if the profile is not found.
  if (!target) {
    return false;
  }

  // Set skills to an empty array. Touch nothing else.
  target.skills = [];
  target.updated_at = new Date().toISOString();

  // Save to memory store
  const idx = store.profiles.findIndex((p: any) => p.id === target.id);
  if (idx >= 0) {
    store.profiles[idx] = target;
  } else {
    store.profiles.push(target);
  }

  // Persist updated profile
  await persistDoc('profiles', target.id, target);

  // Record in Firestore and local store that migration has run, preventing it from running twice
  const record = {
    completed: true,
    target_id: target.id,
    migrated_at: new Date().toISOString()
  };
  if (!store.migrations) store.migrations = {};
  store.migrations[SAIFUDDIN_PROFILE_MIGRATION_V3_FLAG] = record;

  if (storageMode === 'disk') {
    saveStore(store);
  }
  if (storageMode === 'firestore' && firestoreDb) {
    try {
      await firestoreDb.collection('migrations').doc(SAIFUDDIN_PROFILE_MIGRATION_V3_FLAG).set(record);
    } catch (e) {
      console.warn('[Migration] Warning persisting migration flag v3 in Firestore:', e);
    }
  }

  console.log(`[Migration] Profile migration ${SAIFUDDIN_PROFILE_MIGRATION_V3_FLAG} successfully executed for member ${target.name} (${target.id})`);
  return true;
}

/* =========================================================================
   ONE-TIME TEST EVENTS CLEANUP (Part 1 Release 1.3.3)
   Removes test events with author_id "test-user-unapproved-author" from both
   in-memory store and live Firestore database.
   Guarded by flag so it executes only once and touches nothing else.
   ========================================================================= */
export const CLEANUP_TEST_EVENTS_FLAG = 'cleanup_test_events_unapproved_author_v1';

let cleanupTestEventsHook: (() => void) | null = null;
export function setCleanupTestEventsHookForTest(hook: (() => void) | null): void {
  if (isTestEnv()) {
    cleanupTestEventsHook = hook;
  }
}

export async function cleanupTestEvents(): Promise<number> {
  if (isTestEnv() && cleanupTestEventsHook) {
    cleanupTestEventsHook();
  }
  // Flag check: stops it running twice or doing duplicate deletions
  if (store.migrations && store.migrations[CLEANUP_TEST_EVENTS_FLAG]?.completed) {
    return 0;
  }
  if (storageMode === 'firestore' && firestoreDb) {
    try {
      const docSnap = await firestoreDb.collection('migrations').doc(CLEANUP_TEST_EVENTS_FLAG).get();
      if (docSnap.exists && docSnap.data()?.completed) {
        if (!store.migrations) store.migrations = {};
        store.migrations[CLEANUP_TEST_EVENTS_FLAG] = { completed: true };
        return 0;
      }
    } catch (_) {}
  }

  const authorToDelete = 'test-user-unapproved-author';
  let removedCount = 0;

  // 1. Remove from in-memory store
  if (Array.isArray(store.events)) {
    const beforeCount = store.events.length;
    store.events = store.events.filter((e: any) => e.author_id !== authorToDelete);
    removedCount += beforeCount - store.events.length;
  }

  // 2. Remove from live Firestore database if connected
  if (storageMode === 'firestore' && firestoreDb) {
    try {
      const snap = await firestoreDb.collection('events').where('author_id', '==', authorToDelete).get();
      if (!snap.empty) {
        const batch = firestoreDb.batch();
        snap.forEach(doc => {
          batch.delete(doc.ref);
          removedCount++;
        });
        await batch.commit();
      }

      await firestoreDb.collection('migrations').doc(CLEANUP_TEST_EVENTS_FLAG).set({
        completed: true,
        removed_count: removedCount,
        timestamp: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('[Cleanup] Error deleting test events from Firestore:', err?.message || err);
    }
  }

  if (!store.migrations) store.migrations = {};
  store.migrations[CLEANUP_TEST_EVENTS_FLAG] = {
    completed: true,
    removed_count: removedCount,
    timestamp: new Date().toISOString()
  };

  if (storageMode === 'disk') {
    saveStore(store);
  }

  if (removedCount > 0) {
    console.log(`[Cleanup] Removed ${removedCount} test events for author "${authorToDelete}".`);
  }
  return removedCount;
}

/* =========================================================================
   ONE-TIME PENDING EVENTS PUBLISH MIGRATION (Part 4 Release 1.4.0)
   Publishes existing pending events, except any whose author no longer exists.
   ========================================================================= */
export const PUBLISH_PENDING_EVENTS_FLAG = 'publish_pending_events_v1';

export async function publishExistingPendingEvents(): Promise<number> {
  if (store.migrations && store.migrations[PUBLISH_PENDING_EVENTS_FLAG]?.completed) {
    return 0;
  }

  let publishedCount = 0;
  for (const ev of store.events || []) {
    if (ev.status === 'pending' || ev.published === false) {
      const authorExists = store.profiles.some((p: any) => p.id === ev.author_id || p.account_uid === ev.author_id);
      if (authorExists) {
        ev.status = 'published';
        ev.published = true;
        publishedCount++;
        if (storageMode === 'firestore' && firestoreDb) {
          await persistDoc('events', ev.id, ev);
        }
      }
    }
  }

  if (!store.migrations) store.migrations = {};
  store.migrations[PUBLISH_PENDING_EVENTS_FLAG] = {
    completed: true,
    published_count: publishedCount
  };

  if (storageMode === 'disk') saveStore(store);
  return publishedCount;
}

// Execute initial disk cleanup and pending event publishing on startup if not yet applied
if (!isTestEnv()) {
  cleanupTestEvents().catch(() => {});
  publishExistingPendingEvents().catch(() => {});
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
  if (!canClaimProfile(profile, authUserId, (req as any).authUser?.email)) {
    return res.status(403).json({ error: 'This profile belongs to a different email address' });
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

// Pair Match Cache: key(`${idA}_${idB}`) -> { versionA, versionB, result: { score: number; reason: string }, updatedAt }
export const matchPairCache = new Map<string, { versionA: string; versionB: string; result: { score: number; reason: string }; updatedAt: string }>();
export const MAX_PAIR_CACHE_SIZE = 5000;

export function getPairCacheKey(idA: string, idB: string): string {
  return [idA, idB].sort().join('_');
}

export function setPairCacheEntry(
  idA: string,
  idB: string,
  versionA: string,
  versionB: string,
  result: { score: number; reason: string },
  updatedAt?: string
) {
  const key = getPairCacheKey(idA, idB);
  if (!matchPairCache.has(key) && matchPairCache.size >= MAX_PAIR_CACHE_SIZE) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [k, v] of matchPairCache.entries()) {
      const t = new Date(v.updatedAt).getTime() || 0;
      if (t < oldestTime) {
        oldestTime = t;
        oldestKey = k;
      }
    }
    if (oldestKey) matchPairCache.delete(oldestKey);
  }
  matchPairCache.set(key, {
    versionA: String(versionA || ''),
    versionB: String(versionB || ''),
    result,
    updatedAt: updatedAt || new Date().toISOString()
  });
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

// Member Gemma Rate Limiter: 20 calls/minute, 300 calls/day per signed-in member
interface MemberGemmaRateRecord {
  minuteCount: number;
  minuteReset: number;
  dayCount: number;
  dayReset: number;
}
export const memberGemmaLimits = new Map<string, MemberGemmaRateRecord>();

export function checkMemberGemmaRateLimit(memberId: string): { allowed: boolean; error?: string; retryAfter?: number } {
  const now = Date.now();
  let record = memberGemmaLimits.get(memberId);
  if (!record) {
    record = {
      minuteCount: 0,
      minuteReset: now + 60 * 1000,
      dayCount: 0,
      dayReset: now + 24 * 60 * 60 * 1000
    };
    memberGemmaLimits.set(memberId, record);
  }

  if (now >= record.minuteReset) {
    record.minuteCount = 0;
    record.minuteReset = now + 60 * 1000;
  }

  if (now >= record.dayReset) {
    record.dayCount = 0;
    record.dayReset = now + 24 * 60 * 60 * 1000;
  }

  if (record.minuteCount >= 20) {
    const retryAfter = Math.ceil((record.minuteReset - now) / 1000);
    return {
      allowed: false,
      error: 'Rate limit exceeded: 20 calls per minute limit reached per member.',
      retryAfter
    };
  }

  if (record.dayCount >= 300) {
    const retryAfter = Math.ceil((record.dayReset - now) / 1000);
    return {
      allowed: false,
      error: 'Daily quota exceeded: 300 calls per day limit reached per member.',
      retryAfter
    };
  }

  record.minuteCount++;
  record.dayCount++;
  return { allowed: true };
}

// Allowed Task Names: No free-form prompts from browser
export const ALLOWED_GEMMA_TASKS = [
  'polish_profile',
  'match',
  'tag_post',
  'ask',
  'event_matches'
] as const;

export type GemmaTask = typeof ALLOWED_GEMMA_TASKS[number];

export function buildGemmaPrompt(task: GemmaTask, data: any): string {
  switch (task) {
    case 'polish_profile': {
      const { name = '', role = '', headline = '', offers = '', needs = '', skills = [] } = data || {};
      return `You are Kwegatta's profile assistant for the Kampala tech ecosystem.
Polish and structure this member's profile for peer learning and project collaboration.
Raw inputs:
- Name: ${name}
- Role: ${role}
- Headline: ${headline}
- What they offer / teach: ${offers}
- What they need / want to learn: ${needs}
- Skills: ${Array.isArray(skills) ? skills.join(', ') : skills}

Return ONLY this JSON, no other text:
{
  "headline": "<max 8 words summary>",
  "bio": "<2 sentences, maximum 45 words total, using only stated facts>",
  "tags": ["<3 to 6 short lowercase topic tags>"],
  "skills": ["<up to 6 concrete skills mentioned>"],
  "role": "<Founder | Business | Developer | Designer | Domain expert | Mentor | Student>"
}`;
    }
    case 'match': {
      const { me = {}, candidate = {}, candidates = [] } = data || {};
      if (Array.isArray(candidates) && candidates.length > 0) {
        return `You are Kwegatta's matchmaking engine in Kampala (MUBS x EIIC).
Target Member (ME):
Name: ${me.name || 'Member'}, Role: ${me.role || 'builder'}, Offers: ${me.offers || ''}, Needs: ${me.needs || ''}, Skills: ${(me.skills || []).join(', ')}

Candidates:
${candidates.map((c: any, i: number) => `#${i + 1} (ID: ${c.id}): Name: ${c.name}, Role: ${c.role}, Offers: ${c.offers}, Needs: ${c.needs}, Skills: ${(c.skills || []).join(', ')}`).join('\n')}

Pick top 3 best complementary partners for ME. Return ONLY a JSON array, no other text:
[
  {
    "n": <candidate index number 1 to ${candidates.length}>,
    "score": <match score integer 50-100>,
    "reason": "<one concrete sentence: who needs what from whom>",
    "spark": "<one specific collaboration>",
    "icebreaker": "<a warm first WhatsApp message>"
  }
]`;
      }
      return `You are Kwegatta's collaboration matchmaking engine in Kampala.
Analyze whether these two tech ecosystem members should connect.
Member 1:
Name: ${me.name || 'Member 1'}, Role: ${me.role || 'builder'}, Offers: ${me.offers || ''}, Needs: ${me.needs || ''}

Member 2:
Name: ${candidate.name || 'Member 2'}, Role: ${candidate.role || 'builder'}, Offers: ${candidate.offers || ''}, Needs: ${candidate.needs || ''}

Return ONLY this JSON object:
{
  "score": 85,
  "reason": "<one concise sentence explaining why they should collaborate>"
}`;
    }
    case 'tag_post': {
      const { body = '', kind = 'idea', title = '' } = data || {};
      return `You are Kwegatta's community project wall tagger.
Analyze this member's post and return 2 to 4 technical topic tags.
Post Kind: ${kind}
Title: ${title}
Content: ${body}

Return ONLY a JSON array of tags:
["tag1", "tag2", "tag3"]`;
    }
    case 'ask': {
      const { query = '', candidates = [] } = data || {};
      const candidateList = Array.isArray(candidates)
        ? candidates.slice(0, 30).map((c: any) => `ID: ${c.id}, Name: ${c.name}, Role: ${c.role}, Offers: ${c.offers}, Needs: ${c.needs}, Skills: ${(c.skills || []).join(', ')}`).join('\n')
        : '';
      return `You are Kwegatta's semantic search assistant for the Kampala tech community.
Search query: "${query}"
Evaluate community members:
${candidateList}

Return ONLY a JSON object with matches array:
{
  "matches": [
    {
      "id": "<member_id>",
      "reason": "<1-sentence reason why this person matches the query>",
      "score": 85
    }
  ]
}`;
    }
    case 'event_matches': {
      const { event_title = '', me = {}, attendees = [] } = data || {};
      const attendeeList = Array.isArray(attendees)
        ? attendees.slice(0, 30).map((a: any) => `ID: ${a.id}, Name: ${a.name}, Role: ${a.role}, Offers: ${a.offers}, Needs: ${a.needs}`).join('\n')
        : '';
      return `You are Kwegatta's event networking engine for "${event_title}".
Attendee ME: Name: ${me.name || 'Attendee'}, Role: ${me.role || 'builder'}, Offers: "${me.offers || ''}", Needs: "${me.needs || ''}"
Other Attendees:
${attendeeList}

Find up to 5 attendees ME should meet at this event. Return ONLY a JSON object:
{
  "matches": [
    {
      "profile_id": "<attendee_id>",
      "reason": "<one sentence explaining why they should meet at this event>",
      "score": 85
    }
  ]
}`;
    }
    default:
      throw new Error(`Unknown task: ${task}`);
  }
}

app.post('/api/gemma', async (req: Request, res: Response) => {
  // 1. Must be a signed-in member: 401 otherwise
  const callerId = resolveAuthUserId(req);
  if (!callerId) {
    return res.status(401).json({
      error: { message: 'Authentication required: must be a signed-in member to call Gemma inference.' }
    });
  }

  // 2. Per-member rate limiter: 20 calls a minute, 300 a day
  const rateLimitRes = checkMemberGemmaRateLimit(callerId);
  if (!rateLimitRes.allowed) {
    if (rateLimitRes.retryAfter) {
      res.setHeader('Retry-After', rateLimitRes.retryAfter);
    }
    return res.status(429).json({ error: { message: rateLimitRes.error } });
  }

  const { task, data, model = DEFAULT_OPEN_WEIGHT_MODEL } = req.body || {};

  // 3. No free-form prompts: task validation
  if (!task || typeof task !== 'string' || !ALLOWED_GEMMA_TASKS.includes(task as any)) {
    return res.status(400).json({
      error: { message: `Unknown task '${task}'. Allowed tasks: ${ALLOWED_GEMMA_TASKS.join(', ')}` }
    });
  }

  // 4. Input capped at 8,000 characters
  const inputStr = typeof data === 'string' ? data : JSON.stringify(data ?? {});
  if (inputStr.length > 8000) {
    return res.status(400).json({
      error: { message: 'Input data exceeds maximum allowed limit of 8,000 characters.' }
    });
  }

  let targetModel: string;
  try {
    targetModel = validateGemmaModelId(model);
  } catch (err: any) {
    return res.status(400).json({ error: { message: err.message } });
  }

  // 5. Server builds prompt and caps output tokens at 800
  const prompt = buildGemmaPrompt(task as GemmaTask, data);
  const contents = [{ role: 'user', parts: [{ text: prompt }] }];
  const generationConfig = {
    temperature: 0.1,
    maxOutputTokens: 800,
    thinkingConfig: {
      thinkingLevel: 'MINIMAL'
    }
  };

  try {
    const result = await invokeGemmaDirect(contents, generationConfig, targetModel);
    return res.json(result.data);
  } catch (err: any) {
    const isTimeout = err?.message?.includes('timed out');
    return res.status(isTimeout ? 504 : 500).json({
      error: { message: err?.message || 'Failed to get response from Gemma 4' }
    });
  }
});

// STREAMING GEMMA TOKENS TO THE BROWSER (SSE) WITH 4s HEDGING AND RESILIENT 500/503 HANDLING
app.post('/api/gemma/stream', async (req: Request, res: Response) => {
  // 1. Must be a signed-in member: 401 otherwise
  const callerId = resolveAuthUserId(req);
  if (!callerId) {
    return res.status(401).json({
      error: { message: 'Authentication required: must be a signed-in member to call Gemma streaming inference.' }
    });
  }

  // 2. Per-member rate limiter: 20 calls a minute, 300 a day
  const rateLimitRes = checkMemberGemmaRateLimit(callerId);
  if (!rateLimitRes.allowed) {
    if (rateLimitRes.retryAfter) {
      res.setHeader('Retry-After', rateLimitRes.retryAfter);
    }
    return res.status(429).json({ error: { message: rateLimitRes.error } });
  }

  const { task, data, model = DEFAULT_OPEN_WEIGHT_MODEL } = req.body || {};

  // 3. No free-form prompts: task validation
  if (!task || typeof task !== 'string' || !ALLOWED_GEMMA_TASKS.includes(task as any)) {
    return res.status(400).json({
      error: { message: `Unknown task '${task}'. Allowed tasks: ${ALLOWED_GEMMA_TASKS.join(', ')}` }
    });
  }

  // 4. Input capped at 8,000 characters
  const inputStr = typeof data === 'string' ? data : JSON.stringify(data ?? {});
  if (inputStr.length > 8000) {
    return res.status(400).json({
      error: { message: 'Input data exceeds maximum allowed limit of 8,000 characters.' }
    });
  }

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

  // 5. Server builds prompt and caps output at 800 tokens
  const prompt = buildGemmaPrompt(task as GemmaTask, data);
  const contents = [{ role: 'user', parts: [{ text: prompt }] }];

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const requestPayload = {
    contents,
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 800,
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
    country: p.country || '',
    city: p.city || '',
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
  const authUserId = resolveAuthUserId(req);
  const { isAdmin } = resolveAdminInfo(req);
  if (!authUserId && !isAdmin) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { a, b, verA, verB } = req.query as { a?: string; b?: string; verA?: string; verB?: string };
  if (!a || !b) {
    return res.status(400).json({ error: 'Parameters a and b required' });
  }

  if (!isAdmin) {
    const callerProfile = store.profiles.find((p: any) => p.account_uid === authUserId || p.id === authUserId);
    const callerProfileId = callerProfile?.id;
    const isCallerInPair = Boolean(
      (authUserId && (a === authUserId || b === authUserId)) ||
      (callerProfileId && (a === callerProfileId || b === callerProfileId))
    );
    if (!isCallerInPair) {
      return res.status(403).json({ error: 'Forbidden: You must be one of the members in the pair' });
    }
  }

  const key = getPairCacheKey(a, b);
  const cached = matchPairCache.get(key);
  if (cached && cached.versionA === verA && cached.versionB === verB) {
    return res.json({ cached: true, result: cached.result });
  }
  return res.json({ cached: false });
});

app.post('/api/matches/pair-cache', (req: Request, res: Response) => {
  const authUserId = resolveAuthUserId(req);
  const { isAdmin } = resolveAdminInfo(req);
  if (!authUserId && !isAdmin) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { a, b, verA, verB, result } = req.body || {};
  if (!a || !b || !result) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  if (!isAdmin) {
    const callerProfile = store.profiles.find((p: any) => p.account_uid === authUserId || p.id === authUserId);
    const callerProfileId = callerProfile?.id;
    const isCallerInPair = Boolean(
      (authUserId && (a === authUserId || b === authUserId)) ||
      (callerProfileId && (a === callerProfileId || b === callerProfileId))
    );
    if (!isCallerInPair) {
      return res.status(403).json({ error: 'Forbidden: You must be one of the members in the pair' });
    }
  }

  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    return res.status(400).json({ error: 'Invalid result format' });
  }
  const resultKeys = Object.keys(result);
  if (resultKeys.length !== 2 || !resultKeys.includes('score') || !resultKeys.includes('reason')) {
    return res.status(400).json({ error: 'Result must contain exactly score and reason fields, with no extra fields' });
  }
  if (typeof result.score !== 'number' || !Number.isFinite(result.score) || result.score < 0 || result.score > 100) {
    return res.status(400).json({ error: 'Score must be a number between 0 and 100' });
  }
  if (typeof result.reason !== 'string' || result.reason.length > 300) {
    return res.status(400).json({ error: 'Reason must be a string up to 300 characters' });
  }

  const cleanResult = {
    score: result.score,
    reason: sanitizeText(result.reason, 300)
  };

  setPairCacheEntry(a, b, String(verA || ''), String(verB || ''), cleanResult);
  return res.json({ success: true });
});

/* =========================================================================
   ADMIN ENDPOINTS & 15-MINUTE LOCKOUT SECURITY
   ========================================================================= */
interface AdminLockoutInfo {
  failedAttempts: number;
  lockedUntil: number;
}
const adminLockoutMap = new Map<string, AdminLockoutInfo>();

app.post('/api/admin/login', adminLoginLimiter, async (req: Request, res: Response) => {
  const clientIp = getClientIp(req);
  const ipKey = String(clientIp).trim();
  const now = Date.now();

  const lockout = adminLockoutMap.get(ipKey) || { failedAttempts: 0, lockedUntil: 0 };

  // Emergency fallback check: passcode login is off by default, enabled only with ADMIN_FALLBACK=true
  if (process.env.ADMIN_FALLBACK !== 'true') {
    return res.status(403).json({
      error: 'Passcode login is disabled. Sign in with an authorized administrator account configured in ADMIN_EMAILS.'
    });
  }

  // If currently locked out for 15 minutes
  if (lockout.lockedUntil > now) {
    const auditEntry = {
      id: 'audit-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'),
      timestamp: new Date().toISOString(),
      action: 'ADMIN_LOGIN_LOCKED',
      details: `Admin login rejected: locked out due to repeated failed attempts from IP ${clientIp}.`,
      admin: 'admin'
    };
    store.audit_log.unshift(auditEntry);
    await persistDoc('audit_log', auditEntry.id, auditEntry);
    return res.status(401).json({ error: 'Wrong username or password' });
  }

  const { username, password, code, passcode } = req.body || {};
  const inputUsername = String(username || '').trim();
  const inputPassword = String(password || code || passcode || '').trim();
  const expectedCode = (process.env.ADMIN_CODE || '').trim();

  let isMatch = false;
  if (inputUsername === 'admin' && expectedCode.length > 0 && inputPassword.length === expectedCode.length) {
    const inputBuf = Buffer.from(inputPassword);
    const expectedBuf = Buffer.from(expectedCode);
    isMatch = crypto.timingSafeEqual(inputBuf, expectedBuf);
  }

  if (!isMatch) {
    lockout.failedAttempts += 1;
    if (lockout.failedAttempts >= 5) {
      lockout.lockedUntil = now + 15 * 60 * 1000; // 15-minute lockout
    }
    adminLockoutMap.set(ipKey, lockout);

    const auditEntry = {
      id: 'audit-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'),
      timestamp: new Date().toISOString(),
      action: 'ADMIN_LOGIN_FAILED',
      details: `Failed admin login attempt (${lockout.failedAttempts}/5) from IP ${clientIp}.${lockout.failedAttempts >= 5 ? ' Account locked for 15 minutes.' : ''}`,
      admin: inputUsername || 'unknown'
    };
    store.audit_log.unshift(auditEntry);
    await persistDoc('audit_log', auditEntry.id, auditEntry);

    return res.status(401).json({ error: 'Wrong username or password' });
  }

  // Successful login - clear lockout state
  adminLockoutMap.delete(ipKey);

  const token = issueAdminToken();
  const auditEntry = {
    id: 'audit-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'),
    timestamp: new Date().toISOString(),
    action: 'ADMIN_LOGIN_SUCCESS',
    details: `Admin logged in successfully from IP ${clientIp}.`,
    admin: 'admin'
  };
  store.audit_log.unshift(auditEntry);
  await persistDoc('audit_log', auditEntry.id, auditEntry);

  return res.json({ success: true, token });
});

export interface AdminResolution {
  isAdmin: boolean;
  adminName: string;
  adminEmail: string;
}

/** Admin-only routes: 401 when signed out, 403 when signed in without admin rights. */
function verifyAdmin(req: Request, res: Response): AdminResolution | null {
  const info = resolveAdminInfo(req);
  if (info.isAdmin) return info;
  if (resolveAuthUserId(req)) {
    res.status(403).json({ error: 'Admin access required' });
  } else {
    res.status(401).json({ error: 'Unauthorized: Admin session required' });
  }
  return null;
}

/** Unique audit-log id; a bare timestamp collides when two actions land in the same millisecond. */
export function newAuditId(): string {
  return `audit-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
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

const reactionLimiter = createRateLimiter({
  windowMs: 60000,
  max: 60,
  message: 'Reaction rate limit reached. Please wait a moment.'
});

const commentLimiter = createRateLimiter({
  windowMs: 60000,
  max: 10,
  message: 'Comment rate limit reached. Please wait a moment.'
});

app.post('/api/posts/:id/react', reactionLimiter, async (req: Request, res: Response) => {
  const authUserId = resolveAuthUserId(req);
  if (!authUserId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const myProfile = store.profiles.find((p: any) => p.account_uid === authUserId || p.id === authUserId);
  const profileId = myProfile?.id || authUserId;

  const { type } = req.body || {};
  if (!['like', 'launch', 'love', 'idea'].includes(type)) {
    return res.status(400).json({ error: 'Invalid reaction type' });
  }

  const post = store.posts.find((p: any) => p.id === req.params.id);
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  if (!post.reactions_by) post.reactions_by = {};
  if (post.reactions_by[profileId] === type) {
    delete post.reactions_by[profileId];
  } else {
    post.reactions_by[profileId] = type;
  }

  if (storageMode === 'firestore' && firestoreDb) {
    await persistDoc('posts', post.id, post);
  } else if (storageMode === 'disk') {
    saveStore(store);
  }

  const counts = { like: 0, launch: 0, love: 0, idea: 0 };
  if (post.reactions && typeof post.reactions === 'object') {
    for (const [k, v] of Object.entries(post.reactions)) {
      const num = Number(v) || 0;
      if (k === '👍' || k === 'like') counts.like += num;
      else if (k === '🚀' || k === 'launch') counts.launch += num;
      else if (k === '❤️' || k === 'love') counts.love += num;
      else if (k === '💡' || k === 'idea') counts.idea += num;
    }
  }
  for (const [, t] of Object.entries(post.reactions_by)) {
    if (t === 'like') counts.like++;
    else if (t === 'launch') counts.launch++;
    else if (t === 'love') counts.love++;
    else if (t === 'idea') counts.idea++;
  }

  return res.json({
    counts,
    my_reaction: post.reactions_by[profileId] || null
  });
});

app.post('/api/posts/:id/comments', commentLimiter, async (req: Request, res: Response) => {
  const authUserId = resolveAuthUserId(req);
  if (!authUserId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const myProfile = store.profiles.find((p: any) => p.account_uid === authUserId || p.id === authUserId);
  const profileId = myProfile?.id || authUserId;
  const authorName = myProfile?.name || 'Member';

  const { text } = req.body || {};
  const cleanText = typeof text === 'string' ? text.trim() : '';
  if (!cleanText) {
    return res.status(400).json({ error: 'Comment text cannot be empty' });
  }

  const post = store.posts.find((p: any) => p.id === req.params.id);
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  const comment = {
    id: 'comment-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'),
    author_id: profileId,
    author_name: authorName,
    text: sanitizeText(cleanText, 500),
    created_at: new Date().toISOString()
  };

  if (!Array.isArray(post.comments)) post.comments = [];
  post.comments.push(comment);

  if (storageMode === 'firestore' && firestoreDb) {
    await persistDoc('posts', post.id, post);
  } else if (storageMode === 'disk') {
    saveStore(store);
  }

  if (post.author_id && post.author_id !== profileId) {
    const notif = {
      id: 'notif-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'),
      to_id: post.author_id,
      from_id: profileId,
      type: 'connect' as const,
      body: `${authorName} commented on your post: "${sanitizeText(comment.text, 80)}"`,
      read: false,
      created_at: new Date().toISOString()
    };
    if (!store.notifications) store.notifications = [];
    store.notifications.unshift(notif);
    if (storageMode === 'firestore' && firestoreDb) {
      persistDoc('notifications', notif.id, notif).catch(() => {});
    }
  }

  return res.status(201).json(comment);
});

app.delete('/api/posts/:id/comments/:cid', async (req: Request, res: Response) => {
  const authUserId = resolveAuthUserId(req);
  const isAdmin = checkAdmin(req);
  if (!authUserId && !isAdmin) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const myProfile = authUserId ? store.profiles.find((p: any) => p.account_uid === authUserId || p.id === authUserId) : null;
  const profileId = myProfile?.id || authUserId;

  const post = store.posts.find((p: any) => p.id === req.params.id);
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  const comments = Array.isArray(post.comments) ? post.comments : [];
  const commentIndex = comments.findIndex((c: any) => c.id === req.params.cid);
  if (commentIndex === -1) {
    return res.status(404).json({ error: 'Comment not found' });
  }
  const comment = comments[commentIndex];

  const isCommentAuthor = comment.author_id === profileId || comment.author_id === authUserId;
  const isPostAuthor = post.author_id === profileId || post.author_id === authUserId;

  if (!isAdmin && !isCommentAuthor && !isPostAuthor) {
    return res.status(403).json({ error: 'Forbidden: You cannot delete this comment' });
  }

  comments.splice(commentIndex, 1);
  post.comments = comments;

  if (storageMode === 'firestore' && firestoreDb) {
    await persistDoc('posts', post.id, post);
  } else if (storageMode === 'disk') {
    saveStore(store);
  }

  return res.json({ success: true });
});

app.get('/api/admin/posts', (req: Request, res: Response) => {
  if (!verifyAdmin(req, res)) return;
  return res.json(store.posts);
});

app.post('/api/admin/action', async (req: Request, res: Response) => {
  const admin = verifyAdmin(req, res);
  if (!admin) return;

  const { action, id, hidden, message } = req.body || {};

  if (action === 'delete_member') {
    const target = store.profiles.find(p => p.id === id);
    const deletedPosts = store.posts.filter(p => p.author_id === id).map(p => p.id);
    // Same cascade as self-deletion: follows, matches, notifications, RSVPs, team links.
    if (target) await cascadeDeleteMemberData(id, target.account_uid);
    store.profiles = store.profiles.filter(p => p.id !== id);
    store.posts = store.posts.filter(p => p.author_id !== id);
    if (storageMode === 'firestore' && firestoreDb) {
      await removeDoc('profiles', id);
      if (deletedPosts.length > 0) await batchRemoveDocs('posts', deletedPosts);
    }
    const auditEntry = {
      id: newAuditId(),
      timestamp: new Date().toISOString(),
      action: 'DELETE_MEMBER',
      details: `Deleted member: ${target?.name || id}`,
      admin: admin.adminName
    };
    store.audit_log.unshift(auditEntry);
    await persistDoc('audit_log', auditEntry.id, auditEntry);
  } else if (action === 'toggle_hide_member') {
    const target = store.profiles.find(p => p.id === id);
    if (target) {
      target.hidden = hidden;
      await persistDoc('profiles', target.id, target);
      const auditEntry = {
        id: newAuditId(),
        timestamp: new Date().toISOString(),
        action: hidden ? 'HIDE_MEMBER' : 'UNHIDE_MEMBER',
        details: `${hidden ? 'Hid' : 'Unhid'} member: ${target.name}`,
        admin: admin.adminName
      };
      store.audit_log.unshift(auditEntry);
      await persistDoc('audit_log', auditEntry.id, auditEntry);
    }
  } else if (action === 'delete_post') {
    store.posts = store.posts.filter(p => p.id !== id);
    await removeDoc('posts', id);
    const auditEntry = {
      id: newAuditId(),
      timestamp: new Date().toISOString(),
      action: 'DELETE_POST',
      details: `Deleted post ID: ${id}`,
      admin: admin.adminName
    };
    store.audit_log.unshift(auditEntry);
    await persistDoc('audit_log', auditEntry.id, auditEntry);
  } else if (action === 'send_announcement') {
    const newNotifs: Array<{ id: string; data: any }> = [];
    for (const p of store.profiles) {
      const notif = {
        id: 'notif-ann-' + Date.now() + '-' + crypto.randomBytes(5).toString('hex'),
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
      id: newAuditId(),
      timestamp: new Date().toISOString(),
      action: 'SEND_ANNOUNCEMENT',
      details: `Broadcasted notice to ${store.profiles.length} members: "${message.slice(0, 50)}..."`,
      admin: admin.adminName
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
app.post('/api/reports', reportLimiter, async (req: Request, res: Response) => {
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
    id: newAuditId(),
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
  const admin = verifyAdmin(req, res);
  if (!admin) return;

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
      let roles = filterRoles(raw.roles, []);
      if (roles.length === 0) {
        if (typeof raw.role === 'string' && ROLE_CHOICES.includes(raw.role.trim())) {
          roles = [raw.role.trim()];
        } else {
          roles = ['Developer'];
        }
      }
      const role = roles[0];
      const stage = typeof raw.stage === 'string' && (raw.stage === '' || STAGE_CHOICES.includes(raw.stage.trim())) ? raw.stage.trim() : '';
      const normalizedIntent = normalizeIntent(raw.intent);
      const intent = normalizedIntent !== null ? normalizedIntent : '';

      const rawCountry = sanitizeText(raw.country, 10).toUpperCase();
      const country = ISO_COUNTRIES.includes(rawCountry) ? rawCountry : '';
      const city = sanitizeText(raw.city, 100);
      const derivedLoc = deriveLocation(city, country);
      const location = (country || city) ? derivedLoc : (raw.location ? sanitizeText(raw.location, 100) : '');

      const profile = {
        id, // Preserved exact same ID!
        name: sanitizeText(rawName, 100),
        role,
        roles,
        intent,
        stage,
        country,
        city,
        location,
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
        created_at: new Date().toISOString(),
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
      id: newAuditId(),
      timestamp: new Date().toISOString(),
      action: 'ADMIN_IMPORT',
      details: `Imported and restored ${restoredCount} member profile(s) with preserved IDs.`,
      admin: admin.adminName
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

// Track connect request rate limits and duplicate requests (per requester ID)
export interface ConnectHistoryEntry {
  targetId: string;
  timestamp: number;
}
export const connectRequestsMap = new Map<string, ConnectHistoryEntry[]>();

// Explicit connect endpoint (records notification to peer - requires session)
app.post('/api/connect', async (req: Request, res: Response) => {
  const authUserId = resolveAuthUserId(req);
  const { isAdmin } = resolveAdminInfo(req);

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
  const requesterId = requester?.id || authUserId;

  if (target_id === authUserId || (requester && target_id === requester.id)) {
    return res.status(400).json({ error: 'Cannot connect with yourself' });
  }

  // Rate limits & duplicate checks (no limit for admins)
  if (!isAdmin && requesterId) {
    const now = Date.now();
    const oneMinuteAgo = now - 60 * 1000;
    const oneDayAgo = now - 24 * 60 * 60 * 1000;
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    let history = connectRequestsMap.get(requesterId) || [];
    history = history.filter(h => h.timestamp > sevenDaysAgo);
    connectRequestsMap.set(requesterId, history);

    // Duplicate request to the same person within 7 days -> 409
    const duplicateInHistory = history.some(h => h.targetId === target_id && h.timestamp > sevenDaysAgo);
    const duplicateInNotifications = (store.notifications || []).some((n: any) =>
      n.type === 'connect' &&
      (n.from_id === requesterId || (requester && n.from_id === requester.id) || n.from_id === authUserId) &&
      n.to_id === target_id &&
      new Date(n.created_at).getTime() > sevenDaysAgo
    );

    if (duplicateInHistory || duplicateInNotifications) {
      return res.status(409).json({ error: "You already sent a request to this person." });
    }

    // Rate limits: Max 5 a minute and 20 a day per member
    const lastMinuteCount = history.filter(h => h.timestamp > oneMinuteAgo).length;
    const lastDayCount = history.filter(h => h.timestamp > oneDayAgo).length;

    if (lastMinuteCount >= 5 || lastDayCount >= 20) {
      return res.status(429).json({ error: "You've reached today's limit for connection requests. Try again tomorrow." });
    }
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

  // Track connect request history if member
  if (requesterId) {
    const list = connectRequestsMap.get(requesterId) || [];
    list.push({ targetId: target_id, timestamp: Date.now() });
    connectRequestsMap.set(requesterId, list);
  }

  return res.json({
    success: true,
    target_id: target.id,
    target_name: target.name,
    whatsapp: target.whatsapp || '',
    linkedin: target.linkedin || ''
  });
});

export async function cascadeDeleteMemberData(memberId: string, memberUid?: string | null) {
  const matchesMember = (val?: string | null) =>
    Boolean(val && (val === memberId || (memberUid && val === memberUid)));

  // 1. Posts authored by member
  const deletedPosts = (store.posts || []).filter((p: any) => matchesMember(p.author_id)).map(p => p.id);
  store.posts = (store.posts || []).filter((p: any) => !matchesMember(p.author_id));

  // 2. Follows involving member
  const deletedFollows = (store.follows || []).filter((f: any) => matchesMember(f.follower_id) || matchesMember(f.following_id)).map(f => f.id);
  store.follows = (store.follows || []).filter((f: any) => !matchesMember(f.follower_id) && !matchesMember(f.following_id));

  // 3. Matches involving member
  const deletedMatches = (store.matches || []).filter((m: any) => matchesMember(m.a_id) || matchesMember(m.b_id)).map(m => m.id);
  store.matches = (store.matches || []).filter((m: any) => !matchesMember(m.a_id) && !matchesMember(m.b_id));

  // 4. Notifications involving member
  const deletedNotifs = (store.notifications || []).filter((n: any) => matchesMember(n.to_id) || matchesMember(n.from_id)).map(n => n.id);
  store.notifications = (store.notifications || []).filter((n: any) => !matchesMember(n.to_id) && !matchesMember(n.from_id));

  // 5. Events authored by the member: delete them, plus their event_guests, event_questions and uploaded event images
  const authoredEvents = (store.events || []).filter((e: any) => matchesMember(e.author_id));
  const authoredEventIds = new Set(authoredEvents.map((e: any) => e.id));
  store.events = (store.events || []).filter((e: any) => !authoredEventIds.has(e.id));

  // Event guests: belonging to authored events OR registered by the member
  const deletedGuests = (store.event_guests || []).filter((g: any) => authoredEventIds.has(g.event_id) || matchesMember(g.user_id) || matchesMember(g.profile_id)).map(g => g.id);
  store.event_guests = (store.event_guests || []).filter((g: any) => !authoredEventIds.has(g.event_id) && !matchesMember(g.user_id) && !matchesMember(g.profile_id));

  // Event questions: belonging to authored events OR asked by the member
  const deletedQuestions = (store.event_questions || []).filter((q: any) => authoredEventIds.has(q.event_id) || matchesMember(q.author_id)).map(q => q.id);
  store.event_questions = (store.event_questions || []).filter((q: any) => !authoredEventIds.has(q.event_id) && !matchesMember(q.author_id));

  // Event check-ins: belonging to authored events OR for this member
  const deletedCheckins = (store.event_checkins || [])
    .filter((c: any) => authoredEventIds.has(c.event_id) || (c.kind === 'member' && matchesMember(c.ref_id)) || matchesMember(c.checked_in_by))
    .map((c: any) => c.id);
  store.event_checkins = (store.event_checkins || []).filter(
    (c: any) => !authoredEventIds.has(c.event_id) && !(c.kind === 'member' && matchesMember(c.ref_id)) && !matchesMember(c.checked_in_by)
  );

  // Event match feedback: belonging to authored events OR from/to this member
  const deletedMatchFeedback = (store.event_match_feedback || [])
    .filter((f: any) => authoredEventIds.has(f.event_id) || matchesMember(f.member_id) || matchesMember(f.target_profile_id))
    .map((f: any) => f.id);
  store.event_match_feedback = (store.event_match_feedback || []).filter(
    (f: any) => !authoredEventIds.has(f.event_id) && !matchesMember(f.member_id) && !matchesMember(f.target_profile_id)
  );

  // 6. Delete replies the member posted on questions of other events
  for (const q of (store.event_questions || [])) {
    if (q.reply && matchesMember(q.reply.author_id)) {
      delete q.reply;
      await persistDoc('event_questions', q.id, q);
    }
  }

  // 7. Remove the member's id and uid from attendee_ids and ticket hashes in all other events
  for (const ev of (store.events || [])) {
    let changed = false;
    if (Array.isArray(ev.attendee_ids)) {
      const origLen = ev.attendee_ids.length;
      ev.attendee_ids = ev.attendee_ids.filter((attId: string) => !matchesMember(attId));
      if (ev.attendee_ids.length !== origLen) {
        changed = true;
      }
    }
    if (ev.member_ticket_hashes && typeof ev.member_ticket_hashes === 'object') {
      for (const k of Object.keys(ev.member_ticket_hashes)) {
        if (matchesMember(k)) {
          delete ev.member_ticket_hashes[k];
          changed = true;
        }
      }
    }
    if (Array.isArray(ev.match_optout_ids)) {
      const origOptLen = ev.match_optout_ids.length;
      ev.match_optout_ids = ev.match_optout_ids.filter((optId: string) => !matchesMember(optId));
      if (ev.match_optout_ids.length !== origOptLen) {
        changed = true;
      }
    }
    if (ev.rsvp_times && typeof ev.rsvp_times === 'object') {
      for (const k of Object.keys(ev.rsvp_times)) {
        if (matchesMember(k)) {
          delete ev.rsvp_times[k];
          changed = true;
        }
      }
    }
    if (Array.isArray(ev.waitlist_ids)) {
      const origWlLen = ev.waitlist_ids.length;
      ev.waitlist_ids = ev.waitlist_ids.filter((wId: string) => !matchesMember(wId));
      if (ev.waitlist_ids.length !== origWlLen) {
        changed = true;
      }
    }
    if (ev.waitlist_times && typeof ev.waitlist_times === 'object') {
      for (const k of Object.keys(ev.waitlist_times)) {
        if (matchesMember(k)) {
          delete ev.waitlist_times[k];
          changed = true;
        }
      }
    }
    if (Array.isArray(ev.reports)) {
      for (const r of ev.reports) {
        if (matchesMember(r.reporter_id)) {
          r.reporter_id = 'deleted-member';
          changed = true;
        }
      }
    }
    if (changed) {
      await persistDoc('events', ev.id, ev);
    }
    await promoteFromWaitlist(ev);
  }

  // 8. Reports the member filed: keep them for moderation, but set reporter_id to 'deleted-member'
  for (const rep of (store.reports || [])) {
    if (matchesMember(rep.reporter_id)) {
      rep.reporter_id = 'deleted-member';
      await persistDoc('reports', rep.id, rep);
    }
  }

  // 9. Team entries with linked_profile_id = this member: set linked_profile_id to null
  for (const tm of (store.team || [])) {
    if (matchesMember(tm.linked_profile_id)) {
      tm.linked_profile_id = null;
      await persistDoc('team', tm.id, tm);
    }
  }

  // 10. The pair cache: remove entries that include this member
  for (const [key] of matchPairCache.entries()) {
    const parts = key.split('_');
    if (parts.some((p: string) => matchesMember(p))) {
      matchPairCache.delete(key);
    }
  }

  // Remove from connectRequestsMap
  connectRequestsMap.delete(memberId);
  if (memberUid) connectRequestsMap.delete(memberUid);

  // Persistence
  if (storageMode === 'firestore' && firestoreDb) {
    await removeDoc('profiles', memberId);
    if (deletedPosts.length > 0) await batchRemoveDocs('posts', deletedPosts);
    if (deletedFollows.length > 0) await batchRemoveDocs('follows', deletedFollows);
    if (deletedMatches.length > 0) await batchRemoveDocs('matches', deletedMatches);
    if (deletedNotifs.length > 0) await batchRemoveDocs('notifications', deletedNotifs);
    if (authoredEvents.length > 0) await batchRemoveDocs('events', Array.from(authoredEventIds));
    if (deletedGuests.length > 0) await batchRemoveDocs('event_guests', deletedGuests);
    if (deletedQuestions.length > 0) await batchRemoveDocs('event_questions', deletedQuestions);
    if (deletedCheckins.length > 0) await batchRemoveDocs('event_checkins', deletedCheckins);
    if (deletedMatchFeedback.length > 0) await batchRemoveDocs('event_match_feedback', deletedMatchFeedback);
  } else {
    saveStore(store);
  }
}

// Delete member profile permanently (Authentication required: self or admin)
app.delete('/api/profiles/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  const authUserId = resolveAuthUserId(req);
  const { isAdmin } = resolveAdminInfo(req);

  if (!authUserId && !isAdmin) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const existing = store.profiles.find((p: any) => p.id === id);
  const isOwner = Boolean(authUserId && (id === authUserId || existing?.account_uid === authUserId));

  if (!isAdmin && !isOwner) {
    return res.status(403).json({ error: 'Forbidden: You can only delete your own profile' });
  }

  const initialCount = store.profiles.length;
  await cascadeDeleteMemberData(id, existing?.account_uid);
  store.profiles = store.profiles.filter((p: any) => p.id !== id);

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

// Delete own account permanently
app.delete('/api/account', async (req: Request, res: Response) => {
  const authUserId = resolveAuthUserId(req);
  if (!authUserId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const existing = store.profiles.find((p: any) => p.id === authUserId || p.account_uid === authUserId);
  const id = existing ? existing.id : authUserId;

  await cascadeDeleteMemberData(id, existing?.account_uid || authUserId);
  store.profiles = store.profiles.filter((p: any) => p.id !== id && p.account_uid !== authUserId);

  const firebaseUidToDelete = existing?.account_uid || (id.startsWith('user-') || id.startsWith('demo-') ? null : id) || authUserId;
  if (adminAuth && firebaseUidToDelete) {
    try {
      await adminAuth.deleteUser(firebaseUidToDelete);
      console.log(`[Firebase Admin] Deleted user account ${firebaseUidToDelete} with profile ${id}`);
    } catch (authDelErr: any) {
      console.warn(`[Firebase Admin] Could not delete user account ${firebaseUidToDelete}:`, authDelErr?.message || authDelErr);
    }
  }

  return res.json({
    success: true,
    deleted: true,
    message: 'Account and associated personal data deleted permanently.'
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
    appUrl: 'https://kwegatta.ai.studio'
  });
});

// System Health & Monitoring Endpoint
app.get(['/api/health/status', '/healthz'], (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()),
    storage: {
      mode: storageMode,
      firestore: storageMode === 'firestore' && Boolean(firestoreDb),
      profiles_count: store.profiles?.length || 0,
      posts_count: store.posts?.length || 0,
      matches_count: store.matches?.length || 0,
      audit_log_count: store.audit_log?.length || 0
    },
    model: {
      provider: 'gemma',
      default_model: DEFAULT_OPEN_WEIGHT_MODEL,
      allowed_models: ALLOWED_OPEN_WEIGHT_MODELS,
      guard_active: true
    }
  });
});

// Avatar Photo Endpoint with Cache-Control and ETag
app.get('/api/avatar/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const profile = store.profiles.find((p: any) => p.id === id);

  if (!profile || !profile.avatar) {
    const name = profile?.name || '?';
    const initial = name.charAt(0).toUpperCase();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="64" fill="#1e293b"/><text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#F0F3F6" font-family="Inter, sans-serif" font-size="52" font-weight="bold">${escapeHtml(initial)}</text></svg>`;
    const etag = `W/"svg-${id}-${initial}"`;
    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end();
    }
    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.setHeader('ETag', etag);
    return res.send(svg);
  }

  const avatar = String(profile.avatar);
  if (avatar.startsWith('data:')) {
    const match = avatar.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const mimeType = match[1];
      const buffer = Buffer.from(match[2], 'base64');
      const hash = crypto.createHash('md5').update(buffer).digest('hex');
      const etag = `"${hash}"`;

      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
      res.setHeader('ETag', etag);
      return res.send(buffer);
    }
  } else if (/^https:\/\/[^/]/i.test(avatar)) {
    // Only https photo links (e.g. Google account photos); never plain http.
    return res.redirect(avatar);
  }

  return res.status(404).send('Avatar not found');
});

// Event Cover Image Validation
function validateAndSanitizeEventCoverImage(val: any): string {
  if (!val || typeof val !== 'string') {
    throw new Error('No image data provided');
  }
  const trimmed = val.trim();
  if (!trimmed) {
    throw new Error('No image data provided');
  }
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    throw new Error('Remote image URLs are not permitted. Please upload an image file.');
  }
  let buffer: Buffer | null = null;
  const match = trimmed.match(/^data:([^;]+);base64,(.+)$/);
  if (match) {
    const rawMime = match[1].toLowerCase();
    if (rawMime.includes('svg')) {
      throw new Error('SVG images are not permitted. Only JPEG, PNG, and WebP are allowed.');
    }
    buffer = Buffer.from(match[2], 'base64');
  } else {
    buffer = Buffer.from(trimmed, 'base64');
  }

  if (!buffer || buffer.length === 0) {
    throw new Error('Invalid image data');
  }

  if (buffer.length > 400 * 1024) {
    throw new Error('File size exceeds 400 KB limit.');
  }

  const textSnippet = buffer.slice(0, 100).toString('utf8').toLowerCase();
  if (textSnippet.includes('<svg') || textSnippet.includes('<?xml') || textSnippet.includes('xmlns=')) {
    throw new Error('SVG images are not permitted. Only JPEG, PNG, and WebP are allowed.');
  }

  let detectedMime: string | null = null;
  if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    detectedMime = 'image/jpeg';
  } else if (buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
    buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A) {
    detectedMime = 'image/png';
  } else if (buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP') {
    detectedMime = 'image/webp';
  }

  if (!detectedMime) {
    throw new Error('Invalid file type. Only JPEG, PNG, and WebP images are allowed.');
  }

  return `data:${detectedMime};base64,${buffer.toString('base64')}`;
}

// Event Cover Image Upload Route
export async function handleEventImageUpload(req: Request, res: Response) {
  const callerId = resolveAuthUserId(req);
  if (!callerId) {
    return res.status(401).json({ error: 'Please sign in to upload an event cover image.' });
  }

  const isAdmin = checkAdmin(req);
  const callerProfile = callerId ? store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId) : null;
  const callerProfileId = callerProfile?.id || callerId;

  const eventId = req.body?.event_id || req.query.event_id;
  let targetEvent: any = null;
  if (eventId) {
    targetEvent = (store.events || []).find((e: any) => e.id === eventId);
    if (!targetEvent) {
      return res.status(404).json({ error: 'Event not found.' });
    }
    const isAuthor = Boolean(
      (callerProfileId && targetEvent.author_id === callerProfileId) ||
      (callerId && targetEvent.author_id === callerId)
    );
    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ error: 'Forbidden: You can only set the cover image for your own events.' });
    }
  }

  let rawData = req.body?.image || req.body?.dataUrl || req.body?.cover_image || req.body?.file;
  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    rawData = req.body;
  }

  let buffer: Buffer | null = null;
  if (Buffer.isBuffer(rawData)) {
    buffer = rawData;
  } else if (typeof rawData === 'string') {
    if (rawData.startsWith('http://') || rawData.startsWith('https://')) {
      return res.status(400).json({ error: 'Remote image URLs are not permitted. Please upload an image file.' });
    }
    const match = rawData.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      if (match[1].toLowerCase().includes('svg')) {
        return res.status(400).json({ error: 'SVG images are not permitted. Only JPEG, PNG, and WebP are allowed.' });
      }
      buffer = Buffer.from(match[2], 'base64');
    } else {
      buffer = Buffer.from(rawData, 'base64');
    }
  }

  if (!buffer || buffer.length === 0) {
    return res.status(400).json({ error: 'No image data provided.' });
  }

  if (buffer.length > 400 * 1024) {
    return res.status(400).json({ error: 'File size exceeds 400 KB limit.' });
  }

  const textSnippet = buffer.slice(0, 100).toString('utf8').toLowerCase();
  if (textSnippet.includes('<svg') || textSnippet.includes('<?xml') || textSnippet.includes('xmlns=')) {
    return res.status(400).json({ error: 'SVG images are not permitted. Only JPEG, PNG, and WebP are allowed.' });
  }

  let detectedMime: string | null = null;
  if (buffer.length >= 3 && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF) {
    detectedMime = 'image/jpeg';
  } else if (buffer.length >= 8 &&
    buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47 &&
    buffer[4] === 0x0D && buffer[5] === 0x0A && buffer[6] === 0x1A && buffer[7] === 0x0A) {
    detectedMime = 'image/png';
  } else if (buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP') {
    detectedMime = 'image/webp';
  }

  if (!detectedMime) {
    return res.status(400).json({ error: 'Invalid file type. Only JPEG, PNG, and WebP images are allowed.' });
  }

  const dataUrl = `data:${detectedMime};base64,${buffer.toString('base64')}`;

  if (targetEvent) {
    targetEvent.cover_image = dataUrl;
    await persistDoc('events', targetEvent.id, targetEvent);
    if (storageMode === 'disk') saveStore(store);
  }

  return res.json({
    success: true,
    dataUrl,
    mime: detectedMime,
    size: buffer.length,
    status: targetEvent ? targetEvent.status : undefined
  });
}

app.post('/api/event-image/upload', handleEventImageUpload);
app.post('/api/event-image', handleEventImageUpload);
app.post('/api/events/upload-image', handleEventImageUpload);

// Event Cover Image Serving Route (with Cache-Control, ETag, and approval visibility guard)
app.get('/api/event-image/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item || !item.cover_image) {
    return res.status(404).send('Event image not found');
  }

  const callerId = resolveAuthUserId(req);
  const isAdmin = checkAdmin(req);
  const callerProfile = callerId ? store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId) : null;
  const callerProfileId = callerProfile?.id || callerId;
  const isAuthor = Boolean(callerProfileId && (item.author_id === callerProfileId || item.author_id === callerId));

  // The image is hidden from the public until an admin approves the event
  // (trusted organisers keep their existing auto-approve behaviour).
  if (!isAdmin && !isAuthor && (item.published === false || item.status === 'pending' || item.status === 'rejected')) {
    return res.status(404).send('Event image not found or unpublished');
  }

  const cover = String(item.cover_image);
  if (cover.startsWith('data:')) {
    const match = cover.match(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      const mimeType = match[1];
      const buffer = Buffer.from(match[2], 'base64');
      const hash = crypto.createHash('md5').update(buffer).digest('hex');
      const etag = `"${hash}"`;

      if (req.headers['if-none-match'] === etag) {
        return res.status(304).end();
      }

      res.setHeader('Content-Type', mimeType);
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.setHeader('ETag', etag);
      return res.send(buffer);
    }
  }

  return res.status(404).send('Event image not found');
});

/* =========================================================================
   RELEASE 1.10.0 PART 1: RICH LINK PREVIEWS (/e/:id AND /og/event/:id.jpg)
   ========================================================================= */

let cachedIndexHtmlTemplate: string | null = null;
try {
  const distIdx = path.join(__dirname, 'dist', 'index.html');
  const rootIdx = path.join(__dirname, 'index.html');
  if (fs.existsSync(distIdx)) {
    cachedIndexHtmlTemplate = fs.readFileSync(distIdx, 'utf-8');
  } else if (fs.existsSync(rootIdx)) {
    cachedIndexHtmlTemplate = fs.readFileSync(rootIdx, 'utf-8');
  }
} catch (_) {}

function getIndexHtmlTemplate(): string {
  const isDev = process.env.NODE_ENV === 'development';
  const distIdx = path.join(__dirname, 'dist', 'index.html');
  const rootIdx = path.join(__dirname, 'index.html');
  if (!isDev && cachedIndexHtmlTemplate) {
    return cachedIndexHtmlTemplate;
  }
  try {
    if (!isDev && fs.existsSync(distIdx)) {
      cachedIndexHtmlTemplate = fs.readFileSync(distIdx, 'utf-8');
      return cachedIndexHtmlTemplate;
    }
    if (fs.existsSync(rootIdx)) {
      const content = fs.readFileSync(rootIdx, 'utf-8');
      if (!isDev) cachedIndexHtmlTemplate = content;
      return content;
    }
  } catch (_) {}
  return (
    cachedIndexHtmlTemplate ||
    '<!doctype html><html lang="en"><head><meta charset="UTF-8" /><title>Kwegatta: find the people you should build and learn with</title></head><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>'
  );
}

export function stripControlChars(val: any): string {
  return String(val ?? '')
    .replace(/[\x00-\x1F\x7F]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function escapeHtml(val: any): string {
  const clean = stripControlChars(val);
  return clean
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function isEventPubliclyVisible(item: any): boolean {
  if (!item) return false;
  if (item.published === false) return false;
  if (item.status === 'pending' || item.status === 'rejected') return false;
  if (item.hidden_by_moderation) return false;
  return true;
}

export const OG_RENDER_VERSION = '3';

export function computeEventOgVersionHash(item: any): string {
  const raw = `v${OG_RENDER_VERSION}|${item?.cover_image || ''}|${item?.title || ''}|${item?.starts_at || item?.datetime || ''}`;
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 10);
}

export function formatEventOgDatePart(item: any): { dateTimeText: string; tz: string } {
  const tz = stripControlChars(item?.timezone || 'Africa/Kampala') || 'Africa/Kampala';
  const startRaw = item?.starts_at;
  const d = startRaw ? new Date(startRaw) : new Date();
  const validDate = !isNaN(d.getTime()) ? d : new Date();
  const tzLabel = formatTzLabel(tz, validDate);
  if (startRaw) {
    if (!isNaN(d.getTime())) {
      try {
        const weekdayDayMonth = new Intl.DateTimeFormat('en-GB', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
          timeZone: tz
        }).format(d);
        const timeStr = new Intl.DateTimeFormat('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
          timeZone: tz
        }).format(d);
        return { dateTimeText: `${weekdayDayMonth} · ${timeStr}`, tz: tzLabel };
      } catch (_) {}
    }
  }
  const fallback = stripControlChars(item?.datetime || 'Upcoming Event');
  return { dateTimeText: fallback, tz: tzLabel };
}

export function buildEventMetaDescription(item: any): string {
  const { dateTimeText, tz } = formatEventOgDatePart(item);
  const venuePart =
    item?.format === 'online'
      ? 'Online'
      : stripControlChars(item?.venue || item?.location || 'Online') || 'Online';
  const descCollapsed = stripControlChars(item?.description || '').slice(0, 150);
  const combined = descCollapsed
    ? `${dateTimeText} ${tz} · ${venuePart} — ${descCollapsed}`
    : `${dateTimeText} ${tz} · ${venuePart}`;
  return combined.length > 200 ? combined.slice(0, 199).trimEnd() + '…' : combined;
}

export function getPublicAppUrl(): string {
  const raw = process.env.PUBLIC_SHARE_URL || 'https://kwegatta.ai.studio';
  return raw.replace(/\/+$/, '');
}

export function injectEventOgIntoHtml(baseHtml: string, item: any): string {
  const appBase = getPublicAppUrl();
  const safeId = encodeURIComponent(String(item.id || ''));
  const rawTitle = stripControlChars(item.title || 'Event');
  const escapedTitle = escapeHtml(rawTitle);
  const rawDesc = buildEventMetaDescription(item);
  const escapedDesc = escapeHtml(rawDesc);
  const vHash = computeEventOgVersionHash(item);
  const canonicalUrl = `${appBase}/e/${safeId}`;
  const ogImageUrl = `${appBase}/og/event/${safeId}.jpg?v=${vHash}`;

  // Remove existing generic title, description, og:*, twitter:*, and canonical tags so we never duplicate them
  let cleaned = baseHtml
    .replace(/<title>[\s\S]*?<\/title>\s*/gi, '')
    .replace(/<meta\s+name=["']description["'][^>]*>\s*/gi, '')
    .replace(/<meta\s+property=["']og:[^"']+["'][^>]*>\s*/gi, '')
    .replace(/<meta\s+name=["']twitter:[^"']+["'][^>]*>\s*/gi, '')
    .replace(/<link\s+rel=["']canonical["'][^>]*>\s*/gi, '');

  const injectedBlock = [
    `<title>${escapedTitle} · Kwegatta</title>`,
    `    <meta name="description" content="${escapedDesc}" />`,
    `    <meta property="og:type" content="website" />`,
    `    <meta property="og:site_name" content="Kwegatta" />`,
    `    <meta property="og:title" content="${escapedTitle}" />`,
    `    <meta property="og:description" content="${escapedDesc}" />`,
    `    <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />`,
    `    <meta property="og:image" content="${escapeHtml(ogImageUrl)}" />`,
    `    <meta property="og:image:width" content="1200" />`,
    `    <meta property="og:image:height" content="630" />`,
    `    <meta property="og:image:type" content="image/jpeg" />`,
    `    <meta property="og:image:alt" content="${escapedTitle}" />`,
    `    <meta name="twitter:card" content="summary_large_image" />`,
    `    <meta name="twitter:title" content="${escapedTitle}" />`,
    `    <meta name="twitter:description" content="${escapedDesc}" />`,
    `    <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}" />`,
    `    <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />`,
    `    <script>(function(){try{if(window.location.pathname.indexOf('/e/')===0){window.history.replaceState(null,'','/#/events/${safeId.replace(/'/g, '%27')}');}}catch(_){}})();</script>`
  ].join('\n');

  if (cleaned.includes('</head>')) {
    // Function replacement: a title containing "$&" or "$'" must not be expanded by String.replace.
    return cleaned.replace('</head>', () => `    ${injectedBlock}\n  </head>`);
  }
  return `${injectedBlock}\n${cleaned}`;
}

app.get('/e/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  const baseHtml = getIndexHtmlTemplate();

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, max-age=300');

  if (!isEventPubliclyVisible(item)) {
    return res.status(200).send(baseHtml);
  }

  const html = injectEventOgIntoHtml(baseHtml, item);
  return res.status(200).send(html);
});

const ogImageLruCache = new Map<string, Buffer>();
const OG_IMAGE_LRU_MAX = 100;

function wrapTitleLines(rawTitle: string, maxCharsPerLine = 34): [string, string?] {
  const clean = stripControlChars(rawTitle || 'Kwegatta Event');
  if (clean.length <= maxCharsPerLine) return [clean];
  const words = clean.split(' ');
  let line1 = '';
  let i = 0;
  while (i < words.length) {
    const candidate = line1 ? `${line1} ${words[i]}` : words[i];
    if (candidate.length <= maxCharsPerLine || !line1) {
      line1 = candidate.slice(0, maxCharsPerLine);
      i++;
    } else {
      break;
    }
  }
  if (i >= words.length) return [line1];
  const rest = words.slice(i).join(' ');
  const line2 = rest.length > maxCharsPerLine ? rest.slice(0, maxCharsPerLine - 1).trimEnd() + '…' : rest;
  return [line1, line2];
}

function resolveCoverImageBuffer(coverImage?: string): Buffer | null {
  if (!coverImage || typeof coverImage !== 'string') return null;
  if (coverImage.startsWith('data:')) {
    const match = coverImage.match(/^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/i);
    if (match) {
      try {
        return Buffer.from(match[1], 'base64');
      } catch (_) {
        return null;
      }
    }
    return null;
  }
  // Allow only local static files under public/ (never fetch arbitrary remote URLs)
  if (coverImage.startsWith('/') && !coverImage.startsWith('//') && !coverImage.startsWith('/api/')) {
    try {
      const publicRoot = path.resolve(__dirname, 'public');
      const resolved = path.resolve(publicRoot, '.' + coverImage);
      if (resolved.startsWith(publicRoot + path.sep) && fs.existsSync(resolved)) {
        return fs.readFileSync(resolved);
      }
    } catch (_) {}
  }
  return null;
}

export const NON_INTER_CHAR_REGEX = /[^\u0000-\u024F\u2000-\u206F\u20AC]/;

export function canInterRender(text: string): boolean {
  if (!text) return true;
  return !NON_INTER_CHAR_REGEX.test(text);
}

export async function renderEventOgJpeg(item: any): Promise<Buffer> {
  await ensureFontConfigInitialized();

  const [line1, line2] = wrapTitleLines(item.title || 'Kwegatta Event', 34);
  const hasLine1 = Boolean(line1 && canInterRender(line1));
  const hasLine2 = Boolean(line2 && canInterRender(line2));
  const safeLine1 = hasLine1 ? escapeHtml(line1) : '';
  const safeLine2 = hasLine2 && line2 ? escapeHtml(line2) : '';

  const { dateTimeText, tz } = formatEventOgDatePart(item);
  const venuePart =
    item?.format === 'online'
      ? 'Online'
      : stripControlChars(item?.venue || item?.location || 'Kampala') || 'Kampala';
  const rawMetaLine = `${dateTimeText} (${tz}) · ${venuePart}`;
  const hasMeta = canInterRender(rawMetaLine);
  const safeMetaLine = hasMeta
    ? escapeHtml(rawMetaLine.length > 76 ? rawMetaLine.slice(0, 75) + '…' : rawMetaLine)
    : '';

  const coverBuf = resolveCoverImageBuffer(item.cover_image);

  const titleY1 = hasLine2 ? 450 : 495;
  const titleY2 = 510;
  const metaY = hasLine1 ? 568 : 520;

  if (coverBuf) {
    const overlaySvg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#070B12" stop-opacity="0.18"/>
          <stop offset="45%" stop-color="#070B12" stop-opacity="0.55"/>
          <stop offset="100%" stop-color="#070B12" stop-opacity="0.95"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#grad)"/>
      <rect x="64" y="48" width="168" height="42" rx="10" fill="#070B12" fill-opacity="0.82" stroke="#F59E0B" stroke-width="1.5"/>
      <text x="148" y="75" text-anchor="middle" fill="#F59E0B" font-family="Inter, sans-serif" font-size="18" font-weight="800" letter-spacing="2">KWEGATTA</text>
      ${hasLine1 ? `<text x="64" y="${titleY1}" fill="#FAFAFC" font-family="Inter, sans-serif" font-size="48" font-weight="800">${safeLine1}</text>` : ''}
      ${hasLine2 ? `<text x="64" y="${titleY2}" fill="#FAFAFC" font-family="Inter, sans-serif" font-size="48" font-weight="800">${safeLine2}</text>` : ''}
      ${hasMeta ? `<text x="64" y="${metaY}" fill="#F59E0B" font-family="Inter, sans-serif" font-size="24" font-weight="600">${safeMetaLine}</text>` : ''}
    </svg>`;

    const baseImage = sharp(coverBuf)
      .resize(1200, 630, { fit: 'cover', position: 'attention' })
      .composite([{ input: Buffer.from(overlaySvg), top: 0, left: 0 }]);

    let out = await baseImage.jpeg({ quality: 80 }).toBuffer();
    if (out.length > 300 * 1024) {
      out = await sharp(out).jpeg({ quality: 65 }).toBuffer();
    }
    return out;
  } else {
    const brandSvg = `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#070B12"/>
          <stop offset="60%" stop-color="#0E1525"/>
          <stop offset="100%" stop-color="#1A160B"/>
        </linearGradient>
      </defs>
      <rect width="1200" height="630" fill="url(#bg)"/>
      <circle cx="1060" cy="120" r="240" fill="#F59E0B" fill-opacity="0.08"/>
      <rect x="40" y="40" width="1120" height="550" rx="24" fill="none" stroke="#F59E0B" stroke-opacity="0.3" stroke-width="2"/>
      <rect x="72" y="72" width="168" height="42" rx="10" fill="#F59E0B" fill-opacity="0.15" stroke="#F59E0B" stroke-width="1.5"/>
      <text x="156" y="99" text-anchor="middle" fill="#F59E0B" font-family="Inter, sans-serif" font-size="18" font-weight="800" letter-spacing="2">KWEGATTA</text>
      ${hasLine1 ? `<text x="72" y="${titleY1}" fill="#FAFAFC" font-family="Inter, sans-serif" font-size="48" font-weight="800">${safeLine1}</text>` : ''}
      ${hasLine2 ? `<text x="72" y="${titleY2}" fill="#FAFAFC" font-family="Inter, sans-serif" font-size="48" font-weight="800">${safeLine2}</text>` : ''}
      ${hasMeta ? `<text x="72" y="${metaY - 12}" fill="#F59E0B" font-family="Inter, sans-serif" font-size="24" font-weight="600">${safeMetaLine}</text>` : ''}
    </svg>`;

    let out = await sharp(Buffer.from(brandSvg))
      .resize(1200, 630)
      .jpeg({ quality: 80 })
      .toBuffer();
    if (out.length > 300 * 1024) {
      out = await sharp(out).jpeg({ quality: 65 }).toBuffer();
    }
    return out;
  }
}

app.get('/og/event/:id.jpg', async (req: Request, res: Response) => {
  const { id } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!isEventPubliclyVisible(item)) {
    return res.redirect(302, '/og-image.png');
  }

  const fontsOk = await ensureFontConfigInitialized();
  if (!fontsOk) {
    console.warn('[OG Image] Fonts not available, redirecting to /og-image.png');
    return res.redirect(302, '/og-image.png');
  }

  const vHash = computeEventOgVersionHash(item);
  const cacheKey = `${id}:${vHash}`;
  const etag = `"${id}-${vHash}"`;

  if (req.headers['if-none-match'] === etag && ogImageLruCache.has(cacheKey)) {
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(304).end();
  }

  const cached = ogImageLruCache.get(cacheKey);
  if (cached) {
    // Refresh LRU order
    ogImageLruCache.delete(cacheKey);
    ogImageLruCache.set(cacheKey, cached);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('ETag', etag);
    return res.status(200).send(cached);
  }

  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;
  try {
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error('OG image render timeout')), 5000);
    });
    const jpegBuffer = await Promise.race([renderEventOgJpeg(item), timeoutPromise]);
    if (timeoutHandle) clearTimeout(timeoutHandle);

    if (ogImageLruCache.size >= OG_IMAGE_LRU_MAX) {
      const oldestKey = ogImageLruCache.keys().next().value;
      if (oldestKey) ogImageLruCache.delete(oldestKey);
    }
    ogImageLruCache.set(cacheKey, jpegBuffer);

    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.setHeader('ETag', etag);
    return res.status(200).send(jpegBuffer);
  } catch (err: any) {
    if (timeoutHandle) clearTimeout(timeoutHandle);
    console.warn('[OG Image] Failed to render event OG image:', err?.message || err);
    return res.redirect(302, '/og-image.png');
  }
});

// Mark Notification as Read (own notifications only)
app.patch('/api/notifications/:id/read', async (req: Request, res: Response) => {
  const authUserId = resolveAuthUserId(req);
  const isAdmin = checkAdmin(req);
  if (!authUserId && !isAdmin) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { id } = req.params;
  const notif = (store.notifications || []).find((n: any) => n.id === id);
  if (!notif) {
    return res.status(404).json({ error: 'Notification not found' });
  }

  const myProfile = store.profiles.find((p: any) => p.account_uid === authUserId || p.id === authUserId);
  const myProfileId = myProfile?.id;
  const isOwner = authUserId === notif.to_id || myProfileId === notif.to_id;

  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: 'Forbidden: You can only modify your own notifications' });
  }

  notif.read = true;
  await persistDoc('notifications', notif.id, notif);
  if (storageMode === 'disk') saveStore(store);

  return res.json({ success: true, notification: notif });
});

app.post('/api/notifications/:id/read', async (req: Request, res: Response) => {
  const authUserId = resolveAuthUserId(req);
  const isAdmin = checkAdmin(req);
  if (!authUserId && !isAdmin) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { id } = req.params;
  const notif = (store.notifications || []).find((n: any) => n.id === id);
  if (!notif) {
    return res.status(404).json({ error: 'Notification not found' });
  }

  const myProfile = store.profiles.find((p: any) => p.account_uid === authUserId || p.id === authUserId);
  const myProfileId = myProfile?.id;
  const isOwner = authUserId === notif.to_id || myProfileId === notif.to_id;

  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: 'Forbidden: You can only modify your own notifications' });
  }

  notif.read = true;
  await persistDoc('notifications', notif.id, notif);
  if (storageMode === 'disk') saveStore(store);

  return res.json({ success: true, notification: notif });
});

// Polling Delta Sync Endpoint
app.get('/api/sync', (req: Request, res: Response) => {
  const callerId = resolveAuthUserId(req);
  const isAdmin = checkAdmin(req);
  const sinceQuery = req.query.since as string;
  const sinceTime = sinceQuery ? new Date(sinceQuery).getTime() : 0;

  // Filter profiles
  let activeProfiles = store.profiles.filter(p => !p.hidden);
  if (!isAdmin) {
    activeProfiles = activeProfiles.filter(p => Boolean(p.account_uid));
  }
  if (callerId) {
    const callerProfile = store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId);
    const callerBlockedSet = new Set(callerProfile?.blocked_ids || []);
    activeProfiles = activeProfiles.filter(p => {
      if (p.id === callerId || p.account_uid === callerId) return true;
      if (callerBlockedSet.has(p.id)) return false;
      if (Array.isArray(p.blocked_ids) && (p.blocked_ids.includes(callerId) || (callerProfile && p.blocked_ids.includes(callerProfile.id)))) return false;
      return true;
    });
  }

  const changedProfiles = sinceTime > 0
    ? activeProfiles.filter(p => {
        const created = new Date(p.created_at || 0).getTime();
        const updated = new Date(p.updated_at || p.created_at || 0).getTime();
        return updated > sinceTime || created > sinceTime;
      })
    : activeProfiles;

  const safeProfiles = changedProfiles.map(p => sanitizePublicProfile(p, callerId, isAdmin));

  // Filter posts
  const posts = store.posts || [];
  const changedPosts = sinceTime > 0
    ? posts.filter(p => new Date(p.created_at || 0).getTime() > sinceTime)
    : posts.slice(0, 100);

  // Filter notifications (if caller is signed in)
  const notifs = callerId
    ? (store.notifications || []).filter(n => n.to_id === callerId && (sinceTime === 0 || new Date(n.created_at || 0).getTime() > sinceTime))
    : [];

  const safePosts = changedPosts.map(p => sanitizePostForPublic(p, req));

  return res.json({
    timestamp: new Date().toISOString(),
    profiles: safeProfiles,
    posts: safePosts,
    notifications: notifs,
    counts: {
      members: activeProfiles.length,
      posts: posts.length
    },
    pinned_announcement: store.pinned_announcement || null
  });
});

/* =========================================================================
   EVENTS, OPPORTUNITIES & PINNED ANNOUNCEMENTS
   ========================================================================= */

// Pinned Announcement Endpoints
app.get('/api/announcement/pinned', (_req: Request, res: Response) => {
  return res.json({ announcement: store.pinned_announcement || null });
});

app.post('/api/admin/announcement/pin', (req: Request, res: Response) => {
  const admin = verifyAdmin(req, res);
  if (!admin) return;

  const { text, link } = req.body || {};
  if (!text || typeof text !== 'string' || !text.trim()) {
    return res.status(400).json({ error: 'Announcement text is required' });
  }

  const cleanText = sanitizeText(text, 300);
  const cleanLink = sanitizeUrl(link);

  store.pinned_announcement = {
    id: 'ann-' + Date.now(),
    text: cleanText,
    link: cleanLink || undefined,
    active: true,
    created_at: new Date().toISOString(),
    created_by: admin.adminName
  };

  const auditEntry = {
    id: newAuditId(),
    timestamp: new Date().toISOString(),
    action: 'PIN_ANNOUNCEMENT',
    details: `Pinned announcement: "${cleanText.slice(0, 60)}"`,
    admin: admin.adminName
  };
  store.audit_log.unshift(auditEntry);
  persistDoc('audit_log', auditEntry.id, auditEntry);

  if (storageMode === 'disk') saveStore(store);
  return res.json({ success: true, announcement: store.pinned_announcement });
});

app.post('/api/admin/announcement/unpin', (req: Request, res: Response) => {
  const admin = verifyAdmin(req, res);
  if (!admin) return;

  const prev = store.pinned_announcement?.text || '';
  store.pinned_announcement = null;

  const auditEntry = {
    id: newAuditId(),
    timestamp: new Date().toISOString(),
    action: 'UNPIN_ANNOUNCEMENT',
    details: `Unpinned announcement${prev ? `: "${prev.slice(0, 50)}"` : ''}`,
    admin: admin.adminName
  };
  store.audit_log.unshift(auditEntry);
  persistDoc('audit_log', auditEntry.id, auditEntry);

  if (storageMode === 'disk') saveStore(store);
  return res.json({ success: true, message: 'Announcement unpinned' });
});

// Admin Status endpoint: returns whether current caller is admin and if fallback is enabled
app.get('/api/admin/status', (req: Request, res: Response) => {
  const adminInfo = resolveAdminInfo(req);
  return res.json({
    isAdmin: adminInfo.isAdmin,
    adminName: adminInfo.adminName,
    adminEmail: adminInfo.adminEmail,
    fallbackEnabled: process.env.ADMIN_FALLBACK === 'true'
  });
});

// Admin Account Management: Add/Remove admins by email
app.get('/api/admin/admins', (req: Request, res: Response) => {
  const admin = verifyAdmin(req, res);
  if (!admin) return;

  const envEmails = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  return res.json({
    admin_emails: getAdminEmailsList(),
    env_admins: envEmails,
    stored_admins: store.admin_emails || []
  });
});

app.post('/api/admin/admins', async (req: Request, res: Response) => {
  const admin = verifyAdmin(req, res);
  if (!admin) return;

  const { email } = req.body || {};
  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid email address is required' });
  }

  const cleanEmail = email.trim().toLowerCase();
  if (!store.admin_emails) store.admin_emails = [];

  if (!store.admin_emails.includes(cleanEmail)) {
    store.admin_emails.push(cleanEmail);
    await persistStoredAdminEmails();

    const auditEntry = {
      id: newAuditId(),
      timestamp: new Date().toISOString(),
      action: 'ADD_ADMIN',
      details: `Added admin account: ${cleanEmail}`,
      admin: admin.adminName
    };
    store.audit_log.unshift(auditEntry);
    await persistDoc('audit_log', auditEntry.id, auditEntry);
  }

  return res.json({ success: true, admin_emails: getAdminEmailsList() });
});

app.delete('/api/admin/admins/:email', async (req: Request, res: Response) => {
  const admin = verifyAdmin(req, res);
  if (!admin) return;

  const targetEmail = req.params.email.trim().toLowerCase();
  if (store.admin_emails) {
    store.admin_emails = store.admin_emails.filter(e => e.trim().toLowerCase() !== targetEmail);
    await persistStoredAdminEmails();

    const auditEntry = {
      id: newAuditId(),
      timestamp: new Date().toISOString(),
      action: 'REMOVE_ADMIN',
      details: `Removed admin account: ${targetEmail}`,
      admin: admin.adminName
    };
    store.audit_log.unshift(auditEntry);
    await persistDoc('audit_log', auditEntry.id, auditEntry);
  }

  return res.json({ success: true, admin_emails: getAdminEmailsList() });
});

// Member suspension
app.post('/api/admin/members/:id/suspend', async (req: Request, res: Response) => {
  const admin = verifyAdmin(req, res);
  if (!admin) return;

  const { id } = req.params;
  const target = store.profiles.find((p: any) => p.id === id);
  if (!target) return res.status(404).json({ error: 'Member not found' });

  target.suspended = true;
  target.hidden = true;
  await persistDoc('profiles', target.id, target);

  const auditEntry = {
    id: newAuditId(),
    timestamp: new Date().toISOString(),
    action: 'SUSPEND_MEMBER',
    details: `Suspended member: ${target.name} (${target.id})`,
    admin: admin.adminName
  };
  store.audit_log.unshift(auditEntry);
  await persistDoc('audit_log', auditEntry.id, auditEntry);

  if (storageMode === 'disk') saveStore(store);
  return res.json({ success: true, message: `Member ${target.name} suspended.` });
});

app.post('/api/admin/members/:id/unsuspend', async (req: Request, res: Response) => {
  const admin = verifyAdmin(req, res);
  if (!admin) return;

  const { id } = req.params;
  const target = store.profiles.find((p: any) => p.id === id);
  if (!target) return res.status(404).json({ error: 'Member not found' });

  target.suspended = false;
  target.hidden = false;
  await persistDoc('profiles', target.id, target);

  const auditEntry = {
    id: newAuditId(),
    timestamp: new Date().toISOString(),
    action: 'UNSUSPEND_MEMBER',
    details: `Unsuspended member: ${target.name} (${target.id})`,
    admin: admin.adminName
  };
  store.audit_log.unshift(auditEntry);
  await persistDoc('audit_log', auditEntry.id, auditEntry);

  if (storageMode === 'disk') saveStore(store);
  return res.json({ success: true, message: `Member ${target.name} unsuspended.` });
});

// Events & Opportunities Endpoints
export type EventFormat = 'in_person' | 'online' | 'hybrid';
export type EventPhase = 'upcoming' | 'live' | 'past';

export interface EventReport {
  reporter_id: string;
  reason: string;
  note?: string;
  created_at: string;
}

export function canApproveEvent(isAdmin: boolean): boolean {
  return Boolean(isAdmin);
}

export function canEditEvent(
  callerId: string | null | undefined,
  itemAuthorId: string | null | undefined,
  isAdmin: boolean
): boolean {
  if (isAdmin) return true;
  if (!callerId || !itemAuthorId) return false;
  return callerId === itemAuthorId;
}

export function computeEventPhase(item: any, nowMs: number = Date.now()): EventPhase {
  if (item?.is_cancelled) {
    return 'past';
  }
  if (item?.kind === 'opportunity') {
    // Opportunities close after a readable deadline; without one they stay open
    const deadlineMs = getOpportunityDeadlineMs(item);
    return deadlineMs !== null && nowMs > deadlineMs ? 'past' : 'upcoming';
  }
  // Effective start: starts_at -> parsed legacy datetime text -> created_at
  const startMs = getEffectiveStartMs(item);
  const endMs = getEffectiveEndMs(item);
  if (nowMs < startMs) {
    return 'upcoming';
  }
  if (nowMs <= endMs) {
    return 'live';
  }
  return 'past';
}

/**
 * Converts entered wall-clock date and time in the selected IANA timezone to UTC ISO 8601 string.
 * Uses Intl.DateTimeFormat to determine the target zone's exact UTC offset at that moment (no date library),
 * handling daylight-saving transitions correctly.
 */
export function zonedTimeToUtcIso(date: string, time: string, timeZone: string): string {
  if (!date || !time) return '';
  const [y, m, d] = date.split('-').map(Number);
  const [hr, min, sec = 0] = time.split(':').map(Number);
  const targetLocalMs = Date.UTC(y, m - 1, d, hr, min, sec);

  let safeTz = timeZone || 'Africa/Kampala';
  try {
    Intl.DateTimeFormat(undefined, { timeZone: safeTz });
  } catch {
    safeTz = 'Africa/Kampala';
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: safeTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  });

  const getLocalMs = (utcMs: number): number => {
    const parts = formatter.formatToParts(new Date(utcMs));
    const p: Record<string, number> = {};
    for (const part of parts) {
      if (part.type !== 'literal') {
        p[part.type] = Number(part.value);
      }
    }
    const h = p.hour === 24 ? 0 : p.hour;
    return Date.UTC(p.year, p.month - 1, p.day, h, p.minute, p.second);
  };

  // Step 1: Initial offset approximation
  let offset = getLocalMs(targetLocalMs) - targetLocalMs;
  let utcMs = targetLocalMs - offset;

  // Step 2: Refine offset at the estimated UTC instant (handles DST transitions)
  offset = getLocalMs(utcMs) - utcMs;
  utcMs = targetLocalMs - offset;

  return new Date(utcMs).toISOString();
}

export function sanitizeEventTags(rawTags: any): string[] {
  if (!rawTags) return [];
  const arr = Array.isArray(rawTags)
    ? rawTags
    : typeof rawTags === 'string'
    ? rawTags.split(',')
    : [];
  const result: string[] = [];
  for (const raw of arr) {
    const cleaned = String(raw || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 24);
    if (cleaned.length > 0 && !result.includes(cleaned)) {
      result.push(cleaned);
      if (result.length >= 5) break;
    }
  }
  return result;
}

export function validateMapLink(rawUrl: any): { valid: boolean; url?: string; error?: string } {
  if (rawUrl === undefined || rawUrl === null || String(rawUrl).trim() === '') {
    return { valid: true, url: undefined };
  }
  const str = String(rawUrl).trim();
  let parsed: URL;
  try {
    parsed = new URL(str);
  } catch {
    return { valid: false, error: 'Map link must be a valid https:// Google Maps or OpenStreetMap URL.' };
  }
  if (parsed.protocol !== 'https:') {
    return { valid: false, error: 'Map link must use https://.' };
  }
  const host = parsed.hostname.toLowerCase();
  const isGoogleMaps =
    host === 'maps.google.com' ||
    host.startsWith('maps.google.') ||
    host === 'maps.app.goo.gl' ||
    (host === 'goo.gl' && parsed.pathname.startsWith('/maps')) ||
    ((host === 'google.com' ||
      host === 'www.google.com' ||
      /^www\.google\.[a-z.]+$/.test(host) ||
      /^google\.[a-z.]+$/.test(host)) &&
      parsed.pathname.startsWith('/maps'));
  const isOpenStreetMap =
    host === 'openstreetmap.org' ||
    host === 'www.openstreetmap.org' ||
    host.endsWith('.openstreetmap.org') ||
    host === 'osm.org' ||
    host === 'www.osm.org';

  if (!isGoogleMaps && !isOpenStreetMap) {
    return { valid: false, error: 'Map link must be a Google Maps or OpenStreetMap URL.' };
  }
  return { valid: true, url: parsed.toString() };
}

export function validateEventTimesAndFormat(
  raw: any,
  isUpdate = false,
  existingItem?: any
): {
  valid: boolean;
  error?: string;
  starts_at?: string;
  ends_at?: string;
  timezone?: string;
  format?: EventFormat;
  location?: string;
  join_link?: string;
  time_needs_update?: boolean;
} {
  if (raw.kind === 'opportunity') {
    return { valid: true };
  }

  // Handle format: 'in_person' | 'online' | 'hybrid'
  let format: EventFormat = raw.format || existingItem?.format || 'in_person';
  if (!['in_person', 'online', 'hybrid'].includes(format)) {
    return { valid: false, error: 'Event format must be in_person, online, or hybrid.' };
  }

  // Handle timezone
  let timezone = raw.timezone || existingItem?.timezone || 'Africa/Kampala';
  try {
    Intl.DateTimeFormat(undefined, { timeZone: timezone });
  } catch {
    timezone = 'Africa/Kampala';
  }

  // Handle location / venue and join_link
  const rawLocationInput = raw.venue !== undefined ? raw.venue : raw.location;
  let location = rawLocationInput !== undefined
    ? sanitizeText(rawLocationInput, 200)
    : (existingItem?.venue || existingItem?.location);
  let join_link = raw.join_link !== undefined ? sanitizeHttpsUrl(raw.join_link) : existingItem?.join_link;

  if (format === 'in_person' || format === 'hybrid') {
    if (!location || location.trim().length < 5) {
      return { valid: false, error: 'A venue / address (at least 5 characters) is required for in-person and hybrid events.' };
    }
  }

  if (format === 'online' || format === 'hybrid') {
    if (!join_link) {
      return { valid: false, error: 'A valid https:// join link is required for online and hybrid events.' };
    }
  }

  // Handle timestamps
  let starts_at = raw.starts_at || (raw.start_date && raw.start_time ? zonedTimeToUtcIso(raw.start_date, raw.start_time, timezone) : undefined);
  let ends_at = raw.ends_at || (raw.end_date && raw.end_time ? zonedTimeToUtcIso(raw.end_date, raw.end_time, timezone) : undefined);

  if (!starts_at && existingItem?.starts_at) {
    starts_at = existingItem.starts_at;
  }
  if (!ends_at && existingItem?.ends_at) {
    ends_at = existingItem.ends_at;
  }

  // If no starts_at is provided, check if legacy text field exists
  if (!starts_at) {
    if (raw.datetime || existingItem?.datetime) {
      return {
        valid: true,
        timezone,
        format,
        location,
        join_link,
        time_needs_update: true
      };
    }
    return { valid: false, error: 'Start date and start time are required.' };
  }

  const startDate = new Date(starts_at);
  if (isNaN(startDate.getTime())) {
    return { valid: false, error: 'Invalid start date or time.' };
  }

  // Start cannot be in the past when creating
  if (!isUpdate && startDate.getTime() < Date.now() - 5 * 60 * 1000) {
    return { valid: false, error: 'Start time cannot be in the past.' };
  }

  // If member leaves the end empty, set it to start + 2 hours
  if (!ends_at) {
    ends_at = new Date(startDate.getTime() + 2 * 60 * 60 * 1000).toISOString();
  }

  const endDate = new Date(ends_at);
  if (isNaN(endDate.getTime())) {
    return { valid: false, error: 'Invalid end date or time.' };
  }

  if (endDate.getTime() <= startDate.getTime()) {
    return { valid: false, error: 'End time must be after start time.' };
  }

  return {
    valid: true,
    starts_at: startDate.toISOString(),
    ends_at: endDate.toISOString(),
    timezone,
    format,
    location,
    join_link,
    time_needs_update: false
  };
}

export function filterEventsForCaller(
  events: any[],
  callerId: string | null | undefined,
  isAdmin: boolean,
  callerAltId?: string | null | undefined
): any[] {
  if (isAdmin) return Array.isArray(events) ? [...events] : [];
  return (events || []).filter((item: any) => {
    // Auto-hidden by moderation (3+ distinct reports)
    if (item.hidden_by_moderation) {
      const isAuthor = Boolean(
        (callerId && item.author_id === callerId) ||
        (callerAltId && item.author_id === callerAltId)
      );
      return isAuthor; // Visible ONLY to author and admins (admins checked above)
    }

    // Pending or rejected submissions are visible ONLY to their author and admins
    if (item.status === 'pending' || item.status === 'rejected') {
      const isAuthor = Boolean(
        (callerId && item.author_id === callerId) ||
        (callerAltId && item.author_id === callerAltId)
      );
      return isAuthor;
    }
    return item.published !== false && item.status !== 'rejected';
  });
}

export function getCombinedWaitlistQueue(item: any): Array<{
  kind: 'member' | 'guest';
  id: string;
  timestamp: string;
  seq: number;
}> {
  if (!item) return [];
  const entries: Array<{ kind: 'member' | 'guest'; id: string; timestamp: string; seq: number }> = [];
  let seq = 0;

  const waitlistIds = Array.isArray(item.waitlist_ids) ? item.waitlist_ids : [];
  const waitlistTimes = (item.waitlist_times && typeof item.waitlist_times === 'object') ? item.waitlist_times : {};
  for (const mId of waitlistIds) {
    entries.push({
      kind: 'member',
      id: mId,
      timestamp: waitlistTimes[mId] || item.created_at || '1970-01-01T00:00:00.000Z',
      seq: seq++
    });
  }

  const waitlistedGuests = (store.event_guests || []).filter(
    (g: any) => g.event_id === item.id && g.status === 'waitlist'
  );
  for (const g of waitlistedGuests) {
    entries.push({
      kind: 'guest',
      id: g.id,
      timestamp: g.waitlist_at || g.created_at || '1970-01-01T00:00:00.000Z',
      seq: seq++
    });
  }

  entries.sort((a, b) => {
    const cmp = String(a.timestamp).localeCompare(String(b.timestamp));
    return cmp !== 0 ? cmp : a.seq - b.seq;
  });

  return entries;
}

export function getWaitlistPosition(item: any, kind: 'member' | 'guest', targetId: string, altId?: string | null): number | null {
  const queue = getCombinedWaitlistQueue(item);
  const idx = queue.findIndex(
    e => e.kind === kind && (e.id === targetId || (altId ? e.id === altId : false))
  );
  return idx >= 0 ? idx + 1 : null;
}

export function canViewHostContact(item: any, callerId?: string | null, isAdmin: boolean = false, guestToken?: string): boolean {
  if (!item) return false;
  if (isAdmin) return true;
  if (callerId) {
    const callerProfile = store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId);
    const callerProfileId = callerProfile?.id || callerId;
    if (item.author_id === callerProfileId || item.author_id === callerId) return true;
    const attendeeIds = Array.isArray(item.attendee_ids) ? item.attendee_ids : [];
    if (attendeeIds.includes(callerProfileId) || attendeeIds.includes(callerId)) return true;
  }
  if (guestToken) {
    const tokenHash = crypto.createHash('sha256').update(guestToken).digest('hex');
    const isValidGuest = (store.event_guests || []).some(
      (g: any) => g.event_id === item.id && g.token_hash === tokenHash && g.status !== 'waitlist'
    );
    if (isValidGuest) return true;
  }
  return false;
}

export function sanitizeEventForPublic(
  item: any,
  callerId?: string | null,
  isAllowedContact?: boolean,
  isAdmin: boolean = false
): any {
  if (!item) return item;

  let callerProfileId = callerId;
  if (callerId) {
    const callerProfile = store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId);
    if (callerProfile) callerProfileId = callerProfile.id;
  }

  const isAuthor = Boolean(
    callerId && (
      item.author_id === callerId ||
      (callerProfileId && item.author_id === callerProfileId)
    )
  );

  const attendeeIds = Array.isArray(item.attendee_ids) ? item.attendee_ids : [];
  const isAttending = Boolean(
    callerId && (
      attendeeIds.includes(callerId) ||
      (callerProfileId && attendeeIds.includes(callerProfileId))
    )
  );

  const canSeeAttendees = isAdmin || isAuthor || isAttending;
  const canSeeInternalFields = isAdmin || isAuthor;

  const phase = computeEventPhase(item);
  const isPast = phase === 'past';
  const hasRealTimes = Boolean(item.starts_at && item.ends_at);

  const guestCount = (store.event_guests || []).filter(
    (g: any) => g.event_id === item.id && g.status !== 'waitlist'
  ).length;
  const totalAttendeeCount = attendeeIds.length + guestCount;

  const waitlistQueue = getCombinedWaitlistQueue(item);
  const waitlistCount = waitlistQueue.length;
  const myWaitlistPosition = callerId
    ? getWaitlistPosition(item, 'member', callerProfileId || callerId, callerId)
    : null;

  const coverImage = item.cover_image
    ? (item.cover_image.startsWith('/') ? item.cover_image : `/api/event-image/${item.id}`)
    : undefined;

  return {
    id: item.id,
    kind: item.kind || 'event',
    title: item.title,
    description: item.description,
    format: item.format,
    location: item.location || item.venue,
    venue: item.venue || item.location,
    map_link: item.map_link,
    tags: Array.isArray(item.tags) ? item.tags : [],
    starts_at: item.starts_at,
    ends_at: item.ends_at,
    timezone: item.timezone,
    start_date: item.start_date,
    start_time: item.start_time,
    end_date: item.end_date,
    end_time: item.end_time,
    datetime: item.datetime,
    deadline: item.deadline,
    link: item.link,
    registration_link: item.registration_link,
    capacity: item.capacity,
    waitlist_enabled: item.waitlist_enabled !== false,
    waitlist_count: waitlistCount,
    my_waitlist_position: myWaitlistPosition,
    author_id: item.author_id,
    author_name: item.author_name,
    published: item.published,
    status: item.status,
    is_cancelled: item.is_cancelled,
    cancellation_reason: item.cancellation_reason,
    created_at: item.created_at,
    updated_at: item.updated_at,
    phase,
    time_needs_update: !hasRealTimes && item.kind === 'event',
    cover_image: coverImage,
    guest_count: guestCount,
    attendee_count: totalAttendeeCount,
    i_am_going: isAttending,
    self_checkin_enabled: Boolean(item.self_checkin_enabled),
    checkin_configured: isCheckinConfigured(),
    allow_walkins: item.allow_walkins !== false,
    checked_in_count: canSeeInternalFields
      ? (store.event_checkins || []).filter((c: any) => c.event_id === item.id).length
      : undefined,

    // Conditional fields
    join_link: (!callerId || isPast) ? undefined : item.join_link,
    contact_phone: isAllowedContact ? item.contact_phone : undefined,
    contact_email: isAllowedContact ? item.contact_email : undefined,

    // Attendee lists: author, admins, and RSVPed members only
    attendee_ids: canSeeAttendees ? item.attendee_ids : undefined,
    attendees: canSeeAttendees ? item.attendees : undefined,

    // Moderation & internal fields: author and admins only
    hidden_reason: canSeeInternalFields ? item.hidden_reason : undefined,
    report_count: canSeeInternalFields ? (Array.isArray(item.reports) ? item.reports.length : (item.report_count || 0)) : undefined,
    under_review: canSeeInternalFields ? Boolean(item.under_review || (item.hidden_by_moderation && !item.reviewed_by_admin)) : undefined,
    reviewed_by_admin: canSeeInternalFields ? item.reviewed_by_admin : undefined,
    approved_by: canSeeInternalFields ? item.approved_by : undefined,
    rejection_reason: canSeeInternalFields ? item.rejection_reason : undefined,
    events_blocked: canSeeInternalFields ? item.events_blocked : undefined
  };
}

/* =========================================================================
   RELEASE 1.8.0: PERSONAL TICKETS, CHECK-IN, ROTATING QR & CONFIRMATION EMAIL
   ========================================================================= */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const TEST_PER_RUN_TICKET_SECRET = crypto.randomBytes(32).toString('hex');

export function getTicketSecret(): string {
  const envSecret = process.env.TICKET_HMAC_SECRET;
  if (envSecret && envSecret.length >= 32) {
    return envSecret;
  }
  if (isTestEnv() && process.env.NODE_ENV !== 'production' && envSecret === undefined) {
    return TEST_PER_RUN_TICKET_SECRET;
  }
  return '';
}

export function isCheckinConfigured(): boolean {
  return getTicketSecret().length >= 32;
}

export function deriveTicketCode(eventId: string, holderKey: string, salt: string): string {
  const secret = getTicketSecret();
  if (!secret) return '';
  const digest = crypto
    .createHmac('sha256', secret)
    .update(`${eventId}:${holderKey}:${salt}`)
    .digest();
  let out = '';
  for (let i = 0; i < 10; i++) {
    out += BASE32_ALPHABET[digest[i] % 32];
  }
  return out;
}

export function hashTicketCode(code: string): string {
  return crypto.createHash('sha256').update(normalizeTicketCode(code)).digest('hex');
}

export function isWithinCheckinWindow(item: any, nowMs: number = Date.now()): boolean {
  const startRaw = item.starts_at || item.datetime || item.created_at;
  const startMs = startRaw ? new Date(startRaw).getTime() : nowMs;
  const endMs = item.ends_at ? new Date(item.ends_at).getTime() : (startMs + 2 * 60 * 60 * 1000);
  const threeHoursBefore = startMs - 3 * 60 * 60 * 1000;
  const sixHoursAfter = endMs + 6 * 60 * 60 * 1000;
  return nowMs >= threeHoursBefore && nowMs <= sixHoursAfter;
}

function computeWindowHmac(eventId: string, windowNum: number): string {
  const secret = getTicketSecret();
  if (!secret) return '';
  return crypto
    .createHmac('sha256', secret)
    .update(`self-checkin:${eventId}:${windowNum}`)
    .digest('hex')
    .slice(0, 32);
}

export function generateSelfCheckinToken(eventId: string, timestampMs: number = Date.now()): string {
  const windowNum = Math.floor(timestampMs / 30000);
  const sig = computeWindowHmac(eventId, windowNum);
  return `${windowNum}.${sig}`;
}

export function verifySelfCheckinToken(
  eventId: string,
  token: string,
  nowMs: number = Date.now()
): { valid: boolean; expired?: boolean } {
  if (!token || typeof token !== 'string') return { valid: false };
  const trimmed = token.trim();
  const nowWindow = Math.floor(nowMs / 30000);

  if (trimmed.includes('.')) {
    const [wStr, sig] = trimmed.split('.');
    const wNum = Number(wStr);
    if (!Number.isInteger(wNum) || !sig) return { valid: false };
    const expected = computeWindowHmac(eventId, wNum);
    if (sig !== expected) return { valid: false };
    if (wNum === nowWindow || wNum === nowWindow - 1) {
      return { valid: true };
    }
    if (wNum < nowWindow - 1) {
      return { valid: false, expired: true };
    }
    return { valid: false };
  }

  // Also support raw HMAC tokens without window prefix
  if (trimmed === computeWindowHmac(eventId, nowWindow) || trimmed === computeWindowHmac(eventId, nowWindow - 1)) {
    return { valid: true };
  }
  for (let k = 2; k <= 240; k++) {
    if (trimmed === computeWindowHmac(eventId, nowWindow - k)) {
      return { valid: false, expired: true };
    }
  }
  return { valid: false };
}

export function generateEventIcsContent(item: any): string {
  const toIcsUtc = (iso?: string) => {
    const d = iso ? new Date(iso) : new Date();
    if (isNaN(d.getTime())) return new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  };
  const startUtc = toIcsUtc(item.starts_at || item.datetime || item.created_at);
  const endUtc = item.ends_at
    ? toIcsUtc(item.ends_at)
    : toIcsUtc(new Date(new Date(item.starts_at || item.datetime || Date.now()).getTime() + 7200000).toISOString());
  const loc = item.format === 'online' ? (item.join_link || 'Online') : (item.venue || item.location || 'Kampala');
  const clean = (s: string) => String(s || '').replace(/\r?\n/g, '\\n');
  const shareUrl = `${getPublicAppUrl()}/e/${item.id}`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Kwegatta//Events//EN',
    'BEGIN:VEVENT',
    `UID:${item.id}@kwegatta.ai.studio`,
    `DTSTAMP:${toIcsUtc(new Date().toISOString())}`,
    `DTSTART:${startUtc}`,
    `DTEND:${endUtc}`,
    `SUMMARY:${clean(item.title)}`,
    `DESCRIPTION:${clean(item.description)}`,
    `LOCATION:${clean(loc)}`,
    `URL:${shareUrl}`,
    'END:VEVENT',
    'END:VCALENDAR'
  ].join('\r\n');
}

let testMailSender: ((mailOptions: any) => Promise<any>) | null = null;
export function setMailSenderForTest(fn: ((mailOptions: any) => Promise<any>) | null): void {
  if (isTestEnv()) {
    testMailSender = fn;
  }
}

let dailyEmailDateKey = '';
let dailyEmailCount = 0;
const DAILY_EMAIL_LIMIT = 400;

export const EMAIL_FROM_NAME = 'Kwegatta Events';

/** "Kwegatta Events <user@host>", or '' when SMTP is not configured. */
export function buildEmailFrom(smtpUser: string): string {
  const user = String(smtpUser || '').trim();
  return user ? `"${EMAIL_FROM_NAME}" <${user}>` : '';
}

/** Short reason for logs: error code or message with any address or secret removed. */
export function emailFailureReason(err: any): string {
  const raw = String(err?.code || err?.message || err || 'unknown error');
  let reason = raw.replace(/[^\s<>"']+@[^\s<>"']+/g, '[address]');
  const pass = process.env.SMTP_PASS?.trim();
  if (pass) reason = reason.split(pass).join('[secret]');
  return reason.slice(0, 200);
}

/** "Sat, 14 Nov 2026 · 2:00 PM EAT" in the event's own timezone. */
export function formatEmailEventDate(item: any): string {
  const raw = item?.starts_at || item?.datetime || '';
  const d = raw ? new Date(raw) : null;
  if (!d || isNaN(d.getTime())) return 'See event page';
  const tz = String(item?.timezone || '').trim() || 'Africa/Kampala';
  const fmt = (timeZone: string) => {
    const parts = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone }).formatToParts(d);
    const get = (t: string) => parts.find(p => p.type === t)?.value || '';
    const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone })
      .format(d)
      .replace(/ | /g, ' ');
    return `${get('weekday')}, ${get('day')} ${get('month')} ${get('year')} · ${time}`;
  };
  try {
    return `${fmt(tz)} ${formatTzLabel(tz, d)}`;
  } catch (_) {
    return `${fmt('UTC')} UTC`;
  }
}

function safeEmailHref(url: any): string {
  const s = String(url || '').trim();
  return /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s : '';
}

export type EventEmailKind = 'confirmation' | 'promotion' | 'cancelled';

/** Builds subject, plain-text and HTML bodies. All user text is escaped in the HTML part. */
export function buildEventEmail(
  kind: EventEmailKind,
  item: any,
  recipientName: string,
  ticketUrl: string
): { subject: string; text: string; html: string } {
  const title = String(item?.title || 'Event');
  const name = String(recipientName || '').trim() || 'there';
  const when = formatEmailEventDate(item);
  const isOnline = item?.format === 'online';
  const joinLink = isOnline ? safeEmailHref(item?.join_link) : '';
  const venue = isOnline ? '' : String(item?.venue || item?.location || 'See event page');
  const organiser = String(item?.author_name || item?.created_by || '').trim();
  const eventUrl = `${getPublicAppUrl()}/e/${encodeURIComponent(String(item?.id || ''))}`;
  const ticketHref = safeEmailHref(ticketUrl) || eventUrl;

  const subject = kind === 'promotion'
    ? `A spot opened up: ${title}`
    : kind === 'cancelled'
    ? `Registration cancelled: ${title}`
    : `Confirmation: ${title}`;
  const lead = kind === 'promotion'
    ? `A spot opened up. You're now registered for "${title}" on Kwegatta.`
    : kind === 'cancelled'
    ? `Your registration for "${title}" on Kwegatta has been cancelled. Your ticket is no longer valid.`
    : `You are registered for "${title}" on Kwegatta.`;
  const placeText = isOnline
    ? `Online link: ${joinLink || 'Provided on event page'}`
    : `Venue: ${venue}`;
  const footer = 'You received this because you registered on Kwegatta. Reply to contact the organiser.';

  const text = [
    `Hi ${name},`,
    '',
    lead,
    `Date & Time: ${when}`,
    placeText,
    ...(organiser ? [`Organiser: ${organiser}`] : []),
    '',
    `Event page: ${eventUrl}`,
    ...(kind === 'cancelled'
      ? ['Changed your mind? You can register again from the event page while spots are open.']
      : [`View your ticket: ${ticketHref}`, '', 'An .ics calendar invite is attached to this email.']),
    '',
    footer
  ].join('\n');

  const e = escapeHtml;
  const row = (label: string, valueHtml: string) =>
    `<tr><td style="padding:4px 0;color:#6b7280;font-size:13px;width:90px;vertical-align:top;">${label}</td><td style="padding:4px 0;color:#111827;font-size:14px;">${valueHtml}</td></tr>`;
  const placeHtml = isOnline
    ? (joinLink ? `<a href="${e(joinLink)}" style="color:#0f766e;word-break:break-all;">${e(joinLink)}</a>` : 'Provided on event page')
    : e(venue);
  const button = (href: string, label: string) =>
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 8px;"><tr><td style="border-radius:8px;background:#0f766e;"><a href="${e(href)}" style="display:inline-block;padding:14px 28px;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;border-radius:8px;">${label}</a></td></tr></table>`;

  const html = [
    '<!doctype html>',
    '<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + e(subject) + '</title></head>',
    '<body style="margin:0;padding:0;background:#f3f4f6;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f4f6;"><tr><td align="center" style="padding:16px 8px;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:12px;font-family:Arial,Helvetica,sans-serif;">',
    '<tr><td style="padding:20px 24px;border-bottom:1px solid #e5e7eb;"><span style="font-size:22px;font-weight:bold;color:#0f766e;letter-spacing:0.5px;">Kwegatta</span></td></tr>',
    '<tr><td style="padding:24px;">',
    `<p style="margin:0 0 12px;font-size:15px;color:#111827;">Hi ${e(name)},</p>`,
    `<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.5;">${e(lead)}</p>`,
    `<h1 style="margin:0 0 12px;font-size:20px;line-height:1.3;color:#111827;">${e(title)}</h1>`,
    '<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">',
    row('When', e(when)),
    row(isOnline ? 'Online' : 'Venue', placeHtml),
    ...(organiser ? [row('Organiser', e(organiser))] : []),
    '</table>',
    kind === 'cancelled'
      ? button(eventUrl, 'View event')
      : button(ticketHref, 'View your ticket'),
    kind === 'cancelled'
      ? '<p style="margin:8px 0 0;font-size:13px;color:#6b7280;">Changed your mind? You can register again from the event page while spots are open.</p>'
      : '<p style="margin:8px 0 0;font-size:13px;color:#6b7280;">Add to calendar: open the attached event.ics file.</p>',
    `<p style="margin:12px 0 0;font-size:13px;color:#6b7280;">Event page: <a href="${e(eventUrl)}" style="color:#0f766e;word-break:break-all;">${e(eventUrl)}</a></p>`,
    '</td></tr>',
    `<tr><td style="padding:16px 24px;border-top:1px solid #e5e7eb;font-size:12px;color:#9ca3af;line-height:1.5;">${e(footer)}</td></tr>`,
    '</table></td></tr></table></body></html>'
  ].join('');

  return { subject, text, html };
}

/** Sends one message with the shared daily cap. Logs only "[Email] sent" or "[Email] failed: <reason>". */
async function deliverEventEmail(mailOptions: any): Promise<boolean> {
  const smtpUser = process.env.SMTP_USER ? process.env.SMTP_USER.trim() : '';
  const smtpPass = process.env.SMTP_PASS ? process.env.SMTP_PASS.trim() : '';
  if (!smtpUser || !smtpPass) {
    // Silently disabled when SMTP credentials are not configured
    return false;
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  if (dailyEmailDateKey !== todayKey) {
    dailyEmailDateKey = todayKey;
    dailyEmailCount = 0;
  }
  if (dailyEmailCount >= DAILY_EMAIL_LIMIT) {
    return false;
  }

  const fullOptions = { ...mailOptions, from: buildEmailFrom(smtpUser) };
  try {
    if (isTestEnv() && testMailSender) {
      await testMailSender(fullOptions);
    } else {
      const smtpHost = process.env.SMTP_HOST?.trim() || 'smtp.gmail.com';
      const smtpPort = Number(process.env.SMTP_PORT) || 465;
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });
      await transporter.sendMail(fullOptions);
    }
    dailyEmailCount++;
    console.log('[Email] sent');
    return true;
  } catch (err: any) {
    console.warn(`[Email] failed: ${emailFailureReason(err)}`);
    return false;
  }
}

export async function sendEventConfirmationEmail(
  item: any,
  recipientEmail: string | undefined,
  recipientName: string,
  ticketUrl: string,
  isPromotion: boolean = false
): Promise<boolean> {
  if (!recipientEmail || !recipientEmail.includes('@')) return false;
  const { subject, text, html } = buildEventEmail(isPromotion ? 'promotion' : 'confirmation', item, recipientName, ticketUrl);
  return deliverEventEmail({
    to: recipientEmail,
    ...(item.contact_email ? { replyTo: item.contact_email } : {}),
    subject,
    text,
    html,
    attachments: [
      {
        filename: 'event.ics',
        content: generateEventIcsContent(item),
        contentType: 'text/calendar; charset=utf-8'
      }
    ]
  });
}

export async function sendRegistrationCancelledEmail(
  item: any,
  recipientEmail: string | undefined,
  recipientName: string
): Promise<boolean> {
  if (!recipientEmail || !recipientEmail.includes('@')) return false;
  const { subject, text, html } = buildEventEmail('cancelled', item, recipientName, '');
  return deliverEventEmail({
    to: recipientEmail,
    ...(item.contact_email ? { replyTo: item.contact_email } : {}),
    subject,
    text,
    html
  });
}

export async function promoteFromWaitlist(eventOrId: string | any): Promise<number> {
  const eventId = typeof eventOrId === 'string' ? eventOrId : eventOrId?.id;
  if (!eventId) return 0;
  const item =
    typeof eventOrId === 'object' && eventOrId
      ? eventOrId
      : (store.events || []).find((e: any) => e.id === eventId);
  if (!item || item.is_cancelled) return 0;

  if (!Array.isArray(item.attendee_ids)) item.attendee_ids = [];
  if (!Array.isArray(item.waitlist_ids)) item.waitlist_ids = [];
  if (!item.waitlist_times || typeof item.waitlist_times !== 'object') item.waitlist_times = {};
  if (!item.rsvp_times || typeof item.rsvp_times !== 'object') item.rsvp_times = {};
  if (!item.member_ticket_hashes || typeof item.member_ticket_hashes !== 'object') item.member_ticket_hashes = {};

  let promotedCount = 0;

  while (true) {
    const queue = getCombinedWaitlistQueue(item);
    if (queue.length === 0) break;

    const regGuestCount = (store.event_guests || []).filter(
      (g: any) => g.event_id === eventId && g.status !== 'waitlist'
    ).length;
    const currentTotal = item.attendee_ids.length + regGuestCount;

    if (item.capacity && item.capacity > 0 && currentTotal >= item.capacity) {
      break;
    }

    const next = queue[0];
    const promotedAt = new Date().toISOString();

    if (next.kind === 'member') {
      item.waitlist_ids = item.waitlist_ids.filter((wId: string) => wId !== next.id);
      delete item.waitlist_times[next.id];

      if (!item.attendee_ids.includes(next.id)) {
        item.attendee_ids.push(next.id);
        item.rsvp_times[next.id] = promotedAt;
        const code = deriveTicketCode(eventId, `member:${next.id}`, promotedAt);
        item.member_ticket_hashes[next.id] = hashTicketCode(code);
        await persistDoc('events', item.id, item);

        const memberProfile = store.profiles.find((p: any) => p.id === next.id || p.account_uid === next.id);
        const notif = {
          id: 'notif-promo-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'),
          to_id: memberProfile?.id || next.id,
          from_id: item.author_id || 'organiser',
          type: 'waitlist_promoted',
          body: `A spot opened up — you're now registered for ${item.title}.`,
          link: `${getPublicAppUrl()}/e/${eventId}`,
          event_id: eventId,
          read: false,
          created_at: promotedAt
        };
        store.notifications.unshift(notif);
        await persistDoc('notifications', notif.id, notif);

        if (memberProfile?.email) {
          const ticketUrl = `${getPublicAppUrl()}/#/events/${eventId}/ticket`;
          await sendEventConfirmationEmail(item, memberProfile.email, memberProfile.name || 'Member', ticketUrl, true);
        }
        promotedCount++;
      } else {
        await persistDoc('events', item.id, item);
      }
    } else {
      const guestRec = (store.event_guests || []).find((g: any) => g.event_id === eventId && g.id === next.id);
      if (!guestRec || guestRec.status !== 'waitlist') {
        break;
      }
      guestRec.status = 'registered';
      const code = deriveTicketCode(eventId, `guest:${guestRec.id}`, guestRec.created_at || promotedAt);
      guestRec.code_hash = hashTicketCode(code);
      await persistDoc('event_guests', guestRec.id, guestRec);

      if (guestRec.email) {
        const ticketUrl = `${getPublicAppUrl()}/e/${eventId}`;
        await sendEventConfirmationEmail(item, guestRec.email, guestRec.name || 'Guest', ticketUrl, true);
      }
      promotedCount++;
    }
  }

  return promotedCount;
}

app.get('/api/events', (req: Request, res: Response) => {
  const isAdmin = checkAdmin(req);
  const callerId = resolveAuthUserId(req);
  const callerProfile = callerId ? store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId) : null;
  const callerProfileId = callerProfile?.id || callerId;

  let list = Array.isArray(store.events) ? [...store.events] : [];

  if (!isAdmin) {
    list = filterEventsForCaller(list, callerProfileId || callerId, false);
  }

  const searchQ = typeof req.query.q === 'string'
    ? req.query.q.trim().toLowerCase()
    : typeof req.query.search === 'string'
    ? req.query.search.trim().toLowerCase()
    : typeof req.query.tag === 'string'
    ? req.query.tag.trim().toLowerCase()
    : '';

  if (searchQ) {
    list = list.filter((ev: any) => {
      const titleMatch = String(ev.title || '').toLowerCase().includes(searchQ);
      const descMatch = String(ev.description || '').toLowerCase().includes(searchQ);
      const locMatch = String(ev.location || ev.venue || '').toLowerCase().includes(searchQ);
      const tagMatch = Array.isArray(ev.tags) && ev.tags.some((t: string) => String(t).toLowerCase().includes(searchQ));
      return titleMatch || descMatch || locMatch || tagMatch;
    });
  }

  // Sort: upcoming and live by effective start ascending (opportunities by deadline),
  // past items after them, most recent first
  const now = Date.now();
  const upcomingList = sortForTab(list.filter((ev: any) => computeEventPhase(ev, now) !== 'past'), 'upcoming');
  const pastList = sortForTab(list.filter((ev: any) => computeEventPhase(ev, now) === 'past'), 'past');
  list = [...upcomingList, ...pastList];

  const sanitizedList = list.map((ev: any) => {
    const isAllowed = canViewHostContact(ev, callerId, isAdmin);
    return sanitizeEventForPublic(ev, callerId, isAllowed, isAdmin);
  });
  return res.json(sanitizedList);
});

function buildWaitlistDetails(item: any): any[] {
  const queue = getCombinedWaitlistQueue(item);
  return queue.map((entry, idx) => {
    if (entry.kind === 'member') {
      const prof = store.profiles.find((p: any) => p.id === entry.id || p.account_uid === entry.id);
      return {
        position: idx + 1,
        kind: 'member',
        type: 'member',
        id: prof?.id || entry.id,
        name: prof?.name || 'Member',
        avatar: prof ? `/api/avatar/${prof.id}` : undefined,
        role: prof?.role,
        headline: prof?.headline,
        created_at: entry.timestamp
      };
    } else {
      const g = (store.event_guests || []).find((guest: any) => guest.event_id === item.id && guest.id === entry.id);
      return {
        position: idx + 1,
        kind: 'guest',
        type: 'guest',
        id: g?.id || entry.id,
        name: g?.name || 'Guest',
        email: g?.email,
        phone: g?.phone,
        waitlist_at: g?.waitlist_at || g?.created_at || entry.timestamp,
        created_at: g?.waitlist_at || g?.created_at || entry.timestamp
      };
    }
  });
}

app.get('/api/events/:id', (req: Request, res: Response) => {
  cleanupExpiredGuestRecords();
  const { id } = req.params;
  const callerId = resolveAuthUserId(req);
  const isAdmin = checkAdmin(req);
  const callerProfile = callerId ? store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId) : null;
  const callerProfileId = callerProfile?.id || callerId;

  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) {
    return res.status(404).json({ error: 'Event or Opportunity not found' });
  }

  const isAuthor = Boolean(callerProfileId && (item.author_id === callerProfileId || item.author_id === callerId));

  // Auto-hidden by moderation: visible ONLY to author and admins
  if (item.hidden_by_moderation && !isAdmin && !isAuthor) {
    return res.status(404).json({ error: 'Event under review or unpublished' });
  }

  // Pending, unpublished, or rejected items are visible ONLY to their author and admins
  if (!isAdmin && !isAuthor && (item.published === false || item.status === 'pending' || item.status === 'rejected')) {
    return res.status(404).json({ error: 'Event not found or unpublished' });
  }

  const attendeeIds = Array.isArray(item.attendee_ids) ? item.attendee_ids : [];

  let attendeeProfiles: any[] = [];
  let peopleToMeet: Array<{ profile: any; reason: string; score: number }> = [];

  const eventCheckins = (store.event_checkins || []).filter((c: any) => c.event_id === id);

  if (callerId || isAdmin) {
    attendeeProfiles = store.profiles
      .filter((p: any) => attendeeIds.includes(p.id) && !p.hidden && !p.suspended)
      .map((p: any) => {
        const chk = (isAuthor || isAdmin)
          ? eventCheckins.find((c: any) => c.kind === 'member' && (c.ref_id === p.id || c.ref_id === p.account_uid))
          : undefined;
        return {
          id: p.id,
          name: p.name,
          avatar: `/api/avatar/${p.id}`,
          role: p.role,
          headline: p.headline,
          type: 'member',
          registered_at: (item.rsvp_times && item.rsvp_times[p.id]) || item.created_at || p.created_at,
          ...((isAuthor || isAdmin) ? {
            checked_in: Boolean(chk),
            checked_in_at: chk?.checked_in_at || null,
            checkin_method: chk?.method || null
          } : {})
        };
      });

    if (callerProfile) {
      const otherAttendees = store.profiles.filter(
        (p: any) => attendeeIds.includes(p.id) && p.id !== callerProfile.id && !p.hidden && !p.suspended
      );

      const targetNeeds = `${callerProfile.needs || ''} ${callerProfile.learns || ''}`.toLowerCase();
      const targetOffers = `${callerProfile.offers || ''} ${callerProfile.teaches || ''} ${(callerProfile.skills || []).join(' ')}`.toLowerCase();

      peopleToMeet = otherAttendees.map((c: any) => {
        let score = 75;
        let reason = 'Shares relevant collaboration interests in the Kampala network.';

        const skills = (c.skills || []).concat(c.tags || []);
        const matchingSkills = skills.filter((s: string) => targetNeeds.includes(String(s).toLowerCase()));

        if (matchingSkills.length > 0) {
          score += 20;
          reason = `${c.name} offers ${matchingSkills.slice(0, 2).join(' and ')}, which matches what you're looking for.`;
        } else if (c.role && targetNeeds.includes(String(c.role).toLowerCase())) {
          score += 15;
          reason = `${c.name} is a ${c.role}, matching your project interests.`;
        } else if (c.needs && targetOffers.includes(String(c.needs).toLowerCase().slice(0, 15))) {
          score += 10;
          reason = `You offer skills that complement what ${c.name} is building.`;
        }

        return {
          profile: {
            id: c.id,
            name: c.name,
            avatar: `/api/avatar/${c.id}`,
            role: c.role,
            headline: c.headline
          },
          reason,
          score
        };
      }).sort((a, b) => b.score - a.score).slice(0, 5);
    }
  }

  const isAttending = Boolean(callerId && (
    attendeeIds.includes(callerId) ||
    store.profiles.some((p: any) => (p.account_uid === callerId || p.id === callerId) && attendeeIds.includes(p.id))
  ));

  const guestToken = (typeof req.query.g === 'string' ? req.query.g : undefined) || (typeof req.headers['x-guest-token'] === 'string' ? (req.headers['x-guest-token'] as string) : undefined);
  const isAllowedContact = canViewHostContact(item, callerId, isAdmin, guestToken);
  const sanitized = sanitizeEventForPublic(item, callerId, isAllowedContact, isAdmin);

  // Guest details for guest holder
  let guestInfo: any = undefined;
  if (guestToken) {
    const tokenHash = crypto.createHash('sha256').update(guestToken).digest('hex');
    const guestRec = (store.event_guests || []).find((g: any) => g.event_id === id && g.token_hash === tokenHash);
    if (guestRec) {
      const gStatus = guestRec.status === 'waitlist' ? 'waitlist' : 'registered';
      guestInfo = {
        id: guestRec.id,
        name: guestRec.name,
        phone: guestRec.phone,
        email: guestRec.email,
        status: gStatus,
        waitlist_position: gStatus === 'waitlist' ? getWaitlistPosition(item, 'guest', guestRec.id) : null,
        created_at: guestRec.created_at
      };
    }
  }

  const canSeeAttendees = isAdmin || isAuthor || isAttending;
  const rawGuests = (store.event_guests || []).filter((g: any) => g.event_id === id && g.status !== 'waitlist');
  const guestsForCaller = ((callerId || isAdmin) && canSeeAttendees)
    ? rawGuests.map((g: any) => {
        const chk = (isAuthor || isAdmin)
          ? eventCheckins.find((c: any) => c.kind === 'guest' && c.ref_id === g.id)
          : undefined;
        const guestObj: any = {
          id: g.id,
          event_id: g.event_id,
          name: g.name,
          type: 'guest',
          status: 'registered',
          created_at: g.created_at,
          registered_at: g.created_at
        };
        if (isAuthor || isAdmin) {
          if (g.email !== undefined) guestObj.email = g.email;
          if (g.phone !== undefined) guestObj.phone = g.phone;
          guestObj.checked_in = Boolean(chk);
          guestObj.checked_in_at = chk?.checked_in_at || null;
          guestObj.checkin_method = chk?.method || null;
        }
        return guestObj;
      })
    : undefined;

  return res.json({
    ...sanitized,
    attendees: ((callerId || isAdmin) && canSeeAttendees) ? attendeeProfiles : undefined,
    guests: guestsForCaller,
    waitlist: (isAuthor || isAdmin) ? buildWaitlistDetails(item) : undefined,
    people_to_meet: callerId ? peopleToMeet : undefined,
    is_attending: isAttending,
    guest_info: guestInfo
  });
});

app.get('/api/events/:id/attendees', (req: Request, res: Response) => {
  cleanupExpiredGuestRecords();
  const { id } = req.params;
  const callerId = resolveAuthUserId(req);
  const isAdmin = checkAdmin(req);
  const callerProfile = callerId ? store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId) : null;
  const callerProfileId = callerProfile?.id || callerId;

  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const isAuthor = Boolean(callerProfileId && (item.author_id === callerProfileId || item.author_id === callerId));
  const attendeeIds = Array.isArray(item.attendee_ids) ? item.attendee_ids : [];
  const isAttending = Boolean(callerId && (attendeeIds.includes(callerId) || (callerProfileId && attendeeIds.includes(callerProfileId))));

  if (!isAdmin && !isAuthor && !isAttending) {
    return res.status(403).json({ error: 'Forbidden: Only attendees, the host, or an admin can view the attendee list.' });
  }

  const attendees = store.profiles
    .filter((p: any) => attendeeIds.includes(p.id) && !p.hidden && !p.suspended)
    .map((p: any) => ({
      id: p.id,
      name: p.name,
      avatar: `/api/avatar/${p.id}`,
      role: p.role,
      headline: p.headline,
      type: 'member',
      registered_at: (item.rsvp_times && item.rsvp_times[p.id]) || item.created_at || p.created_at
    }));

  const confirmedGuests = (store.event_guests || []).filter((g: any) => g.event_id === id && g.status !== 'waitlist');
  const waitlistQueue = getCombinedWaitlistQueue(item);

  return res.json({
    attendees,
    guest_count: confirmedGuests.length,
    waitlist_count: waitlistQueue.length,
    ...((isAuthor || isAdmin) ? {
      guests: confirmedGuests.map((g: any) => ({
        id: g.id,
        event_id: g.event_id,
        name: g.name,
        email: g.email,
        phone: g.phone,
        status: 'registered',
        created_at: g.created_at
      })),
      waitlist: buildWaitlistDetails(item)
    } : {})
  });
});

app.delete('/api/events/:id/attendees/:memberId', async (req: Request, res: Response) => {
  cleanupExpiredGuestRecords();
  const callerId = resolveAuthUserId(req);
  const isAdmin = checkAdmin(req);
  const { id, memberId } = req.params;

  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) return res.status(404).json({ error: 'Event not found.' });

  const callerProfile = callerId ? store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId) : null;
  const callerProfileId = callerProfile?.id || callerId;
  const isAuthor = Boolean(callerProfileId && (item.author_id === callerProfileId || item.author_id === callerId));

  if (!isAuthor && !isAdmin) {
    return res.status(403).json({ error: 'Forbidden: Only the event host or an admin can remove attendees.' });
  }

  if (!Array.isArray(item.attendee_ids)) item.attendee_ids = [];
  if (!Array.isArray(item.waitlist_ids)) item.waitlist_ids = [];

  const attIdx = item.attendee_ids.indexOf(memberId);
  const waitIdx = item.waitlist_ids.indexOf(memberId);
  if (attIdx < 0 && waitIdx < 0) {
    return res.status(404).json({ error: 'Attendee not found on this event.' });
  }

  let freedSeat = false;
  if (attIdx >= 0) {
    item.attendee_ids.splice(attIdx, 1);
    if (item.rsvp_times && typeof item.rsvp_times === 'object') delete item.rsvp_times[memberId];
    if (item.member_ticket_hashes && typeof item.member_ticket_hashes === 'object') delete item.member_ticket_hashes[memberId];
    freedSeat = true;
  }
  if (waitIdx >= 0) {
    item.waitlist_ids.splice(waitIdx, 1);
    if (item.waitlist_times && typeof item.waitlist_times === 'object') delete item.waitlist_times[memberId];
  }

  await persistDoc('events', item.id, item);
  if (freedSeat) {
    await promoteFromWaitlist(id);
  }
  if (storageMode === 'disk') saveStore(store);

  return res.json({ success: true });
});

app.post('/api/events/:id/rsvp', async (req: Request, res: Response) => {
  const callerId = resolveAuthUserId(req);
  if (!callerId) {
    return res.status(401).json({ error: 'Please sign in to RSVP or save interest.' });
  }

  const { id } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) {
    return res.status(404).json({ error: 'Event or Opportunity not found' });
  }

  // Part 3: Past events: RSVP is closed on the server (reject with 409)
  const phase = computeEventPhase(item);
  if (phase === 'past') {
    return res.status(409).json({ error: 'RSVP is closed because this event has ended.' });
  }
  if (item.is_cancelled) {
    return res.status(409).json({ error: 'RSVP is closed because this event was cancelled.' });
  }

  // Find caller's profile ID
  const callerProfile = store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId);
  const memberId = callerProfile?.id || callerId;

  if (!Array.isArray(item.attendee_ids)) {
    item.attendee_ids = [];
  }
  if (!Array.isArray(item.waitlist_ids)) {
    item.waitlist_ids = [];
  }
  if (!item.waitlist_times || typeof item.waitlist_times !== 'object') {
    item.waitlist_times = {};
  }

  const attIndex = item.attendee_ids.findIndex((aId: string) => aId === memberId || aId === callerId);
  const waitIndex = item.waitlist_ids.findIndex((wId: string) => wId === memberId || wId === callerId);

  // Without an action the route toggles. action 'cancel' only ever removes, so a repeated
  // tap on the cancel button can never register the member again.
  const action = req.body?.action === 'cancel' ? 'cancel' : 'toggle';
  if (action === 'cancel' && attIndex < 0 && waitIndex < 0) {
    const regGuests = (store.event_guests || []).filter((g: any) => g.event_id === id && g.status !== 'waitlist').length;
    return res.json({
      success: true,
      status: 'none',
      is_attending: false,
      attendee_count: item.attendee_ids.length + regGuests,
      waitlist_count: getCombinedWaitlistQueue(item).length,
      my_waitlist_position: null
    });
  }

  let rsvpStatus: 'going' | 'waitlisted' | 'left_waitlist' | 'cancelled' | 'none' = 'none';
  let waitlistPosition: number | null = null;
  let freedConfirmedSeat = false;

  if (attIndex >= 0) {
    item.attendee_ids.splice(attIndex, 1);
    if (item.rsvp_times && typeof item.rsvp_times === 'object') {
      delete item.rsvp_times[memberId];
      if (callerId) delete item.rsvp_times[callerId];
    }
    if (item.member_ticket_hashes && typeof item.member_ticket_hashes === 'object') {
      delete item.member_ticket_hashes[memberId];
      if (callerId) delete item.member_ticket_hashes[callerId];
    }
    // Also remove any check-in record for cancelled RSVP
    if (Array.isArray(store.event_checkins)) {
      const removedChkIds = store.event_checkins
        .filter((c: any) => c.event_id === id && c.kind === 'member' && (c.ref_id === memberId || c.ref_id === callerId))
        .map((c: any) => c.id);
      store.event_checkins = store.event_checkins.filter(
        (c: any) => !(c.event_id === id && c.kind === 'member' && (c.ref_id === memberId || c.ref_id === callerId))
      );
      for (const cid of removedChkIds) {
        removeDoc('event_checkins', cid).catch(() => {});
      }
    }
    if (Array.isArray(item.match_optout_ids)) {
      item.match_optout_ids = item.match_optout_ids.filter((optId: string) => optId !== memberId && optId !== callerId);
    }
    rsvpStatus = 'cancelled';
    freedConfirmedSeat = true;
  } else if (waitIndex >= 0) {
    item.waitlist_ids.splice(waitIndex, 1);
    delete item.waitlist_times[memberId];
    if (callerId) delete item.waitlist_times[callerId];
    rsvpStatus = 'left_waitlist';
  } else {
    const regGuestCount = (store.event_guests || []).filter(
      (g: any) => g.event_id === id && g.status !== 'waitlist'
    ).length;
    const currentTotal = item.attendee_ids.length + regGuestCount;
    const isFull = Boolean(item.capacity && item.capacity > 0 && currentTotal >= item.capacity);

    if (isFull) {
      if (item.waitlist_enabled === false) {
        return res.status(400).json({ error: 'Event is at full capacity.' });
      }
      const maxWaitlist = Math.min(200, (item.capacity || 0) * 3);
      if (getCombinedWaitlistQueue(item).length >= maxWaitlist) {
        return res.status(400).json({ error: 'Event is at full capacity (waitlist full).' });
      }
      const waitNow = new Date().toISOString();
      if (!item.waitlist_ids.includes(memberId)) {
        item.waitlist_ids.push(memberId);
      }
      item.waitlist_times[memberId] = waitNow;
      rsvpStatus = 'waitlisted';
      waitlistPosition = getWaitlistPosition(item, 'member', memberId, callerId);
    } else {
      item.attendee_ids.push(memberId);
      if (!item.rsvp_times || typeof item.rsvp_times !== 'object') {
        item.rsvp_times = {};
      }
      const rsvpNow = new Date().toISOString();
      item.rsvp_times[memberId] = rsvpNow;
      if (!item.member_ticket_hashes || typeof item.member_ticket_hashes !== 'object') {
        item.member_ticket_hashes = {};
      }
      const code = deriveTicketCode(id, `member:${memberId}`, rsvpNow);
      item.member_ticket_hashes[memberId] = hashTicketCode(code);

      if (!Array.isArray(item.match_optout_ids)) {
        item.match_optout_ids = [];
      }
      const rawBody = req.body || {};
      const optIn = rawBody.opt_in !== undefined ? Boolean(rawBody.opt_in) : (rawBody.show_in_people_to_meet !== undefined ? Boolean(rawBody.show_in_people_to_meet) : (rawBody.match_optout !== undefined ? !rawBody.match_optout : true));
      if (!optIn) {
        if (!item.match_optout_ids.includes(memberId)) item.match_optout_ids.push(memberId);
      } else {
        item.match_optout_ids = item.match_optout_ids.filter((optId: string) => optId !== memberId && optId !== callerId);
      }

      rsvpStatus = 'going';
    }
  }

  await persistDoc('events', item.id, item);
  if (freedConfirmedSeat) {
    await promoteFromWaitlist(id);
  }
  if (storageMode === 'disk') saveStore(store);

  if (rsvpStatus === 'going' || freedConfirmedSeat) {
    let memberEmail = callerProfile?.email || (req as any).authUser?.email || '';
    if (!memberEmail && adminAuth && callerId) {
      try {
        const u = await adminAuth.getUser(callerId);
        if (u?.email) memberEmail = u.email;
      } catch (_) {}
    }
    if (rsvpStatus === 'going') {
      const appBase = getPublicAppUrl();
      const ticketUrl = `${appBase}/#/events/${item.id}/ticket`;
      await sendEventConfirmationEmail(item, memberEmail, callerProfile?.name || 'Member', ticketUrl);
    } else if (item.kind !== 'opportunity') {
      await sendRegistrationCancelledEmail(item, memberEmail, callerProfile?.name || 'Member');
    }
  }

  const regGuestCountAfter = (store.event_guests || []).filter(
    (g: any) => g.event_id === id && g.status !== 'waitlist'
  ).length;
  const waitlistCountAfter = getCombinedWaitlistQueue(item).length;

  return res.json({
    success: true,
    status: rsvpStatus,
    ...(rsvpStatus === 'waitlisted' ? { position: waitlistPosition } : {}),
    is_attending: rsvpStatus === 'going',
    attendee_count: item.attendee_ids.length + regGuestCountAfter,
    waitlist_count: waitlistCountAfter,
    my_waitlist_position: rsvpStatus === 'waitlisted' ? waitlistPosition : null
  });
});

export const NEW_EVENT_NOTIFY_CHOICES = ['all', 'following', 'off'] as const;
export type NewEventNotifyChoice = typeof NEW_EVENT_NOTIFY_CHOICES[number];
export const NEW_EVENT_TAG_MATCH_CAP = 50;
export const NEW_EVENT_DAILY_CAP_PER_MEMBER = 3;

export function getNewEventNotifyChoice(p: any): NewEventNotifyChoice {
  const v = p?.notify_new_events;
  return (NEW_EVENT_NOTIFY_CHOICES as readonly string[]).includes(v) ? v : 'all';
}

const tagKey = (v: any) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Who hears about a new event: members following the organiser, plus up to
 * NEW_EVENT_TAG_MATCH_CAP members whose interests or skills match the event tags.
 * Each member gets at most NEW_EVENT_DAILY_CAP_PER_MEMBER new-event notifications
 * per UTC day, and their notify_new_events setting is respected.
 */
export function selectNewEventRecipients(item: any, organiserIds: Array<string | null | undefined>, nowMs: number = Date.now()): any[] {
  const organisers = new Set(organiserIds.filter((x): x is string => Boolean(x)));
  const followerIds = new Set(
    (store.follows || []).filter((f: any) => organisers.has(f.following_id)).map((f: any) => f.follower_id)
  );
  const eventTags = new Set((Array.isArray(item?.tags) ? item.tags : []).map(tagKey).filter(Boolean));

  const todayKey = new Date(nowMs).toISOString().slice(0, 10);
  const sentToday = new Map<string, number>();
  for (const n of store.notifications || []) {
    if (n?.source !== 'new_event' || String(n.created_at || '').slice(0, 10) !== todayKey) continue;
    sentToday.set(n.to_id, (sentToday.get(n.to_id) || 0) + 1);
  }

  const followers: any[] = [];
  const matched: any[] = [];
  for (const p of store.profiles || []) {
    if (!p?.id || p.hidden || p.suspended) continue;
    if (organisers.has(p.id) || (p.account_uid && organisers.has(p.account_uid))) continue;
    const choice = getNewEventNotifyChoice(p);
    if (choice === 'off') continue;
    if ((sentToday.get(p.id) || 0) >= NEW_EVENT_DAILY_CAP_PER_MEMBER) continue;

    if (followerIds.has(p.id) || (p.account_uid && followerIds.has(p.account_uid))) {
      followers.push(p);
    } else if (choice === 'all' && eventTags.size > 0 && matched.length < NEW_EVENT_TAG_MATCH_CAP) {
      const interests = [
        ...(Array.isArray(p.tags) ? p.tags : []),
        ...(Array.isArray(p.skills) ? p.skills : [])
      ].map(tagKey);
      if (interests.some(t => t && eventTags.has(t))) matched.push(p);
    }
  }
  return [...followers, ...matched];
}

const EVENT_DOUBLE_SUBMIT_MS = 2 * 60 * 1000;

app.post('/api/events', async (req: Request, res: Response) => {
  const adminInfo = resolveAdminInfo(req);
  const isAdmin = adminInfo.isAdmin;
  const callerId = resolveAuthUserId(req);
  const callerProfile = callerId ? store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId) : null;

  if (!isAdmin && !callerId) {
    return res.status(401).json({ error: 'Please sign in to create an event.' });
  }

  // Part 4: Profile completion check
  if (!isAdmin) {
    if (!callerProfile || !callerProfile.name || !callerProfile.headline) {
      return res.status(400).json({ error: 'Please complete your profile before creating an event.' });
    }
    // Part 5: Blocked member check
    if (callerProfile.events_blocked) {
      return res.status(403).json({ error: "You can't create events right now" });
    }
  }

  const raw = req.body || {};
  const kind = raw.kind === 'opportunity' ? 'opportunity' : 'event';
  const title = sanitizeText(typeof raw.title === 'string' ? raw.title.replace(/\s+/g, ' ') : raw.title, 150);
  const description = sanitizeText(raw.description, 2000);

  if (!title || !description) {
    return res.status(400).json({ error: 'Title and description are required.' });
  }
  const titleError = validateEventTitle(title);
  if (titleError) {
    return res.status(400).json({ error: titleError, field: 'title' });
  }

  // Double submit (same author, same title, within 2 minutes): return the event already created.
  if (callerProfile) {
    const recent = findRecentDuplicate(store.events || [], [callerProfile.id, callerProfile.account_uid], title);
    if (recent && Date.now() - new Date((recent as any).created_at).getTime() < EVENT_DOUBLE_SUBMIT_MS) {
      return res.json({ success: true, duplicate: true, item: sanitizeEventForPublic(recent, callerId, true, isAdmin) });
    }
  }

  // Validate times, format, and locations for events
  const timeValidation = validateEventTimesAndFormat(raw, false);
  if (!timeValidation.valid) {
    return res.status(400).json({ error: timeValidation.error });
  }

  // Links must be https
  let registration_link: string | undefined = undefined;
  if (raw.registration_link) {
    registration_link = sanitizeHttpsUrl(raw.registration_link);
    if (!registration_link) {
      return res.status(400).json({ error: 'Registration link must be a valid https:// URL.' });
    }
  }

  let link: string | undefined = undefined;
  if (raw.link) {
    link = sanitizeHttpsUrl(raw.link);
    if (!link) {
      return res.status(400).json({ error: 'Link must be a valid https:// URL.' });
    }
  }

  let contact_phone: string | undefined = undefined;
  if (raw.contact_phone) {
    const cleanPhone = String(raw.contact_phone).trim();
    if (!/^\+?[0-9]{7,15}$/.test(cleanPhone)) {
      return res.status(400).json({ error: 'Contact phone must be a valid phone or WhatsApp number (7-15 digits with optional leading +).' });
    }
    contact_phone = cleanPhone;
  }

  let contact_email: string | undefined = undefined;
  if (raw.contact_email) {
    const cleanEmail = String(raw.contact_email).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Contact email must be a valid email address.' });
    }
    contact_email = cleanEmail;
  }

  let capacity: number | undefined = undefined;
  if (raw.capacity !== undefined && raw.capacity !== null && raw.capacity !== '') {
    const capNum = Number(raw.capacity);
    if (!Number.isInteger(capNum) || capNum < 1 || capNum > 5000) {
      return res.status(400).json({ error: 'Capacity must be an integer between 1 and 5000.' });
    }
    capacity = capNum;
  }

  const rawMapLink = raw.map_link !== undefined ? raw.map_link : (raw.mapLink !== undefined ? raw.mapLink : raw.map_url);
  const mapValidation = validateMapLink(rawMapLink);
  if (!mapValidation.valid) {
    return res.status(400).json({ error: mapValidation.error });
  }
  const map_link = mapValidation.url;

  const tags = sanitizeEventTags(raw.tags);

  const authorId = callerProfile?.id || callerId || 'admin';
  const authorName = isAdmin ? adminInfo.adminName : (callerProfile?.name || 'Member');
  const isOrganiser = Boolean(callerProfile?.is_organiser);

  // Part 4: Limits enforced on server
  // at most 3 events created per member per 24 hours, and at most 10 upcoming events per member at once.
  if (!isAdmin) {
    const past24h = Date.now() - 24 * 60 * 60 * 1000;
    const createdLast24h = (store.events || []).filter((e: any) =>
      (e.author_id === authorId || e.author_id === callerId) &&
      new Date(e.created_at).getTime() >= past24h
    ).length;
    if (createdLast24h >= 3) {
      return res.status(400).json({ error: 'Creation limit reached: At most 3 events created per member per 24 hours.' });
    }

    const activeUpcoming = (store.events || []).filter((e: any) =>
      (e.author_id === authorId || e.author_id === callerId) &&
      !e.is_cancelled &&
      computeEventPhase(e) !== 'past'
    ).length;
    if (activeUpcoming >= 10) {
      return res.status(400).json({ error: 'Creation limit reached: At most 10 upcoming events active at once.' });
    }
  }

  // Direct publishing immediately (no admin approval step)
  const status = 'published';
  const published = true;
  const resolvedVenue = timeValidation.location || (raw.venue ? sanitizeText(raw.venue, 200) : (raw.location ? sanitizeText(raw.location, 200) : undefined));
  const waitlist_enabled = raw.waitlist_enabled !== undefined ? Boolean(raw.waitlist_enabled) : true;

  const item: any = {
    id: (kind === 'event' ? 'event-' : 'opp-') + Date.now() + '-' + crypto.randomBytes(3).toString('hex'),
    kind,
    title,
    description,
    datetime: raw.datetime ? sanitizeText(raw.datetime, 60) : undefined,
    starts_at: timeValidation.starts_at,
    ends_at: timeValidation.ends_at,
    timezone: timeValidation.timezone,
    format: timeValidation.format || (raw.format ? sanitizeText(raw.format, 20) : 'in_person'),
    location: resolvedVenue,
    venue: resolvedVenue,
    map_link,
    tags,
    capacity,
    waitlist_enabled,
    waitlist_ids: [],
    waitlist_times: {},
    join_link: timeValidation.join_link,
    contact_phone,
    contact_email,
    time_needs_update: Boolean(timeValidation.time_needs_update),
    cover_image: raw.cover_image ? validateAndSanitizeEventCoverImage(raw.cover_image) : undefined,
    registration_link,
    opportunity_type: raw.opportunity_type ? sanitizeText(raw.opportunity_type, 50) : undefined,
    deadline: raw.deadline ? sanitizeText(raw.deadline, 60) : undefined,
    link,
    author_id: authorId,
    author_name: authorName,
    author_is_organiser: isOrganiser,
    status,
    published,
    is_cancelled: false,
    self_checkin_enabled: Boolean(raw.self_checkin_enabled),
    allow_walkins: raw.allow_walkins !== undefined ? Boolean(raw.allow_walkins) : true,
    attendee_ids: [],
    reports: [],
    report_count: 0,
    created_at: new Date().toISOString(),
    created_by: authorName
  };

  // FIX 3: Add to store.events only AFTER persistDoc succeeds
  try {
    await persistDoc('events', item.id, item);
  } catch (err: any) {
    console.error(`[Create Event] Failed to save event ${item.id} to storage:`, err?.message || err);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }

  if (!store.events) store.events = [];
  store.events.unshift(item);

  // Notify followers of the organiser and members whose interests match the tags
  const notifBody = kind === 'event'
    ? `📅 New Event: ${item.title}`
    : `💡 New Opportunity (${item.opportunity_type || 'General'}): ${item.title}`;

  const newNotifs: Array<{ id: string; data: any }> = [];
  const notifItems: any[] = [];
  for (const p of selectNewEventRecipients(item, [authorId, callerId, callerProfile?.id])) {
    const notif = {
      id: 'notif-ev-' + Date.now() + '-' + crypto.randomBytes(5).toString('hex'),
      to_id: p.id,
      from_id: 'organiser',
      type: 'digest',
      source: 'new_event',
      body: notifBody,
      event_id: item.id,
      link: `${getPublicAppUrl()}/e/${item.id}`,
      read: false,
      created_at: new Date().toISOString()
    };
    notifItems.push(notif);
    newNotifs.push({ id: notif.id, data: notif });
  }
  if (newNotifs.length > 0) {
    try {
      await batchPersistDocs('notifications', newNotifs);
      for (const n of notifItems) {
        store.notifications.unshift(n);
      }
    } catch (notifErr: any) {
      console.error('[Create Event] Failed to persist notifications:', notifErr?.message || notifErr);
    }
  }

  const auditEntry = {
    id: newAuditId(),
    timestamp: new Date().toISOString(),
    action: 'CREATE_EVENT',
    details: `Created ${kind}: "${item.title}" (${status})`,
    admin: isAdmin ? adminInfo.adminName : authorName
  };
  try {
    await persistDoc('audit_log', auditEntry.id, auditEntry);
    store.audit_log.unshift(auditEntry);
  } catch (auditErr: any) {
    console.error('[Create Event] Failed to persist audit log:', auditErr?.message || auditErr);
  }

  if (storageMode === 'disk') saveStore(store);
  const isAllowedContact = canViewHostContact(item, callerId, isAdmin);
  return res.json({ success: true, item: sanitizeEventForPublic(item, callerId, isAllowedContact, isAdmin) });
});

app.patch('/api/events/:id', async (req: Request, res: Response) => {
  const adminInfo = resolveAdminInfo(req);
  const isAdmin = adminInfo.isAdmin;
  const callerId = resolveAuthUserId(req);
  const callerProfile = callerId ? store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId) : null;
  const callerProfileId = callerProfile?.id || callerId;

  const { id } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) {
    return res.status(404).json({ error: 'Event or Opportunity not found' });
  }

  if (!canEditEvent(callerProfileId || callerId, item.author_id, isAdmin)) {
    return res.status(403).json({ error: 'Forbidden: You can only edit your own submissions.' });
  }

  const raw = req.body || {};

  // If times/format/venue are provided, validate them
  if (raw.starts_at || raw.ends_at || raw.format || raw.timezone || raw.location !== undefined || raw.venue !== undefined || raw.join_link) {
    const timeValidation = validateEventTimesAndFormat(raw, true, item);
    if (!timeValidation.valid) {
      return res.status(400).json({ error: timeValidation.error });
    }
    if (timeValidation.starts_at) item.starts_at = timeValidation.starts_at;
    if (timeValidation.ends_at) item.ends_at = timeValidation.ends_at;
    if (timeValidation.timezone) item.timezone = timeValidation.timezone;
    if (timeValidation.format) item.format = timeValidation.format;
    if (timeValidation.location) {
      item.location = timeValidation.location;
      item.venue = timeValidation.location;
    }
    if (timeValidation.join_link) item.join_link = timeValidation.join_link;
    if (timeValidation.time_needs_update !== undefined) item.time_needs_update = timeValidation.time_needs_update;
  }

  const prevCapacity = item.capacity;
  let shouldPromote = false;
  if (raw.capacity !== undefined) {
    if (raw.capacity === null || raw.capacity === '') {
      delete item.capacity;
      if (prevCapacity) shouldPromote = true;
    } else {
      const capNum = Number(raw.capacity);
      if (!Number.isInteger(capNum) || capNum < 1 || capNum > 5000) {
        return res.status(400).json({ error: 'Capacity must be an integer between 1 and 5000.' });
      }
      item.capacity = capNum;
      if (!prevCapacity || capNum > prevCapacity) {
        shouldPromote = true;
      }
    }
  }
  if (raw.waitlist_enabled !== undefined) {
    item.waitlist_enabled = Boolean(raw.waitlist_enabled);
    if (item.waitlist_enabled) {
      shouldPromote = true;
    }
  }

  if (raw.map_link !== undefined || raw.mapLink !== undefined || raw.map_url !== undefined) {
    const rawMapLink = raw.map_link !== undefined ? raw.map_link : (raw.mapLink !== undefined ? raw.mapLink : raw.map_url);
    const mapValidation = validateMapLink(rawMapLink);
    if (!mapValidation.valid) {
      return res.status(400).json({ error: mapValidation.error });
    }
    if (mapValidation.url) {
      item.map_link = mapValidation.url;
    } else {
      delete item.map_link;
    }
  }

  if (raw.tags !== undefined) {
    item.tags = sanitizeEventTags(raw.tags);
  }

  if (raw.contact_phone !== undefined) {
    if (raw.contact_phone) {
      const cleanPhone = String(raw.contact_phone).trim();
      if (!/^\+?[0-9]{7,15}$/.test(cleanPhone)) {
        return res.status(400).json({ error: 'Contact phone must be a valid phone or WhatsApp number (7-15 digits with optional leading +).' });
      }
      item.contact_phone = cleanPhone;
    } else {
      item.contact_phone = undefined;
    }
  }

  if (raw.contact_email !== undefined) {
    if (raw.contact_email) {
      const cleanEmail = String(raw.contact_email).trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        return res.status(400).json({ error: 'Contact email must be a valid email address.' });
      }
      item.contact_email = cleanEmail;
    } else {
      item.contact_email = undefined;
    }
  }

  if (raw.title !== undefined) {
    const nextTitle = sanitizeText(typeof raw.title === 'string' ? raw.title.replace(/\s+/g, ' ') : raw.title, 150);
    if (nextTitle !== String(item.title || '').trim()) {
      const titleError = validateEventTitle(nextTitle);
      if (titleError) return res.status(400).json({ error: titleError, field: 'title' });
    }
    item.title = nextTitle;
  }
  if (raw.description !== undefined) item.description = sanitizeText(raw.description, 2000);
  if (raw.datetime !== undefined) item.datetime = sanitizeText(raw.datetime, 60);
  if (raw.cover_image !== undefined) {
    item.cover_image = raw.cover_image ? validateAndSanitizeEventCoverImage(raw.cover_image) : undefined;
  }
  if (raw.registration_link !== undefined) item.registration_link = sanitizeHttpsUrl(raw.registration_link);
  if (raw.opportunity_type !== undefined) item.opportunity_type = sanitizeText(raw.opportunity_type, 50);
  if (raw.deadline !== undefined) item.deadline = sanitizeText(raw.deadline, 60);
  if (raw.link !== undefined) item.link = sanitizeHttpsUrl(raw.link);

  // Author can cancel event or toggle self check-in
  if (raw.is_cancelled !== undefined) {
    item.is_cancelled = Boolean(raw.is_cancelled);
  }
  if (raw.self_checkin_enabled !== undefined) {
    item.self_checkin_enabled = Boolean(raw.self_checkin_enabled);
  }
  if (raw.allow_walkins !== undefined) {
    item.allow_walkins = Boolean(raw.allow_walkins);
  }

  if (isAdmin && raw.published !== undefined) {
    item.published = Boolean(raw.published);
    if (item.published) item.status = 'published';
  }

  // If an author edits a hidden event, mark it as awaiting review for admins
  if (!isAdmin && item.hidden_by_moderation) {
    item.awaiting_review = true;
  }

  await persistDoc('events', item.id, item);
  if (shouldPromote) {
    await promoteFromWaitlist(item.id);
  }

  const auditEntry = {
    id: newAuditId(),
    timestamp: new Date().toISOString(),
    action: item.is_cancelled ? 'CANCEL_EVENT' : 'UPDATE_EVENT',
    details: `${item.is_cancelled ? 'Cancelled' : 'Updated'} ${item.kind}: "${item.title}"`,
    admin: isAdmin ? adminInfo.adminName : (item.author_name || 'Member')
  };
  store.audit_log.unshift(auditEntry);
  await persistDoc('audit_log', auditEntry.id, auditEntry);

  if (storageMode === 'disk') saveStore(store);
  const isAllowedContact = canViewHostContact(item, callerId, isAdmin);
  return res.json({ success: true, item: sanitizeEventForPublic(item, callerId, isAllowedContact, isAdmin) });
});

// Author or Admin: Cancel an event
app.post('/api/events/:id/cancel', async (req: Request, res: Response) => {
  const adminInfo = resolveAdminInfo(req);
  const isAdmin = adminInfo.isAdmin;
  const callerId = resolveAuthUserId(req);
  const callerProfile = callerId ? store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId) : null;
  const callerProfileId = callerProfile?.id || callerId;

  const { id } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) {
    return res.status(404).json({ error: 'Event or Opportunity not found' });
  }

  if (!canEditEvent(callerProfileId || callerId, item.author_id, isAdmin)) {
    return res.status(403).json({ error: 'Forbidden: You can only cancel your own events.' });
  }

  item.is_cancelled = true;
  await persistDoc('events', item.id, item);

  const auditEntry = {
    id: newAuditId(),
    timestamp: new Date().toISOString(),
    action: 'CANCEL_EVENT',
    details: `Cancelled ${item.kind}: "${item.title}"`,
    admin: isAdmin ? adminInfo.adminName : (item.author_name || 'Member')
  };
  store.audit_log.unshift(auditEntry);
  await persistDoc('audit_log', auditEntry.id, auditEntry);

  if (storageMode === 'disk') saveStore(store);
  const isAllowedContact = canViewHostContact(item, callerId, isAdmin);
  return res.json({ success: true, message: 'Event cancelled successfully', item: sanitizeEventForPublic(item, callerId, isAllowedContact, isAdmin) });
});

/**
 * Deletes an event and everything that belongs to it (guests, questions, check-ins),
 * and tells registered members it was removed. The notice has no event_id because the
 * event no longer exists. Callers write their own audit log entry.
 */
async function deleteEventWithCascade(
  item: any,
  excludeFromNotify: Array<string | null | undefined> = [],
  removedBy: 'host' | 'moderator' = 'host'
) {
  const id = item.id;
  const skipIds = new Set([item.author_id, ...excludeFromNotify].filter(Boolean));
  const registeredMemberIds: string[] = Array.from(new Set(
    (Array.isArray(item.attendee_ids) ? item.attendee_ids : []).filter((attId: any) => attId && !skipIds.has(attId))
  ));

  store.events = (store.events || []).filter((e: any) => e.id !== id);
  await removeDoc('events', id);

  const deletedGuestIds = (store.event_guests || []).filter((g: any) => g.event_id === id).map((g: any) => g.id);
  const deletedQuestionIds = (store.event_questions || []).filter((q: any) => q.event_id === id).map((q: any) => q.id);
  const deletedCheckinIds = (store.event_checkins || []).filter((c: any) => c.event_id === id).map((c: any) => c.id);
  store.event_guests = (store.event_guests || []).filter((g: any) => g.event_id !== id);
  store.event_questions = (store.event_questions || []).filter((q: any) => q.event_id !== id);
  store.event_checkins = (store.event_checkins || []).filter((c: any) => c.event_id !== id);
  if (deletedGuestIds.length > 0) await batchRemoveDocs('event_guests', deletedGuestIds);
  if (deletedQuestionIds.length > 0) await batchRemoveDocs('event_questions', deletedQuestionIds);
  if (deletedCheckinIds.length > 0) await batchRemoveDocs('event_checkins', deletedCheckinIds);

  const kindLabel = item.kind === 'opportunity' ? 'opportunity' : 'event';
  const notifs: Array<{ id: string; data: any }> = [];
  for (const memberId of registeredMemberIds) {
    const notif = {
      id: 'notif-evdel-' + Date.now() + '-' + crypto.randomBytes(5).toString('hex'),
      to_id: memberId,
      from_id: removedBy === 'moderator' ? 'moderator' : 'organiser',
      type: 'digest',
      body: `The ${kindLabel} "${item.title}" you registered for was removed by ${removedBy === 'moderator' ? 'a moderator' : 'the host'}.`,
      read: false,
      created_at: new Date().toISOString()
    };
    store.notifications.unshift(notif);
    notifs.push({ id: notif.id, data: notif });
  }
  if (notifs.length > 0) {
    await batchPersistDocs('notifications', notifs);
  }

  return { registeredMemberIds, deletedGuestIds, deletedQuestionIds, deletedCheckinIds };
}

app.delete('/api/events/:id', async (req: Request, res: Response) => {
  const adminInfo = resolveAdminInfo(req);
  const isAdmin = adminInfo.isAdmin;
  const callerId = resolveAuthUserId(req);
  const callerProfile = callerId ? store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId) : null;
  const callerProfileId = callerProfile?.id || callerId;

  const { id } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) {
    return res.status(404).json({ error: 'Event or Opportunity not found' });
  }

  if (!canEditEvent(callerProfileId || callerId, item.author_id, isAdmin)) {
    return res.status(403).json({ error: 'Forbidden: You can only delete your own submissions.' });
  }

  const { registeredMemberIds, deletedGuestIds, deletedQuestionIds, deletedCheckinIds } =
    await deleteEventWithCascade(item, [callerProfileId, callerId]);

  const auditEntry = {
    id: newAuditId(),
    timestamp: new Date().toISOString(),
    action: 'DELETE_EVENT',
    details: `Deleted ${item.kind}: "${item.title}" (${id}). Notified ${registeredMemberIds.length} member(s); removed ${deletedGuestIds.length} guest(s), ${deletedQuestionIds.length} question(s), ${deletedCheckinIds.length} check-in(s).`,
    admin: isAdmin ? adminInfo.adminName : (item.author_name || 'Author')
  };
  store.audit_log.unshift(auditEntry);
  await persistDoc('audit_log', auditEntry.id, auditEntry);

  if (storageMode === 'disk') saveStore(store);
  return res.json({
    success: true,
    message: 'Event or Opportunity deleted',
    notified: registeredMemberIds.length,
    removed: { guests: deletedGuestIds.length, questions: deletedQuestionIds.length, checkins: deletedCheckinIds.length }
  });
});

// Part 5: Report an event for moderation
app.post('/api/events/:id/report', reportLimiter, async (req: Request, res: Response) => {
  const callerId = resolveAuthUserId(req);
  if (!callerId) {
    return res.status(401).json({ error: 'Please sign in to report an event.' });
  }

  const { id } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) {
    return res.status(404).json({ error: 'Event not found.' });
  }

  const callerProfile = store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId);
  const reporterId = callerProfile?.id || callerId;

  const rawReason = req.body?.reason;
  const allowedReasons = ['Not a real event', 'Spam or scam', 'Offensive', 'Other'];
  if (!rawReason || !allowedReasons.includes(rawReason)) {
    return res.status(400).json({ error: 'Invalid reason. Must be one of: ' + allowedReasons.join(', ') });
  }

  const note = req.body?.note ? sanitizeText(req.body.note, 500) : undefined;

  if (!Array.isArray(item.reports)) {
    item.reports = [];
  }

  // One report per member per event
  const alreadyReported = item.reports.some((r: any) => r.reporter_id === reporterId);
  if (alreadyReported) {
    return res.status(400).json({ error: 'You have already reported this event.' });
  }

  const report = {
    reporter_id: reporterId,
    reason: rawReason,
    note,
    created_at: new Date().toISOString()
  };
  item.reports.push(report);
  item.report_count = item.reports.length;

  // Auto-hide check: 3 or more reports from different members hides event from public lists
  const distinctReporters = new Set(item.reports.map((r: any) => r.reporter_id)).size;
  if (distinctReporters >= 3 && !item.reviewed_by_admin) {
    const wasNotHidden = !item.hidden_by_moderation;
    item.hidden_by_moderation = true;
    item.under_review = true;

    if (wasNotHidden && item.author_id) {
      const authorProfile = store.profiles.find((p: any) => p.id === item.author_id || p.account_uid === item.author_id);
      if (authorProfile) {
        const notif = {
          id: 'notif-autohide-' + Date.now(),
          to_id: authorProfile.id,
          from_id: 'system',
          type: 'moderation',
          body: `Your event "${item.title}" is under review due to community reports.`,
          event_id: item.id,
          read: false,
          created_at: new Date().toISOString()
        };
        store.notifications.unshift(notif);
        await persistDoc('notifications', notif.id, notif);
      }
    }
  }

  await persistDoc('events', item.id, item);
  if (storageMode === 'disk') saveStore(store);

  return res.json({
    success: true,
    message: 'Report submitted successfully.',
    report_count: item.report_count,
    hidden_by_moderation: Boolean(item.hidden_by_moderation)
  });
});

/* =========================================================================
   PART 2: QUESTIONS ON THE EVENT PAGE
   ========================================================================= */

let lastGuestCleanupMs = 0;
export function resetGuestCleanupTimerForTest(): void {
  lastGuestCleanupMs = 0;
}

export function cleanupExpiredGuestRecords(): void {
  const now = Date.now();
  if (now - lastGuestCleanupMs < 3600000) return; // Throttle to once per hour
  lastGuestCleanupMs = now;

  if (!Array.isArray(store.event_guests)) store.event_guests = [];
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

  const toKeep: any[] = [];
  for (const g of store.event_guests) {
    const event = (store.events || []).find((e: any) => e.id === g.event_id);
    if (event) {
      const eventEndMs = new Date(event.ends_at || event.starts_at || event.datetime || event.created_at).getTime();
      if (now - eventEndMs > thirtyDaysMs) {
        removeDoc('event_guests', g.id).catch(() => {});
        continue;
      }
    }
    toKeep.push(g);
  }
  store.event_guests = toKeep;
}

// GET /api/events/:id/questions (public read)
app.get('/api/events/:id/questions', (req: Request, res: Response) => {
  cleanupExpiredGuestRecords();
  const { id } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) return res.status(404).json({ error: 'Event not found' });

  const isAdmin = checkAdmin(req);
  const callerId = resolveAuthUserId(req);
  const callerProfile = callerId ? store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId) : null;
  const callerProfileId = callerProfile?.id || callerId;
  const isAuthor = Boolean(callerProfileId && (item.author_id === callerProfileId || item.author_id === callerId));

  if (item.hidden_by_moderation && !isAdmin && !isAuthor) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const questions = (store.event_questions || [])
    .filter((q: any) => q.event_id === id)
    .sort((a: any, b: any) => String(a.created_at).localeCompare(String(b.created_at)));

  return res.json(questions);
});

// POST /api/events/:id/questions (signed-in members with completed profile)
app.post('/api/events/:id/questions', async (req: Request, res: Response) => {
  cleanupExpiredGuestRecords();
  const callerId = resolveAuthUserId(req);
  if (!callerId) {
    return res.status(401).json({ error: 'Please sign in to ask a question.' });
  }

  const { id } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) return res.status(404).json({ error: 'Event not found' });

  const callerProfile = store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId);
  if (!callerProfile || !callerProfile.name || !callerProfile.headline) {
    return res.status(400).json({ error: 'Please complete your profile before asking a question.' });
  }

  if (item.is_cancelled) {
    return res.status(400).json({ error: 'Posting questions is closed because this event was cancelled.' });
  }

  if (item.ends_at && Date.now() > new Date(item.ends_at).getTime() + 7 * 24 * 60 * 60 * 1000) {
    return res.status(400).json({ error: 'Posting questions is closed for this event.' });
  }

  const content = sanitizeText(req.body?.content, 500);
  if (!content || content.length < 3) {
    return res.status(400).json({ error: 'Question must be between 3 and 500 characters.' });
  }

  const memberId = callerProfile.id;
  const eventQuestions = (store.event_questions || []).filter((q: any) => q.event_id === id && q.author_id === memberId);
  if (eventQuestions.length >= 5) {
    return res.status(400).json({ error: 'Limit reached: At most 5 questions per member per event.' });
  }

  const past24h = Date.now() - 24 * 60 * 60 * 1000;
  const dailyQuestions = (store.event_questions || []).filter(
    (q: any) => q.author_id === memberId && new Date(q.created_at).getTime() >= past24h
  );
  if (dailyQuestions.length >= 20) {
    return res.status(400).json({ error: 'Limit reached: At most 20 questions per day.' });
  }

  const question = {
    id: 'q-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'),
    event_id: id,
    author_id: memberId,
    author_name: callerProfile.name,
    content,
    created_at: new Date().toISOString()
  };

  if (!Array.isArray(store.event_questions)) store.event_questions = [];
  store.event_questions.push(question);
  await persistDoc('event_questions', question.id, question);

  // Notify author
  if (item.author_id && item.author_id !== memberId) {
    const authorProfile = store.profiles.find((p: any) => p.id === item.author_id || p.account_uid === item.author_id);
    if (authorProfile) {
      const notif = {
        id: 'notif-q-' + Date.now(),
        to_id: authorProfile.id,
        from_id: memberId,
        type: 'question',
        body: `New question on "${item.title}": "${content.slice(0, 60)}${content.length > 60 ? '...' : ''}"`,
        event_id: id,
        read: false,
        created_at: new Date().toISOString()
      };
      store.notifications.unshift(notif);
      await persistDoc('notifications', notif.id, notif);
    }
  }

  return res.json({ success: true, question });
});

// POST /api/events/:id/questions/:qid/reply (author or admin only)
app.post('/api/events/:id/questions/:qid/reply', async (req: Request, res: Response) => {
  cleanupExpiredGuestRecords();
  const callerId = resolveAuthUserId(req);
  const isAdmin = checkAdmin(req);
  if (!callerId && !isAdmin) {
    return res.status(401).json({ error: 'Please sign in to reply.' });
  }

  const { id, qid } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) return res.status(404).json({ error: 'Event not found' });

  const callerProfile = callerId ? store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId) : null;
  const callerProfileId = callerProfile?.id || callerId;
  const isAuthor = Boolean(callerProfileId && (item.author_id === callerProfileId || item.author_id === callerId));

  if (!isAuthor && !isAdmin) {
    return res.status(403).json({ error: 'Only the event host or an admin can reply to questions.' });
  }

  const question = (store.event_questions || []).find((q: any) => q.id === qid && q.event_id === id);
  if (!question) return res.status(404).json({ error: 'Question not found' });

  const content = sanitizeText(req.body?.content, 500);
  if (!content || content.length < 3) {
    return res.status(400).json({ error: 'Reply must be between 3 and 500 characters.' });
  }

  const replyAuthorName = isAdmin ? 'Moderator' : (callerProfile?.name || 'Host');
  question.reply = {
    id: 'reply-' + Date.now(),
    author_id: callerProfileId || 'admin',
    author_name: replyAuthorName,
    is_host: isAuthor,
    content,
    created_at: new Date().toISOString()
  };

  await persistDoc('event_questions', question.id, question);

  // Notify asker
  if (question.author_id && question.author_id !== callerProfileId) {
    const askerProfile = store.profiles.find((p: any) => p.id === question.author_id || p.account_uid === question.author_id);
    if (askerProfile) {
      const notif = {
        id: 'notif-qr-' + Date.now(),
        to_id: askerProfile.id,
        from_id: callerProfileId || 'host',
        type: 'question_reply',
        body: `The host replied to your question on "${item.title}"`,
        event_id: id,
        read: false,
        created_at: new Date().toISOString()
      };
      store.notifications.unshift(notif);
      await persistDoc('notifications', notif.id, notif);
    }
  }

  return res.json({ success: true, question });
});

// DELETE /api/events/:id/questions/:qid
app.delete('/api/events/:id/questions/:qid', async (req: Request, res: Response) => {
  cleanupExpiredGuestRecords();
  const callerId = resolveAuthUserId(req);
  const isAdmin = checkAdmin(req);
  if (!callerId && !isAdmin) {
    return res.status(401).json({ error: 'Authentication required.' });
  }

  const { id, qid } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) return res.status(404).json({ error: 'Event not found' });

  const callerProfile = callerId ? store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId) : null;
  const callerProfileId = callerProfile?.id || callerId;
  const isAuthor = Boolean(callerProfileId && (item.author_id === callerProfileId || item.author_id === callerId));

  const question = (store.event_questions || []).find((q: any) => q.id === qid && q.event_id === id);
  if (!question) return res.status(404).json({ error: 'Question not found' });

  const isWriter = Boolean(callerProfileId && (question.author_id === callerProfileId || question.author_id === callerId));
  if (!isWriter && !isAuthor && !isAdmin) {
    return res.status(403).json({ error: 'Forbidden: You cannot delete this question.' });
  }

  store.event_questions = (store.event_questions || []).filter((q: any) => q.id !== qid);
  await removeDoc('event_questions', qid);

  return res.json({ success: true });
});

/* =========================================================================
   PART 4: REGISTER FOR AN EVENT WITHOUT AN ACCOUNT (GUEST REGISTRATION)
   ========================================================================= */

const guestIpRateMap = new Map<string, { eventRegistrations: Map<string, number[]>; totalTimestamps: number[] }>();

app.post('/api/events/:id/guest-register', async (req: Request, res: Response) => {
  cleanupExpiredGuestRecords();
  const { id } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) return res.status(404).json({ error: 'Event not found.' });

  const phase = computeEventPhase(item);
  if (phase === 'past' || item.is_cancelled || item.hidden_by_moderation) {
    return res.status(400).json({ error: 'Registration is closed for this event.' });
  }

  const raw = req.body || {};

  // Honeypot check
  if (raw.website || raw.honeypot || raw.hp) {
    return res.status(400).json({ error: 'Spam submission rejected.' });
  }

  if (!raw.agree) {
    return res.status(400).json({ error: 'You must agree to share contact details with the host.' });
  }

  const name = sanitizeText(raw.name, 80);
  if (!name || name.length < 2) {
    return res.status(400).json({ error: 'Full name must be between 2 and 80 characters.' });
  }

  let phone: string | undefined = undefined;
  if (raw.phone) {
    const cleanP = String(raw.phone).trim();
    if (!/^\+?[0-9]{7,15}$/.test(cleanP)) {
      return res.status(400).json({ error: 'Phone/WhatsApp number must be 7-15 digits with optional leading +.' });
    }
    phone = cleanP;
  }

  let email: string | undefined = undefined;
  if (raw.email) {
    const cleanE = String(raw.email).trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanE)) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    email = cleanE;
  }

  if (!phone && !email) {
    return res.status(400).json({ error: 'Please provide at least a phone number or an email address.' });
  }

  // Capacity check
  const regGuestCount = (store.event_guests || []).filter(
    (g: any) => g.event_id === id && g.status !== 'waitlist'
  ).length;
  const currentTotal = (Array.isArray(item.attendee_ids) ? item.attendee_ids.length : 0) + regGuestCount;
  const isFull = Boolean(item.capacity && item.capacity > 0 && currentTotal >= item.capacity);
  if (isFull) {
    if (item.waitlist_enabled === false) {
      return res.status(400).json({ error: 'Event is at full capacity.' });
    }
    const maxWaitlist = Math.min(200, (item.capacity || 0) * 3);
    if (getCombinedWaitlistQueue(item).length >= maxWaitlist) {
      return res.status(400).json({ error: 'Event is at full capacity (waitlist full).' });
    }
  }

  // Duplicate contact check for this event
  const existingGuest = (store.event_guests || []).find((g: any) => {
    if (g.event_id !== id) return false;
    if (phone && g.phone === phone) return true;
    if (email && g.email && g.email.toLowerCase() === email.toLowerCase()) return true;
    return false;
  });
  if (existingGuest) {
    return res.status(400).json({ error: 'You have already registered for this event with this contact detail.' });
  }

  // IP Rate limiting
  const ip = getClientIp(req);
  const now = Date.now();
  const past1h = now - 60 * 60 * 1000;
  const past24h = now - 24 * 60 * 60 * 1000;

  let ipRecord = guestIpRateMap.get(ip);
  if (!ipRecord) {
    ipRecord = { eventRegistrations: new Map(), totalTimestamps: [] };
    guestIpRateMap.set(ip, ipRecord);
  }

  ipRecord.totalTimestamps = ipRecord.totalTimestamps.filter(t => t >= past24h);
  if (ipRecord.totalTimestamps.length >= 100) {
    return res.status(429).json({ error: 'Guest registration limit reached for today.' });
  }

  let eventTs = ipRecord.eventRegistrations.get(id) || [];
  eventTs = eventTs.filter(t => t >= past24h);

  const eventTs1h = eventTs.filter(t => t >= past1h);
  if (eventTs1h.length >= 20) {
    return res.status(429).json({ error: 'Guest registration limit reached for this event this hour.' });
  }

  if (eventTs.length >= 60) {
    return res.status(429).json({ error: 'Guest registration limit reached for this event today.' });
  }

  // Token & personal ticket code generation (store sha256 only)
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const guestId = 'guest-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex');
  const createdAt = new Date().toISOString();

  // Record IP hits
  eventTs.push(now);
  ipRecord.eventRegistrations.set(id, eventTs);
  ipRecord.totalTimestamps.push(now);

  if (isFull) {
    const guestRecord: any = {
      id: guestId,
      event_id: id,
      name,
      phone,
      email,
      status: 'waitlist',
      waitlist_at: createdAt,
      created_at: createdAt,
      token_hash: tokenHash
    };

    if (!Array.isArray(store.event_guests)) store.event_guests = [];
    store.event_guests.push(guestRecord);
    await persistDoc('event_guests', guestRecord.id, guestRecord);

    const position = getWaitlistPosition(item, 'guest', guestRecord.id) || 1;
    return res.json({
      success: true,
      status: 'waitlisted',
      position,
      token: rawToken,
      guest_id: guestRecord.id,
      event_id: id
    });
  }

  const ticketCode = deriveTicketCode(id, `guest:${guestId}`, createdAt);
  const codeHash = hashTicketCode(ticketCode);

  const guestRecord: any = {
    id: guestId,
    event_id: id,
    name,
    phone,
    email,
    status: 'registered',
    created_at: createdAt,
    token_hash: tokenHash,
    code_hash: codeHash
  };

  if (!Array.isArray(store.event_guests)) store.event_guests = [];
  store.event_guests.push(guestRecord);
  await persistDoc('event_guests', guestRecord.id, guestRecord);

  if (email) {
    const appBase = getPublicAppUrl();
    const ticketUrl = `${appBase}/#/events/${id}/ticket?g=${encodeURIComponent(rawToken)}`;
    await sendEventConfirmationEmail(item, email, name, ticketUrl);
  }

  return res.json({
    success: true,
    status: 'going',
    token: rawToken,
    guest_id: guestRecord.id,
    event_id: id,
    code: ticketCode
  });
});

app.post('/api/events/:id/guest-cancel', async (req: Request, res: Response) => {
  cleanupExpiredGuestRecords();
  const { id } = req.params;
  const token = req.body?.token;
  if (!token || typeof token !== 'string') {
    return res.status(400).json({ error: 'Registration token is required.' });
  }

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const guestIndex = (store.event_guests || []).findIndex(
    (g: any) => g.event_id === id && g.token_hash === tokenHash
  );

  if (guestIndex < 0) {
    return res.status(400).json({ error: 'Invalid registration token.' });
  }

  const guestRec = store.event_guests[guestIndex];
  const wasRegistered = guestRec.status !== 'waitlist';
  const guestId = guestRec.id;
  store.event_guests.splice(guestIndex, 1);
  await removeDoc('event_guests', guestId);

  if (wasRegistered) {
    await promoteFromWaitlist(id);
  }

  return res.json({ success: true, message: 'Registration cancelled.' });
});

app.get('/api/events/:id/guests', (req: Request, res: Response) => {
  cleanupExpiredGuestRecords();
  const callerId = resolveAuthUserId(req);
  const isAdmin = checkAdmin(req);
  const { id } = req.params;

  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) return res.status(404).json({ error: 'Event not found.' });

  const callerProfile = callerId ? store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId) : null;
  const callerProfileId = callerProfile?.id || callerId;
  const isAuthor = Boolean(callerProfileId && (item.author_id === callerProfileId || item.author_id === callerId));

  if (!isAuthor && !isAdmin) {
    return res.status(403).json({ error: 'Forbidden: Only the event host or an admin can view guest registrations.' });
  }

  const guests = (store.event_guests || [])
    .filter((g: any) => g.event_id === id)
    .map((g: any) => ({
      id: g.id,
      event_id: g.event_id,
      name: g.name,
      phone: g.phone,
      email: g.email,
      status: g.status || 'registered',
      created_at: g.created_at
    }));

  return res.json(guests);
});

app.delete('/api/events/:id/guests/:gid', async (req: Request, res: Response) => {
  cleanupExpiredGuestRecords();
  const callerId = resolveAuthUserId(req);
  const isAdmin = checkAdmin(req);
  const { id, gid } = req.params;

  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) return res.status(404).json({ error: 'Event not found.' });

  const callerProfile = callerId ? store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId) : null;
  const callerProfileId = callerProfile?.id || callerId;
  const isAuthor = Boolean(callerProfileId && (item.author_id === callerProfileId || item.author_id === callerId));

  if (!isAuthor && !isAdmin) {
    return res.status(403).json({ error: 'Forbidden: Only the event host or an admin can remove guests.' });
  }

  const guestIndex = (store.event_guests || []).findIndex((g: any) => g.id === gid && g.event_id === id);
  if (guestIndex < 0) return res.status(404).json({ error: 'Guest registration not found.' });

  const wasRegistered = store.event_guests[guestIndex].status !== 'waitlist';
  store.event_guests.splice(guestIndex, 1);
  await removeDoc('event_guests', gid);

  if (wasRegistered) {
    await promoteFromWaitlist(id);
  }

  return res.json({ success: true });
});

// Part 5: Admin moderation routes
app.get('/api/admin/events', (req: Request, res: Response) => {
  const admin = verifyAdmin(req, res);
  if (!admin) return;
  return res.json(store.events || []);
});

app.post('/api/admin/events/:id/hide', async (req: Request, res: Response) => {
  const admin = verifyAdmin(req, res);
  if (!admin) return;

  const { id } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) return res.status(404).json({ error: 'Event not found' });

  const allowedReasons = ['Not a real event', 'Spam or scam', 'Offensive', 'Duplicate', 'Other'];
  const rawReason = req.body?.reason;
  if (!rawReason || !allowedReasons.includes(rawReason)) {
    return res.status(400).json({ error: 'Reason is required. Must be one of: ' + allowedReasons.join(', ') });
  }

  const note = req.body?.note ? sanitizeText(req.body.note, 300) : '';
  const reasonStr = rawReason === 'Other' && note ? `Other (${note})` : rawReason;

  item.hidden_by_moderation = true;
  item.reviewed_by_admin = true;
  item.under_review = false;
  item.hidden_reason = reasonStr;

  const auditEntry = {
    id: newAuditId(),
    timestamp: new Date().toISOString(),
    action: 'HIDE_EVENT',
    details: `Admin hid event "${item.title}" (${id}). Reason: ${reasonStr}`,
    admin: admin.adminName
  };
  store.audit_log.unshift(auditEntry);
  await persistDoc('audit_log', auditEntry.id, auditEntry);
  await persistDoc('events', item.id, item);

  // Notify author
  if (item.author_id) {
    const authorProfile = store.profiles.find((p: any) => p.id === item.author_id || p.account_uid === item.author_id);
    if (authorProfile) {
      const notif = {
        id: 'notif-hide-' + Date.now(),
        to_id: authorProfile.id,
        from_id: 'moderator',
        type: 'moderation',
        body: `Your event "${item.title}" was hidden by a moderator. Reason: ${reasonStr}.`,
        event_id: id,
        link: `${getPublicAppUrl()}/e/${id}`,
        read: false,
        created_at: new Date().toISOString()
      };
      store.notifications.unshift(notif);
      await persistDoc('notifications', notif.id, notif);
    }
  }

  if (storageMode === 'disk') saveStore(store);
  return res.json({ success: true, message: 'Event hidden', item });
});

app.post('/api/admin/events/:id/restore', async (req: Request, res: Response) => {
  const admin = verifyAdmin(req, res);
  if (!admin) return;

  const { id } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) return res.status(404).json({ error: 'Event not found' });

  item.hidden_by_moderation = false;
  item.reviewed_by_admin = true;
  item.under_review = false;
  item.awaiting_review = false;

  const auditEntry = {
    id: newAuditId(),
    timestamp: new Date().toISOString(),
    action: 'RESTORE_EVENT',
    details: `Admin restored event "${item.title}" (${id})`,
    admin: admin.adminName
  };
  store.audit_log.unshift(auditEntry);
  await persistDoc('audit_log', auditEntry.id, auditEntry);
  await persistDoc('events', item.id, item);

  // Notify author
  if (item.author_id) {
    const authorProfile = store.profiles.find((p: any) => p.id === item.author_id || p.account_uid === item.author_id);
    if (authorProfile) {
      const notif = {
        id: 'notif-restore-' + Date.now(),
        to_id: authorProfile.id,
        from_id: 'moderator',
        type: 'moderation',
        body: `Your event "${item.title}" is visible again.`,
        event_id: id,
        link: `${getPublicAppUrl()}/e/${id}`,
        read: false,
        created_at: new Date().toISOString()
      };
      store.notifications.unshift(notif);
      await persistDoc('notifications', notif.id, notif);
    }
  }

  if (storageMode === 'disk') saveStore(store);
  return res.json({ success: true, message: 'Event restored', item });
});

app.delete('/api/admin/events/:id', async (req: Request, res: Response) => {
  const admin = verifyAdmin(req, res);
  if (!admin) return;

  const { id } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) return res.status(404).json({ error: 'Event not found' });

  const allowedReasons = ['Not a real event', 'Spam or scam', 'Offensive', 'Duplicate', 'Other'];
  const rawReason = req.body?.reason;
  if (!rawReason || !allowedReasons.includes(rawReason)) {
    return res.status(400).json({ error: 'Reason is required. Must be one of: ' + allowedReasons.join(', ') });
  }

  const note = req.body?.note ? sanitizeText(req.body.note, 300) : '';
  const reasonStr = rawReason === 'Other' && note ? `Other (${note})` : rawReason;

  const { registeredMemberIds, deletedGuestIds, deletedQuestionIds, deletedCheckinIds } =
    await deleteEventWithCascade(item, [], 'moderator');

  const auditEntry = {
    id: newAuditId(),
    timestamp: new Date().toISOString(),
    action: 'DELETE_EVENT_ADMIN',
    details: `Admin deleted event "${item.title}" (${id}). Reason: ${reasonStr}. Notified ${registeredMemberIds.length} member(s); removed ${deletedGuestIds.length} guest(s), ${deletedQuestionIds.length} question(s), ${deletedCheckinIds.length} check-in(s).`,
    admin: admin.adminName
  };
  store.audit_log.unshift(auditEntry);
  await persistDoc('audit_log', auditEntry.id, auditEntry);

  // Notify author
  if (item.author_id) {
    const authorProfile = store.profiles.find((p: any) => p.id === item.author_id || p.account_uid === item.author_id);
    if (authorProfile) {
      const notif = {
        id: 'notif-del-' + Date.now(),
        to_id: authorProfile.id,
        from_id: 'moderator',
        type: 'moderation',
        body: `Your event "${item.title}" was removed by a moderator. Reason: ${reasonStr}.`,
        read: false,
        created_at: new Date().toISOString()
      };
      store.notifications.unshift(notif);
      await persistDoc('notifications', notif.id, notif);
    }
  }

  if (storageMode === 'disk') saveStore(store);
  return res.json({
    success: true,
    message: 'Event deleted',
    notified: registeredMemberIds.length,
    removed: { guests: deletedGuestIds.length, questions: deletedQuestionIds.length, checkins: deletedCheckinIds.length }
  });
});

app.post('/api/admin/events/:id/block-author', async (req: Request, res: Response) => {
  const admin = verifyAdmin(req, res);
  if (!admin) return;

  const { id } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) return res.status(404).json({ error: 'Event not found' });

  const authorProfile = store.profiles.find((p: any) => p.id === item.author_id || p.account_uid === item.author_id);
  if (!authorProfile) {
    return res.status(404).json({ error: 'Author profile not found' });
  }

  authorProfile.events_blocked = true;
  await persistDoc('profiles', authorProfile.id, authorProfile);

  const auditEntry = {
    id: newAuditId(),
    timestamp: new Date().toISOString(),
    action: 'BLOCK_EVENT_AUTHOR',
    details: `Admin blocked author ${authorProfile.name} (${authorProfile.id}) from creating events`,
    admin: admin.adminName
  };
  store.audit_log.unshift(auditEntry);
  await persistDoc('audit_log', auditEntry.id, auditEntry);
  if (storageMode === 'disk') saveStore(store);

  return res.json({ success: true, message: `Author ${authorProfile.name} blocked from creating events` });
});

app.post('/api/admin/events/:id/unblock-author', async (req: Request, res: Response) => {
  const admin = verifyAdmin(req, res);
  if (!admin) return;

  const { id } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) return res.status(404).json({ error: 'Event not found' });

  const authorProfile = store.profiles.find((p: any) => p.id === item.author_id || p.account_uid === item.author_id);
  if (!authorProfile) {
    return res.status(404).json({ error: 'Author profile not found' });
  }

  authorProfile.events_blocked = false;
  await persistDoc('profiles', authorProfile.id, authorProfile);

  const auditEntry = {
    id: newAuditId(),
    timestamp: new Date().toISOString(),
    action: 'UNBLOCK_EVENT_AUTHOR',
    details: `Admin unblocked author ${authorProfile.name} (${authorProfile.id}) from creating events`,
    admin: admin.adminName
  };
  store.audit_log.unshift(auditEntry);
  await persistDoc('audit_log', auditEntry.id, auditEntry);
  if (storageMode === 'disk') saveStore(store);

  return res.json({ success: true, message: `Author ${authorProfile.name} unblocked from creating events` });
});

// Admin Review: Approve event/opportunity (alias)
app.post('/api/admin/events/:id/approve', async (req: Request, res: Response) => {
  const admin = verifyAdmin(req, res);
  if (!admin) return;

  const { id } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) return res.status(404).json({ error: 'Event or Opportunity not found' });

  item.status = 'published';
  item.published = true;
  item.hidden_by_moderation = false;
  item.approved_by = admin.adminName;
  item.approved_at = new Date().toISOString();

  await persistDoc('events', item.id, item);
  if (storageMode === 'disk') saveStore(store);
  return res.json({ success: true, item: sanitizeEventForPublic(item) });
});

// Admin Review: Reject event/opportunity (alias)
app.post('/api/admin/events/:id/reject', async (req: Request, res: Response) => {
  const admin = verifyAdmin(req, res);
  if (!admin) return;

  const { id } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) return res.status(404).json({ error: 'Event or Opportunity not found' });

  item.status = 'rejected';
  item.published = false;
  item.rejection_reason = sanitizeText(req.body?.reason, 300) || 'Guidelines violation';
  item.rejected_by = admin.adminName;
  item.rejected_at = new Date().toISOString();

  await persistDoc('events', item.id, item);
  if (storageMode === 'disk') saveStore(store);
  return res.json({ success: true, item: sanitizeEventForPublic(item) });
});

// Admin: Toggle Organiser label on a member
app.post('/api/admin/members/:id/organiser', async (req: Request, res: Response) => {
  const admin = verifyAdmin(req, res);
  if (!admin) return;

  const { id } = req.params;
  const target = store.profiles.find((p: any) => p.id === id);
  if (!target) return res.status(404).json({ error: 'Member not found' });

  target.is_organiser = req.body?.is_organiser !== undefined ? Boolean(req.body.is_organiser) : !target.is_organiser;
  await persistDoc('profiles', target.id, target);

  const auditEntry = {
    id: newAuditId(),
    timestamp: new Date().toISOString(),
    action: target.is_organiser ? 'GRANT_ORGANISER' : 'REVOKE_ORGANISER',
    details: `${target.is_organiser ? 'Granted' : 'Revoked'} Organiser label for ${target.name} (${target.id})`,
    admin: admin.adminName
  };
  store.audit_log.unshift(auditEntry);
  await persistDoc('audit_log', auditEntry.id, auditEntry);

  if (storageMode === 'disk') saveStore(store);
  return res.json({ success: true, is_organiser: target.is_organiser });
});

// Author Controls: Send 1 update a day to attendees as a notification
app.post('/api/events/:id/update', async (req: Request, res: Response) => {
  const callerId = resolveAuthUserId(req);
  const adminInfo = resolveAdminInfo(req);
  const isAdmin = adminInfo.isAdmin;
  const callerProfile = callerId ? store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId) : null;
  const callerProfileId = callerProfile?.id || callerId;

  const { id } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) return res.status(404).json({ error: 'Event or Opportunity not found' });

  const isAuthor = Boolean(callerProfileId && (item.author_id === callerProfileId || item.author_id === callerId));
  if (!isAdmin && !isAuthor) {
    return res.status(403).json({ error: 'Forbidden: Only the author or an admin can send updates to attendees.' });
  }

  const message = sanitizeText(req.body?.message, 500);
  if (!message) return res.status(400).json({ error: 'Update message is required.' });

  // Rate limit: 1 update a day (24 hours)
  if (item.last_update_sent_at) {
    const diff = Date.now() - new Date(item.last_update_sent_at).getTime();
    if (diff < 24 * 60 * 60 * 1000) {
      const hoursLeft = Math.ceil((24 * 60 * 60 * 1000 - diff) / (60 * 60 * 1000));
      return res.status(429).json({ error: `You can only send one update a day. Next update available in ${hoursLeft} hour(s).` });
    }
  }

  item.last_update_sent_at = new Date().toISOString();
  await persistDoc('events', item.id, item);

  const attendeeIds = Array.isArray(item.attendee_ids) ? item.attendee_ids : [];
  const notifs: Array<{ id: string; data: any }> = [];
  const authorName = item.author_name || callerProfile?.name || 'Organizer';

  for (const attId of attendeeIds) {
    const notif = {
      id: 'notif-upd-' + Date.now() + '-' + crypto.randomBytes(5).toString('hex'),
      to_id: attId,
      from_id: item.author_id || 'organiser',
      type: 'digest',
      body: `📢 Update on "${item.title}" from ${authorName}: ${message}`,
      event_id: id,
      link: `${getPublicAppUrl()}/e/${id}`,
      read: false,
      created_at: new Date().toISOString()
    };
    store.notifications.unshift(notif);
    notifs.push({ id: notif.id, data: notif });
  }

  if (notifs.length > 0) {
    await batchPersistDocs('notifications', notifs);
  }

  if (storageMode === 'disk') saveStore(store);
  return res.json({ success: true, count: attendeeIds.length });
});

app.get(['/api/events/:id/export', '/api/events/:id/attendees.csv'], (req: Request, res: Response) => {
  cleanupExpiredGuestRecords();
  const isAdmin = checkAdmin(req);
  const callerId = resolveAuthUserId(req);

  const { id } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) {
    return res.status(404).json({ error: 'Event or Opportunity not found' });
  }

  if (!isAdmin && !callerId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const callerProfile = callerId ? store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId) : null;
  const callerProfileId = callerProfile?.id || callerId;
  const isAuthor = Boolean(callerProfileId && (item.author_id === callerProfileId || item.author_id === callerId));

  if (!isAdmin && !isAuthor) {
    return res.status(403).json({ error: 'Forbidden: Only the event host or an admin can export attendees.' });
  }

  const attendeeIds = Array.isArray(item.attendee_ids) ? item.attendee_ids : [];
  const attendeeProfiles = store.profiles.filter((p: any) => attendeeIds.includes(p.id) && !p.hidden && !p.suspended);
  const confirmedGuests = (store.event_guests || []).filter((g: any) => g.event_id === id && g.status !== 'waitlist');
  const eventCheckins = (store.event_checkins || []).filter((c: any) => c.event_id === id);

  let csv = 'name,type,email,registered_at,checked_in_at,method,status\n';
  for (const p of attendeeProfiles) {
    const cleanName = (p.name || '').replace(/"/g, '""');
    const regAt = ((item.rsvp_times && item.rsvp_times[p.id]) || item.created_at || '').replace(/"/g, '""');
    const chk = eventCheckins.find((c: any) => c.kind === 'member' && (c.ref_id === p.id || c.ref_id === p.account_uid));
    const checkedInAt = (chk?.checked_in_at || '').replace(/"/g, '""');
    const method = (chk?.method || '').replace(/"/g, '""');
    csv += `"${cleanName}","Member","","${regAt}","${checkedInAt}","${method}","going"\n`;
  }
  for (const g of confirmedGuests) {
    const cleanName = (g.name || '').replace(/"/g, '""');
    const cleanEmail = (g.email || '').replace(/"/g, '""');
    const regAt = (g.created_at || '').replace(/"/g, '""');
    const chk = eventCheckins.find((c: any) => c.kind === 'guest' && c.ref_id === g.id);
    const checkedInAt = (chk?.checked_in_at || '').replace(/"/g, '""');
    const method = (chk?.method || '').replace(/"/g, '""');
    csv += `"${cleanName}","Guest","${cleanEmail}","${regAt}","${checkedInAt}","${method}","going"\n`;
  }

  const waitlistDetails = buildWaitlistDetails(item);
  for (const w of waitlistDetails) {
    const cleanName = (w.name || '').replace(/"/g, '""');
    const cleanEmail = w.kind === 'guest' ? (w.email || '').replace(/"/g, '""') : '';
    const regAt = (w.created_at || '').replace(/"/g, '""');
    const typeLabel = w.kind === 'guest' ? 'Guest' : 'Member';
    csv += `"${cleanName}","${typeLabel}","${cleanEmail}","${regAt}","","","waitlist"\n`;
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${item.id}-attendees.csv"`);
  return res.send(csv);
});

// Rate limit maps for Kwegatta 1.8.0 check-in endpoints
const hostCheckinRateMap = new Map<string, number[]>();
const selfCheckinIpRateMap = new Map<string, number[]>();
const selfCheckinGuestFailMap = new Map<string, { fails: number; blockedUntil: number }>();

// GET /api/events/:id/my-ticket — signed-in attendee or registered guest with X-Guest-Token
app.get('/api/events/:id/my-ticket', async (req: Request, res: Response) => {
  if (!isCheckinConfigured()) {
    return res.status(503).json({ error: 'Check-in is not configured' });
  }
  const { id } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const callerId = resolveAuthUserId(req);
  const guestToken =
    (typeof req.headers['x-guest-token'] === 'string' ? (req.headers['x-guest-token'] as string) : undefined) ||
    (typeof req.query.g === 'string' ? req.query.g : undefined);

  if (callerId) {
    const callerProfile = store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId);
    const memberId = callerProfile?.id || callerId;
    const attendeeIds = Array.isArray(item.attendee_ids) ? item.attendee_ids : [];
    const isAttendee = attendeeIds.includes(memberId) || attendeeIds.includes(callerId);

    if (isAttendee) {
      const matchedId = attendeeIds.includes(memberId) ? memberId : callerId;
      if (!item.rsvp_times || typeof item.rsvp_times !== 'object') {
        item.rsvp_times = {};
      }
      if (!item.rsvp_times[matchedId]) {
        item.rsvp_times[matchedId] = item.created_at || new Date().toISOString();
      }
      const code = deriveTicketCode(id, `member:${matchedId}`, item.rsvp_times[matchedId]);
      const codeHash = hashTicketCode(code);
      if (!item.member_ticket_hashes || typeof item.member_ticket_hashes !== 'object') {
        item.member_ticket_hashes = {};
      }
      if (item.member_ticket_hashes[matchedId] !== codeHash) {
        item.member_ticket_hashes[matchedId] = codeHash;
        await persistDoc('events', item.id, item);
      }
      return res.json({
        code,
        qr_payload: `KWG1:${id}:${code}`
      });
    }

    const waitlistIds = Array.isArray(item.waitlist_ids) ? item.waitlist_ids : [];
    if (waitlistIds.includes(memberId) || waitlistIds.includes(callerId)) {
      const pos = getWaitlistPosition(item, 'member', memberId, callerId) || 1;
      return res.status(409).json({ error: `You're #${pos} on the waitlist` });
    }
  }

  if (guestToken) {
    const tokenHash = crypto.createHash('sha256').update(guestToken).digest('hex');
    const guestRec = (store.event_guests || []).find((g: any) => g.event_id === id && g.token_hash === tokenHash);
    if (guestRec) {
      if (guestRec.status === 'waitlist') {
        const pos = getWaitlistPosition(item, 'guest', guestRec.id) || 1;
        return res.status(409).json({ error: `You're #${pos} on the waitlist` });
      }
      const code = deriveTicketCode(id, `guest:${guestRec.id}`, guestRec.created_at || '');
      const codeHash = hashTicketCode(code);
      if (guestRec.code_hash !== codeHash) {
        guestRec.code_hash = codeHash;
        await persistDoc('event_guests', guestRec.id, guestRec);
      }
      return res.json({
        code,
        qr_payload: `KWG1:${id}:${code}`
      });
    }
  }

  return res.status(403).json({ error: 'Forbidden: Only registered attendees for this event can view a ticket.' });
});

// POST /api/events/:id/checkin — Mode 1: Host scans tickets or checks in manually (author or admin only)
app.post('/api/events/:id/checkin', async (req: Request, res: Response) => {
  if (!isCheckinConfigured()) {
    return res.status(503).json({ error: 'Check-in is not configured' });
  }
  const { id } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const isAdmin = checkAdmin(req);
  const callerId = resolveAuthUserId(req);
  const callerProfile = callerId ? store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId) : null;
  const callerProfileId = callerProfile?.id || callerId;
  const isAuthor = Boolean(callerProfileId && (item.author_id === callerProfileId || item.author_id === callerId));

  if (!isAdmin && !isAuthor) {
    return res.status(403).json({ error: 'Forbidden: Only the event host or an admin can check in attendees.' });
  }

  // Rate limit: 120 per minute per host
  const hostKey = callerProfileId || 'admin';
  const now = Date.now();
  const recentHostActions = (hostCheckinRateMap.get(hostKey) || []).filter(t => now - t < 60000);
  if (recentHostActions.length >= 120) {
    return res.status(429).json({ error: 'Rate limit exceeded: max 120 check-in actions per minute.' });
  }
  recentHostActions.push(now);
  hostCheckinRateMap.set(hostKey, recentHostActions);

  // Common rule: Check-in is allowed from 3 hours before start until 6 hours after end (409 otherwise)
  if (!isWithinCheckinWindow(item, now)) {
    return res.status(409).json({ error: 'Check-in is only allowed from 3 hours before start until 6 hours after end.' });
  }

  const body = req.body || {};
  const attendeeIds = Array.isArray(item.attendee_ids) ? item.attendee_ids : [];
  const waitlistIds = Array.isArray(item.waitlist_ids) ? item.waitlist_ids : [];
  let kind: 'member' | 'guest' | null = null;
  let refId = '';
  let attendeeName = '';
  let codeHash = '';
  let method: 'host_scan' | 'manual' = 'host_scan';

  if (typeof body.code === 'string' && body.code.trim()) {
    const rawCode = body.code.trim();
    if (/^kwg1:/i.test(rawCode)) {
      const parts = rawCode.split(':');
      if (parts.length < 3 || parts[1] !== id) {
        return res.status(404).json({ error: 'Not a ticket for this event' });
      }
    }
    const normalizedCode = normalizeTicketCode(rawCode);
    const candidateHash = hashTicketCode(normalizedCode);

    // Search active member attendees of this event
    for (const attId of attendeeIds) {
      let storedHash = item.member_ticket_hashes?.[attId];
      if (!storedHash) {
        const regTime = item.rsvp_times?.[attId] || item.created_at || '';
        if (regTime) {
          storedHash = hashTicketCode(deriveTicketCode(id, `member:${attId}`, regTime));
        }
      }
      if (storedHash && storedHash === candidateHash) {
        kind = 'member';
        refId = attId;
        codeHash = storedHash;
        const prof = store.profiles.find((p: any) => p.id === attId || p.account_uid === attId);
        attendeeName = prof?.name || 'Member';
        method = 'host_scan';
        break;
      }
    }

    // If not a member, search confirmed guest registrations for this event
    if (!kind) {
      const eventGuests = (store.event_guests || []).filter((g: any) => g.event_id === id && g.status !== 'waitlist');
      for (const g of eventGuests) {
        const gHash = g.code_hash || hashTicketCode(deriveTicketCode(id, `guest:${g.id}`, g.created_at || ''));
        if (gHash === candidateHash) {
          kind = 'guest';
          refId = g.id;
          codeHash = gHash;
          attendeeName = g.name || 'Guest';
          method = 'host_scan';
          break;
        }
      }
    }

    if (!kind) {
      return res.status(404).json({ error: 'Not a ticket for this event' });
    }
  } else if ((body.kind === 'member' || body.kind === 'guest') && typeof body.ref_id === 'string' && body.ref_id.trim()) {
    method = 'manual';
    const targetRef = body.ref_id.trim();
    if (body.kind === 'member') {
      const prof = store.profiles.find((p: any) => p.id === targetRef || p.account_uid === targetRef);
      const isAtt = attendeeIds.includes(targetRef) || (prof && attendeeIds.includes(prof.id));
      if (!isAtt) {
        const isWait = waitlistIds.includes(targetRef) || (prof && waitlistIds.includes(prof.id));
        if (isWait) {
          const pos = getWaitlistPosition(item, 'member', prof?.id || targetRef, targetRef) || 1;
          return res.status(409).json({ error: `You're #${pos} on the waitlist` });
        }
        return res.status(404).json({ error: 'Not a ticket for this event' });
      }
      kind = 'member';
      refId = prof?.id || targetRef;
      attendeeName = prof?.name || 'Member';
      codeHash = item.member_ticket_hashes?.[refId] || '';
    } else {
      const g = (store.event_guests || []).find((guest: any) => guest.event_id === id && guest.id === targetRef);
      if (!g) {
        return res.status(404).json({ error: 'Not a ticket for this event' });
      }
      if (g.status === 'waitlist') {
        const pos = getWaitlistPosition(item, 'guest', g.id) || 1;
        return res.status(409).json({ error: `You're #${pos} on the waitlist` });
      }
      kind = 'guest';
      refId = g.id;
      attendeeName = g.name || 'Guest';
      codeHash = g.code_hash || '';
    }
  } else {
    return res.status(400).json({ error: 'Provide either { code } or { kind, ref_id }.' });
  }

  if (!Array.isArray(store.event_checkins)) store.event_checkins = [];
  const existing = store.event_checkins.find(
    (c: any) => c.event_id === id && c.kind === kind && c.ref_id === refId
  );

  if (existing) {
    return res.json({
      name: attendeeName,
      status: 'already',
      checked_in_at: existing.checked_in_at,
      method: existing.method
    });
  }

  const checkinRecord = {
    id: `chk-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    event_id: id,
    kind,
    ref_id: refId,
    code_hash: codeHash,
    checked_in_at: new Date(now).toISOString(),
    checked_in_by: hostKey,
    method
  };

  store.event_checkins.push(checkinRecord);
  await persistDoc('event_checkins', checkinRecord.id, checkinRecord);

  return res.json({
    name: attendeeName,
    status: 'checked_in',
    checked_in_at: checkinRecord.checked_in_at,
    method: checkinRecord.method
  });
});

// GET /api/events/:id/checkin-token — Host/Admin rotating venue QR token (30s window)
app.get('/api/events/:id/checkin-token', (req: Request, res: Response) => {
  if (!isCheckinConfigured()) {
    return res.status(503).json({ error: 'Check-in is not configured' });
  }
  const { id } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) {
    return res.status(404).json({ error: 'Event not found' });
  }

  const isAdmin = checkAdmin(req);
  const callerId = resolveAuthUserId(req);
  const callerProfile = callerId ? store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId) : null;
  const callerProfileId = callerProfile?.id || callerId;
  const isAuthor = Boolean(callerProfileId && (item.author_id === callerProfileId || item.author_id === callerId));

  if (!isAdmin && !isAuthor) {
    return res.status(403).json({ error: 'Forbidden: Only the event host or an admin can display the venue QR.' });
  }

  const token = generateSelfCheckinToken(id);
  const checkedInCount = (store.event_checkins || []).filter((c: any) => c.event_id === id).length;

  return res.json({
    token,
    url: `${getPublicAppUrl()}/#/checkin/${id}/${token}`,
    checked_in_count: checkedInCount,
    expires_in_ms: 30000
  });
});

// POST /api/events/:id/self-checkin — Mode 2: Venue QR self check-in
app.post('/api/events/:id/self-checkin', async (req: Request, res: Response) => {
  if (!isCheckinConfigured()) {
    return res.status(503).json({ error: 'Check-in is not configured' });
  }
  const { id } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) {
    return res.status(404).json({ error: 'Event not found' });
  }

  if (!item.self_checkin_enabled) {
    return res.status(403).json({ error: 'Self check-in is not enabled for this event.' });
  }

  const ip = getClientIp(req);
  const now = Date.now();
  const ipEventKey = `${ip}:${id}`;

  // Check 15-minute block from 5 failed guest-email attempts per IP per event
  const failState = selfCheckinGuestFailMap.get(ipEventKey);
  if (failState && failState.blockedUntil > now) {
    return res.status(429).json({ error: 'Too many failed guest email attempts. Please try again in 15 minutes.' });
  }

  // Rate limit: 10 attempts per minute per IP
  const recentAttempts = (selfCheckinIpRateMap.get(ipEventKey) || []).filter(t => now - t < 60000);
  if (recentAttempts.length >= 10) {
    return res.status(429).json({ error: 'Too many self check-in attempts. Please wait a minute and try again.' });
  }
  recentAttempts.push(now);
  selfCheckinIpRateMap.set(ipEventKey, recentAttempts);

  const rawToken = typeof req.body?.token === 'string' ? req.body.token : '';
  const tokenCheck = verifySelfCheckinToken(id, rawToken, now);
  if (tokenCheck.expired) {
    return res.status(410).json({ error: 'QR expired, scan again' });
  }
  if (!tokenCheck.valid) {
    return res.status(400).json({ error: 'Invalid check-in QR token' });
  }

  // Event check-in time window check (3h before start until 6h after end)
  if (!isWithinCheckinWindow(item, now)) {
    return res.status(409).json({ error: 'Check-in is only allowed from 3 hours before start until 6 hours after end.' });
  }

  if (!Array.isArray(store.event_checkins)) store.event_checkins = [];

  // Guest self check-in by email
  if (typeof req.body?.guest_email === 'string' && req.body.guest_email.trim()) {
    const guestEmail = req.body.guest_email.trim().toLowerCase();
    const matchedGuest = (store.event_guests || []).find(
      (g: any) => g.event_id === id && typeof g.email === 'string' && g.email.trim().toLowerCase() === guestEmail
    );

    if (!matchedGuest) {
      const currentFails =
        (failState && failState.blockedUntil > 0 && failState.blockedUntil <= now ? 0 : (failState?.fails || 0)) + 1;
      const blockedUntil = currentFails >= 5 ? now + 15 * 60 * 1000 : 0;
      selfCheckinGuestFailMap.set(ipEventKey, { fails: currentFails, blockedUntil });
      if (currentFails >= 5) {
        return res.status(429).json({ error: 'Too many failed guest email attempts. Blocked for 15 minutes.' });
      }
      return res.status(404).json({ error: 'No guest registration found matching that email for this event.' });
    }

    if (matchedGuest.status === 'waitlist') {
      const pos = getWaitlistPosition(item, 'guest', matchedGuest.id) || 1;
      return res.status(409).json({ error: `You're #${pos} on the waitlist` });
    }

    const existing = store.event_checkins.find(
      (c: any) => c.event_id === id && c.kind === 'guest' && c.ref_id === matchedGuest.id
    );
    if (existing) {
      return res.json({
        name: matchedGuest.name || 'Guest',
        status: 'already',
        message: "You're already checked in",
        checked_in_at: existing.checked_in_at
      });
    }

    const codeHash = matchedGuest.code_hash || hashTicketCode(deriveTicketCode(id, `guest:${matchedGuest.id}`, matchedGuest.created_at || ''));
    const checkinRecord = {
      id: `chk-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
      event_id: id,
      kind: 'guest' as const,
      ref_id: matchedGuest.id,
      code_hash: codeHash,
      checked_in_at: new Date(now).toISOString(),
      checked_in_by: matchedGuest.id,
      method: 'self' as const
    };
    store.event_checkins.push(checkinRecord);
    await persistDoc('event_checkins', checkinRecord.id, checkinRecord);

    return res.json({
      name: matchedGuest.name || 'Guest',
      status: 'checked_in',
      checked_in_at: checkinRecord.checked_in_at
    });
  }

  // Signed-in member self check-in
  const callerId = resolveAuthUserId(req);
  if (!callerId) {
    return res.status(401).json({ error: 'Sign in or enter the email you used to register as a guest.' });
  }

  const callerProfile = store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId);
  const memberId = callerProfile?.id || callerId;
  const attendeeIds = Array.isArray(item.attendee_ids) ? item.attendee_ids : [];
  const isRegistered = attendeeIds.includes(memberId) || attendeeIds.includes(callerId);

  if (!isRegistered) {
    const waitlistIds = Array.isArray(item.waitlist_ids) ? item.waitlist_ids : [];
    if (waitlistIds.includes(memberId) || waitlistIds.includes(callerId)) {
      const pos = getWaitlistPosition(item, 'member', memberId, callerId) || 1;
      return res.status(409).json({ error: `You're #${pos} on the waitlist` });
    }
    return res.status(409).json({ error: "You're not registered for this event" });
  }

  const refId = attendeeIds.includes(memberId) ? memberId : callerId;
  const existing = store.event_checkins.find(
    (c: any) => c.event_id === id && c.kind === 'member' && (c.ref_id === refId || c.ref_id === callerId)
  );
  if (existing) {
    return res.json({
      name: callerProfile?.name || 'Member',
      status: 'already',
      message: "You're already checked in",
      checked_in_at: existing.checked_in_at
    });
  }

  const regTime = item.rsvp_times?.[refId] || item.created_at || new Date(now).toISOString();
  const codeHash = item.member_ticket_hashes?.[refId] || hashTicketCode(deriveTicketCode(id, `member:${refId}`, regTime));

  const checkinRecord = {
    id: `chk-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    event_id: id,
    kind: 'member' as const,
    ref_id: refId,
    code_hash: codeHash,
    checked_in_at: new Date(now).toISOString(),
    checked_in_by: refId,
    method: 'self' as const
  };
  store.event_checkins.push(checkinRecord);
  await persistDoc('event_checkins', checkinRecord.id, checkinRecord);

  return res.json({
    name: callerProfile?.name || 'Member',
    status: 'checked_in',
    checked_in_at: checkinRecord.checked_in_at
  });
});

/* =========================================================================
   EVENT MATCHING: "PEOPLE TO MEET HERE" ENDPOINTS
   ========================================================================= */

const eventPeopleToMeetCache = new Map<string, { timestamp: number; data: any }>();

function computeHeuristicMatchScore(me: any, candidate: any): { score: number; reason: string } {
  let score = 65;
  const meOffers = String(me.offers || me.teaches || '').toLowerCase();
  const meNeeds = String(me.needs || me.learns || '').toLowerCase();
  const candOffers = String(candidate.offers || candidate.teaches || '').toLowerCase();
  const candNeeds = String(candidate.needs || candidate.learns || '').toLowerCase();

  let reason = '';
  if (candOffers && meNeeds && (candOffers.includes(meNeeds) || meNeeds.split(' ').some(w => w.length > 3 && candOffers.includes(w)))) {
    score += 15;
    reason = `${candidate.name || 'They'} offers skills (${candidate.offers || candidate.role || 'expertise'}) that align with what you need.`;
  } else if (meOffers && candNeeds && (meOffers.includes(candNeeds) || candNeeds.split(' ').some(w => w.length > 3 && meOffers.includes(w)))) {
    score += 15;
    reason = `You offer skills that ${candidate.name || 'they'} are looking for in the tech community.`;
  } else if (candidate.role && me.role && candidate.role.toLowerCase() !== me.role.toLowerCase()) {
    score += 10;
    reason = `As a ${candidate.role}, ${candidate.name} brings a complementary perspective to your ${me.role} background.`;
  } else {
    reason = `Both of you are active builders attending this event to connect and collaborate.`;
  }

  const meSkills = Array.isArray(me.skills) ? me.skills : [];
  const candSkills = Array.isArray(candidate.skills) ? candidate.skills : [];
  const sharedSkills = meSkills.filter((s: string) => candSkills.some((cs: string) => String(cs).toLowerCase() === String(s).toLowerCase()));
  if (sharedSkills.length > 0) {
    score += Math.min(20, sharedSkills.length * 5);
    reason += ` Shared interests: ${sharedSkills.slice(0, 3).join(', ')}.`;
  }

  score = Math.min(95, Math.max(65, score));
  return { score, reason };
}

// GET /api/events/:id/people-to-meet
app.get('/api/events/:id/people-to-meet', async (req: Request, res: Response) => {
  const callerId = resolveAuthUserId(req);
  if (!callerId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const { id } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) {
    return res.status(404).json({ error: 'Event not found' });
  }
  const callerProfile = store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId);
  const memberId = callerProfile?.id || callerId;

  const attendeeIds = Array.isArray(item.attendee_ids) ? item.attendee_ids : [];
  const isAttendee = attendeeIds.includes(memberId) || attendeeIds.includes(callerId);
  if (!isAttendee) {
    return res.status(403).json({ error: 'Forbidden: You must be an attendee of this event to see people to meet.' });
  }

  // Time window check: 7 days before starts_at until 24 hours after ends_at
  const now = Date.now();
  const startMs = new Date(item.starts_at || item.datetime || item.created_at).getTime();
  const endMs = item.ends_at ? new Date(item.ends_at).getTime() : startMs + (3 * 60 * 60 * 1000);

  const windowStart = startMs - (7 * 24 * 60 * 60 * 1000);
  const windowEnd = endMs + (24 * 60 * 60 * 1000);

  if (now < windowStart || now > windowEnd) {
    return res.status(409).json({ error: 'People to meet is available from 7 days before the event until 24 hours after it ends.' });
  }

  const optoutSet = new Set<string>(Array.isArray(item.match_optout_ids) ? item.match_optout_ids : []);
  const optedInAttendees = attendeeIds.filter((attId: string) => !optoutSet.has(attId));
  const optedInCount = optedInAttendees.length;

  const isAdmin = checkAdmin(req);
  const isHost = Boolean(item.author_id === memberId || item.author_id === callerId);

  if (isHost || isAdmin) {
    return res.json({
      people: [],
      is_host_or_admin: true,
      opted_in_count: optedInCount,
      message: `${optedInCount} attendee${optedInCount === 1 ? '' : 's'} opted into matching`
    });
  }

  const feedbackHiddenSet = new Set<string>(
    (store.event_match_feedback || [])
      .filter((f: any) => f.event_id === id && (f.member_id === memberId || f.member_id === callerId) && f.value === -1)
      .map((f: any) => f.target_profile_id)
  );

  const callerBlockedSet = new Set<string>(callerProfile?.blocked_ids || []);

  const candidates = (store.profiles || []).filter((p: any) => {
    if (!p.account_uid) return false;
    if (p.id === memberId || p.id === callerId || p.account_uid === callerId) return false;
    const isAtt = attendeeIds.includes(p.id) || attendeeIds.includes(p.account_uid);
    if (!isAtt) return false;
    if (optoutSet.has(p.id) || optoutSet.has(p.account_uid)) return false;
    if (p.hidden || p.suspended || p.hidden_by_moderation) return false;
    if (feedbackHiddenSet.has(p.id) || feedbackHiddenSet.has(p.account_uid)) return false;
    if (callerBlockedSet.has(p.id) || callerBlockedSet.has(p.account_uid)) return false;
    if (Array.isArray(p.blocked_ids) && (p.blocked_ids.includes(memberId) || p.blocked_ids.includes(callerId))) return false;
    return true;
  });

  if (candidates.length < 1 || optedInCount < 2) {
    return res.json({
      people: [],
      opted_in_count: optedInCount,
      message: 'Matches appear when more people RSVP.'
    });
  }

  // Heuristic ranking
  const scoredCandidates = candidates.map((cand: any) => {
    const { score, reason } = computeHeuristicMatchScore(callerProfile || { name: 'Member' }, cand);
    return { candidate: cand, score, reason };
  }).sort((a, b) => b.score - a.score);

  const top10 = scoredCandidates.slice(0, 10);

  // Cache check
  const cacheKey = `${id}:${memberId}:${top10.map(t => t.candidate.id).join('-')}:${feedbackHiddenSet.size}`;
  const cached = eventPeopleToMeetCache.get(cacheKey);
  if (cached && (now - cached.timestamp < 6 * 60 * 60 * 1000)) {
    return res.json(cached.data);
  }

  let resultPeople: any[] = [];
  const rateLimitRes = checkMemberGemmaRateLimit(callerId);

  if (rateLimitRes.allowed && process.env.GEMINI_API_KEY) {
    try {
      const gemmaData = {
        event_title: item.title,
        me: {
          name: callerProfile?.name || 'Attendee',
          role: callerProfile?.role || 'builder',
          offers: callerProfile?.offers || callerProfile?.teaches || '',
          needs: callerProfile?.needs || callerProfile?.learns || ''
        },
        attendees: top10.map(t => ({
          id: t.candidate.id,
          name: t.candidate.name,
          role: t.candidate.role,
          offers: t.candidate.offers || t.candidate.teaches || '',
          needs: t.candidate.needs || t.candidate.learns || ''
        }))
      };

      const prompt = buildGemmaPrompt('event_matches', gemmaData);
      const contents = [{ role: 'user', parts: [{ text: prompt }] }];
      const generationConfig = { temperature: 0.1, maxOutputTokens: 800 };

      const gemmaPromise = invokeGemmaDirect(contents, generationConfig);
      const timeoutMs = (process.env.NODE_ENV === 'test' || process.env.VITEST) ? 1500 : 10000;
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Gemma timeout')), timeoutMs));

      const gemmaRes: any = await Promise.race([gemmaPromise, timeoutPromise]);
      let rawText = gemmaRes?.text || (typeof gemmaRes?.data === 'string' ? gemmaRes.data : JSON.stringify(gemmaRes?.data || {}));
      if (rawText.includes('```')) {
        rawText = rawText.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();
      }

      let parsed: any = null;
      try { parsed = JSON.parse(rawText); } catch (_) {}

      const matchesArray = Array.isArray(parsed?.matches) ? parsed.matches : (Array.isArray(parsed) ? parsed : []);

      if (matchesArray.length > 0) {
        for (const m of matchesArray.slice(0, 5)) {
          const candObj = top10.find(t => t.candidate.id === m.profile_id || t.candidate.id === m.id);
          if (candObj) {
            resultPeople.push({
              id: candObj.candidate.id,
              name: candObj.candidate.name || 'Member',
              avatar: candObj.candidate.avatar || '',
              role: candObj.candidate.role || 'Member',
              headline: candObj.candidate.headline || '',
              reason: m.reason || candObj.reason,
              score: typeof m.score === 'number' ? m.score : candObj.score
            });
          }
        }
      }
    } catch (err: any) {
      console.warn('[People-to-Meet] Gemma task event_matches failed/timed out, using heuristic:', err?.message || err);
    }
  }

  // Fallback to heuristic if Gemma produced no results
  if (resultPeople.length === 0) {
    resultPeople = top10.slice(0, 5).map(t => ({
      id: t.candidate.id,
      name: t.candidate.name || 'Member',
      avatar: t.candidate.avatar || '',
      role: t.candidate.role || 'Member',
      headline: t.candidate.headline || '',
      reason: t.reason,
      score: t.score
    }));
  }

  const responsePayload = {
    people: resultPeople,
    opted_in_count: optedInCount
  };

  eventPeopleToMeetCache.set(cacheKey, { timestamp: now, data: responsePayload });
  return res.json(responsePayload);
});

// POST /api/events/:id/people-to-meet/feedback
app.post('/api/events/:id/people-to-meet/feedback', async (req: Request, res: Response) => {
  const callerId = resolveAuthUserId(req);
  if (!callerId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const { id } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) {
    return res.status(404).json({ error: 'Event not found' });
  }
  const callerProfile = store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId);
  const memberId = callerProfile?.id || callerId;

  const attendeeIds = Array.isArray(item.attendee_ids) ? item.attendee_ids : [];
  const isAttendee = attendeeIds.includes(memberId) || attendeeIds.includes(callerId);
  if (!isAttendee) {
    return res.status(403).json({ error: 'Forbidden: You must be an attendee to leave feedback.' });
  }

  const { profile_id, value } = req.body || {};
  if (!profile_id || (value !== 1 && value !== -1)) {
    return res.status(400).json({ error: 'Provide valid profile_id and value (1 or -1).' });
  }

  if (!Array.isArray(store.event_match_feedback)) {
    store.event_match_feedback = [];
  }

  const existingIdx = store.event_match_feedback.findIndex(
    (f: any) => f.event_id === id && (f.member_id === memberId || f.member_id === callerId) && f.target_profile_id === profile_id
  );

  const fbRecord = {
    id: existingIdx >= 0 ? store.event_match_feedback[existingIdx].id : `fb-${id}-${memberId}-${profile_id}`,
    event_id: id,
    member_id: memberId,
    target_profile_id: profile_id,
    value,
    created_at: new Date().toISOString()
  };

  if (existingIdx >= 0) {
    store.event_match_feedback[existingIdx] = fbRecord;
  } else {
    store.event_match_feedback.push(fbRecord);
  }

  await persistDoc('event_match_feedback', fbRecord.id, fbRecord);
  if (storageMode === 'disk') saveStore(store);

  // Invalidate cache for caller
  for (const k of eventPeopleToMeetCache.keys()) {
    if (k.startsWith(`${id}:${memberId}`)) eventPeopleToMeetCache.delete(k);
  }

  return res.json({ success: true });
});

// POST /api/events/:id/people-to-meet/opt-in
app.post('/api/events/:id/people-to-meet/opt-in', async (req: Request, res: Response) => {
  const callerId = resolveAuthUserId(req);
  if (!callerId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const { id } = req.params;
  const item = (store.events || []).find((e: any) => e.id === id);
  if (!item) {
    return res.status(404).json({ error: 'Event not found' });
  }
  const callerProfile = store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId);
  const memberId = callerProfile?.id || callerId;

  const attendeeIds = Array.isArray(item.attendee_ids) ? item.attendee_ids : [];
  const isAttendee = attendeeIds.includes(memberId) || attendeeIds.includes(callerId);
  if (!isAttendee) {
    return res.status(403).json({ error: 'Forbidden: You must be registered for this event to change matching preferences.' });
  }

  if (!Array.isArray(item.match_optout_ids)) {
    item.match_optout_ids = [];
  }

  const raw = req.body || {};
  const optIn = raw.opt_in !== undefined ? Boolean(raw.opt_in) : (raw.show_in_people_to_meet !== undefined ? Boolean(raw.show_in_people_to_meet) : (raw.match_optout !== undefined ? !raw.match_optout : true));

  if (optIn) {
    item.match_optout_ids = item.match_optout_ids.filter((optId: string) => optId !== memberId && optId !== callerId);
  } else {
    if (!item.match_optout_ids.includes(memberId)) {
      item.match_optout_ids.push(memberId);
    }
  }

  await persistDoc('events', item.id, item);
  if (storageMode === 'disk') saveStore(store);

  // Invalidate cache
  for (const k of eventPeopleToMeetCache.keys()) {
    if (k.startsWith(`${id}:`)) eventPeopleToMeetCache.delete(k);
  }

  return res.json({ success: true, opt_in: !item.match_optout_ids.includes(memberId) });
});

/* =========================================================================
   TEAM SECTION & ADMIN MANAGEMENT ENDPOINTS
   ========================================================================= */

export function canChangeTeam(isAdmin: boolean): boolean {
  return Boolean(isAdmin);
}

const TEAM_SINCE_SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function isValidLinkedinUrl(val: unknown): boolean {
  if (!val || typeof val !== 'string') return false;
  const trimmed = val.trim();
  return /^https:\/\/(www\.)?linkedin\.com\/.+/i.test(trimmed);
}

export function formatTeamSince(ym: unknown): string | null {
  if (!ym || typeof ym !== 'string') return null;
  const m = ym.trim().match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  if (!m) return null;
  const year = m[1];
  const monthIdx = parseInt(m[2], 10) - 1;
  return `${TEAM_SINCE_SHORT_MONTHS[monthIdx]} ${year}`;
}

export function validateTeamSince(val: unknown): { valid: boolean; value: string | null; error?: string } {
  if (val === undefined || val === null || String(val).trim() === '') {
    return { valid: true, value: null };
  }
  const str = String(val).trim();
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(str)) {
    return { valid: false, value: null, error: 'team_since must match YYYY-MM format' };
  }
  const now = new Date();
  const utcYm = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const localYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const maxYm = utcYm > localYm ? utcYm : localYm;
  if (str > maxYm) {
    return { valid: false, value: null, error: 'team_since cannot be in the future' };
  }
  return { valid: true, value: str };
}

function teamPhotoUrl(m: any): string {
  return `/api/team-photo/${encodeURIComponent(m.id)}?v=${encodeURIComponent(m.updated_at || '')}`;
}

function isTeamSettingsDoc(m: any): boolean {
  return !m || m.id === '__team_settings__' || Boolean(m.is_settings);
}

function linkedProfileFor(m: any): { profile: any; avatarUrl: string | null } {
  if (!m.linked_profile_id) return { profile: null, avatarUrl: null };
  const lp = store.profiles.find((p: any) => p.id === m.linked_profile_id && !p.hidden);
  if (!lp) return { profile: null, avatarUrl: null };
  return {
    profile: { id: lp.id, name: lp.name, role: lp.role, headline: lp.headline },
    avatarUrl: lp.avatar ? `/api/avatar/${lp.id}` : null
  };
}

export function getPublicTeamList(): any[] {
  let list = Array.isArray(store.team) ? [...store.team] : [];
  list = list.filter((m: any) => !isTeamSettingsDoc(m) && !m.hidden);
  list.sort((a: any, b: any) => (Number(a.order) || 0) - (Number(b.order) || 0));

  const detailsEnabled = Boolean(store.team_details_enabled);

  return list.map((m: any) => {
    const linked = linkedProfileFor(m);
    const pub: Record<string, any> = {
      id: m.id,
      name: m.name,
      line2: m.line2,
      github: m.github || null,
      linked_profile_id: linked.profile ? m.linked_profile_id : null,
      order: Number(m.order) || 0,
      photo_url: m.photo ? teamPhotoUrl(m) : null,
      linked_avatar: linked.avatarUrl,
      linked_profile: linked.profile
    };

    if (detailsEnabled) {
      const text = (v: unknown) => (v && String(v).trim() ? String(v).trim() : null);
      if (m.show_title === true && text(m.title)) pub.title = text(m.title);
      if (m.show_line1 === true && text(m.line1)) pub.line1 = text(m.line1);
      if (m.show_bio === true && text(m.bio)) pub.bio = text(m.bio);
      if (m.show_linkedin === true && isValidLinkedinUrl(m.linkedin)) pub.linkedin = String(m.linkedin).trim();
      if (m.show_x === true && checkX(m.x).ok && m.x) pub.x = m.x;
      if (m.show_website === true && checkWebsite(m.website).ok && m.website) pub.website = m.website;
      if (m.show_whatsapp === true && m.whatsapp) {
        const link = whatsappLink(m.whatsapp);
        if (link) pub.whatsapp_url = link;
      }
      if (m.show_since === true && m.team_since) {
        const formattedSince = formatTeamSince(m.team_since);
        if (formattedSince) pub.since = formattedSince;
      }
    }

    return pub;
  });
}

async function writeAdminAudit(admin: AdminResolution, action: string, details: string): Promise<void> {
  const auditEntry = {
    id: newAuditId(),
    timestamp: new Date().toISOString(),
    action,
    details,
    admin: admin.adminName
  };
  store.audit_log.unshift(auditEntry);
  await persistDoc('audit_log', auditEntry.id, auditEntry);
  if (storageMode === 'disk') saveStore(store);
}

function firstError(errors: Record<string, string>): string {
  return Object.values(errors)[0] || 'Invalid team member details';
}

/** Validates type and size, then resizes to a 400x400 WebP. Rejects anything sharp cannot decode. */
export async function processTeamPhoto(dataUrl: unknown): Promise<{ ok: true; photo: string } | { ok: false; error: string }> {
  const check = checkPhotoDataUrl(dataUrl);
  if (!check.ok) return check;
  const b64 = String(dataUrl).slice(String(dataUrl).indexOf(',') + 1).replace(/\s/g, '');
  try {
    const resized = await sharp(Buffer.from(b64, 'base64'), { limitInputPixels: 40_000_000 })
      .rotate()
      .resize(400, 400, { fit: 'cover', position: 'center' })
      .webp({ quality: 85 })
      .toBuffer();
    return { ok: true, photo: `data:image/webp;base64,${resized.toString('base64')}` };
  } catch {
    return { ok: false, error: 'Photo could not be read. Please upload a JPEG, PNG, WebP or GIF image.' };
  }
}

function checkLinkedProfileId(val: unknown): { ok: true; value: string | null } | { ok: false; error: string } {
  if (val === null || val === undefined || String(val).trim() === '') return { ok: true, value: null };
  const id = String(val).trim();
  if (!store.profiles.some((p: any) => p.id === id)) {
    return { ok: false, error: 'Linked Kwegatta profile was not found' };
  }
  return { ok: true, value: id };
}

function adminTeamView(m: any) {
  const linked = linkedProfileFor(m);
  return {
    ...m,
    has_photo: Boolean(m.photo),
    bio: m.bio || '',
    x: m.x || null,
    website: m.website || null,
    whatsapp: m.whatsapp || null,
    team_since: m.team_since || null,
    ...Object.fromEntries(TEAM_VISIBILITY_FLAGS.map(f => [f, Boolean(m[f])])),
    photo_url: m.photo && !m.hidden ? teamPhotoUrl(m) : null,
    linked_avatar: linked.avatarUrl,
    linked_profile: linked.profile
  };
}

// Public: Get team members
app.get('/api/team', (_req: Request, res: Response) => {
  return res.json(getPublicTeamList());
});

// Admin: Get & update global team details setting
app.get('/api/admin/team/settings', (req: Request, res: Response) => {
  const admin = verifyAdmin(req, res);
  if (!admin) return;
  return res.json({ team_details_enabled: Boolean(store.team_details_enabled) });
});

const handleUpdateTeamSettings = async (req: Request, res: Response) => {
  const admin = verifyAdmin(req, res);
  if (!admin) return;

  const raw = req.body || {};
  const enabled = raw.team_details_enabled === true;
  store.team_details_enabled = enabled;

  await persistDoc('team', '__team_settings__', {
    id: '__team_settings__',
    is_settings: true,
    team_details_enabled: enabled,
    updated_at: new Date().toISOString()
  });

  await writeAdminAudit(admin, 'TEAM_SETTINGS_UPDATED', `Admin set team_details_enabled to ${enabled}`);
  return res.json({ success: true, team_details_enabled: enabled });
};

app.patch('/api/admin/team/settings', handleUpdateTeamSettings);
app.post('/api/admin/team/settings', handleUpdateTeamSettings);
app.patch('/api/admin/settings', handleUpdateTeamSettings);
app.post('/api/admin/settings', handleUpdateTeamSettings);

// Admin: Get all team members (full data including hidden)
app.get('/api/admin/team', (req: Request, res: Response) => {
  const admin = verifyAdmin(req, res);
  if (!admin) return;

  const list = (Array.isArray(store.team) ? [...store.team] : [])
    .filter((m: any) => !isTeamSettingsDoc(m))
    .sort((a: any, b: any) => (Number(a.order) || 0) - (Number(b.order) || 0));
  return res.json(list.map(adminTeamView));
});

// Admin: Search Kwegatta profiles to link a team card to
app.get('/api/admin/team/profile-search', (req: Request, res: Response) => {
  const admin = verifyAdmin(req, res);
  if (!admin) return;
  const q = String(req.query.q || '').trim().toLowerCase().slice(0, 60);
  if (q.length < 2) return res.json([]);
  const results = store.profiles
    .filter((p: any) => !p.hidden && [p.name, p.headline, p.email].some(v => String(v || '').toLowerCase().includes(q)))
    .slice(0, 10)
    .map((p: any) => ({
      id: p.id,
      name: p.name,
      headline: p.headline || '',
      avatar_url: p.avatar ? `/api/avatar/${p.id}` : null
    }));
  return res.json(results);
});

// Admin: Add new team member
app.post('/api/admin/team', async (req: Request, res: Response) => {
  const admin = verifyAdmin(req, res);
  if (!admin) return;

  const raw = req.body || {};
  const checked = validateTeamPayload(raw, true);
  if (!checked.ok) return res.status(400).json({ error: firstError(checked.errors), fields: checked.errors });
  const v = checked.values;

  const sinceCheck = validateTeamSince(raw.team_since);
  if (!sinceCheck.valid) {
    return res.status(400).json({ error: sinceCheck.error || 'Invalid team_since' });
  }
  const linkCheck = checkLinkedProfileId(raw.linked_profile_id);
  if (!linkCheck.ok) return res.status(400).json({ error: linkCheck.error });

  let photo: string | null = null;
  if (raw.photo) {
    const processed = await processTeamPhoto(raw.photo);
    if (!processed.ok) return res.status(400).json({ error: processed.error });
    photo = processed.photo;
  }

  if (!Array.isArray(store.team)) store.team = [];
  const maxOrder = store.team
    .filter((m: any) => !isTeamSettingsDoc(m))
    .reduce((max: number, m: any) => Math.max(max, Number(m.order) || 0), -1);

  const now = new Date().toISOString();
  const member: TeamMember = {
    id: 'team-' + Date.now() + '-' + crypto.randomBytes(3).toString('hex'),
    name: String(v.name),
    title: String(v.title ?? ''),
    line1: String(v.line1 ?? ''),
    line2: String(v.line2 ?? ''),
    bio: String(v.bio ?? ''),
    github: (v.github as string | null) ?? null,
    linkedin: (v.linkedin as string | null) ?? null,
    x: (v.x as string | null) ?? null,
    website: (v.website as string | null) ?? null,
    whatsapp: (v.whatsapp as string | null) ?? null,
    linked_profile_id: linkCheck.value,
    photo,
    order: maxOrder + 1,
    hidden: v.hidden === true,
    team_since: sinceCheck.value,
    created_at: now,
    updated_at: now
  };
  for (const flag of TEAM_VISIBILITY_FLAGS) (member as any)[flag] = v[flag] === true;

  store.team.push(member);
  await persistDoc('team', member.id, member);
  await writeAdminAudit(admin, 'TEAM_MEMBER_CREATED', `Admin added team member "${member.name}"${member.title ? ` (${member.title})` : ''}`);
  return res.status(201).json({ success: true, member: adminTeamView(member) });
});

// Admin: Reorder team members. Registered before "/:id" routes.
app.post('/api/admin/team/reorder', async (req: Request, res: Response) => {
  const admin = verifyAdmin(req, res);
  if (!admin) return;

  const { ordered_ids } = req.body || {};
  if (!Array.isArray(ordered_ids) || ordered_ids.length > 500 || !ordered_ids.every(id => typeof id === 'string')) {
    return res.status(400).json({ error: 'ordered_ids must be a list of team member ids' });
  }
  if (new Set(ordered_ids).size !== ordered_ids.length) {
    return res.status(400).json({ error: 'ordered_ids contains duplicates' });
  }

  if (!Array.isArray(store.team)) store.team = [];
  const members = store.team.filter((m: any) => !isTeamSettingsDoc(m));
  const known = new Set(members.map((m: any) => m.id));
  const unknown = ordered_ids.filter((id: string) => !known.has(id));
  if (unknown.length) return res.status(400).json({ error: 'Unknown team member id in ordered_ids' });

  // Listed members first in the given order, any others keep their relative order after them.
  const rest = members
    .filter((m: any) => !ordered_ids.includes(m.id))
    .sort((a: any, b: any) => (Number(a.order) || 0) - (Number(b.order) || 0));
  const byId = new Map(members.map((m: any) => [m.id, m]));
  const finalOrder = [...ordered_ids.map((id: string) => byId.get(id)), ...rest];
  const now = new Date().toISOString();
  const changed: any[] = [];
  finalOrder.forEach((m: any, i: number) => {
    if (m.order !== i) {
      m.order = i;
      m.updated_at = now;
      changed.push(m);
    }
  });
  await Promise.all(changed.map((m: any) => persistDoc('team', m.id, m)));

  store.team.sort((a: any, b: any) => (Number(a.order) || 0) - (Number(b.order) || 0));
  await writeAdminAudit(admin, 'TEAM_REORDERED', `Admin reordered team members (${finalOrder.length} members)`);
  return res.json({ success: true, team: finalOrder.map(adminTeamView) });
});

// Admin: Update team member
app.patch('/api/admin/team/:id', async (req: Request, res: Response) => {
  const admin = verifyAdmin(req, res);
  if (!admin) return;

  const { id } = req.params;
  const member = (store.team || []).find((m: any) => m.id === id && !isTeamSettingsDoc(m));
  if (!member) {
    return res.status(404).json({ error: 'Team member not found' });
  }

  const raw = req.body || {};
  const checked = validateTeamPayload(raw, false);
  if (!checked.ok) return res.status(400).json({ error: firstError(checked.errors), fields: checked.errors });

  let sinceValue: string | null | undefined;
  if (raw.team_since !== undefined) {
    const sinceCheck = validateTeamSince(raw.team_since);
    if (!sinceCheck.valid) {
      return res.status(400).json({ error: sinceCheck.error || 'Invalid team_since' });
    }
    sinceValue = sinceCheck.value;
  }
  let linkedValue: string | null | undefined;
  if (raw.linked_profile_id !== undefined) {
    const linkCheck = checkLinkedProfileId(raw.linked_profile_id);
    if (!linkCheck.ok) return res.status(400).json({ error: linkCheck.error });
    linkedValue = linkCheck.value;
  }
  // Photos are uploaded through the photo route; PATCH can only clear one.
  if (raw.photo !== undefined && raw.photo !== null && raw.photo !== '') {
    return res.status(400).json({ error: 'Use the photo upload to change a photo' });
  }
  let order: number | undefined;
  if (raw.order !== undefined) {
    order = Number(raw.order);
    if (!Number.isInteger(order) || order < 0 || order > 10000) {
      return res.status(400).json({ error: 'order must be a whole number' });
    }
  }

  Object.assign(member, checked.values);
  if (sinceValue !== undefined) member.team_since = sinceValue;
  if (linkedValue !== undefined) member.linked_profile_id = linkedValue;
  if (raw.photo !== undefined) member.photo = null;
  if (order !== undefined) member.order = order;
  member.updated_at = new Date().toISOString();

  await persistDoc('team', member.id, member);
  const changedKeys = Object.keys(raw).filter(k => k !== 'id').slice(0, 12).join(', ');
  await writeAdminAudit(admin, 'TEAM_MEMBER_UPDATED', `Admin updated team member "${member.name}" (${changedKeys || 'no fields'})`);
  return res.json({ success: true, member: adminTeamView(member) });
});

// Admin: Upload or replace photo (type and size checked, resized, WebP)
app.post('/api/admin/team/:id/photo', async (req: Request, res: Response) => {
  const admin = verifyAdmin(req, res);
  if (!admin) return;

  const { id } = req.params;
  const member = (store.team || []).find((m: any) => m.id === id && !isTeamSettingsDoc(m));
  if (!member) {
    return res.status(404).json({ error: 'Team member not found' });
  }

  const processed = await processTeamPhoto((req.body || {}).photo);
  if (!processed.ok) return res.status(400).json({ error: processed.error });

  member.photo = processed.photo;
  member.updated_at = new Date().toISOString();
  await persistDoc('team', member.id, member);
  await writeAdminAudit(admin, 'TEAM_PHOTO_UPDATED', `Admin updated photo for team member "${member.name}"`);
  return res.json({ success: true, photo_url: teamPhotoUrl(member), member: adminTeamView(member) });
});

// Admin: Delete team member
app.delete('/api/admin/team/:id', async (req: Request, res: Response) => {
  const admin = verifyAdmin(req, res);
  if (!admin) return;

  const { id } = req.params;
  const member = (store.team || []).find((m: any) => m.id === id && !isTeamSettingsDoc(m));
  if (!member) {
    return res.status(404).json({ error: 'Team member not found' });
  }

  store.team = (store.team || []).filter((m: any) => m.id !== id);
  await removeDoc('team', id);
  await writeAdminAudit(admin, 'TEAM_MEMBER_DELETED', `Admin removed team member "${member.name}" (${member.id})`);
  return res.json({ success: true });
});

function sendTeamPhoto(req: Request, res: Response, member: any, cacheControl: string) {
  const match = String(member?.photo || '').match(/^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/);
  if (!match) return res.status(404).send('Team photo not found');
  const buffer = Buffer.from(match[2], 'base64');
  const etag = `"${crypto.createHash('md5').update(buffer).digest('hex')}"`;
  if (req.headers['if-none-match'] === etag) return res.status(304).end();
  res.setHeader('Content-Type', match[1]);
  res.setHeader('Cache-Control', cacheControl);
  res.setHeader('ETag', etag);
  return res.send(buffer);
}

// Public photo endpoint: cached with ETag & 304. Hidden members are not served.
app.get('/api/team-photo/:id', (req: Request, res: Response) => {
  const member = (store.team || []).find((m: any) => m.id === req.params.id && !isTeamSettingsDoc(m));
  if (!member || member.hidden) return res.status(404).send('Team photo not found');
  return sendTeamPhoto(req, res, member, 'public, max-age=86400, stale-while-revalidate=604800');
});

/* =========================================================================
   SEO & STATIC BOT DISCOVERY (robots.txt and sitemap.xml)
   ========================================================================= */
app.get('/robots.txt', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  return res.send('User-agent: *\nAllow: /\nSitemap: https://kwegatta.ai.studio/sitemap.xml\n');
});

app.get('/sitemap.xml', (_req: Request, res: Response) => {
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  const baseUrl = getPublicAppUrl();
  const upcomingEventUrls = (store.events || [])
    .filter((ev: any) => isEventPubliclyVisible(ev) && !ev.is_cancelled && computeEventPhase(ev) !== 'past')
    .map(
      (ev: any) =>
        `  <url><loc>${escapeHtml(`${baseUrl}/e/${encodeURIComponent(String(ev.id))}`)}</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`
    )
    .join('\n');

  return res.send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${baseUrl}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>
  <url><loc>${baseUrl}/#/people</loc><changefreq>daily</changefreq><priority>0.9</priority></url>
  <url><loc>${baseUrl}/#/events</loc><changefreq>weekly</changefreq><priority>0.8</priority></url>
  <url><loc>${baseUrl}/#/about</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>
  <url><loc>${baseUrl}/#/privacy</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>
  <url><loc>${baseUrl}/#/license</loc><changefreq>yearly</changefreq><priority>0.3</priority></url>${upcomingEventUrls ? `\n${upcomingEventUrls}` : ''}
</urlset>`);
});

/* =========================================================================
   PUBLIC LIVE WALL FEED
   Returns only what the projector wall displays:
   { id: <random opaque id, not the match id>, first_name_a, first_name_b, spark }
   No member ids, no avatar URLs, no score, no reason, no total that reveals more than a count.
   ========================================================================= */
function isValidSpark(spark: any): boolean {
  if (!spark || typeof spark !== 'string') return false;
  const trimmed = spark.trim();
  if (trimmed.length < 20) return false;
  // Skip any item that ends with dangling comma or ", ." or "..."
  if (trimmed.endsWith(',') || trimmed.endsWith(', .') || trimmed.endsWith(',.') || trimmed.endsWith('...')) return false;
  if (/,[\s.]*$/.test(trimmed)) return false;
  // Skip any item containing broken punctuation pattern ", ."
  if (trimmed.includes(', .') || trimmed.includes(',.')) return false;
  // Skip cut-off single-letter fragments (e.g., "enthusiastic b with")
  if (/\b[b-hj-z]\b/i.test(trimmed)) return false;
  return true;
}

app.get('/api/wall/feed', (_req: Request, res: Response) => {
  const matches = store.matches || [];
  const profiles = store.profiles || [];
  const seenPairs = new Set<string>();

  const list: Array<{ id: string; first_name_a: string; first_name_b: string; spark: string }> = [];
  let validCount = 0;

  for (const m of matches) {
    if (!isValidSpark(m.spark)) continue;
    validCount++;

    const pairKey = [m.a_id, m.b_id].sort().join(':');
    if (seenPairs.has(pairKey)) continue;
    seenPairs.add(pairKey);

    const a = profiles.find((p: any) => p.id === m.a_id);
    const b = profiles.find((p: any) => p.id === m.b_id);
    if (!a || !b) continue;

    const firstNameA = (a.name || '').trim().split(' ')[0] || 'Member';
    const firstNameB = (b.name || '').trim().split(' ')[0] || 'Member';

    list.push({
      id: crypto.randomBytes(8).toString('hex'),
      first_name_a: firstNameA,
      first_name_b: firstNameB,
      spark: m.spark.trim()
    });

    if (list.length >= 25) break;
  }

  return res.json({
    count: validCount,
    matches: list
  });
});

/* =========================================================================
   PROTECTED DATA LAYER ROUTES (Privacy & Resource Isolation)
   - notifications: require a signed-in member. Return ONLY notifications where to_id
     is the caller's own profile id. Never return other members' notifications.
   - matches: require a signed-in member. Return ONLY matches where a_id or b_id
     is the caller's own profile id.
   - follows: require a signed-in member. Return only rows where follower_id or
     following_id is the caller.
   ========================================================================= */

// 1. Notifications: strictly caller's own notifications
app.get('/api/data/notifications', (req: Request, res: Response) => {
  const authUserId = resolveAuthUserId(req);
  if (!authUserId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const callerProfile = store.profiles.find((p: any) => p.account_uid === authUserId || p.id === authUserId);
  const myId = callerProfile?.id || authUserId;

  let items = (store.notifications || []).filter((n: any) => n.to_id === myId);

  const after = req.query.after as string;
  if (after) {
    items = items.filter(item => item.created_at && item.created_at > after);
  }
  const limit = Number(req.query.limit) || 300;
  items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return res.json(items.slice(0, limit));
});

// 2. Matches: strictly caller's own matches
app.get('/api/data/matches', (req: Request, res: Response) => {
  const authUserId = resolveAuthUserId(req);
  if (!authUserId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const callerProfile = store.profiles.find((p: any) => p.account_uid === authUserId || p.id === authUserId);
  const myId = callerProfile?.id || authUserId;
  const callerBlockedSet = new Set(callerProfile?.blocked_ids || []);

  let items = (store.matches || []).filter((m: any) => {
    const isMine = m.a_id === myId || m.b_id === myId;
    if (!isMine) return false;
    const otherId = m.a_id === myId ? m.b_id : m.a_id;
    if (callerBlockedSet.has(otherId)) return false;
    const otherProfile = store.profiles.find((p: any) => p.id === otherId);
    if (Array.isArray(otherProfile?.blocked_ids) && (otherProfile.blocked_ids.includes(myId) || otherProfile.blocked_ids.includes(authUserId))) {
      return false;
    }
    return true;
  });

  const eqQuery = req.query.eq as string;
  if (eqQuery) {
    try {
      const eqObj = JSON.parse(eqQuery);
      items = items.filter(item => Object.keys(eqObj).every(k => item[k] === eqObj[k]));
    } catch (_) {}
  }

  const after = req.query.after as string;
  if (after) {
    items = items.filter(item => item.created_at && item.created_at > after);
  }
  const limit = Number(req.query.limit) || 300;
  items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return res.json(items.slice(0, limit));
});

// 3. Follows: strictly caller's own follower/following rows
app.get('/api/data/follows', (req: Request, res: Response) => {
  const authUserId = resolveAuthUserId(req);
  if (!authUserId) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  const callerProfile = store.profiles.find((p: any) => p.account_uid === authUserId || p.id === authUserId);
  const myId = callerProfile?.id || authUserId;

  let items = (store.follows || []).filter((f: any) => f.follower_id === myId || f.following_id === myId);

  const eqQuery = req.query.eq as string;
  if (eqQuery) {
    try {
      const eqObj = JSON.parse(eqQuery);
      items = items.filter(item => Object.keys(eqObj).every(k => item[k] === eqObj[k]));
    } catch (_) {}
  }

  const after = req.query.after as string;
  if (after) {
    items = items.filter(item => item.created_at && item.created_at > after);
  }
  const limit = Number(req.query.limit) || 300;
  items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return res.json(items.slice(0, limit));
});

/* =========================================================================
   UNIVERSAL DATA LAYER WITH AUTHENTICATION & WHATSAPP VISIBILITY
   ========================================================================= */
app.get('/api/data/:collection', (req: Request, res: Response) => {
  const col = req.params.collection as string;
  if (!isAllowedDataCollection(col)) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (!store[col as keyof StoreData]) {
    return res.status(404).json({ error: 'Not found' });
  }

  // Enforce privacy on collections if called via generic endpoint
  if (col === 'team') {
    return res.json(getPublicTeamList());
  }

  if (col === 'notifications' || col === 'matches' || col === 'follows') {
    const authUserId = resolveAuthUserId(req);
    if (!authUserId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
  }

  let items = [...(store[col as keyof StoreData] || [])];
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

  // EVENTS VISIBILITY & FILTERING:
  if (col === 'events') {
    const isAdmin = checkAdmin(req);
    const callerId = resolveAuthUserId(req);
    const callerProfile = callerId ? store.profiles.find((p: any) => p.account_uid === callerId || p.id === callerId) : null;
    const callerProfileId = callerProfile?.id || callerId;

    if (!isAdmin) {
      items = filterEventsForCaller(items, callerProfileId || callerId, false, callerId);
    }
  }

  const limit = Number(req.query.limit) || 300;
  items.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const sliced = items.slice(0, limit);

  // POSTS SANITIZATION:
  if (col === 'posts') {
    const safePosts = sliced.map(p => sanitizePostForPublic(p, req));
    return res.json(safePosts);
  }

  // EVENTS SANITIZATION:
  if (col === 'events') {
    const isAdmin = checkAdmin(req);
    const authUserId = resolveAuthUserId(req);
    const safeEvents = sliced.map(ev => {
      const isAllowed = canViewHostContact(ev, authUserId, isAdmin);
      return sanitizeEventForPublic(ev, authUserId, isAllowed, isAdmin);
    });
    return res.json(safeEvents);
  }

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
/** Profile fields members may never set on themselves; they are managed by sign-in or admins. */
export const PROTECTED_PROFILE_FIELDS = [
  'id', 'account_uid', 'email', 'email_verified', 'suspended', 'hidden', 'is_organiser',
  'events_blocked', 'is_admin', 'admin', 'is_demo', 'created_at', 'claimed_at',
  'privacy_accepted_at', 'privacy_version', 'report_count', 'hidden_by_moderation'
] as const;

/** Client notification types; anything else is stored as "message". */
const CLIENT_NOTIFICATION_TYPES = ['follow', 'connect', 'message'];
const NOTIFICATION_SEND_LIMIT = 30;
const NOTIFICATION_SEND_WINDOW_MS = 10 * 60 * 1000;
const notificationSendLog = new Map<string, number[]>();

/** Per-sender limit on member-to-member notifications. Returns false when over the limit. */
export function allowNotificationSend(senderId: string, now = Date.now()): boolean {
  const recent = (notificationSendLog.get(senderId) || []).filter(t => now - t < NOTIFICATION_SEND_WINDOW_MS);
  if (recent.length >= NOTIFICATION_SEND_LIMIT) {
    notificationSendLog.set(senderId, recent);
    return false;
  }
  recent.push(now);
  notificationSendLog.set(senderId, recent);
  return true;
}

/** An unclaimed profile may be linked only by the account whose email it carries (or when it has none). */
export function canClaimProfile(profile: any, authUserId: string | null, tokenEmail: string | undefined): boolean {
  if (!profile || !authUserId) return false;
  if (profile.account_uid) return profile.account_uid === authUserId;
  const stored = String(profile.email || '').trim().toLowerCase();
  if (!stored) return true;
  return Boolean(tokenEmail) && stored === String(tokenEmail).trim().toLowerCase();
}

app.post('/api/data/:collection', async (req: Request, res: Response) => {
  const col = req.params.collection as string;
  if (!isAllowedDataCollection(col)) {
    return res.status(404).json({ error: 'Not found' });
  }
  if (!store[col as keyof StoreData]) {
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

    const userEmail = (req as any).authUser?.email || '';
    if (!existingProfile && userEmail) {
      const profileWithEmail = store.profiles.find((p: any) => p.email && p.email.toLowerCase() === userEmail.toLowerCase());
      if (profileWithEmail) {
        existingProfile = profileWithEmail;
      }
    }

    // Authorization check
    if (existingProfile) {
      const isOwner = Boolean(authUserId) && (existingProfile.id === authUserId || canClaimProfile(existingProfile, authUserId, userEmail));
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

    const rawCountry = sanitizeText(raw.country, 10).toUpperCase();
    const country = ISO_COUNTRIES.includes(rawCountry) ? rawCountry : '';
    const city = sanitizeText(raw.city, 100);
    const derivedLoc = deriveLocation(city, country);
    const location = (country || city) ? derivedLoc : (raw.location !== undefined ? sanitizeText(raw.location, 100) : (existingProfile?.location || ''));

    const existingRoles = Array.isArray(existingProfile?.roles) && existingProfile.roles.length > 0
      ? existingProfile.roles
      : (existingProfile?.role ? [existingProfile.role] : []);

    let roles = filterRoles(raw.roles, existingRoles);
    if (roles.length === 0) {
      if (typeof raw.role === 'string' && ROLE_CHOICES.includes(raw.role.trim())) {
        roles = [raw.role.trim()];
      } else {
        roles = ['Developer'];
      }
    }
    const role = roles[0];

    let stage = '';
    if (typeof raw.stage === 'string' && (raw.stage === '' || STAGE_CHOICES.includes(raw.stage.trim()))) {
      stage = raw.stage.trim();
    } else if (existingProfile?.stage) {
      stage = existingProfile.stage;
    }

    let intent = existingProfile?.intent || '';
    const normalizedIntent = normalizeIntent(raw.intent);
    if (normalizedIntent !== null) {
      intent = normalizedIntent;
    }

    const id = existingProfile ? existingProfile.id : (requestedId || authUserId || ('user-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex')));
    const account_uid = authUserId || existingProfile?.account_uid || null;

    // Record privacy consent server-side (ITEM 2):
    const privacy_accepted_at = existingProfile?.privacy_accepted_at || new Date().toISOString();
    const privacy_version = existingProfile?.privacy_version || PRIVACY_VERSION;

    const row = {
      id,
      account_uid,
      email: userEmail || existingProfile?.email || '',
      name: sanitizeText(rawName, 100),
      role,
      roles,
      intent,
      intents: sanitizeArray(raw.intents, 5, 100),
      stage,
      country,
      city,
      location,
      privacy_accepted_at,
      privacy_version,
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
      huggingface: sanitizeDomainUrl(raw.huggingface, ['huggingface.co']),
      kaggle: sanitizeDomainUrl(raw.kaggle, ['kaggle.com']),
      gitlab: sanitizeDomainUrl(raw.gitlab, ['gitlab.com']),
      google_play: sanitizeDomainUrl(raw.google_play, ['play.google.com']),
      google_dev: sanitizeDomainUrl(raw.google_dev, ['g.dev', 'developers.google.com']),
      ieee: sanitizeDomainUrl(raw.ieee, ['ieee-collabratec.ieee.org']),
      custom_links: sanitizeCustomLinks(raw.custom_links),
      whatsapp: sanitizeText(raw.whatsapp, 30).replace(/[^0-9+]/g, ''),
      hide_whatsapp: Boolean(raw.hide_whatsapp),
      ...((NEW_EVENT_NOTIFY_CHOICES as readonly string[]).includes(raw.notify_new_events) ? { notify_new_events: raw.notify_new_events } : {}),
      avatar: resolveAvatar(raw.avatar, existingProfile?.avatar || ''),
      status: sanitizeText(raw.status, 100),
      is_demo: isAdmin ? Boolean(raw.is_demo) : Boolean(existingProfile?.is_demo),
      created_at: existingProfile?.created_at || new Date().toISOString(),
      gh: raw.gh && typeof raw.gh === 'object' ? raw.gh : (existingProfile?.gh || null),
      blocked_ids: sanitizeArray(raw.blocked_ids, 200, 64)
    };

    // Merge so admin-managed fields (suspended, hidden, organiser...) survive a re-save.
    const existingIdx = store.profiles.findIndex((item: any) => item.id === row.id);
    let saved: any = row;
    if (existingIdx >= 0) {
      saved = { ...store.profiles[existingIdx], ...row };
      store.profiles[existingIdx] = saved;
    } else {
      store.profiles.unshift(row);
    }

    await persistDoc('profiles', saved.id, saved);
    return res.json(sanitizePublicProfile(saved, authUserId, isAdmin));
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
      id: 'post-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex'),
      author_id: authorId,
      title: sanitizeText(raw.title, 200),
      body: sanitizeText(rawBody, 2000),
      kind,
      tags: sanitizeArray(raw.tags, 10, 30),
      created_at: new Date().toISOString()
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
      id: 'follow-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex'),
      follower_id: followerId,
      following_id: followingId,
      created_at: new Date().toISOString()
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
    if (!store.profiles.some((p: any) => p.id === toId || p.account_uid === toId)) {
      return res.status(400).json({ error: 'Recipient not found' });
    }
    if (!isAdmin && !allowNotificationSend(String(authUserId))) {
      return res.status(429).json({ error: 'You are sending messages too quickly. Please wait a few minutes.' });
    }
    const rawType = sanitizeText(raw.type, 30);

    const row = {
      id: 'notif-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex'),
      to_id: toId,
      from_id: authUserId || 'system',
      type: isAdmin ? (rawType || 'message') : (CLIENT_NOTIFICATION_TYPES.includes(rawType) ? rawType : 'message'),
      body: notifBody,
      read: false,
      created_at: new Date().toISOString()
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
    if (!isAdmin) {
      const me = store.profiles.find((p: any) => p.account_uid === authUserId || p.id === authUserId);
      if (!me || aId !== me.id) {
        return res.status(403).json({ error: 'You can only record your own matches' });
      }
    }

    const row = {
      id: 'match-' + Date.now() + '-' + crypto.randomBytes(4).toString('hex'),
      a_id: aId,
      b_id: bId,
      score: Math.min(100, score),
      reason: sanitizeText(raw.reason, 500),
      spark: sanitizeText(raw.spark, 300),
      created_at: new Date().toISOString()
    };

    // One row per pair: refresh the existing one instead of piling up duplicates.
    const prevIdx = store.matches.findIndex((m: any) => m.a_id === aId && m.b_id === bId);
    if (prevIdx >= 0) {
      const updated = { ...store.matches[prevIdx], score: row.score, reason: row.reason, spark: row.spark, updated_at: row.created_at };
      store.matches[prevIdx] = updated;
      await persistDoc('matches', updated.id, updated);
      return res.json(updated);
    }
    store.matches.unshift(row);
    await persistDoc('matches', row.id, row);
    return res.json(row);
  }

  return res.status(400).json({ error: `Unsupported collection ${col}` });
});

// Update Record (Ownership / Auth Check for All Collections)
app.patch('/api/data/:collection/:id', async (req: Request, res: Response) => {
  const col = req.params.collection as string;
  const id = req.params.id;
  if (!isAllowedDataCollection(col)) {
    return res.status(404).json({ error: 'Not found' });
  }
  const colKey = col as keyof StoreData;
  if (!store[colKey]) {
    return res.status(404).json({ error: `Collection ${col} not found` });
  }

  const authUserId = resolveAuthUserId(req);
  const isAdmin = checkAdmin(req);

  if (!authUserId && !isAdmin) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const index = (store[colKey] as any[]).findIndex((item: any) => item.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Item not found' });
  }

  const existing = (store[colKey] as any[])[index];

  const myProfile = store.profiles.find((p: any) => p.account_uid === authUserId || p.id === authUserId);
  const myProfileId = myProfile?.id;

  // Team cards change only through the audited admin team routes.
  if (col === 'team') {
    return res.status(403).json({ error: 'Team cards are managed from the Admin team page' });
  }
  // Members may edit their own profile and posts and mark their own notifications read;
  // everything else (events, follows, matches) has dedicated routes with their own checks.
  if (!isAdmin && col !== 'profiles' && col !== 'notifications' && col !== 'posts') {
    return res.status(403).json({ error: 'Forbidden: This record cannot be edited here' });
  }

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
  if (col === 'events' && !isAdmin) {
    const isOwner = authUserId === existing.author_id || myProfileId === existing.author_id;
    if (!isOwner) {
      return res.status(403).json({ error: 'Forbidden: You can only edit your own submissions' });
    }
  }

  // Validate patch fields
  const patch = { ...(req.body || {}) };
  if (col === 'notifications' && !isAdmin) {
    for (const k of Object.keys(patch)) if (k !== 'read') delete patch[k];
    if (patch.read !== undefined) patch.read = patch.read === true;
  }
  if (col === 'profiles' && !isAdmin) {
    for (const k of PROTECTED_PROFILE_FIELDS) delete patch[k];
  }
  if (col === 'posts' && !isAdmin) {
    for (const k of Object.keys(patch)) if (!['title', 'body', 'kind', 'tags'].includes(k)) delete patch[k];
    if (patch.title !== undefined) patch.title = sanitizeText(patch.title, 200);
    if (patch.kind !== undefined && !['idea', 'need', 'offer', 'question'].includes(patch.kind)) delete patch.kind;
    if (patch.tags !== undefined) patch.tags = sanitizeArray(patch.tags, 10, 30);
  }
  delete patch.id;
  if (col === 'posts') {
    delete patch.reactions;
    delete patch.reactions_by;
    delete patch.comments;
    delete patch.reaction_counts;
    delete patch.my_reaction;
    if (patch.body !== undefined) {
      const rawBody = typeof patch.body === 'string' ? patch.body.trim() : '';
      if (!rawBody) return res.status(400).json({ error: 'Post body cannot be empty' });
      patch.body = sanitizeText(rawBody, 2000);
    }
  }
  if (col === 'profiles') {
    delete patch.role; // Ignore any client-sent role alone

    if (patch.avatar !== undefined) {
      patch.avatar = resolveAvatar(patch.avatar, existing?.avatar || '');
    }
    if (patch.blocked_ids !== undefined) {
      patch.blocked_ids = sanitizeArray(patch.blocked_ids, 200, 64);
    }
    if (patch.roles !== undefined) {
      const existingRoles = Array.isArray(existing?.roles) && existing.roles.length > 0
        ? existing.roles
        : (existing?.role ? [existing.role] : ['Developer']);
      const newRoles = filterRoles(patch.roles, existingRoles);
      patch.roles = newRoles;
      patch.role = newRoles[0];
    }
    if (patch.intent !== undefined) {
      const normalizedIntent = normalizeIntent(patch.intent);
      if (normalizedIntent !== null) {
        patch.intent = normalizedIntent;
      } else {
        delete patch.intent;
      }
    }
    if (patch.stage !== undefined) {
      const rawStage = typeof patch.stage === 'string' ? patch.stage.trim() : '';
      if (rawStage === '' || STAGE_CHOICES.includes(rawStage)) {
        patch.stage = rawStage;
      } else {
        delete patch.stage;
      }
    }
    if (patch.country !== undefined) {
      const rawC = sanitizeText(patch.country, 10).toUpperCase();
      patch.country = ISO_COUNTRIES.includes(rawC) ? rawC : '';
    }
    if (patch.city !== undefined) {
      patch.city = sanitizeText(patch.city, 100);
    }
    if (patch.country !== undefined || patch.city !== undefined) {
      const targetCountry = patch.country !== undefined ? patch.country : (existing?.country || '');
      const targetCity = patch.city !== undefined ? patch.city : (existing?.city || '');
      patch.location = deriveLocation(targetCity, targetCountry);
    } else if (patch.location !== undefined) {
      patch.location = sanitizeText(patch.location, 100);
    }
    delete patch.privacy_accepted_at;
    delete patch.privacy_version;
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
    if (patch.huggingface !== undefined) {
      patch.huggingface = sanitizeDomainUrl(patch.huggingface, ['huggingface.co']);
    }
    if (patch.kaggle !== undefined) {
      patch.kaggle = sanitizeDomainUrl(patch.kaggle, ['kaggle.com']);
    }
    if (patch.gitlab !== undefined) {
      patch.gitlab = sanitizeDomainUrl(patch.gitlab, ['gitlab.com']);
    }
    if (patch.google_play !== undefined) {
      patch.google_play = sanitizeDomainUrl(patch.google_play, ['play.google.com']);
    }
    if (patch.google_dev !== undefined) {
      patch.google_dev = sanitizeDomainUrl(patch.google_dev, ['g.dev', 'developers.google.com']);
    }
    if (patch.ieee !== undefined) {
      patch.ieee = sanitizeDomainUrl(patch.ieee, ['ieee-collabratec.ieee.org']);
    }
    if (patch.custom_links !== undefined) {
      patch.custom_links = sanitizeCustomLinks(patch.custom_links);
    }
    if (patch.whatsapp !== undefined) {
      patch.whatsapp = sanitizeText(patch.whatsapp, 30).replace(/[^0-9+]/g, '');
    }
    if (patch.hide_whatsapp !== undefined) {
      patch.hide_whatsapp = Boolean(patch.hide_whatsapp);
    }
    if (patch.notify_new_events !== undefined && !(NEW_EVENT_NOTIFY_CHOICES as readonly string[]).includes(patch.notify_new_events)) {
      delete patch.notify_new_events;
    }
  }

  (store[colKey] as any[])[index] = { ...existing, ...patch };
  await persistDoc(col, id, (store[colKey] as any[])[index]);
  if (col === 'profiles') {
    return res.json(sanitizePublicProfile((store[colKey] as any[])[index], authUserId, isAdmin));
  }
  if (col === 'events') {
    return res.json(sanitizeEventForPublic((store[colKey] as any[])[index]));
  }
  if (col === 'posts') {
    return res.json(sanitizePostForPublic((store[colKey] as any[])[index], req));
  }
  return res.json((store[colKey] as any[])[index]);
});

// Replace/Put Record
app.put(['/api/data/:collection', '/api/data/:collection/:id'], async (req: Request, res: Response) => {
  const col = req.params.collection as string;
  if (!isAllowedDataCollection(col)) {
    return res.status(404).json({ error: 'Not found' });
  }
  return res.status(404).json({ error: 'Not found' });
});

// Delete Record (Ownership / Auth Check for All Collections)
app.delete('/api/data/:collection/:id', async (req: Request, res: Response) => {
  const col = req.params.collection as string;
  const id = req.params.id;
  if (!isAllowedDataCollection(col)) {
    return res.status(404).json({ error: 'Not found' });
  }
  const colKey = col as keyof StoreData;
  if (!store[colKey]) {
    return res.status(404).json({ error: `Collection ${col} not found` });
  }

  const authUserId = resolveAuthUserId(req);
  const isAdmin = checkAdmin(req);

  if (!authUserId && !isAdmin) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (col === 'team') {
    return res.status(403).json({ error: 'Team cards are managed from the Admin team page' });
  }

  const existing = (store[colKey] as any[]).find((item: any) => item.id === id);
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
  if (col === 'events' && !isAdmin) {
    const isOwner = authUserId === existing.author_id || myProfileId === existing.author_id;
    if (!isOwner) {
      return res.status(403).json({ error: 'Forbidden: You can only delete your own submissions' });
    }
  }
  if (col === 'matches' && !isAdmin) {
    const isMine = [existing.a_id, existing.b_id].some(v => v && (v === authUserId || v === myProfileId));
    if (!isMine) {
      return res.status(403).json({ error: 'Forbidden: You can only delete your own matches' });
    }
  }

  if (col === 'profiles') {
    await cascadeDeleteMemberData(id, existing.account_uid);
  }
  if (col === 'events') {
    // Same cascade as the event routes: guests, questions, check-ins and attendee notices.
    await deleteEventWithCascade(existing, [authUserId, myProfileId], isAdmin && existing.author_id !== myProfileId ? 'moderator' : 'host');
    return res.json({ success: true });
  }

  (store as any)[colKey] = (store[colKey] as any[]).filter((item: any) => item.id !== id);
  await removeDoc(col, id);
  return res.json({ success: true });
});

// Photo upload for the three site photos (admin only). Only known slots are accepted,
// the image is decoded and re-encoded as WebP at both sizes the site uses.
export const SITE_PHOTO_SLOTS: Record<string, string> = {
  hero: 'table-coding',
  hall: 'mubs-hall',
  team: 'team-session'
};

app.post('/api/upload-photo', async (req: Request, res: Response) => {
  const admin = verifyAdmin(req, res);
  if (!admin) return;
  const { slot, dataUrl } = req.body || {};
  const base = typeof slot === 'string' && Object.prototype.hasOwnProperty.call(SITE_PHOTO_SLOTS, slot) ? SITE_PHOTO_SLOTS[slot] : null;
  if (!base) {
    return res.status(400).json({ error: 'Unknown photo slot' });
  }
  const check = checkPhotoDataUrl(dataUrl);
  if (!check.ok) return res.status(400).json({ error: check.error });

  let sizes: Array<{ name: string; data: Buffer }>;
  try {
    const input = Buffer.from(String(dataUrl).slice(String(dataUrl).indexOf(',') + 1), 'base64');
    sizes = await Promise.all([800, 1600].map(async width => ({
      name: `${base}-${width}.webp`,
      data: await sharp(input, { limitInputPixels: 60_000_000 }).rotate().resize({ width, withoutEnlargement: true }).webp({ quality: 82 }).toBuffer()
    })));
  } catch {
    return res.status(400).json({ error: 'Photo could not be read. Please upload a JPEG, PNG or WebP image.' });
  }

  const dirs = [path.join(__dirname, 'public', 'images'), path.join(__dirname, 'dist', 'images')];
  for (const dir of dirs) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      for (const f of sizes) fs.writeFileSync(path.join(dir, f.name), f.data);
    } catch (err: any) {
      console.warn('[upload-photo] Could not write to', dir, err?.message || err);
    }
  }
  await writeAdminAudit(admin, 'SITE_PHOTO_UPDATED', `Admin replaced the "${slot}" site photo`);
  return res.json({ success: true, slot, targets: sizes.map(f => f.name) });
});

// Demo data operations (Admin session required)
app.post('/api/demo/seed', async (req: Request, res: Response) => {
  if (!verifyAdmin(req, res)) return;
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
  if (!verifyAdmin(req, res)) return;
  const demoIds = store.profiles.filter(p => p.is_demo).map(p => p.id);
  store.profiles = store.profiles.filter(p => !p.is_demo);
  if (demoIds.length > 0 && storageMode === 'firestore' && firestoreDb) {
    await batchRemoveDocs('profiles', demoIds);
  } else {
    saveStore(store);
  }
  return res.json({ success: true, count: store.profiles.length });
});

/**
 * Final Express error middleware: logs the error with the route and returns 500 JSON.
 * Never includes stack traces or internal messages in the response.
 */
export function errorHandler(err: any, req: Request, res: Response, _next: express.NextFunction) {
  if (err && (err instanceof SyntaxError || err.type === 'entity.parse.failed' || err.name === 'SyntaxError') && (err.status === 400 || err.statusCode === 400) && 'body' in err) {
    res.status(400).json({ error: 'Invalid request body.' });
    return;
  }
  if (err && err.type === 'entity.too.large') {
    res.status(413).json({ error: 'That upload is too large.' });
    return;
  }
  console.error(`[Server Error] ${req.method} ${req.originalUrl || req.url}:`, err?.message || err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}

// Catch-all for unknown /api/* routes: always return 404 JSON, never SPA HTML
app.use('/api', (_req: Request, res: Response) => {
  return res.status(404).json({ error: 'Not found' });
});

app.use(errorHandler);

// Production static assets or Vite middleware in dev
async function setupVite() {
  const isProd = process.env.NODE_ENV === 'production';
  const distPath = path.join(__dirname, 'dist');

  if (isProd && fs.existsSync(distPath)) {
    await initStorage();
    console.log('Serving production static bundle from dist');

    // Long-lived immutable caching for hashed /assets/
    app.use('/assets', express.static(path.join(distPath, 'assets'), {
      maxAge: '1y',
      immutable: true,
      setHeaders: (res) => {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      }
    }));

    // Cache-Control: no-cache for sw.js
    app.get('/sw.js', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'sw.js'));
    });

    // Cache-Control: no-cache for index.html
    app.get(['/', '/index.html'], (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });

    app.use(express.static(distPath, {
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('index.html') || filePath.endsWith('sw.js')) {
          res.setHeader('Cache-Control', 'no-cache');
        } else if (filePath.includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        }
      }
    }));

    app.get('*', (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(distPath, 'index.html'));
    });
  } else {
    // In dev / middleware mode: run initStorage and Vite server initialization concurrently
    app.get('/sw.js', (_req, res, next) => {
      res.setHeader('Cache-Control', 'no-cache');
      const swPublic = path.join(__dirname, 'public', 'sw.js');
      if (fs.existsSync(swPublic)) {
        return res.sendFile(swPublic);
      }
      next();
    });

    app.use((req, res, next) => {
      if (req.path === '/index.html' || req.path === '/' || req.path === '/sw.js') {
        res.setHeader('Cache-Control', 'no-cache');
      }
      next();
    });

    console.log('Starting Vite in middleware mode for rapid development');
    const [, vite] = await Promise.all([
      initStorage(),
      import('vite').then(({ createServer }) =>
        createServer({
          server: { middlewareMode: true, host: '0.0.0.0', hmr: false },
          appType: 'spa'
        })
      )
    ]);
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Kwegatta server listening on port ${PORT} (0.0.0.0)`);
    console.log(`Gemma Model: ${DEFAULT_OPEN_WEIGHT_MODEL}`);
    console.log(`Storage engine: ${storageMode.toUpperCase()}`);
  });
}

if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
  setupVite().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}
