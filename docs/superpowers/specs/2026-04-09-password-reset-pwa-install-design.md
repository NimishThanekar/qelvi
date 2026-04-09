# Design: Password Reset (OTP) + Permanent PWA Install

**Date:** 2026-04-09  
**Status:** Approved

---

## Feature 1: Forgot Password via 6-Digit OTP (Resend)

### User Flow

1. User clicks "Forgot password?" link on `/login`
2. Navigates to `/forgot-password` — enters email address
3. Backend sends a 6-digit OTP via Resend to that email (15-min expiry)
4. User is redirected to `/reset-password`
5. User enters OTP + new password → password updated, redirected to `/login`

### Backend

**New endpoints in `backend/app/routers/auth.py`:**

- `POST /auth/forgot-password`
  - Body: `{ email: str }`
  - Checks user exists by email. If user has no password (Google-only), returns 400 with a friendly message.
  - Rate limit: 3 requests per email per hour (stored in `password_resets` attempt counter).
  - Generates a cryptographically random 6-digit OTP.
  - Hashes the OTP with SHA-256 before storing.
  - Upserts a document in `password_resets` collection: `{ email, otp_hash, expires_at (15 min), attempts: 0 }`.
  - Sends email via Resend Python SDK.
  - Always returns `{ message: "If that email exists, an OTP has been sent." }` (no user enumeration).

- `POST /auth/reset-password`
  - Body: `{ email: str, otp: str, new_password: str }`
  - Looks up `password_resets` by email.
  - Checks: document exists, not expired, attempts < 5 (brute-force guard), OTP hash matches.
  - On mismatch: increments attempts counter, returns 400.
  - On match: updates user password (hashed), sets `password_changed_at = now`, deletes the reset document, returns 200.

**New Pydantic models in `backend/app/models/schemas.py`:**
- `ForgotPasswordRequest`: `email: str`
- `ResetPasswordRequest`: `email: str, otp: str, new_password: str`

**New MongoDB collection: `password_resets`**
```
{ email, otp_hash, expires_at, attempts, created_at }
```
- TTL index on `expires_at` (auto-cleanup)
- Index on `email`

**Environment variable:** `RESEND_API_KEY` added to `backend/.env`

**New service helper `backend/app/services/email.py`:**
- `send_otp_email(to_email: str, otp: str) -> None` — sends the OTP email via Resend SDK.

### Frontend

**New pages:**
- `frontend/src/pages/ForgotPassword.tsx` — email input form, calls `POST /auth/forgot-password`, redirects to `/reset-password?email=...`
- `frontend/src/pages/ResetPassword.tsx` — OTP + new password form, calls `POST /auth/reset-password`, redirects to `/login` on success

**Changes to existing files:**
- `frontend/src/pages/Login.tsx` — add "Forgot password?" link below the Sign in button
- `frontend/src/lib/api.ts` — add `forgotPassword(email)` and `resetPassword(email, otp, newPassword)` helpers
- `frontend/src/App.tsx` — add `/forgot-password` and `/reset-password` as public routes

**UX details:**
- Google-only accounts: if backend returns 400 with the Google sign-in message, show it inline (no redirect)
- OTP input: single text field, numeric, maxLength=6
- New password: standard password field with show/hide toggle
- Success toast + redirect to `/login` after reset

---

## Feature 2: Permanent PWA Install in Sidebar/Nav

### Architecture

**New hook `frontend/src/hooks/usePWAInstall.ts`:**
- Listens for `beforeinstallprompt` event globally.
- Exposes `{ canInstall: boolean, triggerInstall: () => Promise<void> }`.
- `canInstall` becomes true when the event fires, false after successful install (outcome === "accepted").
- No localStorage involvement — event availability is the source of truth.

**Changes to `frontend/src/components/InstallBanner.tsx`:**
- Replace localStorage permanent-dismiss with session-only dismiss (component state only).
- Use the `usePWAInstall` hook instead of its own event listener.
- Banner disappears on dismiss or install, reappears on next page load if not yet installed.

**Changes to `frontend/src/components/Layout.tsx`:**
- Import `usePWAInstall` hook.
- Add "Install App" nav item at the bottom of both the desktop sidebar and mobile drawer nav list.
- Only renders when `canInstall` is true.
- Icon: `Download` from lucide-react.
- On click: calls `triggerInstall()`.
- Disappears automatically after install (canInstall becomes false).

---

## Constraints & Non-Goals

- No macro/nutrition data changes.
- No changes to the subscription or Razorpay flow.
- Password reset does not work for Google-only accounts — they are told to use Google sign-in.
- OTP is single-use and expires in 15 minutes.
- No SMS fallback.
