const DEFAULT_LIMIT = 30;
const ALLOWED_LIMITS = [30, 50, 100];
const form = document.querySelector('#search-form');
const results = document.querySelector('#results');
const summary = document.querySelector('#summary');
const engine = document.querySelector('#engine');
const pagers = [...document.querySelectorAll('.pager')];
const pageInputs = [...document.querySelectorAll('.page-input')];
const pageTotals = [...document.querySelectorAll('.page-total')];
const pageSizes = [...document.querySelectorAll('.page-size')];
const prevButtons = [...document.querySelectorAll('.page-prev')];
const nextButtons = [...document.querySelectorAll('.page-next')];

let currentOffset = 0;
let currentTotal = 0;
let currentLimit = DEFAULT_LIMIT;

function checkedSources() {
  return [...form.querySelectorAll('input[name="source"]:checked')].map((el) => el.value);
}

function setPageSizeControls(value) {
  pageSizes.forEach((el) => { el.value = String(value); });
}

function restoreFromUrl() {
  const p = new URLSearchParams(location.search);
  document.querySelector('#q').value = p.get('q') || '';
  document.querySelector('#from').value = p.get('from') || '';
  document.querySelector('#to').value = p.get('to') || '';
  document.querySelector('#sort').value = p.get('sort') === 'old' ? 'old' : 'new';

  const sources = p.getAll('source');
  if (sources.length) {
    form.querySelectorAll('input[name="source"]').forEach((el) => {
      el.checked = sources.includes(el.value);
    });
  }

  const requestedLimit = Number.parseInt(p.get('limit') || String(DEFAULT_LIMIT), 10);
  currentLimit = ALLOWED_LIMITS.includes(requestedLimit) ? requestedLimit : DEFAULT_LIMIT;
  setPageSizeControls(currentLimit);
  currentOffset = Math.max(0, Number.parseInt(p.get('offset') || '0', 10) || 0);

  return p.has('q') || p.has('source') || p.has('from') || p.has('to') || p.has('sort') || p.has('offset') || p.has('limit');
}

function queryParams(offset = 0) {
  const p = new URLSearchParams();
  const q = document.querySelector('#q').value.trim();
  if (q) p.set('q', q);
  for (const source of checkedSources()) p.append('source', source);
  const from = document.querySelector('#from').value;
  const to = document.querySelector('#to').value;
  const sort = document.querySelector('#sort').value;
  if (from) p.set('from', from);
  if (to) p.set('to', to);
  if (sort !== 'new') p.set('sort', sort);
  if (currentLimit !== DEFAULT_LIMIT) p.set('limit', String(currentLimit));
  if (offset) p.set('offset', String(offset));
  return p;
}

function fmtDate(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
}

function fmtNumber(value) {
  return Number(value || 0).toLocaleString('ja-JP');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function reporterSearchHref(q) {
  const p = new URLSearchParams();
  p.set('q', q);
  p.append('source', 'eddibb:liveedge');
  return `/?${p.toString()}`;
}

function reporterId(item) {
  const direct = String(item.metadent || '').trim();
  if (direct.length === 8) return direct;

  const title = String(item.metadentTitle || '');
  const match = title.match(/\[([A-Za-z0-9+/.]{8})(?:\u2605)?\]\s*$/);
  return match ? match[1] : '';
}

function reporterSearchActions(item) {
  if (item.sourceId !== 'eddibb:liveedge') return '';
  const id = reporterId(item);
  if (!id) return '';

  const full = reporterSearchHref(id);
  const prefix = reporterSearchHref(id.slice(0, 4));
  const suffix = reporterSearchHref(id.slice(-4));
  return `<div class="reporter-search">
    <span class="reporter-search-label">記者ID検索</span>
    <a href="${escapeHtml(full)}">8文字</a>
    <a href="${escapeHtml(prefix)}">前4文字</a>
    <a href="${escapeHtml(suffix)}">後4文字</a>
  </div>`;
}

function kyodemoUrl(item) {
  const threadId = String(item.threadId || '').trim();
  if (!threadId) return '';
  if (item.sourceId === 'eddibb:liveedge') {
    return `https://kyodemo.net/sdemo/r/e_e_liveedge/${encodeURIComponent(threadId)}/`;
  }
  if (item.sourceId?.startsWith('5ch:') && item.board) {
    return `https://kyodemo.net/sdemo/r/${encodeURIComponent(item.board)}/${encodeURIComponent(threadId)}/`;
  }
  return '';
}

function threadActions(item, title, threadUrl) {
  const kyo = kyodemoUrl(item);
  const titleButton = `<button type="button" data-copy="${escapeHtml(title)}">タイトルコピー</button>`;
  const urlButton = threadUrl
    ? `<button type="button" data-copy="${escapeHtml(threadUrl)}">URLコピー</button>`
    : '';
  const kyodemoLink = kyo
    ? `<a href="${escapeHtml(kyo)}" target="_blank" rel="noopener noreferrer">kyodemo</a>`
    : '';
  const kyodemoCopy = kyo
    ? `<button type="button" data-copy="${escapeHtml(kyo)}">kyodemo URLコピー</button>`
    : '';
  return `<div class="thread-actions">${titleButton}${urlButton}${kyodemoLink}${kyodemoCopy}</div>`;
}

function responseCountLabel(item) {
  const value = fmtNumber(item.responseCount || 0);
  const oldObservedValue = item.active === false && !item.endedAt;
  return `${value}${oldObservedValue ? '↑' : ''}レス`;
}

function renderThreads(threads) {
  if (!threads.length) {
    results.innerHTML = '<div class="empty">一致するスレッドはありません</div>';
    return;
  }
  results.innerHTML = threads.map((item) => {
    const title = item.sourceId === 'eddibb:liveedge'
      ? (item.metadentTitle || item.normalTitle || '(タイトルなし)')
      : (item.normalTitle || item.metadentTitle || '(タイトルなし)');
    const href = item.url || '#';
    const active = item.active ? '<span class="live" title="現行スレ"></span>' : '';
    const actions = threadActions(item, title, item.url || '');
    const reporterActions = reporterSearchActions(item);
    return `<article class="result">
      <a class="result-main" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer">
        <div class="result-top"><span class="board-tag">${escapeHtml(item.sourceLabel)}</span>${active}</div>
        <div class="title">${escapeHtml(title)}</div>
        <div class="meta">
          <span>${escapeHtml(fmtDate(item.firstSeenAt))}</span>
          <span>${escapeHtml(responseCountLabel(item))}</span>
          <span>${escapeHtml(item.threadId)}</span>
        </div>
      </a>
      <div class="result-tools">
        ${actions}
        ${reporterActions}
      </div>
    </article>`;
  }).join('');
}

function setPagerHidden(hidden) {
  pagers.forEach((pager) => { pager.hidden = hidden; });
}

function updatePager() {
  const page = Math.floor(currentOffset / currentLimit) + 1;
  const pages = Math.max(1, Math.ceil(currentTotal / currentLimit));
  setPagerHidden(currentTotal <= 0);
  prevButtons.forEach((button) => { button.disabled = currentOffset <= 0; });
  nextButtons.forEach((button) => { button.disabled = currentOffset + currentLimit >= currentTotal; });
  pageInputs.forEach((input) => {
    input.value = String(Math.min(page, pages));
    input.max = String(pages);
  });
  pageTotals.forEach((el) => { el.textContent = fmtNumber(pages); });
  setPageSizeControls(currentLimit);
}

function jumpToPage(input) {
  if (currentTotal <= 0) return;
  const pages = Math.max(1, Math.ceil(currentTotal / currentLimit));
  let page = Number.parseInt(input.value || '1', 10);
  if (!Number.isFinite(page)) page = 1;
  page = Math.min(pages, Math.max(1, page));
  pageInputs.forEach((el) => { el.value = String(page); });
  const offset = (page - 1) * currentLimit;
  if (offset !== currentOffset) runSearch(offset, true);
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  textarea.remove();
}

function flashCopied(button) {
  const original = button.textContent;
  button.textContent = 'コピー済み';
  button.classList.add('copied');
  window.setTimeout(() => {
    button.textContent = original;
    button.classList.remove('copied');
  }, 1100);
}

async function runSearch(offset = 0, push = true) {
  const sources = checkedSources();
  if (!sources.length) {
    results.innerHTML = '<div class="error">対象板を1つ以上選択してください</div>';
    summary.textContent = '検索できません';
    setPagerHidden(true);
    return;
  }

  currentOffset = Math.max(0, offset);
  const visibleParams = queryParams(currentOffset);
  const apiParams = new URLSearchParams(visibleParams);
  apiParams.set('limit', String(currentLimit));
  if (push) history.pushState(null, '', `${location.pathname}?${visibleParams}`);

  results.innerHTML = '<div class="loading">検索中…</div>';
  summary.textContent = '検索しています';
  engine.textContent = '';
  setPagerHidden(true);

  try {
    const response = await fetch(`/api/search?${apiParams}`, { headers: { Accept: 'application/json' } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || '検索に失敗しました');

    currentTotal = Number(data.total || 0);
    if (currentTotal && currentOffset >= currentTotal) {
      const lastOffset = Math.floor((currentTotal - 1) / currentLimit) * currentLimit;
      return runSearch(lastOffset, push);
    }
    const begin = currentTotal ? currentOffset + 1 : 0;
    const end = Math.min(currentOffset + (data.threads?.length || 0), currentTotal);
    summary.textContent = `${fmtNumber(currentTotal)}件${currentTotal ? ` — ${fmtNumber(begin)}〜${fmtNumber(end)}件` : ''}`;
    engine.textContent = data.searchEngine ? `search: ${data.searchEngine}` : '';
    renderThreads(data.threads || []);
    updatePager();
  } catch (err) {
    currentTotal = 0;
    summary.textContent = '検索に失敗しました';
    engine.textContent = '';
    results.innerHTML = `<div class="error">${escapeHtml(err.message || '検索APIに接続できません')}</div>`;
    setPagerHidden(true);
  }
}

async function loadRecent() {
  const params = new URLSearchParams();
  for (const source of checkedSources()) params.append('source', source);
  params.set('limit', String(DEFAULT_LIMIT));
  results.innerHTML = '<div class="loading">最新スレッドを読み込み中…</div>';
  summary.textContent = '最新スレッド';
  engine.textContent = '';
  setPagerHidden(true);
  try {
    const response = await fetch(`/api/recent?${params}`, { headers: { Accept: 'application/json' } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.detail || '最新スレッドの取得に失敗しました');
    const items = data.threads || [];
    summary.textContent = `最新スレッド ${fmtNumber(items.length)}件`;
    renderThreads(items);
  } catch (err) {
    summary.textContent = '最新スレッドを取得できません';
    results.innerHTML = `<div class="error">${escapeHtml(err.message || '検索APIに接続できません')}</div>`;
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  runSearch(0, true);
});

results.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-copy]');
  if (!button) return;
  try {
    await copyText(button.dataset.copy || '');
    flashCopied(button);
  } catch {
    const original = button.textContent;
    button.textContent = 'コピー失敗';
    window.setTimeout(() => { button.textContent = original; }, 1200);
  }
});

prevButtons.forEach((button) => {
  button.addEventListener('click', () => runSearch(Math.max(0, currentOffset - currentLimit), true));
});
nextButtons.forEach((button) => {
  button.addEventListener('click', () => runSearch(currentOffset + currentLimit, true));
});
pageInputs.forEach((input) => {
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      jumpToPage(input);
    }
  });
  input.addEventListener('change', () => jumpToPage(input));
});
pageSizes.forEach((select) => {
  select.addEventListener('change', () => {
    const nextLimit = Number.parseInt(select.value, 10);
    if (!ALLOWED_LIMITS.includes(nextLimit) || nextLimit === currentLimit) return;
    const oldOffset = currentOffset;
    currentLimit = nextLimit;
    setPageSizeControls(currentLimit);
    const nextOffset = Math.floor(oldOffset / currentLimit) * currentLimit;
    runSearch(nextOffset, true);
  });
});

window.addEventListener('popstate', () => {
  restoreFromUrl();
  runSearch(currentOffset, false);
});

const hadQuery = restoreFromUrl();
if (hadQuery) {
  runSearch(currentOffset, false);
} else {
  loadRecent();
}
