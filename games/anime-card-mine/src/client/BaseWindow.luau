--!strict
-- "Base" window: sword slots (card bonuses) and base slots (passive income).
-- Tap a slot: with a card selected in My Cards it places/swaps it, on an occupied slot with no selection it takes the card back.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Cards = require(ReplicatedStorage.Shared.Cards)
local CardView = require(ReplicatedStorage.Shared.CardView)
local Format = require(ReplicatedStorage.Shared.Format)
local Ui = require(script.Parent.Ui)
local State = require(script.Parent.State)

local BaseWindow = {}

function BaseWindow.create(gui: ScreenGui, openCards: () -> ()): Ui.Window
	local win = Ui.window(gui, "Sword & Base")
	local body = win.body
	local lastSignature = ""

	local hint = Ui.label(body, {
		Size = UDim2.new(1, -250, 0, 36),
		Text = "",
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Ui.colors.muted,
		TextWrapped = true,
	})
	Ui.create("UITextSizeConstraint", { MaxTextSize = 17, MinTextSize = 8 }, hint)

	Ui.button(body, {
		text = "Best cards",
		position = UDim2.new(1, -240, 0, 0),
		size = UDim2.fromOffset(118, 36),
		color = Ui.colors.good,
		onClick = function()
			Remotes.get("AutoBest"):FireServer()
		end,
	})
	Ui.button(body, {
		text = "Go to base",
		position = UDim2.new(1, -118, 0, 0),
		size = UDim2.fromOffset(118, 36),
		color = Ui.colors.blue,
		onClick = function()
			win.close()
			Remotes.get("TeleportTo"):FireServer("base")
		end,
	})

	local content = Ui.scroll(body, { Position = UDim2.fromOffset(0, 42), Size = UDim2.new(1, 0, 1, -42) })
	Ui.create("UIListLayout", { Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder }, content)

	local swordTitle = Ui.label(content, { Size = UDim2.new(1, -8, 0, 22), Text = "", TextXAlignment = Enum.TextXAlignment.Left, TextColor3 = Ui.colors.accent, LayoutOrder = 1 })
	local swordRow: Frame = Ui.create("Frame", { Size = UDim2.new(1, -8, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundTransparency = 1, LayoutOrder = 2 }, content)
	Ui.create("UIGridLayout", { CellSize = UDim2.fromOffset(84, 114), CellPadding = UDim2.fromOffset(6, 6), SortOrder = Enum.SortOrder.LayoutOrder }, swordRow)
	local baseTitle = Ui.label(content, { Size = UDim2.new(1, -8, 0, 22), Text = "", TextXAlignment = Enum.TextXAlignment.Left, TextColor3 = Ui.colors.accent, LayoutOrder = 3 })
	local baseGrid: Frame = Ui.create("Frame", { Size = UDim2.new(1, -8, 0, 0), AutomaticSize = Enum.AutomaticSize.Y, BackgroundTransparency = 1, LayoutOrder = 4 }, content)
	Ui.create("UIGridLayout", { CellSize = UDim2.fromOffset(84, 114), CellPadding = UDim2.fromOffset(6, 6), SortOrder = Enum.SortOrder.LayoutOrder }, baseGrid)

	local function clear(container: Frame)
		for _, c in container:GetChildren() do
			if c:IsA("GuiObject") then
				c:Destroy()
			end
		end
	end

	-- fills `container` with `count` slot cells
	local function fill(container: Frame, count: number, cards: { [string]: string }, putRemote: string, takeRemote: string): number
		clear(container)
		local income = 0
		for slot = 1, count do
			local cardId = cards[tostring(slot)]
			local cell: Frame = Ui.create("Frame", { BackgroundColor3 = Ui.colors.panel2, BorderSizePixel = 0, LayoutOrder = slot }, container)
			Ui.corner(cell, 9)
			if cardId then
				income += Cards.byId[cardId].income * Cards.levelIncomeMult(State.cardLevel(cardId))
				CardView.create(cardId, { level = State.cardLevel(cardId) }).Parent = cell
			else
				Ui.label(cell, { Size = UDim2.fromScale(1, 0.3), Position = UDim2.fromScale(0, 0.35), Text = "Empty #" .. slot, TextColor3 = Ui.colors.muted })
			end
			local hit: TextButton = Ui.create("TextButton", { Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Text = "", ZIndex = 5 }, cell)
			hit.Activated:Connect(function()
				local cur = State.selectedCard
				local data = State.data
				if cur and data and (data.inv[cur] or 0) > 0 then
					Remotes.get(putRemote):FireServer(cur, slot)
				elseif cardId then
					Remotes.get(takeRemote):FireServer(slot)
				else
					openCards()
				end
			end)
		end
		return income
	end

	local function rebuild()
		local d = State.data
		if not d then
			return
		end
		local sel = State.selectedCard
		if sel and (d.inv[sel] or 0) > 0 then
			hint.Text = "Selected: " .. Cards.byId[sel].name .. ". Tap a slot to place it."
		else
			hint.Text = "Tap a card to take it back. Select a card in My Cards to place it here."
		end
		fill(swordRow, d.swordSlots, d.sword, "EquipCard", "UnequipCard")
		swordTitle.Text = string.format("SWORD slots: +%d%% damage, +%d%% money", math.floor(d.swordDmgPct * 100 + 0.5), math.floor(d.swordMoneyPct * 100 + 0.5))
		local income = fill(baseGrid, d.totalSlots, d.placed, "PlaceCard", "RemoveCard")
		baseTitle.Text = string.format("BASE slots: +%s money per second", Format.number(income * d.moneyMult))
	end

	local function refresh()
		if not win.isOpen() then
			return
		end
		local d = State.data
		local parts: { string } = { tostring(State.selectedCard) }
		if d then
			table.insert(parts, d.totalSlots .. "/" .. d.swordSlots .. "/" .. d.moneyMult)
			for _, t in ({ d.placed, d.sword, d.inv, d.levels } :: { { [string]: any } }) do
				local keys: { string } = {}
				for k, v in t do
					table.insert(keys, k .. "=" .. tostring(v))
				end
				table.sort(keys)
				table.insert(parts, table.concat(keys, ","))
			end
		end
		local sig = table.concat(parts, "|")
		if sig == lastSignature then
			return
		end
		lastSignature = sig
		rebuild()
	end

	State.onChanged(refresh)
	State.onSelection(function()
		lastSignature = ""
		refresh()
	end)
	win.onOpen = function()
		lastSignature = ""
		refresh()
	end
	return win
end

return BaseWindow
