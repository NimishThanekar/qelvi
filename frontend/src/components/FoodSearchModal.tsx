import { useState, useEffect, useCallback } from "react";
import { X, Search, Plus, Minus } from "lucide-react";
import { foodApi, logsApi } from "../lib/api";
import type { FoodItem, MealType, ContextStat } from "../types";
import { MEAL_TYPES, MEAL_CONTEXTS, getCategoryImage } from "../types";
import toast from "react-hot-toast";

interface Props {
  onClose: () => void;
  onLogged: () => void;
  defaultMealType?: MealType;
  defaultDate?: string;
}

type ServingType = "scoop" | "bowl" | "restaurant" | "piece" | "custom";

function ContextInsight({ stat }: { stat: ContextStat }) {
  const isRisky = stat.vs_home_delta !== null ? stat.vs_home_delta > 200 : stat.over_goal_pct > 50;
  const isWarning = !isRisky && stat.over_goal_pct > 40;

  let message = "";
  if (stat.vs_home_delta !== null && stat.vs_home_delta > 200) {
    message = `You average +${stat.vs_home_delta} kcal here vs home — pace yourself.`;
  } else if (stat.over_goal_pct > 50) {
    message = `You exceed your goal ${stat.over_goal_pct}% of the time here.`;
  } else if (stat.over_goal_pct <= 20) {
    message = `You stay on track ${100 - stat.over_goal_pct}% of the time here — great spot.`;
  } else if (stat.vs_home_delta !== null && stat.vs_home_delta < -100) {
    message = `You eat lighter here — ${Math.abs(stat.vs_home_delta)} kcal below your home average.`;
  } else {
    message = `Avg ${stat.avg_calories} kcal here · on track ${100 - stat.over_goal_pct}% of days.`;
  }

  const color = isRisky ? "#fb923c" : isWarning ? "#fbbf24" : "#34d399";
  const bg = isRisky ? "rgba(251,146,60,0.08)" : isWarning ? "rgba(251,191,36,0.08)" : "rgba(52,211,153,0.08)";
  const border = isRisky ? "rgba(251,146,60,0.2)" : isWarning ? "rgba(251,191,36,0.2)" : "rgba(52,211,153,0.2)";
  const icon = isRisky ? "⚠️" : isWarning ? "💡" : "✓";

  return (
    <div
      className="mt-2 rounded-lg px-2.5 py-2 text-xs leading-snug flex items-start gap-1.5"
      style={{ backgroundColor: bg, border: `1px solid ${border}`, color }}
    >
      <span className="flex-shrink-0">{icon}</span>
      <span>{message}</span>
    </div>
  );
}

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
  const [context, setContext] = useState<string | null>(null);
  const [contextStatsMap, setContextStatsMap] = useState<Record<string, ContextStat>>({});
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const [date, setDate] = useState(defaultDate || today);

  useEffect(() => {
    foodApi.categories().then((r) => setCategories(r.data));
    searchFoods("", "", mealType);
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
    const t = setTimeout(() => searchFoods(query, category, mealType), 250);
    return () => clearTimeout(t);
  }, [query, category, mealType]);

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
          {/* Left: search list — hidden on mobile when a food is selected */}
          <div className={`flex-col flex-1 overflow-hidden border-r border-bg-elevated ${selected ? "hidden md:flex" : "flex"}`}>
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
                      }}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl text-left transition-all ${
                        selected?.id === food.id
                          ? "bg-accent-primary/10 border border-accent-primary/20"
                          : "hover:bg-bg-elevated border border-transparent"
                      }`}
                    >
                      <img
                        src={food.food_image_url || getCategoryImage(food.category)}
                        alt={food.item}
                        className="w-10 h-10 rounded-lg object-cover flex-shrink-0 opacity-80"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            getCategoryImage(food.category);
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

          {/* Right: serving config — full width on mobile when selected */}
          <div className={`flex-shrink-0 flex flex-col p-4 gap-4 ${selected ? "flex w-full md:w-56" : "hidden md:flex md:w-56"}`}>
            {selected ? (
              <>
                <div>
                  <button
                    onClick={() => setSelected(null)}
                    className="md:hidden flex items-center gap-1 text-xs text-text-muted hover:text-text-primary mb-2 transition-colors"
                  >
                    ← Back to results
                  </button>
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
                  {/* Live context intelligence warning */}
                  {context && contextStatsMap[context] && contextStatsMap[context].count >= 3 && (
                    <ContextInsight stat={contextStatsMap[context]} />
                  )}
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
