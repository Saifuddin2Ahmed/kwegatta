import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Camera, Upload, ArrowRight, RefreshCw, CheckCircle2, Clock, Check, AlertCircle, RotateCcw } from 'lucide-react';
import { Profile } from '../types';
import { buildProfileWithGemma, fetchGitHubData, db, APP_NAME } from '../services/api';
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

const STEP_SUGGESTIONS: Record<string, string[]> = {
  offers: [
    'Flutter mobile apps & Dart',
    'React, TypeScript & Tailwind',
    'UI/UX design in Figma',
    'Financial modeling & pitch decks',
    'Python data science & REST APIs',
    'Marketing, sales & customer discovery'
  ],
  needs: [
    'Technical co-founder (Flutter/React)',
    'UI/UX designer (Figma)',
    'Business strategist & marketing',
    'Backend engineer (APIs & database)',
    'Domain expert in agriculture / fintech'
  ],
  teaches: [
    'Flutter mobile development',
    'Figma UI design & auto-layout',
    'Financial accounting & budgets',
    'Python REST APIs'
  ],
  learns: [
    'Flutter app architecture',
    'React & modern TypeScript',
    'Grant funding proposals',
    'AI prompt engineering'
  ]
};

export const OnboardingChat: React.FC<OnboardingChatProps> = ({ onCompleted, onCancel }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [formData, setFormData] = useState<Partial<Profile>>({});
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isBotTyping, setIsBotTyping] = useState(false);
  const [whatsappVisible, setWhatsappVisible] = useState(true);
  const [profileDraft, setProfileDraft] = useState<any | null>(null);
  const [errorState, setErrorState] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const STEPS = [
    {
      key: 'name',
      label: 'Name',
      prompt: `Hi! I'm the ${APP_NAME} AI guide running on Gemma 4 (open-weight). I'll help you find builders, mentors and partners at Hack Day Kampala x MUBS. What is your full name?`,
      placeholder: 'e.g. Sandra Nabirye',
      required: true
    },
    {
      key: 'github',
      label: 'GitHub',
      prompt: (d: Partial<Profile>) =>
        `Pleasure to meet you, ${d.name?.split(' ')[0]}! What is your GitHub username or profile link? I'll automatically read your public repos and languages.`,
      placeholder: 'e.g. sandra-dev or github.com/sandra-dev',
      required: false
    },
    {
      key: 'offers',
      label: 'Offers',
      prompt: 'What skills, resources, or knowledge do you OFFER a team? (e.g. Flutter mobile apps, financial modeling, UI design in Figma, business validation)',
      placeholder: 'e.g. Flutter apps, UI design, market research',
      required: true
    },
    {
      key: 'needs',
      label: 'Needs',
      prompt: 'What do you NEED most right now? (e.g. a technical co-founder, a mobile developer, marketing help, pricing advice)',
      placeholder: 'e.g. a developer to build our hackathon demo',
      required: true
    },
    {
      key: 'teaches',
      label: 'Teaches',
      prompt: 'What skill or subject can you TEACH someone as a peer mentor?',
      placeholder: 'e.g. Dart & Flutter basics, pitch deck design, accounting',
      required: false
    },
    {
      key: 'learns',
      label: 'Learns',
      prompt: 'What skill or topic do you WANT TO LEARN today? We will find you a study partner.',
      placeholder: 'e.g. Python data analysis, Figma auto-layout, grant writing',
      required: false
    },
    {
      key: 'whatsapp',
      label: 'WhatsApp',
      prompt: 'What is your WhatsApp phone number? Your WhatsApp number will be visible to other members so you can connect in one tap.',
      placeholder: 'e.g. +256 700 000000',
      required: false
    },
    {
      key: 'avatar',
      label: 'Photo',
      prompt: 'Finally, add a profile picture or selfie so teammates can recognize you in the room.',
      placeholder: '',
      required: false,
      isPhoto: true
    }
  ];

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
      setIsBotTyping(true);
      const timer = setTimeout(() => {
        setIsBotTyping(false);
        addMessage('bot', STEPS[0].prompt as string);
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing, isBotTyping]);

  useEffect(() => {
    if (!profileDraft && !STEPS[stepIndex]?.isPhoto) {
      inputRef.current?.focus();
    }
  }, [stepIndex, profileDraft]);

  const getPersonalizedReaction = (key: string, value: string, d: Partial<Profile>): string => {
    const firstName = d.name?.split(' ')[0] || 'there';
    switch (key) {
      case 'name':
        return `Great to meet you, ${firstName}! Let's find your dream team.`;
      case 'github':
        return `GitHub saved. Sharing your public repositories helps other builders discover your strengths.`;
      case 'offers':
        return `"${value.slice(0, 45)}${value.length > 45 ? '...' : ''}" — strong offer. Builders in the room need this expertise.`;
      case 'needs':
        return `Understood. Looking for "${value.slice(0, 45)}${value.length > 45 ? '...' : ''}" — Gemma 4 will pair you with complementary partners.`;
      case 'teaches':
        return `Teaching "${value.slice(0, 40)}" makes you a valuable peer mentor today!`;
      case 'learns':
        return `Learning "${value.slice(0, 40)}" — we'll pair you with a study partner in the Learn tab.`;
      case 'whatsapp':
        return `WhatsApp saved! Other signed-in members can see it on your profile and connect in one tap.`;
      default:
        return 'Got it!';
    }
  };

  const handleNextStep = async (value: string) => {
    const currentStep = STEPS[stepIndex];
    if (currentStep.required && !value.trim()) return;

    setErrorState(null);
    const trimmed = value.trim();
    if (trimmed) {
      addMessage('user', trimmed);
    } else {
      addMessage('user', 'Skipped');
    }
    setInputText('');

    const updatedData: Partial<Profile> = {
      ...formData,
      [currentStep.key]: trimmed
    };

    if (currentStep.key === 'whatsapp') {
      updatedData.hide_whatsapp = !whatsappVisible;
    }

    // If step was GitHub, automatically enrich with GitHub API
    if (currentStep.key === 'github' && trimmed) {
      setIsProcessing(true);
      const username = trimmed.replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, '');
      updatedData.github = username;
      try {
        const gh = await fetchGitHubData(username);
        if (gh) {
          updatedData.gh = gh;
        }
      } catch (e) {
        // Continue silently
      }
      setIsProcessing(false);
    }

    setFormData(updatedData);

    // Show bot reaction first, then ask next question
    if (trimmed) {
      const reaction = getPersonalizedReaction(currentStep.key, trimmed, updatedData);
      setIsBotTyping(true);
      await new Promise(r => setTimeout(r, 400));
      setIsBotTyping(false);
      addMessage('bot', reaction);
    }

    const nextIdx = stepIndex + 1;
    if (nextIdx < STEPS.length) {
      setStepIndex(nextIdx);
      const nextPrompt = STEPS[nextIdx].prompt;
      const promptText = typeof nextPrompt === 'function' ? nextPrompt(updatedData) : nextPrompt;
      setIsBotTyping(true);
      await new Promise(r => setTimeout(r, 400));
      setIsBotTyping(false);
      addMessage('bot', promptText);
    } else {
      // Completed all steps: invoke Gemma 4 to synthesize profile
      await generateGemmaProfile(updatedData);
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsProcessing(true);
      const resized = await resizeImageFile(file);
      const updated = { ...formData, avatar: resized };
      setFormData(updated);
      addMessage('user', 'Uploaded photo');
      await generateGemmaProfile(updated);
    } catch (err: any) {
      addMessage('bot', 'Could not process that image file. Continuing with default avatar.');
      await generateGemmaProfile(formData);
    } finally {
      setIsProcessing(false);
    }
  };

  const generateGemmaProfile = async (data: Partial<Profile>, instruction?: string) => {
    setIsProcessing(true);
    setErrorState(null);
    addMessage('bot', 'Gemma 4 is synthesizing your profile headline, tags and role...');

    try {
      const draft = await buildProfileWithGemma(data, instruction);
      setProfileDraft(draft);
      addMessage(
        'bot',
        `Here is your profile preview:`,
        <div className="kw-card p-4 sm:p-5 mt-3 bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-xl space-y-3.5 animate-in fade-in zoom-in-95">
          <div className="flex items-center gap-3.5">
            <Avatar
              profile={{ name: data.name || '', avatar: data.avatar } as any}
              className="w-12 h-12 rounded-full ring-2 ring-[var(--gold)]"
            />
            <div>
              <div className="font-bold text-sm text-[var(--fg)]">
                {data.name}
              </div>
              <div className="text-xs text-[var(--gold)] font-semibold mt-0.5">
                {draft.headline}
              </div>
              <span className="kw-badge kw-badge-teal text-[10px] mt-1.5 font-medium">
                {draft.role}
              </span>
            </div>
          </div>
          <p className="text-xs text-[var(--fg)] leading-relaxed">
            {draft.bio}
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            {draft.tags?.map((t: string) => (
              <span
                key={t}
                className="kw-badge kw-badge-gold text-[10px]"
              >
                #{t}
              </span>
            ))}
          </div>
        </div>
      );
    } catch (err: any) {
      setErrorState('Could not synthesize AI profile summary at this moment. You can still proceed with your answers.');
      addMessage('bot', 'Your profile details are saved! You can proceed to matches or retry profile synthesis.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleRewrite = () => {
    if (!formData) return;
    setProfileDraft(null);
    generateGemmaProfile(formData, 'Please write an alternative version with fresh phrasing.');
  };

  const handleSaveProfile = async () => {
    if (!formData.name) return;
    setIsProcessing(true);
    setErrorState(null);

    try {
      const fullProfile: Profile = {
        id: 'user-' + Date.now(),
        name: formData.name,
        role: profileDraft?.role || 'builder',
        headline: profileDraft?.headline || formData.offers?.slice(0, 60) || 'Builder',
        bio: profileDraft?.bio || `I offer ${formData.offers}. I am looking for ${formData.needs}.`,
        offers: formData.offers || '',
        needs: formData.needs || '',
        teaches: formData.teaches || '',
        learns: formData.learns || '',
        whatsapp: formData.whatsapp || '',
        hide_whatsapp: formData.hide_whatsapp ?? false,
        github: formData.github || '',
        linkedin: formData.linkedin || '',
        avatar: formData.avatar || (formData.github ? `https://github.com/${formData.github}.png` : ''),
        tags: profileDraft?.tags || ['builder', 'hackathon'],
        skills: profileDraft?.skills || profileDraft?.tags || ['builder', 'hackathon'],
        created_at: new Date().toISOString()
      };

      await db.insert('profiles', fullProfile);
      localStorage.setItem('kw_me', fullProfile.id);
      localStorage.setItem('kwegatta_current_profile', JSON.stringify(fullProfile));
      onCompleted(fullProfile);
    } catch (err: any) {
      setErrorState('Something went wrong while saving your profile. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto pt-2 pb-10 space-y-4 animate-in fade-in">
      
      {/* Modern Profile Assembly Progression Tracker */}
      <div className="kw-card p-4 bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-sm space-y-3">
        <div className="flex items-center justify-between text-xs text-[var(--fg-muted)]">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[var(--gold)]" />
            <span className="font-semibold text-xs text-[var(--fg)]">Profile Assembly</span>
            <span className="text-[var(--fg-subtle)] text-[11px]">· Step {Math.min(stepIndex + 1, STEPS.length)} of {STEPS.length}</span>
          </div>
          <div className="flex items-center gap-1.5 text-[var(--gold)] font-medium text-[11px] tabular-nums">
            <Clock className="w-3.5 h-3.5" />
            <span>about {secondsLeft}s left</span>
          </div>
        </div>

        {/* Horizontal Stepper */}
        <div className="grid grid-cols-8 gap-1.5 sm:gap-2 pt-1">
          {STEPS.map((step, idx) => {
            const isDone = idx < stepIndex;
            const isCurrent = idx === stepIndex;

            return (
              <div key={step.key} className="flex flex-col items-center gap-1">
                {/* Step indicator bar/pill */}
                <div
                  className={`w-full h-1.5 rounded-full transition-all duration-300 ${
                    isDone
                      ? 'bg-[var(--gold)]'
                      : isCurrent
                      ? 'bg-[var(--gold)] shadow-[0_0_8px_rgba(245,183,0,0.5)] animate-pulse'
                      : 'bg-[var(--bg-subtle)] border border-[var(--card-border)]'
                  }`}
                  title={`${step.label}: ${isDone ? 'Completed' : isCurrent ? 'Current step' : 'Upcoming'}`}
                />
                <span
                  className={`text-[10px] font-medium hidden sm:block truncate w-full text-center transition-colors ${
                    isCurrent
                      ? 'text-[var(--gold)] font-bold'
                      : isDone
                      ? 'text-[var(--fg)]'
                      : 'text-[var(--fg-subtle)]'
                  }`}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Production-Grade Conversational Onboarding Assistant */}
      <div className="kw-card bg-[var(--card)] border border-[var(--card-border)] rounded-2xl overflow-hidden shadow-xl transition-all">
        
        {/* Chat History & Interactive Log */}
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

          {/* Typing Indicator */}
          {isBotTyping && (
            <div className="flex gap-3 items-center animate-in fade-in duration-200">
              <div className="w-8 h-8 rounded-full bg-[var(--gold-subtle)] text-[var(--gold)] grid place-items-center flex-shrink-0 border border-[var(--card-border)]">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="py-2.5 px-4 rounded-2xl bg-[var(--card)] border border-[var(--card-border)] text-xs text-[var(--fg-muted)] flex items-center gap-1.5 shadow-sm">
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
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
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
              </div>
            </div>
          )}

          {/* Production Error Banner with Retry */}
          {errorState && (
            <div className="p-3.5 rounded-xl bg-[var(--danger-subtle)] border border-red-500/30 text-xs text-[var(--danger)] flex items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{errorState}</span>
              </div>
              <button
                onClick={() => {
                  setErrorState(null);
                  if (profileDraft) handleSaveProfile();
                  else if (stepIndex >= STEPS.length - 1) generateGemmaProfile(formData);
                }}
                className="kw-btn text-xs py-1 px-2.5 bg-red-600 text-white border-0 hover:bg-red-700 flex items-center gap-1"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Try again</span>
              </button>
            </div>
          )}

          <div ref={chatBottomRef} />
        </div>

        {/* Modern Chat Composer & Action Bar */}
        <div className="p-4 sm:p-5 bg-[var(--card)] border-t border-[var(--card-border)] space-y-3">
          {profileDraft ? (
            <div className="flex flex-wrap gap-2.5 justify-end">
              <button
                onClick={handleRewrite}
                disabled={isProcessing}
                className="kw-btn kw-btn-ghost text-xs py-2 px-3.5 active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Rewrite with Gemma</span>
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={isProcessing}
                className="kw-btn kw-btn-gold text-xs py-2 px-5 font-semibold active:scale-95 shadow-md"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Save & Find My Matches</span>
              </button>
            </div>
          ) : STEPS[stepIndex]?.isPhoto ? (
            <div className="flex flex-wrap gap-2.5 items-center justify-between">
              <div className="flex gap-2">
                <label className="kw-btn kw-btn-gold text-xs py-2 px-4 cursor-pointer active:scale-95">
                  <Camera className="w-4 h-4" />
                  <span>Take selfie</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="user"
                    onChange={handlePhotoUpload}
                    hidden
                  />
                </label>
                <label className="kw-btn text-xs py-2 px-4 cursor-pointer active:scale-95">
                  <Upload className="w-4 h-4 text-[var(--fg-muted)]" />
                  <span>Upload photo</span>
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} hidden />
                </label>
              </div>
              <button
                onClick={() => generateGemmaProfile(formData)}
                className="kw-btn kw-btn-ghost text-xs py-2 px-3"
              >
                Skip photo
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {/* Contextual Suggestion Chips */}
              {STEPS[stepIndex] && STEP_SUGGESTIONS[STEPS[stepIndex].key] && (
                <div className="flex flex-wrap gap-1.5">
                  {STEP_SUGGESTIONS[STEPS[stepIndex].key].map(sug => (
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
                  handleNextStep(inputText);
                }}
                className="flex gap-2 items-center"
              >
                <div className="relative flex-1">
                  <input
                    ref={inputRef}
                    type="text"
                    placeholder={STEPS[stepIndex]?.placeholder || 'Type your response...'}
                    value={inputText}
                    onChange={e => setInputText(e.target.value)}
                    disabled={isProcessing || isBotTyping}
                    className="w-full bg-[var(--bg-subtle)] border border-[var(--card-border)] focus:border-[var(--gold)] focus:bg-[var(--card)] text-xs sm:text-sm text-[var(--fg)] placeholder:text-[var(--fg-subtle)] rounded-xl px-3.5 py-2.5 transition-all focus:outline-none focus:ring-2 focus:ring-[var(--gold-subtle)]"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isProcessing || isBotTyping || (STEPS[stepIndex]?.required && !inputText.trim())}
                  className="kw-btn kw-btn-gold text-xs sm:text-sm px-4 py-2.5 font-semibold active:scale-95 shadow-sm flex items-center gap-1.5"
                >
                  <span>Send</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                {!STEPS[stepIndex]?.required && (
                  <button
                    type="button"
                    onClick={() => handleNextStep('')}
                    disabled={isProcessing || isBotTyping}
                    className="kw-btn kw-btn-ghost text-xs py-2.5 px-3"
                  >
                    Skip
                  </button>
                )}
              </form>

              {/* WhatsApp Privacy Notice & Toggle */}
              {STEPS[stepIndex]?.key === 'whatsapp' && (
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
