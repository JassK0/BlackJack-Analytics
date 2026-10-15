// The animated blackjack felt: cards, chips, totals and banners, driven imperatively
import type { Decision, HandLog, Rank, Rules } from '../engine/types';
import { handValue } from '../engine/cards';
import { money, payoutLabel } from '../lib/format';

export const ABORT = Symbol('abort');
export interface Token { readonly aborted: boolean }

/** The moments in a hand where a learner may want to stop and read. */
export type Step =
  | { step: 'bet'; amount: number }
  | { step: 'deal'; player: Rank[]; up: Rank }
  | { step: 'peek'; blackjack: boolean }
  | { step: 'natural' }
  | { step: 'decision'; d: Decision; up: Rank }
  | { step: 'dealer'; playerBust: boolean };

export interface Hooks {
  bet(amount: number): void;
  dealt(rank: Rank): void;
  revealed(rank: Rank): void;
  decision(d: HandLog['decisions'][number], up: Rank): void;
  /** Optional pause point; resolves when play may continue (used by learning mode). */
  gate?(s: Step): Promise<void>;
}

const SUITS = ['♠', '♥', '♦', '♣'];
const RED = new Set(['♥', '♦']);
const CHIPS: [number, string][] = [[5000, '#a3266b'], [1000, '#d49a00'], [500, '#5e2a91'], [100, '#262626'], [25, '#17803d'], [5, '#c3262b'], [1, '#d8d6cf']];
const G = {
  shoe: { x: 87, y: 9 }, tray: { x: 10, y: 11 }, bank: { x: 50, y: 116 }, house: { x: 50, y: -16 },
  dealerTop: 9, playerTop: 46, bet: { x: 50, y: 82 }, double: { x: 58.5, y: 82 }, payout: { x: 41.5, y: 82 },
};
type Pt = { x: number; y: number };
interface Card { el: HTMLElement; rank: Rank; sideways: boolean; faceUp: boolean }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The simulator only tracks ranks; suits are cosmetic but stable for a given card slot.
export function suitFor(handNo: number, who: string, i: number, rank: string) {
  let h = Math.imul(handNo + 1, 0x9e3779b1) ^ Math.imul(i + 1, 0x85ebca6b) ^ Math.imul(rank.charCodeAt(0) + (who === 'dealer' ? 97 : 13), 0xc2b2ae35);
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12;
  return SUITS[(h >>> 0) % 4];
}

function chipColors(amount: number) {
  const out: string[] = [];
  let left = amount;
  for (const [v, c] of CHIPS) while (left >= v && out.length < 40) { out.push(c); left -= v; }
  if (!out.length) out.push(CHIPS[CHIPS.length - 1][1]);
  return out.reverse().slice(-10);
}

function el(tag: string, cls: string, text?: string) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

function svg(tag: string, attrs: Record<string, string>) {
  const n = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
}

export class Felt {
  speed = 1;
  private rules!: Rules;
  private cards: { dealer: Card[]; player: Card[] } = { dealer: [], player: [] };
  private stacks: HTMLElement[] = [];
  private discards = 0;
  private badges: { dealer: HTMLElement; player: HTMLElement };
  private bannerEl: HTMLElement;
  private hintEl: HTMLElement;
  private coachEl: HTMLElement;
  private shoeEl: HTMLElement;
  private gauge: HTMLElement;
  private shoeCount: HTMLElement;
  private trayStack: HTMLElement;
  private arc1: SVGTextPathElement;
  private arc2: SVGTextPathElement;

  constructor(private root: HTMLElement) {
    root.textContent = '';
    const print = svg('svg', { class: 'felt-print', viewBox: '0 0 100 58.75', preserveAspectRatio: 'xMidYMid meet', 'aria-hidden': 'true' });
    const defs = svg('defs', {});
    defs.append(svg('path', { id: 'felt-arc-1', d: 'M 24 16 Q 50 28 76 16' }), svg('path', { id: 'felt-arc-2', d: 'M 31 20.5 Q 50 30.5 69 20.5' }));
    const t1 = svg('text', { class: 'arc-main', 'text-anchor': 'middle' });
    this.arc1 = svg('textPath', { href: '#felt-arc-1', startOffset: '50%' }) as SVGTextPathElement;
    t1.appendChild(this.arc1);
    const t2 = svg('text', { class: 'arc-sub', 'text-anchor': 'middle' });
    this.arc2 = svg('textPath', { href: '#felt-arc-2', startOffset: '50%' }) as SVGTextPathElement;
    t2.appendChild(this.arc2);
    print.append(defs, t1, t2);
    const tray = el('div', 'tray');
    this.trayStack = el('div', 'stack');
    tray.appendChild(this.trayStack);
    this.shoeEl = el('div', 'shoe');
    const g = el('div', 'gauge');
    this.gauge = el('i', '');
    g.appendChild(this.gauge);
    this.shoeEl.appendChild(g);
    this.shoeCount = el('div', 'shoe-count');
    this.badges = { dealer: el('div', 'badge'), player: el('div', 'badge') };
    this.badges.dealer.hidden = true; this.badges.player.hidden = true;
    this.bannerEl = el('div', 'banner');
    this.bannerEl.setAttribute('aria-live', 'polite');
    this.hintEl = el('div', 'hint');
    this.coachEl = el('div', 'coach');
    this.coachEl.setAttribute('aria-hidden', 'true');      // mirrored in an aria-live list by the caller
    root.append(print, tray, this.shoeEl, this.shoeCount, el('div', 'bet-circle'), this.badges.dealer, this.badges.player, this.bannerEl, this.hintEl, this.coachEl);
  }

  /** A speech bubble beside the bet explaining what the strategy does next. */
  coach(text: string | null, kind: 'win' | 'lose' | 'push' | 'info' = 'info', title?: string) {
    const c = this.coachEl;
    if (!text) { c.classList.remove('show'); return; }
    c.textContent = '';
    if (title) c.appendChild(el('strong', '', title));
    c.appendChild(document.createTextNode(text));
    c.className = `coach ${kind}`;
    void c.offsetWidth;          // restart the pop animation
    c.classList.add('show');
  }

  setRules(rules: Rules) {
    this.rules = rules;
    this.arc1.textContent = `BLACKJACK PAYS ${payoutLabel(rules.blackjackPays).replace(':', ' TO ')}`;
    this.arc2.textContent = [rules.hitSoft17 ? 'DEALER HITS SOFT 17' : 'DEALER STANDS ON SOFT 17', rules.holeCard ? '' : 'NO HOLE CARD'].filter(Boolean).join(' · ');
  }

  setShoe(remaining: number, total: number) {
    this.gauge.style.height = `${Math.max(0, Math.min(1, remaining / total)) * 100}%`;
    this.shoeCount.textContent = `${remaining} cards`;
  }

  setDiscards(n: number) {
    this.discards = n;
    const decks = this.rules ? this.rules.decks : 6;
    this.trayStack.style.height = `${Math.min(6.4, (n / (decks * 52)) * 10)}cqw`;
  }

  // ------------------------------------------------------- primitives

  private ms(base: number) { return base / this.speed; }
  check(t?: Token) { if (t && t.aborted) throw ABORT; }
  async wait(base: number, t?: Token) { await sleep(this.ms(base)); this.check(t); }

  private async move(node: HTMLElement, from: Pt, to: Pt, base: number, t: Token | null, extra: { fromT?: string; toT?: string; fromO?: number; toO?: number; fill?: FillMode } = {}) {
    node.style.transition = 'none';            // CSS transitions outrank Web Animations in the cascade
    node.style.left = `${to.x}%`;
    node.style.top = `${to.y}%`;
    const anim = node.animate([
      { left: `${from.x}%`, top: `${from.y}%`, transform: extra.fromT || 'none', opacity: extra.fromO ?? 1 },
      { left: `${to.x}%`, top: `${to.y}%`, transform: extra.toT || 'none', opacity: extra.toO ?? 1 },
    ], { duration: this.ms(base), easing: 'cubic-bezier(.2,.75,.25,1)', fill: extra.fill || 'none' });
    await anim.finished.catch(() => undefined);
    node.style.transition = '';
    if (t) this.check(t);
  }

  private cw() { return parseFloat(getComputedStyle(this.root).getPropertyValue('--cw')) || 8.6; }
  private aspect() { return this.root.offsetWidth / Math.max(1, this.root.offsetHeight); }

  private slots(who: 'dealer' | 'player'): Pt[] {
    const cw = this.cw(), step = cw * 0.64;
    const list = this.cards[who];
    const widths = list.map((c) => (c.sideways ? step + cw * 0.42 : step));
    const total = cw + widths.slice(1).reduce((a, b) => a + b, 0);
    let x = 50 - total / 2;
    const top = who === 'dealer' ? G.dealerTop : G.playerTop;
    return list.map((c, i) => { if (i > 0) x += widths[i]; return { x, y: top + (c.sideways ? 3 : 0) }; });
  }

  private placeBadge(who: 'dealer' | 'player') {
    const b = this.badges[who], s = this.slots(who);
    if (!s.length) { b.hidden = true; return; }
    const cardH = this.cw() * 1.4 * this.aspect();
    b.style.left = `${s[0].x - 1.2}%`;
    b.style.top = `${(who === 'dealer' ? G.dealerTop : G.playerTop) + cardH / 2}%`;
  }

  private setBadge(who: 'dealer' | 'player', cards: Rank[]) {
    const b = this.badges[who];
    if (!cards.length) { b.hidden = true; return; }
    const { total, soft } = handValue(cards);
    b.hidden = false;
    b.className = 'badge';
    b.textContent = '';
    if (cards.length === 2 && total === 21) { b.classList.add('bj'); b.textContent = 'Blackjack'; }
    else if (total > 21) { b.classList.add('bust'); b.textContent = `Bust ${total}`; }
    else { if (soft && total < 21) b.appendChild(el('small', '', 'soft')); b.appendChild(document.createTextNode(String(total))); }
    this.placeBadge(who);
  }

  private makeCard(rank: Rank, suit: string, faceUp: boolean, sideways: boolean) {
    const face = rank === 'J' || rank === 'Q' || rank === 'K';
    const node = el('div', `pcard${RED.has(suit) ? ' red' : ''}${faceUp ? '' : ' down'}${sideways ? ' sideways' : ''}`);
    node.setAttribute('aria-label', `${rank}${suit}`);
    const inner = el('div', 'pcard-inner');
    const front = el('div', 'pcard-face front');
    const corner = (cls: string) => { const c = el('span', `corner ${cls}`, rank); c.appendChild(el('i', '', suit)); return c; };
    front.append(corner('tl'), el('span', `pip${face ? ' face' : ''}`, face ? rank : suit), corner('br'));
    inner.append(front, el('div', 'pcard-face back'));
    node.appendChild(inner);
    return node;
  }

  private async deal(who: 'dealer' | 'player', rank: Rank, handNo: number, t: Token, hooks: Hooks, opts: { faceUp?: boolean; sideways?: boolean } = {}) {
    const faceUp = opts.faceUp ?? true, sideways = !!opts.sideways;
    const i = this.cards[who].length;
    const node = this.makeCard(rank, suitFor(handNo, who, i, rank), faceUp, sideways);
    node.style.left = `${G.shoe.x}%`;
    node.style.top = `${G.shoe.y}%`;
    const card: Card = { el: node, rank, sideways, faceUp };
    this.cards[who].push(card);
    this.root.appendChild(node);
    const to = this.slots(who);
    this.cards[who].forEach((c, k) => { if (k < i) { c.el.style.left = `${to[k].x}%`; c.el.style.top = `${to[k].y}%`; } });
    this.placeBadge(who);
    hooks.dealt(rank);
    await this.move(node, G.shoe, to[i], 420, t, { fromT: 'rotate(-28deg) scale(0.85)' });
    if (faceUp) hooks.revealed(rank);
    return card;
  }

  private async flip(card: Card, t: Token, hooks: Hooks) {
    if (card.faceUp) return;
    this.root.style.setProperty('--flip-ms', `${this.ms(320)}ms`);
    card.el.classList.remove('down');
    card.faceUp = true;
    hooks.revealed(card.rank);
    await this.wait(330, t);
  }

  private stackNode(amount: number) {
    const node = el('div', 'chips');
    chipColors(amount).forEach((c, i) => {
      const coin = el('i', 'chip-coin');
      coin.style.setProperty('--c', c);
      coin.style.transform = `translateY(${-i * 0.55}cqw)`;
      node.appendChild(coin);
    });
    node.appendChild(el('span', 'amt', money(amount)));
    return node;
  }

  private async addStack(amount: number, from: Pt, to: Pt, t: Token) {
    const node = this.stackNode(amount);
    node.style.left = `${from.x}%`; node.style.top = `${from.y}%`;
    this.root.appendChild(node);
    this.stacks.push(node);
    await this.move(node, from, to, 460, t, { fromO: 0.4 });
  }

  private async sweep(target: Pt, t: Token) {
    await Promise.all(this.stacks.map((s) => this.move(s, { x: parseFloat(s.style.left), y: parseFloat(s.style.top) }, target, 520, null, { toO: 0, fill: 'forwards' })));
    this.check(t);
    this.stacks.forEach((s) => s.remove());
    this.stacks = [];
  }

  private async banner(text: string, sub: string | null, kind: string, t: Token, hold = 0) {
    const b = this.bannerEl;
    b.textContent = text;
    if (sub) b.appendChild(el('small', '', sub));
    b.className = `banner ${kind}`;
    void b.offsetWidth;
    b.classList.add('show');
    if (hold) { await this.wait(hold, t); b.classList.remove('show'); await this.wait(150, t); }
  }

  private hint(parts: (string | HTMLElement)[] | null) {
    this.hintEl.textContent = '';
    if (!parts) { this.hintEl.classList.remove('show'); return; }
    this.hintEl.append(...parts);
    this.hintEl.classList.add('show');
  }

  // ------------------------------------------------------ whole hands

  cancelAll() {
    this.root.querySelectorAll<HTMLElement>('.pcard, .chips').forEach((n) => n.getAnimations().forEach((a) => a.cancel()));
  }

  reset() {
    this.cancelAll();
    for (const who of ['dealer', 'player'] as const) { this.cards[who].forEach((c) => c.el.remove()); this.cards[who] = []; this.badges[who].hidden = true; }
    this.stacks.forEach((s) => s.remove());
    this.stacks = [];
    this.bannerEl.classList.remove('show');
    this.hint(null);
    this.coach(null);
  }

  async clearTable(t: Token) {
    const all = [...this.cards.dealer, ...this.cards.player];
    this.bannerEl.classList.remove('show');
    this.hint(null);
    this.badges.dealer.hidden = true; this.badges.player.hidden = true;
    if (all.length) {
      await Promise.all(all.map((c) => this.move(c.el, { x: parseFloat(c.el.style.left), y: parseFloat(c.el.style.top) }, G.tray, 380, null,
        { toT: 'rotate(12deg) scale(0.7)', toO: 0, fill: 'forwards' })));
      this.check(t);
      this.setDiscards(this.discards + all.length);
    }
    all.forEach((c) => c.el.remove());
    this.cards = { dealer: [], player: [] };
    this.stacks.forEach((s) => s.remove());
    this.stacks = [];
  }

  async shuffle(t: Token) {
    this.shoeEl.classList.remove('shuffling');
    void this.shoeEl.offsetWidth;
    this.shoeEl.classList.add('shuffling');
    this.setDiscards(0);
    await this.banner('Shuffling a fresh shoe', `${this.rules.decks} deck${this.rules.decks === 1 ? '' : 's'}`, 'info', t, 900);
    this.shoeEl.classList.remove('shuffling');
  }

  private async gate(hooks: Hooks, s: Step, t: Token) {
    if (!hooks.gate) return;
    await hooks.gate(s);
    this.check(t);
  }

  /** Animate one logged hand. */
  async playHand(h: HandLog, handNo: number, hooks: Hooks, t: Token) {
    const up = h.dealer[0];
    const enhc = !this.rules.holeCard;
    hooks.bet(h.stake);
    await this.addStack(h.stake, G.bank, G.bet, t);
    await this.gate(hooks, { step: 'bet', amount: h.stake }, t);
    await this.deal('player', h.player[0], handNo, t, hooks);
    this.setBadge('player', h.player.slice(0, 1));
    await this.deal('dealer', up, handNo, t, hooks);
    this.setBadge('dealer', [up]);
    await this.deal('player', h.player[1], handNo, t, hooks);
    this.setBadge('player', h.player.slice(0, 2));
    const hole = enhc ? null : await this.deal('dealer', h.dealer[1], handNo, t, hooks, { faceUp: false });
    await this.wait(200, t);
    await this.gate(hooks, { step: 'deal', player: h.player.slice(0, 2), up }, t);

    // with no hole card the dealer's second card only arrives after the player acts
    const reveal = async () => {
      if (hole) await this.flip(hole, t, hooks);
      else await this.deal('dealer', h.dealer[1], handNo, t, hooks);
      this.setBadge('dealer', h.dealer.slice(0, 2));
    };

    if (h.peeked) {
      const bj = h.phase === 'dealer_blackjack';
      await this.banner('Dealer checks for blackjack', bj ? null : 'Nothing there', 'info', t, bj ? 650 : 700);
      if (bj) { await reveal(); await this.gate(hooks, { step: 'peek', blackjack: true }, t); return this.settle(h, t); }
      await this.gate(hooks, { step: 'peek', blackjack: false }, t);
    }
    if (h.phase !== 'play') { await this.wait(250, t); await reveal(); await this.gate(hooks, { step: 'natural' }, t); return this.settle(h, t); }

    let n = 2;
    for (const d of h.decisions) {
      hooks.decision(d, up);
      const verb = d.action === 'DOUBLE' ? 'Double' : d.action === 'HIT' ? 'Hit' : 'Stand';
      const b = el('b', '', verb);
      this.hint([`${d.soft && d.total < 21 ? 'Soft' : 'Hard'} ${d.total} vs ${up}: `, b, d.note ? ` (${d.note})` : '']);
      await this.gate(hooks, { step: 'decision', d, up }, t);
      await this.wait(620, t);
      if (d.action === 'HIT') {
        await this.deal('player', h.player[n++], handNo, t, hooks);
        this.setBadge('player', h.player.slice(0, n));
      } else if (d.action === 'DOUBLE') {
        hooks.bet(h.stake * 2);
        await this.addStack(h.stake, G.bank, G.double, t);
        await this.deal('player', h.player[n++], handNo, t, hooks, { sideways: true });
        this.setBadge('player', h.player.slice(0, n));
      } else {
        await this.wait(180, t);
      }
    }
    this.hint(null);
    await this.wait(250, t);
    await reveal();
    if (h.dealerPlays) {
      for (let i = 2; i < h.dealer.length; i++) {
        await this.wait(420, t);
        await this.deal('dealer', h.dealer[i], handNo, t, hooks);
        this.setBadge('dealer', h.dealer.slice(0, i + 1));
      }
    }
    await this.gate(hooks, { step: 'dealer', playerBust: handValue(h.player).total > 21 }, t);
    await this.wait(250, t);
    return this.settle(h, t);
  }

  resultText(h: HandLog): [string, string, string] {
    const p = money(h.profit, { sign: true });
    switch (h.result) {
      case 'blackjack': return ['Blackjack!', `${p} (pays ${payoutLabel(this.rules.blackjackPays)})`, 'blackjack'];
      case 'dealer_bust': return ['Dealer busts', p, 'win'];
      case 'win': return ['You win', p, 'win'];
      case 'bust': return ['Bust', p, 'lose'];
      case 'dealer_blackjack': return ['Dealer blackjack', p, 'lose'];
      case 'lose': return ['Dealer wins', p, 'lose'];
      default: return ['Push', 'Bet returned', 'push'];
    }
  }

  private async settle(h: HandLog, t: Token) {
    const [text, sub, kind] = this.resultText(h);
    await this.banner(text, sub, kind, t);
    if (h.profit > 0) {
      await this.addStack(h.profit, G.house, G.payout, t);
      await this.wait(300, t);
      await this.sweep(G.bank, t);
    } else {
      await this.wait(250, t);
      await this.sweep(h.profit < 0 ? G.house : G.bank, t);
    }
  }

  /** A hand's final state with no animation (seeking and turbo). */
  showStatic(h: HandLog, handNo: number) {
    this.reset();
    for (const who of ['dealer', 'player'] as const) {
      const cards = h[who];
      cards.forEach((rank, i) => {
        const sideways = who === 'player' && h.doubled && i === cards.length - 1;
        const node = this.makeCard(rank, suitFor(handNo, who, i, rank), true, sideways);
        node.style.transition = 'none';
        this.cards[who].push({ el: node, rank, sideways, faceUp: true });
        this.root.appendChild(node);
      });
      const s = this.slots(who);
      this.cards[who].forEach((c, i) => { c.el.style.left = `${s[i].x}%`; c.el.style.top = `${s[i].y}%`; void c.el.offsetWidth; c.el.style.transition = ''; });
      this.setBadge(who, cards);
    }
    const [text, sub, kind] = this.resultText(h);
    this.bannerEl.textContent = text;
    this.bannerEl.appendChild(el('small', '', sub));
    this.bannerEl.className = `banner ${kind} show`;
  }

  message(text: string, sub?: string) {
    this.bannerEl.textContent = text;
    if (sub) this.bannerEl.appendChild(el('small', '', sub));
    this.bannerEl.className = 'banner info show';
  }
}
