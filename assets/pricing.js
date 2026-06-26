// Pricing page behaviour.
//
// On load this fetches live prices from /api/pricing (a Netlify function that
// proxies the CleanCloud API server-side — the API key never reaches the
// browser) and renders them grouped by category. If the request fails, the
// static prices already in the HTML are left in place as a fallback so the page
// is never broken.
//
// It also builds a category "jump" nav, wires the search filter, and shows a
// per-category item count — working whether the prices are live or the fallback.

(function () {
  const list = document.getElementById('priceList');
  const status = document.getElementById('priceStatus');
  const nav = document.getElementById('priceNav');

  attachFilter();

  if (!list) {
    afterRender();
    return;
  }

  fetch('/api/pricing', { headers: { Accept: 'application/json' } })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error('status ' + r.status))))
    .then((data) => {
      if (!data || !Array.isArray(data.categories) || !data.categories.length) {
        throw new Error('empty');
      }
      render(list, data.categories);
      afterRender({ openFirst: true });
      showStatus('Live prices' + (data.updatedAt ? ' · updated ' + formatDate(data.updatedAt) : ''));
    })
    .catch(() => {
      // Keep the static fallback prices already in the DOM.
      afterRender();
    });

  // --- Rendering ------------------------------------------------------------

  function render(container, categories) {
    const frag = document.createDocumentFragment();
    categories.forEach((cat) => {
      const details = el('details', 'price-group');

      const summary = el('summary');
      const head = el('span', 'pg-head');
      head.insertAdjacentHTML('beforeend', iconFor(cat.name));
      head.appendChild(el('h2', null, cat.name));
      summary.appendChild(head);
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
          const amt = el('span', 'amt', formatPrice(item.price));
          if (item.price == null) amt.classList.add('poa');
          row.appendChild(amt);
          body.appendChild(row);
        });
      });
      details.appendChild(body);
      frag.appendChild(details);
    });

    container.replaceChildren(frag);
  }

  function afterRender(opts) {
    refreshCounts();
    buildNav();
    if (opts && opts.openFirst) {
      const first = document.querySelector('.price-group');
      if (first) first.open = true;
    }
  }

  // --- Category jump nav ----------------------------------------------------

  function buildNav() {
    if (!nav) return;
    const groups = [...document.querySelectorAll('.price-group')];
    if (groups.length < 2) {
      nav.hidden = true;
      return;
    }
    nav.replaceChildren();
    groups.forEach((group, i) => {
      const h2 = group.querySelector('h2');
      if (!h2) return;
      const name = h2.textContent;
      group.id = group.id || 'cat-' + i;
      const pill = el('button', 'price-pill', name);
      pill.type = 'button';
      pill.addEventListener('click', () => {
        group.open = true;
        group.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      nav.appendChild(pill);
    });
    nav.hidden = false;
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
        group.open = q ? groupVisible : group.open;
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
    if (value == null) return 'POA';
    const n = typeof value === 'number' ? value : parseFloat(value);
    if (!isFinite(n) || n <= 0) return 'POA';
    return '£' + n.toFixed(2);
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

  // Pick a category icon from the category name. Falls back to a price tag.
  function iconFor(name) {
    const n = (name || '').toLowerCase();
    const svg = (paths) =>
      '<svg class="pg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' +
      paths +
      '</svg>';
    if (n.includes('iron')) return svg('<path d="M3 15h13v-2a6 6 0 0 0-6-6H6L3 13Z"/><path d="M3 15v3h13"/><path d="M19 7l1.5 1.5"/>');
    if (n.includes('wash') || n.includes('fold') || n.includes('laundry') || n.includes('service'))
      return svg('<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M7 6h.01M10 6h.01"/>');
    if (n.includes('dry clean') || n.includes('dry-clean') || n.includes('suit') || n.includes('dress'))
      return svg('<path d="M12 4a1.8 1.8 0 1 0 1.6 2.6L12 8l8.5 5.4a1 1 0 0 1 .5.9V15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-.7a1 1 0 0 1 .5-.9L12 8"/>');
    if (n.includes('commercial') || n.includes('business') || n.includes('trade'))
      return svg('<rect x="5" y="3" width="14" height="18" rx="1.5"/><path d="M9 7h.01M13 7h.01M9 11h.01M13 11h.01M10 21v-3h4v3"/>');
    if (n.includes('duvet') || n.includes('bed') || n.includes('quilt'))
      return svg('<path d="M3 18v-5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5"/><path d="M3 18h18M3 13V8"/><path d="M7 11V9a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v2"/>');
    return svg('<path d="M3 12V5a2 2 0 0 1 2-2h7l9 9-9 9-9-9Z"/><circle cx="8" cy="8" r="1.4"/>');
  }
})();
