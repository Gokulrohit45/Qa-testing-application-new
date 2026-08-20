import re
import json
from flask import Blueprint, request, jsonify
from config import GEMINI_API_KEY
from utils.logger import logger

translate_bp = Blueprint("translate_bp", __name__)

def fallback_heuristic_parser(raw_text: str) -> list:
    """
    Zero-error regex & rule parser converting raw commands into structured Playwright JSON steps.
    """
    lines = [line.strip() for line in raw_text.split("\n") if line.strip()]
    steps = []

    for line in lines:
        cmd_lower = line.lower()

        # Goto / Navigate
        if "navigate to" in cmd_lower or "open" in cmd_lower or "goto" in cmd_lower or "visit" in cmd_lower:
            urls = re.findall(r'https?://[^\s]+', line)
            url = urls[0] if urls else line.replace("Navigate to", "").replace("open", "").replace("goto", "").strip()
            steps.append({
                "action": "goto",
                "target": url,
                "value": "",
                "raw_command": line
            })
        # Click
        elif "click" in cmd_lower or "press" in cmd_lower or "select" in cmd_lower:
            target = re.sub(r'^(click|press|select)\s+(on\s+)?(button\s+)?(link\s+)?', '', line, flags=re.IGNORECASE).strip(" '\"")
            steps.append({
                "action": "click",
                "target": target,
                "value": "",
                "raw_command": line
            })
        # Fill / Type / Enter
        elif "fill" in cmd_lower or "type" in cmd_lower or "enter" in cmd_lower or "input" in cmd_lower:
            match = re.search(r'(?:fill|type|enter|input)\s+[\'"]?([^\'"]+)[\'"]?\s+(?:in|into|with|as)\s+[\'"]?([^\'"]+)[\'"]?', line, re.IGNORECASE)
            if match:
                val, target = match.group(1), match.group(2)
            else:
                target = line
                val = "test_input"
            steps.append({
                "action": "fill",
                "target": target,
                "value": val,
                "raw_command": line
            })
        # Wait
        elif "wait" in cmd_lower or "sleep" in cmd_lower or "pause" in cmd_lower:
            nums = re.findall(r'\d+', line)
            sec = int(nums[0]) if nums else 2
            ms = sec * 1000 if sec < 100 else sec
            steps.append({
                "action": "wait",
                "target": "",
                "value": str(ms),
                "raw_command": line
            })
        # Verify / Check / Assert
        elif "verify" in cmd_lower or "assert" in cmd_lower or "check" in cmd_lower or "see" in cmd_lower:
            target = re.sub(r'^(verify|assert|check|see)\s+(that\s+)?', '', line, flags=re.IGNORECASE).strip(" '\"")
            steps.append({
                "action": "verify",
                "target": target,
                "value": "",
                "raw_command": line
            })
        else:
            steps.append({
                "action": "click",
                "target": line,
                "value": "",
                "raw_command": line
            })

    return steps

@translate_bp.route("/api/translate", methods=["POST"])
def translate_prompt():
    data = request.json or {}
    prompt = data.get("prompt", "")

    if not prompt:
        return jsonify({"error": "Prompt string is required"}), 400

    # Attempt Gemini API Translation if key is configured
    if GEMINI_API_KEY:
        try:
            import google.generativeai as genai
            genai.configure(api_key=GEMINI_API_KEY)
            model = genai.GenerativeModel('gemini-1.5-flash')
            
            system_instruction = """
            You are a Playwright automation parser. Convert the natural language instructions into a JSON array of steps.
            Supported actions: "goto", "click", "fill", "wait", "verify", "upload_file".
            Format:
            [
              {"action": "goto", "target": "URL", "value": "", "raw_command": "original line"},
              {"action": "click", "target": "element label or selector", "value": "", "raw_command": "original line"},
              {"action": "fill", "target": "input field", "value": "text to type", "raw_command": "original line"},
              {"action": "wait", "target": "", "value": "milliseconds", "raw_command": "original line"},
              {"action": "verify", "target": "expected text", "value": "", "raw_command": "original line"}
            ]
            Return ONLY raw JSON, no markdown tags.
            """
            response = model.generate_content(f"{system_instruction}\n\nInstructions:\n{prompt}")
            text = response.text.strip()
            # Clean possible markdown block markers
            text = re.sub(r'^```json\s*', '', text, flags=re.IGNORECASE)
            text = re.sub(r'^```\s*', '', text, flags=re.IGNORECASE)
            text = re.sub(r'\s*```$', '', text)

            steps = json.loads(text)
            logger.info("Gemini API successfully translated natural language steps.")
            return jsonify({"steps": steps, "source": "gemini"}), 200
        except Exception as e:
            logger.warning(f"Gemini API translation error: {e}. Falling back to heuristic parser.")

    # Fallback to local heuristic parser
    steps = fallback_heuristic_parser(prompt)
    return jsonify({"steps": steps, "source": "heuristic_fallback"}), 200
