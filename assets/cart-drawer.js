import { DialogComponent, DialogOpenEvent } from '@theme/dialog';
import { CartAddEvent } from '@theme/events';

/**
 * A custom element that manages a cart drawer.
 *
 * @extends {DialogComponent}
 */
class CartDrawerComponent extends DialogComponent {
  /** Reward milestones reached at the last read; -1 so the first read (page load) never celebrates. */
  #tiersAchieved = -1;
  #pendingConfetti = false;
  /** @type {MutationObserver | undefined} */
  #tiersObserver;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener(CartAddEvent.eventName, this.#handleCartAdd);

    // Every cart refresh (add, quantity change, upsell, cart:update) morphs this section in place,
    // which updates #CartDrawerTiers' data-tiers-achieved or swaps the drawer's children.
    this.#checkTiers();
    this.#tiersObserver = new MutationObserver(this.#checkTiers);
    this.#tiersObserver.observe(this, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['data-tiers-achieved'],
    });
    this.addEventListener(DialogOpenEvent.eventName, this.#handleDialogOpen);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(CartAddEvent.eventName, this.#handleCartAdd);
    this.#tiersObserver?.disconnect();
    this.removeEventListener(DialogOpenEvent.eventName, this.#handleDialogOpen);
  }

  #checkTiers = () => {
    const tiers = this.querySelector('.cd-tiers-wrap');
    if (!(tiers instanceof HTMLElement)) return;

    const achieved = parseInt(tiers.dataset.tiersAchieved || '0', 10);
    const previous = this.#tiersAchieved;
    if (achieved === previous) return;

    this.#tiersAchieved = achieved;
    if (achieved < previous) this.#pendingConfetti = false;
    if (previous < 0 || achieved <= previous || tiers.dataset.confetti !== 'true') return;

    if (this.refs.dialog?.open) {
      this.#burst();
    } else {
      // Quick add with the drawer closed: celebrate when it next opens.
      this.#pendingConfetti = true;
    }
  };

  #handleDialogOpen = () => {
    if (!this.#pendingConfetti) return;
    this.#pendingConfetti = false;
    setTimeout(() => this.#burst(), 300);
  };

  #burst() {
    burstConfetti(this.querySelector('.cd-confetti-host'));
  }

  #handleCartAdd = () => {
    if (this.hasAttribute('auto-open')) {
      this.showDialog();
    }
  };

  open() {
    this.showDialog();

    /**
     * Close cart drawer when installments CTA is clicked to avoid overlapping dialogs
     */
    customElements.whenDefined('shopify-payment-terms').then(() => {
      const installmentsContent = document.querySelector('shopify-payment-terms')?.shadowRoot;
      const cta = installmentsContent?.querySelector('#shopify-installments-cta');
      cta?.addEventListener('click', this.closeDialog, { once: true });
    });
  }

  close() {
    this.closeDialog();
  }
}

if (!customElements.get('cart-drawer-component')) {
  customElements.define('cart-drawer-component', CartDrawerComponent);
}

/**
 * Rotating offer bar at the bottom of the cart drawer. Pauses on hover/focus.
 */
class CartOfferSlider extends HTMLElement {
  #index = 0;
  /** @type {ReturnType<typeof setInterval> | undefined} */
  #timer;

  connectedCallback() {
    const slides = this.#slides;
    if (slides.length < 2) return;

    slides.forEach((slide, i) => this.#setState(slide, i === 0 ? 'active' : null));
    this.dataset.ready = '';
    this.#start();

    this.addEventListener('mouseenter', this.#stop);
    this.addEventListener('mouseleave', this.#start);
    this.addEventListener('focusin', this.#stop);
    this.addEventListener('focusout', this.#start);
  }

  disconnectedCallback() {
    this.#stop();
  }

  get #slides() {
    return /** @type {HTMLElement[]} */ (Array.from(this.querySelectorAll('.cart-offer__slide')));
  }

  #start = () => {
    this.#stop();
    this.#timer = setInterval(this.#next, Number(this.dataset.interval) || 3000);
  };

  #stop = () => {
    clearInterval(this.#timer);
  };

  #next = () => {
    const slides = this.#slides;
    const nextIndex = (this.#index + 1) % slides.length;
    const incoming = slides[nextIndex];

    // With two slides the incoming one is still parked above; drop it below first so it always enters from the bottom.
    if (incoming?.dataset.state === 'prev') {
      this.#setState(incoming, null);
      void incoming.offsetHeight;
    }

    slides.forEach((slide, i) => {
      if (i === this.#index) this.#setState(slide, 'prev');
      else if (i === nextIndex) this.#setState(slide, 'active');
      else this.#setState(slide, null);
    });
    this.#index = nextIndex;
  };

  /**
   * @param {HTMLElement} slide
   * @param {'active' | 'prev' | null} state
   */
  #setState(slide, state) {
    if (state) slide.dataset.state = state;
    else delete slide.dataset.state;
    slide.setAttribute('aria-hidden', String(state !== 'active'));
  }
}

if (!customElements.get('cart-offer-slider')) {
  customElements.define('cart-offer-slider', CartOfferSlider);
}

/**
 * Short canvas confetti burst over the cart drawer. Skipped for reduced-motion users.
 * @param {Element | null} container
 */
function burstConfetti(container) {
  if (!(container instanceof HTMLElement) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'cd-confetti';
  container.append(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.remove();

  const dpr = window.devicePixelRatio || 1;
  const { width, height } = canvas.getBoundingClientRect();
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  ctx.scale(dpr, dpr);

  const colors = ['#f43f5e', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#111827'];
  const pieces = Array.from({ length: 140 }, () => ({
    x: width / 2 + (Math.random() - 0.5) * 60,
    y: height * 0.3,
    vx: (Math.random() - 0.5) * 12,
    vy: -Math.random() * 11 - 3,
    size: Math.random() * 6 + 4,
    angle: Math.random() * Math.PI,
    spin: (Math.random() - 0.5) * 0.3,
    color: colors[Math.floor(Math.random() * colors.length)],
  }));

  const start = performance.now();
  /** @param {number} now */
  const frame = (now) => {
    const t = now - start;
    ctx.clearRect(0, 0, width, height);
    ctx.globalAlpha = Math.max(0, 1 - Math.max(0, t - 1400) / 600);
    for (const p of pieces) {
      p.vy += 0.35;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.spin;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (t < 2000) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}
