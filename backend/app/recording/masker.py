from typing import Dict, Any, Optional

SENSITIVE_FIELD_NAMES = {
    "password", "passwd", "pwd", "secret", "token", "ssn", "cvv", 
    "credit_card", "card_number", "pin", "auth_token", "api_key"
}


def is_sensitive_target(target_info: Optional[Dict[str, Any]]) -> bool:
    if not target_info:
        return False
    
    candidates = []
    if target_info.get("name"):
        candidates.append(str(target_info["name"]).lower())
    if target_info.get("test_id"):
        candidates.append(str(target_info["test_id"]).lower())
    if target_info.get("label"):
        candidates.append(str(target_info["label"]).lower())
    if target_info.get("css_fallback"):
        candidates.append(str(target_info["css_fallback"]).lower())
        
    combined = " ".join(candidates)
    return any(sens in combined for sens in SENSITIVE_FIELD_NAMES)


def mask_value_if_sensitive(value: Optional[str], target_info: Optional[Dict[str, Any]], input_type: Optional[str] = None) -> tuple[Optional[str], bool]:
    if not value:
        return value, False
        
    if input_type and input_type.lower() == "password":
        return "[MASKED_SECRET]", True

    if is_sensitive_target(target_info):
        return "[MASKED_SECRET]", True

    return value, False
