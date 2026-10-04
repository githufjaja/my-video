--!strict
-- Sends the player's state to their client (coalesced, at most ~6 times a second).
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")

local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Types = require(ReplicatedStorage.Shared.Types)
local DataService = require(script.Parent.DataService)
local Economy = require(script.Parent.Economy)
local MonetizationService = require(script.Parent.MonetizationService)
local MonetizationConfig = require(ReplicatedStorage.Shared.Monetization)

local Replication = {}

local pending: { [Player]: boolean } = {}

local function build(session: DataService.Session): Types.Snapshot
	local p = session.profile
	local inv: { [string]: number } = {}
	for id, n in p.inv do
		inv[id] = n
	end
	local placed: { [string]: string } = {}
	for k, id in p.placed do
		placed[k] = id
	end
	return {
		money = p.money,
		income = Economy.income(session),
		damage = Economy.damage(session),
		damageLevel = p.damageLevel,
		boughtSlots = p.slots,
		totalSlots = Economy.totalSlots(session),
		zonesUnlocked = p.zonesUnlocked,
		inv = inv,
		placed = placed,
		luck = Economy.luck(session.player),
		moneyMult = Economy.moneyMult(session.player),
		offline = session.offline,
		monetization = MonetizationConfig.ENABLED,
		passes = MonetizationService.owned(session.player),
	}
end

function Replication.queue(player: Player)
	pending[player] = true
end

function Replication.sendNow(player: Player)
	local session = DataService.get(player)
	if session then
		pending[player] = nil
		Remotes.get("State"):FireClient(player, build(session))
	end
end

function Replication.notify(player: Player, kind: string, a: string, b: string?)
	Remotes.get("Notify"):FireClient(player, kind, a, b)
end

function Replication.init()
	task.spawn(function()
		while true do
			task.wait(0.16)
			for player in pending do
				Replication.sendNow(player)
			end
		end
	end)
	Players.PlayerRemoving:Connect(function(player)
		pending[player] = nil
	end)
	Remotes.get("RequestState").OnServerEvent:Connect(function(player)
		Replication.sendNow(player)
	end)
	MonetizationService.onChanged(function(player)
		Replication.queue(player)
	end)
end

return Replication
