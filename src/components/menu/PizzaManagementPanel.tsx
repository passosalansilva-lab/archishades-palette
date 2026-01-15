import React, { useEffect, useState } from 'react';
import { Loader2, Plus, Trash2, GripVertical, Pizza, CircleDot, Slice, Settings2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CurrencyInput } from '@/components/ui/currency-input';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface PizzaSize {
  id: string;
  name: string;
  base_price: number;
  max_flavors: number;
  slices: number;
  sort_order: number;
  category_id: string;
}

interface DoughType {
  id: string;
  name: string;
  extra_price: number;
  active: boolean;
}

interface CrustType {
  id: string;
  name: string;
  active: boolean;
}

interface CrustFlavor {
  id: string;
  type_id: string;
  name: string;
  extra_price: number;
  active: boolean;
}

interface PizzaCategory {
  id: string;
  name: string;
  category_id: string;
}

interface PizzaCategorySettings {
  id?: string;
  category_id: string;
  allow_half_half: boolean;
  max_flavors: number;
  half_half_pricing_rule: string;
  half_half_discount_percentage: number;
  allow_repeated_flavors: boolean;
}

interface PizzaManagementPanelProps {
  open: boolean;
  onClose: () => void;
  companyId: string;
}

export function PizzaManagementPanel({ open, onClose, companyId }: PizzaManagementPanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('sizes');
  
  // Pizza categories
  const [pizzaCategories, setPizzaCategories] = useState<PizzaCategory[]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  
  // Sizes
  const [sizes, setSizes] = useState<PizzaSize[]>([]);
  const [newSize, setNewSize] = useState({ name: '', base_price: 0, max_flavors: 2, slices: 8 });
  const [savingSizes, setSavingSizes] = useState(false);
  
  // Doughs
  const [doughs, setDoughs] = useState<DoughType[]>([]);
  const [newDough, setNewDough] = useState({ name: '', extra_price: 0 });
  const [savingDoughs, setSavingDoughs] = useState(false);
  
  // Crusts
  const [crustTypes, setCrustTypes] = useState<CrustType[]>([]);
  const [crustFlavors, setCrustFlavors] = useState<CrustFlavor[]>([]);
  const [newCrustType, setNewCrustType] = useState('');
  const [newFlavor, setNewFlavor] = useState<{ typeId: string; name: string; price: number } | null>(null);
  const [savingCrusts, setSavingCrusts] = useState(false);
  
  // Settings
  const [categorySettings, setCategorySettings] = useState<PizzaCategorySettings | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (open && companyId) {
      loadData();
    }
  }, [open, companyId]);

  useEffect(() => {
    if (selectedCategoryId) {
      loadCategorySizes();
      loadCategorySettings();
    }
  }, [selectedCategoryId]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load pizza categories
      const { data: categories, error: catError } = await supabase
        .from('pizza_categories')
        .select('id, category_id, categories!inner(name)')
        .eq('company_id', companyId);
      
      if (catError) throw catError;
      
      const mappedCategories = (categories || []).map((c: any) => ({
        id: c.id,
        category_id: c.category_id,
        name: c.categories?.name || 'Sem nome',
      }));
      
      setPizzaCategories(mappedCategories);
      
      if (mappedCategories.length > 0 && !selectedCategoryId) {
        setSelectedCategoryId(mappedCategories[0].category_id);
      }
      
      // Load global doughs
      const { data: doughsData, error: doughsError } = await supabase
        .from('pizza_dough_types')
        .select('*')
        .eq('active', true)
        .order('name');
      
      if (doughsError) throw doughsError;
      setDoughs(doughsData || []);
      
      // Load crust types and flavors
      const [{ data: typesData, error: typesError }, { data: flavorsData, error: flavorsError }] = await Promise.all([
        supabase.from('pizza_crust_types').select('*').eq('active', true).order('name'),
        supabase.from('pizza_crust_flavors').select('*').eq('active', true).order('name'),
      ]);
      
      if (typesError) throw typesError;
      if (flavorsError) throw flavorsError;
      
      setCrustTypes(typesData || []);
      setCrustFlavors(flavorsData || []);
      
    } catch (error: any) {
      console.error('Error loading pizza data:', error);
      toast({
        title: 'Erro ao carregar dados',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const loadCategorySizes = async () => {
    if (!selectedCategoryId) return;
    
    try {
      const { data, error } = await supabase
        .from('pizza_category_sizes')
        .select('*')
        .eq('category_id', selectedCategoryId)
        .order('sort_order');
      
      if (error) throw error;
      setSizes(data || []);
    } catch (error: any) {
      console.error('Error loading sizes:', error);
    }
  };

  const loadCategorySettings = async () => {
    if (!selectedCategoryId) return;
    
    try {
      const { data, error } = await supabase
        .from('pizza_category_settings')
        .select('*')
        .eq('category_id', selectedCategoryId)
        .maybeSingle();
      
      if (error && error.code !== 'PGRST116') throw error;
      
      setCategorySettings(data || {
        category_id: selectedCategoryId,
        allow_half_half: true,
        max_flavors: 2,
        half_half_pricing_rule: 'average',
        half_half_discount_percentage: 0,
        allow_repeated_flavors: false,
      });
    } catch (error: any) {
      console.error('Error loading settings:', error);
    }
  };

  // Size functions
  const addSize = async () => {
    if (!selectedCategoryId || !newSize.name.trim()) return;
    
    try {
      setSavingSizes(true);
      const { data, error } = await supabase
        .from('pizza_category_sizes')
        .insert({
          category_id: selectedCategoryId,
          name: newSize.name.trim(),
          base_price: newSize.base_price,
          max_flavors: newSize.max_flavors,
          slices: newSize.slices,
          sort_order: sizes.length,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      setSizes([...sizes, data]);
      setNewSize({ name: '', base_price: 0, max_flavors: 2, slices: 8 });
      toast({ title: 'Tamanho adicionado' });
    } catch (error: any) {
      toast({ title: 'Erro ao adicionar tamanho', description: error.message, variant: 'destructive' });
    } finally {
      setSavingSizes(false);
    }
  };

  const updateSize = async (sizeId: string, updates: Partial<PizzaSize>) => {
    try {
      const { error } = await supabase
        .from('pizza_category_sizes')
        .update(updates)
        .eq('id', sizeId);
      
      if (error) throw error;
      
      setSizes(sizes.map(s => s.id === sizeId ? { ...s, ...updates } : s));
    } catch (error: any) {
      toast({ title: 'Erro ao atualizar tamanho', description: error.message, variant: 'destructive' });
    }
  };

  const deleteSize = async (sizeId: string) => {
    try {
      const { error } = await supabase
        .from('pizza_category_sizes')
        .delete()
        .eq('id', sizeId);
      
      if (error) throw error;
      
      setSizes(sizes.filter(s => s.id !== sizeId));
      toast({ title: 'Tamanho removido' });
    } catch (error: any) {
      toast({ title: 'Erro ao remover tamanho', description: error.message, variant: 'destructive' });
    }
  };

  // Dough functions
  const addDough = async () => {
    if (!newDough.name.trim()) return;
    
    try {
      setSavingDoughs(true);
      const { data, error } = await supabase
        .from('pizza_dough_types')
        .insert({
          name: newDough.name.trim(),
          extra_price: newDough.extra_price,
          active: true,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      setDoughs([...doughs, data]);
      setNewDough({ name: '', extra_price: 0 });
      toast({ title: 'Massa adicionada' });
    } catch (error: any) {
      toast({ title: 'Erro ao adicionar massa', description: error.message, variant: 'destructive' });
    } finally {
      setSavingDoughs(false);
    }
  };

  const updateDough = async (doughId: string, updates: Partial<DoughType>) => {
    try {
      const { error } = await supabase
        .from('pizza_dough_types')
        .update(updates)
        .eq('id', doughId);
      
      if (error) throw error;
      
      setDoughs(doughs.map(d => d.id === doughId ? { ...d, ...updates } : d));
    } catch (error: any) {
      toast({ title: 'Erro ao atualizar massa', description: error.message, variant: 'destructive' });
    }
  };

  const deleteDough = async (doughId: string) => {
    try {
      const { error } = await supabase
        .from('pizza_dough_types')
        .update({ active: false })
        .eq('id', doughId);
      
      if (error) throw error;
      
      setDoughs(doughs.filter(d => d.id !== doughId));
      toast({ title: 'Massa removida' });
    } catch (error: any) {
      toast({ title: 'Erro ao remover massa', description: error.message, variant: 'destructive' });
    }
  };

  // Crust functions
  const addCrustType = async () => {
    if (!newCrustType.trim()) return;
    
    try {
      setSavingCrusts(true);
      const { data, error } = await supabase
        .from('pizza_crust_types')
        .insert({
          name: newCrustType.trim(),
          active: true,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      setCrustTypes([...crustTypes, data]);
      setNewCrustType('');
      toast({ title: 'Tipo de borda adicionado' });
    } catch (error: any) {
      toast({ title: 'Erro ao adicionar tipo de borda', description: error.message, variant: 'destructive' });
    } finally {
      setSavingCrusts(false);
    }
  };

  const deleteCrustType = async (typeId: string) => {
    try {
      const { error } = await supabase
        .from('pizza_crust_types')
        .update({ active: false })
        .eq('id', typeId);
      
      if (error) throw error;
      
      setCrustTypes(crustTypes.filter(t => t.id !== typeId));
      setCrustFlavors(crustFlavors.filter(f => f.type_id !== typeId));
      toast({ title: 'Tipo de borda removido' });
    } catch (error: any) {
      toast({ title: 'Erro ao remover tipo de borda', description: error.message, variant: 'destructive' });
    }
  };

  const addCrustFlavor = async () => {
    if (!newFlavor || !newFlavor.name.trim()) return;
    
    try {
      setSavingCrusts(true);
      const { data, error } = await supabase
        .from('pizza_crust_flavors')
        .insert({
          type_id: newFlavor.typeId,
          name: newFlavor.name.trim(),
          extra_price: newFlavor.price,
          active: true,
        })
        .select()
        .single();
      
      if (error) throw error;
      
      setCrustFlavors([...crustFlavors, data]);
      setNewFlavor(null);
      toast({ title: 'Sabor de borda adicionado' });
    } catch (error: any) {
      toast({ title: 'Erro ao adicionar sabor de borda', description: error.message, variant: 'destructive' });
    } finally {
      setSavingCrusts(false);
    }
  };

  const updateCrustFlavor = async (flavorId: string, updates: Partial<CrustFlavor>) => {
    try {
      const { error } = await supabase
        .from('pizza_crust_flavors')
        .update(updates)
        .eq('id', flavorId);
      
      if (error) throw error;
      
      setCrustFlavors(crustFlavors.map(f => f.id === flavorId ? { ...f, ...updates } : f));
    } catch (error: any) {
      toast({ title: 'Erro ao atualizar sabor', description: error.message, variant: 'destructive' });
    }
  };

  const deleteCrustFlavor = async (flavorId: string) => {
    try {
      const { error } = await supabase
        .from('pizza_crust_flavors')
        .update({ active: false })
        .eq('id', flavorId);
      
      if (error) throw error;
      
      setCrustFlavors(crustFlavors.filter(f => f.id !== flavorId));
      toast({ title: 'Sabor de borda removido' });
    } catch (error: any) {
      toast({ title: 'Erro ao remover sabor de borda', description: error.message, variant: 'destructive' });
    }
  };

  // Settings functions
  const saveSettings = async () => {
    if (!categorySettings || !selectedCategoryId) return;
    
    try {
      setSavingSettings(true);
      
      if (categorySettings.id) {
        const { error } = await supabase
          .from('pizza_category_settings')
          .update({
            allow_half_half: categorySettings.allow_half_half,
            max_flavors: categorySettings.max_flavors,
            half_half_pricing_rule: categorySettings.half_half_pricing_rule,
            half_half_discount_percentage: categorySettings.half_half_discount_percentage,
            allow_repeated_flavors: categorySettings.allow_repeated_flavors,
          })
          .eq('id', categorySettings.id);
        
        if (error) throw error;
      } else {
        const { data, error } = await supabase
          .from('pizza_category_settings')
          .insert({
            category_id: selectedCategoryId,
            allow_half_half: categorySettings.allow_half_half,
            max_flavors: categorySettings.max_flavors,
            half_half_pricing_rule: categorySettings.half_half_pricing_rule,
            half_half_discount_percentage: categorySettings.half_half_discount_percentage,
            allow_repeated_flavors: categorySettings.allow_repeated_flavors,
          })
          .select()
          .single();
        
        if (error) throw error;
        setCategorySettings({ ...categorySettings, id: data.id });
      }
      
      toast({ title: 'Configurações salvas' });
    } catch (error: any) {
      toast({ title: 'Erro ao salvar configurações', description: error.message, variant: 'destructive' });
    } finally {
      setSavingSettings(false);
    }
  };

  const selectedCategoryName = pizzaCategories.find(c => c.category_id === selectedCategoryId)?.name || '';

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Pizza className="h-5 w-5" />
            Gestão de Pizzas
          </SheetTitle>
          <SheetDescription>
            Gerencie tamanhos, massas, bordas e regras de pizza em um só lugar.
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : pizzaCategories.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <Pizza className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Nenhuma categoria de pizza encontrada.
              <br />
              Crie uma categoria do tipo "Pizza" primeiro.
            </p>
          </div>
        ) : (
          <div className="mt-6 space-y-6">
            {/* Category Selector */}
            {pizzaCategories.length > 1 && (
              <div className="space-y-2">
                <Label>Categoria de Pizza</Label>
                <Select
                  value={selectedCategoryId || ''}
                  onValueChange={setSelectedCategoryId}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {pizzaCategories.map((cat) => (
                      <SelectItem key={cat.category_id} value={cat.category_id}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="sizes" className="text-xs sm:text-sm">
                  <Slice className="h-4 w-4 mr-1 hidden sm:inline" />
                  Tamanhos
                </TabsTrigger>
                <TabsTrigger value="doughs" className="text-xs sm:text-sm">
                  <CircleDot className="h-4 w-4 mr-1 hidden sm:inline" />
                  Massas
                </TabsTrigger>
                <TabsTrigger value="crusts" className="text-xs sm:text-sm">
                  <Pizza className="h-4 w-4 mr-1 hidden sm:inline" />
                  Bordas
                </TabsTrigger>
                <TabsTrigger value="settings" className="text-xs sm:text-sm">
                  <Settings2 className="h-4 w-4 mr-1 hidden sm:inline" />
                  Regras
                </TabsTrigger>
              </TabsList>

              {/* Sizes Tab */}
              <TabsContent value="sizes" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Tamanhos de Pizza</CardTitle>
                    <CardDescription>
                      Configure os tamanhos disponíveis para {selectedCategoryName || 'esta categoria'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {sizes.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhum tamanho cadastrado. Adicione abaixo.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {sizes.map((size) => (
                          <div
                            key={size.id}
                            className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30"
                          >
                            <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                            <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
                              <Input
                                value={size.name}
                                onChange={(e) => updateSize(size.id, { name: e.target.value })}
                                placeholder="Nome"
                                className="h-9"
                              />
                              <CurrencyInput
                                value={size.base_price}
                                onChange={(v) => updateSize(size.id, { base_price: parseFloat(v) || 0 })}
                                className="h-9"
                              />
                              <Input
                                type="number"
                                value={size.max_flavors}
                                onChange={(e) => updateSize(size.id, { max_flavors: parseInt(e.target.value) || 1 })}
                                placeholder="Sabores"
                                className="h-9"
                                min={1}
                                max={4}
                              />
                              <Input
                                type="number"
                                value={size.slices}
                                onChange={(e) => updateSize(size.id, { slices: parseInt(e.target.value) || 8 })}
                                placeholder="Fatias"
                                className="h-9"
                                min={4}
                                max={16}
                              />
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => deleteSize(size.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add new size */}
                    <div className="flex items-end gap-2 pt-4 border-t">
                      <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div>
                          <Label className="text-xs text-muted-foreground">Nome</Label>
                          <Input
                            value={newSize.name}
                            onChange={(e) => setNewSize({ ...newSize, name: e.target.value })}
                            placeholder="Ex: Grande"
                            className="h-9"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Preço Base</Label>
                          <CurrencyInput
                            value={newSize.base_price}
                            onChange={(v) => setNewSize({ ...newSize, base_price: parseFloat(v) || 0 })}
                            className="h-9"
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Máx Sabores</Label>
                          <Input
                            type="number"
                            value={newSize.max_flavors}
                            onChange={(e) => setNewSize({ ...newSize, max_flavors: parseInt(e.target.value) || 1 })}
                            className="h-9"
                            min={1}
                            max={4}
                          />
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Fatias</Label>
                          <Input
                            type="number"
                            value={newSize.slices}
                            onChange={(e) => setNewSize({ ...newSize, slices: parseInt(e.target.value) || 8 })}
                            className="h-9"
                            min={4}
                            max={16}
                          />
                        </div>
                      </div>
                      <Button
                        onClick={addSize}
                        disabled={!newSize.name.trim() || savingSizes}
                        size="sm"
                      >
                        {savingSizes ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Doughs Tab */}
              <TabsContent value="doughs" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Tipos de Massa</CardTitle>
                    <CardDescription>
                      Massas disponíveis para todas as pizzas (tradicional, integral, etc.)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {doughs.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhuma massa cadastrada. Adicione abaixo.
                      </p>
                    ) : (
                      <div className="space-y-3">
                        {doughs.map((dough) => (
                          <div
                            key={dough.id}
                            className="flex items-center gap-3 p-3 border rounded-lg bg-muted/30"
                          >
                            <GripVertical className="h-4 w-4 text-muted-foreground" />
                            <Input
                              value={dough.name}
                              onChange={(e) => updateDough(dough.id, { name: e.target.value })}
                              placeholder="Nome da massa"
                              className="flex-1 h-9"
                            />
                            <div className="w-28">
                              <CurrencyInput
                                value={dough.extra_price}
                                onChange={(v) => updateDough(dough.id, { extra_price: parseFloat(v) || 0 })}
                                className="h-9"
                              />
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-destructive"
                              onClick={() => deleteDough(dough.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add new dough */}
                    <div className="flex items-end gap-2 pt-4 border-t">
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground">Nome da Massa</Label>
                        <Input
                          value={newDough.name}
                          onChange={(e) => setNewDough({ ...newDough, name: e.target.value })}
                          placeholder="Ex: Massa Tradicional"
                          className="h-9"
                        />
                      </div>
                      <div className="w-28">
                        <Label className="text-xs text-muted-foreground">Preço Extra</Label>
                        <CurrencyInput
                          value={newDough.extra_price}
                          onChange={(v) => setNewDough({ ...newDough, extra_price: parseFloat(v) || 0 })}
                          className="h-9"
                        />
                      </div>
                      <Button
                        onClick={addDough}
                        disabled={!newDough.name.trim() || savingDoughs}
                        size="sm"
                      >
                        {savingDoughs ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Crusts Tab */}
              <TabsContent value="crusts" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Tipos e Sabores de Borda</CardTitle>
                    <CardDescription>
                      Organize as bordas por tipo (ex: Recheada) e seus sabores (ex: Catupiry, Cheddar)
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {crustTypes.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Nenhum tipo de borda cadastrado. Adicione abaixo.
                      </p>
                    ) : (
                      <div className="space-y-4">
                        {crustTypes.map((type) => (
                          <div key={type.id} className="border rounded-lg">
                            <div className="flex items-center justify-between p-3 bg-muted/30">
                              <span className="font-medium">{type.name}</span>
                              <div className="flex items-center gap-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setNewFlavor({ typeId: type.id, name: '', price: 0 })}
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  Sabor
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8 text-destructive hover:text-destructive"
                                  onClick={() => deleteCrustType(type.id)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            
                            <div className="p-3 space-y-2">
                              {crustFlavors.filter(f => f.type_id === type.id).length === 0 ? (
                                <p className="text-xs text-muted-foreground">Nenhum sabor cadastrado</p>
                              ) : (
                                crustFlavors
                                  .filter(f => f.type_id === type.id)
                                  .map((flavor) => (
                                    <div key={flavor.id} className="flex items-center gap-2">
                                      <Input
                                        value={flavor.name}
                                        onChange={(e) => updateCrustFlavor(flavor.id, { name: e.target.value })}
                                        className="flex-1 h-8 text-sm"
                                      />
                                      <CurrencyInput
                                        value={flavor.extra_price}
                                        onChange={(v) => updateCrustFlavor(flavor.id, { extra_price: parseFloat(v) || 0 })}
                                        className="w-24 h-8 text-sm"
                                      />
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7 text-destructive"
                                        onClick={() => deleteCrustFlavor(flavor.id)}
                                      >
                                        <Trash2 className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  ))
                              )}
                              
                              {/* Inline add flavor form */}
                              {newFlavor && newFlavor.typeId === type.id && (
                                <div className="flex items-center gap-2 pt-2 border-t">
                                  <Input
                                    value={newFlavor.name}
                                    onChange={(e) => setNewFlavor({ ...newFlavor, name: e.target.value })}
                                    placeholder="Nome do sabor"
                                    className="flex-1 h-8 text-sm"
                                    autoFocus
                                  />
                                  <CurrencyInput
                                    value={newFlavor.price}
                                    onChange={(v) => setNewFlavor({ ...newFlavor, price: parseFloat(v) || 0 })}
                                    className="w-24 h-8 text-sm"
                                  />
                                  <Button
                                    size="sm"
                                    className="h-8"
                                    onClick={addCrustFlavor}
                                    disabled={!newFlavor.name.trim() || savingCrusts}
                                  >
                                    {savingCrusts ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Salvar'}
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8"
                                    onClick={() => setNewFlavor(null)}
                                  >
                                    Cancelar
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Add new crust type */}
                    <div className="flex items-end gap-2 pt-4 border-t">
                      <div className="flex-1">
                        <Label className="text-xs text-muted-foreground">Novo Tipo de Borda</Label>
                        <Input
                          value={newCrustType}
                          onChange={(e) => setNewCrustType(e.target.value)}
                          placeholder="Ex: Borda Recheada"
                          className="h-9"
                        />
                      </div>
                      <Button
                        onClick={addCrustType}
                        disabled={!newCrustType.trim() || savingCrusts}
                        size="sm"
                      >
                        {savingCrusts ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Settings Tab */}
              <TabsContent value="settings" className="space-y-4 mt-4">
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Regras de Pizza</CardTitle>
                    <CardDescription>
                      Configure as regras de meio a meio e preços para {selectedCategoryName || 'esta categoria'}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    {categorySettings && (
                      <>
                        <div className="flex items-center justify-between">
                          <div>
                            <Label>Permitir Meio a Meio</Label>
                            <p className="text-xs text-muted-foreground">
                              Clientes podem escolher múltiplos sabores
                            </p>
                          </div>
                          <Switch
                            checked={categorySettings.allow_half_half}
                            onCheckedChange={(checked) => 
                              setCategorySettings({ ...categorySettings, allow_half_half: checked })
                            }
                          />
                        </div>

                        {categorySettings.allow_half_half && (
                          <>
                            <div className="space-y-2">
                              <Label>Máximo de Sabores</Label>
                              <Select
                                value={String(categorySettings.max_flavors)}
                                onValueChange={(v) => 
                                  setCategorySettings({ ...categorySettings, max_flavors: parseInt(v) })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="2">2 sabores</SelectItem>
                                  <SelectItem value="3">3 sabores</SelectItem>
                                  <SelectItem value="4">4 sabores</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            <div className="space-y-2">
                              <Label>Regra de Preço</Label>
                              <Select
                                value={categorySettings.half_half_pricing_rule}
                                onValueChange={(v) => 
                                  setCategorySettings({ ...categorySettings, half_half_pricing_rule: v })
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="average">Média dos sabores</SelectItem>
                                  <SelectItem value="highest">Sabor mais caro</SelectItem>
                                  <SelectItem value="sum">Soma dos sabores</SelectItem>
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-muted-foreground">
                                {categorySettings.half_half_pricing_rule === 'average' && 'O preço será a média dos sabores escolhidos'}
                                {categorySettings.half_half_pricing_rule === 'highest' && 'O preço será do sabor mais caro'}
                                {categorySettings.half_half_pricing_rule === 'sum' && 'O preço será a soma proporcional dos sabores'}
                              </p>
                            </div>

                            <div className="space-y-2">
                              <Label>Desconto Meio a Meio (%)</Label>
                              <Input
                                type="number"
                                value={categorySettings.half_half_discount_percentage}
                                onChange={(e) => 
                                  setCategorySettings({ 
                                    ...categorySettings, 
                                    half_half_discount_percentage: parseFloat(e.target.value) || 0 
                                  })
                                }
                                min={0}
                                max={100}
                                className="w-32"
                              />
                              <p className="text-xs text-muted-foreground">
                                Desconto aplicado quando o cliente escolhe meio a meio
                              </p>
                            </div>

                            <div className="flex items-center justify-between">
                              <div>
                                <Label>Permitir Sabores Repetidos</Label>
                                <p className="text-xs text-muted-foreground">
                                  Cliente pode escolher o mesmo sabor mais de uma vez
                                </p>
                              </div>
                              <Switch
                                checked={categorySettings.allow_repeated_flavors}
                                onCheckedChange={(checked) => 
                                  setCategorySettings({ ...categorySettings, allow_repeated_flavors: checked })
                                }
                              />
                            </div>
                          </>
                        )}

                        <Button 
                          onClick={saveSettings} 
                          disabled={savingSettings}
                          className="w-full"
                        >
                          {savingSettings ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Salvando...
                            </>
                          ) : (
                            'Salvar Configurações'
                          )}
                        </Button>
                      </>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
