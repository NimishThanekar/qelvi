import os
import resend

resend.api_key = os.getenv("RESEND_API_KEY", "")

FROM_EMAIL = "Qelvi <onboarding@resend.dev>"


async def send_otp_email(to_email: str, otp: str) -> None:
    """Send a password-reset OTP email via Resend."""
    resend.Emails.send({
        "from": FROM_EMAIL,
        "to": [to_email],
        "subject": f"{otp} is your Qelvi password reset code",
        "html": f"""
        <div style="font-family:'DM Sans',sans-serif;background:#0a0a0a;color:#e5e5e5;padding:40px 0;min-height:100vh;">
          <div style="max-width:440px;margin:0 auto;background:#111111;border:1px solid #242424;border-radius:16px;padding:40px 36px;">
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:32px;">
              <div style="width:36px;height:36px;background:#a3e635;border-radius:10px;display:flex;align-items:center;justify-content:center;">
                <span style="color:#000;font-weight:900;font-size:14px;">Q</span>
              </div>
              <span style="font-size:18px;font-weight:700;color:#e5e5e5;letter-spacing:0.05em;">Qelvi</span>
            </div>

            <h2 style="margin:0 0 8px;font-size:20px;font-weight:600;color:#e5e5e5;">Reset your password</h2>
            <p style="margin:0 0 28px;font-size:14px;color:#a3a3a3;line-height:1.6;">
              Use the code below to reset your Qelvi password. It expires in <strong style="color:#e5e5e5;">15 minutes</strong>.
            </p>

            <div style="background:#181818;border:1px solid #242424;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px;">
              <span style="font-size:36px;font-weight:800;letter-spacing:0.3em;color:#a3e635;font-family:monospace;">{otp}</span>
            </div>

            <p style="margin:0;font-size:12px;color:#737373;line-height:1.6;">
              If you didn't request this, you can safely ignore this email. Your password won't change.
            </p>
          </div>
        </div>
        """,
    })
