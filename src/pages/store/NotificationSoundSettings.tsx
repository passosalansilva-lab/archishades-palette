import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Play, Pause, Upload, X, Music } from 'lucide-react';

interface SoundSettingRow {
  id?: string;
  event_type: 'new_order' | 'status_change' | 'driver_new_order' | 'kds_new_order';
  sound_key: string;
  enabled: boolean;
  volume: number;
}

const EVENT_LABELS: Record<SoundSettingRow['event_type'], string> = {
  new_order: 'Novo pedido recebido',
  status_change: 'Mudança de status do pedido',
  driver_new_order: 'Nova entrega atribuída ao entregador',
  kds_new_order: 'Novo pedido no KDS (cozinha)',
};

// Som padrão do sistema
const DEFAULT_NOTIFICATION_SOUND = '/sounds/default-notification.mp3';

const SOUND_OPTIONS = [
  { key: 'classic', label: 'Som padrão do sistema' },
] as const;

const NEW_ORDER_SOUND_MAP: Record<string, string> = {
  classic: DEFAULT_NOTIFICATION_SOUND,
};

const STATUS_SOUND_MAP: Record<string, string> = {
  classic: DEFAULT_NOTIFICATION_SOUND,
};

const DRIVER_SOUND_MAP: Record<string, string> = {
  classic: DEFAULT_NOTIFICATION_SOUND,
};

const KDS_SOUND_MAP: Record<string, string> = {
  classic: DEFAULT_NOTIFICATION_SOUND,
};

export default function NotificationSoundSettings() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [settings, setSettings] = useState<Record<SoundSettingRow['event_type'], SoundSettingRow>>({
    new_order: { event_type: 'new_order', sound_key: 'classic', enabled: true, volume: 0.6 },
    status_change: { event_type: 'status_change', sound_key: 'classic', enabled: true, volume: 0.6 },
    driver_new_order: { event_type: 'driver_new_order', sound_key: 'classic', enabled: true, volume: 0.6 },
    kds_new_order: { event_type: 'kds_new_order', sound_key: 'classic', enabled: true, volume: 0.6 },
  });
  const [saving, setSaving] = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [previewKey, setPreviewKey] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      if (!user) return;

      const { data, error } = await supabase
        .from('notification_sound_settings')
        .select('*')
        .eq('user_id', user.id);

      if (error) {
        console.error('Erro ao carregar sons:', error);
        return;
      }

      if (data && data.length > 0) {
        setSettings((prev) => {
          const next = { ...prev };
          for (const row of data as any[]) {
            if (row.event_type in next) {
              next[row.event_type as SoundSettingRow['event_type']] = {
                id: row.id,
                event_type: row.event_type,
                sound_key: row.sound_key,
                enabled: row.enabled,
                volume: row.volume ?? 0.6,
              };
            }
          }
          return next;
        });
      }
    };

    load();
  }, [user]);

  const handleToggle = (eventType: SoundSettingRow['event_type'], enabled: boolean) => {
    setSettings((prev) => ({
      ...prev,
      [eventType]: { ...prev[eventType], enabled },
    }));
  };

  const handleSoundChange = (eventType: SoundSettingRow['event_type'], sound_key: string) => {
    setSettings((prev) => ({
      ...prev,
      [eventType]: { ...prev[eventType], sound_key },
    }));
  };

  const handleVolumeChange = (eventType: SoundSettingRow['event_type'], volume: number) => {
    setSettings((prev) => ({
      ...prev,
      [eventType]: { ...prev[eventType], volume },
    }));
  };

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const rows = Object.values(settings).map((row) => {
        const base = {
          user_id: user.id,
          event_type: row.event_type,
          sound_key: row.sound_key,
          enabled: row.enabled,
          volume: row.volume,
        };

        // Só envia o id quando já existe um registro salvo, evitando null em coluna NOT NULL
        return row.id ? { id: row.id, ...base } : base;
      });

      const { data, error } = await supabase
        .from('notification_sound_settings')
        .upsert(rows, { onConflict: 'id' })
        .select();

      if (error) throw error;

      if (data) {
        const map: any = {};
        for (const row of data as any[]) {
          map[row.event_type] = {
            id: row.id,
            event_type: row.event_type,
            sound_key: row.sound_key,
            enabled: row.enabled,
            volume: row.volume ?? 0.6,
          } as SoundSettingRow;
        }
        setSettings((prev) => ({
          new_order: map.new_order || prev.new_order,
          status_change: map.status_change || prev.status_change,
          driver_new_order: map.driver_new_order || prev.driver_new_order,
          kds_new_order: map.kds_new_order || prev.kds_new_order,
        }));
      }

      toast({
        title: 'Configurações salvas',
        description: 'Os sons de notificação foram atualizados.',
      });
    } catch (error: any) {
      console.error('Erro ao salvar sons:', error);
      toast({
        title: 'Erro ao salvar',
        description: error.message || 'Tente novamente mais tarde.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = (
    eventType: SoundSettingRow['event_type'],
    soundKey: string,
  ) => {
    const key = `${eventType}-${soundKey}`;

    // Se já está tocando esse mesmo som, pausar/parar
    if (previewKey === key && previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
      setPreviewKey(null);
      return;
    }

    // Parar qualquer áudio anterior
    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }

    let url: string;
    if (soundKey in NEW_ORDER_SOUND_MAP && eventType === 'new_order') {
      url = NEW_ORDER_SOUND_MAP[soundKey];
    } else if (soundKey in STATUS_SOUND_MAP && eventType === 'status_change') {
      url = STATUS_SOUND_MAP[soundKey];
    } else if (soundKey in DRIVER_SOUND_MAP && eventType === 'driver_new_order') {
      url = DRIVER_SOUND_MAP[soundKey];
    } else if (soundKey in KDS_SOUND_MAP && eventType === 'kds_new_order') {
      url = KDS_SOUND_MAP[soundKey];
    } else {
      // quando é som personalizado, soundKey já é a URL completa
      url = soundKey;
    }

    const audio = new Audio(url);
    audio.volume = settings[eventType].volume;
    previewAudioRef.current = audio;
    setPreviewKey(key);

    audio.onended = () => {
      setPreviewKey((current) => (current === key ? null : current));
    };

    audio.play().catch((err) => {
      console.error('Erro ao tocar pré-escuta:', err);
      setPreviewKey(null);
      toast({
        title: 'Não foi possível tocar o som',
        description: 'Verifique se o navegador permitiu áudio para esta página.',
        variant: 'destructive',
      });
    });
  };

  const handleTestGlobalSound = () => {
    const row = settings.new_order;

    if (!row.enabled) {
      toast({
        title: 'Som desativado',
        description: 'Ative o som de "Novo pedido recebido" para testar.',
      });
      return;
    }

    // Usa a mesma lógica de preview, mas fixo no evento new_order
    const soundKey = row.sound_key;
    const key = `test-${soundKey || 'classic'}`;

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current.currentTime = 0;
    }

    let url: string;
    if (soundKey in NEW_ORDER_SOUND_MAP) {
      url = NEW_ORDER_SOUND_MAP[soundKey];
    } else if (!soundKey || soundKey === 'classic' || soundKey === 'default') {
      url = DEFAULT_NOTIFICATION_SOUND;
    } else {
      url = soundKey;
    }

    const audio = new Audio(url);
    audio.volume = row.volume;
    previewAudioRef.current = audio;
    setPreviewKey(key);

    audio.onended = () => {
      setPreviewKey((current) => (current === key ? null : current));
    };

    audio.play().catch((err) => {
      console.error('Erro ao tocar som de teste:', err);
      setPreviewKey(null);
      toast({
        title: 'Não foi possível tocar o som',
        description: 'Clique na página e tente novamente. Alguns navegadores bloqueiam áudio automático.',
        variant: 'destructive',
      });
    });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Notificações & Sons</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Personalize quais eventos tocam som e escolha o tipo de toque para cada um.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={handleTestGlobalSound}>
            <Play className="mr-2 h-4 w-4" />
            Testar som de novo pedido
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {(['new_order', 'status_change', 'driver_new_order', 'kds_new_order'] as SoundSettingRow['event_type'][]).map(
            (eventType) => {
              const row = settings[eventType];
              return (
                <Card key={eventType} className="h-full">
                  <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                    <div>
                      <CardTitle className="text-base font-medium">
                        {EVENT_LABELS[eventType]}
                      </CardTitle>
                      <CardDescription className="text-xs mt-1">
                        Ative ou desligue o som e escolha qual toque será usado.
                      </CardDescription>
                    </div>
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`enabled-${eventType}`} className="text-xs text-muted-foreground">
                        Som ligado
                      </Label>
                      <Switch
                        id={`enabled-${eventType}`}
                        checked={row.enabled}
                        onCheckedChange={(checked) => handleToggle(eventType, checked)}
                      />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {/* Volume slider */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <Label className="text-muted-foreground">Volume</Label>
                          <span className="font-medium">{Math.round(row.volume * 100)}%</span>
                        </div>
                        <Slider
                          value={[row.volume * 100]}
                          onValueChange={(vals) => handleVolumeChange(eventType, vals[0] / 100)}
                          min={0}
                          max={100}
                          step={5}
                          disabled={!row.enabled}
                          className="w-full"
                        />
                      </div>

                      {/* Opções pré-definidas */}
                      <RadioGroup
                        value={SOUND_OPTIONS.some((o) => o.key === row.sound_key) ? row.sound_key : ''}
                        onValueChange={(val) => handleSoundChange(eventType, val)}
                        className="flex flex-col gap-2"
                        disabled={!row.enabled}
                      >
                        {SOUND_OPTIONS.map((opt) => (
                          <div key={opt.key} className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value={opt.key} id={`${eventType}-${opt.key}`} />
                              <Label htmlFor={`${eventType}-${opt.key}`} className="text-sm">
                                {opt.label}
                              </Label>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              disabled={!row.enabled}
                              onClick={() => handlePreview(eventType, opt.key)}
                              aria-label={
                                previewKey === `${eventType}-${opt.key}`
                                  ? `Parar ${opt.label}`
                                  : `Ouvir ${opt.label}`
                              }
                            >
                              {previewKey === `${eventType}-${opt.key}` ? (
                                <Pause className="h-3 w-3" />
                              ) : (
                                <Play className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                        ))}
                      </RadioGroup>

                      {/* URL / upload personalizado */}
                      <div className="space-y-3 pt-3 border-t">
                        <Label className="text-xs text-muted-foreground">Som personalizado (opcional)</Label>
                        
                        {/* Se já tem som personalizado */}
                        {row.sound_key && !SOUND_OPTIONS.some((o) => o.key === row.sound_key) ? (
                          <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50 border">
                            <div className="flex items-center justify-center h-9 w-9 rounded-full bg-primary/10 text-primary">
                              <Music className="h-4 w-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">
                                {(() => {
                                  try {
                                    const url = new URL(row.sound_key);
                                    const parts = url.pathname.split('/');
                                    const filename = parts[parts.length - 1] || 'personalizado.mp3';
                                    return decodeURIComponent(filename.replace(/^\d+-/, ''));
                                  } catch {
                                    return 'personalizado.mp3';
                                  }
                                })()}
                              </p>
                              <p className="text-[11px] text-muted-foreground">Som personalizado</p>
                            </div>
                            <div className="flex items-center gap-1">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                disabled={!row.enabled}
                                onClick={() => handlePreview(eventType, row.sound_key)}
                                aria-label={
                                  previewKey === `${eventType}-${row.sound_key}`
                                    ? 'Parar som'
                                    : 'Ouvir som'
                                }
                              >
                                {previewKey === `${eventType}-${row.sound_key}` ? (
                                  <Pause className="h-4 w-4" />
                                ) : (
                                  <Play className="h-4 w-4" />
                                )}
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => {
                                  if (previewKey?.startsWith(`${eventType}-`) && previewAudioRef.current) {
                                    previewAudioRef.current.pause();
                                    previewAudioRef.current.currentTime = 0;
                                  }
                                  setPreviewKey(null);
                                  handleSoundChange(eventType, 'classic');
                                  toast({
                                    title: 'Som restaurado',
                                    description: 'Voltamos para o som padrão.',
                                  });
                                }}
                                aria-label="Remover som personalizado"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        ) : (
                          /* Botão de upload estilizado */
                          <label
                            className={`
                              flex items-center justify-center gap-2 p-3 rounded-lg border-2 border-dashed 
                              cursor-pointer transition-all duration-200
                              hover:border-primary hover:bg-primary/5
                              ${!row.enabled ? 'opacity-50 pointer-events-none' : ''}
                            `}
                          >
                            <Upload className="h-4 w-4 text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">
                              Clique para enviar um arquivo .mp3
                            </span>
                            <input
                              type="file"
                              accept="audio/mpeg,audio/mp3,audio/*"
                              className="sr-only"
                              disabled={!row.enabled}
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;

                                try {
                                  const path = `notification-sounds/${eventType}/${Date.now()}-${file.name}`;
                                  const { error: uploadError } = await supabase.storage
                                    .from('images')
                                    .upload(path, file, {
                                      cacheControl: '3600',
                                      upsert: true,
                                    });

                                  if (uploadError) throw uploadError;

                                  const { data: publicData } = supabase.storage
                                    .from('images')
                                    .getPublicUrl(path);

                                  if (publicData?.publicUrl) {
                                    handleSoundChange(eventType, publicData.publicUrl);
                                    handlePreview(eventType, publicData.publicUrl);
                                    toast({
                                      title: 'Som enviado',
                                      description: 'O novo som foi carregado com sucesso.',
                                    });
                                  }
                                } catch (err: any) {
                                  console.error('Erro ao enviar som personalizado:', err);
                                  toast({
                                    title: 'Erro ao enviar som',
                                    description: err.message || 'Tente novamente com outro arquivo .mp3.',
                                    variant: 'destructive',
                                  });
                                } finally {
                                  e.target.value = '';
                                }
                              }}
                            />
                          </label>
                        )}
                        
                        <p className="text-[11px] text-muted-foreground leading-snug">
                          Envie um arquivo <span className="font-medium">.mp3</span> curto (1–3s) para usar como toque personalizado.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            }
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar configurações'}
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
