import { Component } from '@theme/component';

/**
 * A fixed bottom bar (mobile only) that mirrors the real Add to cart button and delegates
 * clicks to it so the actual add-to-cart form submission, validation and animations stay
 * in a single place. Always visible (not scroll-triggered) — see the `data-visible`
 * attribute set in the markup.
 *
 * @typedef {object} Refs
 * @property {HTMLButtonElement} [button] - The sticky bar's own button.
 *
 * @extends Component<Refs>
 */
export class StickyAddToCartBar extends Component {
  connectedCallback() {
    super.connectedCallback();

    const sourceButton = this.closest('.product-information')?.querySelector('[name="add"][type="submit"]');

    if (!(sourceButton instanceof HTMLButtonElement)) return;

    this.#sourceButton = sourceButton;

    if (sourceButton.disabled && this.refs.button) {
      this.refs.button.disabled = true;
    }
  }

  /** @type {HTMLButtonElement | null} */
  #sourceButton = null;

  handleClick() {
    this.#sourceButton?.click();
  }
}

if (!customElements.get('sticky-add-to-cart-bar')) {
  customElements.define('sticky-add-to-cart-bar', StickyAddToCartBar);
}
