--!strict
-- Builds the static world in code: hub, VIP lounge, stages with walls.
-- Wall collision per player is switched on the client (WorldClient); the server also guards (ProgressService).
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Zones = require(ReplicatedStorage.Shared.Zones)

local World = {}

World.hubSpawn = Vector3.new(0, 4, 0)
World.walls = {} :: { [number]: Part } -- stage id -> wall that closes the END of that stage

local function newPart(props: { [string]: any }, parent: Instance): Part
	local p = Instance.new("Part")
	p.Anchored = true
	p.TopSurface = Enum.SurfaceType.Smooth
	p.BottomSurface = Enum.SurfaceType.Smooth
	p.Locked = true
	for k, v in props do
		(p :: any)[k] = v
	end
	p.Parent = parent
	return p
end

function World.addSign(part: BasePart, text: string, size: UDim2, offset: Vector3, color: Color3?)
	local gui = Instance.new("BillboardGui")
	gui.Name = "Sign"
	gui.Adornee = part
	gui.Size = size
	gui.StudsOffset = offset
	gui.AlwaysOnTop = false
	gui.MaxDistance = 220
	gui.LightInfluence = 0
	gui.Parent = part
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.FredokaOne
	label.Text = text
	label.TextScaled = true
	label.TextColor3 = color or Color3.fromRGB(255, 255, 255)
	label.TextStrokeTransparency = 0.3
	label.Parent = gui
end

local function signAnchor(parent: Instance, name: string, position: Vector3): Part
	return newPart({ Name = name, Size = Vector3.one, Position = position, Transparency = 1, CanCollide = false, CanQuery = false }, parent)
end

local function buildVipLounge(root: Instance)
	local cx, cz = 118, 5
	local color = Color3.fromRGB(255, 205, 80)
	newPart({ Name = "VipFloor", Size = Vector3.new(36, 0.6, 36), Position = Vector3.new(cx, 0.3, cz), Color = Color3.fromRGB(70, 40, 100), Material = Enum.Material.Marble }, root)
	-- walls: back, two sides, and a front wall with a doorway closed by VipDoor
	newPart({ Name = "VipWall", Size = Vector3.new(36, 14, 1), Position = Vector3.new(cx, 7, cz + 18), Color = color, Material = Enum.Material.Metal }, root)
	newPart({ Name = "VipWall", Size = Vector3.new(1, 14, 36), Position = Vector3.new(cx + 18, 7, cz), Color = color, Material = Enum.Material.Metal }, root)
	newPart({ Name = "VipWall", Size = Vector3.new(1, 14, 36), Position = Vector3.new(cx - 18, 7, cz), Color = color, Material = Enum.Material.Metal }, root)
	newPart({ Name = "VipWall", Size = Vector3.new(14, 14, 1), Position = Vector3.new(cx - 11, 7, cz - 18), Color = color, Material = Enum.Material.Metal }, root)
	newPart({ Name = "VipWall", Size = Vector3.new(14, 14, 1), Position = Vector3.new(cx + 11, 7, cz - 18), Color = color, Material = Enum.Material.Metal }, root)
	newPart({ Name = "VipWall", Size = Vector3.new(8, 4, 1), Position = Vector3.new(cx, 12, cz - 18), Color = color, Material = Enum.Material.Metal }, root)
	local door = newPart({
		Name = "VipDoor",
		Size = Vector3.new(8, 10, 1),
		Position = Vector3.new(cx, 5, cz - 18),
		Color = Color3.fromRGB(255, 230, 120),
		Material = Enum.Material.Neon,
		Transparency = 0.3,
	}, root)
	door:SetAttribute("VipDoor", true)
	World.addSign(door, "VIP ONLY", UDim2.fromScale(10, 2.4), Vector3.new(0, 7, 0), color)
	local title = signAnchor(root, "VipSign", Vector3.new(cx, 17, cz))
	World.addSign(title, "VIP LOUNGE", UDim2.fromScale(26, 5), Vector3.zero, color)
end

function World.build()
	local root = Instance.new("Folder")
	root.Name = "World"
	root.Parent = workspace

	-- hub
	newPart({
		Name = "HubFloor",
		Size = Vector3.new(160, 0.4, 110),
		Position = Vector3.new(0, 0.2, 5),
		Color = Color3.fromRGB(190, 185, 170),
		Material = Enum.Material.Cobblestone,
	}, root)
	World.addSign(signAnchor(root, "HubSign", Vector3.new(0, 14, 30)), "ANIME CARD MINE", UDim2.fromScale(40, 7), Vector3.zero, Color3.fromRGB(255, 220, 90))
	World.addSign(signAnchor(root, "NorthSign", Vector3.new(0, 9, -35)), "^ SWING YOUR SWORD (north) ^", UDim2.fromScale(34, 4), Vector3.zero, Color3.fromRGB(150, 255, 170))
	World.addSign(signAnchor(root, "SouthSign", Vector3.new(0, 9, 55)), "v YOUR BASE (south) v", UDim2.fromScale(30, 4), Vector3.zero, Color3.fromRGB(150, 210, 255))
	buildVipLounge(root)

	-- stages
	local stagesFolder = Instance.new("Folder")
	stagesFolder.Name = "Stages"
	stagesFolder.Parent = root
	local lastStage = Zones.stages[Zones.stageCount]
	for _, stage in Zones.stages do
		local world = Zones.worlds[stage.world]
		local depth = stage.zMax - stage.zMin
		local centerZ = (stage.zMin + stage.zMax) / 2
		local floor = newPart({
			Name = "Floor_" .. stage.id,
			Size = Vector3.new(stage.xHalf * 2, 0.4, depth),
			Position = Vector3.new(0, 0.2, centerZ),
			Color = world.floorColor:Lerp(Color3.new(0, 0, 0), (stage.indexInWorld - 1) * 0.08),
			Material = Enum.Material.Grass,
		}, stagesFolder)
		floor.CanQuery = false -- clicks go through to what is behind

		local title = if stage.indexInWorld == 1 then world.name else string.format("%s - Stage %d", world.name:match(":%s*(.+)$") or world.name, stage.id)
		World.addSign(signAnchor(stagesFolder, "Title_" .. stage.id, Vector3.new(0, 16, stage.zMax - 22)), title, UDim2.fromScale(46, 5), Vector3.zero, world.accent)
		if stage.indexInWorld == 1 then
			World.addSign(signAnchor(stagesFolder, "Sub_" .. stage.id, Vector3.new(0, 11, stage.zMax - 22)), world.tagline, UDim2.fromScale(40, 3), Vector3.zero, Color3.fromRGB(255, 255, 255))
		end

		-- the wall at the north end
		local wall = newPart({
			Name = "Wall_" .. stage.id,
			Size = Vector3.new(stage.xHalf * 2 + 10, 26, 4),
			Position = Vector3.new(0, 13, stage.zMin),
			Color = world.accent:Lerp(Color3.fromRGB(90, 70, 60), 0.5),
			Material = Enum.Material.Brick,
		}, stagesFolder)
		wall:SetAttribute("WallStage", stage.id)
		wall:SetAttribute("WallHp", stage.wallHp)
		local lastOfWorld = stage.id == world.lastStage
		local signText = if stage.id == Zones.stageCount then "FINAL WALL - break it!" elseif lastOfWorld then string.format("WALL %d - breaks open World %d", stage.id, world.id + 1) else string.format("WALL %d - break it to continue", stage.id)
		World.addSign(wall, signText, UDim2.fromScale(44, 5), Vector3.new(0, 16, 6), Color3.fromRGB(255, 240, 200))
		World.walls[stage.id] = wall
	end

	-- behind the last wall
	World.addSign(signAnchor(root, "SoonSign", Vector3.new(0, 14, lastStage.zMin - 30)), "More worlds coming soon!", UDim2.fromScale(40, 6), Vector3.zero, Color3.fromRGB(255, 220, 90))
	newPart({
		Name = "EndFloor",
		Size = Vector3.new(lastStage.xHalf * 2, 0.4, 60),
		Position = Vector3.new(0, 0.2, lastStage.zMin - 30),
		Color = Color3.fromRGB(60, 60, 75),
		Material = Enum.Material.Slate,
	}, root).CanQuery = false

	-- boundary walls around the whole mining corridor
	local wallColor = Color3.fromRGB(70, 70, 82)
	local zNorth = lastStage.zMin - 60
	local zSouth = Zones.stages[1].zMax
	for _, side in { -1, 1 } do
		newPart({
			Name = "SideWall",
			Size = Vector3.new(4, 40, zSouth - zNorth),
			Position = Vector3.new(side * (lastStage.xHalf + 5), 20, (zSouth + zNorth) / 2),
			Color = wallColor,
			Material = Enum.Material.Slate,
		}, root)
	end
	newPart({
		Name = "BackWall",
		Size = Vector3.new(lastStage.xHalf * 2 + 14, 40, 4),
		Position = Vector3.new(0, 20, zNorth - 2),
		Color = wallColor,
		Material = Enum.Material.Slate,
	}, root)
end

return World
