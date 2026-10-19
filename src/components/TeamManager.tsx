import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Camera,
  Edit2,
  Eye,
  EyeOff,
  Github,
  Link2,
  Linkedin,
  Plus,
  Search,
  Trash2,
  UserCheck,
  X
} from 'lucide-react';
import { TeamMember } from '../types';
import {
  createTeamMember,
  deleteTeamMember,
  reorderTeamMembers,
  searchTeamProfiles,
  updateTeamMember,
  updateTeamSettings,
  uploadTeamMemberPhoto
} from '../services/api';
import { TEAM_LIMITS, TEAM_PHOTO_MAX_BYTES, TEAM_PHOTO_TYPES, validateTeamPayload } from '../lib/teamFields';
import { useDialogA11y } from '../hooks/useDialogA11y';

type TeamForm = {
  name: string;
  title: string;
  line1: string;
  line2: string;
  bio: string;
  github: string;
  linkedin: string;
  x: string;
  website: string;
  whatsapp: string;
  team_since: string;
  linked_profile_id: string;
  hidden: boolean;
  show_title: boolean;
  show_line1: boolean;
  show_bio: boolean;
  show_linkedin: boolean;
  show_x: boolean;
  show_website: boolean;
  show_whatsapp: boolean;
  show_since: boolean;
};

const EMPTY_FORM: TeamForm = {
  name: '',
  title: '',
  line1: '',
  line2: '',
  bio: '',
  github: '',
  linkedin: '',
  x: '',
  website: '',
  whatsapp: '',
  team_since: '',
  linked_profile_id: '',
  hidden: false,
  show_title: true,
  show_line1: false,
  show_bio: false,
  show_linkedin: false,
  show_x: false,
  show_website: false,
  show_whatsapp: false,
  show_since: false
};

const VISIBLE_LABELS: Array<[keyof TeamMember, string]> = [
  ['show_title', 'Role'],
  ['show_line1', 'Background'],
  ['show_bio', 'Bio'],
  ['show_linkedin', 'LinkedIn'],
  ['show_x', 'X'],
  ['show_website', 'Website'],
  ['show_whatsapp', 'WhatsApp'],
  ['show_since', 'Since']
];

function formFromMember(m: TeamMember): TeamForm {
  return {
    name: m.name || '',
    title: m.title || '',
    line1: m.line1 || '',
    line2: m.line2 || '',
    bio: m.bio || '',
    github: m.github || '',
    linkedin: m.linkedin || '',
    x: m.x || '',
    website: m.website || '',
    whatsapp: m.whatsapp || '',
    team_since: m.team_since || '',
    linked_profile_id: m.linked_profile_id || '',
    hidden: Boolean(m.hidden),
    show_title: Boolean(m.show_title),
    show_line1: Boolean(m.show_line1),
    show_bio: Boolean(m.show_bio),
    show_linkedin: Boolean(m.show_linkedin),
    show_x: Boolean(m.show_x),
    show_website: Boolean(m.show_website),
    show_whatsapp: Boolean(m.show_whatsapp),
    show_since: Boolean(m.show_since)
  };
}

function initials(name: string): string {
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

export function memberPhotoSrc(m: TeamMember): string | null {
  return m.photo_url || m.photo || m.linked_avatar || null;
}

/** Returns an error for a picked photo file, or null when it can be uploaded. */
export function checkPhotoFile(file: { type: string; size: number }): string | null {
  if (!(TEAM_PHOTO_TYPES as readonly string[]).includes(file.type)) return 'Photo must be a JPEG, PNG, WebP or GIF image';
  if (file.size > TEAM_PHOTO_MAX_BYTES) return 'Photo must be 5 MB or smaller';
  return null;
}

interface TeamManagerProps {
  team: TeamMember[];
  detailsEnabled: boolean;
  onDetailsEnabledChange: (enabled: boolean) => void;
  onChanged: () => Promise<void> | void;
  onToast: (msg: string) => void;
}

export const TeamManager: React.FC<TeamManagerProps> = ({ team, detailsEnabled, onDetailsEnabledChange, onChanged, onToast }) => {
  const [list, setList] = useState<TeamMember[]>(team);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState<TeamForm>(EMPTY_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<TeamMember | null>(null);
  const [linkQuery, setLinkQuery] = useState('');
  const [linkResults, setLinkResults] = useState<Array<{ id: string; name: string; headline: string; avatar_url: string | null }>>([]);
  const [linkedName, setLinkedName] = useState('');
  const [dragId, setDragId] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => setList(team), [team]);

  const closeForm = () => {
    setIsFormOpen(false);
    setEditing(null);
    setErrors({});
  };
  const formRef = useDialogA11y<HTMLDivElement>(isFormOpen, closeForm);
  const confirmRef = useDialogA11y<HTMLDivElement>(Boolean(confirmDelete), () => setConfirmDelete(null));

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setErrors({});
    setLinkQuery('');
    setLinkResults([]);
    setLinkedName('');
    setIsFormOpen(true);
  };

  const openEdit = (m: TeamMember) => {
    setEditing(m);
    setForm(formFromMember(m));
    setErrors({});
    setLinkQuery('');
    setLinkResults([]);
    setLinkedName(m.linked_profile?.name || (m.linked_profile_id ? m.linked_profile_id : ''));
    setIsFormOpen(true);
  };

  const set = <K extends keyof TeamForm>(key: K, value: TeamForm[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
    if (errors[key as string]) setErrors(prev => ({ ...prev, [key as string]: '' }));
  };

  const onLinkSearch = (q: string) => {
    setLinkQuery(q);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.trim().length < 2) {
      setLinkResults([]);
      return;
    }
    searchTimer.current = setTimeout(async () => {
      setLinkResults(await searchTeamProfiles(q.trim()));
    }, 250);
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const checked = validateTeamPayload(form as unknown as Record<string, unknown>, true);
    if (!checked.ok) {
      setErrors(checked.errors);
      onToast(Object.values(checked.errors)[0]);
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await updateTeamMember(editing.id, form);
        onToast(`Saved ${form.name}`);
      } else {
        await createTeamMember(form);
        onToast(`Added ${form.name} to the team`);
      }
      closeForm();
      await onChanged();
    } catch (err: any) {
      if (err?.fields) setErrors(err.fields);
      onToast(err?.message || 'Could not save this team member');
    } finally {
      setSaving(false);
    }
  };

  const persistOrder = async (next: TeamMember[]) => {
    const prev = list;
    setList(next);
    try {
      await reorderTeamMembers(next.map(m => m.id));
      onToast('Team order saved');
      await onChanged();
    } catch (err: any) {
      setList(prev);
      onToast('Could not save the new order: ' + (err?.message || err));
    }
  };

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    persistOrder(next);
  };

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const next = [...list];
    const from = next.findIndex(m => m.id === dragId);
    const to = next.findIndex(m => m.id === targetId);
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setDragId(null);
    persistOrder(next);
  };

  const toggleHidden = async (m: TeamMember) => {
    setBusyId(m.id);
    try {
      await updateTeamMember(m.id, { hidden: !m.hidden });
      onToast(m.hidden ? `${m.name} is shown on the Team page` : `${m.name} is hidden from the Team page`);
      await onChanged();
    } catch (err: any) {
      onToast('Could not change visibility: ' + (err?.message || err));
    } finally {
      setBusyId(null);
    }
  };

  const doDelete = async () => {
    const m = confirmDelete;
    if (!m) return;
    setConfirmDelete(null);
    setBusyId(m.id);
    try {
      await deleteTeamMember(m.id);
      onToast(`Removed ${m.name} from the team`);
      await onChanged();
    } catch (err: any) {
      onToast('Could not remove team member: ' + (err?.message || err));
    } finally {
      setBusyId(null);
    }
  };

  const uploadPhoto = (m: TeamMember, file: File) => {
    const problem = checkPhotoFile(file);
    if (problem) {
      onToast(problem);
      return;
    }
    setBusyId(m.id);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        await uploadTeamMemberPhoto(m.id, String(reader.result));
        onToast('Photo updated');
        await onChanged();
      } catch (err: any) {
        onToast('Could not upload photo: ' + (err?.message || err));
      } finally {
        setBusyId(null);
      }
    };
    reader.onerror = () => {
      setBusyId(null);
      onToast('Could not read that file');
    };
    reader.readAsDataURL(file);
  };

  const removePhoto = async (m: TeamMember) => {
    if (!window.confirm(`Remove the photo for ${m.name}? Their initials will be shown instead.`)) return;
    setBusyId(m.id);
    try {
      await updateTeamMember(m.id, { photo: '' });
      onToast('Photo removed');
      await onChanged();
    } catch (err: any) {
      onToast('Could not remove photo: ' + (err?.message || err));
    } finally {
      setBusyId(null);
    }
  };

  const toggleDetails = async (next: boolean) => {
    setSettingsBusy(true);
    try {
      const res = await updateTeamSettings(next);
      onDetailsEnabledChange(res.team_details_enabled);
      onToast(res.team_details_enabled ? 'Team details are shown on the Team page' : 'Team details are hidden on the Team page');
    } catch (err: any) {
      onToast('Could not change the setting: ' + (err?.message || err));
    } finally {
      setSettingsBusy(false);
    }
  };

  const iconBtn =
    'p-2 rounded-lg border border-[var(--card-border)] text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--card-hover)] disabled:opacity-30 disabled:pointer-events-none cursor-pointer';

  const textField = (key: keyof TeamForm, label: string, opts: { max?: number; placeholder?: string; type?: string; show?: keyof TeamForm; textarea?: boolean; hint?: string } = {}) => {
    const id = `team-${String(key)}-input`;
    const err = errors[key as string];
    const value = String(form[key] ?? '');
    return (
      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <label htmlFor={id} className="block text-xs font-semibold text-[var(--fg)]">
            {label}
          </label>
          {opts.show && (
            <label className="inline-flex items-center gap-1.5 text-xs text-[var(--fg-muted)] cursor-pointer">
              <input
                type="checkbox"
                checked={Boolean(form[opts.show])}
                onChange={e => set(opts.show!, e.target.checked as never)}
                className="rounded border-[var(--card-border)] cursor-pointer"
              />
              <span>Show publicly</span>
            </label>
          )}
        </div>
        {opts.textarea ? (
          <textarea
            id={id}
            rows={3}
            maxLength={opts.max}
            value={value}
            onChange={e => set(key, e.target.value as never)}
            placeholder={opts.placeholder}
            aria-invalid={Boolean(err)}
            aria-describedby={err ? `${id}-error` : undefined}
            className="kw-input w-full py-2 px-3 rounded-lg text-xs"
          />
        ) : (
          <input
            id={id}
            type={opts.type || 'text'}
            maxLength={opts.max}
            value={value}
            onChange={e => set(key, e.target.value as never)}
            placeholder={opts.placeholder}
            aria-invalid={Boolean(err)}
            aria-describedby={err ? `${id}-error` : undefined}
            className="kw-input w-full py-2 px-3 rounded-lg text-xs"
          />
        )}
        <div className="flex justify-between gap-2 mt-0.5">
          {err ? (
            <p id={`${id}-error`} role="alert" className="text-[12px] text-rose-400 font-medium">{err}</p>
          ) : (
            <span className="text-[12px] text-[var(--fg-subtle)]">{opts.hint || ''}</span>
          )}
          {opts.max && <span className="text-[12px] text-[var(--fg-subtle)] shrink-0">{value.length}/{opts.max}</span>}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="p-4 sm:p-5 kw-card space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <UserCheck className="w-4 h-4 text-[var(--gold-text)]" />
              <h3 className="font-bold text-sm sm:text-base text-[var(--fg)]">Team page</h3>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[var(--gold-subtle)] text-[var(--gold-text)] font-semibold">
                {list.length} {list.length === 1 ? 'person' : 'people'}
              </span>
            </div>
            <p className="text-xs text-[var(--fg-muted)] mt-1">
              Add, edit, reorder (drag or arrows) and hide people on the public Team page. Every change is recorded in the audit log.
            </p>
          </div>
          <button type="button" onClick={openAdd} className="kw-btn kw-btn-gold text-xs py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 shrink-0">
            <Plus className="w-3.5 h-3.5" />
            <span>Add person</span>
          </button>
        </div>

        <div className="p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)] flex items-center justify-between gap-4">
          <div>
            <label htmlFor="team-details-enabled-switch" className="text-xs sm:text-sm font-semibold text-[var(--fg)] cursor-pointer block">
              Show team details on the Team page
            </label>
            <p className="text-xs text-[var(--fg-muted)] mt-0.5">
              Off: cards show only name, organisation and GitHub. On: each field marked "Show publicly" appears.
            </p>
          </div>
          <input
            id="team-details-enabled-switch"
            type="checkbox"
            role="switch"
            aria-checked={detailsEnabled}
            checked={detailsEnabled}
            disabled={settingsBusy}
            onChange={e => toggleDetails(e.target.checked)}
            className="w-4 h-4 rounded border-[var(--card-border)] cursor-pointer shrink-0"
          />
        </div>

        {list.length === 0 ? (
          <div className="text-center py-12 text-xs text-[var(--fg-muted)]">
            Nobody is on the Team page yet. Use "Add person" to add the first card.
          </div>
        ) : (
          <ol className="space-y-3" aria-label="Team members in display order">
            {list.map((m, index) => {
              const photo = memberPhotoSrc(m);
              const visible = VISIBLE_LABELS.filter(([k]) => Boolean(m[k])).map(([, label]) => label);
              return (
                <li
                  key={m.id}
                  draggable
                  onDragStart={() => setDragId(m.id)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => onDrop(m.id)}
                  onDragEnd={() => setDragId(null)}
                  className={`p-3.5 sm:p-4 rounded-xl border bg-[var(--card)] ${m.hidden ? 'border-dashed opacity-70' : ''} ${dragId === m.id ? 'ring-2 ring-[var(--gold)]' : 'border-[var(--card-border)]'}`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="flex flex-col items-center gap-1.5 shrink-0">
                        <div className="relative">
                          {photo ? (
                            <img src={photo} alt="" className="w-12 h-12 rounded-full object-cover border border-[var(--card-border)]" />
                          ) : (
                            <div aria-hidden="true" className="w-12 h-12 rounded-full bg-[var(--gold-subtle)] text-[var(--gold-text)] font-bold text-sm grid place-items-center border border-[var(--card-border)]">
                              {initials(m.name)}
                            </div>
                          )}
                          <label
                            className="absolute -bottom-1 -right-1 p-1.5 rounded-full bg-[var(--bg-elevated)] border border-[var(--card-border)] text-[var(--fg)] hover:text-[var(--gold-text)] cursor-pointer shadow-sm focus-within:ring-2 focus-within:ring-[var(--gold)]"
                            title={`Upload a photo for ${m.name}`}
                          >
                            <Camera className="w-3 h-3" aria-hidden="true" />
                            <span className="sr-only">Upload a photo for {m.name}</span>
                            <input
                              type="file"
                              accept={TEAM_PHOTO_TYPES.join(',')}
                              className="sr-only"
                              disabled={busyId === m.id}
                              onChange={e => {
                                const file = e.target.files?.[0];
                                e.target.value = '';
                                if (file) uploadPhoto(m, file);
                              }}
                            />
                          </label>
                        </div>
                        {(m.has_photo || m.photo) && (
                          <button type="button" onClick={() => removePhoto(m)} className="text-[12px] text-red-400 hover:underline cursor-pointer">
                            Remove photo
                          </button>
                        )}
                      </div>

                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-bold text-sm text-[var(--fg)] break-words">{m.name}</h4>
                          {m.hidden && <span className="text-[12px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-400 font-medium">Hidden</span>}
                          {m.linked_profile_id && (
                            <span className="text-[12px] px-1.5 py-0.5 rounded bg-[var(--teal-subtle)] text-[var(--teal-text)] font-medium">Linked profile</span>
                          )}
                        </div>
                        {m.title && <p className="text-xs font-medium text-[var(--teal-text)] break-words">{m.title}</p>}
                        {m.line2 && <p className="text-xs text-[var(--fg-subtle)] break-words">{m.line2}</p>}
                        <div className="flex flex-wrap items-center gap-3 pt-1 text-[12px] text-[var(--fg-muted)]">
                          {m.github && (
                            <span className="flex items-center gap-1">
                              <Github className="w-3 h-3" aria-hidden="true" />@{m.github}
                            </span>
                          )}
                          {m.linkedin && (
                            <span className="flex items-center gap-1">
                              <Linkedin className="w-3 h-3" aria-hidden="true" />LinkedIn
                            </span>
                          )}
                          {visible.length > 0 && <span>Public: {visible.join(' · ')}</span>}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 self-end sm:self-center shrink-0">
                      <button type="button" className={iconBtn} disabled={index === 0 || busyId === m.id} onClick={() => move(index, -1)} aria-label={`Move ${m.name} up`}>
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" className={iconBtn} disabled={index === list.length - 1 || busyId === m.id} onClick={() => move(index, 1)} aria-label={`Move ${m.name} down`}>
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        className={`${iconBtn} ${m.hidden ? 'text-amber-500' : ''}`}
                        disabled={busyId === m.id}
                        onClick={() => toggleHidden(m)}
                        aria-pressed={m.hidden}
                        aria-label={m.hidden ? `Show ${m.name} on the Team page` : `Hide ${m.name} from the Team page`}
                        title={m.hidden ? 'Show on Team page' : 'Hide from Team page'}
                      >
                        {m.hidden ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                      <button type="button" className={iconBtn} onClick={() => openEdit(m)} aria-label={`Edit ${m.name}`} title="Edit">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button type="button" className={`${iconBtn} text-red-400`} disabled={busyId === m.id} onClick={() => setConfirmDelete(m)} aria-label={`Remove ${m.name}`} title="Remove">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70" onClick={e => e.target === e.currentTarget && setConfirmDelete(null)}>
          <div ref={confirmRef} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby="team-delete-title" aria-describedby="team-delete-desc" className="kw-card w-full max-w-sm p-5 space-y-4">
            <h3 id="team-delete-title" className="font-bold text-base text-[var(--fg)]">Remove {confirmDelete.name}?</h3>
            <p id="team-delete-desc" className="text-xs text-[var(--fg-muted)]">
              Their card is deleted from the Team page. To keep it for later, use Hide instead.
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" onClick={() => setConfirmDelete(null)} className="kw-btn kw-btn-ghost text-xs py-2 px-4">
                Cancel
              </button>
              <button type="button" onClick={doDelete} className="kw-btn text-xs py-2 px-4 bg-red-600 text-white hover:bg-red-700">
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {isFormOpen && (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-3 sm:p-4 bg-black/70 overflow-y-auto">
          <div ref={formRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="team-form-title" className="kw-card w-full max-w-lg p-4 sm:p-6 space-y-4 my-6">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--card-border)] pb-3">
              <h3 id="team-form-title" className="font-bold text-base text-[var(--fg)] break-words min-w-0">
                {editing ? `Edit ${editing.name}` : 'Add a person to the team'}
              </h3>
              <button type="button" onClick={closeForm} aria-label="Close" className="p-1.5 rounded-lg text-[var(--fg-muted)] hover:text-[var(--fg)]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form noValidate onSubmit={save} className="space-y-3.5 text-xs">
              {textField('name', 'Full name *', { max: TEAM_LIMITS.name })}
              {textField('title', 'Role or title', { max: TEAM_LIMITS.title, placeholder: 'e.g. Frontend Developer', show: 'show_title' })}
              {textField('line2', 'Organisation or school', { max: TEAM_LIMITS.line2, hint: 'Always shown on the card' })}
              {textField('line1', 'Background', { max: TEAM_LIMITS.line1, placeholder: 'e.g. Software Engineering student', show: 'show_line1' })}
              {textField('bio', 'Short bio', { max: TEAM_LIMITS.bio, textarea: true, show: 'show_bio' })}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {textField('github', 'GitHub username', { placeholder: 'username', hint: 'Always shown when set' })}
                {textField('linkedin', 'LinkedIn link', { type: 'url', placeholder: 'https://www.linkedin.com/in/…', show: 'show_linkedin' })}
                {textField('x', 'X (Twitter)', { placeholder: '@handle or https://x.com/handle', show: 'show_x' })}
                {textField('website', 'Website', { type: 'url', placeholder: 'https://…', show: 'show_website' })}
              </div>
              {textField('whatsapp', 'WhatsApp number', { type: 'tel', placeholder: '+256 700 000000', show: 'show_whatsapp', hint: 'Include the country code' })}

              <div>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <label htmlFor="team-since-input" className="block text-xs font-semibold text-[var(--fg)]">On the team since</label>
                  <label className="inline-flex items-center gap-1.5 text-xs text-[var(--fg-muted)] cursor-pointer">
                    <input type="checkbox" checked={form.show_since} onChange={e => set('show_since', e.target.checked)} className="rounded cursor-pointer" />
                    <span>Show publicly</span>
                  </label>
                </div>
                <input id="team-since-input" type="month" value={form.team_since} onChange={e => set('team_since', e.target.value)} className="kw-input w-full py-2 px-3 rounded-lg text-xs" />
              </div>

              <div className="space-y-1.5">
                <label htmlFor="team-link-search" className="block text-xs font-semibold text-[var(--fg)]">Linked Kwegatta profile</label>
                {form.linked_profile_id ? (
                  <div className="flex items-center justify-between gap-2 p-2 rounded-lg border border-[var(--card-border)] bg-[var(--bg-subtle)]">
                    <span className="flex items-center gap-1.5 min-w-0 text-xs">
                      <Link2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                      <span className="truncate">{linkedName || form.linked_profile_id}</span>
                    </span>
                    <button type="button" onClick={() => { set('linked_profile_id', ''); setLinkedName(''); }} className="text-xs text-[var(--gold-text)] hover:underline shrink-0">
                      Unlink
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-subtle)]" aria-hidden="true" />
                    <input
                      id="team-link-search"
                      type="search"
                      value={linkQuery}
                      onChange={e => onLinkSearch(e.target.value)}
                      placeholder="Search members by name"
                      autoComplete="off"
                      className="kw-input w-full py-2 pl-8 pr-3 rounded-lg text-xs"
                    />
                    {linkResults.length > 0 && (
                      <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-[var(--card-border)] bg-[var(--card)]" aria-label="Matching profiles">
                        {linkResults.map(p => (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => {
                                set('linked_profile_id', p.id);
                                setLinkedName(p.name);
                                setLinkResults([]);
                                setLinkQuery('');
                              }}
                              className="w-full text-left px-3 py-2 text-xs hover:bg-[var(--card-hover)] focus:bg-[var(--card-hover)]"
                            >
                              <span className="font-semibold">{p.name}</span>
                              {p.headline && <span className="text-[var(--fg-muted)]"> · {p.headline.slice(0, 40)}</span>}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                <p className="text-[12px] text-[var(--fg-subtle)]">When linked, the name opens their profile, and their profile photo is used if no photo is uploaded here.</p>
              </div>

              <label className="flex items-center gap-2 pt-1 text-xs text-[var(--fg)] cursor-pointer">
                <input type="checkbox" checked={form.hidden} onChange={e => set('hidden', e.target.checked)} className="rounded cursor-pointer" />
                <span>Hide from the public Team page (keeps the card here)</span>
              </label>

              <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t border-[var(--card-border)]">
                <button type="button" onClick={closeForm} className="kw-btn kw-btn-ghost text-xs py-2 px-4 rounded-xl">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="kw-btn kw-btn-gold text-xs py-2 px-5 rounded-xl font-semibold">
                  {saving ? 'Saving…' : editing ? 'Save changes' : 'Add person'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
