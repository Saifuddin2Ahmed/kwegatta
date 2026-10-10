import React, { useState, useEffect, useRef } from 'react';
import {
  Calendar,
  MapPin,
  Clock,
  ExternalLink,
  Share2,
  Users,
  Sparkles,
  Check,
  ArrowLeft,
  Bookmark,
  Plus,
  Edit,
  Trash2,
  Megaphone,
  Flag,
  X,
  Award,
  AlertCircle,
  Camera,
  Video,
  Download
} from 'lucide-react';
import { EventOpportunityItem, OpportunityType, Profile } from '../types';
import { Avatar } from './Avatar';
import {
  processEventCoverImage,
  formatEventDateTime,
  generateGoogleCalendarUrl,
  downloadIcsFile,
  zonedTimeToUtcIso,
  utcToZonedParts
} from '../utils';
import {
  fetchEvents,
  fetchEventById,
  rsvpEvent,
  createEvent,
  updateEvent,
  cancelEvent,
  deleteEvent,
  reportEvent,
  sendEventAttendeeUpdate,
  PUBLIC_APP_URL
} from '../services/api';

interface CoverImageUploaderProps {
  value: string;
  onChange: (val: string) => void;
  title?: string;
}

export const CoverImageUploader: React.FC<CoverImageUploaderProps> = ({ value, onChange, title }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string>('');

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    try {
      const dataUrl = await processEventCoverImage(file);
      onChange(dataUrl);
    } catch (err: any) {
      setError(err.message || 'Failed to process cover image.');
    } finally {
      e.target.value = '';
    }
  };

  return (
    <div>
      <label className="font-semibold text-[var(--fg)] block mb-1">Cover image (optional)</label>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleFileChange}
        className="hidden"
      />
      {value ? (
        <div className="space-y-2">
          <div className="relative aspect-[16/9] w-full max-w-sm rounded-xl overflow-hidden bg-black/10 border border-[var(--card-border)] group">
            <img
              src={value}
              alt={title || 'Cover image preview'}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="kw-btn text-xs py-1.5 px-3 rounded-lg border border-[var(--card-border)] hover:border-[var(--gold)] cursor-pointer"
            >
              Replace
            </button>
            <button
              type="button"
              onClick={() => onChange('')}
              className="kw-btn kw-btn-danger text-xs py-1.5 px-3 rounded-lg cursor-pointer"
            >
              Remove
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="kw-input text-xs py-2 px-3 text-left flex items-center justify-between text-[var(--fg-muted)] hover:border-[var(--gold)] cursor-pointer w-full"
        >
          <span className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-[var(--fg-subtle)]" />
            <span>Upload photo (JPEG, PNG, WebP)</span>
          </span>
          <span className="text-[13px] text-[var(--fg-subtle)]">Max 400 KB · 1200px</span>
        </button>
      )}
      {error && <p className="text-xs text-rose-400 mt-1">{error}</p>}
    </div>
  );
};

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
  const [activeTab, setActiveTab] = useState<'upcoming' | 'past'>('upcoming');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(initialItemId || null);
  const [detailedItem, setDetailedItem] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [rsvpLoading, setRsvpLoading] = useState(false);

  // Create / Edit Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<EventOpportunityItem | null>(null);

  // Form Fields (Part 2 & Part 4)
  const [formKind, setFormKind] = useState<'event' | 'opportunity'>('event');
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formFormat, setFormFormat] = useState<'in_person' | 'online' | 'hybrid'>('in_person');
  const [formLocation, setFormLocation] = useState('');
  const [formJoinLink, setFormJoinLink] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formStartTime, setFormStartTime] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formEndTime, setFormEndTime] = useState('');
  const [formTimezone, setFormTimezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Kampala';
    } catch {
      return 'Africa/Kampala';
    }
  });
  const [formCoverImage, setFormCoverImage] = useState('');
  const [formRegLink, setFormRegLink] = useState('');
  const [formOppType, setFormOppType] = useState<OpportunityType>('Hackathon');
  const [formDeadline, setFormDeadline] = useState('');
  const [formLink, setFormLink] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Send Update to Attendees Modal State
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');
  const [sendingUpdate, setSendingUpdate] = useState(false);

  // Safety Report Modal State (Part 5)
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportingItem, setReportingItem] = useState<EventOpportunityItem | null>(null);
  const [reportReason, setReportReason] = useState<string>('Not a real event');
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

  // Sync selected item from prop if changed
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
        if (detailedItem && detailedItem.id === itemId) {
          setDetailedItem((prev: any) => {
            if (!prev) return prev;
            const updatedAttendeeIds = res.is_attending
              ? [...(prev.attendee_ids || []), currentProfile.id]
              : (prev.attendee_ids || []).filter((id: string) => id !== currentProfile.id);
            return {
              ...prev,
              is_attending: res.is_attending,
              attendee_count: res.attendee_count ?? updatedAttendeeIds.length,
              attendee_ids: updatedAttendeeIds
            };
          });
        }

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

  const resetForm = () => {
    setFormKind('event');
    setFormTitle('');
    setFormDescription('');
    setFormFormat('in_person');
    setFormLocation('');
    setFormJoinLink('');
    setFormStartDate('');
    setFormStartTime('');
    setFormEndDate('');
    setFormEndTime('');
    try {
      setFormTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Africa/Kampala');
    } catch {
      setFormTimezone('Africa/Kampala');
    }
    setFormCoverImage('');
    setFormRegLink('');
    setFormOppType('Hackathon');
    setFormDeadline('');
    setFormLink('');
  };

  const openCreateModal = () => {
    if (!currentProfile) {
      onToast('Please join or sign in to create an event');
      if (onJoinClick) onJoinClick();
      return;
    }
    if (currentProfile.events_blocked) {
      onToast("You can't create events right now");
      return;
    }
    if (!currentProfile.name || !currentProfile.headline) {
      onToast('Please complete your profile before creating an event.');
      return;
    }
    resetForm();
    setIsCreateModalOpen(true);
  };

  const openEditModal = (item: EventOpportunityItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingItem(item);
    setFormKind(item.kind);
    setFormTitle(item.title);
    setFormDescription(item.description);
    setFormFormat(item.format || 'in_person');
    setFormLocation(item.location || '');
    setFormJoinLink(item.join_link || '');
    const tz = item.timezone || 'Africa/Kampala';
    setFormTimezone(tz);
    if (item.starts_at) {
      const { date, time } = utcToZonedParts(item.starts_at, tz);
      setFormStartDate(date);
      setFormStartTime(time);
    } else {
      setFormStartDate('');
      setFormStartTime('');
    }
    if (item.ends_at) {
      const { date, time } = utcToZonedParts(item.ends_at, tz);
      setFormEndDate(date);
      setFormEndTime(time);
    } else {
      setFormEndDate('');
      setFormEndTime('');
    }
    setFormCoverImage(item.cover_image || '');
    setFormRegLink(item.registration_link || '');
    setFormOppType(item.opportunity_type || 'Hackathon');
    setFormDeadline(item.deadline || '');
    setFormLink(item.link || '');
    setIsEditModalOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProfile) {
      onToast('Please join or sign in to create an event');
      if (onJoinClick) onJoinClick();
      return;
    }
    if (currentProfile.events_blocked) {
      onToast("You can't create events right now");
      return;
    }
    if (!currentProfile.name || !currentProfile.headline) {
      onToast('Please complete your profile before creating an event.');
      return;
    }

    if (formRegLink && !formRegLink.trim().toLowerCase().startsWith('https://')) {
      onToast('Registration link must start with https://');
      return;
    }
    if (formLink && !formLink.trim().toLowerCase().startsWith('https://')) {
      onToast('Opportunity link must start with https://');
      return;
    }

    const payload: any = {
      kind: formKind,
      title: formTitle.trim(),
      description: formDescription.trim()
    };

    if (formKind === 'event') {
      if (!formStartDate || !formStartTime) {
        onToast('Start date and start time are required.');
        return;
      }
      const tz = formTimezone || 'Africa/Kampala';
      const startIso = zonedTimeToUtcIso(formStartDate, formStartTime, tz);
      const startDate = new Date(startIso);
      if (startDate.getTime() < Date.now() - 5 * 60 * 1000) {
        onToast('Start time cannot be in the past.');
        return;
      }

      let endIso: string | undefined;
      if (formEndDate && formEndTime) {
        endIso = zonedTimeToUtcIso(formEndDate, formEndTime, tz);
        if (new Date(endIso).getTime() <= startDate.getTime()) {
          onToast('End time must be after start time.');
          return;
        }
      } else {
        endIso = new Date(startDate.getTime() + 2 * 60 * 60 * 1000).toISOString();
      }

      if ((formFormat === 'in_person' || formFormat === 'hybrid') && !formLocation.trim()) {
        onToast('A location is required for in-person and hybrid events.');
        return;
      }
      if ((formFormat === 'online' || formFormat === 'hybrid') && (!formJoinLink || !formJoinLink.startsWith('https://'))) {
        onToast('A valid https:// join link is required for online and hybrid events.');
        return;
      }

      payload.starts_at = startIso;
      payload.ends_at = endIso;
      payload.timezone = formTimezone || 'Africa/Kampala';
      payload.format = formFormat;
      payload.location = formLocation.trim();
      payload.join_link = formJoinLink.trim() || undefined;
      if (formCoverImage.trim()) payload.cover_image = formCoverImage.trim();
      if (formRegLink.trim()) payload.registration_link = formRegLink.trim();
    } else {
      payload.opportunity_type = formOppType;
      payload.deadline = formDeadline.trim();
      if (formLink.trim()) payload.link = formLink.trim();
    }

    setFormSubmitting(true);
    try {
      const created = await createEvent(payload);
      if (created) {
        onToast('Event created and published immediately!');
        setIsCreateModalOpen(false);
        resetForm();
        loadEventsList();
      }
    } catch (err: any) {
      onToast(err?.message || 'Could not save the event. Please try again.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    if (formRegLink && !formRegLink.trim().toLowerCase().startsWith('https://')) {
      onToast('Registration link must start with https://');
      return;
    }
    if (formLink && !formLink.trim().toLowerCase().startsWith('https://')) {
      onToast('Opportunity link must start with https://');
      return;
    }

    const patch: any = {
      title: formTitle.trim(),
      description: formDescription.trim()
    };

    if (editingItem.kind === 'event') {
      const tz = formTimezone || editingItem.timezone || 'Africa/Kampala';
      if (formStartDate && formStartTime) {
        const startIso = zonedTimeToUtcIso(formStartDate, formStartTime, tz);
        patch.starts_at = startIso;
        let endIso: string;
        if (formEndDate && formEndTime) {
          endIso = zonedTimeToUtcIso(formEndDate, formEndTime, tz);
          if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
            onToast('End time must be after start time.');
            return;
          }
        } else {
          endIso = new Date(new Date(startIso).getTime() + 2 * 60 * 60 * 1000).toISOString();
        }
        patch.ends_at = endIso;
      }
      patch.format = formFormat;
      patch.timezone = formTimezone;
      patch.location = formLocation.trim();
      patch.join_link = formJoinLink.trim() || undefined;
      patch.cover_image = formCoverImage.trim() || undefined;
      patch.registration_link = formRegLink.trim() || undefined;
    } else {
      patch.opportunity_type = formOppType;
      patch.deadline = formDeadline.trim();
      patch.link = formLink.trim() || undefined;
    }

    setFormSubmitting(true);
    try {
      const updated = await updateEvent(editingItem.id, patch);
      if (updated) {
        onToast('Item updated successfully.');
        setIsEditModalOpen(false);
        setEditingItem(null);
        loadEventsList();
        if (selectedItemId === editingItem.id) {
          setDetailedItem(updated);
        }
      }
    } catch (err: any) {
      onToast(err?.message || 'Could not save the event. Please try again.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleAuthorCancel = async (itemId: string, itemTitle: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm(`Cancel "${itemTitle}"? This will mark it as cancelled and close RSVP.`)) return;
    try {
      const res = await cancelEvent(itemId);
      if (res.success) {
        onToast('Event cancelled.');
        loadEventsList();
        if (selectedItemId === itemId) {
          fetchEventById(itemId).then(fresh => {
            if (fresh) setDetailedItem(fresh);
          });
        }
      }
    } catch (err: any) {
      onToast(err.message || 'Failed to cancel event');
    }
  };

  const handleAuthorDelete = async (itemId: string, itemTitle: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm(`Permanently delete "${itemTitle}"? This cannot be undone.`)) return;
    try {
      const ok = await deleteEvent(itemId);
      if (ok) {
        onToast('Event deleted.');
        if (selectedItemId === itemId) setSelectedItemId(null);
        loadEventsList();
      }
    } catch (err: any) {
      onToast(err.message || 'Failed to delete event');
    }
  };

  const handleSendAttendeeUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailedItem) return;
    if (!updateMessage.trim()) {
      onToast('Message cannot be empty');
      return;
    }
    setSendingUpdate(true);
    try {
      await sendEventAttendeeUpdate(detailedItem.id, updateMessage.trim());
      onToast('Update sent to attendees via notification!');
      setIsUpdateModalOpen(false);
      setUpdateMessage('');
      fetchEventById(detailedItem.id).then(fresh => {
        if (fresh) setDetailedItem(fresh);
      });
    } catch (err: any) {
      onToast(err.message || 'Failed to send update');
    } finally {
      setSendingUpdate(false);
    }
  };

  const handleOpenReport = (item: EventOpportunityItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!currentProfile) {
      onToast('Please sign in to report an event');
      if (onJoinClick) onJoinClick();
      return;
    }
    setReportingItem(item);
    setReportReason('Not a real event');
    setReportDetails('');
    setIsReportModalOpen(true);
  };

  const handleReportSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reportingItem) return;
    setSubmittingReport(true);
    try {
      const res = await reportEvent(reportingItem.id, reportReason, reportDetails.trim());
      onToast(res.message || 'Thank you for your report. Our moderators will review it.');
      setIsReportModalOpen(false);
      setReportingItem(null);
      loadEventsList();
      if (selectedItemId === reportingItem.id) {
        fetchEventById(reportingItem.id).then(fresh => {
          if (fresh) setDetailedItem(fresh);
        });
      }
    } catch (err: any) {
      onToast(err.message || 'Failed to submit report');
    } finally {
      setSubmittingReport(false);
    }
  };

  // Group items into Upcoming and Past (Part 3)
  const upcomingItems = items.filter(it => it.phase !== 'past');
  const pastItems = items.filter(it => it.phase === 'past');

  // Render Detailed Item View (Part 6)
  if (selectedItemId && detailedItem) {
    const isEvent = detailedItem.kind === 'event';
    const isAuthor = Boolean(currentProfile && (detailedItem.author_id === currentProfile.id || detailedItem.author_id === currentProfile.account_uid));
    const isAttending = Boolean(detailedItem.is_attending);
    const attendees = Array.isArray(detailedItem.attendees) ? detailedItem.attendees : [];
    const attendeeCount = detailedItem.attendee_count ?? attendees.length;
    const isPast = detailedItem.phase === 'past';
    const isLive = detailedItem.phase === 'live';
    const isCancelled = Boolean(detailedItem.is_cancelled);
    const timeFormatted = formatEventDateTime(
      detailedItem.starts_at,
      detailedItem.ends_at,
      detailedItem.timezone,
      detailedItem.datetime
    );

    const hostProfile = allProfiles.find(p => p.id === detailedItem.author_id || p.account_uid === detailedItem.author_id);
    const hostName = detailedItem.author_name || hostProfile?.name || 'Community Member';

    return (
      <div className="kw-container max-w-4xl space-y-6 md:space-y-8 animate-in fade-in duration-200">
        {/* Navigation Bar */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
              setSelectedItemId(null);
              window.location.hash = '#/events';
            }}
            className="kw-btn text-xs py-2 px-3 rounded-lg border border-[var(--card-border)] hover:border-[var(--gold)] flex items-center gap-1.5 text-[var(--fg-muted)] hover:text-[var(--fg)]"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to events
          </button>

          <button
            onClick={e => handleShare(detailedItem, e)}
            className="kw-btn text-xs py-2 px-3 rounded-lg border border-[var(--card-border)] hover:border-[var(--gold)] flex items-center gap-1.5 text-[var(--fg-muted)] hover:text-[var(--fg)]"
          >
            <Share2 className="w-3.5 h-3.5 text-[var(--gold-text)]" />
            Share
          </button>
        </div>

        {/* Hero Card */}
        <div className="kw-card p-6 sm:p-8 space-y-6">
          {detailedItem.cover_image && (
            <div className="w-full aspect-[16/9] rounded-xl overflow-hidden bg-black/10 border border-[var(--card-border)]">
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
                    ? 'bg-amber-500/15 text-[var(--gold-text)] border border-amber-500/30'
                    : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                }`}
              >
                {isEvent ? 'Event' : detailedItem.opportunity_type || 'Opportunity'}
              </span>

              {isLive && (
                <span className="px-2.5 py-1 rounded-full text-[13px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                  ● Live now
                </span>
              )}

              {isCancelled && (
                <span className="px-2.5 py-1 rounded-full text-[13px] font-bold bg-zinc-700/60 text-zinc-300 border border-zinc-600">
                  Cancelled
                </span>
              )}

              {isPast && !isCancelled && (
                <span className="px-2.5 py-1 rounded-full text-[13px] font-semibold bg-gray-500/15 text-[var(--fg-muted)] border border-[var(--card-border)]">
                  Event ended
                </span>
              )}

              {detailedItem.under_review && (
                <span className="px-2.5 py-1 rounded-full text-[13px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Under review
                </span>
              )}

              {detailedItem.time_needs_update && isAuthor && (
                <span className="px-2.5 py-1 rounded-full text-[13px] font-semibold bg-blue-500/20 text-blue-300 border border-blue-500/30 flex items-center gap-1">
                  <AlertCircle className="w-3.5 h-3.5" />
                  Time needs updating
                </span>
              )}
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-[var(--fg)] leading-tight">
              {detailedItem.title}
            </h1>

            {/* Host Attribution (Part 6) */}
            <div className="flex items-center gap-3 py-1">
              <div
                onClick={() => detailedItem.author_id && onViewProfile(detailedItem.author_id)}
                className="flex items-center gap-2.5 cursor-pointer group"
              >
                <Avatar profile={hostProfile || { name: hostName }} size="sm" />
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-[var(--fg-muted)]">Hosted by</span>
                    <span className="text-xs font-bold text-[var(--fg)] group-hover:text-[var(--gold-text)] transition-colors">
                      {hostName}
                    </span>
                    {detailedItem.author_is_organiser && (
                      <span className="px-1.5 py-0.2 rounded text-[13px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/40 inline-flex items-center gap-0.5">
                        <Award className="w-3 h-3" />
                        Organiser
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Date, Time & Location (Part 2) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl bg-[var(--bg)] border border-[var(--card-border)] text-xs">
              <div className="flex items-start gap-2.5">
                <Calendar className="w-4 h-4 text-[var(--gold-text)] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-[var(--fg)]">{timeFormatted.display}</p>
                  <p className="text-[13px] text-[var(--fg-subtle)] mt-0.5">
                    {timeFormatted.isLegacy ? 'Legacy time format' : 'Shown in your local timezone'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                {detailedItem.format === 'online' ? (
                  <Video className="w-4 h-4 text-[var(--gold-text)] flex-shrink-0 mt-0.5" />
                ) : (
                  <MapPin className="w-4 h-4 text-[var(--gold-text)] flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="font-semibold text-[var(--fg)]">
                    {detailedItem.format === 'online' ? 'Online' : (detailedItem.location || 'Kampala, Uganda')}
                  </p>
                  <p className="text-[13px] text-[var(--fg-subtle)] mt-0.5 capitalize">
                    {detailedItem.format ? `${detailedItem.format.replace('_', ' ')} format` : 'In person'}
                  </p>
                </div>
              </div>
            </div>

            {/* Join Link (Part 2: signed-in members only, hidden when past or cancelled) */}
            {detailedItem.join_link && !isPast && !isCancelled && (
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2 text-emerald-300 font-semibold">
                  <Video className="w-4 h-4" />
                  <span>Online meeting link:</span>
                </div>
                <a
                  href={detailedItem.join_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="kw-btn kw-btn-primary py-1 px-3 text-xs font-bold inline-flex items-center gap-1"
                >
                  Join event
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            <p className="text-sm text-[var(--fg-muted)] whitespace-pre-line leading-relaxed">
              {detailedItem.description}
            </p>

            {/* Action Bar (Part 3 & Part 6) */}
            <div className="pt-4 border-t border-[var(--card-border)] flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                {isEvent ? (
                  isCancelled ? (
                    <button
                      disabled
                      className="kw-btn px-6 py-2.5 text-xs font-bold rounded-lg bg-zinc-700/50 text-zinc-400 cursor-not-allowed"
                    >
                      Cancelled
                    </button>
                  ) : isPast ? (
                    <button
                      disabled
                      className="kw-btn px-6 py-2.5 text-xs font-bold rounded-lg bg-zinc-700/50 text-zinc-400 cursor-not-allowed"
                    >
                      Event ended
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
                      {isAttending ? <Check className="w-4 h-4" /> : null}
                      {isAttending ? "I'm going (RSVP'd)" : "I'm going"}
                    </button>
                  )
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

                {/* Going Count */}
                <span className="text-xs text-[var(--fg-muted)] flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--card-border)]">
                  <Users className="w-3.5 h-3.5 text-[var(--gold-text)]" />
                  <strong className="text-[var(--fg)]">{attendeeCount}</strong> going
                </span>

                {/* Add to Calendar (Part 6) */}
                {isEvent && !isPast && !isCancelled && (
                  <div className="flex items-center gap-1.5">
                    <a
                      href={generateGoogleCalendarUrl(detailedItem)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="kw-btn text-xs py-2 px-3 rounded-lg border border-[var(--card-border)] hover:border-[var(--gold)] flex items-center gap-1 text-[var(--fg-muted)] hover:text-[var(--fg)]"
                      title="Add to Google Calendar"
                    >
                      <Calendar className="w-3.5 h-3.5 text-blue-400" />
                      <span>Google Cal</span>
                    </a>
                    <button
                      onClick={() => downloadIcsFile(detailedItem)}
                      className="kw-btn text-xs py-2 px-3 rounded-lg border border-[var(--card-border)] hover:border-[var(--gold)] flex items-center gap-1 text-[var(--fg-muted)] hover:text-[var(--fg)]"
                      title="Download .ics file"
                    >
                      <Download className="w-3.5 h-3.5 text-[var(--gold-text)]" />
                      <span>.ics</span>
                    </button>
                  </div>
                )}
              </div>

              {/* Right Side Controls: Author Edit/Cancel & Member Report (Part 4 & Part 5) */}
              <div className="flex items-center gap-2">
                {isAuthor && !isCancelled && (
                  <>
                    <button
                      onClick={e => openEditModal(detailedItem, e)}
                      className="kw-btn text-xs py-2 px-3 rounded-lg border border-[var(--card-border)] hover:border-[var(--gold)] flex items-center gap-1"
                    >
                      <Edit className="w-3.5 h-3.5 text-[var(--gold-text)]" />
                      Edit
                    </button>
                    <button
                      onClick={e => handleAuthorCancel(detailedItem.id, detailedItem.title, e)}
                      className="kw-btn text-xs py-2 px-3 rounded-lg border border-[var(--card-border)] hover:border-amber-500/40 text-amber-400"
                    >
                      Cancel event
                    </button>
                  </>
                )}

                {/* Report Event Link (Part 5: signed-in members) */}
                {currentProfile && (
                  <button
                    onClick={e => handleOpenReport(detailedItem, e)}
                    className="kw-btn text-xs py-2 px-2.5 rounded-lg border border-[var(--card-border)] hover:border-rose-500/40 text-[var(--fg-subtle)] hover:text-rose-400 flex items-center gap-1"
                    title="Report event for moderation"
                  >
                    <Flag className="w-3.5 h-3.5" />
                    <span>Report</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Who's Going Section (Part 6: signed-in members see full attendee list, signed-out see only count) */}
        {currentProfile ? (
          <div className="kw-card p-6 space-y-4">
            <div className="flex items-center gap-2 border-b border-[var(--card-border)] pb-3">
              <Users className="w-4 h-4 text-[var(--gold-text)]" />
              <h2 className="text-sm font-bold text-[var(--fg)]">
                Who's going ({attendees.length})
              </h2>
            </div>

            {attendees.length === 0 ? (
              <div className="p-6 rounded-lg bg-[var(--bg)] border border-[var(--card-border)] text-center text-xs text-[var(--fg-muted)]">
                No one has RSVP'd yet. Be the first to join!
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {attendees.map((att: any) => (
                  <div
                    key={att.id}
                    onClick={() => onViewProfile(att.id)}
                    className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[var(--bg)] border border-[var(--card-border)] hover:border-[var(--gold)] transition-colors cursor-pointer"
                  >
                    <Avatar profile={att} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-[var(--fg)] truncate">{att.name}</p>
                      <p className="text-[13px] text-[var(--fg-muted)] truncate">{att.headline || att.role || 'Member'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="p-4 rounded-xl kw-card text-center text-xs text-[var(--fg-muted)] flex items-center justify-between gap-4">
            <span>{attendeeCount} people are going to this event.</span>
            <button
              onClick={onJoinClick}
              className="kw-btn kw-btn-gold text-xs py-1.5 px-3 font-semibold"
            >
              Sign in to see attendees
            </button>
          </div>
        )}
      </div>
    );
  }

  // Render Events List Overview with Two Tabs: Upcoming and Past (Part 3)
  const currentTabItems = activeTab === 'upcoming' ? upcomingItems : pastItems;

  return (
    <div className="kw-container space-y-6 md:space-y-8">
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
          {/* Create event Button (Part 4) */}
          <button
            onClick={openCreateModal}
            className="kw-btn kw-btn-gold text-xs py-2 px-3.5 flex items-center gap-1.5 font-bold"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create event</span>
          </button>

          {/* Two Tabs: Upcoming & Past (Part 3) */}
          <div className="inline-flex rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-0.5">
            <button
              onClick={() => setActiveTab('upcoming')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === 'upcoming'
                  ? 'bg-[var(--gold)] text-[#090D16] font-bold'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
            >
              Upcoming ({upcomingItems.length})
            </button>
            <button
              onClick={() => setActiveTab('past')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-all ${
                activeTab === 'past'
                  ? 'bg-[var(--gold)] text-[#090D16] font-bold'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
            >
              Past ({pastItems.length})
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
      ) : currentTabItems.length === 0 ? (
        /* Empty states: one sentence and one button (Part 3) */
        <div className="kw-card p-12 text-center space-y-4 max-w-lg mx-auto">
          <Calendar className="w-8 h-8 text-[var(--gold-text)] mx-auto opacity-70" />
          {activeTab === 'upcoming' ? (
            <>
              <p className="text-sm text-[var(--fg)]">No upcoming events scheduled right now.</p>
              <div>
                <button
                  onClick={openCreateModal}
                  className="kw-btn kw-btn-gold text-xs py-2 px-4 font-semibold"
                >
                  Create event
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--fg)]">No past events to show yet.</p>
              <div>
                <button
                  onClick={() => setActiveTab('upcoming')}
                  className="kw-btn kw-btn-primary text-xs py-2 px-4 font-semibold"
                >
                  View upcoming
                </button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {currentTabItems.map(item => {
            const isEvent = item.kind === 'event';
            const isAttending = currentProfile && item.attendee_ids.includes(currentProfile.id);
            const isAuthor = currentProfile && (item.author_id === currentProfile.id || item.author_id === currentProfile.account_uid);
            const isPast = item.phase === 'past';
            const isLive = item.phase === 'live';
            const isCancelled = Boolean(item.is_cancelled);
            const timeInfo = formatEventDateTime(item.starts_at, item.ends_at, item.timezone, item.datetime);

            return (
              <div
                key={item.id}
                onClick={() => {
                  setSelectedItemId(item.id);
                  window.location.hash = `#/events/${item.id}`;
                }}
                className="kw-card p-5 sm:p-6 hover:border-[var(--gold)] transition-all cursor-pointer space-y-4 group"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  {/* Left Column: Details */}
                  <div className="space-y-2 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded text-[13px] font-bold uppercase tracking-wider ${
                          isEvent
                            ? 'bg-amber-500/15 text-[var(--gold-text)] border border-amber-500/30'
                            : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        }`}
                      >
                        {isEvent ? 'Event' : item.opportunity_type || 'Opportunity'}
                      </span>

                      {isLive && (
                        <span className="px-2 py-0.5 rounded text-[13px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                          ● Live now
                        </span>
                      )}

                      {isCancelled && (
                        <span className="px-2 py-0.5 rounded text-[13px] font-bold bg-zinc-700/60 text-zinc-300 border border-zinc-600">
                          Cancelled
                        </span>
                      )}

                      {item.under_review && (
                        <span className="px-2 py-0.5 rounded text-[13px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          Under review
                        </span>
                      )}

                      <span className="flex items-center gap-1 text-[13px] text-[var(--fg-muted)]">
                        <Calendar className="w-3 h-3 text-[var(--gold-text)]" />
                        {timeInfo.display}
                      </span>

                      {item.format === 'online' ? (
                        <span className="flex items-center gap-1 text-[13px] text-[var(--fg-muted)]">
                          <Video className="w-3 h-3 text-[var(--gold-text)]" />
                          Online
                        </span>
                      ) : item.location ? (
                        <span className="flex items-center gap-1 text-[13px] text-[var(--fg-muted)]">
                          <MapPin className="w-3 h-3 text-[var(--gold-text)]" />
                          {item.location}
                        </span>
                      ) : null}
                    </div>

                    <h3 className="text-base font-bold text-[var(--fg)] group-hover:text-[var(--gold-text)] transition-colors">
                      {item.title}
                    </h3>

                    <p className="text-xs text-[var(--fg-muted)] line-clamp-2">
                      {item.description}
                    </p>

                    <div className="flex flex-wrap items-center gap-3 text-[13px] text-[var(--fg-muted)] pt-1">
                      {item.author_name && (
                        <span>
                          Hosted by <strong className="text-[var(--fg)]">{item.author_name}</strong>
                        </span>
                      )}
                      <span>•</span>
                      <span>
                        <strong className="text-[var(--gold-text)]">{item.attendee_ids.length}</strong> {isEvent ? 'going' : 'interested'}
                      </span>
                    </div>
                  </div>

                  {/* Right Column: Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                    {/* Author Controls */}
                    {isAuthor && !isCancelled && (
                      <button
                        onClick={e => openEditModal(item, e)}
                        className="p-1.5 rounded-lg border border-[var(--card-border)] hover:border-[var(--gold)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
                        title="Edit event"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {currentProfile && (
                      <button
                        onClick={e => handleOpenReport(item, e)}
                        className="p-1.5 rounded-lg border border-[var(--card-border)] hover:border-rose-500/40 text-[var(--fg-muted)] hover:text-rose-400"
                        title="Report event"
                      >
                        <Flag className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      onClick={e => handleShare(item, e)}
                      className="p-1.5 rounded-lg border border-[var(--card-border)] hover:border-[var(--gold)] text-[var(--fg-muted)] hover:text-[var(--fg)]"
                      title="Share link"
                    >
                      <Share2 className="w-3.5 h-3.5" />
                    </button>

                    {isEvent ? (
                      isCancelled ? (
                        <button
                          disabled
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-zinc-700/50 text-zinc-400 cursor-not-allowed"
                        >
                          Cancelled
                        </button>
                      ) : isPast ? (
                        <button
                          disabled
                          className="px-3 py-1.5 rounded-lg text-xs font-bold bg-zinc-700/50 text-zinc-400 cursor-not-allowed"
                        >
                          Event ended
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
                          {isAttending ? "I'm going ✓" : "I'm going"}
                        </button>
                      )
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
      )}

      {/* CREATE EVENT MODAL (Part 2 & Part 4) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4">
          <div className="kw-card max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto border-[var(--gold)]/40 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
              <div>
                <h3 className="font-bold text-sm text-[var(--fg)]">Create an Event or Opportunity</h3>
                <p className="text-xs text-[var(--fg-muted)]">
                  Published directly to the Kampala community.
                </p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1 text-[var(--fg-muted)] hover:text-[var(--fg)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              {/* Kind selector */}
              <div>
                <label className="font-semibold text-[var(--fg)] block mb-1">What are you creating? *</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormKind('event')}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold transition-colors ${
                      formKind === 'event'
                        ? 'border-[var(--gold)] bg-[var(--gold)] text-[#090D16]'
                        : 'border-[var(--card-border)] bg-[var(--bg)] text-[var(--fg-muted)]'
                    }`}
                  >
                    Event / Meetup
                  </button>
                  <button
                    type="button"
                    onClick={() => setFormKind('opportunity')}
                    className={`py-2 px-3 rounded-lg border text-xs font-bold transition-colors ${
                      formKind === 'opportunity'
                        ? 'border-[var(--gold)] bg-[var(--gold)] text-[#090D16]'
                        : 'border-[var(--card-border)] bg-[var(--bg)] text-[var(--fg-muted)]'
                    }`}
                  >
                    Opportunity / Grant
                  </button>
                </div>
              </div>

              <div>
                <label className="font-semibold text-[var(--fg)] block mb-1">Title *</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  placeholder="e.g. Flutter Kampala Hackday"
                  required
                  className="kw-input text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-[var(--fg)] block mb-1">Description *</label>
                <textarea
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  rows={3}
                  placeholder="Share details about what builders will learn, hack on, or gain..."
                  required
                  className="kw-textarea text-xs"
                />
              </div>

              {formKind === 'event' ? (
                <>
                  {/* Event Format (Part 2) */}
                  <div>
                    <label className="font-semibold text-[var(--fg)] block mb-1">Format *</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['in_person', 'online', 'hybrid'] as const).map(fmt => (
                        <button
                          key={fmt}
                          type="button"
                          onClick={() => setFormFormat(fmt)}
                          className={`py-2 px-2 rounded-lg border text-xs font-semibold capitalize transition-colors ${
                            formFormat === fmt
                              ? 'border-[var(--gold)] bg-[var(--gold)] text-[#090D16]'
                              : 'border-[var(--card-border)] bg-[var(--bg)] text-[var(--fg-muted)]'
                          }`}
                        >
                          {fmt.replace('_', ' ')}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Dates & Times (Part 2) */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-[var(--fg)] block mb-1">Start Date *</label>
                      <input
                        type="date"
                        value={formStartDate}
                        onChange={e => setFormStartDate(e.target.value)}
                        required
                        className="kw-input text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-[var(--fg)] block mb-1">Start Time *</label>
                      <input
                        type="time"
                        value={formStartTime}
                        onChange={e => setFormStartTime(e.target.value)}
                        required
                        className="kw-input text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-[var(--fg)] block mb-1">End Date (optional)</label>
                      <input
                        type="date"
                        value={formEndDate}
                        onChange={e => setFormEndDate(e.target.value)}
                        className="kw-input text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-[var(--fg)] block mb-1">End Time (optional)</label>
                      <input
                        type="time"
                        value={formEndTime}
                        onChange={e => setFormEndTime(e.target.value)}
                        className="kw-input text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-[var(--fg)] block mb-1">Timezone *</label>
                    <input
                      type="text"
                      value={formTimezone}
                      onChange={e => setFormTimezone(e.target.value)}
                      placeholder="e.g. Africa/Kampala"
                      required
                      className="kw-input text-xs"
                    />
                    <p className="text-[13px] text-[var(--fg-subtle)] mt-0.5">
                      Defaults to your browser timezone. Viewers see time converted to their local timezone.
                    </p>
                  </div>

                  {/* Location (for in_person / hybrid) */}
                  {(formFormat === 'in_person' || formFormat === 'hybrid') && (
                    <div>
                      <label className="font-semibold text-[var(--fg)] block mb-1">Location *</label>
                      <input
                        type="text"
                        value={formLocation}
                        onChange={e => setFormLocation(e.target.value)}
                        placeholder="e.g. Innovation Village, Ntinda, Kampala"
                        required
                        className="kw-input text-xs"
                      />
                    </div>
                  )}

                  {/* Join Link (for online / hybrid) */}
                  {(formFormat === 'online' || formFormat === 'hybrid') && (
                    <div>
                      <label className="font-semibold text-[var(--fg)] block mb-1">Join link (https://) *</label>
                      <input
                        type="url"
                        value={formJoinLink}
                        onChange={e => setFormJoinLink(e.target.value)}
                        placeholder="https://meet.google.com/..."
                        required
                        className="kw-input text-xs"
                      />
                      <p className="text-[13px] text-[var(--fg-subtle)] mt-0.5">
                        Shown only to signed-in members who RSVP.
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="font-semibold text-[var(--fg)] block mb-1">Registration link (optional)</label>
                    <input
                      type="url"
                      value={formRegLink}
                      onChange={e => setFormRegLink(e.target.value)}
                      placeholder="https://lu.ma/..."
                      className="kw-input text-xs"
                    />
                  </div>

                  <CoverImageUploader
                    value={formCoverImage}
                    onChange={setFormCoverImage}
                    title={formTitle}
                  />
                </>
              ) : (
                <>
                  <div>
                    <label className="font-semibold text-[var(--fg)] block mb-1">Opportunity Type *</label>
                    <select
                      value={formOppType}
                      onChange={e => setFormOppType(e.target.value as OpportunityType)}
                      className="kw-input text-xs"
                    >
                      <option value="Hackathon">Hackathon</option>
                      <option value="Grant">Grant</option>
                      <option value="Job">Job</option>
                      <option value="Training">Training</option>
                      <option value="Call for partners">Call for partners</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-semibold text-[var(--fg)] block mb-1">Deadline (optional)</label>
                    <input
                      type="text"
                      value={formDeadline}
                      onChange={e => setFormDeadline(e.target.value)}
                      placeholder="e.g. Nov 30, 2026"
                      className="kw-input text-xs"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-[var(--fg)] block mb-1">Opportunity Link (https://)</label>
                    <input
                      type="url"
                      value={formLink}
                      onChange={e => setFormLink(e.target.value)}
                      placeholder="https://..."
                      className="kw-input text-xs"
                    />
                  </div>
                </>
              )}

              <div className="flex items-center gap-2 pt-3 border-t border-[var(--card-border)]">
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="kw-btn kw-btn-gold text-xs py-2 px-4 font-bold flex-1"
                >
                  {formSubmitting ? 'Creating...' : 'Create & Publish Event'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="kw-btn text-xs py-2 px-3 border border-[var(--card-border)]"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT MODAL */}
      {isEditModalOpen && editingItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4">
          <div className="kw-card max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto border-[var(--gold)]/40 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
              <h3 className="font-bold text-sm text-[var(--fg)]">Edit Event Details</h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                className="p-1 text-[var(--fg-muted)] hover:text-[var(--fg)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-[var(--fg)] block mb-1">Title *</label>
                <input
                  type="text"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  required
                  className="kw-input text-xs"
                />
              </div>

              <div>
                <label className="font-semibold text-[var(--fg)] block mb-1">Description *</label>
                <textarea
                  value={formDescription}
                  onChange={e => setFormDescription(e.target.value)}
                  rows={3}
                  required
                  className="kw-textarea text-xs"
                />
              </div>

              {editingItem.kind === 'event' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-[var(--fg)] block mb-1">Start Date</label>
                      <input
                        type="date"
                        value={formStartDate}
                        onChange={e => setFormStartDate(e.target.value)}
                        className="kw-input text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-[var(--fg)] block mb-1">Start Time</label>
                      <input
                        type="time"
                        value={formStartTime}
                        onChange={e => setFormStartTime(e.target.value)}
                        className="kw-input text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="font-semibold text-[var(--fg)] block mb-1">End Date</label>
                      <input
                        type="date"
                        value={formEndDate}
                        onChange={e => setFormEndDate(e.target.value)}
                        className="kw-input text-xs"
                      />
                    </div>
                    <div>
                      <label className="font-semibold text-[var(--fg)] block mb-1">End Time</label>
                      <input
                        type="time"
                        value={formEndTime}
                        onChange={e => setFormEndTime(e.target.value)}
                        className="kw-input text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="font-semibold text-[var(--fg)] block mb-1">Timezone</label>
                    <input
                      type="text"
                      value={formTimezone}
                      onChange={e => setFormTimezone(e.target.value)}
                      className="kw-input text-xs"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-[var(--fg)] block mb-1">Location</label>
                    <input
                      type="text"
                      value={formLocation}
                      onChange={e => setFormLocation(e.target.value)}
                      className="kw-input text-xs"
                    />
                  </div>

                  <div>
                    <label className="font-semibold text-[var(--fg)] block mb-1">Join link (https://)</label>
                    <input
                      type="url"
                      value={formJoinLink}
                      onChange={e => setFormJoinLink(e.target.value)}
                      className="kw-input text-xs"
                    />
                  </div>

                  <CoverImageUploader
                    value={formCoverImage}
                    onChange={setFormCoverImage}
                    title={formTitle}
                  />
                </>
              )}

              <div className="flex items-center gap-2 pt-3 border-t border-[var(--card-border)]">
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="kw-btn kw-btn-gold text-xs py-2 px-4 font-bold flex-1"
                >
                  {formSubmitting ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="kw-btn text-xs py-2 px-3 border border-[var(--card-border)]"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* REPORT MODAL (Part 5) */}
      {isReportModalOpen && reportingItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4">
          <div className="kw-card max-w-md w-full p-6 space-y-4 border-rose-500/40 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
              <div className="flex items-center gap-2 text-rose-400">
                <Flag className="w-4 h-4" />
                <h3 className="font-bold text-sm text-[var(--fg)]">Report Event</h3>
              </div>
              <button
                onClick={() => setIsReportModalOpen(false)}
                className="p-1 text-[var(--fg-muted)] hover:text-[var(--fg)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--fg-muted)]">
              Help keep Kwegatta safe and genuine. Reports are strictly confidential and reviewed by community administrators.
            </p>

            <form onSubmit={handleReportSubmit} className="space-y-4 text-xs">
              <div>
                <label className="font-semibold text-[var(--fg)] block mb-1">Reason *</label>
                <select
                  value={reportReason}
                  onChange={e => setReportReason(e.target.value)}
                  className="kw-input text-xs"
                >
                  <option value="Not a real event">Not a real event</option>
                  <option value="Spam or scam">Spam or scam</option>
                  <option value="Offensive">Offensive</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-[var(--fg)] block mb-1">Optional Note</label>
                <textarea
                  value={reportDetails}
                  onChange={e => setReportDetails(e.target.value)}
                  rows={3}
                  placeholder="Additional context for administrators..."
                  className="kw-textarea text-xs"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <button
                  type="submit"
                  disabled={submittingReport}
                  className="kw-btn kw-btn-danger text-xs py-2 px-4 font-bold flex-1"
                >
                  {submittingReport ? 'Submitting...' : 'Submit Report'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsReportModalOpen(false)}
                  className="kw-btn text-xs py-2 px-3 border border-[var(--card-border)]"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
