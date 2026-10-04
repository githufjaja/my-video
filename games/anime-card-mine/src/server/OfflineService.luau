--!strict
-- Offline reward: while the player was away their base cards kept earning (a share of normal income, capped by hours).
-- The reward waits in profile.offlinePending until claimed; "Double it!" is a dev product (Monetization).
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local Remotes = require(ReplicatedStorage.Shared.Remotes)
local Config = require(ReplicatedStorage.Shared.Config)
local Format = require(ReplicatedStorage.Shared.Format)
local DataService = require(script.Parent.DataService)
local Economy = require(script.Parent.Economy)
local Replication = require(script.Parent.Replication)
local MonetizationService = require(script.Parent.MonetizationService)
local RateLimiter = require(script.Parent.RateLimiter)

local OfflineService = {}

local function compute(session: DataService.Session)
	local profile = session.profile
	local last = profile.lastSeen
	profile.lastSeen = os.time()
	if last <= 0 then
		return
	end
	local away = os.time() - last
	if away < Config.OFFLINE_MIN_SECONDS then
		return
	end
	local capped = math.min(away, Config.OFFLINE_MAX_HOURS * 3600)
	local income = Economy.income(session)
	local reward = income * capped * Config.OFFLINE_RATE
	if reward < 1 then
		return
	end
	local cap = income * Config.OFFLINE_MAX_HOURS * 3600 * Config.OFFLINE_RATE
	profile.offlinePending = math.min(cap, profile.offlinePending + reward)
	DataService.touch(session)
	Replication.queue(session.player)
end

local function claim(player: Player, double: any)
	local session = DataService.get(player)
	if not session or session.profile.offlinePending < 1 then
		return
	end
	if double == true then
		-- paid option: Studio test grants it, live servers prompt the dev product; the grant itself happens in the receipt
		MonetizationService.buyProduct(player, "DoubleOffline")
		return
	end
	local amount = session.profile.offlinePending
	session.profile.offlinePending = 0
	Economy.addMoney(session, amount)
	Replication.notify(player, "text", "Offline reward claimed: " .. Format.money(amount), "good")
	Replication.queue(player)
end

function OfflineService.init()
	MonetizationService.hooks.doubleOffline = function(session)
		local amount = session.profile.offlinePending
		if amount < 1 then
			return false
		end
		session.profile.offlinePending = 0
		Economy.addMoney(session, amount * 2)
		Replication.notify(session.player, "text", "Double offline reward: " .. Format.money(amount * 2), "good")
		Replication.queue(session.player)
		return true
	end

	DataService.onLoaded(function(session)
		MonetizationService.waitReady(session.player) -- pass multipliers must be known first
		if session.released then
			return
		end
		compute(session)
	end)

	Remotes.get("ClaimOffline").OnServerEvent:Connect(function(player, double: any)
		if RateLimiter.allow(player, "offline", 0.5) then
			claim(player, double)
		end
	end)
end

return OfflineService
