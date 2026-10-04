--!strict
-- "Worlds": progress through the stages of every world; teleport to worlds you have unlocked.
-- A world opens after the last wall of the previous world is broken.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Zones = require(ReplicatedStorage.Shared.Zones)
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
	for _, world in Zones.worlds do
		local f: Frame = Ui.create("Frame", { Size = UDim2.new(1, -8, 0, 84), BackgroundColor3 = Ui.colors.panel2, BorderSizePixel = 0, LayoutOrder = world.id }, list)
		Ui.corner(f, 12)
		Ui.stroke(f, world.accent, 2)
		Ui.label(f, { Position = UDim2.fromOffset(12, 6), Size = UDim2.new(0.62, -12, 0, 28), Text = world.name, TextXAlignment = Enum.TextXAlignment.Left, TextColor3 = world.accent })
		Ui.label(f, { Position = UDim2.fromOffset(12, 36), Size = UDim2.new(0.62, -12, 0, 20), Text = world.tagline, TextXAlignment = Enum.TextXAlignment.Left, TextColor3 = Ui.colors.muted })
		statuses[world.id] = Ui.label(f, {
			Position = UDim2.fromOffset(12, 58),
			Size = UDim2.new(0.62, -12, 0, 20),
			Text = "",
			TextXAlignment = Enum.TextXAlignment.Left,
		})
		buttons[world.id] = Ui.button(f, {
			text = "",
			position = UDim2.new(0.62, 0, 0, 14),
			size = UDim2.new(0.38, -12, 0, 56),
			color = Ui.colors.good,
			onClick = function()
				local d = State.data
				if d and Zones.isWorldUnlocked(world.id, d.stage) then
					win.close()
					Remotes.get("TeleportTo"):FireServer(world.id)
				end
			end,
		})
	end

	local function refresh()
		local d = State.data
		if not d or not win.isOpen() then
			return
		end
		for _, world in Zones.worlds do
			local unlocked = Zones.isWorldUnlocked(world.id, d.stage)
			local cleared = math.clamp(d.stage - (world.firstStage - 1), 0, Zones.STAGES_PER_WORLD)
			local btn = buttons[world.id]
			if unlocked then
				statuses[world.id].Text = string.format("Stages cleared: %d / %d", cleared, Zones.STAGES_PER_WORLD)
				statuses[world.id].TextColor3 = if cleared >= Zones.STAGES_PER_WORLD then Ui.colors.good else Ui.colors.text
				btn.Text = "Teleport"
				Ui.setEnabledLook(btn, true, Ui.colors.blue)
			else
				statuses[world.id].Text = "Complete World " .. (world.id - 1) .. " first"
				statuses[world.id].TextColor3 = Ui.colors.bad
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
