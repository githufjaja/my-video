--!strict
-- Draws YOUR card drops (client-only objects: nobody else can see them) and reports touches to the server.
-- The server decides the card, checks the distance and gives the card.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Config = require(ReplicatedStorage.Shared.Config)
local Cards = require(ReplicatedStorage.Shared.Cards)
local Grades = require(ReplicatedStorage.Shared.Grades)
local CardView = require(ReplicatedStorage.Shared.CardView)
local Effects = require(script.Parent.Effects)

local DropClient = {}

type Visual = {
	root: Part,
	baseY: number,
	expires: number,
	sentAt: number,
	cardId: string,
}

local visuals: { [number]: Visual } = {}

local function remove(id: number)
	local v = visuals[id]
	if v then
		v.root:Destroy()
		visuals[id] = nil
	end
end

local function create(id: number, cardId: string, position: Vector3, lifetime: number)
	local def = Cards.byId[cardId]
	if not def then
		return
	end
	local grade = Grades.info[def.grade]
	local folder = workspace:FindFirstChild("ClientFX")
	if not folder then
		return
	end

	local root = Instance.new("Part")
	root.Name = "CardDrop_" .. id
	root.Anchored = true
	root.CanCollide = false
	root.CanQuery = false
	root.CanTouch = false
	root.Transparency = 1
	root.Size = Vector3.one
	root.Position = position
	root.Parent = folder

	-- light beam in the grade color
	local beam = Instance.new("Part")
	beam.Name = "Beam"
	beam.Anchored = true
	beam.CanCollide = false
	beam.CanQuery = false
	beam.CanTouch = false
	beam.Material = Enum.Material.Neon
	beam.Color = grade.color
	beam.Transparency = 0.5
	beam.Size = Vector3.new(1.4, 90, 1.4)
	beam.Position = position + Vector3.new(0, 44, 0)
	beam.Parent = root

	-- floating card
	local gui = Instance.new("BillboardGui")
	gui.Adornee = root
	gui.Size = UDim2.fromScale(3.2, 4.3)
	gui.StudsOffset = Vector3.new(0, 2.5, 0)
	gui.AlwaysOnTop = true
	gui.LightInfluence = 0
	gui.Parent = root
	CardView.create(cardId, { hideIncome = true }).Parent = gui

	visuals[id] = { root = root, baseY = position.Y, expires = os.clock() + lifetime, sentAt = 0, cardId = cardId }
end

function DropClient.start()
	local player = Players.LocalPlayer
	Remotes.get("DropSpawn").OnClientEvent:Connect(function(id: number, cardId: string, position: Vector3, lifetime: number)
		create(id, cardId, position, lifetime)
		Effects.toast("A card dropped nearby! Run to the light beam.", "good")
	end)
	Remotes.get("DropGone").OnClientEvent:Connect(function(id: number)
		remove(id)
	end)

	RunService.Heartbeat:Connect(function()
		local now = os.clock()
		local char = player.Character
		local hrp = char and char:FindFirstChild("HumanoidRootPart")
		for id, v in visuals do
			if now > v.expires then
				remove(id)
			else
				-- gentle bobbing
				v.root.Position = Vector3.new(v.root.Position.X, v.baseY + math.sin(now * 3) * 0.5, v.root.Position.Z)
				if hrp and hrp:IsA("BasePart") and now - v.sentAt > 1.5 then
					local flat = (hrp.Position - v.root.Position) * Vector3.new(1, 0.5, 1)
					if flat.Magnitude <= Config.DROP_PICKUP_RADIUS then
						v.sentAt = now
						Remotes.get("PickupDrop"):FireServer(id)
					end
				end
			end
		end
	end)
end

return DropClient
