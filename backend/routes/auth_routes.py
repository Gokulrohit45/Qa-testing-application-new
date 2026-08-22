import secrets
import hashlib
import time
import requests
from flask import Blueprint, request, jsonify
from config import BREVO_API_KEY, BREVO_SENDER_EMAIL, BREVO_SENDER_NAME, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
from utils.logger import logger

auth_bp = Blueprint("auth_bp", __name__)

# In-memory OTP storage cache: { email: { "otp": "123456", "expires_at": timestamp } }
OTP_CACHE = {}
OTP_REQUEST_WINDOW = {}
OTP_TTL_SECONDS = 10 * 60
OTP_MAX_ATTEMPTS = 5
OTP_REQUEST_LIMIT = 3
OTP_REQUEST_WINDOW_SECONDS = 15 * 60

def _supabase_headers(prefer=None):
    headers = {"apikey": SUPABASE_SERVICE_ROLE_KEY, "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}", "Content-Type": "application/json"}
    if prefer: headers["Prefer"] = prefer
    return headers

def _otp_get(email):
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return OTP_CACHE.get(email)
    response = requests.get(f"{SUPABASE_URL.rstrip('/')}/rest/v1/password_reset_otps",
        params={"email": f"eq.{email}", "select": "*"}, headers=_supabase_headers(), timeout=10)
    response.raise_for_status()
    rows = response.json()
    return rows[0] if rows else None

def _otp_save(email, record):
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        OTP_CACHE[email] = record
        return
    response = requests.post(f"{SUPABASE_URL.rstrip('/')}/rest/v1/password_reset_otps",
        params={"on_conflict": "email"}, json={"email": email, **record},
        headers=_supabase_headers("resolution=merge-duplicates"), timeout=10)
    response.raise_for_status()

def _otp_delete(email):
    OTP_CACHE.pop(email, None)
    if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
        response = requests.delete(f"{SUPABASE_URL.rstrip('/')}/rest/v1/password_reset_otps",
            params={"email": f"eq.{email}"}, headers=_supabase_headers(), timeout=10)
        response.raise_for_status()

def _otp_hash(email: str, otp: str) -> str:
    return hashlib.sha256(f"{email}:{otp}".encode("utf-8")).hexdigest()

def _rate_limited(email: str) -> bool:
    if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
        record = _otp_get(email)
        return bool(record and time.time() - record.get("window_started", 0) < OTP_REQUEST_WINDOW_SECONDS and record.get("request_count", 0) >= OTP_REQUEST_LIMIT)
    now = time.time()
    requests_for_email = [ts for ts in OTP_REQUEST_WINDOW.get(email, []) if now - ts < OTP_REQUEST_WINDOW_SECONDS]
    OTP_REQUEST_WINDOW[email] = requests_for_email
    return len(requests_for_email) >= OTP_REQUEST_LIMIT

def _update_supabase_password(email: str, new_password: str) -> tuple:
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        return False, "Password reset service is not configured"
    headers = {
        "apikey": SUPABASE_SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
        "Content-Type": "application/json"
    }
    try:
        response = requests.get(f"{SUPABASE_URL.rstrip('/')}/auth/v1/admin/users", headers=headers, timeout=15)
        response.raise_for_status()
        users = response.json().get("users", [])
        user = next((item for item in users if item.get("email", "").lower() == email), None)
        if not user:
            return False, "Account not found"
        update = requests.put(
            f"{SUPABASE_URL.rstrip('/')}/auth/v1/admin/users/{user['id']}",
            headers=headers, json={"password": new_password}, timeout=15
        )
        update.raise_for_status()
        return True, "Password updated"
    except Exception as exc:
        logger.error(f"Supabase password update failed: {exc}")
        return False, "Password could not be updated"

def send_brevo_otp_email(to_email: str, otp_code: str) -> tuple:
    """
    Sends transactional email via Brevo (Sendinblue) API v3.
    """
    if not BREVO_API_KEY or not BREVO_SENDER_EMAIL:
        return False, "Email delivery is not configured"

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

    if _rate_limited(email):
        return jsonify({"error": "Too many OTP requests. Try again later."}), 429

    otp_code = f"{secrets.randbelow(900000) + 100000}"
    expires_at = time.time() + OTP_TTL_SECONDS

    existing = _otp_get(email) or {}
    same_window = time.time() - existing.get("window_started", 0) < OTP_REQUEST_WINDOW_SECONDS
    record = {
        "otp_hash": _otp_hash(email, otp_code),
        "expires_at": expires_at,
        "attempts": 0,
        "verified": False,
        "request_count": existing.get("request_count", 0) + 1 if same_window else 1,
        "window_started": existing.get("window_started", time.time()) if same_window else time.time()
    }
    _otp_save(email, record)
    OTP_REQUEST_WINDOW.setdefault(email, []).append(time.time())

    success, msg = send_brevo_otp_email(email, otp_code)

    return jsonify({
        "success": success,
        "message": msg,
        "email": email
    }), 200 if success else 503

@auth_bp.route("/api/auth/verify-otp", methods=["POST"])
def verify_otp():
    data = request.json or {}
    email = data.get("email", "").strip().lower()
    otp_input = data.get("otp", "").strip()

    if not email or not otp_input:
        return jsonify({"error": "Email and OTP code are required"}), 400

    record = _otp_get(email)
    if not record:
        return jsonify({"error": "No OTP request found for this email address"}), 400

    if time.time() > record["expires_at"]:
        _otp_delete(email)
        return jsonify({"error": "OTP has expired. Please request a new code."}), 400

    record["attempts"] += 1
    _otp_save(email, record)
    if record["attempts"] > OTP_MAX_ATTEMPTS:
        _otp_delete(email)
        return jsonify({"error": "Too many invalid attempts. Request a new OTP."}), 429
    if not secrets.compare_digest(record["otp_hash"], _otp_hash(email, otp_input)):
        return jsonify({"error": "Invalid OTP code. Please check your email."}), 400

    record["verified"] = True
    _otp_save(email, record)
    return jsonify({"success": True, "message": "OTP verified successfully"}), 200

@auth_bp.route("/api/auth/reset-password", methods=["POST"])
def reset_password():
    data = request.json or {}
    email = data.get("email", "").strip().lower()
    otp_input = data.get("otp", "").strip()
    new_password = data.get("new_password", "").strip()

    if not email or not otp_input or not new_password:
        return jsonify({"error": "Email, OTP code, and new_password are required"}), 400

    record = _otp_get(email)
    if not record or time.time() > record.get("expires_at", 0) or not record.get("verified") or not secrets.compare_digest(record["otp_hash"], _otp_hash(email, otp_input)):
        return jsonify({"error": "Invalid or expired OTP session"}), 400

    if len(new_password) < 8:
        return jsonify({"error": "Password must contain at least 8 characters"}), 400

    success, message = _update_supabase_password(email, new_password)
    if not success:
        return jsonify({"error": message}), 503

    # Clear OTP
    _otp_delete(email)
    logger.info("Password reset successfully completed")

    return jsonify({"success": True, "message": "Password reset successfully. You can now log in."}), 200
