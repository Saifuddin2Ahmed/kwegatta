import { Profile } from './types';

export function getInitials(name: string): string {
  const parts = String(name || '?')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function generateInitialsAvatar(name: string): string {
  const text = getInitials(name);
  const hue = [...String(name || '')].reduce((acc, char) => acc + char.charCodeAt(0), 0) % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="hsl(${hue},45%,40%)"/><text x="40" y="50" font-family="-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" font-size="28" font-weight="600" fill="#ffffff" text-anchor="middle">${text}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

export function getAvatarUrl(profile: Profile | null | undefined): string {
  if (!profile) return generateInitialsAvatar('?');
  // If the member uploaded or captured a photo, use it
  if (profile.avatar && typeof profile.avatar === 'string' && profile.avatar.trim().length > 0) {
    return profile.avatar;
  }
  // For members without a photo: always show clean SVG initials avatar
  return generateInitialsAvatar(profile.name || '?');
}

export function formatWhatsAppUrl(phoneNumber: string | undefined, message: string): string {
  if (!phoneNumber) return '';
  let digits = phoneNumber.replace(/\D/g, '');
  if (digits.length < 9) return '';

  // Handle Ugandan numbers (e.g. 0772 123456 -> 256772123456)
  if (digits.startsWith('0') && digits.length === 10) {
    digits = '256' + digits.slice(1);
  }

  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function formatTimeAgo(isoString: string): string {
  if (!isoString) return 'recently';
  const seconds = (Date.now() - new Date(isoString).getTime()) / 1000;
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export async function generateQrCodeDataUrl(text: string, width = 160): Promise<string> {
  try {
    const QRCode = (await import('qrcode')).default;
    return await QRCode.toDataURL(text, {
      width,
      margin: 1,
      color: {
        dark: '#010409',
        light: '#ffffff'
      }
    });
  } catch (err) {
    console.error('Failed to generate QR code', err);
    return '';
  }
}

export function resizeImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const size = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        return reject(new Error('Canvas context error'));
      }
      ctx.drawImage(
        img,
        (img.width - size) / 2,
        (img.height - size) / 2,
        size,
        size,
        0,
        0,
        256,
        256
      );
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Invalid image file'));
    };
    img.src = url;
  });
}

export function safeExternalUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed) || /^tel:/i.test(trimmed)) {
    return trimmed;
  }
  return null;
}

