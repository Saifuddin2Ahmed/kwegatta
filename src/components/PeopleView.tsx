import React, { useState } from 'react';
import { Search, UserPlus, UserCheck, X } from 'lucide-react';
import { Profile } from '../types';
import { Avatar } from './Avatar';

interface PeopleViewProps {
  currentProfile: Profile | null;
  allProfiles: Profile[];
  followingIds: Set<string>;
  followerIds: Set<string>;
  onToggleFollow: (id: string) => void;
  onViewProfile: (id: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  selectedTag: string | null;
  onSelectTag: (t: string | null) => void;
}

export const PeopleView: React.FC<PeopleViewProps> = ({
  currentProfile,
  allProfiles,
  followingIds,
  followerIds,
  onToggleFollow,
  onViewProfile,
  searchQuery,
  onSearchChange,
  selectedTag,
  onSelectTag
}) => {
  const [roleFilter, setRoleFilter] = useState<'all' | 'following' | 'followers' | 'Founder' | 'Business' | 'Developer' | 'Designer' | 'Domain expert' | 'Mentor' | 'Student' | string>('all');

  const filtered = allProfiles
    .filter(p => !currentProfile || p.id !== currentProfile.id)
    .filter(p => {
      if (roleFilter === 'all') return true;
      if (roleFilter === 'following') return followingIds.has(p.id);
      if (roleFilter === 'followers') return followerIds.has(p.id);
      const memberRoles = (p.roles && p.roles.length > 0) ? p.roles : [p.role];
      return memberRoles.some(r => r?.toLowerCase() === roleFilter.toLowerCase() || (roleFilter === 'Developer' && r?.toLowerCase() === 'builder'));
    })
    .filter(p => {
      if (!selectedTag) return true;
      return (p.tags || []).includes(selectedTag);
    })
    .filter(p => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const combined = [
        p.name,
        p.headline,
        p.offers,
        p.needs,
        p.intent || '',
        p.stage || '',
        p.location || '',
        p.teaches || '',
        p.learns || '',
        ...(p.roles || []),
        ...(p.tags || []),
        ...(p.skills || [])
      ].join(' ').toLowerCase();
      return combined.includes(q);
    });

  const filterButtons = [
    { id: 'all', label: 'All People' },
    { id: 'following', label: 'Following' },
    { id: 'followers', label: 'Followers' },
    { id: 'Founder', label: 'Founders' },
    { id: 'Business', label: 'Business' },
    { id: 'Developer', label: 'Developers' },
    { id: 'Designer', label: 'Designers' },
    { id: 'Mentor', label: 'Mentors' },
    { id: 'Domain expert', label: 'Domain Experts' },
    { id: 'Student', label: 'Students' }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      
      {/* Header & Filter Controls */}
      <div className="space-y-4 border-b border-[var(--card-border)] pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-display font-bold text-[var(--fg)] tracking-tight">
              Community Directory
            </h2>
            <p className="text-xs text-[var(--fg-muted)] mt-0.5">
              Showing {filtered.length} {filtered.length === 1 ? 'person' : 'people and collaborators'}
            </p>
          </div>

          <div className="relative w-full sm:w-72">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-subtle)]" />
            <input
              type="search"
              placeholder="Filter by name, skill, need..."
              value={searchQuery}
              onChange={e => onSearchChange(e.target.value)}
              className="kw-input pl-8 text-xs py-1.5"
              aria-label="Filter directory"
            />
          </div>
        </div>

        {/* Role Segmented Controls */}
        <div className="flex flex-wrap gap-1.5 items-center pt-1">
          {filterButtons.map(fb => (
            <button
              key={fb.id}
              onClick={() => setRoleFilter(fb.id as any)}
              className={`text-xs py-1 px-2.5 rounded-md transition-colors ${
                roleFilter === fb.id
                  ? 'bg-[var(--fg)] text-[var(--bg)] font-semibold shadow-xs'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              {fb.label}
            </button>
          ))}

          {selectedTag && (
            <span className="inline-flex items-center gap-1.5 text-xs text-[var(--gold)] ml-2">
              <span>#{selectedTag}</span>
              <button
                onClick={() => onSelectTag(null)}
                className="hover:opacity-80 p-0.5"
                aria-label="Clear tag"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          )}
        </div>
      </div>

      {/* Directory Grid */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center space-y-3 border border-dashed border-[var(--card-border)] rounded-xl">
          <h3 className="font-semibold text-sm text-[var(--fg)]">No members match your criteria</h3>
          <p className="text-xs text-[var(--fg-muted)]">Try adjusting your keywords or clearing the active filter.</p>
          <button
            onClick={() => {
              onSearchChange('');
              setRoleFilter('all');
              onSelectTag(null);
            }}
            className="kw-btn kw-btn-ghost text-xs py-1.5 px-3"
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map(person => {
            const isFollowing = followingIds.has(person.id);

            return (
              <div
                key={person.id}
                className="p-5 rounded-xl border border-[var(--card-border)] bg-[var(--card)] hover:border-[var(--card-border)]/80 transition-all flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <button
                        onClick={() => onViewProfile(person.id)}
                        className="flex-shrink-0"
                      >
                        <Avatar profile={person} className="w-10 h-10" />
                      </button>
                      <div className="min-w-0">
                        <button
                          onClick={() => onViewProfile(person.id)}
                          className="font-semibold text-sm text-[var(--fg)] hover:text-[var(--gold)] transition-colors text-left truncate block"
                        >
                          {person.name}
                        </button>
                        <span className="text-xs text-[var(--teal)] font-medium">
                          {person.role}
                        </span>
                      </div>
                    </div>

                    <button
                      onClick={() => onToggleFollow(person.id)}
                      className="kw-btn kw-btn-ghost text-xs py-1 px-2.5 flex-shrink-0"
                    >
                      {isFollowing ? (
                        <>
                          <UserCheck className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Following</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5" />
                          <span>Follow</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Bio / Headline */}
                  <p className="text-xs text-[var(--fg-muted)] leading-relaxed line-clamp-2">
                    {person.headline || person.offers}
                  </p>

                  {/* Looking for */}
                  {person.needs && (
                    <div className="text-xs text-[var(--fg-muted)] bg-[var(--bg-subtle)] p-2.5 rounded-lg">
                      <span className="text-[var(--fg)] font-medium">Looking for: </span>
                      <span>{person.needs}</span>
                    </div>
                  )}
                </div>

                {/* Footer tags and profile link */}
                <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--card-border)]/50 text-xs">
                  <div className="flex flex-wrap gap-2 text-[11px] text-[var(--fg-subtle)]">
                    {person.tags?.slice(0, 3).map(t => (
                      <button
                        key={t}
                        onClick={() => onSelectTag(t)}
                        className="hover:text-[var(--fg)] transition-colors"
                      >
                        #{t}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => onViewProfile(person.id)}
                    className="text-xs font-medium text-[var(--gold)] hover:underline"
                  >
                    View profile
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
