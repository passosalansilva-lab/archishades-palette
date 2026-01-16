import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Image as ImageIcon, Check, Trash2, CheckSquare, Square } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface GalleryImage {
  name: string;
  url: string;
  createdAt: string;
}

interface ImageGalleryModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string) => void;
  companyId: string;
}

export function ImageGalleryModal({
  open,
  onClose,
  onSelect,
  companyId,
}: ImageGalleryModalProps) {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [imagesToDelete, setImagesToDelete] = useState<GalleryImage[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [selectedForDeletion, setSelectedForDeletion] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  useEffect(() => {
    if (open && companyId) {
      loadImages();
      // Reset multi-select mode when modal opens
      setMultiSelectMode(false);
      setSelectedForDeletion(new Set());
    }
  }, [open, companyId]);

  const loadImages = async () => {
    try {
      setLoading(true);
      
      // Listar imagens da pasta da empresa
      const { data: files, error } = await supabase.storage
        .from('images')
        .list(companyId, {
          sortBy: { column: 'created_at', order: 'desc' },
        });

      if (error) throw error;

      // Filtrar apenas imagens (não pastas)
      const imageFiles = (files || []).filter(f => 
        f.name && !f.name.endsWith('/') && f.metadata
      );

      // Gerar URLs públicas
      const imagesWithUrls: GalleryImage[] = imageFiles.map(file => {
        const { data: { publicUrl } } = supabase.storage
          .from('images')
          .getPublicUrl(`${companyId}/${file.name}`);
        
        return {
          name: file.name,
          url: publicUrl,
          createdAt: file.created_at || '',
        };
      });

      setImages(imagesWithUrls);
    } catch (error) {
      console.error('Erro ao carregar galeria:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = () => {
    if (selectedUrl) {
      onSelect(selectedUrl);
      onClose();
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, image: GalleryImage) => {
    e.stopPropagation();
    setImagesToDelete([image]);
    setDeleteConfirmOpen(true);
  };

  const handleBulkDeleteClick = () => {
    const imagesToRemove = images.filter(img => selectedForDeletion.has(img.name));
    setImagesToDelete(imagesToRemove);
    setDeleteConfirmOpen(true);
  };

  const toggleImageSelection = (imageName: string) => {
    setSelectedForDeletion(prev => {
      const newSet = new Set(prev);
      if (newSet.has(imageName)) {
        newSet.delete(imageName);
      } else {
        newSet.add(imageName);
      }
      return newSet;
    });
  };

  const selectAllImages = () => {
    if (selectedForDeletion.size === images.length) {
      setSelectedForDeletion(new Set());
    } else {
      setSelectedForDeletion(new Set(images.map(img => img.name)));
    }
  };

  const handleDeleteConfirm = async () => {
    if (imagesToDelete.length === 0) return;

    setDeleting(true);
    try {
      const filePaths = imagesToDelete.map(img => `${companyId}/${img.name}`);
      
      console.log('Attempting to delete images:', filePaths);
      
      const { data, error } = await supabase.storage
        .from('images')
        .remove(filePaths);

      console.log('Delete result:', { data, error });

      if (error) throw error;

      // Verificar se a exclusão realmente ocorreu
      if (!data || data.length === 0) {
        console.warn('No files were deleted, files may not exist or permission denied');
      }

      const deletedNames = new Set(imagesToDelete.map(img => img.name));

      // Remover da lista local
      setImages(prev => prev.filter(img => !deletedNames.has(img.name)));
      
      // Se alguma imagem deletada estava selecionada, limpar seleção
      if (selectedUrl && imagesToDelete.some(img => img.url === selectedUrl)) {
        setSelectedUrl(null);
      }

      // Limpar seleção múltipla
      setSelectedForDeletion(new Set());

      toast({
        title: imagesToDelete.length > 1 ? 'Imagens excluídas' : 'Imagem excluída',
        description: imagesToDelete.length > 1 
          ? `${imagesToDelete.length} imagens foram removidas da galeria.`
          : 'A imagem foi removida da galeria.',
      });

      // Recarregar a lista para confirmar que a exclusão foi persistida
      setTimeout(() => {
        loadImages();
      }, 500);
    } catch (error: any) {
      console.error('Erro ao excluir imagem(ns):', error);
      toast({
        title: 'Erro ao excluir',
        description: error.message || 'Não foi possível excluir a(s) imagem(ns).',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
      setDeleteConfirmOpen(false);
      setImagesToDelete([]);
    }
  };

  const exitMultiSelectMode = () => {
    setMultiSelectMode(false);
    setSelectedForDeletion(new Set());
  };

  return (
    <>
      <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <DialogContent className="max-w-2xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ImageIcon className="h-5 w-5" />
                Galeria de Imagens
              </div>
              {images.length > 0 && (
                <div className="flex items-center gap-2">
                  {multiSelectMode ? (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={selectAllImages}
                        className="text-xs"
                      >
                        {selectedForDeletion.size === images.length ? 'Desmarcar todas' : 'Selecionar todas'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={exitMultiSelectMode}
                        className="text-xs"
                      >
                        Cancelar
                      </Button>
                    </>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setMultiSelectMode(true)}
                      className="text-xs"
                    >
                      <CheckSquare className="h-4 w-4 mr-1" />
                      Selecionar várias
                    </Button>
                  )}
                </div>
              )}
            </DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : images.length === 0 ? (
            <div className="text-center py-12">
              <ImageIcon className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-muted-foreground">
                Nenhuma imagem na galeria ainda.
              </p>
              <p className="text-sm text-muted-foreground/70 mt-1">
                As imagens que você enviar para produtos ficarão disponíveis aqui.
              </p>
            </div>
          ) : (
            <>
              <ScrollArea className="h-[400px] pr-4">
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                  {images.map((image) => (
                    <div
                      key={image.name}
                      className="relative group"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (multiSelectMode) {
                            toggleImageSelection(image.name);
                          } else {
                            setSelectedUrl(image.url === selectedUrl ? null : image.url);
                          }
                        }}
                        className={cn(
                          "relative aspect-square rounded-lg overflow-hidden border-2 transition-all hover:opacity-90 w-full",
                          multiSelectMode && selectedForDeletion.has(image.name)
                            ? "border-destructive ring-2 ring-destructive/20"
                            : selectedUrl === image.url
                            ? "border-primary ring-2 ring-primary/20"
                            : "border-transparent hover:border-primary/30"
                        )}
                      >
                        <img
                          src={image.url}
                          alt={image.name}
                          className="w-full h-full object-cover"
                        />
                        {multiSelectMode && (
                          <div className="absolute top-2 left-2">
                            {selectedForDeletion.has(image.name) ? (
                              <div className="bg-destructive text-destructive-foreground rounded p-0.5">
                                <Check className="h-4 w-4" />
                              </div>
                            ) : (
                              <div className="bg-background/80 rounded p-0.5 border">
                                <Square className="h-4 w-4 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                        )}
                        {!multiSelectMode && selectedUrl === image.url && (
                          <div className="absolute inset-0 bg-primary/20 flex items-center justify-center">
                            <div className="bg-primary text-primary-foreground rounded-full p-1">
                              <Check className="h-4 w-4" />
                            </div>
                          </div>
                        )}
                      </button>
                      
                      {/* Botão de excluir (só aparece quando não está em modo de seleção múltipla) */}
                      {!multiSelectMode && (
                        <button
                          type="button"
                          onClick={(e) => handleDeleteClick(e, image)}
                          className="absolute top-1 right-1 p-1.5 bg-destructive text-destructive-foreground rounded-md opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/90 z-10"
                          title="Excluir imagem"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="flex justify-between gap-2 pt-4 border-t">
                {multiSelectMode ? (
                  <>
                    <span className="text-sm text-muted-foreground self-center">
                      {selectedForDeletion.size} selecionada(s)
                    </span>
                    <Button 
                      variant="destructive" 
                      onClick={handleBulkDeleteClick}
                      disabled={selectedForDeletion.size === 0}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Excluir selecionadas
                    </Button>
                  </>
                ) : (
                  <>
                    <div />
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={onClose}>
                        Cancelar
                      </Button>
                      <Button onClick={handleSelect} disabled={!selectedUrl}>
                        Usar imagem selecionada
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {imagesToDelete.length > 1 
                ? `Excluir ${imagesToDelete.length} imagens?` 
                : 'Excluir imagem?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. {imagesToDelete.length > 1 
                ? 'As imagens serão permanentemente removidas da galeria.'
                : 'A imagem será permanentemente removida da galeria.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Excluindo...
                </>
              ) : (
                'Excluir'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}