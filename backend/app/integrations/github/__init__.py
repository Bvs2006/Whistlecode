from __future__ import annotations
import os
from typing import Dict, Any, List, Optional
import httpx

from app.credentials.store import get_secret


class GitHubClient:
    """Client for GitHub REST API integrations."""

    def __init__(self, token: Optional[str] = None):
        self._token = token

    def get_token(self) -> Optional[str]:
        if self._token:
            return self._token
        stored = get_secret("integ_github")
        if stored:
            return stored
        return os.getenv("GITHUB_TOKEN")

    def _headers(self) -> Dict[str, str]:
        headers = {
            "Accept": "application/vnd.github.v3+json",
            "User-Agent": "ChronicleAI-Agent/1.0",
        }
        token = self.get_token()
        if token:
            headers["Authorization"] = f"Bearer {token}"
        return headers

    async def test_connection(self) -> Dict[str, Any]:
        token = self.get_token()
        if not token:
            return {
                "status": "not_configured",
                "message": "GitHub personal access token not configured. Add it in Integrations to enable repo and PR assistance.",
            }
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get("https://api.github.com/user", headers=self._headers())
                if resp.status_code == 200:
                    user_data = resp.json()
                    return {
                        "status": "success",
                        "message": f"Connected to GitHub as @{user_data.get('login')}.",
                        "login": user_data.get("login"),
                        "rate_limit_remaining": resp.headers.get("x-ratelimit-remaining"),
                    }
                return {
                    "status": "error",
                    "message": f"GitHub authentication error HTTP {resp.status_code}: {resp.text[:150]}",
                }
        except Exception as exc:
            return {"status": "error", "message": f"GitHub probe failed: {str(exc)}"}

    async def get_repository(self, owner: str, repo: str) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(f"https://api.github.com/repos/{owner}/{repo}", headers=self._headers())
            resp.raise_for_status()
            data = resp.json()
            return {
                "name": data.get("full_name"),
                "description": data.get("description"),
                "stars": data.get("stargazers_count"),
                "forks": data.get("forks_count"),
                "open_issues": data.get("open_issues_count"),
                "default_branch": data.get("default_branch"),
                "url": data.get("html_url"),
            }

    async def list_issues(self, owner: str, repo: str, state: str = "open", limit: int = 10) -> List[Dict[str, Any]]:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/issues?state={state}&per_page={limit}",
                headers=self._headers(),
            )
            resp.raise_for_status()
            issues = resp.json()
            return [
                {
                    "number": item.get("number"),
                    "title": item.get("title"),
                    "state": item.get("state"),
                    "author": item.get("user", {}).get("login"),
                    "created_at": item.get("created_at"),
                    "labels": [label.get("name") for label in item.get("labels", [])],
                    "is_pr": bool(item.get("pull_request")),
                }
                for item in issues
            ]

    async def get_pull_request(self, owner: str, repo: str, pull_number: int) -> Dict[str, Any]:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(
                f"https://api.github.com/repos/{owner}/{repo}/pulls/{pull_number}",
                headers=self._headers(),
            )
            resp.raise_for_status()
            data = resp.json()
            return {
                "number": data.get("number"),
                "title": data.get("title"),
                "state": data.get("state"),
                "body": data.get("body"),
                "user": data.get("user", {}).get("login"),
                "mergeable": data.get("mergeable"),
                "commits": data.get("commits"),
                "additions": data.get("additions"),
                "deletions": data.get("deletions"),
                "changed_files": data.get("changed_files"),
            }


github_client = GitHubClient()
