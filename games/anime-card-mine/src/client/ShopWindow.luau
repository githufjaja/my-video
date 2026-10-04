--!strict
-- Shop: game passes, potions (boosts) and packs. All prices / IDs come from Shared/Monetization.
-- Packs have FIXED contents; there is no paid random item anywhere.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Monetization = require(ReplicatedStorage.Shared.Monetization)
local Ui = require(script.Parent.Ui)
local State = require(script.Parent.State)

local ShopWindow = {}

function ShopWindow.create(gui: ScreenGui): (Ui.Window, (string) -> ())
	local win = Ui.window(gui, "Shop")
	local body = win.body
	local tab = "Passes"
	local lastSignature = ""

	local tabs: Frame = Ui.create("Frame", { Size = UDim2.new(1, 0, 0, 38), BackgroundTransparency = 1 }, body)
	Ui.create("UIListLayout", { FillDirection = Enum.FillDirection.Horizontal, Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder }, tabs)
	local banner = Ui.label(body, {
		Position = UDim2.fromOffset(0, 40),
		Size = UDim2.new(1, 0, 0, 18),
		Text = "",
		TextColor3 = Ui.colors.accent,
		Visible = false,
	})
	local list = Ui.scroll(body, { Position = UDim2.fromOffset(0, 62), Size = UDim2.new(1, 0, 1, -62) })
	Ui.create("UIListLayout", { Padding = UDim.new(0, 6), SortOrder = Enum.SortOrder.LayoutOrder }, list)

	local tabButtons: { [string]: TextButton } = {}
	local order = 0

	local function priceText(id: number, robux: number, studio: boolean): string
		if studio then
			return "FREE (test)"
		end
		return if id > 0 then "R$ " .. robux else "Soon"
	end

	-- one shop row; actions = up to two buttons { text, color, enabled, onClick }
	local function item(name: string, desc: string, actions: { { text: string, color: Color3, enabled: boolean, onClick: () -> () } })
		order += 1
		local f: Frame = Ui.create("Frame", { Size = UDim2.new(1, -8, 0, 74), BackgroundColor3 = Ui.colors.panel2, BorderSizePixel = 0, LayoutOrder = order }, list)
		Ui.corner(f, 12)
		Ui.label(f, { Position = UDim2.fromOffset(10, 4), Size = UDim2.new(0.55, -10, 0, 26), Text = name, TextXAlignment = Enum.TextXAlignment.Left, TextColor3 = Ui.colors.accent })
		local d = Ui.label(f, { Position = UDim2.fromOffset(10, 30), Size = UDim2.new(0.55, -10, 0, 40), Text = desc, TextXAlignment = Enum.TextXAlignment.Left, TextYAlignment = Enum.TextYAlignment.Top, TextColor3 = Ui.colors.muted, TextWrapped = true })
		Ui.create("UITextSizeConstraint", { MaxTextSize = 15, MinTextSize = 7 }, d)
		local count = #actions
		for i, a in actions do
			local width = 0.45 / count
			local btn = Ui.button(f, {
				text = a.text,
				position = UDim2.new(0.55 + (i - 1) * width, 4, 0, 12),
				size = UDim2.new(width, -10, 0, 50),
				color = a.color,
				onClick = a.onClick,
			})
			Ui.setEnabledLook(btn, a.enabled, a.color)
		end
	end

	local function rebuild()
		for _, c in list:GetChildren() do
			if c:IsA("GuiObject") then
				c:Destroy()
			end
		end
		order = 0
		local d = State.data
		if not d then
			return
		end
		banner.Visible = d.studioTest
		banner.Text = "STUDIO TEST MODE: everything is free, nothing is charged"
		list.Position = UDim2.fromOffset(0, if d.studioTest then 62 else 42)
		list.Size = UDim2.new(1, 0, 1, if d.studioTest then -62 else -42)

		if tab == "Passes" then
			for _, key in Monetization.PassOrder do
				local def = Monetization.Passes[key]
				local owned = d.passes[key] == true
				item(def.name, def.description, {
					{
						text = if owned then "Owned" else priceText(def.id, def.robux, d.studioTest),
						color = Ui.colors.good,
						enabled = not owned and (def.id > 0 or d.studioTest),
						onClick = function()
							Remotes.get("BuyPass"):FireServer(key)
						end,
					},
				})
			end
		elseif tab == "Boosts" then
			for _, potionKey in Monetization.PotionOrder do
				local def = Monetization.Potions[potionKey]
				local have = d.potions[potionKey] or 0
				-- the product that sells this potion
				local productKey: string? = nil
				for k, p in Monetization.Products do
					if p.kind == "potion" and p.potion == potionKey then
						productKey = k
					end
				end
				local actions = {
					{
						text = "Use (" .. have .. ")",
						color = Ui.colors.blue,
						enabled = have > 0,
						onClick = function()
							Remotes.get("UsePotion"):FireServer(potionKey)
						end,
					},
				}
				if productKey then
					local p = Monetization.Products[productKey]
					local pk: string = productKey
					table.insert(actions, {
						text = "Buy " .. priceText(p.id, p.robux, d.studioTest),
						color = Ui.colors.good,
						enabled = p.id > 0 or d.studioTest,
						onClick = function()
							Remotes.get("BuyProduct"):FireServer(pk)
						end,
					})
				end
				item(def.name, def.description, actions)
			end
		else
			for _, key in Monetization.ProductOrder do
				local def = Monetization.Products[key]
				if not (def.once and d.starterBought) then
					item(def.name, def.description, {
						{
							text = priceText(def.id, def.robux, d.studioTest),
							color = Ui.colors.good,
							enabled = def.id > 0 or d.studioTest,
							onClick = function()
								Remotes.get("BuyProduct"):FireServer(key)
							end,
						},
					})
				end
			end
		end
	end

	local function refresh(force: boolean?)
		if not win.isOpen() then
			return
		end
		local d = State.data
		local parts: { string } = { tab }
		if d then
			local keys: { string } = {}
			for k, v in d.passes do
				table.insert(keys, k .. tostring(v))
			end
			for k, v in d.potions do
				table.insert(keys, k .. v)
			end
			table.sort(keys)
			table.insert(parts, table.concat(keys, ","))
			table.insert(parts, tostring(d.starterBought) .. tostring(d.studioTest))
		end
		local sig = table.concat(parts, "|")
		if sig == lastSignature and not force then
			return
		end
		lastSignature = sig
		rebuild()
	end

	for i, name in { "Passes", "Boosts", "Packs" } do
		tabButtons[name] = Ui.button(tabs, {
			text = name,
			size = UDim2.fromOffset(110, 36),
			layoutOrder = i,
			color = Ui.colors.panel2,
			onClick = function()
				tab = name
				for n, b in tabButtons do
					b.BackgroundColor3 = if n == tab then Ui.colors.accent else Ui.colors.panel2
					b.TextColor3 = if n == tab then Color3.fromRGB(20, 20, 30) else Ui.colors.text
				end
				refresh(true)
			end,
		})
	end
	tabButtons.Passes.BackgroundColor3 = Ui.colors.accent
	tabButtons.Passes.TextColor3 = Color3.fromRGB(20, 20, 30)

	State.onChanged(function()
		refresh(false)
	end)
	win.onOpen = function()
		refresh(true)
	end

	-- lets other buttons open the shop on a given tab ("Passes" / "Boosts" / "Packs")
	local function showTab(name: string)
		tab = name
		for n, b in tabButtons do
			b.BackgroundColor3 = if n == tab then Ui.colors.accent else Ui.colors.panel2
			b.TextColor3 = if n == tab then Color3.fromRGB(20, 20, 30) else Ui.colors.text
		end
		win.open()
		refresh(true)
	end
	return win, showTab
end

return ShopWindow
