import React, { useState } from 'react';
import { Sparkles, Send, Users, X, MessageSquare, Lightbulb, MessageCircle } from 'lucide-react';
import { Profile, Post, PostComment } from '../types';
import { classifyPostWithGemma, db, extractKeywords, intersection } from '../services/api';
import { formatTimeAgo, formatWhatsAppUrl } from '../utils';
import { Avatar } from './Avatar';

interface FeedViewProps {
  currentProfile: Profile | null;
  posts: Post[];
  allProfiles: Profile[];
  onAddPost: (post: Post) => void;
  onUpdatePost: (post: Post) => void;
  onViewProfile: (id: string) => void;
  onSelectTag: (t: string | null) => void;
  selectedTag: string | null;
}

export const FeedView: React.FC<FeedViewProps> = ({
  currentProfile,
  posts,
  allProfiles,
  onAddPost,
  onUpdatePost,
  onViewProfile,
  onSelectTag,
  selectedTag
}) => {
  const [postContent, setPostContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [kindFilter, setKindFilter] = useState<'all' | 'idea' | 'need' | 'offer' | 'question'>('all');
  const [activeCommentPostId, setActiveCommentPostId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState('');

  const handleSubmitPost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProfile) return;
    const body = postContent.trim();
    if (body.length < 8) return;

    setIsSubmitting(true);
    try {
      const meta = await classifyPostWithGemma(body);

      const newPost: Post = {
        id: 'post-' + Date.now(),
        author_id: currentProfile.id,
        body,
        title: meta.title,
        kind: meta.kind,
        tags: meta.tags,
        reactions: { '👍': 1 },
        comments: [],
        created_at: new Date().toISOString()
      };

      const saved = await db.insert<Post>('posts', newPost);
      onAddPost(saved);
      setPostContent('');
    } catch (err) {
      console.error('Failed to post to feed:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleReaction = async (post: Post, emoji: string) => {
    const reactions = { ...(post.reactions || {}) };
    reactions[emoji] = (reactions[emoji] || 0) + 1;
    const updated = { ...post, reactions };
    onUpdatePost(updated);
    await db.update('posts', post.id, { reactions });
  };

  const handleAddComment = async (post: Post) => {
    if (!currentProfile || !commentText.trim()) return;
    const newComment: PostComment = {
      id: 'c-' + Date.now(),
      author_id: currentProfile.id,
      author_name: currentProfile.name,
      body: commentText.trim(),
      created_at: new Date().toISOString()
    };
    const comments = [...(post.comments || []), newComment];
    const updated = { ...post, comments };
    onUpdatePost(updated);
    setCommentText('');
    await db.update('posts', post.id, { comments });

    if (post.author_id !== currentProfile.id) {
      await db.insert('notifications', {
        to_id: post.author_id,
        from_id: currentProfile.id,
        type: 'connect',
        body: `${currentProfile.name} commented on your post "${post.title || post.kind}": "${newComment.body.slice(0, 80)}"`,
        read: false,
        created_at: new Date().toISOString()
      });
    }
  };

  const getHelpersForPost = (post: Post): Profile[] => {
    const postWords = extractKeywords(post.body + ' ' + (post.title || ''));
    return allProfiles
      .filter(p => p.id !== post.author_id)
      .map(p => {
        const theirSkills = extractKeywords(
          [p.offers, p.teaches || '', ...(p.skills || []), ...(p.tags || [])].join(' ')
        );
        const matchCount = intersection(postWords, theirSkills).length;
        return { profile: p, matchCount };
      })
      .filter(item => item.matchCount > 0)
      .sort((a, b) => b.matchCount - a.matchCount)
      .slice(0, 3)
      .map(item => item.profile);
  };

  const filteredPosts = posts
    .filter(p => kindFilter === 'all' || p.kind === kindFilter)
    .filter(p => !selectedTag || (p.tags || []).includes(selectedTag));

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      
      {/* Create post box */}
      {currentProfile && (
        <div className="p-5 rounded-xl border border-[var(--card-border)] bg-[var(--card)] space-y-3">
          <form onSubmit={handleSubmitPost} className="space-y-3">
            <div className="flex gap-3 items-start">
              <Avatar profile={currentProfile} className="w-8 h-8 flex-shrink-0" />
              <textarea
                value={postContent}
                onChange={e => setPostContent(e.target.value)}
                placeholder="Share a project ask, offer skills, or propose an idea..."
                rows={3}
                maxLength={500}
                className="kw-textarea text-xs flex-1"
                disabled={isSubmitting}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 pl-11">
              <span className="text-[11px] text-[var(--fg-subtle)] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[var(--gold)]" />
                <span>Title &amp; categories synthesized by Gemma 4</span>
              </span>

              <button
                type="submit"
                disabled={isSubmitting || postContent.trim().length < 8}
                className="kw-btn kw-btn-gold text-xs py-1.5 px-4 font-semibold"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Publishing...' : 'Publish'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter by Kind and Tag */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--card-border)] pb-4">
        <div className="flex flex-wrap gap-1">
          {(['all', 'idea', 'need', 'offer', 'question'] as const).map(k => (
            <button
              key={k}
              onClick={() => setKindFilter(k)}
              className={`text-xs py-1 px-2.5 rounded-md transition-colors ${
                kindFilter === k
                  ? 'bg-[var(--fg)] text-[var(--bg)] font-semibold'
                  : 'text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              {k === 'all' ? 'All Posts' : k.charAt(0).toUpperCase() + k.slice(1) + 's'}
            </button>
          ))}
        </div>

        {selectedTag && (
          <div className="flex items-center gap-1 text-xs text-[var(--gold)]">
            <span>#{selectedTag}</span>
            <button onClick={() => onSelectTag(null)} aria-label="Clear filter" className="p-0.5 hover:opacity-80">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Posts List */}
      <div className="divide-y divide-[var(--card-border)]">
        {filteredPosts.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <MessageSquare className="w-8 h-8 text-[var(--fg-subtle)] mx-auto opacity-40" />
            <h3 className="font-semibold text-sm text-[var(--fg)]">No posts found</h3>
            <p className="text-xs text-[var(--fg-muted)]">
              Be the first to share an ask, offer, or project concept with the room.
            </p>
          </div>
        ) : (
          filteredPosts.map(post => {
            const author = allProfiles.find(p => p.id === post.author_id) || {
              id: post.author_id,
              name: 'Community Member',
              role: 'other' as const,
              offers: '',
              needs: '',
              tags: [],
              skills: [],
              headline: '',
              bio: '',
              created_at: post.created_at
            };

            const helpers = getHelpersForPost(post);
            const isCommentsOpen = activeCommentPostId === post.id;

            return (
              <div key={post.id} className="py-6 space-y-3.5">
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => onViewProfile(author.id)}
                      className="flex-shrink-0"
                    >
                      <Avatar profile={author} className="w-8 h-8" />
                    </button>
                    <div>
                      <button
                        onClick={() => onViewProfile(author.id)}
                        className="font-semibold text-xs text-[var(--fg)] hover:text-[var(--gold)] transition-colors text-left"
                      >
                        {author.name}
                      </button>
                      <span className="text-[11px] text-[var(--fg-subtle)] ml-2">
                        {formatTimeAgo(post.created_at)}
                      </span>
                    </div>
                  </div>

                  <span className="text-[11px] font-medium text-[var(--gold)] capitalize">
                    {post.kind}
                  </span>
                </div>

                {/* Title & Body */}
                {post.title && (
                  <h4 className="font-semibold text-sm sm:text-base text-[var(--fg)] leading-snug">
                    {post.title}
                  </h4>
                )}

                <p className="text-xs sm:text-sm text-[var(--fg-muted)] leading-relaxed whitespace-pre-wrap">
                  {post.body}
                </p>

                {/* Tags */}
                {post.tags && post.tags.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1 text-xs text-[var(--fg-subtle)]">
                    {post.tags.map(t => (
                      <button
                        key={t}
                        onClick={() => onSelectTag(t)}
                        className="hover:text-[var(--fg)] transition-colors"
                      >
                        #{t}
                      </button>
                    ))}
                  </div>
                )}

                {/* Helpers Section: Gemma matching */}
                {helpers.length > 0 && (
                  <div className="pt-2 text-xs text-[var(--fg-muted)] flex items-center gap-2 flex-wrap bg-[var(--bg-subtle)] p-2.5 rounded-lg">
                    <Users className="w-3.5 h-3.5 text-[var(--teal)] flex-shrink-0" />
                    <span className="text-[var(--fg-subtle)]">In room who could help:</span>
                    {helpers.map((helper, idx) => (
                      <React.Fragment key={helper.id}>
                        <button
                          onClick={() => onViewProfile(helper.id)}
                          className="font-medium text-[var(--fg)] hover:text-[var(--gold)] transition-colors inline-flex items-center gap-1.5"
                        >
                          <Avatar profile={helper} className="w-4 h-4 inline-block" />
                          <span>{helper.name.split(' ')[0]}</span>
                        </button>
                        {helper.whatsapp && (
                          <a
                            href={formatWhatsAppUrl(
                              helper.whatsapp,
                              `Hi ${helper.name.split(' ')[0]}, I saw you could help with the post: "${post.title || post.body.slice(0, 30)}"`
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-400 hover:underline text-[11px]"
                            title="Message on WhatsApp"
                          >
                            <MessageCircle className="w-3 h-3 inline-block" />
                          </a>
                        )}
                        {idx < helpers.length - 1 && <span className="text-[var(--fg-subtle)]">·</span>}
                      </React.Fragment>
                    ))}
                  </div>
                )}

                {/* Reactions and Comments bar */}
                <div className="flex items-center justify-between pt-2 text-xs">
                  <div className="flex items-center gap-1.5">
                    {(['👍', '🚀', '❤️', '💡'] as const).map(emoji => {
                      const count = post.reactions?.[emoji] || 0;
                      return (
                        <button
                          key={emoji}
                          onClick={() => handleToggleReaction(post, emoji)}
                          className="kw-btn kw-btn-ghost text-xs py-1 px-2 h-7 rounded-md"
                          title={`React with ${emoji}`}
                        >
                          <span>{emoji}</span>
                          {count > 0 && <span className="ml-1 font-semibold text-[10px]">{count}</span>}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() => setActiveCommentPostId(isCommentsOpen ? null : post.id)}
                    className="text-xs text-[var(--fg-muted)] hover:text-[var(--fg)] flex items-center gap-1.5"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>
                      {(post.comments || []).length > 0
                        ? `${post.comments?.length} ${
                            post.comments?.length === 1 ? 'comment' : 'comments'
                          }`
                        : 'Reply'}
                    </span>
                  </button>
                </div>

                {/* Comments thread */}
                {isCommentsOpen && (
                  <div className="mt-3 pt-3 space-y-3 bg-[var(--bg-subtle)] p-4 rounded-xl">
                    {post.comments && post.comments.length > 0 && (
                      <div className="space-y-2 mb-3">
                        {post.comments.map(c => (
                          <div key={c.id} className="text-xs bg-[var(--card)] p-3 rounded-lg border border-[var(--card-border)]">
                            <div className="flex items-center justify-between text-[11px] text-[var(--fg-subtle)] mb-1">
                              <span className="font-semibold text-[var(--fg)]">{c.author_name}</span>
                              <span>{formatTimeAgo(c.created_at)}</span>
                            </div>
                            <p className="text-[var(--fg-muted)]">{c.body}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {currentProfile && (
                      <div className="flex gap-2">
                        <input
                          type="text"
                          placeholder="Write a reply or offer to collaborate..."
                          value={commentText}
                          onChange={e => setCommentText(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddComment(post);
                            }
                          }}
                          className="kw-input text-xs flex-1"
                        />
                        <button
                          onClick={() => handleAddComment(post)}
                          disabled={!commentText.trim()}
                          className="kw-btn kw-btn-gold text-xs py-1 px-3 font-semibold"
                        >
                          Reply
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
