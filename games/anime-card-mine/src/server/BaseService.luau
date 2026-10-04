--!strict
-- Player bases: each player gets a plot with pedestals. Placed cards are shown over the pedestals.
-- Only visuals live here; the card/slot rules are in CardService / ProgressService.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Cards = require(ReplicatedStorage.Shared.Cards)
local Grades = require(ReplicatedStorage.Shared.Grades)
local CardView = require(ReplicatedStorage.Shared.CardView)
local Formulas = require(ReplicatedStorage.Shared.Formulas)
local Format = require(ReplicatedStorage.Shared.Format)
local DataService = require(script.Parent.DataService)
local Economy = require(script.Parent.Economy)
local World = require(script.Parent.World)

type SlotVisual = {
	part: Part,
	prompt: ProximityPrompt,
	infoGui: BillboardGui,
	infoLabel: TextLabel,
	cardGui: BillboardGui?,
	shownCard: string?,
	state: string, -- "hidden" | "empty" | "occupied" | "buy" | "locked"
}

type Plot = {
	index: number,
	model: Model,
	floor: Part,
	center: Vector3,
	owner: Player?,
	slots: { SlotVisual },
	signLabel: TextLabel,
}

local BaseService = {}

-- Set by CardService / ProgressService (avoids circular requires).
BaseService.takeHandler = nil :: ((Player, number) -> ())?
BaseService.buyHandler = nil :: ((Player) -> ())?

local plots: { Plot } = {}
local plotOf: { [Player]: Plot } = {}

local COLS, ROWS, SPACING = 7, 3, 8
local FLOOR_Y = 0.5

local function slotOffset(i: number): Vector3
	local col = (i - 1) % COLS
	local row = math.floor((i - 1) / COLS)
	return Vector3.new((col - (COLS - 1) / 2) * SPACING, 0, (row - (ROWS - 1) / 2) * SPACING)
end

local function makeInfoGui(part: Part): (BillboardGui, TextLabel)
	local gui = Instance.new("BillboardGui")
	gui.Name = "Info"
	gui.Adornee = part
	gui.Size = UDim2.fromScale(5, 1.8)
	gui.StudsOffset = Vector3.new(0, 1.8, 0)
	gui.LightInfluence = 0
	gui.MaxDistance = 60
	gui.Parent = part
	local label = Instance.new("TextLabel")
	label.Size = UDim2.fromScale(1, 1)
	label.BackgroundTransparency = 1
	label.Font = Enum.Font.FredokaOne
	label.TextScaled = true
	label.TextColor3 = Color3.fromRGB(255, 255, 255)
	label.TextStrokeTransparency = 0.4
	label.Text = ""
	label.Parent = gui
	return gui, label
end

local function buildPlot(index: number): Plot
	local col = (index - 1) % 4
	local row = math.floor((index - 1) / 4)
	local center = Vector3.new(-105 + col * 70, 0, 100 + row * 50)

	local model = Instance.new("Model")
	model.Name = "Plot_" .. index
	model:SetAttribute("OwnerId", 0)

	local floor = Instance.new("Part")
	floor.Name = "Floor"
	floor.Anchored = true
	floor.Locked = true
	floor.Size = Vector3.new(62, 1, 40)
	floor.Position = Vector3.new(center.X, FLOOR_Y / 2 + 0.25, center.Z)
	floor.Color = Color3.fromRGB(110, 120, 150)
	floor.Material = Enum.Material.SmoothPlastic
	floor.Parent = model

	local signPart = Instance.new("Part")
	signPart.Name = "SignAnchor"
	signPart.Anchored = true
	signPart.CanCollide = false
	signPart.Transparency = 1
	signPart.Size = Vector3.one
	signPart.Position = Vector3.new(center.X, 7, center.Z - 20)
	signPart.Parent = model
	World.addSign(signPart, "Free base", UDim2.fromScale(22, 4), Vector3.zero, Color3.fromRGB(180, 200, 255))
	local signGui = signPart:FindFirstChild("Sign") :: BillboardGui
	local signLabel = signGui:FindFirstChildOfClass("TextLabel") :: TextLabel

	local plot: Plot = { index = index, model = model, floor = floor, center = center, owner = nil, slots = {}, signLabel = signLabel }

	for i = 1, Config.PLOT_MAX_SLOTS do
		local part = Instance.new("Part")
		part.Name = "Pedestal_" .. i
		part.Anchored = true
		part.Locked = true
		part.Size = Vector3.new(5, 1.2, 5)
		part.Position = Vector3.new(center.X, FLOOR_Y + 0.85, center.Z) + slotOffset(i)
		part.Material = Enum.Material.SmoothPlastic
		part.Transparency = 1
		part.CanCollide = false
		part.Parent = model

		local prompt = Instance.new("ProximityPrompt")
		prompt.MaxActivationDistance = 9
		prompt.HoldDuration = 0.25
		prompt.RequiresLineOfSight = false
		prompt.Enabled = false
		prompt.Parent = part

		local infoGui, infoLabel = makeInfoGui(part)
		infoGui.Enabled = false

		local visual: SlotVisual = {
			part = part,
			prompt = prompt,
			infoGui = infoGui,
			infoLabel = infoLabel,
			cardGui = nil,
			shownCard = nil,
			state = "hidden",
		}
		plot.slots[i] = visual

		prompt.Triggered:Connect(function(player: Player)
			if plot.owner ~= player then
				return
			end
			if visual.state == "occupied" and BaseService.takeHandler then
				BaseService.takeHandler(player, i)
			elseif visual.state == "buy" and BaseService.buyHandler then
				BaseService.buyHandler(player)
			end
		end)
	end

	model.Parent = workspace:FindFirstChild("Plots")
	return plot
end

local function clearCard(visual: SlotVisual)
	if visual.cardGui then
		visual.cardGui:Destroy()
		visual.cardGui = nil
	end
	visual.shownCard = nil
end

local function showCard(visual: SlotVisual, cardId: string)
	if visual.shownCard == cardId and visual.cardGui then
		return
	end
	clearCard(visual)
	local gui = Instance.new("BillboardGui")
	gui.Name = "CardGui"
	gui.Adornee = visual.part
	gui.Size = UDim2.fromScale(4, 5.4)
	gui.StudsOffset = Vector3.new(0, 4.4, 0)
	gui.LightInfluence = 0
	gui.MaxDistance = 110
	gui.Parent = visual.part
	CardView.create(cardId).Parent = gui
	visual.cardGui = gui
	visual.shownCard = cardId
end

local function setState(visual: SlotVisual, state: string, text: string?, prompt: { action: string, object: string }?)
	visual.state = state
	local part = visual.part
	if state == "hidden" then
		part.Transparency = 1
		visual.infoGui.Enabled = false
		visual.prompt.Enabled = false
		clearCard(visual)
		return
	end
	part.Transparency = 0
	if state == "locked" or state == "buy" then
		part.Color = Color3.fromRGB(55, 55, 68)
		part.Transparency = 0.25
	elseif state == "empty" then
		part.Color = Color3.fromRGB(215, 215, 230)
	end
	visual.infoGui.Enabled = text ~= nil
	visual.infoLabel.Text = text or ""
	if state ~= "occupied" then
		clearCard(visual)
	end
	if prompt then
		visual.prompt.ActionText = prompt.action
		visual.prompt.ObjectText = prompt.object
		visual.prompt.Enabled = true
	else
		visual.prompt.Enabled = false
	end
end

function BaseService.refresh(player: Player)
	local plot = plotOf[player]
	local session = DataService.get(player)
	if not plot or not session then
		return
	end
	local total = Economy.totalSlots(session)
	local buyCost = Formulas.slotCost(session.profile.slots)
	for i, visual in plot.slots do
		local cardId = session.profile.placed[tostring(i)]
		if i <= total then
			if cardId and Cards.byId[cardId] then
				local def = Cards.byId[cardId]
				setState(visual, "occupied", nil, { action = "Take card", object = def.name })
				visual.part.Color = Grades.info[def.grade].color
				showCard(visual, cardId)
			else
				setState(visual, "empty", "Slot " .. i, nil)
			end
		elseif i == total + 1 and buyCost then
			setState(visual, "buy", "LOCKED  " .. Format.money(buyCost), { action = "Buy slot (" .. Format.money(buyCost) .. ")", object = "Base slot" })
		else
			setState(visual, "locked", "LOCKED", nil)
		end
	end
end

local function assign(player: Player)
	for _, plot in plots do
		if not plot.owner then
			plot.owner = player
			plotOf[player] = plot
			plot.model:SetAttribute("OwnerId", player.UserId)
			plot.signLabel.Text = player.DisplayName .. "'s Base"
			plot.floor.Color = Color3.fromRGB(120, 150, 210)
			BaseService.refresh(player)
			return
		end
	end
	warn("[BaseService] no free plot for", player.Name)
end

local function release(player: Player)
	local plot = plotOf[player]
	if not plot then
		return
	end
	plotOf[player] = nil
	plot.owner = nil
	plot.model:SetAttribute("OwnerId", 0)
	plot.signLabel.Text = "Free base"
	plot.floor.Color = Color3.fromRGB(110, 120, 150)
	for _, visual in plot.slots do
		setState(visual, "hidden", nil, nil)
	end
end

-- Teleports the player in front of their base. Returns false if there is no base.
function BaseService.teleportHome(player: Player): boolean
	local plot = plotOf[player]
	local char = player.Character
	local hrp = char and char:FindFirstChild("HumanoidRootPart") :: BasePart?
	if not plot or not hrp then
		return false
	end
	hrp.CFrame = CFrame.new(plot.center + Vector3.new(0, 4, -14))
	return true
end

function BaseService.init()
	local folder = Instance.new("Folder")
	folder.Name = "Plots"
	folder.Parent = workspace
	for i = 1, Config.PLOT_COUNT do
		table.insert(plots, buildPlot(i))
	end
	DataService.onLoaded(function(session)
		assign(session.player)
	end)
	DataService.onLeaving(function(session)
		release(session.player)
	end)
	Players.PlayerRemoving:Connect(function(player)
		release(player)
	end)
end

return BaseService
