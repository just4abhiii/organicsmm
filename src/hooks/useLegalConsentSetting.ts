import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
export const legalConsentQueryKey = ['legal-consent-enabled'];
export function useLegalConsentSetting() {
  const query = useQuery({
    queryKey: legalConsentQueryKey,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc('get_legal_consent_enabled');
      if (error) throw error;
      return data !== false;
    },
    staleTime: 0,
    refetchInterval: 15000,
    refetchOnWindowFocus: true,
  });
  return { ...query, enabled: query.data !== false };
}
