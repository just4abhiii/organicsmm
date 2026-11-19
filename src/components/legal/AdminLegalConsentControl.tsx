import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldAlert } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useLegalConsentSetting, legalConsentQueryKey } from '@/hooks/useLegalConsentSetting';
import { toast } from 'sonner';
export function AdminLegalConsentControl() {
  const qc = useQueryClient();
  const setting = useLegalConsentSetting();
  const mutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { data, error } = await (supabase as any).rpc('set_legal_consent_enabled', { _enabled: enabled });
      if (error) throw error;
      return data;
    },
    onSuccess: (enabled) => {
      qc.setQueryData(legalConsentQueryKey, enabled);
      toast.success(enabled ? 'Signup & order declaration ON' : 'Signup & order declaration OFF');
    },
    onError: (err: Error) => toast.error(err.message),
  });
  return <Card className="glass-card border-2 border-border"><CardContent className="p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4"><ShieldAlert className="h-7 w-7 text-primary shrink-0" /><div>
        <h3 className="text-lg font-bold text-foreground">Signup &amp; Order Legal Declaration</h3>
        <p className="text-sm text-muted-foreground">{setting.enabled ? 'ON — legal checkbox and declaration required' : 'OFF — no checkbox or declaration at signup and checkout'}</p>
      </div></div>
      <div className="flex items-center gap-3"><span className="text-sm font-medium">{setting.enabled ? 'ON' : 'OFF'}</span>
        <Switch aria-label="Signup and order legal declaration" checked={setting.enabled} onCheckedChange={(v) => mutation.mutate(v)} disabled={setting.isLoading || setting.isError || mutation.isPending} />
      </div>
    </div>
  </CardContent></Card>;
}
