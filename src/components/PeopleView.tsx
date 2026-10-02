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
  const [roleFilter, setRoleFilter] = useState<'all' | 'following' | 'followers' | 'builder' | 'business' | 'design'>('all');

  const filtered = allProfiles
    .filter(p => !currentProfile || p.id !== currentProfile.id)
    .filter(p => {
      // Role / relationship filter
      if (roleFilter === 'following') return followingIds.has(p.id);
      if (roleFilter === 'followers') return followerIds.has(p.id);
      if (roleFilter === 'builder') return p.role === 'builder';
      if (roleFilter === 'business') return p.role === 'business';
      if (roleFilter === 'design') return p.role === 'design';
      return true;
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
        p.teaches || '',
        p.learns || '',
        ...(p.tags || []),
        ...(p.skills || [])
      ].join(' ').toLowerCase();
      return combined.includes(q);
    });

  const filterButtons = [
    { id: 'all', label: 'Everyone' },
    { id: 'following', label: 'Following' },
    { id: 'followers', label: 'Followers' },
    { id: 'builder', label: 'Builders' },
    { id: 'business', label: 'Business' },
    { id: 'design', label: 'Design' }
  ];

  return (
    <div className="max-w-4xl mx-auto space-y-4">
      {/* Search and filters bar */}
      <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-[var(--muted)]" />
          <input
            type="search"
            placeholder="Search by name, skill, need, offer..."
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            className="primer-input pl-8 text-xs py-1.5"
            aria-label="Search people"
          />
        </div>

        <div className="flex flex-wrap gap-1 items-center">
          {filterButtons.map(fb => (
            <button
              key={fb.id}
              onClick={() => setRoleFilter(fb.id as any)}
              className={`primer-btn text-xs py-1 px-2.5 ${
                roleFilter === fb.id ? 'primer-btn-primary' : ''
              }`}
            >
              {fb.label}
            </button>
          ))}
        </div>
      </div>

      {/* Active tag indicator */}
      {selectedTag && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-[var(--muted)]">Filtered by tag:</span>
          <span className="primer-tag flex items-center gap-1">
            <span>#{selectedTag}</span>
            <button
              onClick={() => onSelectTag(null)}
              className="hover:text-red-400"
              aria-label="Clear tag filter"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        </div>
      )}

      {/* People Count */}
      <div className="text-xs text-[var(--muted)]">
        Found {filtered.length} {filtered.length === 1 ? 'member' : 'members'}
      </div>

      {/* Grid of People Cards */}
      {filtered.length === 0 ? (
        <div className="primer-box p-12 text-center space-y-3">
          <h3 className="font-semibold text-sm">No members match your current filters</h3>
          <p className="text-xs text-[var(--muted)]">Try clearing the search or tag filter to discover more builders.</p>
          <button
            onClick={() => {
              onSearchChange('');
              setRoleFilter('all');
              onSelectTag(null);
            }}
            className="primer-btn text-xs py-1 px-3"
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(person => {
            const isFollowing = followingIds.has(person.id);

            return (
              <div
                key={person.id}
                className="primer-box p-3.5 flex flex-col justify-between space-y-2.5 hover:border-[var(--accent)] transition-colors"
              >
                <div>
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => onViewProfile(person.id)}
                      className="flex-shrink-0"
                    >
                      <Avatar profile={person} className="w-10 h-10" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => onViewProfile(person.id)}
                          className="font-semibold text-xs hover:text-[var(--accent)] text-left truncate"
                        >
                          {person.name}
                        </button>
                        <span className="primer-label primer-label-blue text-[10px]">
                          {person.role}
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--muted)] truncate">
                        {person.headline || person.offers}
                      </div>
                    </div>
                  </div>

                  {/* Needs summary */}
                  <div className="mt-2.5 text-xs text-[var(--muted)] bg-[var(--subtle)] p-2 rounded border border-[var(--border-muted)] line-clamp-2">
                    <strong className="text-[var(--fg)]">Needs:</strong> {person.needs}
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 mt-2">
                    {person.tags?.slice(0, 4).map(t => (
                      <button
                        key={t}
                        onClick={() => onSelectTag(t)}
                        className="primer-tag text-[10px]"
                      >
                        #{t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Follow Button & Profile link */}
                <div className="flex items-center justify-between pt-2 border-t border-[var(--border-muted)]">
                  <button
                    onClick={() => onViewProfile(person.id)}
                    className="text-xs text-[var(--accent)] hover:underline"
                  >
                    View profile
                  </button>

                  <button
                    onClick={() => onToggleFollow(person.id)}
                    className="primer-btn text-xs py-1 px-3"
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
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
