// Count & Conquer: things that happen between casinos
import type { Rng } from '../engine/rng';
import { RELICS, RELIC_IDS, type RelicId } from './data';
import { MAX_FOCUS_CAP, MAX_STARS, scale, type RunState } from './run';

export type EventId = 'coach' | 'backroom' | 'pickpocket' | 'slots' | 'suite' | 'shady' | 'teammate' | 'book' | 'barbet';
export interface EventOption { label: string; detail: string; disabled?: boolean }
export interface EventResult { run: RunState; text: string; drill?: number }
export interface EventDef {
  id: EventId; title: string; icon: string; text: string;
  options: (run: RunState) => EventOption[];
  resolve: (run: RunState, option: number, rng: Rng) => EventResult;
}

const money = (n: number) => `$${n.toLocaleString('en-US')}`;
const pay = (run: RunState, n: number): RunState => ({ ...run, bankroll: Math.max(0, run.bankroll + n) });
const star = (run: RunState, n: number): RunState => ({ ...run, notoriety: Math.max(0, Math.min(MAX_STARS, run.notoriety + n)) });
const leave: EventOption = { label: 'Walk on', detail: 'Nothing happens.' };

function randomRelic(run: RunState, rng: Rng, rarities: RelicId[] = RELIC_IDS): RelicId | null {
  const pool = rarities.filter((r) => !run.relics.includes(r));
  return pool.length ? pool[Math.floor(rng() * pool.length)] : null;
}

export const EVENTS: Record<EventId, EventDef> = {
  coach: {
    id: 'coach', title: 'The Old Pro', icon: 'coffee',
    text: 'A retired counter nurses a coffee in a 24-hour diner. He spots the way you watch the waitress shuffle the menus, and offers a lesson.',
    options: (run) => [
      { label: `Pay for a lesson (${money(80 * scale(run))})`, detail: '+1 maximum Focus and a full refill.', disabled: run.bankroll < 80 * scale(run) || run.maxFocus >= MAX_FOCUS_CAP },
      { label: 'Just listen to his stories', detail: '+1 Focus.' },
      leave,
    ],
    resolve: (run, o) => {
      if (o === 0) return { run: { ...pay(run, -80 * scale(run)), maxFocus: run.maxFocus + 1, focus: run.maxFocus + 1 }, text: '"Count the table, not your cards." By sunrise your head is clearer than it has been in years.' };
      if (o === 1) return { run: { ...run, focus: Math.min(run.maxFocus, run.focus + 1) }, text: 'He tells you about the MIT kids and the night he got barred from three casinos in one hour. You feel sharper.' };
      return { run, text: 'You leave him to his coffee.' };
    },
  },
  backroom: {
    id: 'backroom', title: 'The Back Room', icon: 'door',
    text: 'Behind the kitchen there is a private game: one hand, high stakes, no cameras. The host swears the shoe is rich in tens.',
    options: (run) => [
      { label: `Sit in for one hand (${money(150 * scale(run))})`, detail: `About a 55% chance to win ${money(300 * scale(run))}.`, disabled: run.bankroll < 150 * scale(run) },
      leave,
    ],
    resolve: (run, o, rng) => {
      if (o !== 0) return { run, text: 'You decide you like cameras after all.' };
      const s = scale(run);
      return rng() < 0.55
        ? { run: pay(run, 300 * s), text: `Twenty against the dealer's nineteen. You walk out ${money(300 * s)} richer.` }
        : { run: pay(run, -150 * s), text: `The dealer turns over a blackjack. The host shrugs. You're down ${money(150 * s)}.` };
    },
  },
  pickpocket: {
    id: 'pickpocket', title: 'Light Fingers', icon: 'hand',
    text: 'A man bumps into you on the casino floor and apologises too warmly. Your jacket feels lighter.',
    options: (run) => [
      { label: 'Chase him', detail: `50%: get it back plus ${money(60 * scale(run))}. 50%: you cause a scene (+1 star).` },
      { label: 'Let it go', detail: `Lose ${money(60 * scale(run))}.` },
    ],
    resolve: (run, o, rng) => {
      const s = scale(run);
      if (o === 1) return { run: pay(run, -60 * s), text: `You write off ${money(60 * s)} as the cost of doing business.` };
      return rng() < 0.5
        ? { run: pay(run, 60 * s), text: `You tackle him by the buffet. He returns your cash and, for some reason, his. +${money(60 * s)}.` }
        : { run: star(pay(run, -60 * s), 1), text: 'He vanishes into a tour group. Security is very interested in the person yelling. +1 star.' };
    },
  },
  slots: {
    id: 'slots', title: 'Jackpot Lights', icon: 'slot',
    text: 'A slot machine flashes JACKPOT at you as you pass. Slots keep up to 15% of every dollar. Blackjack, played well, keeps less than 1%.',
    options: (run) => [
      { label: `Pull once (${money(20 * scale(run))})`, detail: `A 6% chance at ${money(250 * scale(run))}.`, disabled: run.bankroll < 20 * scale(run) },
      { label: 'Walk past', detail: 'You know the math.' },
    ],
    resolve: (run, o, rng) => {
      const s = scale(run);
      if (o !== 0) return { run, text: 'The machine keeps flashing at the next person. They sit down.' };
      return rng() < 0.06
        ? { run: pay(run, 250 * s - 20 * s), text: `Cherries, cherries, cherries. Coins everywhere. +${money(250 * s)}.` }
        : { run: pay(run, -20 * s), text: 'Lemon, bar, seven. The machine plays a sad little tune.' };
    },
  },
  suite: {
    id: 'suite', title: 'Comped Suite', icon: 'key',
    text: 'A casino host recognises your "whale" tip from last night and offers a free suite upstairs.',
    options: (run) => [
      { label: 'Sleep in the suite', detail: run.notoriety ? 'Lie low. Removes one star.' : 'Refills your Focus.' },
      { label: 'Sell the comp points', detail: `+${money(120 * scale(run))}.` },
    ],
    resolve: (run, o) => {
      if (o === 0) return run.notoriety
        ? { run: star(run, -1), text: 'Eight hours of silk sheets. The casino forgets your face. -1 star.' }
        : { run: { ...run, focus: run.maxFocus }, text: 'Room service, a hot shower, and the best sleep of the trip. Focus refilled.' };
      return { run: pay(run, 120 * scale(run)), text: `A man in the parking lot buys your points for ${money(120 * scale(run))}. You don't ask why.` };
    },
  },
  shady: {
    id: 'shady', title: 'The Bent Dealer', icon: 'eye',
    text: 'A dealer offers to flash you her hole card at the next table, for half the winnings. Counting cards is legal. This is not.',
    options: (run) => [
      { label: 'Refuse and report her', detail: 'Security likes you now. Removes one star.' },
      { label: 'Take the deal', detail: `50%: +${money(400 * scale(run))}. 50%: caught cheating, +2 stars.` },
      leave,
    ],
    resolve: (run, o, rng) => {
      const s = scale(run);
      if (o === 0) return { run: star(run, -1), text: 'The shift manager shakes your hand. Your name goes on the "good guys" list. -1 star.' };
      if (o === 2) return { run, text: 'You pretend you didn\'t hear her.' };
      return rng() < 0.5
        ? { run: pay(run, 400 * s), text: `It works. You split ${money(800 * s)} in the parking garage and never speak again.` }
        : { run: star(run, 2), text: 'The cameras saw the flash. You spend the evening in a small room explaining yourself. +2 stars.' };
    },
  },
  teammate: {
    id: 'teammate', title: 'Old Teammate', icon: 'handshake',
    text: 'Someone from your old blackjack team waves you over. She has gear she no longer needs, or some cash to back you.',
    options: (run) => [
      { label: 'Take the gear', detail: 'A random common or uncommon relic.', disabled: !RELIC_IDS.some((r) => RELICS[r].rarity !== 'rare' && !run.relics.includes(r)) },
      { label: 'Take the stake', detail: `+${money(150 * scale(run))}.` },
    ],
    resolve: (run, o, rng) => {
      if (o === 1) return { run: pay(run, 150 * scale(run)), text: `"Pay me back when you're famous." +${money(150 * scale(run))}.` };
      const r = randomRelic(run, rng, RELIC_IDS.filter((id) => RELICS[id].rarity !== 'rare'));
      if (!r) return { run, text: 'She has nothing left you don\'t already own.' };
      return { run: { ...run, relics: [...run.relics, r] }, text: `She hands you the ${RELICS[r].name}. "${RELICS[r].flavor}"` };
    },
  },
  book: {
    id: 'book', title: 'Pawnshop Find', icon: 'book',
    text: 'Between a saxophone and a box of dentures sits a battered first edition of Beat the Dealer, the 1962 book that taught the world to count cards.',
    options: (run) => [
      { label: 'Buy it and read it', detail: `${money(40 * scale(run))}. +1 maximum Focus.`, disabled: run.bankroll < 40 * scale(run) || run.maxFocus >= MAX_FOCUS_CAP },
      { label: 'Just flip through it', detail: '+1 Focus.' },
    ],
    resolve: (run, o) => {
      if (o === 0) return { run: { ...pay(run, -40 * scale(run)), maxFocus: run.maxFocus + 1, focus: Math.min(run.maxFocus + 1, run.focus + 1) }, text: 'You read it cover to cover on a bus bench. Thorp was right about everything.' };
      return { run: { ...run, focus: Math.min(run.maxFocus, run.focus + 1) }, text: 'Ten minutes of Thorp clears your head. +1 Focus.' };
    },
  },
  barbet: {
    id: 'barbet', title: 'Bar Bet', icon: 'glass',
    text: 'A hustler at the bar says he can spot a counter a mile away. He bets you can\'t give him the running count after he flips ten cards.',
    options: (run) => [
      { label: `Take the bet (${money(100 * scale(run))})`, detail: 'Watch ten cards, then name the Hi-Lo running count.', disabled: run.bankroll < 100 * scale(run) },
      { label: 'Decline', detail: 'He calls you chicken. You can live with that.' },
    ],
    resolve: (run, o) => (o === 0 ? { run, text: '', drill: 100 * scale(run) } : { run, text: 'He clucks at you as you leave.' }),
  },
};
export const EVENT_IDS = Object.keys(EVENTS) as EventId[];
