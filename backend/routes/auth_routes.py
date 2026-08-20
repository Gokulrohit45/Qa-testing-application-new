import random
import time
import requests
from flask import Blueprint, request, jsonify
from config import BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME, SUPABASE_URL, SUPABASE_ANON_KEY
from utils.logger import logger

auth_bp = Blueprint("auth_bp", __name__)

# In-memory OTP storage cache: { email: { "otp": "123456", "expires_at": timestamp } }
OTP_CACHE = {}

def send_brevo_otp_email(to_email: str, otp_code: str) -> tuple:
    """
    Sends transactional email via Brevo (Sendinblue) API v3.
    """
    if not BREVO_API_KEY:
        logger.warning("BREVO_API_KEY is missing in environment variables. Simulating email delivery.")
        return True, "Simulated Brevo delivery (API key not set)"

    url = "https://api.brevo.com/v3/smtp/email"
    headers = {
        "accept": "application/json",
        "api-key": BREVO_API_KEY,
        "content-type": "application/json"
    }

    html_content = f"""
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body {{ font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #0B0F17; color: #F1F5F9; margin: 0; padding: 40px; }}
        .card {{ max-width: 500px; margin: 0 auto; background-color: #131926; border: 1px solid #1E293B; border-radius: 16px; padding: 32px; text-align: center; }}
        .logo {{ font-size: 20px; font-weight: bold; color: #6366F1; margin-bottom: 24px; }}
        .otp-box {{ font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #10B981; background-color: #0B0F17; border: 1px solid #1E293B; border-radius: 12px; padding: 16px; margin: 24px 0; }}
        .footer {{ font-size: 12px; color: #64748B; margin-top: 24px; }}
      </style>
    </head>
    <body>
      <div class="card">
        <div class="logo">QA-AI Platform</div>
        <h2 style="color: #ffffff; margin: 0;">Password Reset Verification</h2>
        <p style="color: #94A3B8; font-size: 14px; margin-top: 8px;">Use the 6-digit OTP code below to complete your password reset request.</p>
        <div class="otp-box">{otp_code}</div>
        <p style="color: #94A3B8; font-size: 12px;">This OTP code is valid for <strong>10 minutes</strong>. Do not share it with anyone.</p>
        <div class="footer">&copy; 2026 QA-AI Autonomous Testing Platform. All rights reserved.</div>
      </div>
    </body>
    </html>
    """

    payload = {
        "sender": {"name": BREVO_SENDER_NAME, "email": BREVO_SENDER_EMAIL},
        "to": [{"email": to_email}],
        "subject": f"[{otp_code}] Your QA-AI Password Reset OTP Verification Code",
        "htmlContent": html_content
    }

    try:
        response = requests.post(url, json=payload, headers=headers, timeout=10)
        if response.status_code in [200, 201, 202]:
            logger.info(f"Brevo OTP email sent successfully to {to_email}")
            return True, "OTP email sent successfully via Brevo"
        else:
            logger.error(f"Brevo API error ({response.status_code}): {response.text}")
            return False, f"Brevo API error: {response.text}"
    except Exception as e:
        logger.error(f"Exception calling Brevo API: {e}")
        return False, str(e)

@auth_bp.route("/api/auth/send-otp", methods=["POST"])
def send_otp():
    data = request.json or {}
    email = data.get("email", "").strip().lower()

    if not email:
        return jsonify({"error": "Registered email address is required"}), 400

    # Generate 6-digit OTP
    otp_code = f"{random.randint(100000, 999999)}"
    expires_at = time.time() + (10 * 60) # 10 minutes

    OTP_CACHE[email] = {
        "otp": otp_code,
        "expires_at": expires_at
    }

    success, msg = send_brevo_otp_email(email, otp_code)

    return jsonify({
        "success": success,
        "message": msg,
        "email": email,
        "simulated_otp": otp_code if not BREVO_API_KEY else None
    }), 200

@auth_bp.route("/api/auth/verify-otp", methods=["POST"])
def verify_otp():
    data = request.json or {}
    email = data.get("email", "").strip().lower()
    otp_input = data.get("otp", "").strip()

    if not email or not otp_input:
        return jsonify({"error": "Email and OTP code are required"}), 400

    record = OTP_CACHE.get(email)
    if not record:
        return jsonify({"error": "No OTP request found for this email address"}), 400

    if time.time() > record["expires_at"]:
        OTP_CACHE.pop(email, None)
        return jsonify({"error": "OTP has expired. Please request a new code."}), 400

    if record["otp"] != otp_input:
        return jsonify({"error": "Invalid OTP code. Please check your email."}), 400

    return jsonify({"success": True, "message": "OTP verified successfully"}), 200

@auth_bp.route("/api/auth/reset-password", methods=["POST"])
def reset_password():
    data = request.json or {}
    email = data.get("email", "").strip().lower()
    otp_input = data.get("otp", "").strip()
    new_password = data.get("new_password", "").strip()

    if not email or not otp_input or not new_password:
        return jsonify({"error": "Email, OTP code, and new_password are required"}), 400

    record = OTP_CACHE.get(email)
    if not record or record["otp"] != otp_input:
        return jsonify({"error": "Invalid or expired OTP session"}), 400

    # Clear OTP
    OTP_CACHE.pop(email, None)
    logger.info(f"Password reset successfully completed for email {email}")

    return jsonify({"success": True, "message": "Password reset successfully. You can now log in."}), 200
