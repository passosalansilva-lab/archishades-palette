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

  // Load pizza sizes when modal opens
  useEffect(() => {
    if (open && pizzaProducts.length > 0) {
      loadPizzaSizes();
    }
  }, [open, pizzaProducts]);

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
    }
  }, [open]);

  const loadPizzaSizes = async () => {
    try {
      setLoadingSizes(true);
      
      // Get category from first pizza product
      const categoryId = pizzaProducts[0]?.category_id;
      if (!categoryId) {
        setLoadingSizes(false);
        // Skip size selection if no category
        setStep("flavors");
        return;
      }

      const { data: sizes, error } = await supabase
        .from("pizza_category_sizes")
        .select("id, name, base_price, max_flavors, slices")
        .eq("category_id", categoryId)
        .order("sort_order");

      if (error) throw error;

      if (sizes && sizes.length > 0) {
        setPizzaSizes(sizes);
        // Auto-select first size
        setSelectedSize(sizes[0]);
      } else {
        // No sizes configured, skip to flavors
        setStep("flavors");
      }
    } catch (error) {
      console.error("Error loading pizza sizes:", error);
      setStep("flavors");
    } finally {
      setLoadingSizes(false);
    }
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

      const doughGroups = [
        ...doughGroupsFromPizza,
        ...doughGroupsFromNames,
      ];

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
      
      const addons = mergedGroups.filter((g) => {
        const name = normalize(g.name);
        return (
          name.includes("adiciona") ||
          name.includes("extra") ||
          name.includes("complemento")
        );
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
    // Calculate base price based on pricing rule
    let basePrice = 0;
    
    if (selectedFlavors.length > 0) {
      const prices = selectedFlavors.map(f => f.price);
      
      switch (pricingRule) {
        case 'highest':
          // Use the highest price among selected flavors
          basePrice = Math.max(...prices);
          break;
        case 'sum':
          // Sum proportionally (divide by number of flavors)
          basePrice = prices.reduce((sum, p) => sum + p, 0) / selectedFlavors.length;
          break;
        case 'average':
        default:
          // Average of all selected flavors
          basePrice = prices.reduce((sum, p) => sum + p, 0) / selectedFlavors.length;
          break;
      }
    }

    // Add size price modifier if selected
    if (selectedSize) {
      // Size price is the base, flavor prices are modifiers on top
      // For half-half, we use size as base and add flavor difference
      const avgFlavorPrice = selectedFlavors.length > 0 
        ? selectedFlavors.reduce((sum, f) => sum + f.price, 0) / selectedFlavors.length 
        : 0;
      
      // If size has a base price, use it; otherwise use flavor-based calculation
      if (selectedSize.base_price > 0) {
        basePrice = selectedSize.base_price;
      }
    }

    // Add options price (crust, addons, etc.)
    const optionsPrice = selectedOptions.reduce((sum, opt) => {
      return sum + opt.price_modifier;
    }, 0);

    // Apply discount if configured
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

    const halfHalfFlavorProductIds = selectedFlavors.map((f) => f.id);

    addItem({
      productId: selectedFlavors[0].id,
      productName: `Pizza Meio a Meio (${selectedFlavors.length} sabores)` ,
      price: unitPrice,
      quantity: quantity,
      imageUrl: selectedFlavors[0].image_url || undefined,
      notes: `Sabores: ${flavorsText}`,
      options: [
        {
          name: "Meio a meio",
          priceModifier: 0,
          // Metadados para estoque: ids dos produtos de cada sabor
          halfHalfFlavorProductIds,
        } as any,
        ...selectedFlavors.map((f, idx) => ({
          name: `Sabor ${idx + 1}: ${f.name}`,
          priceModifier: 0,
        })),
        ...selectedOptions.map((opt) => ({
          name: `${opt.group_name}: ${opt.option_name}`,
          priceModifier: opt.price_modifier,
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
                          <p className="font-semibold">{size.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {size.slices} fatias • Até {size.max_flavors} sabores
                          </p>
                        </div>
                        <span className="text-lg font-bold text-primary">
                          R$ {size.base_price.toFixed(2)}
                        </span>
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
                        R$ {Number(product.price).toFixed(2)}
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
                      <h3 className="font-semibold mb-3">Borda</h3>
                      <RadioGroup
                        onValueChange={(value) => {
                          const [groupId, optionId] = value.split("::");
                          const group = crustOptions.find((g) => g.id === groupId);
                          const option = group?.options?.find((o) => o.id === optionId);
                          if (group && option) {
                            handleCrustChange(
                              group.id,
                              group.name,
                              option.id,
                              option.name,
                              option.price_modifier,
                            );
                          }
                        }}
                      >
                        {crustOptions.map((group) =>
                          group.options?.map((option) => (
                            <div key={option.id} className="flex items-center space-x-2 py-2">
                              <RadioGroupItem value={`${group.id}::${option.id}`} id={option.id} />
                              <Label htmlFor={option.id} className="flex-1 cursor-pointer">
                                {option.name}
                                {allowCrustExtraPrice && option.price_modifier > 0 && (
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
