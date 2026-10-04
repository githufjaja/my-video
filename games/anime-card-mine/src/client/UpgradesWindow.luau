--!strict
-- "Upgrades": +1 Damage per click (x1 / x10 / MAX) and base slots.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Config = require(ReplicatedStorage.Shared.Config)
local Formulas = require(ReplicatedStorage.Shared.Formulas)
local Format = require(ReplicatedStorage.Shared.Format)
local Ui = require(script.Parent.Ui)
local State = require(script.Parent.State)

local UpgradesWindow = {}

local function row(parent: Instance, y: number, height: number): Frame
	local f: Frame = Ui.create("Frame", {
		Position = UDim2.new(0, 0, 0, y),
		Size = UDim2.new(1, -10, 0, height),
		BackgroundColor3 = Ui.colors.panel2,
		BorderSizePixel = 0,
	}, parent)
	Ui.corner(f, 12)
	return f
end

function UpgradesWindow.create(gui: ScreenGui): Ui.Window
	local win = Ui.window(gui, "Upgrades")
	local body: Instance = Ui.scroll(win.body, {
		Size = UDim2.fromScale(1, 1),
		AutomaticCanvasSize = Enum.AutomaticSize.None,
		CanvasSize = UDim2.fromOffset(0, 280),
	})

	-- damage row
	local dmgRow = row(body, 0, 122)
	local dmgTitle = Ui.label(dmgRow, {
		Position = UDim2.fromOffset(12, 6),
		Size = UDim2.new(1, -24, 0, 30),
		Text = "+1 Damage per click",
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Ui.colors.accent,
	})
	local dmgInfo = Ui.label(dmgRow, {
		Position = UDim2.fromOffset(12, 38),
		Size = UDim2.new(1, -24, 0, 22),
		Text = "",
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Ui.colors.muted,
	})
	local btns: { TextButton } = {}
	for i = 1, 3 do
		btns[i] = Ui.button(dmgRow, {
			text = "",
			position = UDim2.new((i - 1) / 3, if i == 1 then 10 else 4, 0, 66),
			size = UDim2.new(1 / 3, -10, 0, 48),
			color = Ui.colors.good,
		})
	end
	btns[1].Activated:Connect(function()
		Remotes.get("BuyDamage"):FireServer(1)
	end)
	btns[2].Activated:Connect(function()
		Remotes.get("BuyDamage"):FireServer(10)
	end)
	btns[3].Activated:Connect(function()
		Remotes.get("BuyDamage"):FireServer("max")
	end)

	-- slots row
	local slotRow = row(body, 132, 88)
	local slotInfo = Ui.label(slotRow, {
		Position = UDim2.fromOffset(12, 6),
		Size = UDim2.new(0.55, -12, 0, 30),
		Text = "Base slots",
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Ui.colors.accent,
	})
	local slotSub = Ui.label(slotRow, {
		Position = UDim2.fromOffset(12, 40),
		Size = UDim2.new(0.55, -12, 0, 40),
		Text = "",
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Ui.colors.muted,
		TextWrapped = true,
	})
	local slotBtn = Ui.button(slotRow, {
		text = "",
		position = UDim2.new(0.55, 0, 0, 16),
		size = UDim2.new(0.45, -10, 0, 56),
		color = Ui.colors.good,
		onClick = function()
			Remotes.get("BuySlot"):FireServer()
		end,
	})

	local note = Ui.label(body, {
		Position = UDim2.fromOffset(4, 228),
		Size = UDim2.new(1, -8, 0, 40),
		Text = "",
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Ui.colors.muted,
		TextWrapped = true,
	})
	Ui.create("UITextSizeConstraint", { MaxTextSize = 16, MinTextSize = 8 }, note)

	local function refresh()
		local d = State.data
		if not d or not win.isOpen() then
			return
		end
		dmgTitle.Text = "+1 Damage per click"
		dmgInfo.Text = "Now: " .. Format.number(d.damage) .. " damage (level " .. d.damageLevel .. ")"
		local maxed = d.damageLevel >= Config.MAX_DAMAGE_LEVEL
		for i, amount in { 1, 10 } do
			local cost = Formulas.damageCostMany(d.damageLevel, amount)
			local ok = not maxed and d.money >= cost
			btns[i].Text = "+" .. amount .. "  " .. Format.money(cost)
			Ui.setEnabledLook(btns[i], ok, Ui.colors.good)
		end
		local count, cost = Formulas.maxAffordable(d.damageLevel, d.money)
		btns[3].Text = if count > 0 then "MAX +" .. count .. "  " .. Format.money(cost) else "MAX"
		Ui.setEnabledLook(btns[3], count > 0, Ui.colors.blue)

		local slotCost = Formulas.slotCost(d.boughtSlots)
		slotInfo.Text = "Base slots: " .. d.totalSlots
		if slotCost then
			slotSub.Text = "More slots = more cards earning money."
			slotBtn.Text = "Buy slot  " .. Format.money(slotCost)
			Ui.setEnabledLook(slotBtn, d.money >= slotCost, Ui.colors.good)
		else
			slotSub.Text = "All slots bought."
			slotBtn.Text = "MAX"
			Ui.setEnabledLook(slotBtn, false, Ui.colors.good)
		end
		note.Text = string.format("Money multiplier x%.2g, Luck x%.2g.", d.moneyMult, d.luck)
	end

	State.onChanged(refresh)
	win.onOpen = refresh
	return win
end

return UpgradesWindow
