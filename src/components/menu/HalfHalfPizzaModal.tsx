import { useState, useEffect } from "react";
import { X, Plus, Minus, Pizza, Check } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { PizzaPreview } from "./PizzaPreview";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/hooks/useCart";
import { toast } from "sonner";

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category_id: string | null;
}

interface OptionGroup {
  id: string;
  name: string;
  description: string | null;
  selection_type: string;
  is_required: boolean;
  max_selections: number | null;
  min_selections: number | null;
  options: ProductOption[];
}

interface ProductOption {
  id: string;
  name: string;
  price_modifier: number;
  is_available: boolean;
}

interface SelectedOption {
  group_id: string;
  group_name: string;
  option_id: string;
  option_name: string;
  price_modifier: number;
}

interface HalfHalfPizzaModalProps {
  open: boolean;
  onClose: () => void;
  pizzaProducts: Product[];
  maxFlavors: number;
  enableCrust: boolean;
  enableAddons: boolean;
  allowCrustExtraPrice: boolean;
  companyId: string;
  pricingRule?: 'highest' | 'average' | 'sum';
  discountPercentage?: number;
  /** Define de qual sabor pegar as opções de massa/borda: 'highest' | 'lowest' | 'first' */
  optionsSource?: 'highest' | 'lowest' | 'first';
}

interface PizzaSize {
  id: string;
  name: string;
  base_price: number;
  max_flavors: number;
  slices: number;
}

export function HalfHalfPizzaModal({
  open,
  onClose,
  pizzaProducts,
  maxFlavors,
  enableCrust,
  enableAddons,
  allowCrustExtraPrice,
  companyId,
  pricingRule = 'average',
  discountPercentage = 0,
  optionsSource = 'highest',
}: HalfHalfPizzaModalProps) {
  const { addItem } = useCart();
  const [step, setStep] = useState<"size" | "flavors" | "options">("size");
  const [selectedFlavors, setSelectedFlavors] = useState<Product[]>([]);
  const [quantity, setQuantity] = useState(1);
  const [sizeOptions, setSizeOptions] = useState<OptionGroup[]>([]);
  const [doughOptions, setDoughOptions] = useState<OptionGroup[]>([]);
  const [crustOptions, setCrustOptions] = useState<OptionGroup[]>([]);
  const [addonOptions, setAddonOptions] = useState<OptionGroup[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<SelectedOption[]>([]);
  const [loading, setLoading] = useState(false);
  
  // Pizza sizes
  const [pizzaSizes, setPizzaSizes] = useState<PizzaSize[]>([]);
  const [selectedSize, setSelectedSize] = useState<PizzaSize | null>(null);
  const [loadingSizes, setLoadingSizes] = useState(true);

  // Map: productId -> (normalizedSizeName -> price)
  const [sizePriceByProduct, setSizePriceByProduct] = useState<Record<string, Record<string, number>>>({});

  const normalizeSizeKey = (value: string) =>
    value
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const getFlavorPriceForSelectedSize = (product: Product): number => {
    if (!selectedSize) return Number(product.price);
    const key = normalizeSizeKey(selectedSize.name);
    const price = sizePriceByProduct[product.id]?.[key];
    if (typeof price === 'number' && price > 0) return price;
    return Number(product.price);
  };

  // Load pizza sizes when modal opens - only once when opening
  const [sizesLoaded, setSizesLoaded] = useState(false);
  
  useEffect(() => {
    if (open && pizzaProducts.length > 0 && !sizesLoaded) {
      loadPizzaSizes();
      setSizesLoaded(true);
    }
  }, [open, pizzaProducts, sizesLoaded]);

  useEffect(() => {
    if (open && step === "options" && selectedFlavors.length > 0) {
      loadOptions();
    }
  }, [open, step, selectedFlavors]);

  useEffect(() => {
    if (!open) {
      setStep("size");
      setSelectedFlavors([]);
      setQuantity(1);
      setSelectedOptions([]);
      setSelectedSize(null);
      setSizesLoaded(false); // Reset para carregar novamente na próxima abertura
    }
  }, [open]);

  const loadPizzaSizes = async () => {
    try {
      setLoadingSizes(true);

      // 1) Prioridade: tamanhos por PRODUTO (product_option_groups "Tamanho")
      // Isso garante que o meio-a-meio respeite o preço do tamanho para cada sabor
      const sizeGroupResults = await Promise.all(
        pizzaProducts.map((p) =>
          supabase
            .from("product_option_groups")
            .select(`
              id,
              name,
              product_options (
                id,
                name,
                price_modifier,
                is_available,
                sort_order
              )
            `)
            .eq("product_id", p.id)
            .ilike("name", "%tamanho%")
            .maybeSingle(),
        ),
      );

      const perProductSizeMap: Record<string, Record<string, number>> = {};
      const allSizeKeys = new Set<string>();

      sizeGroupResults.forEach((res: any, idx) => {
        const productId = pizzaProducts[idx].id;
        const group = res?.data;
        const options = (group?.product_options || []) as any[];

        const map: Record<string, number> = {};
        for (const opt of options) {
          if (!opt?.is_available) continue;
          const key = normalizeSizeKey(opt.name);
          const price = Number(opt.price_modifier ?? 0);
          if (!key) continue;
          // Para pizza, price_modifier é o preço final do tamanho
          if (price > 0) {
            map[key] = price;
            allSizeKeys.add(key);
          }
        }

        if (Object.keys(map).length > 0) {
          perProductSizeMap[productId] = map;
        }
      });

      if (Object.keys(perProductSizeMap).length > 0 && allSizeKeys.size > 0) {
        // Montar lista de tamanhos a partir do conjunto de nomes
        const sizesList: PizzaSize[] = Array.from(allSizeKeys)
          .map((key) => {
            // nome "bonito" = pegar do primeiro produto que tiver
            const displayName =
              pizzaProducts
                .map((p) => p.name) &&
              key;

            const prices = pizzaProducts
              .map((p) => perProductSizeMap[p.id]?.[key])
              .filter((v): v is number => typeof v === 'number' && v > 0);

            const minPrice = prices.length > 0 ? Math.min(...prices) : 0;

            return {
              id: key, // id lógico por nome normalizado
              name: key
                .split(' ')
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(' '),
              base_price: minPrice,
              max_flavors: maxFlavors,
              slices: estimateSlices(key),
            };
          })
          .sort((a, b) => b.slices - a.slices);

        setSizePriceByProduct(perProductSizeMap);
        setPizzaSizes(sizesList);
        setSelectedSize(sizesList[0] || null);
        return;
      }

      // 2) Fallback: tamanhos por CATEGORIA (pizza_category_sizes)
      const categoryId = pizzaProducts[0]?.category_id;
      if (!categoryId) {
        setStep("flavors");
        return;
      }

      const { data: categorySizes, error: catError } = await supabase
        .from("pizza_category_sizes")
        .select("id, name, base_price, max_flavors, slices")
        .eq("category_id", categoryId)
        .order("slices", { ascending: false });

      if (!catError && categorySizes && categorySizes.length > 0) {
        // Ordenar por slices (maior primeiro) com fallback para 8 se null
        const sortedSizes = [...categorySizes].sort((a, b) => (b.slices ?? 8) - (a.slices ?? 8));
        setSizePriceByProduct({});
        setPizzaSizes(sortedSizes);
        setSelectedSize(sortedSizes[0]);
        return;
      }

      // Nenhum tamanho encontrado
      setStep("flavors");
    } catch (error) {
      console.error("Error loading pizza sizes:", error);
      setStep("flavors");
    } finally {
      setLoadingSizes(false);
    }
  };

  // Função auxiliar para estimar fatias pelo nome do tamanho
  const estimateSlices = (sizeName: string): number => {
    const name = sizeName.toLowerCase();
    if (name.includes("pequen") || name.includes("broto") || name.includes("individual")) return 4;
    if (name.includes("médi") || name.includes("medi")) return 6;
    if (name.includes("grand") || name.includes("famil")) return 8;
    if (name.includes("giga") || name.includes("extra")) return 10;
    return 8; // default
  };

  const loadOptions = async () => {
    try {
      setLoading(true);
      
      // Selecionar o sabor de referência baseado na configuração optionsSource
      let referenceFlavor: Product | undefined;
      
      switch (optionsSource) {
        case 'lowest':
          // Sabor mais barato
          referenceFlavor = selectedFlavors.reduce((prev, curr) =>
            curr.price < prev.price ? curr : prev,
          selectedFlavors[0]);
          break;
        case 'first':
          // Primeiro sabor selecionado
          referenceFlavor = selectedFlavors[0];
          break;
        case 'highest':
        default:
          // Sabor mais caro
          referenceFlavor = selectedFlavors.reduce((prev, curr) =>
            curr.price > prev.price ? curr : prev,
          selectedFlavors[0]);
          break;
      }

      if (!referenceFlavor) {
        setLoading(false);
        return;
      }

      // Buscar opções (massa, borda, adicionais) a partir do sabor de referência
      const productIds = [referenceFlavor.id];
      const categoryId = referenceFlavor.category_id;

      // Buscar em paralelo: grupos genéricos de opções + tamanhos específicos de pizza + tipos de massa + bordas
      const [groupsResult, sizesResult, doughTypesResult, crustLinksResult] = await Promise.all([
        supabase
          .from("product_option_groups")
          .select(`
            id,
            name,
            description,
            selection_type,
            is_required,
            max_selections,
            min_selections,
            product_options:product_options(
              id,
              name,
              price_modifier,
              is_available
            )
          `)
          .in("product_id", productIds)
          .order("sort_order"),
        categoryId
          ? supabase
              .from("pizza_category_sizes")
              .select("id, name, base_price, max_flavors, sort_order")
              .eq("category_id", categoryId)
              .order("sort_order")
          : Promise.resolve({ data: null, error: null } as any),
        supabase
          .from("pizza_dough_types")
          .select("id, name, extra_price, active")
          .eq("active", true),
        supabase
          .from("pizza_product_crust_flavors")
          .select("id, product_id, crust_flavor_id, pizza_crust_flavors ( id, name, extra_price, active )")
          .eq("product_id", referenceFlavor.id),
      ]);

      const { data: groups, error: groupsError } = groupsResult as any;
      const { data: sizesData, error: sizesError } = sizesResult as any;
      const { data: doughTypes, error: doughTypesError } = doughTypesResult as any;
      const { data: crustLinks, error: crustLinksError } = crustLinksResult as any;

      if (groupsError) throw groupsError;
      if (sizesError) throw sizesError;
      if (doughTypesError) throw doughTypesError;
      if (crustLinksError) throw crustLinksError;

      // Transformar grupos genéricos para o formato esperado
      const formattedGroups =
        groups?.map((g: any) => ({
          ...g,
          options: g.product_options || [],
        })) || [];

      // Unificar grupos com o mesmo nome (ex.: adicionais/bordas em vários sabores)
      const mergedByName = new Map<string, OptionGroup & { options: ProductOption[] }>();

      const normalize = (value: string | null | undefined) =>
        (value || "").toLowerCase().trim();

      for (const group of formattedGroups as any[]) {
        const key = `${normalize(group.name)}|${group.selection_type}`;
        const existing = mergedByName.get(key);

        if (!existing) {
          mergedByName.set(key, {
            ...group,
            options: [...group.options],
          });
        } else {
          // Mesclar opções, evitando duplicadas pelo nome
          const existingOptionsByName = new Map(
            existing.options.map((opt) => [normalize(opt.name), opt])
          );

          for (const opt of group.options as ProductOption[]) {
            const optKey = normalize(opt.name);
            if (!existingOptionsByName.has(optKey)) {
              existingOptionsByName.set(optKey, opt);
            }
          }

          existing.options = Array.from(existingOptionsByName.values());

          // Ajustar flags de obrigatoriedade de forma conservadora
          existing.is_required = existing.is_required || group.is_required;
          existing.max_selections = existing.max_selections ?? group.max_selections;
          existing.min_selections = existing.min_selections ?? group.min_selections;
        }
      }

      const mergedGroups = Array.from(mergedByName.values());

      // Tamanhos vindos da configuração de pizza (pizza_category_sizes)
      // Para o fluxo de meio a meio, não exibimos seleção de tamanho nem somamos
      // o preço do tamanho aqui; usamos apenas o preço base já definido nos produtos.
      const sizeGroupsFromPizza: OptionGroup[] = [];
      setSizeOptions([]);

      // Grupo de tipos de massa vindo de pizza_dough_types
      const doughGroupsFromPizza: OptionGroup[] =
        doughTypes && Array.isArray(doughTypes) && doughTypes.length > 0
          ? [
              {
                id: "pizza-dough",
                name: "Tipo de massa",
                description: null,
                selection_type: "single",
                is_required: true,
                max_selections: 1,
                min_selections: 1,
                options: (doughTypes as any[]).map((dough) => ({
                  id: dough.id,
                  name: dough.name,
                  price_modifier: Number(dough.extra_price ?? 0),
                  is_available: true,
                })),
              },
            ]
          : [];

      // Bordas configuradas por produto (pizza_product_crust_flavors + pizza_crust_flavors)
      const crustGroupsFromPizza: OptionGroup[] =
        crustLinks && Array.isArray(crustLinks) && crustLinks.length > 0
          ? [
              {
                id: "pizza-crust",
                name: "Borda",
                description: null,
                selection_type: "single",
                is_required: false,
                max_selections: 1,
                min_selections: 0,
                options: (crustLinks as any[])
                  .map((link) => link.pizza_crust_flavors)
                  .filter((flavor: any) => flavor && flavor.active)
                  .map((flavor: any) => ({
                    id: flavor.id,
                    name: flavor.name,
                    price_modifier: Number(flavor.extra_price ?? 0),
                    is_available: true,
                  })),
              },
            ]
          : [];

      // Identificar grupos por tipo a partir dos grupos genéricos
      const sizeGroupsFromNames = mergedGroups.filter((g) =>
        normalize(g.name).includes("tamanho")
      );

      const sizeGroups =
        sizeGroupsFromPizza.length > 0 ? sizeGroupsFromPizza : sizeGroupsFromNames;

      const doughGroupsFromNames = mergedGroups.filter((g) =>
        normalize(g.name).includes("massa") ||
        normalize(g.name).includes("massas") ||
        normalize(g.name).includes("dough")
      );

      // Priorizar pizza_dough_types; se existir, ignorar grupos de product_options
      // para evitar duplicação de opções como "Tradicional"
      const doughGroups = doughGroupsFromPizza.length > 0 
        ? doughGroupsFromPizza 
        : doughGroupsFromNames;

      const crustFromNames = mergedGroups.filter((g) => {
        const name = normalize(g.name);
        return (
          name.includes("borda") ||
          name.includes("crust") ||
          name.includes("rechead") // cobre "recheado" / "recheada"
        );
      });
 
      const crust = [
        ...crustGroupsFromPizza,
        ...crustFromNames,
      ];
      
      // IDs dos grupos já usados para tamanho, massa e borda
      const usedGroupIds = new Set([
        ...sizeGroups.map(g => g.id),
        ...doughGroups.map(g => g.id),
        ...crust.map(g => g.id),
      ]);

      // Adicionais = grupos que não são tamanho, massa nem borda
      // Inclui palavras-chave comuns E qualquer grupo restante
      const addons = mergedGroups.filter((g) => {
        // Se já foi usado em outra categoria, ignorar
        if (usedGroupIds.has(g.id)) return false;
        
        const name = normalize(g.name);
        
        // Excluir explicitamente tamanho, massa, borda (caso não tenha sido pego)
        if (
          name.includes("tamanho") ||
          name.includes("massa") ||
          name.includes("borda") ||
          name.includes("crust") ||
          name.includes("rechead")
        ) {
          return false;
        }
        
        // Incluir todos os demais grupos (adicionais, extras, turbine, complementos, etc.)
        return true;
      });

      setSizeOptions(sizeGroups);

      // Seleção automática do tamanho "Grande" (ou primeiro tamanho) como padrão
      if (sizeGroups.length > 0) {
        const sizeGroup = sizeGroups[0];
        const grandeOption = sizeGroup.options.find((opt) =>
          opt.name.toLowerCase().includes("grande"),
        );
        const defaultSize = grandeOption || sizeGroup.options[0];

        if (defaultSize) {
          setSelectedOptions((prev) => {
            const filtered = prev.filter((opt) => opt.group_id !== sizeGroup.id);
            return [
              ...filtered,
              {
                group_id: sizeGroup.id,
                group_name: sizeGroup.name,
                option_id: defaultSize.id,
                option_name: defaultSize.name,
                price_modifier: defaultSize.price_modifier,
              },
            ];
          });
        }
      }

      setDoughOptions(doughGroups);
      setCrustOptions(enableCrust ? crust : []);
      setAddonOptions(enableAddons ? addons : []);
    } catch (error: any) {
      console.error("Erro ao carregar opções:", error);
      toast.error("Erro ao carregar opções da pizza");
    } finally {
      setLoading(false);
    }
  };
  const toggleFlavor = (product: Product) => {
    setSelectedFlavors((prev) => {
      const exists = prev.find((f) => f.id === product.id);
      if (exists) {
        return prev.filter((f) => f.id !== product.id);
      }
      if (prev.length >= maxFlavors) {
        toast.error(`Você pode selecionar no máximo ${maxFlavors} sabores`);
        return prev;
      }
      return [...prev, product];
    });
  };

  const handleSingleOptionChange = (groupId: string, groupName: string, optionId: string, optionName: string, priceModifier: number) => {
    setSelectedOptions((prev) => {
      const filtered = prev.filter((opt) => opt.group_id !== groupId);
      return [...filtered, { group_id: groupId, group_name: groupName, option_id: optionId, option_name: optionName, price_modifier: priceModifier }];
    });
  };

  const handleCrustChange = (groupId: string, groupName: string, optionId: string, optionName: string, priceModifier: number) => {
    handleSingleOptionChange(groupId, groupName, optionId, optionName, priceModifier);
  };

  const toggleAddon = (groupId: string, groupName: string, optionId: string, optionName: string, priceModifier: number) => {
    setSelectedOptions((prev) => {
      const exists = prev.find((opt) => opt.option_id === optionId);
      if (exists) {
        return prev.filter((opt) => opt.option_id !== optionId);
      }
      return [...prev, { group_id: groupId, group_name: groupName, option_id: optionId, option_name: optionName, price_modifier: priceModifier }];
    });
  };

  const calculatePrice = () => {
    // Calculate base price based on pricing rule (defined at category level)
    let basePrice = 0;

    if (selectedFlavors.length > 0) {
      const prices = selectedFlavors.map((f) => getFlavorPriceForSelectedSize(f));

      // Enquanto o cliente ainda não selecionou todos os sabores,
      // mostramos um TOTAL PARCIAL baseado na fração de cada sabor.
      // Ex (2 sabores): ao selecionar 1 sabor de R$48, o parcial fica R$24.
      const isPartial = selectedFlavors.length < maxFlavors;
      const denominator = isPartial ? maxFlavors : prices.length;

      switch (pricingRule) {
        case 'highest':
          basePrice = Math.max(...prices) / (isPartial ? maxFlavors : 1);
          break;
        case 'sum':
        case 'average':
        default:
          // Para 2 sabores, sum/average dão o mesmo total final.
          // No parcial, usamos a fração por sabor (divide pelo maxFlavors).
          basePrice = prices.reduce((sum, p) => sum + p, 0) / denominator;
          break;
      }
    }

    // Fallback antigo: se não temos mapa de preços por tamanho, usar base_price do tamanho (categoria)
    // IMPORTANTE: não sobrescrever um basePrice já calculado a partir dos sabores.
    if (basePrice === 0 && selectedSize && Object.keys(sizePriceByProduct).length === 0) {
      if (selectedSize.base_price > 0) {
        basePrice = selectedSize.base_price;
      }
    }

    // Add options price (crust, addons, etc.)
    const optionsPrice = selectedOptions.reduce((sum, opt) => {
      return sum + opt.price_modifier;
    }, 0);

    // Apply discount if configured (from category)
    const subtotal = basePrice + optionsPrice;
    const discount = discountPercentage > 0 ? subtotal * (discountPercentage / 100) : 0;

    return (subtotal - discount) * quantity;
  };

  // Get current max flavors based on selected size
  const currentMaxFlavors = selectedSize?.max_flavors || maxFlavors;
  const handleAddToCart = () => {
    if (selectedFlavors.length === 0) {
      toast.error("Selecione pelo menos um sabor");
      return;
    }

    if (selectedFlavors.length < maxFlavors) {
      toast.error(`Selecione ${maxFlavors} sabores para montar a pizza`);
      return;
    }

    const totalPrice = calculatePrice();
    const unitPrice = totalPrice / quantity;

    // Montar descrição dos sabores
    const flavorsText = selectedFlavors.map((f) => f.name).join(" + ");
    const sizeText = selectedSize ? ` - ${selectedSize.name}` : "";

    const halfHalfFlavorProductIds = selectedFlavors.map((f) => f.id);

    addItem({
      productId: selectedFlavors[0].id,
      productName: `Pizza Meio a Meio${sizeText}`,
      price: unitPrice,
      quantity: quantity,
      imageUrl: selectedFlavors[0].image_url || undefined,
      notes: `Sabores: ${flavorsText}${selectedSize ? ` | ${selectedSize.slices} fatias` : ""}`,
      options: [
        {
          name: "Meio a meio",
          priceModifier: 0,
          // Metadados para estoque: ids dos produtos de cada sabor
          halfHalfFlavorProductIds,
        } as any,
        ...(selectedSize ? [{
          name: `Tamanho: ${selectedSize.name}`,
          priceModifier: 0,
        }] : []),
        ...selectedFlavors.map((f, idx) => ({
          name: `Sabor ${idx + 1}: ${f.name}`,
          priceModifier: 0,
        })),
        // Opções já estão incluídas no price unitário, então priceModifier = 0 para não duplicar
        ...selectedOptions.map((opt) => ({
          name: `${opt.group_name}: ${opt.option_name}`,
          priceModifier: 0,
        })),
      ],
      requiresPreparation: true, // Pizzas always need preparation
    });

    toast.success("Pizza adicionada ao carrinho!");
    onClose();
  };

  const totalPrice = calculatePrice();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-[calc(100%-1.5rem)] max-h-[calc(100vh-2rem)] p-0 flex flex-col">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Pizza className="h-6 w-6 text-primary" />
            Montar Pizza Meio a Meio
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 pt-4 pb-6">
          {/* Step: Size Selection */}
          {step === "size" && (
            <div className="space-y-4">
              {loadingSizes ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Carregando tamanhos...</p>
                </div>
              ) : pizzaSizes.length > 0 ? (
                <>
                  <div className="flex items-center justify-between">
                    <p className="text-sm text-muted-foreground">
                      Escolha o tamanho da sua pizza
                    </p>
                  </div>

                  <RadioGroup
                    value={selectedSize?.id || ""}
                    onValueChange={(value) => {
                      const size = pizzaSizes.find(s => s.id === value);
                      if (size) setSelectedSize(size);
                    }}
                    className="grid gap-3"
                  >
                    {pizzaSizes.map((size) => (
                      <label
                        key={size.id}
                        className={`relative flex items-center gap-4 p-4 rounded-lg border-2 cursor-pointer transition-all ${
                          selectedSize?.id === size.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:border-primary/50"
                        }`}
                      >
                        <RadioGroupItem value={size.id} id={size.id} />
                        <div className="flex-1">
                          <p className="font-semibold text-lg">{size.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {size.slices} fatias
                          </p>
                        </div>
                      </label>
                    ))}
                  </RadioGroup>
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Nenhum tamanho configurado</p>
                </div>
              )}
            </div>
          )}

          {/* Step: Flavor Selection */}
          {step === "flavors" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">
                    Selecione até {currentMaxFlavors} sabores
                  </p>
                  {selectedSize && (
                    <p className="text-xs text-primary font-medium">
                      Tamanho: {selectedSize.name}
                    </p>
                  )}
                </div>
                <Badge variant="secondary">
                  {selectedFlavors.length} / {currentMaxFlavors}
                </Badge>
              </div>

              {/* Pizza Preview */}
              <PizzaPreview
                flavors={selectedFlavors.map((f) => ({
                  id: f.id,
                  name: f.name,
                  image_url: f.image_url,
                }))}
                maxFlavors={maxFlavors}
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {pizzaProducts.map((product) => {
                  const isSelected = selectedFlavors.find((f) => f.id === product.id);
                  return (
                    <button
                      key={product.id}
                      onClick={() => toggleFlavor(product)}
                      className={`relative p-4 rounded-lg border-2 transition-all text-left ${
                        isSelected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      {isSelected && (
                        <div className="absolute top-2 right-2">
                          <div className="bg-primary text-primary-foreground rounded-full p-1">
                            <Check className="h-3 w-3" />
                          </div>
                        </div>
                      )}

                      {product.image_url && (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="w-full h-24 object-cover rounded-md mb-2"
                        />
                      )}

                      <h3 className="font-semibold text-sm mb-0.5">{product.name}</h3>
                      <p className="text-xs font-semibold text-primary mb-0.5">
                        ½ R$ {(getFlavorPriceForSelectedSize(product) / maxFlavors).toFixed(2)}
                      </p>
                      {product.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {product.description}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>

              {selectedFlavors.length > 0 && (
                <div className="mt-6 p-4 bg-muted rounded-lg">
                  <h4 className="font-semibold mb-2">Sabores selecionados:</h4>
                  <div className="space-y-1">
                    {selectedFlavors.map((flavor, idx) => (
                      <div key={flavor.id} className="flex justify-between text-sm">
                        <span>
                          {idx + 1}. {flavor.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === "options" && (
            <div className="space-y-6">
              {loading ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">Carregando opções...</p>
                </div>
              ) : (
                <>
                  {doughOptions.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-3">Tipo de massa</h3>
                      <RadioGroup
                        onValueChange={(value) => {
                          const [groupId, optionId] = value.split("::");
                          const group = doughOptions.find((g) => g.id === groupId);
                          const option = group?.options?.find((o) => o.id === optionId);
                          if (group && option) {
                            handleSingleOptionChange(
                              group.id,
                              group.name,
                              option.id,
                              option.name,
                              option.price_modifier,
                            );
                          }
                        }}
                      >
                        {doughOptions.map((group) =>
                          group.options?.map((option) => (
                            <div key={option.id} className="flex items-center space-x-2 py-2">
                              <RadioGroupItem value={`${group.id}::${option.id}`} id={`dough-${option.id}`} />
                              <Label htmlFor={`dough-${option.id}`} className="flex-1 cursor-pointer">
                                {option.name}
                                {option.price_modifier > 0 && (
                                  <span className="ml-2 text-primary font-semibold">
                                    + R$ {option.price_modifier.toFixed(2)}
                                  </span>
                                )}
                              </Label>
                            </div>
                          )),
                        )}
                      </RadioGroup>
                    </div>
                  )}

                  {crustOptions.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-3">Borda (opcional)</h3>
                      {crustOptions.map((group) =>
                        group.options?.map((option) => {
                          const isSelected = selectedOptions.some((opt) => opt.option_id === option.id);
                          return (
                            <div key={option.id} className="flex items-center space-x-2 py-2">
                              <Checkbox
                                id={`crust-${option.id}`}
                                checked={isSelected}
                                onCheckedChange={() => {
                                  if (isSelected) {
                                    // Desmarcar
                                    setSelectedOptions((prev) =>
                                      prev.filter((opt) => opt.option_id !== option.id)
                                    );
                                  } else {
                                    // Marcar (e desmarcar outras bordas do mesmo grupo)
                                    setSelectedOptions((prev) => {
                                      const withoutOtherCrusts = prev.filter(
                                        (opt) => opt.group_id !== group.id
                                      );
                                      return [
                                        ...withoutOtherCrusts,
                                        {
                                          group_id: group.id,
                                          group_name: group.name,
                                          option_id: option.id,
                                          option_name: option.name,
                                          price_modifier: allowCrustExtraPrice ? option.price_modifier : 0,
                                        },
                                      ];
                                    });
                                  }
                                }}
                              />
                              <Label htmlFor={`crust-${option.id}`} className="flex-1 cursor-pointer">
                                {option.name}
                                {allowCrustExtraPrice && option.price_modifier > 0 && (
                                  <span className="ml-2 text-primary font-semibold">
                                    + R$ {option.price_modifier.toFixed(2)}
                                  </span>
                                )}
                              </Label>
                            </div>
                          );
                        }),
                      )}
                    </div>
                  )}

                  {addonOptions.length > 0 && (
                    <div>
                      <h3 className="font-semibold mb-3">Adicionais</h3>
                      {addonOptions.map((group) =>
                        group.options?.map((option) => (
                          <div key={option.id} className="flex items-center space-x-2 py-2">
                            <Checkbox
                              id={`addon-${option.id}`}
                              checked={selectedOptions.some((opt) => opt.option_id === option.id)}
                              onCheckedChange={() =>
                                toggleAddon(
                                  group.id,
                                  group.name,
                                  option.id,
                                  option.name,
                                  option.price_modifier,
                                )
                              }
                            />
                            <Label htmlFor={`addon-${option.id}`} className="flex-1 cursor-pointer">
                              {option.name}
                              {option.price_modifier > 0 && (
                                <span className="ml-2 text-primary font-semibold">
                                  + R$ {option.price_modifier.toFixed(2)}
                                </span>
                              )}
                            </Label>
                          </div>
                        )),
                      )}
                    </div>
                  )}

                  {sizeOptions.length === 0 &&
                    doughOptions.length === 0 &&
                    crustOptions.length === 0 &&
                    addonOptions.length === 0 && (
                      <p className="text-center text-muted-foreground py-8">
                        Nenhuma opção adicional disponível
                      </p>
                    )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="border-t p-6 space-y-4">
          {/* Mostrar total na tela de sabores */}
          {step === "flavors" && selectedFlavors.length > 0 && (
            <div className="flex items-center justify-between text-lg font-bold">
              <span>Total</span>
              <span className="text-primary">R$ {totalPrice.toFixed(2)}</span>
            </div>
          )}

          {/* Mostrar quantidade apenas na tela de opções */}
          {step === "options" && (
            <div className="flex items-center justify-between">
              <Label>Quantidade</Label>
              <div className="flex items-center gap-2">
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setQuantity(Math.max(1, quantity - 1))}
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <span className="w-12 text-center font-semibold">{quantity}</span>
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => setQuantity(quantity + 1)}
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {step === "options" && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-lg font-bold">
                <span>Total</span>
                <span className="text-primary">R$ {totalPrice.toFixed(2)}</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Regra do meio a meio: a pizza sempre sai pela média dos sabores (metade de cada),
                nunca só pelo sabor mais caro, em linha com o Código de Defesa do Consumidor.
              </p>
            </div>
          )}

          <div className="flex flex-col gap-2 sm:flex-row">
            {step === "flavors" && pizzaSizes.length > 0 && (
              <Button
                variant="outline"
                onClick={() => setStep("size")}
                className="w-full sm:flex-1"
              >
                Voltar
              </Button>
            )}
            
            {step === "options" && (
              <Button
                variant="outline"
                onClick={() => setStep("flavors")}
                className="w-full sm:flex-1"
              >
                Voltar
              </Button>
            )}
            
            {step === "size" ? (
              <Button
                onClick={() => setStep("flavors")}
                className="w-full sm:flex-1"
                disabled={!selectedSize && pizzaSizes.length > 0}
              >
                Continuar
              </Button>
            ) : step === "flavors" ? (
              <Button
                onClick={() => {
                  if (selectedFlavors.length === 0) {
                    toast.error("Selecione pelo menos um sabor");
                    return;
                  }
                  if (selectedFlavors.length < currentMaxFlavors) {
                    toast.error(`Selecione ${currentMaxFlavors} sabores para montar a pizza`);
                    return;
                  }
                  if (enableCrust || enableAddons) {
                    setStep("options");
                  } else {
                    handleAddToCart();
                  }
                }}
                className="w-full sm:flex-1"
                disabled={selectedFlavors.length < maxFlavors}
              >
                {enableCrust || enableAddons ? "Continuar" : "Adicionar ao Carrinho"}
              </Button>
            ) : (
              <Button onClick={handleAddToCart} className="w-full sm:flex-1">
                Adicionar ao Carrinho
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
