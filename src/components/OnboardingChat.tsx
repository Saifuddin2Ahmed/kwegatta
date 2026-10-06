import React, { useState, useRef, useEffect } from 'react';
import {
  Sparkles,
  Camera,
  Upload,
  ArrowRight,
  RefreshCw,
  CheckCircle2,
  Clock,
  AlertCircle,
  RotateCcw,
  Check,
  User,
  Compass,
  MapPin,
  Briefcase,
  Layers,
  Image as ImageIcon
} from 'lucide-react';
import { Profile } from '../types';
import { buildProfileWithGemma, fetchGitHubData, db } from '../services/api';
import { resizeImageFile } from '../utils';
import { Avatar } from './Avatar';

interface OnboardingChatProps {
  onCompleted: (profile: Profile) => void;
  onCancel?: () => void;
}

interface ChatMessage {
  id: string;
  sender: 'bot' | 'user';
  text: string;
  component?: React.ReactNode;
}

const INTENT_CHOICES = [
  'Find a co-founder',
  'Find a technical partner',
  'Find a business partner',
  'Join a project',
  'Find a mentor or be one',
  'Learn a skill'
];

const ROLE_CHOICES = [
  'Founder',
  'Business',
  'Developer',
  'Designer',
  'Domain expert',
  'Mentor',
  'Student'
];

const STAGE_CHOICES = [
  'I have an idea',
  'I have a project running',
  'I have skills and want to join one'
];

const LOCATION_CHOICES = [
  'Kampala',
  'Entebbe',
  'Jinja',
  'Remote'
];

const HOURS_CHOICES = [
  '5-10 hrs/week',
  '10-20 hrs/week',
  '20+ hrs/week',
  'Full-time'
];

const STEP_SUGGESTIONS: Record<string, string[]> = {
  offers: [
    'I know the retail market in Kampala',
    'Flutter mobile apps & Dart',
    'React, TypeScript & Tailwind',
    'UI/UX design in Figma',
    'Financial modeling & pitch decks',
    'Agricultural supply chain & farmer logistics',
    'Marketing, sales & customer discovery',
    'Python APIs & data analytics'
  ],
  needs: [
    'I need someone to build my app',
    'Technical co-founder (Flutter/React)',
    'Business partner & marketing strategy',
    'UI/UX designer (Figma)',
    'Domain expert in retail / agriculture',
    'Backend engineer (APIs & database)',
    'Peer mentor for startup launch'
  ],
  teaches: [
    'Retail business strategy',
    'Figma UI design & tokens',
    'Flutter mobile basics',
    'Financial accounting & budgets',
    'Grant proposals & pitching'
  ],
  learns: [
    'Product strategy & discovery',
    'React & modern TypeScript',
    'AI prompt engineering',
    'Market research & customer calls',
    'Grant writing'
  ]
};

export const OnboardingChat: React.FC<OnboardingChatProps> = ({ onCompleted }) => {
  // Restore answers from browser storage so a refresh never loses 11 steps of answers
  const initialDraft = (() => {
    try {
      const raw = localStorage.getItem('kw_onboarding_answers_v2');
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return null;
  })();

  const [stepIndex, setStepIndex] = useState<number>(() => {
    return initialDraft && typeof initialDraft.stepIndex === 'number' ? Math.min(initialDraft.stepIndex, 10) : 0;
  });
  const [formData, setFormData] = useState<Partial<Profile>>(() => {
    return initialDraft?.formData || { roles: [], tags: [], skills: [] };
  });
  const [selectedRoles, setSelectedRoles] = useState<string[]>(() => {
    return initialDraft?.selectedRoles || [];
  });
  const [whatsappVisible, setWhatsappVisible] = useState<boolean>(() => {
    return initialDraft?.whatsappVisible ?? true;
  });

  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [savedProfile, setSavedProfile] = useState<Profile | null>(null);
  const [aiPolishStatus, setAiPolishStatus] = useState<'idle' | 'polishing' | 'done' | 'failed'>('idle');
  const [polishNotice, setPolishNotice] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  // Photo state machine: idle | processing | saved | error
  const [photoStatus, setPhotoStatus] = useState<'idle' | 'processing' | 'saved' | 'error'>('idle');
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoErrorMsg, setPhotoErrorMsg] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const selfieInputRef = useRef<HTMLInputElement>(null);

  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Does the member write code?
  const writesCode = Boolean(
    (formData.roles && formData.roles.includes('Developer')) ||
    selectedRoles.includes('Developer') ||
    /code|developer|software|programming|react|flutter|python/i.test(formData.offers || '') ||
    formData.intent === 'Find a technical partner'
  );

  const STEPS = [
    {
      key: 'intent',
      label: 'Intent',
      prompt: `Hello! Welcome to Kwegatta. We connect people who want to build something together — founders, business people, marketers, designers, domain experts, mentors, students, and developers. What brings you here?`,
      type: 'choice',
      choices: INTENT_CHOICES,
      required: true
    },
    {
      key: 'roles',
      label: 'Role',
      prompt: `What role best describes you? You may pick up to two.`,
      type: 'multi_choice',
      choices: ROLE_CHOICES,
      maxPicks: 2,
      required: true
    },
    {
      key: 'stage',
      label: 'Stage',
      prompt: `What stage are you at right now?`,
      type: 'choice',
      choices: STAGE_CHOICES,
      required: true
    },
    {
      key: 'name',
      label: 'Name',
      prompt: `Great! What is your name?`,
      placeholder: 'e.g. Sandra Nabirye',
      type: 'text',
      required: true
    },
    {
      key: 'location_and_hours',
      label: 'Location',
      prompt: `Where are you based, and how many hours per week do you have available to collaborate?`,
      type: 'location_and_hours',
      required: false
    },
    {
      key: 'offers',
      label: 'Offers',
      prompt: `What skills, resources, or knowledge do you offer? (e.g. "I know the retail market in Kampala", Figma design, Flutter coding, financial modeling)`,
      placeholder: 'e.g. I know the retail market in Kampala',
      type: 'text',
      required: true
    },
    {
      key: 'needs',
      label: 'Needs',
      prompt: `What do you need most right now? (e.g. "I need someone to build my app", technical co-founder, business strategist)`,
      placeholder: 'e.g. I need someone to build my app',
      type: 'text',
      required: true
    },
    {
      key: 'link',
      label: writesCode ? 'GitHub' : 'Profile Link',
      prompt: writesCode
        ? `What is your GitHub username or profile link? (Optional — we'll read your public languages)`
        : `What is your LinkedIn profile link or website? (Optional)`,
      placeholder: writesCode ? 'e.g. sandra-dev or github.com/sandra-dev' : 'e.g. linkedin.com/in/sandra or yoursite.com',
      type: 'text',
      required: false
    },
    {
      key: 'learning',
      label: 'Learning',
      prompt: `Do you want to peer mentor or learn something new? (Optional — helps us pair you in the Learn tab)`,
      type: 'learning',
      required: false
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      prompt: `What is your WhatsApp phone number? Signed-in members can see it to connect with you in one tap. (Optional)`,
      placeholder: 'e.g. +256 700 000000',
      type: 'text',
      required: false
    },
    {
      key: 'avatar',
      label: 'Photo',
      prompt: `Finally, add a profile picture or selfie so teammates can recognize you.`,
      type: 'photo',
      required: false
    }
  ];

  const currentStep = STEPS[stepIndex];
  const secondsLeft = Math.max(10, (STEPS.length - stepIndex) * 7);

  const addMessage = (sender: 'bot' | 'user', text: string, component?: React.ReactNode) => {
    setMessages(prev => [
      ...prev,
      {
        id: 'msg-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
        sender,
        text,
        component
      }
    ]);
  };

  useEffect(() => {
    if (messages.length === 0) {
      if (initialDraft && initialDraft.stepIndex > 0 && initialDraft.formData) {
        // Rebuild past messages from saved browser answers
        const msgs: ChatMessage[] = [];
        const fd = initialDraft.formData;
        const targetStep = Math.min(initialDraft.stepIndex, STEPS.length - 1);

        for (let i = 0; i < targetStep; i++) {
          const s = STEPS[i];
          msgs.push({
            id: `restored-bot-${i}`,
            sender: 'bot',
            text: s.prompt
          });
          const ans = i === 0 ? fd.intent :
                      i === 1 ? (fd.roles?.join(' & ') || fd.role) :
                      i === 2 ? fd.stage :
                      i === 3 ? fd.name :
                      i === 4 ? `${fd.location || 'Kampala'}${fd.hours_per_week ? ' (' + fd.hours_per_week + ')' : ''}` :
                      i === 5 ? fd.offers :
                      i === 6 ? fd.needs :
                      i === 7 ? (fd.github || fd.linkedin || fd.website || 'Skipped') :
                      i === 8 ? (fd.teaches || fd.learns ? `Teaches: ${fd.teaches || '-'} | Learns: ${fd.learns || '-'}` : 'Skipped') :
                      i === 9 ? (fd.whatsapp || 'Skipped') : null;
          if (ans) {
            msgs.push({
              id: `restored-user-${i}`,
              sender: 'user',
              text: String(ans)
            });
          }
        }
        // Add current step prompt
        msgs.push({
          id: 'restored-bot-curr',
          sender: 'bot',
          text: STEPS[targetStep].prompt
        });
        setMessages(msgs);
      } else {
        setIsBotTyping(true);
        const timer = setTimeout(() => {
          setIsBotTyping(false);
          addMessage('bot', STEPS[0].prompt);
        }, 400);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  // Persist answers to browser storage on every step so refresh never loses them
  useEffect(() => {
    if (!savedProfile && (stepIndex > 0 || (formData && Object.keys(formData).length > 3))) {
      try {
        localStorage.setItem('kw_onboarding_answers_v2', JSON.stringify({
          formData,
          stepIndex,
          selectedRoles,
          whatsappVisible
        }));
      } catch (_) {}
    }
  }, [formData, stepIndex, selectedRoles, whatsappVisible, savedProfile]);

  const handleResetDraft = () => {
    if (confirm('Start over and clear answers entered so far?')) {
      try {
        localStorage.removeItem('kw_onboarding_answers_v2');
      } catch (_) {}
      setFormData({ roles: [], tags: [], skills: [] });
      setSelectedRoles([]);
      setStepIndex(0);
      setSavedProfile(null);
      setMessages([
        {
          id: 'msg-' + Date.now(),
          sender: 'bot',
          text: STEPS[0].prompt
        }
      ]);
    }
  };

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing, isBotTyping, photoStatus, savedProfile]);

  useEffect(() => {
    if (!savedProfile && currentStep?.type === 'text') {
      inputRef.current?.focus();
    }
  }, [stepIndex, savedProfile, currentStep?.type]);

  const advanceToNext = async (updatedData: Partial<Profile>, nextIdx: number) => {
    if (nextIdx < STEPS.length) {
      setStepIndex(nextIdx);
      const nextStep = STEPS[nextIdx];
      setIsBotTyping(true);
      await new Promise(r => setTimeout(r, 350));
      setIsBotTyping(false);
      addMessage('bot', nextStep.prompt);
    } else {
      await handleCompleteAndSave(updatedData);
    }
  };

  // Choice step handler (Intent, Stage, etc.)
  const handleSelectChoice = async (choice: string) => {
    addMessage('user', choice);
    const updatedData: Partial<Profile> = {
      ...formData,
      [currentStep.key]: choice
    };
    setFormData(updatedData);
    await advanceToNext(updatedData, stepIndex + 1);
  };

  // Multi-choice role selection handler
  const handleToggleRole = (role: string) => {
    if (selectedRoles.includes(role)) {
      setSelectedRoles(prev => prev.filter(r => r !== role));
    } else {
      if (selectedRoles.length < 2) {
        setSelectedRoles(prev => [...prev, role]);
      } else {
        setSelectedRoles([selectedRoles[1], role]);
      }
    }
  };

  const handleConfirmRoles = async () => {
    if (selectedRoles.length === 0) return;
    const roleText = selectedRoles.join(' & ');
    addMessage('user', roleText);

    const updatedData: Partial<Profile> = {
      ...formData,
      roles: selectedRoles,
      role: selectedRoles[0]
    };
    setFormData(updatedData);
    await advanceToNext(updatedData, stepIndex + 1);
  };

  // Photo Upload & Resize Handler with Preview, Processing, and Saved state
  const handleFileChosen = async (file: File) => {
    if (!file) return;

    // 1. Show immediate preview
    const tempUrl = URL.createObjectURL(file);
    setPhotoPreviewUrl(tempUrl);
    setPhotoStatus('processing');
    setPhotoErrorMsg(null);

    try {
      // 2. Resize to 256x256 JPEG data URL
      const resized = await resizeImageFile(file);
      URL.revokeObjectURL(tempUrl);
      setPhotoPreviewUrl(resized);
      setPhotoStatus('saved');

      const updated = { ...formData, avatar: resized };
      setFormData(updated);
    } catch (err: any) {
      setPhotoStatus('error');
      setPhotoErrorMsg('Could not process this image file. Please try another or try again.');
    }
  };

  const handleProceedAfterPhoto = async () => {
    addMessage('user', photoStatus === 'saved' ? 'Photo added' : 'Skipped photo');
    await handleCompleteAndSave(formData);
  };

  // Standard text submit handler
  const handleNextTextStep = async (value: string) => {
    if (currentStep.required && !value.trim()) return;

    setErrorState(null);
    const trimmed = value.trim();
    if (trimmed) {
      addMessage('user', trimmed);
    } else {
      addMessage('user', 'Skipped');
    }
    setInputText('');

    const updatedData: Partial<Profile> = { ...formData };

    if (currentStep.key === 'link') {
      if (writesCode) {
        const username = trimmed.replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
        updatedData.github = username;
        if (username) {
          setIsProcessing(true);
          try {
            const gh = await fetchGitHubData(username);
            if (gh) updatedData.gh = gh;
          } catch (_) {}
          setIsProcessing(false);
        }
      } else {
        if (/linkedin\.com/i.test(trimmed)) {
          updatedData.linkedin = trimmed;
        } else {
          updatedData.website = trimmed;
        }
      }
    } else if (currentStep.key === 'whatsapp') {
      updatedData.whatsapp = trimmed;
      updatedData.hide_whatsapp = !whatsappVisible;
    } else {
      (updatedData as any)[currentStep.key] = trimmed;
    }

    setFormData(updatedData);
    await advanceToNext(updatedData, stepIndex + 1);
  };

  // REQUIREMENT 1: SIGN-UP RESILIENCE
  // Save profile to Firestore immediately in member's own words before any AI call.
  // Then ask Gemma to write headline, bio and tags in the background and update when it answers.
  // If Gemma fails: keep saved profile, show "Your profile is saved. AI polish will be added shortly.", retry up to 3 times in background, and let member continue to their matches.
  const handleCompleteAndSave = async (data: Partial<Profile>) => {
    setIsProcessing(true);
    setErrorState(null);

    const memberName = (data.name || 'Member').trim();
    const primaryRole = (data.roles && data.roles[0]) || (typeof data.role === 'string' ? data.role : 'Member');
    const rolesList = data.roles && data.roles.length ? data.roles : [primaryRole];

    const defaultHeadline = data.offers
      ? (data.offers.length > 70 ? data.offers.slice(0, 67) + '...' : data.offers)
      : `${primaryRole} in Kampala`;

    const defaultBio = (data.offers || data.needs)
      ? `I offer ${data.offers || 'collaboration'}. I am looking for ${data.needs || 'partners'}.`
      : 'Excited to collaborate and build on Kwegatta.';

    const initialTags = Array.from(
      new Set([primaryRole, data.stage, 'Kampala'].filter(Boolean) as string[])
    );

    const fullProfile: Profile = {
      id: 'user-' + Date.now(),
      name: memberName,
      role: primaryRole,
      roles: rolesList,
      intent: data.intent || '',
      stage: data.stage || '',
      location: data.location || 'Kampala, Uganda',
      hours_per_week: data.hours_per_week || '',
      headline: defaultHeadline,
      bio: defaultBio,
      offers: data.offers || '',
      needs: data.needs || '',
      teaches: data.teaches || '',
      learns: data.learns || '',
      whatsapp: data.whatsapp || '',
      hide_whatsapp: data.hide_whatsapp ?? false,
      github: data.github || '',
      linkedin: data.linkedin || '',
      website: data.website || '',
      avatar: data.avatar || '',
      tags: initialTags,
      skills: initialTags,
      created_at: new Date().toISOString()
    };

    // 1. SAVE TO FIRESTORE AS SOON AS THE MEMBER FINISHES QUESTIONS, BEFORE ANY AI CALL
    try {
      await db.insert('profiles', fullProfile);
    } catch (err) {
      console.warn('Initial Firestore write notice:', err);
    }

    localStorage.setItem('kw_me', fullProfile.id);
    localStorage.setItem('kwegatta_current_profile', JSON.stringify(fullProfile));
    try {
      localStorage.removeItem('kw_onboarding_answers_v2');
    } catch (_) {}

    setSavedProfile(fullProfile);
    setIsProcessing(false);

    // Show saved profile card in chat immediately
    addMessage(
      'bot',
      'Your profile is saved!',
      <div className="kw-card p-4 sm:p-5 mt-3 bg-[var(--card)] border border-[var(--gold)]/40 rounded-2xl shadow-xl space-y-3.5 animate-in fade-in zoom-in-95">
        <div className="flex items-center gap-3.5">
          <Avatar profile={fullProfile} className="w-14 h-14 rounded-full ring-2 ring-[var(--gold)]" />
          <div className="min-w-0">
            <div className="font-bold text-sm text-[var(--fg)] truncate">{fullProfile.name}</div>
            <div className="text-xs text-[var(--gold)] font-semibold mt-0.5 line-clamp-1">{fullProfile.headline}</div>
            <div className="flex flex-wrap gap-1 mt-1">
              {(fullProfile.roles || [fullProfile.role]).filter(Boolean).map(r => (
                <span key={r} className="kw-badge kw-badge-teal text-[10px] font-medium">{r}</span>
              ))}
              {fullProfile.location && (
                <span className="kw-badge text-[10px] bg-[var(--bg-subtle)] text-[var(--fg-muted)] flex items-center gap-0.5">
                  <MapPin className="w-2.5 h-2.5" />
                  <span>{fullProfile.location}</span>
                </span>
              )}
            </div>
          </div>
        </div>
        <p className="text-xs text-[var(--fg)] leading-relaxed">{fullProfile.bio}</p>
        <div className="flex flex-wrap gap-1.5 pt-1">
          {fullProfile.tags?.map((t: string) => (
            <span key={t} className="kw-badge kw-badge-gold text-[10px]">#{t}</span>
          ))}
        </div>
      </div>
    );

    // 2. ASK GEMMA TO WRITE HEADLINE, BIO AND TAGS IN THE BACKGROUND
    polishProfileWithGemma(fullProfile);
  };

  const polishProfileWithGemma = async (baseProfile: Profile) => {
    setAiPolishStatus('polishing');
    setPolishNotice(null);

    let draft: any = null;
    // Retry up to 3 times in background
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[Gemma Background Polish] Attempt ${attempt}/3...`);
        draft = await buildProfileWithGemma(baseProfile);
        if (draft && draft.ai) {
          break;
        }
      } catch (err: any) {
        console.warn(`[Gemma Background Polish] Attempt ${attempt} failed:`, err.message);
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
    }

    if (draft && draft.ai) {
      const updated: Profile = {
        ...baseProfile,
        headline: draft.headline || baseProfile.headline,
        bio: draft.bio || baseProfile.bio,
        tags: (draft.tags && draft.tags.length > 0) ? draft.tags : baseProfile.tags,
        skills: (draft.skills && draft.skills.length > 0) ? draft.skills : baseProfile.skills,
        role: draft.role || baseProfile.role
      };

      try {
        await db.update('profiles', baseProfile.id, {
          headline: updated.headline,
          bio: updated.bio,
          tags: updated.tags,
          skills: updated.skills,
          role: updated.role
        });
      } catch (_) {}

      localStorage.setItem('kwegatta_current_profile', JSON.stringify(updated));
      setSavedProfile(updated);
      setAiPolishStatus('done');
      window.dispatchEvent(new CustomEvent('kwegatta_profile_updated', { detail: updated }));
    } else {
      // If Gemma fails: keep the saved profile, show "Your profile is saved. AI polish will be added shortly.", retry up to 3 times in the background, and let the member continue to their matches.
      setAiPolishStatus('failed');
      setPolishNotice('Your profile is saved. AI polish will be added shortly.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto pt-2 pb-10 space-y-4 animate-in fade-in">
      {/* Progression Tracker */}
      <div className="kw-card p-4 bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-sm space-y-3">
        <div className="flex items-center justify-between text-xs text-[var(--fg-muted)]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--gold)]" />
            <span className="font-semibold text-xs text-[var(--fg)]">Profile Setup</span>
            <span className="text-[var(--fg-subtle)] text-[11px]">
              · Step {Math.min(stepIndex + 1, STEPS.length)} of {STEPS.length}
            </span>
            {stepIndex > 0 && !savedProfile && (
              <button
                type="button"
                onClick={handleResetDraft}
                className="text-[11px] text-[var(--fg-subtle)] hover:text-[var(--danger)] transition-colors underline cursor-pointer ml-1.5"
                title="Clear answers and start fresh"
              >
                Start over
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[var(--gold)] font-medium text-[11px] tabular-nums">
            <Clock className="w-3.5 h-3.5" />
            <span>about {secondsLeft}s left</span>
          </div>
        </div>

        {/* Stepper bar */}
        <div className="grid grid-cols-11 gap-1 sm:gap-1.5 pt-1">
          {STEPS.map((step, idx) => {
            const isDone = idx < stepIndex;
            const isCurrent = idx === stepIndex;

            return (
              <div key={step.key} className="flex flex-col items-center gap-1">
                <div
                  className={`w-full h-1.5 rounded-full transition-all duration-300 ${
                    isDone
                      ? 'bg-[var(--gold)]'
                      : isCurrent
                      ? 'bg-[var(--gold)] shadow-[0_0_8px_rgba(245,183,0,0.5)] animate-pulse'
                      : 'bg-[var(--bg-subtle)] border border-[var(--card-border)]'
                  }`}
                  title={step.label}
                />
                <span
                  className={`text-[9px] font-medium hidden sm:block truncate w-full text-center ${
                    isCurrent ? 'text-[var(--gold)] font-bold' : isDone ? 'text-[var(--fg)]' : 'text-[var(--fg-subtle)]'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Conversational Assistant Card */}
      <div className="kw-card bg-[var(--card)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-xl transition-all">
        {/* Messages History */}
        <div className="p-4 sm:p-6 space-y-4 min-h-[260px] max-h-[58vh] overflow-y-auto bg-[var(--bg-subtle)]/20">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex gap-3 max-w-[92%] sm:max-w-[85%] animate-in slide-in-from-bottom-2 duration-200 ${
                msg.sender === 'user' ? 'ml-auto flex-row-reverse' : ''
              }`}
            >
              {msg.sender === 'bot' && (
                <div className="w-8 h-8 rounded-full bg-[var(--gold-subtle)] text-[var(--gold)] grid place-items-center flex-shrink-0 mt-0.5 border border-[var(--card-border)] shadow-sm">
                  <Sparkles className="w-4 h-4" />
                </div>
              )}
              <div
                className={`p-3.5 sm:p-4 rounded-2xl text-xs sm:text-[13px] leading-relaxed shadow-sm ${
                  msg.sender === 'user'
                    ? 'bg-gradient-to-r from-[#F5B700] to-[#E0A600] text-[#090D16] font-medium border border-[var(--gold)]'
                    : 'bg-[var(--card)] border border-[var(--card-border)] text-[var(--fg)]'
                }`}
              >
                <div>{msg.text}</div>
                {msg.component}
              </div>
            </div>
          ))}

          {isBotTyping && (
            <div className="flex gap-3 items-center animate-in fade-in duration-200">
              <div className="w-8 h-8 rounded-full bg-[var(--gold-subtle)] text-[var(--gold)] grid place-items-center flex-shrink-0 border border-[var(--card-border)]">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="py-2.5 px-4 rounded-2xl bg-[var(--card)] border border-[var(--card-border)] text-xs text-[var(--fg-muted)] flex items-center gap-1.5 shadow-sm">
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          )}

          {isProcessing && (
            <div className="flex gap-3 items-center animate-in fade-in">
              <div className="w-8 h-8 rounded-full bg-[var(--gold-subtle)] text-[var(--gold)] grid place-items-center flex-shrink-0 border border-[var(--card-border)]">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="py-3 px-4 rounded-2xl bg-[var(--card)] border border-[var(--card-border)] text-xs text-[var(--fg-muted)] flex items-center gap-2.5 shadow-sm">
                <span>Gemma 4 is synthesizing your profile</span>
                <span className="typing-dot" />
                <span className="typing-dot" />
                <span className="typing-dot" />
              </div>
            </div>
          )}

          {errorState && (
            <div className="p-3.5 rounded-xl bg-[var(--danger-subtle)] border border-red-500/30 text-xs text-[var(--danger)] flex items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errorState}</span>
              </div>
              <button
                onClick={() => {
                  setErrorState(null);
                  if (savedProfile) onCompleted(savedProfile);
                  else handleCompleteAndSave(formData);
                }}
                className="kw-btn text-xs py-1 px-2.5 bg-red-600 text-white border-0 hover:bg-red-700 flex items-center gap-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Try again</span>
              </button>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Composer & Action Bar */}
        <div className="p-4 sm:p-5 bg-[var(--card)] border-t border-[var(--card-border)] space-y-3">
          {savedProfile ? (
            <div className="space-y-3 animate-in fade-in">
              {aiPolishStatus === 'polishing' ? (
                <div className="flex items-center gap-2 text-xs text-[var(--gold)] font-medium bg-[var(--gold-subtle)] p-3 rounded-xl border border-[var(--gold)]/20 animate-pulse">
                  <Sparkles className="w-4 h-4 animate-spin text-[var(--gold)] flex-shrink-0" />
                  <span>Your profile is saved in your own words. Gemma 4 is polishing headline &amp; bio in background...</span>
                </div>
              ) : aiPolishStatus === 'done' ? (
                <div className="flex items-center gap-2 text-xs text-[var(--teal)] font-medium bg-[var(--teal-subtle)] p-3 rounded-xl border border-[var(--teal)]/20 animate-in fade-in">
                  <Sparkles className="w-4 h-4 text-[var(--teal)] flex-shrink-0" />
                  <span>AI polish applied! Your headline, bio and tags have been enriched.</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-xs text-[var(--gold)] font-medium bg-[var(--gold-subtle)] p-3 rounded-xl border border-[var(--gold)]/30">
                  <AlertCircle className="w-4 h-4 flex-shrink-0 text-[var(--gold)]" />
                  <span>{polishNotice || 'Your profile is saved. AI polish will be added shortly.'}</span>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => polishProfileWithGemma(savedProfile)}
                  disabled={aiPolishStatus === 'polishing'}
                  className="kw-btn kw-btn-ghost text-xs py-2 px-3.5 active:scale-95 cursor-pointer flex items-center gap-1.5"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${aiPolishStatus === 'polishing' ? 'animate-spin' : ''}`} />
                  <span>Repolish with Gemma</span>
                </button>
                <button
                  type="button"
                  onClick={() => onCompleted(savedProfile)}
                  className="kw-btn kw-btn-gold text-xs py-2.5 px-6 font-bold active:scale-95 shadow-md cursor-pointer flex items-center gap-2 ml-auto"
                >
                  <span>Continue to your matches →</span>
                </button>
              </div>
            </div>
          ) : currentStep?.type === 'choice' ? (
            /* Tappable Choices (Intent, Stage) */
            <div className="space-y-2">
              <div className="text-xs text-[var(--fg-muted)] font-medium">Tap your answer:</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {currentStep.choices?.map(choice => (
                  <button
                    key={choice}
                    onClick={() => handleSelectChoice(choice)}
                    className="p-3 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)] hover:border-[var(--gold)] text-xs font-medium text-left text-[var(--fg)] hover:text-[var(--gold)] transition-all cursor-pointer flex items-center justify-between group active:scale-[0.98]"
                  >
                    <span>{choice}</span>
                    <ArrowRight className="w-3.5 h-3.5 text-[var(--fg-subtle)] group-hover:text-[var(--gold)] transition-transform group-hover:translate-x-0.5" />
                  </button>
                ))}
              </div>
            </div>
          ) : currentStep?.type === 'multi_choice' ? (
            /* Multi-select Roles (Up to 2) */
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[var(--fg-muted)] font-medium">Select up to two roles:</span>
                <span className="text-[var(--gold)] font-bold">{selectedRoles.length} / 2 selected</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {currentStep.choices?.map(role => {
                  const isSelected = selectedRoles.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => handleToggleRole(role)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                        isSelected
                          ? 'bg-[var(--gold)] text-[#090D16] border-[var(--gold)] shadow-sm'
                          : 'bg-[var(--bg-subtle)] text-[var(--fg-muted)] border-[var(--card-border)] hover:border-[var(--gold)] hover:text-[var(--fg)]'
                      }`}
                    >
                      {isSelected && <Check className="w-3.5 h-3.5" />}
                      <span>{role}</span>
                    </button>
                  );
                })}
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  disabled={selectedRoles.length === 0}
                  onClick={handleConfirmRoles}
                  className="kw-btn kw-btn-gold text-xs py-2 px-5 font-semibold disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : currentStep?.type === 'location_and_hours' ? (
            /* City & Hours per week available */
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="text-xs text-[var(--fg-muted)] font-medium">City or Remote:</div>
                <div className="flex flex-wrap gap-1.5">
                  {LOCATION_CHOICES.map(loc => (
                    <button
                      key={loc}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, location: loc }))}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                        formData.location === loc
                          ? 'bg-[var(--gold)] text-[#090D16] border-[var(--gold)]'
                          : 'bg-[var(--bg-subtle)] text-[var(--fg)] border-[var(--card-border)]'
                      }`}
                    >
                      {loc}
                    </button>
                  ))}
                  <input
                    type="text"
                    placeholder="Other city..."
                    value={!LOCATION_CHOICES.includes(formData.location || '') ? (formData.location || '') : ''}
                    onChange={e => setFormData(prev => ({ ...prev, location: e.target.value }))}
                    className="bg-[var(--bg-subtle)] border border-[var(--card-border)] rounded-lg px-2.5 py-1 text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--gold)]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="text-xs text-[var(--fg-muted)] font-medium">Hours per week available:</div>
                <div className="flex flex-wrap gap-1.5">
                  {HOURS_CHOICES.map(hrs => (
                    <button
                      key={hrs}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, hours_per_week: hrs }))}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                        formData.hours_per_week === hrs
                          ? 'bg-[var(--teal)] text-[#090D16] border-[var(--teal)]'
                          : 'bg-[var(--bg-subtle)] text-[var(--fg)] border-[var(--card-border)]'
                      }`}
                    >
                      {hrs}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-between items-center pt-2">
                <button
                  type="button"
                  onClick={() => advanceToNext(formData, stepIndex + 1)}
                  className="kw-btn kw-btn-ghost text-xs py-2 px-3"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const loc = formData.location || 'Remote';
                    const hrs = formData.hours_per_week || '10-20 hrs/week';
                    addMessage('user', `${loc} · ${hrs}`);
                    advanceToNext({ ...formData, location: loc, hours_per_week: hrs }, stepIndex + 1);
                  }}
                  className="kw-btn kw-btn-gold text-xs py-2 px-5 font-semibold flex items-center gap-1.5"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : currentStep?.type === 'learning' ? (
            /* Peer learning: teaches & learns */
            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs text-[var(--teal)] font-medium block">What can you teach?</label>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {STEP_SUGGESTIONS.teaches.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, teaches: s }))}
                      className="text-[11px] py-0.5 px-2 rounded bg-[var(--bg-subtle)] border border-[var(--card-border)] hover:border-[var(--teal)] text-[var(--fg-muted)]"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="e.g. Retail business strategy, Figma design..."
                  value={formData.teaches || ''}
                  onChange={e => setFormData(prev => ({ ...prev, teaches: e.target.value }))}
                  className="w-full bg-[var(--bg-subtle)] border border-[var(--card-border)] rounded-xl px-3 py-2 text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--teal)]"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-[var(--gold)] font-medium block">What do you want to learn?</label>
                <div className="flex flex-wrap gap-1.5 mb-1.5">
                  {STEP_SUGGESTIONS.learns.map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, learns: s }))}
                      className="text-[11px] py-0.5 px-2 rounded bg-[var(--bg-subtle)] border border-[var(--card-border)] hover:border-[var(--gold)] text-[var(--fg-muted)]"
                    >
                      + {s}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  placeholder="e.g. Mobile app development, grant proposals..."
                  value={formData.learns || ''}
                  onChange={e => setFormData(prev => ({ ...prev, learns: e.target.value }))}
                  className="w-full bg-[var(--bg-subtle)] border border-[var(--card-border)] rounded-xl px-3 py-2 text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--gold)]"
                />
              </div>

              <div className="flex justify-between items-center pt-1">
                <button
                  type="button"
                  onClick={() => advanceToNext(formData, stepIndex + 1)}
                  className="kw-btn kw-btn-ghost text-xs py-2 px-3"
                >
                  Skip
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const t = formData.teaches || '';
                    const l = formData.learns || '';
                    if (t || l) {
                      addMessage('user', `Teaches: ${t || '-'} · Learns: ${l || '-'}`);
                    } else {
                      addMessage('user', 'Skipped learning');
                    }
                    advanceToNext(formData, stepIndex + 1);
                  }}
                  className="kw-btn kw-btn-gold text-xs py-2 px-5 font-semibold flex items-center gap-1.5"
                >
                  <span>Continue</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : currentStep?.type === 'photo' ? (
            /* Photo upload state machine: preview at once, processing, photo saved, clear error with try again */
            <div className="space-y-4">
              {/* Photo Preview & Status Display */}
              {photoPreviewUrl ? (
                <div className="flex items-center gap-4 p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)]">
                  <div className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-[var(--gold)] flex-shrink-0 bg-black">
                    <img
                      src={photoPreviewUrl}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                    {photoStatus === 'processing' && (
                      <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                        <div className="w-5 h-5 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
                      </div>
                    )}
                  </div>

                  <div className="space-y-1 min-w-0 flex-1">
                    {photoStatus === 'processing' && (
                      <div className="text-xs font-semibold text-[var(--gold)] flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-[var(--gold)] animate-ping" />
                        <span>Processing…</span>
                      </div>
                    )}
                    {photoStatus === 'saved' && (
                      <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>Photo saved</span>
                      </div>
                    )}
                    {photoStatus === 'error' && (
                      <div className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
                        <AlertCircle className="w-4 h-4" />
                        <span>{photoErrorMsg || 'Error processing photo'}</span>
                      </div>
                    )}
                    <p className="text-[11px] text-[var(--fg-muted)]">
                      {photoStatus === 'saved'
                        ? 'Your photo is ready and will appear across the app.'
                        : photoStatus === 'processing'
                        ? 'Resizing photo for optimal performance...'
                        : 'Please choose another photo or try again.'}
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Action Buttons */}
              <div className="flex flex-wrap gap-2.5 items-center justify-between">
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => selfieInputRef.current?.click()}
                    className="kw-btn kw-btn-gold text-xs py-2 px-4 cursor-pointer active:scale-95 flex items-center gap-1.5"
                  >
                    <Camera className="w-4 h-4" />
                    <span>Take selfie</span>
                  </button>
                  <input
                    ref={selfieInputRef}
                    type="file"
                    accept="image/*"
                    capture="user"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) handleFileChosen(f);
                    }}
                    hidden
                  />

                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="kw-btn text-xs py-2 px-4 cursor-pointer active:scale-95 flex items-center gap-1.5 bg-[var(--bg-subtle)] text-[var(--fg)] border border-[var(--card-border)]"
                  >
                    <Upload className="w-4 h-4 text-[var(--fg-muted)]" />
                    <span>Upload photo</span>
                  </button>
                  <input
                    ref={photoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={e => {
                      const f = e.target.files?.[0];
                      if (f) handleFileChosen(f);
                    }}
                    hidden
                  />
                </div>

                <div className="flex items-center gap-2">
                  {photoStatus === 'error' && (
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="kw-btn text-xs py-2 px-3 bg-red-600 text-white border-0 hover:bg-red-700 flex items-center gap-1"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Try again</span>
                    </button>
                  )}

                  {photoStatus === 'saved' ? (
                    <button
                      type="button"
                      onClick={handleProceedAfterPhoto}
                      className="kw-btn kw-btn-gold text-xs py-2 px-5 font-semibold flex items-center gap-1.5"
                    >
                      <span>Continue</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        addMessage('user', 'Skipped photo');
                        handleCompleteAndSave(formData);
                      }}
                      className="kw-btn kw-btn-ghost text-xs py-2 px-3"
                    >
                      Skip photo
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Standard Text input with chips (Offers, Needs, Links, WhatsApp, Name) */
            <div className="space-y-3">
              {/* Contextual Suggestion Chips */}
              {STEP_SUGGESTIONS[currentStep.key] && (
                <div className="flex flex-wrap gap-1.5">
                  {STEP_SUGGESTIONS[currentStep.key].map(sug => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => {
                        setInputText(sug);
                        inputRef.current?.focus();
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-medium py-1 px-2.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--card-border)] hover:border-[var(--gold)] text-[var(--fg-muted)] hover:text-[var(--fg)] active:scale-95 transition-all cursor-pointer"
                    >
                      <span className="text-[var(--gold)] font-bold">+</span>
                      <span>{sug}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Chat Composer Input Form */}
              <form
                onSubmit={e => {
                  e.preventDefault();
                  handleNextTextStep(inputText);
                }}
                className="flex gap-2 items-center"
              >
                <div className="relative flex-1">
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder={currentStep.placeholder || 'Type your answer...'}
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    disabled={isProcessing || isBotTyping}
                    className="w-full bg-[var(--bg-subtle)] border border-[var(--card-border)] focus:border-[var(--gold)] focus:bg-[var(--card)] text-xs sm:text-sm text-[var(--fg)] placeholder:text-[var(--fg-subtle)] rounded-xl px-3.5 py-2.5 transition-all focus:outline-none focus:ring-2 focus:ring-[var(--gold-subtle)]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isProcessing || isBotTyping || (currentStep.required && !inputText.trim())}
                  className="kw-btn kw-btn-gold text-xs sm:text-sm px-4 py-2.5 font-semibold active:scale-95 shadow-sm flex items-center gap-1.5 disabled:opacity-40"
                >
                  <span>Send</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                {!currentStep.required && (
                  <button
                    type="button"
                    onClick={() => handleNextTextStep('')}
                    disabled={isProcessing || isBotTyping}
                    className="kw-btn kw-btn-ghost text-xs py-2.5 px-3"
                  >
                    Skip
                  </button>
                )}
              </form>

              {/* WhatsApp Privacy Notice & Toggle */}
              {currentStep.key === 'whatsapp' && (
                <label className="flex items-center gap-2 pt-1 text-xs text-[var(--fg-muted)] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={whatsappVisible}
                    onChange={e => setWhatsappVisible(e.target.checked)}
                    className="rounded border-[var(--card-border)] text-[var(--gold)] focus:ring-[var(--gold)]"
                  />
                  <span>Visible to other signed-in members for one-tap WhatsApp connect</span>
                </label>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
