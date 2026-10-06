import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { authService } from '../services/auth.service';
import { useUserStore } from '../store/userStore';

export function useAuth() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const setUser = useUserStore((state) => state.setUser);
  const logoutAction = useUserStore((state) => state.logout);

  const formatPhoneNumber = (phone: string) => {
    let formatted = phone;
    if (formatted.startsWith("261")) formatted = formatted.slice(3);
    if (formatted.startsWith("0")) formatted = formatted;
    else formatted = `0${formatted}`;
    return formatted;
  };

  const login = async (phoneNumber: string, password: string, options?: { redirectUrl?: string; onSuccess?: () => void }) => {
    setIsLoading(true);
    setError(null);
    try {
      const formattedPhone = formatPhoneNumber(phoneNumber);
      const data = await authService.login(formattedPhone, password);
      
      setUser(data);
      localStorage.setItem('user', JSON.stringify(data));
      
      if (options?.onSuccess) {
        options.onSuccess();
      }
      
      if (options?.redirectUrl) {
        window.location.href = options.redirectUrl;
      }
    } catch (err: any) {
      setError(err.message || "Impossible de se connecter. Vérifiez vos identifiants.");
    } finally {
      setIsLoading(false);
    }
  };

  const signup = async (userData: { name: string; email: string; phone: string; password: string }, options?: { redirectUrl?: string; onSuccess?: () => void }) => {
    setIsLoading(true);
    setError(null);
    try {
      const formattedPhone = formatPhoneNumber(userData.phone);
      
      const userExists = await authService.checkUserExists(formattedPhone);
      if (userExists) {
        throw new Error("Ce numéro de téléphone est déjà utilisé.");
      }

      const data = await authService.signup({
        username: userData.name,
        email: userData.email,
        phone: formattedPhone,
        password: userData.password,
      });

      setUser(data);
      localStorage.setItem('user', JSON.stringify(data));
      
      if (options?.onSuccess) {
        options.onSuccess();
      }
      
      if (options?.redirectUrl) {
        window.location.href = options.redirectUrl;
      }
    } catch (err: any) {
      setError(err.message || "Une erreur s'est produite. Veuillez réessayer.");
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    logoutAction();
    router.push('/login');
  };

  return {
    login,
    signup,
    logout,
    isLoading,
    error,
  };
}
