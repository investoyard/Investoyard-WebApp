import type { ComponentType, ReactNode } from 'react';
import type { ArchiveRow, DetailModel, HomeModel, SubscriptionModel } from './models';

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
  AllotmentPage: ComponentType<{ choices: { id: string; name: string; date: string }[] }>;
  ArchivePage: ComponentType<{ rows: ArchiveRow[] }>;
}
