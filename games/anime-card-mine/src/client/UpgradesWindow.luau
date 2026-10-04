--!strict
-- "Upgrades": sword level (x1 / x10 / MAX), base slots, sword slots, and a summary of multipliers.
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

local function titleAndSub(parent: Instance, title: string): (TextLabel, TextLabel)
	local t = Ui.label(parent, {
		Position = UDim2.fromOffset(12, 6),
		Size = UDim2.new(0.55, -12, 0, 28),
		Text = title,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Ui.colors.accent,
	})
	local s = Ui.label(parent, {
		Position = UDim2.fromOffset(12, 38),
		Size = UDim2.new(0.55, -12, 0, 40),
		Text = "",
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Ui.colors.muted,
		TextWrapped = true,
	})
	Ui.create("UITextSizeConstraint", { MaxTextSize = 17, MinTextSize = 8 }, s)
	return t, s
end

function UpgradesWindow.create(gui: ScreenGui): Ui.Window
	local win = Ui.window(gui, "Upgrades")
	local scroll = Ui.scroll(win.body, {
		Size = UDim2.fromScale(1, 1),
		AutomaticCanvasSize = Enum.AutomaticSize.None,
		CanvasSize = UDim2.fromOffset(0, 400),
	})

	-- sword level
	local dmgRow = row(scroll, 0, 122)
	Ui.label(dmgRow, { Position = UDim2.fromOffset(12, 6), Size = UDim2.new(1, -24, 0, 30), Text = "Sword level (more damage)", TextXAlignment = Enum.TextXAlignment.Left, TextColor3 = Ui.colors.accent })
	local dmgInfo = Ui.label(dmgRow, { Position = UDim2.fromOffset(12, 38), Size = UDim2.new(1, -24, 0, 22), Text = "", TextXAlignment = Enum.TextXAlignment.Left, TextColor3 = Ui.colors.muted })
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

	-- base slots
	local slotRow = row(scroll, 132, 88)
	local slotTitle, slotSub = titleAndSub(slotRow, "Base slots")
	local slotBtn = Ui.button(slotRow, {
		text = "",
		position = UDim2.new(0.55, 0, 0, 16),
		size = UDim2.new(0.45, -10, 0, 56),
		color = Ui.colors.good,
		onClick = function()
			Remotes.get("BuySlot"):FireServer()
		end,
	})

	-- sword slots
	local swordRow = row(scroll, 230, 88)
	local swordTitle, swordSub = titleAndSub(swordRow, "Sword slots")
	local swordBtn = Ui.button(swordRow, {
		text = "",
		position = UDim2.new(0.55, 0, 0, 16),
		size = UDim2.new(0.45, -10, 0, 56),
		color = Ui.colors.blue,
		onClick = function()
			Remotes.get("BuySwordSlot"):FireServer()
		end,
	})

	local note = Ui.label(scroll, {
		Position = UDim2.fromOffset(4, 328),
		Size = UDim2.new(1, -18, 0, 60),
		Text = "",
		TextXAlignment = Enum.TextXAlignment.Left,
		TextYAlignment = Enum.TextYAlignment.Top,
		TextColor3 = Ui.colors.muted,
		TextWrapped = true,
	})
	Ui.create("UITextSizeConstraint", { MaxTextSize = 16, MinTextSize = 8 }, note)

	local function refresh()
		local d = State.data
		if not d or not win.isOpen() then
			return
		end
		dmgInfo.Text = "Damage now: " .. Format.number(d.damage) .. "   (level " .. d.damageLevel .. ")"
		local maxed = d.damageLevel >= Config.MAX_DAMAGE_LEVEL
		for i, amount in { 1, 10 } do
			local cost = Formulas.damageCostMany(d.damageLevel, amount)
			Ui.setEnabledLook(btns[i], not maxed and d.money >= cost, Ui.colors.good)
			btns[i].Text = "+" .. amount .. "  " .. Format.money(cost)
		end
		local count, cost = Formulas.maxAffordable(d.damageLevel, d.money)
		btns[3].Text = if count > 0 then "MAX +" .. count .. "  " .. Format.money(cost) else "MAX"
		Ui.setEnabledLook(btns[3], count > 0, Ui.colors.blue)

		local slotCost = Formulas.slotCost(d.boughtSlots)
		slotTitle.Text = "Base slots: " .. d.totalSlots
		if slotCost then
			slotSub.Text = "More slots = more cards earning money."
			slotBtn.Text = "Buy slot  " .. Format.money(slotCost)
			Ui.setEnabledLook(slotBtn, d.money >= slotCost, Ui.colors.good)
		else
			slotSub.Text = "All base slots bought."
			slotBtn.Text = "MAX"
			Ui.setEnabledLook(slotBtn, false, Ui.colors.good)
		end

		local swordCost = Formulas.swordSlotCost(d.swordBought)
		swordTitle.Text = "Sword slots: " .. d.swordSlots
		if swordCost then
			swordSub.Text = "Cards in the sword add damage and money."
			swordBtn.Text = "Buy slot  " .. Format.money(swordCost)
			Ui.setEnabledLook(swordBtn, d.money >= swordCost, Ui.colors.blue)
		else
			swordSub.Text = "All sword slots bought (more come with the pass)."
			swordBtn.Text = "MAX"
			Ui.setEnabledLook(swordBtn, false, Ui.colors.blue)
		end

		note.Text = string.format(
			"Luck x%.2g   Money x%.2g   Rebirths: %d\nCards in the sword: +%d%% damage, +%d%% money.",
			d.luck,
			d.moneyMult,
			d.rebirths,
			math.floor(d.swordDmgPct * 100 + 0.5),
			math.floor(d.swordMoneyPct * 100 + 0.5)
		)
	end

	State.onChanged(refresh)
	win.onOpen = refresh
	return win
end

return UpgradesWindow
