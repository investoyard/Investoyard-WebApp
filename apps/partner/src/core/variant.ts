import type { ComponentType, ReactNode } from 'react';
import type { TenantPageKey } from '@investoyard/shared-types';
import type { CalendarModel } from './calendar';
import type { AllotmentChoiceFull, ArchiveRow, DetailModel, HomeModel, SubscriptionModel } from './models';

/** The head of a plain content page, drawn by each design in its own style. */
export interface InfoHead { eyebrow?: string; title: string; sub: string }

/** A design's own table classes, so a table shared across designs reads as the design's own. */
export interface DesignUi { tableWrap: string; table: string }

/*
 * THE CONTRACT EVERY DESIGN VARIANT IMPLEMENTS.
 *
 * A variant owns everything a visitor can see — chrome, layout, components,
 * typography, CSS — and nothing else. It receives finished view models and
 * renders them. Two variants may share no markup at all; they only have to
 * export these names. That is what makes "totally different from each other"
 * structurally possible rather than a matter of discipline.
 */
export interface VariantModule {
  /** The variant's folder name. Stamped on <html data-variant> so a build can prove which design it compiled. */
  name: string;
  /** Class names next/font produced, applied to <html>. */
  fontClassName: string;
  Shell: ComponentType<{ children: ReactNode }>;
  HomePage: ComponentType<{ model: HomeModel }>;
  DetailPage: ComponentType<{ model: DetailModel }>;
  SubscriptionPage: ComponentType<{ model: SubscriptionModel }>;
  AllotmentPage: ComponentType<{ choices: AllotmentChoiceFull[] }>;
  /** The archive. `heading` is set when it renders one of investoyard.com's filtered lists (/ipos/open/, /sme/ …). */
  ArchivePage: ComponentType<{ rows: ArchiveRow[]; heading?: { title: string; sub: string } }>;
  CalendarPage: ComponentType<{ model: CalendarModel }>;
  /** About / Terms / Privacy / Disclaimer. The body comes from core LegalBody; the variant owns the frame. */
  LegalPage: ComponentType<{ page: TenantPageKey }>;
  /**
   * A plain page in the design's own frame — its header or hero, then its body
   * surface. The content pages every design carries at investoyard.com's own
   * addresses (FAQs, glossary, news, performance, GMP, contact) render inside it.
   */
  InfoPage: ComponentType<{ head: InfoHead; children: ReactNode }>;
  ui: DesignUi;
}
