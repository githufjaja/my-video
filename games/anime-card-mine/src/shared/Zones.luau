--!strict
-- Worlds (zones). The zone with id N lies north of the hub; the gate to world N is on its south edge.
export type RockType = {
	id: string,
	name: string,
	hp: number,
	reward: number, -- money for destroying (before multipliers)
	cardChance: number, -- 0..1, chance of a card roll per destroyed rock
	respawn: number, -- seconds
	size: number, -- studs
	color: Color3,
	material: Enum.Material,
	weight: number, -- how many of this rock type per zone (relative)
}

export type Zone = {
	id: number,
	name: string,
	tagline: string,
	gateCost: number,
	zMin: number,
	zMax: number,
	xHalf: number,
	rockCount: number,
	rocks: { RockType },
	gradeWeights: { [string]: number }, -- relative weights per grade (base, before luck)
	floorColor: Color3,
	accent: Color3,
}

local function rock(id: string, name: string, hp: number, reward: number, chance: number, respawn: number, size: number, color: Color3, mat: Enum.Material, weight: number): RockType
	return { id = id, name = name, hp = hp, reward = reward, cardChance = chance, respawn = respawn, size = size, color = color, material = mat, weight = weight }
end

local Zones = {}

Zones.list = {
	{
		id = 1,
		name = "World 1: Meadow Quarry",
		tagline = "Soft rocks. A good place to start.",
		gateCost = 0,
		zMin = -250,
		zMax = -50,
		xHalf = 120,
		rockCount = 14,
		rocks = {
			rock("pebble", "Pebble", 10, 2, 0.30, 5, 4, Color3.fromRGB(160, 160, 165), Enum.Material.Slate, 6),
			rock("stone", "Stone", 25, 5, 0.40, 8, 6, Color3.fromRGB(120, 130, 140), Enum.Material.Slate, 5),
			rock("boulder", "Boulder", 60, 12, 0.55, 12, 9, Color3.fromRGB(95, 105, 120), Enum.Material.Granite, 3),
		},
		gradeWeights = { Common = 80, Rare = 17.5, Epic = 2.4, Legendary = 0.1, Mythic = 0, Secret = 0 },
		floorColor = Color3.fromRGB(96, 168, 90),
		accent = Color3.fromRGB(120, 220, 120),
	},
	{
		id = 2,
		name = "World 2: Crystal Desert",
		tagline = "Hard rocks and better cards.",
		gateCost = 2500,
		zMin = -450,
		zMax = -250,
		xHalf = 120,
		rockCount = 14,
		rocks = {
			rock("granite", "Granite", 150, 40, 0.35, 8, 6, Color3.fromRGB(190, 120, 80), Enum.Material.Granite, 6),
			rock("iron", "Iron Ore", 400, 110, 0.45, 11, 8, Color3.fromRGB(110, 95, 100), Enum.Material.CorrodedMetal, 5),
			rock("crystal", "Crystal", 900, 260, 0.60, 15, 10, Color3.fromRGB(120, 210, 255), Enum.Material.Glass, 3),
		},
		gradeWeights = { Common = 50, Rare = 35, Epic = 12, Legendary = 2.8, Mythic = 0.2, Secret = 0 },
		floorColor = Color3.fromRGB(222, 190, 120),
		accent = Color3.fromRGB(255, 210, 110),
	},
	{
		id = 3,
		name = "World 3: Void Volcano",
		tagline = "Tough rocks. Mythic and Secret cards can drop here.",
		gateCost = 75000,
		zMin = -650,
		zMax = -450,
		xHalf = 120,
		rockCount = 14,
		rocks = {
			rock("obsidian", "Obsidian", 3000, 900, 0.40, 10, 7, Color3.fromRGB(40, 35, 55), Enum.Material.Basalt, 6),
			rock("ruby", "Ruby Core", 8000, 2600, 0.50, 14, 9, Color3.fromRGB(220, 40, 70), Enum.Material.Glass, 5),
			rock("voidstone", "Voidstone", 20000, 7000, 0.65, 18, 12, Color3.fromRGB(110, 40, 190), Enum.Material.Neon, 3),
		},
		gradeWeights = { Common = 25, Rare = 38, Epic = 28, Legendary = 8, Mythic = 0.95, Secret = 0.05 },
		floorColor = Color3.fromRGB(70, 55, 85),
		accent = Color3.fromRGB(200, 120, 255),
	},
} :: { Zone }

function Zones.get(id: number): Zone?
	return Zones.list[id]
end

function Zones.zoneAtZ(z: number): number? -- which zone a z coordinate lies in (nil = hub/bases)
	for _, zone in Zones.list do
		if z <= zone.zMax and z > zone.zMin then
			return zone.id
		end
	end
	return nil
end

function Zones.spawnPosition(id: number): Vector3
	local zone = Zones.list[id]
	return Vector3.new(0, 4, zone.zMax - 16)
end

return Zones
