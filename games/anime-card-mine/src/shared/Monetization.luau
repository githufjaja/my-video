--!strict
-- ALL prices and IDs live here.
--
-- HOW TO ACTIVATE A REAL ITEM:
--   * Game pass:  Creator Hub -> your experience -> Monetization -> Passes -> Create a Pass -> copy its ID into `id`.
--   * Dev product: Creator Hub -> your experience -> Monetization -> Developer Products -> Create -> copy its ID into `id`.
--   * `robux` is only the price SHOWN in the shop window; the real price is the one set in Creator Hub.
--   * id = 0 means "not created yet": the shop shows "Soon" (live servers) and nothing can be bought.
--
-- STUDIO TEST MODE: while STUDIO_TEST_GRANTS = true, in Roblox Studio every shop button grants the item for free
-- (no Robux, nothing is saved as a purchase). On live servers it does nothing, so it is safe to leave on.
--
-- Rules followed: no paid random drops (packs have FIXED contents), odds are shown in the Odds window.
export type PassDef = {
	name: string,
	description: string,
	id: number,
	robux: number,
	moneyMult: number?, -- multiplies money
	luckMult: number?, -- multiplies Luck (card grades from drops)
	swordSlots: number?, -- extra sword slots
	baseSlots: number?, -- extra base slots
	autoSwing: boolean?,
	fastDrops: boolean?, -- card drop every DROP_INTERVAL_FAST seconds
	vip: boolean?, -- VIP tag + VIP lounge
}

export type PotionDef = {
	name: string,
	description: string,
	kind: string, -- "luck" | "cash" | "drop"
	mult: number,
	seconds: number,
}

export type Bundle = {
	money: number?,
	cards: { { id: string, n: number } }?, -- FIXED cards (never random)
	potions: { { key: string, n: number } }?,
}

export type ProductDef = {
	name: string,
	description: string,
	id: number,
	robux: number,
	kind: string, -- "money" | "potion" | "skipDrop" | "doubleOffline" | "bundle"
	money: number?, -- kind "money": minimum amount
	incomeSeconds: number?, -- kind "money": or this many seconds of current income, whichever is larger
	potion: string?, -- kind "potion": key in Potions
	n: number?, -- kind "potion": how many
	bundle: Bundle?, -- kind "bundle"
	once: boolean?, -- Starter Pack: shown only until bought
}

local Monetization = {}

Monetization.ENABLED = true
Monetization.STUDIO_TEST_GRANTS = true

Monetization.Passes = {
	VIP = { name = "VIP", description = "+25% money, +10% luck, VIP tag and the VIP lounge.", id = 0, robux = 499, moneyMult = 1.25, luckMult = 1.1, vip = true },
	DoubleMoney = { name = "2x Money", description = "Double money from rocks, walls and cards.", id = 0, robux = 399, moneyMult = 2 },
	DoubleLuck = { name = "2x Luck", description = "Better card grades from drops (see the Odds window).", id = 0, robux = 299, luckMult = 2 },
	AutoSwing = { name = "Auto Swing", description = "Your sword hits the nearest obstacle by itself.", id = 0, robux = 349, autoSwing = true },
	SwordSlots = { name = "+2 Sword Slots", description = "Two more card slots on your sword.", id = 0, robux = 249, swordSlots = 2 },
	BaseSlots = { name = "+3 Base Slots", description = "Three more card slots on your base.", id = 0, robux = 249, baseSlots = 3 },
	FasterDrops = { name = "Faster Drops", description = "A card drops every 60 seconds instead of 90.", id = 0, robux = 199, fastDrops = true },
} :: { [string]: PassDef }

-- display / sort order of the passes in the shop
Monetization.PassOrder = { "VIP", "DoubleMoney", "DoubleLuck", "AutoSwing", "SwordSlots", "BaseSlots", "FasterDrops" }

Monetization.Potions = {
	Luck15 = { name = "Luck Potion", description = "x2 Luck for 15 minutes.", kind = "luck", mult = 2, seconds = 900 },
	Cash15 = { name = "Cash Potion", description = "x2 money for 15 minutes.", kind = "cash", mult = 2, seconds = 900 },
	Drop15 = { name = "Drop Potion", description = "Cards drop twice as often for 15 minutes.", kind = "drop", mult = 2, seconds = 900 },
} :: { [string]: PotionDef }

Monetization.PotionOrder = { "Luck15", "Cash15", "Drop15" }

Monetization.Products = {
	LuckPotion = { name = "Luck Potion", description = "x2 Luck, 15 min.", id = 0, robux = 49, kind = "potion", potion = "Luck15", n = 1 },
	CashPotion = { name = "Cash Potion", description = "x2 money, 15 min.", id = 0, robux = 49, kind = "potion", potion = "Cash15", n = 1 },
	DropPotion = { name = "Drop Potion", description = "Cards drop 2x faster, 15 min.", id = 0, robux = 49, kind = "potion", potion = "Drop15", n = 1 },
	SkipDrop = { name = "Drop Now", description = "A card drops right now (fixed odds, see Odds).", id = 0, robux = 29, kind = "skipDrop" },
	DoubleOffline = { name = "Double Offline Reward", description = "Doubles the reward shown when you return.", id = 0, robux = 39, kind = "doubleOffline" },
	MoneyS = { name = "Money Pack S", description = "$5K, or 10 minutes of your income if larger.", id = 0, robux = 49, kind = "money", money = 5000, incomeSeconds = 600 },
	MoneyM = { name = "Money Pack M", description = "$50K, or 1 hour of your income if larger.", id = 0, robux = 149, kind = "money", money = 50000, incomeSeconds = 3600 },
	MoneyL = { name = "Money Pack L", description = "$500K, or 4 hours of your income if larger.", id = 0, robux = 399, kind = "money", money = 500000, incomeSeconds = 14400 },
	StarterPack = {
		name = "Starter Pack",
		description = "One time only: $25K, Toru Emberfang (Epic), 2 Luck and 2 Cash potions.",
		id = 0,
		robux = 99,
		kind = "bundle",
		once = true,
		bundle = {
			money = 25000,
			cards = { { id = "toru_emberfang", n = 1 } },
			potions = { { key = "Luck15", n = 2 }, { key = "Cash15", n = 2 } },
		},
	},
	MasterPack = {
		name = "Master Pack",
		description = "$500K, Sorrel Dawnblade (Legendary), 3 of each potion.",
		id = 0,
		robux = 349,
		kind = "bundle",
		bundle = {
			money = 500000,
			cards = { { id = "sorrel_dawnblade", n = 1 } },
			potions = { { key = "Luck15", n = 3 }, { key = "Cash15", n = 3 }, { key = "Drop15", n = 3 } },
		},
	},
} :: { [string]: ProductDef }

Monetization.ProductOrder = { "StarterPack", "MasterPack", "MoneyS", "MoneyM", "MoneyL", "SkipDrop" }

return Monetization
