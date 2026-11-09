import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '../services/auth.service';
import { userService } from '../services/user.service';
import { smsService } from '../services/sms.service';
import { useUserStore } from '../store/userStore';

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

function generateFiveDigitCode(): string {
  return Math.floor(10000 + Math.random() * 90000).toString();
}

export function useAuth() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [verifiedPhone, setVerifiedPhone] = useState<string>('');
  const expectedCodeRef = useRef<string | null>(null);

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
        const isOutdated = checkRes.user.username !== activeUser.username || isDummy;

        if (isOutdated) {
          const syncedSession = {
            message: 'Session synchronisée',
            user: checkRes.user,
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
   * Step 1: Validate phone number, generate 5-digit SMS verification code, and send real SMS to the user.
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
        const code = generateFiveDigitCode();
        expectedCodeRef.current = code;
        setVerifiedPhone(formattedPhone);

        // Send real SMS to user's phone
        const message = `Votre code de confirmation TranoGasy est le : ${code}`;
        await smsService.sendSMS(formattedPhone, message);

        return { success: true, formattedPhone };
      } catch (err: any) {
        console.error('❌ Erreur lors de l\'envoi du SMS de vérification:', err.message || err);
        setError(err.message || "Impossible d'envoyer le code de vérification par SMS.");
        return { success: false, formattedPhone: '' };
      } finally {
        setIsLoading(false);
      }
    },
    [formatPhoneNumber, validatePhoneNumber]
  );

  /**
   * Resend a fresh 5-digit SMS verification code to the current phone number by SMS.
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
        const code = generateFiveDigitCode();
        expectedCodeRef.current = code;

        // Send real SMS to user's phone
        const message = `Votre code de confirmation TranoGasy est le : ${code}`;
        await smsService.sendSMS(targetPhone, message);

        return { success: true };
      } catch (err: any) {
        console.error('❌ Erreur lors du renvoi du SMS de vérification:', err.message || err);
        setError(err.message || "Impossible de renvoyer le code par SMS.");
        return { success: false };
      } finally {
        setIsLoading(false);
      }
    },
    [verifiedPhone, formatPhoneNumber]
  );

  /**
   * Step 2: Verify the 5-digit SMS code.
   * - If the user already has an account in the database -> logs them in with their real DB info (`isNewAccount: false`).
   * - If the user does not have an account -> creates their account, logs them in, and returns `isNewAccount: true` so Step 3 ("Account created") is shown.
   */
  const verifySmsCodeAndAuthenticate = useCallback(
    async (
      enteredCode: string,
      phoneOverride?: string
    ): Promise<{ success: boolean; isNewAccount: boolean; user?: any }> => {
      setError(null);
      const cleanCode = enteredCode.replace(/\D/g, '');

      if (cleanCode.length !== 5) {
        setError('Veuillez saisir les 5 chiffres du code de vérification.');
        return { success: false, isNewAccount: false };
      }

      if (!expectedCodeRef.current || cleanCode !== expectedCodeRef.current) {
        setError('Code de vérification incorrect. Veuillez vérifier le code reçu par SMS.');
        return { success: false, isNewAccount: false };
      }

      const targetPhone = phoneOverride ? formatPhoneNumber(phoneOverride) : verifiedPhone;
      if (!targetPhone) {
        setError('Numéro de téléphone introuvable. Veuillez recommencer.');
        return { success: false, isNewAccount: false };
      }

      setIsLoading(true);
      try {
        let authenticatedData: any = null;
        let isNewAccount = false;

        // 1. Primary: Use backend passwordless phone login API to get real DB document
        try {
          const res = await authService.phoneLogin(targetPhone);
          if (res?.user) {
            authenticatedData = {
              message: res.message || 'Connexion réussie',
              user: res.user,
            };
            isNewAccount = Boolean(res.isNew);
          }
        } catch {
          // Fallback to checkUserExists if phoneLogin route had network error
        }

        // 2. Secondary backend check: GET /users/exist/:phone
        if (!authenticatedData) {
          try {
            const checkRes = await authService.checkUserExists(targetPhone);
            if (checkRes.exists && checkRes.user) {
              authenticatedData = {
                message: 'Connexion réussie',
                user: checkRes.user,
              };
              isNewAccount = false;
            }
          } catch {
            // Ignore
          }
        }

        // 3. Fallback: Only if completely offline or backend unavailable
        if (!authenticatedData) {
          const localRegistry = getLocalAccountsRegistry();
          const existingLocal = localRegistry[targetPhone];
          const nowIso = new Date().toISOString();

          if (existingLocal) {
            authenticatedData = {
              message: 'Connexion réussie',
              user: existingLocal,
            };
            isNewAccount = false;
          } else {
            const defaultUsername = `Membre ${targetPhone.slice(-4)}`;
            const newLocalUser: StoredPhoneAccount = {
              _id: `tg_${targetPhone}_${Date.now().toString(36)}`,
              username: defaultUsername,
              phone: targetPhone,
              role: 'user',
              created_at: nowIso,
              lastConnectedAt: nowIso,
            };
            authenticatedData = {
              message: 'Compte créé avec succès',
              user: newLocalUser,
            };
            isNewAccount = true;
          }
        }

        const realUser = authenticatedData.user;
        saveLocalAccountToRegistry(targetPhone, realUser);
        setUser(authenticatedData);
        if (typeof window !== 'undefined') {
          localStorage.setItem('user', JSON.stringify(authenticatedData));
        }

        console.log(
          `%c[TranoGasy Auth] ${isNewAccount ? 'Nouveau compte créé' : 'Connexion réussie'} : ${realUser.username || targetPhone} (${targetPhone}) [Rôle: ${realUser.role || 'user'}]`,
          'color: #7cbd1e; font-weight: bold;'
        );

        return {
          success: true,
          isNewAccount,
          user: authenticatedData,
        };
      } catch (err: any) {
        setError(err.message || "Une erreur s'est produite lors de la vérification.");
        return { success: false, isNewAccount: false };
      } finally {
        setIsLoading(false);
      }
    },
    [verifiedPhone, formatPhoneNumber, setUser]
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
