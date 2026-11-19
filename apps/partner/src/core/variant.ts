import type { ComponentType, ReactNode } from 'react';
import type { TenantPageKey } from '@investoyard/shared-types';
import type { CalendarModel } from './calendar';
import type { AllotmentChoiceFull, ArchiveRow, DetailModel, HomeModel, SubscriptionModel } from './models';

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
  ArchivePage: ComponentType<{ rows: ArchiveRow[] }>;
  CalendarPage: ComponentType<{ model: CalendarModel }>;
  /** About / Terms / Privacy / Disclaimer. The body comes from core LegalBody; the variant owns the frame. */
  LegalPage: ComponentType<{ page: TenantPageKey }>;
}
