from typing import Optional, Tuple
from playwright.async_api import Page, Locator
from ..models.workflow import TargetDescriptor


class TargetResolver:
    """
    Resolves targets using strict ordered strategies (EXE-3):
    test_id -> role + name -> label -> text -> css_fallback.
    Fails safe when ambiguous (multiple matches exist) or not found.
    """

    @classmethod
    async def resolve(cls, page: Page, target: TargetDescriptor) -> Tuple[Optional[Locator], Optional[str]]:
        if not target:
            return None, "No target descriptor provided"

        # Strategy 1: test_id
        if target.test_id:
            loc = page.locator(f"[data-testid='{target.test_id}'], [data-test='{target.test_id}'], #{target.test_id}")
            count = await loc.count()
            if count == 1:
                return loc.first, None
            elif count > 1:
                return None, f"Ambiguous matches ({count}) found for test_id='{target.test_id}'"

        # Strategy 2: role + accessible name
        if target.role and target.name:
            try:
                loc = page.get_by_role(target.role, name=target.name, exact=False)
                count = await loc.count()
                if count == 1:
                    return loc.first, None
                elif count > 1:
                    return None, f"Ambiguous matches ({count}) for role='{target.role}' name='{target.name}'"
            except Exception:
                pass

        # Strategy 3: label
        if target.label:
            try:
                loc = page.get_by_label(target.label, exact=False)
                count = await loc.count()
                if count == 1:
                    return loc.first, None
                elif count > 1:
                    return None, f"Ambiguous matches ({count}) for label='{target.label}'"
            except Exception:
                pass

        # Strategy 4: text
        if target.text:
            try:
                loc = page.get_by_text(target.text, exact=False)
                count = await loc.count()
                if count == 1:
                    return loc.first, None
                elif count > 1:
                    return None, f"Ambiguous matches ({count}) for text='{target.text}'"
            except Exception:
                pass

        # Strategy 5: CSS Fallback
        if target.css_fallback:
            try:
                loc = page.locator(target.css_fallback)
                count = await loc.count()
                if count == 1:
                    return loc.first, None
                elif count > 1:
                    return None, f"Ambiguous matches ({count}) for css_fallback='{target.css_fallback}'"
            except Exception:
                pass

        return None, f"Element target could not be resolved by any strategy: {target.model_dump()}"
