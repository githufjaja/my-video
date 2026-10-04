--!strict
-- Server entry point. Order matters: remotes -> world -> services -> data (last, it starts loading players).
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Remotes = require(ReplicatedStorage.Shared.Remotes)
Remotes.init()

local World = require(script.Parent.World)
World.build()

local DataService = require(script.Parent.DataService)
local MonetizationService = require(script.Parent.MonetizationService)
local Economy = require(script.Parent.Economy)
local Replication = require(script.Parent.Replication)
local BaseService = require(script.Parent.BaseService)
local CardService = require(script.Parent.CardService)
local ProgressService = require(script.Parent.ProgressService)
local RockService = require(script.Parent.RockService)
local DropService = require(script.Parent.DropService)
local OfflineService = require(script.Parent.OfflineService)
local Sword = require(script.Parent.Sword)

MonetizationService.init()
Replication.init()
BaseService.init()
CardService.init()
ProgressService.init()
RockService.init()
DropService.init()
OfflineService.init()
Sword.init()

-- first snapshot once data is loaded
DataService.onLoaded(function(session)
	Replication.sendNow(session.player)
	if session.offline then
		Replication.notify(session.player, "text", "Studio test mode: saving is OFF (publish the place and enable API access).", "bad")
	end
end)

Economy.startIncomeLoop(function(player)
	Replication.queue(player)
end)

DataService.start()
