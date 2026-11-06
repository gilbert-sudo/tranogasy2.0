import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  userService,
  UpdateUserProfilePayload,
  PublicProfileUser,
} from '@/services/user.service';
import { imageService } from '@/services/image.service';
import { useProfileStore } from '@/store/profileStore';
import { useUserStore } from '@/store/userStore';
import { usePropertyStore } from '@/store/propertyStore';

export const COVER_PRESETS = [
  {
    id: 'tana-sunset',
    label: 'Architecture Contemporaine',
    url: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1800&q=80',
  },
  {
    id: 'minimal-villa',
    label: 'Villa Minimaliste',
    url: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1800&q=80',
  },
  {
    id: 'penthouse-glass',
    label: 'Intérieur Lumineux',
    url: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1800&q=80',
  },
  {
    id: 'tropical-modern',
    label: 'Résidence Tropicale',
    url: 'https://images.unsplash.com/photo-1613490493576-7fde63acd811?auto=format&fit=crop&w=1800&q=80',
  },
  {
    id: 'hero-default',
    label: 'TranoGasy Signature',
    url: '/hero-bg.jpg',
  },
];

export function useUserProfile(identifier?: string | null, sourceName?: string | null) {
  const userStore = useUserStore((s) => s.user);
  const setUserInStore = useUserStore((s) => s.setUser);
  const initializeUser = useUserStore((s) => s.initialize);

  const currentUser = userStore?.user || userStore;

  const profilesByKey = useProfileStore((s) => s.profilesByKey);
  const activeTab = useProfileStore((s) => s.activeTab);
  const searchQuery = useProfileStore((s) => s.searchQuery);
  const isEditModalOpen = useProfileStore((s) => s.isEditModalOpen);

  const setProfileData = useProfileStore((s) => s.setProfileData);
  const patchCachedUser = useProfileStore((s) => s.patchCachedUser);
  const setActiveTab = useProfileStore((s) => s.setActiveTab);
  const setSearchQuery = useProfileStore((s) => s.setSearchQuery);
  const setIsEditModalOpen = useProfileStore((s) => s.setIsEditModalOpen);

  const addPropertiesToGlobalStore = usePropertyStore((s) => s.addProperties);

  const resolvedIdentifier = identifier || currentUser?._id || '';
  const cacheKey = sourceName
    ? `${resolvedIdentifier}::${sourceName}`
    : resolvedIdentifier;

  const cachedEntry = cacheKey ? profilesByKey[cacheKey] : undefined;

  const [isLoading, setIsLoading] = useState<boolean>(!cachedEntry && Boolean(resolvedIdentifier));
  const [error, setError] = useState<string | null>(null);
  const [isSavingProfile, setIsSavingProfile] = useState<boolean>(false);
  const [isUploadingCover, setIsUploadingCover] = useState<boolean>(false);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  useEffect(() => {
    initializeUser();
  }, [initializeUser]);

  const fetchProfile = useCallback(
    async (forceRefresh = false) => {
      if (!resolvedIdentifier) {
        setIsLoading(false);
        return;
      }

      if (!forceRefresh && profilesByKey[cacheKey]) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const data = await userService.getPublicProfile(resolvedIdentifier, sourceName);
        setProfileData(cacheKey, data);
        if (data.properties && data.properties.length > 0) {
          addPropertiesToGlobalStore(data.properties);
        }
      } catch (err: any) {
        setError(err.message || 'Impossible de charger ce profil utilisateur.');
      } finally {
        setIsLoading(false);
      }
    },
    [
      resolvedIdentifier,
      sourceName,
      cacheKey,
      profilesByKey,
      setProfileData,
      addPropertiesToGlobalStore,
    ]
  );

  useEffect(() => {
    if (resolvedIdentifier) {
      fetchProfile();
    }
  }, [resolvedIdentifier, cacheKey, fetchProfile]);

  const profileUser: PublicProfileUser | null = useMemo(() => {
    if (cachedEntry?.user) return cachedEntry.user;
    if (
      currentUser &&
      (!identifier ||
        identifier === currentUser._id ||
        identifier.toLowerCase() === (currentUser.username || '').toLowerCase())
    ) {
      return currentUser;
    }
    return null;
  }, [cachedEntry, currentUser, identifier]);

  const isOwnProfile = useMemo(() => {
    if (!currentUser || !profileUser || profileUser.isCuratedSource) return false;
    return (
      String(currentUser._id) === String(profileUser._id) ||
      (Boolean(currentUser.username) &&
        Boolean(profileUser.username) &&
        currentUser.username.toLowerCase() === profileUser.username.toLowerCase())
    );
  }, [currentUser, profileUser]);

  const properties = useMemo(() => {
    return cachedEntry?.properties || [];
  }, [cachedEntry]);

  const stats = useMemo(() => {
    if (cachedEntry?.stats) return cachedEntry.stats;
    const rentCount = properties.filter((p) => p.type === 'rent').length;
    const saleCount = properties.filter((p) => p.type === 'sale').length;
    return {
      totalListings: properties.length,
      rentCount,
      saleCount,
      activeCommunes: [],
    };
  }, [cachedEntry, properties]);

  const filteredProperties = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return properties.filter((prop) => {
      if (activeTab === 'rent' && prop.type !== 'rent') return false;
      if (activeTab === 'sale' && prop.type !== 'sale') return false;

      if (q) {
        const title = (prop.title || '').toLowerCase();
        const fokontany = (prop.city?.fokontany || '').toLowerCase();
        const commune = (prop.city?.commune || '').toLowerCase();
        const district = (prop.city?.district || '').toLowerCase();
        const ref = String(prop.propertyNumber || '').toLowerCase();
        return (
          title.includes(q) ||
          fokontany.includes(q) ||
          commune.includes(q) ||
          district.includes(q) ||
          ref.includes(q)
        );
      }

      return true;
    });
  }, [properties, activeTab, searchQuery]);

  // Update profile fields (bio, username, coverImage, avatar, location)
  const saveProfileChanges = useCallback(
    async (payload: UpdateUserProfilePayload) => {
      const targetUserId = profileUser?._id || currentUser?._id;
      if (!targetUserId) return null;

      setIsSavingProfile(true);
      setError(null);
      try {
        const res = await userService.updateProfile(targetUserId, payload);
        if (res?.user) {
          patchCachedUser(targetUserId, res.user);
          if (isOwnProfile && currentUser) {
            setUserInStore({
              ...currentUser,
              ...res.user,
            });
          }
        }
        return res?.user || null;
      } catch (err: any) {
        setError(err.message || 'Erreur lors de la sauvegarde du profil.');
        throw err;
      } finally {
        setIsSavingProfile(false);
      }
    },
    [profileUser?._id, currentUser, isOwnProfile, patchCachedUser, setUserInStore]
  );

  // Instant Cover Photo upload + persist
  const uploadAndSaveCover = useCallback(
    async (file: File) => {
      setIsUploadingCover(true);
      setUploadProgress(15);
      try {
        const uploaded = await imageService.uploadImageToGCS(file, (progress) => {
          setUploadProgress(progress);
        });
        await saveProfileChanges({ coverImage: uploaded.src });
        return uploaded.src;
      } finally {
        setIsUploadingCover(false);
        setUploadProgress(0);
      }
    },
    [saveProfileChanges]
  );

  // Instant Avatar Photo upload + persist
  const uploadAndSaveAvatar = useCallback(
    async (file: File) => {
      setIsUploadingAvatar(true);
      setUploadProgress(15);
      try {
        const uploaded = await imageService.uploadImageToGCS(file, (progress) => {
          setUploadProgress(progress);
        });
        await saveProfileChanges({ avatar: uploaded.src });
        return uploaded.src;
      } finally {
        setIsUploadingAvatar(false);
        setUploadProgress(0);
      }
    },
    [saveProfileChanges]
  );

  return {
    profileUser,
    isOwnProfile,
    stats,
    properties,
    filteredProperties,
    activeTab,
    searchQuery,
    isEditModalOpen,
    isLoading,
    error,
    isSavingProfile,
    isUploadingCover,
    isUploadingAvatar,
    uploadProgress,
    setActiveTab,
    setSearchQuery,
    setIsEditModalOpen,
    fetchProfile,
    saveProfileChanges,
    uploadAndSaveCover,
    uploadAndSaveAvatar,
  };
}

