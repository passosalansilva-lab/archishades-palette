import React, { useState } from 'react';
import { Scissors, Loader2, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface PizzaSlicerButtonProps {
  imageUrl: string | null;
  onSlicesGenerated: (slices: string[]) => void;
  defaultSlices?: number;
}

export function PizzaSlicerButton({ 
  imageUrl, 
  onSlicesGenerated,
  defaultSlices = 8 
}: PizzaSlicerButtonProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [numberOfSlices, setNumberOfSlices] = useState(defaultSlices);
  const [generatedSlices, setGeneratedSlices] = useState<string[]>([]);
  const [detectedSlices, setDetectedSlices] = useState<number | null>(null);

  const handleSlicePizza = async () => {
    if (!imageUrl) {
      toast({
        title: 'Adicione uma imagem primeiro',
        description: 'É necessário ter uma imagem da pizza para cortar em fatias',
        variant: 'destructive'
      });
      return;
    }

    try {
      setLoading(true);
      setGeneratedSlices([]);
      
      const { data, error } = await supabase.functions.invoke('slice-pizza-image', {
        body: { 
          imageUrl, 
          numberOfSlices 
        }
      });

      if (error) throw error;

      if (data.sliceImages && data.sliceImages.length > 0) {
        setGeneratedSlices(data.sliceImages);
        setDetectedSlices(data.detectedSlices);
        
        toast({
          title: 'Fatias geradas!',
          description: `${data.sliceImages.length} fatias de pizza foram criadas`
        });
      } else {
        toast({
          title: 'Não foi possível gerar fatias',
          description: 'Tente novamente com uma imagem diferente',
          variant: 'destructive'
        });
      }
    } catch (error: any) {
      console.error('Error slicing pizza:', error);
      toast({
        title: 'Erro ao cortar pizza',
        description: error.message || 'Tente novamente mais tarde',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    onSlicesGenerated(generatedSlices);
    setOpen(false);
    setGeneratedSlices([]);
    toast({
      title: 'Fatias salvas!',
      description: 'As imagens das fatias foram adicionadas ao produto'
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={!imageUrl}
        className="gap-2"
      >
        <Scissors className="h-4 w-4" />
        Cortar em Fatias
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Scissors className="h-5 w-5" />
              Cortar Pizza em Fatias com IA
            </DialogTitle>
            <DialogDescription>
              A IA irá analisar a imagem e gerar imagens individuais de cada fatia
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Preview da imagem original */}
            {imageUrl && (
              <div className="flex flex-col items-center gap-2">
                <Label className="text-sm text-muted-foreground">Imagem Original</Label>
                <div className="w-48 h-48 rounded-lg overflow-hidden border bg-muted">
                  <img 
                    src={imageUrl} 
                    alt="Pizza original" 
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            )}

            {/* Configuração de fatias */}
            <div className="flex items-center gap-4 justify-center">
              <Label htmlFor="slices" className="whitespace-nowrap">
                Número de fatias:
              </Label>
              <Input
                id="slices"
                type="number"
                min={2}
                max={16}
                value={numberOfSlices}
                onChange={(e) => setNumberOfSlices(parseInt(e.target.value) || 8)}
                className="w-20"
              />
            </div>

            {/* Botão de gerar */}
            <div className="flex justify-center">
              <Button 
                onClick={handleSlicePizza} 
                disabled={loading || !imageUrl}
                className="gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Cortando pizza...
                  </>
                ) : (
                  <>
                    <Scissors className="h-4 w-4" />
                    Gerar Fatias
                  </>
                )}
              </Button>
            </div>

            {/* Resultado */}
            {generatedSlices.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label className="text-sm font-medium">
                    Fatias Geradas ({generatedSlices.length})
                  </Label>
                  {detectedSlices && (
                    <span className="text-xs text-muted-foreground">
                      IA detectou {detectedSlices} fatias
                    </span>
                  )}
                </div>
                
                <div className="grid grid-cols-4 gap-2">
                  {generatedSlices.map((slice, index) => (
                    <div 
                      key={index}
                      className="aspect-square rounded-lg overflow-hidden border bg-muted/50 relative group"
                    >
                      <img 
                        src={slice} 
                        alt={`Fatia ${index + 1}`}
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <span className="text-white text-xs font-medium">
                          Fatia {index + 1}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  <Button onClick={handleConfirm}>
                    Usar Fatias
                  </Button>
                </div>
              </div>
            )}

            {/* Estado vazio */}
            {!loading && generatedSlices.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <ImageIcon className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p className="text-sm">
                  Clique em "Gerar Fatias" para cortar a pizza
                </p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
