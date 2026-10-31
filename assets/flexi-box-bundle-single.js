/*
 * Flexi Box Bundle — single page variant.
 *
 * One flat grid, collection filter pills, one global "pick N" counter and a
 * sticky selection tray. The cart payload is byte-compatible with the step-wise
 * bundle (assets/flexi-box-bundle-script.js): same `_ITEM{n}` line item
 * properties and the same `_bundle_product{n} = sku/price/qty` split, so any
 * downstream discount or reporting logic keeps working unchanged.
 */

document.addEventListener('DOMContentLoaded', function () {
  const root = document.querySelector('.fbs');
  if (!root) return;

  const form = document.getElementById('fbs-form');
  const grid = document.getElementById('fbs-grid');
  const tray = root.querySelector('.fbs-tray');
  const submitBtn = document.getElementById('fbs-submit');
  const noResults = root.querySelector('.fbs__no-results');

  const sheet = document.getElementById('fbs-sheet');

  const totalRequired = parseInt(root.dataset.totalRequired, 10) || 3;
  const bundlePriceCents = Math.round(Number(sheet?.dataset.bundlePrice) || Number(form.dataset.price) || 0);

  /* ---------------------------------------------------------------- money */
  /*
   * The theme exposes `theme.moneyFormat` ("₹{{amount}}") but keeps its own
   * formatter module-private, so this rebuilds just enough: take the literal
   * text either side of the {{amount}} placeholder and group the number using
   * the store's own currency locale (Indian grouping for INR).
   */
  const MONEY_FORMAT = (window.theme && window.theme.moneyFormat) || '₹{{amount}}';
  const MONEY_PARTS = MONEY_FORMAT.split(/\{\{\s*amount[^}]*\}\}/);
  const MONEY_LOCALE =
    window.Shopify && window.Shopify.currency && window.Shopify.currency.active === 'INR' ? 'en-IN' : undefined;

  function money(cents) {
    const whole = Math.round((Number(cents) || 0) / 100);
    return (MONEY_PARTS[0] || '') + whole.toLocaleString(MONEY_LOCALE) + (MONEY_PARTS[1] || '');
  }

  const checkboxes = Array.from(form.querySelectorAll('.fbs-toggle__input'));

  /* Selection order matters — the tray fills slots left to right in the order
     the customer picked, so we keep our own ordered list rather than relying on
     DOM order. */
  let selection = [];

  /* ---------------------------------------------------------------- page chrome */
  /*
   * The stylesheet already hides the mobile nav bar and the WhatsApp bubble, but
   * the WhatsApp widget is injected by an app after load and sets its own inline
   * styles — inline wins over a stylesheet rule when it carries !important. The
   * step-wise bundle works around this by polling every 2s for 16s, which leaves
   * the button visible for a beat and then stops watching. An observer costs
   * less and never gives up.
   */
  const CHROME_SELECTORS = ['.mobilesticky-barblock', '.mobilesticky-bar', '.WhatsAppButton__root'];

  function hidePageChrome() {
    CHROME_SELECTORS.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) {
        if (el.style.display !== 'none') el.style.setProperty('display', 'none', 'important');
      });
    });
  }

  hidePageChrome();

  let chromeQueued = false;
  // childList only — reacting to attribute changes would re-fire on our own
  // style writes and spin.
  new MutationObserver(function () {
    if (chromeQueued) return;
    chromeQueued = true;
    requestAnimationFrame(function () {
      chromeQueued = false;
      hidePageChrome();
    });
  }).observe(document.body, { childList: true, subtree: true });

  /* ---------------------------------------------------------------- selection */

  function syncSelection() {
    selection = selection.filter((cb) => cb.checked);
    checkboxes.forEach((cb) => {
      if (cb.checked && !selection.includes(cb)) selection.push(cb);
    });
  }

  function atLimit() {
    return selection.length >= totalRequired;
  }

  function lockUnselected() {
    const locked = atLimit();
    checkboxes.forEach((cb) => {
      const card = cb.closest('.fbs-card');
      if (cb.checked) {
        card?.classList.add('is-selected');
        card?.classList.remove('is-locked');
        cb.disabled = false;
      } else {
        card?.classList.remove('is-selected');
        card?.classList.toggle('is-locked', locked);
        cb.disabled = locked;
      }
    });
  }

  function renderTray() {
    const slots = tray.querySelectorAll('.fbs-tray__slot');
    slots.forEach((slot, i) => {
      const cb = selection[i];
      slot.innerHTML = '';
      if (cb) {
        const img = document.createElement('img');
        img.src = cb.dataset.thumb || '';
        img.alt = cb.dataset.title || '';
        img.loading = 'lazy';
        slot.appendChild(img);
        slot.classList.add('is-filled');
        slot.title = cb.dataset.title || '';
      } else {
        const plus = document.createElement('span');
        plus.className = 'fbs-tray__slot-plus';
        plus.setAttribute('aria-hidden', 'true');
        plus.textContent = '+';
        slot.appendChild(plus);
        slot.classList.remove('is-filled');
        slot.removeAttribute('title');
      }
    });

    const remaining = Math.max(0, totalRequired - selection.length);

    tray.querySelector('.fbs-tray__count-current').textContent = selection.length;

    const hint = tray.querySelector('.fbs-tray__hint');
    const price = hint.dataset.unlockPrice || '';
    if (remaining === 0) {
      hint.textContent = hint.dataset.unlockDone.replace('[price]', price);
    } else if (remaining === 1) {
      hint.textContent = (hint.dataset.unlockSingular + ' ' + price).trim();
    } else {
      hint.textContent = (hint.dataset.unlockPlural.replace('[n]', remaining) + ' ' + price).trim();
    }

    tray.dataset.state = selection.length === 0 ? 'empty' : remaining === 0 ? 'complete' : 'partial';

    const ready = remaining === 0 && !submitBtn.hasAttribute('data-unavailable');
    submitBtn.disabled = !ready;

    renderSheet(ready);
  }

  /* ---------------------------------------------------------------- your box sheet */

  function subtotalCents() {
    return selection.reduce(function (sum, cb) {
      return sum + (Math.round(Number(cb.dataset.price)) || 0);
    }, 0);
  }

  function renderSheet(ready) {
    if (!sheet) return;

    const subtotal = subtotalCents();
    const discount = subtotal - bundlePriceCents;

    // Strikethrough on the tray + sheet footer: what the items would cost apart.
    // Gated on `ready` for the same reason as the bill summary below — until the
    // box is full the bundle price is not unlocked, so striking through a lower
    // subtotal would imply a discount the customer cannot have yet.
    root.querySelectorAll('.fbs-tray__price-compare').forEach(function (el) {
      el.textContent = money(subtotal);
      el.hidden = !ready || discount <= 0;
    });

    sheet.querySelector('.fbs-sheet__count').textContent = selection.length;
    sheet.querySelector('.fbs-sheet__bill-count').textContent = selection.length;
    // "1 item" / "2 items"
    const unit = sheet.querySelector('.fbs-sheet__bill-unit');
    if (unit) unit.textContent = selection.length === 1 ? 'item' : 'items';

    const list = sheet.querySelector('.fbs-sheet__items');
    list.innerHTML = '';
    selection.forEach(function (cb) {
      const li = document.createElement('li');
      li.className = 'fbs-sheet__item';

      const img = document.createElement('img');
      img.className = 'fbs-sheet__item-thumb';
      img.src = cb.dataset.thumb || '';
      img.alt = '';
      img.loading = 'lazy';

      const info = document.createElement('div');
      info.className = 'fbs-sheet__item-info';

      const title = document.createElement('p');
      title.className = 'fbs-sheet__item-title';
      title.textContent = cb.dataset.productTitle || cb.dataset.title || '';

      const variant = document.createElement('p');
      variant.className = 'fbs-sheet__item-variant';
      variant.textContent = cb.dataset.variant || '';

      info.append(title, variant);

      // Price above, Remove beneath it — both right-aligned, as in the reference.
      const side = document.createElement('div');
      side.className = 'fbs-sheet__item-side';

      const price = document.createElement('span');
      price.className = 'fbs-sheet__item-price';
      price.textContent = money(cb.dataset.price);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'fbs-sheet__item-remove';
      remove.textContent = sheet.dataset.removeLabel || 'Remove';
      remove.addEventListener('click', function () {
        cb.checked = false;
        update();
      });

      side.append(price, remove);

      li.append(img, info, side);
      list.appendChild(li);
    });

    // Dashed placeholder rows for the slots still to be filled.
    for (let i = selection.length; i < totalRequired; i++) {
      const li = document.createElement('li');
      li.className = 'fbs-sheet__item fbs-sheet__item--empty';

      const box = document.createElement('span');
      box.className = 'fbs-sheet__item-placeholder';
      box.textContent = '+';

      const label = document.createElement('span');
      label.className = 'fbs-sheet__item-placeholder-label';
      label.textContent = sheet.dataset.placeholderLabel || 'Product';

      li.append(box, label);
      list.appendChild(li);
    }

    const hasItems = selection.length > 0;
    sheet.querySelector('.fbs-sheet__empty').hidden = hasItems;
    sheet.querySelector('.fbs-sheet__bill').hidden = !hasItems;

    sheet.querySelector('.fbs-sheet__subtotal').textContent = money(subtotal);

    // Only claim a discount once the box is full — a partial box is not yet
    // eligible for the bundle price, so showing a saving would be a lie.
    const showDiscount = ready && discount > 0;
    sheet.querySelector('.fbs-sheet__bill-row--discount').hidden = !showDiscount;
    sheet.querySelector('.fbs-sheet__discount').textContent = '-' + money(discount);

    const saved = sheet.querySelector('.fbs-sheet__saved');
    saved.hidden = !showDiscount;
    saved.textContent = (sheet.dataset.savedLabel || 'You saved [amount]').replace('[amount]', money(discount));

    sheet.querySelector('.fbs-sheet__total').textContent = money(
      hasItems ? (ready ? bundlePriceCents : subtotal) : 0
    );

    const sheetAtc = sheet.querySelector('.fbs-sheet__atc');
    if (sheetAtc) sheetAtc.disabled = !ready;
  }

  /*
   * The panel lives inside the tray, so opening it is just a matter of hiding
   * the tray's summary row and revealing the panel — the floating card grows
   * upward on its own because it is anchored to its bottom edge.
   */
  const backdrop = root.querySelector('.fbs-sheet-backdrop');

  /*
   * Open and close are synchronous — the card resizes in one frame. No timers
   * gate the layout, so there is no window where the panel is invisible but
   * still occupying height. Only the backdrop fades, and it is a full-screen
   * overlay whose removal cannot affect the card's geometry.
   */
  function openSheet() {
    if (!sheet || tray.classList.contains('is-expanded')) return;
    sheet.hidden = false;
    tray.classList.add('is-expanded');
    if (backdrop) {
      backdrop.hidden = false;
      requestAnimationFrame(function () {
        backdrop.classList.add('is-open');
      });
    }
    document.body.classList.add('overflow-hidden');
    tray.querySelector('.fbs-tray__expand')?.setAttribute('aria-expanded', 'true');
    sheet.querySelector('.fbs-sheet__close')?.focus();
  }

  function closeSheet() {
    if (!sheet || !tray.classList.contains('is-expanded')) return;
    tray.classList.remove('is-expanded');
    sheet.hidden = true;
    tray.querySelector('.fbs-tray__expand')?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('overflow-hidden');
    tray.querySelector('.fbs-tray__expand')?.focus();

    if (!backdrop) return;
    backdrop.classList.remove('is-open');
    backdrop.addEventListener(
      'transitionend',
      function () {
        if (!backdrop.classList.contains('is-open')) backdrop.hidden = true;
      },
      { once: true }
    );
  }

  function flashMessage(title) {
    document.querySelectorAll('.message-bar').forEach(function (bar) {
      const span = bar.querySelector('p span');
      if (span) span.textContent = title;
      bar.classList.remove('is-hidden');
      clearTimeout(bar._fbsTimer);
      bar._fbsTimer = setTimeout(function () {
        bar.classList.add('is-hidden');
        if (span) span.textContent = '';
      }, 2500);
    });
  }

  function update() {
    syncSelection();
    lockUnselected();
    renderTray();
  }

  checkboxes.forEach(function (cb) {
    cb.addEventListener('change', function () {
      if (cb.checked && selection.length >= totalRequired) {
        // Belt and braces — the input should already be disabled at this point.
        cb.checked = false;
        return;
      }
      if (cb.checked) flashMessage(cb.dataset.title || '');
      update();
    });
  });

  /* Clicking a locked card should explain itself rather than do nothing. */
  grid.addEventListener('click', function (e) {
    const card = e.target.closest('.fbs-card.is-locked');
    if (!card || !e.target.closest('.fbs-toggle')) return;
    card.classList.remove('fbs-shake');
    void card.offsetWidth; // restart the animation
    card.classList.add('fbs-shake');
  });

  /* ---------------------------------------------------------------- filters */

  const pills = Array.from(root.querySelectorAll('.fbs__pill'));
  let activeCat = 'all';

  function applyFilters() {
    const searchInput = document.getElementById('fbs-searchbar');
    const term = (searchInput ? searchInput.value : '').trim().toLowerCase();
    let visible = 0;

    grid.querySelectorAll('.fbs-card').forEach(function (card) {
      const cats = (card.dataset.cats || '').split(/\s+/).filter(Boolean);
      const catOk = activeCat === 'all' || cats.includes(activeCat);

      const titleEl = card.querySelector('.fbs-card__title');
      const searchOk = !term || (titleEl && titleEl.textContent.toLowerCase().includes(term));

      const show = catOk && searchOk;
      card.hidden = !show;
      if (show) visible++;
    });

    if (noResults) noResults.hidden = visible !== 0;
  }

  pills.forEach(function (pill) {
    pill.addEventListener('click', function () {
      activeCat = pill.dataset.cat;
      pills.forEach(function (p) {
        const on = p === pill;
        p.classList.toggle('is-active', on);
        p.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      applyFilters();
      // On mobile the grid is a horizontal scroller — rewind it so the first
      // match of the new filter is visible rather than whatever was scrolled to.
      grid.scrollLeft = 0;
      grid.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    });
  });

  const searchbar = document.getElementById('fbs-searchbar');
  if (searchbar) {
    searchbar.addEventListener('keyup', applyFilters);
    root.querySelector('.fbs__search-clear')?.addEventListener('click', function () {
      searchbar.value = '';
      applyFilters();
    });
  }

  /* ---------------------------------------------------------------- sheet wiring */

  // The chevron and the slots/counter block both open the box, which is a
  // bigger and more obvious tap target than the chevron alone.
  tray.querySelector('.fbs-tray__expand')?.addEventListener('click', openSheet);
  tray.querySelector('.fbs-tray__left')?.addEventListener('click', openSheet);

  sheet?.querySelectorAll('[data-fbs-sheet-close]').forEach(function (el) {
    el.addEventListener('click', closeSheet);
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && sheet && !sheet.hidden) closeSheet();
  });

  /* ---------------------------------------------------------------- add to cart */

  async function addBundleToCart(e) {
    e.preventDefault();
    const btn = submitBtn;

    if (btn.dataset.running === '1') return;
    btn.dataset.running = '1';
    btn.disabled = true;
    btn.classList.add('loading');

    try {
      // Unchecked boxes are disabled once the limit is hit; re-enable before
      // reading so the snapshot below is complete and stable.
      form.querySelectorAll("input[type='checkbox']").forEach((cb) => (cb.disabled = false));

      const checkedInputs = Array.from(form.querySelectorAll('input[type="checkbox"]:checked'));
      if (checkedInputs.length === 0) {
        btn.classList.remove('loading');
        btn.dataset.running = '0';
        update();
        return;
      }

      const variantId = parseInt(form.dataset.variantId, 10);
      const parentSku = String(form.dataset.sku || '');
      const parentPriceCents = Math.round(Number(form.dataset.price) || 0);

      const itemProperties = {};
      const bundleProperties = {};
      let itemCounter = 1;
      let bundleCounter = 1;

      // Parent bundle product entry, priced at 0 — the children carry the value.
      bundleProperties[`_bundle_product${bundleCounter}`] = `${parentSku}/0/1`;
      bundleCounter++;

      const totalRegularCents = checkedInputs.reduce(function (sum, input) {
        return sum + Math.round(Number(input.dataset.price) || 0);
      }, 0);

      let priceAssignedCents = 0;
      const lastIdx = checkedInputs.map((i) => String(i.value).trim() !== 'No').lastIndexOf(true);

      checkedInputs.forEach(function (input, idx) {
        if (String(input.value).trim() === 'No') {
          input.disabled = true;
          return;
        }

        itemProperties[`_ITEM${itemCounter}`] = input.value;

        // Split the bundle price across the children in proportion to their own
        // retail price, so per-line reporting stays sensible.
        const inputPriceCents = Math.round(Number(input.dataset.price) || 0);
        let shareCents;
        if (totalRegularCents > 0 && parentPriceCents > 0) {
          shareCents = Math.round((inputPriceCents / totalRegularCents) * parentPriceCents);
        } else if (parentPriceCents > 0) {
          const validCount = checkedInputs.filter((i) => String(i.value).trim() !== 'No').length || 1;
          shareCents = Math.round(parentPriceCents / validCount);
        } else {
          shareCents = 0;
        }

        // Last child absorbs the rounding remainder so the parts sum exactly.
        if (idx === lastIdx) shareCents = parentPriceCents - priceAssignedCents;
        priceAssignedCents += shareCents;

        const priceDecimal = (shareCents / 100).toFixed(2);
        bundleProperties[`_bundle_product${bundleCounter}`] = `${input.dataset.sku || ''}/${priceDecimal}/1`;

        itemCounter++;
        bundleCounter++;
      });

      const res = await fetch('/cart/add.js', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          items: [{ id: variantId, quantity: 1, properties: { ...itemProperties, ...bundleProperties } }]
        })
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.message || 'Could not add bundle to cart');
      }
      await res.json();

      form.reset();
      selection = [];
      update();
      closeSheet();

      // Theme's cart drawer, cart-icon bubble and cart-items-component all
      // listen for this event (see assets/cart-drawer.js, cart-icon.js,
      // component-cart-items.js) — dispatching it is what the normal product
      // form (assets/product-form.js) does after a successful /cart/add, and
      // is what opens the drawer without a full page reload.
      document.dispatchEvent(
        new CustomEvent('cart:update', {
          bubbles: true,
          detail: {
            resource: null,
            sourceId: form.id || 'fbs-form',
            data: { source: 'product-form-component', itemCount: 1 }
          }
        })
      );
    } catch (err) {
      console.error('[fbs] submit error:', err);
      flashMessage('Something went wrong. Please try again.');
    } finally {
      btn.classList.remove('loading');
      btn.dataset.running = '0';
    }
  }

  submitBtn.addEventListener('click', addBundleToCart);
  // The sheet's button is a proxy — same handler, same form, no duplicate id.
  sheet?.querySelector('.fbs-sheet__atc')?.addEventListener('click', addBundleToCart);

  /* ---------------------------------------------------------------- init */

  checkboxes.forEach((cb) => (cb.checked = false));
  update();
  applyFilters();
});
