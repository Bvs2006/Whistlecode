import re
from typing import Optional, Tuple, List, Any, Union, Dict
from playwright.async_api import Page, Locator
from ..models.workflow import TargetDescriptor, TargetCandidate, TargetContext


class TargetResolver:
    """
    Resolves targets using strict ordered strategies (EXE-3):
    test_id -> role + name -> label -> text -> css_fallback.
    Supports ranked TargetCandidate lists and fails safe when ambiguous or not found.
    """

    @staticmethod
    def _normalized_name_pattern(value: Optional[str]):
        if not value or not str(value).strip():
            return None
        words = [re.escape(word) for word in re.split(r"\s+", str(value).strip()) if word]
        return re.compile(r"^\s*" + r"\s+".join(words) + r"\s*$", re.IGNORECASE)

    @staticmethod
    async def _unique_visible(locator: Locator, wait_ms: int = 0) -> Tuple[Optional[Locator], int]:
        """Return a locator only when exactly one currently visible element matches."""
        try:
            if wait_ms:
                try:
                    await locator.first.wait_for(state="visible", timeout=wait_ms)
                except Exception:
                    pass
            count = await locator.count()
            visible = []
            for index in range(count):
                candidate = locator.nth(index)
                try:
                    if await candidate.is_visible():
                        visible.append(candidate)
                except Exception:
                    continue
            return (visible[0], 1) if len(visible) == 1 else (None, len(visible))
        except Exception:
            return None, 0

    @staticmethod
    def _stable_css(selector: str) -> str:
        # Recorder classes often include transient states such as .active.
        # Keep the structural selector while dropping only those volatile tokens.
        return re.sub(r"\.(?:active|selected|hover|focus)(?=\.|#|\[|\s|>|$)", "", selector)

    @classmethod
    async def resolve_candidate(
        cls,
        page: Page,
        candidate: TargetCandidate,
        scopes: List[Any]
    ) -> Tuple[Optional[Locator], Optional[str]]:
        """Resolves a single TargetCandidate against page/scopes."""
        strat = candidate.strategy.lower()
        val = candidate.value

        if strat == "test_id":
            test_id = str(val)
            loc = page.locator(f"[data-testid='{test_id}'], [data-test='{test_id}'], #{test_id}")
            found, count = await cls._unique_visible(loc)
            if found:
                return found, None
            if count > 1:
                return None, f"test_id='{test_id}' matched {count} visible elements"

        elif strat in ("role_name", "role"):
            role = ""
            name = ""
            if isinstance(val, dict):
                role = val.get("role", "")
                name = val.get("name", "")
            elif isinstance(val, str):
                name = val
            name_pattern = cls._normalized_name_pattern(name)
            for scope in scopes:
                try:
                    if role:
                        loc = scope.get_by_role(role, name=name_pattern or name, exact=True)
                    else:
                        loc = scope.get_by_role("button", name=name_pattern or name, exact=True)
                    found, count = await cls._unique_visible(loc, wait_ms=1800)
                    if found:
                        return found, None
                    if count > 1:
                        return None, f"role='{role}' name='{name}' matched {count} visible elements"
                except Exception:
                    continue

        elif strat == "label":
            label_val = str(val)
            for scope in scopes:
                try:
                    loc = scope.get_by_label(label_val, exact=False)
                    found, count = await cls._unique_visible(loc)
                    if found:
                        return found, None
                    if count > 1:
                        return None, f"label='{label_val}' matched {count} visible elements"
                except Exception:
                    continue

        elif strat == "text":
            text_val = str(val)
            name_pattern = cls._normalized_name_pattern(text_val)
            for scope in scopes:
                try:
                    loc = scope.get_by_text(name_pattern or text_val, exact=bool(name_pattern))
                    found, count = await cls._unique_visible(loc, wait_ms=1200)
                    if found:
                        return found, None
                    if count > 1:
                        return None, f"text='{text_val}' matched {count} visible elements"
                except Exception:
                    continue

        elif strat in ("css", "css_fallback", "selector"):
            css_val = str(val)
            stable_selector = cls._stable_css(css_val)
            for selector in dict.fromkeys((css_val, stable_selector)):
                try:
                    loc = page.locator(selector)
                    found, count = await cls._unique_visible(loc, wait_ms=800)
                    if found:
                        return found, None
                    if count > 1:
                        return None, f"css='{selector}' matched {count} visible elements"
                except Exception:
                    continue

        elif strat == "xpath":
            try:
                loc = page.locator(f"xpath={str(val)}")
                found, count = await cls._unique_visible(loc, wait_ms=800)
                if found:
                    return found, None
                if count > 1:
                    return None, f"xpath='{val}' matched {count} visible elements"
            except Exception:
                pass

        return None, None

    @classmethod
    async def resolve_candidates(
        cls,
        page: Page,
        candidates: List[TargetCandidate],
        context: Optional[TargetContext] = None
    ) -> Tuple[Optional[Locator], Optional[str], Optional[TargetCandidate]]:
        """
        Attempts to resolve targets using a ranked list of candidates.
        Tries them in order and returns the locator and winning candidate.
        """
        if not candidates:
            return None, "No target candidates provided", None

        # Build context scopes
        scopes = []
        if context and context.within:
            try:
                ctx_loc = page.locator(context.within)
                if await ctx_loc.count() == 1:
                    scopes.append(ctx_loc)
            except Exception:
                pass
        scopes.append(page)

        ambiguous = []
        sorted_candidates = sorted(candidates, key=lambda c: c.confidence, reverse=True)

        for candidate in sorted_candidates:
            found, err = await cls.resolve_candidate(page, candidate, scopes)
            if found:
                candidate.matched = True
                return found, None, candidate
            if err and "matched" in err:
                ambiguous.append(err)

        if ambiguous:
            return None, "Target matches multiple visible elements; refusing ambiguous action: " + "; ".join(ambiguous), None

        return None, f"No target candidate could be resolved from: {[c.strategy for c in sorted_candidates]}", None

    @classmethod
    async def resolve(cls, page: Page, target: TargetDescriptor) -> Tuple[Optional[Locator], Optional[str]]:
        if not target:
            return None, "No target descriptor provided"
        candidates = target.get_ranked_candidates()
        locator, err, winning = await cls.resolve_candidates(page, candidates, target.context)
        return locator, err
