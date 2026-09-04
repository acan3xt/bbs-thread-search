# bbs-thread-search

`bbs-api-crawler` に保存されたスレッドを横断検索する軽量Web UIです。
検索サイト自身はDBを持たず、`bbs-api-crawler` の検索APIをプロキシします。

## 対象板

- エッヂ `eddibb:liveedge`
- 嫌儲 `5ch:poverty`
- VIP `5ch:news4vip`
- なんJ `5ch:livejupiter`
- なんG `5ch:livegalileo`

## 起動

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8010
```

Windows PowerShell:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8010
```

## 設定

上流の `bbs-api-crawler` は環境変数 `BBS_API_URL` で指定できます。
既定値は同一ホストで動作するAPIを想定しています。

```text
http://127.0.0.1:8000
```

別ホストのAPIを利用する場合は、起動環境で `BBS_API_URL` を設定してください。

## API

- `GET /health`
- `GET /api/sources`
- `GET /api/recent`
- `GET /api/search`

`/api/search` は許可された対象板だけを `bbs-api-crawler /api/v1/search/threads` へ中継します。
