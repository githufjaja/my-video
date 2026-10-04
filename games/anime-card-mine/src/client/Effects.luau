--!strict
-- Floating damage numbers, rock hit flash, toasts (messages and "new card" pop-ups).
local Debris = game:GetService("Debris")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local Cards = require(ReplicatedStorage.Shared.Cards)
local Grades = require(ReplicatedStorage.Shared.Grades)
local CardView = require(ReplicatedStorage.Shared.CardView)
local Format = require(ReplicatedStorage.Shared.Format)
local Ui = require(script.Parent.Ui)

local Effects = {}

local fxFolder: Folder
local toastHolder: Frame
local highlight: Highlight

function Effects.init(gui: ScreenGui)
	fxFolder = Instance.new("Folder")
	fxFolder.Name = "ClientFX"
	fxFolder.Parent = workspace

	highlight = Instance.new("Highlight")
	highlight.FillColor = Color3.fromRGB(255, 255, 255)
	highlight.FillTransparency = 0.55
	highlight.OutlineTransparency = 1
	highlight.Enabled = false
	highlight.Parent = fxFolder

	toastHolder = Ui.create("Frame", {
		Name = "Toasts",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 84),
		Size = UDim2.fromOffset(340, 300),
		BackgroundTransparency = 1,
	}, gui)
	Ui.create("UIListLayout", {
		Padding = UDim.new(0, 6),
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, toastHolder)
end

local function nearestRock(position: Vector3): Model?
	local rocks = workspace:FindFirstChild("Rocks")
	if not rocks then
		return nil
	end
	local best, bestD = nil :: Model?, 14
	for _, m in rocks:GetChildren() do
		if m:IsA("Model") and m.PrimaryPart then
			local d = (m.PrimaryPart.Position - position).Magnitude
			if d < bestD then
				best, bestD = m, d
			end
		end
	end
	return best
end

local flashToken = 0
local function flash(rock: Model)
	flashToken += 1
	local mine = flashToken
	highlight.Adornee = rock
	highlight.Enabled = true
	task.delay(0.08, function()
		if flashToken == mine then
			highlight.Enabled = false
		end
	end)
end

-- kind: "dmg" (white number) or "money" (gold +$ on rock destruction)
function Effects.damageNumber(kind: string, position: Vector3, amount: number)
	if kind == "dmg" then
		local rock = nearestRock(position)
		if rock then
			flash(rock)
		end
	end
	local anchor = Instance.new("Part")
	anchor.Anchored = true
	anchor.CanCollide = false
	anchor.CanQuery = false
	anchor.CanTouch = false
	anchor.Transparency = 1
	anchor.Size = Vector3.one * 0.2
	anchor.Position = position
	anchor.Parent = fxFolder

	local isMoney = kind == "money"
	local gui = Instance.new("BillboardGui")
	gui.Adornee = anchor
	gui.AlwaysOnTop = true
	gui.Size = if isMoney then UDim2.fromOffset(170, 54) else UDim2.fromOffset(120, 40)
	gui.Parent = anchor
	local label = Ui.label(gui, {
		Size = UDim2.fromScale(1, 1),
		Text = if isMoney then "+" .. Format.money(amount) else "-" .. Format.number(amount),
		TextColor3 = if isMoney then Color3.fromRGB(255, 215, 70) else Color3.fromRGB(255, 255, 255),
		TextStrokeTransparency = 0.2,
		TextStrokeColor3 = if isMoney then Color3.fromRGB(110, 70, 0) else Color3.fromRGB(150, 30, 30),
	})
	local info = TweenInfo.new(0.8, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
	TweenService:Create(anchor, info, { Position = position + Vector3.new(0, if isMoney then 5 else 3.5, 0) }):Play()
	TweenService:Create(label, TweenInfo.new(0.8, Enum.EasingStyle.Linear), { TextTransparency = 1, TextStrokeTransparency = 1 }):Play()
	Debris:AddItem(anchor, 0.9)
end

local order = 0
local function pushToast(frame: Frame, seconds: number)
	order += 1
	frame.LayoutOrder = order
	frame.Parent = toastHolder
	local kids = toastHolder:GetChildren()
	local count = 0
	for _, k in kids do
		if k:IsA("Frame") then
			count += 1
		end
	end
	if count > 4 then
		for _, k in kids do
			if k:IsA("Frame") then
				k:Destroy()
				break
			end
		end
	end
	task.delay(seconds, function()
		if frame.Parent then
			frame:Destroy()
		end
	end)
end

function Effects.toast(text: string, level: string?)
	local color = Ui.colors.panel2
	if level == "good" then
		color = Color3.fromRGB(34, 100, 60)
	elseif level == "bad" then
		color = Color3.fromRGB(120, 40, 40)
	end
	local frame: Frame = Ui.create("Frame", { Size = UDim2.fromOffset(330, 40), BackgroundColor3 = color, BorderSizePixel = 0 })
	Ui.corner(frame, 10)
	Ui.label(frame, { Size = UDim2.new(1, -16, 1, -10), Position = UDim2.fromOffset(8, 5), Text = text })
	pushToast(frame, 3.5)
end

function Effects.cardToast(cardId: string)
	local def = Cards.byId[cardId]
	local grade = Grades.info[def.grade]
	local frame: Frame = Ui.create("Frame", { Size = UDim2.fromOffset(330, 96), BackgroundColor3 = Ui.colors.panel, BorderSizePixel = 0 })
	Ui.corner(frame, 12)
	Ui.stroke(frame, grade.color, 3)

	local holder: Frame = Ui.create("Frame", { Position = UDim2.fromOffset(8, 6), Size = UDim2.fromOffset(66, 84), BackgroundTransparency = 1 }, frame)
	CardView.create(cardId, { hideIncome = true }).Parent = holder

	Ui.label(frame, {
		Position = UDim2.fromOffset(84, 6),
		Size = UDim2.new(1, -92, 0, 24),
		Text = "NEW CARD!",
		TextColor3 = Ui.colors.accent,
		TextXAlignment = Enum.TextXAlignment.Left,
	})
	Ui.label(frame, {
		Position = UDim2.fromOffset(84, 32),
		Size = UDim2.new(1, -92, 0, 30),
		Text = def.name,
		TextXAlignment = Enum.TextXAlignment.Left,
	})
	Ui.label(frame, {
		Position = UDim2.fromOffset(84, 66),
		Size = UDim2.new(1, -92, 0, 22),
		Text = def.grade .. "  +" .. Format.number(def.income) .. "/s",
		TextColor3 = grade.color,
		TextXAlignment = Enum.TextXAlignment.Left,
	})
	pushToast(frame, 4.5)
end

return Effects
