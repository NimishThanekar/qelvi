import { useState, useEffect, useCallback, useRef } from "react";
import { X, Search, Plus, Minus, ChevronLeft, Trash2, Star, Sparkles, RotateCcw } from "lucide-react";
import Fuse from "fuse.js";
import { foodApi, logsApi, customFoodsApi, aiApi } from "../lib/api";
import type { FoodItem, MealType, ContextStat, AIEstimateItem, FrequentFood } from "../types";
import { MEAL_TYPES, MEAL_CONTEXTS, getCategoryImage } from "../types";
import { useAuthStore } from "../store/authStore";
import toast from "react-hot-toast";

interface Props {
  onClose: () => void;
  onLogged: () => void;
  defaultMealType?: MealType;
  defaultDate?: string;
}

type ServingType = "scoop" | "bowl" | "restaurant" | "piece" | "custom";
type ModalView = "search" | "my-foods" | "create" | "ai";
type CreateMode = "simple" | "combo";

interface ComboItem {
  food_id: string;
  food_name: string;
  calories: number;
  weight_g: number;
  quantity: number;
}

function ContextInsight({ stat }: { stat: ContextStat }) {
  const delta = stat.vs_home_delta;
  const isHome = stat.context === "home";

  // Primary line: always show home comparison when delta is meaningful
  let primary = "";
  if (!isHome && delta !== null && Math.abs(delta) >= 80) {
    const absPct = Math.round(Math.abs(delta) / (stat.avg_calories - delta || 1) * 100);
    primary = delta > 0
      ? `Your ${stat.context} meals average ${stat.avg_calories} kcal — ${absPct}% above home meals.`
      : `Your ${stat.context} meals average ${stat.avg_calories} kcal — ${absPct}% below home meals.`;
  } else {
    primary = `Avg ${stat.avg_calories} kcal here · on track ${100 - stat.over_goal_pct}% of days.`;
  }

  // Secondary line: over-goal rate
  const secondary = stat.over_goal_pct > 40
    ? `You exceed your goal ${stat.over_goal_pct}% of the time here.`
    : stat.over_goal_pct <= 15
    ? `You stay on track ${100 - stat.over_goal_pct}% of visits — great spot.`
    : null;

  const isRisky = delta !== null ? delta > 200 : stat.over_goal_pct > 50;
  const isWarning = !isRisky && stat.over_goal_pct > 40;
  const color = isRisky ? "#fb923c" : isWarning ? "#fbbf24" : "#34d399";
  const bg = isRisky ? "rgba(251,146,60,0.08)" : isWarning ? "rgba(251,191,36,0.08)" : "rgba(52,211,153,0.08)";
  const border = isRisky ? "rgba(251,146,60,0.2)" : isWarning ? "rgba(251,191,36,0.2)" : "rgba(52,211,153,0.2)";
  const icon = isRisky ? "⚠️" : isWarning ? "💡" : "✓";

  return (
    <div
      className="mt-2 rounded-lg px-2.5 py-2 text-xs leading-snug flex items-start gap-1.5"
      style={{ backgroundColor: bg, border: `1px solid ${border}`, color }}
    >
      <span className="flex-shrink-0 mt-px">{icon}</span>
      <span>
        {primary}
        {secondary && <span className="block mt-0.5 opacity-80">{secondary}</span>}
      </span>
    </div>
  );
}

export default function FoodSearchModal({
  onClose,
  onLogged,
  defaultMealType = "lunch",
  defaultDate,
}: Props) {
  const { user, refreshUser } = useAuthStore();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [customFoods, setCustomFoods] = useState<FoodItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [serving, setServing] = useState<ServingType>("bowl");
  const [quantity, setQuantity] = useState(1);
  const [customGrams, setCustomGrams] = useState(100);
  const [mealType, setMealType] = useState<MealType>(defaultMealType);
  const [context, setContext] = useState<string | null>(null);
  const [contextStatsMap, setContextStatsMap] = useState<Record<string, ContextStat>>({});
  const [recentFoods, setRecentFoods] = useState<FrequentFood[]>([]);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // AI state
  const [aiText, setAiText] = useState("");
  const [aiItems, setAiItems] = useState<AIEstimateItem[]>([]);
  const [aiConfidence, setAiConfidence] = useState<"high" | "medium" | "low">("medium");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiLogged, setAiLogged] = useState(false);

  // View: search | my-foods | create
  const [view, setView] = useState<ModalView>("search");

  // Create form state
  const [createMode, setCreateMode] = useState<CreateMode>("simple");
  const [createName, setCreateName] = useState("");
  const [createCalories, setCreateCalories] = useState<number | "">("");
  const [createServingG, setCreateServingG] = useState<number | "">(100);
  const [comboQuery, setComboQuery] = useState("");
  const [comboResults, setComboResults] = useState<FoodItem[]>([]);
  const [comboItems, setComboItems] = useState<ComboItem[]>([]);
  const [comboSearching, setComboSearching] = useState(false);
  const [creating, setCreating] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(defaultDate || today);

  useEffect(() => {
    foodApi.categories().then((r) => setCategories(r.data));
    searchFoods("", "", mealType);
    customFoodsApi.list().then((r) => setCustomFoods(r.data)).catch(() => {});
    logsApi.frequent().then((r) => setRecentFoods(r.data)).catch(() => {});
    logsApi.contextStats().then((r) => {
      const map: Record<string, ContextStat> = {};
      r.data.forEach((s: ContextStat) => { map[s.context] = s; });
      setContextStatsMap(map);
    }).catch(() => {});
  }, []);

  const searchFoods = useCallback(async (q: string, cat = "", mt = "") => {
    setSearching(true);
    try {
      const res = await foodApi.search({ q, category: cat, meal_type: mt, limit: 40 });
      setFoods(res.data);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    if (view !== "search") return;
    const t = setTimeout(() => searchFoods(query.trim(), category, mealType), 250);
    return () => clearTimeout(t);
  }, [query, category, mealType, view]);

  // Combo search debounce
  useEffect(() => {
    if (!comboQuery.trim()) { setComboResults([]); return; }
    const t = setTimeout(async () => {
      setComboSearching(true);
      try {
        const res = await foodApi.search({ q: comboQuery.trim(), limit: 20 });
        setComboResults(res.data);
      } finally {
        setComboSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [comboQuery]);

  const selectFood = (food: FoodItem) => {
    setSelected(food);
    const firstAvail = food.piece_g
      ? "piece"
      : food.bowl_g
      ? "bowl"
      : food.scoop_g
      ? "scoop"
      : food.restaurant_g
      ? "restaurant"
      : "custom";
    setServing(firstAvail);
    setQuantity(1);
  };

  const getCalories = () => {
    if (!selected) return 0;
    if (serving === "custom")
      return ((selected.kcal_per_100g * customGrams) / 100) * quantity;
    if (serving === "scoop") return (selected.kcal_per_scoop || 0) * quantity;
    if (serving === "bowl") return (selected.kcal_per_bowl || 0) * quantity;
    if (serving === "piece") return (selected.kcal_per_piece || 0) * quantity;
    if (serving === "restaurant")
      return (selected.kcal_per_restaurant_serving || 0) * quantity;
    return 0;
  };

  const getWeight = () => {
    if (!selected) return 0;
    if (serving === "custom") return customGrams * quantity;
    if (serving === "scoop") return (selected.scoop_g || 0) * quantity;
    if (serving === "bowl") return (selected.bowl_g || 0) * quantity;
    if (serving === "piece") return (selected.piece_g || 0) * quantity;
    if (serving === "restaurant")
      return (selected.restaurant_g || 0) * quantity;
    return 0;
  };

  const servingOptions: {
    value: ServingType;
    label: string;
    available: boolean;
    grams?: number;
    kcal?: number;
  }[] = selected
    ? [
        {
          value: "piece",
          label: "Piece",
          available: !!selected.piece_g,
          grams: selected.piece_g,
          kcal: selected.kcal_per_piece,
        },
        {
          value: "scoop",
          label: "Scoop",
          available: !!selected.scoop_g,
          grams: selected.scoop_g,
          kcal: selected.kcal_per_scoop,
        },
        {
          value: "bowl",
          label: selected.is_custom ? "Serving" : "Bowl",
          available: !!selected.bowl_g,
          grams: selected.bowl_g,
          kcal: selected.kcal_per_bowl,
        },
        {
          value: "restaurant",
          label: "Restaurant",
          available: !!selected.restaurant_g,
          grams: selected.restaurant_g,
          kcal: selected.kcal_per_restaurant_serving,
        },
        { value: "custom", label: "Custom (g)", available: !selected.is_custom },
      ]
    : [];

  const handleLog = async () => {
    if (!selected) return;
    setLoading(true);
    try {
      const cal = getCalories();
      const wt = getWeight();
      await logsApi.create({
        date,
        meal_type: mealType,
        context,
        entries: [
          {
            food_id: selected.id,
            food_name: selected.item,
            category: selected.category,
            cuisine: selected.cuisine,
            serving_type: serving,
            quantity,
            weight_g: wt,
            calories: cal,
          },
        ],
      });
      toast.success(`Logged ${selected.item} — ${Math.round(cal)} kcal`);
      onLogged();
      onClose();
    } catch {
      toast.error("Failed to log meal");
    } finally {
      setLoading(false);
    }
  };

  // ── Combo helpers ─────────────────────────────────────────────────
  const comboTotalCalories = comboItems.reduce((sum, i) => sum + i.calories * i.quantity, 0);

  const addComboItem = (food: FoodItem) => {
    const cal = food.kcal_per_bowl || food.kcal_per_scoop || food.kcal_per_piece || food.kcal_per_100g;
    const wt = food.bowl_g || food.scoop_g || food.piece_g || 100;
    setComboItems((prev) => {
      const existing = prev.find((i) => i.food_id === food.id);
      if (existing) {
        return prev.map((i) =>
          i.food_id === food.id ? { ...i, quantity: i.quantity + 1 } : i
        );
      }
      return [...prev, { food_id: food.id, food_name: food.item, calories: cal, weight_g: wt, quantity: 1 }];
    });
    setComboQuery("");
    setComboResults([]);
  };

  const removeComboItem = (food_id: string) =>
    setComboItems((prev) => prev.filter((i) => i.food_id !== food_id));

  const updateComboQty = (food_id: string, delta: number) =>
    setComboItems((prev) =>
      prev
        .map((i) => i.food_id === food_id ? { ...i, quantity: Math.max(0.5, i.quantity + delta) } : i)
    );

  // ── Create custom food ───────────────────────────────────────────
  const handleCreate = async () => {
    const name = createName.trim();
    if (!name) { toast.error("Enter a name"); return; }

    if (createMode === "simple") {
      if (!createCalories || Number(createCalories) <= 0) { toast.error("Enter calories"); return; }
    } else {
      if (comboItems.length === 0) { toast.error("Add at least one item"); return; }
    }

    setCreating(true);
    try {
      const calories = createMode === "simple"
        ? Number(createCalories)
        : Math.round(comboTotalCalories);

      const serving_size_g = createMode === "simple"
        ? Number(createServingG) || 100
        : comboItems.reduce((s, i) => s + i.weight_g * i.quantity, 0);

      const combo_items = createMode === "combo"
        ? comboItems.map((i) => ({ ...i, calories: i.calories * i.quantity, weight_g: i.weight_g * i.quantity }))
        : undefined;

      const res = await customFoodsApi.create({
        name,
        calories_per_serving: calories,
        serving_size_g,
        combo_items,
      });

      const newFood: FoodItem = res.data;
      setCustomFoods((prev) => [newFood, ...prev]);
      toast.success(`"${name}" saved to My Foods`);

      // Reset form
      setCreateName("");
      setCreateCalories("");
      setCreateServingG(100);
      setComboItems([]);
      setComboQuery("");

      // Auto-select the new food for immediate logging
      selectFood(newFood);
      setView("search");
    } catch {
      toast.error("Failed to create custom food");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteCustomFood = async (id: string, name: string) => {
    try {
      await customFoodsApi.delete(id);
      setCustomFoods((prev) => prev.filter((f) => f.id !== id));
      if (selected?.id === id) setSelected(null);
      toast.success(`"${name}" removed`);
    } catch {
      toast.error("Failed to delete");
    }
  };

  // ── AI estimate ──────────────────────────────────────────────────
  const handleAiEstimate = async () => {
    if (!aiText.trim()) { toast.error("Enter your meal first"); return; }
    setAiLoading(true);
    setAiItems([]);
    setAiLogged(false);
    try {
      const res = await aiApi.estimate(aiText.trim(), mealType);
      setAiItems(res.data.items);
      setAiConfidence(res.data.confidence);
      await refreshUser(); // update ai_uses_remaining in store
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (detail === "free_limit_reached") {
        toast.error("You've used all 10 free AI estimates. Upgrade to Pro for unlimited access.");
      } else if (err?.response?.status === 429) {
        toast.error(detail || "Daily AI limit reached. Try again tomorrow.");
      } else {
        toast.error(detail || "AI estimation failed. Please try again.");
      }
    } finally {
      setAiLoading(false);
    }
  };

  const updateAiItemQty = (idx: number, delta: number) => {
    setAiItems((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, quantity: Math.max(0.5, +(item.quantity + delta).toFixed(1)) } : item
      )
    );
  };

  const removeAiItem = (idx: number) => {
    setAiItems((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAiLog = async () => {
    if (aiItems.length === 0) return;
    setLoading(true);
    try {
      const entries = aiItems.map((item) => ({
        food_id: `ai_${item.name.toLowerCase().replace(/\s+/g, "_").slice(0, 20)}`,
        food_name: item.name,
        category: "AI Estimate",
        cuisine: "AI",
        serving_type: "custom" as const,
        quantity: item.quantity,
        weight_g: 100,
        calories: Math.round(item.quantity * item.estimated_calories),
      }));
      await logsApi.create({
        date,
        meal_type: mealType,
        context,
        source: "ai",
        entries,
      });
      const total = entries.reduce((s, e) => s + e.calories, 0);
      toast.success(`Logged ${aiItems.length} item${aiItems.length > 1 ? "s" : ""} — ${Math.round(total)} kcal`);
      setAiLogged(true);
      onLogged();
      onClose();
    } catch {
      toast.error("Failed to log meal");
    } finally {
      setLoading(false);
    }
  };

  const aiUsesRemaining = user?.ai_uses_remaining ?? 10;
  const isPro = user?.is_pro ?? false;
  const aiTotal = aiItems.reduce((s, item) => s + Math.round(item.quantity * item.estimated_calories), 0);

  // Merged results for "search" view: custom foods shown first, then DB results
  const matchingCustom = customFoods.filter((f) =>
    !query || f.item.toLowerCase().includes(query.toLowerCase())
  );
  const rawMerged = view === "search"
    ? [...matchingCustom, ...foods.filter((f) => !matchingCustom.some((c) => c.id === f.id))]
    : [];

  // Apply Fuse.js fuzzy re-ranking when there's an active query
  const mergedFoods = (() => {
    if (!query.trim() || rawMerged.length === 0) return rawMerged;
    const fuse = new Fuse(rawMerged, {
      keys: ["item", "category", "cuisine"],
      threshold: 0.45,
      distance: 100,
      includeScore: true,
    });
    return fuse.search(query.trim()).map((r) => r.item);
  })();

  // ── Left panel content ───────────────────────────────────────────
  const renderLeftPanel = () => {
    if (view === "create") {
      return (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* Create header */}
          <div className="p-4 border-b border-bg-elevated flex items-center gap-2">
            <button
              onClick={() => setView("search")}
              className="p-1.5 rounded-lg hover:bg-bg-elevated text-text-muted hover:text-text-primary transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
            <p className="text-sm font-semibold text-text-primary">Create Custom Food</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Name */}
            <div>
              <label className="label">Name</label>
              <input
                className="input text-sm"
                placeholder="e.g. Mom's Dal Tadka"
                value={createName}
                onChange={(e) => setCreateName(e.target.value)}
                autoFocus
              />
            </div>

            {/* Mode toggle */}
            <div>
              <label className="label">Type</label>
              <div className="flex gap-1.5">
                <button
                  onClick={() => setCreateMode("simple")}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                    createMode === "simple"
                      ? "bg-accent-primary/15 text-accent-primary border border-accent-primary/30"
                      : "bg-bg-elevated text-text-secondary border border-transparent hover:text-text-primary"
                  }`}
                >
                  Just calories
                </button>
                <button
                  onClick={() => setCreateMode("combo")}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                    createMode === "combo"
                      ? "bg-accent-primary/15 text-accent-primary border border-accent-primary/30"
                      : "bg-bg-elevated text-text-secondary border border-transparent hover:text-text-primary"
                  }`}
                >
                  Build from items
                </button>
              </div>
            </div>

            {createMode === "simple" ? (
              <>
                <div>
                  <label className="label">Calories per serving (kcal)</label>
                  <input
                    type="number"
                    className="input text-sm"
                    placeholder="e.g. 350"
                    value={createCalories}
                    onChange={(e) => setCreateCalories(e.target.value === "" ? "" : Number(e.target.value))}
                    min={1}
                  />
                </div>
                <div>
                  <label className="label">Serving size (g) — optional</label>
                  <input
                    type="number"
                    className="input text-sm"
                    placeholder="100"
                    value={createServingG}
                    onChange={(e) => setCreateServingG(e.target.value === "" ? "" : Number(e.target.value))}
                    min={1}
                  />
                </div>
              </>
            ) : (
              <>
                {/* Combo search */}
                <div>
                  <label className="label">Add items</label>
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
                    <input
                      className="input pl-8 text-sm"
                      placeholder="Search foods to add..."
                      value={comboQuery}
                      onChange={(e) => setComboQuery(e.target.value)}
                    />
                  </div>
                  {/* Combo search results */}
                  {comboQuery && (
                    <div className="mt-1.5 bg-bg-elevated border border-bg-border rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                      {comboSearching ? (
                        <p className="text-xs text-text-muted p-3 text-center">Searching…</p>
                      ) : comboResults.length === 0 ? (
                        <p className="text-xs text-text-muted p-3 text-center">No results</p>
                      ) : (
                        comboResults.map((food) => (
                          <button
                            key={food.id}
                            onClick={() => addComboItem(food)}
                            className="w-full flex items-center justify-between px-3 py-2 text-xs text-left hover:bg-bg-border transition-colors border-b border-bg-border last:border-0"
                          >
                            <span className="text-text-primary truncate flex-1">{food.item}</span>
                            <span className="text-text-muted ml-2 flex-shrink-0">
                              {food.kcal_per_bowl || food.kcal_per_100g} kcal
                            </span>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>

                {/* Combo list */}
                {comboItems.length > 0 && (
                  <div className="space-y-1.5">
                    {comboItems.map((item) => (
                      <div
                        key={item.food_id}
                        className="flex items-center gap-2 bg-bg-elevated rounded-lg px-3 py-2"
                      >
                        <span className="flex-1 text-xs text-text-primary truncate">{item.food_name}</span>
                        <span className="text-xs text-text-muted flex-shrink-0">
                          {Math.round(item.calories * item.quantity)} kcal
                        </span>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <button
                            onClick={() => updateComboQty(item.food_id, -0.5)}
                            className="w-5 h-5 rounded bg-bg-border flex items-center justify-center text-text-muted hover:text-text-primary"
                          >
                            <Minus size={10} />
                          </button>
                          <span className="w-6 text-center text-xs text-text-primary">{item.quantity}</span>
                          <button
                            onClick={() => updateComboQty(item.food_id, 0.5)}
                            className="w-5 h-5 rounded bg-bg-border flex items-center justify-center text-text-muted hover:text-text-primary"
                          >
                            <Plus size={10} />
                          </button>
                          <button
                            onClick={() => removeComboItem(item.food_id)}
                            className="w-5 h-5 rounded bg-bg-border flex items-center justify-center text-red-400/60 hover:text-red-400 ml-0.5"
                          >
                            <X size={10} />
                          </button>
                        </div>
                      </div>
                    ))}
                    <div className="flex justify-between px-1 pt-1">
                      <span className="text-xs text-text-muted">Total</span>
                      <span className="text-xs font-semibold text-accent-primary">
                        {Math.round(comboTotalCalories)} kcal
                      </span>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="px-4 pb-4 pt-2 border-t border-bg-elevated flex-shrink-0">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="btn-primary w-full flex items-center justify-center gap-2"
            >
              <Star size={14} />
              {creating ? "Saving…" : "Save to My Foods"}
            </button>
          </div>
        </div>
      );
    }

    if (view === "my-foods") {
      return (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="p-4 border-b border-bg-elevated flex items-center justify-between">
            <p className="text-xs font-medium text-text-muted uppercase tracking-wider">My Foods</p>
            <button
              onClick={() => setView("create")}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-accent-primary/10 text-accent-primary text-xs font-medium hover:bg-accent-primary/20 transition-colors border border-accent-primary/20"
            >
              <Plus size={12} />
              New
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 pb-3 pt-2">
            {customFoods.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
                <div className="text-3xl">⭐</div>
                <p className="text-xs text-text-muted">No custom foods yet</p>
                <button
                  onClick={() => setView("create")}
                  className="text-xs text-accent-primary hover:underline"
                >
                  Create your first one
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                {customFoods.map((food) => (
                  <div
                    key={food.id}
                    className={`flex items-center gap-2 p-2.5 rounded-xl transition-all ${
                      selected?.id === food.id
                        ? "bg-accent-primary/10 border border-accent-primary/20"
                        : "hover:bg-bg-elevated border border-transparent"
                    }`}
                  >
                    <button className="flex-1 flex items-center gap-2.5 text-left min-w-0" onClick={() => selectFood(food)}>
                      <div className="w-9 h-9 rounded-lg bg-accent-primary/10 border border-accent-primary/15 flex items-center justify-center flex-shrink-0 text-base">
                        ⭐
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm text-text-primary font-medium truncate">{food.item}</p>
                        <p className="text-xs text-text-muted">
                          {food.kcal_per_bowl} kcal · {food.bowl_g}g serving
                          {food.combo_items && food.combo_items.length > 0 && ` · ${food.combo_items.length} items`}
                        </p>
                      </div>
                    </button>
                    <button
                      onClick={() => handleDeleteCustomFood(food.id, food.item)}
                      className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-text-muted hover:text-red-400 hover:bg-red-400/8 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (view === "ai") {
      const canUseAI = isPro || aiUsesRemaining > 0;
      return (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* AI header */}
          <div className="p-4 border-b border-bg-elevated">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-semibold text-text-primary flex items-center gap-1.5">
                <Sparkles size={13} style={{ color: "#a78bfa" }} />
                AI Meal Estimate
              </p>
              {!isPro && (
                <span className="text-[10px] text-text-muted">
                  {aiUsesRemaining} free use{aiUsesRemaining !== 1 ? "s" : ""} left
                </span>
              )}
              {isPro && (
                <span className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                  style={{ backgroundColor: "#a78bfa18", color: "#a78bfa" }}>
                  Pro
                </span>
              )}
            </div>
            <textarea
              className="input text-sm w-full resize-none mt-2"
              rows={3}
              placeholder="2 roti, aloo gobi, 1 glass lassi…"
              value={aiText}
              onChange={(e) => { setAiText(e.target.value); setAiItems([]); }}
              disabled={!canUseAI || aiLoading}
              maxLength={500}
            />
            {!canUseAI ? (
              <p className="text-xs text-text-muted mt-2 text-center">
                You've used all 10 free estimates.{" "}
                <a href="/upgrade" className="text-[#a78bfa] hover:underline">Upgrade to Pro</a>{" "}
                for unlimited access.
              </p>
            ) : (
              <button
                onClick={handleAiEstimate}
                disabled={aiLoading || !aiText.trim()}
                className="mt-2 w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-all"
                style={{
                  backgroundColor: aiLoading || !aiText.trim() ? "var(--bg-elevated)" : "#a78bfa20",
                  color: aiLoading || !aiText.trim() ? "var(--text-muted)" : "#a78bfa",
                  border: "1px solid",
                  borderColor: aiLoading || !aiText.trim() ? "transparent" : "#a78bfa40",
                }}
              >
                <Sparkles size={13} />
                {aiLoading ? "Estimating…" : "✨ Estimate calories"}
              </button>
            )}
          </div>

          {/* Results */}
          <div className="flex-1 overflow-y-auto px-4 py-3">
            {aiLoading && (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-[#a78bfa] border-t-transparent animate-spin" />
                <p className="text-xs text-text-muted">Estimating your meal…</p>
              </div>
            )}

            {!aiLoading && aiItems.length === 0 && !aiLogged && (
              <div className="flex flex-col items-center justify-center py-10 text-center gap-2">
                <span className="text-3xl">✨</span>
                <p className="text-xs text-text-muted">
                  Type your meal in plain English or Hindi
                </p>
                <p className="text-[10px] text-text-muted opacity-70">
                  e.g. "2 roti dal chawal curd" or "lunch at office – pizza slice, coke"
                </p>
              </div>
            )}

            {!aiLoading && aiItems.length > 0 && (
              <div className="space-y-2">
                {/* Confidence badge */}
                <div className="flex items-center justify-between mb-1">
                  <p className="text-[10px] text-text-muted uppercase tracking-wider">Estimated items</p>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                    style={{
                      backgroundColor:
                        aiConfidence === "high" ? "#34d39918" :
                        aiConfidence === "medium" ? "#fbbf2418" : "#fb923c18",
                      color:
                        aiConfidence === "high" ? "#34d399" :
                        aiConfidence === "medium" ? "#fbbf24" : "#fb923c",
                    }}
                  >
                    {aiConfidence} confidence
                  </span>
                </div>

                {aiItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 bg-bg-elevated rounded-xl px-3 py-2.5"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary font-medium truncate">{item.name}</p>
                      <p className="text-[10px] text-text-muted">
                        {item.quantity} {item.unit} · {Math.round(item.quantity * item.estimated_calories)} kcal
                      </p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => updateAiItemQty(idx, -0.5)}
                        className="w-6 h-6 rounded-lg bg-bg-border flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
                      >
                        <Minus size={10} />
                      </button>
                      <span className="w-7 text-center text-xs font-medium text-text-primary">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => updateAiItemQty(idx, 0.5)}
                        className="w-6 h-6 rounded-lg bg-bg-border flex items-center justify-center text-text-muted hover:text-text-primary transition-colors"
                      >
                        <Plus size={10} />
                      </button>
                      <button
                        onClick={() => removeAiItem(idx)}
                        className="w-6 h-6 rounded-lg bg-bg-border flex items-center justify-center text-red-400/50 hover:text-red-400 transition-colors ml-0.5"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  </div>
                ))}

                {/* Total */}
                <div className="flex items-center justify-between px-1 pt-1 border-t border-bg-elevated mt-1">
                  <span className="text-xs text-text-muted">Total</span>
                  <span className="text-sm font-bold" style={{ color: "#a78bfa" }}>
                    {aiTotal} kcal
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Log button */}
          {aiItems.length > 0 && !aiLoading && (
            <div className="px-4 pb-4 pt-2 border-t border-bg-elevated flex-shrink-0">
              {/* Context picker */}
              <div className="flex flex-wrap gap-1 mb-3">
                {MEAL_CONTEXTS.map((ctx) => (
                  <button
                    key={ctx.value}
                    onClick={() => setContext(context === ctx.value ? null : ctx.value)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all ${
                      context === ctx.value
                        ? "bg-accent-primary/20 text-accent-primary border border-accent-primary/30"
                        : "bg-bg-elevated text-text-secondary hover:text-text-primary border border-transparent"
                    }`}
                  >
                    <span>{ctx.emoji}</span>
                    <span>{ctx.label}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={handleAiLog}
                disabled={loading || aiItems.length === 0}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{ backgroundColor: "#a78bfa", color: "#fff" }}
              >
                <Sparkles size={14} />
                {loading ? "Logging…" : `Log ${aiItems.length} item${aiItems.length > 1 ? "s" : ""}`}
              </button>
            </div>
          )}
        </div>
      );
    }

    // Default: search view
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Search inputs */}
        <div className="p-4 space-y-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              ref={searchInputRef}
              className="input pl-9 pr-9 text-sm"
              placeholder="Search foods..."
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (selected) setSelected(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && mergedFoods.length === 1) {
                  selectFood(mergedFoods[0]);
                }
              }}
              autoFocus
            />
          </div>
          <div className="flex gap-2">
            <select
              className="input text-sm flex-1"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <button
              onClick={() => setView("create")}
              title="Create custom food"
              className="flex-shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-xl bg-accent-primary/10 text-accent-primary text-xs font-medium hover:bg-accent-primary/20 transition-colors border border-accent-primary/20 whitespace-nowrap"
            >
              <Star size={13} />
              Custom
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto px-3 pb-3">
          {/* Recently logged section — shown only when query is empty */}
          {!query && !searching && recentFoods.length > 0 && (
            <div className="mb-3">
              <p className="text-[10px] font-medium text-text-muted uppercase tracking-wider px-1 py-2">
                Recently logged
              </p>
              <div className="space-y-0.5">
                {recentFoods.slice(0, 5).map((rf) => (
                  <div
                    key={rf.food_id}
                    className="flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-bg-elevated border border-transparent transition-all"
                  >
                    <div className="w-7 h-7 rounded-lg bg-bg-elevated border border-bg-border flex items-center justify-center flex-shrink-0">
                      <RotateCcw size={11} className="text-text-muted" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-text-primary font-medium truncate">{rf.food_name}</p>
                      <p className="text-xs text-text-muted">
                        {rf.serving_type} · {Math.round(rf.calories)} kcal
                      </p>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          await logsApi.create({
                            date,
                            meal_type: mealType,
                            context,
                            entries: [{
                              food_id: rf.food_id,
                              food_name: rf.food_name,
                              category: rf.category,
                              cuisine: rf.cuisine,
                              serving_type: rf.serving_type,
                              quantity: rf.quantity,
                              weight_g: rf.weight_g,
                              calories: rf.calories,
                            }],
                          });
                          toast.success(`Logged ${rf.food_name} — ${Math.round(rf.calories)} kcal`);
                          onLogged();
                          onClose();
                        } catch {
                          toast.error("Failed to log");
                        }
                      }}
                      className="flex-shrink-0 text-xs px-2.5 py-1 rounded-lg transition-all"
                      style={{ backgroundColor: "var(--accent-primary-15, rgba(59,123,255,0.12))", color: "var(--accent-primary, #3B7BFF)" }}
                    >
                      Log
                    </button>
                  </div>
                ))}
              </div>
              <div className="border-t border-bg-elevated mt-2 mb-2" />
            </div>
          )}

          {searching ? (
            <div className="flex items-center justify-center py-12 text-text-muted text-sm">
              Searching...
            </div>
          ) : mergedFoods.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-text-muted text-sm">
              No results
            </div>
          ) : (
            <div className="space-y-1">
              {mergedFoods.map((food) => (
                <button
                  key={food.id}
                  onClick={() => selectFood(food)}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all ${
                    selected?.id === food.id
                      ? "bg-accent-primary/10 border border-accent-primary/20"
                      : "hover:bg-bg-elevated border border-transparent"
                  }`}
                >
                  {food.is_custom ? (
                    <div className="w-10 h-10 rounded-lg bg-accent-primary/10 border border-accent-primary/15 flex items-center justify-center flex-shrink-0 text-lg">
                      ⭐
                    </div>
                  ) : (
                    <img
                      src={food.food_image_url || getCategoryImage(food.category)}
                      alt={food.item}
                      className="w-10 h-10 rounded-lg object-cover flex-shrink-0 opacity-80"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = getCategoryImage(food.category);
                      }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm text-text-primary font-medium truncate">{food.item}</p>
                      {food.is_custom && (
                        <span className="flex-shrink-0 text-[9px] font-semibold uppercase tracking-wide text-accent-primary bg-accent-primary/12 border border-accent-primary/20 px-1.5 py-0.5 rounded">
                          Mine
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-muted truncate">{food.category}</p>
                  </div>
                  <span className="text-xs text-text-secondary flex-shrink-0">
                    {food.is_custom
                      ? `${food.kcal_per_bowl} kcal`
                      : `${food.kcal_per_100g} /100g`}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-bg-card border border-bg-border rounded-t-3xl md:rounded-2xl w-full md:max-w-2xl max-h-[92vh] flex flex-col animate-scale-in shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-bg-elevated">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-text-primary">Log Food</h2>
            {/* Tab switcher */}
            <div className="flex gap-1 bg-bg-elevated rounded-lg p-0.5">
              <button
                onClick={() => setView("search")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  view === "search" || view === "create"
                    ? "bg-bg-card text-text-primary shadow-sm"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                All Foods
              </button>
              <button
                onClick={() => setView("my-foods")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${
                  view === "my-foods"
                    ? "bg-bg-card text-text-primary shadow-sm"
                    : "text-text-muted hover:text-text-secondary"
                }`}
              >
                My Foods
                {customFoods.length > 0 && (
                  <span className="w-4 h-4 rounded-full bg-accent-primary/20 text-accent-primary text-[9px] flex items-center justify-center font-semibold">
                    {customFoods.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => setView("ai")}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all flex items-center gap-1 ${
                  view === "ai"
                    ? "bg-bg-card shadow-sm"
                    : "text-text-muted hover:text-text-secondary"
                }`}
                style={view === "ai" ? { color: "#a78bfa" } : {}}
              >
                <Sparkles size={11} />
                AI
              </button>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-bg-elevated text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Meal type + date row */}
        <div className="px-5 py-2.5 flex flex-wrap items-center gap-2 border-b border-bg-elevated">
          {MEAL_TYPES.map((m) => (
            <button
              key={m.value}
              onClick={() => setMealType(m.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                mealType === m.value
                  ? "text-black"
                  : "bg-bg-elevated text-text-secondary hover:text-text-primary"
              }`}
              style={mealType === m.value ? { backgroundColor: m.color } : {}}
            >
              {m.emoji} {m.label}
            </button>
          ))}
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="ml-auto text-xs bg-bg-elevated border border-bg-border rounded-lg px-2.5 py-1.5 text-text-secondary focus:outline-none focus:border-accent-primary/40"
          />
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* Left panel — full width in AI mode */}
          <div className={`flex-col overflow-hidden border-r border-bg-elevated ${
            view === "ai"
              ? "flex flex-1"
              : selected ? "hidden md:flex flex-1" : "flex flex-1"
          }`}>
            {renderLeftPanel()}
          </div>

          {/* Right: serving config — hidden in AI mode */}
          <div className={`flex-shrink-0 flex flex-col overflow-hidden ${
            view === "ai" ? "hidden" : selected ? "flex w-full md:w-56" : "hidden md:flex md:w-56"
          }`}>
            {selected ? (
              <>
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                  <div>
                    <button
                      onClick={() => setSelected(null)}
                      className="md:hidden flex items-center gap-1 text-xs text-text-muted hover:text-text-primary mb-2 transition-colors"
                    >
                      ← Back to results
                    </button>
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-text-primary leading-snug">{selected.item}</p>
                        <p className="text-xs text-text-muted mt-0.5">
                          {selected.is_custom ? "My custom food" : selected.cuisine}
                        </p>
                      </div>
                      {selected.is_custom && (
                        <span className="flex-shrink-0 text-[9px] font-semibold uppercase tracking-wide text-accent-primary bg-accent-primary/12 border border-accent-primary/20 px-1.5 py-0.5 rounded mt-0.5">
                          Mine
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Combo breakdown (if any) */}
                  {selected.is_custom && selected.combo_items && selected.combo_items.length > 0 && (
                    <div className="bg-bg-elevated rounded-xl p-3 space-y-1.5">
                      <p className="text-[10px] font-medium text-text-muted uppercase tracking-wider mb-2">Contains</p>
                      {selected.combo_items.map((ci, idx) => (
                        <div key={idx} className="flex justify-between text-xs">
                          <span className="text-text-secondary truncate flex-1">{ci.food_name}</span>
                          <span className="text-text-muted ml-2">{Math.round(ci.calories)} kcal</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Serving type */}
                  <div>
                    <label className="label">Serving size</label>
                    <div className="space-y-1.5">
                      {servingOptions
                        .filter((s) => s.available)
                        .map((opt) => (
                          <button
                            key={opt.value}
                            onClick={() => setServing(opt.value)}
                            className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs transition-all ${
                              serving === opt.value
                                ? "bg-accent-primary/10 border border-accent-primary/30 text-accent-soft"
                                : "bg-bg-elevated border border-transparent text-text-secondary hover:text-text-primary"
                            }`}
                          >
                            <span>{opt.label}</span>
                            {opt.grams && <span className="text-text-muted">{opt.grams}g</span>}
                          </button>
                        ))}
                    </div>
                  </div>

                  {serving === "custom" && (
                    <div>
                      <label className="label">Grams</label>
                      <input
                        type="number"
                        className="input text-sm"
                        value={customGrams}
                        onChange={(e) => setCustomGrams(Number(e.target.value))}
                        min={1}
                      />
                    </div>
                  )}

                  {/* Quantity */}
                  <div>
                    <label className="label">Quantity</label>
                    <div className="flex gap-1.5 mb-2">
                      {[0.5, 1, 1.5, 2].map((mult) => (
                        <button
                          key={mult}
                          onClick={() => setQuantity(mult)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all ${
                            quantity === mult
                              ? "bg-accent-primary/20 text-accent-primary border border-accent-primary/30"
                              : "bg-bg-elevated text-text-secondary hover:text-text-primary border border-transparent"
                          }`}
                        >
                          {mult}x
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setQuantity(Math.max(0.5, quantity - 0.5))}
                        className="w-8 h-8 rounded-lg bg-bg-elevated hover:bg-bg-border flex items-center justify-center text-text-secondary transition-colors"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="flex-1 text-center text-sm font-medium text-text-primary">{quantity}</span>
                      <button
                        onClick={() => setQuantity(quantity + 0.5)}
                        className="w-8 h-8 rounded-lg bg-bg-elevated hover:bg-bg-border flex items-center justify-center text-text-secondary transition-colors"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>

                  {/* Context */}
                  <div>
                    <label className="label">Where are you eating?</label>
                    <div className="flex flex-wrap gap-1.5">
                      {MEAL_CONTEXTS.map((ctx) => (
                        <button
                          key={ctx.value}
                          onClick={() => setContext(context === ctx.value ? null : ctx.value)}
                          className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs transition-all ${
                            context === ctx.value
                              ? "bg-accent-primary/20 text-accent-primary border border-accent-primary/30"
                              : "bg-bg-elevated text-text-secondary hover:text-text-primary border border-transparent"
                          }`}
                        >
                          <span>{ctx.emoji}</span>
                          <span>{ctx.label}</span>
                        </button>
                      ))}
                    </div>
                    {context && contextStatsMap[context] && contextStatsMap[context].count >= 3 && (
                      <ContextInsight stat={contextStatsMap[context]} />
                    )}
                  </div>

                  {/* Calorie preview */}
                  <div className="bg-bg-elevated rounded-xl p-3">
                    <div className="flex justify-between text-xs text-text-muted mb-1">
                      <span>Calories</span>
                      <span>{getWeight()}g total</span>
                    </div>
                    <p className="text-2xl font-bold text-accent-primary">{Math.round(getCalories())}</p>
                    <p className="text-xs text-text-muted">kcal</p>
                  </div>
                </div>

                <div className="px-4 pb-4 pt-2 border-t border-bg-elevated flex-shrink-0">
                  <button
                    onClick={handleLog}
                    disabled={loading || getCalories() === 0}
                    className="btn-primary w-full flex items-center justify-center gap-2"
                  >
                    <Plus size={15} />
                    {loading ? "Logging..." : "Add to log"}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center">
                <div>
                  <div className="text-3xl mb-2">🍽️</div>
                  <p className="text-xs text-text-muted">Select a food to configure serving size</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
