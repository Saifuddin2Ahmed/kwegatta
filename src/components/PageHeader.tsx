import React from 'react';
import { ChevronRight } from 'lucide-react';
import type { HeaderImage } from '../lib/headerImages';

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  /** Background photo; without one a brand gradient is used */
  image?: HeaderImage;
  /** Buttons shown on the right (below the title on phones) */
  actions?: React.ReactNode;
  breadcrumb?: BreadcrumbItem[];
}

/**
 * Banner at the top of content pages (Events, People, Learn, Feed, Team).
 * Text is always white on a dark overlay, so contrast does not depend on the theme.
 * The header is at the top of the page, so its photo loads eagerly at high priority.
 */
export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, image, actions, breadcrumb }) => {
  return (
    <header
      className={`kw-page-header relative isolate overflow-hidden rounded-2xl flex items-end min-h-[168px] sm:min-h-[240px] lg:min-h-[280px] ${
        image ? 'kw-page-header--image' : 'kw-page-header--plain'
      }`}
      data-testid="page-header"
    >
      {image && (
        <img
          src={image.src}
          srcSet={image.srcSet}
          sizes="(min-width: 1200px) 1152px, 100vw"
          alt={image.alt}
          width={1920}
          height={1080}
          loading="eager"
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 -z-20 w-full h-full object-cover"
        />
      )}
      <div aria-hidden="true" className="kw-page-header-overlay absolute inset-0 -z-10" />

      <div className="w-full p-5 sm:p-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          {breadcrumb && breadcrumb.length > 0 && (
            <nav aria-label="Breadcrumb">
              <ol className="flex flex-wrap items-center gap-1 text-xs text-white/85">
                {breadcrumb.map((b, i) => (
                  <li key={`${b.label}-${i}`} className="inline-flex items-center gap-1">
                    {i > 0 && <ChevronRight className="w-3 h-3 opacity-70" aria-hidden="true" />}
                    {b.href ? (
                      <a href={b.href} className="hover:text-white hover:underline">{b.label}</a>
                    ) : (
                      <span aria-current="page">{b.label}</span>
                    )}
                  </li>
                ))}
              </ol>
            </nav>
          )}
          <h1 className="text-2xl sm:text-4xl font-display font-bold tracking-tight text-white text-balance leading-tight">
            {title}
          </h1>
          {subtitle && (
            <p className="text-sm sm:text-base text-white/90 max-w-xl text-balance">{subtitle}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </header>
  );
};
