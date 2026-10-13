import { secureStorage } from './storage.js';
const $ = (id) => document.getElementById(id);
let renderRevision = 0;
function status(text, error = false) {
  $('activityStatus').textContent = text;
  $('activityStatus').dataset.error = error;
}
async function history() {
  const revision = ++renderRevision;
  try {
    const records =
      (await chrome.storage.local.get('purgeHistory')).purgeHistory || [];
    if (revision !== renderRevision) return;
    $('history').replaceChildren();
    status('');
    if (!records.length) {
      $('history').textContent = 'No purge requests recorded.';
      return;
    }
    const search = $('historySearch').value.trim().toLowerCase();
    const filter = $('historyState').value;
    let displayed = 0;
    for (const record of records) {
      if (!record || typeof record.state !== 'string') continue;
      const card = document.createElement('article');
      card.className = 'history-item';
      const title = document.createElement('strong');
      const interrupted =
        record.state === 'pending' &&
        Date.now() - Date.parse(record.startedAt) > 30000;
      const state = interrupted ? 'unknown' : record.state;
      if (filter && state !== filter) continue;
      if (
        search &&
        ![record.environment, record.country, record.target]
          .join(' ')
          .toLowerCase()
          .includes(search)
      )
        continue;
      displayed++;
      const icon =
        {
          succeeded: '✅',
          accepted: '📨',
          failed: '❌',
          pending: '⏳',
          unknown: '⚠️',
        }[state] || '⚠️';
      card.dataset.state = state;
      title.textContent =
        icon +
        ' ' +
        record.environment +
        ' · ' +
        record.country +
        ' · ' +
        (record.scope === 'all' ? 'ENTIRE ENVIRONMENT' : 'PAGE') +
        ' · ' +
        (interrupted ? 'UNKNOWN (request interrupted)' : state.toUpperCase());
      card.append(title);
      const details = document.createElement('div');
      details.className = 'hint history-details';
      const rows = [
        ['Time: ', new Date(record.startedAt).toLocaleString()],
        ['PURGE ', record.target],
        ['X-Forwarded-Host: ', record.forwardedHost],
        ['Mode: ', record.mode],
      ];
      if (record.httpStatus) rows.push(['HTTP ', record.httpStatus]);
      if (record.purgeId) rows.push(['Provider request ID: ', record.purgeId]);
      rows.push(['Local request ID: ', record.id]);
      if (record.error) rows.push(['Error: ', record.error]);
      for (const [label, value] of rows) {
        const row = document.createElement('div');
        const heading = document.createElement('strong');
        heading.textContent = label;
        const content = document.createElement('span');
        content.textContent = String(value ?? '');
        row.append(heading);
        row.append(content);
        details.append(row);
      }
      card.append(details);
      $('history').append(card);
    }
    if (!displayed)
      $('history').textContent = 'No requests match these filters.';
  } catch (error) {
    status(error.message, true);
  }
}
$('historySearch').addEventListener('input', history);
$('historyState').addEventListener('change', history);
$('refreshHistory').addEventListener('click', history);
$('clearHistory').addEventListener('click', async () => {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'clearHistory',
    });
    if (!response?.ok)
      throw new Error(
        response?.text ||
          'Unable to clear activity. Reload the extension and try again.',
      );
    await history();
  } catch (error) {
    status(error.message, true);
  }
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.purgeHistory) return history();
});
try {
  await secureStorage();
  await history();
} catch (error) {
  status(error.message, true);
}
