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
  Bookmark
} from 'lucide-react';
import { EventOpportunityItem, Profile } from '../types';
import { Avatar } from './Avatar';
import { fetchEvents, fetchEventById, rsvpEvent, PUBLIC_APP_URL } from '../services/api';

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
      <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-200">
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
                className={`px-2.5 py-1 rounded-full text-[11px] font-bold tracking-wide uppercase ${
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
            </div>

            <h1 className="text-xl sm:text-2xl font-bold text-[var(--fg)] leading-tight">
              {detailedItem.title}
            </h1>

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
                          <span className="text-[10px] font-bold text-[var(--gold)] bg-amber-500/10 px-1.5 py-0.5 rounded">
                            {m.score}% Match
                          </span>
                        </div>
                        <p className="text-[11px] text-[var(--fg-muted)] truncate">
                          {m.profile.role} {m.profile.headline ? `• ${m.profile.headline}` : ''}
                        </p>
                      </div>
                    </div>
                    <p className="text-[11px] text-[var(--gold)] bg-amber-500/5 p-2 rounded border border-amber-500/20 italic">
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
                    <p className="text-[10px] text-[var(--fg-muted)] truncate">
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
    <div className="max-w-4xl mx-auto space-y-6">
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
        <div className="kw-card p-12 text-center space-y-3">
          <Calendar className="w-8 h-8 text-[var(--gold)] mx-auto opacity-70" />
          <h3 className="text-sm font-bold text-[var(--fg)]">No items listed yet</h3>
          <p className="text-xs text-[var(--fg-muted)] max-w-sm mx-auto">
            Check back soon for upcoming Kampala developer events, training sessions, and grants.
          </p>
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
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                            isEvent
                              ? 'bg-amber-500/15 text-[var(--gold)] border border-amber-500/30'
                              : 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                          }`}
                        >
                          {isEvent ? 'Event' : item.opportunity_type || 'Opportunity'}
                        </span>
                        {item.datetime && (
                          <span className="flex items-center gap-1 text-[11px] text-[var(--fg-muted)]">
                            <Calendar className="w-3 h-3 text-[var(--gold)]" />
                            {item.datetime}
                          </span>
                        )}
                        {item.deadline && (
                          <span className="flex items-center gap-1 text-[11px] text-rose-400 font-medium">
                            <Clock className="w-3 h-3" />
                            Deadline: {item.deadline}
                          </span>
                        )}
                      </div>

                      <h3 className="text-base font-bold text-[var(--fg)] group-hover:text-[var(--gold)] transition-colors">
                        {item.title}
                      </h3>

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
                    <div className="flex items-center gap-2 text-[var(--fg-muted)] text-[11px]">
                      <Users className="w-3.5 h-3.5 text-[var(--gold)]" />
                      <span>{item.attendee_ids.length} {isEvent ? 'going' : 'interested'}</span>
                    </div>

                    <div className="flex items-center gap-2">
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
                        <span className="text-[10px] font-bold text-[var(--fg-muted)] uppercase">
                          {item.kind === 'event' ? 'Past Event' : 'Past Opportunity'}
                        </span>
                        <span className="text-[11px] text-[var(--fg-muted)]">
                          {item.datetime || item.deadline}
                        </span>
                      </div>
                      <h4 className="text-sm font-semibold text-[var(--fg)]">
                        {item.title}
                      </h4>
                      <div className="flex items-center justify-between text-[11px] text-[var(--fg-muted)]">
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
    </div>
  );
};
