"""
app/services/notifications.py

Web Push notification delivery via pywebpush.

Usage:
    from app.services.notifications import send_push

    await send_push(subscription_info, title, body, url="/dashboard")

subscription_info is the dict stored in user["push_subscription"]:
    {
        "endpoint": "https://fcm.googleapis.com/...",
        "keys": {
            "p256dh": "...",
            "auth": "..."
        }
    }

VAPID keys must be set in .env:
    VAPID_PUBLIC_KEY   — URL-safe base64 uncompressed EC public key
    VAPID_PRIVATE_KEY  — URL-safe base64 EC private key
    VAPID_CLAIMS_EMAIL — mailto: address for VAPID claims
"""

import json
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)


def _get_vapid_claims() -> dict:
    email = os.getenv("VAPID_CLAIMS_EMAIL", "admin@qelvi.com")
    return {"sub": f"mailto:{email}"}


def send_push_sync(subscription_info: dict, title: str, body: str, url: str = "/dashboard") -> bool:
    """
    Synchronous push send (run in a thread executor for async contexts).
    Returns True on success, False on failure.
    """
    vapid_private = os.getenv("VAPID_PRIVATE_KEY", "")
    vapid_public = os.getenv("VAPID_PUBLIC_KEY", "")

    if not vapid_private or not vapid_public:
        logger.warning("VAPID keys not configured — push notification skipped")
        return False

    try:
        from pywebpush import webpush, WebPushException  # type: ignore

        payload = json.dumps({"title": title, "body": body, "url": url})

        webpush(
            subscription_info=subscription_info,
            data=payload,
            vapid_private_key=vapid_private,
            vapid_claims=_get_vapid_claims(),
        )
        return True

    except Exception as exc:
        # 410 Gone = subscription expired/unsubscribed
        status = getattr(getattr(exc, "response", None), "status_code", None)
        if status == 410:
            logger.info("Push subscription expired (410): %s", subscription_info.get("endpoint", "")[:60])
        else:
            logger.warning("Push failed: %s", exc)
        return False


async def send_push(
    subscription_info: dict,
    title: str,
    body: str,
    url: str = "/dashboard",
) -> bool:
    """Async wrapper — runs the blocking webpush call in a thread pool."""
    import asyncio
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(
        None, send_push_sync, subscription_info, title, body, url
    )
