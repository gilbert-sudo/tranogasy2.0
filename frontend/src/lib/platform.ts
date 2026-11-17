export type AppPlatform = 'web' | 'android' | 'ios';

export const APP_PLATFORM: AppPlatform =
  process.env.NEXT_PUBLIC_PLATFORM === 'ios'
    ? 'ios'
    : process.env.NEXT_PUBLIC_PLATFORM === 'android'
      ? 'android'
      : 'web';

export const AGENCY_SUPPORT_PHONE_DISPLAY =
  process.env.NEXT_PUBLIC_AGENCY_SUPPORT_PHONE || '034 51 898 96';

export const AGENCY_SUPPORT_PHONE_TEL = AGENCY_SUPPORT_PHONE_DISPLAY.replace(/\s+/g, '');

export type SubscriptionPlanId = 'plan_24h' | 'plan_3d' | 'plan_7d';

export interface TimeSubscriptionPlan {
  id: SubscriptionPlanId;
  name: string;
  badge: string;
  durationLabel: string;
  amount: number;
  durationHours: number;
  tagline: string;
  features: string[];
  isFeatured?: boolean;
}

export const TIME_SUBSCRIPTION_PLANS: TimeSubscriptionPlan[] = [
  {
    id: 'plan_24h',
    name: 'Découverte',
    badge: 'Minimum',
    durationLabel: '24 heures',
    amount: 3000,
    durationHours: 24,
    tagline: 'Idéal pour contacter rapidement les propriétaires disponibles aujourd’hui.',
    features: [
      'Accès illimité aux numéros propriétaires pendant 24h',
      'Appels et messages directs sans intermédiaire',
      'Activation instantanée après paiement',
      'Paiement sécurisé MVola, Airtel, Orange & CB',
    ],
    isFeatured: false,
  },
  {
    id: 'plan_3d',
    name: 'Populaire',
    badge: 'Le plus choisi',
    durationLabel: '3 jours',
    amount: 5000,
    durationHours: 72,
    tagline: 'Le forfait recommandé pour comparer plusieurs biens et organiser vos visites.',
    features: [
      'Accès illimité à tous les contacts pendant 3 jours',
      'Déblocage automatique sur web et application Android',
      'Appels et SMS directs illimités aux bailleurs',
      'Cumulable si vous prolongez avant expiration',
      'Idéal particuliers & familles en recherche',
    ],
    isFeatured: true,
  },
  {
    id: 'plan_7d',
    name: 'Confort & Pro',
    badge: 'Recommandé Pro',
    durationLabel: '1 semaine',
    amount: 10000,
    durationHours: 168,
    tagline: 'Une semaine complète pour trouver votre logement sans pression.',
    features: [
      'Accès illimité à tous les contacts pendant 7 jours',
      'Consultation complète de toutes les annonces',
      'Activation instantanée 24h/24 et 7j/7',
      'Reçu et historique disponibles dans votre compte',
      'Parfait pour les recherches intensives',
    ],
    isFeatured: false,
  },
];

export type AssistancePlanId = 'assistance_24h' | 'assistance_3d' | 'assistance_7d';

export interface AgencyAssistancePlan {
  id: AssistancePlanId;
  name: string;
  badge: string;
  durationLabel: string;
  description: string;
  amount: number;
  durationHours: number;
  isFeatured?: boolean;
}

export const AGENCY_ASSISTANCE_PLANS: AgencyAssistancePlan[] = [
  {
    id: 'assistance_24h',
    name: 'Découverte',
    badge: 'Minimum',
    durationLabel: '24 heures',
    description: 'Plus d’informations par agent et mise en relation',
    amount: 3000,
    durationHours: 24,
    isFeatured: false,
  },
  {
    id: 'assistance_3d',
    name: 'Populaire',
    badge: 'Le plus choisi',
    durationLabel: '3 jours',
    description: 'Plus d’informations par agent et mise en relation',
    amount: 5000,
    durationHours: 72,
    isFeatured: true,
  },
  {
    id: 'assistance_7d',
    name: 'Confort & Pro',
    badge: 'Recommandé Pro',
    durationLabel: '1 semaine',
    description: 'Plus d’informations par agent et mise en relation',
    amount: 10000,
    durationHours: 168,
    isFeatured: false,
  },
];
