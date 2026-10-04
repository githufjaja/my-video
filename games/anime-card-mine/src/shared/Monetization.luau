--!strict
-- STAGE 2 hook. Everything is OFF until ENABLED = true AND real IDs are filled in.
-- IDs of 0 are placeholders: the server ignores them (nothing can be bought).
-- Paid options only give multipliers / convenience, never paid random drops (odds are shown in-game).
export type PassDef = {
	name: string,
	description: string,
	id: number, -- GamePass ID (create in Creator Hub -> Monetization -> Passes)
	moneyMult: number?,
	luckMult: number?,
	bonusSlots: number?,
	autoClick: boolean?,
}

export type ProductDef = {
	name: string,
	id: number, -- Developer Product ID
	money: number?, -- fixed money
	incomeSeconds: number?, -- or: this many seconds of current income (min = `money`)
}

local Monetization = {}

Monetization.ENABLED = false

Monetization.Passes = {
	DoubleMoney = { name = "2x Money", description = "Double money from rocks and cards.", id = 0, moneyMult = 2 },
	DoubleLuck = { name = "2x Luck", description = "Better card grades from rocks (odds are shown in the Odds window).", id = 0, luckMult = 2 },
	AutoClick = { name = "Auto Click", description = "Hits the nearest rock for you.", id = 0, autoClick = true },
	ExtraSlots = { name = "+3 Base Slots", description = "Three more card slots on your base.", id = 0, bonusSlots = 3 },
	VIP = { name = "VIP", description = "+25% money and a little extra luck.", id = 0, moneyMult = 1.25, luckMult = 1.1 },
} :: { [string]: PassDef }

Monetization.Products = {
	MoneyS = { name = "Money Pack S", id = 0, money = 5000, incomeSeconds = 600 },
	MoneyM = { name = "Money Pack M", id = 0, money = 50000, incomeSeconds = 3600 },
	MoneyL = { name = "Money Pack L", id = 0, money = 500000, incomeSeconds = 14400 },
} :: { [string]: ProductDef }

return Monetization
