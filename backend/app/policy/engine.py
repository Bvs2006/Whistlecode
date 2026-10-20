from __future__ import annotations
import os
import yaml
from urllib.parse import urlparse
from pathlib import Path
from typing import Optional, Dict, Any, Tuple
from ..models.workflow import Step, ActionType, RiskLevel, TargetDescriptor
from ..models.policy import PolicyConfig, PolicyDecision, ReasonCode, ActionPolicyRule
from ..models.approval import ApprovalRecord

DEFAULT_RULES_PATH = Path(__file__).parent / "rules.yaml"


class PolicyEngine:
    """
    Deterministic Policy Engine.
    Operates with ZERO LLM dependency (POL-1).
    Decides ALLOW, REQUIRE_CONFIRMATION, or DENY with standard reason codes (POL-2).
    """

    def __init__(self, rules_path: Optional[Path] = None):
        self.rules_path = rules_path or DEFAULT_RULES_PATH
        self.config = self._load_rules()

    def _load_rules(self) -> PolicyConfig:
        if not self.rules_path.exists():
            return PolicyConfig()
        with open(self.rules_path, "r", encoding="utf-8") as f:
            raw = yaml.safe_load(f) or {}
            
        actions_dict = {}
        for action_name, act_data in raw.get("actions", {}).items():
            actions_dict[action_name] = ActionPolicyRule(
                risk=RiskLevel(act_data.get("risk", "low")),
                decision=PolicyDecision(act_data.get("decision", "ALLOW")),
                deny_if_field_sensitivity=act_data.get("deny_if_field_sensitivity", [])
            )
            
        return PolicyConfig(
            policy_version=raw.get("policy_version", "0.1.0"),
            default_decision=PolicyDecision(raw.get("default_decision", "DENY")),
            allowed_origins=raw.get("allowed_origins", []),
            actions=actions_dict
        )

    def is_origin_allowed(self, url: str, approval: Optional[ApprovalRecord] = None) -> bool:
        if not url:
            return True
        try:
            parsed = urlparse(url)
            origin = f"{parsed.scheme}://{parsed.netloc}"
            
            # If approval record is present, origin must be within approved scope
            if approval:
                return origin in approval.scope.allowed_origins
            
            # Otherwise check system policy allowed origins
            return origin in self.config.allowed_origins
        except Exception:
            return False

    def detect_field_sensitivity(self, target: Optional[TargetDescriptor], action_args: Dict[str, Any]) -> Optional[str]:
        if not target:
            return None
        
        indicators = []
        if target.name:
            indicators.append(target.name.lower())
        if target.label:
            indicators.append(target.label.lower())
        if target.test_id:
            indicators.append(target.test_id.lower())
        if target.text:
            indicators.append(target.text.lower())
            
        combined = " ".join(indicators).replace("-", "_").replace(" ", "_")
        sensitive_keywords = [
            "password", "passwd", "secret", "token", "ssn", "cvv", 
            "credit_card", "creditcard", "card_number", "payment", "pin"
        ]
        for kw in sensitive_keywords:
            if kw in combined:
                return kw
        return None

    def evaluate_step(
        self,
        step: Step,
        current_url: str,
        approval: Optional[ApprovalRecord] = None,
        actions_executed_count: int = 0
    ) -> Tuple[PolicyDecision, ReasonCode, RiskLevel]:
        """
        Pure function: evaluates policy, approval, action, and context.
        """
        action_name = step.action.value

        # 1. Check max limits
        if actions_executed_count >= self.config.limits.max_actions_per_run:
            return PolicyDecision.DENY, ReasonCode.LIMIT_EXCEEDED, RiskLevel.HIGH

        # 2. Check action allowlist in policy rules
        if action_name not in self.config.actions:
            return PolicyDecision.DENY, ReasonCode.ACTION_TYPE_NOT_ALLOWED, RiskLevel.CRITICAL

        rule = self.config.actions[action_name]
        effective_risk = rule.risk
        if step.risk == RiskLevel.HIGH or step.risk == RiskLevel.CRITICAL:
            effective_risk = step.risk

        # 3. Origin check
        url_to_check = current_url
        if step.action == ActionType.NAVIGATE:
            url_to_check = step.args.get("url", current_url)

        if url_to_check and not self.is_origin_allowed(url_to_check, approval):
            return PolicyDecision.DENY, ReasonCode.UNAPPROVED_ORIGIN, RiskLevel.HIGH

        # 4. Check approval scope if approval record provided
        if approval:
            if action_name not in approval.scope.allowed_action_types:
                return PolicyDecision.DENY, ReasonCode.ACTION_TYPE_NOT_ALLOWED, RiskLevel.HIGH

        # 5. Sensitive field check (for typing or extraction)
        if step.action in [ActionType.TYPE, ActionType.EXTRACT]:
            sensitivity = self.detect_field_sensitivity(step.target, step.args)
            if sensitivity:
                # Check if restricted by rule
                if sensitivity in rule.deny_if_field_sensitivity or any(kw in sensitivity for kw in rule.deny_if_field_sensitivity):
                    return PolicyDecision.DENY, ReasonCode.SENSITIVE_FIELD_RESTRICTED, RiskLevel.CRITICAL

        # 6. Explicit confirmation gates or high-risk actions
        if step.action == ActionType.CONFIRM_GATE:
            return PolicyDecision.REQUIRE_CONFIRMATION, ReasonCode.GATED_STEP_CONFIRMATION_REQUIRED, RiskLevel.HIGH

        if step.requires_confirmation or rule.decision == PolicyDecision.REQUIRE_CONFIRMATION:
            return PolicyDecision.REQUIRE_CONFIRMATION, ReasonCode.HIGH_RISK_CONFIRMATION_REQUIRED, RiskLevel.HIGH

        # 7. Check critical risk
        if effective_risk == RiskLevel.CRITICAL:
            return PolicyDecision.DENY, ReasonCode.CRITICAL_RISK_DENIED, RiskLevel.CRITICAL

        # 8. Allowed
        return PolicyDecision.ALLOW, ReasonCode.ALLOWED_BY_RULE, effective_risk
