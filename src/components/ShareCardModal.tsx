import React, { useRef, useEffect, useState } from 'react';
import { X, Download, Share2, Sparkles, Check, QrCode } from 'lucide-react';
import { Profile } from '../types';
import { generateQrCodeDataUrl } from '../utils';

interface ShareCardModalProps {
  profile: Profile;
  isOpen: boolean;
  onClose: () => void;
  onToast: (msg: string) => void;
}

export const ShareCardModal: React.FC<ShareCardModalProps> = ({
  profile,
  isOpen,
  onClose,
  onToast
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [dataUrl, setDataUrl] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState(true);

  useEffect(() => {
    if (!isOpen) return;

    let isMounted = true;
    const renderCard = async () => {
      setIsGenerating(true);
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const width = 1200;
      const height = 630;
      canvas.width = width;
      canvas.height = height;

      // 1. Background (Obsidian deep dark gradient)
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      bgGrad.addColorStop(0, '#090D16');
      bgGrad.addColorStop(0.5, '#0E1424');
      bgGrad.addColorStop(1, '#080B12');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Gold Glow in top-right
      const glowGrad = ctx.createRadialGradient(900, 150, 20, 900, 150, 450);
      glowGrad.addColorStop(0, 'rgba(245, 183, 0, 0.18)');
      glowGrad.addColorStop(1, 'rgba(245, 183, 0, 0)');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, width, height);

      // Decorative border
      ctx.strokeStyle = 'rgba(245, 183, 0, 0.3)';
      ctx.lineWidth = 2;
      ctx.strokeRect(24, 24, width - 48, height - 48);

      // 2. Kwegatta Brand Header
      ctx.fillStyle = '#F5B700';
      ctx.font = 'bold 28px "Space Grotesk", sans-serif';
      ctx.fillText('KWEGATTA', 64, 80);

      ctx.fillStyle = 'rgba(240, 243, 246, 0.6)';
      ctx.font = '16px "Inter", sans-serif';
      ctx.fillText('Open Collaboration & Matchmaking', 230, 80);

      // 3. Member Avatar
      const avatarSize = 150;
      const avatarX = 64;
      const avatarY = 130;

      // Draw Avatar Photo or Fallback Initial
      if (profile.avatar && (profile.avatar.startsWith('data:') || profile.avatar.startsWith('http'))) {
        try {
          const img = new Image();
          img.crossOrigin = 'anonymous';
          img.src = profile.avatar;
          await new Promise((resolve) => {
            img.onload = resolve;
            img.onerror = resolve;
          });
          ctx.save();
          ctx.beginPath();
          ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(img, avatarX, avatarY, avatarSize, avatarSize);
          ctx.restore();
        } catch (_) {
          // fallback circle
          ctx.fillStyle = '#1D2433';
          ctx.beginPath();
          ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = '#1E293B';
        ctx.beginPath();
        ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#F5B700';
        ctx.font = 'bold 64px "Space Grotesk", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const initial = (profile.name || 'K').charAt(0).toUpperCase();
        ctx.fillText(initial, avatarX + avatarSize / 2, avatarY + avatarSize / 2);
        ctx.textAlign = 'start';
        ctx.textBaseline = 'alphabetic';
      }

      // Avatar gold ring
      ctx.strokeStyle = '#F5B700';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(avatarX + avatarSize / 2, avatarY + avatarSize / 2, avatarSize / 2 + 2, 0, Math.PI * 2);
      ctx.stroke();

      // 4. Member Info (Name, Role, Location)
      const textX = avatarX + avatarSize + 36;
      ctx.fillStyle = '#F0F3F6';
      ctx.font = 'bold 44px "Space Grotesk", sans-serif';
      ctx.fillText(profile.name, textX, 175);

      // Role Pill
      const roleText = (profile.roles && profile.roles.length ? profile.roles.join(' · ') : profile.role) || 'Member';
      ctx.font = 'bold 18px "Inter", sans-serif';
      const roleWidth = ctx.measureText(roleText).width + 24;
      ctx.fillStyle = 'rgba(245, 183, 0, 0.15)';
      ctx.fillRect(textX, 200, roleWidth, 34);
      ctx.strokeStyle = '#F5B700';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(textX, 200, roleWidth, 34);
      ctx.fillStyle = '#F5B700';
      ctx.fillText(roleText, textX + 12, 224);

      if (profile.location) {
        ctx.fillStyle = '#8B949E';
        ctx.font = '16px "Inter", sans-serif';
        ctx.fillText(`📍 ${profile.location}`, textX + roleWidth + 18, 223);
      }

      // 5. Headline & Bio
      ctx.fillStyle = '#E2E8F0';
      ctx.font = '22px "Inter", sans-serif';
      const headline = profile.headline || profile.bio || (profile.offers ? `Offers: ${profile.offers}` : 'Collaborator on Kwegatta');
      const truncatedHeadline = headline.length > 80 ? headline.slice(0, 77) + '...' : headline;
      ctx.fillText(truncatedHeadline, 64, 340);

      // Offers / Needs Summary
      if (profile.offers) {
        ctx.fillStyle = '#F5B700';
        ctx.font = 'bold 16px "Inter", sans-serif';
        ctx.fillText('OFFERS:', 64, 385);
        ctx.fillStyle = '#94A3B8';
        ctx.font = '16px "Inter", sans-serif';
        const offText = profile.offers.length > 70 ? profile.offers.slice(0, 67) + '...' : profile.offers;
        ctx.fillText(offText, 145, 385);
      }

      if (profile.needs) {
        ctx.fillStyle = '#38BDF8';
        ctx.font = 'bold 16px "Inter", sans-serif';
        ctx.fillText('NEEDS:', 64, 420);
        ctx.fillStyle = '#94A3B8';
        ctx.font = '16px "Inter", sans-serif';
        const needText = profile.needs.length > 70 ? profile.needs.slice(0, 67) + '...' : profile.needs;
        ctx.fillText(needText, 135, 420);
      }

      // 6. Tags Pills
      const tags = (profile.tags || []).slice(0, 4);
      let tagX = 64;
      for (const tag of tags) {
        ctx.font = '14px "Inter", sans-serif';
        const tagW = ctx.measureText(`#${tag}`).width + 20;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.fillRect(tagX, 465, tagW, 28);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1;
        ctx.strokeRect(tagX, 465, tagW, 28);
        ctx.fillStyle = '#E2E8F0';
        ctx.fillText(`#${tag}`, tagX + 10, 484);
        tagX += tagW + 10;
      }

      // 7. QR Code (Right Side)
      const qrSize = 170;
      const qrX = width - qrSize - 64;
      const qrY = height - qrSize - 64;

      const profileUrl = `${window.location.origin}${window.location.pathname}#/u/${profile.id}`;
      const qrData = await generateQrCodeDataUrl(profileUrl, 240);

      const qrImg = new Image();
      qrImg.src = qrData;
      await new Promise((resolve) => {
        qrImg.onload = resolve;
        qrImg.onerror = resolve;
      });

      // White background card for QR Code
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(qrX - 12, qrY - 12, qrSize + 24, qrSize + 24);
      ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);

      ctx.fillStyle = '#F0F3F6';
      ctx.font = 'bold 14px "Space Grotesk", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Scan to Connect', qrX + qrSize / 2, qrY + qrSize + 28);
      ctx.textAlign = 'start';

      // Footer notice
      ctx.fillStyle = 'rgba(240, 243, 246, 0.4)';
      ctx.font = '13px "Inter", sans-serif';
      ctx.fillText('kwegatta.ai.studio · Kampala, Uganda', 64, height - 48);

      if (isMounted) {
        setDataUrl(canvas.toDataURL('image/png'));
        setIsGenerating(false);
      }
    };

    renderCard();
    return () => {
      isMounted = false;
    };
  }, [isOpen, profile]);

  if (!isOpen) return null;

  const handleDownload = () => {
    if (!dataUrl) return;
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `kwegatta-${profile.name.toLowerCase().replace(/\s+/g, '-')}-card.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    onToast('Profile share card downloaded!');
  };

  const handleShare = async () => {
    const profileUrl = `${window.location.origin}${window.location.pathname}#/u/${profile.id}`;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${profile.name} on Kwegatta`,
          text: `Check out ${profile.name}'s collaboration profile on Kwegatta: ${profile.headline || profile.role}`,
          url: profileUrl
        });
        onToast('Shared profile successfully!');
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          navigator.clipboard.writeText(profileUrl);
          onToast('Profile link copied to clipboard!');
        }
      }
    } else {
      navigator.clipboard.writeText(profileUrl);
      onToast('Profile link copied to clipboard!');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in">
      <div className="kw-card max-w-2xl w-full p-5 sm:p-6 bg-[var(--card)] border border-[var(--card-border)] rounded-2xl shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-[var(--card-border)]/60 pb-3">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[var(--gold)]" />
            <h3 className="text-base sm:text-lg font-bold font-display text-[var(--fg)]">
              Share Profile Card
            </h3>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--fg-muted)] hover:text-[var(--fg)] p-1 rounded-lg cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative rounded-xl overflow-hidden border border-[var(--card-border)] bg-black aspect-[1200/630] shadow-inner">
          <canvas ref={canvasRef} className="w-full h-full object-contain" />
          {isGenerating && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center text-xs text-[var(--gold)] font-semibold gap-2">
              <span className="w-4 h-4 border-2 border-[var(--gold)] border-t-transparent rounded-full animate-spin" />
              <span>Generating high-res card (1200 × 630)...</span>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <p className="text-xs text-[var(--fg-muted)]">
            High-res preview ready for LinkedIn, WhatsApp & X social posts.
          </p>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={handleShare}
              className="flex-1 sm:flex-initial kw-btn kw-btn-ghost text-xs py-2 px-3.5 flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Share2 className="w-4 h-4" />
              <span>Share Link</span>
            </button>
            <button
              onClick={handleDownload}
              disabled={isGenerating || !dataUrl}
              className="flex-1 sm:flex-initial kw-btn kw-btn-gold text-xs py-2 px-4 flex items-center justify-center gap-1.5 font-bold cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>Download Card (PNG)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
