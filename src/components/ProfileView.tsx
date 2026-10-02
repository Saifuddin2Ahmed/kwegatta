import React, { useState, useEffect } from 'react';
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
  Share2,
  Award,
  Maximize2,
  X,
  GitFork,
  Download,
  Trash2,
  AlertCircle
} from 'lucide-react';
import { Profile, MatchResult } from '../types';
import {
  buildProfileWithGemma,
  matchCandidatesWithGemma,
  db,
  exportMemberData,
  deleteMemberProfile,
  requestMemberConnect
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

  // Edit form state
  const [editHeadline, setEditHeadline] = useState(profile.headline || '');
  const [editBio, setEditBio] = useState(profile.bio || '');
  const [editOffers, setEditOffers] = useState(profile.offers || '');
  const [editNeeds, setEditNeeds] = useState(profile.needs || '');
  const [editTeaches, setEditTeaches] = useState(profile.teaches || '');
  const [editLearns, setEditLearns] = useState(profile.learns || '');
  const [editStatus, setEditStatus] = useState(profile.status || 'Open to projects');
  const [editWhatsApp, setEditWhatsApp] = useState(profile.whatsapp || '');
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
        whatsapp: editWhatsApp.replace(/[^\d+]/g, '')
      };

      await db.update('profiles', profile.id, updated);
      onUpdateProfile(updated);
      setIsEditing(false);
      onToast('Profile updated successfully');
    } catch (err) {
      onToast('Failed to save profile changes');
    }
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const resized = await resizeImageFile(file);
      const updated = { ...profile, avatar: resized };
      await db.update('profiles', profile.id, { avatar: resized });
      onUpdateProfile(updated);
      onToast('Profile photo updated');
    } catch (err) {
      onToast('Failed to update photo');
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
    try {
      setIsConnecting(true);
      const requesterId = currentProfile ? currentProfile.id : 'guest';
      const res = await requestMemberConnect(
        requesterId,
        profile.id,
        'Let\'s build together!'
      );

      if (res.whatsapp) {
        const url = formatWhatsAppUrl(
          res.whatsapp,
          `Hi ${profile.name.split(' ')[0]}, I'm ${currentProfile ? currentProfile.name : 'a fellow builder'} on Kwegatta. Let's connect!`
        );
        window.open(url, '_blank', 'noopener,noreferrer');
        onToast(`Connected with ${profile.name}! Opening WhatsApp...`);
      } else if (res.linkedin || profile.linkedin) {
        window.open(res.linkedin || profile.linkedin, '_blank', 'noopener,noreferrer');
        onToast(`Opening LinkedIn for ${profile.name}...`);
      } else {
        onToast(`${profile.name} has not set a contact link yet.`);
      }
    } catch (err: any) {
      onToast(err.message || 'Error establishing connection');
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
                profile={profile}
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
              <div className="flex gap-2">
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
            {profile.whatsapp && (
              <div className="flex items-center gap-2">
                <MessageCircle className="w-3.5 h-3.5 flex-shrink-0 text-[var(--success)]" />
                <span>WhatsApp: {profile.whatsapp}</span>
              </div>
            )}
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
                      <option>Hiring builders</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[var(--muted)] mb-1">
                      WhatsApp number (visible on profile)
                    </label>
                    <input
                      type="tel"
                      value={editWhatsApp}
                      onChange={e => setEditWhatsApp(e.target.value)}
                      className="primer-input text-xs"
                      maxLength={25}
                    />
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
    </div>
  );
};
