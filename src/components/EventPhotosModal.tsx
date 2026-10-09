import React, { useState } from 'react';
import { X, Upload, Check, Camera, AlertCircle, Loader2 } from 'lucide-react';
import { useEventPhotos, setInMemoryPreview } from '../hooks/useEventPhotos';

interface EventPhotosModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPhotoUploaded?: () => void;
}

export const EventPhotosModal: React.FC<EventPhotosModalProps> = ({
  isOpen,
  onClose,
  onPhotoUploaded
}) => {
  const photos = useEventPhotos();
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleFileChange = async (slot: 'hero' | 'hall' | 'team', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingSlot(slot);
    setErrorMsg(null);
    setSuccessMsg(null);

    // 1. Instant preview
    try {
      const objectUrl = URL.createObjectURL(file);
      setInMemoryPreview(slot, objectUrl);
    } catch (_) {}

    // 2. Read file to base64 and upload to server disk
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      try {
        const token = sessionStorage.getItem('kw_admin_token') || '';
        const res = await fetch('/api/upload-photo', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-admin-token': token
          },
          body: JSON.stringify({ slot, dataUrl })
        });

        if (!res.ok) {
          const errData = await res.json();
          throw new Error(errData.error || 'Failed to save photo to server');
        }

        // Clean out any bloated storage keys to keep localStorage healthy
        try {
          localStorage.removeItem('kw_photo_hero');
          localStorage.removeItem('kw_photo_hall');
          localStorage.removeItem('kw_photo_team');
          localStorage.setItem('kw_photos_version', String(Date.now()));
        } catch (_) {}

        window.dispatchEvent(new Event('kw-photos-updated'));
        setSuccessMsg(`Photo updated successfully.`);
        if (onPhotoUploaded) onPhotoUploaded();
      } catch (err: any) {
        console.error('Upload error:', err);
        setErrorMsg(err.message || 'An error occurred while uploading the photo');
      } finally {
        setUploadingSlot(null);
      }
    };

    reader.onerror = () => {
      setErrorMsg('Could not read image file from your device');
      setUploadingSlot(null);
    };

    reader.readAsDataURL(file);
  };

  const slots = [
    {
      id: 'hero' as const,
      title: 'Hero Team Coding Photo',
      desc: 'Close-up of the team working on laptops at Hack Day Kampala',
      current: photos.hero
    },
    {
      id: 'hall' as const,
      title: 'Event Hall Photo',
      desc: 'Wide view of the EIIC Innovation Centre at MUBS',
      current: photos.hall
    },
    {
      id: 'team' as const,
      title: 'Collaborators Photo',
      desc: 'Photo of team members and attendees building together',
      current: photos.team
    }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in">
      <div className="relative w-full max-w-2xl bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-2xl p-6 sm:p-8 space-y-6 max-h-[90vh] overflow-y-auto">
        
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-[var(--card-border)] pb-4">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--gold-text)] mb-1">
              <Camera className="w-3.5 h-3.5" />
              <span>Admin Photo Manager</span>
            </div>
            <h3 className="text-xl font-display font-bold text-[var(--fg)]">
              Update Authentic Event Photos
            </h3>
            <p className="text-xs text-[var(--fg-muted)] mt-1">
              Upload original camera photos directly. Images are saved to disk with zero cloud latency and no client quota usage.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[var(--fg-muted)] hover:text-[var(--fg)] hover:bg-[var(--bg-subtle)] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Status alerts */}
        {successMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center gap-2">
            <Check className="w-4 h-4 flex-shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Photo Slots Grid */}
        <div className="space-y-4">
          {slots.map(slot => (
            <div
              key={slot.id}
              className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)] flex flex-col sm:flex-row items-center gap-4 justify-between"
            >
              <div className="flex items-center gap-3.5 w-full sm:w-auto">
                <img
                  src={slot.current}
                  alt={slot.title}
                  className="w-16 h-12 rounded-lg object-cover border border-[var(--card-border)] flex-shrink-0"
                  referrerPolicy="no-referrer"
                />
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-[var(--fg)] truncate">{slot.title}</h4>
                  <p className="text-xs text-[var(--fg-muted)] line-clamp-1">{slot.desc}</p>
                </div>
              </div>

              <label className="kw-btn kw-btn-ghost text-xs py-2 px-3.5 flex items-center gap-1.5 cursor-pointer flex-shrink-0 w-full sm:w-auto justify-center">
                {uploadingSlot === slot.id ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Upload className="w-3.5 h-3.5 text-[var(--gold-text)]" />
                    <span>Upload New</span>
                  </>
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={e => handleFileChange(slot.id, e)}
                  disabled={uploadingSlot !== null}
                  hidden
                />
              </label>
            </div>
          ))}
        </div>

        <div className="pt-2 border-t border-[var(--card-border)] flex justify-end">
          <button
            onClick={onClose}
            className="kw-btn text-xs py-2 px-4"
          >
            Done
          </button>
        </div>

      </div>
    </div>
  );
};
