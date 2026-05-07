"""
Generates Qelvi_Formulas.docx — a reference document of all internal
calculation formulas used in the Qelvi calorie tracking app.
Run: python generate_formulas_doc.py
Requires: pip install python-docx
"""

from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml.ns import qn
from docx.oxml import OxmlElement
import datetime

# ── Colour palette ──────────────────────────────────────────────────────────
C_ACCENT  = RGBColor(0x1A, 0x56, 0xDB)   # blue headings
C_LABEL   = RGBColor(0x37, 0x41, 0x51)   # dark-grey labels
C_MUTED   = RGBColor(0x6B, 0x72, 0x80)   # grey notes
C_WHITE   = RGBColor(0xFF, 0xFF, 0xFF)
C_BG_HEAD = "1A56DB"                      # hex for table header bg
C_BG_ALT  = "EFF6FF"                      # light-blue alternate row

# ── Formula catalogue ────────────────────────────────────────────────────────
# Each entry: (section, name, expression, variables, used_in, source)
FORMULAS = [
    # ── Energy / Goal ─────────────────────────────────────────────────────
    {
        "section":    "1. Energy & Calorie Goal",
        "name":       "BMR — Male (Mifflin-St Jeor)",
        "expression": "BMR = (10 × W) + (6.25 × H) − (5 × A) + 5",
        "variables":  "W = body weight (kg)  |  H = height (cm)  |  A = age (years)",
        "used_in":    "Registration & Profile — auto-calculates calorie goal when body metrics are provided",
        "source":     "backend/app/services/auth.py → calculate_bmr()",
        "notes":      "Mifflin-St Jeor (1990) is the ICMR-recommended resting energy equation for adults.",
    },
    {
        "section":    "1. Energy & Calorie Goal",
        "name":       "BMR — Female (Mifflin-St Jeor)",
        "expression": "BMR = (10 × W) + (6.25 × H) − (5 × A) − 161",
        "variables":  "W = body weight (kg)  |  H = height (cm)  |  A = age (years)",
        "used_in":    "Registration & Profile — same trigger as male; constant differs by sex",
        "source":     "backend/app/services/auth.py → calculate_bmr()",
        "notes":      "The −161 constant accounts for the average metabolic difference between sexes.",
    },
    {
        "section":    "1. Energy & Calorie Goal",
        "name":       "TDEE (Total Daily Energy Expenditure)",
        "expression": "TDEE = BMR × Activity Multiplier",
        "variables":  (
            "Sedentary (desk job, no exercise) → 1.200\n"
            "Light (1–3 days/week exercise) → 1.375\n"
            "Moderate (3–5 days/week) → 1.550\n"
            "Active (6–7 days/week) → 1.725\n"
            "Very Active (twice-daily / physical job) → 1.900"
        ),
        "used_in":    "Registration & Profile — TDEE is set as the user's daily calorie goal (user can override it manually)",
        "source":     "backend/app/services/auth.py → calculate_tdee()",
        "notes":      "Multipliers follow Harris-Benedict revised activity coefficients (McArdle et al.).",
    },
    # ── Serving / Logging ─────────────────────────────────────────────────
    {
        "section":    "2. Per-Serving Calorie & Macro Calculation",
        "name":       "Calories — named serving (scoop / bowl / restaurant / piece)",
        "expression": "Calories = kcal_per_serving × quantity",
        "variables":  "kcal_per_serving = pre-calculated value stored in the foods database for each serving size",
        "used_in":    "Food Search Modal — shown in real-time as the user changes serving size or quantity",
        "source":     "frontend/src/components/FoodSearchModal.tsx → getCalories()",
        "notes":      "",
    },
    {
        "section":    "2. Per-Serving Calorie & Macro Calculation",
        "name":       "Calories — custom weight entry",
        "expression": "Calories = (kcal_per_100g × custom_grams / 100) × quantity",
        "variables":  (
            "kcal_per_100g = energy density stored per food item\n"
            "custom_grams = user-entered weight in grams or ml\n"
            "quantity = number of servings"
        ),
        "used_in":    "Food Search Modal — when the user selects 'Custom' and types a weight",
        "source":     "frontend/src/components/FoodSearchModal.tsx → getCalories()",
        "notes":      "",
    },
    {
        "section":    "2. Per-Serving Calorie & Macro Calculation",
        "name":       "Total serving weight",
        "expression": "total_weight = serving_weight_g × quantity",
        "variables":  (
            "serving_weight_g = scoop_g / bowl_g / piece_g / restaurant_g, or custom_grams\n"
            "quantity = multiplier entered by user"
        ),
        "used_in":    "Food Search Modal & meal log entries stored in the database",
        "source":     "frontend/src/components/FoodSearchModal.tsx → getWeight()",
        "notes":      "",
    },
    {
        "section":    "2. Per-Serving Calorie & Macro Calculation",
        "name":       "Per-serving macronutrient (protein / carbs / fat / fiber / sugar / saturated fat)",
        "expression": "macro_g = macro_per_100g × (total_weight_g / 100)",
        "variables":  (
            "macro_per_100g = stored per food item in the database (source: NIN/IFCT 2017 for Indian foods; USDA FoodData Central for international foods)\n"
            "total_weight_g = serving_weight_g × quantity"
        ),
        "used_in":    "Food Search Modal (macro breakdown preview card) — and saved into each meal log entry for Dashboard aggregation",
        "source":     "frontend/src/components/FoodSearchModal.tsx → getMacros()",
        "notes":      "All macro values are stored per 100 g (or 100 ml for liquids). Values are scaled linearly to the actual serving weight.",
    },
    {
        "section":    "2. Per-Serving Calorie & Macro Calculation",
        "name":       "kcal_per_100g for custom foods",
        "expression": "kcal_per_100g = (calories_per_serving / serving_size_g) × 100",
        "variables":  (
            "calories_per_serving = total calories the user enters for their custom food\n"
            "serving_size_g = the reference serving weight they specify"
        ),
        "used_in":    "My Foods — when a user creates a custom food item",
        "source":     "backend/app/routers/custom_foods.py",
        "notes":      "Normalised to per-100g so it can be used in the same serving-size formula as database foods.",
    },
    # ── Progress / Ring ───────────────────────────────────────────────────
    {
        "section":    "3. Daily Progress",
        "name":       "Calorie progress percentage",
        "expression": "progress_pct = min(consumed / calorie_goal × 100, 100)",
        "variables":  (
            "consumed = sum of all meal log calories for the day\n"
            "calorie_goal = user's daily goal (auto-set or manually overridden)"
        ),
        "used_in":    "Dashboard — calorie ring fill and 'Progress' stat card",
        "source":     "frontend/src/pages/Dashboard.tsx (derived variable pct)",
        "notes":      "Capped at 100 % for display; the ring turns orange at ≥ 90 % and red at ≥ 100 %.",
    },
    {
        "section":    "3. Daily Progress",
        "name":       "Remaining calories",
        "expression": "remaining = max(0, calorie_goal − consumed)",
        "variables":  "Same as above",
        "used_in":    "Dashboard — 'remaining' label and meal suggestion calorie cap",
        "source":     "frontend/src/pages/Dashboard.tsx (derived variable remaining)",
        "notes":      "",
    },
    # ── Calorie Pace ─────────────────────────────────────────────────────
    {
        "section":    "4. Calorie Pace Projection",
        "name":       "Day elapsed fraction",
        "expression": "fraction = (current_hour − 7) / 15",
        "variables":  (
            "current_hour = current time expressed as decimal hours (e.g. 14:30 = 14.5)\n"
            "7 = eating window start (07:00)\n"
            "15 = eating window duration (07:00–22:00 = 15 hours)"
        ),
        "used_in":    "Dashboard CaloriePace card — projection is only shown during the eating window",
        "source":     "frontend/src/components/CaloriePace.tsx",
        "notes":      "Outside 07:00–22:00 the component is hidden. Fraction must be > 0.05 before projection is shown.",
    },
    {
        "section":    "4. Calorie Pace Projection",
        "name":       "Projected end-of-day calories",
        "expression": "projected = consumed / fraction",
        "variables":  (
            "consumed = calories logged so far today\n"
            "fraction = elapsed fraction of the eating window (see above)"
        ),
        "used_in":    "Dashboard CaloriePace card — shown as '~X kcal projected today'",
        "source":     "frontend/src/components/CaloriePace.tsx",
        "notes":      "",
    },
    {
        "section":    "4. Calorie Pace Projection",
        "name":       "Pace status thresholds",
        "expression": (
            "diff_pct = (projected − goal) / goal × 100\n"
            "On track: diff_pct ≤ 10 %\n"
            "Might exceed: 10 % < diff_pct ≤ 30 %\n"
            "Will exceed: diff_pct > 30 %"
        ),
        "variables":  "projected and goal as defined above",
        "used_in":    "Dashboard CaloriePace card — colour-coded status badge",
        "source":     "frontend/src/components/CaloriePace.tsx",
        "notes":      "",
    },
    # ── Recovery Day ─────────────────────────────────────────────────────
    {
        "section":    "5. Recovery Day Detection",
        "name":       "Yesterday's calorie surplus %",
        "expression": "surplus_pct = (yesterday_calories − calorie_goal) / calorie_goal × 100",
        "variables":  (
            "yesterday_calories = total calories logged on the previous day\n"
            "calorie_goal = user's daily goal"
        ),
        "used_in":    "Dashboard — triggers the recovery-day banner when surplus_pct > 20 %",
        "source":     "backend/app/routers/logs.py → get_day_status()",
        "notes":      "A surplus above 20 % (i.e. > 120 % of goal) flags the next day as a recovery day and surfaces a lighter-eating nudge.",
    },
    # ── Festival Adjustment ───────────────────────────────────────────────
    {
        "section":    "6. Festival Goal Adjustment",
        "name":       "Adjusted calorie goal during a festival",
        "expression": "adjusted_goal = round(base_goal × goal_multiplier)",
        "variables":  (
            "base_goal = user's normal daily calorie goal\n"
            "goal_multiplier per festival type:\n"
            "  Feast (Diwali, Onam, Eid, Lohri, Pongal) → 1.25\n"
            "  Sweet-heavy (Sankranti, Ganesh Chaturthi) → 1.15\n"
            "  Mixed (Holi, Durga Puja, Dussehra) → 1.10\n"
            "  Fast (Navratri, Maha Shivaratri, Janmashtami, Ramadan) → 0.70"
        ),
        "used_in":    "Daily Summary API & Dashboard calorie ring — only applied when the user's festival_mode = 'full'; in 'awareness' mode the base goal is unchanged",
        "source":     "backend/app/data/festivals.py → compute_festival_adjustment()",
        "notes":      "Multipliers were calibrated against typical reported intake patterns during Indian festivals. Verify with your dietician for clinical use.",
    },
    # ── Weekly Analytics ─────────────────────────────────────────────────
    {
        "section":    "7. Weekly Wrap Analytics",
        "name":       "Average daily calories (week)",
        "expression": "avg_daily = total_week_calories / days_logged",
        "variables":  (
            "total_week_calories = sum of all calories logged during the week\n"
            "days_logged = number of distinct days with at least one log entry"
        ),
        "used_in":    "Weekly Wrap card — 'Avg/day' stat",
        "source":     "backend/app/routers/logs.py → weekly_wrap()",
        "notes":      "Days with no log entry are excluded from the denominator (logged days only).",
    },
    {
        "section":    "7. Weekly Wrap Analytics",
        "name":       "Week-over-week calorie change",
        "expression": "vs_previous_week_pct = (current_avg − previous_avg) / previous_avg × 100",
        "variables":  (
            "current_avg = avg_daily for the week being reviewed\n"
            "previous_avg = avg_daily for the 7-day window immediately before that"
        ),
        "used_in":    "Weekly Wrap card — 'vs previous week' line (e.g. +8% avg cals)",
        "source":     "backend/app/routers/logs.py → weekly_wrap()",
        "notes":      "Positive = calories went up; negative = went down. Not shown when previous week has no data.",
    },
    # ── Context Insights ─────────────────────────────────────────────────
    {
        "section":    "8. Context (Eating-Location) Insights",
        "name":       "Per-context average calories",
        "expression": "avg_calories_ctx = sum(daily_calories_in_context) / count(log_entries_in_context)",
        "variables":  "Context = tagged eating location: home, office, restaurant, street food, travel, party, late night",
        "used_in":    "Context Stats API, Food Search Modal context insight blurb, Insights page (Pro)",
        "source":     "backend/app/routers/logs.py → get_context_stats() — last 60 days",
        "notes":      "",
    },
    {
        "section":    "8. Context (Eating-Location) Insights",
        "name":       "Context vs home delta",
        "expression": "vs_home_delta = avg_calories_ctx − avg_calories_home",
        "variables":  (
            "avg_calories_ctx = average calories for the given context\n"
            "avg_calories_home = average calories when eating at home"
        ),
        "used_in":    "Food Search Modal — shown when a context is selected (e.g. 'Your restaurant meals are 32% above home meals')",
        "source":     "backend/app/routers/logs.py → get_context_stats()",
        "notes":      "Displayed as a percentage when |delta| ≥ 80 kcal: absPct = |delta| / avg_calories_home × 100",
    },
    {
        "section":    "8. Context (Eating-Location) Insights",
        "name":       "Context over-goal rate",
        "expression": "over_goal_pct = (days_over_goal_in_context / total_days_in_context) × 100",
        "variables":  (
            "days_over_goal_in_context = days where the daily total exceeded calorie_goal while that context was tagged\n"
            "total_days_in_context = distinct days with logs in that context"
        ),
        "used_in":    "Context Stats, Food Search Modal insight text, Insights page (Pro)",
        "source":     "backend/app/routers/logs.py → get_context_stats()",
        "notes":      "",
    },
    {
        "section":    "8. Context (Eating-Location) Insights",
        "name":       "Context trend % (30-day rolling, Pro)",
        "expression": "trend_pct = (current_30d_avg − prior_30d_avg) / prior_30d_avg × 100",
        "variables":  (
            "current_30d_avg = avg calories for this context in the last 30 days\n"
            "prior_30d_avg = avg calories for this context in days 31–60 ago"
        ),
        "used_in":    "Insights page (Pro only) — trend arrow per context",
        "source":     "backend/app/routers/logs.py → get_context_insights()",
        "notes":      "Positive = calories in this context increased vs the prior 30-day window.",
    },
    # ── Food Personality ──────────────────────────────────────────────────
    {
        "section":    "9. Food Personality Scoring (Pro)",
        "name":       "Consistency % (on-target days)",
        "expression": "consistency_pct = (on_target_days / tracked_days) × 100",
        "variables":  (
            "on_target_days = days where consumed calories were 70 %–110 % of calorie_goal\n"
            "tracked_days = total distinct days with at least one log in the last 60 days"
        ),
        "used_in":    "Food Personality card (Pro) — drives the 'Consistent Tracker' and 'The Balanced One' personality scores",
        "source":     "backend/app/routers/logs.py → get_food_personality()",
        "notes":      "The 70 %–110 % band is intentionally wide to accommodate natural day-to-day variation.",
    },
    {
        "section":    "9. Food Personality Scoring (Pro)",
        "name":       "Consistent Tracker score",
        "expression": "score = (tracked_days / 60) × 50 + consistency_pct × 0.5",
        "variables":  "tracked_days and consistency_pct as defined above",
        "used_in":    "Food Personality card — personality type selection",
        "source":     "backend/app/routers/logs.py → get_food_personality()",
        "notes":      "",
    },
    {
        "section":    "9. Food Personality Scoring (Pro)",
        "name":       "Weekend Warrior score",
        "expression": "ww_ratio = (weekend_avg − weekday_avg) / weekday_avg",
        "variables":  (
            "weekend_avg = average meal calories on Saturday and Sunday\n"
            "weekday_avg = average meal calories Monday–Friday"
        ),
        "used_in":    "Food Personality card — personality type selection",
        "source":     "backend/app/routers/logs.py → get_food_personality()",
        "notes":      "Score is only computed when weekday_avg > 0.",
    },
    # ── Macro Dashboard ───────────────────────────────────────────────────
    {
        "section":    "10. Daily Macro Progress (Dashboard)",
        "name":       "Daily macro totals",
        "expression": "daily_macro = Σ (macro_g per entry) across all meal log entries for the day",
        "variables":  "macro_g per entry = macro_per_100g × (entry_weight_g / 100)  [stored at log time]",
        "used_in":    "Dashboard 'Macros Today' card — aggregated from the daily summary",
        "source":     "frontend/src/pages/Dashboard.tsx (derived variables macroTotals)",
        "notes":      "Only shown when at least one logged entry has macro data (i.e. after the food database has been enriched).",
    },
    {
        "section":    "10. Daily Macro Progress (Dashboard)",
        "name":       "Protein daily reference goal",
        "expression": "protein_goal = weight_kg × 0.8   (default: 50 g if weight unknown)",
        "variables":  "weight_kg = user's body weight from profile",
        "used_in":    "Dashboard macro progress bar for protein",
        "source":     "frontend/src/pages/Dashboard.tsx (derived variable proteinGoal)",
        "notes":      "0.8 g/kg is the WHO/ICMR Recommended Dietary Allowance (RDA) for sedentary adults. Athletes may need 1.2–2.0 g/kg — verify with dietician.",
    },
    {
        "section":    "10. Daily Macro Progress (Dashboard)",
        "name":       "Carbohydrate, fat, and fiber daily reference goals",
        "expression": "Carbs: 250 g/day  |  Fat: 65 g/day  |  Fiber: 25 g/day",
        "variables":  "Fixed reference values based on a 2000 kcal/day reference diet",
        "used_in":    "Dashboard macro progress bars for carbs, fat, and fiber",
        "source":     "frontend/src/pages/Dashboard.tsx",
        "notes":      "These are indicative reference values (based on ICMR 2020 Dietary Guidelines and WHO/FAO targets). They do not scale with the user's individual calorie goal — verify appropriate targets with a dietician for clinical use.",
    },
]

# ── Build document ────────────────────────────────────────────────────────────

def set_cell_bg(cell, hex_color: str):
    """Set background fill colour of a table cell."""
    tc   = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd  = OxmlElement("w:shd")
    shd.set(qn("w:val"),   "clear")
    shd.set(qn("w:color"), "auto")
    shd.set(qn("w:fill"),  hex_color)
    tcPr.append(shd)


def add_cell_text(cell, text: str, bold=False, italic=False, size=9,
                  color: RGBColor = C_LABEL, mono=False):
    """Replace all runs in a cell with styled text (supports multiline via \\n)."""
    cell.text = ""
    para = cell.paragraphs[0]
    for line in text.split("\n"):
        run = para.add_run(line)
        run.bold   = bold
        run.italic = italic
        run.font.size  = Pt(size)
        run.font.color.rgb = color
        if mono:
            run.font.name = "Courier New"
        para.add_run("\n")  # soft return within cell


doc = Document()

# Page margins
for section in doc.sections:
    section.top_margin    = Inches(0.85)
    section.bottom_margin = Inches(0.85)
    section.left_margin   = Inches(0.9)
    section.right_margin  = Inches(0.9)

# ── Title block ──────────────────────────────────────────────────────────────
title_para = doc.add_paragraph()
title_para.alignment = WD_ALIGN_PARAGRAPH.CENTER
run = title_para.add_run("Qelvi — Internal Formula Reference")
run.bold = True
run.font.size = Pt(20)
run.font.color.rgb = C_ACCENT

sub = doc.add_paragraph()
sub.alignment = WD_ALIGN_PARAGRAPH.CENTER
sub_run = sub.add_run(
    f"For dietician review  ·  Generated {datetime.date.today().strftime('%d %B %Y')}"
)
sub_run.font.size  = Pt(10)
sub_run.font.color.rgb = C_MUTED
sub_run.italic = True

doc.add_paragraph()  # spacer

intro = doc.add_paragraph(
    "This document lists every calculation formula used inside the Qelvi calorie "
    "tracking application. Formulas are grouped by feature area. Each entry shows "
    "the algebraic expression, variable definitions, the in-app feature it drives, "
    "and the source file for developer reference. Notes flag any assumptions or "
    "values that should be reviewed by a registered dietician."
)
intro.runs[0].font.size = Pt(10)
intro.runs[0].font.color.rgb = C_LABEL

doc.add_paragraph()  # spacer

# ── Group formulas by section ────────────────────────────────────────────────
from itertools import groupby
key_fn = lambda f: f["section"]
sorted_formulas = sorted(FORMULAS, key=key_fn)

for section_name, group in groupby(sorted_formulas, key=key_fn):
    entries = list(group)

    # Section heading
    h = doc.add_heading(section_name, level=1)
    for run in h.runs:
        run.font.color.rgb = C_ACCENT
        run.font.size = Pt(13)
    h.paragraph_format.space_before = Pt(14)
    h.paragraph_format.space_after  = Pt(4)

    for f in entries:
        # Formula sub-heading
        sh = doc.add_heading(f["name"], level=2)
        for run in sh.runs:
            run.font.color.rgb = C_LABEL
            run.font.size = Pt(10.5)
        sh.paragraph_format.space_before = Pt(8)
        sh.paragraph_format.space_after  = Pt(2)

        # 5-row table
        cols = (1.3, 5.2)   # inches: label col | content col
        tbl = doc.add_table(rows=0, cols=2)
        tbl.style = "Table Grid"
        tbl.alignment = WD_TABLE_ALIGNMENT.LEFT

        def add_row(label, content, content_mono=False, content_italic=False):
            row = tbl.add_row()
            row.cells[0].width = Inches(cols[0])
            row.cells[1].width = Inches(cols[1])
            set_cell_bg(row.cells[0], "F0F4FF")
            add_cell_text(row.cells[0], label,   bold=True,  size=9, color=C_ACCENT)
            add_cell_text(row.cells[1], content, italic=content_italic,
                          size=9, color=C_LABEL, mono=content_mono)

        add_row("Formula",    f["expression"], content_mono=True)
        add_row("Variables",  f["variables"])
        add_row("Used in",    f["used_in"])
        add_row("Source file", f["source"],   content_mono=True)
        if f.get("notes"):
            add_row("⚕ Notes", f["notes"], content_italic=True)

        doc.add_paragraph()  # gap between formulas

# ── Glossary ─────────────────────────────────────────────────────────────────
doc.add_page_break()
gh = doc.add_heading("Glossary", level=1)
for run in gh.runs:
    run.font.color.rgb = C_ACCENT
    run.font.size = Pt(13)

glossary = [
    ("BMR",         "Basal Metabolic Rate — calories burned at complete rest"),
    ("TDEE",        "Total Daily Energy Expenditure — BMR adjusted for physical activity"),
    ("kcal",        "kilocalorie, the unit used for food energy throughout the app"),
    ("NIN/IFCT",    "National Institute of Nutrition / Indian Food Composition Tables (2017) — primary source for Indian food macro data"),
    ("USDA FDC",    "USDA FoodData Central — primary source for international food macro data"),
    ("WHO/ICMR",    "World Health Organization / Indian Council of Medical Research — reference bodies for dietary guidelines"),
    ("RDA",         "Recommended Dietary Allowance — the average daily intake sufficient to meet the nutrient requirement of nearly all healthy individuals"),
    ("Context",     "Eating location tagged at log time: home, office, restaurant, street food, travel, party, late night"),
    ("Food Personality", "A Pro feature that assigns a behavioural archetype based on 60 days of log history"),
    ("Festival mode", "User-selectable mode ('off', 'awareness', 'full') that optionally adjusts the calorie goal during major Indian festivals"),
    ("Recovery day", "A day flagged by the app when the previous day's intake exceeded the calorie goal by more than 20 %"),
]

gtbl = doc.add_table(rows=1, cols=2)
gtbl.style = "Table Grid"
header_row = gtbl.rows[0]
for i, txt in enumerate(["Term", "Definition"]):
    set_cell_bg(header_row.cells[i], C_BG_HEAD)
    p = header_row.cells[i].paragraphs[0]
    run = p.add_run(txt)
    run.bold = True
    run.font.size = Pt(9.5)
    run.font.color.rgb = C_WHITE

for term, defn in glossary:
    row = gtbl.add_row()
    add_cell_text(row.cells[0], term, bold=True,  size=9, color=C_LABEL)
    add_cell_text(row.cells[1], defn, size=9, color=C_LABEL)

# ── Footer note ───────────────────────────────────────────────────────────────
doc.add_paragraph()
fn = doc.add_paragraph(
    "⚕ Note: The macro reference goals (protein, carbs, fat, fiber) and festival "
    "goal multipliers are based on population-level dietary guidelines and are not "
    "personalised clinical recommendations. They should be reviewed and, where "
    "necessary, adjusted by a registered dietician before use in any clinical or "
    "medically supervised programme."
)
fn.runs[0].font.size  = Pt(9)
fn.runs[0].font.color.rgb = C_MUTED
fn.runs[0].italic = True

# ── Save ─────────────────────────────────────────────────────────────────────
out = "Qelvi_Formulas.docx"
doc.save(out)
print(f"Saved: {out}")
