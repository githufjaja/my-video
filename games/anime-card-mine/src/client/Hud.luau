--!strict
-- Always-visible interface: drop timer, money / income / damage, multipliers, boost timers,
-- wall HP bar, side + bottom menus, HIT button (touch) and Auto toggle.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local RunService = game:GetService("RunService")

local Format = require(ReplicatedStorage.Shared.Format)
local Zones = require(ReplicatedStorage.Shared.Zones)
local Ui = require(script.Parent.Ui)
local State = require(script.Parent.State)

local Hud = {}

export type MenuItem = { text: string, color: Color3, onClick: () -> () }

local BOOST_COLORS: { [string]: Color3 } = {
	luck = Color3.fromRGB(80, 200, 120),
	cash = Color3.fromRGB(255, 200, 60),
	drop = Color3.fromRGB(120, 160, 255),
}
local BOOST_NAMES: { [string]: string } = { luck = "Luck", cash = "Cash", drop = "Drops" }

function Hud.init(gui: ScreenGui, bottomMenu: { MenuItem }, sideMenu: { MenuItem }, onStarter: () -> ()): (TextButton, TextButton)
	local player = Players.LocalPlayer

	-- card drop timer (top center)
	local dropLabel = Ui.label(gui, {
		Name = "DropTimer",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 2),
		Size = UDim2.fromOffset(300, 24),
		Text = "Card Drop in ...",
		TextColor3 = Color3.fromRGB(255, 235, 150),
		TextStrokeTransparency = 0.4,
	})

	-- info panel
	local panel: Frame = Ui.create("Frame", {
		Name = "InfoPanel",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 28),
		Size = UDim2.fromOffset(280, 64),
		BackgroundColor3 = Ui.colors.header,
		BackgroundTransparency = 0.15,
		BorderSizePixel = 0,
	}, gui)
	Ui.corner(panel, 12)
	Ui.stroke(panel, Color3.fromRGB(90, 95, 140), 2)
	local money = Ui.label(panel, {
		Position = UDim2.fromOffset(10, 3),
		Size = UDim2.new(1, -20, 0, 34),
		Text = "$0",
		TextColor3 = Color3.fromRGB(255, 215, 70),
	})
	local sub = Ui.label(panel, {
		Position = UDim2.fromOffset(10, 39),
		Size = UDim2.new(1, -20, 0, 20),
		Text = "+0/s    Damage 1",
		TextColor3 = Ui.colors.muted,
	})
	local offline = Ui.label(gui, {
		Name = "OfflineWarning",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 94),
		Size = UDim2.fromOffset(260, 16),
		Text = "SAVING IS OFF (Studio test)",
		TextColor3 = Ui.colors.bad,
		Visible = false,
	})

	-- wall HP bar (shows when you stand near your next wall)
	local wallBar: Frame = Ui.create("Frame", {
		Name = "WallBar",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 112),
		Size = UDim2.fromOffset(300, 34),
		BackgroundColor3 = Color3.fromRGB(30, 30, 36),
		BorderSizePixel = 0,
		Visible = false,
	}, gui)
	Ui.corner(wallBar, 10)
	Ui.stroke(wallBar, Color3.fromRGB(255, 255, 255), 2)
	local wallFill: Frame = Ui.create("Frame", { Size = UDim2.fromScale(1, 1), BackgroundColor3 = Color3.fromRGB(235, 140, 50), BorderSizePixel = 0 }, wallBar)
	Ui.corner(wallFill, 10)
	local wallText = Ui.label(wallBar, { Size = UDim2.fromScale(1, 1), Text = "", ZIndex = 2, TextStrokeTransparency = 0.4 })
	Ui.create("UITextSizeConstraint", { MaxTextSize = 20, MinTextSize = 8 }, wallText)

	-- multipliers + boosts (right side)
	local right: Frame = Ui.create("Frame", {
		Name = "RightInfo",
		AnchorPoint = Vector2.new(1, 0),
		Position = UDim2.new(1, -8, 0, 120),
		Size = UDim2.fromOffset(150, 240),
		BackgroundTransparency = 1,
	}, gui)
	Ui.create("UIListLayout", { Padding = UDim.new(0, 3), SortOrder = Enum.SortOrder.LayoutOrder, HorizontalAlignment = Enum.HorizontalAlignment.Right }, right)
	local multLabel = Ui.label(right, {
		Size = UDim2.fromOffset(150, 20),
		Text = "",
		TextXAlignment = Enum.TextXAlignment.Right,
		TextColor3 = Ui.colors.text,
		TextStrokeTransparency = 0.4,
		LayoutOrder = 0,
	})
	local boostRows: { [string]: TextLabel } = {}
	for i, kind in { "luck", "cash", "drop" } do
		local row = Ui.label(right, {
			Size = UDim2.fromOffset(150, 22),
			Text = "",
			TextXAlignment = Enum.TextXAlignment.Right,
			TextColor3 = BOOST_COLORS[kind],
			TextStrokeTransparency = 0.4,
			LayoutOrder = i,
			Visible = false,
		})
		boostRows[kind] = row
	end

	State.onChanged(function()
		local d = State.data
		if not d then
			return
		end
		money.Text = Format.money(d.money)
		sub.Text = "+" .. Format.number(d.income) .. "/s    Damage " .. Format.number(d.damage)
		offline.Visible = d.offline
		multLabel.Text = string.format("Luck %.2gx   Cash %.2gx", d.luck, d.moneyMult)
	end)

	-- per-frame things (cheap): drop countdown, boost timers, wall bar
	local acc = 0
	RunService.Heartbeat:Connect(function(dt)
		acc += dt
		if acc < 0.1 then
			return
		end
		acc = 0
		local d = State.data
		if not d then
			return
		end
		local left = State.dropDeadline - os.clock()
		dropLabel.Text = if left > 0.5 then "Card Drop in " .. Format.time(left) else "Card is dropping..."

		for kind, row in boostRows do
			local ends = State.boostEnds[kind]
			local b = d.boosts[kind]
			if ends and b and ends > os.clock() then
				row.Visible = true
				row.Text = string.format("%s x%g  %s", BOOST_NAMES[kind], b.mult, Format.time(ends - os.clock()))
			else
				row.Visible = false
			end
		end

		-- wall bar: next wall of the player
		local nextStage = d.stage + 1
		local stage = Zones.stages[nextStage]
		local world = workspace:FindFirstChild("World")
		local stages = world and world:FindFirstChild("Stages")
		local wall = stages and stages:FindFirstChild("Wall_" .. nextStage)
		local char = player.Character
		local hrp = char and char:FindFirstChild("HumanoidRootPart")
		if stage and wall and wall:IsA("BasePart") and hrp and hrp:IsA("BasePart") and math.abs(hrp.Position.Z - wall.Position.Z) < 45 then
			local hp = stage.wallHp
			if player:GetAttribute("WallStage") == nextStage then
				hp = player:GetAttribute("WallHp") :: number
			end
			wallBar.Visible = true
			wallFill.Size = UDim2.fromScale(math.clamp(hp / stage.wallHp, 0, 1), 1)
			wallText.Text = string.format("WALL %d   %s / %s", nextStage, Format.number(hp), Format.number(stage.wallHp))
		else
			wallBar.Visible = false
		end
	end)

	-- bottom menu
	local bar: Frame = Ui.create("Frame", {
		Name = "Menu",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -8),
		Size = UDim2.fromOffset(#bottomMenu * 74, 64),
		BackgroundTransparency = 1,
	}, gui)
	Ui.create("UIListLayout", {
		FillDirection = Enum.FillDirection.Horizontal,
		Padding = UDim.new(0, 6),
		SortOrder = Enum.SortOrder.LayoutOrder,
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
	}, bar)
	for i, item in bottomMenu do
		Ui.button(bar, { text = item.text, size = UDim2.fromOffset(68, 64), color = item.color, layoutOrder = i, onClick = item.onClick })
	end

	-- side menu (left, under the Roblox top bar)
	local side: Frame = Ui.create("Frame", {
		Name = "SideMenu",
		Position = UDim2.fromOffset(8, 52),
		Size = UDim2.fromOffset(64, #sideMenu * 66),
		BackgroundTransparency = 1,
	}, gui)
	Ui.create("UIListLayout", { Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder }, side)
	for i, item in sideMenu do
		Ui.button(side, { text = item.text, size = UDim2.fromOffset(64, 60), color = item.color, layoutOrder = i, onClick = item.onClick })
	end

	-- Starter Pack offer (one time; hidden after it is bought)
	local starter: TextButton = Ui.button(gui, {
		text = "Starter Pack!",
		size = UDim2.fromOffset(130, 44),
		position = UDim2.new(1, -8, 0, 262),
		anchor = Vector2.new(1, 0),
		color = Color3.fromRGB(235, 140, 40),
		onClick = onStarter,
	})
	starter.Name = "StarterButton"
	starter.Visible = false
	State.onChanged(function()
		local d = State.data
		if d then
			starter.Visible = not d.starterBought
		end
	end)

	-- big HIT button for phones / gamepads (hold to repeat)
	local swing: TextButton = Ui.button(gui, {
		text = "HIT",
		size = UDim2.fromOffset(92, 92),
		position = UDim2.new(1, -24, 1, -190),
		anchor = Vector2.new(1, 1),
		color = Color3.fromRGB(235, 90, 60),
	})
	swing.Name = "SwingButton"
	swing.Visible = Ui.isTouch
	Ui.corner(swing, 46)

	-- Auto Swing toggle (only when the pass is owned)
	local auto: TextButton = Ui.button(gui, {
		text = "AUTO",
		size = UDim2.fromOffset(76, 40),
		position = UDim2.new(1, -24, 1, -92),
		anchor = Vector2.new(1, 1),
		color = Ui.colors.good,
	})
	auto.Name = "AutoButton"
	auto.Visible = false
	State.onChanged(function()
		local d = State.data
		if d then
			auto.Visible = d.autoOwned
			auto.Text = if d.autoOn then "AUTO ON" else "AUTO OFF"
			auto.BackgroundColor3 = if d.autoOn then Ui.colors.good else Ui.colors.disabled
		end
	end)
	return swing, auto
end

return Hud
