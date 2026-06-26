// Pricing page behaviour.
//
// On load this tries to fetch live prices from /api/pricing (a Netlify function
// that proxies The Ironing Man API server-side — the API key never reaches the
// browser). On success it replaces the price list with the live figures. If the
// request fails for any reason, the static prices already in the HTML are left
// in place as a fallback, so the page is never broken.
//
// The category filter and per-category item counts are wired up here too, so
// they work whether the prices are live or the static fallback.

(function () {
  const list = document.getElementById('priceList');
  const status = document.getElementById('priceStatus');

  attachFilter();

  if (!list) {
    refreshCounts();
    return;
  }

  fetch('/api/pricing', { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('status ' + r.status))))
    .then((data) => {
      if (!data || !Array.isArray(data.categories) || !data.categories.length) {
        throw new Error('empty');
      }
      render(list, data.categories);
      refreshCounts();
      showStatus('Live prices' + (data.updatedAt ? ' · updated ' + formatDate(data.updatedAt) : ''));
    })
    .catch(() => {
      // Keep the static fallback prices already in the DOM.
      refreshCounts();
    });

  // --- Rendering ------------------------------------------------------------

  function render(container, categories) {
    const frag = document.createDocumentFragment();
    categories.forEach((cat) => {
      const details = el('details', 'price-group');

      const summary = el('summary');
      summary.appendChild(el('h2', null, cat.name));
      summary.appendChild(el('span', 'cat-count'));
      summary.insertAdjacentHTML(
        'beforeend',
        '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 9 6 6 6-6"/></svg>'
      );
      details.appendChild(summary);

      const body = el('div', 'price-group-body');
      (cat.groups || []).forEach((group) => {
        if (group.name) body.appendChild(el('div', 'price-sub', group.name));
        (group.items || []).forEach((item) => {
          const row = el('div', 'price-row' + (group.name ? ' indent' : ''));
          row.appendChild(el('span', null, item.name));
          row.appendChild(el('span', 'amt', formatPrice(item.price)));
          body.appendChild(row);
        });
      });
      details.appendChild(body);
      frag.appendChild(details);
    });

    container.replaceChildren(frag);
  }

  // --- Filter + counts (work on whatever rows are currently in the DOM) -----

  function attachFilter() {
    const filter = document.getElementById('priceFilter');
    const noResults = document.getElementById('noResults');
    if (!filter) return;

    filter.addEventListener('input', () => {
      const q = filter.value.trim().toLowerCase();
      let anyVisible = false;
      document.querySelectorAll('.price-group').forEach((group) => {
        let groupVisible = false;
        group.querySelectorAll('.price-row').forEach((row) => {
          const match = !q || row.textContent.toLowerCase().includes(q);
          row.style.display = match ? '' : 'none';
          if (match) {
            groupVisible = true;
            anyVisible = true;
          }
        });
        group.querySelectorAll('.price-sub').forEach((sub) => {
          let n = sub.nextElementSibling,
            show = false;
          while (n && n.classList.contains('price-row') && n.classList.contains('indent')) {
            if (n.style.display !== 'none') {
              show = true;
              break;
            }
            n = n.nextElementSibling;
          }
          sub.style.display = show ? '' : 'none';
        });
        group.style.display = groupVisible ? '' : 'none';
        group.open = q ? groupVisible : false;
      });
      if (noResults) noResults.style.display = anyVisible ? 'none' : 'block';
    });
  }

  function refreshCounts() {
    document.querySelectorAll('.price-group').forEach((group) => {
      const n = group.querySelectorAll('.price-row').length;
      const badge = group.querySelector('.cat-count');
      if (badge) badge.textContent = n + (n === 1 ? ' item' : ' items');
    });
  }

  // --- Helpers --------------------------------------------------------------

  function showStatus(text) {
    if (!status) return;
    status.textContent = text;
    status.hidden = false;
  }

  function formatPrice(value) {
    const n = typeof value === 'number' ? value : parseFloat(value);
    return isFinite(n) ? '£' + n.toFixed(2) : '';
  }

  function formatDate(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }
})();
