import { useState, useEffect, useCallback } from "react";
import { X, Search, Plus, Minus } from "lucide-react";
import { foodApi, logsApi } from "../lib/api";
import type { FoodItem, MealType } from "../types";
import { MEAL_TYPES, getCategoryImage } from "../types";
import toast from "react-hot-toast";

interface Props {
  onClose: () => void;
  onLogged: () => void;
  defaultMealType?: MealType;
  defaultDate?: string;
}

type ServingType = "scoop" | "bowl" | "restaurant" | "custom";

export default function FoodSearchModal({
  onClose,
  onLogged,
  defaultMealType = "lunch",
  defaultDate,
}: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [foods, setFoods] = useState<FoodItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selected, setSelected] = useState<FoodItem | null>(null);
  const [serving, setServing] = useState<ServingType>("bowl");
  const [quantity, setQuantity] = useState(1);
  const [customGrams, setCustomGrams] = useState(100);
  const [mealType, setMealType] = useState<MealType>(defaultMealType);
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(defaultDate || today);

  useEffect(() => {
    foodApi.categories().then((r) => setCategories(r.data));
    searchFoods("");
  }, []);

  const searchFoods = useCallback(async (q: string, cat = "") => {
    setSearching(true);
    try {
      const res = await foodApi.search({ q, category: cat, limit: 40 });
      setFoods(res.data);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    const t = setTimeout(() => searchFoods(query, category), 250);
    return () => clearTimeout(t);
  }, [query, category]);

  const getCalories = () => {
    if (!selected) return 0;
    if (serving === "custom")
      return ((selected.kcal_per_100g * customGrams) / 100) * quantity;
    if (serving === "scoop") return (selected.kcal_per_scoop || 0) * quantity;
    if (serving === "bowl") return (selected.kcal_per_bowl || 0) * quantity;
    if (serving === "restaurant")
      return (selected.kcal_per_restaurant_serving || 0) * quantity;
    return 0;
  };

  const getWeight = () => {
    if (!selected) return 0;
    if (serving === "custom") return customGrams * quantity;
    if (serving === "scoop") return (selected.scoop_g || 0) * quantity;
    if (serving === "bowl") return (selected.bowl_g || 0) * quantity;
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
          value: "scoop",
          label: "Scoop",
          available: !!selected.scoop_g,
          grams: selected.scoop_g,
          kcal: selected.kcal_per_scoop,
        },
        {
          value: "bowl",
          label: "Bowl",
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
        { value: "custom", label: "Custom (g)", available: true },
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

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-4">
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative bg-bg-card border border-bg-border rounded-t-3xl md:rounded-2xl w-full md:max-w-2xl max-h-[92vh] flex flex-col animate-scale-in shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-bg-elevated">
          <h2 className="text-base font-semibold text-text-primary">Log Food</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-bg-elevated text-text-muted hover:text-text-primary transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Meal type + date row */}
        <div className="px-5 py-3 flex gap-3 border-b border-bg-elevated overflow-x-auto">
          {MEAL_TYPES.map((m) => (
            <button
              key={m.value}
              onClick={() => setMealType(m.value)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                mealType === m.value
                  ? "text-black font-semibold"
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
          {/* Left: search list */}
          <div className="flex flex-col flex-1 overflow-hidden border-r border-bg-elevated">
            {/* Search */}
            <div className="p-4 space-y-2">
              <div className="relative">
                <Search
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                />
                <input
                  className="input pl-9 text-sm"
                  placeholder="Search foods..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoFocus
                />
              </div>
              <select
                className="input text-sm"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            {/* Results */}
            <div className="flex-1 overflow-y-auto px-3 pb-3">
              {searching ? (
                <div className="flex items-center justify-center py-12 text-text-muted text-sm">
                  Searching...
                </div>
              ) : foods.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-text-muted text-sm">
                  No results
                </div>
              ) : (
                <div className="space-y-1">
                  {foods.map((food) => (
                    <button
                      key={food.id}
                      onClick={() => {
                        setSelected(food);
                        const firstAvail = food.bowl_g
                          ? "bowl"
                          : food.scoop_g
                          ? "scoop"
                          : food.restaurant_g
                          ? "restaurant"
                          : "custom";
                        setServing(firstAvail);
                        setQuantity(1);
                      }}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all ${
                        selected?.id === food.id
                          ? "bg-accent-primary/10 border border-accent-primary/20"
                          : "hover:bg-bg-elevated border border-transparent"
                      }`}
                    >
                      <img
                        src={getCategoryImage(food.category)}
                        alt={food.item}
                        className="w-10 h-10 rounded-lg object-cover flex-shrink-0 opacity-80"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=80&q=70";
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-text-primary font-medium truncate">
                          {food.item}
                        </p>
                        <p className="text-xs text-text-muted truncate">
                          {food.category}
                        </p>
                      </div>
                      <span className="text-xs text-text-secondary flex-shrink-0">
                        {food.kcal_per_100g} /100g
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right: serving config */}
          <div className="w-56 flex-shrink-0 flex flex-col p-4 gap-4">
            {selected ? (
              <>
                <div>
                  <p className="text-sm font-semibold text-text-primary leading-snug">
                    {selected.item}
                  </p>
                  <p className="text-xs text-text-muted mt-0.5">
                    {selected.cuisine}
                  </p>
                </div>

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
                          {opt.grams && (
                            <span className="text-text-muted">{opt.grams}g</span>
                          )}
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
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setQuantity(Math.max(0.5, quantity - 0.5))}
                      className="w-8 h-8 rounded-lg bg-bg-elevated hover:bg-bg-border flex items-center justify-center text-text-secondary transition-colors"
                    >
                      <Minus size={14} />
                    </button>
                    <span className="flex-1 text-center text-sm font-medium text-text-primary">
                      {quantity}
                    </span>
                    <button
                      onClick={() => setQuantity(quantity + 0.5)}
                      className="w-8 h-8 rounded-lg bg-bg-elevated hover:bg-bg-border flex items-center justify-center text-text-secondary transition-colors"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>

                {/* Calorie preview */}
                <div className="mt-auto bg-bg-elevated rounded-xl p-3">
                  <div className="flex justify-between text-xs text-text-muted mb-1">
                    <span>Calories</span>
                    <span>{getWeight()}g total</span>
                  </div>
                  <p className="text-2xl font-bold text-accent-primary">
                    {Math.round(getCalories())}
                  </p>
                  <p className="text-xs text-text-muted">kcal</p>
                </div>

                <button
                  onClick={handleLog}
                  disabled={loading || getCalories() === 0}
                  className="btn-primary w-full flex items-center justify-center gap-2"
                >
                  <Plus size={15} />
                  {loading ? "Logging..." : "Add to log"}
                </button>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center text-center">
                <div>
                  <div className="text-3xl mb-2">🍽️</div>
                  <p className="text-xs text-text-muted">
                    Select a food to configure serving size
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
