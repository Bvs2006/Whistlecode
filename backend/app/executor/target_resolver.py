import re
from typing import Optional, Tuple
from playwright.async_api import Page, Locator
from ..models.workflow import TargetDescriptor


class TargetResolver:
    """
    Resolves targets using strict ordered strategies (EXE-3):
    test_id -> role + name -> label -> text -> css_fallback.
    Fails safe when ambiguous (multiple matches exist) or not found.
    """

    @staticmethod
    def _normalized_name_pattern(value: Optional[str]):
        if not value or not value.strip():
            return None
        words = [re.escape(word) for word in re.split(r"\s+", value.strip()) if word]
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
    async def resolve(cls, page: Page, target: TargetDescriptor) -> Tuple[Optional[Locator], Optional[str]]:
        if not target:
            return None, "No target descriptor provided"

        ambiguous = []
        name_pattern = cls._normalized_name_pattern(target.name or target.text)

        # Search in the recorded landmark/form first, then the full page.
        scopes = []
        if target.context and target.context.within:
            try:
                context = page.locator(target.context.within)
                if await context.count() == 1:
                    scopes.append(context)
            except Exception:
                pass
        scopes.append(page)

        # Strategy 1: test_id
        if target.test_id:
            loc = page.locator(f"[data-testid='{target.test_id}'], [data-test='{target.test_id}'], #{target.test_id}")
            found, count = await cls._unique_visible(loc)
            if found:
                return found, None
            if count > 1:
                ambiguous.append(f"test_id='{target.test_id}' matched {count} visible elements")

        # Strategy 2: role + normalized accessible name. Whitespace and line
        # breaks from captured link text are normalized without fuzzy matching.
        if target.role and target.name:
            for scope in scopes:
                try:
                    loc = scope.get_by_role(target.role, name=name_pattern or target.name, exact=True)
                    found, count = await cls._unique_visible(loc, wait_ms=1800)
                    if found:
                        return found, None
                    if count > 1:
                        ambiguous.append(f"role='{target.role}' name='{target.name}' matched {count} visible elements")
                except Exception:
                    continue

        # Strategy 3: label
        if target.label:
            for scope in scopes:
                try:
                    loc = scope.get_by_label(target.label, exact=False)
                    found, count = await cls._unique_visible(loc)
                    if found:
                        return found, None
                    if count > 1:
                        ambiguous.append(f"label='{target.label}' matched {count} visible elements")
                except Exception:
                    continue

        # Strategy 4: text
        if target.text:
            for scope in scopes:
                try:
                    loc = scope.get_by_text(name_pattern or target.text, exact=bool(name_pattern))
                    found, count = await cls._unique_visible(loc, wait_ms=1200)
                    if found:
                        return found, None
                    if count > 1:
                        ambiguous.append(f"text='{target.text}' matched {count} visible elements")
                except Exception:
                    continue

        # Strategy 5: CSS Fallback
        if target.css_fallback:
            stable_selector = cls._stable_css(target.css_fallback)
            for selector in dict.fromkeys((target.css_fallback, stable_selector)):
                try:
                    loc = page.locator(selector)
                    if name_pattern:
                        loc = loc.filter(has_text=name_pattern)
                    found, count = await cls._unique_visible(loc, wait_ms=800)
                    if found:
                        return found, None
                    if count > 1:
                        ambiguous.append(f"css_fallback='{selector}' matched {count} visible elements")
                except Exception:
                    continue

        if ambiguous:
            return None, "Target matches multiple visible elements; refusing an ambiguous action: " + "; ".join(ambiguous)
        return None, f"Element target could not be resolved by any strategy: {target.model_dump()}"
