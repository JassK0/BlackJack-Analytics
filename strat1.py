# orginal


import random
import matplotlib.pyplot as plt
import numpy as np


cards = {
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    '10': 10,
    'J': 10,  # Jack
    'Q': 10,  # Queen
    'K': 10,  # King
    'A': 11   # Ace (figure out soft and hard logic)
}



starting_bankroll = 100
bankroll = starting_bankroll
bet_size = 5


#dont fully understan yet from gpt this part
NUM_DECKS = 6

def build_shoe(n=NUM_DECKS):
    shoe = [] #start w empty shoe
    for _ in range(n):
        for r in ('2','3','4','5','6','7','8','9','10','J','Q','K','A'):
            shoe.extend([r]*4)   # 4 suits per rank per deck, so 4 times each card (13 * 4 = 52)
    random.shuffle(shoe)
    return shoe

shoe = build_shoe()

CUT_CARD = 52  # reshuffle when <= this many left
if len(shoe) <= CUT_CARD:
    shoe = build_shoe()
# --- 2) Draw from the shoe (auto-reshuffle if empty) ---
def drawCard():
    global shoe
    if not shoe:
        shoe = build_shoe()
    return shoe.pop()   # deal one card (a key like 'A' or 'K')

# def drawCard():
#     # RETURN A CARD KEY (so we can tell if it’s an Ace later)
#     return random.choice(list(cards.keys()))









def add_hands(hand):
    
    total = 0
    aces = 0
  
    for c in hand:
        total += cards[c] # card[c] returns value at key c (so if c is J, return value of 10)
        if c == 'A':
            aces += 1
    while total > 21 and aces > 0:
        total -= 10
        aces -=1
    
    return total

def hit(who):
    who.append(drawCard())
    print(f"drew {who[-1]}")
    print(f"Hand {who} => {add_hands(who)}")


player_win = 0
dealer_win = 0
push = 0





def play():
    global player_win, dealer_win, push

    dealer_hand = [drawCard(), drawCard()]
    player_hand = [drawCard(), drawCard()]
    
    upcard_value = cards[dealer_hand[0]]



    print(f"Dealer shows {dealer_hand[0]}")
    print(f"Player shows {player_hand} => {add_hands(player_hand)}")

    while True:
        if add_hands(player_hand) == 21:
            print("Player Blackjack!")
            player_win +=1
            return
        if add_hands(dealer_hand) == 21:
            print(f"Dealer shows {dealer_hand}")
            print("Dealer Blackjack!")
            dealer_win +=1
            return
        if add_hands(dealer_hand) == 21 and add_hands(player_hand) == 21:
            print("BJ PUSH")
            push +=1
            return

        #player_choice = input("hit or stand: ").lower()

        while add_hands(player_hand) <= 16:
            hit(player_hand)
            if add_hands(player_hand) > 21:
              print("Bust! Game Over.")
              dealer_win +=1
              print(f"Dealer had {dealer_hand} => {add_hands(dealer_hand)}")
              return
            
        print("Player Stands")
          
        while add_hands(dealer_hand) <= 16:
            print(f"dealer hand {dealer_hand} => {add_hands(dealer_hand)}")
            hit(dealer_hand)
            if add_hands(dealer_hand) > 21:
                player_win +=1
                print("dealer bust after player stand then dealer drew")
                return
          
          
        dealer_total = add_hands(dealer_hand)
        player_total = add_hands(player_hand)

        if dealer_total > player_total:
            print(f"dealer hand {dealer_hand} => {add_hands(dealer_hand)}")
            dealer_win +=1
            print("dealer win end")
            return
        if player_total > dealer_total:
            print(f"dealer hand {dealer_hand} => {add_hands(dealer_hand)}")
            player_win +=1
            print("player win end")
            return
        else:
            print(f"dealer hand {dealer_hand} => {add_hands(dealer_hand)}")
            push +=1
            print("PUSHHH")
            return

play()










rounds = 10

for i in range(rounds):
    print("_________________________")
    print(f"game {i+1}")
    print("_________________________")
    play()
    
    
win_rate = round((player_win/rounds) * 100, 2)
lose_rate = round((dealer_win/rounds) * 100, 2)
push_rate = round((push / rounds) * 100, 2)

print("_________________________")
print("Final Count")
print("_________________________")
print(f"Player wins: {player_win}, dealer wins: {dealer_win}, Pushes: {push}")
print(f"Player wins %: {win_rate}, dealer win %: {lose_rate}, Push %: {push_rate}")
print("_________________________")




plt.style.use('_mpl-gallery-nogrid')

# make data
x = [win_rate, lose_rate, push_rate]
colors = plt.get_cmap('Blues')(np.linspace(0.2, 0.7, len(x)))

# plot
fig, ax = plt.subplots()
ax.pie(x, colors=colors, radius=3, center=(4, 4),
       wedgeprops={"linewidth": 1, "edgecolor": "white"}, frame=True)

ax.set(xlim=(0, 8), xticks=np.arange(1, 8),
       ylim=(0, 8), yticks=np.arange(1, 8))


plt.show()