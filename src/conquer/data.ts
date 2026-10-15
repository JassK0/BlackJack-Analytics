// Count & Conquer: the content (gear, cities, casinos, bosses, characters)

export type RelicId =
  | 'comp_card' | 'mustache' | 'lighter' | 'cheat_sheet' | 'cool_head' | 'watch'
  | 'card_sense' | 'surrender' | 'jacket' | 'agent' | 'friend' | 'notes'
  | 'spotter' | 'earpiece' | 'rabbit' | 'tracker' | 'partner' | 'lucky_chip' | 'shades';
export type Rarity = 'common' | 'uncommon' | 'rare';

export interface Relic { id: RelicId; name: string; rarity: Rarity; text: string; flavor: string }

export const RELICS: Record<RelicId, Relic> = {
  comp_card: { id: 'comp_card', name: 'Comp Card', rarity: 'common', text: 'Collect four table minimums in free chips at every casino.', flavor: 'Platinum tier. Somehow.' },
  mustache: { id: 'mustache', name: 'Fake Mustache', rarity: 'common', text: 'You gain 20% less Heat.', flavor: 'Nobody suspects a man with a mustache.' },
  lighter: { id: 'lighter', name: 'Lucky Lighter', rarity: 'common', text: 'Your first losing hand at each casino becomes a push.', flavor: 'It never lights. It never needs to.' },
  cheat_sheet: { id: 'cheat_sheet', name: 'Cheat Sheet', rarity: 'common', text: 'Shows the basic-strategy move for every hand.', flavor: 'Laminated, palm-sized, slightly sticky.' },
  cool_head: { id: 'cool_head', name: 'Cool Head', rarity: 'common', text: 'Heat drops by 2 after every hand.', flavor: 'Breathe in. Bet out.' },
  shades: { id: 'shades', name: 'Mirrored Shades', rarity: 'common', text: 'Losing the count during small talk never raises Heat.', flavor: 'Nobody can see your eyes glaze over.' },
  watch: { id: 'watch', name: "Wonger's Watch", rarity: 'common', text: 'Watching from the rail never raises Heat, and nobody minds when you sit down mid-shoe.', flavor: 'Always checking the time. Never leaving.' },
  card_sense: { id: 'card_sense', name: 'Card Sense', rarity: 'uncommon', text: 'Every 15 cards, the running count flashes on screen.', flavor: 'You feel the shoe getting rich.' },
  surrender: { id: 'surrender', name: 'Surrender Note', rarity: 'uncommon', text: 'You may surrender a hand: lose half the bet and walk away.', flavor: 'A polite note from the house manager.' },
  jacket: { id: 'jacket', name: 'High Roller Jacket', rarity: 'uncommon', text: 'Table limits are 50% higher for you.', flavor: 'Velvet. Gold buttons. Zero shame.' },
  agent: { id: 'agent', name: 'Insurance Agent', rarity: 'uncommon', text: 'Insurance pays 3:1 instead of 2:1.', flavor: 'He has a card for everything.' },
  friend: { id: 'friend', name: "Dealer's Friend", rarity: 'uncommon', text: 'Tipping the dealer is free.', flavor: 'She remembers your birthday.' },
  notes: { id: 'notes', name: 'Illustrious Notes', rarity: 'uncommon', text: 'Shows count-based plays that beat basic strategy, like standing on 16 vs 10 when the count is up.', flavor: 'Eighteen plays. Memorised badly.' },
  lucky_chip: { id: 'lucky_chip', name: 'Lucky Chip', rarity: 'uncommon', text: 'Your hot money counts 25% extra toward the job.', flavor: 'A $1 chip from the night it all went right.' },
  spotter: { id: 'spotter', name: 'Spotter: Lucky Lou', rarity: 'rare', text: 'Your teammate signals whenever the true count is +2 or better.', flavor: 'Lou scratches his ear. You bet big.' },
  earpiece: { id: 'earpiece', name: 'Earpiece', rarity: 'rare', text: 'Always shows the exact true count.', flavor: '"Count is plus four. Go."' },
  rabbit: { id: 'rabbit', name: "Rabbit's Foot", rarity: 'rare', text: 'Your blackjacks pay 2:1.', flavor: 'Not lucky for the rabbit.' },
  tracker: { id: 'tracker', name: 'Shuffle Tracker', rarity: 'rare', text: 'You see 15% more of every shoe before the cut card.', flavor: 'You followed the aces through the shuffle.' },
  partner: { id: 'partner', name: 'Bankroll Partner', rarity: 'rare', text: 'After you beat a boss, your partner adds 25% to your bankroll.', flavor: 'Silent partner. Loud returns.' },
};
export const RELIC_IDS = Object.keys(RELICS) as RelicId[];
export const PRICE: Record<Rarity, number> = { common: 120, uncommon: 200, rare: 320 };

export interface City {
  act: number; name: string; tagline: string;
  casinos: string[]; decks: number[]; pen: number; minBet: number; maxBet: number;
  /** The job: hot money to get on the table. */
  target: [number, number]; sens: number; npcs: [number, number]; hands: number;
}

export const CITIES: City[] = [
  { act: 1, name: 'Downtown', tagline: 'Sawdust floors, cheap drinks and hand-held single-deck games.',
    casinos: ['The Rusty Spur', 'Lucky Clover', 'The Silver Mine', 'Neon Dreams', 'Dusty Dollar', 'The Golden Mule', 'Pawnbroker Palace'],
    decks: [1, 2, 2], pen: 0.7, minBet: 10, maxBet: 200, target: [100, 160], sens: 1.0, npcs: [1, 1], hands: 16 },
  { act: 2, name: 'The Strip', tagline: 'Fountains, fake skylines and double-deck pitch games.',
    casinos: ['Palazzo Aurelia', 'The Emerald Dunes', 'Starlight Royale', "Pharaoh's Gate", 'The Velvet Crown', 'Crystal Lagoon', 'The Grand Marquee'],
    decks: [2, 2, 4], pen: 0.75, minBet: 25, maxBet: 500, target: [220, 340], sens: 1.15, npcs: [1, 2], hands: 16 },
  { act: 3, name: 'The Riviera', tagline: 'Marble, moonlight, six-deck shoes and very quiet security.',
    casinos: ['Casino Lumière', 'Le Grand Phare', 'Villa Serafina', 'The Opaline', 'Hôtel Azur', 'Le Cercle Privé'],
    decks: [4, 4, 6], pen: 0.8, minBet: 50, maxBet: 1000, target: [300, 500], sens: 1.3, npcs: [2, 2], hands: 20 },
];

export type Special = 'eye' | 'varga' | 'syndicate';
export const BOSSES: Record<number, { name: string; special: Special; blurb: string; target: number; decks: number; hands: number }> = {
  1: { name: 'The Eye in the Sky', special: 'eye', blurb: 'Every camera in the building is on your table. Heat builds 60% faster.', target: 300, decks: 2, hands: 22 },
  2: { name: "Varga's High-Limit Room", special: 'varga', blurb: 'Pit boss Varga hates surprises. Triple your bet in one go and he may shuffle the shoe out from under you.', target: 720, decks: 2, hands: 22 },
  3: { name: 'The Syndicate Table', special: 'syndicate', blurb: 'Six decks, blackjack pays 6:5 and the dealer hits soft 17. Beat them anyway.', target: 900, decks: 6, hands: 26 },
};

export const NPC_NAMES = ['Tourist Ted', 'Bachelor Brad', 'Grandma Rose', 'Cowboy Cal', 'Nervous Nina', 'Lucky Linda', 'Whale Wu', 'Professor Pim', 'Big Sal', 'Honeymoon Hank'];
/** How each regular plays: by the book, never busting, copying the dealer, or chasing 18+. */
export type NpcStyle = 'book' | 'cautious' | 'dealer' | 'reckless';
export const NPC_STYLE: Record<string, NpcStyle> = {
  'Grandma Rose': 'cautious', 'Nervous Nina': 'cautious', 'Bachelor Brad': 'dealer', 'Tourist Ted': 'dealer', 'Cowboy Cal': 'reckless', 'Big Sal': 'reckless',
};
/** What the regulars say when a hand settles. */
export const NPC_LINES: Record<'win' | 'lose' | 'blackjack' | 'bust' | 'push', string[]> = {
  win: ['Winner winner!', 'Pay me!', 'Ha! Told you.', 'Another round!'],
  lose: ['Ugh.', 'Of course.', 'Rigged, I tell you.', 'Next one.'],
  blackjack: ['BLACKJACK, BABY!', 'Twenty-one!', 'Look at that!'],
  bust: ['Too many!', 'Why did I hit that?', 'Ouch.'],
  push: ['A tie? Fine.', 'Meh.'],
};

export type NodeType = 'casino' | 'elite' | 'event' | 'shop' | 'motel' | 'boss';
export const NODE_LABEL: Record<NodeType, string> = {
  casino: 'Casino', elite: 'High-limit room', event: 'Something happens', shop: 'Back-alley shop', motel: 'Motel', boss: 'Boss casino',
};
