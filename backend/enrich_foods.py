"""
enrich_foods.py — Enrich MongoDB food items with macronutrient data.

Data sources (in priority order):
  1. NUTRITION_DB  — NIN/IFCT 2017 for Indian foods, USDA for international
  2. USDA FoodData Central API (fdc.nal.usda.gov) — free, no key required
  3. CATEGORY_DEFAULTS — per-category fallback

New fields added to each document:
  protein_g, carbs_g, fat_g, fiber_g, sugar_g, saturated_fat_g  (per 100g/ml)
  food_type      : "solid" | "liquid"
  serving_unit   : "g"     | "ml"
  scoop_label    : e.g. "scoop" | "cup" | "small bowl"
  bowl_label     : e.g. "bowl"  | "glass"| "bowl"

Usage:
  python enrich_foods.py               # enrich all items
  python enrich_foods.py --dry-run     # preview without writing to DB
  python enrich_foods.py --skip-usda   # offline — use only NUTRITION_DB + defaults
  python enrich_foods.py --force       # re-enrich items that already have macros
"""

import asyncio
import argparse
import os
import re
import time
import httpx
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

load_dotenv()

USDA_SEARCH = "https://api.nal.usda.gov/fdc/v1/foods/search"
USDA_API_KEY = os.getenv("USDA_API_KEY", "DEMO_KEY")   # DEMO_KEY = 1000 req/hr free

# ── Helpers ────────────────────────────────────────────────────────────────────

def _n(p, c, f, fb, s, sf):
    return {
        "protein_g":       round(p,  1),
        "carbs_g":         round(c,  1),
        "fat_g":           round(f,  1),
        "fiber_g":         round(fb, 1),
        "sugar_g":         round(s,  1),
        "saturated_fat_g": round(sf, 1),
    }

def _norm(name: str) -> str:
    """Lowercase, collapse whitespace, strip punctuation for matching."""
    n = name.lower()
    n = re.sub(r"[^a-z0-9\s]", " ", n)
    return re.sub(r"\s+", " ", n).strip()


# ── Liquid detection ───────────────────────────────────────────────────────────

LIQUID_CATEGORIES = {"Drink", "Alcoholic drink", "Soup"}

_LIQUID_KEYWORDS = [
    "milk", "lassi", "chaas", "buttermilk", "juice", "shake", "smoothie",
    "coffee", "tea", "chai", "latte", "cappuccino", "frappe", "cold brew",
    "sharbat", "nimbu pani", "falooda", "thandai", "jal jeera",
    "badam milk", "haldi doodh", "choco milk", "flavoured milk",
    "coconut water", "sugarcane juice", "aam panna", "kokum",
    "rose faluda", "badam falooda", "kesar lassi",
]

_LIQUID_DAIRY_ITEMS = {
    _norm(x) for x in [
        "Whole milk (full fat)", "Toned milk (2%)", "Skimmed milk", "Buffalo milk",
        "Soy milk (unsweetened)", "Almond milk (unsweetened)", "Oat milk",
        "Buttermilk (chaas, plain)", "Masala chaas", "Lassi (sweet)", "Lassi (salted)",
        "Mango lassi", "Rose lassi", "Kesar lassi (thick)", "Badam milk",
        "Haldi doodh (golden milk)", "Choco milk", "Flavoured milk (strawberry)",
        "Coconut milk (from tin)",
    ]
}

def is_liquid(item_name: str, category: str) -> bool:
    if category in LIQUID_CATEGORIES:
        return True
    n = _norm(item_name)
    if n in _LIQUID_DAIRY_ITEMS:
        return True
    return any(kw in n for kw in _LIQUID_KEYWORDS)


# ── Serving labels ─────────────────────────────────────────────────────────────

def _liquid_label(volume_ml: float, category: str, size: str) -> str:
    """Return a human-friendly label for a liquid serving size."""
    if category == "Soup":
        return "small bowl" if size == "small" else "bowl"
    if category == "Alcoholic drink":
        if volume_ml <= 45:
            return "peg" if size == "small" else "large peg"
        if volume_ml <= 200:
            return "glass"
        return "bottle/can"
    # generic drink
    if size == "small":
        if volume_ml <= 50:   return "shot"
        if volume_ml <= 100:  return "small cup"
        if volume_ml <= 175:  return "cup"
        return "glass"
    else:
        if volume_ml <= 200:  return "glass"
        if volume_ml <= 350:  return "large glass"
        return "bottle"

def get_serving_labels(item_name: str, category: str,
                       scoop_g: float, bowl_g: float) -> tuple[str, str]:
    """Return (scoop_label, bowl_label) for display in the UI."""
    if is_liquid(item_name, category):
        return (
            _liquid_label(scoop_g or 150, category, "small"),
            _liquid_label(bowl_g  or 300, category, "large"),
        )
    return ("scoop", "bowl")


# ── Nutrition database ─────────────────────────────────────────────────────────
# All values per 100 g (solid) or 100 ml (liquid) as served / ready-to-eat.
# Sources: NIN/IFCT 2017 (Indian), USDA FoodData Central (international).

NUTRITION_DB: dict[str, dict] = {
    # ════════════════════════════════════════════════════════════════════
    # BREAD / ROTI / FLATBREADS  — NIN/IFCT 2017
    # ════════════════════════════════════════════════════════════════════
    "chapati":                          _n( 8.5, 58.2,  1.8, 2.9, 0.3, 0.3),
    "whole wheat chapati":              _n( 8.8, 57.5,  1.8, 3.2, 0.3, 0.3),
    "multigrain roti":                  _n( 9.2, 54.0,  2.2, 4.5, 0.4, 0.4),
    "bajra roti":                       _n(10.5, 56.8,  4.2, 3.8, 0.5, 0.7),
    "jowar roti":                       _n( 9.8, 55.2,  1.8, 3.5, 0.4, 0.3),
    "makki ki roti":                    _n( 9.2, 53.8,  2.5, 3.2, 0.6, 0.4),
    "besan roti":                       _n(14.2, 50.5,  4.8, 5.8, 1.2, 0.7),
    "ragi roti":                        _n( 7.2, 54.5,  1.5, 4.5, 0.5, 0.3),
    "akki roti":                        _n( 8.5, 58.2,  2.8, 1.2, 0.3, 0.5),
    "thalipeeth":                       _n( 9.8, 52.5,  3.5, 4.2, 0.5, 0.5),
    "missi roti":                       _n(12.5, 52.5,  5.5, 5.2, 0.8, 0.8),
    "tandoori roti":                    _n( 9.5, 56.8,  2.5, 2.5, 0.4, 0.4),
    "roomali roti":                     _n( 9.2, 58.5,  2.2, 1.8, 0.5, 0.3),
    "phulka":                           _n( 8.5, 58.2,  1.5, 2.9, 0.3, 0.2),
    "plain paratha":                    _n( 7.0, 49.0, 13.0, 2.0, 0.5, 3.5),
    "aloo paratha":                     _n( 5.5, 40.2,  8.5, 2.1, 0.6, 2.1),
    "gobi paratha":                     _n( 5.8, 38.5,  8.5, 2.5, 1.2, 2.0),
    "mooli paratha":                    _n( 5.5, 38.2,  8.2, 2.8, 1.0, 1.9),
    "onion paratha":                    _n( 5.8, 40.5,  9.0, 2.2, 1.5, 2.2),
    "methi paratha":                    _n( 7.0, 42.5,  9.5, 3.2, 0.5, 2.4),
    "paneer paratha":                   _n( 9.5, 40.5, 12.5, 2.0, 0.8, 5.5),
    "egg paratha":                      _n( 9.2, 40.0, 11.5, 1.8, 0.5, 2.8),
    "palak paratha":                    _n( 7.5, 42.0,  9.0, 3.5, 0.8, 2.2),
    "lachha paratha":                   _n( 7.5, 50.2, 18.5, 2.0, 0.8, 4.5),
    "malabar parotta":                  _n( 7.2, 49.5, 17.5, 1.5, 0.8, 4.2),
    "coin parotta":                     _n( 7.0, 50.5, 18.5, 1.5, 0.8, 4.5),
    "puri":                             _n( 7.0, 47.5, 19.5, 1.5, 0.4, 2.5),
    "bhatura":                          _n( 8.5, 45.5, 14.5, 1.2, 0.8, 1.8),
    "naan":                             _n( 9.8, 49.5,  4.2, 1.8, 1.2, 1.5),
    "garlic naan":                      _n( 9.5, 50.5,  5.8, 1.8, 1.5, 1.8),
    "butter naan":                      _n( 9.2, 49.5,  7.5, 1.8, 1.5, 3.5),
    "stuffed naan":                     _n( 9.0, 48.5,  8.5, 2.0, 1.5, 2.5),
    "kulcha":                           _n( 9.5, 50.2,  4.5, 1.8, 1.5, 1.2),
    "amritsari kulcha":                 _n( 8.5, 48.5,  6.5, 2.2, 1.5, 1.5),
    "peshwari naan":                    _n( 8.5, 52.5,  9.5, 2.0, 8.5, 2.5),
    "kachori":                          _n( 8.0, 50.2, 22.5, 3.5, 0.5, 3.0),
    "dal kachori":                      _n( 9.5, 48.5, 24.5, 4.5, 0.5, 3.5),
    "matar kachori":                    _n( 8.5, 50.5, 22.5, 4.0, 0.8, 3.2),
    "bedmi puri":                       _n( 9.5, 48.0, 19.5, 3.5, 0.5, 2.8),
    "sheermal":                         _n( 9.0, 53.5,  9.5, 1.5, 8.5, 2.8),
    "bakarkhani":                       _n( 9.2, 55.5, 11.5, 1.5, 5.5, 3.2),
    "thepla":                           _n( 8.5, 55.5, 12.5, 3.8, 0.8, 1.8),
    "methi thepla":                     _n( 9.0, 55.8, 13.5, 4.2, 0.8, 1.9),
    "bhakri":                           _n( 9.8, 55.8,  2.2, 3.5, 0.5, 0.3),
    "puran poli":                       _n( 7.5, 57.5,  7.5, 2.5,15.0, 3.5),
    "obbattu holige":                   _n( 7.2, 58.5,  7.8, 2.8,16.5, 3.8),
    "pathiri":                          _n( 4.5, 52.5,  0.5, 0.8, 0.2, 0.1),
    "sourdough bread":                  _n( 8.8, 48.3,  1.5, 2.4, 2.1, 0.3),
    "whole wheat bread":                _n( 9.0, 43.5,  2.0, 4.8, 5.1, 0.4),
    "white bread":                      _n( 8.0, 49.5,  2.5, 1.5, 4.2, 0.6),
    "brown bread":                      _n( 8.5, 45.5,  2.2, 3.5, 4.8, 0.4),
    "multigrain bread":                 _n( 9.2, 42.0,  2.8, 5.5, 4.0, 0.5),
    "pita bread":                       _n( 9.5, 55.8,  1.2, 2.2, 0.8, 0.2),
    "focaccia":                         _n( 7.5, 48.5,  7.5, 2.0, 0.8, 1.0),
    "ciabatta":                         _n( 8.2, 52.5,  2.8, 2.0, 0.5, 0.4),
    "garlic bread":                     _n( 7.8, 52.5, 14.5, 1.5, 1.2, 5.5),
    "brioche":                          _n( 9.5, 48.5, 15.5, 1.2,12.5, 5.2),
    "croissant":                        _n( 8.2, 45.8, 20.5, 1.5, 5.5,11.5),
    "dinner roll":                      _n( 8.5, 50.5,  5.5, 1.8, 4.5, 1.5),
    "corn tortilla":                    _n( 5.8, 45.5,  2.5, 4.5, 0.5, 0.3),
    "flour tortilla":                   _n( 8.5, 56.0,  7.5, 2.5, 2.5, 1.8),
    "lavash":                           _n( 9.0, 58.5,  2.5, 2.5, 1.5, 0.5),
    "injera":                           _n( 5.5, 38.5,  0.8, 2.8, 0.5, 0.2),
    "dhal puri":                        _n( 7.5, 45.5,  8.0, 2.5, 0.5, 1.5),
    "rava puri":                        _n( 7.0, 50.5, 11.5, 1.2, 0.5, 1.5),
    "poori south indian":               _n( 7.0, 47.5, 17.5, 1.5, 0.4, 2.2),

    # ════════════════════════════════════════════════════════════════════
    # RICE / BIRYANI — NIN/IFCT 2017
    # ════════════════════════════════════════════════════════════════════
    "steamed white rice":               _n( 2.7, 28.2,  0.3, 0.2, 0.0, 0.1),
    "steamed brown rice":               _n( 2.6, 25.8,  0.9, 1.8, 0.2, 0.2),
    "jeera rice":                       _n( 3.0, 30.5,  3.5, 0.5, 0.2, 0.5),
    "ghee rice":                        _n( 3.2, 29.5,  5.5, 0.4, 0.2, 3.2),
    "lemon rice":                       _n( 2.8, 28.5,  3.8, 0.5, 0.5, 0.5),
    "curd rice":                        _n( 4.5, 22.5,  3.5, 0.5, 2.5, 2.0),
    "tamarind rice":                    _n( 2.8, 29.5,  4.5, 0.8, 1.5, 0.6),
    "tomato rice":                      _n( 3.2, 28.5,  4.5, 0.8, 2.2, 0.6),
    "coconut rice":                     _n( 3.0, 28.8,  5.5, 1.2, 0.5, 4.5),
    "peas pulao":                       _n( 4.2, 28.5,  3.5, 2.0, 0.8, 0.5),
    "veg pulao":                        _n( 3.8, 27.5,  3.8, 1.5, 0.8, 0.6),
    "mushroom rice":                    _n( 3.5, 27.5,  3.5, 1.0, 0.5, 0.5),
    "chicken biryani":                  _n( 9.8, 22.5,  7.2, 0.8, 0.8, 2.0),
    "mutton biryani":                   _n(10.5, 22.0,  9.5, 0.8, 0.5, 3.2),
    "veg biryani":                      _n( 4.5, 26.5,  5.5, 1.5, 0.8, 0.9),
    "prawn biryani":                    _n(10.8, 22.5,  6.5, 0.8, 0.5, 1.5),
    "egg biryani":                      _n( 7.5, 23.5,  6.5, 0.8, 0.5, 1.8),
    "fish biryani":                     _n(10.2, 22.0,  6.8, 0.8, 0.5, 1.5),
    "hyderabadi biryani chicken":       _n(10.0, 22.5,  8.5, 0.8, 0.5, 2.5),
    "hyderabadi dum biryani":           _n(10.0, 22.5,  8.5, 0.8, 0.5, 2.5),
    "lucknowi biryani mutton":          _n(10.8, 22.0,  9.8, 0.8, 0.5, 3.5),
    "kolkata biryani":                  _n( 7.5, 24.5,  7.5, 1.0, 0.5, 2.2),
    "thalassery biryani":               _n( 9.5, 23.5,  8.5, 0.8, 0.5, 2.5),
    "ambur biryani":                    _n( 9.8, 22.5,  8.0, 0.8, 0.5, 2.2),
    "dindigul biryani":                 _n(10.0, 22.5,  8.5, 0.8, 0.5, 2.5),
    "sindhi biryani":                   _n( 9.5, 23.0,  8.5, 0.8, 0.5, 2.5),
    "kacchi biryani":                   _n(10.5, 22.0,  9.5, 0.8, 0.5, 3.0),
    "fried rice egg":                   _n( 7.2, 26.5,  6.5, 0.8, 0.5, 1.5),
    "fried rice chicken":               _n( 8.5, 25.8,  6.8, 0.8, 0.5, 1.5),
    "fried rice veg":                   _n( 3.8, 27.5,  5.5, 1.2, 0.8, 0.8),
    "schezwan fried rice":              _n( 4.5, 27.0,  6.5, 1.0, 0.8, 0.9),
    "khichdi moong dal":                _n( 6.5, 28.5,  2.8, 2.5, 0.5, 0.5),
    "vegetable khichdi":                _n( 5.5, 26.5,  3.5, 2.8, 0.8, 0.6),
    "sabudana khichdi":                 _n( 1.5, 38.5,  9.5, 0.5, 0.2, 1.5),
    "poha":                             _n( 2.5, 28.5,  5.5, 0.8, 0.5, 0.8),
    "aloo poha":                        _n( 2.8, 30.5,  5.8, 1.0, 0.8, 0.8),
    "kanda poha":                       _n( 2.5, 29.5,  5.5, 1.0, 1.0, 0.8),
    "rice kheer":                       _n( 4.5, 28.5,  5.5, 0.2,18.5, 3.5),
    "pongal ven":                       _n( 6.0, 30.5,  7.5, 1.5, 0.5, 2.0),
    "sweet pongal":                     _n( 4.5, 38.5,  6.5, 1.2,18.5, 3.0),
    "bisi bele bath":                   _n( 5.5, 22.5,  5.5, 3.5, 1.5, 0.8),
    "sambar rice":                      _n( 4.5, 23.5,  2.5, 2.5, 1.5, 0.4),

    # ════════════════════════════════════════════════════════════════════
    # DAL / PULSES / LEGUMES — NIN/IFCT 2017
    # ════════════════════════════════════════════════════════════════════
    "dal tadka":                        _n( 5.8, 12.4,  5.2, 2.8, 0.5, 0.8),
    "dal fry":                          _n( 5.5, 11.8,  6.5, 2.5, 0.5, 1.0),
    "dal makhani":                      _n( 6.2, 14.5,  8.5, 3.2, 0.8, 4.2),
    "yellow dal moong":                 _n( 7.0, 14.2,  0.5, 2.8, 0.3, 0.1),
    "moong dal":                        _n( 7.0, 14.2,  0.5, 2.8, 0.3, 0.1),
    "masoor dal":                       _n( 9.0, 20.1,  0.4, 3.8, 0.2, 0.1),
    "toor dal":                         _n( 7.2, 14.8,  3.5, 3.5, 0.5, 0.5),
    "arhar dal":                        _n( 7.2, 14.8,  3.5, 3.5, 0.5, 0.5),
    "urad dal whole":                   _n( 9.5, 16.5,  3.5, 4.5, 0.5, 0.5),
    "chana dal":                        _n( 8.8, 22.5,  3.2, 6.5, 1.2, 0.4),
    "rajma":                            _n( 8.0, 22.5,  1.2, 6.4, 0.3, 0.2),
    "rajma chawal":                     _n( 5.5, 22.5,  2.5, 3.5, 0.3, 0.3),
    "chhole":                           _n( 8.4, 27.4,  3.8, 7.6, 0.5, 0.4),
    "chole":                            _n( 8.4, 27.4,  3.8, 7.6, 0.5, 0.4),
    "chhole bhature":                   _n( 8.2, 40.5, 12.5, 4.5, 1.0, 2.0),
    "black chana masala":               _n( 8.8, 24.5,  3.5, 7.8, 0.5, 0.4),
    "kabuli chana":                     _n( 8.8, 27.5,  2.5, 7.8, 0.5, 0.3),
    "whole moong sprouted":             _n( 3.0,  6.5,  0.2, 2.0, 1.5, 0.0),
    "lobiya":                           _n( 7.5, 20.5,  0.8, 5.5, 0.5, 0.2),
    "moth beans matki":                 _n(10.5, 24.5,  0.5, 6.8, 0.5, 0.1),
    "horse gram kulith":                _n(10.5, 25.8,  0.8, 7.5, 0.5, 0.2),
    "peas matar curry":                 _n( 5.2, 14.5,  3.5, 4.2, 2.5, 0.5),
    "dal baati churma":                 _n( 8.5, 48.5, 15.5, 4.5, 5.5, 5.5),
    "sambar":                           _n( 3.5, 10.5,  2.5, 3.2, 2.5, 0.5),
    "rasam":                            _n( 1.2,  5.5,  0.8, 1.0, 1.5, 0.1),
    "panchmel dal":                     _n( 8.5, 18.5,  4.5, 5.5, 0.5, 0.7),
    "gujarati dal sweet":               _n( 5.5, 15.5,  2.8, 2.8, 4.5, 0.4),
    "dal palak":                        _n( 5.5, 11.5,  3.8, 3.5, 0.5, 0.5),

    # ════════════════════════════════════════════════════════════════════
    # VEG BHAJI / SABZI — NIN/IFCT 2017
    # ════════════════════════════════════════════════════════════════════
    "palak paneer":                     _n( 7.8,  6.5, 12.2, 1.8, 1.2, 5.4),
    "paneer butter masala":             _n( 8.5,  8.5, 15.5, 1.2, 4.5, 8.5),
    "paneer bhurji":                    _n(10.5,  5.5, 14.5, 1.2, 2.5, 7.5),
    "shahi paneer":                     _n( 8.5,  8.8, 16.5, 0.8, 4.5, 9.5),
    "paneer tikka masala":              _n( 9.5,  7.5, 15.5, 1.2, 3.5, 8.5),
    "paneer makhani":                   _n( 8.5,  8.5, 15.5, 1.2, 4.5, 8.5),
    "aloo gobi":                        _n( 2.8, 12.5,  4.8, 2.4, 2.8, 0.5),
    "aloo matar":                       _n( 3.2, 14.8,  4.5, 2.8, 2.2, 0.4),
    "aloo sabzi":                       _n( 2.5, 18.5,  5.5, 2.0, 0.8, 0.6),
    "aloo jeera":                       _n( 2.5, 18.5,  6.5, 2.0, 0.5, 0.8),
    "aloo methi":                       _n( 3.5, 17.5,  6.5, 2.5, 0.5, 0.8),
    "aloo palak":                       _n( 3.2, 14.5,  5.5, 2.5, 1.5, 0.6),
    "bhindi masala":                    _n( 2.5,  7.8,  4.5, 2.5, 1.5, 0.4),
    "baingan bharta":                   _n( 1.8,  8.5,  4.2, 2.8, 2.5, 0.4),
    "baingan masala":                   _n( 2.0,  8.8,  5.5, 2.8, 2.5, 0.5),
    "methi sabzi":                      _n( 3.5,  8.2,  4.5, 2.8, 0.8, 0.5),
    "palak sabzi":                      _n( 2.8,  5.5,  3.5, 2.5, 0.5, 0.4),
    "lauki sabzi":                      _n( 1.5,  5.5,  3.5, 1.5, 2.5, 0.4),
    "turai sabzi":                      _n( 1.2,  5.8,  3.2, 1.5, 2.2, 0.4),
    "karela sabzi":                     _n( 2.5,  7.5,  4.5, 3.5, 1.5, 0.5),
    "parwal sabzi":                     _n( 1.8,  6.5,  3.5, 2.0, 2.0, 0.4),
    "kaddu sabzi":                      _n( 1.5,  8.5,  3.5, 1.8, 3.5, 0.4),
    "mixed vegetable curry":            _n( 2.5,  9.5,  5.5, 2.5, 2.5, 0.8),
    "navratan korma":                   _n( 4.5, 12.5,  9.5, 1.8, 4.5, 3.5),
    "matar paneer":                     _n( 7.2, 10.5,  9.5, 2.8, 2.5, 4.2),
    "saag":                             _n( 3.5,  6.5,  3.8, 3.5, 0.8, 0.5),
    "sarson ka saag":                   _n( 3.8,  7.5,  4.5, 4.0, 0.8, 0.6),
    "veg kofta curry":                  _n( 4.5, 12.5, 10.5, 2.2, 3.5, 4.5),
    "malai kofta":                      _n( 5.5, 12.5, 14.5, 1.5, 3.5, 6.5),
    "dum aloo":                         _n( 3.0, 18.5,  8.5, 2.5, 2.5, 1.2),
    "jackfruit curry":                  _n( 2.2, 12.5,  5.5, 2.5, 3.5, 0.8),
    "raw banana curry":                 _n( 2.2, 18.5,  5.5, 2.2, 2.5, 0.8),
    "arbi masala":                      _n( 2.5, 20.5,  5.5, 2.5, 0.5, 0.8),
    "pav bhaji":                        _n( 4.8, 22.5,  8.5, 3.5, 4.5, 3.5),
    "mushroom masala":                  _n( 3.5,  8.5,  5.5, 1.8, 2.5, 0.8),
    "mushroom do pyaza":                _n( 3.5,  9.5,  5.5, 1.8, 3.5, 0.8),
    "paneer do pyaza":                  _n( 9.0,  7.5, 14.5, 1.2, 3.5, 7.5),
    "kholapuri misal":                  _n( 7.5, 22.5,  8.5, 6.5, 2.5, 1.2),
    "misal":                            _n( 7.5, 22.5,  8.5, 6.5, 2.5, 1.2),
    "undhiyu":                          _n( 4.5, 15.5,  8.5, 4.5, 2.5, 1.2),
    "gatte ki sabzi":                   _n( 8.5, 22.5,  9.5, 2.5, 1.5, 1.2),
    "ker sangri":                       _n( 4.5, 15.5,  7.5, 6.5, 2.5, 1.0),
    "jackfruit biryani":                _n( 3.5, 24.5,  5.5, 2.5, 1.5, 0.8),
    "lotus stem masala":                _n( 2.5, 12.5,  4.5, 2.5, 2.5, 0.6),
    "beetroot sabzi":                   _n( 2.0, 10.5,  3.5, 2.5, 7.5, 0.5),

    # ════════════════════════════════════════════════════════════════════
    # NON-VEG CURRIES / DRY — NIN/IFCT 2017
    # ════════════════════════════════════════════════════════════════════
    "butter chicken":                   _n(14.5,  7.5, 14.5, 0.8, 4.5, 4.5),
    "chicken curry":                    _n(14.0,  5.5, 11.5, 0.8, 2.5, 3.2),
    "chicken masala":                   _n(15.5,  6.5, 12.5, 0.8, 2.5, 3.5),
    "chicken do pyaza":                 _n(14.5,  8.5, 11.5, 1.0, 3.5, 3.0),
    "chicken korma":                    _n(13.5,  7.5, 13.5, 0.8, 3.5, 5.5),
    "chicken bhuna":                    _n(16.5,  5.5, 12.5, 0.8, 2.0, 3.5),
    "chicken vindaloo":                 _n(15.5,  6.5, 13.5, 0.8, 2.5, 3.5),
    "chicken chettinad":                _n(15.0,  6.5, 12.5, 0.8, 2.5, 3.2),
    "chicken handi":                    _n(14.5,  7.5, 13.5, 0.8, 3.5, 4.5),
    "mutton curry":                     _n(15.5,  5.5, 13.5, 0.5, 1.5, 5.5),
    "mutton rogan josh":                _n(15.8,  6.5, 14.5, 0.5, 2.0, 6.0),
    "mutton keema":                     _n(17.5,  5.5, 15.5, 0.8, 1.5, 6.5),
    "mutton kofta":                     _n(14.5,  7.5, 14.5, 0.8, 2.5, 6.0),
    "goat curry":                       _n(15.5,  5.5, 12.5, 0.5, 1.5, 4.5),
    "fish curry":                       _n(14.5,  6.5,  8.5, 0.5, 2.5, 1.5),
    "prawn curry":                      _n(14.5,  7.5,  8.5, 0.5, 2.5, 1.2),
    "prawn masala":                     _n(15.5,  6.5,  9.5, 0.5, 2.5, 1.5),
    "fish fry":                         _n(18.5,  8.5, 10.5, 0.5, 0.5, 2.0),
    "egg curry":                        _n( 7.5,  7.5,  8.5, 0.8, 2.5, 2.5),
    "egg bhurji":                       _n( 9.5,  5.5, 12.5, 0.8, 2.5, 3.5),
    "nihari":                           _n(15.5,  5.5, 16.5, 0.5, 0.5, 7.5),
    "haleem":                           _n(12.5, 18.5,  9.5, 3.5, 0.5, 2.5),
    "seekh kebab":                      _n(18.5,  5.5, 14.5, 0.5, 1.5, 5.5),
    "galouti kebab":                    _n(16.5,  8.5, 15.5, 0.5, 1.5, 6.5),
    "shami kebab":                      _n(16.5, 10.5, 13.5, 1.5, 0.5, 4.5),
    "tandoori chicken":                 _n(22.5,  5.5,  7.5, 0.5, 2.5, 1.8),
    "chicken tikka":                    _n(22.5,  5.5,  7.5, 0.5, 2.5, 1.8),
    "paneer tikka":                     _n(13.5,  6.5, 14.5, 0.8, 2.5, 7.5),
    "kosha mangsho":                    _n(18.5,  5.5, 16.5, 0.5, 1.5, 6.5),
    "shorshe ilish":                    _n(19.5,  4.5, 15.5, 0.0, 0.5, 3.5),
    "doi maach":                        _n(16.5,  6.5,  9.5, 0.0, 4.5, 2.5),
    "laal maas":                        _n(18.5,  5.5, 18.5, 0.5, 1.5, 7.5),
    "fish moilee":                      _n(12.5,  5.5,  9.5, 0.5, 2.0, 7.5),
    "chicken stew kerala":              _n(13.5,  7.5,  9.5, 1.0, 3.5, 5.5),
    "egg roast kerala":                 _n( 8.5,  5.5,  9.5, 1.0, 2.5, 2.5),

    # ════════════════════════════════════════════════════════════════════
    # DAIRY / MILK PRODUCTS — NIN/IFCT 2017
    # ════════════════════════════════════════════════════════════════════
    "whole milk":                       _n( 3.2,  4.9,  3.5, 0.0, 4.9, 2.1),
    "toned milk":                       _n( 3.2,  5.0,  2.0, 0.0, 5.0, 1.2),
    "skimmed milk":                     _n( 3.5,  5.1,  0.1, 0.0, 5.1, 0.1),
    "buffalo milk":                     _n( 4.5,  5.1,  7.0, 0.0, 5.1, 4.5),
    "soy milk":                         _n( 3.3,  2.8,  1.8, 0.5, 1.0, 0.2),
    "almond milk":                      _n( 0.5,  1.5,  1.2, 0.5, 0.5, 0.1),
    "coconut milk":                     _n( 1.8,  6.0, 21.5, 0.5, 2.5,19.5),
    "oat milk":                         _n( 1.0,  7.0,  1.5, 0.5, 3.5, 0.2),
    "curd dahi full fat":               _n( 3.1,  4.7,  4.0, 0.0, 4.7, 2.4),
    "curd dahi low fat":                _n( 3.5,  5.2,  1.0, 0.0, 5.2, 0.6),
    "hung curd chakka":                 _n( 7.5,  5.5,  6.5, 0.0, 5.5, 3.8),
    "greek yogurt":                     _n(10.0,  3.6,  5.0, 0.0, 3.2, 3.2),
    "flavoured yogurt":                 _n( 4.5, 18.5,  2.5, 0.2,16.5, 1.5),
    "paneer full fat":                  _n(14.5,  3.5, 20.5, 0.0, 3.5,11.5),
    "paneer low fat":                   _n(18.0,  3.5,  8.5, 0.0, 3.5, 5.5),
    "butter salted":                    _n( 0.7,  0.1, 81.0, 0.0, 0.1,51.4),
    "butter unsalted":                  _n( 0.7,  0.1, 81.1, 0.0, 0.1,51.4),
    "white butter makkhan":             _n( 0.8,  0.2, 81.5, 0.0, 0.2,52.0),
    "ghee cow":                         _n( 0.4,  0.0, 99.5, 0.0, 0.0,61.9),
    "ghee buffalo":                     _n( 0.4,  0.0, 99.5, 0.0, 0.0,62.5),
    "cream whipping":                   _n( 2.2,  3.5, 35.0, 0.0, 3.5,21.8),
    "cooking cream":                    _n( 2.8,  4.5, 18.5, 0.0, 4.5,11.5),
    "condensed milk":                   _n( 8.5, 54.5,  8.5, 0.0,54.5, 5.2),
    "evaporated milk":                  _n( 6.8, 10.0,  7.5, 0.0,10.0, 4.5),
    "buttermilk chaas":                 _n( 1.2,  3.2,  0.4, 0.0, 3.1, 0.2),
    "masala chaas":                     _n( 1.2,  3.5,  0.4, 0.0, 3.1, 0.2),
    "lassi sweet":                      _n( 3.8, 14.2,  4.5, 0.0,12.5, 2.8),
    "lassi salted":                     _n( 3.5,  5.5,  3.5, 0.0, 5.0, 2.2),
    "mango lassi":                      _n( 3.2, 16.5,  3.5, 0.2,14.5, 2.2),
    "rose lassi":                       _n( 3.5, 15.5,  4.0, 0.0,14.0, 2.5),
    "kesar lassi":                      _n( 4.5, 18.5,  5.5, 0.0,15.5, 3.5),
    "khoya mawa":                       _n(14.5, 25.5, 24.5, 0.0,24.5,15.8),
    "malai cream layer":                _n( 3.5,  4.5, 40.0, 0.0, 4.5,25.0),
    "processed cheese":                 _n(18.5,  8.5, 22.5, 0.0, 5.5,14.5),
    "cheddar cheese":                   _n(25.0,  1.3, 33.3, 0.0, 0.5,21.1),
    "mozzarella cheese":                _n(22.5,  2.2, 22.5, 0.0, 1.0,14.5),
    "parmesan cheese":                  _n(35.8,  3.2, 29.5, 0.0, 0.8,18.8),
    "cream cheese":                     _n( 7.5,  4.5, 33.5, 0.0, 3.0,21.2),
    "cottage cheese ricotta":           _n(11.5,  3.5,  4.5, 0.0, 3.5, 2.8),
    "whipped cream":                    _n( 2.8,  5.5, 26.5, 0.0, 5.5,16.5),
    "sour cream":                       _n( 2.5,  4.5, 19.5, 0.0, 4.5,12.5),
    "creme fraiche":                    _n( 2.5,  2.5, 30.0, 0.0, 2.5,19.5),
    "raita plain":                      _n( 2.8,  4.5,  3.5, 0.0, 4.5, 2.0),
    "raita boondi":                     _n( 4.5, 14.5,  4.5, 0.2, 5.5, 2.8),
    "raita cucumber":                   _n( 2.5,  4.5,  2.5, 0.2, 4.2, 1.5),
    "raita mixed veg":                  _n( 3.0,  5.5,  3.0, 0.5, 4.5, 1.8),
    "dahi vada":                        _n( 7.5, 28.5,  5.5, 1.8, 5.5, 2.5),
    "shrikhand":                        _n( 5.5, 35.5,  4.5, 0.0,32.5, 2.8),
    "mishti doi":                       _n( 5.5, 22.5,  3.5, 0.0,21.5, 2.2),
    "milk powder":                      _n(26.5, 38.5, 27.5, 0.0,38.5,17.5),
    "kheer":                            _n( 4.5, 22.5,  5.5, 0.2,18.5, 3.5),
    "badam milk":                       _n( 4.5, 17.5,  5.5, 0.5,15.5, 3.2),
    "haldi doodh":                      _n( 3.0,  8.5,  3.5, 0.2, 6.5, 2.2),
    "choco milk":                       _n( 3.5, 10.5,  2.8, 0.5, 8.5, 1.8),
    "flavoured milk":                   _n( 3.2, 10.5,  2.5, 0.0, 9.5, 1.5),
    "paneer tikka snack":               _n(13.5,  6.5, 14.5, 0.8, 2.5, 7.5),
    "chenna":                           _n(14.5,  3.5, 10.5, 0.0, 3.5, 6.5),

    # ════════════════════════════════════════════════════════════════════
    # SOUTH INDIAN — NIN/IFCT 2017
    # ════════════════════════════════════════════════════════════════════
    "plain dosa":                       _n( 3.5, 23.5,  3.5, 1.2, 0.3, 0.5),
    "masala dosa":                      _n( 3.8, 25.5,  5.5, 1.5, 0.8, 1.0),
    "rava dosa":                        _n( 4.5, 26.5,  6.5, 0.8, 0.5, 1.0),
    "set dosa":                         _n( 4.5, 28.5,  4.5, 1.2, 0.5, 0.8),
    "neer dosa":                        _n( 2.5, 20.5,  1.5, 0.5, 0.3, 0.2),
    "pesarattu":                        _n( 8.5, 25.5,  3.5, 3.5, 0.5, 0.5),
    "egg dosa":                         _n( 7.5, 23.5,  6.5, 1.0, 0.5, 1.5),
    "cheese dosa":                      _n( 8.5, 25.5,  8.5, 1.0, 0.5, 4.5),
    "idli":                             _n( 3.2, 22.8,  0.8, 1.0, 0.2, 0.1),
    "rava idli":                        _n( 4.5, 26.5,  3.5, 1.0, 0.5, 0.5),
    "kanchipuram idli":                 _n( 4.0, 23.5,  3.0, 1.2, 0.3, 0.5),
    "medu vada":                        _n( 6.5, 28.5,  9.5, 2.5, 0.5, 1.5),
    "sambar vada":                      _n( 5.5, 22.5,  7.5, 2.5, 1.5, 1.2),
    "uttapam":                          _n( 4.5, 25.5,  4.5, 1.5, 0.5, 0.7),
    "onion uttapam":                    _n( 4.2, 25.5,  4.5, 1.5, 1.0, 0.7),
    "upma":                             _n( 4.5, 25.5,  5.5, 1.8, 0.8, 0.8),
    "rava upma":                        _n( 4.5, 25.8,  5.5, 1.8, 0.8, 0.8),
    "khara pongal":                     _n( 5.5, 27.5,  6.5, 1.5, 0.5, 1.5),
    "appam":                            _n( 3.5, 25.5,  3.5, 0.8, 0.5, 0.5),
    "puttu":                            _n( 6.5, 28.5,  1.5, 1.5, 0.5, 0.2),
    "idiyappam":                        _n( 4.5, 28.5,  1.5, 0.8, 0.3, 0.2),
    "avial":                            _n( 2.5, 10.5,  8.5, 2.5, 2.5, 6.5),
    "kootu":                            _n( 4.5, 12.5,  5.5, 3.5, 2.5, 3.5),
    "thoran":                           _n( 2.5,  8.5,  5.5, 2.5, 2.0, 4.5),
    "chettinad chicken":                _n(15.0,  6.5, 12.5, 0.8, 2.5, 3.2),
    "prawn masala kerala":              _n(15.5,  6.5,  9.5, 0.5, 2.5, 1.5),

    # ════════════════════════════════════════════════════════════════════
    # STREET FOOD / FAST FOOD — NIN estimates
    # ════════════════════════════════════════════════════════════════════
    "samosa":                           _n( 5.5, 32.5, 18.5, 2.5, 0.5, 2.5),
    "vada pav":                         _n( 5.5, 32.5,  9.5, 2.0, 1.5, 1.5),
    "bhelpuri":                         _n( 4.5, 28.5,  5.5, 1.5, 2.5, 0.8),
    "sev puri":                         _n( 5.5, 30.5,  8.5, 1.8, 2.5, 1.2),
    "dahi puri":                        _n( 5.5, 28.5,  7.5, 1.5, 5.5, 1.5),
    "panipuri":                         _n( 3.5, 25.5,  9.5, 1.2, 1.5, 1.2),
    "pani puri":                        _n( 3.5, 25.5,  9.5, 1.2, 1.5, 1.2),
    "gol gappe":                        _n( 3.5, 25.5,  9.5, 1.2, 1.5, 1.2),
    "papdi chaat":                      _n( 5.5, 30.5,  8.5, 2.0, 4.5, 1.5),
    "dahi bhalla":                      _n( 7.5, 28.5,  5.5, 2.5, 5.5, 2.5),
    "aloo tikki":                       _n( 3.0, 22.5,  7.5, 2.0, 1.5, 1.0),
    "aloo tikki chaat":                 _n( 4.5, 25.5,  8.5, 2.5, 4.5, 1.5),
    "raj kachori":                      _n( 6.5, 32.5, 12.5, 3.5, 4.5, 2.0),
    "chole tikki":                      _n( 6.5, 27.5,  8.5, 4.5, 3.5, 1.5),
    "kathi roll chicken":               _n(12.5, 30.5,  8.5, 1.5, 1.5, 2.0),
    "kathi roll paneer":                _n(10.5, 30.5,  9.5, 1.5, 2.0, 4.5),
    "frankie veg":                      _n( 5.5, 32.5,  6.5, 2.0, 1.5, 1.0),
    "frankie chicken":                  _n(10.5, 32.5,  7.5, 1.5, 1.5, 1.5),
    "dabeli":                           _n( 6.5, 38.5,  9.5, 2.5, 5.5, 2.0),
    "misal pav":                        _n( 8.5, 30.5,  8.5, 6.5, 2.5, 1.5),
    "pav bhaji plate":                  _n( 4.8, 22.5,  8.5, 3.5, 4.5, 3.5),
    "egg roll":                         _n( 9.5, 30.5,  8.5, 1.5, 1.5, 2.0),
    "chicken roll":                     _n(12.5, 30.5,  8.5, 1.5, 1.5, 2.0),
    "noodle roll":                      _n( 6.5, 33.5,  7.5, 1.5, 1.5, 1.0),

    # ════════════════════════════════════════════════════════════════════
    # DESSERTS / MITHAI — NIN/IFCT 2017
    # ════════════════════════════════════════════════════════════════════
    "gulab jamun":                      _n( 4.5, 45.5, 12.5, 0.5,38.5, 7.5),
    "rasgulla":                         _n( 6.5, 28.5,  0.5, 0.0,27.5, 0.3),
    "milk barfi":                       _n( 8.5, 55.5, 12.5, 0.0,52.5, 7.8),
    "barfi":                            _n( 8.5, 55.5, 12.5, 0.0,52.5, 7.8),
    "peda":                             _n( 8.5, 55.5,  9.5, 0.0,52.5, 6.0),
    "besan ladoo":                      _n( 9.5, 52.5, 18.5, 2.5,45.5, 5.5),
    "motichoor ladoo":                  _n( 7.5, 58.5, 15.5, 0.8,52.5, 4.5),
    "ladoo":                            _n( 8.0, 55.5, 17.0, 1.5,48.5, 5.0),
    "suji halwa":                       _n( 4.5, 38.5, 12.5, 0.5,25.5, 5.5),
    "gajar halwa":                      _n( 3.5, 28.5,  8.5, 1.5,22.5, 4.5),
    "phirni":                           _n( 4.5, 22.5,  5.5, 0.2,18.5, 3.5),
    "rasmalai":                         _n( 7.5, 28.5,  7.5, 0.0,26.5, 4.5),
    "sandesh":                          _n( 8.5, 38.5,  8.5, 0.0,35.5, 5.2),
    "jalebi":                           _n( 3.5, 55.5, 12.5, 0.5,48.5, 3.5),
    "imarti":                           _n( 3.5, 58.5, 15.5, 0.5,50.5, 4.5),
    "kalakand":                         _n( 7.5, 42.5,  8.5, 0.0,38.5, 5.5),
    "kaju katli":                       _n(12.5, 58.5, 15.5, 0.5,52.5, 3.8),
    "malpua":                           _n( 5.5, 48.5, 12.5, 0.5,38.5, 4.5),
    "shahi tukda":                      _n( 7.5, 42.5, 15.5, 0.5,32.5, 8.5),
    "kulfi plain":                      _n( 4.5, 22.5,  8.5, 0.0,20.5, 5.5),
    "kulfi mango":                      _n( 4.2, 25.5,  7.5, 0.2,22.5, 4.8),
    "vanilla ice cream":                _n( 3.5, 23.5, 11.0, 0.0,21.5, 6.8),
    "chocolate ice cream":              _n( 3.5, 28.5, 10.5, 1.5,24.5, 6.5),
    "ice cream":                        _n( 3.5, 25.0, 10.8, 0.0,22.0, 6.5),
    "brownie":                          _n( 5.5, 55.5, 22.5, 2.5,38.5,12.5),
    "chocolate cake":                   _n( 5.5, 55.5, 18.5, 2.0,38.5,10.5),
    "rasogolla":                        _n( 6.5, 28.5,  0.5, 0.0,27.5, 0.3),
    "patishapta":                       _n( 5.5, 38.5,  6.5, 0.5,18.5, 3.5),
    "modak":                            _n( 5.5, 48.5,  8.5, 2.5,22.5, 4.5),
    "chakli":                           _n( 7.5, 55.5, 22.5, 3.5, 0.5, 3.0),
    "murukku":                          _n( 7.5, 55.5, 22.5, 3.5, 0.5, 3.0),
    "soan papdi":                       _n( 7.5, 68.5,  9.5, 0.5,50.5, 3.5),
    "chikki":                           _n(12.5, 55.5, 18.5, 3.5,45.5, 3.5),

    # ════════════════════════════════════════════════════════════════════
    # DRINKS — per 100 ml  — USDA + NIN
    # ════════════════════════════════════════════════════════════════════
    "masala chai":                      _n( 1.2,  8.5,  1.8, 0.0, 8.2, 1.1),
    "chai":                             _n( 1.2,  8.5,  1.8, 0.0, 8.2, 1.1),
    "ginger tea":                       _n( 0.2,  4.5,  0.2, 0.0, 4.2, 0.1),
    "lemon tea":                        _n( 0.1,  3.5,  0.0, 0.0, 3.2, 0.0),
    "green tea":                        _n( 0.2,  0.2,  0.0, 0.0, 0.0, 0.0),
    "black coffee":                     _n( 0.3,  0.5,  0.0, 0.0, 0.0, 0.0),
    "filter coffee":                    _n( 1.0,  7.0,  1.5, 0.0, 6.5, 0.9),
    "cappuccino":                       _n( 2.5,  7.5,  2.5, 0.0, 6.5, 1.5),
    "latte":                            _n( 3.0,  8.5,  2.5, 0.0, 7.5, 1.5),
    "flat white":                       _n( 2.8,  7.5,  2.5, 0.0, 6.8, 1.5),
    "cold brew":                        _n( 0.5,  2.5,  0.0, 0.0, 0.0, 0.0),
    "cold coffee":                      _n( 2.8, 11.5,  3.5, 0.0, 9.5, 2.2),
    "frappe":                           _n( 2.5, 18.5,  5.5, 0.0,15.5, 3.5),
    "matcha latte":                     _n( 2.5,  8.5,  2.5, 0.0, 7.0, 1.5),
    "turmeric latte":                   _n( 3.0,  8.5,  3.5, 0.2, 6.5, 2.2),
    "nimbu pani":                       _n( 0.2,  6.0,  0.0, 0.0, 5.5, 0.0),
    "nimbu soda":                       _n( 0.2,  7.5,  0.0, 0.0, 6.5, 0.0),
    "aam panna":                        _n( 0.3, 13.5,  0.1, 0.2,12.5, 0.0),
    "kokum sharbat":                    _n( 0.2, 11.5,  0.0, 0.2,10.5, 0.0),
    "rose sharbat":                     _n( 0.1, 16.5,  0.0, 0.0,16.0, 0.0),
    "sugarcane juice":                  _n( 0.4, 17.0,  0.2, 0.0,16.5, 0.0),
    "coconut water":                    _n( 0.7,  3.7,  0.2, 1.1, 2.6, 0.2),
    "pomegranate juice":                _n( 0.3, 16.5,  0.3, 0.2,14.5, 0.0),
    "orange juice":                     _n( 0.7, 10.4,  0.2, 0.2, 8.4, 0.0),
    "apple juice":                      _n( 0.1, 11.5,  0.1, 0.1, 9.5, 0.0),
    "watermelon juice":                 _n( 0.5,  7.5,  0.1, 0.2, 5.5, 0.0),
    "carrot juice":                     _n( 0.9,  9.3,  0.2, 0.9, 3.9, 0.0),
    "protein shake":                    _n( 8.5, 15.5,  3.5, 1.0,12.5, 1.5),
    "banana smoothie":                  _n( 2.5, 19.5,  1.5, 1.0,15.5, 0.9),
    "mango smoothie":                   _n( 1.5, 19.5,  1.0, 0.8,16.5, 0.5),
    "beer lager":                       _n( 0.5,  3.6,  0.0, 0.0, 0.0, 0.0),
    "beer strong":                      _n( 0.5,  4.2,  0.0, 0.0, 0.0, 0.0),
    "red wine":                         _n( 0.1,  2.6,  0.0, 0.0, 0.9, 0.0),
    "white wine":                       _n( 0.1,  2.5,  0.0, 0.0, 1.0, 0.0),
    "champagne":                        _n( 0.3,  2.8,  0.0, 0.0, 1.0, 0.0),
    "whisky":                           _n( 0.0,  0.0,  0.0, 0.0, 0.0, 0.0),
    "rum":                              _n( 0.0,  0.0,  0.0, 0.0, 0.0, 0.0),
    "vodka":                            _n( 0.0,  0.0,  0.0, 0.0, 0.0, 0.0),
    "gin":                              _n( 0.0,  0.0,  0.0, 0.0, 0.0, 0.0),
    "tequila":                          _n( 0.0,  0.0,  0.0, 0.0, 0.0, 0.0),
    "brandy":                           _n( 0.0,  0.0,  0.0, 0.0, 0.0, 0.0),
    "margarita":                        _n( 0.1,  8.5,  0.0, 0.0, 4.5, 0.0),
    "mojito":                           _n( 0.1,  9.5,  0.0, 0.0, 8.5, 0.0),
    "pina colada":                      _n( 0.5, 15.5,  5.5, 0.2,12.5, 4.8),
    "falooda":                          _n( 3.5, 20.5,  3.5, 0.5,16.5, 2.2),
    "thandai":                          _n( 3.5, 15.5,  4.5, 0.5,12.5, 2.5),
    "jal jeera":                        _n( 0.2,  6.0,  0.1, 0.2, 5.5, 0.0),
    "pineapple juice":                  _n( 0.5, 12.0,  0.1, 0.2,10.5, 0.0),
    "beet carrot apple juice":          _n( 0.8, 12.5,  0.2, 0.8, 9.5, 0.0),
    "sports drink":                     _n( 0.0,  6.5,  0.0, 0.0, 6.0, 0.0),
    "energy drink":                     _n( 0.2, 11.0,  0.0, 0.0,10.5, 0.0),
    "tender coconut smoothie":          _n( 1.2,  8.5,  1.5, 0.5, 5.5, 1.2),

    # ════════════════════════════════════════════════════════════════════
    # SOUPS — per 100 ml — USDA + NIN
    # ════════════════════════════════════════════════════════════════════
    "tomato soup creamy":               _n( 1.5,  7.5,  2.5, 0.8, 4.5, 1.5),
    "tomato soup clear":                _n( 1.2,  6.5,  0.5, 0.8, 3.5, 0.1),
    "corn soup":                        _n( 2.5, 12.5,  1.5, 1.0, 3.5, 0.3),
    "manchow soup veg":                 _n( 2.8,  9.5,  1.5, 1.2, 2.5, 0.2),
    "manchow soup chicken":             _n( 5.5,  8.5,  2.5, 0.8, 2.0, 0.4),
    "hot and sour soup":                _n( 3.0,  9.0,  1.5, 0.9, 2.2, 0.3),
    "sweet corn chicken soup":          _n( 5.5,  8.5,  2.5, 0.5, 2.5, 0.5),
    "chicken clear soup":               _n( 5.5,  1.5,  1.5, 0.2, 0.5, 0.3),
    "chicken noodle soup":              _n( 4.5,  8.5,  2.5, 0.5, 1.5, 0.5),
    "mutton yakhni":                    _n( 7.5,  4.5,  4.5, 0.5, 0.5, 1.5),
    "bone broth":                       _n( 5.5,  0.5,  0.5, 0.0, 0.2, 0.2),
    "lentil soup":                      _n( 4.5,  9.5,  1.5, 2.5, 1.5, 0.2),
    "dal soup":                         _n( 4.0,  8.5,  1.5, 2.2, 1.5, 0.2),
    "mulligatawny":                     _n( 4.5, 10.5,  4.5, 1.5, 2.5, 1.5),
    "rasam soup":                       _n( 1.2,  5.5,  0.8, 1.0, 1.5, 0.1),
    "shorba mutton":                    _n( 7.5,  4.5,  4.5, 0.5, 0.5, 1.5),
    "shorba veg":                       _n( 2.0,  6.5,  1.5, 1.0, 1.5, 0.2),
    "palak soup":                       _n( 2.5,  6.5,  2.5, 1.5, 1.5, 1.2),
    "broccoli cheddar soup":            _n( 4.5,  6.5,  5.5, 1.2, 2.5, 3.5),
    "mushroom soup":                    _n( 2.5,  7.5,  5.5, 0.5, 2.0, 3.0),
    "minestrone":                       _n( 3.5,  9.5,  2.5, 2.5, 3.5, 0.5),
    "french onion soup":                _n( 3.5,  8.5,  3.5, 0.8, 3.5, 2.0),
    "pumpkin soup":                     _n( 1.5,  8.5,  2.5, 1.0, 4.5, 1.5),

    # ════════════════════════════════════════════════════════════════════
    # EGGS — USDA
    # ════════════════════════════════════════════════════════════════════
    "boiled egg":                       _n(12.6,  1.1, 10.6, 0.0, 1.1, 3.3),
    "scrambled eggs":                   _n( 9.5,  2.5, 12.5, 0.0, 1.5, 3.8),
    "omelette":                         _n(10.5,  2.5, 14.5, 0.0, 1.5, 4.5),
    "fried egg":                        _n(11.5,  1.5, 14.5, 0.0, 1.5, 4.2),
    "poached egg":                      _n(12.5,  1.0, 10.5, 0.0, 1.0, 3.2),
    "egg white":                        _n(10.9,  0.7,  0.2, 0.0, 0.5, 0.0),
    "half boiled egg":                  _n(12.5,  1.1, 10.5, 0.0, 1.1, 3.2),
    "egg salad":                        _n( 8.5,  2.5, 12.5, 0.5, 1.5, 3.0),
    "devilled eggs":                    _n(10.5,  2.5, 14.5, 0.0, 1.5, 3.8),
    "eggs benedict":                    _n(10.5, 15.5, 18.5, 0.5, 2.5, 6.5),
    "shakshuka":                        _n( 7.5,  8.5,  9.5, 2.0, 4.5, 2.5),
    "egg fried rice":                   _n( 7.2, 26.5,  6.5, 0.8, 0.5, 1.5),

    # ════════════════════════════════════════════════════════════════════
    # FISH / SEAFOOD — USDA + NIN
    # ════════════════════════════════════════════════════════════════════
    "rohu fish curry":                  _n(16.5,  5.5,  6.5, 0.2, 1.5, 1.2),
    "catla curry":                      _n(17.5,  5.0,  6.8, 0.0, 1.0, 1.5),
    "pomfret fry":                      _n(18.5,  7.5, 10.5, 0.0, 0.5, 2.0),
    "surmai curry":                     _n(17.5,  6.5,  8.5, 0.0, 1.5, 1.5),
    "kerala fish fry":                  _n(18.5,  8.5, 10.5, 0.5, 0.5, 2.0),
    "bengali fish curry":               _n(16.5,  5.5,  9.5, 0.2, 1.5, 1.5),
    "prawn fry":                        _n(18.5,  8.5,  9.5, 0.2, 0.5, 1.5),
    "prawn biryani":                    _n(10.8, 22.5,  6.5, 0.8, 0.5, 1.5),
    "salmon steak":                     _n(20.5,  0.0, 13.5, 0.0, 0.0, 3.1),
    "tuna sandwich":                    _n(14.5, 25.5,  8.5, 1.5, 3.5, 1.5),
    "fish and chips":                   _n(14.5, 28.5, 12.5, 2.0, 0.5, 2.5),
    "grilled fish":                     _n(22.5,  0.0,  5.5, 0.0, 0.0, 1.2),
    "crab curry":                       _n(14.5,  6.5,  6.5, 0.5, 1.5, 1.2),
    "lobster thermidor":                _n(18.5,  4.5, 12.5, 0.0, 1.5, 7.5),

    # ════════════════════════════════════════════════════════════════════
    # FRUITS — USDA
    # ════════════════════════════════════════════════════════════════════
    "mango":                            _n( 0.8, 15.0,  0.4, 1.6,13.7, 0.1),
    "banana":                           _n( 1.1, 23.0,  0.3, 2.6,12.2, 0.1),
    "apple":                            _n( 0.3, 13.8,  0.2, 2.4,10.4, 0.0),
    "orange":                           _n( 0.9, 11.8,  0.1, 2.4, 9.4, 0.0),
    "guava":                            _n( 2.6, 14.3,  1.0, 5.4, 8.9, 0.3),
    "papaya":                           _n( 0.5, 10.8,  0.1, 1.7, 7.8, 0.0),
    "watermelon":                       _n( 0.6,  7.6,  0.2, 0.4, 6.2, 0.0),
    "grapes":                           _n( 0.7, 18.1,  0.2, 0.9,15.5, 0.1),
    "pomegranate":                      _n( 1.7, 18.7,  1.2, 4.0,13.7, 0.1),
    "strawberry":                       _n( 0.7,  7.7,  0.3, 2.0, 4.9, 0.0),
    "pineapple":                        _n( 0.5, 13.1,  0.1, 1.4, 9.9, 0.0),
    "coconut fresh":                    _n( 3.3, 15.2, 33.5, 9.0, 6.2,29.7),
    "chickoo sapodilla":                _n( 0.4, 20.0,  1.1, 5.3,12.5, 0.5),
    "pear":                             _n( 0.4, 15.2,  0.1, 3.1, 9.8, 0.0),
    "kiwi":                             _n( 1.1, 14.7,  0.5, 3.0, 9.0, 0.0),
    "peach":                            _n( 0.9,  9.5,  0.3, 1.5, 8.4, 0.0),
    "plum":                             _n( 0.7, 11.4,  0.3, 1.4, 9.9, 0.0),
    "lychee":                           _n( 0.8, 16.5,  0.4, 1.3,15.2, 0.1),
    "chikoo":                           _n( 0.4, 20.0,  1.1, 5.3,12.5, 0.5),
    "dates":                            _n( 2.5, 75.0,  0.4, 8.0,63.4, 0.0),
    "fig":                              _n( 0.8, 19.2,  0.3, 2.9,16.3, 0.1),
    "blueberries":                      _n( 0.7, 14.5,  0.3, 2.4,10.0, 0.0),
    "mixed fruit bowl":                 _n( 0.8, 14.0,  0.3, 2.0,11.0, 0.0),

    # ════════════════════════════════════════════════════════════════════
    # SALADS — USDA estimates
    # ════════════════════════════════════════════════════════════════════
    "caesar salad":                     _n( 7.5,  8.5, 12.5, 1.5, 2.5, 3.5),
    "greek salad":                      _n( 4.5,  6.5,  8.5, 1.5, 3.5, 2.5),
    "garden salad":                     _n( 2.0,  5.5,  4.5, 2.5, 3.0, 0.8),
    "coleslaw":                         _n( 1.5, 12.5,  8.5, 2.5, 9.5, 1.5),
    "kachumber":                        _n( 1.5,  5.5,  0.5, 1.5, 3.5, 0.1),
    "protein salad":                    _n(15.5,  8.5,  6.5, 2.5, 3.5, 1.5),
    "sprouts salad":                    _n( 5.5, 15.5,  1.5, 4.5, 3.5, 0.2),
    "fruit salad":                      _n( 0.8, 14.0,  0.3, 2.0,11.0, 0.0),

    # ════════════════════════════════════════════════════════════════════
    # NOODLES / PASTA — USDA
    # ════════════════════════════════════════════════════════════════════
    "hakka noodles veg":                _n( 5.5, 28.5,  6.5, 1.5, 2.5, 0.9),
    "hakka noodles chicken":            _n( 9.5, 27.5,  7.5, 1.2, 2.5, 1.5),
    "chow mein":                        _n( 6.5, 28.0,  7.0, 1.5, 2.5, 1.0),
    "spaghetti bolognese":              _n(10.5, 25.5,  6.5, 2.5, 4.5, 2.5),
    "pasta carbonara":                  _n(10.5, 28.5, 12.5, 1.5, 1.5, 5.5),
    "pasta arrabbiata":                 _n( 7.5, 28.5,  5.5, 2.5, 4.5, 0.8),
    "pasta alfredo":                    _n( 9.5, 28.5, 12.5, 1.5, 2.5, 7.5),
    "mac and cheese":                   _n( 9.5, 32.5, 10.5, 1.5, 4.5, 5.5),
    "penne arabiata":                   _n( 7.5, 28.5,  5.5, 2.5, 4.5, 0.8),
    "ramen":                            _n( 8.5, 28.5,  6.5, 1.5, 2.5, 1.5),
    "udon noodles":                     _n( 4.5, 28.5,  1.0, 1.5, 0.5, 0.2),
    "rice noodles":                     _n( 2.5, 28.5,  0.5, 0.5, 0.5, 0.1),
    "vermicelli upma":                  _n( 4.5, 28.5,  5.5, 1.2, 0.8, 0.8),

    # ════════════════════════════════════════════════════════════════════
    # PIZZA / BURGER / SANDWICH — USDA estimates
    # ════════════════════════════════════════════════════════════════════
    "margherita pizza":                 _n(11.5, 32.5, 11.5, 2.0, 3.5, 5.5),
    "cheese pizza":                     _n(12.5, 33.5, 13.5, 2.0, 3.5, 6.5),
    "chicken pizza":                    _n(12.5, 32.5, 12.5, 2.0, 3.5, 5.5),
    "veg pizza":                        _n(10.5, 33.5, 10.5, 2.5, 3.5, 4.5),
    "pepperoni pizza":                  _n(13.5, 32.5, 14.5, 2.0, 3.5, 6.5),
    "veg burger":                       _n( 7.5, 28.5,  8.5, 2.5, 4.5, 2.5),
    "chicken burger":                   _n(12.5, 28.5, 10.5, 1.5, 4.5, 2.5),
    "aloo tikki burger":                _n( 5.5, 30.5,  8.5, 2.5, 4.5, 1.5),
    "grilled chicken sandwich":         _n(14.5, 28.5,  6.5, 2.0, 3.5, 1.5),
    "club sandwich":                    _n(12.5, 30.5,  9.5, 2.0, 3.5, 2.5),
    "blt sandwich":                     _n(12.5, 30.5, 10.5, 1.5, 3.5, 3.5),
    "grilled cheese sandwich":          _n(12.5, 28.5, 14.5, 1.5, 4.5, 7.5),
    "subji sandwich":                   _n( 5.5, 30.5,  5.5, 2.5, 3.5, 0.8),
    "hot dog":                          _n(10.5, 28.5, 12.5, 1.5, 5.5, 4.5),
    "shawarma chicken":                 _n(14.5, 28.5,  9.5, 2.0, 3.5, 2.5),

    # ════════════════════════════════════════════════════════════════════
    # CHINESE / INDO-CHINESE — NIN estimates
    # ════════════════════════════════════════════════════════════════════
    "chilli chicken dry":               _n(18.5, 12.5, 10.5, 1.5, 4.5, 2.5),
    "chilli chicken gravy":             _n(15.5, 12.5,  9.5, 1.2, 4.5, 2.0),
    "chilli paneer dry":                _n(10.5, 12.5, 10.5, 1.5, 4.5, 4.5),
    "gobi manchurian dry":              _n( 4.5, 20.5,  9.5, 2.5, 5.5, 1.2),
    "gobi manchurian gravy":            _n( 3.5, 18.5,  7.5, 2.0, 5.0, 1.0),
    "spring roll veg":                  _n( 4.5, 25.5,  9.5, 1.5, 2.5, 1.5),
    "momos steamed veg":                _n( 5.5, 22.5,  3.5, 1.2, 1.5, 0.5),
    "momos steamed chicken":            _n( 9.5, 21.5,  4.5, 1.0, 1.5, 1.2),
    "momos fried":                      _n( 7.5, 25.5, 10.5, 1.2, 1.5, 1.5),
    "dim sum veg":                      _n( 5.5, 22.5,  3.5, 1.5, 1.5, 0.5),
    "kung pao chicken":                 _n(15.5, 10.5, 10.5, 1.5, 5.5, 2.0),
    "sweet and sour chicken":           _n(12.5, 20.5,  7.5, 1.0, 9.5, 1.5),
    "mapo tofu":                        _n( 8.5,  8.5,  9.5, 1.5, 3.5, 3.5),
    "fried wontons":                    _n( 7.5, 25.5, 10.5, 1.5, 2.5, 1.5),

    # ════════════════════════════════════════════════════════════════════
    # BAKERY / SNACKS / SWEETS — USDA
    # ════════════════════════════════════════════════════════════════════
    "potato chips":                     _n( 6.5, 53.5, 35.5, 4.5, 0.5, 3.0),
    "popcorn salted":                   _n( 9.0, 74.0,  4.5,14.5, 0.5, 0.5),
    "nachos":                           _n( 7.5, 65.5, 18.5, 5.5, 1.5, 3.0),
    "marie biscuit":                    _n( 7.5, 76.5,  7.5, 1.5,22.5, 3.5),
    "chocolate chip cookie":            _n( 5.5, 62.5, 22.5, 2.5,38.5, 8.5),
    "dhokla":                           _n( 7.5, 25.5,  4.5, 1.5, 2.5, 0.5),
    "khandvi":                          _n( 8.5, 22.5,  6.5, 1.5, 2.5, 0.8),
    "mathri":                           _n( 8.5, 55.5, 22.5, 2.5, 0.5, 3.0),
    "namkeen sev":                      _n(12.5, 52.5, 28.5, 4.5, 1.0, 4.0),
    "khakhra":                          _n(10.5, 62.5,  6.5, 4.5, 0.5, 0.8),
    "papad roasted":                    _n(22.5, 55.5,  1.5, 6.5, 0.5, 0.2),
    "handvo":                           _n( 7.5, 32.5,  5.5, 3.5, 2.5, 0.8),
    "banana chips":                     _n( 1.5, 60.5, 32.5, 4.5, 9.5, 7.5),
    "mixture":                          _n( 9.5, 55.5, 25.5, 4.5, 1.5, 3.5),
    "bhujia":                           _n(12.5, 52.5, 28.5, 5.5, 1.0, 3.5),
    "muffin blueberry":                 _n( 5.5, 52.5, 15.5, 1.5,28.5, 3.5),
    "croissant almond":                 _n( 9.5, 48.5, 22.5, 1.5,12.5,10.5),
    "eclair":                           _n( 5.5, 38.5, 18.5, 0.5,22.5, 8.5),

    # ════════════════════════════════════════════════════════════════════
    # PROTEIN / FITNESS FOODS — USDA
    # ════════════════════════════════════════════════════════════════════
    "whey protein":                     _n(75.0, 10.0,  4.5, 1.0, 6.5, 2.5),
    "plant protein powder":             _n(70.0, 12.5,  4.5, 5.5, 4.5, 0.8),
    "almonds":                          _n(21.2, 21.7, 49.9,12.5, 4.4, 3.8),
    "walnuts":                          _n(15.2, 13.7, 65.2, 6.7, 2.6, 6.1),
    "cashews":                          _n(18.2, 30.2, 43.9, 3.3, 5.9, 7.8),
    "peanuts":                          _n(25.8, 16.1, 49.2, 8.5, 4.7, 6.8),
    "peanut butter":                    _n(25.1, 20.1, 49.9, 6.0, 9.0,10.3),
    "almond butter":                    _n(21.0, 18.8, 55.5,12.5, 3.7, 4.2),
    "chia seeds":                       _n(16.5, 42.1, 30.7,34.4, 0.0, 3.3),
    "flax seeds":                       _n(18.3, 28.9, 42.2,27.3, 1.5, 3.7),
    "quinoa cooked":                    _n( 4.4, 21.3,  1.9, 2.8, 0.9, 0.2),
    "oats rolled":                      _n(16.9, 66.3,  6.9,10.6, 0.0, 1.2),
    "oatmeal cooked":                   _n( 2.5, 12.0,  1.5, 1.7, 0.0, 0.3),
    "muesli":                           _n( 8.5, 62.5,  6.5, 6.0,18.5, 1.2),
    "granola":                          _n( 8.5, 60.5, 14.5, 4.5,22.5, 3.5),
    "corn flakes":                      _n( 7.5, 84.5,  0.4, 2.5, 8.5, 0.1),
    "pista pistachios":                 _n(20.6, 27.2, 45.4,10.3, 7.7, 5.6),
    "sunflower seeds":                  _n(20.8, 20.0, 51.5, 8.6, 2.6, 4.5),
    "pumpkin seeds":                    _n(30.2, 10.7, 49.1, 6.0, 1.4, 8.7),
    "protein bar":                      _n(20.5, 35.5, 10.5, 3.5,18.5, 4.5),
    "energy bar":                       _n( 8.5, 62.5,  8.5, 4.5,32.5, 2.5),

    # ════════════════════════════════════════════════════════════════════
    # CAFE / INTERNATIONAL — USDA estimates
    # ════════════════════════════════════════════════════════════════════
    "avocado toast":                    _n( 6.5, 18.5, 12.5, 5.5, 1.5, 2.5),
    "pancakes":                         _n( 6.5, 38.5,  6.5, 0.8,12.5, 2.5),
    "waffles":                          _n( 6.5, 38.5,  8.5, 0.8, 8.5, 2.5),
    "french toast":                     _n( 7.5, 32.5,  9.5, 0.8, 8.5, 2.5),
    "eggs benedict":                    _n(10.5, 15.5, 18.5, 0.5, 2.5, 6.5),
    "risotto mushroom":                 _n( 5.5, 28.5,  6.5, 1.5, 1.5, 2.5),
    "sushi rice roll":                  _n( 5.5, 25.5,  2.5, 0.8, 1.5, 0.5),
    "pad thai":                         _n( 8.5, 28.5,  8.5, 1.5, 4.5, 1.5),
    "tacos chicken":                    _n(12.5, 25.5,  8.5, 2.5, 2.5, 2.5),
    "burrito chicken":                  _n(10.5, 28.5,  7.5, 2.5, 2.5, 2.5),
    "pulled pork":                      _n(18.5, 12.5, 10.5, 0.5, 5.5, 3.5),
    "steak medium":                     _n(26.5,  0.0, 15.5, 0.0, 0.0, 6.0),
    "chicken wings":                    _n(22.5,  8.5, 18.5, 0.5, 0.5, 5.5),
    "fish and chips":                   _n(14.5, 28.5, 12.5, 2.0, 0.5, 2.5),
    "hummus":                           _n( 8.5, 14.3, 10.8, 4.0, 0.6, 1.5),
    "falafel":                          _n(13.3, 31.8, 17.8, 7.2, 2.8, 2.3),
    "kebab wrap":                       _n(12.5, 28.5,  9.5, 2.0, 3.5, 2.5),
    "nachos with cheese":               _n( 9.5, 58.5, 22.5, 4.5, 2.5, 8.5),
    "chicken quesadilla":               _n(13.5, 28.5, 12.5, 1.5, 2.5, 5.5),
}


# ── Category defaults (final fallback) ────────────────────────────────────────

CATEGORY_DEFAULTS: dict[str, dict] = {
    "Bread/roti/flatbreads":    _n( 8.0, 50.0,  8.0, 2.5,  2.0, 2.0),
    "Rice/biryani":             _n( 5.0, 25.0,  5.0, 1.0,  0.5, 1.0),
    "Dal/pulses/legumes":       _n( 7.0, 16.0,  3.0, 4.0,  0.5, 0.5),
    "Veg bhaji/sabzi":          _n( 2.5, 10.0,  5.0, 2.5,  2.0, 0.5),
    "Non-veg curry/dry":        _n(14.0,  6.0, 12.0, 0.5,  1.5, 3.5),
    "Dairy/milk products":      _n( 5.0,  8.0, 10.0, 0.0,  6.0, 5.0),
    "Dessert/mithai":           _n( 5.0, 45.0, 10.0, 0.5, 35.0, 5.0),
    "Street food/fast food":    _n( 5.0, 28.0, 10.0, 2.0,  3.0, 2.0),
    "Drink":                    _n( 0.5, 10.0,  0.5, 0.0,  9.0, 0.2),
    "Alcoholic drink":          _n( 0.2,  3.0,  0.0, 0.0,  0.5, 0.0),
    "Soup":                     _n( 3.0,  8.0,  2.5, 1.0,  2.0, 0.8),
    "South Indian":             _n( 4.0, 24.0,  4.0, 1.5,  0.5, 0.8),
    "Bakery/snacks/sweets":     _n( 7.0, 60.0, 15.0, 2.5, 20.0, 4.0),
    "Egg dishes":               _n(10.0,  2.0, 12.0, 0.0,  1.5, 3.5),
    "Fish/seafood":             _n(18.0,  4.0,  8.0, 0.0,  0.5, 2.0),
    "Fruits":                   _n( 1.0, 15.0,  0.3, 2.5, 12.0, 0.1),
    "Salad":                    _n( 3.0,  8.0,  6.0, 2.5,  3.0, 1.5),
    "Noodles/pasta":            _n( 6.0, 28.0,  7.0, 1.5,  2.5, 1.5),
    "Pizza":                    _n(11.5, 32.0, 11.5, 2.0,  3.5, 5.5),
    "Burger/sandwich":          _n(11.0, 28.0,  9.0, 2.0,  4.0, 2.5),
    "Chinese/Indo-Chinese":     _n( 6.0, 20.0,  7.0, 1.5,  3.0, 1.0),
    "Mughlai":                  _n(15.0,  8.0, 15.0, 0.5,  2.0, 6.0),
    "Protein/fitness foods":    _n(20.0, 20.0, 10.0, 3.0,  5.0, 2.0),
    "Cafe/international":       _n( 8.0, 25.0,  8.0, 2.0,  5.0, 3.0),
    "North Indian":             _n( 8.0, 20.0,  8.0, 2.0,  2.0, 2.5),
    "Gujarati":                 _n( 5.0, 25.0,  6.0, 3.0,  5.0, 1.0),
    "Bengali":                  _n(10.0, 12.0, 10.0, 1.0,  2.0, 3.0),
    "Rajasthani":               _n( 8.0, 25.0, 10.0, 2.5,  2.0, 3.0),
}


# ── USDA FoodData Central lookup ───────────────────────────────────────────────

_USDA_NUTRIENT_MAP = {
    1003: "protein_g",
    1004: "fat_g",
    1005: "carbs_g",
    1079: "fiber_g",
    2000: "sugar_g",
    1258: "saturated_fat_g",
}

async def fetch_usda(item_name: str, session: httpx.AsyncClient) -> dict | None:
    """Query USDA FoodData Central; return macro dict or None."""
    try:
        r = await session.get(
            USDA_SEARCH,
            params={
                "query":    item_name,
                "api_key":  USDA_API_KEY,
                "pageSize": 3,
                "dataType": "Foundation,SR Legacy",
            },
            timeout=10,
        )
        r.raise_for_status()
        foods = r.json().get("foods", [])
        if not foods:
            return None
        # pick best match — prefer Foundation > SR Legacy > branded
        food = foods[0]
        result: dict[str, float] = {}
        for n in food.get("foodNutrients", []):
            nid = n.get("nutrientId") or n.get("nutrientNumber")
            if isinstance(nid, str):
                nid = int(nid) if nid.isdigit() else None
            if nid in _USDA_NUTRIENT_MAP:
                result[_USDA_NUTRIENT_MAP[nid]] = round(float(n.get("value", 0)), 1)
        # require at least protein + carbs to accept the result
        if "protein_g" in result and "carbs_g" in result:
            for k in ("fat_g", "fiber_g", "sugar_g", "saturated_fat_g"):
                result.setdefault(k, 0.0)
            return result
    except Exception:
        pass
    return None


# ── Matching logic ─────────────────────────────────────────────────────────────

def _find_in_db(item_name: str) -> dict | None:
    n = _norm(item_name)
    # 1. exact
    if n in NUTRITION_DB:
        return NUTRITION_DB[n]
    # 2. db key substring of item name
    for k, v in NUTRITION_DB.items():
        if k in n:
            return v
    # 3. item name substring of db key
    words = n.split()
    if len(words) >= 2:
        for k, v in NUTRITION_DB.items():
            if all(w in k for w in words[:2]):
                return v
    return None


# ── Main enrichment ────────────────────────────────────────────────────────────

async def enrich_all(dry_run: bool, skip_usda: bool, force: bool) -> None:
    mongo_url = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
    db_name   = os.getenv("DATABASE_NAME", "calorie_tracker")
    client    = AsyncIOMotorClient(mongo_url)
    db        = client[db_name]

    cursor = db.foods.find({})
    items  = await cursor.to_list(length=None)
    total  = len(items)
    print(f"Found {total} food items in MongoDB.\n")

    stats = {"db": 0, "usda": 0, "default": 0, "skipped": 0}
    usda_call_count = 0

    async with httpx.AsyncClient() as session:
        for i, item in enumerate(items):
            name     = item.get("item", "")
            category = item.get("category", "")

            if not force and item.get("protein_g") is not None:
                stats["skipped"] += 1
                continue

            # ── determine nutrition ──
            source = "?"
            macros = _find_in_db(name)
            if macros:
                source = "NIN/IFCT-USDA-DB"
                stats["db"] += 1
            elif not skip_usda:
                await asyncio.sleep(0.05)   # gentle rate limit
                usda_call_count += 1
                macros = await fetch_usda(name, session)
                if macros:
                    source = "USDA-API"
                    stats["usda"] += 1
                # brief pause every 50 USDA calls to stay within rate limits
                if usda_call_count % 50 == 0:
                    print(f"  [rate-limit pause after {usda_call_count} USDA calls]")
                    await asyncio.sleep(2)

            if macros is None:
                macros = CATEGORY_DEFAULTS.get(
                    category,
                    _n(5.0, 20.0, 5.0, 2.0, 3.0, 1.5)
                )
                source = f"default({category})"
                stats["default"] += 1

            # ── determine food_type / serving_unit ──
            liquid = is_liquid(name, category)
            food_type    = "liquid" if liquid else "solid"
            serving_unit = "ml"     if liquid else "g"

            scoop_g = item.get("scoop_g") or 150.0
            bowl_g  = item.get("bowl_g")  or 300.0
            scoop_label, bowl_label = get_serving_labels(name, category, scoop_g, bowl_g)

            update = {
                **macros,
                "food_type":    food_type,
                "serving_unit": serving_unit,
                "scoop_label":  scoop_label,
                "bowl_label":   bowl_label,
            }

            if dry_run:
                print(f"[DRY-RUN {i+1}/{total}] {name[:50]:<50} | "
                      f"P:{macros['protein_g']:5.1f} C:{macros['carbs_g']:5.1f} "
                      f"F:{macros['fat_g']:5.1f} Fb:{macros['fiber_g']:5.1f} "
                      f"| {food_type:<6} | {source}")
            else:
                await db.foods.update_one(
                    {"_id": item["_id"]},
                    {"$set": update},
                )
                if (i + 1) % 100 == 0 or (i + 1) == total:
                    print(f"  [{i+1}/{total}] last: {name[:40]}")

    client.close()
    print(f"\n{'='*60}")
    print(f"Done.  DB-match: {stats['db']}  USDA-API: {stats['usda']}  "
          f"Default: {stats['default']}  Skipped (already enriched): {stats['skipped']}")
    print(f"{'='*60}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Enrich food items with macro data.")
    parser.add_argument("--dry-run",   action="store_true", help="Preview without writing to DB")
    parser.add_argument("--skip-usda", action="store_true", help="Skip USDA API, offline mode")
    parser.add_argument("--force",     action="store_true", help="Re-enrich already-enriched items")
    args = parser.parse_args()

    asyncio.run(enrich_all(
        dry_run   = args.dry_run,
        skip_usda = args.skip_usda,
        force     = args.force,
    ))
