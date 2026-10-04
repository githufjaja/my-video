--!strict
-- Shared formulas (the server uses them for real, the client for price display).
local Config = require(script.Parent.Config)
local Zones = require(script.Parent.Zones)

local Formulas = {}

-- base damage of a sword level: grows faster every 25 levels
function Formulas.baseDamage(level: number): number
	return Config.BASE_DAMAGE + level * (1 + math.floor(level / 25))
end

-- price of the upgrade that moves from `level` to `level + 1`
function Formulas.damageCost(level: number): number
	return math.floor(Config.DAMAGE_COST_BASE * Config.DAMAGE_COST_GROWTH ^ level)
end

function Formulas.damageCostMany(level: number, count: number): number
	local total = 0
	for i = 0, count - 1 do
		total += Formulas.damageCost(level + i)
	end
	return total
end

-- how many levels can be bought with `money`: returns (count, totalCost)
function Formulas.maxAffordable(level: number, money: number): (number, number)
	local count, total = 0, 0
	while level + count < Config.MAX_DAMAGE_LEVEL and count < 1000 do
		local cost = Formulas.damageCost(level + count)
		if total + cost > money then
			break
		end
		total += cost
		count += 1
	end
	return count, total
end

-- price of the next base slot, or nil when the maximum is bought
function Formulas.slotCost(bought: number): number?
	return Config.SLOT_COSTS[bought - Config.START_SLOTS + 1]
end

-- price of the next sword slot (bought = extra slots already bought), or nil
function Formulas.swordSlotCost(bought: number): number?
	return Config.SWORD_SLOT_COSTS[bought + 1]
end

function Formulas.rebirthDamageMult(rebirths: number): number
	return 1 + Config.REBIRTH_DAMAGE_PER * rebirths
end

function Formulas.rebirthMoneyMult(rebirths: number): number
	return 1 + Config.REBIRTH_MONEY_PER * rebirths
end

-- stages that must be cleared before the next rebirth
function Formulas.rebirthStageReq(rebirths: number): number
	return math.min(Zones.stageCount, Config.REBIRTH_BASE_STAGE + Config.REBIRTH_STAGE_STEP * rebirths)
end

return Formulas
