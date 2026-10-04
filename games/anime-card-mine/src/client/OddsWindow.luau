--!strict
-- "Odds": what card drops can bring in each world and the real chances (same function the server uses).
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Config = require(ReplicatedStorage.Shared.Config)
local Zones = require(ReplicatedStorage.Shared.Zones)
local Cards = require(ReplicatedStorage.Shared.Cards)
local Grades = require(ReplicatedStorage.Shared.Grades)
local Drops = require(ReplicatedStorage.Shared.Drops)
local Format = require(ReplicatedStorage.Shared.Format)
local Ui = require(script.Parent.Ui)
local State = require(script.Parent.State)

local OddsWindow = {}

function OddsWindow.create(gui: ScreenGui): Ui.Window
	local win = Ui.window(gui, "Drop Chances")
	local body = win.body
	local worldId = 1

	local tabs: Frame = Ui.create("Frame", { Size = UDim2.new(1, 0, 0, 38), BackgroundTransparency = 1 }, body)
	Ui.create("UIListLayout", { FillDirection = Enum.FillDirection.Horizontal, Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder }, tabs)
	local list = Ui.scroll(body, { Position = UDim2.fromOffset(0, 44), Size = UDim2.new(1, 0, 1, -44) })
	Ui.create("UIListLayout", { Padding = UDim.new(0, 4), SortOrder = Enum.SortOrder.LayoutOrder }, list)
	Ui.padding(list, 3)

	local tabButtons: { [number]: TextButton } = {}
	local order = 0
	local function line(text: string, color: Color3?, height: number?)
		order += 1
		Ui.label(list, {
			Size = UDim2.new(1, -10, 0, height or 24),
			Text = text,
			TextXAlignment = Enum.TextXAlignment.Left,
			TextColor3 = color or Ui.colors.text,
			LayoutOrder = order,
			TextWrapped = true,
		})
	end

	local function rebuild()
		for _, c in list:GetChildren() do
			if c:IsA("GuiObject") then
				c:Destroy()
			end
		end
		order = 0
		local world = Zones.worlds[worldId]
		local d = State.data
		local luck = if d then d.luck else 1
		local interval = if d then d.dropInterval else Config.DROP_INTERVAL
		for id, btn in tabButtons do
			btn.BackgroundColor3 = if id == worldId then Ui.colors.accent else Ui.colors.panel2
			btn.TextColor3 = if id == worldId then Color3.fromRGB(20, 20, 30) else Ui.colors.text
		end

		line(world.name, world.accent, 28)
		line(string.format("A card drops near you every %s. Which card? Same odds for every player:", Format.time(interval)), Ui.colors.muted, 40)
		line("Grade chances (Luck x" .. string.format("%.2g", luck) .. "):", Ui.colors.muted, 24)
		local chances = Drops.gradeChances(world, luck)
		for _, grade in Grades.list do
			local p = chances[grade]
			line(grade .. ":  " .. (if p > 0 then Format.percent(p) else "not in this world"), Grades.info[grade].color, 22)
		end
		line("Characters:", Ui.colors.muted, 24)
		for _, grade in Grades.list do
			local bucket = Cards.byGrade[grade]
			if bucket then
				for _, def in bucket do
					line(string.format("[%s] %s  +%s/s", grade, def.name, Format.number(def.income)), Grades.info[grade].color, 20)
				end
			end
		end
		line("Cards come only from the timed drops. Paid items never give random cards.", Ui.colors.muted, 40)
	end

	for _, world in Zones.worlds do
		tabButtons[world.id] = Ui.button(tabs, {
			text = "World " .. world.id,
			size = UDim2.fromOffset(110, 36),
			layoutOrder = world.id,
			color = Ui.colors.panel2,
			onClick = function()
				worldId = world.id
				rebuild()
			end,
		})
	end

	win.onOpen = rebuild
	return win
end

return OddsWindow
