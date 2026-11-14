'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  ImagePlus,
  Loader2,
  MapPin,
  PhoneCall,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Star,
  Trash2,
  X,
  ZoomIn,
} from 'lucide-react';
import { cityService, CityLocation } from '@/services/city.service';
import { imageService } from '@/services/image.service';
import {
  FbGroupTarget,
  FbIngestedCandidate,
  fbIngestionService,
} from '@/services/fbIngestion.service';
import {
  ALL_FEATURE_LABELS,
  MISSING_FIELD_LABELS,
  PROPERTY_FEATURE_GROUPS,
} from './featureLabels';
import { AdminPhotoGalleryModal } from './AdminPhotoGalleryModal';
import {
  HouseCategoryFilter,
  HouseType,
  PROPERTY_TYPE_DEFS,
  SEARCH_CATEGORY_OPTIONS,
  getRequiredMissingSpecs,
  isCommercialHouseType,
  normalizeHouseType,
} from '@/lib/propertyTypes';

type AccessVerificationState = 'yes' | 'no' | 'unknown';

interface CandidateDraft {
  title: string;
  description: string;
  type: 'rent' | 'sale' | null;
  houseType: HouseType | null;
  price: string;
  rent: string;
  rooms: string;
  livingRoom: string;
  kitchen: string;
  toilet: string;
  bathrooms: string;
  area: string;
  floor: string;
  phone1: string;
  phone2: string;
  phone3: string;
  matchedCityId: string;
  matchedCityLabel: string;
  gcsImages: string[];
  features: Record<string, boolean>;
  featureVerification: {
    carAccess: AccessVerificationState;
    motoAccess: AccessVerificationState;
    waterSupply: AccessVerificationState;
    electricitySupply: AccessVerificationState;
    furnishedProperty: AccessVerificationState;
  };
}

function normalizeDescriptionLayout(text: string): string {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/^\n+|\n+$/g, '');
}

function toDraft(c: FbIngestedCandidate): CandidateDraft {
  const ex = c.extracted;
  const features = { ...(ex?.features || {}) };
  const fv = c.featureVerification || {};
  const carAccess: AccessVerificationState = features.carAccess
    ? 'yes'
    : fv.carAccess === 'no'
      ? 'no'
      : 'unknown';
  const motoAccess: AccessVerificationState = features.motoAccess
    ? 'yes'
    : carAccess === 'yes'
      ? 'yes'
      : fv.motoAccess === 'no'
        ? 'no'
        : 'unknown';
  if (carAccess === 'yes') {
    features.motoAccess = true;
  }

  const waterSupply: AccessVerificationState =
    fv.waterSupply === 'yes' || fv.waterSupply === 'no' || fv.waterSupply === 'unknown'
      ? fv.waterSupply
      : features.waterPumpSupply || features.waterWellSupply || features.waterFetchExternal
        ? 'yes'
        : 'unknown';

  const electricitySupply: AccessVerificationState =
    fv.electricitySupply === 'yes' ||
    fv.electricitySupply === 'no' ||
    fv.electricitySupply === 'unknown'
      ? fv.electricitySupply
      : features.solarPanels
        ? 'yes'
        : 'unknown';

  const furnishedProperty: AccessVerificationState =
    fv.furnishedProperty === 'yes' ||
    fv.furnishedProperty === 'no' ||
    fv.furnishedProperty === 'unknown'
      ? fv.furnishedProperty
      : features.furnishedProperty
        ? 'yes'
        : 'unknown';

  return {
    title: ex?.title || '',
    description: normalizeDescriptionLayout(ex?.description || c.rawContent || ''),
    type: ex?.type || null,
    houseType: normalizeHouseType(ex?.houseType) || 'maison',
    price: ex?.price != null ? String(ex.price) : '',
    rent: ex?.rent != null ? String(ex.rent) : '',
    rooms: ex?.rooms != null ? String(ex.rooms) : '',
    livingRoom: ex?.livingRoom != null ? String(ex.livingRoom) : '',
    kitchen: ex?.kitchen != null ? String(ex.kitchen) : '',
    toilet: ex?.toilet != null ? String(ex.toilet) : '',
    bathrooms: ex?.bathrooms != null ? String(ex.bathrooms) : '',
    area: ex?.area != null ? String(ex.area) : '',
    floor: ex?.floor || '',
    phone1: ex?.phone1 || '',
    phone2: ex?.phone2 || '',
    phone3: ex?.phone3 || '',
    matchedCityId: c.matchedCityId || '',
    matchedCityLabel: c.matchedCityLabel || '',
    gcsImages: Array.isArray(c.gcsImages) ? [...c.gcsImages] : [],
    features,
    featureVerification: {
      carAccess,
      motoAccess,
      waterSupply,
      electricitySupply,
      furnishedProperty,
    },
  };
}

function toNumOrNull(val: string): number | null {
  const clean = val.replace(/\s+/g, '');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function buildPatchFromDraft(d: CandidateDraft): Record<string, unknown> {
  const commercial = isCommercialHouseType(d.houseType);
  return {
    title: d.title.trim(),
    description: normalizeDescriptionLayout(d.description),
    type: d.type,
    houseType: d.houseType,
    price: d.type === 'sale' ? toNumOrNull(d.price) : null,
    rent: d.type === 'rent' ? toNumOrNull(d.rent) : null,
    rooms: commercial ? null : toNumOrNull(d.rooms),
    livingRoom: commercial ? null : toNumOrNull(d.livingRoom),
    kitchen: commercial ? null : toNumOrNull(d.kitchen),
    toilet: toNumOrNull(d.toilet),
    bathrooms: commercial ? null : toNumOrNull(d.bathrooms),
    area: toNumOrNull(d.area),
    floor: d.floor.trim() || null,
    phone1: d.phone1.trim() || null,
    phone2: d.phone2.trim() || null,
    phone3: d.phone3.trim() || null,
    matchedCityId: d.matchedCityId || null,
    gcsImages: d.gcsImages,
    features: d.features,
    featureVerification: d.featureVerification,
  };
}

function hasKnownWaterSupply(features: Record<string, boolean>): boolean {
  return Boolean(
    features.waterPumpSupplyJirama ||
      features.waterPumpSupply ||
      features.waterWellSupply ||
      features.waterFetchExternal,
  );
}

function hasKnownElectricitySupply(features: Record<string, boolean>): boolean {
  return Boolean(
    features.electricityJirama ||
      features.electricityPower ||
      features.solarPanels,
  );
}

function computeLiveMissing(d: CandidateDraft): string[] {
  const missing: string[] = [];
  if (!d.type) missing.push('type');
  if (d.type === 'sale' && (!toNumOrNull(d.price) || Number(d.price) <= 0)) missing.push('price');
  if (d.type === 'rent' && (!toNumOrNull(d.rent) || Number(d.rent) <= 0)) missing.push('rent');
  if (!d.matchedCityId) missing.push('city');
  const requiredSpecs = getRequiredMissingSpecs(d.houseType);
  if (requiredSpecs.includes('rooms') && d.rooms === '') missing.push('rooms');
  if (requiredSpecs.includes('toilet') && d.toilet === '') missing.push('toilet');
  if (requiredSpecs.includes('bathrooms') && d.bathrooms === '') missing.push('bathrooms');
  if (requiredSpecs.includes('area') && d.area === '') missing.push('area');
  if (!d.phone1.trim()) missing.push('phone1');
  if (d.featureVerification.carAccess === 'unknown') missing.push('carAccess');
  if (d.featureVerification.motoAccess === 'unknown') missing.push('motoAccess');
  if (!isCommercialHouseType(d.houseType)) {
    if (
      d.featureVerification.waterSupply === 'unknown' ||
      (d.featureVerification.waterSupply !== 'no' &&
        !hasKnownWaterSupply(d.features))
    ) {
      missing.push('waterSupply');
    }
    if (
      d.featureVerification.electricitySupply === 'unknown' ||
      (d.featureVerification.electricitySupply !== 'no' &&
        !hasKnownElectricitySupply(d.features))
    ) {
      missing.push('electricitySupply');
    }
    if (d.featureVerification.furnishedProperty === 'unknown') {
      missing.push('furnishedProperty');
    }
  }
  return missing;
}

function buildCallQuestionsText(title: string, missingKeys: string[]): string {
  const questionMap: Record<string, string> = {
    type: 'S’agit-il d’une location ou d’une vente ?',
    price: 'Quel est le prix de vente exact ?',
    rent: 'Quel est le loyer mensuel exact ?',
    city: 'Dans quel Fokontany / quartier exact se situe le bien ?',
    rooms: 'Combien de chambres y a-t-il ?',
    toilet: 'Combien de WC y a-t-il (intérieur ou extérieur) ?',
    bathrooms: 'Combien de douches / salles d’eau y a-t-il ?',
    area: 'Quelle est la superficie approximative (en m²) ?',
    carAccess: 'Est-ce qu’il y a un accès voiture (fiara miditra) ou parking ?',
    motoAccess: 'Est-ce qu’il y a au moins un accès moto (moto miditra) ?',
    waterSupply:
      'D’où vient l’eau ? (JIRAMA probable, moto-pompe / surpresseur, puits / vovo, maka rano, ou pas d’eau)',
    electricitySupply:
      'D’où vient l’électricité ? (JIRAMA probable, panneau solaire, ou pas d’électricité)',
    furnishedProperty:
      'La maison est-elle meublée (misy fanaka) ou non meublée ?',
  };
  const lines = missingKeys
    .filter((k) => k !== 'phone1' && questionMap[k])
    .map((k) => `- ${questionMap[k]}`);
  const header = `Bonjour, concernant votre annonce "${title || 'Trano'}" sur Facebook, pourriez-vous confirmer :`;
  return lines.length > 0 ? `${header}\n${lines.join('\n')}` : header;
}

interface CandidateCardProps {
  candidate: FbIngestedCandidate;
  userId: string;
  onActionDone: (message: string) => void;
  onError: (message: string) => void;
  onCandidateUpdated: (updated: FbIngestedCandidate) => void;
}

function CandidateReviewCard({
  candidate,
  userId,
  onActionDone,
  onError,
  onCandidateUpdated,
}: CandidateCardProps) {
  const [draft, setDraft] = useState<CandidateDraft>(() => toDraft(candidate));
  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState<CityLocation[]>([]);
  const [isSearchingCity, setIsSearchingCity] = useState(false);
  const [showAllFeatures, setShowAllFeatures] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState<'questions' | 'phone1' | null>(null);
  const [busyAction, setBusyAction] = useState<
    'save' | 'approve' | 'reject' | 'reanalyze' | null
  >(null);

  useEffect(() => {
    const clean = cityQuery.trim();
    if (clean.length < 2) {
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearchingCity(true);
      try {
        const res = await cityService.searchCities(clean, 8);
        setCityResults(res);
      } catch {
        setCityResults([]);
      } finally {
        setIsSearchingCity(false);
      }
    }, 220);
    return () => clearTimeout(timer);
  }, [cityQuery]);

  const missing = computeLiveMissing(draft);
  const canPublish =
    Boolean(draft.type) &&
    Boolean(draft.matchedCityId) &&
    Boolean(draft.title.trim()) &&
    ((draft.type === 'rent' && Number(draft.rent) > 0) ||
      (draft.type === 'sale' && Number(draft.price) > 0));

  const amountVal = Number(draft.type === 'sale' ? draft.price : draft.rent) || 0;
  const enabledFeatureKeys = Object.entries(draft.features)
    .filter(([, val]) => Boolean(val))
    .map(([key]) => key);

  const handleUploadExtraPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploadingPhoto(true);
    try {
      const uploaded = await imageService.uploadImageToGCS(file);
      setDraft((prev) => ({
        ...prev,
        gcsImages: [...prev.gcsImages, uploaded.src],
      }));
    } catch (err) {
      onError((err as Error).message || 'Erreur upload photo');
    } finally {
      setIsUploadingPhoto(false);
      e.target.value = '';
    }
  };

  const handleSave = async () => {
    setBusyAction('save');
    try {
      await fbIngestionService.updateCandidate(userId, candidate._id, buildPatchFromDraft(draft));
      onActionDone(`Brouillon "${draft.title}" sauvegardé`);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusyAction(null);
    }
  };

  const handleApprove = async () => {
    if (!canPublish) {
      onError('Renseignez au minimum le type, le montant (Ar) et la localité avant de publier.');
      return;
    }
    setBusyAction('approve');
    try {
      const res = await fbIngestionService.approveCandidate(
        userId,
        candidate._id,
        buildPatchFromDraft(draft),
      );
      onActionDone(`Annonce publiée en ligne (#${res.property?.propertyNumber || res.property?._id})`);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusyAction(null);
    }
  };

  const handleReject = async () => {
    setBusyAction('reject');
    try {
      const res = await fbIngestionService.rejectCandidate(userId, candidate._id);
      onActionDone(
        `Annonce rejetée (${res.deletedGcsImages} photo(s) supprimée(s) du cloud)`,
      );
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusyAction(null);
    }
  };

  const handleReanalyzeCard = async () => {
    setBusyAction('reanalyze');
    try {
      const updated = await fbIngestionService.reanalyzeCandidate(userId, candidate._id);
      onCandidateUpdated(updated);
      setDraft(toDraft(updated));
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setBusyAction(null);
    }
  };

  const setAccessState = (
    key: 'carAccess' | 'motoAccess',
    state: AccessVerificationState,
  ) => {
    setDraft((prev) => {
      const nextFeatures = { ...prev.features };
      const nextVerif = { ...prev.featureVerification };
      if (key === 'carAccess') {
        nextVerif.carAccess = state;
        nextFeatures.carAccess = state === 'yes';
        if (state === 'yes') {
          nextVerif.motoAccess = 'yes';
          nextFeatures.motoAccess = true;
        }
      } else {
        nextVerif.motoAccess = state;
        nextFeatures.motoAccess = state === 'yes';
        if (state === 'no') {
          nextVerif.carAccess = 'no';
          nextFeatures.carAccess = false;
        } else if (state === 'unknown' && nextFeatures.carAccess) {
          nextVerif.carAccess = 'unknown';
          nextFeatures.carAccess = false;
        }
      }
      return {
        ...prev,
        features: nextFeatures,
        featureVerification: nextVerif,
      };
    });
  };

  const setFurnishedState = (state: AccessVerificationState) => {
    setDraft((prev) => ({
      ...prev,
      features: {
        ...prev.features,
        furnishedProperty: state === 'yes',
      },
      featureVerification: {
        ...prev.featureVerification,
        furnishedProperty: state,
      },
    }));
  };

  const toggleWaterFeature = (
    key:
      | 'unknown'
      | 'no'
      | 'waterPumpSupplyJirama'
      | 'waterPumpSupply'
      | 'waterWellSupply'
      | 'waterFetchExternal',
  ) => {
    setDraft((prev) => {
      const nextFeatures = { ...prev.features };
      const nextVerif = { ...prev.featureVerification };
      if (key === 'unknown' || key === 'no') {
        nextFeatures.waterPumpSupplyJirama = false;
        nextFeatures.waterPumpSupply = false;
        nextFeatures.waterWellSupply = false;
        nextFeatures.waterFetchExternal = false;
        nextVerif.waterSupply = key;
      } else if (
        key === 'waterPumpSupplyJirama' &&
        Boolean(prev.features.waterPumpSupplyJirama) &&
        prev.featureVerification.waterSupply === 'unknown'
      ) {
        // 1-click confirmation of pre-filled probable JIRAMA water
        nextFeatures.waterPumpSupplyJirama = true;
        nextFeatures.waterFetchExternal = false;
        nextVerif.waterSupply = 'yes';
      } else {
        const nextVal = !Boolean(nextFeatures[key]);
        nextFeatures[key] = nextVal;
        if (
          prev.featureVerification.waterSupply === 'unknown' &&
          nextVal &&
          key !== 'waterPumpSupplyJirama'
        ) {
          nextFeatures.waterPumpSupplyJirama = false;
        }
        if (nextVal && key === 'waterFetchExternal') {
          nextFeatures.waterPumpSupplyJirama = false;
          nextFeatures.waterPumpSupply = false;
        } else if (
          nextVal &&
          (key === 'waterPumpSupplyJirama' || key === 'waterPumpSupply')
        ) {
          nextFeatures.waterFetchExternal = false;
        }
        nextVerif.waterSupply = hasKnownWaterSupply(nextFeatures)
          ? 'yes'
          : 'unknown';
      }
      return {
        ...prev,
        features: nextFeatures,
        featureVerification: nextVerif,
      };
    });
  };

  const toggleElectricityFeature = (
    key:
      | 'unknown'
      | 'no'
      | 'electricityJirama'
      | 'solarPanels'
      | 'electricityPower',
  ) => {
    setDraft((prev) => {
      const nextFeatures = { ...prev.features };
      const nextVerif = { ...prev.featureVerification };
      if (key === 'unknown' || key === 'no') {
        nextFeatures.electricityJirama = false;
        nextFeatures.electricityPower = false;
        nextFeatures.solarPanels = false;
        nextVerif.electricitySupply = key;
      } else if (
        key === 'electricityJirama' &&
        Boolean(prev.features.electricityJirama) &&
        prev.featureVerification.electricitySupply === 'unknown'
      ) {
        // 1-click confirmation of pre-filled probable JIRAMA power
        nextFeatures.electricityJirama = true;
        nextFeatures.electricityPower = true;
        nextVerif.electricitySupply = 'yes';
      } else {
        const nextVal = !Boolean(nextFeatures[key]);
        nextFeatures[key] = nextVal;
        if (
          prev.featureVerification.electricitySupply === 'unknown' &&
          nextVal &&
          key !== 'electricityJirama'
        ) {
          nextFeatures.electricityJirama = false;
          if (key === 'solarPanels') {
            nextFeatures.electricityPower = false;
          }
        }
        if (key === 'electricityJirama') {
          nextFeatures.electricityPower = nextVal;
        }
        nextVerif.electricitySupply = hasKnownElectricitySupply(nextFeatures)
          ? 'yes'
          : 'unknown';
      }
      return {
        ...prev,
        features: nextFeatures,
        featureVerification: nextVerif,
      };
    });
  };

  const handleCopyText = async (
    text: string,
    key: 'questions' | 'phone1',
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      onError('Impossible de copier dans le presse-papiers');
    }
  };

  const promotePhotoToCover = (index: number) => {
    setDraft((prev) => {
      if (index <= 0 || index >= prev.gcsImages.length) return prev;
      const copy = [...prev.gcsImages];
      const [picked] = copy.splice(index, 1);
      copy.unshift(picked);
      return { ...prev, gcsImages: copy };
    });
  };

  const removePhotoAt = (index: number) => {
    setDraft((prev) => ({
      ...prev,
      gcsImages: prev.gcsImages.filter((_, i) => i !== index),
    }));
  };

  const rawLinesCount = (candidate.rawContent || '')
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0).length;
  const draftLinesCount = draft.description
    .split('\n')
    .filter((l) => l.trim().length > 0).length;
  const descriptionLooksFlattened =
    rawLinesCount >= 3 && draftLinesCount <= 1;
  const primaryTelHref = draft.phone1.trim()
    ? `tel:${draft.phone1.replace(/[^\d+]/g, '')}`
    : null;

  const missingRing = (key: string) =>
    missing.includes(key)
      ? 'border-amber-400 bg-amber-50/40 dark:bg-amber-950/20 focus:ring-amber-400'
      : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 focus:ring-brand-green';

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200/80 dark:border-zinc-800 shadow-sm overflow-hidden">
      {/* Header strip */}
      <div className="px-6 py-4 bg-zinc-50/80 dark:bg-zinc-800/40 border-b border-zinc-200/70 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <span
            className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wide ${
              candidate.status === 'approved'
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                : candidate.status === 'rejected'
                ? 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300'
                : 'bg-brand-green/15 text-brand-green'
            }`}
          >
            {candidate.status}
          </span>
          <span className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
            {candidate.groupName}
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-zinc-500">
            {candidate.authorAvatarUrl && (
              <img
                src={candidate.authorAvatarUrl}
                alt={candidate.authorName || 'Auteur'}
                className="w-5 h-5 rounded-full object-cover border border-zinc-200 dark:border-zinc-700"
              />
            )}
            <span>
              par <strong className="text-zinc-700 dark:text-zinc-300">{candidate.authorName || 'Membre'}</strong>
              {candidate.authorFbId ? (
                <span className="ml-1 font-mono text-[10px] text-zinc-400">
                  (ID: {candidate.authorFbId})
                </span>
              ) : null}{' '}
              • {new Date(candidate.datePosted).toLocaleString('fr-FR')}
            </span>
          </span>
          <span
            className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold inline-flex items-center gap-1 ${
              candidate.aiConfidence === 'high'
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                : candidate.aiConfidence === 'medium'
                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'
            }`}
          >
            <Sparkles className="w-3 h-3" /> Confiance {candidate.aiConfidence}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {candidate.authorUrl && (
            <a
              href={candidate.authorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 px-3 py-1.5 rounded-full hover:opacity-90 transition"
            >
              Profil FB <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
          <a
            href={candidate.postUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-200 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-700 px-3 py-1.5 rounded-full hover:border-brand-green transition"
          >
            Voir post original <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* Missing fields highlight banner + Publisher call helper */}
      {missing.length > 0 && candidate.status === 'pending' && (
        <div className="px-6 py-2.5 bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200/70 dark:border-amber-900/50 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-800 dark:text-amber-200">
          <div className="flex flex-wrap items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
            <span className="font-semibold">Champs non mentionnés ou à vérifier :</span>
            {missing.map((m) => (
              <span
                key={m}
                className="px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/60 font-medium"
              >
                {MISSING_FIELD_LABELS[m] || m}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {primaryTelHref && (
              <a
                href={primaryTelHref}
                className="inline-flex items-center gap-1 rounded-full bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white shadow-sm hover:bg-amber-700 transition"
                title="Appeler le propriétaire pour vérifier les infos manquantes"
              >
                <PhoneCall className="w-3 h-3" />
                Appeler {draft.phone1.trim()}
              </a>
            )}
            <button
              type="button"
              onClick={() =>
                handleCopyText(
                  buildCallQuestionsText(draft.title, missing),
                  'questions',
                )
              }
              className="inline-flex items-center gap-1 rounded-full border border-amber-300 dark:border-amber-700 bg-white/80 dark:bg-amber-900/40 px-2.5 py-1 text-[11px] font-semibold text-amber-900 dark:text-amber-100 hover:bg-white transition"
              title="Copier les questions manquantes à poser lors de l’appel"
            >
              <Copy className="w-3 h-3" />
              {copiedKey === 'questions' ? 'Questions copiées !' : 'Copier questions d’appel'}
            </button>
          </div>
        </div>
      )}

      {/* Side-by-side split view */}
      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-zinc-200/70 dark:divide-zinc-800">
        {/* LEFT COLUMN: Raw Facebook Post + Photos */}
        <div className="lg:col-span-5 p-6 space-y-5 bg-zinc-50/30 dark:bg-zinc-950/20">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
              Texte original Facebook
            </p>
            <div className="p-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-sm text-zinc-800 dark:text-zinc-200 whitespace-pre-wrap leading-relaxed max-h-64 overflow-y-auto">
              {candidate.rawContent}
            </div>
          </div>

          {candidate.aiNotes && (
            <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/60 dark:border-blue-900/50 text-xs text-blue-800 dark:text-blue-200">
              <span className="font-semibold">Note IA :</span> {candidate.aiNotes}
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Photos GCS ({draft.gcsImages.length}){' '}
                {draft.gcsImages.length > 0 && (
                  <span className="normal-case font-normal text-zinc-400">
                    • cliquer pour agrandir
                  </span>
                )}
              </p>
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-green hover:underline cursor-pointer">
                {isUploadingPhoto ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <ImagePlus className="w-3.5 h-3.5" />
                )}
                Ajouter photo
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleUploadExtraPhoto}
                  disabled={isUploadingPhoto}
                />
              </label>
            </div>

            {draft.gcsImages.length === 0 ? (
              <div className="p-6 rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 text-center text-xs text-zinc-500">
                Aucune photo enregistrée dans GCS pour cette annonce.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {draft.gcsImages.map((imgUrl, idx) => (
                  <div
                    key={imgUrl + idx}
                    className={`relative group aspect-square rounded-xl overflow-hidden border bg-zinc-100 dark:bg-zinc-800 ${
                      idx === 0
                        ? 'border-[#7cbd1e] ring-2 ring-[#7cbd1e]/25'
                        : 'border-zinc-200 dark:border-zinc-800'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setGalleryIndex(idx)}
                      className="block w-full h-full cursor-zoom-in focus:outline-none"
                      title={`Inspecter photo ${idx + 1} sur ${draft.gcsImages.length}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={imgUrl}
                        alt={`Photo ${idx + 1}`}
                        className="w-full h-full object-cover transition duration-200 group-hover:scale-105"
                      />
                      <span className="pointer-events-none absolute inset-0 bg-black/0 group-hover:bg-black/25 transition flex items-center justify-center">
                        <span className="opacity-0 group-hover:opacity-100 transition inline-flex items-center gap-1 rounded-full bg-black/75 px-2.5 py-1 text-[11px] font-semibold text-white shadow">
                          <ZoomIn className="w-3.5 h-3.5" />
                          Aperçu
                        </span>
                      </span>
                    </button>

                    <span className="pointer-events-none absolute bottom-1.5 left-1.5 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                      {idx === 0 ? '#1 Couv.' : `#${idx + 1}`}
                    </span>

                    {idx > 0 && (
                      <button
                        type="button"
                        title="Définir en photo principale (#1)"
                        onClick={(e) => {
                          e.stopPropagation();
                          promotePhotoToCover(idx);
                        }}
                        className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-black/70 text-amber-300 flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-[#7cbd1e] hover:text-white"
                      >
                        <Star className="w-3.5 h-3.5" />
                      </button>
                    )}

                    <button
                      type="button"
                      title="Retirer cette photo"
                      onClick={(e) => {
                        e.stopPropagation();
                        removePhotoAt(idx);
                      }}
                      className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-red-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <AdminPhotoGalleryModal
              isOpen={galleryIndex !== null}
              images={draft.gcsImages}
              initialIndex={galleryIndex ?? 0}
              title={draft.title || candidate.authorName || 'Annonce Facebook'}
              onClose={() => setGalleryIndex(null)}
              onRemoveImage={removePhotoAt}
              onSetCoverImage={promotePhotoToCover}
            />
          </div>
        </div>

        {/* RIGHT COLUMN: Fast Inline Validation Form */}
        <div className="lg:col-span-7 p-6 space-y-4">
          {/* Type & House Type quick toggles */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1">
                Transaction *
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(['rent', 'sale'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setDraft((prev) => ({ ...prev, type: t }))}
                    className={`py-2 px-3 rounded-xl text-xs font-bold border transition ${
                      draft.type === t
                        ? 'bg-brand-green text-white border-brand-green shadow-sm'
                        : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
                    }`}
                  >
                    {t === 'rent' ? 'À louer (Rent)' : 'À vendre (Sale)'}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-zinc-500 mb-1">
                Catégorie du bien
              </label>
              <div className="flex flex-wrap gap-1.5">
                {PROPERTY_TYPE_DEFS.map((def) => {
                  const Icon = def.icon;
                  const active = draft.houseType === def.id;
                  return (
                    <button
                      key={def.id}
                      type="button"
                      onClick={() => setDraft((prev) => ({ ...prev, houseType: def.id }))}
                      className={`inline-flex items-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-bold border transition ${
                        active
                          ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 border-zinc-900 dark:border-white'
                          : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      {def.shortLabel}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Title & Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3">
            <div className="sm:col-span-7">
              <label className="block text-xs font-semibold text-zinc-500 mb-1">
                Titre de l&apos;annonce *
              </label>
              <input
                type="text"
                value={draft.title}
                onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))}
                className="w-full px-3.5 py-2 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-sm focus:outline-none focus:ring-2 focus:ring-brand-green"
              />
            </div>

            <div className="sm:col-span-5">
              <label className="block text-xs font-semibold text-zinc-500 mb-1">
                {draft.type === 'sale' ? 'Prix de vente (Ar) *' : 'Loyer / mois (Ar) *'}
              </label>
              <input
                type="number"
                value={draft.type === 'sale' ? draft.price : draft.rent}
                onChange={(e) => {
                  const val = e.target.value;
                  setDraft((prev) =>
                    prev.type === 'sale' ? { ...prev, price: val } : { ...prev, rent: val },
                  );
                }}
                placeholder="ex: 600000"
                className={`w-full px-3.5 py-2 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 ${missingRing(
                  draft.type === 'sale' ? 'price' : 'rent',
                )}`}
              />
              {amountVal > 0 && (
                <p className="text-[11px] text-zinc-500 mt-1">
                  = {(amountVal * 5).toLocaleString('fr-FR')} FMG
                </p>
              )}
            </div>
          </div>

          {/* City / Fokontany selector with 1-click suggestions + live search */}
          <div className="p-3.5 rounded-2xl border border-zinc-200/80 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-800/20 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold text-zinc-600 dark:text-zinc-300 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-brand-green" />
                Fokontany / Localité *
              </label>
              {draft.matchedCityLabel ? (
                <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-100/70 dark:bg-emerald-950/60 px-2.5 py-0.5 rounded-full">
                  Sélectionné : {draft.matchedCityLabel}
                </span>
              ) : (
                <span className="text-xs font-semibold text-amber-600">Aucune localité liée</span>
              )}
            </div>

            {candidate.cityCandidates && candidate.cityCandidates.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {candidate.cityCandidates.map((cand) => {
                  const selected = draft.matchedCityId === cand._id;
                  return (
                    <button
                      key={cand._id}
                      type="button"
                      onClick={() =>
                        setDraft((prev) => ({
                          ...prev,
                          matchedCityId: cand._id,
                          matchedCityLabel: cand.label,
                        }))
                      }
                      className={`text-[11px] px-2.5 py-1 rounded-full border transition font-medium ${
                        selected
                          ? 'bg-brand-green text-white border-brand-green'
                          : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-brand-green'
                      }`}
                    >
                      {cand.label} ({cand.score})
                    </button>
                  );
                })}
              </div>
            )}

            <div className="relative">
              <input
                type="text"
                value={cityQuery}
                onChange={(e) => {
                  const val = e.target.value;
                  setCityQuery(val);
                  if (val.trim().length < 2) {
                    setCityResults([]);
                  }
                }}
                placeholder="Rechercher un autre Fokontany (ex: Ivandry, Andohan'i Mandroseza, Itaosy...)"
                className={`w-full px-3.5 py-1.5 rounded-xl border text-xs focus:outline-none focus:ring-2 ${missingRing(
                  'city',
                )}`}
              />
              {isSearchingCity && (
                <Loader2 className="w-3.5 h-3.5 animate-spin absolute right-3 top-2 text-zinc-400" />
              )}
              {cityResults.length > 0 && (
                <div className="mt-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 divide-y divide-zinc-100 dark:divide-zinc-800 max-h-40 overflow-y-auto shadow-md">
                  {cityResults.map((city) => {
                    const label = [city.fokontany, city.commune, city.district]
                      .filter(Boolean)
                      .join(' — ');
                    return (
                      <button
                        key={city._id}
                        type="button"
                        onClick={() => {
                          setDraft((prev) => ({
                            ...prev,
                            matchedCityId: city._id,
                            matchedCityLabel: label,
                          }));
                          setCityQuery('');
                          setCityResults([]);
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-brand-green/10 transition"
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Numeric rooms & dimensions */}
          {(() => {
            const commercial = isCommercialHouseType(draft.houseType);
            const numericFields = commercial
              ? ([
                  { key: 'toilet', label: 'WC (opt.)' },
                  { key: 'area', label: 'm²' },
                ] as const)
              : ([
                  { key: 'rooms', label: 'Chambres' },
                  { key: 'livingRoom', label: 'Salon' },
                  { key: 'kitchen', label: 'Cuisine' },
                  { key: 'toilet', label: 'WC' },
                  { key: 'bathrooms', label: 'Douche' },
                  { key: 'area', label: 'm²' },
                ] as const);

            return (
              <div className={`grid gap-2 ${commercial ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-7'}`}>
                {numericFields.map((field) => (
                  <div key={field.key}>
                    <label className="block text-[11px] font-semibold text-zinc-500 mb-1">
                      {field.label}
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={draft[field.key]}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, [field.key]: e.target.value }))
                      }
                      placeholder="—"
                      className={`w-full px-2.5 py-1.5 rounded-xl border text-xs font-semibold focus:outline-none focus:ring-2 ${missingRing(
                        field.key,
                      )}`}
                    />
                  </div>
                ))}
                <div>
                  <label className="block text-[11px] font-semibold text-zinc-500 mb-1">Étage</label>
                  <input
                    type="text"
                    value={draft.floor}
                    onChange={(e) => setDraft((prev) => ({ ...prev, floor: e.target.value }))}
                    placeholder={commercial ? 'RDC / Bord de route' : 'RDC'}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs focus:outline-none focus:ring-2 focus:ring-brand-green"
                  />
                </div>
              </div>
            );
          })()}

          {/* Phones with quick Call & Copy */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {(
              [
                { key: 'phone1', label: 'Téléphone 1 *' },
                { key: 'phone2', label: 'Téléphone 2' },
                { key: 'phone3', label: 'Téléphone 3' },
              ] as const
            ).map((p) => {
              const rawVal = draft[p.key].trim();
              const telHref = rawVal ? `tel:${rawVal.replace(/[^\d+]/g, '')}` : null;
              return (
                <div key={p.key}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-[11px] font-semibold text-zinc-500">
                      {p.label}
                    </label>
                    {telHref && (
                      <div className="flex items-center gap-1.5">
                        {p.key === 'phone1' && (
                          <button
                            type="button"
                            onClick={() => handleCopyText(rawVal, 'phone1')}
                            className="text-[10px] font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200"
                            title="Copier le numéro"
                          >
                            {copiedKey === 'phone1' ? 'Copié' : 'Copier'}
                          </button>
                        )}
                        <a
                          href={telHref}
                          className="inline-flex items-center gap-0.5 text-[10px] font-bold text-brand-green hover:underline"
                          title={`Appeler ${rawVal}`}
                        >
                          <PhoneCall className="w-2.5 h-2.5" /> Appeler
                        </a>
                      </div>
                    )}
                  </div>
                  <input
                    type="text"
                    value={draft[p.key]}
                    onChange={(e) =>
                      setDraft((prev) => ({ ...prev, [p.key]: e.target.value }))
                    }
                    placeholder="034..."
                    className={`w-full px-3 py-1.5 rounded-xl border text-xs focus:outline-none focus:ring-2 ${missingRing(
                      p.key,
                    )}`}
                  />
                </div>
              );
            })}
          </div>

          {/* Description preserving layout (spaces, newlines, returns) */}
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <label className="block text-xs font-semibold text-zinc-500">
                Description nettoyée (mise en page conservée)
              </label>
              <button
                type="button"
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    description: normalizeDescriptionLayout(candidate.rawContent || ''),
                  }))
                }
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 hover:text-brand-green transition"
                title="Copier exactement le texte original Facebook avec sa mise en page (retours à la ligne et espaces)"
              >
                <RotateCcw className="w-3 h-3" />
                Reprendre mise en page originale
              </button>
            </div>
            {descriptionLooksFlattened && (
              <p className="mb-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                Le texte original Facebook comporte plusieurs lignes mais la description a été aplatie : cliquez « Reprendre mise en page originale » ou « Ré-analyser ».
              </p>
            )}
            <textarea
              rows={Math.min(14, Math.max(5, draft.description.split('\n').length + 1))}
              value={draft.description}
              onChange={(e) => setDraft((prev) => ({ ...prev, description: e.target.value }))}
              className="w-full px-3.5 py-2.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs leading-relaxed font-sans whitespace-pre-wrap focus:outline-none focus:ring-2 focus:ring-brand-green"
            />
          </div>

          {/* Critical Access, Water, Electricity & Furnished Verification */}
          <div className="p-3.5 rounded-2xl bg-zinc-50/90 dark:bg-zinc-800/30 border border-zinc-200/80 dark:border-zinc-800 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200">
                Vérification critique : Accès, Eau, Électricité &amp; Meublé
              </span>
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={handleReanalyzeCard}
                className="inline-flex items-center gap-1 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 hover:border-brand-green hover:text-brand-green transition disabled:opacity-50"
                title="Ré-analyser le texte (FR / MG / EN) pour détecter terrasse, parking, accès, JIRAMA, moto-pompe, solaire, maka rano, meublé et restaurer la mise en page"
              >
                {busyAction === 'reanalyze' ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <RefreshCw className="w-3 h-3" />
                )}
                Ré-analyser texte &amp; équipements
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(
                [
                  { key: 'carAccess', label: 'Accès voiture' },
                  { key: 'motoAccess', label: 'Accès moto' },
                ] as const
              ).map((item) => {
                const cur = draft.featureVerification[item.key];
                const isUnknown = cur === 'unknown';
                return (
                  <div
                    key={item.key}
                    className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
                      isUnknown
                        ? 'border-amber-400 bg-amber-50/60 dark:bg-amber-950/25'
                        : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900'
                    }`}
                  >
                    <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                      {item.label}
                    </span>
                    <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden text-[11px] font-bold">
                      {(
                        [
                          { val: 'unknown', text: '? Vérifier', activeClass: 'bg-amber-500 text-white' },
                          { val: 'yes', text: 'Oui', activeClass: 'bg-brand-green text-white' },
                          { val: 'no', text: 'Non', activeClass: 'bg-red-600 text-white' },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.val}
                          type="button"
                          onClick={() => setAccessState(item.key, opt.val)}
                          className={`px-2 py-1 transition ${
                            cur === opt.val
                              ? opt.activeClass
                              : 'bg-white dark:bg-zinc-900 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                          }`}
                        >
                          {opt.text}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Water source verification (JIRAMA probable / Moto-pompe / Puits / Maka rano / Pas d'eau) */}
            <div
              className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
                missing.includes('waterSupply')
                  ? 'border-amber-400 bg-amber-50/60 dark:bg-amber-950/25'
                  : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                  Source d&apos;eau
                </span>
                {draft.featureVerification.waterSupply === 'unknown' &&
                  Boolean(draft.features.waterPumpSupplyJirama) && (
                    <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                      (JIRAMA probable)
                    </span>
                  )}
              </div>
              <div className="inline-flex flex-wrap rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden text-[11px] font-bold">
                {(
                  [
                    {
                      key: 'unknown',
                      text: '? Vérifier',
                      active:
                        draft.featureVerification.waterSupply === 'unknown' &&
                        !hasKnownWaterSupply(draft.features),
                      activeClass: 'bg-amber-500 text-white',
                    },
                    {
                      key: 'waterPumpSupplyJirama',
                      text:
                        draft.featureVerification.waterSupply === 'unknown' &&
                        Boolean(draft.features.waterPumpSupplyJirama)
                          ? 'JIRAMA (à confirmer)'
                          : 'JIRAMA',
                      active: Boolean(draft.features.waterPumpSupplyJirama),
                      activeClass:
                        draft.featureVerification.waterSupply === 'unknown'
                          ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100'
                          : 'bg-brand-green text-white',
                    },
                    {
                      key: 'waterPumpSupply',
                      text: 'Moto-pompe / Citerne',
                      active: Boolean(draft.features.waterPumpSupply),
                      activeClass: 'bg-brand-green text-white',
                    },
                    {
                      key: 'waterWellSupply',
                      text: 'Puits / Vovo',
                      active: Boolean(draft.features.waterWellSupply),
                      activeClass: 'bg-brand-green text-white',
                    },
                    {
                      key: 'waterFetchExternal',
                      text: 'Maka rano',
                      active: Boolean(draft.features.waterFetchExternal),
                      activeClass: 'bg-amber-600 text-white',
                    },
                    {
                      key: 'no',
                      text: "Pas d'eau",
                      active: draft.featureVerification.waterSupply === 'no',
                      activeClass: 'bg-red-600 text-white',
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => toggleWaterFeature(opt.key)}
                    className={`px-2 py-1 transition ${
                      opt.active
                        ? opt.activeClass
                        : 'bg-white dark:bg-zinc-900 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {opt.text}
                  </button>
                ))}
              </div>
            </div>

            {/* Electricity source verification (JIRAMA probable / Solaire / Autre / Pas d'électricité) */}
            <div
              className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
                missing.includes('electricitySupply')
                  ? 'border-amber-400 bg-amber-50/60 dark:bg-amber-950/25'
                  : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900'
              }`}
            >
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                  Électricité
                </span>
                {draft.featureVerification.electricitySupply === 'unknown' &&
                  Boolean(draft.features.electricityJirama) && (
                    <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                      (JIRAMA probable)
                    </span>
                  )}
              </div>
              <div className="inline-flex flex-wrap rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden text-[11px] font-bold">
                {(
                  [
                    {
                      key: 'unknown',
                      text: '? Vérifier',
                      active:
                        draft.featureVerification.electricitySupply === 'unknown' &&
                        !hasKnownElectricitySupply(draft.features),
                      activeClass: 'bg-amber-500 text-white',
                    },
                    {
                      key: 'electricityJirama',
                      text:
                        draft.featureVerification.electricitySupply === 'unknown' &&
                        Boolean(draft.features.electricityJirama)
                          ? 'JIRAMA (à confirmer)'
                          : 'JIRAMA',
                      active: Boolean(draft.features.electricityJirama),
                      activeClass:
                        draft.featureVerification.electricitySupply === 'unknown'
                          ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/50 dark:text-amber-100'
                          : 'bg-brand-green text-white',
                    },
                    {
                      key: 'solarPanels',
                      text: 'Solaire',
                      active: Boolean(draft.features.solarPanels),
                      activeClass: 'bg-brand-green text-white',
                    },
                    {
                      key: 'electricityPower',
                      text: 'Compteur / Groupe',
                      active:
                        Boolean(draft.features.electricityPower) &&
                        !Boolean(draft.features.electricityJirama),
                      activeClass: 'bg-brand-green text-white',
                    },
                    {
                      key: 'no',
                      text: "Pas d'élec.",
                      active: draft.featureVerification.electricitySupply === 'no',
                      activeClass: 'bg-red-600 text-white',
                    },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => toggleElectricityFeature(opt.key)}
                    className={`px-2 py-1 transition ${
                      opt.active
                        ? opt.activeClass
                        : 'bg-white dark:bg-zinc-900 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {opt.text}
                  </button>
                ))}
              </div>
            </div>

            {/* Furnished status verification */}
            <div
              className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 ${
                missing.includes('furnishedProperty')
                  ? 'border-amber-400 bg-amber-50/60 dark:bg-amber-950/25'
                  : 'border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900'
              }`}
            >
              <span className="text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                Meublé (Misy fanaka)
              </span>
              <div className="inline-flex rounded-lg border border-zinc-200 dark:border-zinc-700 overflow-hidden text-[11px] font-bold">
                {(
                  [
                    { val: 'unknown', text: '? Vérifier', activeClass: 'bg-amber-500 text-white' },
                    { val: 'yes', text: 'Meublé', activeClass: 'bg-brand-green text-white' },
                    { val: 'no', text: 'Non meublé', activeClass: 'bg-red-600 text-white' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => setFurnishedState(opt.val)}
                    className={`px-2 py-1 transition ${
                      draft.featureVerification.furnishedProperty === opt.val
                        ? opt.activeClass
                        : 'bg-white dark:bg-zinc-900 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'
                    }`}
                  >
                    {opt.text}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Equipment / Features pills */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                Équipements détectés ({enabledFeatureKeys.length})
              </span>
              <button
                type="button"
                onClick={() => setShowAllFeatures((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-brand-green hover:underline"
              >
                {showAllFeatures
                  ? 'Réduire la liste'
                  : `Modifier les ${Object.keys(ALL_FEATURE_LABELS).length} équipements`}
                {showAllFeatures ? (
                  <ChevronUp className="w-3.5 h-3.5" />
                ) : (
                  <ChevronDown className="w-3.5 h-3.5" />
                )}
              </button>
            </div>

            {!showAllFeatures && (
              <div className="flex flex-wrap gap-1.5">
                {enabledFeatureKeys.length === 0 ? (
                  <span className="text-xs text-zinc-400">Aucun équipement spécifié</span>
                ) : (
                  enabledFeatureKeys.map((k) => (
                    <span
                      key={k}
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                        k === 'waterFetchExternal'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                          : 'bg-brand-green/15 text-brand-green'
                      }`}
                    >
                      {ALL_FEATURE_LABELS[k] || k}
                    </span>
                  ))
                )}
              </div>
            )}

            {showAllFeatures && (
              <div className="p-3.5 rounded-2xl bg-zinc-50 dark:bg-zinc-800/30 border border-zinc-200/70 dark:border-zinc-800 space-y-3">
                {PROPERTY_FEATURE_GROUPS.map((grp) => (
                  <div key={grp.label}>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-zinc-400 mb-1.5">
                      {grp.label}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {grp.items.map((item) => {
                        const active = Boolean(draft.features[item.key]);
                        return (
                          <button
                            key={item.key}
                            type="button"
                            onClick={() => {
                              if (item.key === 'carAccess' || item.key === 'motoAccess') {
                                setAccessState(
                                  item.key,
                                  active ? 'unknown' : 'yes',
                                );
                                return;
                              }
                              if (
                                item.key === 'waterPumpSupplyJirama' ||
                                item.key === 'waterPumpSupply' ||
                                item.key === 'waterWellSupply' ||
                                item.key === 'waterFetchExternal'
                              ) {
                                toggleWaterFeature(item.key);
                                return;
                              }
                              if (
                                item.key === 'electricityJirama' ||
                                item.key === 'electricityPower' ||
                                item.key === 'solarPanels'
                              ) {
                                toggleElectricityFeature(item.key);
                                return;
                              }
                              if (item.key === 'furnishedProperty') {
                                setFurnishedState(active ? 'unknown' : 'yes');
                                return;
                              }
                              setDraft((prev) => ({
                                ...prev,
                                features: { ...prev.features, [item.key]: !active },
                              }));
                            }}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                              active
                                ? item.key === 'waterFetchExternal'
                                  ? 'bg-amber-600 text-white border-amber-600'
                                  : 'bg-brand-green text-white border-brand-green'
                                : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700'
                            }`}
                          >
                            {item.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          {candidate.status !== 'approved' ? (
            <div className="pt-3 border-t border-zinc-200/70 dark:border-zinc-800 flex flex-wrap items-center justify-end gap-2.5">
              {candidate.status !== 'rejected' && (
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={handleReject}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition disabled:opacity-50"
                >
                  {busyAction === 'reject' ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Trash2 className="w-3.5 h-3.5" />
                  )}
                  Rejeter & Nettoyer GCS
                </button>
              )}

              <button
                type="button"
                disabled={busyAction !== null}
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition disabled:opacity-50"
              >
                {busyAction === 'save' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                Sauvegarder brouillon
              </button>

              <button
                type="button"
                disabled={busyAction !== null || !canPublish}
                onClick={handleApprove}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-xs font-bold bg-brand-green text-white hover:opacity-95 shadow-sm transition disabled:opacity-40"
              >
                {busyAction === 'approve' ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Check className="w-4 h-4" />
                )}
                Approuver & Publier en ligne
              </button>
            </div>
          ) : (
            <div className="pt-3 border-t border-zinc-200/70 dark:border-zinc-800 flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-300">
              <span>Annonce publiée dans Tranogasy</span>
              {candidate.publishedPropertyId && (
                <a
                  href={`/properties/${candidate.publishedPropertyId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-bold underline inline-flex items-center gap-1"
                >
                  Voir la fiche publiée <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

interface Props {
  userId: string;
  groups: FbGroupTarget[];
  onRefreshAll: () => Promise<void>;
  onNotify?: (notice: { kind: 'ok' | 'err'; text: string }) => void;
}

export default function ValidationQueueTab({ userId, groups, onRefreshAll, onNotify }: Props) {
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [typeFilter, setTypeFilter] = useState<'all' | 'rent' | 'sale'>('all');
  const [houseTypeFilter, setHouseTypeFilter] = useState<HouseCategoryFilter>('all');
  const [groupFilter, setGroupFilter] = useState('');
  const [items, setItems] = useState<FbIngestedCandidate[]>([]);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [reanalyzingAll, setReanalyzingAll] = useState(false);
  const [reanalyzeTick, setReanalyzeTick] = useState(0);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const loadCandidates = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fbIngestionService.listCandidates(userId, {
        status: statusFilter,
        type: typeFilter === 'all' ? undefined : typeFilter,
        houseType: houseTypeFilter === 'all' ? undefined : houseTypeFilter,
        groupId: groupFilter || undefined,
        limit: 40,
      });
      setItems(res.items);
      setCounts(res.counts);
    } catch (err) {
      setFeedback({ kind: 'err', text: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }, [userId, statusFilter, typeFilter, houseTypeFilter, groupFilter]);

  const handleReanalyzePending = async () => {
    setReanalyzingAll(true);
    try {
      const res = await fbIngestionService.reanalyzePending(userId);
      setFeedback({
        kind: 'ok',
        text: `Ré-analyse terminée (${res.analyzed} examinée(s), ${res.updated} mise(s) à jour : équipements, accès & mise en page).`,
      });
      await loadCandidates();
      setReanalyzeTick((t) => t + 1);
    } catch (err) {
      setFeedback({ kind: 'err', text: (err as Error).message });
    } finally {
      setReanalyzingAll(false);
    }
  };

  useEffect(() => {
    let active = true;
    const fetchInitial = async () => {
      try {
        const res = await fbIngestionService.listCandidates(userId, {
          status: statusFilter,
          type: typeFilter === 'all' ? undefined : typeFilter,
          houseType: houseTypeFilter === 'all' ? undefined : houseTypeFilter,
          groupId: groupFilter || undefined,
          limit: 40,
        });
        if (!active) return;
        setItems(res.items);
        setCounts(res.counts);
      } catch (err) {
        if (active) setFeedback({ kind: 'err', text: (err as Error).message });
      } finally {
        if (active) setLoading(false);
      }
    };
    void fetchInitial();
    return () => {
      active = false;
    };
  }, [userId, statusFilter, typeFilter, houseTypeFilter, groupFilter]);

  return (
    <div className="space-y-5">
      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-4 border border-zinc-200/80 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: 'pending', label: `En attente (${counts.pending})` },
              { id: 'approved', label: `Approuvés (${counts.approved})` },
              { id: 'rejected', label: `Rejetés (${counts.rejected})` },
              { id: 'all', label: 'Tous' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${
                statusFilter === tab.id
                  ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | 'rent' | 'sale')}
            className="px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-semibold"
          >
            <option value="all">Tous types (Rent + Sale)</option>
            <option value="rent">Location uniquement (Rent)</option>
            <option value="sale">Vente uniquement (Sale)</option>
          </select>

          <select
            value={houseTypeFilter}
            onChange={(e) => setHouseTypeFilter(e.target.value as HouseCategoryFilter)}
            className="px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-semibold"
          >
            {SEARCH_CATEGORY_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.id === 'all' ? 'Toutes catégories' : opt.label}
              </option>
            ))}
          </select>

          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-semibold max-w-[240px]"
          >
            <option value="">Tous les groupes</option>
            {groups.map((g) => (
              <option key={g.groupId} value={g.groupId}>
                {g.name}
              </option>
            ))}
          </select>

          {statusFilter === 'pending' && counts.pending > 0 && (
            <button
              type="button"
              disabled={reanalyzingAll}
              onClick={handleReanalyzePending}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:border-brand-green hover:text-brand-green transition disabled:opacity-50"
              title="Ré-analyser toutes les annonces en attente (0 crédit IA) pour détecter les équipements FR/MG/EN, les accès manquants et restaurer la mise en page"
            >
              {reanalyzingAll ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Ré-analyser la file ({counts.pending})
            </button>
          )}
        </div>
      </div>

      {feedback && (
        <div
          className={`px-4 py-3 rounded-2xl text-xs font-semibold flex items-center justify-between ${
            feedback.kind === 'ok'
              ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900'
              : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200 border border-red-200 dark:border-red-900'
          }`}
        >
          <span>{feedback.text}</span>
          <button type="button" onClick={() => setFeedback(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="py-16 flex items-center justify-center text-zinc-500 text-sm gap-2">
          <Loader2 className="w-5 h-5 animate-spin text-brand-green" /> Chargement des annonces...
        </div>
      ) : items.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-12 border border-zinc-200/80 dark:border-zinc-800 text-center space-y-2">
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            Aucun candidat dans cette file pour le moment.
          </p>
          <p className="text-xs text-zinc-500">
            Activez le scraper Live ou importez un Snapshot Bright Data existant ci-dessus pour alimenter la file de validation.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {items.map((candidate) => (
            <CandidateReviewCard
              key={`${candidate._id}_${reanalyzeTick}`}
              candidate={candidate}
              userId={userId}
              onCandidateUpdated={(updated) => {
                setItems((prev) =>
                  prev.map((it) => (it._id === updated._id ? updated : it)),
                );
                const msg = `Annonce ré-analysée (${Object.values(updated.extracted?.features || {}).filter(Boolean).length} équipements détectés)`;
                setFeedback({ kind: 'ok', text: msg });
                onNotify?.({ kind: 'ok', text: msg });
              }}
              onActionDone={async (msg) => {
                setFeedback({ kind: 'ok', text: msg });
                onNotify?.({ kind: 'ok', text: msg });
                await loadCandidates();
                await onRefreshAll();
              }}
              onError={(msg) => {
                setFeedback({ kind: 'err', text: msg });
                onNotify?.({ kind: 'err', text: msg });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
