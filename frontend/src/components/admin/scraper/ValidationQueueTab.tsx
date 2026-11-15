'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsDownUp,
  ChevronsUpDown,
  Copy,
  ExternalLink,
  ImagePlus,
  Loader2,
  MapPin,
  PhoneCall,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
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
import type { HudToast } from './FloatingOperationHud';
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
  estimatedArea: number | null;
  visitFee: string;
  cautionPercent: string;
  cautionAmount: string;
  commissionPercent: string;
  commissionAmount: string;
  floor: string;
  phone1: string;
  phone2: string;
  phone3: string;
  matchedCityId: string;
  matchedCityLabel: string;
  cityCandidates: FbIngestedCandidate['cityCandidates'];
  resolvedCoords: { lat: number; lng: number } | null;
  resolvedPlaceName: string | null;
  resolvedAddress: string | null;
  resolutionSource: 'google_places_cache' | 'google_places_api' | 'text_fallback' | null;
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

interface UploadingPhotoPreview {
  tempId: string;
  previewUrl: string;
}

function normalizeDescriptionLayout(text: string): string {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/^\n+|\n+$/g, '');
}

function toDraft(c: FbIngestedCandidate): CandidateDraft {
  const ex = c.extracted;
  const houseType = normalizeHouseType(ex?.houseType) || 'maison';
  const commercial = isCommercialHouseType(houseType);
  const features = { ...(ex?.features || {}) };
  const fv = c.featureVerification || {};
  const hasMoto = Boolean(features.motoAccess || fv.motoAccess === 'yes');
  const carAccess: AccessVerificationState = features.carAccess
    ? 'yes'
    : fv.carAccess === 'no'
      ? 'no'
      : hasMoto
        ? 'no'
        : 'unknown';
  const motoAccess: AccessVerificationState =
    features.motoAccess || carAccess === 'yes' || fv.motoAccess === 'yes'
      ? 'yes'
      : fv.motoAccess === 'no'
        ? 'no'
        : 'unknown';
  if (carAccess === 'yes') {
    features.motoAccess = true;
  }

  if (!commercial) {
    if (!hasKnownWaterSupply(features) && fv.waterSupply !== 'no') {
      features.waterPumpSupplyJirama = true;
      features.waterPumpSupply = true;
    }
    if (!hasKnownElectricitySupply(features) && fv.electricitySupply !== 'no') {
      features.electricityJirama = true;
      features.electricityPower = true;
    }
  }

  const waterSupply: AccessVerificationState =
    fv.waterSupply === 'no'
      ? 'no'
      : !commercial || fv.waterSupply === 'yes' || hasKnownWaterSupply(features)
        ? 'yes'
        : 'unknown';

  const electricitySupply: AccessVerificationState =
    fv.electricitySupply === 'no'
      ? 'no'
      : !commercial || fv.electricitySupply === 'yes' || hasKnownElectricitySupply(features)
        ? 'yes'
        : 'unknown';

  const furnishedProperty: AccessVerificationState =
    features.furnishedProperty || fv.furnishedProperty === 'yes'
      ? 'yes'
      : 'no';
  features.furnishedProperty = furnishedProperty === 'yes';

  return {
    title: ex?.title || '',
    description: normalizeDescriptionLayout(ex?.description || c.rawContent || ''),
    type: ex?.type || null,
    houseType,
    price: ex?.price != null ? String(ex.price) : '',
    rent: ex?.rent != null ? String(ex.rent) : '',
    rooms: ex?.rooms != null ? String(ex.rooms) : '',
    livingRoom:
      ex?.livingRoom != null
        ? String(ex.livingRoom)
        : !commercial
          ? ex?.rooms === 1
            ? '0'
            : '1'
          : '',
    kitchen: ex?.kitchen != null ? String(ex.kitchen) : !commercial ? '1' : '',
    toilet: ex?.toilet != null ? String(ex.toilet) : !commercial ? '1' : '',
    bathrooms: ex?.bathrooms != null ? String(ex.bathrooms) : !commercial ? '1' : '',
    area: ex?.area != null ? String(ex.area) : '',
    estimatedArea: ex?.estimatedArea ?? null,
    visitFee: ex?.visitFee != null ? String(ex.visitFee) : '',
    cautionPercent: ex?.cautionPercent != null ? String(ex.cautionPercent) : '',
    cautionAmount: ex?.cautionAmount != null ? String(ex.cautionAmount) : '',
    commissionPercent: ex?.commissionPercent != null ? String(ex.commissionPercent) : '',
    commissionAmount: ex?.commissionAmount != null ? String(ex.commissionAmount) : '',
    floor: ex?.floor || '',
    phone1: ex?.phone1 || '',
    phone2: ex?.phone2 || '',
    phone3: ex?.phone3 || '',
    matchedCityId: c.matchedCityId || '',
    matchedCityLabel: c.matchedCityLabel || '',
    cityCandidates: Array.isArray(c.cityCandidates) ? [...c.cityCandidates] : [],
    resolvedCoords: c.resolvedCoords || null,
    resolvedPlaceName: c.resolvedPlaceName || null,
    resolvedAddress: c.resolvedAddress || null,
    resolutionSource: c.resolutionSource || null,
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

function formatDistanceMeters(meters?: number): string | null {
  if (typeof meters !== 'number' || !Number.isFinite(meters)) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

function toNumOrNull(val: string): number | null {
  const clean = val.replace(/\s+/g, '');
  if (!clean) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function buildPatchFromDraft(d: CandidateDraft): Record<string, unknown> {
  const commercial = isCommercialHouseType(d.houseType);
  const rentVal = d.type === 'rent' ? toNumOrNull(d.rent) : null;
  const cautionPercent = toNumOrNull(d.cautionPercent);
  const rawCautionAmount = toNumOrNull(d.cautionAmount);
  const cautionAmount =
    cautionPercent != null && rentVal != null && rentVal > 0
      ? Math.round((rentVal * cautionPercent) / 100)
      : rawCautionAmount;
  const commissionPercent = toNumOrNull(d.commissionPercent);
  const rawCommissionAmount = toNumOrNull(d.commissionAmount);
  const commissionAmount =
    commissionPercent != null && rentVal != null && rentVal > 0
      ? Math.round((rentVal * commissionPercent) / 100)
      : rawCommissionAmount;

  return {
    title: d.title.trim(),
    description: normalizeDescriptionLayout(d.description),
    type: d.type,
    houseType: d.houseType,
    price: d.type === 'sale' ? toNumOrNull(d.price) : null,
    rent: rentVal,
    rooms: commercial ? null : toNumOrNull(d.rooms),
    livingRoom: commercial ? null : toNumOrNull(d.livingRoom),
    kitchen: commercial ? null : toNumOrNull(d.kitchen),
    toilet: toNumOrNull(d.toilet),
    bathrooms: commercial ? null : toNumOrNull(d.bathrooms),
    area: toNumOrNull(d.area),
    visitFee: toNumOrNull(d.visitFee),
    cautionPercent,
    cautionAmount,
    commissionPercent,
    commissionAmount,
    floor: d.floor.trim() || null,
    phone1: d.phone1.trim() || null,
    phone2: d.phone2.trim() || null,
    phone3: d.phone3.trim() || null,
    matchedCityId: d.matchedCityId || null,
    cityCandidates: d.cityCandidates,
    resolvedCoords: d.resolvedCoords,
    resolvedPlaceName: d.resolvedPlaceName,
    resolvedAddress: d.resolvedAddress,
    resolutionSource: d.resolutionSource,
    gcsImages: d.gcsImages,
    features: d.features,
    featureVerification: d.featureVerification,
  };
}

function mergeDraftIntoCandidate(
  candidate: FbIngestedCandidate,
  draft: CandidateDraft,
): FbIngestedCandidate {
  const commercial = isCommercialHouseType(draft.houseType);
  const rentVal = draft.type === 'rent' ? toNumOrNull(draft.rent) : null;
  const cautionPercent = toNumOrNull(draft.cautionPercent);
  const rawCautionAmount = toNumOrNull(draft.cautionAmount);
  const cautionAmount =
    cautionPercent != null && rentVal != null && rentVal > 0
      ? Math.round((rentVal * cautionPercent) / 100)
      : rawCautionAmount;
  const commissionPercent = toNumOrNull(draft.commissionPercent);
  const rawCommissionAmount = toNumOrNull(draft.commissionAmount);
  const commissionAmount =
    commissionPercent != null && rentVal != null && rentVal > 0
      ? Math.round((rentVal * commissionPercent) / 100)
      : rawCommissionAmount;

  return {
    ...candidate,
    matchedCityId: draft.matchedCityId || null,
    matchedCityLabel: draft.matchedCityLabel || null,
    cityCandidates: [...draft.cityCandidates],
    resolvedCoords: draft.resolvedCoords,
    resolvedPlaceName: draft.resolvedPlaceName,
    resolvedAddress: draft.resolvedAddress,
    resolutionSource: draft.resolutionSource,
    gcsImages: [...draft.gcsImages],
    featureVerification: { ...draft.featureVerification },
    extracted: {
      ...candidate.extracted,
      title: draft.title.trim(),
      description: normalizeDescriptionLayout(draft.description),
      type: draft.type,
      houseType: draft.houseType,
      price: draft.type === 'sale' ? toNumOrNull(draft.price) : null,
      rent: rentVal,
      rooms: commercial ? null : toNumOrNull(draft.rooms),
      livingRoom: commercial ? null : toNumOrNull(draft.livingRoom),
      kitchen: commercial ? null : toNumOrNull(draft.kitchen),
      toilet: toNumOrNull(draft.toilet),
      bathrooms: commercial ? null : toNumOrNull(draft.bathrooms),
      area: toNumOrNull(draft.area),
      estimatedArea: draft.estimatedArea,
      visitFee: toNumOrNull(draft.visitFee),
      cautionPercent,
      cautionAmount,
      commissionPercent,
      commissionAmount,
      floor: draft.floor.trim() || null,
      phone1: draft.phone1.trim() || null,
      phone2: draft.phone2.trim() || null,
      phone3: draft.phone3.trim() || null,
      features: { ...draft.features },
    },
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
  initialDraftOverride?: CandidateDraft;
  collapseSignal?: { collapsed: boolean; seq: number };
  onDirtyChange: (id: string, dirty: boolean) => void;
  onSaveDraft: (
    candidate: FbIngestedCandidate,
    draft: CandidateDraft,
    patch: Record<string, unknown>,
  ) => Promise<FbIngestedCandidate | null>;
  onApproveOptimistic: (
    candidate: FbIngestedCandidate,
    draft: CandidateDraft,
    patch: Record<string, unknown>,
  ) => void;
  onRejectOptimistic: (
    candidate: FbIngestedCandidate,
    draft: CandidateDraft,
  ) => void;
  onCandidateReanalyzed: (updated: FbIngestedCandidate) => void;
  onToastError: (title: string, text: string) => void;
}

const CandidateReviewCard = React.memo(function CandidateReviewCard({
  candidate,
  userId,
  initialDraftOverride,
  collapseSignal,
  onDirtyChange,
  onSaveDraft,
  onApproveOptimistic,
  onRejectOptimistic,
  onCandidateReanalyzed,
  onToastError,
}: CandidateCardProps) {
  const [draft, setDraft] = useState<CandidateDraft>(
    () => initialDraftOverride || toDraft(candidate),
  );
  const [savedBaseline, setSavedBaseline] = useState<string>(() =>
    JSON.stringify(buildPatchFromDraft(toDraft(candidate))),
  );
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [isReanalyzing, setIsReanalyzing] = useState(false);

  const [isCollapsed, setIsCollapsed] = useState(false);
  const [prevCollapseSeq, setPrevCollapseSeq] = useState(collapseSignal?.seq ?? 0);
  if (collapseSignal && collapseSignal.seq !== prevCollapseSeq) {
    setPrevCollapseSeq(collapseSignal.seq);
    setIsCollapsed(collapseSignal.collapsed);
  }

  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState<CityLocation[]>([]);
  const [isSearchingCity, setIsSearchingCity] = useState(false);
  const [isResolvingPlaces, setIsResolvingPlaces] = useState(false);
  const [placesFeedback, setPlacesFeedback] = useState<string | null>(null);
  const [showAllFeatures, setShowAllFeatures] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState<UploadingPhotoPreview[]>([]);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const [copiedKey, setCopiedKey] = useState<'questions' | 'phone1' | null>(null);

  const saveSeqRef = useRef(0);
  const savedBadgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activePreviewUrlsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const urls = activePreviewUrlsRef.current;
    return () => {
      if (savedBadgeTimerRef.current) clearTimeout(savedBadgeTimerRef.current);
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.clear();
    };
  }, []);

  const currentPatch = useMemo(() => buildPatchFromDraft(draft), [draft]);
  const currentSerialized = useMemo(() => JSON.stringify(currentPatch), [currentPatch]);
  const isDirty = currentSerialized !== savedBaseline;

  useEffect(() => {
    onDirtyChange(candidate._id, isDirty);
  }, [candidate._id, isDirty, onDirtyChange]);

  useEffect(() => {
    const clean = cityQuery.trim();
    if (clean.length < 2) {
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      setIsSearchingCity(true);
      try {
        const res = await cityService.searchCities(clean, 8);
        if (cancelled) return;
        setCityResults(res);

        // If local Fokontany text search finds 0 matches (e.g. "by pass", "rond point ivandry"),
        // automatically query Google Places first -> get coords -> return nearest Fokontany!
        if (res.length === 0 && clean.length >= 3) {
          setIsResolvingPlaces(true);
          try {
            const placesRes = await fbIngestionService.resolveLocation(
              userId,
              clean,
              candidate.groupName,
            );
            if (!cancelled && placesRes.bestMatch) {
              setDraft((prev) => ({
                ...prev,
                matchedCityId: prev.matchedCityId || placesRes.bestMatch!._id,
                matchedCityLabel: prev.matchedCityLabel || placesRes.bestMatch!.label,
                cityCandidates:
                  placesRes.candidates && placesRes.candidates.length > 0
                    ? placesRes.candidates
                    : prev.cityCandidates,
                resolvedCoords: placesRes.place?.coords ?? prev.resolvedCoords,
                resolvedPlaceName: placesRes.place?.placeName ?? prev.resolvedPlaceName,
                resolvedAddress: placesRes.place?.formattedAddress ?? prev.resolvedAddress,
                resolutionSource: placesRes.place?.source ?? prev.resolutionSource,
              }));
              setPlacesFeedback(
                placesRes.place?.placeName
                  ? `Google Places (« ${placesRes.place.placeName} ») → Fokontany le plus proche : ${placesRes.bestMatch.label}`
                  : `Fokontany le plus proche → ${placesRes.bestMatch.label}`,
              );
            }
          } catch {
            // Silent fallback when typing; user can still click "Via Places"
          } finally {
            if (!cancelled) setIsResolvingPlaces(false);
          }
        }
      } catch {
        if (!cancelled) setCityResults([]);
      } finally {
        if (!cancelled) setIsSearchingCity(false);
      }
    }, 320);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cityQuery, userId, candidate.groupName]);

  const handleResolvePlaces = async () => {
    const clean = cityQuery.trim();
    if (clean.length < 2 || isResolvingPlaces) return;
    setIsResolvingPlaces(true);
    setPlacesFeedback(null);
    try {
      const res = await fbIngestionService.resolveLocation(userId, clean, candidate.groupName);
      if (!res.bestMatch) {
        setPlacesFeedback('Aucun repère ou Fokontany correspondant trouvé pour cette requête.');
        return;
      }
      setDraft((prev) => ({
        ...prev,
        matchedCityId: res.bestMatch!._id,
        matchedCityLabel: res.bestMatch!.label,
        cityCandidates: res.candidates && res.candidates.length > 0 ? res.candidates : prev.cityCandidates,
        resolvedCoords: res.place?.coords ?? null,
        resolvedPlaceName: res.place?.placeName ?? null,
        resolvedAddress: res.place?.formattedAddress ?? null,
        resolutionSource: res.place?.source ?? null,
      }));
      setCityQuery('');
      setCityResults([]);
      if (res.place?.source === 'google_places_cache') {
        setPlacesFeedback(`Cache Places (0 API call) -> ${res.bestMatch.label}`);
      } else if (res.place?.source === 'google_places_api') {
        setPlacesFeedback(`Google Places API -> ${res.bestMatch.label}`);
      } else {
        setPlacesFeedback(`Fallback texte -> ${res.bestMatch.label}`);
      }
    } catch (err) {
      setPlacesFeedback((err as Error).message || 'Erreur lors de la résolution Google Places.');
    } finally {
      setIsResolvingPlaces(false);
    }
  };

  const missing = useMemo(() => computeLiveMissing(draft), [draft]);
  const estimatedFallbackAmount =
    draft.type === 'sale'
      ? Number(candidate.extracted?.estimatedPrice || 0)
      : Number(candidate.extracted?.estimatedRent || 0);
  const canPublish =
    Boolean(draft.type) &&
    Boolean(draft.matchedCityId) &&
    Boolean(draft.title.trim()) &&
    ((draft.type === 'rent' && (Number(draft.rent) > 0 || estimatedFallbackAmount > 0)) ||
      (draft.type === 'sale' && (Number(draft.price) > 0 || estimatedFallbackAmount > 0)));

  const amountVal = Number(draft.type === 'sale' ? draft.price : draft.rent) || 0;
  const enabledFeatureKeys = Object.entries(draft.features)
    .filter(([, val]) => Boolean(val))
    .map(([key]) => key);

  const handleUploadExtraPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const previews: UploadingPhotoPreview[] = files.map((file, idx) => {
      const previewUrl = URL.createObjectURL(file);
      activePreviewUrlsRef.current.add(previewUrl);
      return {
        tempId: `${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 7)}`,
        previewUrl,
      };
    });

    setUploadingPhotos((prev) => [...prev, ...previews]);

    await Promise.all(
      files.map(async (file, idx) => {
        const preview = previews[idx];
        try {
          const uploaded = await imageService.uploadImageToGCS(file);
          setDraft((prev) => ({
            ...prev,
            gcsImages: [...prev.gcsImages, uploaded.src],
          }));
        } catch (err) {
          onToastError('Erreur upload photo', (err as Error).message || 'Upload échoué');
        } finally {
          setUploadingPhotos((prev) => prev.filter((p) => p.tempId !== preview.tempId));
          URL.revokeObjectURL(preview.previewUrl);
          activePreviewUrlsRef.current.delete(preview.previewUrl);
        }
      }),
    );
  };

  const handleSave = useCallback(async () => {
    const seq = ++saveSeqRef.current;
    const prevBaseline = savedBaseline;
    setSavedBaseline(currentSerialized);
    setSaveState('saving');

    const result = await onSaveDraft(candidate, draft, currentPatch);
    if (saveSeqRef.current !== seq) return;

    if (result) {
      setSaveState('saved');
      if (savedBadgeTimerRef.current) clearTimeout(savedBadgeTimerRef.current);
      savedBadgeTimerRef.current = setTimeout(() => {
        setSaveState((curr) => (curr === 'saved' ? 'idle' : curr));
      }, 2600);
    } else {
      setSavedBaseline(prevBaseline);
      setSaveState('idle');
    }
  }, [candidate, currentPatch, currentSerialized, draft, onSaveDraft, savedBaseline]);

  const handleApprove = () => {
    if (!canPublish) {
      onToastError(
        'Champs requis manquants',
        'Renseignez au minimum le titre, le type, le montant (Ar) et la localité avant de publier.',
      );
      setIsCollapsed(false);
      return;
    }
    onApproveOptimistic(candidate, draft, currentPatch);
  };

  const handleReject = () => {
    onRejectOptimistic(candidate, draft);
  };

  const handleReanalyzeCard = async () => {
    if (isReanalyzing) return;
    setIsReanalyzing(true);
    try {
      const updated = await fbIngestionService.reanalyzeCandidate(userId, candidate._id);
      const nextDraft = toDraft(updated);
      setDraft(nextDraft);
      setSavedBaseline(JSON.stringify(buildPatchFromDraft(nextDraft)));
      onCandidateReanalyzed(updated);
    } catch (err) {
      onToastError('Erreur ré-analyse', (err as Error).message);
    } finally {
      setIsReanalyzing(false);
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
        if (state === 'yes' && nextVerif.carAccess === 'unknown') {
          nextVerif.carAccess = 'no';
          nextFeatures.carAccess = false;
        } else if (state === 'no') {
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
      onToastError('Presse-papiers', 'Impossible de copier dans le presse-papiers');
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
    <div
      onKeyDown={(e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
          e.preventDefault();
          void handleSave();
        }
      }}
      className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200/80 dark:border-zinc-800 shadow-sm overflow-hidden"
    >
      {/* Header strip */}
      <div className="px-6 py-4 bg-zinc-50/80 dark:bg-zinc-800/40 border-b border-zinc-200/70 dark:border-zinc-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
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
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={candidate.authorAvatarUrl}
                alt={candidate.authorName || 'Auteur'}
                className="w-5 h-5 rounded-full object-cover border border-zinc-200 dark:border-zinc-700"
              />
            )}
            <span
              title="Date et heure originales de publication sur Facebook (conservées telles quelles comme created_at lors de la publication sur TranoGasy)"
            >
              par <strong className="text-zinc-700 dark:text-zinc-300">{candidate.authorName || 'Membre'}</strong>
              {candidate.authorFbId ? (
                <span className="ml-1 font-mono text-[10px] text-zinc-400">
                  (ID: {candidate.authorFbId})
                </span>
              ) : null}{' '}
              • Publié FB : {new Date(candidate.datePosted).toLocaleString('fr-FR')}
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

          {typeof candidate.extracted?.qualityScore === 'number' &&
            candidate.extracted.qualityScore > 0 && (
              <span
                title="Score global de qualité TranoGasy (photos, standing, complétude, géolocalisation, fraîcheur)"
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold inline-flex items-center gap-1 ${
                  candidate.extracted.qualityScore >= 75
                    ? 'bg-brand-green/15 text-brand-green'
                    : candidate.extracted.qualityScore >= 55
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                    : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                }`}
              >
                Score Qualité : {candidate.extracted.qualityScore}/100
              </span>
            )}

          {candidate.extracted?.visualCondition && (
            <span
              title="Standing visuel détecté par Gemini Vision sur les photos"
              className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300"
            >
              Standing :{' '}
              {candidate.extracted.visualCondition === 'new_or_modern'
                ? 'Neuf / Moderne'
                : candidate.extracted.visualCondition === 'good'
                ? 'Bon état'
                : candidate.extracted.visualCondition === 'basic_or_worn'
                ? 'Simple / Ancien'
                : 'Standard'}
            </span>
          )}

          {typeof candidate.extracted?.redactedPhotoCount === 'number' &&
            candidate.extracted.redactedPhotoCount > 0 && (
              <span
                title="Nombre de photos dont les numéros de téléphone ont été floutés automatiquement"
                className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300"
              >
                {candidate.extracted.redactedPhotoCount} photo(s) floutée(s)
              </span>
            )}

          {candidate.status === 'pending' && (
            <span
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                missing.length === 0 && canPublish
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
              }`}
            >
              {missing.length === 0 && canPublish
                ? 'Prêt à publier ✓'
                : `${missing.length} à vérifier`}
            </span>
          )}

          {isDirty ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300">
              Modifié (Ctrl+S)
            </span>
          ) : saveState === 'saving' ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-zinc-200/70 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200">
              <Loader2 className="w-2.5 h-2.5 animate-spin" /> Sync...
            </span>
          ) : saveState === 'saved' ? (
            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
              Enregistré ✓
            </span>
          ) : null}
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

          <button
            type="button"
            onClick={() => setIsCollapsed((v) => !v)}
            aria-label={isCollapsed ? 'Déplier la fiche' : 'Réduire la fiche'}
            title={isCollapsed ? 'Déplier la fiche' : 'Réduire la fiche'}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:border-brand-green transition cursor-pointer"
          >
            {isCollapsed ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {/* Compact collapsed bar */}
      {isCollapsed && (
        <div className="px-6 py-3 flex flex-wrap items-center justify-between gap-3 text-xs bg-white dark:bg-zinc-900">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 min-w-0">
            <span className="font-bold text-zinc-900 dark:text-white truncate max-w-md">
              {draft.title || 'Sans titre'}
            </span>
            {amountVal > 0 && (
              <span className="font-extrabold text-brand-green">
                {amountVal.toLocaleString('fr-FR')} Ar{draft.type === 'rent' ? '/mois' : ''}
              </span>
            )}
            <span className="text-zinc-500 truncate max-w-xs">
              {draft.matchedCityLabel || 'Localité non définie'}
            </span>
            {draft.phone1 && (
              <span className="font-mono text-zinc-600 dark:text-zinc-300">{draft.phone1}</span>
            )}
            <span className="text-zinc-400">{draft.gcsImages.length} photo(s)</span>
          </div>

          {candidate.status !== 'approved' && (
            <div className="flex items-center gap-2 shrink-0">
              {candidate.status !== 'rejected' && (
                <button
                  type="button"
                  onClick={handleReject}
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-bold border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"
                >
                  <Trash2 className="w-3 h-3" /> Rejeter
                </button>
              )}
              <button
                type="button"
                disabled={!canPublish}
                onClick={handleApprove}
                className="inline-flex items-center gap-1 px-3.5 py-1 rounded-full text-[11px] font-bold bg-brand-green text-white hover:opacity-95 transition disabled:opacity-40 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" /> Approuver
              </button>
            </div>
          )}
        </div>
      )}

      {!isCollapsed && (
        <>
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
                  className="inline-flex items-center gap-1 rounded-full border border-amber-300 dark:border-amber-700 bg-white/80 dark:bg-amber-900/40 px-2.5 py-1 text-[11px] font-semibold text-amber-900 dark:text-amber-100 hover:bg-white transition cursor-pointer"
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
                    {uploadingPhotos.length > 0 ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <ImagePlus className="w-3.5 h-3.5" />
                    )}
                    {uploadingPhotos.length > 0
                      ? `Upload (${uploadingPhotos.length})...`
                      : 'Ajouter photo(s)'}
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={handleUploadExtraPhoto}
                    />
                  </label>
                </div>

                {draft.gcsImages.length === 0 && uploadingPhotos.length === 0 ? (
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
                            className="absolute top-1.5 left-1.5 w-6 h-6 rounded-full bg-black/70 text-amber-300 flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-[#7cbd1e] hover:text-white cursor-pointer"
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
                          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition hover:bg-red-600 cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}

                    {uploadingPhotos.map((preview) => (
                      <div
                        key={preview.tempId}
                        className="relative aspect-square rounded-xl overflow-hidden border border-brand-green/60 bg-zinc-100 dark:bg-zinc-800"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={preview.previewUrl}
                          alt="Upload en cours"
                          className="w-full h-full object-cover opacity-65"
                        />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Loader2 className="w-5 h-5 animate-spin text-white" />
                        </div>
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
                        className={`py-2 px-3 rounded-xl text-xs font-bold border transition cursor-pointer ${
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
                          className={`inline-flex items-center gap-1.5 py-2 px-2.5 rounded-xl text-xs font-bold border transition cursor-pointer ${
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
                    placeholder={
                      estimatedFallbackAmount > 0
                        ? `Est. IA : ~${estimatedFallbackAmount.toLocaleString('fr-FR')} Ar`
                        : 'ex: 600000'
                    }
                    className={`w-full px-3.5 py-2 rounded-xl border text-sm font-semibold focus:outline-none focus:ring-2 ${missingRing(
                      draft.type === 'sale' ? 'price' : 'rent',
                    )}`}
                  />
                  {amountVal > 0 ? (
                    <p className="text-[11px] text-zinc-500 mt-1">
                      = {(amountVal * 5).toLocaleString('fr-FR')} FMG
                    </p>
                  ) : estimatedFallbackAmount > 0 ? (
                    <div className="mt-1.5 flex flex-wrap items-center justify-between gap-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 px-2.5 py-1 text-[11px] text-amber-700 dark:text-amber-300">
                      <span>
                        Est. système :{' '}
                        <strong>~{estimatedFallbackAmount.toLocaleString('fr-FR')} Ar</strong>
                        {candidate.extracted?.estimatedPriceMin &&
                        candidate.extracted?.estimatedPriceMax
                          ? ` (${Number(candidate.extracted.estimatedPriceMin).toLocaleString('fr-FR')}–${Number(candidate.extracted.estimatedPriceMax).toLocaleString('fr-FR')})`
                          : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((prev) =>
                            prev.type === 'sale'
                              ? { ...prev, price: String(estimatedFallbackAmount) }
                              : { ...prev, rent: String(estimatedFallbackAmount) },
                          )
                        }
                        className="rounded bg-amber-500/20 hover:bg-amber-500/30 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-800 dark:text-amber-200 cursor-pointer"
                        title="Copier l'estimation comme prix fixe, ou laisser vide pour publier avec le badge 'Estimation TranoGasy'"
                      >
                        Appliquer
                      </button>
                    </div>
                  ) : null}
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
                    <span className="text-xs font-semibold text-amber-600">
                      Aucune localité liée
                    </span>
                  )}
                </div>

                {draft.resolvedPlaceName && (
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-300 bg-white/80 dark:bg-zinc-900/60 border border-zinc-200/80 dark:border-zinc-700/70 rounded-xl px-2.5 py-1.5">
                    <span className="font-medium truncate max-w-[320px]" title={draft.resolvedAddress || draft.resolvedPlaceName}>
                      Repère : <strong>{draft.resolvedPlaceName}</strong>
                    </span>
                    {draft.resolvedCoords && (
                      <span className="font-mono text-[10px] text-zinc-400">
                        ({draft.resolvedCoords.lat.toFixed(5)}, {draft.resolvedCoords.lng.toFixed(5)})
                      </span>
                    )}
                    {draft.resolutionSource && (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                          draft.resolutionSource === 'google_places_cache'
                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300'
                            : draft.resolutionSource === 'google_places_api'
                              ? 'bg-sky-100 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300'
                              : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300'
                        }`}
                      >
                        {draft.resolutionSource === 'google_places_cache'
                          ? 'Places (cache · 0 token)'
                          : draft.resolutionSource === 'google_places_api'
                            ? 'Google Places API'
                            : 'Fallback texte'}
                      </span>
                    )}
                  </div>
                )}

                {draft.cityCandidates && draft.cityCandidates.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {draft.cityCandidates.map((cand) => {
                      const selected = draft.matchedCityId === cand._id;
                      const distLabel = formatDistanceMeters(cand.distanceMeters);
                      return (
                        <button
                          key={cand._id}
                          type="button"
                          onClick={() => {
                            setPlacesFeedback(null);
                            setDraft((prev) => ({
                              ...prev,
                              matchedCityId: cand._id,
                              matchedCityLabel: cand.label,
                            }));
                          }}
                          className={`text-[11px] px-2.5 py-1 rounded-full border transition font-medium cursor-pointer ${
                            selected
                              ? 'bg-brand-green text-white border-brand-green'
                              : 'bg-white dark:bg-zinc-900 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-brand-green'
                          }`}
                        >
                          {cand.label}
                          {distLabel ? ` · ${distLabel}` : ` (${cand.score})`}
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="relative">
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <input
                        type="text"
                        value={cityQuery}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleResolvePlaces();
                          }
                        }}
                        onChange={(e) => {
                          const val = e.target.value;
                          setCityQuery(val);
                          setPlacesFeedback(null);
                          if (val.trim().length < 2) {
                            setCityResults([]);
                          }
                        }}
                        placeholder="Rechercher un Fokontany ou un lieu/repère (ex: By Pass, Rond-point Ivandry, Lycée Français...)"
                        className={`w-full px-3.5 py-1.5 rounded-xl border text-xs focus:outline-none focus:ring-2 ${missingRing(
                          'city',
                        )}`}
                      />
                      {isSearchingCity && (
                        <Loader2 className="w-3.5 h-3.5 animate-spin absolute right-3 top-2 text-zinc-400" />
                      )}
                    </div>
                    <button
                      type="button"
                      disabled={cityQuery.trim().length < 2 || isResolvingPlaces}
                      onClick={() => void handleResolvePlaces()}
                      title="Géolocaliser ce quartier/repère via Google Places (avec cache 90j) et trouver le Fokontany DB le plus proche"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 hover:border-brand-green hover:text-brand-green disabled:opacity-45 disabled:cursor-not-allowed transition cursor-pointer shrink-0"
                    >
                      {isResolvingPlaces ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Search className="w-3.5 h-3.5 text-brand-green" />
                      )}
                      Via Places
                    </button>
                  </div>
                  {placesFeedback && (
                    <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                      {placesFeedback}
                    </p>
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
                              setPlacesFeedback(null);
                              setDraft((prev) => ({
                                ...prev,
                                matchedCityId: city._id,
                                matchedCityLabel: label,
                                resolvedCoords: city.coords ?? null,
                                resolvedPlaceName: null,
                                resolvedAddress: null,
                                resolutionSource: null,
                              }));
                              setCityQuery('');
                              setCityResults([]);
                            }}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-brand-green/10 transition cursor-pointer"
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
                  <div
                    className={`grid gap-2 ${
                      commercial ? 'grid-cols-3' : 'grid-cols-3 sm:grid-cols-7'
                    }`}
                  >
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
                          placeholder={
                            field.key === 'area' && draft.estimatedArea
                              ? `~${draft.estimatedArea} (est.)`
                              : '—'
                          }
                          title={
                            field.key === 'area'
                              ? draft.estimatedArea
                                ? `Surface estimée pour l'algorithme serveur : ~${draft.estimatedArea} m² (non affichée au public si laissé vide)`
                                : 'Surface habitable (optionnelle — laisser vide si non mentionnée)'
                              : undefined
                          }
                          className={`w-full px-2.5 py-1.5 rounded-xl border text-xs font-semibold focus:outline-none focus:ring-2 ${missingRing(
                            field.key,
                          )}`}
                        />
                      </div>
                    ))}
                    <div>
                      <label className="block text-[11px] font-semibold text-zinc-500 mb-1">
                        Étage
                      </label>
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

              {/* Agency & Entry Fees (Droit de visite, Caution, Commission) */}
              {(() => {
                const hasAnyFee =
                  draft.visitFee.trim() !== '' ||
                  draft.cautionPercent.trim() !== '' ||
                  draft.cautionAmount.trim() !== '' ||
                  draft.commissionPercent.trim() !== '' ||
                  draft.commissionAmount.trim() !== '';
                const visitFeeNum = toNumOrNull(draft.visitFee);
                const cautionPctNum = toNumOrNull(draft.cautionPercent);
                const cautionAmtNum =
                  cautionPctNum != null && amountVal > 0
                    ? Math.round((amountVal * cautionPctNum) / 100)
                    : toNumOrNull(draft.cautionAmount);
                const commissionPctNum = toNumOrNull(draft.commissionPercent);
                const commissionAmtNum =
                  commissionPctNum != null && amountVal > 0
                    ? Math.round((amountVal * commissionPctNum) / 100)
                    : toNumOrNull(draft.commissionAmount);

                return (
                  <div
                    className={`p-3 rounded-2xl border space-y-2.5 transition ${
                      hasAnyFee
                        ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-brand-green/40'
                        : 'bg-zinc-50/70 dark:bg-zinc-800/25 border-zinc-200/80 dark:border-zinc-800'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-zinc-700 dark:text-zinc-200">
                          Conditions &amp; Frais d&apos;entrée (Droit de visite, Caution, Commission)
                        </span>
                        {hasAnyFee && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-brand-green/15 text-brand-green">
                            Mentionné dans l&apos;annonce
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] font-medium text-zinc-400">
                        Optionnel • Affiché aux utilisateurs uniquement si renseigné
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      {/* Droit de visite */}
                      <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-white dark:bg-zinc-900 p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
                            Droit de visite (Ar)
                          </label>
                          {visitFeeNum != null && (
                            <span className="text-[10px] font-bold text-brand-green">
                              {visitFeeNum === 0
                                ? 'Gratuit'
                                : `${(visitFeeNum * 5).toLocaleString('fr-FR')} FMG`}
                            </span>
                          )}
                        </div>
                        <input
                          type="number"
                          min={0}
                          step={1000}
                          value={draft.visitFee}
                          onChange={(e) =>
                            setDraft((prev) => ({ ...prev, visitFee: e.target.value }))
                          }
                          placeholder="Non mentionné"
                          className="w-full px-2.5 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-green"
                        />
                        <div className="flex flex-wrap gap-1">
                          {[
                            { label: 'Gratuit', val: '0' },
                            { label: '5 000', val: '5000' },
                            { label: '10 000', val: '10000' },
                          ].map((preset) => (
                            <button
                              key={preset.val}
                              type="button"
                              onClick={() =>
                                setDraft((prev) => ({
                                  ...prev,
                                  visitFee: prev.visitFee === preset.val ? '' : preset.val,
                                }))
                              }
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                                draft.visitFee === preset.val
                                  ? 'bg-brand-green text-white'
                                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200'
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                          {draft.visitFee !== '' && (
                            <button
                              type="button"
                              onClick={() => setDraft((prev) => ({ ...prev, visitFee: '' }))}
                              className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-zinc-400 hover:text-red-500 cursor-pointer"
                            >
                              Effacer
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Caution */}
                      <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-white dark:bg-zinc-900 p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
                            Caution (% du loyer)
                          </label>
                          {cautionAmtNum != null && cautionAmtNum > 0 && (
                            <span className="text-[10px] font-bold text-brand-green">
                              = {cautionAmtNum.toLocaleString('fr-FR')} Ar
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          <input
                            type="number"
                            min={0}
                            max={300}
                            value={draft.cautionPercent}
                            onChange={(e) => {
                              const nextPct = e.target.value;
                              const pctNum = toNumOrNull(nextPct);
                              setDraft((prev) => ({
                                ...prev,
                                cautionPercent: nextPct,
                                cautionAmount:
                                  pctNum != null && amountVal > 0
                                    ? String(Math.round((amountVal * pctNum) / 100))
                                    : '',
                              }));
                            }}
                            placeholder="Non mentionné"
                            className="w-full pl-2.5 pr-7 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-green"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-zinc-400 pointer-events-none">
                            %
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {[
                            { label: '50%', val: '50' },
                            { label: '100% (1 mois)', val: '100' },
                          ].map((preset) => (
                            <button
                              key={preset.val}
                              type="button"
                              onClick={() =>
                                setDraft((prev) => {
                                  const nextVal = prev.cautionPercent === preset.val ? '' : preset.val;
                                  const pctNum = toNumOrNull(nextVal);
                                  return {
                                    ...prev,
                                    cautionPercent: nextVal,
                                    cautionAmount:
                                      pctNum != null && amountVal > 0
                                        ? String(Math.round((amountVal * pctNum) / 100))
                                        : '',
                                  };
                                })
                              }
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                                draft.cautionPercent === preset.val
                                  ? 'bg-brand-green text-white'
                                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200'
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                          {(draft.cautionPercent !== '' || draft.cautionAmount !== '') && (
                            <button
                              type="button"
                              onClick={() =>
                                setDraft((prev) => ({
                                  ...prev,
                                  cautionPercent: '',
                                  cautionAmount: '',
                                }))
                              }
                              className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-zinc-400 hover:text-red-500 cursor-pointer"
                            >
                              Effacer
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Commission */}
                      <div className="rounded-xl border border-zinc-200/80 dark:border-zinc-700/80 bg-white dark:bg-zinc-900 p-2.5 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-bold text-zinc-600 dark:text-zinc-300">
                            Commission (% loyer)
                          </label>
                          {commissionAmtNum != null && commissionAmtNum > 0 && (
                            <span className="text-[10px] font-bold text-brand-green">
                              = {commissionAmtNum.toLocaleString('fr-FR')} Ar
                            </span>
                          )}
                        </div>
                        <div className="relative">
                          <input
                            type="number"
                            min={0}
                            max={200}
                            value={draft.commissionPercent}
                            onChange={(e) => {
                              const nextPct = e.target.value;
                              const pctNum = toNumOrNull(nextPct);
                              setDraft((prev) => ({
                                ...prev,
                                commissionPercent: nextPct,
                                commissionAmount:
                                  pctNum != null && amountVal > 0
                                    ? String(Math.round((amountVal * pctNum) / 100))
                                    : '',
                              }));
                            }}
                            placeholder="Non mentionné"
                            className="w-full pl-2.5 pr-7 py-1.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800/60 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-green"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11px] font-bold text-zinc-400 pointer-events-none">
                            %
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {[
                            { label: '50%', val: '50' },
                            { label: '100% (1 mois)', val: '100' },
                          ].map((preset) => (
                            <button
                              key={preset.val}
                              type="button"
                              onClick={() =>
                                setDraft((prev) => {
                                  const nextVal =
                                    prev.commissionPercent === preset.val ? '' : preset.val;
                                  const pctNum = toNumOrNull(nextVal);
                                  return {
                                    ...prev,
                                    commissionPercent: nextVal,
                                    commissionAmount:
                                      pctNum != null && amountVal > 0
                                        ? String(Math.round((amountVal * pctNum) / 100))
                                        : '',
                                  };
                                })
                              }
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold transition cursor-pointer ${
                                draft.commissionPercent === preset.val
                                  ? 'bg-brand-green text-white'
                                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200'
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                          {(draft.commissionPercent !== '' || draft.commissionAmount !== '') && (
                            <button
                              type="button"
                              onClick={() =>
                                setDraft((prev) => ({
                                  ...prev,
                                  commissionPercent: '',
                                  commissionAmount: '',
                                }))
                              }
                              className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold text-zinc-400 hover:text-red-500 cursor-pointer"
                            >
                              Effacer
                            </button>
                          )}
                        </div>
                      </div>
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
                                className="text-[10px] font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
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

              {/* Description preserving layout */}
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
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-600 dark:text-zinc-300 hover:text-brand-green transition cursor-pointer"
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
                    disabled={isReanalyzing}
                    onClick={handleReanalyzeCard}
                    className="inline-flex items-center gap-1 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-2.5 py-1 text-[11px] font-semibold text-zinc-700 dark:text-zinc-200 hover:border-brand-green hover:text-brand-green transition disabled:opacity-50 cursor-pointer"
                    title="Ré-analyser le texte (FR / MG / EN) pour détecter terrasse, parking, accès, JIRAMA, moto-pompe, solaire, maka rano, meublé et restaurer la mise en page"
                  >
                    {isReanalyzing ? (
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
                              className={`px-2 py-1 transition cursor-pointer ${
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

                {/* Water source verification */}
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
                        className={`px-2 py-1 transition cursor-pointer ${
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

                {/* Electricity source verification */}
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
                        className={`px-2 py-1 transition cursor-pointer ${
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
                        className={`px-2 py-1 transition cursor-pointer ${
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
                    className="inline-flex items-center gap-1 text-xs font-semibold text-brand-green hover:underline cursor-pointer"
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
                                className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition cursor-pointer ${
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

              {/* Action Buttons (Non-blocking & Optimistic) */}
              {candidate.status !== 'approved' ? (
                <div className="pt-3 border-t border-zinc-200/70 dark:border-zinc-800 flex flex-wrap items-center justify-end gap-2.5">
                  {candidate.status !== 'rejected' && (
                    <button
                      type="button"
                      onClick={handleReject}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Rejeter &amp; Nettoyer GCS
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void handleSave()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition cursor-pointer"
                  >
                    {saveState === 'saving' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-green" />
                    ) : saveState === 'saved' && !isDirty ? (
                      <Check className="w-3.5 h-3.5 text-brand-green" />
                    ) : (
                      <Save className="w-3.5 h-3.5" />
                    )}
                    {saveState === 'saved' && !isDirty
                      ? 'Brouillon sauvegardé'
                      : 'Sauvegarder brouillon'}
                  </button>

                  <button
                    type="button"
                    disabled={!canPublish}
                    onClick={handleApprove}
                    className="inline-flex items-center gap-1.5 px-5 py-2 rounded-full text-xs font-bold bg-brand-green text-white hover:opacity-95 shadow-sm transition disabled:opacity-40 cursor-pointer disabled:cursor-not-allowed"
                  >
                    <Check className="w-4 h-4" />
                    Approuver &amp; Publier en ligne
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
        </>
      )}
    </div>
  );
});

interface Props {
  userId: string;
  groups: FbGroupTarget[];
  refreshNonce?: number;
  onCandidateCountDelta?: (
    groupId: string,
    delta: { approvedCount?: number; rejectedCount?: number },
  ) => void;
  onPushToast: (toast: Omit<HudToast, 'id'>, autoHideMs?: number) => string;
  onUpdateToast: (
    id: string,
    patch: Partial<Omit<HudToast, 'id'>>,
    autoHideMs?: number,
  ) => void;
}

const PAGE_SIZE = 40;

export default function ValidationQueueTab({
  userId,
  groups,
  refreshNonce = 0,
  onCandidateCountDelta,
  onPushToast,
  onUpdateToast,
}: Props) {
  const [statusFilter, setStatusFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending');
  const [typeFilter, setTypeFilter] = useState<'all' | 'rent' | 'sale'>('all');
  const [houseTypeFilter, setHouseTypeFilter] = useState<HouseCategoryFilter>('all');
  const [groupFilter, setGroupFilter] = useState('');
  const [quickSearch, setQuickSearch] = useState('');

  const [items, setItems] = useState<FbIngestedCandidate[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [counts, setCounts] = useState({ pending: 0, approved: 0, rejected: 0 });
  const [initialLoading, setInitialLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [reanalyzingAll, setReanalyzingAll] = useState(false);
  const [cardVersions, setCardVersions] = useState<Record<string, number>>({});
  const [restoredDrafts, setRestoredDrafts] = useState<Record<string, CandidateDraft>>({});
  const [collapseSignal, setCollapseSignal] = useState<{ collapsed: boolean; seq: number }>({
    collapsed: false,
    seq: 0,
  });

  const dirtyIdsRef = useRef<Set<string>>(new Set());
  const listAbortRef = useRef<AbortController | null>(null);
  const statusFilterRef = useRef(statusFilter);
  useEffect(() => {
    statusFilterRef.current = statusFilter;
  }, [statusFilter]);

  const handleDirtyChange = useCallback((id: string, dirty: boolean) => {
    if (dirty) {
      dirtyIdsRef.current.add(id);
    } else {
      dirtyIdsRef.current.delete(id);
    }
  }, []);

  const fetchCandidatesPage = useCallback(
    async (opts?: { pageNum?: number; append?: boolean; bumpCleanCards?: boolean }) => {
      const targetPage = opts?.pageNum ?? 1;
      const append = Boolean(opts?.append);

      if (!append) {
        listAbortRef.current?.abort();
      }
      const controller = new AbortController();
      if (!append) {
        listAbortRef.current = controller;
        setIsFetching(true);
      } else {
        setIsLoadingMore(true);
      }
      setLoadError(null);

      try {
        const res = await fbIngestionService.listCandidates(
          userId,
          {
            status: statusFilter,
            type: typeFilter === 'all' ? undefined : typeFilter,
            houseType: houseTypeFilter === 'all' ? undefined : houseTypeFilter,
            groupId: groupFilter || undefined,
            page: targetPage,
            limit: PAGE_SIZE,
          },
          { signal: controller.signal },
        );
        if (controller.signal.aborted) return;

        setTotal(res.total);
        setCounts(res.counts);
        setPage(targetPage);

        if (append) {
          setItems((prev) => {
            const seen = new Set(prev.map((x) => x._id));
            const nextExtra = res.items.filter((x) => !seen.has(x._id));
            return [...prev, ...nextExtra];
          });
        } else {
          setItems(res.items);
          if (opts?.bumpCleanCards) {
            setCardVersions((prev) => {
              const next = { ...prev };
              for (const item of res.items) {
                if (!dirtyIdsRef.current.has(item._id)) {
                  next[item._id] = (next[item._id] || 0) + 1;
                }
              }
              return next;
            });
          }
        }
      } catch (err) {
        if (controller.signal.aborted || (err as Error)?.name === 'AbortError') return;
        const msg = (err as Error).message || 'Erreur lors du chargement des annonces.';
        setLoadError(msg);
      } finally {
        if (!controller.signal.aborted) {
          setInitialLoading(false);
          setIsFetching(false);
          setIsLoadingMore(false);
        }
      }
    },
    [userId, statusFilter, typeFilter, houseTypeFilter, groupFilter],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void fetchCandidatesPage({ pageNum: 1 });
    }, 0);
    return () => {
      clearTimeout(timer);
      listAbortRef.current?.abort();
    };
  }, [fetchCandidatesPage, refreshNonce]);

  const handleSaveDraft = useCallback(
    async (
      candidate: FbIngestedCandidate,
      draft: CandidateDraft,
      patch: Record<string, unknown>,
    ): Promise<FbIngestedCandidate | null> => {
      const optimisticCandidate = mergeDraftIntoCandidate(candidate, draft);
      setItems((prev) =>
        prev.map((it) => (it._id === candidate._id ? optimisticCandidate : it)),
      );

      try {
        const saved = await fbIngestionService.updateCandidate(userId, candidate._id, patch);
        setItems((prev) =>
          prev.map((it) => (it._id === candidate._id ? saved : it)),
        );
        onPushToast(
          {
            kind: 'ok',
            title: 'Brouillon sauvegardé',
            text: draft.title.trim() || candidate.groupName,
          },
          3200,
        );
        return saved;
      } catch (err) {
        setItems((prev) =>
          prev.map((it) => (it._id === candidate._id ? candidate : it)),
        );
        onPushToast({
          kind: 'err',
          title: 'Échec sauvegarde brouillon',
          text: (err as Error).message,
        });
        return null;
      }
    },
    [userId, onPushToast],
  );

  const handleApproveOptimistic = useCallback(
    (
      candidate: FbIngestedCandidate,
      draft: CandidateDraft,
      patch: Record<string, unknown>,
    ) => {
      const prevStatus = candidate.status;
      const originalIndex = items.findIndex((it) => it._id === candidate._id);
      const activeFilter = statusFilterRef.current;

      // Clear any leftover draft restore key for this card
      setRestoredDrafts((prev) => {
        if (!(candidate._id in prev)) return prev;
        const next = { ...prev };
        delete next[candidate._id];
        return next;
      });

      // Immediate optimistic UI update
      if (activeFilter === 'pending') {
        setItems((prev) => prev.filter((it) => it._id !== candidate._id));
        setTotal((t) => Math.max(0, t - 1));
      } else {
        setItems((prev) =>
          prev.map((it) =>
            it._id === candidate._id
              ? { ...mergeDraftIntoCandidate(it, draft), status: 'approved' }
              : it,
          ),
        );
      }

      setCounts((c) => ({
        ...c,
        [prevStatus]: Math.max(0, c[prevStatus] - 1),
        approved: c.approved + 1,
      }));
      onCandidateCountDelta?.(candidate.groupId, { approvedCount: 1 });

      const toastId = onPushToast({
        kind: 'pending',
        title: 'Publication en cours...',
        text: draft.title.trim() || candidate.groupName,
      });

      void fbIngestionService
        .approveCandidate(userId, candidate._id, patch)
        .then((res) => {
          const propId = res.property?._id ? String(res.property._id) : null;
          const propLabel = res.property?.propertyNumber || propId || '';
          onUpdateToast(
            toastId,
            {
              kind: 'ok',
              title: 'Annonce publiée en ligne',
              text: `#${propLabel} — ${draft.title.trim() || candidate.groupName}`,
              actionLabel: propId ? 'Voir la fiche publiée' : undefined,
              actionHref: propId ? `/properties/${propId}` : undefined,
            },
            6500,
          );
          setItems((prev) =>
            prev.map((it) => (it._id === candidate._id ? res.candidate : it)),
          );
        })
        .catch((err) => {
          // Roll back card (with all unsaved edits preserved!) and counters
          setCounts((c) => ({
            ...c,
            [prevStatus]: c[prevStatus] + 1,
            approved: Math.max(0, c.approved - 1),
          }));
          onCandidateCountDelta?.(candidate.groupId, { approvedCount: -1 });

          if (activeFilter === 'pending') {
            setRestoredDrafts((prev) => ({ ...prev, [candidate._id]: draft }));
            setItems((prev) => {
              if (prev.some((it) => it._id === candidate._id)) return prev;
              const copy = [...prev];
              const insertAt = originalIndex >= 0 ? Math.min(originalIndex, copy.length) : 0;
              copy.splice(insertAt, 0, candidate);
              return copy;
            });
            setTotal((t) => t + 1);
          } else {
            setItems((prev) =>
              prev.map((it) => (it._id === candidate._id ? candidate : it)),
            );
          }

          onUpdateToast(toastId, {
            kind: 'err',
            title: 'Échec de publication (fiche restaurée)',
            text: (err as Error).message,
          });
        });
    },
    [items, onCandidateCountDelta, onPushToast, onUpdateToast, userId],
  );

  const handleRejectOptimistic = useCallback(
    (candidate: FbIngestedCandidate, draft: CandidateDraft) => {
      const prevStatus = candidate.status;
      const originalIndex = items.findIndex((it) => it._id === candidate._id);
      const activeFilter = statusFilterRef.current;

      if (activeFilter === 'pending') {
        setItems((prev) => prev.filter((it) => it._id !== candidate._id));
        setTotal((t) => Math.max(0, t - 1));
      } else {
        setItems((prev) =>
          prev.map((it) =>
            it._id === candidate._id
              ? { ...it, status: 'rejected', gcsImages: [] }
              : it,
          ),
        );
      }

      setCounts((c) => ({
        ...c,
        [prevStatus]: Math.max(0, c[prevStatus] - 1),
        rejected: c.rejected + 1,
      }));
      onCandidateCountDelta?.(candidate.groupId, { rejectedCount: 1 });

      const toastId = onPushToast({
        kind: 'pending',
        title: 'Rejet & nettoyage GCS...',
        text: draft.title.trim() || candidate.groupName,
      });

      void fbIngestionService
        .rejectCandidate(userId, candidate._id)
        .then((res) => {
          onUpdateToast(
            toastId,
            {
              kind: 'ok',
              title: 'Annonce rejetée',
              text: `${res.deletedGcsImages} photo(s) supprimée(s) du cloud`,
            },
            4500,
          );
        })
        .catch((err) => {
          setCounts((c) => ({
            ...c,
            [prevStatus]: c[prevStatus] + 1,
            rejected: Math.max(0, c.rejected - 1),
          }));
          onCandidateCountDelta?.(candidate.groupId, { rejectedCount: -1 });

          if (activeFilter === 'pending') {
            setRestoredDrafts((prev) => ({ ...prev, [candidate._id]: draft }));
            setItems((prev) => {
              if (prev.some((it) => it._id === candidate._id)) return prev;
              const copy = [...prev];
              const insertAt = originalIndex >= 0 ? Math.min(originalIndex, copy.length) : 0;
              copy.splice(insertAt, 0, candidate);
              return copy;
            });
            setTotal((t) => t + 1);
          } else {
            setItems((prev) =>
              prev.map((it) => (it._id === candidate._id ? candidate : it)),
            );
          }

          onUpdateToast(toastId, {
            kind: 'err',
            title: 'Échec du rejet (fiche restaurée)',
            text: (err as Error).message,
          });
        });
    },
    [items, onCandidateCountDelta, onPushToast, onUpdateToast, userId],
  );

  const handleCandidateReanalyzed = useCallback(
    (updated: FbIngestedCandidate) => {
      setItems((prev) => prev.map((it) => (it._id === updated._id ? updated : it)));
      const featuresCount = Object.values(updated.extracted?.features || {}).filter(
        Boolean,
      ).length;
      onPushToast(
        {
          kind: 'ok',
          title: 'Annonce ré-analysée',
          text: `${featuresCount} équipement(s) détecté(s)`,
        },
        4000,
      );
    },
    [onPushToast],
  );

  const handleToastError = useCallback(
    (title: string, text: string) => {
      onPushToast({ kind: 'err', title, text });
    },
    [onPushToast],
  );

  const handleReanalyzePending = async () => {
    if (reanalyzingAll) return;
    setReanalyzingAll(true);
    const toastId = onPushToast({
      kind: 'pending',
      title: 'Ré-analyse de la file en cours...',
      text: 'Analyse déterministe des équipements et mise en page (0 crédit IA)',
    });
    try {
      const res = await fbIngestionService.reanalyzePending(userId);
      onUpdateToast(
        toastId,
        {
          kind: 'ok',
          title: 'Ré-analyse terminée',
          text: `${res.analyzed} examinée(s), ${res.updated} mise(s) à jour.`,
        },
        5000,
      );
      await fetchCandidatesPage({ pageNum: 1, bumpCleanCards: true });
    } catch (err) {
      onUpdateToast(toastId, {
        kind: 'err',
        title: 'Erreur ré-analyse',
        text: (err as Error).message,
      });
    } finally {
      setReanalyzingAll(false);
    }
  };

  const filteredItems = useMemo(() => {
    const q = quickSearch.trim().toLowerCase();
    if (!q) return items;
    return items.filter((c) => {
      const haystack = [
        c.extracted?.title,
        c.authorName,
        c.groupName,
        c.matchedCityLabel,
        c.extracted?.phone1,
        c.extracted?.phone2,
        c.rawContent,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, quickSearch]);

  const toggleAllCollapsed = () => {
    setCollapseSignal((prev) => ({
      collapsed: !prev.collapsed,
      seq: prev.seq + 1,
    }));
  };

  return (
    <div className="space-y-5">
      {/* Filter Toolbar */}
      <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-4 border border-zinc-200/80 dark:border-zinc-800 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
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
                className={`px-4 py-1.5 rounded-full text-xs font-bold transition cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700'
                }`}
              >
                {tab.label}
              </button>
            ))}

            {isFetching && !initialLoading && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-zinc-500 px-2">
                <Loader2 className="w-3 h-3 animate-spin text-brand-green" />
                Mise à jour...
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={quickSearch}
                onChange={(e) => setQuickSearch(e.target.value)}
                placeholder="Filtrer dans la file..."
                className="pl-8 pr-7 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs w-48 focus:outline-none focus:ring-2 focus:ring-brand-green"
              />
              {quickSearch && (
                <button
                  type="button"
                  onClick={() => setQuickSearch('')}
                  aria-label="Effacer le filtre"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-700 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {filteredItems.length > 0 && (
              <button
                type="button"
                onClick={toggleAllCollapsed}
                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-semibold text-zinc-600 dark:text-zinc-300 hover:border-brand-green transition cursor-pointer"
                title={
                  collapseSignal.collapsed
                    ? 'Déplier toutes les fiches'
                    : 'Réduire toutes les fiches'
                }
              >
                {collapseSignal.collapsed ? (
                  <>
                    <ChevronsUpDown className="w-3.5 h-3.5" /> Tout déplier
                  </>
                ) : (
                  <>
                    <ChevronsDownUp className="w-3.5 h-3.5" /> Tout réduire
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => void fetchCandidatesPage({ pageNum: 1 })}
              disabled={isFetching}
              title="Actualiser la file en arrière-plan"
              className="p-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-brand-green transition disabled:opacity-50 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
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
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:border-brand-green hover:text-brand-green transition disabled:opacity-50 cursor-pointer"
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

      {loadError && (
        <div className="px-4 py-3 rounded-2xl text-xs font-semibold flex items-center justify-between gap-2 bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-200 border border-red-200 dark:border-red-900">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => void fetchCandidatesPage({ pageNum: 1 })}
            className="px-3 py-1 rounded-full bg-red-700 text-white text-[11px] font-bold hover:opacity-90 cursor-pointer"
          >
            Réessayer
          </button>
        </div>
      )}

      {initialLoading ? (
        <div className="space-y-4">
          {[0, 1].map((idx) => (
            <div
              key={idx}
              className="bg-white dark:bg-zinc-900 rounded-[2rem] border border-zinc-200/80 dark:border-zinc-800 p-6 space-y-4 animate-pulse"
            >
              <div className="flex items-center justify-between">
                <div className="h-5 w-1/3 rounded-full bg-zinc-200 dark:bg-zinc-800" />
                <div className="h-5 w-28 rounded-full bg-zinc-200 dark:bg-zinc-800" />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-5 h-48 rounded-2xl bg-zinc-200 dark:bg-zinc-800" />
                <div className="lg:col-span-7 space-y-3">
                  <div className="h-8 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-8 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
                  <div className="h-24 rounded-xl bg-zinc-200 dark:bg-zinc-800" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="bg-white dark:bg-zinc-900 rounded-[2rem] p-12 border border-zinc-200/80 dark:border-zinc-800 text-center space-y-2">
          <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">
            {quickSearch
              ? 'Aucune annonce ne correspond à ce filtre texte.'
              : 'Aucun candidat dans cette file pour le moment.'}
          </p>
          <p className="text-xs text-zinc-500">
            {quickSearch
              ? 'Effacez le champ de recherche rapide pour voir toute la file.'
              : 'Activez le scraper Live ou importez un Snapshot Bright Data existant ci-dessus pour alimenter la file de validation.'}
          </p>
        </div>
      ) : (
        <div
          className={`space-y-6 transition-opacity duration-150 ${
            isFetching ? 'opacity-65' : 'opacity-100'
          }`}
        >
          {filteredItems.map((candidate) => (
            <CandidateReviewCard
              key={`${candidate._id}_${cardVersions[candidate._id] || 0}`}
              candidate={candidate}
              userId={userId}
              initialDraftOverride={restoredDrafts[candidate._id]}
              collapseSignal={collapseSignal}
              onDirtyChange={handleDirtyChange}
              onSaveDraft={handleSaveDraft}
              onApproveOptimistic={handleApproveOptimistic}
              onRejectOptimistic={handleRejectOptimistic}
              onCandidateReanalyzed={handleCandidateReanalyzed}
              onToastError={handleToastError}
            />
          ))}

          {items.length < total && !quickSearch && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                disabled={isLoadingMore}
                onClick={() => void fetchCandidatesPage({ pageNum: page + 1, append: true })}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-xs font-bold text-zinc-700 dark:text-zinc-200 hover:border-brand-green transition disabled:opacity-50 cursor-pointer"
              >
                {isLoadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-green" />}
                Charger plus ({items.length} / {total})
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
