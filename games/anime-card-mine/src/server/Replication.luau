--!strict
-- Sends the player's state to their client (coalesced, at most ~6 times a second).
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local Players = game:GetService("Players")

local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Types = require(ReplicatedStorage.Shared.Types)
local MonetizationConfig = require(ReplicatedStorage.Shared.Monetization)
local DataService = require(script.Parent.DataService)
local Economy = require(script.Parent.Economy)
local MonetizationService = require(script.Parent.MonetizationService)
local RateLimiter = require(script.Parent.RateLimiter)

local Replication = {}

local pending: { [Player]: boolean } = {}

-- Set by DropService: seconds until the next card drop for this player.
Replication.dropIn = nil :: ((Player) -> number)?

local function copy(t: { [string]: any }): { [string]: any }
	local out: { [string]: any } = {}
	for k, v in t do
		out[k] = v
	end
	return out
end

local function build(session: DataService.Session): Types.Snapshot
	local p = session.profile
	local player = session.player
	local swordDmg, swordMoney = Economy.swordBonus(session)
	local boosts: { [string]: { mult: number, remaining: number } } = {}
	for kind, b in p.boosts do
		local remaining = MonetizationService.boostRemaining(session, kind)
		if remaining > 0 then
			boosts[kind] = { mult = b.mult, remaining = remaining }
		end
	end
	local dropFn = Replication.dropIn
	return {
		money = p.money,
		income = Economy.income(session),
		damage = Economy.damage(session),
		damageLevel = p.damageLevel,
		boughtSlots = p.slots,
		totalSlots = Economy.baseSlots(session),
		swordBought = p.swordSlots,
		swordSlots = Economy.swordSlots(session),
		stage = p.stage,
		rebirths = p.rebirths,
		inv = copy(p.inv) :: any,
		placed = copy(p.placed) :: any,
		sword = copy(p.sword) :: any,
		levels = copy(p.levels) :: any,
		luck = Economy.luck(session),
		moneyMult = Economy.moneyMult(session),
		swordDmgPct = swordDmg,
		swordMoneyPct = swordMoney,
		boosts = boosts,
		potions = copy(p.potions) :: any,
		passes = MonetizationService.owned(player),
		dropIn = if dropFn then dropFn(player) else 0,
		dropInterval = Economy.dropInterval(session),
		offline = session.offline,
		offlinePending = p.offlinePending,
		starterBought = p.starterBought,
		autoOwned = MonetizationService.hasAutoSwing(player),
		autoOn = session.autoOn,
		studioTest = MonetizationConfig.ENABLED and MonetizationService.isStudioTest(),
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
		if RateLimiter.allow(player, "state", 0.5) then
			Replication.sendNow(player)
		end
	end)
	MonetizationService.hooks.changed = function(player)
		Replication.queue(player)
	end
	MonetizationService.hooks.notify = function(player, text, level)
		Replication.notify(player, "text", text, level)
	end
end

return Replication
