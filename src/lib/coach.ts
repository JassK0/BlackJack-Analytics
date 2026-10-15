// What to say at each step of a hand in learning mode
import type { Decision, HandLog, Rank, Rules } from '../engine/types';
import { handLabel, handValue, isTenOrAce, VALUES } from '../engine/cards';
import type { Step } from '../components/felt';
import { money, payoutLabel } from './format';

/** "a 7", "an 8", "an A" */
const weakA = (r: Rank) => `a weak ${r}`;
const strongA = (r: Rank) => (r === 'A' ? 'a strong ace' : `a strong ${r}`);
const a = (r: Rank) => (r === '8' || r === 'A' ? `an ${r}` : `a ${r}`);

export type CoachKind = 'win' | 'lose' | 'push' | 'info';
export interface CoachLine { title: string; text: string; kind: CoachKind }

/** Why the engine's basic strategy (session.playerAction) makes this move. */
export function whyDecision(d: Decision, up: Rank): string {
  const upVal = up === 'A' ? 11 : VALUES[up];
  const weak = upVal >= 2 && upVal <= 6;
  const hand = `${d.soft && d.total < 21 ? 'Soft' : 'Hard'} ${d.total}`;
  if (d.note) return 'Basic strategy says double here, but the bankroll can\'t cover a second bet, so hit instead.';
  if (d.action === 'DOUBLE') {
    if (d.soft) return `${hand} against ${weakA(up)}: double down. One card can't bust a soft hand, and the dealer is likely to bust, so put more money out while the odds favour you.`;
    if (d.total === 11) return 'Hard 11 is the best double in the game: any ten makes 21. Bet the same again and take exactly one card.';
    if (d.total === 10) return `Hard 10 against ${a(up)}: double down. One card often makes 20, and the dealer's ${up} is no better.`;
    return `Hard 9 against ${weakA(up)}: double down for one card while the dealer is likely to bust.`;
  }
  if (d.action === 'HIT') {
    if (!d.soft && d.total <= 11) return `${hand} can't bust with one more card, so hit.`;
    if (d.soft && d.total === 18) return `Soft 18 usually loses to ${strongA(up)}, and a soft hand can't bust on the next card, so hit to improve.`;
    if (d.soft) return `${hand} can take a card without any risk of busting, so hit.`;
    if (upVal >= 7) return `${hand} is weak, but the dealer's ${up} is strong: standing loses more often than hitting, so take the risk.`;
    return `${hand} against ${a(up)}: the dealer doesn't bust often enough with a 2 or 3 showing, so hitting is still right.`;
  }
  if (d.total >= 17) return `${hand} is a made hand: stand.`;
  if (weak) return `${hand} could bust on the next card, and the dealer's ${up} is a weak card that busts often, so stand and let the dealer take the risk.`;
  return `Stand on ${d.total}.`;
}

export function describeStep(s: Step, h: HandLog, rules: Rules, betReason: string): CoachLine {
  switch (s.step) {
    case 'bet':
      return { title: `Bet ${money(s.amount)}`, text: betReason, kind: 'info' };
    case 'deal': {
      let text = `You have ${handLabel(s.player)}; the dealer shows ${s.up}.`;
      if (rules.holeCard && isTenOrAce(s.up)) text += ' With an ace or ten up, the dealer checks for blackjack before you play.';
      else if (!rules.holeCard) text += " No hole card: the dealer's second card only comes after you finish.";
      else text += ' The dealer can\'t have blackjack with this card up.';
      return { title: 'The deal', text, kind: 'info' };
    }
    case 'peek':
      return s.blackjack
        ? { title: 'Dealer blackjack', text: h.result === 'push' ? 'The dealer has blackjack, but so do you: push, the bet comes back.' : 'The dealer has blackjack, so the hand ends before you act. Only the original bet is lost.', kind: h.result === 'push' ? 'push' : 'lose' }
        : { title: 'No dealer blackjack', text: 'The dealer peeked at the hole card and has nothing, so you play your hand.', kind: 'info' };
    case 'natural':
      if (h.result === 'blackjack') return { title: 'Blackjack!', text: `A natural 21 pays ${payoutLabel(rules.blackjackPays)}, so there's nothing to decide.`, kind: 'win' };
      return { title: 'Two blackjacks', text: 'You and the dealer both have blackjack: push, the bet comes back.', kind: 'push' };
    case 'decision':
      return { title: `${s.d.soft && s.d.total < 21 ? 'Soft' : 'Hard'} ${s.d.total} vs ${s.up}: ${s.d.action === 'DOUBLE' ? 'double' : s.d.action === 'HIT' ? 'hit' : 'stand'}`, text: whyDecision(s.d, s.up), kind: 'info' };
    case 'dealer': {
      const d = handValue(h.dealer);
      if (s.playerBust) return { title: 'Bust', text: 'You went over 21, so the dealer wins without drawing a card.', kind: 'lose' };
      if (h.result === 'dealer_blackjack') return { title: 'Dealer blackjack', text: 'With no hole card the dealer\'s natural shows up last, and it beats every other hand, doubles included.', kind: 'lose' };
      const rule = rules.hitSoft17 ? 'The dealer must hit below 17 and on soft 17.' : 'The dealer must hit below 17 and stands on any 17.';
      const drew = h.dealer.length > 2;
      const text = `${rule} ${drew ? `They draw to ${d.total}` : `They have ${d.total}`}${d.total > 21 ? ' and bust!' : drew ? ' and stand.' : ', so they stand.'}`;
      return { title: "Dealer's turn", text, kind: d.total > 21 ? 'win' : 'info' };
    }
  }
}
