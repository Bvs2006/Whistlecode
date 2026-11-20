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
            allowed_apps=raw.get("allowed_apps", []),
            allowed_folders=raw.get("allowed_folders", []),
            actions=actions_dict
        )

    def is_origin_allowed(
        self,
        url: str,
        approval: Optional[ApprovalRecord] = None,
        declared_origins: Optional[list[str]] = None,
    ) -> bool:
        if not url:
            return True
        try:
            parsed = urlparse(url)
            if parsed.scheme.lower() not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password:
                return False
            origin = f"{parsed.scheme.lower()}://{parsed.netloc.lower()}"
            
            # If approval record is present, origin must be within approved scope
            if approval:
                effective_domains = approval.scope.allowed_origins
                if approval.scope.allowed_scope and approval.scope.allowed_scope.domains:
                    effective_domains = list(set(effective_domains + approval.scope.allowed_scope.domains))
                return origin in effective_domains

            # Preview checks the exact scope the user is being asked to approve.
            # This does not grant access; execution still requires a signed approval.
            if declared_origins is not None:
                declared_list = declared_origins
                if hasattr(declared_origins, "domains"):
                    declared_list = declared_origins.domains
                elif isinstance(declared_origins, dict) and "domains" in declared_origins:
                    declared_list = declared_origins["domains"]
                normalized = set()
                for declared in declared_list:
                    scoped = urlparse(declared)
                    if scoped.scheme.lower() in {"http", "https"} and scoped.netloc and not scoped.username and not scoped.password:
                        normalized.add(f"{scoped.scheme.lower()}://{scoped.netloc.lower()}")
                return origin in normalized
            
            # Otherwise check system policy allowed origins
            return origin in self.config.allowed_origins
        except Exception:
            return False

    def is_app_allowed(
        self,
        app_name: str,
        approval: Optional[ApprovalRecord] = None,
        declared_scope: Optional[Any] = None,
    ) -> bool:
        if not app_name:
            return True
        app_clean = app_name.strip().lower()
        if approval:
            effective_apps = []
            if approval.scope.allowed_scope:
                effective_apps = [a.lower() for a in approval.scope.allowed_scope.apps]
            return app_clean in effective_apps or not effective_apps

        if declared_scope:
            apps = []
            if hasattr(declared_scope, "apps"):
                apps = [a.lower() for a in declared_scope.apps]
            elif isinstance(declared_scope, dict) and "apps" in declared_scope:
                apps = [a.lower() for a in declared_scope["apps"]]
            if apps:
                return app_clean in apps

        allowed_system_apps = [a.lower() for a in self.config.allowed_apps]
        return app_clean in allowed_system_apps or not allowed_system_apps

    def is_folder_allowed(
        self,
        folder_path: str,
        approval: Optional[ApprovalRecord] = None,
        declared_scope: Optional[Any] = None,
    ) -> bool:
        if not folder_path:
            return True
        norm_path = os.path.normpath(folder_path).lower()
        if approval and approval.scope.allowed_scope and approval.scope.allowed_scope.folders:
            return any(norm_path.startswith(os.path.normpath(f).lower()) for f in approval.scope.allowed_scope.folders)
        if declared_scope:
            folders = []
            if hasattr(declared_scope, "folders"):
                folders = declared_scope.folders
            elif isinstance(declared_scope, dict) and "folders" in declared_scope:
                folders = declared_scope["folders"]
            if folders:
                return any(norm_path.startswith(os.path.normpath(f).lower()) for f in folders)
        if self.config.allowed_folders:
            return any(norm_path.startswith(os.path.normpath(f).lower()) for f in self.config.allowed_folders)
        return True

    def is_scope_allowed(
        self,
        target: str,
        surface: str = "browser",
        approval: Optional[ApprovalRecord] = None,
        declared_scope: Optional[Any] = None,
    ) -> bool:
        surface_clean = surface.lower()
        if surface_clean == "browser":
            return self.is_origin_allowed(target, approval, declared_scope)
        elif surface_clean == "desktop":
            return self.is_app_allowed(target, approval, declared_scope)
        elif surface_clean == "file":
            return self.is_folder_allowed(target, approval, declared_scope)
        return True

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

    def evaluate_plugin_tool(self, plugin_id: str, tool: Any, approved: bool = False) -> Tuple[PolicyDecision, ReasonCode, RiskLevel]:
        """Authorize only registered, implemented plugin tools with a backend grant."""
        supported = {
            ("plugin_http_webhook", "post_webhook"), ("plugin_http_webhook", "fetch_rest_api"),
            ("plugin_data_export", "export_csv"), ("plugin_data_export", "export_json"),
            ("plugin_desktop_notifier", "notify_user"),
        }
        if not tool or (plugin_id, tool.name) not in supported:
            return PolicyDecision.DENY, ReasonCode.ACTION_TYPE_NOT_ALLOWED, RiskLevel.CRITICAL
        if tool.risk_level == RiskLevel.CRITICAL:
            return PolicyDecision.DENY, ReasonCode.CRITICAL_RISK_DENIED, RiskLevel.CRITICAL
        if not approved:
            return PolicyDecision.DENY, ReasonCode.APPROVAL_NOT_FOUND, tool.risk_level
        intrinsic_risk = {
            ("plugin_http_webhook", "post_webhook"): RiskLevel.HIGH,
            ("plugin_http_webhook", "fetch_rest_api"): RiskLevel.LOW,
            ("plugin_data_export", "export_csv"): RiskLevel.MEDIUM,
            ("plugin_data_export", "export_json"): RiskLevel.MEDIUM,
            ("plugin_desktop_notifier", "notify_user"): RiskLevel.MEDIUM,
        }[(plugin_id, tool.name)]
        rank = {RiskLevel.LOW: 0, RiskLevel.MEDIUM: 1, RiskLevel.HIGH: 2, RiskLevel.CRITICAL: 3}
        effective_risk = tool.risk_level if rank[tool.risk_level] > rank[intrinsic_risk] else intrinsic_risk
        if tool.requires_confirmation or effective_risk in (RiskLevel.HIGH, RiskLevel.MEDIUM) or tool.name in {"post_webhook", "export_csv", "export_json", "notify_user"}:
            return PolicyDecision.REQUIRE_CONFIRMATION, ReasonCode.HIGH_RISK_CONFIRMATION_REQUIRED, effective_risk
        return PolicyDecision.ALLOW, ReasonCode.ALLOWED_WITHIN_SCOPE, effective_risk

    def evaluate_step(
        self,
        step: Step,
        current_url: str,
        approval: Optional[ApprovalRecord] = None,
        actions_executed_count: int = 0,
        declared_origins: Optional[list[str]] = None,
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

        # 3. Origin and Scope check
        surface = step.surface.value if hasattr(step.surface, "value") else str(step.surface)
        if surface == "browser":
            url_to_check = current_url
            if step.action == ActionType.NAVIGATE:
                url_to_check = step.args.get("url", current_url)

            if url_to_check and not self.is_origin_allowed(url_to_check, approval, declared_origins):
                return PolicyDecision.DENY, ReasonCode.UNAPPROVED_ORIGIN, RiskLevel.HIGH
        elif surface == "desktop":
            app_target = step.args.get("app") or step.active_window or (step.target.active_window if step.target else None)
            if app_target and not self.is_app_allowed(app_target, approval, declared_origins):
                return PolicyDecision.DENY, ReasonCode.APPROVAL_SCOPE_MISMATCH, RiskLevel.HIGH
        elif surface == "file":
            folder_target = step.args.get("folder") or step.args.get("path")
            if folder_target and not self.is_folder_allowed(folder_target, approval, declared_origins):
                return PolicyDecision.DENY, ReasonCode.APPROVAL_SCOPE_MISMATCH, RiskLevel.HIGH

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

        # External or destructive effects always need a live user confirmation,
        # even when the workflow itself has a valid standing approval.
        sensitive_effect = (step.action == ActionType.SUBMIT) or (
            step.action == ActionType.CLICK
            and any(term in " ".join([
                step.name or "",
                (step.target.name or "") if step.target else "",
                (step.target.label or "") if step.target else "",
                (step.target.text or "") if step.target else "",
            ]).lower() for term in ("delete", "remove", "send", "publish", "purchase", "pay", "invite", "transfer"))
        )
        if sensitive_effect:
            return PolicyDecision.REQUIRE_CONFIRMATION, ReasonCode.HIGH_RISK_CONFIRMATION_REQUIRED, RiskLevel.HIGH

        if step.requires_confirmation or rule.decision == PolicyDecision.REQUIRE_CONFIRMATION:
            return PolicyDecision.REQUIRE_CONFIRMATION, ReasonCode.HIGH_RISK_CONFIRMATION_REQUIRED, RiskLevel.HIGH

        # 7. Check critical risk
        if effective_risk == RiskLevel.CRITICAL:
            return PolicyDecision.DENY, ReasonCode.CRITICAL_RISK_DENIED, RiskLevel.CRITICAL

        # 8. Allowed
        return PolicyDecision.ALLOW, ReasonCode.ALLOWED_BY_RULE, effective_risk
