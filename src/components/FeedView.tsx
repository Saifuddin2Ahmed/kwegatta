import React, { useState } from 'react';
import { Sparkles, Send, Users, X, MessageSquare, Lightbulb, MessageCircle, ThumbsUp, Rocket, Heart } from 'lucide-react';
import { Profile, Post } from '../types';
import { classifyPostWithGemma, db, extractKeywords, intersection, reactToPost, addPostComment, deletePostComment } from '../services/api';
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

  const reactionConfigs = [
    { type: 'like', label: 'Like', icon: ThumbsUp },
    { type: 'launch', label: 'Launch', icon: Rocket },
    { type: 'love', label: 'Love', icon: Heart },
    { type: 'idea', label: 'Idea', icon: Lightbulb },
  ] as const;

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
        reaction_counts: { like: 0, launch: 0, love: 0, idea: 0 },
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

  const handleToggleReaction = async (post: Post, type: string) => {
    if (!currentProfile) return;
    const prevCounts = post.reaction_counts ? { ...post.reaction_counts } : { like: 0, launch: 0, love: 0, idea: 0 };
    const prevMyReaction = post.my_reaction || null;

    const newCounts = { ...prevCounts };
    let newMyReaction: string | null = type;
    if (prevMyReaction === type) {
      newMyReaction = null;
      newCounts[type as keyof typeof newCounts] = Math.max(0, newCounts[type as keyof typeof newCounts] - 1);
    } else {
      if (prevMyReaction) {
        newCounts[prevMyReaction as keyof typeof newCounts] = Math.max(0, newCounts[prevMyReaction as keyof typeof newCounts] - 1);
      }
      newCounts[type as keyof typeof newCounts] = (newCounts[type as keyof typeof newCounts] || 0) + 1;
    }

    const optimisticPost = { ...post, reaction_counts: newCounts, my_reaction: newMyReaction };
    onUpdatePost(optimisticPost);

    try {
      const res = await reactToPost(post.id, type);
      const updated = { ...post, reaction_counts: res.counts, my_reaction: res.my_reaction };
      onUpdatePost(updated);
    } catch (err) {
      onUpdatePost({ ...post, reaction_counts: prevCounts, my_reaction: prevMyReaction });
      console.error('Failed to react:', err);
    }
  };

  const handleAddComment = async (post: Post) => {
    if (!currentProfile || !commentText.trim()) return;
    const textToSubmit = commentText.trim();
    setCommentText('');

    try {
      const resComment = await addPostComment(post.id, textToSubmit);
      const comments = [...(post.comments || []), resComment];
      const updated = { ...post, comments };
      onUpdatePost(updated);
    } catch (err) {
      console.error('Failed to add comment:', err);
    }
  };

  const handleDeleteComment = async (post: Post, commentId: string) => {
    const prevComments = [...(post.comments || [])];
    const comments = prevComments.filter(c => c.id !== commentId);
    onUpdatePost({ ...post, comments });
    try {
      await deletePostComment(post.id, commentId);
    } catch (err) {
      onUpdatePost({ ...post, comments: prevComments });
      console.error('Failed to delete comment', err);
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
    <div className="kw-container space-y-6 md:space-y-10">
      
      {/* Create post box */}
      {currentProfile && (
        <div className="p-5 rounded-xl border border-[var(--card-border)] bg-[var(--card)] space-y-3">
          <form onSubmit={handleSubmitPost} className="space-y-3">
            <div className="flex gap-3 items-start">
              <Avatar profile={currentProfile} className="w-8 h-8 flex-shrink-0" />
              <textarea
                aria-label="Write a post"
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
              <span className="text-[13px] text-[var(--fg-subtle)] flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[var(--gold-text)]" />
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
          <div className="flex items-center gap-1 text-xs text-[var(--gold-text)]">
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
          <div className="py-16 text-center space-y-4">
            <MessageSquare className="w-8 h-8 text-[var(--gold-text)] mx-auto opacity-70" />
            <h3 className="font-semibold text-base text-[var(--fg)]">No posts on the wall yet</h3>
            <p className="text-[13px] text-[var(--fg-muted)] max-w-sm mx-auto">
              Share what you are building or ask the community for skills and collaboration.
            </p>
            <div>
              <button
                type="button"
                onClick={() => {
                  const composer = document.querySelector('textarea');
                  composer?.focus();
                }}
                className="kw-btn kw-btn-primary text-[13px] py-1.5 px-4 font-semibold cursor-pointer"
              >
                Create a post
              </button>
            </div>
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
                        className="font-semibold text-xs text-[var(--fg)] hover:text-[var(--gold-text)] transition-colors text-left"
                      >
                        {author.name}
                      </button>
                      <span className="text-[13px] text-[var(--fg-subtle)] ml-2">
                        {formatTimeAgo(post.created_at)}
                      </span>
                    </div>
                  </div>

                  <span className="text-[13px] font-medium text-[var(--gold-text)] capitalize">
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
                    <Users className="w-3.5 h-3.5 text-[var(--teal-text)] flex-shrink-0" />
                    <span className="text-[var(--fg-subtle)]">In room who could help:</span>
                    {helpers.map((helper, idx) => (
                      <React.Fragment key={helper.id}>
                        <button
                          onClick={() => onViewProfile(helper.id)}
                          className="font-medium text-[var(--fg)] hover:text-[var(--gold-text)] transition-colors inline-flex items-center gap-1.5"
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
                            className="text-emerald-400 hover:underline text-[13px]"
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
                    {reactionConfigs.map(({ type, label, icon: Icon }) => {
                      const count = post.reaction_counts?.[type as keyof typeof post.reaction_counts] || 0;
                      const isSelected = post.my_reaction === type;
                      return (
                        <button
                          key={type}
                          onClick={() => {
                            if (!currentProfile) return;
                            handleToggleReaction(post, type);
                          }}
                          disabled={!currentProfile}
                          aria-label={label}
                          aria-pressed={isSelected}
                          className={`kw-btn kw-btn-ghost text-xs py-1 px-2 h-7 rounded-md flex items-center gap-1 transition-colors ${
                            isSelected ? 'text-[var(--gold-text)] font-medium bg-[var(--gold-bg)]' : 'text-[var(--fg-subtle)] hover:text-[var(--fg)]'
                          }`}
                          title={!currentProfile ? "Sign in to react" : `React with ${label}`}
                        >
                          <Icon className={`w-3.5 h-3.5 ${isSelected ? 'fill-current text-[var(--gold-text)]' : ''}`} />
                          {count > 0 && <span className="font-semibold text-[13px]">{count}</span>}
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
                            <div className="flex items-center justify-between text-[13px] text-[var(--fg-subtle)] mb-1">
                              <span className="font-semibold text-[var(--fg)]">{c.author_name}</span>
                              <div className="flex items-center gap-2">
                                <span>{formatTimeAgo(c.created_at)}</span>
                                {currentProfile && (currentProfile.id === c.author_id || currentProfile.id === post.author_id || currentProfile.is_admin) && (
                                  <button
                                    onClick={() => handleDeleteComment(post, c.id)}
                                    className="text-[var(--fg-subtle)] hover:text-red-500 text-[11px] transition-colors"
                                    title="Delete comment"
                                  >
                                    Delete
                                  </button>
                                )}
                              </div>
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
                          aria-label="Write a reply"
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
