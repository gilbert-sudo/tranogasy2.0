import { useState, useCallback } from 'react';
import type { ClaimableListingPreview, SuggestedFbProfile } from '../services/auth.service';
import { propertyService } from '../services/property.service';
import { useUserStore } from '../store/userStore';
import { usePropertyStore } from '../store/propertyStore';

export function usePropertyClaim() {
  const currentUserSession = useUserStore((state) => state.user);
  const setUser = useUserStore((state) => state.setUser);

  const [claimableListings, setClaimableListings] = useState<ClaimableListingPreview[]>([]);
  const [suggestedProfile, setSuggestedProfile] = useState<SuggestedFbProfile | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [isClaiming, setIsClaiming] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);

  const authToken: string | null = currentUserSession?.authToken || null;

  const checkClaimable = useCallback(async () => {
    if (!authToken) {
      setClaimableListings([]);
      setSuggestedProfile(null);
      return;
    }

    setIsChecking(true);
    setClaimError(null);
    try {
      const res = await propertyService.getClaimableProperties(authToken);
      setClaimableListings(Array.isArray(res?.claimableListings) ? res.claimableListings : []);
      setSuggestedProfile(res?.suggestedProfile || null);
    } catch {
      // Token may be absent or expired for legacy local sessions; avoid noisy UI errors on dashboard load.
      setClaimableListings([]);
    } finally {
      setIsChecking(false);
    }
  }, [authToken]);

  const claimListings = useCallback(
    async (payload: {
      propertyIds: string[];
      adoptUsername?: boolean;
      adoptAvatar?: boolean;
    }): Promise<{ success: boolean; claimedCount: number }> => {
      if (!authToken) {
        setClaimError('Session expirée. Reconnectez-vous par SMS pour rattacher ces annonces.');
        return { success: false, claimedCount: 0 };
      }

      if (!payload.propertyIds.length) {
        return { success: true, claimedCount: 0 };
      }

      setIsClaiming(true);
      setClaimError(null);
      try {
        const res = await propertyService.claimProperties(payload, authToken);
        const claimedSet = new Set(res?.claimedIds || payload.propertyIds);

        setClaimableListings((prev) => prev.filter((item) => !claimedSet.has(item._id)));

        if (res?.user) {
          const updatedSession = {
            ...(typeof currentUserSession === 'object' && currentUserSession !== null
              ? currentUserSession
              : {}),
            message: 'Annonces rattachées',
            user: res.user,
            authToken,
          };
          setUser(updatedSession);
          if (typeof window !== 'undefined') {
            localStorage.setItem('user', JSON.stringify(updatedSession));
          }
        }

        usePropertyStore.getState().clearUserProperties();

        return {
          success: true,
          claimedCount: res?.claimedCount ?? payload.propertyIds.length,
        };
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Erreur lors du rattachement des annonces.';
        setClaimError(message);
        return { success: false, claimedCount: 0 };
      } finally {
        setIsClaiming(false);
      }
    },
    [authToken, currentUserSession, setUser],
  );

  const dismissClaimError = useCallback(() => {
    setClaimError(null);
  }, []);

  return {
    hasAuthToken: Boolean(authToken),
    claimableListings,
    suggestedProfile,
    isChecking,
    isClaiming,
    claimError,
    checkClaimable,
    claimListings,
    dismissClaimError,
  };
}
