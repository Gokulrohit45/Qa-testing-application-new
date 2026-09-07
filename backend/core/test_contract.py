"""Pure test contract; no browser, network or application state."""
import math
import re
from urllib.parse import urlparse

ACTIONS = {"goto", "click", "fill", "wait", "verify", "verify_text", "upload_file", "select"}
EXPECTATIONS = {"text_visible", "url_contains", "url_equals", "field_value", "selected_option", "element_visible", "element_hidden", "element_enabled", "element_disabled"}


def parse_commands(text):
    steps = []
    for line in (s.strip() for s in text.splitlines() if s.strip()):
        step = {"action": "unsupported", "target": "", "value": "", "raw_command": line}
        navigation = re.match(r"^(?:goto|open|navigate(?: to)?|visit)\s+(.+)$", line, re.I)
        upload = re.match(r"^(?:upload_file|upload file|attach file)\s+(.+)$", line, re.I)
        fill = re.match(r"^(?:fill|type|enter|input)\s+(.+?)\s+(?:with|as)\s+(.+)$", line, re.I)
        into = re.match(r"^(?:fill|type|enter|input)\s+(.+?)\s+(?:into|in)\s+(.+)$", line, re.I)
        click = re.match(r"^(?:click|press)\s+(?:on\s+)?(?:button\s+|link\s+)?(.+)$", line, re.I)
        select = re.match(r"^select\s+(.+?)\s+from\s+(.+)$", line, re.I)
        wait = re.match(r"^(?:wait|sleep|pause)\s+(\d+(?:\.\d+)?)\s*(milliseconds?|ms|seconds?|s)?$", line, re.I)
        verify = re.match(r"^(?:verify_text|verify|assert|check|see)\s*:?\s+(?:that\s+)?(?:text\s+)?(.+)$", line, re.I)
        clean = lambda s: s.strip().strip('\"\'')
        if navigation:
            step.update(action="goto", target=clean(navigation[1]))
        elif upload:
            match = re.match(r"(.+?)\s+(?:using|with|from)\s+(.+)$", upload[1], re.I)
            if match:
                step.update(action="upload_file", target=clean(match[1]), value=clean(match[2]), critical=True)
                if step["target"].lower() in {"file", "dataset", "upload"}:
                    step["target"] = "input[type='file']"
        elif fill or into:
            match = fill or into
            target, value = (match[1], match[2]) if fill else (match[2], match[1])
            step.update(action="fill", target=clean(target), value=clean(value))
        elif select:
            step.update(action="select", target=clean(select[2]), value=clean(select[1]))
        elif click:
            step.update(action="click", target=clean(click[1]))
        elif wait:
            multiplier = 1 if (wait[2] or "").lower() in {"ms", "millisecond", "milliseconds"} else 1000
            step.update(action="wait", value=str(int(float(wait[1]) * multiplier)))
        elif verify:
            step.update(action="verify", target=clean(verify[1]))
        steps.append(step)
    return steps


def normalize_steps(steps):
    if not isinstance(steps, list):
        return steps
    output = []
    for item in steps:
        if not isinstance(item, dict):
            output.append(item)
            continue
        step = dict(item)
        step["action"] = str(step.get("action") or "").strip().lower()
        for key in ("target", "value"):
            step[key] = str(step.get(key) if step.get(key) is not None else "")
            if key == "target":
                step[key] = step[key].strip()
        raw = str(step.get("raw_command") or "").strip()
        if step["action"] in {"verify", "verify_text"} and raw:
            parsed = parse_commands(raw)
            if len(parsed) == 1 and parsed[0]["action"] == "verify":
                step["target"] = parsed[0]["target"]
        legacy = raw or (step["target"] if step["action"] == "click" else "")
        if step["action"] == "click" and re.match(r"^(upload_file|upload file|attach file)\s", legacy, re.I):
            repair = parse_commands(legacy)
            if len(repair) == 1 and repair[0]["action"] == "upload_file":
                step.update(repair[0])
        step.setdefault("raw_command", raw)
        output.append(step)
    return output


def valid_url(value):
    try:
        url = urlparse(value)
        return url.scheme in {"http", "https"} and bool(url.hostname) and not re.search(r"\s", value)
    except ValueError:
        return False


def resolve_variables(steps, variables):
    if not isinstance(variables, dict):
        raise ValueError("Runtime variables must be a name/value object.")
    result = []
    for item in steps:
        if not isinstance(item, dict):
            result.append(item)
            continue
        step = dict(item)
        runtime_secrets = []
        for key in ("target", "value", "expected_value", "expected_target"):
            original = str(step.get(key, ""))
            def replace(match):
                name = match[1]
                if name not in variables or not isinstance(variables[name], (str, int, float)):
                    raise ValueError(f"Runtime variable '{name}' is missing or invalid.")
                resolved = str(variables[name])
                if resolved:
                    runtime_secrets.append(resolved)
                return resolved
            step[key] = re.sub(r"\{\{([a-zA-Z_][a-zA-Z0-9_]*)\}\}", replace, original)
            if original != step[key]:
                step["sensitive"] = True
        if runtime_secrets:
            step['_runtime_secrets'] = list(set(runtime_secrets))
        result.append(step)
    return result


def validate_steps(steps, allow_variables=False):
    errors, warnings = [], []
    if not isinstance(steps, list) or not steps:
        return [{"step": 0, "message": "At least one structured test step is required."}], warnings
    for number, step in enumerate(steps, 1):
        def error(message):
            errors.append({"step": number, "message": message})
        if not isinstance(step, dict):
            error("Step must be an object.")
            continue
        action, target, value = step.get("action"), step.get("target", ""), step.get("value", "")
        if action not in ACTIONS:
            error("Unsupported or unclear action. Choose a documented browser action; hardware/API instructions require an integration.")
            continue
        if action != "wait" and not str(target).strip():
            error("Target is required.")
        if action == "goto" and not valid_url(str(target)):
            error("Navigation target must be a valid HTTP or HTTPS URL.")
        if action in {"upload_file", "select"} and not str(value).strip():
            error("A filename or option value is required.")
        if action == "wait":
            try:
                duration = float(value)
                if not math.isfinite(duration) or duration < 0 or duration > 300000:
                    raise ValueError()
            except (ValueError, TypeError):
                error("Wait value must be 0–300000 milliseconds (up to 5 minutes).")
        if any(re.search(r"\{\{.+?\}\}", str(step.get(k, ""))) for k in ("target", "value", "expected_value", "expected_target")):
            if allow_variables:
                warnings.append(f"Step {number}: runtime test-data variables must be supplied before running.")
            else:
                error("Unresolved test-data variable. Supply its value before running.")
        expected = step.get("expected_type") or ""
        if not isinstance(expected, str):
            error("Expected type must be text.")
            continue
        if expected and expected not in EXPECTATIONS:
            error("Unsupported expected type. Choose a documented condition.")
        if expected in {"text_visible", "url_contains", "url_equals", "selected_option"} and not str(step.get("expected_value", "")).strip():
            error("Expected value is required for this condition.")
        if expected.startswith("element_") or expected in {"field_value", "selected_option"}:
            if not str(step.get("expected_target") or target).strip():
                error("An assertion target is required.")
        if not expected and str(step.get("expected_value", "")).strip():
            error("Expected value needs an explicit expected type; prose is not automatically interpreted.")
        if "critical" in step and not isinstance(step["critical"], bool):
            error("Critical must be true or false.")
        dependencies = step.get("depends_on", [])
        if not isinstance(dependencies, list) or any(type(d) is not int or not 1 <= d < number for d in dependencies):
            error("Depends on must list earlier step numbers in this test case.")
        if action == "click" and target in {"+", "-", "..."}:
            error("Ambiguous symbol. Use an accessible name or an explicit CSS/test ID target.")
    if not any(isinstance(s, dict) and (s.get("action") in {"verify", "verify_text"} or s.get("expected_type")) for s in steps):
        warnings.append("No expected outcomes: this test checks action execution only, not functional correctness.")
    return errors, warnings
