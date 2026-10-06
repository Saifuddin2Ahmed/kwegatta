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
  Layers
} from 'lucide-react';
import { Profile, MatchResult } from '../types';
import {
  buildProfileWithGemma,
  matchCandidatesWithGemma,
  db,
  exportMemberData,
  deleteMemberProfile,
  requestMemberConnect,
  reportMember
} from '../services/api';
import { generateQrCodeDataUrl, formatWhatsAppUrl, resizeImageFile } from '../utils';
import { Avatar } from './Avatar';

interface ProfileViewProps {
  profile: Profile;
  currentProfile: Profile | null;
  followersCount: number;
  followingCount: number;
  isFollowing: boolean;
  onToggleFollow: () => void;
  onUpdateProfile: (updated: Profile) => void;
  onDeleteProfile?: () => void;
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
  onToast
}) => {
  const isMine = currentProfile?.id === profile.id;
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
  const [isEditing, setIsEditing] = useState(false);
  const [pairMatch, setPairMatch] = useState<MatchResult | null>(null);
  const [isCheckingMatch, setIsCheckingMatch] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDeleteInput, setConfirmDeleteInput] = useState('');
  const [isConnecting, setIsConnecting] = useState(false);

  // Photo state machine: preview at once -> processing -> photo saved -> error with try again
  const [photoStatus, setPhotoStatus] = useState<'idle' | 'processing' | 'saved' | 'error'>('idle');
  const [photoPreviewUrl, setPhotoPreviewUrl] = useState<string | null>(null);
  const [photoErrorMsg, setPhotoErrorMsg] = useState<string | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const selfieInputRef = useRef<HTMLInputElement>(null);

  // Safety: Report & Block state
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState('Inappropriate content or offensive language');
  const [reportDetails, setReportDetails] = useState('');
  const [isReporting, setIsReporting] = useState(false);
  const [showBlockModal, setShowBlockModal] = useState(false);
  const isBlocked = Boolean(currentProfile?.blocked_ids?.includes(profile.id));
  const isBlockedByThem = Boolean(currentProfile && profile.blocked_ids?.includes(currentProfile.id));

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
  const [gemmaInstruction, setGemmaInstruction] = useState('');
  const [isRewriting, setIsRewriting] = useState(false);

  useEffect(() => {
    const profileUrl = `${window.location.origin}${window.location.pathname}#/u/${profile.id}`;
    generateQrCodeDataUrl(profileUrl, 240).then(setQrCodeDataUrl);
  }, [profile.id]);

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
        hide_whatsapp: editHideWhatsApp
      };

      await db.update('profiles', profile.id, updated);
      onUpdateProfile(updated);
      setIsEditing(false);
      onToast('Profile updated successfully');
    } catch (err) {
      onToast('Failed to save profile changes');
    }
  };

  const handlePhotoFile = async (file: File) => {
    if (!file) return;

    // 1. Show preview at once
    const tempUrl = URL.createObjectURL(file);
    setPhotoPreviewUrl(tempUrl);
    setPhotoStatus('processing');
    setPhotoErrorMsg(null);

    try {
      // 2. Resize and store with profile in Firestore
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
    // reset input value so re-selecting same photo triggers onChange
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
    const url = `${window.location.origin}${window.location.pathname}#/u/${profile.id}`;
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

      // Log notification to target member
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
    <div className="max-w-4xl mx-auto space-y-6">
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
            <p className="text-[11px] text-[var(--fg)]">
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

            {/* Requirement 4: On "My profile", make "Change photo" a visible button */}
            {isMine && (
              <div className="mt-2.5">
                <label className="primer-btn text-xs py-1.5 px-3.5 flex items-center gap-1.5 cursor-pointer font-medium hover:border-[var(--gold)] active:scale-95 transition-all">
                  <Camera className="w-3.5 h-3.5 text-[var(--gold)]" />
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
              {profile.github && (
                <div className="text-sm text-[var(--muted)] font-normal">@{profile.github}</div>
              )}
              <div className="flex flex-wrap gap-1.5 mt-2 justify-center md:justify-start">
                <span className="primer-label primer-label-blue text-xs">{profile.role}</span>
                {profile.status && (
                  <span className="primer-label primer-label-green text-xs">{profile.status}</span>
                )}
              </div>
            </div>
          </div>

          <p className="text-xs text-[var(--fg)] leading-relaxed">
            {profile.bio || profile.headline}
          </p>

          {/* Social counts */}
          <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
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

          {/* Connect / Edit Actions */}
          <div className="space-y-2">
            {isMine ? (
              <div className="flex gap-2">
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className="primer-btn text-xs py-1.5 flex-1"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>{isEditing ? 'Close editor' : 'Edit profile'}</span>
                </button>
                <button
                  onClick={handleShareLink}
                  className="primer-btn text-xs py-1.5 px-3"
                  title="Share profile link"
                >
                  <Share2 className="w-3.5 h-3.5 text-[var(--muted)]" />
                </button>
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

                  {/* Requirement 1: "More" menu next to Connect and Follow with Report and Block */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowMoreMenu(!showMoreMenu)}
                      className="primer-btn text-xs py-1.5 px-2.5 flex items-center gap-1 cursor-pointer"
                      title="More actions"
                      aria-label="More actions"
                    >
                      <span>More</span>
                      <span className="text-[10px]">▾</span>
                    </button>

                    {showMoreMenu && (
                      <div className="absolute right-0 top-full mt-1.5 w-44 bg-[var(--card)] border border-[var(--card-border)] rounded-xl shadow-2xl z-40 py-1.5 text-xs animate-in fade-in zoom-in-95">
                        <button
                          type="button"
                          onClick={() => {
                            setShowMoreMenu(false);
                            handleShareLink();
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-[var(--bg-subtle)] flex items-center gap-2 text-[var(--fg)] cursor-pointer"
                        >
                          <Share2 className="w-3.5 h-3.5 text-[var(--fg-muted)]" />
                          <span>Share profile</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setShowMoreMenu(false);
                            setShowReportModal(true);
                          }}
                          className="w-full text-left px-3 py-2 hover:bg-[var(--bg-subtle)] flex items-center gap-2 text-red-500 hover:text-red-600 font-medium cursor-pointer"
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
                          className="w-full text-left px-3 py-2 hover:bg-[var(--bg-subtle)] flex items-center gap-2 text-[var(--fg-muted)] hover:text-red-500 cursor-pointer"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>{isBlocked ? 'Unblock member' : 'Block member'}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Direct visible safety actions */}
                <div className="flex items-center gap-3 pt-1 text-[11px] text-[var(--fg-muted)]">
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
                    onClick={() => isBlocked ? handleUnblock() : setShowBlockModal(true)}
                    className="hover:text-red-500 flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    <Ban className="w-3 h-3" />
                    <span>{isBlocked ? 'Unblock' : 'Block'}</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Digital Public Goods: Data & Privacy Controls */}
          {isMine && (
            <div className="primer-box p-3 bg-[var(--subtle)] space-y-2.5 text-xs">
              <div className="font-semibold text-[11px] text-[var(--muted)] uppercase tracking-wider flex items-center justify-between">
                <span>Data & Privacy</span>
                <span className="primer-label primer-label-green text-[10px]">DPG Aligned</span>
              </div>
              <p className="text-[11px] text-[var(--muted)] leading-relaxed">
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

          {/* Badges / Highlights */}
          <div className="primer-box p-3 bg-[var(--subtle)] space-y-2 text-xs">
            <div className="font-semibold text-[11px] text-[var(--muted)] uppercase tracking-wider">
              Achievements & Badges
            </div>
            <div className="space-y-1.5">
              <div className="flex items-center gap-2 text-xs text-[var(--fg)]">
                <Award className="w-4 h-4 text-[var(--attention)] flex-shrink-0" />
                <span>Hack Day Kampala x MUBS 2026</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-[var(--fg)]">
                <Sparkles className="w-4 h-4 text-[var(--done)] flex-shrink-0" />
                <span>Gemma 4 Verified Profile</span>
              </div>
            </div>
          </div>

          {/* Links list */}
          <div className="space-y-1.5 text-xs text-[var(--muted)] pt-2 border-t border-[var(--border-muted)]">
            {profile.github && (
              <div className="flex items-center gap-2">
                <Github className="w-3.5 h-3.5 flex-shrink-0" />
                <a
                  href={`https://github.com/${profile.github}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate hover:underline"
                >
                  github.com/{profile.github}
                </a>
              </div>
            )}
            {profile.linkedin && (
              <div className="flex items-center gap-2">
                <LinkIcon className="w-3.5 h-3.5 flex-shrink-0" />
                <a
                  href={profile.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate hover:underline"
                >
                  LinkedIn Profile
                </a>
              </div>
            )}
            {profile.whatsapp ? (
              <div className="flex items-center gap-2">
                <MessageCircle className="w-3.5 h-3.5 flex-shrink-0 text-[var(--success)]" />
                <a
                  href={formatWhatsAppUrl(profile.whatsapp, `Hi ${profile.name.split(' ')[0]}, I found your profile on Kwegatta!`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="truncate hover:underline text-[var(--success)] font-medium"
                >
                  WhatsApp: {profile.whatsapp}
                </a>
              </div>
            ) : profile.hide_whatsapp && !isMine ? (
              <div className="flex items-center gap-2 text-[var(--fg-muted)]">
                <MessageCircle className="w-3.5 h-3.5 flex-shrink-0 opacity-50" />
                <span>WhatsApp: Hidden by member</span>
              </div>
            ) : !currentProfile ? (
              <div className="flex items-center gap-2 text-[var(--gold)]">
                <MessageCircle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>WhatsApp: (Sign in to view)</span>
              </div>
            ) : null}
          </div>

          {/* Dynamic Profile QR Code with fullscreen modal button */}
          <div className="primer-box p-3 text-center space-y-2 bg-[var(--subtle)]">
            <div className="font-semibold text-xs flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <QrCode className="w-3.5 h-3.5 text-[var(--accent)]" />
                <span>{isMine ? 'Your Profile QR Code' : 'Scan to Connect'}</span>
              </span>
              <button
                onClick={() => setShowQrModal(true)}
                className="primer-btn text-[10px] py-0.5 px-1.5"
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
            <p className="text-[11px] text-[var(--muted)]">
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
            <div className="primer-box p-4 bg-[var(--subtle)] space-y-3.5 border-2 border-[var(--accent)]">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Edit3 className="w-4 h-4 text-[var(--accent)]" />
                <span>Edit Profile</span>
              </h3>

              <div className="space-y-2.5">
                <div>
                  <label className="block text-xs font-medium text-[var(--muted)] mb-1">
                    Headline (max 8 words)
                  </label>
                  <input
                    type="text"
                    value={editHeadline}
                    onChange={e => setEditHeadline(e.target.value)}
                    className="primer-input text-xs"
                    maxLength={100}
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--muted)] mb-1">
                    Bio (2 sentences)
                  </label>
                  <textarea
                    value={editBio}
                    onChange={e => setEditBio(e.target.value)}
                    className="primer-textarea text-xs"
                    rows={2}
                    maxLength={400}
                  />
                </div>

                {/* Rewrite with Gemma helper */}
                <div className="p-3 bg-[var(--bg)] rounded border border-[var(--border)] space-y-2">
                  <div className="text-xs font-medium text-[var(--fg)] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-[var(--done)]" />
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
                      className="primer-btn text-xs py-1 px-3"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${isRewriting ? 'animate-spin' : ''}`} />
                      <span>{isRewriting ? 'Writing...' : 'Rewrite'}</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--muted)] mb-1">
                      What you OFFER
                    </label>
                    <textarea
                      value={editOffers}
                      onChange={e => setEditOffers(e.target.value)}
                      className="primer-textarea text-xs"
                      rows={2}
                      maxLength={400}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--muted)] mb-1">
                      What you NEED
                    </label>
                    <textarea
                      value={editNeeds}
                      onChange={e => setEditNeeds(e.target.value)}
                      className="primer-textarea text-xs"
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
                      className="primer-input text-xs"
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
                      className="primer-input text-xs"
                      maxLength={200}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[var(--muted)] mb-1">
                      Status
                    </label>
                    <select
                      value={editStatus}
                      onChange={e => setEditStatus(e.target.value)}
                      className="primer-select text-xs"
                    >
                      <option>Open to projects</option>
                      <option>Looking for a co-founder</option>
                      <option>Looking for a team</option>
                      <option>Looking for a mentor</option>
                      <option>Looking for collaborators</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--muted)] mb-1">
                      WhatsApp number
                    </label>
                    <input
                      type="tel"
                      value={editWhatsApp}
                      onChange={e => setEditWhatsApp(e.target.value)}
                      placeholder="+256 700 000000"
                      className="primer-input text-xs"
                      maxLength={25}
                    />
                    <label className="flex items-center gap-2 mt-2 text-xs text-[var(--fg)] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!editHideWhatsApp}
                        onChange={e => setEditHideWhatsApp(!e.target.checked)}
                        className="rounded border-[var(--card-border)] text-[var(--gold)] focus:ring-[var(--gold)]"
                      />
                      <span>Visible to other signed-in members (recommended)</span>
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border)]">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="primer-btn text-xs py-1 px-3"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveProfile}
                  className="primer-btn primer-btn-primary text-xs py-1 px-4"
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
                <span className="primer-label primer-label-green text-[10px]">What I bring</span>
              </div>
              <p className="text-xs text-[var(--fg)] leading-relaxed">
                {profile.offers || 'No offers described yet.'}
              </p>
              {profile.teaches && (
                <div className="text-[11px] text-[var(--muted)] pt-2 border-t border-[var(--border-muted)]">
                  <strong className="text-[var(--fg)]">Can teach: </strong>
                  <span>{profile.teaches}</span>
                </div>
              )}
            </div>

            <div className="primer-box p-3.5 space-y-2">
              <div className="primer-box-header -mx-3.5 -mt-3.5 mb-2.5 py-2 px-3 text-xs font-semibold flex items-center justify-between">
                <span>Needs</span>
                <span className="primer-label primer-label-amber text-[10px]">What I seek</span>
              </div>
              <p className="text-xs text-[var(--fg)] leading-relaxed">
                {profile.needs || 'No specific needs listed yet.'}
              </p>
              {profile.learns && (
                <div className="text-[11px] text-[var(--muted)] pt-2 border-t border-[var(--border-muted)]">
                  <strong className="text-[var(--fg)]">Wants to learn: </strong>
                  <span>{profile.learns}</span>
                </div>
              )}
            </div>
          </div>

          {/* Skills and Tags */}
          {(profile.tags?.length > 0 || profile.skills?.length > 0) && (
            <div className="primer-box p-3.5 space-y-2.5">
              <div className="font-semibold text-xs text-[var(--fg)]">Tags & Skills</div>
              <div className="flex flex-wrap gap-1.5">
                {profile.tags?.map(t => (
                  <span key={t} className="primer-tag text-xs">
                    #{t}
                  </span>
                ))}
              </div>
              {profile.skills?.length > 0 && (
                <div className="text-xs text-[var(--muted)] pt-2 border-t border-[var(--border-muted)]">
                  <strong className="text-[var(--fg)]">Core competencies: </strong>
                  <span>{profile.skills.join(', ')}</span>
                </div>
              )}
            </div>
          )}

          {/* GitHub Activity / Contribution Grid Simulation */}
          <div className="primer-box p-3.5 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold">Hack Day Activity & Commit Stream</span>
              <span className="text-[11px] text-[var(--muted)]">October 2026</span>
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
            <div className="flex items-center justify-between text-[10px] text-[var(--muted)] pt-1">
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
                <span className="text-[11px] text-[var(--muted)]">
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
                      <p className="text-[11px] text-[var(--muted)] line-clamp-2 mt-1">
                        {repo.desc || 'No repository description provided.'}
                      </p>
                    </div>

                    <div className="flex items-center gap-3 text-[11px] text-[var(--muted)] pt-1">
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
