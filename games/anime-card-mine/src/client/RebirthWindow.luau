--!strict
-- "Rebirth": reset money, sword level and stages for a permanent damage / money multiplier.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Config = require(ReplicatedStorage.Shared.Config)
local Formulas = require(ReplicatedStorage.Shared.Formulas)
local Ui = require(script.Parent.Ui)
local State = require(script.Parent.State)

local RebirthWindow = {}

function RebirthWindow.create(gui: ScreenGui): Ui.Window
	local win = Ui.window(gui, "Rebirth")
	local body = win.body
	local confirm = false

	local function box(x: number, w: number, title: string): (TextLabel, TextLabel)
		local f: Frame = Ui.create("Frame", { Position = UDim2.new(x, 0, 0, 0), Size = UDim2.new(w, 0, 0, 96), BackgroundColor3 = Ui.colors.panel2, BorderSizePixel = 0 }, body)
		Ui.corner(f, 12)
		Ui.label(f, { Position = UDim2.fromOffset(6, 4), Size = UDim2.new(1, -12, 0, 22), Text = title, TextColor3 = Ui.colors.muted })
		local dmg = Ui.label(f, { Position = UDim2.fromOffset(6, 30), Size = UDim2.new(1, -12, 0, 28), Text = "", TextColor3 = Ui.colors.accent })
		local money = Ui.label(f, { Position = UDim2.fromOffset(6, 62), Size = UDim2.new(1, -12, 0, 28), Text = "", TextColor3 = Ui.colors.good })
		return dmg, money
	end
	local beforeDmg, beforeMoney = box(0, 0.44, "Now")
	Ui.label(body, { Position = UDim2.fromScale(0.44, 0), Size = UDim2.new(0.12, 0, 0, 96), Text = ">" })
	local afterDmg, afterMoney = box(0.56, 0.44, "After rebirth")

	local info = Ui.label(body, {
		Position = UDim2.fromOffset(0, 104),
		Size = UDim2.new(1, 0, 0, 56),
		Text = "",
		TextWrapped = true,
		TextColor3 = Ui.colors.muted,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextYAlignment = Enum.TextYAlignment.Top,
	})
	Ui.create("UITextSizeConstraint", { MaxTextSize = 17, MinTextSize = 8 }, info)

	local btn = Ui.button(body, {
		text = "Rebirth",
		position = UDim2.new(0, 0, 0, 166),
		size = UDim2.new(1, 0, 0, 48),
		color = Color3.fromRGB(230, 90, 150),
	})
	btn.Activated:Connect(function()
		local d = State.data
		if not d or d.stage < Formulas.rebirthStageReq(d.rebirths) then
			return
		end
		if confirm then
			confirm = false
			Remotes.get("Rebirth"):FireServer()
		else
			confirm = true
			btn.Text = "Tap again to confirm!"
			task.delay(3, function()
				confirm = false
			end)
		end
	end)

	local function refresh()
		local d = State.data
		if not d or not win.isOpen() then
			return
		end
		beforeDmg.Text = string.format("Damage x%.2f", Formulas.rebirthDamageMult(d.rebirths))
		beforeMoney.Text = string.format("Money x%.2f", Formulas.rebirthMoneyMult(d.rebirths))
		afterDmg.Text = string.format("Damage x%.2f", Formulas.rebirthDamageMult(d.rebirths + 1))
		afterMoney.Text = string.format("Money x%.2f", Formulas.rebirthMoneyMult(d.rebirths + 1))
		local need = Formulas.rebirthStageReq(d.rebirths)
		info.Text = string.format(
			"Resets: money, sword level, stage progress. Keeps: cards, card levels, slots, passes, potions.\nRequirement: clear %d stages (you cleared %d). Rebirths done: %d.",
			need,
			d.stage,
			d.rebirths
		)
		local can = d.stage >= need and d.rebirths < Config.REBIRTH_MAX
		if not confirm then
			btn.Text = if can then "Rebirth" else "Locked"
		end
		Ui.setEnabledLook(btn, can, Color3.fromRGB(230, 90, 150))
	end

	State.onChanged(refresh)
	win.onOpen = function()
		confirm = false
		refresh()
	end
	return win
end

return RebirthWindow
