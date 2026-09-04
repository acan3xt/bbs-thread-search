from __future__ import annotations

import asyncio
import os
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

ROOT = Path(__file__).resolve().parent.parent
STATIC = ROOT / "static"
BBS_API_URL = os.getenv("BBS_API_URL", "http://127.0.0.1:8000").rstrip("/")

SOURCES = {
    "eddibb:liveedge": {"label": "エッヂ", "network": "eddibb", "board": "liveedge"},
    "5ch:poverty": {"label": "嫌儲", "network": "5ch", "board": "poverty"},
    "5ch:news4vip": {"label": "VIP", "network": "5ch", "board": "news4vip"},
    "5ch:livejupiter": {"label": "なんJ", "network": "5ch", "board": "livejupiter"},
    "5ch:livegalileo": {"label": "なんG", "network": "5ch", "board": "livegalileo"},
}

app = FastAPI(title="bbs-thread-search", version="0.1.0")
app.mount("/static", StaticFiles(directory=STATIC), name="static")


def thread_url(network: str, board: str, thread_id: str) -> str | None:
    if network == "eddibb" and board == "liveedge":
        return f"https://bbs.eddibb.cc/test/read.cgi/liveedge/{thread_id}/"
    if network == "5ch":
        # Hostnames can move. The public 5ch read.cgi gateway resolves the board/thread.
        return f"https://itest.5ch.net/test/read.cgi/{board}/{thread_id}/"
    return None


@app.get("/")
def index() -> FileResponse:
    return FileResponse(STATIC / "index.html")


@app.get("/health")
async def health() -> dict:
    upstream = False
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(f"{BBS_API_URL}/health")
            upstream = response.is_success
    except httpx.HTTPError:
        pass
    return {"status": "ok", "upstream": upstream}


@app.get("/api/sources")
def sources() -> dict:
    return {"sources": [{"sourceId": key, **value} for key, value in SOURCES.items()]}


def decorate_thread(item: dict) -> dict:
    source_id = f"{item.get('network')}:{item.get('board')}"
    item["sourceId"] = source_id
    item["sourceLabel"] = SOURCES.get(source_id, {}).get("label", source_id)
    item["url"] = thread_url(
        str(item.get("network") or ""),
        str(item.get("board") or ""),
        str(item.get("threadId") or ""),
    )
    return item


@app.get("/api/recent")
async def recent(source: list[str] = Query(default=[]), limit: int = Query(30, ge=1, le=100)) -> dict:
    selected = source or list(SOURCES)
    invalid = [item for item in selected if item not in SOURCES]
    if invalid:
        raise HTTPException(status_code=400, detail=f"invalid source: {invalid[0]}")

    async with httpx.AsyncClient(timeout=10.0) as client:
        tasks = [
            client.get(
                f"{BBS_API_URL}/api/v1/search/threads",
                params=[("source", item), ("sort", "new"), ("limit", limit), ("offset", 0)],
            )
            for item in selected
        ]
        responses = await asyncio.gather(*tasks, return_exceptions=True)

    merged: list[dict] = []
    for response in responses:
        if isinstance(response, Exception) or not response.is_success:
            continue
        try:
            payload = response.json()
        except ValueError:
            continue
        merged.extend(decorate_thread(item) for item in payload.get("threads", []))

    merged.sort(
        key=lambda item: (str(item.get("firstSeenAt") or ""), str(item.get("threadId") or "")),
        reverse=True,
    )
    return {"threads": merged[:limit], "sources": selected}


@app.get("/api/search")
async def search(
    source: list[str] = Query(default=[]),
    q: str = Query("", max_length=200),
    from_date: str | None = Query(None, alias="from", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    to_date: str | None = Query(None, alias="to", pattern=r"^\d{4}-\d{2}-\d{2}$"),
    sort: str = Query("new", pattern="^(new|old)$"),
    limit: int = Query(30, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> dict:
    selected = source or list(SOURCES)
    invalid = [item for item in selected if item not in SOURCES]
    if invalid:
        raise HTTPException(status_code=400, detail=f"invalid source: {invalid[0]}")

    params: list[tuple[str, str | int]] = [("source", item) for item in selected]
    if q.strip():
        params.append(("q", q.strip()))
    if from_date:
        params.append(("from", from_date))
    if to_date:
        params.append(("to", to_date))
    params.extend([("sort", sort), ("limit", limit), ("offset", offset)])

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{BBS_API_URL}/api/v1/search/threads", params=params)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="検索APIに接続できません") from exc

    if not response.is_success:
        detail = "検索APIでエラーが発生しました"
        try:
            payload = response.json()
            detail = payload.get("detail", detail)
        except ValueError:
            pass
        raise HTTPException(status_code=502, detail=detail)

    payload = response.json()
    payload["threads"] = [decorate_thread(item) for item in payload.get("threads", [])]
    return payload
