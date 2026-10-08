import React, { useState, useEffect } from 'react';
import {
  Calendar,
  MapPin,
  Clock,
  ExternalLink,
  Share2,
  Users,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Check,
  ArrowLeft,
  Tag,
  Bookmark,
  Plus,
  Edit,
  Trash2,
  Megaphone,
  Flag,
  X,
  Award,
  AlertCircle
} from 'lucide-react';
import { EventOpportunityItem, OpportunityType, Profile } from '../types';
import { Avatar } from './Avatar';
import {
  fetchEvents,
  fetchEventById,
  rsvpEvent,
  createEvent,
  updateEvent,
  deleteEvent,
  sendEventAttendeeUpdate,
  PUBLIC_APP_URL
} from '../services/api';

interface EventsViewProps {
  currentProfile: Profile | null;
  allProfiles: Profile[];
  initialItemId?: string | null;
  onViewProfile: (profileId: string) => void;
  onJoinClick?: () => void;
  onToast: (msg: string) => void;
}

export const EventsView: React.FC<EventsViewProps> = ({
  currentProfile,
  allProfiles,
  initialItemId,
  onViewProfile,
  onJoinClick,
  onToast
}) => {
  const [items, setItems] = useState<EventOpportunityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [kindFilter, setKindFilter] = useState<'all' | 'event' | 'opportunity'>('all');
  const [showPast, setShowPast] = useState(false);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(initialItemId || null);
  const [detailedItem, setDetailedItem] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [rsvpLoading, setRsvpLoading] = useState(false);

  // Suggest / Edit Modal States
  const [isSuggestModalOpen, setIsSuggestModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<EventOpportunityItem | null>(null);
  const [suggestKind, setSuggestKind] = useState<'event' | 'opportunity'>('event');
  const [suggestTitle, setSuggestTitle] = useState('');
  const [suggestDescription, setSuggestDescription] = useState('');
  const [suggestDatetime, setSuggestDatetime] = useState('');
  const [suggestLocation, setSuggestLocation] = useState('');
  const [suggestCoverImage, setSuggestCoverImage] = useState('');
  const [suggestRegLink, setSuggestRegLink] = useState('');
  const [suggestOppType, setSuggestOppType] = useState<OpportunityType>('Hackathon');
  const [suggestDeadline, setSuggestDeadline] = useState('');
  const [suggestLink, setSuggestLink] = useState('');
  const [suggestSubmitting, setSuggestSubmitting] = useState(false);

  // Send Update to Attendees Modal State
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');
  const [sendingUpdate, setSendingUpdate] = useState(false);

  // Safety Report Modal State
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportingItem, setReportingItem] = useState<EventOpportunityItem | null>(null);
  const [reportReason, setReportReason] = useState('Inappropriate or misleading content');
  const [reportDetails, setReportDetails] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  // Load items list
  const loadEventsList = async () => {
    setLoading(true);
    try {
      const data = await fetchEvents();
      setItems(data);
    } catch (err) {
      console.warn('Failed to load events', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEventsList();
  }, []);

  // Update selected item from prop if changed
  useEffect(() => {
    if (initialItemId) {
      setSelectedItemId(initialItemId);
    }
  }, [initialItemId]);

  // Load detailed item when selected
  useEffect(() => {
    if (!selectedItemId) {
      setDetailedItem(null);
      return;
    }
    setLoadingDetail(true);
    fetchEventById(selectedItemId)
      .then(res => {
        if (res) {
          setDetailedItem(res);
        } else {
          onToast('Event or Opportunity not found');
          setSelectedItemId(null);
        }
      })
      .catch(() => {
        onToast('Failed to load event details');
        setSelectedItemId(null);
      })
      .finally(() => setLoadingDetail(false));
  }, [selectedItemId]);

  const handleRsvp = async (itemId: string) => {
    if (!currentProfile) {
      onToast('Please join or sign in to RSVP');
      if (onJoinClick) onJoinClick();
      return;
    }

    setRsvpLoading(true);
    try {
      const res = await rsvpEvent(itemId);
      if (res.success) {
        // Update local detail
        if (detailedItem && detailedItem.id === itemId) {
          setDetailedItem((prev: any) => {
            if (!prev) return prev;
            const updatedAttendeeIds = res.is_attending
              ? [...(prev.attendee_ids || []), currentProfile.id]
              : (prev.attendee_ids || []).filter((id: string) => id !== currentProfile.id);
            return {
              ...prev,
              is_attending: res.is_attending,
              attendee_ids: updatedAttendeeIds,
              attendees: res.is_attending
                ? [...(prev.attendees || []), currentProfile]
                : (prev.attendees || []).filter((a: any) => a.id !== currentProfile.id)
            };
          });
        }

        // Update items list state
        setItems(prev =>
          prev.map(it => {
            if (it.id !== itemId) return it;
            const newAttendees = res.is_attending
              ? [...it.attendee_ids, currentProfile.id]
              : it.attendee_ids.filter(id => id !== currentProfile.id);
            return { ...it, attendee_ids: newAttendees };
          })
        );

        onToast(res.is_attending ? "You're attending! Matches updated." : 'RSVP updated.');
        // Refetch detailed item to update "People you should meet"
        if (selectedItemId === itemId) {
          fetchEventById(itemId).then(fresh => {
            if (fresh) setDetailedItem(fresh);
          });
        }
      }
    } catch (err: any) {
      onToast(err.message || 'Failed to update RSVP');
    } finally {
      setRsvpLoading(false);
    }
  };

  const handleShare = (item: EventOpportunityItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const shareUrl = `${PUBLIC_APP_URL}/#/events/${item.id}`;
    if (navigator.share) {
      navigator.share({
        title: item.title,
        text: item.kind === 'event' ? `Join me at ${item.title} on Kwegatta!` : `Check out this opportunity: ${item.title}`,
        url: shareUrl
      }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl);
      onToast('Event link copied to clipboard');
    }
  };

  const resetSuggestForm = () => {
    setSuggestKind('event');
    setSuggestTitle('');
    setSuggestDescription('');
    setSuggestDatetime('');
    setSuggestLocation('');
    setSuggestCoverImage('');
    setSuggestRegLink('');
    setSuggestOppType('Hackathon');
    setSuggestDeadline('');
    setSuggestLink('');
  };

  const openSuggestModal = () => {
    if (!currentProfile) {
      onToast('Please join or sign in to suggest an event');
      if (onJoinClick) onJoinClick();
      return;
    }
    resetSuggestForm();
    setIsSuggestModalOpen(true);
  };

  const openEditModal = (item: EventOpportunityItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingItem(item);
    setSuggestKind(item.kind);
    setSuggestTitle(item.title);
    setSuggestDescription(item.description);
    setSuggestDatetime(item.datetime || '');
    setSuggestLocation(item.location || '');
    setSuggestCoverImage(item.cover_image || '');
    setSuggestRegLink(item.registration_link || '');
    setSuggestOppType(item.opportunity_type || 'Hackathon');
    setSuggestDeadline(item.deadline || '');
    setSuggestLink(item.link || '');
    setIsEditModalOpen(true);
  };

  const handleSuggestSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProfile) {
      onToast('Please join or sign in to suggest an event');
      if (onJoinClick) onJoinClick();
      return;
    }

    if (suggestRegLink && !suggestRegLink.trim().toLowerCase().startsWith('https://')) {
      onToast('Registration link must start with https://');
      return;
    }
    if (suggestLink && !suggestLink.trim().toLowerCase().startsWith('https://')) {
      onToast('Opportunity link must start with https://');
      return;
    }

    setSuggestSubmitting(true);
    try {
      const payload: any = {
        kind: suggestKind,
        title: suggestTitle.trim(),
        description: suggestDescription.trim()
      };
      if (suggestKind === 'event') {
        payload.datetime = suggestDatetime.trim();
        payload.location = suggestLocation.trim();
        if (suggestCoverImage.trim()) payload.cover_image = suggestCoverImage.trim();
        if (suggestRegLink.trim()) payload.registration_link = suggestRegLink.trim();
      } else {
        payload.opportunity_type = suggestOppType;
        payload.deadline = suggestDeadline.trim();
        if (suggestLink.trim()) payload.link = suggestLink.trim();
      }

      const created = await createEvent(payload);
      if (created) {
        if (currentProfile.is_organiser) {
          onToast('Event published immediately as trusted Organiser!');
        } else {
          onToast('Event suggested! Awaiting admin approval (status: pending).');
        }
        setIsSuggestModalOpen(false);
        resetSuggestForm();
        loadEventsList();
      }
    } catch (err: any) {
      onToast(err.message || 'Failed to submit event suggestion');
    } finally {
      setSuggestSubmitting(false);
    }
  };

  const handleAuthorEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    if (suggestRegLink && !suggestRegLink.trim().toLowerCase().startsWith('https://')) {
      onToast('Registration link must start with https://');
      return;
    }
    if (suggestLink && !suggestLink.trim().toLowerCase().startsWith('https://')) {
      onToast('Opportunity link must start with https://');
      return;
    }

    setSuggestSubmitting(true);
    try {
      const patch: any = {
        title: suggestTitle.trim(),
        description: suggestDescription.trim()
      };
      if (editingItem.kind === 'event') {
        patch.datetime = suggestDatetime.trim();
        patch.location = suggestLocation.trim();
        patch.cover_image = suggestCoverImage.trim() || undefined;
        patch.registration_link = suggestRegLink.trim() || undefined;
      } else {
        patch.opportunity_type = suggestOppType;
        patch.deadline = suggestDeadline.trim();
        patch.link = suggestLink.trim() || undefined;
      }

      const updated = await updateEvent(editingItem.id, patch);
      if (updated) {
        if (!currentProfile?.is_organiser && updated.status === 'pending') {
          onToast('Item updated. Changing date/place/link sends it back for re-approval.');
        } else {
          onToast('Item updated successfully.');
        }
        setIsEditModalOpen(false);
        setEditingItem(null);
        loadEventsList();
        if (selectedItemId === editingItem.id) {
          setDetailedItem(updated);
        }
      }
    } catch (err: any) {
      onToast(err.message || 'Failed to update item');
    } finally {
      setSuggestSubmitting(false);
    }
  };

  const handleAuthorDelete = async (itemId: string, itemTitle: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm(`Are you sure you want to cancel and remove "${itemTitle}"?`)) return;
    try {
      const ok = await deleteEvent(itemId);
      if (ok) {
        onToast('Event cancelled and removed.');
        if (selectedItemId === itemId) setSelectedItemId(null);
        loadEventsList();
      }
    } catch (err: any) {
      onToast(err.message || 'Failed to cancel event');
    }
  };

  const handleSendAttendeeUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailedItem || !updateMessage.trim()) return;

    setSendingUpdate(true);
    try {
      const res = await sendEventAttendeeUpdate(detailedItem.id, updateMessage.trim());
      if (res.success) {
        onToast(`Notification sent to ${res.count} attendee(s)!`);
        setIsUpdateModalOpen(false);
        setUpdateMessage('');
      }
    } catch (err: any) {
      onToast(err.message || 'Failed to send update');
    } finally {
      setSendingUpdate(false);
    }
  };

  const handleOpenReport = (item: EventOpportunityItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setReportingItem(item);
    setReportReason('Inappropriate or misleading content');
    setReportDetails('');
    setIsReportModalOpen(true);
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportingItem) return;

    setSubmittingReport(true);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reported_id: reportingItem.id,
          reported_name: reportingItem.title,
          reason: reportReason,
          details: reportDetails
        })
      });
      if (res.ok) {
        onToast('Report submitted to moderators. Thank you for keeping Kwegatta safe.');
        setIsReportModalOpen(false);
        setReportingItem(null);
      } else {
        onToast('Failed to submit report. Please try again.');
      }
    } catch (err) {
      onToast('Failed to submit report.');
    } finally {
      setSubmittingReport(false);
    }
  };

  // Filter items
  const now = Date.now();
  const filtered = items.filter(item => {
    if (kindFilter !== 'all' && item.kind !== kindFilter) return false;
    return true;
  });

  const upcomingItems = filtered.filter(item => {
    const time = new Date(item.datetime || item.deadline || item.created_at).getTime();
    return isNaN(time) || time >= now;
  });

  const pastItems = filtered.filter(item => {
    const time = new Date(item.datetime || item.deadline || item.created_at).getTime();
    return !isNaN(time) && time < now;
  });

  // Render Single Item Page
  if (selectedItemId && detailedItem) {
    const isEvent = detailedItem.kind === 'event';
    const isAttending = Boolean(
      detailedItem.is_attending ||
      (currentProfile && (detailedItem.attendee_ids || []).includes(currentProfile.id))
    );
    const peopleToMeet = detailedItem.people_to_meet || [];
    const attendees = detailedItem.attendees || [];

    return (
      <div className="kw-container space-y-6 md:space-y-10 animate-in fade-in duration-200">
        {/* Top Back Nav & Share */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              setSelectedItemId(null);
              window.location.hash = '#/events';
            }}
            className="flex items-center gap-2 text-xs font-semibold text-[var(--fg-muted)] hover:text-[var(--gold)] transition-colors py-2 px-3 rounded-lg hover:bg-[var(--card)]"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to all Events & Opportunities
          </button>
          <button
            onClick={() => handleShare(detailedItem)}
            className="flex items-center gap-2 text-xs font-medium kw-btn py-1.5 px-3 rounded-lg border border-[var(--card-border)] bg-[var(--card)] hover:border-[var(--gold)]"
          >
            <Share2 className="w-3.5 h-3.5 text-[var(--gold)]" />
            Share
          </button>
        </div>

        {/* Hero Card */}
        <div className="kw-card p-6 sm:p-8 space-y-6">
          {detailedItem.cover_image && (
            <div className="w-full h-48 sm:h-64 rounded-xl overflow-hidden bg-black/10">
              <img
                src={detailedItem.cover_image}
                alt={detailedItem.title}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`px-2.5 py-1 rounded-full text-[13px] font-bold tracking-wide uppercase ${
                  isEvent
                    ? 'bg-amber-500/15 text-[var(--gold)] border border-amber-500/30'
                    : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                }`}
              >
                {isEvent ? 'Event' : detailedItem.opportunity_type || 'Opportunity'}
              </span>
              {detailedItem.datetime && (
                <span className="flex items-center gap-1.5 text-xs text-[var(--fg-muted)]">
                  <Calendar className="w-3.5 h-3.5 text-[var(--gold)]" />
                  {detailedItem.datetime}
                </span>
              )}
              {detailedItem.deadline && (
                <span className="flex items-center gap-1.5 text-xs text-[var(--fg-muted)]">
                  <Clock className="w-3.5 h-3.5 text-rose-400" />
                  Deadline: {detailedItem.deadline}
                </span>
              )}
              {detailedItem.location && (
                <span className="flex items-center gap-1.5 text-xs text-[var(--fg-muted)]">
                  <MapPin className="w-3.5 h-3.5 text-[var(--gold)]" />
                  {detailedItem.location}
                </span>
              )}
              {detailedItem.status === 'pending' && (
                <span className="px-2 py-0.5 rounded-full text-[13px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  Pending approval
                </span>
              )}
              {detailedItem.status === 'rejected' && (
                <span className="px-2 py-0.5 rounded-full text-[13px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                  Rejected: {detailedItem.rejection_reason || 'Guidelines'}
                </span>
              )}
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-[var(--fg)] leading-tight">
              {detailedItem.title}
            </h1>

            {/* Author Attribution */}
            {detailedItem.author_name && (
              <div className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
                <span>Suggested by</span>
                <button
                  type="button"
                  onClick={() => detailedItem.author_id && onViewProfile(detailedItem.author_id)}
                  className="font-bold text-[var(--gold)] hover:underline flex items-center gap-1.5"
                >
                  {detailedItem.author_name}
                  {detailedItem.author_is_organiser && (
                    <span className="px-1.5 py-0.2 rounded text-[13px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 inline-flex items-center gap-0.5">
                      <Award className="w-3 h-3" />
                      Organiser
                    </span>
                  )}
                </button>
              </div>
            )}

            <p className="text-sm text-[var(--fg-muted)] whitespace-pre-line leading-relaxed">
              {detailedItem.description}
            </p>

            {/* Action Bar */}
            <div className="pt-4 border-t border-[var(--card-border)] flex flex-wrap items-center gap-3">
              {isEvent ? (
                <button
                  onClick={() => handleRsvp(detailedItem.id)}
                  disabled={rsvpLoading}
                  className={`kw-btn px-6 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
                    isAttending
                      ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30'
                      : 'kw-btn-gold'
                  }`}
                >
                  {isAttending ? <Check className="w-4 h-4" /> : null}
                  {isAttending ? "I'm going (RSVP'd)" : "I'm going"}
                </button>
              ) : (
                <button
                  onClick={() => handleRsvp(detailedItem.id)}
                  disabled={rsvpLoading}
                  className={`kw-btn px-6 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${
                    isAttending
                      ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/30'
                      : 'kw-btn-gold'
                  }`}
                >
                  {isAttending ? <Bookmark className="w-4 h-4 fill-current" /> : null}
                  {isAttending ? 'Interested (Saved)' : 'Interested'}
                </button>
              )}

              {detailedItem.registration_link && (
                <a
                  href={detailedItem.registration_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="kw-btn py-2.5 px-4 text-xs font-semibold rounded-lg border border-[var(--card-border)] bg-[var(--card)] hover:border-[var(--gold)] flex items-center gap-2"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-[var(--gold)]" />
                  Register here
                </a>
              )}

              {detailedItem.link && (
                <a
                  href={detailedItem.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="kw-btn py-2.5 px-4 text-xs font-semibold rounded-lg border border-[var(--card-border)] bg-[var(--card)] hover:border-[var(--gold)] flex items-center gap-2"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                  Opportunity Link
                </a>
              )}

              {/* Author Controls */}
              {currentProfile && (detailedItem.author_id === currentProfile.id) && (
                <div className="flex flex-wrap items-center gap-2 ml-auto">
                  <button
                    onClick={() => openEditModal(detailedItem)}
                    className="kw-btn py-2 px-3 text-xs font-medium rounded-lg flex items-center gap-1.5 border border-[var(--card-border)] hover:border-[var(--gold)]"
                    title="Edit your item"
                  >
                    <Edit className="w-3.5 h-3.5 text-[var(--gold)]" />
                    <span>Edit</span>
                  </button>
                  <button
                    onClick={() => setIsUpdateModalOpen(true)}
                    className="kw-btn py-2 px-3 text-xs font-medium rounded-lg flex items-center gap-1.5 border border-[var(--card-border)] hover:border-[var(--gold)]"
                    title="Send update to attendees (1/day)"
                  >
                    <Megaphone className="w-3.5 h-3.5 text-amber-400" />
                    <span>Send Update ({attendees.length})</span>
                  </button>
                  <button
                    onClick={() => handleAuthorDelete(detailedItem.id, detailedItem.title)}
                    className="kw-btn kw-btn-danger py-2 px-3 text-xs font-medium rounded-lg flex items-center gap-1.5"
                    title="Cancel and remove item"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Cancel Item</span>
                  </button>
                </div>
              )}

              {/* Report button */}
              <button
                onClick={() => handleOpenReport(detailedItem)}
                className="kw-btn py-2 px-2.5 text-xs font-medium rounded-lg flex items-center gap-1 text-[var(--fg-muted)] hover:text-rose-400 border border-[var(--card-border)] hover:border-rose-500/40"
                title="Report this event or opportunity"
              >
                <Flag className="w-3.5 h-3.5" />
                <span>Report</span>
              </button>
            </div>
          </div>
        </div>

        {/* People you should meet there (for signed in members) */}
        {currentProfile && (
          <div className="kw-card p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[var(--gold)]" />
              <h2 className="text-sm font-bold text-[var(--fg)]">
                People you should meet there
              </h2>
            </div>
            <p className="text-xs text-[var(--fg-muted)]">
              Gemma-matched attendees based on your complementary skills, needs, and project focus.
            </p>

            {peopleToMeet.length === 0 ? (
              <div className="p-4 rounded-lg bg-[var(--bg)] border border-[var(--card-border)] text-center text-xs text-[var(--fg-muted)]">
                {attendees.length <= 1
                  ? "You're among the first to RSVP! As more members join, your best matches will appear here."
                  : 'RSVP to see your custom Gemma match reasons among other attendees.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
                {peopleToMeet.map((m: any) => (
                  <div
                    key={m.profile.id}
                    onClick={() => onViewProfile(m.profile.id)}
                    className="p-3.5 rounded-xl bg-[var(--bg)] border border-[var(--card-border)] hover:border-[var(--gold)] transition-colors cursor-pointer space-y-2"
                  >
                    <div className="flex items-center gap-3">
                      <Avatar profile={m.profile} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <h4 className="text-xs font-bold text-[var(--fg)] truncate">
                            {m.profile.name}
                          </h4>
                          <span className="text-[13px] font-bold text-[var(--gold)] bg-amber-500/10 px-1.5 py-0.5 rounded">
                            {m.score}% Match
                          </span>
                        </div>
                        <p className="text-[13px] text-[var(--fg-muted)] truncate">
                          {m.profile.role} {m.profile.headline ? `• ${m.profile.headline}` : ''}
                        </p>
                      </div>
                    </div>
                    <p className="text-[13px] text-[var(--gold)] bg-amber-500/5 p-2 rounded border border-amber-500/20 italic">
                      "{m.reason}"
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Who else is going */}
        <div className="kw-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-[var(--gold)]" />
              <h2 className="text-sm font-bold text-[var(--fg)]">
                {isEvent ? "Who's going" : "Who's interested"} ({attendees.length})
              </h2>
            </div>
          </div>

          {attendees.length === 0 ? (
            <div className="p-4 rounded-lg bg-[var(--bg)] border border-[var(--card-border)] text-center text-xs text-[var(--fg-muted)]">
              No one has RSVP'd yet. Be the first to let the community know!
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {attendees.map((attendee: any) => (
                <div
                  key={attendee.id}
                  onClick={() => onViewProfile(attendee.id)}
                  className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[var(--bg)] border border-[var(--card-border)] hover:border-[var(--gold)] transition-colors cursor-pointer"
                >
                  <Avatar profile={attendee} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-[var(--fg)] truncate">
                      {attendee.name}
                    </p>
                    <p className="text-[13px] text-[var(--fg-muted)] truncate">
                      {attendee.role || 'Member'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Render Overview List
  return (
    <div className="kw-container space-y-6 md:space-y-10">
      {/* Top Banner / Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--fg)] tracking-tight">
            Events & Opportunities
          </h1>
          <p className="text-xs text-[var(--fg-muted)] mt-1">
            Discover Kampala tech meetups, hackathons, grants, and partner calls.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Suggest an event Button for signed-in members */}
          <button
            onClick={openSuggestModal}
            className="kw-btn kw-btn-gold text-xs py-2 px-3.5 flex items-center gap-1.5 font-bold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Suggest an event</span>
          </button>

          {/* Filter Pills */}
          <div className="inline-flex rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-0.5 self-start sm:self-auto">
            <button
              onClick={() => setKindFilter('all')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                kindFilter === 'all'
                  ? 'bg-[var(--gold)] text-[#090D16] font-semibold'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setKindFilter('event')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                kindFilter === 'event'
                  ? 'bg-[var(--gold)] text-[#090D16] font-semibold'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
            >
              Events
            </button>
            <button
              onClick={() => setKindFilter('opportunity')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
                kindFilter === 'opportunity'
                  ? 'bg-[var(--gold)] text-[#090D16] font-semibold'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
            >
              Opportunities
            </button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="kw-card p-6 space-y-4 animate-pulse">
              <div className="h-4 bg-[var(--card-border)] rounded w-1/4"></div>
              <div className="h-6 bg-[var(--card-border)] rounded w-3/4"></div>
              <div className="h-3 bg-[var(--card-border)] rounded w-1/2"></div>
            </div>
          ))}
        </div>
      ) : upcomingItems.length === 0 && pastItems.length === 0 ? (
        <div className="kw-card p-12 text-center space-y-4">
          <Calendar className="w-8 h-8 text-[var(--gold)] mx-auto opacity-70" />
          <h3 className="text-base font-bold text-[var(--fg)]">No events scheduled</h3>
          <p className="text-[13px] text-[var(--fg-muted)] max-w-sm mx-auto">
            Check back soon for upcoming Kampala developer events, training sessions, and grants.
          </p>
          <div>
            <button
              onClick={openSuggestModal}
              className="kw-btn kw-btn-primary text-[13px] py-2 px-4 font-semibold cursor-pointer"
            >
              Suggest an event
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Upcoming Section */}
          <div className="space-y-4">
            {upcomingItems.map(item => {
              const isEvent = item.kind === 'event';
              const isAttending = currentProfile && item.attendee_ids.includes(currentProfile.id);

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    setSelectedItemId(item.id);
                    window.location.hash = `#/events/${item.id}`;
                  }}
                  className="kw-card p-5 sm:p-6 hover:border-[var(--gold)] transition-all cursor-pointer space-y-4 group"
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-2 min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[13px] font-bold uppercase tracking-wider ${
                            isEvent
                              ? 'bg-amber-500/15 text-[var(--gold)] border border-amber-500/30'
                              : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          }`}
                        >
                          {isEvent ? 'Event' : item.opportunity_type || 'Opportunity'}
                        </span>
                        {item.datetime && (
                          <span className="flex items-center gap-1 text-[13px] text-[var(--fg-muted)]">
                            <Calendar className="w-3 h-3 text-[var(--gold)]" />
                            {item.datetime}
                          </span>
                        )}
                        {item.deadline && (
                          <span className="flex items-center gap-1 text-[13px] text-rose-400 font-medium">
                            <Clock className="w-3 h-3" />
                            Deadline: {item.deadline}
                          </span>
                        )}
                        {item.status === 'pending' && (
                          <span className="px-2 py-0.5 rounded text-[13px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            Pending approval
                          </span>
                        )}
                        {item.status === 'rejected' && (
                          <span className="px-2 py-0.5 rounded text-[13px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30">
                            Rejected
                          </span>
                        )}
                      </div>

                      <h3 className="text-base font-bold text-[var(--fg)] group-hover:text-[var(--gold)] transition-colors">
                        {item.title}
                      </h3>

                      {item.author_name && (
                        <div className="flex items-center gap-1.5 text-[13px] text-[var(--fg-muted)]">
                          <span>Suggested by</span>
                          <span
                            onClick={e => {
                              e.stopPropagation();
                              if (item.author_id) onViewProfile(item.author_id);
                            }}
                            className="text-[var(--gold)] font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
                          >
                            {item.author_name}
                            {item.author_is_organiser && (
                              <span className="px-1.5 py-0.2 rounded text-[13px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 inline-flex items-center gap-0.5">
                                <Award className="w-2.5 h-2.5" />
                                Organiser
                              </span>
                            )}
                          </span>
                        </div>
                      )}

                      {item.location && (
                        <p className="flex items-center gap-1 text-xs text-[var(--fg-muted)]">
                          <MapPin className="w-3 h-3 text-[var(--gold)] flex-shrink-0" />
                          <span className="truncate">{item.location}</span>
                        </p>
                      )}

                      <p className="text-xs text-[var(--fg-muted)] line-clamp-2 leading-relaxed">
                        {item.description}
                      </p>
                    </div>

                    {item.cover_image && (
                      <div className="w-full sm:w-28 sm:h-24 rounded-lg overflow-hidden bg-black/10 flex-shrink-0">
                        <img
                          src={item.cover_image}
                          alt={item.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-[var(--card-border)] flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 text-[var(--fg-muted)] text-[13px]">
                      <Users className="w-3.5 h-3.5 text-[var(--gold)]" />
                      <span>{item.attendee_ids.length} {isEvent ? 'going' : 'interested'}</span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Author Controls */}
                      {currentProfile && item.author_id === currentProfile.id && (
                        <>
                          <button
                            onClick={e => openEditModal(item, e)}
                            className="p-1.5 rounded-lg border border-[var(--card-border)] hover:border-[var(--gold)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
                            title="Edit your item"
                          >
                            <Edit className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={e => handleAuthorDelete(item.id, item.title, e)}
                            className="p-1.5 rounded-lg border border-[var(--card-border)] hover:border-rose-500/40 text-[var(--fg-muted)] hover:text-rose-400"
                            title="Cancel / Delete item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}

                      {/* Report button */}
                      <button
                        onClick={e => handleOpenReport(item, e)}
                        className="p-1.5 rounded-lg border border-[var(--card-border)] hover:border-rose-500/40 text-[var(--fg-muted)] hover:text-rose-400"
                        title="Report this event"
                      >
                        <Flag className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={e => {
                          e.stopPropagation();
                          handleShare(item, e);
                        }}
                        className="p-1.5 rounded-lg border border-[var(--card-border)] hover:border-[var(--gold)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
                        title="Share link"
                        aria-label="Share link"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>

                      {isEvent ? (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleRsvp(item.id);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            isAttending
                              ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40'
                              : 'kw-btn-gold'
                          }`}
                        >
                          {isAttending ? "I'm going ✓" : "I'm going"}
                        </button>
                      ) : (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleRsvp(item.id);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                            isAttending
                              ? 'bg-emerald-600/20 text-emerald-300 border border-emerald-500/40'
                              : 'kw-btn-gold'
                          }`}
                        >
                          {isAttending ? 'Interested ✓' : 'Interested'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Past items collapsed section */}
          {pastItems.length > 0 && (
            <div className="pt-4 border-t border-[var(--card-border)] space-y-4">
              <button
                onClick={() => setShowPast(!showPast)}
                className="w-full flex items-center justify-between p-3.5 rounded-xl kw-card hover:border-[var(--card-border)] text-xs font-semibold text-[var(--fg-muted)] transition-colors"
              >
                <span>Past events & opportunities ({pastItems.length})</span>
                {showPast ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showPast && (
                <div className="space-y-3 opacity-80">
                  {pastItems.map(item => (
                    <div
                      key={item.id}
                      onClick={() => {
                        setSelectedItemId(item.id);
                        window.location.hash = `#/events/${item.id}`;
                      }}
                      className="kw-card p-4 hover:border-[var(--gold)] transition-colors cursor-pointer space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-bold text-[var(--fg-muted)] uppercase">
                          {item.kind === 'event' ? 'Past Event' : 'Past Opportunity'}
                        </span>
                        <span className="text-[13px] text-[var(--fg-muted)]">
                          {item.datetime || item.deadline}
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-[var(--fg)]">
                        {item.title}
                      </h4>
                      <div className="flex items-center justify-between text-[13px] text-[var(--fg-muted)]">
                        <span>{item.attendee_ids.length} attended</span>
                        <span className="text-[var(--gold)] hover:underline">View details →</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: Suggest an Event or Opportunity */}
      {isSuggestModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4">
          <div className="kw-card max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto border-[var(--gold)]/40 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
              <div>
                <h3 className="font-bold text-sm text-[var(--fg)]">Suggest an Event or Opportunity</h3>
                <p className="text-xs text-[var(--fg-muted)]">
                  {currentProfile?.is_organiser
                    ? 'Trusted Organiser: will be published immediately with Organiser badge.'
                    : 'Submissions are reviewed by admins before being published.'}
                </p>
              </div>
              <button
                onClick={() => setIsSuggestModalOpen(false)}
                className="p-1 text-[var(--fg-muted)] hover:text-[var(--fg)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Kind Switcher */}
            <div className="inline-flex rounded-lg border border-[var(--card-border)] bg-[var(--bg)] p-0.5 w-full">
              <button
                type="button"
                onClick={() => setSuggestKind('event')}
                className={`flex-1 py-1.5 text-xs rounded-md font-medium transition-all ${
                  suggestKind === 'event'
                    ? 'bg-[var(--gold)] text-[#090D16] font-bold'
                    : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
                }`}
              >
                Event
              </button>
              <button
                type="button"
                onClick={() => setSuggestKind('opportunity')}
                className={`flex-1 py-1.5 text-xs rounded-md font-medium transition-all ${
                  suggestKind === 'opportunity'
                    ? 'bg-[var(--gold)] text-[#090D16] font-bold'
                    : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
                }`}
              >
                Opportunity
              </button>
            </div>

            <form onSubmit={handleSuggestSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-[var(--fg)] block mb-1">Title (max 150 chars) *</label>
                <input
                  type="text"
                  maxLength={150}
                  required
                  value={suggestTitle}
                  onChange={e => setSuggestTitle(e.target.value)}
                  placeholder={suggestKind === 'event' ? 'e.g. Makerere Web3 Build Day' : 'e.g. EIIC Seed Fund Grant 2026'}
                  className="kw-input text-xs"
                />
              </div>

              {suggestKind === 'event' ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-[var(--fg)] block mb-1">Date and Time *</label>
                      <input
                        type="text"
                        required
                        value={suggestDatetime}
                        onChange={e => setSuggestDatetime(e.target.value)}
                        placeholder="e.g. Sat, Nov 14 • 2:00 PM EAT"
                        className="kw-input text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-[var(--fg)] block mb-1">Place or Online Link *</label>
                      <input
                        type="text"
                        required
                        value={suggestLocation}
                        onChange={e => setSuggestLocation(e.target.value)}
                        placeholder="e.g. Innovation Village Kampala or Meet"
                        className="kw-input text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-[var(--fg)] block mb-1">Cover Image URL (optional)</label>
                    <input
                      type="url"
                      value={suggestCoverImage}
                      onChange={e => setSuggestCoverImage(e.target.value)}
                      placeholder="https://..."
                      className="kw-input text-xs"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-[var(--fg)] block mb-1">Registration Link (optional, must be https://)</label>
                    <input
                      type="url"
                      value={suggestRegLink}
                      onChange={e => setSuggestRegLink(e.target.value)}
                      placeholder="https://..."
                      className="kw-input text-xs"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-[var(--fg)] block mb-1">Opportunity Type *</label>
                      <select
                        value={suggestOppType}
                        onChange={e => setSuggestOppType(e.target.value as OpportunityType)}
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
                        required
                        value={suggestDeadline}
                        onChange={e => setSuggestDeadline(e.target.value)}
                        placeholder="e.g. Rolling or 30 Nov 2026"
                        className="kw-input text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-[var(--fg)] block mb-1">Link to apply (optional, must be https://)</label>
                    <input
                      type="url"
                      value={suggestLink}
                      onChange={e => setSuggestLink(e.target.value)}
                      placeholder="https://..."
                      className="kw-input text-xs"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="font-semibold text-[var(--fg)] block mb-1">Description (max 2000 chars) *</label>
                <textarea
                  rows={4}
                  maxLength={2000}
                  required
                  value={suggestDescription}
                  onChange={e => setSuggestDescription(e.target.value)}
                  placeholder="Provide background, who it is for, and how to get involved..."
                  className="kw-input text-xs resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--card-border)]">
                <button
                  type="button"
                  onClick={() => setIsSuggestModalOpen(false)}
                  className="kw-btn py-2 px-3 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={suggestSubmitting}
                  className="kw-btn kw-btn-gold py-2 px-4 text-xs font-bold"
                >
                  {suggestSubmitting ? 'Submitting...' : 'Submit Suggestion'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: Edit Event (Author) */}
      {isEditModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4">
          <div className="kw-card max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto border-[var(--gold)]/40 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
              <div>
                <h3 className="font-bold text-sm text-[var(--fg)]">Edit Your Submission</h3>
                {!currentProfile?.is_organiser && editingItem.status === 'published' && (
                  <p className="text-[13px] text-amber-400 flex items-center gap-1 mt-0.5">
                    <AlertCircle className="w-3 h-3 flex-shrink-0" />
                    Editing date, place, or link will send this item back to pending approval.
                  </p>
                )}
              </div>
              <button
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingItem(null);
                }}
                className="p-1 text-[var(--fg-muted)] hover:text-[var(--fg)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAuthorEditSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-[var(--fg)] block mb-1">Title *</label>
                <input
                  type="text"
                  maxLength={150}
                  required
                  value={suggestTitle}
                  onChange={e => setSuggestTitle(e.target.value)}
                  className="kw-input text-xs"
                />
              </div>

              {editingItem.kind === 'event' ? (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-[var(--fg)] block mb-1">Date and Time *</label>
                      <input
                        type="text"
                        required
                        value={suggestDatetime}
                        onChange={e => setSuggestDatetime(e.target.value)}
                        className="kw-input text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-[var(--fg)] block mb-1">Place or Online Link *</label>
                      <input
                        type="text"
                        required
                        value={suggestLocation}
                        onChange={e => setSuggestLocation(e.target.value)}
                        className="kw-input text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-[var(--fg)] block mb-1">Cover Image URL (optional)</label>
                    <input
                      type="url"
                      value={suggestCoverImage}
                      onChange={e => setSuggestCoverImage(e.target.value)}
                      className="kw-input text-xs"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-[var(--fg)] block mb-1">Registration Link (optional, must be https://)</label>
                    <input
                      type="url"
                      value={suggestRegLink}
                      onChange={e => setSuggestRegLink(e.target.value)}
                      className="kw-input text-xs"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-[var(--fg)] block mb-1">Opportunity Type *</label>
                      <select
                        value={suggestOppType}
                        onChange={e => setSuggestOppType(e.target.value as OpportunityType)}
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
                        required
                        value={suggestDeadline}
                        onChange={e => setSuggestDeadline(e.target.value)}
                        className="kw-input text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-[var(--fg)] block mb-1">Link to apply (optional, must be https://)</label>
                    <input
                      type="url"
                      value={suggestLink}
                      onChange={e => setSuggestLink(e.target.value)}
                      className="kw-input text-xs"
                    />
                  </div>
                </>
              )}

              <div>
                <label className="font-semibold text-[var(--fg)] block mb-1">Description *</label>
                <textarea
                  rows={4}
                  maxLength={2000}
                  required
                  value={suggestDescription}
                  onChange={e => setSuggestDescription(e.target.value)}
                  className="kw-input text-xs resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--card-border)]">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingItem(null);
                  }}
                  className="kw-btn py-2 px-3 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={suggestSubmitting}
                  className="kw-btn kw-btn-gold py-2 px-4 text-xs font-bold"
                >
                  {suggestSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: Send Update to Attendees (Author 1/day) */}
      {isUpdateModalOpen && detailedItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4">
          <div className="kw-card max-w-md w-full p-6 space-y-4 border-amber-500/40 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
              <div>
                <h3 className="font-bold text-sm text-[var(--fg)]">Send Update to Attendees</h3>
                <p className="text-xs text-[var(--fg-muted)]">
                  Sends an in-app notification to all {(detailedItem.attendee_ids || []).length} registered attendees. Max 1 update per day.
                </p>
              </div>
              <button
                onClick={() => setIsUpdateModalOpen(false)}
                className="p-1 text-[var(--fg-muted)] hover:text-[var(--fg)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSendAttendeeUpdate} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-[var(--fg)] block mb-1">Update Message (max 500 chars) *</label>
                <textarea
                  rows={4}
                  maxLength={500}
                  required
                  value={updateMessage}
                  onChange={e => setUpdateMessage(e.target.value)}
                  placeholder="e.g. Venue moved to Hall B, please arrive 15 minutes early..."
                  className="kw-input text-xs resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--card-border)]">
                <button
                  type="button"
                  onClick={() => setIsUpdateModalOpen(false)}
                  className="kw-btn py-2 px-3 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={sendingUpdate || !updateMessage.trim()}
                  className="kw-btn kw-btn-gold py-2 px-4 text-xs font-bold flex items-center gap-1.5"
                >
                  <Megaphone className="w-3.5 h-3.5" />
                  <span>{sendingUpdate ? 'Sending...' : 'Broadcast Notification'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: Safety Report */}
      {isReportModalOpen && reportingItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4">
          <div className="kw-card max-w-md w-full p-6 space-y-4 border-rose-500/40 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
              <div>
                <h3 className="font-bold text-sm text-[var(--fg)]">Report Event or Opportunity</h3>
                <p className="text-xs text-[var(--fg-muted)]">
                  Reporting "{reportingItem.title}" to Kwegatta platform administrators.
                </p>
              </div>
              <button
                onClick={() => setIsReportModalOpen(false)}
                className="p-1 text-[var(--fg-muted)] hover:text-[var(--fg)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleReportSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-[var(--fg)] block mb-1">Reason *</label>
                <select
                  value={reportReason}
                  onChange={e => setReportReason(e.target.value)}
                  className="kw-input text-xs"
                >
                  <option value="Inappropriate or misleading content">Inappropriate or misleading content</option>
                  <option value="Spam or commercial advertising">Spam or commercial advertising</option>
                  <option value="Fraudulent event or phishing link">Fraudulent event or phishing link</option>
                  <option value="Harassment or community rule violation">Harassment or community rule violation</option>
                  <option value="Other concern">Other concern</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-[var(--fg)] block mb-1">Additional Details (optional)</label>
                <textarea
                  rows={3}
                  maxLength={500}
                  value={reportDetails}
                  onChange={e => setReportDetails(e.target.value)}
                  placeholder="Describe why this item is problematic..."
                  className="kw-input text-xs resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--card-border)]">
                <button
                  type="button"
                  onClick={() => setIsReportModalOpen(false)}
                  className="kw-btn py-2 px-3 text-xs"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingReport}
                  className="kw-btn kw-btn-danger py-2 px-4 text-xs font-bold"
                >
                  {submittingReport ? 'Submitting...' : 'Submit Report'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
