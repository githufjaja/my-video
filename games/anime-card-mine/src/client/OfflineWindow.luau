--!strict
-- Popup shown when you come back and have an offline reward waiting.
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Monetization = require(ReplicatedStorage.Shared.Monetization)
local Config = require(ReplicatedStorage.Shared.Config)
local Format = require(ReplicatedStorage.Shared.Format)
local Ui = require(script.Parent.Ui)
local State = require(script.Parent.State)

local OfflineWindow = {}

function OfflineWindow.create(gui: ScreenGui): Ui.Window
	local win = Ui.window(gui, "Offline Reward")
	local body = win.body
	local shownFor = 0

	Ui.label(body, { Position = UDim2.fromOffset(0, 0), Size = UDim2.new(1, 0, 0, 26), Text = "Your cards kept earning while you were away!", TextColor3 = Ui.colors.muted })
	local amount = Ui.label(body, { Position = UDim2.fromOffset(0, 34), Size = UDim2.new(1, 0, 0, 52), Text = "$0", TextColor3 = Color3.fromRGB(255, 215, 70) })
	Ui.label(body, {
		Position = UDim2.fromOffset(0, 90),
		Size = UDim2.new(1, 0, 0, 20),
		Text = string.format("(up to %d hours, %d%% of normal income)", Config.OFFLINE_MAX_HOURS, math.floor(Config.OFFLINE_RATE * 100)),
		TextColor3 = Ui.colors.muted,
	})
	Ui.button(body, {
		text = "Claim",
		position = UDim2.new(0, 0, 0, 120),
		size = UDim2.new(0.5, -6, 0, 52),
		color = Ui.colors.good,
		onClick = function()
			Remotes.get("ClaimOffline"):FireServer(false)
			win.close()
		end,
	})
	local doubleBtn = Ui.button(body, {
		text = "Double it!",
		position = UDim2.new(0.5, 6, 0, 120),
		size = UDim2.new(0.5, -6, 0, 52),
		color = Color3.fromRGB(235, 140, 40),
		onClick = function()
			Remotes.get("ClaimOffline"):FireServer(true)
			win.close()
		end,
	})

	State.onChanged(function()
		local d = State.data
		if not d then
			return
		end
		amount.Text = Format.money(d.offlinePending)
		local def = Monetization.Products.DoubleOffline
		doubleBtn.Text = if d.studioTest then "Double it! (test)" elseif def.id > 0 then "Double it! R$" .. def.robux else "Double (soon)"
		Ui.setEnabledLook(doubleBtn, def.id > 0 or d.studioTest, Color3.fromRGB(235, 140, 40))
		if d.offlinePending >= 1 and shownFor == 0 then
			shownFor = d.offlinePending
			win.open()
		elseif d.offlinePending < 1 then
			shownFor = 0
			if win.isOpen() then
				win.close()
			end
		end
	end)
	return win
end

return OfflineWindow
