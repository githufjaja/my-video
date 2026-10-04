--!strict
-- "Odds": shows exactly what can drop in each world and the real chances (same function the server uses).
local ReplicatedStorage = game:GetService("ReplicatedStorage")

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
	local zoneId = 1

	local tabs: Frame = Ui.create("Frame", { Size = UDim2.new(1, 0, 0, 38), BackgroundTransparency = 1 }, body)
	Ui.create("UIListLayout", { FillDirection = Enum.FillDirection.Horizontal, Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder }, tabs)
	local list = Ui.scroll(body, { Position = UDim2.fromOffset(0, 44), Size = UDim2.new(1, 0, 1, -44) })
	Ui.create("UIListLayout", { Padding = UDim.new(0, 4), SortOrder = Enum.SortOrder.LayoutOrder }, list)
	Ui.padding(list, 3)

	local tabButtons: { [number]: TextButton } = {}
	local order = 0
	local function line(text: string, color: Color3?, height: number?): TextLabel
		order += 1
		return Ui.label(list, {
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
		local zone = Zones.list[zoneId]
		local d = State.data
		local luck = if d then d.luck else 1
		for id, btn in tabButtons do
			btn.BackgroundColor3 = if id == zoneId then Ui.colors.accent else Ui.colors.panel2
			btn.TextColor3 = if id == zoneId then Color3.fromRGB(20, 20, 30) else Ui.colors.text
		end

		line(zone.name, zone.accent, 28)
		line("Chance that a destroyed rock drops a card:", Ui.colors.muted, 22)
		for _, r in zone.rocks do
			line(string.format("%s  (HP %s):  %s", r.name, Format.number(r.hp), Format.percent(r.cardChance * 100)), nil, 22)
		end
		line("Which grade drops (when a card drops), Luck x" .. string.format("%.2g", luck) .. ":", Ui.colors.muted, 24)
		local chances = Drops.gradeChances(zone, luck)
		for _, grade in Grades.list do
			local info = Grades.info[grade]
			local p = chances[grade]
			local text = if p > 0 then Format.percent(p) else "not in this world"
			line(grade .. ":  " .. text, info.color, 22)
		end
		line("Characters:", Ui.colors.muted, 24)
		for _, grade in Grades.list do
			local info = Grades.info[grade]
			local bucket = Cards.byGrade[grade]
			if bucket then
				for _, def in bucket do
					line(string.format("[%s] %s  +%s/s", grade, def.name, Format.number(def.income)), info.color, 20)
				end
			end
		end
		line("Cards drop only from mining. Chances are the same for every player.", Ui.colors.muted, 36)
	end

	for _, zone in Zones.list do
		tabButtons[zone.id] = Ui.button(tabs, {
			text = "World " .. zone.id,
			size = UDim2.fromOffset(110, 36),
			layoutOrder = zone.id,
			color = Ui.colors.panel2,
			onClick = function()
				zoneId = zone.id
				rebuild()
			end,
		})
	end

	win.onOpen = rebuild
	return win
end

return OddsWindow
