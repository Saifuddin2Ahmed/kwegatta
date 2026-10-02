import React, { useState } from 'react';
import { Sparkles, Send, Users, X, MessageSquare, ThumbsUp, Rocket, Heart, Lightbulb, MessageCircle } from 'lucide-react';
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
      // Gemma 4 classifies post type, generates short title and 2-4 topic tags
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

    // Notify author if not commenting on own post
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

  const kindBadgeClass: Record<Post['kind'], string> = {
    idea: 'primer-label-purple',
    need: 'primer-label-amber',
    offer: 'primer-label-green',
    question: 'primer-label-blue'
  };

  const filteredPosts = posts
    .filter(p => kindFilter === 'all' || p.kind === kindFilter)
    .filter(p => !selectedTag || (p.tags || []).includes(selectedTag));

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Create post box styled like GitHub Discussion/Issue */}
      {currentProfile && (
        <div className="primer-box p-4 bg-[var(--subtle)] shadow-sm">
          <form onSubmit={handleSubmitPost} className="space-y-3">
            <div className="flex gap-2.5 items-start">
              <Avatar profile={currentProfile} className="w-8 h-8" />
              <textarea
                value={postContent}
                onChange={e => setPostContent(e.target.value)}
                placeholder="Share a hackathon idea, what you need built, or what you can offer..."
                rows={3}
                maxLength={500}
                className="primer-textarea text-xs flex-1"
                disabled={isSubmitting}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <span className="text-[11px] text-[var(--muted)] flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-[var(--done)]" />
                <span>Title, kind & tags auto-synthesized by Gemma 4</span>
              </span>

              <button
                type="submit"
                disabled={isSubmitting || postContent.trim().length < 8}
                className="primer-btn primer-btn-primary text-xs py-1 px-3.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Posting...' : 'Post to Feed'}</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Filter by Kind and Tag */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {(['all', 'idea', 'need', 'offer', 'question'] as const).map(k => (
            <button
              key={k}
              onClick={() => setKindFilter(k)}
              className={`primer-btn text-xs py-1 px-2.5 ${
                kindFilter === k ? 'primer-btn-primary' : ''
              }`}
            >
              {k === 'all' ? 'All posts' : k.charAt(0).toUpperCase() + k.slice(1) + 's'}
            </button>
          ))}
        </div>

        {selectedTag && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="primer-tag flex items-center gap-1 text-xs">
              <span>#{selectedTag}</span>
              <button onClick={() => onSelectTag(null)} aria-label="Clear filter">
                <X className="w-3 h-3" />
              </button>
            </span>
          </div>
        )}
      </div>

      {/* Posts List */}
      <div className="primer-box divide-y divide-[var(--border-muted)]">
        {filteredPosts.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <MessageSquare className="w-8 h-8 text-[var(--muted)] mx-auto opacity-40" />
            <h3 className="font-semibold text-sm">No posts found</h3>
            <p className="text-xs text-[var(--muted)]">
              Be the first to share an ask, offer, or project concept with the room!
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
              <div key={post.id} className="p-4 space-y-3">
                {/* Header row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => onViewProfile(author.id)}
                      className="flex-shrink-0"
                    >
                      <Avatar profile={author} className="w-7 h-7" />
                    </button>
                    <div>
                      <button
                        onClick={() => onViewProfile(author.id)}
                        className="font-semibold text-xs hover:text-[var(--accent)] text-left"
                      >
                        {author.name}
                      </button>
                      <span className="text-[11px] text-[var(--muted)] ml-2">
                        {formatTimeAgo(post.created_at)}
                      </span>
                    </div>
                  </div>

                  <span className={`primer-label ${kindBadgeClass[post.kind]} text-[10px]`}>
                    {post.kind}
                  </span>
                </div>

                {/* Title & Body */}
                {post.title && (
                  <h4 className="font-semibold text-sm text-[var(--fg)] leading-snug">{post.title}</h4>
                )}

                <p className="text-xs text-[var(--fg)] leading-relaxed whitespace-pre-wrap">
                  {post.body}
                </p>

                {/* Tags */}
                <div className="flex flex-wrap gap-1">
                  {post.tags?.map(t => (
                    <button
                      key={t}
                      onClick={() => onSelectTag(t)}
                      className="primer-tag text-[10px]"
                    >
                      #{t}
                    </button>
                  ))}
                </div>

                {/* Helpers Section: Gemma matching */}
                {helpers.length > 0 && (
                  <div className="pt-2 border-t border-[var(--border-muted)] text-[11px] text-[var(--muted)] flex items-center gap-2 flex-wrap bg-[var(--subtle)]/60 p-2 rounded">
                    <Users className="w-3.5 h-3.5 text-[var(--accent)] flex-shrink-0" />
                    <span>In room who could help:</span>
                    {helpers.map((helper, idx) => (
                      <React.Fragment key={helper.id}>
                        <button
                          onClick={() => onViewProfile(helper.id)}
                          className="font-medium text-[var(--accent)] hover:underline inline-flex items-center gap-1"
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
                            className="text-[var(--success)] hover:underline text-[10px]"
                            title="Message on WhatsApp"
                          >
                            <MessageCircle className="w-3 h-3 inline-block" />
                          </a>
                        )}
                        {idx < helpers.length - 1 && <span className="text-[var(--muted)]">·</span>}
                      </React.Fragment>
                    ))}
                  </div>
                )}

                {/* Reactions and Comments bar */}
                <div className="flex items-center justify-between pt-2 border-t border-[var(--border-muted)] text-xs">
                  <div className="flex items-center gap-1">
                    {(['👍', '🚀', '❤️', '💡'] as const).map(emoji => {
                      const count = post.reactions?.[emoji] || 0;
                      return (
                        <button
                          key={emoji}
                          onClick={() => handleToggleReaction(post, emoji)}
                          className="primer-btn text-[11px] py-0.5 px-2 h-6 rounded-full"
                          title={`React with ${emoji}`}
                        >
                          <span>{emoji}</span>
                          {count > 0 && <span className="ml-1 font-semibold text-[10px]">{count}</span>}
                        </button>
                      );
                    })}
                  </div>

                  <button
                    onClick={() =>
                      setActiveCommentPostId(isCommentsOpen ? null : post.id)
                    }
                    className="text-xs text-[var(--muted)] hover:text-[var(--fg)] flex items-center gap-1"
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

                {/* Expandable comments thread */}
                {isCommentsOpen && (
                  <div className="mt-3 pt-3 border-t border-[var(--border-muted)] space-y-2 bg-[var(--subtle)] p-3 rounded-md">
                    {post.comments && post.comments.length > 0 && (
                      <div className="space-y-2 mb-3">
                        {post.comments.map(c => (
                          <div key={c.id} className="text-xs bg-[var(--bg)] p-2 rounded border border-[var(--border-muted)]">
                            <div className="flex items-center justify-between text-[11px] text-[var(--muted)] mb-1">
                              <span className="font-semibold text-[var(--fg)]">{c.author_name}</span>
                              <span>{formatTimeAgo(c.created_at)}</span>
                            </div>
                            <p className="text-[var(--fg)]">{c.body}</p>
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
                          className="primer-input text-xs flex-1"
                        />
                        <button
                          onClick={() => handleAddComment(post)}
                          disabled={!commentText.trim()}
                          className="primer-btn primer-btn-primary text-xs py-1 px-3"
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
