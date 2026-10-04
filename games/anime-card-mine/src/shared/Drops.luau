--!strict
-- Card drop odds. Used by the server for rolling and by the client to SHOW the exact same odds.
local Grades = require(script.Parent.Grades)
local Cards = require(script.Parent.Cards)
local Zones = require(script.Parent.Zones)

local Drops = {}

-- Percentages (sum = 100) per grade for a world. Luck multiplies every grade except Common.
function Drops.gradeChances(world: Zones.World, luck: number): { [string]: number }
	local weights: { [string]: number } = {}
	local total = 0
	for _, grade in Grades.list do
		local w = world.gradeWeights[grade] or 0
		if grade ~= "Common" then
			w *= luck
		end
		if not Cards.byGrade[grade] then
			w = 0
		end
		weights[grade] = w
		total += w
	end
	local out: { [string]: number } = {}
	for _, grade in Grades.list do
		out[grade] = total > 0 and weights[grade] / total * 100 or 0
	end
	return out
end

function Drops.rollGrade(world: Zones.World, luck: number, rng: Random): string
	local chances = Drops.gradeChances(world, luck)
	local roll = rng:NextNumber() * 100
	local acc = 0
	for _, grade in Grades.list do
		acc += chances[grade]
		if roll < acc and chances[grade] > 0 then
			return grade
		end
	end
	return "Common"
end

function Drops.pickCard(grade: string, rng: Random): string?
	local bucket = Cards.byGrade[grade]
	if not bucket or #bucket == 0 then
		return nil
	end
	return bucket[rng:NextInteger(1, #bucket)].id
end

return Drops
