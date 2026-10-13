const sections = ['settings', 'activity'];
const $ = (id) => document.getElementById(id);
function showSection(section, focus = false) {
  const selected = sections.includes(section) ? section : 'settings';
  for (const name of sections) {
    const active = name === selected,
      tab = $(name + 'Tab');
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    $(name + 'Panel').hidden = !active;
  }
  if (focus) $(selected + 'Tab').focus();
}
function openSection(section) {
  location.hash = '#' + section;
  showSection(section, true);
}
for (const [index, name] of sections.entries()) {
  $(name + 'Tab').addEventListener('click', () => openSection(name));
  $(name + 'Tab').addEventListener('keydown', (event) => {
    let next;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
      next = sections[(index + 1) % sections.length];
    else if (event.key === 'Home') next = 'settings';
    else if (event.key === 'End') next = 'activity';
    else return;
    event.preventDefault();
    openSection(next);
  });
}
window.addEventListener('hashchange', () =>
  showSection(location.hash.slice(1)),
);
showSection(location.hash.slice(1));
