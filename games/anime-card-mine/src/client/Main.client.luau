--!strict
-- Client entry point: builds the interface and wires remotes.
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

ReplicatedStorage:WaitForChild("Shared")
local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Ui = require(script.Parent.Ui)
local State = require(script.Parent.State)
local Effects = require(script.Parent.Effects)
local Hud = require(script.Parent.Hud)
local Hitting = require(script.Parent.Hitting)
local WorldClient = require(script.Parent.WorldClient)
local InventoryWindow = require(script.Parent.InventoryWindow)
local BaseWindow = require(script.Parent.BaseWindow)
local UpgradesWindow = require(script.Parent.UpgradesWindow)
local WorldsWindow = require(script.Parent.WorldsWindow)
local OddsWindow = require(script.Parent.OddsWindow)

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local gui = Instance.new("ScreenGui")
gui.Name = "AnimeCardMineUI"
gui.ResetOnSpawn = false
gui.IgnoreGuiInset = false
gui.ZIndexBehavior = Enum.ZIndexBehavior.Sibling
gui.Parent = playerGui

Effects.init(gui)

local inventory = InventoryWindow.create(gui)
local base = BaseWindow.create(gui, function()
	inventory.open()
end)
local upgrades = UpgradesWindow.create(gui)
local worlds = WorldsWindow.create(gui)
local odds = OddsWindow.create(gui)

local swing = Hud.init(gui, {
	{ text = "Cards", color = Color3.fromRGB(150, 80, 230), onClick = inventory.toggle },
	{ text = "Base", color = Color3.fromRGB(60, 150, 230), onClick = base.toggle },
	{ text = "Upgrade", color = Color3.fromRGB(60, 180, 100), onClick = upgrades.toggle },
	{ text = "Worlds", color = Color3.fromRGB(230, 140, 40), onClick = worlds.toggle },
	{ text = "Odds", color = Color3.fromRGB(120, 125, 150), onClick = odds.toggle },
})

-- server messages
Remotes.get("DamageFx").OnClientEvent:Connect(function(kind: string, position: Vector3, amount: number)
	Effects.damageNumber(kind, position, amount)
end)
Remotes.get("Notify").OnClientEvent:Connect(function(kind: string, a: string, b: string?)
	if kind == "card" then
		Effects.cardToast(a)
	else
		Effects.toast(a, b)
	end
end)

State.init()
WorldClient.start()
Hitting.start(swing)

task.delay(2, function()
	Effects.toast(if Ui.isTouch then "Tap rocks (or hold HIT) to mine. Rocks are to the north." else "Click rocks to mine them. Rocks are to the north.", "good")
end)
