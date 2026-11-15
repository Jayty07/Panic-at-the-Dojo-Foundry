export const SYS = "panic-at-the-dojo";
export const SYS_PATH = `systems/${SYS}`;

export const PATD = {
  weights: {
    featherweight: { label: "Featherweight", hp: 10, heal: 1, bleed: 2, supers: 0 },
    lightweight:   { label: "Lightweight",   hp: 15, heal: 2, bleed: 3, supers: 1 },
    middleweight:  { label: "Middleweight",  hp: 20, heal: 2, bleed: 4, supers: 1 },
    heavyweight:   { label: "Heavyweight",   hp: 25, heal: 3, bleed: 5, supers: 1 },
    worldweight:   { label: "Worldweight",   hp: 30, heal: 3, bleed: 6, supers: 2 }
  },

  basicTokens: ["iron", "power", "speed"],
  statusTokens: ["burning", "fatigue", "weakness"],
  uniqueTokens: ["control", "chaos", "luck", "mentor", "poltergeist", "training", "inspired"],
  tokenLabels: {
    iron: "Iron", power: "Power", speed: "Speed",
    burning: "Burning", fatigue: "Fatigue", weakness: "Weakness",
    control: "Control", chaos: "Chaos", luck: "Luck", mentor: "Mentor",
    poltergeist: "Poltergeist", training: "Training", inspired: "Inspired"
  },
  tokenIcons: {
    iron: "fa-solid fa-shield-halved", power: "fa-solid fa-fist-raised", speed: "fa-solid fa-person-running",
    burning: "fa-solid fa-fire", fatigue: "fa-solid fa-link", weakness: "fa-solid fa-heart-crack",
    control: "fa-solid fa-hand", chaos: "fa-solid fa-hurricane", luck: "fa-solid fa-clover",
    mentor: "fa-solid fa-graduation-cap", poltergeist: "fa-solid fa-ghost", training: "fa-solid fa-dumbbell",
    inspired: "fa-solid fa-star"
  },
  tokenCap: 10,
  shieldCap: 8,
  poolCap: 10,

  keywords: ["Aggro", "Desperation", "Guard", "Mobility", "Preparation", "Ruinous", "Support", "Technical", "Zoning"],
  heroTypes: { focused: "Focused", fused: "Fused", frantic: "Frantic" },

  /** Level tables: [level] => {xp, die, hp} */
  heroAdvancement: [
    null,
    { xp: 0,  die: null,  hp: 0 },
    { xp: 5,  die: "d4",  hp: 1 },
    { xp: 10, die: "d4",  hp: 2 },
    { xp: 15, die: "d6",  hp: 3 },
    { xp: 20, die: "d6",  hp: 4 },
    { xp: 25, die: "d8",  hp: 6 },
    { xp: 30, die: "d8",  hp: 7 },
    { xp: 35, die: "d10", hp: 8 },
    { xp: 40, die: "d10", hp: 9 },
    { xp: 50, die: "d12", hp: 10 }
  ],
  heroBenefits: {
    focused: ["Focused Hero Traits", "1st Super Move", "Improved Focus", "4th Stance", "Gain a Fused Archetype", "2nd Super Move; 5th Stance", "Greater Focus", "6th Stance", "Improved Fused Archetype", "Focused Mastery"],
    fused: ["Fused Hero Traits", "1st Super Move", "Improved Fusion", "4th Stance", "3rd Fused Archetype", "2nd Super Move; 5th Stance", "Greater Fusion", "6th Stance", "4th Fused Archetype", "7th Stance; Fusion Mastery"],
    frantic: ["Frantic Hero Traits", "1st Super Move; 4th Form", "Improved Frenzy", "4th Style", "Gain a Fused Archetype", "2nd Super Move; 5th Form", "Greater Frenzy", "5th Style", "Gain a 2nd Fused Archetype", "Frenzy Mastery"]
  },
  warriorAdvancement: [
    null,
    { die: null, hp: 0 }, { die: "d4", hp: 2 }, { die: "d4", hp: 3 }, { die: "d6", hp: 5 }, { die: "d6", hp: 7 },
    { die: "d8", hp: 8 }, { die: "d8", hp: 10 }, { die: "d10", hp: 12 }, { die: "d10", hp: 13 }, { die: "d12", hp: 15 }
  ],
  warriorBenefits: ["Warrior Traits", "Super Move", "Improved Warrior (Warrior's Path)", "---", "Gain a 2nd Fused Archetype", "2nd Stance", "Greater Warrior", "---", "Gain a 3rd Fused Archetype", "A Warrior's Death"],

  bleedAbilities: {
    focused: { name: "Focused Bleed", text: "At the start of your turn, if you are Bleeding, then when you roll your Action Dice for this turn, re-roll each die with a value of 2 or less. Keep rolling until none of your dice have a value below 3. (For any pre-set numbers, set any 1 and 2 values to 3.) Usable once per fight." },
    fused: { name: "Fused Bleed", text: "At the start of your turn, if you are Bleeding, then you heal, gain 2 Power tokens, gain 2 Iron tokens, gain Shield 2, and may Move 2. Usable once per fight." },
    frantic: { name: "Frantic Bleed", text: "At the start of your turn, if you are Bleeding, then choose one: Add d10 to your Action Dice this turn; -or- add d6 d4 to your Action Dice this turn. Usable once per fight." }
  },
  franticVersatility: "When you are the active character, at the start of Phase 1 of your turn, you pick one Frantic Ability, one Style, and one Form, and combine them to create your Stance for the turn. You cannot pick an Ability, Style, or Form that you used on your previous turn.",

  basicActions: [
    { cost: "1+ or 3+ or 5+ or 7+ or 9+", name: "Damage", text: "Deal 1 damage to an enemy within range.\n3+: Deal 2 damage instead.\n5+: Deal 3 damage instead, and Push 1.\n7+: Deal 4 damage instead, and Push 2 instead.\n9+: Deal 5 damage instead, and Push 3 instead." },
    { cost: "1+ or 3+ or 5+ or 7+ or 9+", name: "Throw", text: "Push 1 to an adjacent enemy.\n3+: Push 2 instead.\n5+: Push 3 instead, and deal 1 damage to them.\n7+: Push 4 instead, and deal 2 damage instead.\n9+: Push 5 instead, and deal 3 damage instead." },
    { cost: "X", name: "Grapple", text: "Target someone within Range 1-X. Pull them 2.\n4+: Pull 1 more and if they are an enemy, give them 1 Fatigue token.\n7+: Pull 2 more and if they are an enemy, give them 2 Fatigue tokens." },
    { cost: "3+ or 7+", name: "Stagger", text: "Give 2 Fatigue tokens to an adjacent enemy.\n7+: Give them 2 more Fatigue tokens and 2 Weakness tokens." },
    { cost: "1+ or 4+", name: "A Challenger Approaches", text: "Challenge an enemy within Range 1-4.\n4+: Challenge up to two more enemies within Range 1-4." },
    { cost: "1+ or 4+ or 7+", name: "Put It Out!", text: "Discard 1 non-Unique token from someone within range.\n4+: Choose one: Discard 1 Unique token from them; -or- Discard up to 2 more non-Unique tokens from them.\n7+: Choose one: Discard 1 Unique token from them; -or- Discard up to 2 more non-Unique tokens from them." },
    { cost: "X", name: "Movement", text: "You gain X Speed tokens." },
    { cost: "1+ or 4+ or 8+", name: "Open The Path", text: "Target an obstacle within range and destroy it.\n4+: Destroy up to 3 obstacles adjacent to the initial target.\n8+: Destroy up to 5 obstacles within Range 1-3 of any previous target." },
    { cost: "4+", name: "Guard", text: "You gain temporary Armor." },
    { cost: "5+", name: "Rescue", text: "Choose one: Heal an ally within range; -or- heal an ally who is not in play, then return them to play into an empty space within range." }
  ],

  stanceCheckBonuses: [
    { id: "tokens", label: "Gain 3 Basic tokens of your choice" },
    { id: "d10", label: "Add d10 to your Action Dice", dice: ["d10"] },
    { id: "2d6", label: "Add d6 d6 to your Action Dice", dice: ["d6", "d6"] },
    { id: "3d4", label: "Add d4 d4 d4 to your Action Dice", dice: ["d4", "d4", "d4"] },
    { id: "plus2", label: "After you roll, increase one of your numbers by 2" }
  ],

  tests: {
    aggression: "Test of Aggression: Single target with 10 HP. Deal 10+ damage: pass. 6-9: take 3. 5 or less: take 6.",
    blocking: "Test of Blocking: At the end of this turn you take 8 damage. Spend any number of Iron tokens to reduce it.",
    caution: "Test of Caution: Roll your Action Dice. No matches: pass. One pair: take 3. Three or more match: take 6.",
    evasion: "Test of Evasion: Generate 15+ Speed tokens: pass. 10-14: take 3. 9 or less: take 6.",
    impact: "Test of Impact: Target with 5 HP that fully heals after each hit. A single 5+ damage hit: pass. 3-4: take 3. 2 or less: take 6.",
    manyFists: "Test of Many Fists: Three 1 HP targets always in range. Defeat 8+: pass. 5-7: take 3. 4 or less: take 6.",
    neutralization: "Test of Neutralization: Give 8+ Status tokens: pass. 5-7: take 3. 4 or less: take 6.",
    precision: "Test of Precision: Roll your Action Dice one at a time and stop whenever. Total exactly 15: pass. 14 or less: take 3. 16+: take 6.",
    quiet: "Test of Quiet: Roll your Action Dice. Three or more match: pass. One pair: take 3. No matches: take 6.",
    sisyphus: "Test of Sisyphus: Push the Boulder 8+ squares: pass. 5-7: take 3. 4 or less: take 6.",
    variety: "Test of Variety: Each token type, a Shield, Armor and each distinct damage value hit = 1 point. 7+: pass. 5-6: take 3. 4 or less: take 6."
  },
  contests: {
    bigGame: "Big Game: Your infinite-HP target holding the most Status tokens wins.",
    crushing: "Crushing: The most damage in a single hit wins.",
    javelin: "Javelin: Push your Javelin the farthest.",
    macho: "Macho: The most total damage to an infinite-HP target wins.",
    negotiation: "Negotiation: Fewest matching numbers wins (no matches: highest number; all matched: highest pair). Three of a kind loses.",
    sumo: "Sumo: The most Iron tokens wins.",
    survival: "Survival: Take three 5-damage hits; least HP lost wins (does not carry over).",
    wrestling: "Wrestling: The most Power tokens wins."
  },

  parameters: {
    arena: ["Cage Match", "Endless Field", "Factory", "Icy Floor", "Pyroclasm", "Second Floor", "Traffic", "Trick Room"],
    tilted: ["Chained Down", "Disarmed", "Enraged", "Handcuffs", "Keep Em Coming", "Overwhelming Power", "Too Slow", "Weakened State"],
    victory: ["Last One Standing", "King of the Hill", "Outlast", "Protect The VIP", "Sabotage", "Secure the McGuffin", "Tournament Play"]
  },

  skills: ["Basically Magic", "Professional", "Put On A Show", "Immovable", "Think Fast", "Unstoppable", "Perfect Timing", "Shadow Walker", "Natural Charisma", "Rose Heart", "Eyes Wide Open", "Wind Runner"],

  /** Colours sampled from the rulebook's card layouts. */
  colors: {
    stance: "#c9a227", form: "#527afd", style: "#fc2423", action: "#1d6d43", option: "#723e73",
    skill: "#f07a00", alpha: "#9a0089", delta: "#04576f"
  }
};
