import React from 'react';
import { ArrowLeft, Shield, Lock, Eye, Download, Trash2, Mail, ExternalLink } from 'lucide-react';

interface PrivacyViewProps {
  onBack: () => void;
}

export const PrivacyView: React.FC<PrivacyViewProps> = ({ onBack }) => {
  return (
    <div className="kw-container py-4 sm:py-8 space-y-6 md:space-y-10 animate-in fade-in">
      {/* Top back navigation */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="kw-btn kw-btn-ghost text-xs py-2 px-3 flex items-center gap-1.5 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back</span>
        </button>
        <span className="text-xs text-[var(--fg-muted)]">Aligned with the Digital Public Goods Standard</span>
      </div>

      {/* Header */}
      <div className="space-y-3 border-b border-[var(--card-border)] pb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[var(--gold-subtle)] text-[var(--gold-text)] text-xs font-semibold">
          <Shield className="w-3.5 h-3.5" />
          <span>Privacy Policy &amp; Data Handling</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-[var(--fg)] tracking-tight">
          Your Data, Your Control.
        </h1>
        <p className="text-sm text-[var(--fg-muted)] leading-relaxed max-w-2xl">
          <strong>Kwegatta</strong> is committed to open contact, transparency, and data minimization, designed to be <strong>Aligned with the Digital Public Goods Standard</strong> (self-assessed independent open-source compliance; does not imply formal third-party certification or endorsement). This document details exactly what data is collected, why, where it is stored, who can see it, and how members retain complete sovereignty over their personal information.
        </p>
      </div>

      {/* Section 1: Core Contact & Privacy Philosophy */}
      <section className="kw-card p-6 sm:p-8 bg-[var(--card)] border border-[var(--card-border)] rounded-2xl space-y-4">
        <div className="flex items-center gap-2.5 text-[var(--gold-text)]">
          <Eye className="w-5 h-5 flex-shrink-0" />
          <h2 className="text-lg font-bold text-[var(--fg)]">1. Core Contact &amp; Privacy Philosophy</h2>
        </div>
        <div className="space-y-3 text-xs sm:text-sm text-[var(--fg-muted)] leading-relaxed">
          <p>
            <strong className="text-[var(--fg)]">Open contact is the purpose of Kwegatta.</strong>
          </p>
          <ul className="list-disc pl-5 space-y-2">
            <li>
              <strong className="text-[var(--fg)]">Signed-in Members:</strong> Any signed-in member can view another member's WhatsApp number directly on their profile and connect with them in one tap. There is no artificial two-sided approval bottleneck.
            </li>
            <li>
              <strong className="text-[var(--fg)]">Privacy Toggle:</strong> During onboarding, we state clearly: <em>"Your WhatsApp number will be visible to other members."</em> Every member has an explicit toggle to hide their number if preferred (default is on / visible).
            </li>
            <li>
              <strong className="text-[var(--fg)]">Anonymous Protection:</strong> Unauthenticated or anonymous visitors never receive WhatsApp numbers, and the public API never returns phone numbers to anonymous callers.
            </li>
            <li>
              <strong className="text-[var(--fg)]">Security Hardening:</strong>
              <ul className="list-circle pl-5 mt-1 space-y-1">
                <li>No unauthenticated writes or deletes — members can modify or delete only their own profile.</li>
                <li>No identity spoofing through headers or unverified tokens.</li>
                <li>Rate-limiting across all public API routes and AI endpoints to prevent scraping and abuse.</li>
              </ul>
            </li>
          </ul>
        </div>
      </section>

      {/* Section 2: What Data We Collect */}
      <section className="kw-card p-6 sm:p-8 bg-[var(--card)] border border-[var(--card-border)] rounded-2xl space-y-4">
        <div className="flex items-center gap-2.5 text-[var(--teal-text)]">
          <Lock className="w-5 h-5 flex-shrink-0" />
          <h2 className="text-lg font-bold text-[var(--fg)]">2. What Data We Collect</h2>
        </div>
        <div className="space-y-4 text-xs sm:text-sm text-[var(--fg-muted)] leading-relaxed">
          <p>
            When you join Kwegatta, our conversational onboarding assistant collects only what is necessary to pair you with collaborators, mentors, and partners:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)] space-y-1.5">
              <h3 className="font-semibold text-[14px] text-[var(--fg)]">Identity and role</h3>
              <p className="text-[13px]">Full name, chosen roles (Founder, Business, Developer, Designer, Domain expert, Mentor, Student), location or Remote, and hours per week available.</p>
            </div>
            <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)] space-y-1.5">
              <h3 className="font-semibold text-[14px] text-[var(--fg)]">Collaboration needs</h3>
              <p className="text-[13px]">What you offer (skills, tools, market insight), what you need (partners or technical help), what you teach (mentoring), and what you learn.</p>
            </div>
            <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)] space-y-1.5">
              <h3 className="font-semibold text-[14px] text-[var(--fg)]">Links and profiles</h3>
              <p className="text-[13px]">Optional GitHub username (for coders), or LinkedIn / personal website (for business, founders, designers, and domain experts). Both strictly voluntary.</p>
            </div>
            <div className="p-4 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)] space-y-1.5">
              <h3 className="font-semibold text-[14px] text-[var(--fg)]">Direct WhatsApp</h3>
              <p className="text-[13px]">WhatsApp phone number provided voluntarily so peers can connect in one tap, with member visibility toggle.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 3: User Data Sovereignty */}
      <section className="kw-card p-6 sm:p-8 bg-[var(--card)] border border-[var(--card-border)] rounded-2xl space-y-4">
        <div className="flex items-center gap-2.5 text-[var(--gold-text)]">
          <Download className="w-5 h-5 flex-shrink-0" />
          <h2 className="text-lg font-bold text-[var(--fg)]">3. User Data Sovereignty: Export &amp; Deletion</h2>
        </div>
        <div className="space-y-4 text-xs sm:text-sm text-[var(--fg-muted)] leading-relaxed">
          <p>
            We believe members should always own and control their data unconditionally:
          </p>
          <div className="space-y-3">
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)]">
              <Download className="w-4 h-4 text-[var(--gold-text)] mt-0.5 flex-shrink-0" />
              <div>
                <strong className="text-[var(--fg)]">Export My Data (JSON):</strong>
                <p className="text-xs text-[var(--fg-muted)] mt-0.5">
                  At any time, navigate to your profile tab and click <strong>Export my data (JSON)</strong> to download a complete archive of your profile, posts, matches, and following graph.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3.5 rounded-xl bg-[var(--bg-subtle)] border border-[var(--card-border)]">
              <Trash2 className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <strong className="text-[var(--fg)]">Delete My Profile Permanently:</strong>
                <p className="text-xs text-[var(--fg-muted)] mt-0.5">
                  Click <strong>Delete my profile</strong> on your profile page and confirm by typing your name. The server permanently erases your profile document and cascades the deletion across your posts, matches, and notifications in Firestore.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: Storage & AI Model Boundary */}
      <section className="kw-card p-6 sm:p-8 bg-[var(--card)] border border-[var(--card-border)] rounded-2xl space-y-4">
        <h2 className="text-lg font-bold text-[var(--fg)]">4. Where Data is Stored &amp; Model Boundary</h2>
        <div className="space-y-2.5 text-xs sm:text-sm text-[var(--fg-muted)] leading-relaxed">
          <p>
            * <strong>Database:</strong> Google Cloud Firestore (project <code className="text-[var(--gold-text)]">kwegatta</code>). Native mode with persistent session storage.
          </p>
          <p>
            * <strong>AI Model Boundary:</strong> Profile synthesis and matchmaking run on the open-weight models <code className="text-[var(--gold-text)]">gemma-4-26b-a4b-it</code> (default) and <code className="text-[var(--gold-text)]">gemma-4-31b-it</code> (alternative). Prompts are processed strictly ephemerally and are never retained to train foundation models.
          </p>
          <p>
            * <strong>No Ad Trackers:</strong> Zero advertising SDKs, zero third-party telemetry, and zero tracking cookies.
          </p>
        </div>
      </section>

      {/* Contact */}
      <div className="p-6 rounded-2xl bg-[var(--bg-subtle)] border border-[var(--card-border)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h3 className="font-bold text-sm text-[var(--fg)]">Have a privacy inquiry?</h3>
          <p className="text-xs text-[var(--fg-muted)] mt-0.5">Reach out to our maintainers on GitHub or email.</p>
        </div>
        <a
          href="https://github.com/Saifuddin2Ahmed/kwegatta/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="kw-btn kw-btn-gold text-xs py-2 px-4 flex items-center gap-1.5"
        >
          <Mail className="w-3.5 h-3.5" />
          <span>Contact Maintainers</span>
          <ExternalLink className="w-3 h-3 opacity-70" />
        </a>
      </div>
    </div>
  );
};
