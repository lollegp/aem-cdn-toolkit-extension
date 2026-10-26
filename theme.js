// Appearance is a browser preference, separate from environment configuration.
(() => {
  const normalize = (value) =>
    ['light', 'dark'].includes(value) ? value : 'system';
  const select = document.getElementById('themePreference');
  const status = document.getElementById('themeStatus');
  let preference = 'system';
  let revision = 0;
  function apply(value) {
    preference = normalize(value);
    document.documentElement.dataset.theme = preference;
    if (select) select.value = preference;
  }
  apply(preference);
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.themePreference) {
      revision++;
      apply(changes.themePreference.newValue);
    }
  });
  const initialRevision = revision;
  chrome.storage.local
    .get('themePreference')
    .then((saved) => {
      if (revision === initialRevision) apply(saved.themePreference);
    })
    .catch(() => {});
  select?.addEventListener('change', async () => {
    const value = normalize(select.value);
    select.disabled = true;
    revision++;
    try {
      await chrome.storage.local.set({ themePreference: value });
      apply(value);
      if (status) status.textContent = 'Appearance saved.';
    } catch {
      apply(preference);
      if (status) status.textContent = 'Could not save appearance. Try again.';
    } finally {
      select.disabled = false;
    }
  });
})();
