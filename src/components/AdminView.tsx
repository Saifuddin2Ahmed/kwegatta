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
  Flag
} from 'lucide-react';
import { Profile, Post } from '../types';
import { SetupView } from './SetupView';
import { EventPhotosModal } from './EventPhotosModal';
import { useEventPhotos } from '../hooks/useEventPhotos';
import { callGemma, GEMMA_MODEL_ID } from '../services/api';

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
}

export const AdminView: React.FC<AdminViewProps> = ({
  onBack,
  onRefreshGlobalData,
  onToast
}) => {
  const [passcode, setPasscode] = useState('');
  const [adminToken, setAdminToken] = useState<string | null>(() => sessionStorage.getItem('kw_admin_token'));
  const [isVerifying, setIsVerifying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'overview' | 'members' | 'reports' | 'posts' | 'photos' | 'ai' | 'tools' | 'setup' | 'audit'>('overview');
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

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsVerifying(true);
    setErrorMsg(null);

    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: passcode })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Invalid admin passcode');
      }

      setAdminToken(data.token);
      sessionStorage.setItem('kw_admin_token', data.token);
      onToast('Admin verified successfully');
    } catch (err: any) {
      setErrorMsg(err.message || 'Authentication failed');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleLogout = () => {
    setAdminToken(null);
    sessionStorage.removeItem('kw_admin_token');
    onToast('Signed out of admin dashboard');
  };

  const fetchAdminData = async () => {
    if (!adminToken) return;
    setIsLoadingData(true);

    try {
      const headers = { 'x-admin-token': adminToken };
      const [ovRes, memRes, postRes, logRes, repRes] = await Promise.all([
        fetch('/api/admin/overview', { headers }),
        fetch('/api/admin/members', { headers }),
        fetch('/api/admin/posts', { headers }),
        fetch('/api/admin/audit-log', { headers }),
        fetch('/api/admin/reports', { headers })
      ]);

      if (ovRes.status === 401 || memRes.status === 401) {
        handleLogout();
        throw new Error('Admin session expired. Please re-enter passcode.');
      }

      if (ovRes.ok) setOverview(await ovRes.json());
      if (memRes.ok) setMembers(await memRes.json());
      if (postRes.ok) setPosts(await postRes.json());
      if (logRes.ok) setAuditLog(await logRes.json());
      if (repRes.ok) setReports(await repRes.json());
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    if (adminToken) {
      fetchAdminData();
    }
  }, [adminToken]);

  const handleAdminAction = async (action: string, payload: any) => {
    if (!adminToken) return;
    try {
      const res = await fetch('/api/admin/action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken
        },
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
    if (!adminToken) return;
    window.open(`/api/admin/export?type=${type}&format=${format}&token=${encodeURIComponent(adminToken)}`, '_blank');
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setIsImporting(true);
      const text = await file.text();
      const parsed = JSON.parse(text);

      const res = await fetch('/api/admin/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken || ''
        },
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
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/admin/reports/${reportId}/action`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-admin-token': adminToken
        },
        body: JSON.stringify({ action })
      });
      if (res.ok) {
        onToast(`Report marked as ${action}d`);
        setReports(prev => prev.map(r => r.id === reportId ? { ...r, status: action === 'dismiss' ? 'dismissed' : 'resolved' } : r));
      }
    } catch (e: any) {
      onToast('Action failed: ' + e.message);
    }
  };

  // 1. Passcode Login View if unauthenticated
  if (!adminToken) {
    return (
      <div className="max-w-md mx-auto my-12 p-6 sm:p-8 kw-card space-y-6">
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-full bg-[var(--gold-subtle)] text-[var(--gold)] mx-auto grid place-items-center">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold font-display">Organiser & Admin Access</h2>
          <p className="text-xs text-[var(--fg-muted)]">
            Enter the secure admin passcode configured on the server environment.
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 rounded-lg bg-[var(--danger-subtle)] border border-[var(--danger)] text-xs text-[var(--danger)] flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-[var(--fg-muted)] block">Admin Passcode</label>
            <input
              type="password"
              value={passcode}
              onChange={e => setPasscode(e.target.value)}
              placeholder="Enter passcode (e.g. kwegatta2026)"
              required
              autoFocus
              className="kw-input font-mono"
            />
            <p className="text-[11px] text-[var(--fg-subtle)]">
              Default passcode: <code className="text-[var(--gold)] font-mono">kwegatta2026</code> (or your <code className="text-[var(--fg-muted)]">ADMIN_CODE</code> env variable).
            </p>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onBack}
              className="kw-btn flex-1"
            >
              Back
            </button>
            <button
              type="submit"
              disabled={isVerifying || !passcode}
              className="kw-btn kw-btn-gold flex-1"
            >
              <ShieldCheck className="w-4 h-4" />
              <span>{isVerifying ? 'Verifying...' : 'Unlock Admin'}</span>
            </button>
          </div>
        </form>
      </div>
    );
  }

  // 2. Authenticated Admin Dashboard
  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-in fade-in pb-12">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 p-4 kw-card">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[var(--gold-subtle)] text-[var(--gold)] grid place-items-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold font-display">Kwegatta Organiser Dashboard</h1>
            <p className="text-xs text-[var(--fg-muted)]">
              Live event analytics, moderation controls & AI monitoring
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
            className="kw-btn text-xs py-1.5 px-3"
          >
            Lock Dashboard
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-[var(--card-border)] pb-2">
        {[
          { id: 'overview', label: 'Overview & Insights', icon: BarChart3 },
          { id: 'members', label: `Members (${overview?.members_count || 0})`, icon: Users },
          { id: 'reports', label: `Safety Reports (${reports.filter(r => r.status === 'pending').length})`, icon: Flag },
          { id: 'posts', label: `Feed Posts (${overview?.posts_count || 0})`, icon: MessageSquare },
          { id: 'photos', label: 'Event Photos', icon: Camera },
          { id: 'ai', label: 'AI Health (Gemma 4)', icon: Cpu },
          { id: 'tools', label: 'Broadcast & Export', icon: Download },
          { id: 'setup', label: 'Setup Diagnostics', icon: Settings },
          { id: 'audit', label: `Audit Log (${auditLog.length})`, icon: ShieldCheck }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`kw-btn text-xs py-1.5 px-3 rounded-lg ${
                isActive ? 'kw-btn-gold' : ''
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW & INSIGHTS */}
      {activeTab === 'overview' && overview && (
        <div className="space-y-6">
          {/* Key Metrics Cards */}
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
              <span className="text-[10px] text-[var(--fg-muted)]">Network graph edges</span>
            </div>

            <div className="p-4 kw-card space-y-1">
              <span className="text-xs text-[var(--fg-muted)]">AI Success Rate</span>
              <div className="text-2xl font-bold font-display text-[var(--success)]">{overview.ai_health.success_rate}%</div>
              <span className="text-[10px] text-[var(--fg-muted)]">{overview.ai_health.calls_today} calls today</span>
            </div>
          </div>

          {/* Organiser Insights Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-5 kw-card space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold font-display text-[var(--gold)]">
                <Zap className="w-4 h-4" />
                <span>Most Needed Skills</span>
              </div>
              <p className="text-xs text-[var(--fg-muted)]">Top capabilities requested by attendees in the room:</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {overview.insights.most_needed_skills.map((skill, idx) => (
                  <span key={idx} className="kw-badge kw-badge-gold text-xs">
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-5 kw-card space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold font-display text-[var(--teal)]">
                <Sparkles className="w-4 h-4" />
                <span>Most Offered Skills</span>
              </div>
              <p className="text-xs text-[var(--fg-muted)]">Abundant strengths available in the room:</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {overview.insights.most_offered_skills.map((skill, idx) => (
                  <span key={idx} className="kw-badge kw-badge-teal text-xs">
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            <div className="p-5 kw-card space-y-3">
              <div className="flex items-center gap-2 text-sm font-bold font-display text-[var(--attention)]">
                <AlertCircle className="w-4 h-4" />
                <span>Unmet Needs (Opportunity Gaps)</span>
              </div>
              <p className="text-xs text-[var(--fg-muted)]">Needs asked for that zero attendees currently offer:</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {overview.insights.unmet_needs.length > 0 ? (
                  overview.insights.unmet_needs.map((need, idx) => (
                    <span key={idx} className="kw-badge bg-[var(--attention-subtle)] text-[var(--attention)] border border-[var(--attention)] text-xs">
                      {need}
                    </span>
                  ))
                ) : (
                  <span className="text-xs text-[var(--success)]">All requested skills have matches in the room!</span>
                )}
              </div>
            </div>
          </div>

          {/* Members by Role Breakdown */}
          <div className="p-5 kw-card space-y-3">
            <h3 className="font-bold font-display text-sm">Members by Hackathon Role</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {Object.entries(overview.members_by_role).map(([role, count]) => (
                <div key={role} className="p-3 bg-[var(--bg-subtle)] rounded-lg border border-[var(--card-border)] text-center">
                  <div className="text-xs uppercase tracking-wider text-[var(--fg-muted)] font-semibold">{role}</div>
                  <div className="text-xl font-bold font-display text-[var(--fg)] mt-1">{count}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: MEMBERS MANAGEMENT */}
      {activeTab === 'members' && (
        <div className="p-5 kw-card space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="font-bold font-display text-sm">Member Directory & Moderation</h3>
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-[var(--fg-muted)]" />
              <input
                type="text"
                value={memberSearch}
                onChange={e => setMemberSearch(e.target.value)}
                placeholder="Search by name, role or tag..."
                className="kw-input pl-9 text-xs"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-[var(--bg-subtle)] text-[var(--fg-muted)] border-b border-[var(--card-border)] uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="p-3">Member</th>
                  <th className="p-3">Role</th>
                  <th className="p-3">Offers & Needs</th>
                  <th className="p-3">WhatsApp Phone</th>
                  <th className="p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--card-border)]">
                {members
                  .filter(m => !memberSearch || m.name?.toLowerCase().includes(memberSearch.toLowerCase()) || m.role?.toLowerCase().includes(memberSearch.toLowerCase()))
                  .map(member => {
                    const isPhoneRevealed = revealedPhones.has(member.id);
                    return (
                      <tr key={member.id} className={member.hidden ? 'opacity-50 bg-[var(--danger-subtle)]' : ''}>
                        <td className="p-3">
                          <div className="font-semibold text-[var(--fg)]">{member.name}</div>
                          <div className="text-[10px] text-[var(--fg-muted)] line-clamp-1">{member.headline}</div>
                        </td>
                        <td className="p-3">
                          <span className="kw-badge kw-badge-teal text-[10px]">{member.role}</span>
                        </td>
                        <td className="p-3 max-w-xs">
                          <div className="line-clamp-1"><strong className="text-[var(--gold)]">Offers:</strong> {member.offers}</div>
                          <div className="line-clamp-1"><strong className="text-[var(--teal)]">Needs:</strong> {member.needs}</div>
                        </td>
                        <td className="p-3 whitespace-nowrap">
                          {isPhoneRevealed ? (
                            <span className="font-mono text-[var(--fg)] font-semibold">{member.whatsapp || 'None provided'}</span>
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
                            <button
                              onClick={() => {
                                if (confirm(`Delete member ${member.name}?`)) {
                                  handleAdminAction('delete_member', { id: member.id });
                                }
                              }}
                              className="kw-btn kw-btn-danger text-[10px] py-1 px-2"
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
            <span className="kw-badge kw-badge-gold text-xs">
              {reports.filter(r => r.status === 'pending').length} Pending
            </span>
          </div>

          {reports.length === 0 ? (
            <div className="p-8 text-center space-y-2 border border-dashed border-[var(--card-border)] rounded-xl">
              <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto" />
              <h4 className="text-xs font-semibold text-[var(--fg)]">No safety reports recorded</h4>
              <p className="text-[11px] text-[var(--fg-muted)]">All community interactions are running smoothly.</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--card-border)]">
              {reports.map((report: any) => {
                const reported = members.find(m => m.id === report.reported_id);
                return (
                  <div key={report.id} className="py-4 flex flex-col md:flex-row md:items-start justify-between gap-4">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                          report.status === 'pending'
                            ? 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                            : report.status === 'resolved'
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                            : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                        }`}>
                          {report.status || 'pending'}
                        </span>
                        <span className="font-semibold text-xs text-[var(--fg)]">
                          Reason: <strong className="text-[var(--gold)]">{report.reason}</strong>
                        </span>
                        <span className="text-[11px] text-[var(--fg-muted)]">
                          · {new Date(report.created_at).toLocaleString()}
                        </span>
                      </div>

                      <div className="text-xs text-[var(--fg-muted)] flex items-center gap-2">
                        <span>Reported Member:</span>
                        {reported ? (
                          <span className="font-semibold text-[var(--fg)]">
                            {reported.name} ({reported.role})
                          </span>
                        ) : (
                          <span className="font-mono text-[var(--fg-subtle)]">{report.reported_id}</span>
                        )}
                        {report.reporter_name && (
                          <span>· Reported by: {report.reporter_name}</span>
                        )}
                      </div>

                      {report.details && (
                        <div className="p-2.5 rounded-lg bg-[var(--bg-subtle)] border border-[var(--card-border)] text-xs text-[var(--fg)] font-sans">
                          {report.details}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {report.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleReportAction(report.id, 'resolve')}
                            className="kw-btn kw-btn-teal text-xs py-1 px-2.5 flex items-center gap-1"
                          >
                            <span>Resolve</span>
                          </button>
                          <button
                            onClick={() => handleReportAction(report.id, 'dismiss')}
                            className="kw-btn text-xs py-1 px-2.5"
                          >
                            <span>Dismiss</span>
                          </button>
                        </>
                      )}
                      {reported && (
                        <button
                          onClick={() => {
                            if (confirm(`Delete reported member ${reported.name} and purge their data?`)) {
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

      {/* TAB 3: POSTS MODERATION */}
      {activeTab === 'posts' && (
        <div className="p-5 kw-card space-y-4">
          <h3 className="font-bold font-display text-sm">Community Feed Moderation</h3>
          <div className="divide-y divide-[var(--card-border)]">
            {posts.map(post => (
              <div key={post.id} className="py-3 flex items-start justify-between gap-4">
                <div className="space-y-1 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="kw-badge kw-badge-gold text-[10px]">{post.kind}</span>
                    <span className="font-semibold text-xs text-[var(--fg)]">{post.title || 'Untitled Post'}</span>
                  </div>
                  <p className="text-xs text-[var(--fg-muted)] leading-relaxed">{post.body}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (confirm('Delete this post?')) {
                        handleAdminAction('delete_post', { id: post.id });
                      }
                    }}
                    className="kw-btn kw-btn-danger text-[10px] py-1 px-2.5"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* TAB: EVENT PHOTOS MANAGER */}
      {activeTab === 'photos' && (
        <div className="p-6 kw-card space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--card-border)] pb-4">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--gold)] mb-1">
                <Camera className="w-4 h-4" />
                <span>Authentic Event Photography &amp; Assets</span>
              </div>
              <h3 className="text-lg font-bold font-display text-[var(--fg)]">
                Manage Hack Day Kampala Event Photos
              </h3>
              <p className="text-xs text-[var(--fg-muted)] mt-1 max-w-2xl">
                Upload or replace original photos taken at the event. Images are saved to disk with zero cloud latency and instantly update across the hero, story narrative, and about sections.
              </p>
            </div>
            <button
              onClick={() => setIsPhotosModalOpen(true)}
              className="kw-btn kw-btn-gold text-xs py-2 px-4 flex items-center gap-2 font-semibold shadow-sm cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Photos Modal</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Slot 1: Hero Team Coding */}
            <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)] space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="aspect-[16/10] rounded-lg overflow-hidden border border-[var(--card-border)] bg-[var(--card)]">
                  <img
                    src={photos.hero}
                    alt="Hero Team Coding"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-[var(--fg)]">Hero Team Photo</h4>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--gold-subtle)] text-[var(--gold)] font-bold">Slot 1</span>
                </div>
                <p className="text-xs text-[var(--fg-muted)]">
                  Displayed on the home landing page hero right beside the headline and 2-minute onboarding button.
                </p>
              </div>
              <button
                onClick={() => setIsPhotosModalOpen(true)}
                className="kw-btn kw-btn-ghost text-xs py-2 px-3 w-full flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-[var(--gold)]" />
                <span>Change Hero Photo</span>
              </button>
            </div>

            {/* Slot 2: Event Hall */}
            <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)] space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="aspect-[16/10] rounded-lg overflow-hidden border border-[var(--card-border)] bg-[var(--card)]">
                  <img
                    src={photos.hall}
                    alt="Event Hall EIIC MUBS"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-[var(--fg)]">Event Hall (EIIC MUBS)</h4>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--teal-subtle)] text-[var(--teal)] font-bold">Slot 2</span>
                </div>
                <p className="text-xs text-[var(--fg-muted)]">
                  Displayed inside the "Built in one day in Kampala" story section to showcase the venue.
                </p>
              </div>
              <button
                onClick={() => setIsPhotosModalOpen(true)}
                className="kw-btn kw-btn-ghost text-xs py-2 px-3 w-full flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-[var(--gold)]" />
                <span>Change Hall Photo</span>
              </button>
            </div>

            {/* Slot 3: Collaborators & Attendees */}
            <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)] space-y-3 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="aspect-[16/10] rounded-lg overflow-hidden border border-[var(--card-border)] bg-[var(--card)]">
                  <img
                    src={photos.team}
                    alt="Collaborators and Attendees"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-[var(--fg)]">Collaborating Team</h4>
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-bold">Slot 3</span>
                </div>
                <p className="text-xs text-[var(--fg-muted)]">
                  Displayed alongside the event hall photo in the story narrative section.
                </p>
              </div>
              <button
                onClick={() => setIsPhotosModalOpen(true)}
                className="kw-btn kw-btn-ghost text-xs py-2 px-3 w-full flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5 text-[var(--gold)]" />
                <span>Change Team Photo</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: AI HEALTH (GEMMA 4) */}
      {activeTab === 'ai' && overview && (
        <div className="p-5 kw-card space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-[var(--done)]" />
              <h3 className="font-bold font-display text-sm">Gemma 4 (31B IT) Model Performance</h3>
            </div>
            <span className="kw-badge kw-badge-gold text-xs">Open-Weight Apache 2.0</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <div className="p-4 bg-[var(--bg-subtle)] rounded-lg border border-[var(--card-border)] text-center">
              <span className="text-xs text-[var(--fg-muted)]">Total Invocations</span>
              <div className="text-2xl font-bold font-display text-[var(--fg)] mt-1">{overview.ai_health.calls_today}</div>
            </div>

            <div className="p-4 bg-[var(--bg-subtle)] rounded-lg border border-[var(--card-border)] text-center">
              <span className="text-xs text-[var(--fg-muted)]">Success Rate</span>
              <div className="text-2xl font-bold font-display text-[var(--success)] mt-1">{overview.ai_health.success_rate}%</div>
            </div>

            <div className="p-4 bg-[var(--bg-subtle)] rounded-lg border border-[var(--card-border)] text-center">
              <span className="text-xs text-[var(--fg-muted)]">Fallback Rate</span>
              <div className="text-2xl font-bold font-display text-[var(--attention)] mt-1">{overview.ai_health.fallback_rate}%</div>
            </div>

            <div className="p-4 bg-[var(--bg-subtle)] rounded-lg border border-[var(--card-border)] text-center">
              <span className="text-xs text-[var(--fg-muted)]">Average Latency</span>
              <div className="text-2xl font-bold font-display text-[var(--gold)] mt-1">{overview.ai_health.avg_response_time_ms} ms</div>
            </div>
          </div>

          {/* Test Button */}
          <div className="p-4 bg-[var(--bg-subtle)] rounded-lg border border-[var(--card-border)] space-y-3">
            <div className="font-semibold text-xs text-[var(--fg)]">Live Model Ping Test</div>
            <p className="text-xs text-[var(--fg-muted)]">
              Sends a live test query to <code>gemma-4-31b-it</code> with minimal thinking level to confirm server proxy health.
            </p>
            <button
              onClick={handleTestGemmaAI}
              disabled={isTestingGemma}
              className="kw-btn kw-btn-gold text-xs py-2 px-4"
            >
              <Sparkles className="w-4 h-4" />
              <span>{isTestingGemma ? 'Calling Gemma 4...' : 'Test Gemma 4 Live'}</span>
            </button>

            {gemmaTestStatus && (
              <div className="p-3 rounded bg-[var(--bg)] border border-[var(--card-border)] font-mono text-xs text-[var(--fg)]">
                {gemmaTestStatus}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: BROADCAST & EXPORT TOOLS */}
      {activeTab === 'tools' && (
        <div className="space-y-6">
          {/* Announcement Broadcaster */}
          <div className="p-5 kw-card space-y-3">
            <h3 className="font-bold font-display text-sm flex items-center gap-2">
              <Send className="w-4 h-4 text-[var(--gold)]" />
              <span>Send Room Announcement Notification</span>
            </h3>
            <p className="text-xs text-[var(--fg-muted)]">
              Broadcast an in-app push notice to all active attendees (e.g. lunch announcement, pitch room shift).
            </p>
            <form onSubmit={handleSendAnnouncement} className="space-y-3">
              <textarea
                value={announcementText}
                onChange={e => setAnnouncementText(e.target.value)}
                placeholder="Type your announcement here..."
                rows={3}
                className="kw-textarea text-xs"
                required
              />
              <button
                type="submit"
                disabled={isSendingAnnouncement || !announcementText.trim()}
                className="kw-btn kw-btn-gold text-xs py-2 px-4"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSendingAnnouncement ? 'Broadcasting...' : 'Broadcast to All Attendees'}</span>
              </button>
            </form>
          </div>

          {/* Export Data */}
          <div className="p-5 kw-card space-y-3">
            <h3 className="font-bold font-display text-sm flex items-center gap-2">
              <Download className="w-4 h-4 text-[var(--teal)]" />
              <span>Organiser Data Export</span>
            </h3>
            <p className="text-xs text-[var(--fg-muted)]">
              Download the live registration and matching graph for post-event analysis.
            </p>
            <div className="flex flex-wrap gap-2 pt-2">
              <button
                onClick={() => handleExport('members', 'csv')}
                className="kw-btn text-xs py-1.5 px-3"
              >
                Export Members (CSV)
              </button>
              <button
                onClick={() => handleExport('members', 'json')}
                className="kw-btn text-xs py-1.5 px-3"
              >
                Export Members (JSON)
              </button>
              <button
                onClick={() => handleExport('matches', 'csv')}
                className="kw-btn text-xs py-1.5 px-3"
              >
                Export Matches (CSV)
              </button>
              <button
                onClick={() => handleExport('matches', 'json')}
                className="kw-btn text-xs py-1.5 px-3"
              >
                Export Matches (JSON)
              </button>
            </div>
          </div>

          {/* Import Data */}
          <div className="p-5 kw-card space-y-3">
            <h3 className="font-bold font-display text-sm flex items-center gap-2">
              <Upload className="w-4 h-4 text-[var(--teal)]" />
              <span>Organiser Member Import</span>
            </h3>
            <p className="text-xs text-[var(--fg-muted)]">
              Restore member profiles with preserved IDs from a previously exported <code className="px-1 py-0.5 rounded bg-[var(--gold-subtle)] text-[11px]">kwegatta-members.json</code> backup file.
            </p>
            <div className="pt-2">
              <input
                type="file"
                ref={fileInputRef}
                accept=".json,application/json"
                onChange={handleImportFile}
                className="hidden"
                id="admin-import-file-input"
              />
              <label
                htmlFor="admin-import-file-input"
                className={`kw-btn text-xs py-1.5 px-3 inline-flex items-center gap-1.5 cursor-pointer ${
                  isImporting ? 'opacity-50 pointer-events-none' : ''
                }`}
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{isImporting ? 'Importing members...' : 'Import Members (JSON Backup)'}</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: SETUP DIAGNOSTICS (Restricted to Admin Only) */}
      {activeTab === 'setup' && (
        <div className="space-y-4">
          <SetupView
            onSignOut={onBack}
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
            Every administrative action is permanently recorded in the system audit log.
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
                    <td className="p-3 text-[var(--fg-muted)] whitespace-nowrap">{new Date(item.timestamp).toLocaleTimeString()}</td>
                    <td className="p-3 font-semibold text-[var(--gold)]">{item.action}</td>
                    <td className="p-3 text-[var(--teal)]">{item.admin}</td>
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
