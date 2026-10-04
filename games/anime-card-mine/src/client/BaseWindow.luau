--!strict
-- "My Base" window: slots with placed cards. Tap a slot to place the selected card or take a card back.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Cards = require(ReplicatedStorage.Shared.Cards)
local CardView = require(ReplicatedStorage.Shared.CardView)
local Format = require(ReplicatedStorage.Shared.Format)
local Ui = require(script.Parent.Ui)
local State = require(script.Parent.State)

local BaseWindow = {}

function BaseWindow.create(gui: ScreenGui, openCards: () -> ()): Ui.Window
	local win = Ui.window(gui, "My Base")
	local body = win.body
	local lastSignature = ""

	local hint = Ui.label(body, {
		Size = UDim2.new(1, -250, 0, 36),
		Text = "",
		TextXAlignment = Enum.TextXAlignment.Left,
		TextColor3 = Ui.colors.muted,
		TextWrapped = true,
	})
	Ui.create("UITextSizeConstraint", { MaxTextSize = 18, MinTextSize = 8 }, hint)

	Ui.button(body, {
		text = "Best cards",
		position = UDim2.new(1, -240, 0, 0),
		anchor = Vector2.zero,
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

	local grid = Ui.scroll(body, { Position = UDim2.fromOffset(0, 42), Size = UDim2.new(1, 0, 1, -42) })
	Ui.create("UIGridLayout", {
		CellSize = UDim2.fromOffset(84, 114),
		CellPadding = UDim2.fromOffset(6, 6),
		SortOrder = Enum.SortOrder.LayoutOrder,
	}, grid)
	Ui.padding(grid, 3)

	local function rebuild()
		for _, c in grid:GetChildren() do
			if c:IsA("GuiObject") then
				c:Destroy()
			end
		end
		local d = State.data
		if not d then
			return
		end
		local sel = State.selectedCard
		if sel and d.inv[sel] then
			hint.Text = "Selected: " .. Cards.byId[sel].name .. ". Tap a slot to place it."
		else
			hint.Text = "Tap a card in a slot to take it back. Choose a card in My Cards to place it."
		end
		local income = 0
		for slot = 1, d.totalSlots do
			local cardId = d.placed[tostring(slot)]
			local cell: Frame = Ui.create("Frame", { BackgroundColor3 = Ui.colors.panel2, BorderSizePixel = 0, LayoutOrder = slot }, grid)
			Ui.corner(cell, 9)
			if cardId then
				income += Cards.byId[cardId].income
				CardView.create(cardId).Parent = cell
			else
				Ui.label(cell, { Size = UDim2.fromScale(1, 0.3), Position = UDim2.fromScale(0, 0.35), Text = "Empty #" .. slot, TextColor3 = Ui.colors.muted })
			end
			local hit: TextButton = Ui.create("TextButton", { Size = UDim2.fromScale(1, 1), BackgroundTransparency = 1, Text = "", ZIndex = 5 }, cell)
			hit.Activated:Connect(function()
				local cur = State.selectedCard
				local data = State.data
				if cur and data and (data.inv[cur] or 0) > 0 then
					Remotes.get("PlaceCard"):FireServer(cur, slot)
				elseif cardId then
					Remotes.get("RemoveCard"):FireServer(slot)
				else
					openCards()
				end
			end)
		end
		hint.Text ..= string.format("  Slots: %d. Base income: +%s/s", d.totalSlots, Format.number(income))
	end

	local function refresh()
		if not win.isOpen() then
			return
		end
		local d = State.data
		local sig = tostring(State.selectedCard) .. "|" .. (if d then tostring(d.totalSlots) else "")
		if d then
			local keys: { string } = {}
			for k, v in d.placed do
				table.insert(keys, k .. "=" .. v)
			end
			table.sort(keys)
			sig ..= "|" .. table.concat(keys, ",")
			local invKeys: { string } = {}
			for k, v in d.inv do
				table.insert(invKeys, k .. v)
			end
			table.sort(invKeys)
			sig ..= "|" .. table.concat(invKeys, ",")
		end
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
