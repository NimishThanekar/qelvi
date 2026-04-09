import logging
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from bson import ObjectId
from datetime import datetime, timedelta
from io import BytesIO
from typing import Optional
from app.database import get_db
from app.routers.auth import require_practitioner

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/practitioner", tags=["practitioner"])

_PRACTITIONER_RATE_LIMIT = 100  # requests per hour per practitioner


def _patient_filter(practitioner_id: ObjectId) -> dict:
    return {"practitioner_id": practitioner_id, "practitioner_consent": True}


async def _assert_patient(db, patient_id: str, practitioner_id: ObjectId) -> dict:
    """
    Validate the full chain: valid ObjectId, owned by this practitioner, consent active.
    Always returns 404 on any failure — never leak whether a patient_id exists.
    """
    try:
        oid = ObjectId(patient_id)
    except Exception:
        raise HTTPException(status_code=404, detail="Patient not found")
    patient = await db.users.find_one(
        {"_id": oid, **_patient_filter(practitioner_id)}
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


async def rate_limited_practitioner(
    request: Request,
    current_user: dict = Depends(require_practitioner),
) -> dict:
    """Combines practitioner auth with 100-req/hr rate limit."""
    db = get_db()
    now = datetime.utcnow()
    hour_key = now.strftime("%Y-%m-%dT%H")
    pid = str(current_user["_id"])

    rl_doc = await db.practitioner_rate_limits.find_one(
        {"practitioner_id": pid, "hour_key": hour_key}
    )
    if rl_doc and rl_doc.get("count", 0) >= _PRACTITIONER_RATE_LIMIT:
        raise HTTPException(
            status_code=429,
            detail="Rate limit exceeded. Maximum 100 requests per hour.",
        )

    await db.practitioner_rate_limits.update_one(
        {"practitioner_id": pid, "hour_key": hour_key},
        {
            "$inc": {"count": 1},
            "$setOnInsert": {"first_request_at": now},
        },
        upsert=True,
    )
    return current_user


async def _audit_log(
    db, practitioner_id: ObjectId, patient_id: str, action: str, request: Request
) -> None:
    """Insert one audit record into practitioner_access_log (TTL 90 days)."""
    forwarded = request.headers.get("X-Forwarded-For", "")
    ip = forwarded.split(",")[0].strip() if forwarded else (
        request.client.host if request.client else "unknown"
    )
    try:
        await db.practitioner_access_log.insert_one({
            "practitioner_id": practitioner_id,
            "patient_id": patient_id,
            "action": action,
            "timestamp": datetime.utcnow(),
            "ip_address": ip,
        })
    except Exception as exc:
        logger.warning("Failed to write practitioner audit log: %s", exc)


@router.get("/patients")
async def list_patients(current_user: dict = Depends(rate_limited_practitioner)):
    """Return all consenting patients linked to this practitioner."""
    db = get_db()
    pid = current_user["_id"]

    patients = await db.users.find(_patient_filter(pid)).to_list(length=500)

    now = datetime.utcnow()
    today_str = now.strftime("%Y-%m-%d")
    cutoff_active = now - timedelta(days=7)

    results = []
    for p in patients:
        uid = p["_id"]
        uid_str = str(uid)

        # Last log date
        last_log = await db.meal_logs.find_one(
            {"user_id": uid}, sort=[("date", -1)]
        )
        last_active = last_log["date"] if last_log else None

        # Days since last log
        days_since = None
        if last_active:
            try:
                last_dt = datetime.strptime(last_active, "%Y-%m-%d")
                days_since = (now - last_dt).days
            except ValueError:
                pass

        is_active = days_since is not None and days_since <= 7

        # 30-day avg calories
        since_30 = (now - timedelta(days=30)).strftime("%Y-%m-%d")
        pipeline_avg = [
            {"$match": {"user_id": uid, "date": {"$gte": since_30}}},
            {"$group": {"_id": "$date", "day_cal": {"$sum": "$total_calories"}}},
            {"$group": {"_id": None, "avg": {"$avg": "$day_cal"}}},
        ]
        avg_result = await db.meal_logs.aggregate(pipeline_avg).to_list(length=1)
        avg_calories = round(avg_result[0]["avg"], 1) if avg_result else None

        # Adherence rate: days with at least one log / 30
        days_with_logs = await db.meal_logs.distinct(
            "date", {"user_id": uid, "date": {"$gte": since_30}}
        )
        adherence_rate = round(len(days_with_logs) / 30 * 100, 1)

        # Current streak
        streak = 0
        check_date = now
        while True:
            d_str = check_date.strftime("%Y-%m-%d")
            logged = await db.meal_logs.find_one({"user_id": uid, "date": d_str})
            if logged:
                streak += 1
                check_date -= timedelta(days=1)
            else:
                break

        results.append({
            "patient_id": uid_str,
            "name": p.get("name", ""),
            "email": p.get("email", ""),
            "last_active": last_active,
            "days_since_last_log": days_since,
            "is_active": is_active,
            "avg_calories_30d": avg_calories,
            "calorie_goal": p.get("calorie_goal"),
            "adherence_rate": adherence_rate,
            "current_streak": streak,
        })

    return results


@router.get("/patients/{patient_id}/summary")
async def patient_summary(
    patient_id: str,
    request: Request,
    current_user: dict = Depends(rate_limited_practitioner),
):
    """Detailed summary for one patient."""
    db = get_db()
    p = await _assert_patient(db, patient_id, current_user["_id"])
    await _audit_log(db, current_user["_id"], patient_id, "view_summary", request)
    uid = p["_id"]
    now = datetime.utcnow()

    # Date ranges
    since_30 = (now - timedelta(days=30)).strftime("%Y-%m-%d")
    since_7 = (now - timedelta(days=7)).strftime("%Y-%m-%d")

    # Calorie stats (30d)
    pipeline_cal = [
        {"$match": {"user_id": uid, "date": {"$gte": since_30}}},
        {"$group": {"_id": "$date", "day_cal": {"$sum": "$total_calories"}}},
        {
            "$group": {
                "_id": None,
                "avg": {"$avg": "$day_cal"},
                "max": {"$max": "$day_cal"},
                "min": {"$min": "$day_cal"},
                "count": {"$sum": 1},
            }
        },
    ]
    cal_result = await db.meal_logs.aggregate(pipeline_cal).to_list(length=1)
    cal_stats = cal_result[0] if cal_result else {}

    # Meal pattern (count by meal_type, 30d)
    pipeline_meal = [
        {"$match": {"user_id": uid, "date": {"$gte": since_30}}},
        {"$group": {"_id": "$meal_type", "count": {"$sum": 1}}},
    ]
    meal_pattern_raw = await db.meal_logs.aggregate(pipeline_meal).to_list(length=20)
    meal_pattern = {r["_id"]: r["count"] for r in meal_pattern_raw}

    # Context pattern (30d)
    pipeline_ctx = [
        {"$match": {"user_id": uid, "date": {"$gte": since_30}, "context": {"$ne": None}}},
        {"$group": {"_id": "$context", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    ctx_raw = await db.meal_logs.aggregate(pipeline_ctx).to_list(length=20)
    context_pattern = {r["_id"]: r["count"] for r in ctx_raw}

    # Top foods (30d)
    pipeline_foods = [
        {"$match": {"user_id": uid, "date": {"$gte": since_30}}},
        {"$unwind": "$entries"},
        {"$group": {"_id": "$entries.food_name", "count": {"$sum": 1}, "total_cal": {"$sum": "$entries.calories"}}},
        {"$sort": {"count": -1}},
        {"$limit": 10},
    ]
    top_foods_raw = await db.meal_logs.aggregate(pipeline_foods).to_list(length=10)
    top_foods = [
        {"food_name": r["_id"], "times_logged": r["count"], "total_calories": round(r["total_cal"], 1)}
        for r in top_foods_raw
    ]

    # Weekly trend (last 4 weeks avg per week)
    weekly_trend = []
    for week_offset in range(3, -1, -1):
        w_start = (now - timedelta(days=(week_offset + 1) * 7)).strftime("%Y-%m-%d")
        w_end = (now - timedelta(days=week_offset * 7)).strftime("%Y-%m-%d")
        pipeline_wk = [
            {"$match": {"user_id": uid, "date": {"$gte": w_start, "$lt": w_end}}},
            {"$group": {"_id": "$date", "day_cal": {"$sum": "$total_calories"}}},
            {"$group": {"_id": None, "avg": {"$avg": "$day_cal"}}},
        ]
        wk_res = await db.meal_logs.aggregate(pipeline_wk).to_list(length=1)
        weekly_trend.append({
            "week_start": w_start,
            "week_end": w_end,
            "avg_calories": round(wk_res[0]["avg"], 1) if wk_res else None,
        })

    # Food variety score (unique foods in 30d)
    unique_foods = await db.meal_logs.aggregate([
        {"$match": {"user_id": uid, "date": {"$gte": since_30}}},
        {"$unwind": "$entries"},
        {"$group": {"_id": "$entries.food_id"}},
        {"$count": "total"},
    ]).to_list(length=1)
    food_variety_score = unique_foods[0]["total"] if unique_foods else 0

    # Adherence rate
    days_with_logs = await db.meal_logs.distinct(
        "date", {"user_id": uid, "date": {"$gte": since_30}}
    )
    adherence_rate = round(len(days_with_logs) / 30 * 100, 1)

    return {
        "patient_id": patient_id,
        "name": p.get("name", ""),
        "email": p.get("email", ""),
        "age": p.get("age"),
        "gender": p.get("gender"),
        "weight_kg": p.get("weight_kg"),
        "height_cm": p.get("height_cm"),
        "activity_level": p.get("activity_level"),
        "dietary_preferences": p.get("dietary_preferences", []),
        "calorie_goal": p.get("calorie_goal"),
        "is_pro": p.get("is_pro", False),
        "logging_stats": {
            "days_logged_30d": len(days_with_logs),
            "adherence_rate": adherence_rate,
        },
        "calorie_stats": {
            "avg_daily": round(cal_stats.get("avg", 0) or 0, 1),
            "max_daily": round(cal_stats.get("max", 0) or 0, 1),
            "min_daily": round(cal_stats.get("min", 0) or 0, 1),
        },
        "meal_pattern": meal_pattern,
        "context_pattern": context_pattern,
        "top_foods": top_foods,
        "weekly_trend": weekly_trend,
        "food_variety_score": food_variety_score,
    }


@router.get("/patients/{patient_id}/logs")
async def patient_logs(
    patient_id: str,
    start: str = Query(..., description="YYYY-MM-DD"),
    end: str = Query(..., description="YYYY-MM-DD"),
    request: Request = None,
    current_user: dict = Depends(rate_limited_practitioner),
):
    """Raw meal logs for a patient over a date range (max 90-day window)."""
    try:
        start_dt = datetime.strptime(start, "%Y-%m-%d")
        end_dt = datetime.strptime(end, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")
    if (end_dt - start_dt).days > 90:
        raise HTTPException(status_code=400, detail="Date range cannot exceed 90 days.")

    db = get_db()
    p = await _assert_patient(db, patient_id, current_user["_id"])
    if request:
        await _audit_log(db, current_user["_id"], patient_id, "view_logs", request)
    uid = p["_id"]

    logs = await db.meal_logs.find(
        {"user_id": uid, "date": {"$gte": start, "$lte": end}},
        sort=[("date", 1), ("created_at", 1)],
    ).to_list(length=1000)

    return [
        {
            "id": str(log["_id"]),
            "date": log["date"],
            "meal_type": log.get("meal_type"),
            "entries": log.get("entries", []),
            "total_calories": log.get("total_calories", 0),
            "context": log.get("context"),
            "notes": log.get("notes"),
            "source": log.get("source"),
            "created_at": log["created_at"].isoformat() if log.get("created_at") else None,
        }
        for log in logs
    ]


@router.get("/patients/{patient_id}/report")
async def patient_report(
    patient_id: str,
    days: int = Query(30, ge=7, le=90, description="Report window in days"),
    request: Request = None,
    current_user: dict = Depends(rate_limited_practitioner),
):
    """Structured JSON report for a patient."""
    db = get_db()
    p = await _assert_patient(db, patient_id, current_user["_id"])
    if request:
        await _audit_log(db, current_user["_id"], patient_id, "view_report", request)
    uid = p["_id"]
    now = datetime.utcnow()
    since = (now - timedelta(days=days)).strftime("%Y-%m-%d")
    today_str = now.strftime("%Y-%m-%d")

    logs = await db.meal_logs.find(
        {"user_id": uid, "date": {"$gte": since, "$lte": today_str}},
    ).to_list(length=5000)

    # Daily totals
    daily: dict[str, float] = {}
    for log in logs:
        d = log["date"]
        daily[d] = daily.get(d, 0) + log.get("total_calories", 0)

    days_logged = len(daily)
    avg_cal = round(sum(daily.values()) / days_logged, 1) if days_logged else None
    goal = p.get("calorie_goal") or 2000
    days_over_goal = sum(1 for v in daily.values() if v > goal)
    days_under_goal = sum(1 for v in daily.values() if v < goal * 0.8)

    # Meal type distribution
    meal_dist: dict[str, int] = {}
    for log in logs:
        mt = log.get("meal_type", "unknown")
        meal_dist[mt] = meal_dist.get(mt, 0) + 1

    # Context distribution
    ctx_dist: dict[str, int] = {}
    for log in logs:
        ctx = log.get("context")
        if ctx:
            ctx_dist[ctx] = ctx_dist.get(ctx, 0) + 1

    # Top foods
    food_counts: dict[str, dict] = {}
    for log in logs:
        for entry in log.get("entries", []):
            fn = entry.get("food_name", "")
            if fn not in food_counts:
                food_counts[fn] = {"count": 0, "total_cal": 0.0}
            food_counts[fn]["count"] += 1
            food_counts[fn]["total_cal"] += entry.get("calories", 0)
    top_foods = sorted(food_counts.items(), key=lambda x: x[1]["count"], reverse=True)[:10]

    return {
        "patient_id": patient_id,
        "patient_name": p.get("name", ""),
        "report_period": {"start": since, "end": today_str, "days": days},
        "generated_at": now.isoformat(),
        "calorie_goal": goal,
        "summary": {
            "days_logged": days_logged,
            "adherence_rate": round(days_logged / days * 100, 1),
            "avg_daily_calories": avg_cal,
            "days_over_goal": days_over_goal,
            "days_significantly_under_goal": days_under_goal,
        },
        "daily_calories": [
            {"date": d, "calories": round(v, 1)} for d, v in sorted(daily.items())
        ],
        "meal_type_distribution": meal_dist,
        "context_distribution": ctx_dist,
        "top_foods": [
            {
                "food_name": name,
                "times_logged": data["count"],
                "total_calories": round(data["total_cal"], 1),
            }
            for name, data in top_foods
        ],
    }


@router.get("/patients/{patient_id}/download-report")
async def download_patient_report(
    patient_id: str,
    days: int = Query(30, ge=7, le=90),
    request: Request = None,
    current_user: dict = Depends(rate_limited_practitioner),
):
    """Generate and stream a PDF nutrition report for a patient."""
    db = get_db()
    p = await _assert_patient(db, patient_id, current_user["_id"])
    if request:
        await _audit_log(db, current_user["_id"], patient_id, "download_report", request)
    uid = p["_id"]
    now = datetime.utcnow()
    since = (now - timedelta(days=days)).strftime("%Y-%m-%d")
    today_str = now.strftime("%Y-%m-%d")

    logs = await db.meal_logs.find(
        {"user_id": uid, "date": {"$gte": since, "$lte": today_str}},
    ).to_list(length=5000)

    # Build report data
    daily: dict[str, float] = {}
    for log in logs:
        d = log["date"]
        daily[d] = daily.get(d, 0) + log.get("total_calories", 0)

    days_logged = len(daily)
    avg_cal = round(sum(daily.values()) / days_logged, 1) if days_logged else 0
    goal = p.get("calorie_goal") or 2000
    adherence = round(days_logged / days * 100, 1)
    days_over = sum(1 for v in daily.values() if v > goal)

    food_counts: dict[str, dict] = {}
    for log in logs:
        for entry in log.get("entries", []):
            fn = entry.get("food_name", "")
            if fn not in food_counts:
                food_counts[fn] = {"count": 0, "total_cal": 0.0}
            food_counts[fn]["count"] += 1
            food_counts[fn]["total_cal"] += entry.get("calories", 0)
    top_foods = sorted(food_counts.items(), key=lambda x: x[1]["count"], reverse=True)[:10]

    # PDF generation
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.units import cm
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable

        buf = BytesIO()
        doc = SimpleDocTemplate(
            buf, pagesize=A4,
            leftMargin=2 * cm, rightMargin=2 * cm,
            topMargin=2 * cm, bottomMargin=2 * cm,
        )
        styles = getSampleStyleSheet()
        h1 = ParagraphStyle("H1", parent=styles["Heading1"], fontSize=18, spaceAfter=4)
        h2 = ParagraphStyle("H2", parent=styles["Heading2"], fontSize=13, spaceBefore=14, spaceAfter=4)
        normal = styles["Normal"]
        muted = ParagraphStyle("Muted", parent=normal, textColor=colors.HexColor("#6b7280"), fontSize=9)

        story = []

        # Header
        story.append(Paragraph(f"Nutrition Report — {p.get('name', '')}", h1))
        story.append(Paragraph(f"Period: {since} to {today_str} ({days} days) · Generated {today_str}", muted))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor("#e5e7eb"), spaceAfter=12))

        # Patient info
        story.append(Paragraph("Patient Profile", h2))
        info_rows = [
            ["Name", p.get("name", "—"), "Age", str(p.get("age", "—"))],
            ["Gender", p.get("gender", "—"), "Weight", f"{p.get('weight_kg', '—')} kg"],
            ["Activity", p.get("activity_level", "—"), "Calorie Goal", f"{goal} kcal"],
        ]
        info_table = Table(info_rows, colWidths=[3.5 * cm, 5.5 * cm, 3.5 * cm, 5.5 * cm])
        info_table.setStyle(TableStyle([
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#6b7280")),
            ("TEXTCOLOR", (2, 0), (2, -1), colors.HexColor("#6b7280")),
            ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
            ("FONTNAME", (3, 0), (3, -1), "Helvetica-Bold"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(info_table)

        # Summary stats
        story.append(Paragraph("Summary", h2))
        summary_rows = [
            ["Days Logged", f"{days_logged} / {days}", "Adherence Rate", f"{adherence}%"],
            ["Avg Daily Calories", f"{avg_cal} kcal", "Days Over Goal", str(days_over)],
        ]
        sum_table = Table(summary_rows, colWidths=[4.5 * cm, 4.5 * cm, 4.5 * cm, 4.5 * cm])
        sum_table.setStyle(TableStyle([
            ("FONTSIZE", (0, 0), (-1, -1), 9),
            ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#6b7280")),
            ("TEXTCOLOR", (2, 0), (2, -1), colors.HexColor("#6b7280")),
            ("FONTNAME", (1, 0), (1, -1), "Helvetica-Bold"),
            ("FONTNAME", (3, 0), (3, -1), "Helvetica-Bold"),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
        ]))
        story.append(sum_table)

        # Daily calories table
        if daily:
            story.append(Paragraph("Daily Calorie Log", h2))
            cal_rows = [["Date", "Calories", "vs Goal"]]
            for date_str, cal in sorted(daily.items()):
                diff = cal - goal
                diff_str = f"+{round(diff)}" if diff > 0 else str(round(diff))
                cal_rows.append([date_str, f"{round(cal)} kcal", diff_str])
            cal_table = Table(cal_rows, colWidths=[5 * cm, 5 * cm, 4 * cm])
            cal_table.setStyle(TableStyle([
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3f4f6")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
            ]))
            story.append(cal_table)

        # Top foods
        if top_foods:
            story.append(Paragraph("Top Foods (30 days)", h2))
            food_rows = [["Food", "Times Logged", "Avg Calories"]]
            for name, data in top_foods:
                avg = round(data["total_cal"] / data["count"]) if data["count"] else 0
                food_rows.append([name, str(data["count"]), f"{avg} kcal"])
            food_table = Table(food_rows, colWidths=[9 * cm, 3.5 * cm, 4.5 * cm])
            food_table.setStyle(TableStyle([
                ("FONTSIZE", (0, 0), (-1, -1), 9),
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f3f4f6")),
                ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f9fafb")]),
                ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#e5e7eb")),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
            ]))
            story.append(food_table)

        story.append(Spacer(1, 12))
        story.append(Paragraph("Generated by Qelvi · qelvi.com", muted))

        doc.build(story)
        buf.seek(0)
        filename = f"{p.get('name', 'patient').replace(' ', '_')}_nutrition_report_{since}_to_{today_str}.pdf"
        return StreamingResponse(
            buf,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )

    except ImportError:
        # reportlab not installed — return JSON report as fallback text
        import json
        report = {
            "patient": p.get("name"),
            "period": {"start": since, "end": today_str},
            "adherence_rate": adherence,
            "avg_daily_calories": avg_cal,
            "days_logged": days_logged,
            "top_foods": [{"name": n, "count": d["count"]} for n, d in top_foods],
        }
        content = json.dumps(report, indent=2).encode()
        filename = f"nutrition_report_{since}_to_{today_str}.json"
        return StreamingResponse(
            BytesIO(content),
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )


@router.get("/overview")
async def practitioner_overview(current_user: dict = Depends(rate_limited_practitioner)):
    """Aggregate dashboard stats for the practitioner."""
    db = get_db()
    pid = current_user["_id"]
    now = datetime.utcnow()
    since_7 = (now - timedelta(days=7)).strftime("%Y-%m-%d")
    since_30 = (now - timedelta(days=30)).strftime("%Y-%m-%d")

    patients = await db.users.find(_patient_filter(pid)).to_list(length=500)
    total = len(patients)

    active_ids = []
    inactive_ids = []
    adherence_rates = []
    attention_patients = []
    performing_patients = []

    for p in patients:
        uid = p["_id"]
        days_with_logs_30 = await db.meal_logs.distinct(
            "date", {"user_id": uid, "date": {"$gte": since_30}}
        )
        adherence = len(days_with_logs_30) / 30 * 100

        last_log = await db.meal_logs.find_one({"user_id": uid}, sort=[("date", -1)])
        last_active = last_log["date"] if last_log else None
        days_since = None
        if last_active:
            try:
                days_since = (now - datetime.strptime(last_active, "%Y-%m-%d")).days
            except ValueError:
                pass

        is_active = days_since is not None and days_since <= 7
        if is_active:
            active_ids.append(str(uid))
        else:
            inactive_ids.append(str(uid))

        adherence_rates.append(adherence)

        entry = {
            "patient_id": str(uid),
            "name": p.get("name", ""),
            "adherence_rate": round(adherence, 1),
            "days_since_last_log": days_since,
        }
        if adherence < 40 or (days_since is not None and days_since > 5):
            attention_patients.append(entry)
        if adherence >= 80:
            performing_patients.append(entry)

    avg_adherence = round(sum(adherence_rates) / total, 1) if total else 0

    attention_patients.sort(key=lambda x: x["adherence_rate"])
    performing_patients.sort(key=lambda x: x["adherence_rate"], reverse=True)

    return {
        "total_patients": total,
        "active_patients": len(active_ids),
        "inactive_patients": len(inactive_ids),
        "avg_adherence_rate": avg_adherence,
        "patients_needing_attention": attention_patients[:5],
        "top_performing_patients": performing_patients[:5],
    }
