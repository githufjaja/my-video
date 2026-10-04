--!strict
-- Server-side numbers: damage, income, luck, slots. Money changes go through here.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Cards = require(ReplicatedStorage.Shared.Cards)
local Formulas = require(ReplicatedStorage.Shared.Formulas)
local DataService = require(script.Parent.DataService)
local MonetizationService = require(script.Parent.MonetizationService)

local Economy = {}

function Economy.damage(session: DataService.Session): number
	return Formulas.damageForLevel(session.profile.damageLevel)
end

function Economy.moneyMult(player: Player): number
	return MonetizationService.moneyMult(player)
end

function Economy.luck(player: Player): number
	return MonetizationService.luckMult(player)
end

function Economy.totalSlots(session: DataService.Session): number
	return math.min(Config.PLOT_MAX_SLOTS, session.profile.slots + MonetizationService.bonusSlots(session.player))
end

-- money per second from placed cards (with multipliers)
function Economy.income(session: DataService.Session): number
	local total = 0
	local slots = Economy.totalSlots(session)
	for slotKey, cardId in session.profile.placed do
		local slot = tonumber(slotKey)
		local def = Cards.byId[cardId]
		if slot and slot <= slots and def then
			total += def.income
		end
	end
	return total * Economy.moneyMult(session.player)
end

function Economy.addMoney(session: DataService.Session, amount: number)
	local p = session.profile
	p.money = math.clamp(p.money + amount, 0, Config.MAX_MONEY)
	DataService.touch(session)
end

-- returns true and subtracts if the player can afford it
function Economy.spend(session: DataService.Session, cost: number): boolean
	local p = session.profile
	if cost < 0 or cost ~= cost or p.money < cost then
		return false
	end
	p.money -= cost
	DataService.touch(session)
	return true
end

-- passive income, once per second
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
				end
			end
		end
	end)
end

MonetizationService.incomeOf = Economy.income

return Economy
