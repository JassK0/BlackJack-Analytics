// Twenty-One Stakes: the content (hand types, charms, cocktails, fortunes, vouchers, bosses, tags)
import type { Rank } from '../engine/types';

export type Suit = '♠' | '♥' | '♦' | '♣';
export const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
export const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
export type Enh = 'bonus' | 'gold' | 'glass' | 'lucky' | 'wild' | 'stone';
export interface PCard { uid: number; rank: Rank; suit: Suit; enh?: Enh }

export const ENH_INFO: Record<Enh, { name: string; text: string }> = {
  bonus: { name: 'Bonus', text: '+30 chips when scored.' },
  gold: { name: 'Gold', text: 'Earn $2 when it scores in a win.' },
  glass: { name: 'Glass', text: '×1.5 mult when scored. 1 in 4 chance to shatter.' },
  lucky: { name: 'Lucky', text: '1 in 5 chance of +10 mult, 1 in 15 chance of $10.' },
  wild: { name: 'Wild', text: 'Counts as whatever value makes your best total.' },
  stone: { name: 'Stone', text: '+50 chips. Has no rank and adds 0 to your total.' },
};

// ------------------------------------------------------------- hand types

export type HandType = 'loss' | 'win' | 'dealer_bust' | 'twenty' | 'twentyone' | 'blackjack' | 'charlie';
export const HAND_ORDER: HandType[] = ['win', 'dealer_bust', 'twenty', 'twentyone', 'blackjack', 'charlie'];
export const HANDS: Record<HandType, { name: string; chips: number; mult: number; lvChips: number; lvMult: number; text: string }> = {
  loss: { name: 'Loss', chips: 0, mult: 1, lvChips: 0, lvMult: 0, text: 'You lost the hand. It still scores, at half.' },
  win: { name: 'Win', chips: 10, mult: 2, lvChips: 10, lvMult: 1, text: 'Beat the dealer.' },
  dealer_bust: { name: 'Dealer Bust', chips: 15, mult: 2, lvChips: 15, lvMult: 2, text: 'The dealer busts while you stand.' },
  twenty: { name: 'Twenty', chips: 25, mult: 3, lvChips: 15, lvMult: 2, text: 'Win with exactly 20.' },
  twentyone: { name: 'Twenty-One', chips: 35, mult: 4, lvChips: 20, lvMult: 2, text: 'Win with 21 from three or more cards.' },
  blackjack: { name: 'Blackjack', chips: 50, mult: 5, lvChips: 25, lvMult: 3, text: 'An ace and a ten-value card, first two cards.' },
  charlie: { name: 'Charlie', chips: 60, mult: 6, lvChips: 30, lvMult: 3, text: 'Five cards without busting wins automatically.' },
};

// ------------------------------------------------------------------ charms

export type Rarity = 'common' | 'uncommon' | 'rare';
export type CharmId =
  | 'high_roller' | 'chip_stack' | 'lucky_sevens' | 'royal_court' | 'ace_hole' | 'low_rider' | 'bust_boom' | 'soft_touch' | 'hard_case'
  | 'stand_pat' | 'greedy' | 'pocket_pair' | 'piggy_bank' | 'sore_loser' | 'by_the_book' | 'even_steven' | 'odd_todd'
  | 'split' | 'insurance' | 'counter' | 'double_trouble' | 'five_dime' | 'peeker' | 'hot_streak' | 'collector' | 'glass_cannon'
  | 'gold_rush' | 'cold_feet' | 'safety_net' | 'suit_up' | 'lucky_penny' | 'tip_jar' | 'fat_stack' | 'snowball' | 'twenty_club' | 'schadenfreude' | 'big_hand'
  | 'whale' | 'perfect' | 'loan_shark' | 'natural' | 'encore' | 'marked' | 'hush' | 'house_edge' | 'lucky_coin' | 'compounder';

export interface CharmDef { id: CharmId; name: string; rarity: Rarity; cost: number; icon: string; text: string }
const C = (id: CharmId, name: string, rarity: Rarity, cost: number, icon: string, text: string): CharmDef => ({ id, name, rarity, cost, icon, text });

export const CHARMS: Record<CharmId, CharmDef> = {
  high_roller: C('high_roller', 'High Roller', 'common', 4, '🎩', '+4 mult.'),
  chip_stack: C('chip_stack', 'Chip Stack', 'common', 4, '🎲', '+40 chips.'),
  lucky_sevens: C('lucky_sevens', 'Lucky Sevens', 'common', 5, '🎰', 'Each 7 in your hand gives +7 mult.'),
  royal_court: C('royal_court', 'Royal Court', 'common', 5, '👑', 'Each J, Q or K gives +3 mult.'),
  ace_hole: C('ace_hole', 'Ace in the Hole', 'common', 5, '🅰️', 'Each Ace gives +25 chips.'),
  low_rider: C('low_rider', 'Low Rider', 'common', 5, '🚙', 'Each 2, 3, 4 or 5 gives +5 mult.'),
  bust_boom: C('bust_boom', 'Bust Boom', 'common', 5, '💥', '+10 mult when the dealer busts.'),
  soft_touch: C('soft_touch', 'Soft Touch', 'common', 5, '🧸', '+8 mult if your hand is soft.'),
  hard_case: C('hard_case', 'Hard Case', 'common', 4, '🧱', '+50 chips if your hand is hard.'),
  stand_pat: C('stand_pat', 'Stand Pat', 'common', 5, '🗿', '+60 chips if you win without hitting.'),
  greedy: C('greedy', 'Greedy Hitter', 'common', 5, '🤑', '+4 mult for each card you hit.'),
  pocket_pair: C('pocket_pair', 'Pocket Pair', 'common', 5, '👯', '+12 mult if your first two cards share a rank.'),
  piggy_bank: C('piggy_bank', 'Piggy Bank', 'common', 5, '🐷', 'Earn $3 at the end of each table.'),
  sore_loser: C('sore_loser', 'Sore Loser', 'common', 4, '😤', 'Lost hands score in full instead of half.'),
  by_the_book: C('by_the_book', 'By the Book', 'common', 5, '📘', '+10 mult if every move this hand matched basic strategy.'),
  even_steven: C('even_steven', 'Even Steven', 'common', 5, '⚖️', 'Each 2, 4, 6, 8 or 10 gives +4 mult.'),
  odd_todd: C('odd_todd', 'Odd Todd', 'common', 5, '🧦', 'Each 3, 5, 7, 9 or Ace gives +30 chips.'),
  lucky_penny: C('lucky_penny', 'Lucky Penny', 'common', 4, '🪙', '+15 mult. 1 in 6 chance to break at the end of each table.'),
  tip_jar: C('tip_jar', 'Tip Jar', 'common', 5, '🫙', 'Earn $1 for every hand you win.'),
  split: C('split', 'Split Personality', 'uncommon', 6, '🎭', 'You can split pairs. Each half scores as its own hand, for the price of one.'),
  insurance: C('insurance', 'Insurance Fraud', 'uncommon', 6, '📜', 'When the dealer shows an Ace, insure for $2. If they have blackjack: +$8 and the hand is refunded.'),
  counter: C('counter', 'Card Counter', 'uncommon', 7, '🧮', '+1 mult for every 2–6 the dealer has drawn at this table.'),
  double_trouble: C('double_trouble', 'Double Trouble', 'uncommon', 7, '✌️', 'Doubled hands score ×3 instead of ×2.'),
  five_dime: C('five_dime', 'Five and Dime', 'uncommon', 7, '🖐️', 'A Charlie needs only 4 cards.'),
  peeker: C('peeker', 'Peeker', 'uncommon', 6, '👀', 'You can see the top card of your deck.'),
  hot_streak: C('hot_streak', 'Hot Streak', 'uncommon', 7, '🔥', '+2 mult for each win in a row. Resets when you lose.'),
  collector: C('collector', 'Collector', 'uncommon', 6, '🗃️', '+3 mult for each charm you own.'),
  glass_cannon: C('glass_cannon', 'Glass Cannon', 'uncommon', 6, '🔨', 'Glass cards give ×2 mult instead of ×1.5.'),
  gold_rush: C('gold_rush', 'Gold Rush', 'uncommon', 6, '⛏️', 'Gold cards also give +6 mult.'),
  cold_feet: C('cold_feet', 'Cold Feet', 'uncommon', 6, '🧊', 'Once per table, surrender a fresh hand and get it back.'),
  safety_net: C('safety_net', 'Safety Net', 'uncommon', 7, '🪂', 'Once per table, a card that would bust you is thrown away instead.'),
  suit_up: C('suit_up', 'Suit Up', 'uncommon', 7, '🧥', '×2 mult if every card in your hand shares a suit.'),
  fat_stack: C('fat_stack', 'Fat Stack', 'uncommon', 6, '💸', '×2 mult. 1 in 8 chance to break at the end of each table.'),
  snowball: C('snowball', 'Snowball', 'uncommon', 6, '⛄', 'Gains +1 mult every time you win a hand, loses 1 when you lose one.'),
  twenty_club: C('twenty_club', 'Twenty Club', 'uncommon', 6, '🎖️', '×1.5 mult when your total is exactly 20.'),
  schadenfreude: C('schadenfreude', 'Schadenfreude', 'uncommon', 7, '😈', '×2 mult when the dealer busts.'),
  big_hand: C('big_hand', 'Big Hand', 'uncommon', 6, '🖐', '×1.5 mult if your hand has 4 or more cards.'),
  whale: C('whale', 'The Whale', 'rare', 8, '🐋', '×3 mult on Blackjacks.'),
  perfect: C('perfect', 'Perfect Twenty-One', 'rare', 8, '🎯', '×2 mult when your total is exactly 21.'),
  loan_shark: C('loan_shark', 'Loan Shark', 'rare', 8, '🦈', '+2 chips for every $1 you have.'),
  natural: C('natural', 'Natural', 'rare', 9, '🌟', 'Gains ×0.25 mult every time you hit a Blackjack. Starts at ×1.'),
  encore: C('encore', 'Encore', 'rare', 9, '🎤', 'Your first two cards score twice.'),
  marked: C('marked', 'Marked Cards', 'rare', 9, '🕵️', 'The dealer\'s hole card is face up.'),
  hush: C('hush', 'Hush Money', 'rare', 8, '🤫', 'A dealer blackjack is only a push.'),
  house_edge: C('house_edge', 'House Edge', 'rare', 10, '🏠', '+1 hand at every table.'),
  lucky_coin: C('lucky_coin', 'Lucky Coin', 'rare', 8, '🍀', 'Lucky cards trigger twice as often.'),
  compounder: C('compounder', 'The Compounder', 'rare', 9, '📈', 'Gains ×0.2 mult every time you clear a table. Starts at ×1.'),
};
export const CHARM_IDS = Object.keys(CHARMS) as CharmId[];

// -------------------------------------------------------------- consumables

export type CocktailId = 'highball' | 'hurricane' | 'martini' | 'manhattan' | 'champagne' | 'long_island' | 'black_russian';
export const COCKTAILS: Record<CocktailId, { name: string; icon: string; hand: HandType | 'all'; text: string }> = {
  highball: { name: 'Highball', icon: '🥃', hand: 'win', text: 'Level up Win.' },
  hurricane: { name: 'Hurricane', icon: '🍹', hand: 'dealer_bust', text: 'Level up Dealer Bust.' },
  martini: { name: 'Martini', icon: '🍸', hand: 'twenty', text: 'Level up Twenty.' },
  manhattan: { name: 'Manhattan', icon: '🍷', hand: 'twentyone', text: 'Level up Twenty-One.' },
  champagne: { name: 'Champagne', icon: '🍾', hand: 'blackjack', text: 'Level up Blackjack.' },
  long_island: { name: 'Long Island', icon: '🥂', hand: 'charlie', text: 'Level up Charlie.' },
  black_russian: { name: 'Black Russian', icon: '☕', hand: 'all', text: 'Level up every hand type.' },
};
export const COCKTAIL_IDS = Object.keys(COCKTAILS) as CocktailId[];

export type FortuneId = 'forger' | 'shredder' | 'royal' | 'twin' | 'painter' | 'gilder' | 'glazier' | 'gambler' | 'trickster' | 'banker' | 'mason' | 'hermit' | 'patron' | 'bartender';
export interface FortuneDef { name: string; icon: string; text: string; pick: number; need: number }
/** pick = most cards you may choose, need = fewest (0 means it doesn't touch cards). */
export const FORTUNES: Record<FortuneId, FortuneDef> = {
  forger: { name: 'The Forger', icon: '🖋️', text: 'Turn up to 2 chosen cards into Aces.', pick: 2, need: 1 },
  shredder: { name: 'The Shredder', icon: '✂️', text: 'Destroy up to 2 chosen cards.', pick: 2, need: 1 },
  royal: { name: 'The Royal', icon: '🤴', text: 'Turn up to 3 chosen cards into random face cards.', pick: 3, need: 1 },
  twin: { name: 'The Twin', icon: '🪞', text: 'Choose 2 cards: the left one becomes a copy of the right one.', pick: 2, need: 2 },
  painter: { name: 'The Painter', icon: '🎨', text: 'Up to 3 chosen cards take the suit of the first one.', pick: 3, need: 2 },
  gilder: { name: 'The Gilder', icon: '💰', text: 'Make 1 chosen card Gold.', pick: 1, need: 1 },
  glazier: { name: 'The Glazier', icon: '🔮', text: 'Make 1 chosen card Glass.', pick: 1, need: 1 },
  gambler: { name: 'The Gambler', icon: '🐞', text: 'Make up to 2 chosen cards Lucky.', pick: 2, need: 1 },
  trickster: { name: 'The Trickster', icon: '🃏', text: 'Make 1 chosen card Wild.', pick: 1, need: 1 },
  banker: { name: 'The Banker', icon: '🏦', text: 'Make up to 2 chosen cards Bonus cards.', pick: 2, need: 1 },
  mason: { name: 'The Mason', icon: '🪨', text: 'Make 1 chosen card Stone.', pick: 1, need: 1 },
  hermit: { name: 'The Hermit', icon: '🧙', text: 'Double your money (up to +$20).', pick: 0, need: 0 },
  patron: { name: 'The Patron', icon: '🎁', text: 'Create a random common charm, if you have room.', pick: 0, need: 0 },
  bartender: { name: 'The Bartender', icon: '🛎️', text: 'Create up to 2 random cocktails, if you have room.', pick: 0, need: 0 },
};
export const FORTUNE_IDS = Object.keys(FORTUNES) as FortuneId[];

export type Consumable = { kind: 'cocktail'; id: CocktailId; uid: number } | { kind: 'fortune'; id: FortuneId; uid: number };

// ----------------------------------------------------------------- vouchers

export type VoucherId = 'grand_table' | 'fresh_deck' | 'vip_lounge' | 'coat_check' | 'comp_points' | 'house_rules' | 'savings_bond' | 'overstock';
export const VOUCHERS: Record<VoucherId, { name: string; text: string }> = {
  grand_table: { name: 'Grand Table', text: '+1 hand at every table.' },
  fresh_deck: { name: 'Fresh Deck', text: '+1 redraw at every table.' },
  vip_lounge: { name: 'VIP Lounge', text: '+1 charm slot.' },
  coat_check: { name: 'Coat Check', text: '+1 consumable slot.' },
  comp_points: { name: 'Comp Points', text: 'Everything in the shop costs 25% less.' },
  house_rules: { name: 'House Rules', text: 'Rerolls cost $2 less.' },
  savings_bond: { name: 'Savings Bond', text: 'Interest can reach $10 instead of $5.' },
  overstock: { name: 'Overstock', text: '+1 item for sale in every shop.' },
};
export const VOUCHER_IDS = Object.keys(VOUCHERS) as VoucherId[];
export const VOUCHER_COST = 10;

// ------------------------------------------------------------------- bosses

export type BossId = 'cooler' | 'mechanic' | 'shuffler' | 'thief' | 'hourglass' | 'mime' | 'briefcase' | 'wall' | 'taxman' | 'mirror' | 'pit_boss' | 'house';
export const BOSSES: Record<BossId, { name: string; icon: string; text: string; color: string }> = {
  cooler: { name: 'The Cooler', icon: '❄️', text: 'Blackjacks score as plain Wins.', color: '#4fb6ff' },
  mechanic: { name: 'The Mechanic', icon: '🔧', text: 'Your first card is dealt face down.', color: '#c08a3e' },
  shuffler: { name: 'The Shuffler', icon: '🔀', text: 'Your deck is reshuffled before every hand.', color: '#a66bff' },
  thief: { name: 'The Thief', icon: '🦝', text: 'Lose $1 every time you hit.', color: '#7a7a8c' },
  hourglass: { name: 'The Hourglass', icon: '⏳', text: 'One hand fewer at this table.', color: '#e0b64a' },
  mime: { name: 'The Mime', icon: '🤐', text: 'Face cards score no chips.', color: '#e8e8f0' },
  briefcase: { name: 'The Briefcase', icon: '💼', text: 'No redraws at this table.', color: '#8a5a3c' },
  wall: { name: 'The Wall', icon: '🛡️', text: 'The dealer stands on any 15 or more.', color: '#6c8a9c' },
  taxman: { name: 'The Tax Man', icon: '🧾', text: 'Your mult is halved every hand.', color: '#4bc292' },
  mirror: { name: 'The Mirror', icon: '👥', text: 'The dealer draws from your deck.', color: '#ff7ab6' },
  pit_boss: { name: 'The Pit Boss', icon: '👔', text: 'A random charm is switched off each hand.', color: '#ff5f55' },
  house: { name: 'The House', icon: '🏛️', text: 'Final boss. The dealer hits soft 17 and wins every tie.', color: '#f5c451' },
};
export const BOSS_POOL: BossId[] = ['cooler', 'mechanic', 'shuffler', 'thief', 'hourglass', 'mime', 'briefcase', 'wall', 'taxman', 'mirror', 'pit_boss'];

// --------------------------------------------------------------------- tags

export type TagId = 'charm_tag' | 'rare_tag' | 'rich_tag' | 'cocktail_tag' | 'fortune_tag' | 'hand_tag';
export const TAGS: Record<TagId, { name: string; icon: string; text: string }> = {
  charm_tag: { name: 'Charm Tag', icon: '🏷️', text: 'The first charm in the next shop is free.' },
  rare_tag: { name: 'Rare Tag', icon: '💎', text: 'The next shop has a free rare charm.' },
  rich_tag: { name: 'Rich Tag', icon: '💵', text: 'Gain $15 right away.' },
  cocktail_tag: { name: 'Cocktail Tag', icon: '🍸', text: 'Open a free Cocktail Pack right away.' },
  fortune_tag: { name: 'Fortune Tag', icon: '🔮', text: 'Open a free Fortune Pack right away.' },
  hand_tag: { name: 'Hand Tag', icon: '✋', text: '+1 hand at your next table.' },
};
export const TAG_IDS = Object.keys(TAGS) as TagId[];

// ----------------------------------------------------------------- the run

export const STAGES = ['pit', 'high', 'boss'] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_INFO: Record<Stage, { name: string; mult: number; reward: number }> = {
  pit: { name: 'The Pit', mult: 1, reward: 3 },
  high: { name: 'High Roller', mult: 1.5, reward: 4 },
  boss: { name: 'Boss Table', mult: 2, reward: 5 },
};
/** Base chip target per ante; tables multiply it. Tuned with simulated runs. */
export const ANTE_BASE = [0, 50, 240, 650, 1300, 2300, 3800, 5800, 8500];
export const WIN_ANTE = 8;
export const PACKS = {
  cocktail: { name: 'Cocktail Pack', cost: 4, icon: '🍸', text: 'Choose 1 of 3 cocktails to drink now.' },
  fortune: { name: 'Fortune Pack', cost: 4, icon: '🔮', text: 'Choose 1 of 3 fortunes to use on your cards.' },
  charm: { name: 'Charm Pack', cost: 5, icon: '🎁', text: 'Choose 1 of 2 charms.' },
  standard: { name: 'Card Pack', cost: 4, icon: '🂠', text: 'Choose 1 of 3 cards to add to your deck.' },
} as const;
export type PackKind = keyof typeof PACKS;

/** Charms that can break at the end of a table, and the odds. */
export const FRAGILE: Partial<Record<CharmId, number>> = { lucky_penny: 1 / 6, fat_stack: 1 / 8 };
