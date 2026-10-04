--!strict
-- Worlds and stages. The map is one long corridor going north from the hub (z decreases).
-- A world = 3 stages. Every stage ends with a WALL; breaking it opens the next stage.
-- The last wall of a world opens the next world ("worlds unlock after completing the previous one").
export type RockType = {
	id: string,
	name: string,
	hp: number,
	reward: number, -- money for destroying (before multipliers)
	respawn: number, -- seconds
	size: number, -- studs
	color: Color3,
	material: Enum.Material,
	weight: number, -- relative count per stage
}

export type World = {
	id: number,
	name: string,
	tagline: string,
	firstStage: number,
	lastStage: number,
	gradeWeights: { [string]: number }, -- relative weights per grade for card drops (before luck)
	floorColor: Color3,
	accent: Color3,
}

export type Stage = {
	id: number,
	world: number,
	indexInWorld: number, -- 1..STAGES_PER_WORLD
	zMin: number, -- north end (the wall stands here)
	zMax: number, -- south end (entrance)
	xHalf: number,
	rockCount: number,
	rocks: { RockType }, -- already scaled for this stage
	wallHp: number,
	wallReward: number,
}

local STAGES_PER_WORLD = 3
local STAGE_DEPTH = 100
local FIRST_Z = -50 -- the first stage starts here (hub edge)
local STAGE_SCALE = { 1, 1.8, 3.2 } -- HP and reward growth inside a world
local WALL_HP_FACTOR = 200 -- wall HP = factor * HP of the toughest rock of the stage
local WALL_REWARD_FACTOR = 15 -- wall reward = factor * reward of the toughest rock

local function rock(id: string, name: string, hp: number, reward: number, respawn: number, size: number, color: Color3, mat: Enum.Material, weight: number): RockType
	return { id = id, name = name, hp = hp, reward = reward, respawn = respawn, size = size, color = color, material = mat, weight = weight }
end

local Zones = {}

Zones.STAGES_PER_WORLD = STAGES_PER_WORLD
Zones.STAGE_DEPTH = STAGE_DEPTH

Zones.worlds = {
	{
		id = 1,
		name = "World 1: Meadow Quarry",
		tagline = "Soft rocks. A good place to start.",
		firstStage = 1,
		lastStage = 3,
		gradeWeights = { Common = 80, Rare = 17.5, Epic = 2.4, Legendary = 0.1, Mythic = 0, Secret = 0 },
		floorColor = Color3.fromRGB(96, 168, 90),
		accent = Color3.fromRGB(120, 220, 120),
	},
	{
		id = 2,
		name = "World 2: Crystal Desert",
		tagline = "Hard rocks and better cards.",
		firstStage = 4,
		lastStage = 6,
		gradeWeights = { Common = 50, Rare = 35, Epic = 12, Legendary = 2.8, Mythic = 0.2, Secret = 0 },
		floorColor = Color3.fromRGB(222, 190, 120),
		accent = Color3.fromRGB(255, 210, 110),
	},
	{
		id = 3,
		name = "World 3: Void Volcano",
		tagline = "Tough rocks. Mythic and Secret cards can drop here.",
		firstStage = 7,
		lastStage = 9,
		gradeWeights = { Common = 25, Rare = 38, Epic = 28, Legendary = 8, Mythic = 0.95, Secret = 0.05 },
		floorColor = Color3.fromRGB(70, 55, 85),
		accent = Color3.fromRGB(200, 120, 255),
	},
} :: { World }

-- base rocks per world (stage scaling is applied below)
local worldRocks: { { RockType } } = {
	{
		rock("pebble", "Pebble", 10, 2, 5, 4, Color3.fromRGB(160, 160, 165), Enum.Material.Slate, 4),
		rock("stone", "Stone", 25, 5, 8, 6, Color3.fromRGB(120, 130, 140), Enum.Material.Slate, 3),
		rock("boulder", "Boulder", 60, 12, 12, 9, Color3.fromRGB(95, 105, 120), Enum.Material.Granite, 2),
	},
	{
		rock("granite", "Granite", 250, 75, 8, 6, Color3.fromRGB(190, 120, 80), Enum.Material.Granite, 4),
		rock("iron", "Iron Ore", 600, 180, 11, 8, Color3.fromRGB(110, 95, 100), Enum.Material.CorrodedMetal, 3),
		rock("crystal", "Crystal", 1400, 420, 15, 10, Color3.fromRGB(120, 210, 255), Enum.Material.Glass, 2),
	},
	{
		rock("obsidian", "Obsidian", 6000, 1800, 10, 7, Color3.fromRGB(40, 35, 55), Enum.Material.Basalt, 4),
		rock("ruby", "Ruby Core", 15000, 4500, 14, 9, Color3.fromRGB(220, 40, 70), Enum.Material.Glass, 3),
		rock("voidstone", "Voidstone", 36000, 10800, 18, 12, Color3.fromRGB(110, 40, 190), Enum.Material.Neon, 2),
	},
}

Zones.stages = {} :: { Stage }

for _, world in Zones.worlds do
	for i = 1, STAGES_PER_WORLD do
		local id = world.firstStage + i - 1
		local scale = STAGE_SCALE[i]
		local scaled: { RockType } = {}
		local maxHp, maxReward = 0, 0
		for _, base in worldRocks[world.id] do
			local r: RockType = table.clone(base)
			r.hp = math.floor(base.hp * scale)
			r.reward = math.floor(base.reward * scale)
			maxHp = math.max(maxHp, r.hp)
			maxReward = math.max(maxReward, r.reward)
			table.insert(scaled, r)
		end
		local zMax = FIRST_Z - (id - 1) * STAGE_DEPTH
		Zones.stages[id] = {
			id = id,
			world = world.id,
			indexInWorld = i,
			zMin = zMax - STAGE_DEPTH,
			zMax = zMax,
			xHalf = 120,
			rockCount = 8,
			rocks = scaled,
			wallHp = maxHp * WALL_HP_FACTOR,
			wallReward = maxReward * WALL_REWARD_FACTOR,
		}
	end
end

Zones.stageCount = #Zones.stages

function Zones.getWorld(id: number): World?
	return Zones.worlds[id]
end

function Zones.getStage(id: number): Stage?
	return Zones.stages[id]
end

-- Which stage a z coordinate lies in: 1..stageCount, stageCount + 1 = behind the last wall, nil = hub / bases.
function Zones.stageAtZ(z: number): number?
	if z > FIRST_Z then
		return nil
	end
	local lastWallZ = Zones.stages[Zones.stageCount].zMin
	if z <= lastWallZ then
		return Zones.stageCount + 1
	end
	for _, st in Zones.stages do
		if z <= st.zMax and z > st.zMin then
			return st.id
		end
	end
	return nil
end

function Zones.worldOfStage(stageId: number): World
	return Zones.worlds[Zones.stages[math.clamp(stageId, 1, Zones.stageCount)].world]
end

-- The world is open if the previous world was completed (stage = walls broken).
function Zones.isWorldUnlocked(worldId: number, stage: number): boolean
	local world = Zones.worlds[worldId]
	return stage >= world.firstStage - 1
end

function Zones.spawnPosition(stageId: number): Vector3
	local st = Zones.stages[math.clamp(stageId, 1, Zones.stageCount)]
	return Vector3.new(0, 4, st.zMax - 12)
end

return Zones
