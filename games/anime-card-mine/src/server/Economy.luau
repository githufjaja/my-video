--!strict
-- Server-side numbers: damage, income, luck, slots, drop speed. Money changes go through here.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Cards = require(ReplicatedStorage.Shared.Cards)
local Formulas = require(ReplicatedStorage.Shared.Formulas)
local DataService = require(script.Parent.DataService)
local MonetizationService = require(script.Parent.MonetizationService)

type Session = DataService.Session

local Economy = {}

function Economy.cardLevel(session: Session, cardId: string): number
	return session.profile.levels[cardId] or 1
end

function Economy.baseSlots(session: Session): number
	return math.min(Config.PLOT_MAX_SLOTS, session.profile.slots + MonetizationService.bonusBaseSlots(session.player))
end

function Economy.swordSlots(session: Session): number
	local n = Config.SWORD_START_SLOTS + session.profile.swordSlots + MonetizationService.bonusSwordSlots(session.player)
	return math.min(Config.SWORD_MAX_SLOTS, n)
end

-- Compatibility name used by BaseService / CardService.
function Economy.totalSlots(session: Session): number
	return Economy.baseSlots(session)
end

-- (damage fraction, money fraction) summed over the cards in sword slots
function Economy.swordBonus(session: Session): (number, number)
	local dmg, money = 0, 0
	local slots = Economy.swordSlots(session)
	for slotKey, cardId in session.profile.sword do
		local slot = tonumber(slotKey)
		if slot and slot <= slots then
			local d, m = Cards.swordBonus(cardId, Economy.cardLevel(session, cardId))
			dmg += d
			money += m
		end
	end
	return dmg, money
end

function Economy.damage(session: Session): number
	local dmgPct = Economy.swordBonus(session)
	local base = Formulas.baseDamage(session.profile.damageLevel)
	return math.max(1, math.floor(base * (1 + dmgPct) * Formulas.rebirthDamageMult(session.profile.rebirths)))
end

-- general money multiplier: passes x boost x rebirth
function Economy.moneyMult(session: Session): number
	return MonetizationService.moneyMult(session.player)
		* MonetizationService.boostMult(session, "cash")
		* Formulas.rebirthMoneyMult(session.profile.rebirths)
end

-- multiplier for money from hits (adds sword cards)
function Economy.hitMoneyMult(session: Session): number
	local _, moneyPct = Economy.swordBonus(session)
	return Economy.moneyMult(session) * (1 + moneyPct)
end

function Economy.luck(session: Session): number
	return MonetizationService.luckMult(session.player) * MonetizationService.boostMult(session, "luck")
end

function Economy.dropInterval(session: Session): number
	local base = if MonetizationService.hasFastDrops(session.player) then Config.DROP_INTERVAL_FAST else Config.DROP_INTERVAL
	return base / MonetizationService.boostMult(session, "drop")
end

-- money per second from placed cards (with multipliers and card levels)
function Economy.income(session: Session): number
	local total = 0
	local slots = Economy.baseSlots(session)
	for slotKey, cardId in session.profile.placed do
		local slot = tonumber(slotKey)
		local def = Cards.byId[cardId]
		if slot and slot <= slots and def then
			total += def.income * Cards.levelIncomeMult(Economy.cardLevel(session, cardId))
		end
	end
	return total * Economy.moneyMult(session)
end

function Economy.addMoney(session: Session, amount: number)
	local p = session.profile
	p.money = math.clamp(p.money + amount, 0, Config.MAX_MONEY)
	DataService.touch(session)
end

-- returns true and subtracts if the player can afford it
function Economy.spend(session: Session, cost: number): boolean
	local p = session.profile
	if cost < 0 or cost ~= cost or p.money < cost then
		return false
	end
	p.money -= cost
	DataService.touch(session)
	return true
end

-- passive income once per second; also sweeps expired boosts
function Economy.startIncomeLoop(onTick: (Player) -> ())
	task.spawn(function()
		while true do
			task.wait(1)
			for player, session in DataService.all() do
				if not session.released then
					local inc = Economy.income(session)
					if inc > 0 then
						Economy.addMoney(session, inc)
						onTick(player)
					end
					if MonetizationService.sweepBoosts(session) then
						onTick(player)
					end
				end
			end
		end
	end)
end

MonetizationService.hooks.income = Economy.income

return Economy
