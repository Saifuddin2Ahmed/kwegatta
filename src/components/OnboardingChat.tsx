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
  MapPin,
  Image as ImageIcon,
  Edit2,
  CheckCheck
} from 'lucide-react';
import { Profile } from '../types';
import { buildProfileWithGemma, fetchGitHubData, db, fetchMyAccountProfile } from '../services/api';
import { resizeImageFile } from '../utils';
import { Avatar } from './Avatar';
import { auth } from '../services/firebase';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { AuthModal } from './AuthModal';

interface OnboardingChatProps {
  onCompleted: (profile: Profile) => void;
  onCancel?: () => void;
}

const INTENT_CHOICES = [
  'Find a co-founder',
  'Find a technical partner',
  'Find a business partner',
  'Join a project',
  'Find a mentor or be one',
  'Learn a skill',
  'Find a research collaborator',
  'Find participants or data'
];

const ROLE_CHOICES = [
  'Founder',
  'Business',
  'Developer',
  'Designer',
  'Domain expert',
  'Mentor',
  'Student',
  'Researcher'
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
  'Gulu',
  'Mbarara',
  'Remote'
];

const HOURS_CHOICES = [
  '5-10 hrs/week',
  '10-20 hrs/week',
  '20+ hrs/week',
  'Full-time'
];

const ROLE_BASED_OFFERS: Record<string, string[]> = {
  Founder: [
    'Product vision & roadmap',
    'Pitch deck & fundraising',
    'Team building & hiring',
    'Customer discovery & sales'
  ],
  Developer: [
    'React, TypeScript & Tailwind',
    'Flutter mobile apps & Dart',
    'Python, FastAPI & backend APIs',
    'Database architecture & cloud deployment',
    'AI/LLM integration'
  ],
  Designer: [
    'UI/UX design in Figma',
    'Design systems & tokens',
    'Mobile app wireframes & prototypes',
    'User testing & usability research'
  ],
  Business: [
    'Financial modeling & budgets',
    'Market research & customer calls',
    'B2B sales & partnerships in Kampala',
    'Grant proposals & investor pitching'
  ],
  'Domain expert': [
    'Agricultural supply chain & farmer logistics',
    'Retail market dynamics in Uganda',
    'Fintech regulations & payments',
    'Healthcare logistics & clinics'
  ],
  Researcher: [
    'Academic research & study design',
    'Data collection & statistical analysis',
    'Survey design & field interviews',
    'Co-authoring papers & grant writing'
  ],
  Mentor: [
    'Startup peer mentoring & strategy',
    'Technical code reviews & architecture',
    'Career growth & leadership guidance'
  ],
  Student: [
    'Quick learner & enthusiastic builder',
    'Frontend web coding & testing',
    'Community organizing & social media'
  ]
};

const SUGGESTED_NEEDS = [
  'Technical co-founder (Flutter/React)',
  'I need someone to build my app',
  'UI/UX designer (Figma)',
  'Business partner & marketing strategy',
  'Domain expert in retail / agriculture',
  'Backend engineer (APIs & database)',
  'Research collaborator & co-author',
  'Study participants & dataset access',
  'Peer mentor for startup launch'
];

const SUGGESTED_TEACHES = [
  'Retail business strategy',
  'Figma UI design & tokens',
  'Flutter mobile basics',
  'Financial accounting & budgets',
  'Grant proposals & pitching',
  'Python basics & data analysis',
  'Research methodology'
];

const SUGGESTED_LEARNS = [
  'Product strategy & discovery',
  'React & modern TypeScript',
  'AI prompt engineering',
  'Market research & customer calls',
  'Grant writing & fundraising',
  'Data science & statistical modeling'
];

const SCREEN_NAMES = [
  'What brings you here',
  'Your role and stage',
  'Name, city, hours per week',
  'What you offer and what you need',
  'What you can teach and want to learn',
  'Links, WhatsApp, photo'
];

export const OnboardingChat: React.FC<OnboardingChatProps> = ({ onCompleted }) => {
  // Restore answers from browser storage so a refresh never loses answers
  const initialDraft = (() => {
    try {
      const raw = localStorage.getItem('kw_onboarding_answers_v3');
      if (raw) return JSON.parse(raw);
    } catch (_) {}
    return null;
  })();

  const [screenIndex, setScreenIndex] = useState<number>(() => {
    return initialDraft && typeof initialDraft.screenIndex === 'number'
      ? Math.min(initialDraft.screenIndex, 5)
      : 0;
  });

  const [formData, setFormData] = useState<Partial<Profile>>(() => {
    return initialDraft?.formData || { roles: [], tags: [], skills: [] };
  });

  const [selectedIntents, setSelectedIntents] = useState<string[]>(() => {
    if (initialDraft?.selectedIntents) return initialDraft.selectedIntents;
    if (initialDraft?.formData?.intent) return [initialDraft.formData.intent];
    return [];
  });

  const [selectedRoles, setSelectedRoles] = useState<string[]>(() => {
    return initialDraft?.selectedRoles || initialDraft?.formData?.roles || [];
  });

  const [selectedStage, setSelectedStage] = useState<string>(() => {
    return initialDraft?.formData?.stage || '';
  });

  const [whatsappVisible, setWhatsappVisible] = useState<boolean>(() => {
    return initialDraft?.whatsappVisible ?? true;
  });

  const [isProcessing, setIsProcessing] = useState(false);
  const [savedProfile, setSavedProfile] = useState<Profile | null>(null);
  const [aiPolishStatus, setAiPolishStatus] = useState<'idle' | 'polishing' | 'done' | 'failed'>('idle');
  const [polishNotice, setPolishNotice] = useState<string | null>(null);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [selectionNotice, setSelectionNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<any>(null);

  const showSelectionNotice = (msg: string) => {
    setSelectionNotice(msg);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => {
      setSelectionNotice(null);
    }, 2000);
  };

  // Auth Dialog state
  const [currentUser, setCurrentUser] = useState<FirebaseUser | null>(() => auth.currentUser);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authModalPurpose, setAuthModalPurpose] = useState<'initial' | 'before_save'>('initial');
  const [pendingSaveData, setPendingSaveData] = useState<Partial<Profile> | null>(null);

  // Photo state machine: idle | processing | saved | error
  const [photoStatus, setPhotoStatus] = useState<'idle' | 'processing' | 'saved' | 'error'>('idle');
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(() => formData.avatar || null);
  const [photoErrorMsg, setPhotoErrorMsg] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const selfieInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, user => {
      setCurrentUser(user);
      if (user) {
        if (user.displayName) {
          setFormData(prev => ({ ...prev, name: prev.name || user.displayName || '' }));
        }
        if (user.photoURL) {
          setFormData(prev => ({ ...prev, avatar: prev.avatar || user.photoURL || '' }));
          setPhotoPreviewUrl(prev => prev || user.photoURL);
          setPhotoStatus(prev => (prev === 'idle' ? 'saved' : prev));
        }
      }
    });
    return () => unsub();
  }, []);

  // Persist draft answers across steps
  useEffect(() => {
    if (!savedProfile && (screenIndex > 0 || Object.keys(formData).length > 2)) {
      try {
        localStorage.setItem(
          'kw_onboarding_answers_v3',
          JSON.stringify({
            formData,
            screenIndex,
            selectedIntents,
            selectedRoles,
            selectedStage,
            whatsappVisible
          })
        );
      } catch (_) {}
    }
  }, [formData, screenIndex, selectedIntents, selectedRoles, selectedStage, whatsappVisible, savedProfile]);

  const handleResetDraft = () => {
    if (confirm('Start over and clear answers entered so far?')) {
      try {
        localStorage.removeItem('kw_onboarding_answers_v3');
      } catch (_) {}
      setFormData({ roles: [], tags: [], skills: [] });
      setSelectedIntents([]);
      setSelectedRoles([]);
      setSelectedStage('');
      setScreenIndex(0);
      setSavedProfile(null);
    }
  };

  const handleAuthSuccess = async (user: FirebaseUser) => {
    setShowAuthModal(false);
    setCurrentUser(user);

    try {
      const existing = await fetchMyAccountProfile();
      if (existing) {
        localStorage.setItem('kw_me', existing.id);
        localStorage.setItem('kwegatta_current_profile', JSON.stringify(existing));
        try {
          localStorage.removeItem('kw_onboarding_answers_v3');
        } catch (_) {}
        onCompleted(existing);
        return;
      }
    } catch (err) {
      console.warn('Profile sync on sign in:', err);
    }

    const updated: Partial<Profile> = { ...formData };
    if (user.displayName && !updated.name) {
      updated.name = user.displayName;
    }
    if (user.photoURL && !updated.avatar) {
      updated.avatar = user.photoURL;
      setPhotoPreviewUrl(user.photoURL);
      setPhotoStatus('saved');
    }
    setFormData(updated);

    if (authModalPurpose === 'before_save' && pendingSaveData) {
      await executeSave({ ...pendingSaveData, ...updated }, user);
    }
  };

  // Toggle selection for multiple choice chips
  const handleToggleIntent = (intent: string) => {
    if (selectedIntents.includes(intent)) {
      setSelectedIntents(prev => prev.filter(i => i !== intent));
    } else {
      if (selectedIntents.length < 3) {
        setSelectedIntents(prev => [...prev, intent]);
      } else {
        showSelectionNotice('Remove one to add another');
      }
    }
  };

  const handleToggleRole = (role: string) => {
    if (selectedRoles.includes(role)) {
      setSelectedRoles(prev => prev.filter(r => r !== role));
    } else {
      if (selectedRoles.length < 2) {
        setSelectedRoles(prev => [...prev, role]);
      } else {
        showSelectionNotice('Remove one to add another');
      }
    }
  };

  // Photo handlers
  const handleFileChosen = async (file: File) => {
    if (!file) return;
    const tempUrl = URL.createObjectURL(file);
    setPhotoPreviewUrl(tempUrl);
    setPhotoStatus('processing');
    setPhotoErrorMsg(null);

    try {
      const resized = await resizeImageFile(file);
      URL.revokeObjectURL(tempUrl);
      setPhotoPreviewUrl(resized);
      setPhotoStatus('saved');
      setFormData(prev => ({ ...prev, avatar: resized }));
    } catch (err: any) {
      setPhotoStatus('error');
      setPhotoErrorMsg('Could not process this image file. Please try another.');
    }
  };

  // Save profile flow
  const handleCompleteAndSave = async (data: Partial<Profile>) => {
    if (!auth.currentUser) {
      setPendingSaveData(data);
      setAuthModalPurpose('before_save');
      setShowAuthModal(true);
      return;
    }
    await executeSave(data, auth.currentUser);
  };

  const executeSave = async (data: Partial<Profile>, user?: FirebaseUser | null) => {
    setIsProcessing(true);
    setErrorState(null);

    const memberName = (data.name || user?.displayName || 'Member').trim();
    const primaryRole = (selectedRoles[0] || data.roles?.[0] || 'Member');
    const rolesList = selectedRoles.length ? selectedRoles : (data.roles?.length ? data.roles : [primaryRole]);
    const intentStr = selectedIntents.join(', ') || data.intent || '';

    const defaultHeadline = data.offers
      ? (data.offers.length > 70 ? data.offers.slice(0, 67) + '...' : data.offers)
      : `${primaryRole} in ${data.location || 'Kampala'}`;

    const defaultBio = (data.offers || data.needs)
      ? `I offer ${data.offers || 'collaboration'}. I am looking for ${data.needs || 'partners'}.`
      : 'Excited to collaborate and build on Kwegatta.';

    const initialTags = Array.from(
      new Set([
        primaryRole,
        selectedStage || data.stage,
        data.location || 'Kampala'
      ].filter(Boolean) as string[])
    );

    const fullProfile: Profile = {
      id: user?.uid || ('user-' + Date.now()),
      account_uid: user?.uid || undefined,
      email: user?.email || undefined,
      name: memberName,
      role: primaryRole,
      roles: rolesList,
      intent: intentStr,
      stage: selectedStage || data.stage || '',
      location: data.location || 'Kampala, Uganda',
      hours_per_week: data.hours_per_week || '',
      headline: defaultHeadline,
      bio: defaultBio,
      offers: data.offers || '',
      needs: data.needs || '',
      teaches: data.teaches || '',
      learns: data.learns || '',
      whatsapp: data.whatsapp || '',
      hide_whatsapp: data.hide_whatsapp ?? !whatsappVisible,
      github: data.github || '',
      linkedin: data.linkedin || '',
      website: data.website || '',
      avatar: data.avatar || user?.photoURL || '',
      tags: initialTags,
      skills: initialTags,
      created_at: new Date().toISOString()
    };

    try {
      const saved = await db.insert('profiles', fullProfile);
      const resolved = (saved && (saved as any).id) ? (saved as Profile) : fullProfile;
      localStorage.setItem('kw_me', resolved.id);
      localStorage.setItem('kwegatta_current_profile', JSON.stringify(resolved));
      try {
        localStorage.removeItem('kw_onboarding_answers_v3');
      } catch (_) {}

      setSavedProfile(resolved);
      setIsProcessing(false);
      polishProfileWithGemma(resolved);
    } catch (err: any) {
      console.warn('Initial Firestore write error:', err);
      setIsProcessing(false);
      setErrorState(err.message || 'Could not save profile. Please ensure you are signed in.');
    }
  };

  const polishProfileWithGemma = async (baseProfile: Profile) => {
    setAiPolishStatus('polishing');
    setPolishNotice(null);

    let draft: any = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        draft = await buildProfileWithGemma(baseProfile);
        if (draft && draft.ai) break;
      } catch (err: any) {
        if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
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
      setAiPolishStatus('failed');
      setPolishNotice('Your profile is saved. AI polish will be added shortly.');
    }
  };

  // Navigation handlers
  const handleNextScreen = () => {
    if (screenIndex === 0 && !auth.currentUser) {
      setAuthModalPurpose('initial');
      setShowAuthModal(true);
    }
    setScreenIndex(prev => Math.min(prev + 1, 5));
  };

  const handleFinishNow = () => {
    const dataToSave: Partial<Profile> = {
      ...formData,
      intent: selectedIntents.join(', '),
      roles: selectedRoles,
      role: selectedRoles[0] || 'Member',
      stage: selectedStage,
      hide_whatsapp: !whatsappVisible
    };
    handleCompleteAndSave(dataToSave);
  };

  // Check role to tailor offers
  const activeOffersSuggestions = Array.from(
    new Set(
      selectedRoles.flatMap(r => ROLE_BASED_OFFERS[r] || []).concat(
        ROLE_BASED_OFFERS['Founder'] || []
      )
    )
  );

  return (
    <div className="max-w-3xl mx-auto pt-2 pb-12 space-y-5 animate-in fade-in">
      {/* Progress Header: Step X of 6 */}
      <div className="kw-card p-4 sm:p-5 bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-sm space-y-3">
        <div className="flex items-center justify-between text-xs text-[var(--fg-muted)]">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[var(--gold)] animate-pulse" />
            <span className="font-bold text-xs sm:text-sm text-[var(--fg)]">
              Step {screenIndex + 1} of 6
            </span>
            <span className="text-[var(--gold)] font-medium text-xs sm:text-sm">
              · {SCREEN_NAMES[screenIndex]}
            </span>
            {screenIndex > 0 && !savedProfile && (
              <button
                type="button"
                onClick={handleResetDraft}
                className="text-[13px] text-[var(--fg-subtle)] hover:text-[var(--danger)] transition-colors underline cursor-pointer ml-2"
              >
                Start over
              </button>
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[var(--gold)] font-medium text-[13px] tabular-nums">
            <Clock className="w-3.5 h-3.5" />
            <span>~{(6 - screenIndex) * 15}s left</span>
          </div>
        </div>

        {/* Progress Bar (6 segments) */}
        <div className="grid grid-cols-6 gap-1.5 pt-1">
          {SCREEN_NAMES.map((name, idx) => {
            const isDone = idx < screenIndex;
            const isCurrent = idx === screenIndex;
            return (
              <div key={name} className="flex flex-col items-center gap-1">
                <div
                  className={`w-full h-2 rounded-full transition-all duration-300 ${
                    isDone
                      ? 'bg-[var(--gold)]'
                      : isCurrent
                      ? 'bg-[var(--gold)] shadow-[0_0_10px_rgba(245,183,0,0.6)]'
                      : 'bg-[var(--bg-subtle)] border border-[var(--card-border)]'
                  }`}
                  title={`Step ${idx + 1} of 6: ${name}`}
                />
                <span
                  className={`text-[13px] font-medium hidden sm:block truncate w-full text-center ${
                    isCurrent
                      ? 'text-[var(--gold)] font-bold'
                      : isDone
                      ? 'text-[var(--fg)]'
                      : 'text-[var(--fg-subtle)]'
                  }`}
                >
                  {name}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Collapsed Earlier Answers (One compact line each with Edit) */}
      {!savedProfile && screenIndex > 0 && (
        <div className="space-y-2">
          {screenIndex > 0 && selectedIntents.length > 0 && (
            <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--bg-subtle)]/60 border border-[var(--card-border)] rounded-xl text-xs text-[var(--fg-muted)] animate-in fade-in">
              <div className="flex items-center gap-2 truncate pr-2">
                <Check className="w-3.5 h-3.5 text-[var(--gold)] flex-shrink-0" />
                <span className="font-semibold text-[var(--fg)]">Intent:</span>
                <span className="truncate">{selectedIntents.join(', ')}</span>
              </div>
              <button
                type="button"
                onClick={() => setScreenIndex(0)}
                className="text-[var(--gold)] hover:underline font-semibold flex items-center gap-1 flex-shrink-0 cursor-pointer text-xs"
              >
                <Edit2 className="w-3 h-3" />
                <span>Edit</span>
              </button>
            </div>
          )}

          {screenIndex > 1 && (selectedRoles.length > 0 || selectedStage) && (
            <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--bg-subtle)]/60 border border-[var(--card-border)] rounded-xl text-xs text-[var(--fg-muted)] animate-in fade-in">
              <div className="flex items-center gap-2 truncate pr-2">
                <Check className="w-3.5 h-3.5 text-[var(--gold)] flex-shrink-0" />
                <span className="font-semibold text-[var(--fg)]">Role &amp; Stage:</span>
                <span className="truncate">
                  {selectedRoles.join(' & ') || 'Role not set'} · {selectedStage || 'Stage not set'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setScreenIndex(1)}
                className="text-[var(--gold)] hover:underline font-semibold flex items-center gap-1 flex-shrink-0 cursor-pointer text-xs"
              >
                <Edit2 className="w-3 h-3" />
                <span>Edit</span>
              </button>
            </div>
          )}

          {screenIndex > 2 && formData.name && (
            <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--bg-subtle)]/60 border border-[var(--card-border)] rounded-xl text-xs text-[var(--fg-muted)] animate-in fade-in">
              <div className="flex items-center gap-2 truncate pr-2">
                <Check className="w-3.5 h-3.5 text-[var(--gold)] flex-shrink-0" />
                <span className="font-semibold text-[var(--fg)]">Basic Details:</span>
                <span className="truncate">
                  {formData.name} · {formData.location || 'Kampala'} ({formData.hours_per_week || 'Flexible'})
                </span>
              </div>
              <button
                type="button"
                onClick={() => setScreenIndex(2)}
                className="text-[var(--gold)] hover:underline font-semibold flex items-center gap-1 flex-shrink-0 cursor-pointer text-xs"
              >
                <Edit2 className="w-3 h-3" />
                <span>Edit</span>
              </button>
            </div>
          )}

          {screenIndex > 3 && (formData.offers || formData.needs) && (
            <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--bg-subtle)]/60 border border-[var(--card-border)] rounded-xl text-xs text-[var(--fg-muted)] animate-in fade-in">
              <div className="flex items-center gap-2 truncate pr-2">
                <Check className="w-3.5 h-3.5 text-[var(--gold)] flex-shrink-0" />
                <span className="font-semibold text-[var(--fg)]">Offers &amp; Needs:</span>
                <span className="truncate">
                  Offers: {formData.offers || '-'} · Needs: {formData.needs || '-'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setScreenIndex(3)}
                className="text-[var(--gold)] hover:underline font-semibold flex items-center gap-1 flex-shrink-0 cursor-pointer text-xs"
              >
                <Edit2 className="w-3 h-3" />
                <span>Edit</span>
              </button>
            </div>
          )}

          {screenIndex > 4 && (formData.teaches || formData.learns) && (
            <div className="flex items-center justify-between px-4 py-2.5 bg-[var(--bg-subtle)]/60 border border-[var(--card-border)] rounded-xl text-xs text-[var(--fg-muted)] animate-in fade-in">
              <div className="flex items-center gap-2 truncate pr-2">
                <Check className="w-3.5 h-3.5 text-[var(--gold)] flex-shrink-0" />
                <span className="font-semibold text-[var(--fg)]">Teaches &amp; Learns:</span>
                <span className="truncate">
                  Teaches: {formData.teaches || '-'} · Learns: {formData.learns || '-'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setScreenIndex(4)}
                className="text-[var(--gold)] hover:underline font-semibold flex items-center gap-1 flex-shrink-0 cursor-pointer text-xs"
              >
                <Edit2 className="w-3 h-3" />
                <span>Edit</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* ACTIVE QUESTION CARD: Larger text, Gold accent bar on the left */}
      <div className="kw-card bg-[var(--card)] border border-[var(--card-border)] border-l-4 border-l-[var(--gold)] rounded-2xl p-5 sm:p-7 shadow-xl space-y-5 transition-all">
        {savedProfile ? (
          /* Profile Saved View & Gemma Polish Status */
          <div className="space-y-4 animate-in fade-in">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[var(--gold-subtle)] text-[var(--gold)] grid place-items-center flex-shrink-0">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-bold text-[var(--fg)]">
                  Your profile is saved!
                </h3>
                <p className="text-xs text-[var(--fg-muted)]">
                  Saved immediately in your own words.
                </p>
              </div>
            </div>

            {/* Profile Summary Card */}
            <div className="p-4 sm:p-5 bg-[var(--bg-subtle)] border border-[var(--gold)]/40 rounded-2xl shadow-md space-y-3.5">
              <div className="flex items-center gap-3.5">
                <Avatar profile={savedProfile} className="w-14 h-14 rounded-full ring-2 ring-[var(--gold)]" />
                <div className="min-w-0">
                  <div className="font-bold text-sm sm:text-base text-[var(--fg)] truncate">
                    {savedProfile.name}
                  </div>
                  <div className="text-xs text-[var(--gold)] font-semibold mt-0.5 line-clamp-1">
                    {savedProfile.headline}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(savedProfile.roles || [savedProfile.role]).filter(Boolean).map(r => (
                      <span key={r} className="kw-badge kw-badge-teal text-[13px] font-medium">
                        {r}
                      </span>
                    ))}
                    {savedProfile.location && (
                      <span className="kw-badge text-[13px] bg-[var(--card)] text-[var(--fg-muted)] flex items-center gap-0.5">
                        <MapPin className="w-2.5 h-2.5" />
                        <span>{savedProfile.location}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <p className="text-xs sm:text-sm text-[var(--fg)] leading-relaxed">
                {savedProfile.bio}
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {savedProfile.tags?.map((t: string) => (
                  <span key={t} className="kw-badge kw-badge-gold text-[13px]">
                    #{t}
                  </span>
                ))}
              </div>
            </div>

            {/* AI Polish Banner */}
            {aiPolishStatus === 'polishing' ? (
              <div className="flex items-center gap-2 text-xs text-[var(--gold)] font-medium bg-[var(--gold-subtle)] p-3.5 rounded-xl border border-[var(--gold)]/20 animate-pulse">
                <Sparkles className="w-4 h-4 animate-spin text-[var(--gold)] flex-shrink-0" />
                <span>Gemma 4 is polishing your headline &amp; bio in the background...</span>
              </div>
            ) : aiPolishStatus === 'done' ? (
              <div className="flex items-center gap-2 text-xs text-[var(--teal)] font-medium bg-[var(--teal-subtle)] p-3.5 rounded-xl border border-[var(--teal)]/20 animate-in fade-in">
                <Sparkles className="w-4 h-4 text-[var(--teal)] flex-shrink-0" />
                <span>AI polish applied! Headline, bio, and tags have been enriched.</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-xs text-[var(--gold)] font-medium bg-[var(--gold-subtle)] p-3.5 rounded-xl border border-[var(--gold)]/30">
                <AlertCircle className="w-4 h-4 flex-shrink-0 text-[var(--gold)]" />
                <span>{polishNotice || 'Your profile is saved. AI polish will be added shortly.'}</span>
              </div>
            )}

            {/* Action CTAs */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => polishProfileWithGemma(savedProfile)}
                disabled={aiPolishStatus === 'polishing'}
                className="kw-btn kw-btn-ghost text-xs py-2.5 px-4 cursor-pointer flex items-center gap-1.5 active:scale-95"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${aiPolishStatus === 'polishing' ? 'animate-spin' : ''}`} />
                <span>Repolish with Gemma</span>
              </button>
              <button
                type="button"
                onClick={() => onCompleted(savedProfile)}
                className="kw-btn kw-btn-gold text-xs sm:text-sm py-2.5 px-6 font-bold active:scale-95 shadow-lg cursor-pointer flex items-center gap-2 ml-auto"
              >
                <span>Continue to your matches →</span>
              </button>
            </div>
          </div>
        ) : (
          /* ACTIVE ONBOARDING SCREEN (1 of 6 to 6 of 6) */
          <div className="space-y-5">
            {/* Screen 1: What brings you here (Intents) */}
            {screenIndex === 0 && (
              <div className="space-y-4 animate-in fade-in">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-[var(--fg)] tracking-tight">
                    What brings you here?
                  </h2>
                  <p className="text-xs text-[var(--fg-muted)] mt-1">
                    Select up to 3 goals that describe what you want to achieve on Kwegatta.
                  </p>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-[var(--fg-muted)]">Tap to choose:</span>
                  <div className="flex items-center gap-2">
                    {selectionNotice && (
                      <span className="text-[var(--gold)] font-bold text-xs animate-in fade-in">
                        {selectionNotice}
                      </span>
                    )}
                    <span className="text-[var(--gold)] font-bold tabular-nums">
                      {selectedIntents.length} / 3 selected
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {INTENT_CHOICES.map(intent => {
                    const isSelected = selectedIntents.includes(intent);
                    return (
                      <button
                        key={intent}
                        type="button"
                        onClick={() => handleToggleIntent(intent)}
                        className={`p-3.5 rounded-xl border text-xs font-semibold text-left transition-all cursor-pointer flex items-center justify-between active:scale-[0.98] ${
                          isSelected
                            ? 'bg-[var(--gold)] text-[#0B1220] border-[var(--gold)] font-bold shadow-md'
                            : 'bg-[var(--bg-subtle)] text-[var(--fg)] border-[var(--card-border)] hover:border-[var(--gold)]'
                        }`}
                      >
                        <span className={isSelected ? 'text-[#0B1220] font-bold' : ''}>{intent}</span>
                        {isSelected ? (
                          <Check className="w-4 h-4 text-[#0B1220] stroke-[2.5] flex-shrink-0" />
                        ) : (
                          <span className="w-4 h-4 rounded-full border border-[var(--card-border)] flex-shrink-0" />
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={selectedIntents.length === 0}
                    onClick={handleNextScreen}
                    className="kw-btn kw-btn-gold text-xs sm:text-sm py-2.5 px-6 font-bold disabled:opacity-40 flex items-center gap-2 cursor-pointer active:scale-95 shadow-md"
                  >
                    <span>Continue</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Screen 2: Your role and stage */}
            {screenIndex === 1 && (
              <div className="space-y-5 animate-in fade-in">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-[var(--fg)] tracking-tight">
                    Your role and stage
                  </h2>
                  <p className="text-xs text-[var(--fg-muted)] mt-1">
                    Tell us what best describes your background and project status.
                  </p>
                </div>

                {/* Role selection (up to 2) */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--fg-muted)] font-medium">Your primary role(s):</span>
                    <div className="flex items-center gap-2">
                      {selectionNotice && (
                        <span className="text-[var(--gold)] font-bold text-xs animate-in fade-in">
                          {selectionNotice}
                        </span>
                      )}
                      <span className="text-[var(--gold)] font-bold tabular-nums">
                        {selectedRoles.length} / 2 selected
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ROLE_CHOICES.map(role => {
                      const isSelected = selectedRoles.includes(role);
                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() => handleToggleRole(role)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 ${
                            isSelected
                              ? 'bg-[var(--gold)] text-[#0B1220] border-[var(--gold)] font-bold shadow-sm'
                              : 'bg-[var(--bg-subtle)] text-[var(--fg)] border-[var(--card-border)] hover:border-[var(--gold)]'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5 text-[#0B1220] stroke-[2.5]" />}
                          <span className={isSelected ? 'text-[#0B1220] font-bold' : ''}>{role}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Stage selection (single pick) */}
                <div className="space-y-2 pt-1">
                  <span className="text-xs text-[var(--fg-muted)] font-medium block">
                    What stage are you at right now?
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {STAGE_CHOICES.map(stage => {
                      const isSelected = selectedStage === stage;
                      return (
                        <button
                          key={stage}
                          type="button"
                          onClick={() => setSelectedStage(stage)}
                          className={`p-3 rounded-xl text-xs font-medium border transition-all text-left cursor-pointer active:scale-[0.98] ${
                            isSelected
                              ? 'bg-[var(--teal)] text-[#0B1220] border-[var(--teal)] font-bold shadow-sm'
                              : 'bg-[var(--bg-subtle)] text-[var(--fg)] border-[var(--card-border)] hover:border-[var(--teal)]'
                          }`}
                        >
                          {stage}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={selectedRoles.length === 0 || !selectedStage}
                    onClick={handleNextScreen}
                    className="kw-btn kw-btn-gold text-xs sm:text-sm py-2.5 px-6 font-bold disabled:opacity-40 flex items-center gap-2 cursor-pointer active:scale-95 shadow-md"
                  >
                    <span>Continue</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Screen 3: Name, city, hours per week */}
            {screenIndex === 2 && (
              <div className="space-y-4 animate-in fade-in">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-[var(--fg)] tracking-tight">
                    Name, city, and hours per week
                  </h2>
                  <p className="text-xs text-[var(--fg-muted)] mt-1">
                    Basic details to introduce you to other collaborators.
                  </p>
                </div>

                {/* Name */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--fg)] block">
                    Your Name <span className="text-[var(--gold)]">*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Sandra Nabirye"
                    value={formData.name || ''}
                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full bg-[var(--bg-subtle)] border border-[var(--card-border)] focus:border-[var(--gold)] text-xs sm:text-sm text-[var(--fg)] rounded-xl px-3.5 py-2.5 focus:outline-none"
                  />
                </div>

                {/* City */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-semibold text-[var(--fg)] block">
                    City / Location
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {LOCATION_CHOICES.map(loc => {
                      const isSelected = formData.location === loc;
                      return (
                        <button
                          key={loc}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, location: loc }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[var(--gold)] text-[#0B1220] border-[var(--gold)] font-bold shadow-xs'
                              : 'bg-[var(--bg-subtle)] text-[var(--fg)] border-[var(--card-border)] hover:border-[var(--gold)]'
                          }`}
                        >
                          {loc}
                        </button>
                      );
                    })}
                    <input
                      type="text"
                      placeholder="Other location..."
                      value={!LOCATION_CHOICES.includes(formData.location || '') ? (formData.location || '') : ''}
                      onChange={e => setFormData(prev => ({ ...prev, location: e.target.value }))}
                      className="bg-[var(--bg-subtle)] border border-[var(--card-border)] rounded-lg px-2.5 py-1 text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--gold)]"
                    />
                  </div>
                </div>

                {/* Hours */}
                <div className="space-y-1.5 pt-1">
                  <label className="text-xs font-semibold text-[var(--fg)] block">
                    Available hours per week
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {HOURS_CHOICES.map(hrs => {
                      const isSelected = formData.hours_per_week === hrs;
                      return (
                        <button
                          key={hrs}
                          type="button"
                          onClick={() => setFormData(prev => ({ ...prev, hours_per_week: hrs }))}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-[var(--teal)] text-[#0B1220] border-[var(--teal)] font-bold shadow-xs'
                              : 'bg-[var(--bg-subtle)] text-[var(--fg)] border-[var(--card-border)] hover:border-[var(--teal)]'
                          }`}
                        >
                          {hrs}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button
                    type="button"
                    disabled={!formData.name?.trim()}
                    onClick={handleNextScreen}
                    className="kw-btn kw-btn-gold text-xs sm:text-sm py-2.5 px-6 font-bold disabled:opacity-40 flex items-center gap-2 cursor-pointer active:scale-95 shadow-md"
                  >
                    <span>Continue</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Screen 4: What you offer and what you need */}
            {screenIndex === 3 && (
              <div className="space-y-5 animate-in fade-in">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-[var(--fg)] tracking-tight">
                    What you offer and what you need
                  </h2>
                  <p className="text-xs text-[var(--fg-muted)] mt-1">
                    Pick suggested chips based on your role or type your own custom details.
                  </p>
                </div>

                {/* What you offer */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[var(--gold)] block">
                    What you offer (skills, domain knowledge, tools) <span className="text-[var(--gold)]">*</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {activeOffersSuggestions.map(sug => (
                      <button
                        key={sug}
                        type="button"
                        onClick={() => {
                          const current = formData.offers ? formData.offers + ', ' : '';
                          if (!formData.offers?.includes(sug)) {
                            setFormData(prev => ({ ...prev, offers: current + sug }));
                          }
                        }}
                        className="text-[13px] font-medium py-1 px-2.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--card-border)] hover:border-[var(--gold)] text-[var(--fg-muted)] hover:text-[var(--fg)] active:scale-95 transition-all cursor-pointer"
                      >
                        + {sug}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={2}
                    placeholder="e.g. React &amp; Tailwind development, retail distribution knowledge..."
                    value={formData.offers || ''}
                    onChange={e => setFormData(prev => ({ ...prev, offers: e.target.value }))}
                    className="w-full bg-[var(--bg-subtle)] border border-[var(--card-border)] focus:border-[var(--gold)] text-xs sm:text-sm text-[var(--fg)] rounded-xl p-3 focus:outline-none resize-none"
                  />
                </div>

                {/* What you need */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[var(--teal)] block">
                    What you need (co-founders, builders, mentors, data) <span className="text-[var(--teal)]">*</span>
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {SUGGESTED_NEEDS.map(need => (
                      <button
                        key={need}
                        type="button"
                        onClick={() => {
                          const current = formData.needs ? formData.needs + ', ' : '';
                          if (!formData.needs?.includes(need)) {
                            setFormData(prev => ({ ...prev, needs: current + need }));
                          }
                        }}
                        className="text-[13px] font-medium py-1 px-2.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--card-border)] hover:border-[var(--teal)] text-[var(--fg-muted)] hover:text-[var(--fg)] active:scale-95 transition-all cursor-pointer"
                      >
                        + {need}
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={2}
                    placeholder="e.g. Technical partner to build mobile app, financial strategist..."
                    value={formData.needs || ''}
                    onChange={e => setFormData(prev => ({ ...prev, needs: e.target.value }))}
                    className="w-full bg-[var(--bg-subtle)] border border-[var(--card-border)] focus:border-[var(--teal)] text-xs sm:text-sm text-[var(--fg)] rounded-xl p-3 focus:outline-none resize-none"
                  />
                </div>

                {/* Bottom Action Bar: Finish now OR Continue */}
                <div className="flex items-center justify-between pt-3 border-t border-[var(--card-border)]">
                  <button
                    type="button"
                    disabled={!formData.offers?.trim() || !formData.needs?.trim() || isProcessing}
                    onClick={handleFinishNow}
                    className="kw-btn kw-btn-ghost text-xs sm:text-sm py-2.5 px-4 font-semibold text-[var(--gold)] border border-[var(--gold)]/40 hover:bg-[var(--gold-subtle)] rounded-xl flex items-center gap-1.5 cursor-pointer active:scale-95 disabled:opacity-40"
                  >
                    <CheckCheck className="w-4 h-4" />
                    <span>Finish now</span>
                  </button>

                  <button
                    type="button"
                    disabled={!formData.offers?.trim() || !formData.needs?.trim()}
                    onClick={handleNextScreen}
                    className="kw-btn kw-btn-gold text-xs sm:text-sm py-2.5 px-6 font-bold flex items-center gap-2 cursor-pointer active:scale-95 shadow-md disabled:opacity-40"
                  >
                    <span>Continue</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Screen 5: What you can teach and want to learn */}
            {screenIndex === 4 && (
              <div className="space-y-5 animate-in fade-in">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-[var(--fg)] tracking-tight">
                    What you can teach and want to learn
                  </h2>
                  <p className="text-xs text-[var(--fg-muted)] mt-1">
                    Optional peer learning skills to connect in the Learn tab.
                  </p>
                </div>

                {/* Teaches */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[var(--teal)] block">
                    What can you teach?
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {SUGGESTED_TEACHES.map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          const current = formData.teaches ? formData.teaches + ', ' : '';
                          if (!formData.teaches?.includes(s)) {
                            setFormData(prev => ({ ...prev, teaches: current + s }));
                          }
                        }}
                        className="text-[13px] font-medium py-1 px-2 rounded bg-[var(--bg-subtle)] border border-[var(--card-border)] hover:border-[var(--teal)] text-[var(--fg-muted)] cursor-pointer"
                      >
                        + {s}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. Retail business strategy, Figma design, Pitching..."
                    value={formData.teaches || ''}
                    onChange={e => setFormData(prev => ({ ...prev, teaches: e.target.value }))}
                    className="w-full bg-[var(--bg-subtle)] border border-[var(--card-border)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--teal)]"
                  />
                </div>

                {/* Learns */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-[var(--gold)] block">
                    What do you want to learn?
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {SUGGESTED_LEARNS.map(s => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => {
                          const current = formData.learns ? formData.learns + ', ' : '';
                          if (!formData.learns?.includes(s)) {
                            setFormData(prev => ({ ...prev, learns: current + s }));
                          }
                        }}
                        className="text-[13px] font-medium py-1 px-2 rounded bg-[var(--bg-subtle)] border border-[var(--card-border)] hover:border-[var(--gold)] text-[var(--fg-muted)] cursor-pointer"
                      >
                        + {s}
                      </button>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. React &amp; modern TypeScript, AI prompt engineering..."
                    value={formData.learns || ''}
                    onChange={e => setFormData(prev => ({ ...prev, learns: e.target.value }))}
                    className="w-full bg-[var(--bg-subtle)] border border-[var(--card-border)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--gold)]"
                  />
                </div>

                {/* Bottom Action Bar: Finish now OR Continue */}
                <div className="flex items-center justify-between pt-3 border-t border-[var(--card-border)]">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleFinishNow}
                    className="kw-btn kw-btn-ghost text-xs sm:text-sm py-2.5 px-4 font-semibold text-[var(--gold)] border border-[var(--gold)]/40 hover:bg-[var(--gold-subtle)] rounded-xl flex items-center gap-1.5 cursor-pointer active:scale-95"
                  >
                    <CheckCheck className="w-4 h-4" />
                    <span>Finish now</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleNextScreen}
                    className="kw-btn kw-btn-gold text-xs sm:text-sm py-2.5 px-6 font-bold flex items-center gap-2 cursor-pointer active:scale-95 shadow-md"
                  >
                    <span>Continue</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Screen 6: Links, WhatsApp, photo */}
            {screenIndex === 5 && (
              <div className="space-y-5 animate-in fade-in">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-[var(--fg)] tracking-tight">
                    Links, WhatsApp, and photo
                  </h2>
                  <p className="text-xs text-[var(--fg-muted)] mt-1">
                    Optional contact methods and avatar to complete your profile.
                  </p>
                </div>

                {/* Profile Link or GitHub */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--fg)] block">
                    GitHub username, LinkedIn or Website
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. github.com/username or linkedin.com/in/name"
                    value={formData.github || formData.linkedin || formData.website || ''}
                    onChange={e => {
                      const val = e.target.value.trim();
                      if (/github\.com/i.test(val) || (selectedRoles.includes('Developer') && !val.includes('.'))) {
                        const clean = val.replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
                        setFormData(prev => ({ ...prev, github: clean }));
                      } else if (/linkedin\.com/i.test(val)) {
                        setFormData(prev => ({ ...prev, linkedin: val }));
                      } else {
                        setFormData(prev => ({ ...prev, website: val }));
                      }
                    }}
                    className="w-full bg-[var(--bg-subtle)] border border-[var(--card-border)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--gold)]"
                  />
                </div>

                {/* WhatsApp */}
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-[var(--fg)] block">
                    WhatsApp phone number
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. +256 700 000000"
                    value={formData.whatsapp || ''}
                    onChange={e => setFormData(prev => ({ ...prev, whatsapp: e.target.value }))}
                    className="w-full bg-[var(--bg-subtle)] border border-[var(--card-border)] rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--gold)]"
                  />
                  <label className="flex items-center gap-2 pt-1 text-xs text-[var(--fg-muted)] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={whatsappVisible}
                      onChange={e => setWhatsappVisible(e.target.checked)}
                      className="rounded border-[var(--card-border)] text-[var(--gold)] focus:ring-[var(--gold)]"
                    />
                    <span>Visible to other signed-in members for one-tap WhatsApp connect</span>
                  </label>
                </div>

                {/* Photo & Selfie */}
                <div className="space-y-2 pt-1">
                  <label className="text-xs font-semibold text-[var(--fg)] block">
                    Profile Picture / Selfie
                  </label>
                  {photoPreviewUrl && (
                    <div className="flex items-center gap-4 p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)]">
                      <div className="relative w-14 h-14 rounded-full overflow-hidden border-2 border-[var(--gold)] flex-shrink-0 bg-black">
                        <img
                          src={photoPreviewUrl}
                          alt="Preview"
                          className="w-full h-full object-cover"
                        />
                        {photoStatus === 'processing' && (
                          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                            <div className="w-4 h-4 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                      </div>
                      <div className="space-y-0.5 min-w-0 flex-1">
                        {photoStatus === 'saved' && (
                          <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Photo ready</span>
                          </div>
                        )}
                        {photoStatus === 'error' && (
                          <div className="text-xs font-semibold text-red-400 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" />
                            <span>{photoErrorMsg}</span>
                          </div>
                        )}
                        <p className="text-[13px] text-[var(--fg-muted)] truncate">
                          Will appear on your match cards and live wall.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => selfieInputRef.current?.click()}
                      className="kw-btn kw-btn-gold text-xs py-2 px-3.5 cursor-pointer active:scale-95 flex items-center gap-1.5"
                    >
                      <Camera className="w-3.5 h-3.5" />
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
                      className="kw-btn text-xs py-2 px-3.5 cursor-pointer active:scale-95 flex items-center gap-1.5 bg-[var(--bg-subtle)] text-[var(--fg)] border border-[var(--card-border)]"
                    >
                      <Upload className="w-3.5 h-3.5 text-[var(--fg-muted)]" />
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
                </div>

                {/* Final Save CTA */}
                <div className="flex justify-end pt-3 border-t border-[var(--card-border)]">
                  <button
                    type="button"
                    disabled={isProcessing}
                    onClick={handleFinishNow}
                    className="kw-btn kw-btn-gold text-xs sm:text-sm py-2.5 px-7 font-bold flex items-center gap-2 cursor-pointer active:scale-95 shadow-lg disabled:opacity-40"
                  >
                    {isProcessing ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Saving profile...</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        <span>Save &amp; discover matches</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error notification */}
        {errorState && (
          <div className="p-3.5 rounded-xl bg-[var(--danger-subtle)] border border-red-500/30 text-xs text-[var(--danger)] flex items-center justify-between gap-3 animate-in fade-in">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorState}</span>
            </div>
            <button
              onClick={() => handleFinishNow()}
              className="kw-btn text-xs py-1 px-2.5 bg-red-600 text-white border-0 hover:bg-red-700 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Try again</span>
            </button>
          </div>
        )}
      </div>

      {/* Sign-in Modal: shown before question 1 or before saving if closed */}
      {showAuthModal && (
        <AuthModal
          isOpen={showAuthModal}
          onClose={() => setShowAuthModal(false)}
          onSuccess={handleAuthSuccess}
          title={authModalPurpose === 'before_save' ? 'Sign in to save your profile' : 'Sign in to Kwegatta'}
          subtitle={
            authModalPurpose === 'before_save'
              ? 'Sign in with Google in one tap to save your profile and discover your matches.'
              : 'Sign in with Google in one tap before answering questions, or continue now and save when finished.'
          }
        />
      )}
    </div>
  );
};
