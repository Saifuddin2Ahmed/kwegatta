import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Lock,
  Users,
  Zap,
  MessageSquare,
  Bell,
  Cpu,
  BarChart3,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Eye,
  EyeOff,
  Trash2,
  Download,
  Send,
  RefreshCw,
  Search,
  Sparkles,
  Award,
  ExternalLink,
  ChevronRight,
  Settings,
  Camera,
  Upload,
  Flag,
  Calendar,
  Plus,
  Ban,
  Check,
  UserCheck,
  Mail,
  Megaphone,
  X
} from 'lucide-react';
import { Profile, Post, EventOpportunityItem } from '../types';
import { SetupView } from './SetupView';
import { EventPhotosModal } from './EventPhotosModal';
import { useEventPhotos } from '../hooks/useEventPhotos';
import {
  callGemma,
  GEMMA_MODEL_ID,
  fetchAdminStatus,
  fetchAdminEmails,
  addAdminEmail,
  removeAdminEmail,
  suspendMember,
  unsuspendMember,
  fetchEvents,
  createEvent,
  updateEvent,
  deleteEvent,
  pinAnnouncement,
  unpinAnnouncement,
  fetchPinnedAnnouncement,
  getAuthHeaders
} from '../services/api';
import { auth } from '../services/firebase';

interface AdminOverviewData {
  members_count: number;
  active_members_count: number;
  hidden_members_count: number;
  joined_last_hour: number;
  matches_count: number;
  connect_requests_count: number;
  posts_count: number;
  follows_count: number;
  members_by_role: { builder: number; business: number; design: number; other: number };
  top_tags: Array<{ tag: string; count: number }>;
  signups_over_time: Array<{ time: string; count: number }>;
  insights: {
    most_needed_skills: string[];
    most_offered_skills: string[];
    unmet_needs: string[];
  };
  ai_health: {
    calls_today: number;
    success_rate: number;
    fallback_rate: number;
    avg_response_time_ms: number;
  };
}

interface AdminViewProps {
  onBack: () => void;
  onRefreshGlobalData: () => void;
  onToast: (msg: string) => void;
  onOpenSignIn?: () => void;
}

export const AdminView: React.FC<AdminViewProps> = ({
  onBack,
  onRefreshGlobalData,
  onToast,
  onOpenSignIn
}) => {
  // Admin identity state
  const [adminStatus, setAdminStatus] = useState<{
    isAdmin: boolean;
    adminName: string;
    adminEmail: string;
    fallbackEnabled: boolean;
  } | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Fallback passcode login state
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [adminToken, setAdminToken] = useState<string | null>(() => sessionStorage.getItem('kw_admin_token'));
  const [showFallbackForm, setShowFallbackForm] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Tabs state
  const [activeTab, setActiveTab] = useState<
    'overview' | 'events' | 'admins' | 'members' | 'reports' | 'posts' | 'photos' | 'ai' | 'tools' | 'setup' | 'audit'
  >('overview');

  const photos = useEventPhotos();
  const [overview, setOverview] = useState<AdminOverviewData | null>(null);
  const [members, setMembers] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Search & Filter state
  const [memberSearch, setMemberSearch] = useState('');
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [revealedPhones, setRevealedPhones] = useState<Set<string>>(new Set());

  // Announcement state
  const [announcementText, setAnnouncementText] = useState('');
  const [isSendingAnnouncement, setIsSendingAnnouncement] = useState(false);

  // Test Gemma State
  const [gemmaTestStatus, setGemmaTestStatus] = useState<string | null>(null);
  const [isTestingGemma, setIsTestingGemma] = useState(false);
  const [isPhotosModalOpen, setIsPhotosModalOpen] = useState(false);

  // Events & Opportunities Admin State
  const [adminEvents, setAdminEvents] = useState<any[]>([]);
  const [isCreatingEvent, setIsCreatingEvent] = useState(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventKind, setEventKind] = useState<'event' | 'opportunity'>('event');
  const [eventTitle, setEventTitle] = useState('');
  const [eventDesc, setEventDesc] = useState('');
  const [eventDatetime, setEventDatetime] = useState('');
  const [eventLocation, setEventLocation] = useState('');
  const [eventCoverImage, setEventCoverImage] = useState('');
  const [eventRegLink, setEventRegLink] = useState('');
  const [oppType, setOppType] = useState<string>('Grant');
  const [oppDeadline, setOppDeadline] = useState('');
  const [oppLink, setOppLink] = useState('');
  const [eventPublished, setEventPublished] = useState(true);
  const [viewingAttendeesEvent, setViewingAttendeesEvent] = useState<any | null>(null);

  // Pinned Announcement state
  const [pinnedAnnouncement, setPinnedAnnouncement] = useState<any | null>(null);
  const [pinText, setPinText] = useState('');
  const [pinLink, setPinLink] = useState('');

  // Admin Accounts State
  const [adminAccounts, setAdminAccounts] = useState<{
    admin_emails: string[];
    env_admins: string[];
    stored_admins: string[];
  }>({ admin_emails: [], env_admins: [], stored_admins: [] });
  const [newAdminEmail, setNewAdminEmail] = useState('');

  // Check admin status on mount and when auth / token changes
  const checkStatus = async () => {
    setCheckingAuth(true);
    try {
      const status = await fetchAdminStatus();
      setAdminStatus(status);
    } catch {
      setAdminStatus(null);
    } finally {
      setCheckingAuth(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, [adminToken]);

  const isAuthorized = Boolean(adminStatus?.isAdmin || adminToken);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifying(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Wrong username or password');
      }

      setAdminToken(data.token);
      sessionStorage.setItem('kw_admin_token', data.token);
      onToast('Emergency fallback admin session started');
      await checkStatus();
    } catch (err: any) {
      setErrorMsg(err.message || 'Wrong username or password');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleLogout = () => {
    setAdminToken(null);
    sessionStorage.removeItem('kw_admin_token');
    onToast('Locked admin dashboard');
    checkStatus();
  };

  const fetchAdminData = async () => {
    if (!isAuthorized) return;
    setIsLoadingData(true);

    try {
      const headers = getAuthHeaders(adminToken ? { 'x-admin-token': adminToken } : {});
      const [ovRes, memRes, postRes, logRes, repRes, evRes, admRes, pinRes] = await Promise.all([
        fetch('/api/admin/overview', { headers }),
        fetch('/api/admin/members', { headers }),
        fetch('/api/admin/posts', { headers }),
        fetch('/api/admin/audit-log', { headers }),
        fetch('/api/admin/reports', { headers }),
        fetch('/api/events', { headers }),
        fetch('/api/admin/admins', { headers }).catch(() => null),
        fetchPinnedAnnouncement()
      ]);

      if (ovRes.status === 401 || memRes.status === 401) {
        handleLogout();
        throw new Error('Admin session expired or unauthorized.');
      }

      if (ovRes.ok) setOverview(await ovRes.json());
      if (memRes.ok) setMembers(await memRes.json());
      if (postRes.ok) setPosts(await postRes.json());
      if (logRes.ok) setAuditLog(await logRes.json());
      if (repRes.ok) setReports(await repRes.json());
      if (evRes.ok) setAdminEvents(await evRes.json());
      if (admRes && admRes.ok) setAdminAccounts(await admRes.json());
      if (pinRes) setPinnedAnnouncement(pinRes);
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    if (isAuthorized) {
      fetchAdminData();
    }
  }, [isAuthorized]);

  const handleAdminAction = async (action: string, payload: any) => {
    try {
      const headers = getAuthHeaders({
        'Content-Type': 'application/json',
        ...(adminToken ? { 'x-admin-token': adminToken } : {})
      });
      const res = await fetch('/api/admin/action', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action, ...payload })
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Action failed');
      }

      onToast(`Action completed: ${action}`);
      fetchAdminData();
      onRefreshGlobalData();
    } catch (err: any) {
      onToast('Action error: ' + err.message);
    }
  };

  // Suspend Member
  const handleSuspendMember = async (memberId: string) => {
    try {
      const ok = await suspendMember(memberId);
      if (ok) {
        onToast('Member suspended. Hidden from directory and matching.');
        fetchAdminData();
        onRefreshGlobalData();
      }
    } catch (err: any) {
      onToast('Failed to suspend member: ' + err.message);
    }
  };

  // Unsuspend Member
  const handleUnsuspendMember = async (memberId: string) => {
    try {
      const ok = await unsuspendMember(memberId);
      if (ok) {
        onToast('Member unsuspended and restored.');
        fetchAdminData();
        onRefreshGlobalData();
      }
    } catch (err: any) {
      onToast('Failed to unsuspend member: ' + err.message);
    }
  };

  // Admin Account Actions
  const handleAddAdminEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAdminEmail || !newAdminEmail.includes('@')) {
      onToast('Enter a valid email address');
      return;
    }
    try {
      await addAdminEmail(newAdminEmail.trim());
      onToast(`Added ${newAdminEmail} as administrator`);
      setNewAdminEmail('');
      const fresh = await fetchAdminEmails();
      setAdminAccounts(fresh);
      fetchAdminData();
    } catch (err: any) {
      onToast('Failed to add admin: ' + err.message);
    }
  };

  const handleRemoveAdminEmail = async (email: string) => {
    if (!confirm(`Remove admin permissions for ${email}?`)) return;
    try {
      await removeAdminEmail(email);
      onToast(`Removed admin permissions for ${email}`);
      const fresh = await fetchAdminEmails();
      setAdminAccounts(fresh);
      fetchAdminData();
    } catch (err: any) {
      onToast('Failed to remove admin: ' + err.message);
    }
  };

  // Event Actions
  const handleSaveEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!eventTitle.trim() || !eventDesc.trim()) {
      onToast('Title and description are required');
      return;
    }

    try {
      const itemPayload: any = {
        kind: eventKind,
        title: eventTitle.trim(),
        description: eventDesc.trim(),
        published: eventPublished
      };

      if (eventKind === 'event') {
        itemPayload.datetime = eventDatetime.trim();
        itemPayload.location = eventLocation.trim();
        itemPayload.cover_image = eventCoverImage.trim() || undefined;
        itemPayload.registration_link = eventRegLink.trim() || undefined;
      } else {
        itemPayload.opportunity_type = oppType;
        itemPayload.deadline = oppDeadline.trim();
        itemPayload.link = oppLink.trim() || undefined;
      }

      if (editingEventId) {
        await updateEvent(editingEventId, itemPayload);
        onToast('Item updated successfully');
      } else {
        await createEvent(itemPayload);
        onToast(eventPublished ? 'Item published! Members notified.' : 'Draft saved.');
      }

      resetEventForm();
      fetchAdminData();
      onRefreshGlobalData();
    } catch (err: any) {
      onToast('Failed to save item: ' + err.message);
    }
  };

  const resetEventForm = () => {
    setIsCreatingEvent(false);
    setEditingEventId(null);
    setEventKind('event');
    setEventTitle('');
    setEventDesc('');
    setEventDatetime('');
    setEventLocation('');
    setEventCoverImage('');
    setEventRegLink('');
    setOppType('Grant');
    setOppDeadline('');
    setOppLink('');
    setEventPublished(true);
  };

  const handleEditEventClick = (item: any) => {
    setEditingEventId(item.id);
    setEventKind(item.kind);
    setEventTitle(item.title || '');
    setEventDesc(item.description || '');
    setEventPublished(item.published !== false);
    if (item.kind === 'event') {
      setEventDatetime(item.datetime || '');
      setEventLocation(item.location || '');
      setEventCoverImage(item.cover_image || '');
      setEventRegLink(item.registration_link || '');
    } else {
      setOppType(item.opportunity_type || 'Grant');
      setOppDeadline(item.deadline || '');
      setOppLink(item.link || '');
    }
    setIsCreatingEvent(true);
  };

  const handleTogglePublish = async (item: any) => {
    try {
      const nextPublished = !item.published;
      await updateEvent(item.id, { published: nextPublished });
      onToast(nextPublished ? 'Item published! Members notified.' : 'Item unpublished.');
      fetchAdminData();
      onRefreshGlobalData();
    } catch (err: any) {
      onToast('Failed to update status: ' + err.message);
    }
  };

  const handleDeleteEvent = async (id: string, title: string) => {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    try {
      await deleteEvent(id);
      onToast('Deleted item');
      fetchAdminData();
      onRefreshGlobalData();
    } catch (err: any) {
      onToast('Failed to delete: ' + err.message);
    }
  };

  // Pin Announcement Actions
  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinText.trim()) return;
    try {
      await pinAnnouncement(pinText.trim(), pinLink.trim() || undefined);
      onToast('Pinned announcement for all members');
      setPinText('');
      setPinLink('');
      fetchAdminData();
    } catch (err: any) {
      onToast('Failed to pin: ' + err.message);
    }
  };

  const handleUnpinSubmit = async () => {
    try {
      await unpinAnnouncement();
      onToast('Announcement unpinned');
      setPinnedAnnouncement(null);
      fetchAdminData();
    } catch (err: any) {
      onToast('Failed to unpin: ' + err.message);
    }
  };

  const handleTogglePhoneReveal = (memberId: string) => {
    setRevealedPhones(prev => {
      const next = new Set(prev);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return next;
    });
  };

  const handleSendAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!announcementText.trim()) return;
    setIsSendingAnnouncement(true);
    await handleAdminAction('send_announcement', { message: announcementText.trim() });
    setAnnouncementText('');
    setIsSendingAnnouncement(false);
  };

  const handleTestGemmaAI = async () => {
    setIsTestingGemma(true);
    setGemmaTestStatus(null);
    try {
      const res = await callGemma('Confirm Gemma 4 is operational for Hack Day Kampala x MUBS. Answer in 5 words.');
      setGemmaTestStatus(`Success: ${res}`);
      onToast('Gemma 4 responded successfully');
    } catch (err: any) {
      setGemmaTestStatus(`Error: ${err.message}`);
      onToast('Gemma test failed: ' + err.message);
    } finally {
      setIsTestingGemma(false);
    }
  };

  const handleExport = (type: 'members' | 'matches', format: 'csv' | 'json') => {
    const tokenParam = adminToken ? `&token=${encodeURIComponent(adminToken)}` : '';
    window.open(`/api/admin/export?type=${type}&format=${format}${tokenParam}`, '_blank');
  };

  const handleExportEventAttendees = (eventId: string) => {
    const tokenParam = adminToken ? `?token=${encodeURIComponent(adminToken)}` : '';
    window.open(`/api/events/${encodeURIComponent(eventId)}/export${tokenParam}`, '_blank');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      const text = await file.text();
      const parsed = JSON.parse(text);

      const headers = getAuthHeaders({
        'Content-Type': 'application/json',
        ...(adminToken ? { 'x-admin-token': adminToken } : {})
      });
      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers,
        body: JSON.stringify(parsed)
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Import failed');
      }

      onToast(`✅ Successfully restored ${result.count} member profiles!`);
      onRefreshGlobalData();
    } catch (err: any) {
      onToast(`❌ Import error: ${err.message}`);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleReportAction = async (reportId: string, action: 'dismiss' | 'resolve') => {
    try {
      const headers = getAuthHeaders({
        'Content-Type': 'application/json',
        ...(adminToken ? { 'x-admin-token': adminToken } : {})
      });
      const res = await fetch(`/api/admin/reports/${reportId}/action`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        onToast(`Report marked as ${action}d`);
        setReports(prev =>
          prev.map(r => (r.id === reportId ? { ...r, status: action === 'dismiss' ? 'dismissed' : 'resolved' } : r))
        );
      }
    } catch (e: any) {
      onToast('Action failed: ' + e.message);
    }
  };

  // 1. Loading auth state
  if (checkingAuth) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 kw-card text-center space-y-4">
        <div className="w-8 h-8 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin mx-auto"></div>
        <p className="text-xs text-[var(--fg-muted)]">Verifying administrative access...</p>
      </div>
    );
  }

  // 2. Unauthenticated Admin View (Admins by Account requirement)
  if (!isAuthorized) {
    const currentFirebaseUser = auth.currentUser;

    return (
      <div className="max-w-md mx-auto my-12 p-6 sm:p-8 kw-card space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-amber-500/15 text-[var(--gold)] grid place-items-center mx-auto">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold font-display text-[var(--fg)]">
            Administrator Access Required
          </h2>
          <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
            Admin access is granted to accounts with authorized emails configured in the system.
          </p>
        </div>

        {currentFirebaseUser ? (
          <div className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--card-border)] space-y-3">
            <div className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
              <UserCheck className="w-4 h-4 text-[var(--gold)]" />
              <span>Signed in as:</span>
            </div>
            <p className="text-sm font-semibold font-mono text-[var(--fg)]">
              {currentFirebaseUser.email}
            </p>
            <div className="p-3 rounded-lg bg-[var(--danger-subtle)] border border-[var(--danger)] text-xs text-[var(--danger)] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                This account is not authorized. The first admin must have the email configured in the{' '}
                <code>ADMIN_EMAILS</code> environment variable.
              </span>
            </div>
            <button
              onClick={onOpenSignIn}
              className="kw-btn kw-btn-gold text-xs w-full py-2.5 font-semibold"
            >
              Sign In with a Different Account
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <button
              onClick={onOpenSignIn}
              className="kw-btn kw-btn-gold text-xs w-full py-2.5 font-bold flex items-center justify-center gap-2"
            >
              <Mail className="w-4 h-4" />
              <span>Sign In with Administrator Account</span>
            </button>
          </div>
        )}

        {/* Emergency fallback toggle (ADMIN_FALLBACK=true) */}
        {adminStatus?.fallbackEnabled ? (
          <div className="pt-4 border-t border-[var(--card-border)] space-y-3">
            <button
              onClick={() => setShowFallbackForm(!showFallbackForm)}
              className="text-xs text-[var(--gold)] hover:underline flex items-center justify-between w-full font-medium"
            >
              <span>Emergency Fallback Login (Passcode)</span>
              <span>{showFallbackForm ? 'Hide' : 'Show'}</span>
            </button>

            {showFallbackForm && (
              <form onSubmit={handleLogin} className="space-y-3 pt-2">
                {errorMsg && (
                  <div className="p-2.5 rounded-lg bg-[var(--danger-subtle)] border border-[var(--danger)] text-xs text-[var(--danger)]">
                    {errorMsg}
                  </div>
                )}
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[var(--fg-muted)] block">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                    className="kw-input text-xs py-1.5"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-[var(--fg-muted)] block">Emergency Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    className="kw-input text-xs py-1.5"
                  />
                </div>
                <button
                  type="submit"
                  disabled={isVerifying || !username || !password}
                  className="kw-btn kw-btn-primary w-full text-xs py-2"
                >
                  {isVerifying ? 'Verifying...' : 'Sign In with Emergency Passcode'}
                </button>
              </form>
            )}
          </div>
        ) : (
          <p className="text-[11px] text-[var(--fg-muted)] text-center pt-2">
            Emergency passcode fallback is disabled (enable with <code>ADMIN_FALLBACK=true</code>).
          </p>
        )}
      </div>
    );
  }

  // 3. Authenticated Admin Dashboard
  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in pb-12">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 kw-card">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/15 text-[var(--gold)] grid place-items-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold font-display">Kwegatta Organiser Dashboard</h1>
              {adminStatus?.adminName && (
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/15 text-[var(--gold)] border border-amber-500/30">
                  {adminStatus.adminName}
                </span>
              )}
            </div>
            <p className="text-xs text-[var(--fg-muted)]">
              Event coordination, account permissions & attendee intelligence
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPhotosModalOpen(true)}
            className="kw-btn kw-btn-gold text-xs py-1.5 px-3 font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm"
            title="Manage and upload authentic event photos"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Manage Photos</span>
          </button>
          <button
            onClick={() => { window.location.hash = '#/wall'; }}
            className="kw-btn kw-btn-teal text-xs py-1.5 px-3 font-semibold"
            title="Open Live Projector Wall"
          >
            <span>Open Live Wall</span>
          </button>
          <button
            onClick={fetchAdminData}
            disabled={isLoadingData}
            className="kw-btn text-xs py-1.5 px-3"
            title="Refresh dashboard data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingData ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={handleLogout}
            className="kw-btn text-xs py-1.5 px-3 hover:text-rose-400"
          >
            Lock Dashboard
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-[var(--card-border)] pb-2 overflow-x-auto scrollbar-none">
        {[
          { id: 'overview', label: 'Overview', icon: BarChart3 },
          { id: 'events', label: `Events (${adminEvents.length})`, icon: Calendar },
          { id: 'admins', label: `Admins (${adminAccounts.admin_emails.length || 1})`, icon: Lock },
          { id: 'members', label: `Members (${overview?.members_count || 0})`, icon: Users },
          { id: 'reports', label: `Reports (${reports.filter(r => r.status === 'pending').length})`, icon: Flag },
          { id: 'posts', label: `Posts (${overview?.posts_count || 0})`, icon: MessageSquare },
          { id: 'photos', label: 'Photos', icon: Camera },
          { id: 'ai', label: 'AI Health', icon: Cpu },
          { id: 'tools', label: 'Broadcast', icon: Download },
          { id: 'setup', label: 'Setup', icon: Settings },
          { id: 'audit', label: `Audit Log (${auditLog.length})`, icon: ShieldCheck }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`kw-btn text-xs py-1.5 px-3 rounded-lg flex items-center gap-1.5 ${
                isActive ? 'kw-btn-gold' : ''
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB: EVENTS & OPPORTUNITIES */}
      {activeTab === 'events' && (
        <div className="space-y-6">
          {/* Top Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4 kw-card">
            <div>
              <h3 className="font-bold font-display text-sm text-[var(--fg)]">Events & Opportunities Manager</h3>
              <p className="text-xs text-[var(--fg-muted)]">
                Create items, track RSVP attendees, and pin global announcements.
              </p>
            </div>
            <button
              onClick={() => {
                if (isCreatingEvent) resetEventForm();
                else setIsCreatingEvent(true);
              }}
              className="kw-btn kw-btn-gold text-xs py-2 px-4 flex items-center gap-1.5 font-bold"
            >
              {isCreatingEvent ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
              <span>{isCreatingEvent ? 'Cancel Form' : 'Create New Item'}</span>
            </button>
          </div>

          {/* Form: Create or Edit Event/Opportunity */}
          {isCreatingEvent && (
            <div className="p-6 kw-card space-y-5 border-[var(--gold)]/40">
              <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
                <h4 className="font-bold text-sm text-[var(--fg)]">
                  {editingEventId ? 'Edit Item' : 'New Event or Opportunity'}
                </h4>
                {/* Kind switcher */}
                <div className="inline-flex rounded-lg border border-[var(--card-border)] bg-[var(--bg)] p-0.5">
                  <button
                    type="button"
                    onClick={() => setEventKind('event')}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                      eventKind === 'event' ? 'bg-[var(--gold)] text-[#090D16] font-bold' : 'text-[var(--fg-muted)]'
                    }`}
                  >
                    Event
                  </button>
                  <button
                    type="button"
                    onClick={() => setEventKind('opportunity')}
                    className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                      eventKind === 'opportunity' ? 'bg-[var(--gold)] text-[#090D16] font-bold' : 'text-[var(--fg-muted)]'
                    }`}
                  >
                    Opportunity
                  </button>
                </div>
              </div>

              <form onSubmit={handleSaveEvent} className="space-y-4 text-xs">
                <div>
                  <label className="font-semibold text-[var(--fg)] block mb-1">Title *</label>
                  <input
                    type="text"
                    value={eventTitle}
                    onChange={e => setEventTitle(e.target.value)}
                    placeholder={eventKind === 'event' ? 'e.g. Hack Day Kampala x MUBS' : 'e.g. Kampala Tech Innovation Grant 2026'}
                    required
                    className="kw-input text-xs"
                  />
                </div>

                {eventKind === 'event' ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="font-semibold text-[var(--fg)] block mb-1">Date and Time *</label>
                      <input
                        type="text"
                        value={eventDatetime}
                        onChange={e => setEventDatetime(e.target.value)}
                        placeholder="e.g. Saturday, Oct 24 • 10:00 AM EAT"
                        required
                        className="kw-input text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-[var(--fg)] block mb-1">Place or Online Link *</label>
                      <input
                        type="text"
                        value={eventLocation}
                        onChange={e => setEventLocation(e.target.value)}
                        placeholder="e.g. EIIC MUBS Main Campus, Kampala or Google Meet"
                        required
                        className="kw-input text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-[var(--fg)] block mb-1">Cover Image URL (optional)</label>
                      <input
                        type="text"
                        value={eventCoverImage}
                        onChange={e => setEventCoverImage(e.target.value)}
                        placeholder="https://..."
                        className="kw-input text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-[var(--fg)] block mb-1">Registration Link (optional)</label>
                      <input
                        type="text"
                        value={eventRegLink}
                        onChange={e => setEventRegLink(e.target.value)}
                        placeholder="https://lu.ma/..."
                        className="kw-input text-xs"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="font-semibold text-[var(--fg)] block mb-1">Opportunity Type *</label>
                      <select
                        value={oppType}
                        onChange={e => setOppType(e.target.value)}
                        className="kw-input text-xs"
                      >
                        <option value="Grant">Grant</option>
                        <option value="Hackathon">Hackathon</option>
                        <option value="Job">Job</option>
                        <option value="Training">Training</option>
                        <option value="Call for partners">Call for partners</option>
                      </select>
                    </div>
                    <div>
                      <label className="font-semibold text-[var(--fg)] block mb-1">Deadline *</label>
                      <input
                        type="text"
                        value={oppDeadline}
                        onChange={e => setOppDeadline(e.target.value)}
                        placeholder="e.g. Nov 15, 2026"
                        required
                        className="kw-input text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-[var(--fg)] block mb-1">Opportunity Link *</label>
                      <input
                        type="text"
                        value={oppLink}
                        onChange={e => setOppLink(e.target.value)}
                        placeholder="https://..."
                        required
                        className="kw-input text-xs"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="font-semibold text-[var(--fg)] block mb-1">Description *</label>
                  <textarea
                    value={eventDesc}
                    onChange={e => setEventDesc(e.target.value)}
                    rows={4}
                    placeholder="Provide details about the schedule, requirements, tracks, or eligibility..."
                    required
                    className="kw-textarea text-xs"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="eventPublished"
                    checked={eventPublished}
                    onChange={e => setEventPublished(e.target.checked)}
                    className="rounded text-[var(--gold)]"
                  />
                  <label htmlFor="eventPublished" className="text-xs text-[var(--fg)] cursor-pointer">
                    Publish immediately (sends a notification to all active members)
                  </label>
                </div>

                <div className="flex items-center gap-3 pt-2">
                  <button type="submit" className="kw-btn kw-btn-gold text-xs py-2 px-5 font-bold">
                    {editingEventId ? 'Update Item' : 'Create Item'}
                  </button>
                  <button
                    type="button"
                    onClick={resetEventForm}
                    className="kw-btn text-xs py-2 px-4"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* List of Events & Opportunities */}
          <div className="kw-card overflow-hidden">
            <div className="p-4 border-b border-[var(--card-border)] flex items-center justify-between">
              <h4 className="font-bold text-sm text-[var(--fg)]">All Items ({adminEvents.length})</h4>
            </div>

            {adminEvents.length === 0 ? (
              <div className="p-8 text-center text-xs text-[var(--fg-muted)]">
                No items created yet. Click "Create New Item" above to add events or opportunities.
              </div>
            ) : (
              <div className="divide-y divide-[var(--card-border)]">
                {adminEvents.map(item => (
                  <div key={item.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-[var(--bg-subtle)]">
                    <div className="space-y-1.5 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            item.kind === 'event'
                              ? 'bg-amber-500/15 text-[var(--gold)]'
                              : 'bg-emerald-500/15 text-emerald-400'
                          }`}
                        >
                          {item.kind === 'event' ? 'Event' : item.opportunity_type || 'Opportunity'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            item.published
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-gray-500/15 text-[var(--fg-muted)]'
                          }`}
                        >
                          {item.published ? 'Published' : 'Draft / Unpublished'}
                        </span>
                        <span className="text-[11px] text-[var(--fg-muted)]">
                          {item.datetime || `Deadline: ${item.deadline}`}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-[var(--fg)] truncate">
                        {item.title}
                      </h4>
                      <p className="text-xs text-[var(--fg-muted)] truncate">
                        {item.location || item.link}
                      </p>
                      <p className="text-[11px] text-[var(--gold)]">
                        {item.attendee_ids?.length || 0} {item.kind === 'event' ? 'going' : 'interested'}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => setViewingAttendeesEvent(item)}
                        className="kw-btn text-xs py-1.5 px-2.5 font-medium"
                        title="See who is going"
                      >
                        <Users className="w-3.5 h-3.5 text-[var(--gold)]" />
                        <span>Attendees ({item.attendee_ids?.length || 0})</span>
                      </button>
                      <button
                        onClick={() => handleExportEventAttendees(item.id)}
                        className="kw-btn text-xs py-1.5 px-2.5"
                        title="Export attendee list as CSV"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>CSV</span>
                      </button>
                      <button
                        onClick={() => handleTogglePublish(item)}
                        className={`kw-btn text-xs py-1.5 px-2.5 ${
                          item.published ? 'hover:text-amber-400' : 'text-emerald-400'
                        }`}
                      >
                        {item.published ? 'Unpublish' : 'Publish'}
                      </button>
                      <button
                        onClick={() => handleEditEventClick(item)}
                        className="kw-btn text-xs py-1.5 px-2.5"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteEvent(item.id, item.title)}
                        className="kw-btn kw-btn-danger text-xs py-1.5 px-2"
                        title="Delete item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Attendee Inspection Modal */}
          {viewingAttendeesEvent && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4">
              <div className="kw-card max-w-lg w-full p-6 space-y-4 max-h-[85vh] flex flex-col">
                <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
                  <div>
                    <h3 className="font-bold text-sm text-[var(--fg)]">
                      Attendees for {viewingAttendeesEvent.title}
                    </h3>
                    <p className="text-xs text-[var(--fg-muted)]">
                      {viewingAttendeesEvent.attendee_ids?.length || 0} total RSVPs
                    </p>
                  </div>
                  <button
                    onClick={() => setViewingAttendeesEvent(null)}
                    className="p-1 text-[var(--fg-muted)] hover:text-[var(--fg)]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto divide-y divide-[var(--card-border)] space-y-2">
                  {(viewingAttendeesEvent.attendee_ids || []).length === 0 ? (
                    <p className="text-xs text-[var(--fg-muted)] text-center py-6">
                      No members have RSVP'd to this item yet.
                    </p>
                  ) : (
                    (viewingAttendeesEvent.attendee_ids || []).map((id: string) => {
                      const member = members.find(m => m.id === id);
                      return (
                        <div key={id} className="pt-2 flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <p className="font-bold text-[var(--fg)] truncate">
                              {member?.name || id}
                            </p>
                            <p className="text-[11px] text-[var(--fg-muted)] truncate">
                              {member?.role || 'Member'} • {member?.email || 'Email private'}
                            </p>
                          </div>
                          <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                            {viewingAttendeesEvent.kind === 'event' ? 'Going' : 'Interested'}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>

                <div className="pt-3 border-t border-[var(--card-border)] flex justify-between items-center">
                  <button
                    onClick={() => handleExportEventAttendees(viewingAttendeesEvent.id)}
                    className="kw-btn text-xs py-1.5 px-3 flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Export CSV</span>
                  </button>
                  <button
                    onClick={() => setViewingAttendeesEvent(null)}
                    className="kw-btn kw-btn-gold text-xs py-1.5 px-4"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Pinned Announcement Bar Tool */}
          <div className="p-5 kw-card space-y-4">
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-[var(--gold)]" />
              <h3 className="font-bold text-sm text-[var(--fg)]">Pinned Top Announcement Bar</h3>
            </div>
            <p className="text-xs text-[var(--fg-muted)]">
              Pins a slim dismissible banner at the top of the app for everyone until unpinned.
            </p>

            {pinnedAnnouncement && pinnedAnnouncement.active ? (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs">
                <div className="min-w-0 flex-1">
                  <span className="font-bold text-[var(--gold)]">Currently Pinned: </span>
                  <span>{pinnedAnnouncement.text}</span>
                  {pinnedAnnouncement.link && (
                    <span className="text-[var(--fg-muted)] ml-2 truncate">({pinnedAnnouncement.link})</span>
                  )}
                </div>
                <button
                  onClick={handleUnpinSubmit}
                  className="kw-btn kw-btn-danger text-xs py-1 px-3 flex-shrink-0"
                >
                  Unpin Announcement
                </button>
              </div>
            ) : (
              <p className="text-xs text-[var(--fg-muted)] italic">
                No announcement currently pinned.
              </p>
            )}

            <form onSubmit={handlePinSubmit} className="space-y-3 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <input
                    type="text"
                    value={pinText}
                    onChange={e => setPinText(e.target.value)}
                    placeholder="Announcement message (e.g. Keynote starting in Room A at 2 PM)"
                    required
                    className="kw-input text-xs"
                  />
                </div>
                <div>
                  <input
                    type="text"
                    value={pinLink}
                    onChange={e => setPinLink(e.target.value)}
                    placeholder="Optional link (https://...)"
                    className="kw-input text-xs"
                  />
                </div>
              </div>
              <button
                type="submit"
                disabled={!pinText.trim()}
                className="kw-btn kw-btn-gold text-xs py-2 px-4 font-semibold flex items-center gap-1.5"
              >
                <Megaphone className="w-3.5 h-3.5" />
                <span>Pin Announcement</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB: ADMIN ACCOUNTS MANAGEMENT */}
      {activeTab === 'admins' && (
        <div className="space-y-6">
          <div className="p-5 kw-card space-y-4">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-[var(--gold)]" />
              <h3 className="font-bold text-sm text-[var(--fg)]">Authorized Administrator Accounts</h3>
            </div>
            <p className="text-xs text-[var(--fg-muted)] leading-relaxed">
              Admin access is authenticated through signed-in Google or Email accounts. The initial administrator is configured via the <code>ADMIN_EMAILS</code> environment variable. Authorized administrators can add or remove other administrators by email below.
            </p>

            {/* Add Admin Form */}
            <form onSubmit={handleAddAdminEmail} className="flex gap-2 pt-2">
              <input
                type="email"
                value={newAdminEmail}
                onChange={e => setNewAdminEmail(e.target.value)}
                placeholder="colleague@domain.com"
                required
                className="kw-input text-xs max-w-sm"
              />
              <button type="submit" className="kw-btn kw-btn-gold text-xs py-2 px-4 font-bold flex items-center gap-1.5">
                <Plus className="w-3.5 h-3.5" />
                <span>Add Admin</span>
              </button>
            </form>

            {/* List of Admins */}
            <div className="pt-4 border-t border-[var(--card-border)] space-y-2">
              <h4 className="text-xs font-bold text-[var(--fg)]">Current Administrators:</h4>
              <div className="divide-y divide-[var(--card-border)] border border-[var(--card-border)] rounded-xl overflow-hidden">
                {adminAccounts.admin_emails.map((email: string) => {
                  const isEnv = (adminAccounts.env_admins || []).map(e => e.toLowerCase()).includes(email.toLowerCase());
                  return (
                    <div key={email} className="p-3.5 flex items-center justify-between gap-3 text-xs bg-[var(--card)] hover:bg-[var(--bg-subtle)]">
                      <div className="flex items-center gap-2 min-w-0">
                        <UserCheck className="w-4 h-4 text-[var(--gold)] flex-shrink-0" />
                        <span className="font-mono font-medium truncate">{email}</span>
                        {isEnv ? (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-[var(--gold)] border border-amber-500/20">
                            ADMIN_EMAILS
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            Dashboard Admin
                          </span>
                        )}
                      </div>

                      {!isEnv && (
                        <button
                          onClick={() => handleRemoveAdminEmail(email)}
                          className="kw-btn kw-btn-danger text-xs py-1 px-2.5"
                          title="Revoke admin access"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: OVERVIEW & INSIGHTS */}
      {activeTab === 'overview' && overview && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="p-4 kw-card space-y-1">
              <span className="text-xs text-[var(--fg-muted)]">Total Members</span>
              <div className="text-2xl font-bold font-display text-[var(--fg)]">{overview.members_count}</div>
              <span className="text-[10px] text-[var(--success)] flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                <span>+{overview.joined_last_hour} in last hour</span>
              </span>
            </div>

            <div className="p-4 kw-card space-y-1">
              <span className="text-xs text-[var(--fg-muted)]">Complementary Matches</span>
              <div className="text-2xl font-bold font-display text-[var(--gold)]">{overview.matches_count}</div>
              <span className="text-[10px] text-[var(--fg-muted)]">AI & heuristic pairs</span>
            </div>

            <div className="p-4 kw-card space-y-1">
              <span className="text-xs text-[var(--fg-muted)]">Connect Requests</span>
              <div className="text-2xl font-bold font-display text-[var(--teal)]">{overview.connect_requests_count}</div>
              <span className="text-[10px] text-[var(--fg-muted)]">WhatsApp connections</span>
            </div>

            <div className="p-4 kw-card space-y-1">
              <span className="text-xs text-[var(--fg-muted)]">Community Posts</span>
              <div className="text-2xl font-bold font-display text-[var(--fg)]">{overview.posts_count}</div>
              <span className="text-[10px] text-[var(--fg-muted)]">Needs & offers</span>
            </div>

            <div className="p-4 kw-card space-y-1">
              <span className="text-xs text-[var(--fg-muted)]">Follow Connections</span>
              <div className="text-2xl font-bold font-display text-[var(--fg)]">{overview.follows_count}</div>
              <span className="text-[10px] text-[var(--fg-muted)]">Attendee network</span>
            </div>

            <div className="p-4 kw-card space-y-1">
              <span className="text-xs text-[var(--fg-muted)]">Moderated Members</span>
              <div className="text-2xl font-bold font-display text-[var(--fg)]">{overview.hidden_members_count}</div>
              <span className="text-[10px] text-[var(--fg-muted)]">Hidden or suspended</span>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MEMBERS DIRECTORY & MODERATION */}
      {activeTab === 'members' && (
        <div className="kw-card overflow-hidden">
          <div className="p-4 border-b border-[var(--card-border)] flex flex-col sm:flex-row gap-3 items-center justify-between">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--fg-muted)]" />
              <input
                type="text"
                placeholder="Search by name, role or tag..."
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                className="kw-input pl-9 text-xs"
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImportFile}
                accept=".json"
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="kw-btn kw-btn-ghost text-xs py-1.5 px-3 flex items-center gap-1.5"
                title="Restore members from JSON backup with exact preserved IDs"
              >
                <Upload className="w-3.5 h-3.5 text-[var(--gold)]" />
                <span>{isImporting ? 'Restoring...' : 'Restore JSON'}</span>
              </button>
              <button
                onClick={() => handleExport('members', 'csv')}
                className="kw-btn text-xs py-1.5 px-3 flex items-center gap-1.5"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[var(--bg-subtle)] text-[var(--fg-muted)] border-b border-[var(--card-border)] uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">Member</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Offers / Needs</th>
                  <th className="p-3">WhatsApp</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--card-border)]">
                {members
                  .filter(m => {
                    const q = memberSearch.toLowerCase();
                    return (
                      !q ||
                      m.name?.toLowerCase().includes(q) ||
                      m.role?.toLowerCase().includes(q) ||
                      m.skills?.some((s: string) => s.toLowerCase().includes(q))
                    );
                  })
                  .map(member => {
                    const isPhoneRevealed = revealedPhones.has(member.id);
                    return (
                      <tr key={member.id} className={`hover:bg-[var(--bg-subtle)] ${member.hidden || member.suspended ? 'opacity-60 bg-red-500/5' : ''}`}>
                        <td className="p-3 whitespace-nowrap">
                          <div className="font-semibold text-[var(--fg)] flex items-center gap-2">
                            <span>{member.name}</span>
                            {member.suspended && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                Suspended
                              </span>
                            )}
                            {member.hidden && !member.suspended && (
                              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-500/20 text-[var(--fg-muted)]">
                                Hidden
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-[var(--fg-muted)] font-mono">{member.id}</div>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--bg-subtle)] text-[var(--fg)]">
                            {member.role}
                          </span>
                        </td>
                        <td className="p-3 max-w-xs truncate text-[var(--fg-muted)]">
                          <span className="text-[var(--gold)]">O:</span> {member.offers} |{' '}
                          <span className="text-[var(--teal)]">N:</span> {member.needs}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {isPhoneRevealed ? (
                            <span className="font-mono text-xs font-semibold text-[var(--teal)]">
                              {member.whatsapp || 'No phone'}
                            </span>
                          ) : (
                            <button
                              onClick={() => handleTogglePhoneReveal(member.id)}
                              className="kw-btn text-[10px] py-1 px-2"
                            >
                              <Eye className="w-3 h-3" />
                              <span>Show Phone</span>
                            </button>
                          )}
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleAdminAction('toggle_hide_member', { id: member.id, hidden: !member.hidden })}
                              className="kw-btn text-[10px] py-1 px-2"
                            >
                              {member.hidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                              <span>{member.hidden ? 'Unhide' : 'Hide'}</span>
                            </button>

                            {/* Suspend member (Beside Delete member) */}
                            <button
                              onClick={() => {
                                if (member.suspended) {
                                  handleUnsuspendMember(member.id);
                                } else {
                                  if (confirm(`Suspend member ${member.name}? They will be hidden from lists and matching.`)) {
                                    handleSuspendMember(member.id);
                                  }
                                }
                              }}
                              className={`kw-btn text-[10px] py-1 px-2 ${
                                member.suspended
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                  : 'text-amber-400 hover:bg-amber-500/10'
                              }`}
                              title={member.suspended ? 'Restore member' : 'Suspend member'}
                            >
                              <Ban className="w-3 h-3" />
                              <span>{member.suspended ? 'Unsuspend' : 'Suspend member'}</span>
                            </button>

                            <button
                              onClick={() => {
                                if (confirm(`Delete member ${member.name}?`)) {
                                  handleAdminAction('delete_member', { id: member.id });
                                }
                              }}
                              className="kw-btn kw-btn-danger text-[10px] py-1 px-2"
                              title="Delete member"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: SAFETY & ABUSE REPORTS */}
      {activeTab === 'reports' && (
        <div className="p-5 kw-card space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[var(--card-border)] pb-3">
            <div>
              <h3 className="font-bold font-display text-sm text-[var(--fg)]">Safety & Abuse Reports</h3>
              <p className="text-xs text-[var(--fg-muted)]">
                Reports submitted by members with reasons and contextual details.
              </p>
            </div>
          </div>

          {reports.length === 0 ? (
            <div className="p-8 text-center text-xs text-[var(--fg-muted)]">
              No reports filed yet. The community is healthy!
            </div>
          ) : (
            <div className="space-y-3">
              {reports.map((report: any) => {
                const reported = members.find(m => m.id === report.reported_id);
                return (
                  <div key={report.id} className="p-4 rounded-xl border border-[var(--card-border)] bg-[var(--bg)] flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-[var(--fg)]">{report.reported_name}</span>
                        <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-red-500/10 text-red-400">
                          {report.status}
                        </span>
                      </div>
                      <p className="text-[var(--fg-muted)]">Reported by: {report.reporter_name}</p>
                      <p className="text-xs font-semibold text-rose-400">Reason: {report.reason}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      {report.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleReportAction(report.id, 'resolve')}
                            className="kw-btn text-xs py-1 px-2.5"
                          >
                            Resolve
                          </button>
                          <button
                            onClick={() => handleReportAction(report.id, 'dismiss')}
                            className="kw-btn text-xs py-1 px-2.5"
                          >
                            Dismiss
                          </button>
                        </>
                      )}
                      {reported && (
                        <button
                          onClick={() => {
                            if (confirm(`Delete reported member ${reported.name}?`)) {
                              handleAdminAction('delete_member', { id: reported.id });
                              handleReportAction(report.id, 'resolve');
                            }
                          }}
                          className="kw-btn kw-btn-danger text-xs py-1 px-2.5 flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>Delete Member</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: FEED POSTS MODERATION */}
      {activeTab === 'posts' && (
        <div className="kw-card overflow-hidden">
          <div className="p-4 border-b border-[var(--card-border)]">
            <h3 className="font-bold font-display text-sm">Community Wall Posts Moderation</h3>
          </div>
          <div className="divide-y divide-[var(--card-border)]">
            {posts.map(post => (
              <div key={post.id} className="p-4 flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-[var(--fg)]">{post.author_name}</span>
                    <span className="text-[10px] text-[var(--fg-muted)]">{new Date(post.created_at).toLocaleTimeString()}</span>
                    <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-[var(--bg-subtle)] text-[var(--fg)]">
                      {post.kind}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--fg-muted)]">{post.body}</p>
                </div>
                <button
                  onClick={() => handleAdminAction('delete_post', { id: post.id })}
                  className="kw-btn kw-btn-danger text-xs py-1 px-2"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: PHOTOS */}
      {activeTab === 'photos' && (
        <div className="p-5 kw-card space-y-4">
          <h3 className="font-bold font-display text-sm">Event Photographs (MUBS Kampala)</h3>
          <p className="text-xs text-[var(--fg-muted)]">
            Authentic photographs captured during Hack Day Kampala x MUBS.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-3 bg-[var(--bg)] rounded-xl border border-[var(--card-border)] space-y-2">
              <img src={photos.hero} alt="Hero" className="w-full h-36 object-cover rounded-lg" />
              <div className="text-xs font-bold">Hero Slot</div>
            </div>
            <div className="p-3 bg-[var(--bg)] rounded-xl border border-[var(--card-border)] space-y-2">
              <img src={photos.hall} alt="Hall" className="w-full h-36 object-cover rounded-lg" />
              <div className="text-xs font-bold">Event Hall Slot</div>
            </div>
            <div className="p-3 bg-[var(--bg)] rounded-xl border border-[var(--card-border)] space-y-2">
              <img src={photos.team} alt="Team" className="w-full h-36 object-cover rounded-lg" />
              <div className="text-xs font-bold">Collaborators Slot</div>
            </div>
          </div>
          <button
            onClick={() => setIsPhotosModalOpen(true)}
            className="kw-btn kw-btn-gold text-xs py-2 px-4 font-semibold"
          >
            Manage Photos Modal
          </button>
        </div>
      )}

      {/* TAB 4: AI HEALTH & MONITORING */}
      {activeTab === 'ai' && (
        <div className="p-5 kw-card space-y-4">
          <h3 className="font-bold font-display text-sm">Gemma 4 AI Health</h3>
          <p className="text-xs text-[var(--fg-muted)]">
            Live monitoring of Gemma open-weight inference model ({GEMMA_MODEL_ID}).
          </p>
          <button
            onClick={handleTestGemmaAI}
            disabled={isTestingGemma}
            className="kw-btn kw-btn-gold text-xs py-2 px-4"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isTestingGemma ? 'Calling Gemma...' : 'Test Gemma Live'}</span>
          </button>
          {gemmaTestStatus && (
            <div className="p-3 rounded bg-[var(--bg)] border border-[var(--card-border)] font-mono text-xs">
              {gemmaTestStatus}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: BROADCAST & EXPORT TOOLS */}
      {activeTab === 'tools' && (
        <div className="space-y-6">
          <div className="p-5 kw-card space-y-3">
            <h3 className="font-bold font-display text-sm flex items-center gap-2">
              <Send className="w-4 h-4 text-[var(--gold)]" />
              <span>Broadcast Push Notice</span>
            </h3>
            <p className="text-xs text-[var(--fg-muted)]">
              Broadcast an in-app notice to all members.
            </p>
            <form onSubmit={handleSendAnnouncement} className="space-y-3">
              <textarea
                value={announcementText}
                onChange={e => setAnnouncementText(e.target.value)}
                placeholder="Type notice..."
                rows={3}
                className="kw-textarea text-xs"
                required
              />
              <button
                type="submit"
                disabled={isSendingAnnouncement || !announcementText.trim()}
                className="kw-btn kw-btn-gold text-xs py-2 px-4"
              >
                {isSendingAnnouncement ? 'Broadcasting...' : 'Broadcast to All Members'}
              </button>
            </form>
          </div>

          <div className="p-5 kw-card space-y-3">
            <h3 className="font-bold font-display text-sm flex items-center gap-2">
              <Download className="w-4 h-4 text-[var(--teal)]" />
              <span>Data Export</span>
            </h3>
            <div className="flex flex-wrap gap-2">
              <button onClick={() => handleExport('members', 'csv')} className="kw-btn text-xs py-1.5 px-3">
                Export Members (CSV)
              </button>
              <button onClick={() => handleExport('members', 'json')} className="kw-btn text-xs py-1.5 px-3">
                Export Members (JSON)
              </button>
              <button onClick={() => handleExport('matches', 'csv')} className="kw-btn text-xs py-1.5 px-3">
                Export Matches (CSV)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: SETUP DIAGNOSTICS */}
      {activeTab === 'setup' && (
        <div className="kw-card p-6">
          <SetupView
            onSignOut={handleLogout}
            onRefreshData={onRefreshGlobalData}
            onToast={onToast}
          />
        </div>
      )}

      {/* TAB 7: AUDIT LOG */}
      {activeTab === 'audit' && (
        <div className="p-5 kw-card space-y-4">
          <h3 className="font-bold font-display text-sm">Admin & Security Audit Trail</h3>
          <p className="text-xs text-[var(--fg-muted)]">
            Every administrative action is permanently recorded in the system audit log with the administrator's identity.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[var(--bg-subtle)] text-[var(--fg-muted)] border-b border-[var(--card-border)] uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Admin</th>
                  <th className="p-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--card-border)] font-mono text-[11px]">
                {auditLog.map(item => (
                  <tr key={item.id}>
                    <td className="p-3 text-[var(--fg-muted)] whitespace-nowrap">
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </td>
                    <td className="p-3 font-semibold text-[var(--gold)]">{item.action}</td>
                    <td className="p-3 text-[var(--teal)]">{item.admin || 'Admin'}</td>
                    <td className="p-3 text-[var(--fg)] max-w-md">{item.details}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Event Photos Upload & Manager Modal */}
      <EventPhotosModal
        isOpen={isPhotosModalOpen}
        onClose={() => setIsPhotosModalOpen(false)}
        onPhotoUploaded={() => {
          fetchAdminData();
          onRefreshGlobalData();
        }}
      />
    </div>
  );
};
