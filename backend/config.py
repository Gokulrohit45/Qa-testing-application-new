import os
from pathlib import Path
from dotenv import load_dotenv

# Local development may opt in to dotenv. Packaged builds receive configuration
# through their process environment and never need to ship a secrets file.
if os.getenv("QA_AI_DESKTOP") != "1":
    load_dotenv()

PORT = int(os.getenv("PORT", 5000))
ENV = os.getenv("FLASK_ENV", "development")
LOCAL_API_TOKEN = os.getenv("LOCAL_API_TOKEN", "")
CORS_ALLOWED_ORIGINS = [value.strip() for value in os.getenv(
    "CORS_ALLOWED_ORIGINS", "null,http://localhost:5173,http://127.0.0.1:5173"
).split(",") if value.strip()]

# Persistent Disk Storage Path (~/.qa_ai_platform/)
HOME_DIR = Path.home()
BASE_STORAGE_DIR = Path(os.getenv("QA_AI_DATA_DIR", str(HOME_DIR / ".qa_ai_platform"))).expanduser().resolve()
SCREENSHOTS_DIR = BASE_STORAGE_DIR / "screenshots"
VIDEOS_DIR = BASE_STORAGE_DIR / "webcam_videos"
DATA_DIR = BASE_STORAGE_DIR / "data"

# Database files on disk
PROJECTS_DB_FILE = DATA_DIR / "projects_db.json"
TESTCASES_DB_FILE = DATA_DIR / "testcases_db.json"
EXECUTIONS_DB_FILE = DATA_DIR / "executions_db.json"
EXECUTION_LOGS_DB_FILE = DATA_DIR / "execution_logs_db.json"

# Ensure all storage paths exist
BASE_STORAGE_DIR.mkdir(parents=True, exist_ok=True)
SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)
VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)

# Supabase Credentials
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

# Gemini API Key
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")

# Brevo (Sendinblue) API Credentials for Transactional Email & OTP
BREVO_API_KEY = os.getenv("BREVO_API_KEY", "")
BREVO_SENDER_EMAIL = os.getenv("BREVO_SENDER_EMAIL", "")
BREVO_SENDER_NAME = os.getenv("BREVO_SENDER_NAME", "QA-AI Platform")
