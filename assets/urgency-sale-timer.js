/**
 * Urgency sale countdown, rendered by snippets/urgency-sale-timer.liquid in the Urgency Sale Timer
 * section, the announcement bar and the cart drawer. One schedule in Theme settings > Urgency sale timer.
 * Shows hours / minutes / seconds only; hours can go past 24.
 *
 * Attributes (dates are ISO strings with the store's UTC offset):
 * - start: optional; the timer stays hidden before this
 * - end: when the whole sale ends; required
 * - mode: repeat | hide | message
 * - cycle-ms: countdown length in repeat mode; cycles start at `start` (or count back from `end`)
 * - hide-section: hide the whole section (not just this element) while the timer is not running
 */
class UrgencySaleTimer extends HTMLElement {
  /** @type {number | undefined} */
  #intervalId;

  connectedCallback() {
    this.#tick();
    this.#intervalId = window.setInterval(() => this.#tick(), 1000);
  }

  disconnectedCallback() {
    window.clearInterval(this.#intervalId);
  }

  /**
   * @param {string} name
   * @returns {number | null}
   */
  #time(name) {
    const value = this.getAttribute(name);
    if (!value) return null;
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : time;
  }

  #tick() {
    const now = Date.now();
    const start = this.#time('start');
    const end = this.#time('end');
    const mode = this.getAttribute('mode');

    if (end === null) {
      this.#stop('hidden');
      return;
    }

    // Before the sale starts: stay hidden but keep ticking so it appears on time.
    if (start !== null && now < start) {
      this.#setState('hidden');
      return;
    }

    if (now >= end) {
      this.#stop(mode === 'message' ? 'message' : 'hidden');
      return;
    }

    let target = end;
    const cycle = Number(this.getAttribute('cycle-ms'));
    if (mode === 'repeat' && cycle > 0) {
      const anchor = start ?? end;
      const elapsed = (((now - anchor) % cycle) + cycle) % cycle;
      target = Math.min(now + cycle - elapsed, end);
    }

    this.#render(target - now);
    this.#setState('running');
  }

  /** @param {number} remainingMs */
  #render(remainingMs) {
    const total = Math.max(0, Math.floor(remainingMs / 1000));
    this.#setText('hours', Math.floor(total / 3600));
    this.#setText('minutes', Math.floor((total % 3600) / 60));
    this.#setText('seconds', total % 60);
  }

  /**
   * @param {string} part
   * @param {number} value
   */
  #setText(part, value) {
    const el = this.querySelector(`[data-urgency-timer-${part}]`);
    const text = String(value).padStart(2, '0');
    if (el && el.textContent !== text) el.textContent = text;
  }

  /** @param {'hidden' | 'message'} state */
  #stop(state) {
    window.clearInterval(this.#intervalId);
    this.#setState(state);
  }

  /** @param {'hidden' | 'running' | 'message'} state */
  #setState(state) {
    this.hidden = state === 'hidden';
    if (this.hasAttribute('hide-section')) {
      const section = this.closest('.shopify-section');
      if (section instanceof HTMLElement) section.hidden = state === 'hidden';
    }
    const display = this.querySelector('[data-urgency-timer-display]');
    const message = this.querySelector('[data-urgency-timer-message]');
    if (display instanceof HTMLElement) display.hidden = state === 'message';
    if (message instanceof HTMLElement) message.hidden = state !== 'message';
  }
}

if (!customElements.get('urgency-sale-timer-component')) {
  customElements.define('urgency-sale-timer-component', UrgencySaleTimer);
}
