import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Camera, Upload, ArrowRight, RefreshCw, CheckCircle2 } from 'lucide-react';
import { Profile } from '../types';
import { buildProfileWithGemma, fetchGitHubData, db, APP_NAME } from '../services/api';
import { resizeImageFile, getAvatarUrl } from '../utils';

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
    'Market research & pitch decks',
    'Financial modeling & budgets',
    'Python data scraping & APIs'
  ],
  needs: [
    'Technical co-founder',
    'Mobile developer (Flutter)',
    'UI/UX designer (Figma)',
    'Business & sales strategist',
    'First customers & marketing'
  ],
  teaches: [
    'Flutter & Firebase',
    'Figma UI components',
    'Financial cash-flow models',
    'Python REST APIs'
  ],
  learns: [
    'Flutter app development',
    'React & TypeScript',
    'Grant funding proposals',
    'Machine learning basics'
  ]
};

export const OnboardingChat: React.FC<OnboardingChatProps> = ({ onCompleted, onCancel }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [formData, setFormData] = useState<Partial<Profile>>({});
  const [inputText, setInputText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [profileDraft, setProfileDraft] = useState<any | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const chatBottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const STEPS = [
    {
      key: 'name',
      prompt: `Hi! I'm the ${APP_NAME} AI guide running on Gemma 4 (open-weight). I'll help you find builders, mentors and partners at Hack Day Kampala x MUBS. What is your full name?`,
      placeholder: 'e.g. Sandra Nabirye',
      required: true
    },
    {
      key: 'github',
      prompt: (d: Partial<Profile>) =>
        `Pleasure to meet you, ${d.name?.split(' ')[0]}! What is your GitHub username or profile link? I'll automatically read your public repos and languages.`,
      placeholder: 'e.g. sandra-dev or github.com/sandra-dev',
      required: false
    },
    {
      key: 'linkedin',
      prompt: 'Share your LinkedIn profile link so teammates can view your background.',
      placeholder: 'https://linkedin.com/in/...',
      required: false
    },
    {
      key: 'offers',
      prompt: 'What skills, resources, or knowledge do you OFFER a team? (e.g. Flutter mobile apps, financial modeling, UI design in Figma, farmer connections)',
      placeholder: 'e.g. React & TypeScript, UI design, business validation',
      required: true
    },
    {
      key: 'needs',
      prompt: 'What do you NEED most right now? (e.g. a technical co-founder, a designer, marketing help, pricing advice)',
      placeholder: 'e.g. a developer to build our hackathon demo',
      required: true
    },
    {
      key: 'teaches',
      prompt: 'What skill or subject can you TEACH someone as a peer mentor?',
      placeholder: 'e.g. Dart & Flutter basics, pitch deck design, accounting',
      required: false
    },
    {
      key: 'learns',
      prompt: 'What skill or topic do you WANT TO LEARN today? We will find you a study partner.',
      placeholder: 'e.g. Python data analysis, Figma auto-layout, grant writing',
      required: false
    },
    {
      key: 'whatsapp',
      prompt: 'Your WhatsApp phone number. (Note: WhatsApp numbers are visible on your profile so matches can message you directly with one tap).',
      placeholder: 'e.g. 0772 123456 or +256772123456',
      required: false
    },
    {
      key: 'photo',
      prompt: 'Finally, snap a selfie with your camera or upload a photo for your profile (or skip to use your GitHub avatar / initials).',
      isPhoto: true,
      required: false
    }
  ];

  // Initialize first greeting
  useEffect(() => {
    setMessages([
      {
        id: 'msg-0',
        sender: 'bot',
        text: STEPS[0].prompt as string
      }
    ]);
  }, []);

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isProcessing]);

  useEffect(() => {
    if (!STEPS[stepIndex]?.isPhoto && !profileDraft) {
      inputRef.current?.focus();
    }
  }, [stepIndex, profileDraft]);

  const addMessage = (sender: 'bot' | 'user', text: string, component?: React.ReactNode) => {
    setMessages(prev => [...prev, { id: 'msg-' + Date.now() + Math.random(), sender, text, component }]);
  };

  const handleNextStep = async (userAnswer: string) => {
    const currentStep = STEPS[stepIndex];
    if (!currentStep) return;

    const trimmed = userAnswer.trim();
    if (currentStep.required && !trimmed) return;

    addMessage('user', trimmed || 'Skip');
    setInputText('');

    const updatedData: Partial<Profile> = { ...formData };

    if (currentStep.key === 'name') updatedData.name = trimmed;
    if (currentStep.key === 'offers') updatedData.offers = trimmed;
    if (currentStep.key === 'needs') updatedData.needs = trimmed;
    if (currentStep.key === 'teaches') updatedData.teaches = trimmed;
    if (currentStep.key === 'learns') updatedData.learns = trimmed;
    if (currentStep.key === 'whatsapp') {
      updatedData.whatsapp = trimmed.replace(/[^\d+]/g, '');
    }
    if (currentStep.key === 'linkedin') {
      if (trimmed && /linkedin\.com/i.test(trimmed)) {
        updatedData.linkedin = trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
      }
    }

    if (currentStep.key === 'github' && trimmed) {
      setIsProcessing(true);
      addMessage('bot', 'Checking GitHub repositories...');
      const gh = await fetchGitHubData(trimmed);
      setIsProcessing(false);

      if (gh) {
        updatedData.github = gh.login;
        updatedData.gh = gh;
        if (gh.repos != null) {
          addMessage(
            'bot',
            `Found @${gh.login}: ${gh.repos} public repos${gh.langs?.length ? ', primary languages: ' + gh.langs.slice(0, 3).join(', ') : ''}.`
          );
        } else {
          addMessage('bot', `Saved GitHub username @${gh.login}.`);
        }
      } else {
        addMessage('bot', 'Could not locate that GitHub username, continuing smoothly without it.');
      }
    }

    setFormData(updatedData);

    const nextIdx = stepIndex + 1;
    if (nextIdx < STEPS.length) {
      setStepIndex(nextIdx);
      const nextPrompt = STEPS[nextIdx].prompt;
      const promptText = typeof nextPrompt === 'function' ? nextPrompt(updatedData) : nextPrompt;
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
      addMessage('user', 'Uploaded profile photo');
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
    addMessage('bot', 'Gemma 4 is synthesizing your profile headline, tags and role...');

    try {
      const draft = await buildProfileWithGemma(data, instruction);
      setProfileDraft(draft);
      addMessage(
        'bot',
        `Here is your profile preview (crafted with ${draft.ai ? 'open-weight Gemma 4' : 'keyword rules'}):`,
        <div className="primer-box p-3 mt-2 bg-[var(--bg)] border border-[var(--border)]">
          <div className="flex items-center gap-3">
            <img
              src={data.avatar || (data.github ? `https://github.com/${data.github}.png` : '') || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="%234493f8"/></svg>'}
              alt="Avatar"
              className="w-12 h-12 rounded-full object-cover border border-[var(--border)]"
            />
            <div>
              <div className="font-semibold text-sm">{data.name}</div>
              <div className="text-xs text-[var(--muted)]">{draft.headline}</div>
              <span className="primer-label primer-label-blue text-[11px] mt-1">{draft.role}</span>
            </div>
          </div>
          <p className="text-xs mt-2.5 text-[var(--fg)] leading-relaxed">{draft.bio}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {draft.tags?.map((t: string) => (
              <span key={t} className="primer-tag text-[11px]">
                #{t}
              </span>
            ))}
          </div>
        </div>
      );
    } catch (err: any) {
      addMessage('bot', 'Profile generation error. You can still save and edit your profile manually.');
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
        tags: profileDraft?.tags || [],
        skills: profileDraft?.skills || [],
        github: formData.github || '',
        linkedin: formData.linkedin || '',
        whatsapp: formData.whatsapp || '',
        avatar: formData.avatar || '',
        status: 'Open to projects',
        is_demo: false,
        created_at: new Date().toISOString(),
        gh: formData.gh || null
      };

      const saved = await db.insert<Profile>('profiles', fullProfile);
      localStorage.setItem('kw_me', saved.id);

      // Create welcome notification
      await db.insert('notifications', {
        to_id: saved.id,
        type: 'welcome',
        body: `Welcome to ${APP_NAME}, ${saved.name.split(' ')[0]}! Open your profile to scan your personal QR code or explore matches.`,
        read: false,
        created_at: new Date().toISOString()
      });

      onCompleted(saved);
    } catch (err: any) {
      console.error('Failed to save profile:', err);
      addMessage('bot', 'Error saving profile. Please check connection and try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      <div className="mb-4">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[var(--accent)]" />
          <span>Join {APP_NAME}</span>
        </h1>
        <p className="text-xs text-[var(--muted)] mt-1">
          Takes under 60 seconds on a phone. Say what you need and offer; Gemma 4 matches you with collaborators.
        </p>
      </div>

      <div className="primer-box bg-[var(--subtle)] overflow-hidden shadow-sm">
        {/* Chat log */}
        <div className="p-4 space-y-3 min-h-[320px] max-h-[58vh] overflow-y-auto">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={`flex gap-2.5 max-w-[92%] ${
                msg.sender === 'user' ? 'ml-auto flex-row-reverse' : ''
              }`}
            >
              {msg.sender === 'bot' && (
                <div className="w-7 h-7 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] grid place-items-center flex-shrink-0 mt-0.5 border border-[var(--border)]">
                  <Sparkles className="w-3.5 h-3.5" />
                </div>
              )}
              <div
                className={`p-3 rounded-md text-xs leading-relaxed border ${
                  msg.sender === 'user'
                    ? 'bg-[var(--accent-subtle)] border-[var(--accent)] text-[var(--fg)]'
                    : 'bg-[var(--bg)] border-[var(--border)] text-[var(--fg)]'
                }`}
              >
                <div>{msg.text}</div>
                {msg.component}
              </div>
            </div>
          ))}

          {isProcessing && (
            <div className="flex gap-2.5 items-center">
              <div className="w-7 h-7 rounded-full bg-[var(--accent-subtle)] text-[var(--accent)] grid place-items-center flex-shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
              </div>
              <div className="p-2.5 rounded-md bg-[var(--bg)] border border-[var(--border)] text-xs text-[var(--muted)] flex items-center gap-1.5">
                <span>Gemma 4 is thinking</span>
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
              </div>
            </div>
          )}
          <div ref={chatBottomRef} />
        </div>

        {/* Input Bar or Preview Action Buttons */}
        <div className="p-3 bg-[var(--bg)] border-t border-[var(--border)]">
          {profileDraft ? (
            <div className="flex flex-wrap gap-2 justify-end">
              <button
                onClick={handleRewrite}
                disabled={isProcessing}
                className="primer-btn text-xs py-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5 text-[var(--muted)]" />
                <span>Write it again</span>
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={isProcessing}
                className="primer-btn primer-btn-primary text-xs py-1.5"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Looks good, find my matches</span>
              </button>
            </div>
          ) : STEPS[stepIndex]?.isPhoto ? (
            <div className="flex flex-wrap gap-2 items-center justify-between">
              <div className="flex gap-2">
                <label className="primer-btn primer-btn-primary text-xs py-1.5 cursor-pointer">
                  <Camera className="w-3.5 h-3.5" />
                  <span>Take a selfie</span>
                  <input
                    type="file"
                    accept="image/*"
                    capture="user"
                    onChange={handlePhotoUpload}
                    hidden
                  />
                </label>
                <label className="primer-btn text-xs py-1.5 cursor-pointer">
                  <Upload className="w-3.5 h-3.5 text-[var(--muted)]" />
                  <span>Upload photo</span>
                  <input type="file" accept="image/*" onChange={handlePhotoUpload} hidden />
                </label>
              </div>
              <button
                onClick={() => generateGemmaProfile(formData)}
                className="primer-btn text-xs py-1.5"
              >
                Skip photo
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {STEPS[stepIndex] && STEP_SUGGESTIONS[STEPS[stepIndex].key] && (
                <div className="flex flex-wrap gap-1.5 pb-1">
                  {STEP_SUGGESTIONS[STEPS[stepIndex].key].map(sug => (
                    <button
                      key={sug}
                      type="button"
                      onClick={() => {
                        setInputText(sug);
                        inputRef.current?.focus();
                      }}
                      className="primer-btn text-[11px] py-0.5 px-2 bg-[var(--subtle)] hover:bg-[var(--accent-subtle)] hover:text-[var(--accent)] transition-colors rounded-full"
                    >
                      + {sug}
                    </button>
                  ))}
                </div>
              )}
              <form
                onSubmit={e => {
                  e.preventDefault();
                  handleNextStep(inputText);
                }}
                className="flex gap-2 items-center"
              >
                <input
                  ref={inputRef}
                  type="text"
                  placeholder={STEPS[stepIndex]?.placeholder || 'Your response...'}
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  disabled={isProcessing}
                  className="primer-input flex-1 text-xs"
                />
                <button
                  type="submit"
                  disabled={isProcessing || (STEPS[stepIndex]?.required && !inputText.trim())}
                  className="primer-btn primer-btn-primary text-xs px-3"
                >
                  <span>Send</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                {!STEPS[stepIndex]?.required && (
                  <button
                    type="button"
                    onClick={() => handleNextStep('')}
                    disabled={isProcessing}
                    className="primer-btn text-xs px-2.5"
                  >
                    Skip
                  </button>
                )}
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
