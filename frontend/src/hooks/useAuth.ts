import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  authService,
  type ClaimableListingPreview,
  type SuggestedFbProfile,
} from '../services/auth.service';
import { userService } from '../services/user.service';
import { propertyService } from '../services/property.service';
import { useUserStore } from '../store/userStore';
import { usePropertyStore } from '../store/propertyStore';

const KNOWN_ACCOUNTS_STORAGE_KEY = 'tranogasy_phone_accounts';

export interface StoredPhoneAccount {
  _id: string;
  username: string;
  phone?: string | null;
  email?: string | null;
  bio?: string | null;
  avatar?: string | null;
  coverImage?: string | null;
  location?: string | null;
  role: string;
  created_at: string;
  lastConnectedAt: string;
  [key: string]: any;
}

function getLocalAccountsRegistry(): Record<string, StoredPhoneAccount> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = localStorage.getItem(KNOWN_ACCOUNTS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

function saveLocalAccountToRegistry(phone: string, account: StoredPhoneAccount): void {
  if (typeof window === 'undefined') return;
  try {
    const registry = getLocalAccountsRegistry();
    registry[phone] = account;
    localStorage.setItem(KNOWN_ACCOUNTS_STORAGE_KEY, JSON.stringify(registry));
  } catch {
    // Ignore storage quota errors
  }
}

export function useAuth() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifiedPhone, setVerifiedPhone] = useState<string>('');

  const router = useRouter();
  const currentUserSession = useUserStore((state) => state.user);
  const setUser = useUserStore((state) => state.setUser);
  const logoutAction = useUserStore((state) => state.logout);

  const formatPhoneNumber = useCallback((phone: string): string => {
    let cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('261') && cleaned.length >= 12) {
      cleaned = cleaned.slice(3);
    }
    if (!cleaned.startsWith('0') && cleaned.length > 0) {
      cleaned = `0${cleaned}`;
    }
    return cleaned;
  }, []);

  const validatePhoneNumber = useCallback(
    (phone: string): string | null => {
      const cleaned = phone.replace(/\D/g, '');
      if (!cleaned) {
        return 'Veuillez entrer votre numéro de téléphone.';
      }
      const formatted = formatPhoneNumber(cleaned);
      if (formatted.length < 9 || formatted.length > 10) {
        return 'Veuillez entrer un numéro de téléphone valide (ex: 034 00 000 00).';
      }
      return null;
    },
    [formatPhoneNumber]
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  /**
   * Refreshes the user session with real MongoDB database data if available.
   * Useful when a previous session had a synthetic ID or outdated profile info.
   */
  const refreshUserSession = useCallback(async () => {
    const activeUser = currentUserSession?.user || currentUserSession;
    const phone = activeUser?.phone;
    if (!phone) return;

    try {
      const checkRes = await authService.checkUserExists(phone);
      if (checkRes.exists && checkRes.user) {
        const isDummy = activeUser?._id && String(activeUser._id).startsWith('tg_');
        const isOutdated =
          checkRes.user.username !== activeUser.username ||
          checkRes.user.balance !== activeUser.balance ||
          isDummy;

        if (isOutdated) {
          const syncedSession = {
            message: 'Session synchronisée',
            user: checkRes.user,
            ...(currentUserSession?.authToken ? { authToken: currentUserSession.authToken } : {}),
          };
          setUser(syncedSession);
          if (typeof window !== 'undefined') {
            localStorage.setItem('user', JSON.stringify(syncedSession));
            saveLocalAccountToRegistry(phone, checkRes.user);
          }
          console.log(
            `%c[TranoGasy Auth] Profil synchronisé depuis la base de données : ${checkRes.user.username} (${checkRes.user.phone}) [Rôle: ${checkRes.user.role}]`,
            'color: #7cbd1e; font-weight: bold;'
          );
        }
      }
    } catch {
      // Ignore if offline
    }
  }, [currentUserSession, setUser]);

  // Auto-sync real database account on load if session has a synthetic ID
  useEffect(() => {
    const activeUser = currentUserSession?.user || currentUserSession;
    if (activeUser?.phone && activeUser?._id && String(activeUser._id).startsWith('tg_')) {
      refreshUserSession();
    }
  }, [currentUserSession, refreshUserSession]);

  /**
   * Step 1: Validate phone number and ask backend to generate + send a 5-digit OTP SMS.
   */
  const requestSmsVerification = useCallback(
    async (rawPhone: string): Promise<{ success: boolean; formattedPhone: string }> => {
      setError(null);
      const validationError = validatePhoneNumber(rawPhone);
      if (validationError) {
        setError(validationError);
        return { success: false, formattedPhone: '' };
      }

      setIsLoading(true);
      try {
        const formattedPhone = formatPhoneNumber(rawPhone);
        const res = await authService.requestOtp(formattedPhone);
        const resolvedPhone = res?.phone || formattedPhone;
        setVerifiedPhone(resolvedPhone);

        return { success: true, formattedPhone: resolvedPhone };
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : "Impossible d'envoyer le code de vérification par SMS.";
        console.error('❌ Erreur lors de l\'envoi du SMS de vérification:', msg);
        setError(msg);
        return { success: false, formattedPhone: '' };
      } finally {
        setIsLoading(false);
      }
    },
    [formatPhoneNumber, validatePhoneNumber]
  );

  /**
   * Resend a fresh 5-digit OTP SMS from the backend.
   */
  const resendSmsVerification = useCallback(
    async (phoneOverride?: string): Promise<{ success: boolean }> => {
      setError(null);
      const targetPhone = phoneOverride ? formatPhoneNumber(phoneOverride) : verifiedPhone;
      if (!targetPhone) {
        setError('Numéro de téléphone manquant.');
        return { success: false };
      }

      setIsLoading(true);
      try {
        const res = await authService.requestOtp(targetPhone);
        if (res?.phone) {
          setVerifiedPhone(res.phone);
        }
        return { success: true };
      } catch (err: unknown) {
        const msg =
          err instanceof Error ? err.message : 'Impossible de renvoyer le code par SMS.';
        console.error('❌ Erreur lors du renvoi du SMS de vérification:', msg);
        setError(msg);
        return { success: false };
      } finally {
        setIsLoading(false);
      }
    },
    [verifiedPhone, formatPhoneNumber]
  );

  /**
   * Step 2: Verify the 5-digit SMS OTP server-side, authenticate, and detect claimable listings.
   */
  const verifySmsCodeAndAuthenticate = useCallback(
    async (
      enteredCode: string,
      phoneOverride?: string
    ): Promise<{
      success: boolean;
      isNewAccount: boolean;
      user?: {
        message: string;
        user: Record<string, unknown>;
        authToken: string;
      };
      authToken?: string;
      claimableListings?: ClaimableListingPreview[];
      suggestedProfile?: SuggestedFbProfile | null;
    }> => {
      setError(null);
      const cleanCode = enteredCode.replace(/\D/g, '');

      if (cleanCode.length !== 5) {
        setError('Veuillez saisir les 5 chiffres du code de vérification.');
        return { success: false, isNewAccount: false };
      }

      const targetPhone = phoneOverride ? formatPhoneNumber(phoneOverride) : verifiedPhone;
      if (!targetPhone) {
        setError('Numéro de téléphone introuvable. Veuillez recommencer.');
        return { success: false, isNewAccount: false };
      }

      setIsLoading(true);
      try {
        const res = await authService.verifyOtp(targetPhone, cleanCode);
        if (!res?.user) {
          setError('Réponse de vérification invalide.');
          return { success: false, isNewAccount: false };
        }

        const isNewAccount = Boolean(res.isNew);
        const authenticatedData = {
          message: res.message || 'Connexion réussie',
          user: res.user,
          authToken: res.authToken,
        };

        const storedProfile = res.user as unknown as StoredPhoneAccount;
        saveLocalAccountToRegistry(targetPhone, storedProfile);
        setUser(authenticatedData);
        if (typeof window !== 'undefined') {
          localStorage.setItem('user', JSON.stringify(authenticatedData));
        }

        console.log(
          `%c[TranoGasy Auth] ${isNewAccount ? 'Nouveau compte créé' : 'Connexion réussie'} : ${storedProfile.username || targetPhone} (${targetPhone}) [Rôle: ${storedProfile.role || 'user'}]`,
          'color: #7cbd1e; font-weight: bold;'
        );

        return {
          success: true,
          isNewAccount,
          user: authenticatedData,
          authToken: res.authToken,
          claimableListings: res.claimableListings || [],
          suggestedProfile: res.suggestedProfile || null,
        };
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : 'Code de vérification incorrect ou expiré.',
        );
        return { success: false, isNewAccount: false };
      } finally {
        setIsLoading(false);
      }
    },
    [verifiedPhone, formatPhoneNumber, setUser]
  );

  /**
   * Claim pre-existing listings matched by verified phone number.
   */
  const claimMatchedListings = useCallback(
    async (payload: {
      propertyIds: string[];
      adoptUsername?: boolean;
      adoptAvatar?: boolean;
      authTokenOverride?: string;
    }): Promise<{ success: boolean; claimedCount: number; user?: Record<string, unknown> }> => {
      setError(null);
      const token = payload.authTokenOverride || currentUserSession?.authToken;
      if (!token) {
        setError('Session de vérification expirée. Veuillez vous reconnecter par SMS.');
        return { success: false, claimedCount: 0 };
      }

      if (!payload.propertyIds.length) {
        return { success: true, claimedCount: 0 };
      }

      setIsLoading(true);
      try {
        const res = await propertyService.claimProperties(
          {
            propertyIds: payload.propertyIds,
            adoptUsername: payload.adoptUsername,
            adoptAvatar: payload.adoptAvatar,
          },
          token
        );

        if (res?.user) {
          const updatedSession = {
            ...(typeof currentUserSession === 'object' && currentUserSession !== null
              ? currentUserSession
              : {}),
            message: 'Annonces rattachées avec succès',
            user: res.user,
            authToken: token,
          };
          const claimedProfile = res.user as unknown as StoredPhoneAccount;
          setUser(updatedSession);
          if (claimedProfile.phone) {
            saveLocalAccountToRegistry(claimedProfile.phone, claimedProfile);
          }
          if (typeof window !== 'undefined') {
            localStorage.setItem('user', JSON.stringify(updatedSession));
          }
        }

        usePropertyStore.getState().clearUserProperties();

        return {
          success: true,
          claimedCount: res?.claimedCount ?? payload.propertyIds.length,
          user: res?.user,
        };
      } catch (err: unknown) {
        setError(
          err instanceof Error ? err.message : 'Impossible de rattacher ces annonces.',
        );
        return { success: false, claimedCount: 0 };
      } finally {
        setIsLoading(false);
      }
    },
    [currentUserSession, setUser]
  );

  /**
   * Step 3: Save the user's chosen name as their username on account creation.
   */
  const saveNewAccountUsername = useCallback(
    async (rawUsername: string): Promise<{ success: boolean }> => {
      setError(null);
      const trimmed = rawUsername.trim();
      if (!trimmed) {
        setError("Veuillez renseigner votre nom d'utilisateur.");
        return { success: false };
      }

      setIsLoading(true);
      try {
        const activeUser = currentUserSession?.user || currentUserSession;
        const phoneKey = activeUser?.phone || verifiedPhone;

        let updatedUserObj: StoredPhoneAccount = {
          ...(activeUser || {
            _id: `tg_${phoneKey || Date.now()}`,
            phone: phoneKey,
            role: 'user',
            created_at: new Date().toISOString(),
            lastConnectedAt: new Date().toISOString(),
          }),
          username: trimmed,
        };

        // Sync username to MongoDB backend
        if (updatedUserObj._id && !String(updatedUserObj._id).startsWith('tg_')) {
          try {
            const res = await userService.updateProfile(updatedUserObj._id, {
              username: trimmed,
            });
            if (res?.user) {
              updatedUserObj = { ...updatedUserObj, ...res.user };
            }
          } catch {
            // Ignore when backend is offline
          }
        }

        if (phoneKey) {
          saveLocalAccountToRegistry(phoneKey, updatedUserObj);
        }

        const updatedSession = {
          message: 'Profil mis à jour',
          user: updatedUserObj,
          ...(currentUserSession?.authToken ? { authToken: currentUserSession.authToken } : {}),
        };

        setUser(updatedSession);
        if (typeof window !== 'undefined') {
          localStorage.setItem('user', JSON.stringify(updatedSession));
        }

        console.log(
          `%c[TranoGasy Auth] Nom d'utilisateur enregistré : ${trimmed}`,
          'color: #7cbd1e; font-weight: bold;'
        );

        return { success: true };
      } catch (err: any) {
        setError(err.message || "Impossible d'enregistrer votre nom.");
        return { success: false };
      } finally {
        setIsLoading(false);
      }
    },
    [currentUserSession, verifiedPhone, setUser]
  );

  const logout = useCallback(() => {
    logoutAction();
    router.push('/login');
  }, [logoutAction, router]);

  return {
    requestSmsVerification,
    resendSmsVerification,
    verifySmsCodeAndAuthenticate,
    claimMatchedListings,
    saveNewAccountUsername,
    refreshUserSession,
    formatPhoneNumber,
    clearError,
    logout,
    verifiedPhone,
    isLoading,
    error,
  };
}
