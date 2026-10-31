/**
 * Drives the "Complete Your Look" cart upsell (snippets/nesovi-cart-upsell.liquid).
 *
 * This is loaded unconditionally (see cart-drawer.liquid) rather than as an inline
 * <script> inside the conditionally-rendered snippet. The snippet only renders once
 * cart.item_count > 0, so on a customer's first add-to-cart the drawer's section-morph
 * inserts that markup into the DOM for the first time — and script tags inserted via
 * innerHTML/DOM-parsing (which is how assets/morph.js builds the new tree) never execute.
 * Keeping the logic here, always present from initial page load, means the cart:update
 * listener is already attached by the time that first add-to-cart happens.
 */
(function () {
  function money(c) {
    return '₹' + (c / 100).toFixed(2).replace(/\.00$/, '');
  }

  function resize(url) {
    return url ? url.replace(/(\.[a-z]+)(\?|$)/, '_180x$1$2') : '';
  }

  function esc(s) {
    return (s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderItems(el, products) {
    var wrap = el.querySelector('.nesovi-cu-items');
    var limit = parseInt(el.dataset.limit) || 3;
    fetch('/cart.js')
      .then(function (r) {
        return r.json();
      })
      .then(function (cart) {
        var inCart = cart.items.map(function (i) {
          return i.product_id;
        });
        var list = (products || [])
          .filter(function (p) {
            var v = p.variants && p.variants[0];
            return inCart.indexOf(p.id) < 0 && v && v.available;
          })
          .slice(0, limit);
        if (!list.length) {
          el.hidden = true;
          return;
        }
        el.hidden = false;
        wrap.innerHTML = list
          .map(function (p) {
            var v = p.variants[0];
            var off = '';
            if (v.compare_at_price > v.price) {
              var pct = Math.round(((v.compare_at_price - v.price) / v.compare_at_price) * 100);
              off =
                '<span class="nesovi-cu-compare">' +
                money(v.compare_at_price) +
                '</span><span class="nesovi-cu-off">-' +
                pct +
                '%</span>';
            }
            return (
              '<div class="nesovi-cu-item">' +
              '<div class="nesovi-cu-imgwrap">' +
              '<img src="' +
              resize(p.featured_image) +
              '" alt="" loading="lazy">' +
              '<button type="button" class="nesovi-cu-add" data-v="' +
              v.id +
              '" aria-label="Add ' +
              esc(p.title) +
              ' to cart">+</button>' +
              '</div>' +
              '<div class="nesovi-cu-info">' +
              '<h6>' +
              esc(p.title) +
              '</h6>' +
              '<div class="nesovi-cu-price-row"><span class="nesovi-cu-price">' +
              money(v.price) +
              '</span>' +
              off +
              '</div>' +
              '</div>' +
              '</div>'
            );
          })
          .join('');
      })
      .catch(function () {
        el.hidden = true;
      });
  }

  function loadAuto(el) {
    var limit = parseInt(el.dataset.limit) || 3;
    fetch('/cart.js')
      .then(function (r) {
        return r.json();
      })
      .then(function (cart) {
        if (!cart.items.length) {
          el.hidden = true;
          return;
        }
        fetch('/recommendations/products.json?product_id=' + cart.items[0].product_id + '&limit=' + (limit + 4))
          .then(function (r) {
            return r.json();
          })
          .then(function (d) {
            renderItems(el, d.products || []);
          })
          .catch(function () {
            el.hidden = true;
          });
      });
  }

  function load() {
    var el = document.getElementById('nesovi-cart-upsell');
    if (!el) return;
    var source = el.dataset.source;
    if (source === 'auto') {
      loadAuto(el);
    } else {
      var dataEl = document.querySelector('[data-nesovi-cu-data]');
      var products = dataEl ? JSON.parse(dataEl.textContent || '[]') : [];
      renderItems(el, products);
    }
  }

  function addToCart(btn) {
    var vid = parseInt(btn.dataset.v);
    if (!vid) return;
    btn.disabled = true;
    btn.textContent = '…';
    fetch('/cart/add.js', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: vid, quantity: 1 }),
    })
      .then(function (r) {
        return r.json();
      })
      .then(function () {
        btn.textContent = '✓';
        return fetch('/cart.js')
          .then(function (r) {
            return r.json();
          })
          .then(function (cart) {
            document.dispatchEvent(
              new CustomEvent('cart:update', { bubbles: true, detail: { resource: cart, data: { source: 'nesovi-cart-upsell' } } })
            );
          });
      })
      .catch(function () {
        btn.disabled = false;
        btn.textContent = '+';
      });
  }

  // Delegate clicks on `document` rather than the upsell element itself — the element
  // may not exist yet when this script runs, and section-morph can replace it wholesale
  // on later cart updates, which would silently drop a listener bound directly to it.
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.nesovi-cu-add');
    if (btn) addToCart(btn);
  });

  // Deferred: cart-items-component also listens for this event on `document` and
  // performs the section morph that (re)creates #nesovi-cart-upsell. Listeners run in
  // attachment order, and this script can attach first, so call load() on the next
  // macrotask to guarantee the morph has already run by the time we look for the element.
  document.addEventListener('cart:update', function () {
    setTimeout(load, 0);
  });

  // Some custom add-to-cart buttons on the site (e.g. sections/nesovi-shop-grid.liquid)
  // dispatch cart:update without section HTML in the detail, so cart-items-component
  // falls back to an async re-fetch-and-render instead of a synchronous morph — a delay
  // the setTimeout above doesn't cover. Watch the DOM directly for the very first time
  // #nesovi-cart-upsell gets inserted (going from an empty to a non-empty cart) and load
  // it then, however long the render actually took. Once seen, the element persists
  // across later renders (data-skip-node-update/-subtree-update), so this only needs to
  // fire once — later updates are handled by the cart:update listener above.
  var observer = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var added = mutations[i].addedNodes;
      for (var j = 0; j < added.length; j++) {
        var node = added[j];
        if (!(node instanceof Element)) continue;
        if (node.id === 'nesovi-cart-upsell' || (node.querySelector && node.querySelector('#nesovi-cart-upsell'))) {
          observer.disconnect();
          load();
          return;
        }
      }
    }
  });

  function startObserving() {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      load();
      startObserving();
    });
  } else {
    load();
    startObserving();
  }
})();
