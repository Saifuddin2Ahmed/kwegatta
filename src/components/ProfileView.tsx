import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Link as LinkIcon,
  Github,
  QrCode,
  Edit3,
  Check,
  RefreshCw,
  MessageCircle,
  Star,
  Users,
  UserPlus,
  UserCheck,
  Zap,
  Camera,
  Upload,
  Share2,
  Award,
  Maximize2,
  X,
  GitFork,
  Download,
  Trash2,
  AlertCircle,
  Flag,
  Ban,
  Globe,
  MapPin,
  Clock,
  Compass,
  Layers,
  LogOut,
  Lock,
  KeyRound,
  Shield,
  CheckCircle2,
  Plus
} from 'lucide-react';
import { Profile, MatchResult, CustomLink } from '../types';
import {
  buildProfileWithGemma,
  matchCandidatesWithGemma,
  db,
  exportMemberData,
  deleteMemberProfile,
  reportMember
} from '../services/api';
import { generateQrCodeDataUrl, formatWhatsAppUrl, resizeImageFile } from '../utils';
import { Avatar } from './Avatar';
import { SocialLinksRow } from './SocialLinksRow';
import { auth, addPasswordToAccount, validatePasswordStrength, formatAuthError } from '../services/firebase';
import { EmailAuthProvider, linkWithCredential } from 'firebase/auth';

const ShareCardModal = React.lazy(() => import('./ShareCardModal').then(m => ({ default: m.ShareCardModal })));

interface ProfileViewProps {
  profile: Profile;
  currentProfile: Profile | null;
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
  onToggleFollow: () => void;
  onUpdateProfile: (updated: Profile) => void;
  onDeleteProfile?: () => void;
  onSignOut?: () => void;
  onToast: (msg: string) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  profile,
  currentProfile,
  followersCount,
  followingCount,
  isFollowing,
  onToggleFollow,
  onUpdateProfile,
  onDeleteProfile,
  onSignOut,
  onToast
}) => {
  const isMine = currentProfile?.id === profile.id;
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [showMyMoreMenu, setShowMyMoreMenu] = useState(false);
  const myMenuRef = useRef<HTMLDivElement>(null);
  const [pairMatch, setPairMatch] = useState<MatchResult | null>(null);
  const [isCheckingMatch, setIsCheckingMatch] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showShareCardModal, setShowShareCardModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDeleteInput, setConfirmDeleteInput] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  // Password linking state for Google accounts
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [isLinkingPassword, setIsLinkingPassword] = useState(false);
  const [passwordLinkedSuccess, setPasswordLinkedSuccess] = useState(false);
  const [passwordLinkError, setPasswordLinkError] = useState<string | null>(null);

  // Photo state machine: preview at once -> processing -> photo saved -> error with try again
  const [photoStatus, setPhotoStatus] = useState<'idle' | 'processing' | 'saved' | 'error'>('idle');
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoErrorMsg, setPhotoErrorMsg] = useState<string | null>(null);

  // Safety: Report & Block state
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('Inappropriate content or offensive language');
  const [reportDetails, setReportDetails] = useState('');
  const [isReporting, setIsReporting] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const isBlocked = Boolean(currentProfile?.blocked_ids?.includes(profile.id));

  // Edit form state
  const [editHeadline, setEditHeadline] = useState(profile.headline || '');
  const [editBio, setEditBio] = useState(profile.bio || '');
  const [editOffers, setEditOffers] = useState(profile.offers || '');
  const [editNeeds, setEditNeeds] = useState(profile.needs || '');
  const [editTeaches, setEditTeaches] = useState(profile.teaches || '');
  const [editLearns, setEditLearns] = useState(profile.learns || '');
  const [editStatus, setEditStatus] = useState(profile.status || 'Open to projects');
  const [editWhatsApp, setEditWhatsApp] = useState(profile.whatsapp || '');
  const [editHideWhatsApp, setEditHideWhatsApp] = useState(profile.hide_whatsapp || false);

  // Social & Academic links edit state
  const [editLinkedin, setEditLinkedin] = useState(profile.linkedin || '');
  const [editGithub, setEditGithub] = useState(profile.github || '');
  const [editWebsite, setEditWebsite] = useState(profile.website || '');
  const [editTwitter, setEditTwitter] = useState(profile.twitter || '');
  const [editFacebook, setEditFacebook] = useState(profile.facebook || '');
  const [editTiktok, setEditTiktok] = useState(profile.tiktok || '');
  const [editInstagram, setEditInstagram] = useState(profile.instagram || '');
  const [editYoutube, setEditYoutube] = useState(profile.youtube || '');
  const [editScholar, setEditScholar] = useState(profile.scholar || '');
  const [editOrcid, setEditOrcid] = useState(profile.orcid || '');
  const [editHuggingface, setEditHuggingface] = useState(profile.huggingface || '');
  const [editKaggle, setEditKaggle] = useState(profile.kaggle || '');
  const [editGitlab, setEditGitlab] = useState(profile.gitlab || '');
  const [editGooglePlay, setEditGooglePlay] = useState(profile.google_play || '');
  const [editGoogleDev, setEditGoogleDev] = useState(profile.google_dev || '');
  const [editIeee, setEditIeee] = useState(profile.ieee || '');
  const [editCustomLinks, setEditCustomLinks] = useState<CustomLink[]>(() => {
    return Array.isArray(profile.custom_links)
      ? profile.custom_links.slice(0, 3).map(c => ({ label: c.label || '', url: c.url || '' }))
      : [];
  });

  const [gemmaInstruction, setGemmaInstruction] = useState('');
  const [isRewriting, setIsRewriting] = useState(false);

  // Check auth user provider
  const currentUser = auth.currentUser;
  const isGoogleUser = currentUser?.providerData.some(p => p.providerId === 'google.com');
  const hasPasswordProvider = currentUser?.providerData.some(p => p.providerId === 'password');
  const userEmail = currentUser?.email || profile.email || 'your account';

  useEffect(() => {
    const profileUrl = `https://kwegatta.ai.studio/#/u/${profile.id}`;
    generateQrCodeDataUrl(profileUrl, 240).then(setQrCodeDataUrl);
  }, [profile.id]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (myMenuRef.current && !myMenuRef.current.contains(e.target as Node)) {
        setShowMyMoreMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleRewriteWithGemma = async () => {
    setIsRewriting(true);
    try {
      const res = await buildProfileWithGemma(
        {
          name: profile.name,
          offers: editOffers,
          needs: editNeeds,
          teaches: editTeaches,
          learns: editLearns,
          gh: profile.gh
        },
        gemmaInstruction || 'Refine and sharpen my bio.'
      );

      setEditHeadline(res.headline);
      setEditBio(res.bio);
      onToast('Gemma 4 updated your draft. Save changes to keep it.');
    } catch (err: any) {
      onToast('Rewrite error: ' + err.message);
    } finally {
      setIsRewriting(false);
    }
  };

  const handleSaveProfile = async () => {
    try {
      const updated: Profile = {
        ...profile,
        headline: editHeadline.slice(0, 100),
        bio: editBio.slice(0, 400),
        offers: editOffers.slice(0, 400),
        needs: editNeeds.slice(0, 400),
        teaches: editTeaches.slice(0, 400),
        learns: editLearns.slice(0, 400),
        status: editStatus,
        whatsapp: editWhatsApp.replace(/[^\d+]/g, ''),
        hide_whatsapp: editHideWhatsApp,
        linkedin: editLinkedin.trim(),
        github: editGithub.trim().replace(/^https?:\/\/github\.com\//, '').replace(/\/$/, ''),
        website: editWebsite.trim(),
        twitter: editTwitter.trim(),
        facebook: editFacebook.trim(),
        tiktok: editTiktok.trim(),
        instagram: editInstagram.trim(),
        youtube: editYoutube.trim(),
        scholar: editScholar.trim(),
        orcid: editOrcid.trim(),
        huggingface: editHuggingface.trim(),
        kaggle: editKaggle.trim(),
        gitlab: editGitlab.trim(),
        google_play: editGooglePlay.trim(),
        google_dev: editGoogleDev.trim(),
        ieee: editIeee.trim(),
        custom_links: editCustomLinks
          .map(c => ({ label: c.label.trim().slice(0, 24), url: c.url.trim() }))
          .filter(c => c.label && /^https:\/\/[^\s]+$/i.test(c.url))
          .slice(0, 3)
      };

      await db.update('profiles', profile.id, updated);
      onUpdateProfile(updated);
      setIsEditing(false);
      onToast('Profile updated successfully');
    } catch (err) {
      onToast('Failed to save profile changes');
    }
  };

  const handleAddPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser || !currentUser.email) {
      setPasswordLinkError('User email not found. Please sign in again.');
      return;
    }

    const strengthErr = validatePasswordStrength(newPassword);
    if (strengthErr) {
      setPasswordLinkError(strengthErr);
      return;
    }

    setIsLinkingPassword(true);
    setPasswordLinkError(null);

    try {
      const result = await addPasswordToAccount(newPassword);
      setPasswordLinkedSuccess(true);
      setShowAddPassword(false);
      setNewPassword('');
      if (result.isChange) {
        onToast('Password updated! You can now sign in with your new password.');
      } else {
        onToast('Password added! You can now sign in with either Google or email & password.');
      }
    } catch (err: any) {
      console.warn('Password linking/updating error:', err);
      setPasswordLinkError(formatAuthError(err) || err.message || 'Could not update password on account.');
    } finally {
      setIsLinkingPassword(false);
    }
  };

  const handlePhotoFile = async (file: File) => {
    if (!file) return;

    const tempUrl = URL.createObjectURL(file);
    setPhotoPreviewUrl(tempUrl);
    setPhotoStatus('processing');
    setPhotoErrorMsg(null);

    try {
      const resized = await resizeImageFile(file);
      URL.revokeObjectURL(tempUrl);
      setPhotoPreviewUrl(resized);

      const updated: Profile = { ...profile, avatar: resized };
      await db.update('profiles', profile.id, { avatar: resized });
      onUpdateProfile(updated);
      setPhotoStatus('saved');
      onToast('Photo saved');
    } catch (err: any) {
      setPhotoStatus('error');
      setPhotoErrorMsg('Could not save photo. Try again.');
      onToast('Failed to process image. Try again.');
    }
  };

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handlePhotoFile(file);
    }
    e.target.value = '';
  };

  const handleSubmitReport = async () => {
    if (!reportReason) return;
    setIsReporting(true);
    try {
      const res = await reportMember(profile.id, reportReason, reportDetails);
      if (res.success) {
        onToast('Report submitted to admin for review.');
        setShowReportModal(false);
        setReportDetails('');
      } else {
        onToast(res.error || 'Failed to submit report');
      }
    } catch (err: any) {
      onToast('Error submitting report: ' + err.message);
    } finally {
      setIsReporting(false);
    }
  };

  const handleConfirmBlock = async () => {
    if (!currentProfile) return;
    try {
      const existingBlocked = currentProfile.blocked_ids || [];
      const updatedBlocked = Array.from(new Set([...existingBlocked, profile.id]));
      await db.update('profiles', currentProfile.id, { blocked_ids: updatedBlocked });
      onUpdateProfile({ ...currentProfile, blocked_ids: updatedBlocked });
      setShowBlockModal(false);
      onToast(`${profile.name.split(' ')[0]} has been blocked.`);
      window.location.hash = '#/people';
    } catch (err: any) {
      onToast('Failed to block member');
    }
  };

  const handleUnblock = async () => {
    if (!currentProfile) return;
    try {
      const existingBlocked = currentProfile.blocked_ids || [];
      const updatedBlocked = existingBlocked.filter(id => id !== profile.id);
      await db.update('profiles', currentProfile.id, { blocked_ids: updatedBlocked });
      onUpdateProfile({ ...currentProfile, blocked_ids: updatedBlocked });
      onToast(`${profile.name.split(' ')[0]} unblocked.`);
    } catch (err: any) {
      onToast('Failed to unblock member');
    }
  };

  const handleCheckMatch = async () => {
    if (!currentProfile) return;
    setIsCheckingMatch(true);
    try {
      const res = await matchCandidatesWithGemma(currentProfile, [profile]);
      if (res.list.length > 0) {
        setPairMatch(res.list[0]);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsCheckingMatch(false);
    }
  };

  const handleShareLink = () => {
    const url = `https://kwegatta.ai.studio/#/u/${profile.id}`;
    if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      onToast('Profile link copied to clipboard');
    }
  };

  const handleExportData = async () => {
    try {
      setIsExporting(true);
      const jsonStr = await exportMemberData(profile);
      const blob = new Blob([jsonStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kwegatta-${profile.github || profile.name.toLowerCase().replace(/\s+/g, '-')}-data.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onToast('Complete profile and activity data exported (JSON)');
    } catch (err: any) {
      onToast('Failed to export data: ' + err.message);
    } finally {
      setIsExporting(false);
    }
  };

  const handleDeleteProfile = async () => {
    if (!confirmDeleteInput || confirmDeleteInput.trim().toLowerCase() !== profile.name.trim().toLowerCase()) {
      onToast(`Please type "${profile.name}" exactly to confirm.`);
      return;
    }
    try {
      setIsDeleting(true);
      const ok = await deleteMemberProfile(profile.id);
      if (ok) {
        onToast('Your profile and data were deleted permanently.');
        setShowDeleteModal(false);
        if (onDeleteProfile) {
          onDeleteProfile();
        }
      } else {
        onToast('Could not delete profile. Please try again.');
      }
    } catch (err: any) {
      onToast('Error deleting profile: ' + err.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConnectWhatsApp = async () => {
    if (!currentProfile) {
      onToast('Please join or sign in to connect with members');
      return;
    }

    try {
      setIsConnecting(true);
      const text = `Hi ${profile.name.split(' ')[0]}, I'm ${currentProfile.name} on Kwegatta. Let's connect!`;

      await db.insert('notifications', {
        to_id: profile.id,
        from_id: currentProfile.id,
        type: 'connect',
        body: `${currentProfile.name} reached out to connect with you.`,
        read: false,
        created_at: new Date().toISOString()
      });

      if (profile.whatsapp) {
        const url = formatWhatsAppUrl(profile.whatsapp, text);
        if (url) {
          window.open(url, '_blank', 'noopener,noreferrer');
          onToast(`Opening WhatsApp for ${profile.name}...`);
          return;
        }
      }

      if (profile.linkedin) {
        window.open(profile.linkedin, '_blank', 'noopener,noreferrer');
        onToast(`Opening LinkedIn for ${profile.name}...`);
        return;
      }

      onToast(`${profile.name} has not set a direct contact link yet.`);
    } catch (err: any) {
      onToast(err.message || 'Error opening WhatsApp');
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="kw-container space-y-6 md:space-y-10 animate-in fade-in">
      {/* Modal for 1200 x 630 Share Card */}
      {showShareCardModal && (
        <React.Suspense fallback={null}>
          <ShareCardModal
            profile={profile}
            isOpen={showShareCardModal}
            onClose={() => setShowShareCardModal(false)}
            onToast={onToast}
          />
        </React.Suspense>
      )}

      {/* Modal for Fullscreen QR Code */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-6 max-w-sm w-full text-center space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-sm">Scan Profile</span>
              <button
                onClick={() => setShowQrModal(false)}
                className="primer-btn text-xs p-1"
                aria-label="Close QR modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-white p-4 rounded-md inline-block shadow-md">
              <img src={qrCodeDataUrl} alt="QR Code" className="w-56 h-56 mx-auto" />
            </div>

            <p className="text-xs text-[var(--muted)]">
              {profile.name} · {profile.role}
            </p>
            <p className="text-[13px] text-[var(--fg)]">
              Point a camera here to connect and check match compatibility instantly.
            </p>
          </div>
        </div>
      )}

      {/* Modal for Deleting Profile Permanently */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-[var(--bg)] border border-[var(--danger)] rounded-lg p-6 max-w-md w-full space-y-4 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <span className="font-bold text-sm text-[var(--danger)] flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[var(--danger)]" />
                <span>Delete Profile Permanently</span>
              </span>
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setConfirmDeleteInput('');
                }}
                className="primer-btn text-xs p-1"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--fg)] leading-relaxed">
              This action <strong>cannot be undone</strong>. All your personal data, matches, posts, notifications, and following connections will be permanently wiped from the Kwegatta database in compliance with the Digital Public Goods Standard.
            </p>

            <div className="space-y-1.5 text-xs bg-[var(--subtle)] p-3 rounded-md border border-[var(--border)]">
              <label className="text-[var(--muted)] block">
                Type your full name <strong className="text-[var(--fg)] font-mono">{profile.name}</strong> to confirm:
              </label>
              <input
                type="text"
                value={confirmDeleteInput}
                onChange={e => setConfirmDeleteInput(e.target.value)}
                placeholder={profile.name}
                className="primer-input w-full text-xs font-mono"
                autoFocus
              />
            </div>

            <div className="flex gap-2 justify-end pt-2">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setConfirmDeleteInput('');
                }}
                className="primer-btn text-xs py-1.5 px-3"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteProfile}
                disabled={isDeleting || confirmDeleteInput.trim().toLowerCase() !== profile.name.trim().toLowerCase()}
                className="primer-btn primer-btn-danger text-xs py-1.5 px-4 font-semibold disabled:opacity-50"
              >
                {isDeleting ? 'Deleting...' : 'Permanently Delete My Profile'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
        {/* Left Column: Sidebar / Profile Meta */}
        <div className="space-y-4">
          <div className="flex flex-col items-center md:items-start text-center md:text-left">
            <div className="relative group">
              <Avatar
                profile={photoPreviewUrl ? { ...profile, avatar: photoPreviewUrl } : profile}
                size="3xl"
                className="w-40 h-40 md:w-56 md:h-56 shadow-md"
              />
              {isMine && (
                <label className="absolute bottom-2 right-2 p-2 bg-[var(--btn)] hover:bg-[var(--btn-hover)] text-[var(--fg)] rounded-full border border-[var(--border)] cursor-pointer shadow-md transition-transform hover:scale-105" title="Change photo">
                  <Camera className="w-4 h-4" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    hidden
                  />
                </label>
              )}
            </div>

            {isMine && (
              <div className="mt-2.5">
                <label className="primer-btn text-xs py-1.5 px-3.5 flex items-center gap-1.5 cursor-pointer font-medium hover:border-[var(--gold)] active:scale-95 transition-all">
                  <Camera className="w-3.5 h-3.5 text-[var(--gold-text)]" />
                  <span>Change photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    hidden
                  />
                </label>
              </div>
            )}

            {/* Photo upload status feedback */}
            {photoStatus === 'processing' && (
              <div className="mt-2 text-xs font-semibold text-[var(--accent)] flex items-center gap-1.5 animate-pulse">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Processing…</span>
              </div>
            )}
            {photoStatus === 'saved' && (
              <div className="mt-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                <Check className="w-3.5 h-3.5" />
                <span>Photo saved</span>
              </div>
            )}
            {photoStatus === 'error' && (
              <div className="mt-2 text-xs font-semibold text-rose-600 dark:text-rose-400 flex items-center gap-2">
                <span>{photoErrorMsg || 'Could not save photo.'}</span>
                <label className="underline hover:no-underline font-bold cursor-pointer">
                  <span>Try again</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handlePhotoUpload}
                    hidden
                  />
                </label>
              </div>
            )}

            <div className="mt-3">
              <h1 className="text-xl font-bold text-[var(--fg)] leading-snug">{profile.name}</h1>
              {profile.headline && (
                <p className="text-[14px] text-[var(--fg-muted)] font-medium mt-1 leading-snug">
                  {profile.headline}
                </p>
              )}
              {profile.github && (
                <div className="text-[13px] text-[var(--muted)] font-normal mt-0.5">@{profile.github}</div>
              )}
              <div className="flex flex-wrap gap-1.5 mt-2 justify-center md:justify-start">
                <span className="primer-label primer-label-blue text-[13px]">{profile.role}</span>
                {profile.status && (
                  <span className="primer-label primer-label-green text-[13px]">{profile.status}</span>
                )}
              </div>
            </div>
          </div>

          {profile.bio && (
            <p className="text-[14px] text-[var(--fg)] leading-relaxed">
              {profile.bio}
            </p>
          )}

          {/* Social Links Row (LinkedIn, GitHub, Website, TikTok, X, Instagram, YouTube, Scholar, ORCID) */}
          <div className="pt-1">
            <SocialLinksRow profile={profile} />
          </div>

          {/* Social counts: hide if both are 0 */}
          {(followersCount > 0 || followingCount > 0) && (
            <div className="flex items-center gap-3 text-[13px] text-[var(--muted)]">
              <div className="flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-[var(--muted)]" />
                <strong className="text-[var(--fg)] font-semibold">{followersCount}</strong>
                <span>followers</span>
              </div>
              <span>·</span>
              <div>
                <strong className="text-[var(--fg)] font-semibold">{followingCount}</strong>{' '}
                <span>following</span>
              </div>
            </div>
          )}

          {/* Connect / Edit Actions & Share Card Button */}
          <div className="space-y-2">
            {isMine ? (
              <div className="space-y-2">
                <div className="flex gap-2 items-center">
                  <button
                    onClick={() => setIsEditing(!isEditing)}
                    className="primer-btn text-xs py-1.5 flex-1"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                    <span>{isEditing ? 'Close editor' : 'Edit profile'}</span>
                  </button>
                  <button
                    onClick={() => setShowShareCardModal(true)}
                    className="primer-btn text-xs py-1.5 px-3 flex items-center gap-1.5 text-[var(--gold-text)] font-medium"
                    title="Share my profile card"
                  >
                    <Share2 className="w-3.5 h-3.5" />
                    <span>Share my profile</span>
                  </button>
                  <div className="relative" ref={myMenuRef}>
                    <button
                      type="button"
                      onClick={() => setShowMyMoreMenu(!showMyMoreMenu)}
                      className="primer-btn text-xs py-1.5 px-2.5 flex items-center gap-1 cursor-pointer"
                      title="Profile menu"
                      aria-label="Profile menu"
                    >
                      <span>More</span>
                      <span className="text-[13px]">▾</span>
                    </button>

                    {showMyMoreMenu && (
                      <div className="absolute right-0 top-full mt-1.5 w-48 bg-[var(--card)] border border-[var(--card-border)] rounded-xl shadow-2xl z-40 py-1.5 text-xs animate-in fade-in zoom-in-95">
                        <button
                          type="button"
                          onClick={() => {
                            setShowMyMoreMenu(false);
                            setShowShareCardModal(true);
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-[var(--bg-subtle)] flex items-center gap-2 text-[var(--fg)] cursor-pointer"
                        >
                          <Share2 className="w-3.5 h-3.5 text-[var(--gold-text)]" />
                          <span>Share my profile card</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowMyMoreMenu(false);
                            handleShareLink();
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-[var(--bg-subtle)] flex items-center gap-2 text-[var(--fg)] cursor-pointer"
                        >
                          <LinkIcon className="w-3.5 h-3.5 text-[var(--fg-muted)]" />
                          <span>Copy profile link</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowMyMoreMenu(false);
                            handleExportData();
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-[var(--bg-subtle)] flex items-center gap-2 text-[var(--fg)] cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5 text-[var(--fg-muted)]" />
                          <span>Export my data (JSON)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowMyMoreMenu(false);
                            if (onSignOut) onSignOut();
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-[var(--bg-subtle)] flex items-center gap-2 text-rose-500 hover:text-rose-600 font-medium cursor-pointer"
                        >
                          <LogOut className="w-3.5 h-3.5 text-rose-500" />
                          <span>Sign out</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowMyMoreMenu(false);
                            setShowDeleteModal(true);
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-[var(--bg-subtle)] flex items-center gap-2 text-[var(--fg-muted)] hover:text-rose-500 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                          <span>Delete profile</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {isBlocked && (
                  <div className="p-2.5 rounded-xl bg-[var(--danger-subtle)] border border-[var(--danger)]/30 text-xs flex items-center justify-between text-[var(--danger)]">
                    <span className="font-medium">You have blocked this member</span>
                    <button onClick={handleUnblock} className="underline font-bold cursor-pointer">
                      Unblock
                    </button>
                  </div>
                )}

                <div className="flex items-center gap-2 relative">
                  <button
                    onClick={handleConnectWhatsApp}
                    disabled={isConnecting}
                    className="primer-btn primer-btn-primary text-xs py-1.5 flex-1"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    <span>
                      {isConnecting
                        ? 'Connecting...'
                        : profile.whatsapp || (profile as any).has_whatsapp
                        ? 'Connect (WhatsApp)'
                        : profile.linkedin
                        ? 'Connect (LinkedIn)'
                        : 'Connect'}
                    </span>
                  </button>

                  <button
                    onClick={onToggleFollow}
                    className="primer-btn text-xs py-1.5 px-3"
                  >
                    {isFollowing ? (
                      <>
                        <UserCheck className="w-3.5 h-3.5 text-[var(--success)]" />
                        <span>Following</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3.5 h-3.5 text-[var(--muted)]" />
                        <span>Follow</span>
                      </>
                    )}
                  </button>

                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowMoreMenu(!showMoreMenu)}
                      className="primer-btn text-xs py-1.5 px-2.5 flex items-center gap-1 cursor-pointer"
                      title="More actions"
                      aria-label="More actions"
                    >
                      <span>More</span>
                      <span className="text-[13px]">▾</span>
                    </button>

                    {showMoreMenu && (
                      <div className="absolute right-0 top-full mt-1.5 w-44 bg-[var(--card)] border border-[var(--card-border)] rounded-xl shadow-2xl z-40 py-1.5 text-xs animate-in fade-in zoom-in-95">
                        <button
                          type="button"
                          onClick={() => {
                            setShowMoreMenu(false);
                            handleShareLink();
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-[var(--bg-subtle)] flex items-center gap-2 text-[var(--fg)] cursor-pointer"
                        >
                          <Share2 className="w-3.5 h-3.5 text-[var(--fg-muted)]" />
                          <span>Share profile link</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowMoreMenu(false);
                            setShowReportModal(true);
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-[var(--bg-subtle)] flex items-center gap-2 text-red-500 hover:text-red-600 font-medium cursor-pointer"
                        >
                          <Flag className="w-3.5 h-3.5 text-red-500" />
                          <span>Report profile</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowMoreMenu(false);
                            if (isBlocked) handleUnblock();
                            else setShowBlockModal(true);
                          }}
                          className="w-full text-left px-3.5 py-2 hover:bg-[var(--bg-subtle)] flex items-center gap-2 text-[var(--fg-muted)] hover:text-red-500 cursor-pointer"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>{isBlocked ? 'Unblock member' : 'Block member'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3 pt-1 text-[13px] text-[var(--fg-muted)]">
                  <button
                    type="button"
                    onClick={() => setShowReportModal(true)}
                    className="hover:text-red-500 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Flag className="w-3 h-3 text-red-500/80" />
                    <span>Report profile</span>
                  </button>
                  <span>·</span>
                  <button
                    type="button"
                    onClick={() => (isBlocked ? handleUnblock() : setShowBlockModal(true))}
                    className="hover:text-red-500 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Ban className="w-3 h-3" />
                    <span>{isBlocked ? 'Unblock' : 'Block'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Account & Sign-in Section (Only for own profile) */}
          {isMine && (
            <div className="primer-box p-3.5 bg-[var(--subtle)] space-y-3 text-xs rounded-xl border border-[var(--card-border)]">
              <div className="font-semibold text-[13px] text-[var(--muted)] uppercase tracking-wider flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-[var(--gold-text)]" />
                <span>Account &amp; Security</span>
              </div>

              <div className="space-y-1.5 text-xs">
                <p className="text-[var(--fg)] font-medium">
                  {isGoogleUser
                    ? `Signed in with Google as ${userEmail}`
                    : `Signed in as ${userEmail}`}
                </p>
                {(hasPasswordProvider || passwordLinkedSuccess) ? (
                  <div className="flex items-center justify-between pt-1">
                    <div className="flex items-center gap-1.5 text-emerald-500 text-[13px] font-semibold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Password credential linked</span>
                    </div>
                    {!showAddPassword && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowAddPassword(true);
                          setPasswordLinkError(null);
                        }}
                        className="text-[13px] font-medium text-[var(--gold-text)] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <KeyRound className="w-3 h-3" />
                        <span>Change password</span>
                      </button>
                    )}
                  </div>
                ) : null}
              </div>

              {/* Add a password or Change password form */}
              {((isGoogleUser && !hasPasswordProvider && !passwordLinkedSuccess) || (showAddPassword && (hasPasswordProvider || passwordLinkedSuccess))) && (
                <div className="pt-2 border-t border-[var(--border-muted)] space-y-2">
                  {!showAddPassword ? (
                    <button
                      type="button"
                      onClick={() => {
                        setShowAddPassword(true);
                        setPasswordLinkError(null);
                      }}
                      className="primer-btn text-xs py-1.5 px-3 flex items-center gap-1.5 font-semibold text-[var(--gold-text)] border-[var(--gold)]/40 hover:bg-[var(--gold-subtle)] cursor-pointer"
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      <span>Add a password</span>
                    </button>
                  ) : (
                    <form onSubmit={handleAddPassword} className="space-y-2.5 bg-[var(--card)] p-3 rounded-lg border border-[var(--card-border)] animate-in fade-in">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-[var(--fg)] flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-[var(--gold-text)]" />
                          <span>{(hasPasswordProvider || passwordLinkedSuccess) ? 'Change account password' : 'Set account password'}</span>
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddPassword(false);
                            setPasswordLinkError(null);
                          }}
                          className="text-[var(--fg-muted)] hover:text-[var(--fg)] cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <p className="text-[13px] text-[var(--fg-muted)] leading-relaxed">
                        {(hasPasswordProvider || passwordLinkedSuccess)
                          ? 'Set a new password for your email sign-in (min 8 characters).'
                          : 'Add a password so you can sign in with your email and password on any device.'}
                      </p>
                      <input
                        type="password"
                        placeholder="Enter password (min 8 characters)"
                        value={newPassword}
                        onChange={e => {
                          setNewPassword(e.target.value);
                          if (passwordLinkError) setPasswordLinkError(null);
                        }}
                        className="w-full p-2 text-xs bg-[var(--bg-subtle)] border border-[var(--card-border)] rounded-md focus:outline-none focus:border-[var(--gold)] text-[var(--fg)]"
                      />
                      {passwordLinkError && (
                        <p className="text-[13px] text-red-500 font-medium leading-tight">{passwordLinkError}</p>
                      )}
                      <div className="flex gap-2 justify-end pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            setShowAddPassword(false);
                            setPasswordLinkError(null);
                          }}
                          className="primer-btn text-xs py-1 px-2.5"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isLinkingPassword || newPassword.length < 8}
                          className="kw-btn kw-btn-gold text-xs py-1 px-3.5 font-bold disabled:opacity-40 cursor-pointer"
                        >
                          {isLinkingPassword ? 'Saving...' : ((hasPasswordProvider || passwordLinkedSuccess) ? 'Update password' : 'Save password')}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Digital Public Goods: Data & Privacy Controls */}
          {isMine && (
            <div className="primer-box p-3 bg-[var(--subtle)] space-y-2.5 text-xs">
              <div className="font-semibold text-[13px] text-[var(--muted)] uppercase tracking-wider flex items-center justify-between">
                <span>Data &amp; Privacy</span>
                <span className="primer-label primer-label-green text-[13px]">DPG Aligned</span>
              </div>
              <p className="text-[13px] text-[var(--muted)] leading-relaxed">
                You own your profile. Export your activity data or permanently erase your presence.
              </p>
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={handleExportData}
                  disabled={isExporting}
                  className="primer-btn text-xs py-1.5 justify-center flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5 text-[var(--accent)]" />
                  <span>{isExporting ? 'Exporting...' : 'Export my data (JSON)'}</span>
                </button>
                <button
                  onClick={() => setShowDeleteModal(true)}
                  className="primer-btn primer-btn-danger text-xs py-1.5 justify-center flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete my profile</span>
                </button>
              </div>
            </div>
          )}

          {/* Achievements & Badges */}
          <div className="primer-box p-3 bg-[var(--subtle)] space-y-2 text-xs">
            <div className="font-semibold text-[13px] text-[var(--muted)] uppercase tracking-wider">
              Achievements &amp; Badges
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-[var(--fg)]">
                <Award className="w-4 h-4 text-[var(--attention)] flex-shrink-0" />
                <span>Hack Day Kampala x MUBS 2026</span>
              </div>
              <div className="flex items-center gap-2 text-[13px] text-[var(--fg)]">
                <Sparkles className="w-4 h-4 text-[var(--done)] flex-shrink-0" />
                <span>Profile written with Gemma 4</span>
              </div>
            </div>
          </div>

          {/* Dynamic Profile QR Code */}
          <div className="primer-box p-3 text-center space-y-2 bg-[var(--subtle)]">
            <div className="font-semibold text-xs flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <QrCode className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>{isMine ? 'Your Profile QR Code' : 'Scan to Connect'}</span>
              </span>
              <button
                onClick={() => setShowQrModal(true)}
                className="primer-btn text-[13px] py-0.5 px-1.5"
                title="Expand QR code"
              >
                <Maximize2 className="w-3 h-3" />
              </button>
            </div>

            {qrCodeDataUrl ? (
              <div
                onClick={() => setShowQrModal(true)}
                className="bg-white p-2 rounded inline-block shadow-sm cursor-pointer hover:opacity-95"
              >
                <img src={qrCodeDataUrl} alt="Profile QR Code" className="w-36 h-36 mx-auto" />
              </div>
            ) : (
              <div className="w-36 h-36 mx-auto bg-gray-200 animate-pulse rounded" />
            )}
            <p className="text-[13px] text-[var(--muted)]">
              {isMine
                ? 'Show this to the person next to you to exchange profiles instantly.'
                : 'Scan to open this member on your mobile device.'}
            </p>
          </div>
        </div>

        {/* Right Column: Main Profile Information & Repos */}
        <div className="md:col-span-2 space-y-4">
          {/* Pair Match Card on another member's profile */}
          {!isMine && currentProfile && (
            <div className="primer-box p-4 bg-[var(--subtle)] space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 font-semibold text-xs">
                  <Zap className="w-4 h-4 text-[var(--accent)]" />
                  <span>You and {profile.name.split(' ')[0]}</span>
                </div>
                {pairMatch && (
                  <span className="primer-label primer-label-green text-xs font-semibold">
                    {pairMatch.score}% match
                  </span>
                )}
              </div>

              {pairMatch ? (
                <div className="space-y-2">
                  <p className="text-xs text-[var(--fg)] leading-relaxed bg-[var(--bg)] p-2.5 rounded border border-[var(--border-muted)]">
                    {pairMatch.reason}
                  </p>
                  {pairMatch.spark && (
                    <div className="p-2.5 bg-[var(--accent-subtle)] border border-[var(--accent)] text-xs rounded text-[var(--fg)]">
                      <strong className="text-[var(--accent)]">Project spark: </strong>
                      <span>{pairMatch.spark}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between text-xs text-[var(--muted)]">
                  <span>See how your needs and skills complement each other with Gemma 4.</span>
                  <button
                    onClick={handleCheckMatch}
                    disabled={isCheckingMatch}
                    className="primer-btn primer-btn-primary text-xs py-1 px-3"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>{isCheckingMatch ? 'Analyzing...' : 'Check our match'}</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Edit Profile Form (Expanded if editing) */}
          {isEditing && isMine && (
            <div className="primer-box p-4 bg-[var(--subtle)] space-y-4 border-2 border-[var(--gold)] rounded-2xl shadow-xl">
              <h3 className="font-semibold text-sm flex items-center gap-2 text-[var(--fg)]">
                <Edit3 className="w-4 h-4 text-[var(--gold-text)]" />
                <span>Edit Profile</span>
              </h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--fg)] mb-1">
                    Headline (max 8 words)
                  </label>
                  <input
                    type="text"
                    value={editHeadline}
                    onChange={e => setEditHeadline(e.target.value)}
                    className="primer-input text-xs w-full"
                    maxLength={100}
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[var(--fg)] mb-1">
                    Bio (2 sentences)
                  </label>
                  <textarea
                    value={editBio}
                    onChange={e => setEditBio(e.target.value)}
                    className="primer-textarea text-xs w-full"
                    rows={2}
                    maxLength={400}
                  />
                </div>

                {/* Rewrite with Gemma helper */}
                <div className="p-3 bg-[var(--bg)] rounded-xl border border-[var(--card-border)] space-y-2">
                  <div className="text-xs font-medium text-[var(--fg)] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[var(--gold-text)]" />
                    <span>Rewrite bio with Gemma 4</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g. shorter, more focused on fintech, casual tone..."
                      value={gemmaInstruction}
                      onChange={e => setGemmaInstruction(e.target.value)}
                      className="primer-input text-xs flex-1"
                    />
                    <button
                      type="button"
                      onClick={handleRewriteWithGemma}
                      disabled={isRewriting}
                      className="primer-btn text-xs py-1 px-3 cursor-pointer"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRewriting ? 'animate-spin' : ''}`} />
                      <span>{isRewriting ? 'Writing...' : 'Rewrite'}</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--gold-text)] mb-1">
                      What you OFFER
                    </label>
                    <textarea
                      value={editOffers}
                      onChange={e => setEditOffers(e.target.value)}
                      className="primer-textarea text-xs w-full"
                      rows={2}
                      maxLength={400}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--teal-text)] mb-1">
                      What you NEED
                    </label>
                    <textarea
                      value={editNeeds}
                      onChange={e => setEditNeeds(e.target.value)}
                      className="primer-textarea text-xs w-full"
                      rows={2}
                      maxLength={400}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--muted)] mb-1">
                      What you can TEACH (mentorship)
                    </label>
                    <input
                      type="text"
                      value={editTeaches}
                      onChange={e => setEditTeaches(e.target.value)}
                      className="primer-input text-xs w-full"
                      maxLength={200}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--muted)] mb-1">
                      What you want to LEARN (study partners)
                    </label>
                    <input
                      type="text"
                      value={editLearns}
                      onChange={e => setEditLearns(e.target.value)}
                      className="primer-input text-xs w-full"
                      maxLength={200}
                    />
                  </div>
                </div>

                {/* Profile Links Grouped */}
                <div className="space-y-4 pt-3 border-t border-[var(--border-muted)]">
                  <div>
                    <span className="text-xs font-bold text-[var(--fg)] block">
                      Profile Links (Optional)
                    </span>
                    <p className="text-[13px] text-[var(--fg-muted)]">
                      Connect your profiles across professional, social, and academic networks.
                    </p>
                  </div>

                  {/* 1. Professional Group */}
                  <div className="space-y-2 p-3 rounded-xl bg-[var(--bg)] border border-[var(--card-border)]">
                    <span className="text-xs font-semibold text-[var(--fg)] block">
                      Professional
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[13px] text-[var(--fg-muted)] block mb-0.5">LinkedIn</label>
                        <input
                          type="text"
                          placeholder="https://linkedin.com/in/username"
                          value={editLinkedin}
                          onChange={e => setEditLinkedin(e.target.value)}
                          className="primer-input text-xs w-full"
                        />
                      </div>
                      <div>
                        <label className="text-[13px] text-[var(--fg-muted)] block mb-0.5">GitHub</label>
                        <input
                          type="text"
                          placeholder="username or github.com/username"
                          value={editGithub}
                          onChange={e => setEditGithub(e.target.value)}
                          className="primer-input text-xs w-full"
                        />
                      </div>
                      <div>
                        <label className="text-[13px] text-[var(--fg-muted)] block mb-0.5">GitLab (gitlab.com)</label>
                        <input
                          type="text"
                          placeholder="https://gitlab.com/username"
                          value={editGitlab}
                          onChange={e => setEditGitlab(e.target.value)}
                          className="primer-input text-xs w-full"
                        />
                      </div>
                      <div>
                        <label className="text-[13px] text-[var(--fg-muted)] block mb-0.5">Google Play Developer (play.google.com)</label>
                        <input
                          type="text"
                          placeholder="https://play.google.com/store/apps/dev?id=..."
                          value={editGooglePlay}
                          onChange={e => setEditGooglePlay(e.target.value)}
                          className="primer-input text-xs w-full"
                        />
                      </div>
                      <div>
                        <label className="text-[13px] text-[var(--fg-muted)] block mb-0.5">Google Developer Profile (g.dev)</label>
                        <input
                          type="text"
                          placeholder="https://g.dev/username"
                          value={editGoogleDev}
                          onChange={e => setEditGoogleDev(e.target.value)}
                          className="primer-input text-xs w-full"
                        />
                      </div>
                      <div>
                        <label className="text-[13px] text-[var(--fg-muted)] block mb-0.5">Personal Website</label>
                        <input
                          type="text"
                          placeholder="https://yoursite.com"
                          value={editWebsite}
                          onChange={e => setEditWebsite(e.target.value)}
                          className="primer-input text-xs w-full"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2. Social Group */}
                  <div className="space-y-2 p-3 rounded-xl bg-[var(--bg)] border border-[var(--card-border)]">
                    <span className="text-xs font-semibold text-[var(--fg)] block">
                      Social
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[13px] text-[var(--fg-muted)] block mb-0.5">X (Twitter)</label>
                        <input
                          type="text"
                          placeholder="https://x.com/username"
                          value={editTwitter}
                          onChange={e => setEditTwitter(e.target.value)}
                          className="primer-input text-xs w-full"
                        />
                      </div>
                      <div>
                        <label className="text-[13px] text-[var(--fg-muted)] block mb-0.5">Facebook</label>
                        <input
                          type="text"
                          placeholder="https://facebook.com/username"
                          value={editFacebook}
                          onChange={e => setEditFacebook(e.target.value)}
                          className="primer-input text-xs w-full"
                        />
                      </div>
                      <div>
                        <label className="text-[13px] text-[var(--fg-muted)] block mb-0.5">Instagram</label>
                        <input
                          type="text"
                          placeholder="https://instagram.com/username"
                          value={editInstagram}
                          onChange={e => setEditInstagram(e.target.value)}
                          className="primer-input text-xs w-full"
                        />
                      </div>
                      <div>
                        <label className="text-[13px] text-[var(--fg-muted)] block mb-0.5">TikTok</label>
                        <input
                          type="text"
                          placeholder="https://tiktok.com/@username"
                          value={editTiktok}
                          onChange={e => setEditTiktok(e.target.value)}
                          className="primer-input text-xs w-full"
                        />
                      </div>
                      <div>
                        <label className="text-[13px] text-[var(--fg-muted)] block mb-0.5">YouTube</label>
                        <input
                          type="text"
                          placeholder="https://youtube.com/@channel"
                          value={editYoutube}
                          onChange={e => setEditYoutube(e.target.value)}
                          className="primer-input text-xs w-full"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 3. Academic Group */}
                  <div className="space-y-2 p-3 rounded-xl bg-[var(--bg)] border border-[var(--card-border)]">
                    <span className="text-xs font-semibold text-[var(--fg)] block">
                      Academic
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="text-[13px] text-[var(--fg-muted)] block mb-0.5">Google Scholar</label>
                        <input
                          type="text"
                          placeholder="https://scholar.google.com/citations?user=..."
                          value={editScholar}
                          onChange={e => setEditScholar(e.target.value)}
                          className="primer-input text-xs w-full"
                        />
                      </div>
                      <div>
                        <label className="text-[13px] text-[var(--fg-muted)] block mb-0.5">ORCID</label>
                        <input
                          type="text"
                          placeholder="https://orcid.org/0000-0000-0000-0000"
                          value={editOrcid}
                          onChange={e => setEditOrcid(e.target.value)}
                          className="primer-input text-xs w-full"
                        />
                      </div>
                      <div>
                        <label className="text-[13px] text-[var(--fg-muted)] block mb-0.5">IEEE Collabratec (ieee-collabratec.ieee.org)</label>
                        <input
                          type="text"
                          placeholder="https://ieee-collabratec.ieee.org/app/p/..."
                          value={editIeee}
                          onChange={e => setEditIeee(e.target.value)}
                          className="primer-input text-xs w-full"
                        />
                      </div>
                      <div>
                        <label className="text-[13px] text-[var(--fg-muted)] block mb-0.5">Hugging Face (huggingface.co)</label>
                        <input
                          type="text"
                          placeholder="https://huggingface.co/username"
                          value={editHuggingface}
                          onChange={e => setEditHuggingface(e.target.value)}
                          className="primer-input text-xs w-full"
                        />
                      </div>
                      <div>
                        <label className="text-[13px] text-[var(--fg-muted)] block mb-0.5">Kaggle (kaggle.com)</label>
                        <input
                          type="text"
                          placeholder="https://kaggle.com/username"
                          value={editKaggle}
                          onChange={e => setEditKaggle(e.target.value)}
                          className="primer-input text-xs w-full"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 4. Custom Links (up to 3) */}
                  <div className="space-y-2 p-3 rounded-xl bg-[var(--bg)] border border-[var(--card-border)]">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-xs font-semibold text-[var(--fg)] block">Custom Links</span>
                        <span className="text-[13px] text-[var(--fg-muted)]">Up to 3 custom links with a short label and https URL</span>
                      </div>
                      {editCustomLinks.length < 3 && (
                        <button
                          type="button"
                          onClick={() => setEditCustomLinks([...editCustomLinks, { label: '', url: '' }])}
                          className="text-xs px-2.5 py-1 rounded-lg border border-[var(--gold)]/40 text-[var(--gold-text)] hover:bg-[var(--gold)]/10 font-medium flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Add another link</span>
                        </button>
                      )}
                    </div>

                    {editCustomLinks.length === 0 ? (
                      <p className="text-[13px] text-[var(--fg-subtle)] italic">No custom links added yet.</p>
                    ) : (
                      <div className="space-y-2 pt-1">
                        {editCustomLinks.map((custom, index) => (
                          <div key={index} className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                            <input
                              type="text"
                              maxLength={24}
                              placeholder="Label (max 24 chars)"
                              value={custom.label}
                              onChange={e => {
                                const next = [...editCustomLinks];
                                next[index] = { ...next[index], label: e.target.value.slice(0, 24) };
                                setEditCustomLinks(next);
                              }}
                              className="primer-input text-xs w-full sm:w-44"
                            />
                            <input
                              type="url"
                              placeholder="https://..."
                              value={custom.url}
                              onChange={e => {
                                const next = [...editCustomLinks];
                                next[index] = { ...next[index], url: e.target.value };
                                setEditCustomLinks(next);
                              }}
                              className="primer-input text-xs flex-1 w-full"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setEditCustomLinks(editCustomLinks.filter((_, i) => i !== index));
                              }}
                              className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/10 cursor-pointer self-end sm:self-center"
                              title="Remove link"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--fg)] mb-1">Status</label>
                    <select
                      value={editStatus}
                      onChange={e => setEditStatus(e.target.value)}
                      className="primer-select text-xs w-full"
                    >
                      <option>Open to projects</option>
                      <option>Looking for a co-founder</option>
                      <option>Looking for a team</option>
                      <option>Looking for a mentor</option>
                      <option>Looking for collaborators</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--fg)] mb-1">WhatsApp number</label>
                    <input
                      type="tel"
                      value={editWhatsApp}
                      onChange={e => setEditWhatsApp(e.target.value)}
                      placeholder="+256 700 000000"
                      className="primer-input text-xs w-full"
                      maxLength={25}
                    />
                    <label className="flex items-center gap-2 mt-2 text-xs text-[var(--fg)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!editHideWhatsApp}
                        onChange={e => setEditHideWhatsApp(!e.target.checked)}
                        className="rounded border-[var(--card-border)] text-[var(--gold-text)] focus:ring-[var(--gold)]"
                      />
                      <span>Visible to other signed-in members</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="primer-btn text-xs py-1.5 px-3 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  className="kw-btn kw-btn-gold text-xs py-1.5 px-4 font-bold cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save changes</span>
                </button>
              </div>
            </div>
          )}

          {/* Offers & Needs Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="primer-box p-3.5 space-y-2">
              <div className="primer-box-header -mx-3.5 -mt-3.5 mb-2.5 py-2 px-3 text-xs font-semibold flex items-center justify-between">
                <span>Offers</span>
                <span className="primer-label primer-label-green text-[13px]">What I bring</span>
              </div>
              <p className="text-xs text-[var(--fg)] leading-relaxed">
                {profile.offers || 'No offers described yet.'}
              </p>
              {profile.teaches && (
                <div className="text-[13px] text-[var(--muted)] pt-2 border-t border-[var(--border-muted)]">
                  <strong className="text-[var(--fg)]">Can teach: </strong>
                  <span>{profile.teaches}</span>
                </div>
              )}
            </div>

            <div className="primer-box p-3.5 space-y-2">
              <div className="primer-box-header -mx-3.5 -mt-3.5 mb-2.5 py-2 px-3 text-xs font-semibold flex items-center justify-between">
                <span>Needs</span>
                <span className="primer-label primer-label-amber text-[13px]">What I seek</span>
              </div>
              <p className="text-xs text-[var(--fg)] leading-relaxed">
                {profile.needs || 'No specific needs listed yet.'}
              </p>
              {profile.learns && (
                <div className="text-[13px] text-[var(--muted)] pt-2 border-t border-[var(--border-muted)]">
                  <strong className="text-[var(--fg)]">Wants to learn: </strong>
                  <span>{profile.learns}</span>
                </div>
              )}
            </div>
          </div>

          {/* Skills and Tags */}
          {(profile.tags?.length > 0 || profile.skills?.length > 0) && (
            <div className="primer-box p-3.5 space-y-2.5">
              <div className="font-semibold text-xs text-[var(--fg)]">Tags &amp; Skills</div>
              <div className="flex flex-wrap gap-1.5">
                {profile.tags?.map(t => (
                  <span key={t} className="primer-tag text-xs">
                    #{t}
                  </span>
                ))}
              </div>
              {Array.isArray(profile.skills) && profile.skills.filter(s => typeof s === 'string' && s.trim().length > 0).length > 0 && (
                <div className="text-xs text-[var(--muted)] pt-2 border-t border-[var(--border-muted)]">
                  <strong className="text-[var(--fg)]">Core competencies: </strong>
                  <span>{profile.skills.filter(s => typeof s === 'string' && s.trim().length > 0).join(', ')}</span>
                </div>
              )}
            </div>
          )}

          {/* GitHub Activity / Commit Stream */}
          <div className="primer-box p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold">Hack Day Activity &amp; Commit Stream</span>
              <span className="text-[13px] text-[var(--muted)]">October 2026</span>
            </div>
            <div className="grid grid-cols-12 sm:grid-cols-24 gap-1 pt-1">
              {Array.from({ length: 48 }).map((_, i) => {
                const levels = [
                  'bg-[var(--border-muted)]',
                  'bg-[#0e4429]',
                  'bg-[#006d32]',
                  'bg-[#26a641]',
                  'bg-[#39d353]'
                ];
                const activeIndex = (i * 7 + (profile.name.charCodeAt(0) || 5)) % levels.length;
                return (
                  <div
                    key={i}
                    className={`h-3 rounded-xs ${levels[activeIndex]} transition-opacity hover:opacity-80`}
                    title={`Activity day ${i + 1}`}
                  />
                );
              })}
            </div>
            <div className="flex items-center justify-between text-[13px] text-[var(--muted)] pt-1">
              <span>Less</span>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-[var(--border-muted)]" />
                <span className="w-2.5 h-2.5 rounded-xs bg-[#0e4429]" />
                <span className="w-2.5 h-2.5 rounded-xs bg-[#006d32]" />
                <span className="w-2.5 h-2.5 rounded-xs bg-[#26a641]" />
                <span className="w-2.5 h-2.5 rounded-xs bg-[#39d353]" />
              </div>
              <span>More</span>
            </div>
          </div>

          {/* Top Repositories */}
          {profile.gh?.top && profile.gh.top.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-xs text-[var(--fg)] flex items-center gap-1.5">
                  <Github className="w-3.5 h-3.5" />
                  <span>Pinned GitHub Repositories</span>
                </h3>
                <span className="text-[13px] text-[var(--muted)]">
                  {profile.gh.repos} total public repos
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {profile.gh.top.map(repo => (
                  <div
                    key={repo.name}
                    className="primer-box p-3.5 flex flex-col justify-between space-y-2 hover:border-[var(--accent)] transition-colors"
                  >
                    <div>
                      <a
                        href={repo.url || `https://github.com/${profile.github}/${repo.name}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-xs text-[var(--accent)] hover:underline block truncate"
                      >
                        {repo.name}
                      </a>
                      <p className="text-[13px] text-[var(--muted)] line-clamp-2 mt-1">
                        {repo.desc || 'No repository description provided.'}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 text-[13px] text-[var(--muted)] pt-1">
                      {repo.lang && (
                        <div className="flex items-center gap-1">
                          <span className="w-2.5 h-2.5 rounded-full bg-[var(--accent)]" />
                          <span>{repo.lang}</span>
                        </div>
                      )}
                      {repo.stars != null && repo.stars > 0 && (
                        <div className="flex items-center gap-0.5">
                          <Star className="w-3 h-3 text-[var(--attention)]" />
                          <span>{repo.stars}</span>
                        </div>
                      )}
                      <div className="flex items-center gap-0.5">
                        <GitFork className="w-3 h-3" />
                        <span>Public</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="kw-card p-6 max-w-md w-full bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
              <div className="flex items-center gap-2 text-[var(--danger)] font-bold text-sm">
                <Flag className="w-4 h-4 text-red-500" />
                <span>Report {profile.name}</span>
              </div>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="text-[var(--fg-muted)] hover:text-[var(--fg)] p-1 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
              Reports are sent directly to the organizer dashboard for review. False reports or harassment violate our Code of Conduct.
            </p>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-[var(--fg)]">Reason for report</label>
              <select
                value={reportReason}
                onChange={e => setReportReason(e.target.value)}
                className="w-full p-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)] text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--gold)]"
              >
                <option>Inappropriate content or offensive language</option>
                <option>Spam, advertising, or unsolicited promotion</option>
                <option>Fake identity, impersonation, or deceptive credentials</option>
                <option>Harassment, threats, or safety concern</option>
                <option>Other policy violation</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[var(--fg)]">Additional context (optional)</label>
              <textarea
                value={reportDetails}
                onChange={e => setReportDetails(e.target.value)}
                placeholder="Describe what occurred or paste relevant details..."
                rows={3}
                className="w-full p-2.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)] text-xs text-[var(--fg)] focus:outline-none focus:border-[var(--gold)] resize-none"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--card-border)]">
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="kw-btn kw-btn-ghost text-xs py-2 px-3.5 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isReporting}
                onClick={handleSubmitReport}
                className="kw-btn text-xs py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                {isReporting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Submitting...</span>
                  </>
                ) : (
                  <>
                    <Flag className="w-3.5 h-3.5" />
                    <span>Submit Report</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Block Modal */}
      {showBlockModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in">
          <div className="kw-card p-6 max-w-md w-full bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
              <div className="flex items-center gap-2 text-[var(--fg)] font-bold text-sm">
                <Ban className="w-4 h-4 text-red-500" />
                <span>Block {profile.name}?</span>
              </div>
              <button
                type="button"
                onClick={() => setShowBlockModal(false)}
                className="text-[var(--fg-muted)] hover:text-[var(--fg)] p-1 rounded-md cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
              When you block <strong>{profile.name}</strong>:
            </p>
            <ul className="text-xs text-[var(--fg-muted)] list-disc pl-5 space-y-1">
              <li>They will not appear in your recommended matches.</li>
              <li>They cannot connect with you via WhatsApp or notifications.</li>
              <li>Their posts will be filtered from your collaborative feed.</li>
            </ul>

            <div className="flex justify-end gap-2 pt-2 border-t border-[var(--card-border)]">
              <button
                type="button"
                onClick={() => setShowBlockModal(false)}
                className="kw-btn kw-btn-ghost text-xs py-2 px-3.5 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmBlock}
                className="kw-btn text-xs py-2 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Ban className="w-3.5 h-3.5" />
                <span>Block Member</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
