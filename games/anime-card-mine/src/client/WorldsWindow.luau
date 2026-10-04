--!strict
-- "Worlds": unlock gates for money and teleport.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Zones = require(ReplicatedStorage.Shared.Zones)
local Format = require(ReplicatedStorage.Shared.Format)
local Ui = require(script.Parent.Ui)
local State = require(script.Parent.State)

local WorldsWindow = {}

function WorldsWindow.create(gui: ScreenGui): Ui.Window
	local win = Ui.window(gui, "Worlds")
	local body = win.body

	Ui.button(body, {
		text = "Go to my base",
		position = UDim2.fromOffset(0, 0),
		size = UDim2.new(0.5, -4, 0, 38),
		color = Ui.colors.blue,
		onClick = function()
			win.close()
			Remotes.get("TeleportTo"):FireServer("base")
		end,
	})
	Ui.button(body, {
		text = "Go to spawn",
		position = UDim2.new(0.5, 4, 0, 0),
		size = UDim2.new(0.5, -4, 0, 38),
		color = Ui.colors.blue,
		onClick = function()
			win.close()
			Remotes.get("TeleportTo"):FireServer("hub")
		end,
	})

	local list = Ui.scroll(body, { Position = UDim2.fromOffset(0, 46), Size = UDim2.new(1, 0, 1, -46) })
	Ui.create("UIListLayout", { Padding = UDim.new(0, 8), SortOrder = Enum.SortOrder.LayoutOrder }, list)

	local buttons: { [number]: TextButton } = {}
	local statuses: { [number]: TextLabel } = {}
	for _, zone in Zones.list do
		local f: Frame = Ui.create("Frame", { Size = UDim2.new(1, -8, 0, 84), BackgroundColor3 = Ui.colors.panel2, BorderSizePixel = 0, LayoutOrder = zone.id }, list)
		Ui.corner(f, 12)
		Ui.stroke(f, zone.accent, 2)
		Ui.label(f, { Position = UDim2.fromOffset(12, 6), Size = UDim2.new(0.6, -12, 0, 28), Text = zone.name, TextXAlignment = Enum.TextXAlignment.Left, TextColor3 = zone.accent })
		Ui.label(f, { Position = UDim2.fromOffset(12, 36), Size = UDim2.new(0.6, -12, 0, 20), Text = zone.tagline, TextXAlignment = Enum.TextXAlignment.Left, TextColor3 = Ui.colors.muted })
		local hpMin, hpMax = math.huge, 0
		for _, r in zone.rocks do
			hpMin, hpMax = math.min(hpMin, r.hp), math.max(hpMax, r.hp)
		end
		statuses[zone.id] = Ui.label(f, {
			Position = UDim2.fromOffset(12, 58),
			Size = UDim2.new(0.6, -12, 0, 20),
			Text = "Rock HP: " .. Format.number(hpMin) .. " - " .. Format.number(hpMax),
			TextXAlignment = Enum.TextXAlignment.Left,
			TextColor3 = Ui.colors.text,
		})
		buttons[zone.id] = Ui.button(f, {
			text = "",
			position = UDim2.new(0.6, 0, 0, 14),
			size = UDim2.new(0.4, -12, 0, 56),
			color = Ui.colors.good,
			onClick = function()
				local d = State.data
				if not d then
					return
				end
				if zone.id <= d.zonesUnlocked then
					win.close()
					Remotes.get("TeleportTo"):FireServer(zone.id)
				else
					Remotes.get("BuyZone"):FireServer(zone.id)
				end
			end,
		})
	end

	local function refresh()
		local d = State.data
		if not d or not win.isOpen() then
			return
		end
		for _, zone in Zones.list do
			local btn = buttons[zone.id]
			if zone.id <= d.zonesUnlocked then
				btn.Text = "Teleport"
				Ui.setEnabledLook(btn, true, Ui.colors.blue)
			elseif zone.id == d.zonesUnlocked + 1 then
				btn.Text = "Unlock " .. Format.money(zone.gateCost)
				Ui.setEnabledLook(btn, d.money >= zone.gateCost, Ui.colors.good)
			else
				btn.Text = "Locked"
				Ui.setEnabledLook(btn, false, Ui.colors.good)
			end
		end
	end

	State.onChanged(refresh)
	win.onOpen = refresh
	return win
end

return WorldsWindow
