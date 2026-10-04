--!strict
-- "Cards" window: your cards, filter by grade, place on base, sell.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Cards = require(ReplicatedStorage.Shared.Cards)
local Grades = require(ReplicatedStorage.Shared.Grades)
local CardView = require(ReplicatedStorage.Shared.CardView)
local Format = require(ReplicatedStorage.Shared.Format)
local Ui = require(script.Parent.Ui)
local State = require(script.Parent.State)

local InventoryWindow = {}

function InventoryWindow.create(gui: ScreenGui): Ui.Window
	local win = Ui.window(gui, "My Cards")
	local body = win.body

	local filter = "All"
	local lastSignature = ""
	local confirmGrade: string? = nil

	-- filter tabs
	local tabs: ScrollingFrame = Ui.create("ScrollingFrame", {
		Size = UDim2.new(1, 0, 0, 40),
		BackgroundTransparency = 1,
		BorderSizePixel = 0,
		ScrollBarThickness = 0,
		CanvasSize = UDim2.new(),
		AutomaticCanvasSize = Enum.AutomaticSize.X,
		ScrollingDirection = Enum.ScrollingDirection.X,
	}, body)
	Ui.create("UIListLayout", { FillDirection = Enum.FillDirection.Horizontal, Padding = UDim.new(0, 5), SortOrder = Enum.SortOrder.LayoutOrder }, tabs)

	-- card grid (left)
	local grid = Ui.scroll(body, {
		Position = UDim2.fromOffset(0, 46),
		Size = UDim2.new(0.58, -4, 1, -46),
	})
	Ui.create("UIGridLayout", {
		CellSize = UDim2.fromOffset(84, 114),
		CellPadding = UDim2.fromOffset(6, 6),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, grid)
	Ui.padding(grid, 3)

	-- details (right)
	local detail: Frame = Ui.create("Frame", {
		Position = UDim2.new(0.58, 4, 0, 46),
		Size = UDim2.new(0.42, -4, 1, -46),
		BackgroundColor3 = Ui.colors.panel2,
		BorderSizePixel = 0,
	}, body)
	Ui.corner(detail, 10)
	local cardHolder: Frame = Ui.create("Frame", { Position = UDim2.fromOffset(8, 8), Size = UDim2.new(0.5, 0, 0.5, -8), BackgroundTransparency = 1 }, detail)
	local info = Ui.label(detail, {
		Position = UDim2.new(0.5, 12, 0, 8),
		Size = UDim2.new(0.5, -18, 0.5, -8),
		TextScaled = true,
		TextWrapped = true,
		TextXAlignment = Enum.TextXAlignment.Left,
		TextYAlignment = Enum.TextYAlignment.Top,
		TextColor3 = Ui.colors.muted,
		Text = "Tap a card",
	})
	Ui.create("UITextSizeConstraint", { MaxTextSize = 20, MinTextSize = 8 }, info)

	local placeBtn = Ui.button(detail, {
		text = "Place on base",
		position = UDim2.new(0, 8, 0.5, 2),
		size = UDim2.new(1, -16, 0, 36),
		color = Ui.colors.good,
	})
	local sell1 = Ui.button(detail, {
		text = "Sell 1",
		position = UDim2.new(0, 8, 0.5, 42),
		size = UDim2.new(0.5, -12, 0, 36),
		color = Ui.colors.accent,
		textColor = Color3.fromRGB(40, 30, 0),
	})
	local sellAll = Ui.button(detail, {
		text = "Sell all",
		position = UDim2.new(0.5, 4, 0.5, 42),
		size = UDim2.new(0.5, -12, 0, 36),
		color = Ui.colors.accent,
		textColor = Color3.fromRGB(40, 30, 0),
	})

	local function sortedCards(): { string }
		local d = State.data
		local out: { string } = {}
		if not d then
			return out
		end
		for id, n in d.inv do
			local def = Cards.byId[id]
			if def and n > 0 and (filter == "All" or def.grade == filter) then
				table.insert(out, id)
			end
		end
		table.sort(out, function(a, b)
			local da, db = Cards.byId[a], Cards.byId[b]
			local oa, ob = Grades.info[da.grade].order, Grades.info[db.grade].order
			if oa ~= ob then
				return oa > ob
			end
			if da.income ~= db.income then
				return da.income > db.income
			end
			return a < b
		end)
		return out
	end

	local function refreshDetail()
		for _, c in cardHolder:GetChildren() do
			c:Destroy()
		end
		local d = State.data
		local id = State.selectedCard
		local have = if d and id then (d.inv[id] or 0) else 0
		if not d or not id or have < 1 then
			if id and have < 1 then
				State.select(nil)
				return
			end
			info.Text = "Tap a card to see it here."
			Ui.setEnabledLook(placeBtn, false, Ui.colors.good)
			Ui.setEnabledLook(sell1, false, Ui.colors.accent)
			Ui.setEnabledLook(sellAll, false, Ui.colors.accent)
			sell1.Text = "Sell 1"
			sellAll.Text = "Sell all"
			return
		end
		local def = Cards.byId[id]
		CardView.create(id, { hideIncome = true }).Parent = cardHolder
		info.Text = string.format("%s\n%s\n+%s/s\nOwned: %d\n%s", def.name, def.grade, Format.number(def.income), have, def.tagline)
		info.TextColor3 = Grades.info[def.grade].color
		Ui.setEnabledLook(placeBtn, true, Ui.colors.good)
		Ui.setEnabledLook(sell1, true, Ui.colors.accent)
		Ui.setEnabledLook(sellAll, true, Ui.colors.accent)
		sell1.Text = "Sell 1 (" .. Format.money(Cards.sellValue(id)) .. ")"
		sellAll.Text = "Sell all (" .. Format.money(Cards.sellValue(id) * have) .. ")"
	end

	local function rebuildGrid()
		local d = State.data
		for _, c in grid:GetChildren() do
			if c:IsA("GuiObject") then
				c:Destroy()
			end
		end
		if not d then
			return
		end
		for i, id in sortedCards() do
			local cell: Frame = Ui.create("Frame", { BackgroundTransparency = 1, LayoutOrder = i }, grid)
			CardView.create(id, { count = d.inv[id] }).Parent = cell
			local selected = State.selectedCard == id
			local outline: Frame = Ui.create("Frame", { Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, ZIndex = 4, Visible = selected }, cell)
			Ui.corner(outline, 9)
			Ui.stroke(outline, Color3.fromRGB(255, 255, 255), 4)
			local hit: TextButton = Ui.create("TextButton", { Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Text = "", ZIndex = 5 }, cell)
			hit.Activated:Connect(function()
				State.select(id)
			end)
		end
		if #grid:GetChildren() <= 2 then
			-- empty state is shown through the info text
			info.Text = "No cards here yet.\nMine rocks to find some!"
		end
	end

	local tabButtons: { [string]: TextButton } = {}
	local sellGradeBtn: TextButton

	local function refreshTabs()
		for name, btn in tabButtons do
			local active = name == filter
			btn.BackgroundColor3 = if active then (if name == "All" then Ui.colors.accent else Grades.info[name].color) else Ui.colors.panel2
			btn.TextColor3 = if active then Color3.fromRGB(20, 20, 30) else Ui.colors.text
		end
		sellGradeBtn.Visible = filter ~= "All"
		sellGradeBtn.Text = "Sell all " .. filter
		confirmGrade = nil
	end

	local function refresh(force: boolean?)
		if not win.isOpen() then
			return
		end
		local d = State.data
		local parts: { string } = { filter, State.selectedCard or "" }
		if d then
			local ids: { string } = {}
			for id, n in d.inv do
				table.insert(ids, id .. "=" .. n)
			end
			table.sort(ids)
			table.insert(parts, table.concat(ids, ","))
		end
		local signature = table.concat(parts, "|")
		if signature == lastSignature and not force then
			return
		end
		lastSignature = signature
		rebuildGrid()
		refreshDetail()
	end

	local names = { "All" }
	for _, g in Grades.list do
		table.insert(names, g)
	end
	for i, name in names do
		local btn = Ui.button(tabs, {
			text = name,
			size = UDim2.fromOffset(if name == "Legendary" then 100 else 80, 36),
			layoutOrder = i,
			color = Ui.colors.panel2,
			onClick = function()
				filter = name
				refreshTabs()
				refresh(true)
			end,
		})
		tabButtons[name] = btn
	end
	sellGradeBtn = Ui.button(tabs, {
		text = "Sell all",
		size = UDim2.fromOffset(120, 36),
		layoutOrder = 100,
		color = Ui.colors.bad,
		onClick = function()
			if filter == "All" then
				return
			end
			if confirmGrade == filter then
				confirmGrade = nil
				sellGradeBtn.Text = "Sell all " .. filter
				Remotes.get("SellGrade"):FireServer(filter)
			else
				confirmGrade = filter
				sellGradeBtn.Text = "Tap again!"
				local mine = filter
				task.delay(3, function()
					if confirmGrade == mine then
						confirmGrade = nil
						sellGradeBtn.Text = "Sell all " .. mine
					end
				end)
			end
		end,
	})
	refreshTabs()

	placeBtn.Activated:Connect(function()
		if State.selectedCard then
			Remotes.get("PlaceCard"):FireServer(State.selectedCard)
		end
	end)
	sell1.Activated:Connect(function()
		if State.selectedCard then
			Remotes.get("Sell"):FireServer(State.selectedCard, 1)
		end
	end)
	sellAll.Activated:Connect(function()
		if State.selectedCard then
			Remotes.get("Sell"):FireServer(State.selectedCard, "all")
		end
	end)

	State.onChanged(function()
		refresh(false)
	end)
	State.onSelection(function()
		refresh(true)
	end)
	win.onOpen = function()
		refresh(true)
	end
	return win
end

return InventoryWindow
