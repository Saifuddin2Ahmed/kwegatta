import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import {
  Calendar,
  MapPin,
  Clock,
  ExternalLink,
  Share2,
  Users,
  Check,
  ArrowLeft,
  Bookmark,
  Plus,
  Edit,
  Trash2,
  Flag,
  X,
  Award,
  AlertCircle,
  Camera,
  Video,
  Download,
  Phone,
  Mail,
  MessageSquare,
  Send,
  UserPlus,
  UserCheck,
  Search,
  Tag,
  QrCode,
  ThumbsUp,
  ThumbsDown,
  Copy
} from 'lucide-react';
import { EventOpportunityItem, OpportunityType, Profile, EventQuestion, EventGuest } from '../types';
import { formatTicketCode } from '../lib/ticketCode';

const HostScannerModal = lazy(() => import('./HostScannerModal'));
import { Avatar } from './Avatar';
import { GuestRegisterModal } from './GuestRegisterModal';
import { PageNotFound } from './PageNotFound';
import { useDialogA11y } from '../hooks/useDialogA11y';
import {
  processEventCoverImage,
  formatEventDateTime,
  generateGoogleCalendarUrl,
  downloadIcsFile,
  zonedTimeToUtcIso,
  utcToZonedParts,
  formatWhatsAppUrl
} from '../utils';
import {
  fetchEvents,
  fetchEventById,
  rsvpEvent,
  cancelRsvp,
  createEvent,
  updateEvent,
  cancelEvent,
  deleteEvent,
  reportEvent,
  fetchEventQuestions,
  postEventQuestion,
  replyEventQuestion,
  deleteEventQuestion,
  cancelEventGuest,
  fetchEventGuests,
  deleteEventGuest,
  removeEventAttendee,
  exportEventAttendeesCsv,
  fetchMyEventTicket,
  checkinEventAttendee,
  fetchEventCheckinToken,
  selfCheckinEvent,
  fetchPeopleToMeet,
  submitPeopleToMeetFeedback,
  toggleEventMatchOptIn,
  requestMemberConnect,
  PUBLIC_APP_URL
} from '../services/api';
import { findRecentDuplicate, sortForTab } from '../lib/eventTiming';
import { validateEventTitle, EVENT_TITLE_MAX } from '../lib/eventTitle';

export const EVENT_KIND_HELP = {
  event: 'Something people attend at a set date and time, in person or online.',
  opportunity: 'Something people apply for before a deadline, like a grant, job or hackathon.'
} as const;

/** Keyboard access for a clickable card that holds no other buttons: Enter or Space activates it. */
function activateProps(handler: () => void) {
  return {
    role: 'button' as const,
    tabIndex: 0,
    onClick: handler,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handler();
      }
    }
  };
}

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)] focus-visible:ring-offset-1';

export function deleteConfirmMessage(registeredCount: number): string {
  const n = Math.max(0, Number(registeredCount) || 0);
  return `${n} ${n === 1 ? 'person' : 'people'} registered. They will be notified that the event was removed.`;
}

function isWithinMeetingWindow(item: any): boolean {
  if (!item) return false;
  const startMs = new Date(item.starts_at || item.datetime || item.created_at).getTime();
  const endMs = item.ends_at ? new Date(item.ends_at).getTime() : startMs + (3 * 60 * 60 * 1000);
  const now = Date.now();
  const windowStart = startMs - (7 * 24 * 60 * 60 * 1000);
  const windowEnd = endMs + (24 * 60 * 60 * 1000);
  return now >= windowStart && now <= windowEnd;
}

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
      <label htmlFor="ev-cover-image-optional-1" className="font-semibold text-[var(--fg)] block mb-1">Cover image (optional)</label>
      <input
        id="ev-cover-image-optional-1"
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
              Clear image
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
  const getItemIdFromHash = () => {
    if (typeof window === 'undefined') return null;
    const hash = window.location.hash || '';
    const match = hash.match(/#\/events\/([^\/?#]+)/);
    return match ? match[1] : null;
  };

  const [selectedItemId, setSelectedItemId] = useState<string | null>(() => initialItemId || getItemIdFromHash());
  const [detailedItem, setDetailedItem] = useState<any | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  // Id from the link that turned out not to exist; shows a "not found" page instead of the list
  const [missingEventId, setMissingEventId] = useState<string | null>(null);
  const [rsvpLoading, setRsvpLoading] = useState(false);

  // Create / Edit Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<EventOpportunityItem | null>(null);

  // Form Fields
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
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  });
  const [formCoverImage, setFormCoverImage] = useState('');
  const [formRegLink, setFormRegLink] = useState('');
  const [formMapLink, setFormMapLink] = useState('');
  const [formCapacity, setFormCapacity] = useState('');
  const [formWaitlistEnabled, setFormWaitlistEnabled] = useState(true);
  const [formTagsInput, setFormTagsInput] = useState('');
  const [formSelfCheckin, setFormSelfCheckin] = useState(false);
  const [formContactPhone, setFormContactPhone] = useState('');
  const [formContactEmail, setFormContactEmail] = useState('');
  const [formOppType, setFormOppType] = useState<OpportunityType>('Hackathon');
  const [formDeadline, setFormDeadline] = useState('');
  const [formLink, setFormLink] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [duplicateOf, setDuplicateOf] = useState<EventOpportunityItem | null>(null);

  // Author delete: first tap opens the dialog, second tap inside it deletes
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleteArmed, setDeleteArmed] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Events list search
  const [searchQuery, setSearchQuery] = useState('');

  // Host Attendees Panel State
  const [showAttendeesPanel, setShowAttendeesPanel] = useState(true);
  const [attendeeTab, setAttendeeTab] = useState<'all' | 'checked_in' | 'not_yet' | 'members' | 'guests'>('all');
  const [attendeeSearch, setAttendeeSearch] = useState('');
  const [exportingCsv, setExportingCsv] = useState(false);

  // Kwegatta 1.8.0: Personal Ticket, Host Check-in Scanner, Rotating Venue QR, and Self Check-in State
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
  const [ticketCode, setTicketCode] = useState<string | null>(null);
  const [ticketQrDataUrl, setTicketQrDataUrl] = useState<string>('');
  const [loadingTicket, setLoadingTicket] = useState(false);

  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const [isVenueQrOpen, setIsVenueQrOpen] = useState(false);
  const [venueQrDataUrl, setVenueQrDataUrl] = useState('');
  const [venueCheckedInCount, setVenueCheckedInCount] = useState(0);
  const [venueCountdown, setVenueCountdown] = useState(30);

  const [selfCheckinToken, setSelfCheckinToken] = useState<string | null>(null);
  const [selfCheckinGuestEmail, setSelfCheckinGuestEmail] = useState('');
  const [selfCheckinLoading, setSelfCheckinLoading] = useState(false);
  const [selfCheckinResult, setSelfCheckinResult] = useState<{
    type: 'success' | 'already' | 'error';
    message: string;
  } | null>(null);

  // Questions State
  const [questions, setQuestions] = useState<EventQuestion[]>([]);
  const [newQuestion, setNewQuestion] = useState('');
  const [replyingQid, setReplyingQid] = useState<string | null>(null);
  const [replyContent, setReplyContent] = useState('');
  const [submittingQuestion, setSubmittingQuestion] = useState(false);
  const [submittingReply, setSubmittingReply] = useState(false);

  // Guest Registration Modal State & Trigger Ref
  const [isGuestModalOpen, setIsGuestModalOpen] = useState(false);
  const registerBtnRef = useRef<HTMLButtonElement>(null);
  const [eventGuests, setEventGuests] = useState<EventGuest[]>([]);

  // People to meet state
  const [peopleToMeetList, setPeopleToMeetList] = useState<any[]>([]);
  const [peopleToMeetLoading, setPeopleToMeetLoading] = useState(false);
  const [peopleToMeetMessage, setPeopleToMeetMessage] = useState<string | null>(null);
  const [peopleToMeetOptedInCount, setPeopleToMeetOptedInCount] = useState<number>(0);

  const loadPeopleToMeet = async (eventId: string) => {
    if (!currentProfile) return;
    setPeopleToMeetLoading(true);
    try {
      const res = await fetchPeopleToMeet(eventId);
      setPeopleToMeetList(res.people || []);
      setPeopleToMeetOptedInCount(res.opted_in_count || 0);
      setPeopleToMeetMessage(res.message || null);
    } catch (err: any) {
      setPeopleToMeetList([]);
      setPeopleToMeetMessage(err?.message || 'Could not load matches.');
    } finally {
      setPeopleToMeetLoading(false);
    }
  };

  const handleMatchFeedback = async (eventId: string, profileId: string, value: 1 | -1) => {
    if (value === -1) {
      setPeopleToMeetList(prev => prev.filter(p => p.id !== profileId));
      onToast('Member hidden from your matches.');
    } else {
      onToast('Thanks for your feedback!');
    }
    try {
      await submitPeopleToMeetFeedback(eventId, profileId, value);
    } catch (err: any) {
      console.warn('[People to meet feedback error]:', err);
    }
  };

  const handleConnectPerson = async (person: any) => {
    if (!currentProfile) {
      onToast('Please sign in to connect.');
      return;
    }
    try {
      const conn = await requestMemberConnect(currentProfile.id, person.id, person.reason || 'Event networking match');
      const waUrl = formatWhatsAppUrl(conn.whatsapp, `Hi ${person.name.split(' ')[0]}, I saw you on Kwegatta for ${detailedItem?.title || 'the event'} and would love to connect!`);
      const link = waUrl || conn.linkedin;
      if (link) {
        window.open(link, '_blank', 'noopener,noreferrer');
      } else {
        onToast(`Connected with ${person.name}!`);
      }
    } catch (err: any) {
      onToast(err?.message || `Sent connection request to ${person.name}`);
    }
  };

  // Safety Report Modal State
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportingItem, setReportingItem] = useState<EventOpportunityItem | null>(null);
  const [reportReason, setReportReason] = useState<string>('Not a real event');
  const [reportDetails, setReportDetails] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);

  const parseTagsInput = (raw: string): string[] => {
    const parts = raw.split(',');
    const out: string[] = [];
    for (const p of parts) {
      const cleaned = p.trim().toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24);
      if (cleaned && !out.includes(cleaned)) {
        out.push(cleaned);
        if (out.length >= 5) break;
      }
    }
    return out;
  };

  const isValidMapLinkClient = (urlStr: string): boolean => {
    if (!urlStr.trim()) return true;
    try {
      const parsed = new URL(urlStr.trim());
      if (parsed.protocol !== 'https:') return false;
      const host = parsed.hostname.toLowerCase();
      const isGoogle =
        host === 'maps.google.com' ||
        host.startsWith('maps.google.') ||
        host === 'maps.app.goo.gl' ||
        (host === 'goo.gl' && parsed.pathname.startsWith('/maps')) ||
        ((host === 'google.com' ||
          host === 'www.google.com' ||
          /^www\.google\.[a-z.]+$/.test(host) ||
          /^google\.[a-z.]+$/.test(host)) &&
          parsed.pathname.startsWith('/maps'));
      const isOsm =
        host === 'openstreetmap.org' ||
        host === 'www.openstreetmap.org' ||
        host.endsWith('.openstreetmap.org') ||
        host === 'osm.org' ||
        host === 'www.osm.org';
      return isGoogle || isOsm;
    } catch {
      return false;
    }
  };

  // Helper to extract guest token from URL or localStorage
  const getGuestToken = (eventId: string) => {
    try {
      const hash = window.location.hash;
      const match = hash.match(/[?&]g=([^&]+)/);
      if (match && match[1]) return decodeURIComponent(match[1]);
    } catch {}
    try {
      return localStorage.getItem(`kw_guest_${eventId}`) || undefined;
    } catch {}
    return undefined;
  };

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

  // Sync selected item from prop or hash if changed
  useEffect(() => {
    if (initialItemId) {
      setSelectedItemId(initialItemId);
    } else {
      const fromHash = getItemIdFromHash();
      if (fromHash) setSelectedItemId(fromHash);
    }
  }, [initialItemId]);

  const loadQuestions = async (eventId: string) => {
    try {
      const qList = await fetchEventQuestions(eventId);
      setQuestions(qList);
    } catch (err) {
      console.warn('Failed to load questions:', err);
    }
  };

  const loadEventGuests = async (eventId: string) => {
    try {
      const gList = await fetchEventGuests(eventId);
      setEventGuests(gList);
    } catch (err) {
      console.warn('Failed to load guests:', err);
    }
  };

  // Load detailed item when selected
  useEffect(() => {
    if (!selectedItemId) {
      setDetailedItem(null);
      setQuestions([]);
      setEventGuests([]);
      return;
    }
    setLoadingDetail(true);
    const guestToken = getGuestToken(selectedItemId);
    fetchEventById(selectedItemId, guestToken)
      .then(res => {
        if (res) {
          setMissingEventId(null);
          setDetailedItem(res);
          loadQuestions(selectedItemId);
          if (
            currentProfile?.is_admin ||
            res.author_id === currentProfile?.id ||
            res.author_id === currentProfile?.account_uid
          ) {
            loadEventGuests(selectedItemId);
          }
          if (res.kind === 'event' && currentProfile) {
            loadPeopleToMeet(selectedItemId);
          }
        } else {
          setMissingEventId(selectedItemId);
          setSelectedItemId(null);
        }
      })
      .catch(() => {
        onToast('Failed to load event details');
        setSelectedItemId(null);
      })
      .finally(() => setLoadingDetail(false));
  }, [selectedItemId, currentProfile]);

  const handleRsvp = async (itemId: string, mode: 'toggle' | 'cancel' = 'toggle') => {
    if (!currentProfile) {
      onToast('Please join or sign in to RSVP');
      if (onJoinClick) onJoinClick();
      return;
    }

    setRsvpLoading(true);
    try {
      const res = mode === 'cancel' ? await cancelRsvp(itemId) : await rsvpEvent(itemId);
      if (res.success) {
        const isWaitlisted = res.status === 'waitlisted' || res.status === 'waitlist';
        const isLeftWaitlist = res.status === 'left_waitlist';
        const isCancelledRsvp = res.status === 'cancelled' || (mode === 'cancel' && res.status === 'none');
        if (detailedItem && detailedItem.id === itemId) {
          setDetailedItem((prev: any) => {
            if (!prev) return prev;
            const updatedAttendeeIds = res.is_attending
              ? Array.from(new Set([...(prev.attendee_ids || []), currentProfile.id]))
              : (prev.attendee_ids || []).filter((id: string) => id !== currentProfile.id);
            return {
              ...prev,
              is_attending: res.is_attending,
              attendee_count: res.attendee_count ?? updatedAttendeeIds.length,
              attendee_ids: updatedAttendeeIds,
              waitlist_count: res.waitlist_count ?? prev.waitlist_count ?? 0,
              my_waitlist_position: isWaitlisted ? (res.position ?? res.my_waitlist_position ?? 1) : null
            };
          });
        }

        setItems(prev =>
          prev.map(it => {
            if (it.id !== itemId) return it;
            const prevIds = Array.isArray(it.attendee_ids) ? it.attendee_ids : [];
            const newAttendees = res.is_attending
              ? Array.from(new Set([...prevIds, currentProfile.id]))
              : prevIds.filter(id => id !== currentProfile.id);
            return {
              ...it,
              attendee_ids: newAttendees,
              attendee_count: res.attendee_count ?? newAttendees.length,
              waitlist_count: res.waitlist_count ?? it.waitlist_count ?? 0,
              my_waitlist_position: isWaitlisted ? (res.position ?? res.my_waitlist_position ?? 1) : null
            };
          })
        );

        if (isWaitlisted) {
          onToast(`You're #${res.position || 1} on the waitlist — we'll notify you if a spot opens.`);
        } else if (isLeftWaitlist) {
          onToast('You left the waitlist');
        } else if (isCancelledRsvp) {
          onToast('Registration cancelled');
        } else {
          onToast(res.is_attending ? "You're attending! Matches updated." : 'RSVP updated.');
        }

        if (selectedItemId === itemId) {
          const guestToken = getGuestToken(itemId);
          fetchEventById(itemId, guestToken).then(fresh => {
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

  // Confirm step before cancelling a registration or leaving a waitlist
  const [rsvpCancelTarget, setRsvpCancelTarget] = useState<{ id: string; title: string; waitlist: boolean } | null>(null);
  const confirmRsvpCancel = async () => {
    const target = rsvpCancelTarget;
    setRsvpCancelTarget(null);
    if (target) await handleRsvp(target.id, 'cancel');
  };

  const handleShare = (item: EventOpportunityItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const shareUrl = `${PUBLIC_APP_URL}/e/${item.id}`;
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
    setDuplicateOf(null);
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
      setFormTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    } catch {
      setFormTimezone('UTC');
    }
    setFormCoverImage('');
    setFormRegLink('');
    setFormMapLink('');
    setFormCapacity('');
    setFormWaitlistEnabled(true);
    setFormTagsInput('');
    setFormSelfCheckin(false);
    setFormContactPhone('');
    setFormContactEmail('');
    setFormOppType('Hackathon');
    setFormDeadline('');
    setFormLink('');
    setCreateErrors({});
    setEditErrors({});
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
    setFormLocation(item.venue || item.location || '');
    setFormJoinLink(item.join_link || '');
    setFormMapLink(item.map_link || '');
    setFormCapacity(item.capacity ? String(item.capacity) : '');
    setFormWaitlistEnabled(item.waitlist_enabled !== false);
    setFormTagsInput(Array.isArray(item.tags) ? item.tags.join(', ') : '');
    setFormSelfCheckin(Boolean(item.self_checkin_enabled));
    setFormContactPhone(item.contact_phone || '');
    setFormContactEmail(item.contact_email || '');
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
    setCreateErrors({});
    setEditErrors({});
    setIsEditModalOpen(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent, postAnyway = false) => {
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

    const errors: Record<string, string> = {};

    const titleError = validateEventTitle(formTitle);
    if (titleError) {
      errors.title = titleError;
    }
    if (!formDescription.trim()) {
      errors.description = 'Description is required';
    }

    if (formKind === 'event') {
      if (!formStartDate) {
        errors.start_date = 'Please specify a start date and time.';
      } else if (!formStartTime) {
        errors.start_time = 'Please specify a start date and time.';
      }

      if (formFormat === 'in_person' || formFormat === 'hybrid') {
        if (formLocation.trim().length < 5) {
          errors.venue = "Add a bit more detail, e.g. 'EIIC, MUBS, Kampala'";
        }
        if (formMapLink.trim() && !isValidMapLinkClient(formMapLink)) {
          errors.map_link = 'Map link must be an https:// Google Maps or OpenStreetMap link.';
        }
      }

      if (formFormat === 'online' || formFormat === 'hybrid') {
        if (!formJoinLink.trim() || !formJoinLink.trim().toLowerCase().startsWith('https://')) {
          errors.join_link = 'Join link must start with https://';
        }
      }

      if (formCapacity.trim()) {
        const capNum = Number(formCapacity.trim());
        if (!Number.isInteger(capNum) || capNum < 1 || capNum > 5000) {
          errors.capacity = 'Capacity must be a whole number between 1 and 5000.';
        }
      }

      if (formEndDate && formEndTime && formStartDate && formStartTime) {
        const tz = formTimezone || 'Africa/Kampala';
        const startIso = zonedTimeToUtcIso(formStartDate, formStartTime, tz);
        const endIso = zonedTimeToUtcIso(formEndDate, formEndTime, tz);
        if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
          errors.end_date = 'End time must be after start time.';
        }
      }
    } else {
      if (!formDeadline.trim()) {
        errors.deadline = 'Please specify a deadline date.';
      }
      if (formLink.trim() && !formLink.trim().toLowerCase().startsWith('https://')) {
        errors.link = 'Opportunity link must start with https://';
      }
    }

    if (formRegLink.trim() && !formRegLink.trim().toLowerCase().startsWith('https://')) {
      errors.reg_link = 'Registration link must start with https://';
    }

    if (formContactPhone.trim()) {
      const cleanPhone = formContactPhone.replace(/[\s-]/g, '');
      if (!/^\+?[0-9]{7,15}$/.test(cleanPhone)) {
        errors.contact_phone = 'Phone number must be valid (7-15 digits with optional +).';
      }
    }

    if (formContactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formContactEmail.trim())) {
      errors.contact_email = 'Email must be a valid email address.';
    }

    if (Object.keys(errors).length > 0) {
      setCreateErrors(errors);
      const firstKey = Object.keys(errors)[0];
      const firstMsg = errors[firstKey];
      onToast(firstMsg);
      setTimeout(() => {
        const el = document.getElementById(`create-${firstKey}`);
        if (el) {
          if (typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          el.focus();
        }
      }, 50);
      return;
    }

    setCreateErrors({});

    // Same author + same title within 24 hours: ask before posting a second copy
    if (!postAnyway) {
      const duplicate = findRecentDuplicate(items, [currentProfile.id, currentProfile.account_uid], formTitle);
      if (duplicate) {
        setDuplicateOf(duplicate);
        return;
      }
    }
    setDuplicateOf(null);

    const payload: any = {
      kind: formKind,
      title: formTitle.trim(),
      description: formDescription.trim(),
      tags: parseTagsInput(formTagsInput),
      contact_phone: formContactPhone.trim() || undefined,
      contact_email: formContactEmail.trim() || undefined
    };

    if (formKind === 'event') {
      const tz = formTimezone || 'Africa/Kampala';
      const startIso = zonedTimeToUtcIso(formStartDate, formStartTime, tz);
      payload.starts_at = startIso;

      let endIso: string;
      if (formEndDate && formEndTime) {
        endIso = zonedTimeToUtcIso(formEndDate, formEndTime, tz);
      } else {
        endIso = new Date(new Date(startIso).getTime() + 2 * 60 * 60 * 1000).toISOString();
      }
      payload.ends_at = endIso;

      payload.format = formFormat;
      payload.timezone = formTimezone;
      payload.location = formLocation.trim();
      payload.venue = formLocation.trim();
      payload.map_link = formMapLink.trim() || undefined;
      payload.join_link = formJoinLink.trim() || undefined;
      if (formCapacity.trim()) {
        payload.capacity = Number(formCapacity.trim());
      }
      payload.waitlist_enabled = formWaitlistEnabled;
      payload.cover_image = formCoverImage.trim() || undefined;
      payload.registration_link = formRegLink.trim() || undefined;
      payload.self_checkin_enabled = formSelfCheckin;
    } else {
      payload.opportunity_type = formOppType;
      payload.deadline = formDeadline.trim();
      payload.link = formLink.trim() || undefined;
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
      console.error('Create event error:', err);
      onToast(err?.message || 'Could not save the event. Please try again.');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;

    const errors: Record<string, string> = {};

    // Older events may predate the title rules; only check a title that was changed.
    const titleError = formTitle.trim() === String(editingItem.title || '').trim() && formTitle.trim()
      ? null
      : validateEventTitle(formTitle);
    if (titleError) {
      errors.title = titleError;
    }
    if (!formDescription.trim()) {
      errors.description = 'Description is required';
    }

    if (editingItem.kind === 'event') {
      if (formFormat === 'in_person' || formFormat === 'hybrid') {
        if (formLocation.trim().length < 5) {
          errors.venue = "Add a bit more detail, e.g. 'EIIC, MUBS, Kampala'";
        }
        if (formMapLink.trim() && !isValidMapLinkClient(formMapLink)) {
          errors.map_link = 'Map link must be an https:// Google Maps or OpenStreetMap link.';
        }
      }

      if (formFormat === 'online' || formFormat === 'hybrid') {
        if (!formJoinLink.trim() || !formJoinLink.trim().toLowerCase().startsWith('https://')) {
          errors.join_link = 'Join link must start with https://';
        }
      }

      if (formCapacity.trim()) {
        const capNum = Number(formCapacity.trim());
        if (!Number.isInteger(capNum) || capNum < 1 || capNum > 5000) {
          errors.capacity = 'Capacity must be a whole number between 1 and 5000.';
        }
      }

      if (formEndDate && formEndTime && formStartDate && formStartTime) {
        const tz = formTimezone || editingItem.timezone || 'Africa/Kampala';
        const startIso = zonedTimeToUtcIso(formStartDate, formStartTime, tz);
        const endIso = zonedTimeToUtcIso(formEndDate, formEndTime, tz);
        if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
          errors.end_date = 'End time must be after start time.';
        }
      }
    } else {
      if (!formDeadline.trim()) {
        errors.deadline = 'Please specify a deadline date.';
      }
      if (formLink.trim() && !formLink.trim().toLowerCase().startsWith('https://')) {
        errors.link = 'Opportunity link must start with https://';
      }
    }

    if (formRegLink.trim() && !formRegLink.trim().toLowerCase().startsWith('https://')) {
      errors.reg_link = 'Registration link must start with https://';
    }

    if (formContactPhone.trim()) {
      const cleanPhone = formContactPhone.replace(/[\s-]/g, '');
      if (!/^\+?[0-9]{7,15}$/.test(cleanPhone)) {
        errors.contact_phone = 'Phone number must be valid (7-15 digits with optional +).';
      }
    }

    if (formContactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formContactEmail.trim())) {
      errors.contact_email = 'Email must be a valid email address.';
    }

    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      const firstKey = Object.keys(errors)[0];
      const firstMsg = errors[firstKey];
      onToast(firstMsg);
      setTimeout(() => {
        const el = document.getElementById(`edit-${firstKey}`);
        if (el) {
          if (typeof el.scrollIntoView === 'function') {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          el.focus();
        }
      }, 50);
      return;
    }

    setEditErrors({});

    const patch: any = {
      title: formTitle.trim(),
      description: formDescription.trim(),
      tags: parseTagsInput(formTagsInput),
      contact_phone: formContactPhone.trim() || undefined,
      contact_email: formContactEmail.trim() || undefined
    };

    if (editingItem.kind === 'event') {
      if (formCapacity.trim()) {
        patch.capacity = Number(formCapacity.trim());
      } else {
        patch.capacity = null;
      }

      const tz = formTimezone || editingItem.timezone || 'Africa/Kampala';
      if (formStartDate && formStartTime) {
        const startIso = zonedTimeToUtcIso(formStartDate, formStartTime, tz);
        patch.starts_at = startIso;
        let endIso: string;
        if (formEndDate && formEndTime) {
          endIso = zonedTimeToUtcIso(formEndDate, formEndTime, tz);
        } else {
          endIso = new Date(new Date(startIso).getTime() + 2 * 60 * 60 * 1000).toISOString();
        }
        patch.ends_at = endIso;
      }
      patch.format = formFormat;
      patch.timezone = formTimezone;
      patch.location = formLocation.trim();
      patch.venue = formLocation.trim();
      patch.map_link = formMapLink.trim() || null;
      patch.join_link = formJoinLink.trim() || undefined;
      patch.cover_image = formCoverImage.trim() || undefined;
      patch.registration_link = formRegLink.trim() || undefined;
      patch.self_checkin_enabled = formSelfCheckin;
      patch.waitlist_enabled = formWaitlistEnabled;
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
      console.error('Update event error:', err);
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
          const guestToken = getGuestToken(itemId);
          fetchEventById(itemId, guestToken).then(fresh => {
            if (fresh) setDetailedItem(fresh);
          });
        }
      }
    } catch (err: any) {
      onToast(err.message || 'Failed to cancel event');
    }
  };

  const openDeleteDialog = (item: any, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDeleteTarget(item);
    setDeleteArmed(false);
  };

  const closeDeleteDialog = () => {
    setDeleteTarget(null);
    setDeleteArmed(false);
  };

  const handleAuthorDelete = async () => {
    if (!deleteTarget) return;
    if (!deleteArmed) {
      setDeleteArmed(true);
      return;
    }
    setDeleting(true);
    try {
      const ok = await deleteEvent(deleteTarget.id);
      if (!ok) {
        onToast('Could not delete the event. Please try again.');
        return;
      }
      onToast('Event deleted.');
      const deletedId = deleteTarget.id;
      closeDeleteDialog();
      setItems(prev => prev.filter(it => it.id !== deletedId));
      if (selectedItemId === deletedId) {
        setSelectedItemId(null);
        window.location.hash = '#/events';
      }
      loadEventsList();
    } finally {
      setDeleting(false);
    }
  };

  const handleAskQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId) return;
    if (!newQuestion.trim()) {
      onToast('Please enter a question.');
      return;
    }
    if (newQuestion.trim().length < 3 || newQuestion.trim().length > 500) {
      onToast('Question must be between 3 and 500 characters.');
      return;
    }
    setSubmittingQuestion(true);
    try {
      await postEventQuestion(selectedItemId, newQuestion.trim());
      setNewQuestion('');
      onToast('Question submitted.');
      loadQuestions(selectedItemId);
    } catch (err: any) {
      onToast(err?.message || 'Failed to post question');
    } finally {
      setSubmittingQuestion(false);
    }
  };

  const handleReplyQuestion = async (qid: string, e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId) return;
    if (!replyContent.trim()) {
      onToast('Please enter a reply.');
      return;
    }
    setSubmittingReply(true);
    try {
      await replyEventQuestion(selectedItemId, qid, replyContent.trim());
      setReplyingQid(null);
      setReplyContent('');
      onToast('Reply posted.');
      loadQuestions(selectedItemId);
    } catch (err: any) {
      onToast(err?.message || 'Failed to post reply');
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleDeleteQuestion = async (qid: string) => {
    if (!selectedItemId) return;
    if (!confirm('Delete this question?')) return;
    try {
      await deleteEventQuestion(selectedItemId, qid);
      onToast('Question deleted.');
      loadQuestions(selectedItemId);
    } catch (err: any) {
      onToast(err?.message || 'Failed to delete question');
    }
  };

  const handleGuestSuccess = (token: string, status?: 'going' | 'registered' | 'waitlisted' | 'waitlist', position?: number) => {
    setIsGuestModalOpen(false);
    const isWaitlisted = status === 'waitlisted' || status === 'waitlist';
    if (isWaitlisted) {
      onToast(`You're #${position || 1} on the waitlist — we'll email you if a spot opens.`);
    } else {
      onToast("You're registered!");
    }
    if (selectedItemId) {
      fetchEventById(selectedItemId, token).then(fresh => {
        if (fresh) {
          setDetailedItem(fresh);
        } else {
          setDetailedItem((prev: any) =>
            prev
              ? {
                  ...prev,
                  attendee_count: isWaitlisted ? (prev.attendee_count || 0) : (prev.attendee_count || 0) + 1,
                  waitlist_count: isWaitlisted ? (prev.waitlist_count || 0) + 1 : (prev.waitlist_count || 0),
                  guest_info: { token, status: isWaitlisted ? 'waitlist' : 'registered', position: position || null }
                }
              : prev
          );
        }
      });
      loadEventsList();
    }
  };

  const handleCancelGuestRegistration = async () => {
    if (!selectedItemId) return;
    const token = getGuestToken(selectedItemId);
    if (!token) return;
    if (!confirm('Cancel your guest registration?')) return;
    try {
      await cancelEventGuest(selectedItemId, token);
      try {
        localStorage.removeItem(`kw_guest_${selectedItemId}`);
      } catch {}
      onToast('Registration cancelled.');
      fetchEventById(selectedItemId).then(fresh => {
        if (fresh) setDetailedItem(fresh);
      });
    } catch (err: any) {
      onToast(err?.message || 'Failed to cancel registration');
    }
  };

  const handleExportAttendeesCsv = async (eventId: string) => {
    setExportingCsv(true);
    try {
      const csvText = await exportEventAttendeesCsv(eventId);
      const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${eventId}-attendees.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      onToast('Attendees CSV exported.');
    } catch (err: any) {
      onToast(err?.message || 'Failed to export CSV');
    } finally {
      setExportingCsv(false);
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
        const guestToken = getGuestToken(reportingItem.id);
        fetchEventById(reportingItem.id, guestToken).then(fresh => {
          if (fresh) setDetailedItem(fresh);
        });
      }
    } catch (err: any) {
      onToast(err.message || 'Failed to submit report');
    } finally {
      setSubmittingReport(false);
    }
  };

  // Kwegatta 1.8.0: Detect #/checkin/:eventId/:token or #/events/:id/ticket from URL hash
  useEffect(() => {
    const syncHashCheckinAndTicket = () => {
      try {
        const rawHash = window.location.hash.replace(/^#\/?/, '');
        const [pathPart, queryPart] = rawHash.split('?');
        const segs = pathPart.split('/');
        if (segs[0] === 'checkin' && segs[1] && segs[2]) {
          setSelectedItemId(segs[1]);
          setSelfCheckinToken(decodeURIComponent(segs[2]));
          setSelfCheckinResult(null);
        } else if (segs[0] === 'events' && segs[1] && segs[2] === 'ticket') {
          setSelectedItemId(segs[1]);
          handleOpenMyTicket(segs[1]);
        } else if (queryPart) {
          const params = new URLSearchParams(queryPart);
          const chkTok = params.get('checkin');
          if (chkTok) {
            setSelfCheckinToken(chkTok);
            setSelfCheckinResult(null);
          } else {
            setSelfCheckinToken(null);
          }
        } else {
          setSelfCheckinToken(null);
        }
      } catch {}
    };
    syncHashCheckinAndTicket();
    window.addEventListener('hashchange', syncHashCheckinAndTicket);
    return () => window.removeEventListener('hashchange', syncHashCheckinAndTicket);
  }, []);

  const handleOpenMyTicket = async (eventId: string) => {
    setIsTicketModalOpen(true);
    setLoadingTicket(true);
    setTicketCode(null);
    setTicketQrDataUrl('');
    try {
      const gTok = getGuestToken(eventId);
      const res = await fetchMyEventTicket(eventId, gTok);
      setTicketCode(res.code);
      const payload = res.qr_payload || `KWG1:${eventId}:${res.code}`;
      const QRCode = (await import('qrcode')).default;
      const url = await QRCode.toDataURL(payload, {
        width: 240,
        margin: 1,
        color: { dark: '#0B0F17', light: '#FFFFFF' }
      });
      setTicketQrDataUrl(url);
    } catch (err: any) {
      onToast(err?.message || 'Could not load ticket');
      setIsTicketModalOpen(false);
    } finally {
      setLoadingTicket(false);
    }
  };

  const refreshDetailAndGuests = (eventId: string) => {
    const guestToken = getGuestToken(eventId);
    fetchEventById(eventId, guestToken).then(fresh => {
      if (fresh) setDetailedItem(fresh);
    });
    if (
      currentProfile?.is_admin ||
      detailedItem?.author_id === currentProfile?.id ||
      detailedItem?.author_id === currentProfile?.account_uid
    ) {
      loadEventGuests(eventId);
    }
  };

  const handleHostManualCheckin = async (kind: 'member' | 'guest', refId: string) => {
    if (!selectedItemId) return;
    try {
      const res = await checkinEventAttendee(selectedItemId, { kind, ref_id: refId });
      if (res.status === 'already') {
        const timeStr = res.checked_in_at
          ? new Date(res.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          : '';
        onToast(`Already checked in at ${timeStr}`);
      } else {
        onToast(`Checked in ${res.name}`);
      }
      refreshDetailAndGuests(selectedItemId);
    } catch (err: any) {
      onToast(err?.message || 'Check-in failed');
    }
  };

  // Camera scanning moved to lazy-loaded HostScannerModal component

  // Rotating 30s Venue QR effect when isVenueQrOpen is true
  useEffect(() => {
    if (!isVenueQrOpen || !selectedItemId) return;
    let active = true;

    const loadRotatingToken = async () => {
      try {
        const data = await fetchEventCheckinToken(selectedItemId);
        if (!active) return;
        setVenueCheckedInCount(data.checked_in_count || 0);
        setVenueCountdown(30);
        const QRCode = (await import('qrcode')).default;
        const qrImg = await QRCode.toDataURL(data.url, {
          width: 320,
          margin: 1,
          color: { dark: '#0B0F17', light: '#FFFFFF' }
        });
        if (active) setVenueQrDataUrl(qrImg);
      } catch (err: any) {
        if (active) onToast(err?.message || 'Failed to load venue QR');
      }
    };

    loadRotatingToken();
    const rotateTimer = setInterval(loadRotatingToken, 30000);
    const countdownTimer = setInterval(() => {
      setVenueCountdown(prev => (prev > 1 ? prev - 1 : 30));
    }, 1000);

    return () => {
      active = false;
      clearInterval(rotateTimer);
      clearInterval(countdownTimer);
    };
  }, [isVenueQrOpen, selectedItemId]);

  const handleSelfCheckinSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedItemId || !selfCheckinToken) return;
    setSelfCheckinLoading(true);
    setSelfCheckinResult(null);
    try {
      const payload: { token: string; guest_email?: string } = { token: selfCheckinToken };
      if (!currentProfile || selfCheckinGuestEmail.trim()) {
        payload.guest_email = selfCheckinGuestEmail.trim();
      }
      const res = await selfCheckinEvent(selectedItemId, payload);
      if (res.status === 'already') {
        setSelfCheckinResult({
          type: 'already',
          message: res.message || "You're already checked in"
        });
      } else {
        setSelfCheckinResult({
          type: 'success',
          message: `Checked in! Welcome, ${res.name}.`
        });
      }
      refreshDetailAndGuests(selectedItemId);
    } catch (err: any) {
      setSelfCheckinResult({
        type: 'error',
        message: err?.message || 'Self check-in failed'
      });
    } finally {
      setSelfCheckinLoading(false);
    }
  };

  // Filter items by search query (title, description, venue/location, or tags)
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredItems = normalizedSearch
    ? items.filter(it => {
        const titleMatch = (it.title || '').toLowerCase().includes(normalizedSearch);
        const descMatch = (it.description || '').toLowerCase().includes(normalizedSearch);
        const locMatch = (it.venue || it.location || '').toLowerCase().includes(normalizedSearch);
        const tagMatch = Array.isArray(it.tags) && it.tags.some(t => String(t).toLowerCase().includes(normalizedSearch));
        return titleMatch || descMatch || locMatch || tagMatch;
      })
    : items;

  // Group items into Upcoming and Past
  // Upcoming: soonest effective start first. Past (including cancelled): most recent first.
  const upcomingItems = sortForTab(filteredItems.filter(it => it.phase !== 'past' && !it.is_cancelled), 'upcoming');
  const pastItems = sortForTab(filteredItems.filter(it => it.phase === 'past' || it.is_cancelled), 'past');

  // Modal keyboard handling (Escape closes, focus stays inside). Only one of each modal
  // is mounted at a time, so the detail and list copies share a ref.
  const createDialogRef = useDialogA11y<HTMLDivElement>(isCreateModalOpen, () => setIsCreateModalOpen(false));
  const editDialogRef = useDialogA11y<HTMLDivElement>(Boolean(isEditModalOpen && editingItem), () => setIsEditModalOpen(false));
  const reportDialogRef = useDialogA11y<HTMLDivElement>(Boolean(isReportModalOpen && reportingItem), () => setIsReportModalOpen(false));
  const ticketDialogRef = useDialogA11y<HTMLDivElement>(isTicketModalOpen, () => setIsTicketModalOpen(false));
  const venueDialogRef = useDialogA11y<HTMLDivElement>(isVenueQrOpen, () => setIsVenueQrOpen(false));
  const deleteDialogRef = useDialogA11y<HTMLDivElement>(Boolean(deleteTarget), () => closeDeleteDialog());
  const rsvpCancelDialogRef = useDialogA11y<HTMLDivElement>(Boolean(rsvpCancelTarget), () => setRsvpCancelTarget(null));

  const rsvpCancelDialog = rsvpCancelTarget && (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="rsvp-cancel-dialog-title">
      <div ref={rsvpCancelDialogRef} tabIndex={-1} className="kw-card max-w-sm w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150 outline-none">
        <h3 id="rsvp-cancel-dialog-title" className="font-bold text-sm text-[var(--fg)]">
          {rsvpCancelTarget.waitlist
            ? `Leave the waitlist for ${rsvpCancelTarget.title}?`
            : `Cancel your registration for ${rsvpCancelTarget.title}?`}
        </h3>
        {!rsvpCancelTarget.waitlist && (
          <p className="text-xs text-[var(--fg-muted)]">Your ticket will stop working and your spot may go to someone on the waitlist.</p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={() => setRsvpCancelTarget(null)}
            className="primer-btn text-xs py-2 px-4 cursor-pointer"
          >
            {rsvpCancelTarget.waitlist ? 'Keep my place' : 'Keep my spot'}
          </button>
          <button
            type="button"
            onClick={confirmRsvpCancel}
            className="kw-btn text-xs py-2 px-4 rounded-lg font-bold bg-rose-600 text-white hover:bg-rose-500 cursor-pointer"
          >
            {rsvpCancelTarget.waitlist ? 'Leave waitlist' : 'Cancel registration'}
          </button>
        </div>
      </div>
    </div>
  );

  // Render Detailed Item View
  if (selectedItemId && detailedItem) {
    const isEvent = detailedItem.kind === 'event';
    const isAuthor = Boolean(currentProfile && (detailedItem.author_id === currentProfile.id || detailedItem.author_id === currentProfile.account_uid));
    const isAdminViewer = Boolean(currentProfile?.is_admin);
    const canManageAttendees = isAuthor || isAdminViewer;
    const isAttending = Boolean(detailedItem.is_attending);
    const attendees = Array.isArray(detailedItem.attendees) ? detailedItem.attendees : [];

    // Combine guests from detailedItem.guests and eventGuests (deduplicated)
    const guestMap = new Map<string, any>();
    if (Array.isArray(detailedItem.guests)) {
      for (const g of detailedItem.guests) {
        if (g && g.id) guestMap.set(g.id, g);
      }
    }
    for (const g of eventGuests) {
      if (g && g.id) guestMap.set(g.id, { ...guestMap.get(g.id), ...g });
    }
    const allEventGuests = Array.from(guestMap.values());
    const combinedGuests = allEventGuests.filter((g: any) => g.status !== 'waitlist');
    const waitlistEntries = Array.isArray(detailedItem.waitlist) ? detailedItem.waitlist : [];

    const attendeeCount = detailedItem.attendee_count ?? (attendees.length + combinedGuests.length);
    const waitlistCount = detailedItem.waitlist_count ?? waitlistEntries.length;
    const waitlistEnabled = detailedItem.waitlist_enabled !== false;
    const myWaitlistPos: number | null = detailedItem.my_waitlist_position ?? null;
    const hasCapacity = typeof detailedItem.capacity === 'number' && detailedItem.capacity > 0;
    const spotsLeft = hasCapacity ? Math.max(0, detailedItem.capacity - attendeeCount) : null;
    const isFull = hasCapacity && spotsLeft === 0;

    const handleRemoveEntry = async (kind: 'member' | 'guest', targetId: string, labelName: string) => {
      try {
        if (kind === 'member') {
          await removeEventAttendee(detailedItem.id, targetId);
        } else {
          await deleteEventGuest(detailedItem.id, targetId);
        }
        onToast(`Removed ${labelName}.`);
        refreshDetailAndGuests(detailedItem.id);
        loadEventsList();
      } catch (err: any) {
        onToast(err?.message || 'Failed to remove attendee');
      }
    };

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
    const detailTags: string[] = Array.isArray(detailedItem.tags) ? detailedItem.tags : [];

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

        {/* Venue Self Check-in Banner (when visiting #/checkin/:eventId/:token) */}
        {selfCheckinToken && (
          <div className="kw-card p-5 space-y-4 border-[var(--gold)]/60 bg-amber-500/5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-[var(--gold-text)]" />
                <h2 className="font-bold text-sm text-[var(--fg)]">Venue Self Check-in</h2>
              </div>
              <span className="text-xs text-[var(--fg-muted)]">{detailedItem.title}</span>
            </div>

            {selfCheckinResult && (
              <div
                className={`p-3.5 rounded-xl border text-xs font-bold flex items-center gap-2 ${
                  selfCheckinResult.type === 'success'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                    : selfCheckinResult.type === 'already'
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                    : 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                }`}
              >
                {selfCheckinResult.type === 'success' && <Check className="w-4 h-4 flex-shrink-0" />}
                <span>{selfCheckinResult.message}</span>
              </div>
            )}

            {currentProfile && isAttending ? (
              <button
                type="button"
                disabled={selfCheckinLoading}
                onClick={() => handleSelfCheckinSubmit()}
                className="kw-btn kw-btn-gold py-2.5 px-5 text-xs font-bold rounded-xl inline-flex items-center gap-2 cursor-pointer"
              >
                <UserCheck className="w-4 h-4" />
                <span>{selfCheckinLoading ? 'Checking in...' : 'Check in now'}</span>
              </button>
            ) : (
              <form onSubmit={handleSelfCheckinSubmit} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="email"
                  value={selfCheckinGuestEmail}
                  aria-label="Email you registered with"
                  onChange={e => setSelfCheckinGuestEmail(e.target.value)}
                  placeholder="Enter the email you registered with..."
                  required={!currentProfile}
                  className="kw-input text-xs flex-1"
                />
                <button
                  type="submit"
                  disabled={selfCheckinLoading}
                  className="kw-btn kw-btn-gold py-2 px-4 text-xs font-bold rounded-lg cursor-pointer"
                >
                  {selfCheckinLoading ? 'Checking in...' : 'Check in'}
                </button>
              </form>
            )}
          </div>
        )}

        {/* Hidden Moderator Banner */}
        {isAuthor && detailedItem.hidden_by_moderation && (
          <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1">
            <p className="font-bold">
              This event is hidden by a moderator. Reason: {detailedItem.hidden_reason || 'Under review'}. Edit the event and it will be reviewed again.
            </p>
          </div>
        )}

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

            {/* Tags Chips */}
            {detailTags.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5">
                {detailTags.map(tag => (
                  <span
                    key={tag}
                    className="px-2.5 py-0.5 rounded-md text-xs font-medium bg-[var(--bg)] border border-[var(--card-border)] text-[var(--fg-muted)] inline-flex items-center gap-1"
                  >
                    <Tag className="w-3 h-3 text-[var(--gold-text)]" />
                    {tag}
                  </span>
                ))}
              </div>
            )}

            {/* Host Attribution */}
            <div className="flex items-center gap-3 py-1">
              <div
                {...activateProps(() => detailedItem.author_id && onViewProfile(detailedItem.author_id))}
                aria-label={`View ${hostName}'s profile`}
                className={`flex items-center gap-2.5 cursor-pointer group rounded-lg ${FOCUS_RING}`}
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

            {/* Date, Time & Venue */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-xl bg-[var(--bg)] border border-[var(--card-border)] text-xs">
              <div className="flex items-start gap-2.5">
                <Calendar className="w-4 h-4 text-[var(--gold-text)] flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-[var(--fg)]">{timeFormatted.display}</p>
                  {!timeFormatted.isLegacy && (
                    <p className="text-[13px] text-[var(--fg-subtle)] mt-0.5">Shown in your local timezone</p>
                  )}
                </div>
              </div>

              <div className="flex items-start gap-2.5">
                {detailedItem.format === 'online' ? (
                  <Video className="w-4 h-4 text-[var(--gold-text)] flex-shrink-0 mt-0.5" />
                ) : (
                  <MapPin className="w-4 h-4 text-[var(--gold-text)] flex-shrink-0 mt-0.5" />
                )}
                <div className="space-y-1">
                  <p className="font-semibold text-[var(--fg)]">
                    {detailedItem.format === 'online' ? 'Online' : (detailedItem.venue || detailedItem.location || '')}
                  </p>
                  <p className="text-[13px] text-[var(--fg-subtle)] capitalize">
                    {detailedItem.format ? `${detailedItem.format.replace('_', ' ')} format` : 'In person'}
                  </p>
                  {detailedItem.map_link && (
                    <a
                      href={detailedItem.map_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--gold-text)] hover:underline pt-0.5"
                    >
                      <span>Open in Maps</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            </div>

            {/* Contact the host */}
            {(detailedItem.contact_phone || detailedItem.contact_email) ? (
              <div className="kw-card p-4 space-y-3 border-[var(--gold)]/30">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-xs text-[var(--fg)] flex items-center gap-1.5">
                    <Phone className="w-4 h-4 text-[var(--gold-text)]" />
                    Contact the host
                  </h4>
                  {isAuthor && (
                    <button
                      onClick={e => openEditModal(detailedItem, e)}
                      className="text-xs text-[var(--gold-text)] hover:underline flex items-center gap-1"
                    >
                      <Edit className="w-3 h-3" /> Edit
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 text-xs">
                  {detailedItem.contact_phone && (
                    <a
                      href={`https://wa.me/${detailedItem.contact_phone.replace(/[^0-9]/g, '')}?text=${encodeURIComponent(`Hi, I'm registered for ${detailedItem.title} on Kwegatta.`)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="kw-btn px-3 py-1.5 rounded-lg border border-emerald-500/40 bg-emerald-500/10 text-emerald-400 font-semibold flex items-center gap-1.5 hover:bg-emerald-500/20"
                    >
                      <Phone className="w-3.5 h-3.5" /> WhatsApp
                    </a>
                  )}
                  {detailedItem.contact_email && (
                    <a
                      href={`mailto:${detailedItem.contact_email}?subject=${encodeURIComponent(detailedItem.title)}`}
                      className="kw-btn px-3 py-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--bg)] text-[var(--fg)] font-semibold flex items-center gap-1.5 hover:border-[var(--gold)]"
                    >
                      <Mail className="w-3.5 h-3.5 text-[var(--gold-text)]" /> Email
                    </a>
                  )}
                </div>
              </div>
            ) : (!isPast && !isCancelled && !isAuthor) ? (
              <p className="text-xs text-[var(--fg-muted)] italic">
                Register to see the host's contact details.
              </p>
            ) : isAuthor ? (
              <div className="flex items-center gap-2 text-xs text-[var(--fg-muted)]">
                <span>No host contact details added yet.</span>
                <button
                  onClick={e => openEditModal(detailedItem, e)}
                  className="text-[var(--gold-text)] hover:underline flex items-center gap-1 font-semibold"
                >
                  <Edit className="w-3 h-3" /> Edit
                </button>
              </div>
            ) : null}

            {/* Join Link */}
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

            {/* Member Waitlist Status Banner */}
            {isEvent && currentProfile && myWaitlistPos && !isAttending && !isCancelled && !isPast && (
              <div
                data-testid="member-waitlist-banner"
                className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/40 flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div className="flex items-center gap-2 text-amber-300 font-semibold">
                  <Clock className="w-4 h-4 flex-shrink-0" />
                  <span>{`You're #${myWaitlistPos} on the waitlist — we'll notify you if a spot opens.`}</span>
                </div>
                <button
                  type="button"
                  disabled={rsvpLoading}
                  onClick={() => setRsvpCancelTarget({ id: detailedItem.id, title: detailedItem.title, waitlist: true })}
                  className="kw-btn text-xs py-1 px-3 rounded-lg border border-amber-500/40 text-amber-300 hover:bg-amber-500/20 font-bold cursor-pointer"
                >
                  Leave waitlist
                </button>
              </div>
            )}

            {/* Action Bar */}
            <div className="pt-4 border-t border-[var(--card-border)] flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                {isAuthor ? (
                  <span className="px-4 py-2.5 text-xs font-bold rounded-lg bg-amber-500/15 text-[var(--gold-text)] border border-amber-500/30 inline-flex items-center gap-1.5">
                    <Award className="w-4 h-4" />
                    <span>You're hosting</span>
                  </span>
                ) : currentProfile ? (
                  isEvent ? (
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
                    ) : myWaitlistPos && !isAttending ? (
                      <button
                        onClick={() => setRsvpCancelTarget({ id: detailedItem.id, title: detailedItem.title, waitlist: true })}
                        disabled={rsvpLoading}
                        className="kw-btn px-5 py-2.5 text-xs font-bold rounded-lg bg-amber-500/15 text-amber-300 border border-amber-500/40 hover:bg-amber-500/25 transition-all flex items-center gap-2 cursor-pointer"
                      >
                        <Clock className="w-4 h-4" />
                        <span>{`Waitlist #${myWaitlistPos} · Leave waitlist`}</span>
                      </button>
                    ) : isFull && !isAttending ? (
                      waitlistEnabled ? (
                        <button
                          onClick={() => handleRsvp(detailedItem.id)}
                          disabled={rsvpLoading}
                          className="kw-btn px-6 py-2.5 text-xs font-bold rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-all flex items-center gap-2 cursor-pointer"
                        >
                          <Clock className="w-4 h-4" />
                          <span>Join waitlist</span>
                        </button>
                      ) : (
                        <button
                          disabled
                          className="kw-btn px-6 py-2.5 text-xs font-bold rounded-lg bg-zinc-700/50 text-zinc-400 cursor-not-allowed"
                        >
                          Full
                        </button>
                      )
                    ) : isAttending ? (
                      <>
                        <span
                          data-testid="rsvp-going-status"
                          className="px-5 py-2.5 text-xs font-bold rounded-lg bg-emerald-600/20 text-emerald-300 border border-emerald-500/40 inline-flex items-center gap-2"
                        >
                          <Check className="w-4 h-4" />
                          <span>You're going</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setRsvpCancelTarget({ id: detailedItem.id, title: detailedItem.title, waitlist: false })}
                          disabled={rsvpLoading}
                          className="kw-btn px-4 py-2.5 text-xs font-bold rounded-lg border border-rose-500/50 text-rose-400 hover:bg-rose-500/15 transition-all cursor-pointer"
                        >
                          Cancel registration
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => handleRsvp(detailedItem.id)}
                        disabled={rsvpLoading}
                        className="kw-btn kw-btn-gold px-6 py-2.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2"
                      >
                        I'm going
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
                  )
                ) : (!isPast && !isCancelled) ? (
                  /* Signed-Out Register Button / Confirmation */
                  (() => {
                    const token = getGuestToken(detailedItem.id);
                    const isRegisteredGuest = Boolean(token || detailedItem.guest_info);
                    const activeToken = token || detailedItem.guest_info?.token;
                    const guestStatus = detailedItem.guest_info?.status;
                    const isWaitlistedGuest = guestStatus === 'waitlist' || guestStatus === 'waitlisted';
                    const guestWaitlistPos = detailedItem.guest_info?.position || 1;

                    if (isRegisteredGuest) {
                      if (isWaitlistedGuest) {
                        return (
                          <div className="kw-card p-4 space-y-3 border-amber-500/40 bg-amber-500/5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 text-amber-300 font-bold text-xs">
                                <Clock className="w-4 h-4" />
                                <span>{`You're #${guestWaitlistPos} on the waitlist — we'll email you if a spot opens.`}</span>
                              </div>
                            </div>
                            <p className="text-xs text-[var(--fg-muted)]">
                              Keep your private link to check your status or leave the waitlist:
                            </p>
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                readOnly
                                aria-label="Your ticket link"
                                value={`${window.location.origin}/#/events/${detailedItem.id}?g=${activeToken || ''}`}
                                className="kw-input text-xs flex-1 bg-[var(--bg)]"
                              />
                              <button
                                type="button"
                                onClick={() => {
                                  const link = `${window.location.origin}/#/events/${detailedItem.id}?g=${activeToken || ''}`;
                                  navigator.clipboard.writeText(link);
                                  onToast('Link copied to clipboard');
                                }}
                                className="kw-btn text-xs py-1.5 px-3 border border-[var(--card-border)] hover:border-[var(--gold)]"
                              >
                                Copy link
                              </button>
                            </div>
                            <button
                              type="button"
                              onClick={handleCancelGuestRegistration}
                              className="text-xs text-rose-400 hover:underline cursor-pointer"
                            >
                              Leave waitlist
                            </button>
                          </div>
                        );
                      }

                      return (
                        <div className="kw-card p-4 space-y-3 border-emerald-500/40 bg-emerald-500/5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                              <Check className="w-4 h-4" />
                              <span>You're registered</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleOpenMyTicket(detailedItem.id)}
                              className="kw-btn kw-btn-gold text-xs py-1 px-2.5 rounded-lg font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <QrCode className="w-3.5 h-3.5" />
                              <span>My ticket</span>
                            </button>
                          </div>
                          <p className="text-xs text-[var(--fg-muted)]">
                            Keep your private registration link to view event contact info:
                          </p>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              readOnly
                              aria-label="Your ticket link"
                              value={`${window.location.origin}/#/events/${detailedItem.id}?g=${activeToken || ''}`}
                              className="kw-input text-xs flex-1 bg-[var(--bg)]"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const link = `${window.location.origin}/#/events/${detailedItem.id}?g=${activeToken || ''}`;
                                navigator.clipboard.writeText(link);
                                onToast('Link copied to clipboard');
                              }}
                              className="kw-btn text-xs py-1.5 px-3 border border-[var(--card-border)] hover:border-[var(--gold)]"
                            >
                              Copy link
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={handleCancelGuestRegistration}
                            className="text-xs text-rose-400 hover:underline cursor-pointer"
                          >
                            Cancel my registration
                          </button>
                        </div>
                      );
                    }

                    if (isFull) {
                      if (waitlistEnabled) {
                        return (
                          <button
                            ref={registerBtnRef}
                            type="button"
                            onClick={() => setIsGuestModalOpen(true)}
                            className="kw-btn py-2.5 px-5 font-bold text-xs rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 flex items-center gap-2 cursor-pointer"
                          >
                            <Clock className="w-4 h-4" />
                            Join waitlist as guest
                          </button>
                        );
                      }
                      return (
                        <button
                          type="button"
                          disabled
                          className="kw-btn px-6 py-2.5 text-xs font-bold rounded-lg bg-zinc-700/50 text-zinc-400 cursor-not-allowed"
                        >
                          Full
                        </button>
                      );
                    }

                    return (
                      <button
                        ref={registerBtnRef}
                        type="button"
                        onClick={() => setIsGuestModalOpen(true)}
                        className="kw-btn kw-btn-gold py-2.5 px-5 font-bold text-xs rounded-xl shadow-lg shadow-amber-500/10 flex items-center gap-2 cursor-pointer"
                      >
                        <UserPlus className="w-4 h-4" />
                        Register
                      </button>
                    );
                  })()
                ) : null}

                {/* Member My Ticket Button */}
                {isEvent && currentProfile && isAttending && !isCancelled && detailedItem.checkin_configured !== false && (
                  <button
                    type="button"
                    onClick={() => handleOpenMyTicket(detailedItem.id)}
                    className="kw-btn px-3.5 py-2.5 text-xs font-bold rounded-lg border border-[var(--gold)]/50 bg-amber-500/10 text-[var(--gold-text)] hover:bg-amber-500/20 inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>My ticket</span>
                  </button>
                )}

                {/* Prominent Host / Admin Attendees (N) Button & Check-in Controls */}
                {canManageAttendees && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowAttendeesPanel(true)}
                      className="kw-btn kw-btn-gold px-4 py-2.5 text-xs font-bold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Users className="w-4 h-4" />
                      {`Attendees (${attendeeCount})`}
                    </button>
                    {isEvent && detailedItem.checkin_configured !== false && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setIsScannerOpen(true);
                          }}
                          className="kw-btn px-3.5 py-2.5 text-xs font-bold rounded-lg border border-[var(--gold)]/50 bg-amber-500/10 text-[var(--gold-text)] hover:bg-amber-500/20 inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Camera className="w-4 h-4" />
                          <span>Check in guests</span>
                        </button>
                        {detailedItem.self_checkin_enabled && (
                          <button
                            type="button"
                            onClick={() => setIsVenueQrOpen(true)}
                            className="kw-btn px-3.5 py-2.5 text-xs font-bold rounded-lg border border-[var(--card-border)] hover:border-[var(--gold)] text-[var(--fg)] inline-flex items-center gap-1.5 cursor-pointer"
                          >
                            <QrCode className="w-4 h-4 text-[var(--gold-text)]" />
                            <span>Display venue QR</span>
                          </button>
                        )}
                      </>
                    )}
                  </>
                )}

                {/* Going Count & Capacity */}
                <span className="text-xs text-[var(--fg-muted)] flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--bg)] border border-[var(--card-border)]">
                  <Users className="w-3.5 h-3.5 text-[var(--gold-text)]" />
                  <strong className="text-[var(--fg)]">{attendeeCount}</strong> going
                  {hasCapacity && (
                    <span
                      className={`ml-1 text-[11px] font-semibold ${
                        isFull && !waitlistEnabled ? 'text-rose-400' : 'text-[var(--gold-text)]'
                      }`}
                    >
                      ·{' '}
                      {isFull
                        ? waitlistEnabled
                          ? waitlistCount > 0
                            ? `Full · ${waitlistCount} on waitlist`
                            : 'Full · Waitlist open'
                          : 'Full'
                        : `${spotsLeft} ${spotsLeft === 1 ? 'spot' : 'spots'} left`}
                    </span>
                  )}
                </span>

                {/* Add to Calendar */}
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

              {/* Right Side Controls */}
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
                {isAuthor && (
                  <button
                    onClick={e => openDeleteDialog(detailedItem, e)}
                    className="kw-btn text-xs py-2 px-3 rounded-lg border border-[var(--card-border)] hover:border-rose-500/40 text-rose-400 flex items-center gap-1"
                    data-testid="author-delete-event"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete event
                  </button>
                )}
                {deleteTarget && (
                  <div
                    className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="delete-event-title"
                    onClick={e => {
                      if (e.target === e.currentTarget) closeDeleteDialog();
                    }}
                  >
                    <div ref={deleteDialogRef} tabIndex={-1} className="kw-card max-w-sm w-full p-6 space-y-4 border-rose-500/40 animate-in fade-in zoom-in-95 duration-150 outline-none">
                      <h3 id="delete-event-title" className="font-bold text-sm text-[var(--fg)]">
                        Delete "{deleteTarget.title}"?
                      </h3>
                      <p className="text-xs text-[var(--fg-muted)]" data-testid="delete-event-message">
                        {deleteConfirmMessage(deleteTarget.attendee_count)}
                      </p>
                      <p className="text-xs text-[var(--fg-subtle)]">This cannot be undone.</p>
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={closeDeleteDialog}
                          className="kw-btn kw-btn-ghost text-xs py-2 px-3.5 border border-[var(--card-border)]"
                        >
                          Keep event
                        </button>
                        <button
                          type="button"
                          onClick={handleAuthorDelete}
                          disabled={deleting}
                          className="kw-btn text-xs py-2 px-3.5 rounded-lg font-bold bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60"
                          data-testid="confirm-delete-event"
                        >
                          {deleting ? 'Deleting…' : deleteArmed ? 'Tap again to delete' : 'Delete event'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Report Event Link */}
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

        {/* "People to meet here" Section */}
        {isEvent && currentProfile && isAttending && isWithinMeetingWindow(detailedItem) && (
          <div className="kw-card p-6 space-y-4 border-[var(--gold)]/30" data-testid="people-to-meet-section">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[var(--card-border)]">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-[var(--gold-text)]" />
                <h2 className="text-base font-bold text-[var(--fg)] tracking-tight">People to meet here</h2>
              </div>

              {/* Opt-in / Opt-out toggle */}
              <label className="inline-flex items-center gap-2 text-xs font-medium text-[var(--fg-muted)] cursor-pointer hover:text-[var(--fg)]">
                <input
                  type="checkbox"
                  checked={!detailedItem.match_optout_ids?.includes(currentProfile.id)}
                  onChange={async (e) => {
                    const optIn = e.target.checked;
                    try {
                      await toggleEventMatchOptIn(detailedItem.id, optIn);
                      setDetailedItem((prev: any) => {
                        if (!prev) return prev;
                        const optoutIds = Array.isArray(prev.match_optout_ids) ? [...prev.match_optout_ids] : [];
                        if (optIn) {
                          const idx = optoutIds.indexOf(currentProfile.id);
                          if (idx >= 0) optoutIds.splice(idx, 1);
                        } else {
                          if (!optoutIds.includes(currentProfile.id)) optoutIds.push(currentProfile.id);
                        }
                        return { ...prev, match_optout_ids: optoutIds };
                      });
                      onToast(optIn ? "Shown in 'People to meet'" : "Hidden from 'People to meet'");
                      loadPeopleToMeet(detailedItem.id);
                    } catch (err: any) {
                      onToast(err?.message || 'Failed to update preference');
                    }
                  }}
                  className="rounded border-[var(--card-border)] text-[var(--gold)] focus:ring-[var(--gold)] cursor-pointer"
                />
                <span>Show me in 'People to meet' for this event</span>
              </label>
            </div>

            {peopleToMeetLoading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-pulse">
                {[1, 2].map(i => (
                  <div key={i} className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--card-border)] h-32 space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[var(--card-border)]" />
                      <div className="space-y-1.5 flex-1">
                        <div className="h-3.5 w-1/2 bg-[var(--card-border)] rounded" />
                        <div className="h-3 w-1/3 bg-[var(--card-border)] rounded" />
                      </div>
                    </div>
                    <div className="h-3 w-3/4 bg-[var(--card-border)] rounded" />
                  </div>
                ))}
              </div>
            ) : isAuthor || currentProfile?.is_admin ? (
              <div className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--card-border)] text-xs text-[var(--fg-muted)] font-medium">
                <span>{peopleToMeetMessage || `${peopleToMeetOptedInCount} attendees opted into matching`}</span>
              </div>
            ) : peopleToMeetList.length === 0 ? (
              <div className="p-6 text-center rounded-xl bg-[var(--bg)] border border-[var(--card-border)] space-y-2">
                <p className="text-xs text-[var(--fg-muted)]">
                  {peopleToMeetMessage || 'Matches appear when more people RSVP.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {peopleToMeetList.map(person => (
                  <div key={person.id} className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--card-border)] flex flex-col justify-between space-y-3">
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <Avatar profile={person} size="md" />
                          <div>
                            <h3 className="text-xs font-bold text-[var(--fg)]">
                              <button
                                type="button"
                                onClick={() => onViewProfile(person.id)}
                                className={`hover:text-[var(--gold-text)] transition-colors cursor-pointer text-left rounded ${FOCUS_RING}`}
                              >
                                {person.name}
                              </button>
                            </h3>
                            <p className="text-[11px] text-[var(--fg-subtle)] capitalize">{person.role || 'Member'}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            aria-label="Thumbs up"
                            onClick={() => handleMatchFeedback(detailedItem.id, person.id, 1)}
                            className="p-1.5 rounded-lg text-[var(--fg-muted)] hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors cursor-pointer"
                          >
                            <ThumbsUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label="Thumbs down"
                            onClick={() => handleMatchFeedback(detailedItem.id, person.id, -1)}
                            className="p-1.5 rounded-lg text-[var(--fg-muted)] hover:text-rose-400 hover:bg-rose-500/10 transition-colors cursor-pointer"
                          >
                            <ThumbsDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <p className="text-xs text-[var(--fg-muted)] leading-relaxed bg-[var(--card)] p-2.5 rounded-lg border border-[var(--card-border)]">
                        {person.reason}
                      </p>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--card-border)]/60 text-xs">
                      <button
                        type="button"
                        onClick={() => onViewProfile(person.id)}
                        className="text-[var(--gold-text)] font-semibold hover:underline cursor-pointer"
                      >
                        View profile
                      </button>

                      <button
                        type="button"
                        onClick={() => handleConnectPerson(person)}
                        className="kw-btn kw-btn-gold px-3 py-1 text-xs font-bold rounded-lg inline-flex items-center gap-1 cursor-pointer"
                      >
                        Connect
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Questions Section */}
        <div className="kw-card p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
            <h3 className="font-bold text-sm text-[var(--fg)] flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[var(--gold-text)]" />
              Questions
            </h3>
            <span className="text-xs text-[var(--fg-muted)]">{questions.length}</span>
          </div>

          {/* Question form for signed-in members */}
          {currentProfile && currentProfile.name && currentProfile.headline ? (
            (!isCancelled && !isPast) ? (
              <form onSubmit={handleAskQuestion} className="space-y-2">
                <textarea
                  value={newQuestion}
                  aria-label="Your question for the host"
                  onChange={e => setNewQuestion(e.target.value)}
                  placeholder="Ask the host anything about this event..."
                  rows={3}
                  maxLength={500}
                  className="kw-textarea text-xs"
                />
                <div className="flex items-center justify-between">
                  <span className="text-[13px] text-[var(--fg-subtle)]">
                    {newQuestion.length}/500 characters
                  </span>
                  <button
                    type="submit"
                    disabled={submittingQuestion || newQuestion.trim().length < 3}
                    className="kw-btn kw-btn-gold text-xs py-1.5 px-3 font-bold flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" /> Ask
                  </button>
                </div>
              </form>
            ) : (
              <p className="text-xs text-[var(--fg-muted)] italic">This event is closed for new questions.</p>
            )
          ) : !currentProfile ? (
            <div className="p-3 rounded-lg bg-[var(--bg)] border border-[var(--card-border)] text-xs text-center text-[var(--fg-muted)]">
              <span>Sign in to ask a question</span>
              {onJoinClick && (
                <button
                  type="button"
                  onClick={onJoinClick}
                  className="ml-2 font-bold text-[var(--gold-text)] hover:underline cursor-pointer"
                >
                  Sign in
                </button>
              )}
            </div>
          ) : null}

          {/* Questions List */}
          {questions.length === 0 ? (
            <p className="text-xs text-[var(--fg-muted)] italic text-center py-4">
              No questions yet. Ask the host anything about this event.
            </p>
          ) : (
            <div className="space-y-4 pt-2">
              {questions.map(q => {
                const askerId = q.asker_id || q.author_id;
                const askerName = q.asker_name || q.author_name || 'Member';
                const questionText = q.question_text || q.content || '';
                const replyText = q.reply_text || q.reply?.content || '';
                const replierName = q.replier_name || q.reply?.author_name || 'Host';
                const repliedByAdmin = Boolean(q.replied_by_admin);

                const canDelete = Boolean(
                  (currentProfile && (askerId === currentProfile.id || askerId === currentProfile.account_uid)) ||
                  isAuthor ||
                  currentProfile?.is_admin
                );
                const canReply = Boolean((isAuthor || currentProfile?.is_admin) && !replyText);

                return (
                  <div key={q.id} className="p-3.5 rounded-xl bg-[var(--bg)] border border-[var(--card-border)] space-y-2">
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="font-bold text-[var(--fg)]">{askerName}</span>
                      <span className="text-[var(--fg-subtle)]">
                        {q.created_at ? new Date(q.created_at).toLocaleDateString() : ''}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--fg)] whitespace-pre-wrap">{questionText}</p>

                    {replyText && (
                      <div className="ml-4 pl-3 border-l-2 border-[var(--gold)]/50 pt-1 space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-[var(--fg)]">{replierName}</span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-bold uppercase bg-[var(--gold)]/20 text-[var(--gold-text)]">
                            {repliedByAdmin ? 'Moderator' : 'Host'}
                          </span>
                        </div>
                        <p className="text-xs text-[var(--fg-muted)] whitespace-pre-wrap">{replyText}</p>
                      </div>
                    )}

                    <div className="flex items-center gap-3 pt-1 text-[13px]">
                      {canReply && (
                        <button
                          type="button"
                          onClick={() => {
                            setReplyingQid(replyingQid === q.id ? null : q.id);
                            setReplyContent('');
                          }}
                          className="text-[var(--gold-text)] hover:underline font-semibold cursor-pointer"
                        >
                          Reply
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => handleDeleteQuestion(q.id)}
                          className="text-rose-400 hover:underline font-semibold cursor-pointer"
                        >
                          Delete
                        </button>
                      )}
                    </div>

                    {replyingQid === q.id && (
                      <form onSubmit={e => handleReplyQuestion(q.id, e)} className="mt-2 space-y-2 pl-4 border-l-2 border-[var(--gold)]">
                        <textarea
                          value={replyContent}
                          aria-label="Your reply"
                          onChange={e => setReplyContent(e.target.value)}
                          placeholder="Write a response..."
                          rows={2}
                          className="kw-textarea text-xs"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            type="submit"
                            disabled={submittingReply || !replyContent.trim()}
                            className="kw-btn kw-btn-gold text-xs py-1 px-3 font-bold"
                          >
                            {submittingReply ? 'Sending...' : 'Send reply'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setReplyingQid(null)}
                            className="kw-btn text-xs py-1 px-2 border border-[var(--card-border)]"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Host & Admin Attendees Panel (Members + Guest registrations, Check-in Tabs & Live Counter) */}
        {canManageAttendees && showAttendeesPanel && (
          <div className="kw-card p-6 space-y-4 border-[var(--gold)]/30">
            {(() => {
              const memberRows = attendees.map((m: any) => ({
                id: m.id,
                name: m.name || 'Member',
                avatar: m.avatar,
                type: 'Member' as const,
                kind: 'member' as const,
                email: undefined,
                registered_at: m.registered_at || detailedItem.created_at || '',
                checked_in_at: m.checked_in_at || null,
                checkin_method: m.checkin_method || null
              }));
              const guestRows = combinedGuests.map((g: any) => ({
                id: g.id,
                name: g.name || 'Guest',
                avatar: undefined,
                type: 'Guest' as const,
                kind: 'guest' as const,
                email: canManageAttendees ? g.email : undefined,
                registered_at: g.registered_at || g.created_at || '',
                checked_in_at: g.checked_in_at || null,
                checkin_method: g.checkin_method || null
              }));

              type AttendeeRowItem = {
                id: string;
                name: string;
                avatar?: string;
                type: 'Member' | 'Guest';
                kind: 'member' | 'guest';
                email?: string;
                registered_at: string;
                checked_in_at: string | null;
                checkin_method: string | null;
              };

              const allRows: AttendeeRowItem[] = [...memberRows, ...guestRows];
              const checkedInRows = allRows.filter(r => Boolean(r.checked_in_at));
              const notYetRows = allRows.filter(r => !r.checked_in_at);

              let rows: AttendeeRowItem[] =
                attendeeTab === 'checked_in'
                  ? checkedInRows
                  : attendeeTab === 'not_yet'
                  ? notYetRows
                  : attendeeTab === 'members'
                  ? memberRows
                  : attendeeTab === 'guests'
                  ? guestRows
                  : allRows;

              const q = attendeeSearch.trim().toLowerCase();
              if (q) {
                rows = rows.filter((r: AttendeeRowItem) => r.name.toLowerCase().includes(q));
              }

              return (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--card-border)] pb-3">
                    <div>
                      <h3 className="font-bold text-sm text-[var(--fg)] flex items-center gap-2">
                        <Users className="w-4 h-4 text-[var(--gold-text)]" />
                        <span>{`Attendees (${allRows.length})`}</span>
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                          {`${checkedInRows.length} / ${allRows.length} checked in`}
                        </span>
                      </h3>
                      <p className="text-[11px] text-[var(--fg-muted)] mt-0.5">
                        {`Members (${attendees.length}) & Guest registrations (${combinedGuests.length})`}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleExportAttendeesCsv(detailedItem.id)}
                        disabled={exportingCsv}
                        className="kw-btn text-xs py-1.5 px-3 rounded-lg border border-[var(--card-border)] hover:border-[var(--gold)] flex items-center gap-1.5 font-semibold cursor-pointer"
                      >
                        <Download className="w-3.5 h-3.5 text-[var(--gold-text)]" />
                        <span>{exportingCsv ? 'Exporting...' : 'Export CSV'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Tabs & Search Box */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="inline-flex flex-wrap rounded-lg border border-[var(--card-border)] bg-[var(--bg)] p-0.5">
                      {(
                        [
                          { key: 'all', label: `All (${allRows.length})` },
                          { key: 'checked_in', label: `Checked in (${checkedInRows.length})` },
                          { key: 'not_yet', label: `Not yet (${notYetRows.length})` },
                          { key: 'members', label: `Members (${attendees.length})` },
                          { key: 'guests', label: `Guests (${combinedGuests.length})` }
                        ] as const
                      ).map(t => (
                        <button
                          key={t.key}
                          type="button"
                          onClick={() => setAttendeeTab(t.key)}
                          className={`px-3 py-1 text-xs font-medium rounded-md transition-all cursor-pointer ${
                            attendeeTab === t.key
                              ? 'bg-[var(--gold)] text-[#090D16] font-bold'
                              : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>

                    <div className="relative flex-1 sm:max-w-xs">
                      <Search className="w-3.5 h-3.5 text-[var(--fg-subtle)] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="search"
                        value={attendeeSearch}
                        onChange={e => setAttendeeSearch(e.target.value)}
                        placeholder="Search attendees by name..."
                        aria-label="Search attendees by name"
                        className="kw-input text-xs pl-9 py-1.5 w-full"
                      />
                    </div>
                  </div>

                  {rows.length === 0 ? (
                    <p className="text-xs text-[var(--fg-muted)] italic py-2">
                      No attendees match your filter.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {rows.map((row: AttendeeRowItem) => (
                        <div
                          key={`${row.type}-${row.id}`}
                          onClick={row.type === 'Member' ? () => onViewProfile(row.id) : undefined}
                          className={`p-3 rounded-xl bg-[var(--bg)] border border-[var(--card-border)] flex flex-wrap items-center justify-between gap-3 text-xs ${
                            row.type === 'Member' ? 'hover:border-[var(--gold)] cursor-pointer transition-colors' : ''
                          }`}
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <Avatar profile={{ id: row.id, name: row.name, avatar: row.avatar }} size="sm" />
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex flex-wrap items-center gap-2">
                                {row.type === 'Member' ? (
                                  <button
                                    type="button"
                                    onClick={e => {
                                      e.stopPropagation();
                                      onViewProfile(row.id);
                                    }}
                                    className={`font-bold text-[var(--fg)] truncate text-left hover:text-[var(--gold-text)] rounded ${FOCUS_RING}`}
                                  >
                                    {row.name}
                                  </button>
                                ) : (
                                  <span className="font-bold text-[var(--fg)] truncate">{row.name}</span>
                                )}
                                <span
                                  className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                    row.type === 'Member'
                                      ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                      : 'bg-amber-500/15 text-[var(--gold-text)] border border-amber-500/30'
                                  }`}
                                >
                                  {row.type}
                                </span>
                                {row.checked_in_at && (
                                  <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                    Checked in · {new Date(row.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    {row.checkin_method ? ` (${row.checkin_method})` : ''}
                                  </span>
                                )}
                              </div>
                              {row.type === 'Guest' && canManageAttendees && row.email && (
                                <p className="text-[12px] text-[var(--gold-text)] truncate">{row.email}</p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {!row.checked_in_at && canManageAttendees && (
                              <button
                                type="button"
                                onClick={e => {
                                  e.stopPropagation();
                                  handleHostManualCheckin(row.kind, row.id);
                                }}
                                className="kw-btn text-[11px] py-1 px-2.5 rounded-lg border border-[var(--gold)]/50 text-[var(--gold-text)] hover:bg-amber-500/15 font-bold cursor-pointer"
                              >
                                Check in
                              </button>
                            )}
                            <span className="text-[11px] text-[var(--fg-subtle)]">
                              {row.registered_at ? new Date(row.registered_at).toLocaleDateString() : ''}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Host / Admin Waitlist Section */}
                  {waitlistEntries.length > 0 && (
                    <div className="pt-4 border-t border-[var(--card-border)] space-y-3" data-testid="host-waitlist-section">
                      <div className="flex items-center justify-between">
                        <h4 className="font-bold text-xs text-[var(--fg)] flex items-center gap-2">
                          <Clock className="w-3.5 h-3.5 text-amber-400" />
                          <span>{`Waitlist (${waitlistEntries.length})`}</span>
                        </h4>
                        <span className="text-[11px] text-[var(--fg-muted)]">
                          Promoted automatically in FIFO order when a spot opens
                        </span>
                      </div>
                      <div className="space-y-2">
                        {waitlistEntries.map((w: any, idx: number) => (
                          <div
                            key={`wl-${w.kind}-${w.id}`}
                            className="p-3 rounded-xl bg-[var(--bg)] border border-amber-500/30 flex flex-wrap items-center justify-between gap-3 text-xs"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="px-2 py-0.5 rounded-md font-mono font-bold text-[11px] bg-amber-500/15 text-amber-300 border border-amber-500/30">
                                #{w.position || idx + 1}
                              </span>
                              <Avatar profile={{ id: w.id, name: w.name, avatar: w.avatar }} size="sm" />
                              <div className="min-w-0 space-y-0.5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="font-bold text-[var(--fg)] truncate">{w.name}</span>
                                  <span
                                    className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                                      w.kind === 'member'
                                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                                        : 'bg-amber-500/15 text-[var(--gold-text)] border border-amber-500/30'
                                    }`}
                                  >
                                    {w.kind === 'member' ? 'Member' : 'Guest'}
                                  </span>
                                </div>
                                {w.kind === 'guest' && w.email && (
                                  <p className="text-[12px] text-[var(--gold-text)] truncate">{w.email}</p>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleRemoveEntry(w.kind, w.id, w.name)}
                                className="kw-btn text-[11px] py-1 px-2 rounded-lg border border-rose-500/40 text-rose-400 hover:bg-rose-500/10 font-semibold cursor-pointer"
                              >
                                Remove
                              </button>
                              <span className="text-[11px] text-[var(--fg-subtle)]">
                                {w.created_at ? new Date(w.created_at).toLocaleDateString() : ''}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}

        {/* Who's Going Section with Plural Copy Fix */}
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
                Be the first to register.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {attendees.map((att: any) => (
                  <div
                    key={att.id}
                    {...activateProps(() => onViewProfile(att.id))}
                    aria-label={`View ${att.name}'s profile`}
                    className={`flex items-center gap-2.5 p-2.5 rounded-lg bg-[var(--bg)] border border-[var(--card-border)] hover:border-[var(--gold)] transition-colors cursor-pointer ${FOCUS_RING}`}
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
          <div className="p-4 rounded-xl kw-card text-xs text-[var(--fg-muted)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
            <span>
              {attendeeCount === 0
                ? 'Be the first to register.'
                : attendeeCount === 1
                ? '1 person is going to this event.'
                : `${attendeeCount} people are going to this event.`}
            </span>
            <button
              onClick={onJoinClick}
              className="kw-btn kw-btn-gold text-xs py-1.5 px-3 font-semibold cursor-pointer shrink-0"
            >
              Sign in to see attendees
            </button>
          </div>
        )}

        {/* MODALS RENDERED DIRECTLY INSIDE DETAIL VIEW RETURN */}
        <GuestRegisterModal
          isOpen={isGuestModalOpen}
          onClose={() => setIsGuestModalOpen(false)}
          eventId={selectedItemId}
          isWaitlist={Boolean(isFull && waitlistEnabled)}
          onSuccess={handleGuestSuccess}
          onToast={onToast}
          onJoinClick={onJoinClick}
          triggerRef={registerBtnRef}
        />

        {/* EDIT MODAL */}
        {isEditModalOpen && editingItem && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="edit-event-dialog-title">
            <div ref={editDialogRef} tabIndex={-1} className="kw-card max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto border-[var(--gold)]/40 animate-in fade-in zoom-in-95 duration-150 outline-none">
              <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
                <h3 id="edit-event-dialog-title" className="font-bold text-sm text-[var(--fg)]">Edit Event Details</h3>
                <button
                  onClick={() => setIsEditModalOpen(false)}
                  aria-label="Close"
                  className="p-1 text-[var(--fg-muted)] hover:text-[var(--fg)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form noValidate onSubmit={handleEditSubmit} className="space-y-4 text-xs">
                <div>
                  <label htmlFor="edit-title" className="font-semibold text-[var(--fg)] block mb-1">Title *</label>
                  <input
                    id="edit-title"
                    type="text"
                    value={formTitle}
                    onChange={e => {
                      setFormTitle(e.target.value);
                      if (editErrors.title) setEditErrors(prev => ({ ...prev, title: '' }));
                    }}
                    maxLength={Math.max(EVENT_TITLE_MAX, String(editingItem?.title || '').length)}
                    aria-invalid={Boolean(editErrors.title)}
                    aria-describedby={editErrors.title ? "edit-title-error" : undefined}
                    className={`kw-input text-xs ${editErrors.title ? 'border-rose-500 focus:border-rose-500' : ''}`}
                  />
                  {editErrors.title && (
                    <p id="edit-title-error" className="text-rose-400 text-[11px] mt-1 font-medium" role="alert">
                      {editErrors.title}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="edit-description" className="font-semibold text-[var(--fg)] block mb-1">Description *</label>
                  <textarea
                    id="edit-description"
                    value={formDescription}
                    onChange={e => {
                      setFormDescription(e.target.value);
                      if (editErrors.description) setEditErrors(prev => ({ ...prev, description: '' }));
                    }}
                    rows={3}
                    aria-invalid={Boolean(editErrors.description)}
                    aria-describedby={editErrors.description ? "edit-description-error" : undefined}
                    className={`kw-textarea text-xs ${editErrors.description ? 'border-rose-500 focus:border-rose-500' : ''}`}
                  />
                  {editErrors.description && (
                    <p id="edit-description-error" className="text-rose-400 text-[11px] mt-1 font-medium" role="alert">
                      {editErrors.description}
                    </p>
                  )}
                </div>

                {editingItem.kind === 'event' && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="edit-start_date" className="font-semibold text-[var(--fg)] block mb-1">Start Date</label>
                        <input
                          id="edit-start_date"
                          type="date"
                          value={formStartDate}
                          onChange={e => {
                            setFormStartDate(e.target.value);
                            if (editErrors.start_date) setEditErrors(prev => ({ ...prev, start_date: '' }));
                          }}
                          aria-invalid={Boolean(editErrors.start_date)}
                          aria-describedby={editErrors.start_date ? "edit-start_date-error" : undefined}
                          className={`kw-input text-xs ${editErrors.start_date ? 'border-rose-500 focus:border-rose-500' : ''}`}
                        />
                        {editErrors.start_date && (
                          <p id="edit-start_date-error" className="text-rose-400 text-[11px] mt-1 font-medium" role="alert">
                            {editErrors.start_date}
                          </p>
                        )}
                      </div>
                      <div>
                        <label htmlFor="edit-start_time" className="font-semibold text-[var(--fg)] block mb-1">Start Time</label>
                        <input
                          id="edit-start_time"
                          type="time"
                          value={formStartTime}
                          onChange={e => {
                            setFormStartTime(e.target.value);
                            if (editErrors.start_time) setEditErrors(prev => ({ ...prev, start_time: '' }));
                          }}
                          aria-invalid={Boolean(editErrors.start_time)}
                          aria-describedby={editErrors.start_time ? "edit-start_time-error" : undefined}
                          className={`kw-input text-xs ${editErrors.start_time ? 'border-rose-500 focus:border-rose-500' : ''}`}
                        />
                        {editErrors.start_time && (
                          <p id="edit-start_time-error" className="text-rose-400 text-[11px] mt-1 font-medium" role="alert">
                            {editErrors.start_time}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="edit-end_date" className="font-semibold text-[var(--fg)] block mb-1">End Date</label>
                        <input
                          id="edit-end_date"
                          type="date"
                          value={formEndDate}
                          onChange={e => {
                            setFormEndDate(e.target.value);
                            if (editErrors.end_date) setEditErrors(prev => ({ ...prev, end_date: '' }));
                          }}
                          aria-invalid={Boolean(editErrors.end_date)}
                          aria-describedby={editErrors.end_date ? "edit-end_date-error" : undefined}
                          className={`kw-input text-xs ${editErrors.end_date ? 'border-rose-500 focus:border-rose-500' : ''}`}
                        />
                        {editErrors.end_date && (
                          <p id="edit-end_date-error" className="text-rose-400 text-[11px] mt-1 font-medium" role="alert">
                            {editErrors.end_date}
                          </p>
                        )}
                      </div>
                      <div>
                        <label htmlFor="edit-end_time" className="font-semibold text-[var(--fg)] block mb-1">End Time</label>
                        <input
                          id="edit-end_time"
                          type="time"
                          value={formEndTime}
                          onChange={e => setFormEndTime(e.target.value)}
                          className="kw-input text-xs"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="edit-timezone" className="font-semibold text-[var(--fg)] block mb-1">Timezone</label>
                      <input
                        id="edit-timezone"
                        type="text"
                        value={formTimezone}
                        onChange={e => setFormTimezone(e.target.value)}
                        className="kw-input text-xs"
                      />
                    </div>

                    {(formFormat === 'in_person' || formFormat === 'hybrid') && (
                      <>
                        <div>
                          <label htmlFor="edit-venue" className="font-semibold text-[var(--fg)] block mb-1">Venue / address *</label>
                          <input
                            id="edit-venue"
                            type="text"
                            value={formLocation}
                            onChange={e => {
                              setFormLocation(e.target.value);
                              if (editErrors.venue) setEditErrors(prev => ({ ...prev, venue: '' }));
                            }}
                            placeholder="Venue name and street address (min 5 chars)"
                            aria-invalid={Boolean(editErrors.venue)}
                            aria-describedby={editErrors.venue ? "edit-venue-error" : undefined}
                            className={`kw-input text-xs ${editErrors.venue ? 'border-rose-500 focus:border-rose-500' : ''}`}
                          />
                          {editErrors.venue && (
                            <p id="edit-venue-error" className="text-rose-400 text-xs mt-1 font-medium" role="alert">
                              {editErrors.venue}
                            </p>
                          )}
                        </div>

                        <div>
                          <label htmlFor="edit-map_link" className="font-semibold text-[var(--fg)] block mb-1">Map link (optional)</label>
                          <input
                            id="edit-map_link"
                            type="text"
                            value={formMapLink}
                            onChange={e => {
                              setFormMapLink(e.target.value);
                              if (editErrors.map_link) setEditErrors(prev => ({ ...prev, map_link: '' }));
                            }}
                            placeholder="https://maps.google.com/... or https://www.openstreetmap.org/..."
                            aria-invalid={Boolean(editErrors.map_link)}
                            aria-describedby={editErrors.map_link ? "edit-map_link-error" : undefined}
                            className={`kw-input text-xs ${editErrors.map_link ? 'border-rose-500 focus:border-rose-500' : ''}`}
                          />
                          {editErrors.map_link && (
                            <p id="edit-map_link-error" className="text-rose-400 text-xs mt-1 font-medium" role="alert">
                              {editErrors.map_link}
                            </p>
                          )}
                        </div>
                      </>
                    )}

                    {(formFormat === 'online' || formFormat === 'hybrid') && (
                      <div>
                        <label htmlFor="edit-join_link" className="font-semibold text-[var(--fg)] block mb-1">Join link (https://)</label>
                        <input
                          id="edit-join_link"
                          type="text"
                          value={formJoinLink}
                          onChange={e => {
                            setFormJoinLink(e.target.value);
                            if (editErrors.join_link) setEditErrors(prev => ({ ...prev, join_link: '' }));
                          }}
                          aria-invalid={Boolean(editErrors.join_link)}
                          aria-describedby={editErrors.join_link ? "edit-join_link-error" : undefined}
                          className={`kw-input text-xs ${editErrors.join_link ? 'border-rose-500 focus:border-rose-500' : ''}`}
                        />
                        {editErrors.join_link && (
                          <p id="edit-join_link-error" className="text-rose-400 text-xs mt-1 font-medium" role="alert">
                            {editErrors.join_link}
                          </p>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="edit-capacity" className="font-semibold text-[var(--fg)] block mb-1">Capacity (optional)</label>
                        <input
                          id="edit-capacity"
                          type="number"
                          min={1}
                          max={5000}
                          value={formCapacity}
                          onChange={e => {
                            setFormCapacity(e.target.value);
                            if (editErrors.capacity) setEditErrors(prev => ({ ...prev, capacity: '' }));
                          }}
                          placeholder="Unlimited (1–5000)"
                          aria-invalid={Boolean(editErrors.capacity)}
                          aria-describedby={editErrors.capacity ? "edit-capacity-error" : undefined}
                          className={`kw-input text-xs ${editErrors.capacity ? 'border-rose-500 focus:border-rose-500' : ''}`}
                        />
                        {editErrors.capacity && (
                          <p id="edit-capacity-error" className="text-rose-400 text-xs mt-1 font-medium" role="alert">
                            {editErrors.capacity}
                          </p>
                        )}
                      </div>
                      <div>
                        <label htmlFor="ev-tags-optional-up-to-5-1" className="font-semibold text-[var(--fg)] block mb-1">Tags (optional, up to 5)</label>
                        <input
                          id="ev-tags-optional-up-to-5-1"
                          type="text"
                          value={formTagsInput}
                          onChange={e => setFormTagsInput(e.target.value)}
                          placeholder="ai, flutter, kampala"
                          className="kw-input text-xs"
                        />
                      </div>
                    </div>

                    <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--fg)] pt-1">
                      <input
                        type="checkbox"
                        checked={formWaitlistEnabled}
                        onChange={e => setFormWaitlistEnabled(e.target.checked)}
                      />
                      <span className="font-semibold">Enable waitlist when full</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--fg)] pt-1">
                      <input
                        type="checkbox"
                        checked={formSelfCheckin}
                        onChange={e => setFormSelfCheckin(e.target.checked)}
                      />
                      <span className="font-semibold">Allow self check-in (venue rotating QR code)</span>
                    </label>

                    {/* Contact for attendees */}
                    <div className="space-y-3 pt-2 border-t border-[var(--card-border)]">
                      <div>
                        <h4 className="font-bold text-xs text-[var(--fg)]">Contact for attendees (optional)</h4>
                        <p className="text-[13px] text-[var(--fg-muted)]">Only people registered for this event can see this.</p>
                      </div>
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label htmlFor="edit-contact_phone" className="font-semibold text-[var(--fg)]">WhatsApp or phone</label>
                          {currentProfile?.whatsapp && (
                            <button
                              type="button"
                              onClick={() => setFormContactPhone(currentProfile.whatsapp || '')}
                              className="text-[13px] text-[var(--gold-text)] hover:underline cursor-pointer"
                            >
                              Use my profile WhatsApp
                            </button>
                          )}
                        </div>
                        <input
                          id="edit-contact_phone"
                          type="tel"
                          value={formContactPhone}
                          onChange={e => {
                            setFormContactPhone(e.target.value);
                            if (editErrors.contact_phone) setEditErrors(prev => ({ ...prev, contact_phone: '' }));
                          }}
                          placeholder="+256700000000"
                          aria-invalid={Boolean(editErrors.contact_phone)}
                          aria-describedby={editErrors.contact_phone ? "edit-contact_phone-error" : undefined}
                          className={`kw-input text-xs ${editErrors.contact_phone ? 'border-rose-500 focus:border-rose-500' : ''}`}
                        />
                        {editErrors.contact_phone && (
                          <p id="edit-contact_phone-error" className="text-rose-400 text-xs mt-1 font-medium" role="alert">
                            {editErrors.contact_phone}
                          </p>
                        )}
                      </div>
                      <div>
                        <label htmlFor="edit-contact_email" className="font-semibold text-[var(--fg)] block mb-1">Email</label>
                        <input
                          id="edit-contact_email"
                          type="email"
                          value={formContactEmail}
                          onChange={e => {
                            setFormContactEmail(e.target.value);
                            if (editErrors.contact_email) setEditErrors(prev => ({ ...prev, contact_email: '' }));
                          }}
                          placeholder="host@example.com"
                          aria-invalid={Boolean(editErrors.contact_email)}
                          aria-describedby={editErrors.contact_email ? "edit-contact_email-error" : undefined}
                          className={`kw-input text-xs ${editErrors.contact_email ? 'border-rose-500 focus:border-rose-500' : ''}`}
                        />
                        {editErrors.contact_email && (
                          <p id="edit-contact_email-error" className="text-rose-400 text-xs mt-1 font-medium" role="alert">
                            {editErrors.contact_email}
                          </p>
                        )}
                      </div>
                    </div>

                    <CoverImageUploader
                      value={formCoverImage}
                      onChange={setFormCoverImage}
                      title={formTitle}
                    />
                  </>
                )}

                <div className="sticky bottom-0 z-10 -mx-6 -mb-6 px-6 pt-3 pb-4 flex items-center gap-2 border-t border-[var(--card-border)] bg-[var(--card)]">
                  <button
                    type="submit"
                    disabled={formSubmitting}
                    className="kw-btn kw-btn-gold text-xs py-2 px-4 font-bold flex-1 cursor-pointer disabled:opacity-50"
                  >
                    {formSubmitting ? 'Saving…' : 'Save Changes'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditModalOpen(false)}
                    className="kw-btn text-xs py-2 px-3 border border-[var(--card-border)] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {rsvpCancelDialog}

        {/* REPORT MODAL */}
        {isReportModalOpen && reportingItem && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="report-event-dialog-title">
            <div ref={reportDialogRef} tabIndex={-1} className="kw-card max-w-md w-full p-6 space-y-4 border-rose-500/40 animate-in fade-in zoom-in-95 duration-150 outline-none">
              <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
                <div className="flex items-center gap-2 text-rose-400">
                  <Flag className="w-4 h-4" />
                  <h3 id="report-event-dialog-title" className="font-bold text-sm text-[var(--fg)]">Report Event</h3>
                </div>
                <button
                  onClick={() => setIsReportModalOpen(false)}
                  aria-label="Close"
                  className="p-1 text-[var(--fg-muted)] hover:text-[var(--fg)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <p className="text-xs text-[var(--fg-muted)]">
                Help keep Kwegatta safe and genuine. Reports are strictly confidential and reviewed by community administrators.
              </p>

              <form onSubmit={handleReportSubmit} className="space-y-4 text-xs">
                <div>
                  <label htmlFor="ev-reason-1" className="font-semibold text-[var(--fg)] block mb-1">Reason *</label>
                  <select
                    id="ev-reason-1"
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
                  <label htmlFor="ev-optional-note-1" className="font-semibold text-[var(--fg)] block mb-1">Optional Note</label>
                  <textarea
                    id="ev-optional-note-1"
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
                    className="kw-btn kw-btn-danger text-xs py-2 px-4 font-bold flex-1 cursor-pointer"
                  >
                    {submittingReport ? 'Submitting...' : 'Submit Report'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsReportModalOpen(false)}
                    className="kw-btn text-xs py-2 px-3 border border-[var(--card-border)] cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* PERSONAL TICKET MODAL */}
        {isTicketModalOpen && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="ticket-dialog-title">
            <div ref={ticketDialogRef} tabIndex={-1} className="kw-card max-w-sm w-full p-6 space-y-4 text-center border-[var(--gold)]/40 outline-none">
              <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
                <h3 id="ticket-dialog-title" className="font-bold text-sm text-[var(--fg)] flex items-center gap-1.5">
                  <QrCode className="w-4 h-4 text-[var(--gold-text)]" />
                  <span>Personal Event Ticket</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsTicketModalOpen(false)}
                  aria-label="Close"
                  className="p-1 text-[var(--fg-muted)] hover:text-[var(--fg)] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-1">
                <p className="font-bold text-sm text-[var(--fg)]">{detailedItem.title}</p>
                <p className="text-xs text-[var(--fg-muted)]">{timeFormatted.display}</p>
              </div>

              {loadingTicket ? (
                <p className="text-xs text-[var(--fg-muted)] py-8">Loading ticket...</p>
              ) : (
                <div className="space-y-3">
                  {ticketQrDataUrl && (
                    <div className="mx-auto w-52 h-52 p-3 rounded-xl bg-white grid place-items-center">
                      <img src={ticketQrDataUrl} alt="Event Ticket QR" className="w-full h-full object-contain" />
                    </div>
                  )}
                  {ticketCode && (
                    <div className="space-y-2">
                      <div
                        data-testid="my-ticket-formatted-code"
                        className="p-3 rounded-lg bg-[var(--bg)] border border-[var(--card-border)] font-mono text-lg font-bold tracking-widest text-[var(--gold-text)] select-all"
                      >
                        {formatTicketCode(ticketCode)}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const formatted = formatTicketCode(ticketCode);
                          navigator.clipboard?.writeText(formatted).catch(() => {});
                          onToast('Ticket code copied!');
                        }}
                        className="kw-btn kw-btn-ghost text-xs py-1.5 px-3 rounded-lg border border-[var(--card-border)] inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5 text-[var(--gold-text)]" />
                        <span>Copy code</span>
                      </button>
                    </div>
                  )}
                  <p className="text-[11px] text-[var(--fg-subtle)]">
                    Show this QR code to the event host at check-in. Contains no personal data.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ROTATING VENUE QR MODAL (Full-screen) */}
        {isVenueQrOpen && (
          <div ref={venueDialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="venue-qr-dialog-title" className="fixed inset-0 z-50 bg-[#090D16] text-white flex flex-col items-center justify-center p-6 space-y-6 outline-none">
            <button
              type="button"
              onClick={() => setIsVenueQrOpen(false)}
              className="absolute top-6 right-6 kw-btn py-2 px-3 rounded-lg border border-white/20 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <X className="w-4 h-4" />
              <span>Exit full screen</span>
            </button>

            <div className="text-center space-y-2 max-w-lg">
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                Venue Self Check-in
              </span>
              <h2 id="venue-qr-dialog-title" className="text-2xl sm:text-3xl font-bold">{detailedItem.title}</h2>
              <p className="text-sm text-zinc-400">Scan with your phone camera to check in automatically</p>
            </div>

            <div className="p-5 rounded-2xl bg-white shadow-2xl grid place-items-center">
              {venueQrDataUrl ? (
                <img src={venueQrDataUrl} alt="Venue Check-in QR" className="w-64 h-64 sm:w-80 sm:h-80 object-contain" />
              ) : (
                <div className="w-64 h-64 grid place-items-center text-zinc-900 text-xs">Generating QR...</div>
              )}
            </div>

            <div className="flex items-center gap-6 text-sm">
              <span className="px-4 py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-bold">
                {venueCheckedInCount} checked in
              </span>
              <span className="px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-zinc-300 font-mono">
                Refreshes in {venueCountdown}s
              </span>
            </div>
          </div>
        )}

        {/* HOST CHECK-IN GUESTS MODAL (Lazy Loaded Scanner + Manual List) */}
        {isScannerOpen && detailedItem && (
          <Suspense fallback={null}>
            <HostScannerModal
              isOpen={isScannerOpen}
              onClose={() => setIsScannerOpen(false)}
              eventId={detailedItem.id}
              eventTitle={detailedItem.title}
              attendees={attendees}
              combinedGuests={combinedGuests}
              onCheckinSuccess={() => refreshDetailAndGuests(detailedItem.id)}
            />
          </Suspense>
        )}
      </div>
    );
  }

  // Link to an event that does not exist (deleted, or a typo)
  const linkedId = initialItemId || getItemIdFromHash();
  if (missingEventId && !selectedItemId && linkedId === missingEventId) {
    return (
      <div className="kw-container py-6 space-y-4">
        <PageNotFound
          message="This event or opportunity does not exist or was removed."
          onGoHome={() => {
            setMissingEventId(null);
            window.location.hash = '#/home';
          }}
        />
        <div className="text-center">
          <button
            type="button"
            onClick={() => {
              setMissingEventId(null);
              window.location.hash = '#/events';
            }}
            className="kw-btn kw-btn-gold text-xs py-2 px-4"
          >
            See all events
          </button>
        </div>
      </div>
    );
  }

  // Render Events List Overview
  const currentTabItems = activeTab === 'upcoming' ? upcomingItems : pastItems;

  return (
    <div className="kw-container space-y-6 md:space-y-8">
      {selectedItemId && !detailedItem && loadingDetail && (
        <div className="flex items-center gap-2 text-xs text-[var(--fg-muted)]" role="status" aria-live="polite">
          <div className="w-4 h-4 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" aria-hidden="true"></div>
          <span>Opening event…</span>
        </div>
      )}
      {/* Top Banner / Heading */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[var(--fg)] tracking-tight">
            Events & Opportunities
          </h1>
          <p className="text-xs text-[var(--fg-muted)] mt-1">
            Discover tech meetups, hackathons, grants and partner calls.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={openCreateModal}
            className="kw-btn kw-btn-gold text-xs py-2 px-3.5 flex items-center gap-1.5 font-bold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create event</span>
          </button>

          <div className="inline-flex rounded-lg border border-[var(--card-border)] bg-[var(--card)] p-0.5">
            <button
              onClick={() => setActiveTab('upcoming')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
                activeTab === 'upcoming'
                  ? 'bg-[var(--gold)] text-[#090D16] font-bold'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
              }`}
            >
              Upcoming ({upcomingItems.length})
            </button>
            <button
              onClick={() => setActiveTab('past')}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-md transition-all cursor-pointer ${
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

      {/* Search Box */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 text-[var(--fg-subtle)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="search"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search events by title, venue, or tag..."
          aria-label="Search events"
          className="kw-input text-xs pl-10 py-2 w-full"
        />
      </div>

      {/* List items */}
      {loading ? (
        <div className="text-center py-12 text-xs text-[var(--fg-muted)]">
          Loading events...
        </div>
      ) : currentTabItems.length === 0 ? (
        <div className="kw-card p-8 text-center space-y-3">
          <Calendar className="w-8 h-8 text-[var(--gold-text)] mx-auto opacity-60" />
          <h3 className="font-bold text-sm text-[var(--fg)]">
            No {activeTab} events found
          </h3>
          <p className="text-xs text-[var(--fg-muted)] max-w-sm mx-auto">
            {activeTab === 'upcoming'
              ? 'Be the first to organize a meetup or post an opportunity.'
              : 'Past events will appear here once ended.'}
          </p>
          {activeTab === 'upcoming' && (
            <button
              onClick={openCreateModal}
              className="kw-btn kw-btn-gold text-xs py-2 px-4 font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create an event</span>
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {currentTabItems.map(item => {
            const isEvent = item.kind === 'event';
            const isAuthor = Boolean(currentProfile && (item.author_id === currentProfile.id || item.author_id === currentProfile.account_uid));
            const isAdminViewer = Boolean(currentProfile?.is_admin);
            const canSeeCardAttendees = isAuthor || isAdminViewer;
            const isAttending = Array.isArray(item.attendee_ids) && Boolean(currentProfile && item.attendee_ids.includes(currentProfile.id));
            const isPast = item.phase === 'past';
            const isLive = item.phase === 'live';
            const isCancelled = Boolean(item.is_cancelled);
            const cardAttendeeCount = item.attendee_count ?? ((Array.isArray(item.attendee_ids) ? item.attendee_ids.length : 0) + (item.guest_count || 0));
            const hasCapacity = typeof item.capacity === 'number' && item.capacity > 0;
            const spotsLeft = hasCapacity ? Math.max(0, item.capacity! - cardAttendeeCount) : null;
            const isFull = hasCapacity && spotsLeft === 0;
            const cardTags: string[] = Array.isArray(item.tags) ? item.tags : [];

            const timeFormatted = formatEventDateTime(
              item.starts_at,
              item.ends_at,
              item.timezone,
              item.datetime
            );

            return (
              <div
                key={item.id}
                onClick={() => {
                  setSelectedItemId(item.id);
                  window.location.hash = `#/events/${item.id}`;
                }}
                className="kw-card overflow-hidden hover:border-[var(--gold)]/60 transition-all cursor-pointer flex flex-col justify-between group"
              >
                {/* Cover image or gradient placeholder */}
                <div className="w-full aspect-[16/9] bg-[var(--bg)] border-b border-[var(--card-border)] overflow-hidden relative">
                  {item.cover_image ? (
                    <img
                      src={item.cover_image}
                      alt={item.title}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-amber-500/20 via-amber-900/10 to-[var(--bg)] flex items-center justify-center">
                      <span className="text-3xl font-black text-[var(--gold-text)]/40 uppercase">
                        {item.title ? item.title.trim().charAt(0) : 'K'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="p-5 space-y-4 flex-1 flex flex-col justify-between">
                  <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold tracking-wide uppercase ${
                          isEvent
                            ? 'bg-amber-500/15 text-[var(--gold-text)] border border-amber-500/30'
                            : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        }`}
                      >
                        {isEvent ? 'Event' : item.opportunity_type || 'Opportunity'}
                      </span>

                      {isLive && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                          ● Live
                        </span>
                      )}

                      {isCancelled && (
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-zinc-700/60 text-zinc-300 border border-zinc-600">
                          Cancelled
                        </span>
                      )}
                    </div>

                    <span className="text-[11px] text-[var(--fg-muted)] flex items-center gap-1">
                      <Users className="w-3 h-3 text-[var(--gold-text)]" />
                      <span>{cardAttendeeCount}</span>
                      {hasCapacity && (
                        <span
                          className={`text-[10px] font-semibold ${
                            isFull && item.waitlist_enabled === false ? 'text-rose-400' : 'text-[var(--gold-text)]'
                          }`}
                        >
                          ·{' '}
                          {isFull
                            ? item.waitlist_enabled !== false
                              ? (item.waitlist_count || 0) > 0
                                ? `Full · ${item.waitlist_count} on waitlist`
                                : 'Full · Waitlist open'
                              : 'Full'
                            : `${spotsLeft} ${spotsLeft === 1 ? 'spot' : 'spots'} left`}
                        </span>
                      )}
                    </span>
                  </div>

                  <h3 className="font-bold text-sm text-[var(--fg)] group-hover:text-[var(--gold-text)] transition-colors line-clamp-2">
                    {/* Real link so keyboard and screen reader users can open the card */}
                    <a
                      href={`#/events/${item.id}`}
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectedItemId(item.id);
                        window.location.hash = `#/events/${item.id}`;
                      }}
                      className={`rounded ${FOCUS_RING}`}
                    >
                      {item.title}
                    </a>
                  </h3>

                  <p className="text-xs text-[var(--fg-muted)] line-clamp-2">
                    {item.description}
                  </p>

                  {cardTags.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {cardTags.map(tag => (
                        <button
                          type="button"
                          key={tag}
                          onClick={e => {
                            e.stopPropagation();
                            setSearchQuery(tag);
                          }}
                          aria-label={`Filter events by ${tag}`}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium bg-[var(--bg)] border border-[var(--card-border)] text-[var(--fg-muted)] hover:border-[var(--gold)] ${FOCUS_RING}`}
                        >
                          #{tag}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-[var(--card-border)] space-y-2 text-xs">
                  <div className="flex items-center justify-between text-[var(--fg-muted)]">
                    <span className="flex items-center gap-1.5 font-medium truncate">
                      <Calendar className="w-3.5 h-3.5 text-[var(--gold-text)] flex-shrink-0" />
                      <span className="truncate">{timeFormatted.display}</span>
                    </span>

                    <span className="flex items-center gap-1 text-[11px] flex-shrink-0">
                      {isEvent ? (
                        item.format === 'online' ? (
                          <Video className="w-3 h-3 text-[var(--gold-text)]" />
                        ) : (
                          <MapPin className="w-3 h-3 text-[var(--gold-text)]" />
                        )
                      ) : null}
                      <span>{isEvent ? (item.format === 'online' ? 'Online' : (item.venue || item.location || '')) : 'Opportunity'}</span>
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <span className="text-[11px] text-[var(--fg-subtle)] truncate">
                      By {item.author_name || 'Community Member'}
                    </span>

                    <div className="flex flex-wrap items-center justify-end gap-2 ml-auto">
                      {canSeeCardAttendees && (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setSelectedItemId(item.id);
                            setShowAttendeesPanel(true);
                            window.location.hash = `#/events/${item.id}`;
                          }}
                          className="px-2.5 py-1 rounded-lg border border-[var(--gold)]/50 bg-amber-500/10 text-[var(--gold-text)] text-[11px] font-bold hover:bg-amber-500/20 cursor-pointer"
                        >
                          {`Attendees (${cardAttendeeCount})`}
                        </button>
                      )}

                      {isAuthor && !isCancelled && (
                        <button
                          onClick={e => openEditModal(item, e)}
                          className="p-1.5 rounded-lg border border-[var(--card-border)] hover:border-[var(--gold)] text-[var(--fg-muted)] hover:text-[var(--fg)] cursor-pointer"
                          title="Edit event"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {currentProfile && (
                        <button
                          onClick={e => handleOpenReport(item, e)}
                          className="p-1.5 rounded-lg border border-[var(--card-border)] hover:border-rose-500/40 text-[var(--fg-muted)] hover:text-rose-400 cursor-pointer"
                          title="Report event"
                        >
                          <Flag className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        onClick={e => handleShare(item, e)}
                        className="p-1.5 rounded-lg border border-[var(--card-border)] hover:border-[var(--gold)] text-[var(--fg-muted)] hover:text-[var(--fg)] cursor-pointer"
                        title="Share link"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                      </button>

                      {isAuthor ? (
                        <span className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500/15 text-[var(--gold-text)] border border-amber-500/30">
                          You're hosting
                        </span>
                      ) : isEvent ? (
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
                        ) : item.my_waitlist_position && !isAttending ? (
                          <>
                            <span className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-amber-500/15 text-amber-300 border border-amber-500/40">
                              {`Waitlist #${item.my_waitlist_position}`}
                            </span>
                            <button
                              type="button"
                              disabled={rsvpLoading}
                              onClick={e => {
                                e.stopPropagation();
                                setRsvpCancelTarget({ id: item.id, title: item.title, waitlist: true });
                              }}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-rose-500/50 text-rose-400 hover:bg-rose-500/15 cursor-pointer"
                            >
                              Leave waitlist
                            </button>
                          </>
                        ) : isFull && !isAttending ? (
                          item.waitlist_enabled !== false ? (
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                handleRsvp(item.id);
                              }}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 cursor-pointer"
                            >
                              Join waitlist
                            </button>
                          ) : (
                            <button
                              disabled
                              className="px-3 py-1.5 rounded-lg text-xs font-bold bg-zinc-700/50 text-zinc-400 cursor-not-allowed"
                            >
                              Full
                            </button>
                          )
                        ) : isAttending ? (
                          <>
                            <span className="px-2.5 py-1.5 rounded-lg text-xs font-bold bg-emerald-600/20 text-emerald-300 border border-emerald-500/40">
                              ✓ You're going
                            </span>
                            <button
                              type="button"
                              disabled={rsvpLoading}
                              onClick={e => {
                                e.stopPropagation();
                                setRsvpCancelTarget({ id: item.id, title: item.title, waitlist: false });
                              }}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-bold border border-rose-500/50 text-rose-400 hover:bg-rose-500/15 cursor-pointer"
                            >
                              Cancel registration
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              handleRsvp(item.id);
                            }}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer kw-btn-gold"
                          >
                            I'm going
                          </button>
                        )
                      ) : (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            handleRsvp(item.id);
                          }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
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
              </div>
            </div>
          );
        })}
        </div>
      )}

      {/* CREATE EVENT MODAL */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="create-event-dialog-title">
          <div ref={createDialogRef} tabIndex={-1} className="kw-card max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto border-[var(--gold)]/40 animate-in fade-in zoom-in-95 duration-150 outline-none">
            <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
              <div>
                <h3 id="create-event-dialog-title" className="font-bold text-sm text-[var(--fg)]">Create an Event or Opportunity</h3>
                <p className="text-xs text-[var(--fg-muted)]">
                  Published directly to the community.
                </p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                aria-label="Close"
                className="p-1 text-[var(--fg-muted)] hover:text-[var(--fg)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form noValidate onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <fieldset>
                <legend className="font-semibold text-[var(--fg)] block mb-1">What are you creating? *</legend>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2" role="radiogroup" aria-label="Event or Opportunity">
                  {([
                    { kind: 'event', label: 'Event' },
                    { kind: 'opportunity', label: 'Opportunity' }
                  ] as const).map(opt => (
                    <button
                      key={opt.kind}
                      type="button"
                      role="radio"
                      aria-checked={formKind === opt.kind}
                      onClick={() => setFormKind(opt.kind)}
                      data-testid={`kind-${opt.kind}`}
                      className={`py-2 px-3 rounded-lg border text-left transition-colors cursor-pointer ${
                        formKind === opt.kind
                          ? 'border-[var(--gold)] bg-[var(--gold)] text-[#090D16]'
                          : 'border-[var(--card-border)] bg-[var(--bg)] text-[var(--fg-muted)]'
                      }`}
                    >
                      <span className="block text-xs font-bold">{opt.label}</span>
                      <span className="block text-[12px] font-normal leading-snug mt-0.5">{EVENT_KIND_HELP[opt.kind]}</span>
                    </button>
                  ))}
                </div>
              </fieldset>

              <div>
                <label htmlFor="create-title" className="font-semibold text-[var(--fg)] block mb-1">Title *</label>
                <input
                  id="create-title"
                  type="text"
                  value={formTitle}
                  onChange={e => {
                    setFormTitle(e.target.value);
                    if (duplicateOf) setDuplicateOf(null);
                    if (createErrors.title) setCreateErrors(prev => ({ ...prev, title: '' }));
                  }}
                  placeholder="e.g. Flutter Hackday"
                  maxLength={EVENT_TITLE_MAX}
                  aria-invalid={Boolean(createErrors.title)}
                  aria-describedby={createErrors.title ? "create-title-error" : undefined}
                  className={`kw-input text-xs ${createErrors.title ? 'border-rose-500 focus:border-rose-500' : ''}`}
                />
                {createErrors.title && (
                  <p id="create-title-error" className="text-rose-400 text-[11px] mt-1 font-medium" role="alert">
                    {createErrors.title}
                  </p>
                )}
                {duplicateOf && (
                  <div
                    className="mt-2 p-3 rounded-lg border border-amber-500/40 bg-amber-500/10 space-y-2"
                    role="alert"
                    data-testid="duplicate-warning"
                  >
                    <p className="text-xs text-[var(--fg)]">
                      You posted "{duplicateOf.title}" in the last 24 hours. Is this the same one?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const existingId = duplicateOf.id;
                          setIsCreateModalOpen(false);
                          resetForm();
                          setSelectedItemId(existingId);
                          window.location.hash = `#/events/${existingId}`;
                        }}
                        className="kw-btn kw-btn-gold text-xs py-1.5 px-3 font-semibold"
                      >
                        Open it
                      </button>
                      <button
                        type="button"
                        onClick={e => handleCreateSubmit(e, true)}
                        disabled={formSubmitting}
                        className="kw-btn kw-btn-ghost text-xs py-1.5 px-3 border border-[var(--card-border)]"
                      >
                        Post anyway
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="create-description" className="font-semibold text-[var(--fg)] block mb-1">Description *</label>
                <textarea
                  id="create-description"
                  value={formDescription}
                  onChange={e => {
                    setFormDescription(e.target.value);
                    if (createErrors.description) setCreateErrors(prev => ({ ...prev, description: '' }));
                  }}
                  rows={3}
                  placeholder="Share details about what builders will learn, hack on, or gain..."
                  aria-invalid={Boolean(createErrors.description)}
                  aria-describedby={createErrors.description ? "create-description-error" : undefined}
                  className={`kw-textarea text-xs ${createErrors.description ? 'border-rose-500 focus:border-rose-500' : ''}`}
                />
                {createErrors.description && (
                  <p id="create-description-error" className="text-rose-400 text-[11px] mt-1 font-medium" role="alert">
                    {createErrors.description}
                  </p>
                )}
              </div>

              {formKind === 'event' ? (
                <>
                  <div>
                    <label className="font-semibold text-[var(--fg)] block mb-1">Format *</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['in_person', 'online', 'hybrid'] as const).map(fmt => (
                        <button
                          key={fmt}
                          type="button"
                          onClick={() => setFormFormat(fmt)}
                          className={`py-2 px-2 rounded-lg border text-xs font-semibold capitalize transition-colors cursor-pointer ${
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

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="create-start_date" className="font-semibold text-[var(--fg)] block mb-1">Start Date *</label>
                      <input
                        id="create-start_date"
                        type="date"
                        value={formStartDate}
                        onChange={e => {
                          setFormStartDate(e.target.value);
                          if (createErrors.start_date) setCreateErrors(prev => ({ ...prev, start_date: '' }));
                        }}
                        aria-invalid={Boolean(createErrors.start_date)}
                        aria-describedby={createErrors.start_date ? "create-start_date-error" : undefined}
                        className={`kw-input text-xs ${createErrors.start_date ? 'border-rose-500 focus:border-rose-500' : ''}`}
                      />
                      {createErrors.start_date && (
                        <p id="create-start_date-error" className="text-rose-400 text-[11px] mt-1 font-medium" role="alert">
                          {createErrors.start_date}
                        </p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="create-start_time" className="font-semibold text-[var(--fg)] block mb-1">Start Time *</label>
                      <input
                        id="create-start_time"
                        type="time"
                        value={formStartTime}
                        onChange={e => {
                          setFormStartTime(e.target.value);
                          if (createErrors.start_time) setCreateErrors(prev => ({ ...prev, start_time: '' }));
                        }}
                        aria-invalid={Boolean(createErrors.start_time)}
                        aria-describedby={createErrors.start_time ? "create-start_time-error" : undefined}
                        className={`kw-input text-xs ${createErrors.start_time ? 'border-rose-500 focus:border-rose-500' : ''}`}
                      />
                      {createErrors.start_time && (
                        <p id="create-start_time-error" className="text-rose-400 text-[11px] mt-1 font-medium" role="alert">
                          {createErrors.start_time}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="create-end_date" className="font-semibold text-[var(--fg)] block mb-1">End Date (optional)</label>
                      <input
                        id="create-end_date"
                        type="date"
                        value={formEndDate}
                        onChange={e => {
                          setFormEndDate(e.target.value);
                          if (createErrors.end_date) setCreateErrors(prev => ({ ...prev, end_date: '' }));
                        }}
                        aria-invalid={Boolean(createErrors.end_date)}
                        aria-describedby={createErrors.end_date ? "create-end_date-error" : undefined}
                        className={`kw-input text-xs ${createErrors.end_date ? 'border-rose-500 focus:border-rose-500' : ''}`}
                      />
                      {createErrors.end_date && (
                        <p id="create-end_date-error" className="text-rose-400 text-[11px] mt-1 font-medium" role="alert">
                          {createErrors.end_date}
                        </p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="create-end_time" className="font-semibold text-[var(--fg)] block mb-1">End Time (optional)</label>
                      <input
                        id="create-end_time"
                        type="time"
                        value={formEndTime}
                        onChange={e => setFormEndTime(e.target.value)}
                        className="kw-input text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="create-timezone" className="font-semibold text-[var(--fg)] block mb-1">Timezone *</label>
                    <input
                      id="create-timezone"
                      type="text"
                      value={formTimezone}
                      onChange={e => setFormTimezone(e.target.value)}
                      placeholder="e.g. Africa/Kampala"
                      className="kw-input text-xs"
                    />
                    <p className="text-[13px] text-[var(--fg-subtle)] mt-0.5">
                      Defaults to your browser timezone.
                    </p>
                  </div>

                  {(formFormat === 'in_person' || formFormat === 'hybrid') && (
                    <>
                      <div>
                        <label htmlFor="create-venue" className="font-semibold text-[var(--fg)] block mb-1">Venue / address *</label>
                        <input
                          id="create-venue"
                          type="text"
                          value={formLocation}
                          onChange={e => {
                            setFormLocation(e.target.value);
                            if (createErrors.venue) setCreateErrors(prev => ({ ...prev, venue: '' }));
                          }}
                          placeholder="e.g. venue name, street address, city (min 5 chars)"
                          aria-invalid={Boolean(createErrors.venue)}
                          aria-describedby={createErrors.venue ? "create-venue-error" : undefined}
                          className={`kw-input text-xs ${createErrors.venue ? 'border-rose-500 focus:border-rose-500' : ''}`}
                        />
                        {createErrors.venue && (
                          <p id="create-venue-error" className="text-rose-400 text-xs mt-1 font-medium" role="alert">
                            {createErrors.venue}
                          </p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="create-map_link" className="font-semibold text-[var(--fg)] block mb-1">Map link (optional)</label>
                        <input
                          id="create-map_link"
                          type="text"
                          value={formMapLink}
                          onChange={e => {
                            setFormMapLink(e.target.value);
                            if (createErrors.map_link) setCreateErrors(prev => ({ ...prev, map_link: '' }));
                          }}
                          placeholder="https://maps.google.com/... or https://www.openstreetmap.org/..."
                          aria-invalid={Boolean(createErrors.map_link)}
                          aria-describedby={createErrors.map_link ? "create-map_link-error" : undefined}
                          className={`kw-input text-xs ${createErrors.map_link ? 'border-rose-500 focus:border-rose-500' : ''}`}
                        />
                        {createErrors.map_link && (
                          <p id="create-map_link-error" className="text-rose-400 text-xs mt-1 font-medium" role="alert">
                            {createErrors.map_link}
                          </p>
                        )}
                      </div>
                    </>
                  )}

                  {(formFormat === 'online' || formFormat === 'hybrid') && (
                    <div>
                      <label htmlFor="create-join_link" className="font-semibold text-[var(--fg)] block mb-1">Join link (https://) *</label>
                      <input
                        id="create-join_link"
                        type="text"
                        value={formJoinLink}
                        onChange={e => {
                          setFormJoinLink(e.target.value);
                          if (createErrors.join_link) setCreateErrors(prev => ({ ...prev, join_link: '' }));
                        }}
                        placeholder="https://meet.google.com/..."
                        aria-invalid={Boolean(createErrors.join_link)}
                        aria-describedby={createErrors.join_link ? "create-join_link-error" : undefined}
                        className={`kw-input text-xs ${createErrors.join_link ? 'border-rose-500 focus:border-rose-500' : ''}`}
                      />
                      {createErrors.join_link ? (
                        <p id="create-join_link-error" className="text-rose-400 text-xs mt-1 font-medium" role="alert">
                          {createErrors.join_link}
                        </p>
                      ) : (
                        <p className="text-[13px] text-[var(--fg-subtle)] mt-0.5">
                          Shown only to signed-in members who RSVP.
                        </p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="create-capacity" className="font-semibold text-[var(--fg)] block mb-1">Capacity (optional)</label>
                      <input
                        id="create-capacity"
                        type="number"
                        min={1}
                        max={5000}
                        value={formCapacity}
                        onChange={e => {
                          setFormCapacity(e.target.value);
                          if (createErrors.capacity) setCreateErrors(prev => ({ ...prev, capacity: '' }));
                        }}
                        placeholder="Unlimited (1–5000)"
                        aria-invalid={Boolean(createErrors.capacity)}
                        aria-describedby={createErrors.capacity ? "create-capacity-error" : undefined}
                        className={`kw-input text-xs ${createErrors.capacity ? 'border-rose-500 focus:border-rose-500' : ''}`}
                      />
                      {createErrors.capacity && (
                        <p id="create-capacity-error" className="text-rose-400 text-xs mt-1 font-medium" role="alert">
                          {createErrors.capacity}
                        </p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="ev-tags-optional-up-to-5-2" className="font-semibold text-[var(--fg)] block mb-1">Tags (optional, up to 5)</label>
                      <input
                        id="ev-tags-optional-up-to-5-2"
                        type="text"
                        value={formTagsInput}
                        onChange={e => setFormTagsInput(e.target.value)}
                        placeholder="ai, flutter, kampala"
                        className="kw-input text-xs"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--fg)] pt-1">
                    <input
                      type="checkbox"
                      checked={formWaitlistEnabled}
                      onChange={e => setFormWaitlistEnabled(e.target.checked)}
                    />
                    <span className="font-semibold">Enable waitlist when full</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--fg)] pt-1">
                    <input
                      type="checkbox"
                      checked={formWaitlistEnabled}
                      onChange={e => setFormWaitlistEnabled(e.target.checked)}
                    />
                    <span className="font-semibold">Enable waitlist when full</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--fg)] pt-1">
                    <input
                      type="checkbox"
                      checked={formSelfCheckin}
                      onChange={e => setFormSelfCheckin(e.target.checked)}
                    />
                    <span className="font-semibold">Allow self check-in (venue rotating QR code)</span>
                  </label>

                  {/* Contact for attendees */}
                  <div className="space-y-3 pt-2 border-t border-[var(--card-border)]">
                    <div>
                      <h4 className="font-bold text-xs text-[var(--fg)]">Contact for attendees (optional)</h4>
                      <p className="text-[13px] text-[var(--fg-muted)]">Only people registered for this event can see this.</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor="create-contact_phone" className="font-semibold text-[var(--fg)]">WhatsApp or phone</label>
                        {currentProfile?.whatsapp && (
                          <button
                            type="button"
                            onClick={() => setFormContactPhone(currentProfile.whatsapp || '')}
                            className="text-[13px] text-[var(--gold-text)] hover:underline cursor-pointer"
                          >
                            Use my profile WhatsApp
                          </button>
                        )}
                      </div>
                      <input
                        id="create-contact_phone"
                        type="tel"
                        value={formContactPhone}
                        onChange={e => {
                          setFormContactPhone(e.target.value);
                          if (createErrors.contact_phone) setCreateErrors(prev => ({ ...prev, contact_phone: '' }));
                        }}
                        placeholder="+256700000000"
                        aria-invalid={Boolean(createErrors.contact_phone)}
                        aria-describedby={createErrors.contact_phone ? "create-contact_phone-error" : undefined}
                        className={`kw-input text-xs ${createErrors.contact_phone ? 'border-rose-500 focus:border-rose-500' : ''}`}
                      />
                      {createErrors.contact_phone && (
                        <p id="create-contact_phone-error" className="text-rose-400 text-xs mt-1 font-medium" role="alert">
                          {createErrors.contact_phone}
                        </p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="create-contact_email" className="font-semibold text-[var(--fg)] block mb-1">Email</label>
                      <input
                        id="create-contact_email"
                        type="email"
                        value={formContactEmail}
                        onChange={e => {
                          setFormContactEmail(e.target.value);
                          if (createErrors.contact_email) setCreateErrors(prev => ({ ...prev, contact_email: '' }));
                        }}
                        placeholder="host@example.com"
                        aria-invalid={Boolean(createErrors.contact_email)}
                        aria-describedby={createErrors.contact_email ? "create-contact_email-error" : undefined}
                        className={`kw-input text-xs ${createErrors.contact_email ? 'border-rose-500 focus:border-rose-500' : ''}`}
                      />
                      {createErrors.contact_email && (
                        <p id="create-contact_email-error" className="text-rose-400 text-xs mt-1 font-medium" role="alert">
                          {createErrors.contact_email}
                        </p>
                      )}
                    </div>
                  </div>

                  <div>
                    <label htmlFor="create-reg_link" className="font-semibold text-[var(--fg)] block mb-1">Registration link (optional)</label>
                    <input
                      id="create-reg_link"
                      type="text"
                      value={formRegLink}
                      onChange={e => {
                        setFormRegLink(e.target.value);
                        if (createErrors.reg_link) setCreateErrors(prev => ({ ...prev, reg_link: '' }));
                      }}
                      placeholder="https://lu.ma/..."
                      aria-invalid={Boolean(createErrors.reg_link)}
                      aria-describedby={createErrors.reg_link ? "create-reg_link-error" : undefined}
                      className={`kw-input text-xs ${createErrors.reg_link ? 'border-rose-500 focus:border-rose-500' : ''}`}
                    />
                    {createErrors.reg_link && (
                      <p id="create-reg_link-error" className="text-rose-400 text-xs mt-1 font-medium" role="alert">
                        {createErrors.reg_link}
                      </p>
                    )}
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
                    <label htmlFor="ev-opportunity-type-1" className="font-semibold text-[var(--fg)] block mb-1">Opportunity Type *</label>
                    <select
                      id="ev-opportunity-type-1"
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
                    <label htmlFor="create-deadline" className="font-semibold text-[var(--fg)] block mb-1">Deadline (optional)</label>
                    <input
                      id="create-deadline"
                      type="text"
                      value={formDeadline}
                      onChange={e => {
                        setFormDeadline(e.target.value);
                        if (createErrors.deadline) setCreateErrors(prev => ({ ...prev, deadline: '' }));
                      }}
                      placeholder="e.g. Nov 30, 2026"
                      aria-invalid={Boolean(createErrors.deadline)}
                      aria-describedby={createErrors.deadline ? "create-deadline-error" : undefined}
                      className={`kw-input text-xs ${createErrors.deadline ? 'border-rose-500 focus:border-rose-500' : ''}`}
                    />
                    {createErrors.deadline && (
                      <p id="create-deadline-error" className="text-rose-400 text-xs mt-1 font-medium" role="alert">
                        {createErrors.deadline}
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="create-link" className="font-semibold text-[var(--fg)] block mb-1">Opportunity Link (https://)</label>
                    <input
                      id="create-link"
                      type="text"
                      value={formLink}
                      onChange={e => {
                        setFormLink(e.target.value);
                        if (createErrors.link) setCreateErrors(prev => ({ ...prev, link: '' }));
                      }}
                      placeholder="https://..."
                      aria-invalid={Boolean(createErrors.link)}
                      aria-describedby={createErrors.link ? "create-link-error" : undefined}
                      className={`kw-input text-xs ${createErrors.link ? 'border-rose-500 focus:border-rose-500' : ''}`}
                    />
                    {createErrors.link && (
                      <p id="create-link-error" className="text-rose-400 text-xs mt-1 font-medium" role="alert">
                        {createErrors.link}
                      </p>
                    )}
                  </div>
                </>
              )}

              <div className="sticky bottom-0 z-10 -mx-6 -mb-6 px-6 pt-3 pb-4 flex items-center gap-2 border-t border-[var(--card-border)] bg-[var(--card)]">
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="kw-btn kw-btn-gold text-xs py-2 px-4 font-bold flex-1 cursor-pointer disabled:opacity-50"
                >
                  {formSubmitting ? 'Creating…' : 'Create & Publish Event'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="kw-btn text-xs py-2 px-3 border border-[var(--card-border)] cursor-pointer"
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
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="edit-event-dialog-title">
          <div ref={editDialogRef} tabIndex={-1} className="kw-card max-w-lg w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto border-[var(--gold)]/40 animate-in fade-in zoom-in-95 duration-150 outline-none">
            <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
              <h3 id="edit-event-dialog-title" className="font-bold text-sm text-[var(--fg)]">Edit Event Details</h3>
              <button
                onClick={() => setIsEditModalOpen(false)}
                aria-label="Close"
                className="p-1 text-[var(--fg-muted)] hover:text-[var(--fg)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form noValidate onSubmit={handleEditSubmit} className="space-y-4 text-xs">
              <div>
                <label htmlFor="edit-title" className="font-semibold text-[var(--fg)] block mb-1">Title *</label>
                <input
                  id="edit-title"
                  type="text"
                  value={formTitle}
                  onChange={e => {
                    setFormTitle(e.target.value);
                    if (editErrors.title) setEditErrors(prev => ({ ...prev, title: '' }));
                  }}
                  maxLength={Math.max(EVENT_TITLE_MAX, String(editingItem?.title || '').length)}
                  aria-invalid={Boolean(editErrors.title)}
                  aria-describedby={editErrors.title ? "edit-title-error" : undefined}
                  className={`kw-input text-xs ${editErrors.title ? 'border-rose-500 focus:border-rose-500' : ''}`}
                />
                {editErrors.title && (
                  <p id="edit-title-error" className="text-rose-400 text-[11px] mt-1 font-medium" role="alert">
                    {editErrors.title}
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="edit-description" className="font-semibold text-[var(--fg)] block mb-1">Description *</label>
                <textarea
                  id="edit-description"
                  value={formDescription}
                  onChange={e => {
                    setFormDescription(e.target.value);
                    if (editErrors.description) setEditErrors(prev => ({ ...prev, description: '' }));
                  }}
                  rows={3}
                  aria-invalid={Boolean(editErrors.description)}
                  aria-describedby={editErrors.description ? "edit-description-error" : undefined}
                  className={`kw-textarea text-xs ${editErrors.description ? 'border-rose-500 focus:border-rose-500' : ''}`}
                />
                {editErrors.description && (
                  <p id="edit-description-error" className="text-rose-400 text-[11px] mt-1 font-medium" role="alert">
                    {editErrors.description}
                  </p>
                )}
              </div>

              {editingItem.kind === 'event' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="edit-start_date" className="font-semibold text-[var(--fg)] block mb-1">Start Date</label>
                      <input
                        id="edit-start_date"
                        type="date"
                        value={formStartDate}
                        onChange={e => {
                          setFormStartDate(e.target.value);
                          if (editErrors.start_date) setEditErrors(prev => ({ ...prev, start_date: '' }));
                        }}
                        aria-invalid={Boolean(editErrors.start_date)}
                        aria-describedby={editErrors.start_date ? "edit-start_date-error" : undefined}
                        className={`kw-input text-xs ${editErrors.start_date ? 'border-rose-500 focus:border-rose-500' : ''}`}
                      />
                      {editErrors.start_date && (
                        <p id="edit-start_date-error" className="text-rose-400 text-[11px] mt-1 font-medium" role="alert">
                          {editErrors.start_date}
                        </p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="edit-start_time" className="font-semibold text-[var(--fg)] block mb-1">Start Time</label>
                      <input
                        id="edit-start_time"
                        type="time"
                        value={formStartTime}
                        onChange={e => {
                          setFormStartTime(e.target.value);
                          if (editErrors.start_time) setEditErrors(prev => ({ ...prev, start_time: '' }));
                        }}
                        aria-invalid={Boolean(editErrors.start_time)}
                        aria-describedby={editErrors.start_time ? "edit-start_time-error" : undefined}
                        className={`kw-input text-xs ${editErrors.start_time ? 'border-rose-500 focus:border-rose-500' : ''}`}
                      />
                      {editErrors.start_time && (
                        <p id="edit-start_time-error" className="text-rose-400 text-[11px] mt-1 font-medium" role="alert">
                          {editErrors.start_time}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="edit-end_date" className="font-semibold text-[var(--fg)] block mb-1">End Date</label>
                      <input
                        id="edit-end_date"
                        type="date"
                        value={formEndDate}
                        onChange={e => {
                          setFormEndDate(e.target.value);
                          if (editErrors.end_date) setEditErrors(prev => ({ ...prev, end_date: '' }));
                        }}
                        aria-invalid={Boolean(editErrors.end_date)}
                        aria-describedby={editErrors.end_date ? "edit-end_date-error" : undefined}
                        className={`kw-input text-xs ${editErrors.end_date ? 'border-rose-500 focus:border-rose-500' : ''}`}
                      />
                      {editErrors.end_date && (
                        <p id="edit-end_date-error" className="text-rose-400 text-[11px] mt-1 font-medium" role="alert">
                          {editErrors.end_date}
                        </p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="edit-end_time" className="font-semibold text-[var(--fg)] block mb-1">End Time</label>
                      <input
                        id="edit-end_time"
                        type="time"
                        value={formEndTime}
                        onChange={e => setFormEndTime(e.target.value)}
                        className="kw-input text-xs"
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="edit-timezone" className="font-semibold text-[var(--fg)] block mb-1">Timezone</label>
                    <input
                      id="edit-timezone"
                      type="text"
                      value={formTimezone}
                      onChange={e => setFormTimezone(e.target.value)}
                      className="kw-input text-xs"
                    />
                  </div>

                  {(formFormat === 'in_person' || formFormat === 'hybrid') && (
                    <>
                      <div>
                        <label htmlFor="edit-venue" className="font-semibold text-[var(--fg)] block mb-1">Venue / address *</label>
                        <input
                          id="edit-venue"
                          type="text"
                          value={formLocation}
                          onChange={e => {
                            setFormLocation(e.target.value);
                            if (editErrors.venue) setEditErrors(prev => ({ ...prev, venue: '' }));
                          }}
                          placeholder="Venue name and street address (min 5 chars)"
                          aria-invalid={Boolean(editErrors.venue)}
                          aria-describedby={editErrors.venue ? "edit-venue-error" : undefined}
                          className={`kw-input text-xs ${editErrors.venue ? 'border-rose-500 focus:border-rose-500' : ''}`}
                        />
                        {editErrors.venue && (
                          <p id="edit-venue-error" className="text-rose-400 text-xs mt-1 font-medium" role="alert">
                            {editErrors.venue}
                          </p>
                        )}
                      </div>

                      <div>
                        <label htmlFor="edit-map_link" className="font-semibold text-[var(--fg)] block mb-1">Map link (optional)</label>
                        <input
                          id="edit-map_link"
                          type="text"
                          value={formMapLink}
                          onChange={e => {
                            setFormMapLink(e.target.value);
                            if (editErrors.map_link) setEditErrors(prev => ({ ...prev, map_link: '' }));
                          }}
                          placeholder="https://maps.google.com/... or https://www.openstreetmap.org/..."
                          aria-invalid={Boolean(editErrors.map_link)}
                          aria-describedby={editErrors.map_link ? "edit-map_link-error" : undefined}
                          className={`kw-input text-xs ${editErrors.map_link ? 'border-rose-500 focus:border-rose-500' : ''}`}
                        />
                        {editErrors.map_link && (
                          <p id="edit-map_link-error" className="text-rose-400 text-xs mt-1 font-medium" role="alert">
                            {editErrors.map_link}
                          </p>
                        )}
                      </div>
                    </>
                  )}

                  {(formFormat === 'online' || formFormat === 'hybrid') && (
                    <div>
                      <label htmlFor="edit-join_link" className="font-semibold text-[var(--fg)] block mb-1">Join link (https://)</label>
                      <input
                        id="edit-join_link"
                        type="text"
                        value={formJoinLink}
                        onChange={e => {
                          setFormJoinLink(e.target.value);
                          if (editErrors.join_link) setEditErrors(prev => ({ ...prev, join_link: '' }));
                        }}
                        aria-invalid={Boolean(editErrors.join_link)}
                        aria-describedby={editErrors.join_link ? "edit-join_link-error" : undefined}
                        className={`kw-input text-xs ${editErrors.join_link ? 'border-rose-500 focus:border-rose-500' : ''}`}
                      />
                      {editErrors.join_link && (
                        <p id="edit-join_link-error" className="text-rose-400 text-xs mt-1 font-medium" role="alert">
                          {editErrors.join_link}
                        </p>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="edit-capacity" className="font-semibold text-[var(--fg)] block mb-1">Capacity (optional)</label>
                      <input
                        id="edit-capacity"
                        type="number"
                        min={1}
                        max={5000}
                        value={formCapacity}
                        onChange={e => {
                          setFormCapacity(e.target.value);
                          if (editErrors.capacity) setEditErrors(prev => ({ ...prev, capacity: '' }));
                        }}
                        placeholder="Unlimited (1–5000)"
                        aria-invalid={Boolean(editErrors.capacity)}
                        aria-describedby={editErrors.capacity ? "edit-capacity-error" : undefined}
                        className={`kw-input text-xs ${editErrors.capacity ? 'border-rose-500 focus:border-rose-500' : ''}`}
                      />
                      {editErrors.capacity && (
                        <p id="edit-capacity-error" className="text-rose-400 text-xs mt-1 font-medium" role="alert">
                          {editErrors.capacity}
                        </p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="ev-tags-optional-up-to-5-3" className="font-semibold text-[var(--fg)] block mb-1">Tags (optional, up to 5)</label>
                      <input
                        id="ev-tags-optional-up-to-5-3"
                        type="text"
                        value={formTagsInput}
                        onChange={e => setFormTagsInput(e.target.value)}
                        placeholder="ai, flutter, kampala"
                        className="kw-input text-xs"
                      />
                    </div>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer text-xs text-[var(--fg)] pt-1">
                    <input
                      type="checkbox"
                      checked={formSelfCheckin}
                      onChange={e => setFormSelfCheckin(e.target.checked)}
                    />
                    <span className="font-semibold">Allow self check-in (venue rotating QR code)</span>
                  </label>

                  {/* Contact for attendees */}
                  <div className="space-y-3 pt-2 border-t border-[var(--card-border)]">
                    <div>
                      <h4 className="font-bold text-xs text-[var(--fg)]">Contact for attendees (optional)</h4>
                      <p className="text-[13px] text-[var(--fg-muted)]">Only people registered for this event can see this.</p>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label htmlFor="edit-contact_phone" className="font-semibold text-[var(--fg)]">WhatsApp or phone</label>
                        {currentProfile?.whatsapp && (
                          <button
                            type="button"
                            onClick={() => setFormContactPhone(currentProfile.whatsapp || '')}
                            className="text-[13px] text-[var(--gold-text)] hover:underline cursor-pointer"
                          >
                            Use my profile WhatsApp
                          </button>
                        )}
                      </div>
                      <input
                        id="edit-contact_phone"
                        type="tel"
                        value={formContactPhone}
                        onChange={e => {
                          setFormContactPhone(e.target.value);
                          if (editErrors.contact_phone) setEditErrors(prev => ({ ...prev, contact_phone: '' }));
                        }}
                        placeholder="+256700000000"
                        aria-invalid={Boolean(editErrors.contact_phone)}
                        aria-describedby={editErrors.contact_phone ? "edit-contact_phone-error" : undefined}
                        className={`kw-input text-xs ${editErrors.contact_phone ? 'border-rose-500 focus:border-rose-500' : ''}`}
                      />
                      {editErrors.contact_phone && (
                        <p id="edit-contact_phone-error" className="text-rose-400 text-xs mt-1 font-medium" role="alert">
                          {editErrors.contact_phone}
                        </p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="edit-contact_email" className="font-semibold text-[var(--fg)] block mb-1">Email</label>
                      <input
                        id="edit-contact_email"
                        type="email"
                        value={formContactEmail}
                        onChange={e => {
                          setFormContactEmail(e.target.value);
                          if (editErrors.contact_email) setEditErrors(prev => ({ ...prev, contact_email: '' }));
                        }}
                        placeholder="host@example.com"
                        aria-invalid={Boolean(editErrors.contact_email)}
                        aria-describedby={editErrors.contact_email ? "edit-contact_email-error" : undefined}
                        className={`kw-input text-xs ${editErrors.contact_email ? 'border-rose-500 focus:border-rose-500' : ''}`}
                      />
                      {editErrors.contact_email && (
                        <p id="edit-contact_email-error" className="text-rose-400 text-xs mt-1 font-medium" role="alert">
                          {editErrors.contact_email}
                        </p>
                      )}
                    </div>
                  </div>

                  <CoverImageUploader
                    value={formCoverImage}
                    onChange={setFormCoverImage}
                    title={formTitle}
                  />
                </>
              )}

              <div className="sticky bottom-0 z-10 -mx-6 -mb-6 px-6 pt-3 pb-4 flex items-center gap-2 border-t border-[var(--card-border)] bg-[var(--card)]">
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="kw-btn kw-btn-gold text-xs py-2 px-4 font-bold flex-1 cursor-pointer disabled:opacity-50"
                >
                  {formSubmitting ? 'Saving…' : 'Save Changes'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="kw-btn text-xs py-2 px-3 border border-[var(--card-border)] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* GUEST REGISTRATION MODAL */}
      <GuestRegisterModal
        isOpen={isGuestModalOpen}
        onClose={() => setIsGuestModalOpen(false)}
        eventId={selectedItemId || ''}
        onSuccess={handleGuestSuccess}
        onToast={onToast}
        onJoinClick={onJoinClick}
      />

      {rsvpCancelDialog}

      {/* REPORT MODAL */}
      {isReportModalOpen && reportingItem && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="report-event-dialog-title">
          <div ref={reportDialogRef} tabIndex={-1} className="kw-card max-w-md w-full p-6 space-y-4 border-rose-500/40 animate-in fade-in zoom-in-95 duration-150 outline-none">
            <div className="flex items-center justify-between border-b border-[var(--card-border)] pb-3">
              <div className="flex items-center gap-2 text-rose-400">
                <Flag className="w-4 h-4" />
                <h3 id="report-event-dialog-title" className="font-bold text-sm text-[var(--fg)]">Report Event</h3>
              </div>
              <button
                onClick={() => setIsReportModalOpen(false)}
                aria-label="Close"
                className="p-1 text-[var(--fg-muted)] hover:text-[var(--fg)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-[var(--fg-muted)]">
              Help keep Kwegatta safe and genuine. Reports are strictly confidential and reviewed by community administrators.
            </p>

            <form onSubmit={handleReportSubmit} className="space-y-4 text-xs">
              <div>
                <label htmlFor="ev-reason-2" className="font-semibold text-[var(--fg)] block mb-1">Reason *</label>
                <select
                  id="ev-reason-2"
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
                <label htmlFor="ev-optional-note-2" className="font-semibold text-[var(--fg)] block mb-1">Optional Note</label>
                <textarea
                  id="ev-optional-note-2"
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
                  className="kw-btn kw-btn-danger text-xs py-2 px-4 font-bold flex-1 cursor-pointer"
                >
                  {submittingReport ? 'Submitting...' : 'Submit Report'}
                </button>
                <button
                  type="button"
                  onClick={() => setIsReportModalOpen(false)}
                  className="kw-btn text-xs py-2 px-3 border border-[var(--card-border)] cursor-pointer"
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
