import { secureStorage } from './storage.js';
const $ = (id) => document.getElementById(id);
function status(text, error = false) {
  $('activityStatus').textContent = text;
  $('activityStatus').dataset.error = error;
}
async function history() {
  try {
    const records =
      (await chrome.storage.local.get('purgeHistory')).purgeHistory || [];
    $('history').replaceChildren();
    status('');
    if (!records.length) {
      $('history').textContent = 'No purge requests recorded.';
      return;
    }
    for (const record of records) {
      const card = document.createElement('article');
      card.className = 'history-item';
      const title = document.createElement('strong');
      const state =
        record.state === 'pending' &&
        Date.now() - Date.parse(record.startedAt) > 30000
          ? 'UNKNOWN (request interrupted)'
          : record.state.toUpperCase();
      title.textContent =
        record.environment +
        ' · ' +
        record.country +
        ' · ' +
        (record.scope === 'all' ? 'ENTIRE ENVIRONMENT' : 'PAGE') +
        ' · ' +
        state;
      card.append(title);
      const details = document.createElement('p');
      details.className = 'hint';
      details.textContent =
        new Date(record.startedAt).toLocaleString() +
        '\nPURGE ' +
        record.target +
        '\nX-Forwarded-Host: ' +
        record.forwardedHost +
        '\nMode: ' +
        record.mode +
        (record.httpStatus ? ' · HTTP ' + record.httpStatus : '') +
        (record.purgeId ? '\nProvider request ID: ' + record.purgeId : '') +
        '\nLocal request ID: ' +
        record.id +
        (record.error ? '\n' + record.error : '');
      card.append(details);
      $('history').append(card);
    }
  } catch (error) {
    status(error.message, true);
  }
}
$('refreshHistory').addEventListener('click', history);
$('clearHistory').addEventListener('click', async () => {
  try {
    await chrome.storage.local.remove('purgeHistory');
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
