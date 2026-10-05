import { useState, useEffect } from 'react';

// In-memory previews for instant zero-storage rendering
const inMemoryPreviews: Record<string, string> = {};

export function setInMemoryPreview(slot: 'hero' | 'hall' | 'team', url: string) {
  inMemoryPreviews[slot] = url;
  window.dispatchEvent(new Event('kw-photos-updated'));
}

// Clean up any old bloated data URLs from localStorage to prevent QuotaExceededError
try {
  localStorage.removeItem('kw_photo_hero');
  localStorage.removeItem('kw_photo_hall');
  localStorage.removeItem('kw_photo_team');
} catch (_) {}

function getPhotoUrls() {
  let version = '1';
  try {
    version = localStorage.getItem('kw_photos_version') || '1';
  } catch (_) {}

  return {
    hero: inMemoryPreviews.hero || `/images/table-coding-800.webp?v=${version}`,
    hall: inMemoryPreviews.hall || `/images/mubs-hall-800.webp?v=${version}`,
    team: inMemoryPreviews.team || `/images/team-session-800.webp?v=${version}`
  };
}

export function useEventPhotos() {
  const [photos, setPhotos] = useState(getPhotoUrls);

  useEffect(() => {
    const handleUpdate = () => {
      setPhotos(getPhotoUrls());
    };
    window.addEventListener('kw-photos-updated', handleUpdate);
    window.addEventListener('storage', handleUpdate);
    return () => {
      window.removeEventListener('kw-photos-updated', handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  return photos;
}
