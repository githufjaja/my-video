--!strict
-- Shared data shapes (types only).
export type Boost = { mult: number, ends: number } -- ends = os.time() when it runs out

export type Profile = {
	v: number,
	money: number,
	damageLevel: number,
	slots: number, -- bought base slots (starts at START_SLOTS)
	swordSlots: number, -- bought extra sword slots (0..#SWORD_SLOT_COSTS)
	stage: number, -- walls broken (0..#Zones.stages)
	rebirths: number,
	inv: { [string]: number }, -- cardId -> count (not placed / equipped)
	placed: { [string]: string }, -- base slot (as string) -> cardId
	sword: { [string]: string }, -- sword slot (as string) -> cardId
	levels: { [string]: number }, -- cardId -> level (1 when absent)
	potions: { [string]: number }, -- potion key -> owned count
	boosts: { [string]: Boost }, -- "luck" | "cash" | "drop"
	stats: { rocks: number, cards: number },
	receipts: { [string]: boolean }, -- processed dev-product receipts
	lastSeen: number, -- os.time() of the last save (offline reward)
	offlinePending: number, -- unclaimed offline reward
	starterBought: boolean,
}

export type Snapshot = {
	money: number,
	income: number, -- money per second from base cards (with multipliers)
	damage: number,
	damageLevel: number,
	boughtSlots: number,
	totalSlots: number,
	swordBought: number,
	swordSlots: number,
	stage: number,
	rebirths: number,
	inv: { [string]: number },
	placed: { [string]: string },
	sword: { [string]: string },
	levels: { [string]: number },
	luck: number,
	moneyMult: number,
	swordDmgPct: number, -- total bonus from sword cards (0.5 = +50%)
	swordMoneyPct: number,
	boosts: { [string]: { mult: number, remaining: number } },
	potions: { [string]: number },
	passes: { [string]: boolean },
	dropIn: number, -- seconds until the next card drop
	dropInterval: number,
	offline: boolean, -- true when saving is disabled for this session
	offlinePending: number,
	starterBought: boolean,
	autoOwned: boolean,
	autoOn: boolean,
	studioTest: boolean, -- purchases are free test grants (Studio only)
}

return {}
