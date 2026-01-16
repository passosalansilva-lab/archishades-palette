import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Save, Plus, GripVertical, Trash2 } from "lucide-react";
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { DashboardLayout } from "@/components/layout/DashboardLayout";

interface OnboardingStep {
  id: string;
  step_key: string;
  title: string;
  description: string | null;
  tip: string | null;
  video_url: string | null;
  sort_order: number;
  is_active: boolean;
}

function SortableStepCard({ step, onUpdate, onDelete }: { 
  step: OnboardingStep; 
  onUpdate: (id: string, field: string, value: any) => void;
  onDelete: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <Card ref={setNodeRef} style={style} className="mb-4">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-3 flex-1">
          <button
            {...attributes}
            {...listeners}
            className="cursor-grab active:cursor-grabbing touch-none"
            aria-label="Arrastar para reordenar"
          >
            <GripVertical className="h-5 w-5 text-muted-foreground" />
          </button>
          <div className="flex-1">
            <CardTitle className="text-lg">{step.title}</CardTitle>
            <CardDescription className="text-xs">Chave: {step.step_key}</CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`active-${step.id}`} className="text-sm">Ativa</Label>
          <Switch
            id={`active-${step.id}`}
            checked={step.is_active}
            onCheckedChange={(checked) => onUpdate(step.id, "is_active", checked)}
          />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(step.id)}
            className="text-destructive hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor={`title-${step.id}`}>Título</Label>
          <Input
            id={`title-${step.id}`}
            value={step.title}
            onChange={(e) => onUpdate(step.id, "title", e.target.value)}
            placeholder="Ex: Configurar loja"
          />
        </div>
        <div>
          <Label htmlFor={`desc-${step.id}`}>Descrição</Label>
          <Textarea
            id={`desc-${step.id}`}
            value={step.description || ""}
            onChange={(e) => onUpdate(step.id, "description", e.target.value)}
            placeholder="Breve explicação do que essa etapa faz"
            rows={2}
          />
        </div>
        <div>
          <Label htmlFor={`tip-${step.id}`}>Dica</Label>
          <Textarea
            id={`tip-${step.id}`}
            value={step.tip || ""}
            onChange={(e) => onUpdate(step.id, "tip", e.target.value)}
            placeholder="Dica útil para ajudar o usuário"
            rows={2}
          />
        </div>
        <div>
          <Label htmlFor={`video-${step.id}`}>URL do vídeo</Label>
          <Input
            id={`video-${step.id}`}
            value={step.video_url || ""}
            onChange={(e) => onUpdate(step.id, "video_url", e.target.value)}
            placeholder="/videos/onboarding-store.mp4 ou .gif"
          />
          <p className="text-xs text-muted-foreground mt-1">
            💡 Use vídeos curtos (5-15 segundos) ou GIFs animados para demonstração rápida
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

export default function OnboardingConfig() {
  const navigate = useNavigate();
  const [steps, setSteps] = useState<OnboardingStep[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasAccess, setHasAccess] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  useEffect(() => {
    checkAccess();
  }, [navigate]);

  const checkAccess = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      toast.error("Não autenticado");
      navigate("/auth");
      return;
    }

    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const isSuperAdmin = roles?.some(r => r.role === "super_admin");
    if (!isSuperAdmin) {
      toast.error("Acesso negado");
      navigate("/dashboard");
      return;
    }

    setHasAccess(true);
    loadSteps();
  };

  const loadSteps = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("onboarding_steps")
      .select("*")
      .order("sort_order", { ascending: true });

    if (error) {
      toast.error("Erro ao carregar configurações");
      console.error(error);
    } else {
      setSteps(data || []);
    }
    setLoading(false);
  };

  const handleUpdate = (id: string, field: string, value: any) => {
    setSteps((prev) =>
      prev.map((s) => (s.id === id ? { ...s, [field]: value } : s))
    );
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Deseja remover esta etapa permanentemente?")) return;
    
    const { error } = await supabase.from("onboarding_steps").delete().eq("id", id);
    if (error) {
      toast.error("Erro ao remover etapa");
      console.error(error);
    } else {
      toast.success("Etapa removida");
      setSteps((prev) => prev.filter((s) => s.id !== id));
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setSteps((items) => {
      const oldIndex = items.findIndex((i) => i.id === active.id);
      const newIndex = items.findIndex((i) => i.id === over.id);
      const reordered = arrayMove(items, oldIndex, newIndex);
      return reordered.map((item, idx) => ({ ...item, sort_order: idx + 1 }));
    });
  };

  const handleAddNew = () => {
    const newStep: OnboardingStep = {
      id: crypto.randomUUID(),
      step_key: `step_${Date.now()}`,
      title: "Nova etapa",
      description: "",
      tip: "",
      video_url: "",
      sort_order: steps.length + 1,
      is_active: true,
    };
    setSteps([...steps, newStep]);
  };

  const handleSaveAll = async () => {
    setSaving(true);
    try {
      // Delete all existing and insert updated list
      await supabase.from("onboarding_steps").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      
      const { error } = await supabase.from("onboarding_steps").insert(
        steps.map((s) => ({
          id: s.id,
          step_key: s.step_key,
          title: s.title,
          description: s.description,
          tip: s.tip,
          video_url: s.video_url,
          sort_order: s.sort_order,
          is_active: s.is_active,
        }))
      );

      if (error) throw error;
      toast.success("Configurações salvas com sucesso!");
    } catch (error) {
      toast.error("Erro ao salvar configurações");
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <DashboardLayout>
    <div className="container max-w-4xl py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Configuração de Onboarding</h1>
          <p className="text-muted-foreground mt-1">
            Configure as etapas do onboarding que todas as empresas verão ao começar.
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            💡 Adicione vídeos curtos (5-15s) ou GIFs para demonstrar cada funcionalidade rapidamente
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleAddNew}>
            <Plus className="h-4 w-4 mr-2" />
            Adicionar etapa
          </Button>
          <Button onClick={handleSaveAll} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Salvar tudo
          </Button>
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {steps.map((step) => (
            <SortableStepCard
              key={step.id}
              step={step}
              onUpdate={handleUpdate}
              onDelete={handleDelete}
            />
          ))}
        </SortableContext>
      </DndContext>

      {steps.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            Nenhuma etapa configurada. Clique em "Adicionar etapa" para começar.
          </CardContent>
        </Card>
      )}
    </div>
    </DashboardLayout>
  );
}
