--!strict
-- Builds the static world in code: hub, worlds (zones), walls, gates.
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Zones = require(ReplicatedStorage.Shared.Zones)
local Format = require(ReplicatedStorage.Shared.Format)

local World = {}

World.hubSpawn = Vector3.new(0, 4, 0)
World.gatePrompts = {} :: { [number]: ProximityPrompt }

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

function World.build()
	local root = Instance.new("Folder")
	root.Name = "World"
	root.Parent = workspace

	-- hub
	local hub = newPart({
		Name = "HubFloor",
		Size = Vector3.new(160, 0.4, 110),
		Position = Vector3.new(0, 0.2, 5),
		Color = Color3.fromRGB(190, 185, 170),
		Material = Enum.Material.Cobblestone,
	}, root)
	local hubSign = newPart({
		Name = "HubSign",
		Size = Vector3.new(1, 1, 1),
		Position = Vector3.new(0, 14, 30),
		Transparency = 1,
		CanCollide = false,
	}, root)
	World.addSign(hubSign, "ANIME CARD MINE", UDim2.fromScale(40, 7), Vector3.zero, Color3.fromRGB(255, 220, 90))
	local northSign = newPart({ Name = "NorthSign", Size = Vector3.one, Position = Vector3.new(0, 9, -35), Transparency = 1, CanCollide = false }, root)
	World.addSign(northSign, "^ MINE ROCKS (north) ^", UDim2.fromScale(30, 4), Vector3.zero, Color3.fromRGB(150, 255, 170))
	local southSign = newPart({ Name = "SouthSign", Size = Vector3.one, Position = Vector3.new(0, 9, 55), Transparency = 1, CanCollide = false }, root)
	World.addSign(southSign, "v YOUR BASE (south) v", UDim2.fromScale(30, 4), Vector3.zero, Color3.fromRGB(150, 210, 255))
	hub.Name = "HubFloor"

	-- zones: floor + gate
	local zonesFolder = Instance.new("Folder")
	zonesFolder.Name = "Zones"
	zonesFolder.Parent = root
	for _, zone in Zones.list do
		local depth = zone.zMax - zone.zMin
		local centerZ = (zone.zMin + zone.zMax) / 2
		local floor = newPart({
			Name = "Floor_" .. zone.id,
			Size = Vector3.new(zone.xHalf * 2, 0.4, depth),
			Position = Vector3.new(0, 0.2, centerZ),
			Color = zone.floorColor,
			Material = Enum.Material.Grass,
		}, zonesFolder)
		floor.CanQuery = false -- clicks go through to rocks behind

		local title = newPart({ Name = "Title_" .. zone.id, Size = Vector3.one, Position = Vector3.new(0, 16, zone.zMax - 30), Transparency = 1, CanCollide = false }, zonesFolder)
		World.addSign(title, zone.name, UDim2.fromScale(46, 5), Vector3.zero, zone.accent)

		if zone.id >= 2 then
			local gate = newPart({
				Name = "Gate_" .. zone.id,
				Size = Vector3.new(zone.xHalf * 2 + 10, 40, 3),
				Position = Vector3.new(0, 20, zone.zMax),
				Color = zone.accent,
				Material = Enum.Material.Neon,
				Transparency = 0.35,
			}, zonesFolder)
			gate:SetAttribute("GateZone", zone.id)
			local gateSignPart = newPart({ Name = "GateSign", Size = Vector3.one, Position = Vector3.new(0, 26, zone.zMax), Transparency = 1, CanCollide = false }, zonesFolder)
			gateSignPart:SetAttribute("GateZone", zone.id)
			World.addSign(gateSignPart, "LOCKED - " .. zone.name, UDim2.fromScale(42, 5), Vector3.zero)

			local kiosk = newPart({
				Name = "GateKiosk_" .. zone.id,
				Size = Vector3.new(8, 4, 3),
				Position = Vector3.new(0, 2, zone.zMax + 10),
				Color = Color3.fromRGB(60, 60, 75),
				Material = Enum.Material.Metal,
			}, zonesFolder)
			kiosk:SetAttribute("GateZone", zone.id)
			World.addSign(kiosk, "Unlock " .. zone.name:match(":%s*(.+)$") :: string .. " - " .. Format.money(zone.gateCost), UDim2.fromScale(16, 3), Vector3.new(0, 4, 0), zone.accent)
			local prompt = Instance.new("ProximityPrompt")
			prompt.ObjectText = "World " .. zone.id
			prompt.ActionText = "Unlock (" .. Format.money(zone.gateCost) .. ")"
			prompt.HoldDuration = 0.4
			prompt.MaxActivationDistance = 14
			prompt.RequiresLineOfSight = false
			prompt:SetAttribute("GateZone", zone.id)
			prompt.Parent = kiosk
			World.gatePrompts[zone.id] = prompt
		end
	end

	-- boundary walls around the mining area
	local lastZone = Zones.list[#Zones.list]
	local wallZMax = Zones.list[1].zMax
	local wallLen = wallZMax - lastZone.zMin
	local wallColor = Color3.fromRGB(70, 70, 82)
	for _, side in { -1, 1 } do
		newPart({
			Name = "SideWall",
			Size = Vector3.new(4, 40, wallLen),
			Position = Vector3.new(side * (Zones.list[1].xHalf + 5), 20, (wallZMax + lastZone.zMin) / 2),
			Color = wallColor,
			Material = Enum.Material.Slate,
		}, root)
	end
	newPart({
		Name = "BackWall",
		Size = Vector3.new(Zones.list[1].xHalf * 2 + 14, 40, 4),
		Position = Vector3.new(0, 20, lastZone.zMin - 2),
		Color = wallColor,
		Material = Enum.Material.Slate,
	}, root)
end

return World
