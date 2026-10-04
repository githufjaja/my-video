--!strict
-- Shared data shapes (types only).
export type Profile = {
	v: number,
	money: number,
	damageLevel: number,
	slots: number, -- bought slots (starts at START_SLOTS)
	zonesUnlocked: number, -- highest unlocked world (1..#Zones)
	inv: { [string]: number }, -- cardId -> count (not placed)
	placed: { [string]: string }, -- slot index (as string) -> cardId
	stats: { rocks: number, cards: number },
	receipts: { [string]: boolean }, -- processed dev-product receipts
}

export type Snapshot = {
	money: number,
	income: number, -- money per second (with multipliers)
	damage: number,
	damageLevel: number,
	boughtSlots: number,
	totalSlots: number, -- bought + pass bonus
	zonesUnlocked: number,
	inv: { [string]: number },
	placed: { [string]: string },
	luck: number,
	moneyMult: number,
	offline: boolean, -- true when saving is disabled for this session
	monetization: boolean,
	passes: { [string]: boolean },
}

return {}
