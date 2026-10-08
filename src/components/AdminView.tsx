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
  Clock,
  X,
  ArrowUp,
  ArrowDown,
  Edit2,
  Github,
  Linkedin
} from 'lucide-react';
import { Profile, Post, EventOpportunityItem, TeamMember } from '../types';
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
  approveEvent,
  rejectEvent,
  toggleOrganiserRole,
  pinAnnouncement,
  unpinAnnouncement,
  fetchPinnedAnnouncement,
  getAuthHeaders,
  fetchTeam,
  createTeamMember,
  updateTeamMember,
  uploadTeamMemberPhoto,
  reorderTeamMembers,
  deleteTeamMember
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
    'overview' | 'team' | 'events' | 'admins' | 'members' | 'reports' | 'posts' | 'photos' | 'ai' | 'tools' | 'setup' | 'audit'
  >('overview');

  const photos = useEventPhotos();
  const [overview, setOverview] = useState<AdminOverviewData | null>(null);
  const [teamList, setTeamList] = useState<TeamMember[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(false);

  // Team Management State
  const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
  const [isAddingMember, setIsAddingMember] = useState(false);
  const [teamForm, setTeamForm] = useState({
    name: '',
    title: '',
    line1: '',
    line2: '',
    github: '',
    linkedin: '',
    linked_profile_id: '',
    hidden: false
  });
  const [isSavingTeam, setIsSavingTeam] = useState(false);
  const [teamPhotoUploadingId, setTeamPhotoUploadingId] = useState<string | null>(null);

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

  // Review & Approval State
  const [rejectingEvent, setRejectingEvent] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [isApprovingOnSave, setIsApprovingOnSave] = useState(false);

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
      const [ovRes, memRes, postRes, logRes, repRes, evRes, admRes, pinRes, teamData] = await Promise.all([
        fetch('/api/admin/overview', { headers }),
        fetch('/api/admin/members', { headers }),
        fetch('/api/admin/posts', { headers }),
        fetch('/api/admin/audit-log', { headers }),
        fetch('/api/admin/reports', { headers }),
        fetch('/api/events', { headers }),
        fetch('/api/admin/admins', { headers }).catch(() => null),
        fetchPinnedAnnouncement(),
        fetchTeam().catch(() => [])
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
      if (Array.isArray(teamData)) setTeamList(teamData);
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
        if (isApprovingOnSave) {
          await approveEvent(editingEventId, itemPayload);
          onToast('Item edited and approved! Author and members notified.');
        } else {
          await updateEvent(editingEventId, itemPayload);
          onToast('Item updated successfully');
        }
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
    setIsApprovingOnSave(false);
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
    setIsApprovingOnSave(false);
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

  const handleApproveEvent = async (item: any) => {
    try {
      await approveEvent(item.id);
      onToast(`Approved "${item.title}". Author and members notified!`);
      fetchAdminData();
      onRefreshGlobalData();
    } catch (err: any) {
      onToast('Failed to approve: ' + err.message);
    }
  };

  const handleEditAndApproveClick = (item: any) => {
    handleEditEventClick(item);
    setIsApprovingOnSave(true);
    setEventPublished(true);
  };

  const handleOpenRejectModal = (item: any) => {
    setRejectingEvent(item);
    setRejectReason('Does not align with community guidelines');
  };

  const handleConfirmReject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rejectingEvent) return;
    try {
      await rejectEvent(rejectingEvent.id, rejectReason.trim() || 'Does not align with community guidelines');
      onToast(`Rejected "${rejectingEvent.title}". Author notified.`);
      setRejectingEvent(null);
      setRejectReason('');
      fetchAdminData();
      onRefreshGlobalData();
    } catch (err: any) {
      onToast('Failed to reject: ' + err.message);
    }
  };

  const handleToggleOrganiser = async (memberId: string, currentStatus?: boolean) => {
    try {
      const nextStatus = !currentStatus;
      await toggleOrganiserRole(memberId, nextStatus);
      onToast(nextStatus ? 'Granted Organiser label' : 'Removed Organiser label');
      onRefreshGlobalData();
    } catch (err: any) {
      onToast('Failed to update organiser status: ' + err.message);
    }
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

  // Team Management Handlers
  const openAddMemberModal = () => {
    setEditingMember(null);
    setTeamForm({
      name: '',
      title: '',
      line1: '',
      line2: '',
      github: '',
      linkedin: '',
      linked_profile_id: '',
      hidden: false
    });
    setIsAddingMember(true);
  };

  const openEditMemberModal = (member: TeamMember) => {
    setEditingMember(member);
    setTeamForm({
      name: member.name || '',
      title: member.title || '',
      line1: member.line1 || '',
      line2: member.line2 || '',
      github: member.github || '',
      linkedin: member.linkedin || '',
      linked_profile_id: member.linked_profile_id || '',
      hidden: Boolean(member.hidden)
    });
    setIsAddingMember(true);
  };

  const handleSaveTeamMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamForm.name.trim()) {
      onToast('Name is required');
      return;
    }
    setIsSavingTeam(true);
    try {
      if (editingMember) {
        await updateTeamMember(editingMember.id, teamForm);
        onToast(`Updated team member "${teamForm.name}"`);
      } else {
        await createTeamMember(teamForm);
        onToast(`Added team member "${teamForm.name}"`);
      }
      setIsAddingMember(false);
      setEditingMember(null);
      await fetchAdminData();
      onRefreshGlobalData();
    } catch (err: any) {
      onToast('Failed to save team member: ' + (err.message || err));
    } finally {
      setIsSavingTeam(false);
    }
  };

  const handleMoveTeamMember = async (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= teamList.length) return;
    const newTeam = [...teamList];
    const temp = newTeam[index];
    newTeam[index] = newTeam[targetIndex];
    newTeam[targetIndex] = temp;
    setTeamList(newTeam);
    try {
      const ordered_ids = newTeam.map(m => m.id);
      await reorderTeamMembers(ordered_ids);
      onToast('Team reordered');
      await fetchAdminData();
      onRefreshGlobalData();
    } catch (err: any) {
      onToast('Failed to reorder: ' + (err.message || err));
      await fetchAdminData();
    }
  };

  const handleToggleHideTeamMember = async (member: TeamMember) => {
    try {
      const nextHidden = !member.hidden;
      await updateTeamMember(member.id, { hidden: nextHidden });
      onToast(nextHidden ? `Hid "${member.name}" from public cards` : `Showed "${member.name}" on public cards`);
      await fetchAdminData();
      onRefreshGlobalData();
    } catch (err: any) {
      onToast('Failed to toggle visibility: ' + (err.message || err));
    }
  };

  const handleDeleteTeamMember = async (member: TeamMember) => {
    if (!confirm(`Are you sure you want to remove "${member.name}" from the team?`)) return;
    try {
      await deleteTeamMember(member.id);
      onToast(`Removed "${member.name}" from team`);
      await fetchAdminData();
      onRefreshGlobalData();
    } catch (err: any) {
      onToast('Failed to remove team member: ' + (err.message || err));
    }
  };

  const handlePhotoUploadForTeam = async (memberId: string, file: File) => {
    if (!file) return;
    setTeamPhotoUploadingId(memberId);
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const base64 = reader.result as string;
          await uploadTeamMemberPhoto(memberId, base64);
          onToast('Team photo updated and optimized to WebP');
          await fetchAdminData();
          onRefreshGlobalData();
        } catch (err: any) {
          onToast('Failed to upload photo: ' + (err.message || err));
        } finally {
          setTeamPhotoUploadingId(null);
        }
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setTeamPhotoUploadingId(null);
      onToast('Error reading image: ' + (err.message || err));
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
                  <label className="text-[13px] font-semibold text-[var(--fg-muted)] block">Username</label>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    required
                    className="kw-input text-xs py-1.5"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[13px] font-semibold text-[var(--fg-muted)] block">Emergency Password</label>
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
          <p className="text-[13px] text-[var(--fg-muted)] text-center pt-2">
            Emergency passcode fallback is disabled (enable with <code>ADMIN_FALLBACK=true</code>).
          </p>
        )}
      </div>
    );
  }

  // 3. Authenticated Admin Dashboard
  return (
    <div className="kw-container space-y-6 md:space-y-10 animate-in fade-in pb-12">
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
                <span className="px-2 py-0.5 rounded text-[13px] font-bold bg-amber-500/15 text-[var(--gold)] border border-amber-500/30">
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
          { id: 'team', label: `Team (${teamList.length})`, icon: UserCheck },
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
      {activeTab === 'events' && (() => {
        const pendingEvents = (adminEvents || []).filter((e: any) => e.status === 'pending');
        return (
          <div className="space-y-6">
            {/* 1. Awaiting Approval List at top of Events Tab with Counter Badge */}
            <div className="kw-card overflow-hidden border-amber-500/40">
              <div className="p-4 border-b border-[var(--card-border)] bg-amber-500/10 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-amber-400" />
                  <h4 className="font-bold text-sm text-[var(--fg)]">Awaiting approval</h4>
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/25 text-amber-300 border border-amber-500/40">
                    {pendingEvents.length}
                  </span>
                </div>
                <span className="text-xs text-[var(--fg-muted)]">
                  {pendingEvents.length === 1 ? '1 submission awaiting review' : `${pendingEvents.length} submissions awaiting review`}
                </span>
              </div>

              {pendingEvents.length === 0 ? (
                <div className="p-6 text-center text-xs text-[var(--fg-muted)] flex items-center justify-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-400" />
                  <span>No pending submissions awaiting approval. All caught up!</span>
                </div>
              ) : (
                <div className="divide-y divide-[var(--card-border)]">
                  {pendingEvents.map(item => (
                    <div key={item.id} className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[var(--bg-subtle)]">
                      <div className="space-y-1.5 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`px-2 py-0.5 rounded text-[13px] font-bold uppercase ${
                              item.kind === 'event'
                                ? 'bg-amber-500/15 text-[var(--gold)]'
                                : 'bg-emerald-500/15 text-emerald-400'
                            }`}
                          >
                            {item.kind === 'event' ? 'Event' : item.opportunity_type || 'Opportunity'}
                          </span>
                          <span className="px-2 py-0.5 rounded text-[13px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Pending Approval
                          </span>
                          <span className="text-[13px] text-[var(--fg-muted)]">
                            {item.datetime || `Deadline: ${item.deadline}`}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-[var(--fg)]">{item.title}</h4>
                        <p className="text-xs text-[var(--fg-muted)] line-clamp-2">{item.description}</p>
                        <div className="flex flex-wrap items-center gap-2 text-[13px] text-[var(--fg-muted)]">
                          <span>
                            Submitted by <strong className="text-[var(--gold)]">{item.author_name || item.author_id}</strong>
                            {item.author_is_organiser && (
                              <span className="ml-1 px-1.5 py-0.2 rounded text-[13px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40">
                                Organiser
                              </span>
                            )}
                          </span>
                          {item.location && <span>• 📍 {item.location}</span>}
                          {item.link && <span>• 🔗 {item.link}</span>}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                        <button
                          onClick={() => handleApproveEvent(item)}
                          className="kw-btn kw-btn-gold text-xs py-1.5 px-3 font-bold flex items-center gap-1.5"
                          title="Approve immediately"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>
                        <button
                          onClick={() => handleEditAndApproveClick(item)}
                          className="kw-btn text-xs py-1.5 px-3 font-medium flex items-center gap-1.5"
                          title="Edit details and approve"
                        >
                          <Settings className="w-3.5 h-3.5 text-[var(--gold)]" />
                          <span>Edit & approve</span>
                        </button>
                        <button
                          onClick={() => handleOpenRejectModal(item)}
                          className="kw-btn kw-btn-danger text-xs py-1.5 px-3 font-medium flex items-center gap-1.5"
                          title="Reject with short reason"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

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
                          className={`px-2 py-0.5 rounded text-[13px] font-bold uppercase ${
                            item.kind === 'event'
                              ? 'bg-amber-500/15 text-[var(--gold)]'
                              : 'bg-emerald-500/15 text-emerald-400'
                          }`}
                        >
                          {item.kind === 'event' ? 'Event' : item.opportunity_type || 'Opportunity'}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded text-[13px] font-semibold ${
                            item.published
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : 'bg-gray-500/15 text-[var(--fg-muted)]'
                          }`}
                        >
                          {item.published ? 'Published' : 'Draft / Unpublished'}
                        </span>
                        <span className="text-[13px] text-[var(--fg-muted)]">
                          {item.datetime || `Deadline: ${item.deadline}`}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-[var(--fg)] truncate">
                        {item.title}
                      </h4>
                      <p className="text-xs text-[var(--fg-muted)] truncate">
                        {item.location || item.link}
                      </p>
                      <p className="text-[13px] text-[var(--gold)]">
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
                            <p className="text-[13px] text-[var(--fg-muted)] truncate">
                              {member?.role || 'Member'} • {member?.email || 'Email private'}
                            </p>
                          </div>
                          <span className="text-[13px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
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

          {/* Modal: Reject Submission with short reason */}
          {rejectingEvent && (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4">
              <div className="kw-card max-w-md w-full p-6 space-y-4 border-rose-500/40 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
                  <div>
                    <h4 className="font-bold text-sm text-[var(--fg)]">Reject Submission</h4>
                    <p className="text-xs text-[var(--fg-muted)]">
                      Notify author why "{rejectingEvent.title}" is not approved
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setRejectingEvent(null);
                      setRejectReason('');
                    }}
                    className="p-1 text-[var(--fg-muted)] hover:text-[var(--fg)]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleConfirmReject} className="space-y-4 text-xs">
                  <div>
                    <label className="font-semibold text-[var(--fg)] block mb-1">Reason for Rejection *</label>
                    <input
                      type="text"
                      required
                      maxLength={300}
                      value={rejectReason}
                      onChange={e => setRejectReason(e.target.value)}
                      placeholder="e.g. Does not align with guidelines, missing venue details, etc."
                      className="kw-input text-xs"
                      autoFocus
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--card-border)]">
                    <button
                      type="button"
                      onClick={() => {
                        setRejectingEvent(null);
                        setRejectReason('');
                      }}
                      className="kw-btn py-1.5 px-3 text-xs"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="kw-btn kw-btn-danger py-1.5 px-3.5 text-xs font-bold"
                    >
                      Reject Submission
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
        );
      })()}

      {/* TAB: TEAM MANAGEMENT */}
      {activeTab === 'team' && (
        <div className="space-y-6">
          <div className="p-4 sm:p-5 kw-card space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-[var(--gold)]" />
                  <h3 className="font-bold text-sm sm:text-base text-[var(--fg)]">Team Roster & Public Cards</h3>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--gold-subtle)] text-[var(--gold)] font-semibold">
                    {teamList.length} members
                  </span>
                </div>
                <p className="text-xs text-[var(--fg-muted)] mt-1">
                  Public landing and About pages read directly from this roster. Reorder with up/down buttons, edit details, link Kwegatta accounts, and upload WebP photos.
                </p>
              </div>
              <button
                onClick={openAddMemberModal}
                className="kw-btn kw-btn-gold text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Member</span>
              </button>
            </div>

            {teamList.length === 0 ? (
              <div className="text-center py-12 text-xs text-[var(--fg-muted)]">
                No team members found. Click "Add Member" to seed or add team members.
              </div>
            ) : (
              <div className="space-y-3">
                {teamList.map((member, index) => {
                  const photoUrl = member.photo || member.linked_avatar || (member.linked_profile_id ? `/api/avatar/${member.linked_profile_id}` : null);
                  return (
                    <div
                      key={member.id}
                      className={`p-3.5 sm:p-4 rounded-xl border bg-[var(--card)] transition-all ${
                        member.hidden ? 'border-dashed border-zinc-700 opacity-60' : 'border-[var(--card-border)]'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          {/* Photo or Initials */}
                          <div className="relative shrink-0">
                            {photoUrl ? (
                              <img
                                src={photoUrl}
                                alt={member.name}
                                className="w-12 h-12 rounded-full object-cover border border-[var(--card-border)]"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-[var(--gold-subtle)] text-[var(--gold)] font-bold text-sm grid place-items-center border border-[var(--card-border)]">
                                {member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                              </div>
                            )}
                            <label
                              title="Upload / Replace Photo (resized to WebP)"
                              className="absolute -bottom-1 -right-1 p-1 rounded-full bg-[var(--bg-elevated)] border border-[var(--card-border)] text-[var(--fg)] hover:text-[var(--gold)] cursor-pointer shadow-sm"
                            >
                              <Camera className="w-3 h-3" />
                              <input
                                type="file"
                                accept="image/*"
                                className="hidden"
                                disabled={teamPhotoUploadingId === member.id}
                                onChange={(e) => {
                                  const file = e.target.files?.[0];
                                  if (file) handlePhotoUploadForTeam(member.id, file);
                                }}
                              />
                            </label>
                          </div>

                          {/* Member Details */}
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-bold text-sm text-[var(--fg)] truncate">
                                {member.name}
                              </h4>
                              {index === 0 && (
                                <span className="text-[13px] px-1.5 py-0.5 rounded bg-[var(--gold-subtle)] text-[var(--gold)] font-medium">
                                  Lead / 1st
                                </span>
                              )}
                              {member.hidden && (
                                <span className="text-[13px] px-1.5 py-0.5 rounded bg-red-500/20 text-red-400 font-medium">
                                  Hidden
                                </span>
                              )}
                              {member.linked_profile_id && (
                                <span className="text-[13px] px-1.5 py-0.5 rounded bg-[var(--teal-subtle)] text-[var(--teal)] font-medium">
                                  Linked Account
                                </span>
                              )}
                            </div>
                            <p className="text-xs font-medium text-[var(--teal)] truncate">
                              {member.title}
                            </p>
                            {member.line1 && (
                              <p className="text-xs text-[var(--fg-muted)] line-clamp-1">
                                {member.line1}
                              </p>
                            )}
                            {member.line2 && (
                              <p className="text-xs text-[var(--fg-subtle)] line-clamp-1">
                                {member.line2}
                              </p>
                            )}
                            <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-[var(--fg-muted)]">
                              {member.github && (
                                <span className="flex items-center gap-1 text-[13px]">
                                  <Github className="w-3 h-3 text-[var(--fg-subtle)]" />
                                  <span>@{member.github}</span>
                                </span>
                              )}
                              {member.linkedin && (
                                <span className="flex items-center gap-1 text-[13px]">
                                  <Linkedin className="w-3 h-3 text-[var(--fg-subtle)]" />
                                  <span>LinkedIn</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Action buttons (Order, Hide, Edit, Delete) */}
                        <div className="flex items-center gap-1 self-end sm:self-center shrink-0">
                          {/* Reorder Up */}
                          <button
                            type="button"
                            disabled={index === 0}
                            onClick={() => handleMoveTeamMember(index, 'up')}
                            className="p-1.5 rounded-lg border border-[var(--card-border)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--card-hover)] disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                            title="Move up"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>

                          {/* Reorder Down */}
                          <button
                            type="button"
                            disabled={index === teamList.length - 1}
                            onClick={() => handleMoveTeamMember(index, 'down')}
                            className="p-1.5 rounded-lg border border-[var(--card-border)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--card-hover)] disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                            title="Move down"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>

                          {/* Hide / Show */}
                          <button
                            type="button"
                            onClick={() => handleToggleHideTeamMember(member)}
                            className={`p-1.5 rounded-lg border border-[var(--card-border)] cursor-pointer ${
                              member.hidden ? 'text-amber-400 bg-amber-500/10' : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
                            }`}
                            title={member.hidden ? 'Show on public cards' : 'Hide from public cards'}
                          >
                            {member.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                          </button>

                          {/* Edit */}
                          <button
                            type="button"
                            onClick={() => openEditMemberModal(member)}
                            className="p-1.5 rounded-lg border border-[var(--card-border)] text-[var(--fg-muted)] hover:text-[var(--gold)] hover:bg-[var(--card-hover)] cursor-pointer"
                            title="Edit member"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Delete */}
                          <button
                            type="button"
                            onClick={() => handleDeleteTeamMember(member)}
                            className="p-1.5 rounded-lg border border-[var(--card-border)] text-red-400 hover:bg-red-500/10 cursor-pointer"
                            title="Delete member"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ADD / EDIT MEMBER MODAL */}
          {isAddingMember && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-sm overflow-y-auto">
              <div className="kw-card w-full max-w-lg p-5 sm:p-6 space-y-4 my-8 border-[var(--gold)]/30">
                <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
                  <h3 className="font-bold text-base text-[var(--fg)]">
                    {editingMember ? `Edit Team Member: ${editingMember.name}` : 'Add New Team Member'}
                  </h3>
                  <button
                    onClick={() => { setIsAddingMember(false); setEditingMember(null); }}
                    className="p-1 rounded-lg text-[var(--fg-muted)] hover:text-[var(--fg)]"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <form onSubmit={handleSaveTeamMember} className="space-y-3.5 text-xs sm:text-sm">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--fg)] mb-1">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={teamForm.name}
                      onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
                      placeholder="e.g. Saifuddin Ahmed"
                      className="kw-input w-full py-2 px-3 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--fg)] mb-1">
                      Title / Role in Project *
                    </label>
                    <input
                      type="text"
                      required
                      value={teamForm.title}
                      onChange={(e) => setTeamForm({ ...teamForm, title: e.target.value })}
                      placeholder="e.g. Team lead and engineering"
                      className="kw-input w-full py-2 px-3 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--fg)] mb-1">
                      Line 1 (Background / Skills)
                    </label>
                    <input
                      type="text"
                      value={teamForm.line1}
                      onChange={(e) => setTeamForm({ ...teamForm, line1: e.target.value })}
                      placeholder="e.g. Software and AI Engineer • Systems Architect"
                      className="kw-input w-full py-2 px-3 rounded-lg text-xs"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--fg)] mb-1">
                      Line 2 (Affiliation / Organisation)
                    </label>
                    <input
                      type="text"
                      value={teamForm.line2}
                      onChange={(e) => setTeamForm({ ...teamForm, line2: e.target.value })}
                      placeholder="e.g. Future Stars Center for Development and Capacity Building"
                      className="kw-input w-full py-2 px-3 rounded-lg text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-[var(--fg)] mb-1">
                        GitHub Username
                      </label>
                      <input
                        type="text"
                        value={teamForm.github}
                        onChange={(e) => setTeamForm({ ...teamForm, github: e.target.value })}
                        placeholder="e.g. Saifuddin2Ahmed"
                        className="kw-input w-full py-2 px-3 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-[var(--fg)] mb-1">
                        LinkedIn URL
                      </label>
                      <input
                        type="url"
                        value={teamForm.linkedin}
                        onChange={(e) => setTeamForm({ ...teamForm, linkedin: e.target.value })}
                        placeholder="https://linkedin.com/in/..."
                        className="kw-input w-full py-2 px-3 rounded-lg text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--fg)] mb-1">
                      Linked Kwegatta Member Account
                    </label>
                    <select
                      value={teamForm.linked_profile_id}
                      onChange={(e) => setTeamForm({ ...teamForm, linked_profile_id: e.target.value })}
                      className="kw-input w-full py-2 px-3 rounded-lg text-xs bg-[var(--card)]"
                    >
                      <option value="">(None - unlinked)</option>
                      {members.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.role || 'member'}) {m.headline ? `• ${m.headline.slice(0, 30)}` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-[13px] text-[var(--fg-subtle)] mt-1">
                      If linked, the card uses their Kwegatta account photo and links directly to their public profile.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <input
                      type="checkbox"
                      id="team-hidden"
                      checked={teamForm.hidden}
                      onChange={(e) => setTeamForm({ ...teamForm, hidden: e.target.checked })}
                      className="rounded border-[var(--card-border)] text-[var(--gold)] focus:ring-0 cursor-pointer"
                    />
                    <label htmlFor="team-hidden" className="text-xs text-[var(--fg)] cursor-pointer">
                      Hide this person from public cards
                    </label>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--card-border)]">
                    <button
                      type="button"
                      onClick={() => { setIsAddingMember(false); setEditingMember(null); }}
                      className="kw-btn kw-btn-ghost text-xs py-2 px-4 rounded-xl cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingTeam}
                      className="kw-btn kw-btn-gold text-xs py-2 px-5 rounded-xl font-semibold flex items-center gap-1.5 cursor-pointer"
                    >
                      {isSavingTeam ? 'Saving...' : editingMember ? 'Save Changes' : 'Add Person'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
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
                          <span className="px-2 py-0.5 rounded text-[13px] font-bold bg-amber-500/10 text-[var(--gold)] border border-amber-500/20">
                            ADMIN_EMAILS
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[13px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
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
              <span className="text-[13px] text-[var(--success)] flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                <span>+{overview.joined_last_hour} in last hour</span>
              </span>
            </div>

            <div className="p-4 kw-card space-y-1">
              <span className="text-xs text-[var(--fg-muted)]">Complementary Matches</span>
              <div className="text-2xl font-bold font-display text-[var(--gold)]">{overview.matches_count}</div>
              <span className="text-[13px] text-[var(--fg-muted)]">AI & heuristic pairs</span>
            </div>

            <div className="p-4 kw-card space-y-1">
              <span className="text-xs text-[var(--fg-muted)]">Connect Requests</span>
              <div className="text-2xl font-bold font-display text-[var(--teal)]">{overview.connect_requests_count}</div>
              <span className="text-[13px] text-[var(--fg-muted)]">WhatsApp connections</span>
            </div>

            <div className="p-4 kw-card space-y-1">
              <span className="text-xs text-[var(--fg-muted)]">Community Posts</span>
              <div className="text-2xl font-bold font-display text-[var(--fg)]">{overview.posts_count}</div>
              <span className="text-[13px] text-[var(--fg-muted)]">Needs & offers</span>
            </div>

            <div className="p-4 kw-card space-y-1">
              <span className="text-xs text-[var(--fg-muted)]">Follow Connections</span>
              <div className="text-2xl font-bold font-display text-[var(--fg)]">{overview.follows_count}</div>
              <span className="text-[13px] text-[var(--fg-muted)]">Attendee network</span>
            </div>

            <div className="p-4 kw-card space-y-1">
              <span className="text-xs text-[var(--fg-muted)]">Moderated Members</span>
              <div className="text-2xl font-bold font-display text-[var(--fg)]">{overview.hidden_members_count}</div>
              <span className="text-[13px] text-[var(--fg-muted)]">Hidden or suspended</span>
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
              <thead className="bg-[var(--bg-subtle)] text-[var(--fg-muted)] border-b border-[var(--card-border)] uppercase tracking-wider text-[13px]">
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
                            {member.is_organiser && (
                              <span className="px-1.5 py-0.5 rounded text-[13px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30 inline-flex items-center gap-0.5">
                                <Award className="w-2.5 h-2.5" />
                                Organiser
                              </span>
                            )}
                            {member.suspended && (
                              <span className="px-1.5 py-0.5 rounded text-[13px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                Suspended
                              </span>
                            )}
                            {member.hidden && !member.suspended && (
                              <span className="px-1.5 py-0.5 rounded text-[13px] font-bold bg-gray-500/20 text-[var(--fg-muted)]">
                                Hidden
                              </span>
                            )}
                          </div>
                          <div className="text-[13px] text-[var(--fg-muted)] font-mono">{member.id}</div>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded-full text-[13px] font-semibold bg-[var(--bg-subtle)] text-[var(--fg)]">
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
                              className="kw-btn text-[13px] py-1 px-2"
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
                              className="kw-btn text-[13px] py-1 px-2"
                            >
                              {member.hidden ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                              <span>{member.hidden ? 'Unhide' : 'Hide'}</span>
                            </button>

                            {/* Trusted Organiser Toggle */}
                            <button
                              onClick={() => handleToggleOrganiser(member.id, member.is_organiser)}
                              className={`kw-btn text-[13px] py-1 px-2 ${
                                member.is_organiser
                                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                                  : 'text-purple-400 hover:bg-purple-500/10'
                              }`}
                              title={member.is_organiser ? 'Revoke trusted Organiser label' : 'Mark as trusted Organiser'}
                            >
                              <Award className="w-3 h-3" />
                              <span>{member.is_organiser ? 'Revoke Organiser' : 'Make Organiser'}</span>
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
                              className={`kw-btn text-[13px] py-1 px-2 ${
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
                              className="kw-btn kw-btn-danger text-[13px] py-1 px-2"
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
                        <span className="px-2 py-0.5 rounded text-[13px] uppercase font-bold bg-red-500/10 text-red-400">
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
                    <span className="text-[13px] text-[var(--fg-muted)]">{new Date(post.created_at).toLocaleTimeString()}</span>
                    <span className="px-1.5 py-0.5 rounded text-[13px] font-mono bg-[var(--bg-subtle)] text-[var(--fg)]">
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
              <thead className="bg-[var(--bg-subtle)] text-[var(--fg-muted)] border-b border-[var(--card-border)] uppercase tracking-wider text-[13px]">
                <tr>
                  <th className="p-3">Timestamp</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Admin</th>
                  <th className="p-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--card-border)] font-mono text-[13px]">
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
