--!strict
-- Always-visible interface: money, income, damage, bottom menu, SWING button (touch).
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Format = require(ReplicatedStorage.Shared.Format)
local Ui = require(script.Parent.Ui)
local State = require(script.Parent.State)

local Hud = {}

export type MenuItem = { text: string, color: Color3, onClick: () -> () }

function Hud.init(gui: ScreenGui, menu: { MenuItem }): TextButton
	-- top info panel
	local panel: Frame = Ui.create("Frame", {
		Name = "InfoPanel",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 6),
		Size = UDim2.fromOffset(280, 70),
		BackgroundColor3 = Ui.colors.header,
		BackgroundTransparency = 0.15,
		BorderSizePixel = 0,
	}, gui)
	Ui.corner(panel, 12)
	Ui.stroke(panel, Color3.fromRGB(90, 95, 140), 2)

	local money = Ui.label(panel, {
		Position = UDim2.fromOffset(10, 4),
		Size = UDim2.new(1, -20, 0, 36),
		Text = "$0",
		TextColor3 = Color3.fromRGB(255, 215, 70),
	})
	local sub = Ui.label(panel, {
		Position = UDim2.fromOffset(10, 42),
		Size = UDim2.new(1, -20, 0, 22),
		Text = "+0/s    Damage 1",
		TextColor3 = Ui.colors.muted,
	})
	local offline = Ui.label(gui, {
		Name = "OfflineWarning",
		AnchorPoint = Vector2.new(0.5, 0),
		Position = UDim2.new(0.5, 0, 0, 78),
		Size = UDim2.fromOffset(260, 18),
		Text = "SAVING IS OFF (Studio test)",
		TextColor3 = Ui.colors.bad,
		Visible = false,
	})

	State.onChanged(function()
		local d = State.data
		if not d then
			return
		end
		money.Text = Format.money(d.money)
		local mult = if d.moneyMult > 1 then string.format("  (x%.2g money)", d.moneyMult) else ""
		sub.Text = "+" .. Format.number(d.income) .. "/s    Damage " .. Format.number(d.damage) .. mult
		offline.Visible = d.offline
	end)

	-- bottom menu
	local bar: Frame = Ui.create("Frame", {
		Name = "Menu",
		AnchorPoint = Vector2.new(0.5, 1),
		Position = UDim2.new(0.5, 0, 1, -8),
		Size = UDim2.fromOffset(#menu * 74, 64),
		BackgroundTransparency = 1,
	}, gui)
	Ui.create("UIListLayout", {
		FillDirection = Enum.FillDirection.Horizontal,
		Padding = UDim.new(0, 6),
		SortOrder = Enum.SortOrder.LayoutOrder,
		HorizontalAlignment = Enum.HorizontalAlignment.Center,
	}, bar)
	for i, item in menu do
		Ui.button(bar, {
			text = item.text,
			size = UDim2.fromOffset(68, 64),
			color = item.color,
			layoutOrder = i,
			onClick = item.onClick,
		})
	end

	-- big SWING button for phones / gamepads (hold to repeat)
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
	return swing
end

return Hud
